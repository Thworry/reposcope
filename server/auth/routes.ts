import { timingSafeEqual } from "node:crypto";

import type { Context, Hono } from "hono";

import type { ServerConfig } from "../config.js";
import type { ActiveRunRegistry } from "../http/active-runs.js";
import type { SlidingWindowRateLimiter } from "../http/rate-limit.js";
import type { AppLogger } from "../http/security.js";
import {
  cookieNameFor,
  readSessionCookie,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./cookies.js";
import { GitHubOAuthError, type GitHubOAuth } from "./github-oauth.js";
import type { AuthSession } from "./model.js";
import { AuthSessionStore } from "./session-store.js";

const CSRF_HEADER = "X-RepoScope-CSRF";

export interface AuthRouteDependencies {
  readonly config: ServerConfig;
  readonly logger: AppLogger;
  readonly sessionStore: AuthSessionStore | null;
  readonly oauthClient: GitHubOAuth | null;
  readonly rateLimiter: SlidingWindowRateLimiter;
  readonly activeRuns: ActiveRunRegistry;
}

export function installAuthRoutes(
  app: Hono,
  dependencies: AuthRouteDependencies,
): void {
  const enabled =
    dependencies.config.deepAnalysisEnabled &&
    dependencies.sessionStore !== null &&
    dependencies.oauthClient !== null;
  const cookieName = cookieNameFor(dependencies.config.environment);
  const secure = dependencies.config.environment === "production";
  const maxAgeSeconds = Math.floor(dependencies.config.sessionIdleMs / 1_000);
  const terminateSession = (sessionId: string): void => {
    dependencies.sessionStore?.deleteSession(sessionId);
    dependencies.activeRuns.abort(sessionId);
    dependencies.rateLimiter.delete(sessionId);
  };

  app.get("/api/v1/session", (context) => {
    if (!enabled) {
      return context.json({ status: "disabled" } as const);
    }
    const session = readSession(
      context.req.header("Cookie"),
      cookieName,
      dependencies.sessionStore,
    );
    if (session?.githubToken === null || session === null) {
      return context.json({ status: "signed-out" } as const);
    }
    return context.json({
      status: "ready",
      csrfToken: session.csrfToken,
    } as const);
  });

  app.get("/api/v1/auth/start", (context) => {
    if (!enabled) {
      return context.json(
        { error: { kind: "authorization-disabled" } } as const,
        503,
      );
    }
    const values = new URL(context.req.url).searchParams.getAll("returnTo");
    if (values.length > 1) {
      return invalidRequest(context);
    }
    const returnTo = validateReturnTo(
      values[0] ?? new URL(dependencies.config.frontendBaseUrl).pathname,
      dependencies.config.frontendBaseUrl,
    );
    if (returnTo === null) {
      return invalidRequest(context);
    }

    let session = readSession(
      context.req.header("Cookie"),
      cookieName,
      dependencies.sessionStore,
    );
    try {
      session ??= dependencies.sessionStore.createSession();
      const state = dependencies.sessionStore.beginOAuth(session.id, returnTo);
      const location = dependencies.oauthClient.authorizationUrl(state);
      context.header(
        "Set-Cookie",
        serializeSessionCookie(cookieName, session.id, maxAgeSeconds, secure),
      );
      return context.redirect(location, 302);
    } catch (error) {
      dependencies.logger.error("Authorization start failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return context.json(
        { error: { kind: "authorization-unavailable" } } as const,
        503,
      );
    }
  });

  app.get("/api/v1/auth/callback", async (context) => {
    if (!enabled) {
      return context.json(
        { error: { kind: "authorization-disabled" } } as const,
        503,
      );
    }
    const parameters = new URL(context.req.url).searchParams;
    const codes = parameters.getAll("code");
    const states = parameters.getAll("state");
    const providerErrors = parameters.getAll("error");
    if (
      providerErrors.length === 1 &&
      providerErrors[0] !== "" &&
      codes.length === 0 &&
      states.length === 1 &&
      states[0] !== ""
    ) {
      const deniedSessionId = readSessionCookie(
        context.req.header("Cookie"),
        cookieName,
      );
      if (
        deniedSessionId === null ||
        dependencies.sessionStore.consumeOAuthState(
          deniedSessionId,
          states[0] ?? "",
        ) === null
      ) {
        return invalidRequest(context);
      }
      terminateSession(deniedSessionId);
      context.header(
        "Set-Cookie",
        serializeClearedSessionCookie(cookieName, secure),
      );
      return context.json(
        { error: { kind: "authorization-denied" } } as const,
        400,
      );
    }
    if (
      codes.length !== 1 ||
      states.length !== 1 ||
      providerErrors.length !== 0 ||
      codes[0] === "" ||
      states[0] === ""
    ) {
      return invalidRequest(context);
    }
    const sessionId = readSessionCookie(
      context.req.header("Cookie"),
      cookieName,
    );
    if (sessionId === null) {
      return invalidRequest(context);
    }
    const oauthRequest = dependencies.sessionStore.consumeOAuthState(
      sessionId,
      states[0] ?? "",
    );
    if (oauthRequest === null) {
      return invalidRequest(context);
    }

    let githubToken: string;
    try {
      githubToken = await dependencies.oauthClient.exchangeCode(codes[0] ?? "");
    } catch (error) {
      terminateSession(sessionId);
      context.header(
        "Set-Cookie",
        serializeClearedSessionCookie(cookieName, secure),
      );
      dependencies.logger.error("GitHub authorization exchange failed", {
        errorType:
          error instanceof GitHubOAuthError
            ? error.kind
            : "unexpected-provider-error",
      });
      return context.json(
        { error: { kind: "authorization-failed" } } as const,
        502,
      );
    }

    const rotated = dependencies.sessionStore.authorizeSession(
      sessionId,
      githubToken,
    );
    if (rotated === null) {
      terminateSession(sessionId);
      context.header(
        "Set-Cookie",
        serializeClearedSessionCookie(cookieName, secure),
      );
      return invalidRequest(context);
    }
    dependencies.activeRuns.abort(sessionId);
    dependencies.rateLimiter.delete(sessionId);
    context.header(
      "Set-Cookie",
      serializeSessionCookie(cookieName, rotated.id, maxAgeSeconds, secure),
    );
    return context.redirect(
      authorizedReturnUrl(
        oauthRequest.returnTo,
        dependencies.config.frontendBaseUrl,
      ),
      302,
    );
  });

  app.post("/api/v1/sign-out", (context) => {
    context.header("Cache-Control", "no-store");
    if (!enabled) {
      return context.json(
        { error: { kind: "authorization-disabled" } } as const,
        503,
      );
    }
    const session = readSession(
      context.req.header("Cookie"),
      cookieName,
      dependencies.sessionStore,
    );
    const csrf = context.req.header(CSRF_HEADER);
    if (
      session === null ||
      csrf === undefined ||
      !constantTimeEqual(csrf, session.csrfToken)
    ) {
      return context.json({ error: { kind: "csrf-invalid" } } as const, 403);
    }
    terminateSession(session.id);
    context.header(
      "Set-Cookie",
      serializeClearedSessionCookie(cookieName, secure),
    );
    return context.body(null, 204);
  });
}

function readSession(
  cookieHeader: string | undefined,
  cookieName: string,
  store: AuthSessionStore,
): AuthSession | null {
  const id = readSessionCookie(cookieHeader, cookieName);
  return id === null ? null : store.getSession(id);
}

function validateReturnTo(
  value: string,
  frontendBaseUrl: string,
): string | null {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("#")
  ) {
    return null;
  }
  const base = new URL(frontendBaseUrl);
  let target: URL;
  try {
    target = new URL(value, base.origin);
  } catch {
    return null;
  }
  if (
    target.origin !== base.origin ||
    target.pathname !== base.pathname ||
    target.hash !== ""
  ) {
    return null;
  }
  return `${target.pathname}${target.search}`;
}

function authorizedReturnUrl(
  returnTo: string,
  frontendBaseUrl: string,
): string {
  const target = new URL(returnTo, new URL(frontendBaseUrl).origin);
  target.searchParams.set("deep", "authorized");
  return target.href;
}

function invalidRequest(context: Context): Response {
  return context.json({ error: { kind: "invalid-request" } } as const, 400);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length > 512 || right.length > 512) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
