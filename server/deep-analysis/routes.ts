import { timingSafeEqual } from "node:crypto";

import type { Hono } from "hono";
import { stream } from "hono/streaming";

import {
  DeepEventSequenceGuard,
  isDeepAnalysisRequest,
} from "../../src/features/deep-analysis/guards.js";
import type {
  DeepAnalysisErrorKind,
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
} from "../../src/features/deep-analysis/model.js";
import { cookieNameFor, readSessionCookie } from "../auth/cookies.js";
import type { AuthSessionStore } from "../auth/session-store.js";
import type { ServerConfig } from "../config.js";
import type { ActiveRunRegistry } from "../http/active-runs.js";
import type { SlidingWindowRateLimiter } from "../http/rate-limit.js";
import { API_BODY_LIMIT_BYTES } from "../http/security.js";
import { parseStrictJsonObject } from "../panel/parse-json.js";
import {
  DeepAnalysisServiceError,
  type DeepAnalysisProgressEvent,
} from "./service.js";

const CSRF_HEADER = "X-RepoScope-CSRF";

export interface DeepAnalysisRunner {
  run(
    request: DeepAnalysisRequest,
    token: string,
    onEvent: (event: DeepAnalysisProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<DeepReport>;
}

export interface DeepAnalysisRouteDependencies {
  readonly config: ServerConfig;
  readonly sessionStore: AuthSessionStore | null;
  readonly service: DeepAnalysisRunner | null;
  readonly rateLimiter: SlidingWindowRateLimiter;
  readonly activeRuns: ActiveRunRegistry;
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

function publicErrorKind(error: unknown): DeepAnalysisErrorKind {
  try {
    if (!(error instanceof DeepAnalysisServiceError)) return "internal";
    switch (error.kind) {
      case "cancelled":
      case "copilot-unavailable":
      case "github-unavailable":
      case "invalid-evidence":
      case "rate-limit":
      case "repository-changed":
      case "internal":
        return error.kind;
    }
  } catch {
    return "internal";
  }
  return "internal";
}

function jsonLine(event: DeepAnalysisEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function installDeepAnalysisRoutes(
  app: Hono,
  dependencies: DeepAnalysisRouteDependencies,
): void {
  const { activeRuns, config, rateLimiter, service, sessionStore } =
    dependencies;
  const cookieName = cookieNameFor(dependencies.config.environment);

  app.post("/api/v1/deep-analysis", async (context) => {
    context.header("Cache-Control", "no-store");
    if (
      !config.deepAnalysisEnabled ||
      sessionStore === null ||
      service === null
    ) {
      return context.json({ error: { kind: "disabled" } } as const, 503);
    }
    const sessionId = readSessionCookie(
      context.req.header("Cookie"),
      cookieName,
    );
    const session =
      sessionId === null ? null : sessionStore.getSession(sessionId);
    if (session === null || session.githubToken === null) {
      return context.json({ error: { kind: "signed-out" } } as const, 401);
    }
    const token = session.githubToken;
    const csrf = context.req.header(CSRF_HEADER);
    if (csrf === undefined || !constantTimeEqual(csrf, session.csrfToken)) {
      return context.json({ error: { kind: "signed-out" } } as const, 403);
    }
    const contentType = context.req
      .header("Content-Type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLocaleLowerCase("en-US");
    if (contentType !== "application/json") {
      return context.json(
        { error: { kind: "invalid-evidence" } } as const,
        400,
      );
    }
    let body: Record<string, unknown>;
    try {
      body = parseStrictJsonObject(
        new Uint8Array(await context.req.arrayBuffer()),
        API_BODY_LIMIT_BYTES,
      );
    } catch {
      return context.json(
        { error: { kind: "invalid-evidence" } } as const,
        400,
      );
    }
    if (!isDeepAnalysisRequest(body)) {
      return context.json(
        { error: { kind: "invalid-evidence" } } as const,
        422,
      );
    }
    const request: DeepAnalysisRequest = structuredClone(body);
    const lease = activeRuns.begin(session.id, context.req.raw.signal);
    if (lease === null) {
      return context.json({ error: { kind: "rate-limit" } } as const, 409);
    }
    const rate = rateLimiter.consume(session.id);
    if (!rate.allowed) {
      lease.finish();
      context.header(
        "Retry-After",
        String(Math.max(1, Math.ceil(rate.retryAfterMs / 1_000))),
      );
      return context.json({ error: { kind: "rate-limit" } } as const, 429);
    }

    context.header("Content-Type", "application/x-ndjson; charset=utf-8");
    context.header("Cache-Control", "no-store");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Accel-Buffering", "no");

    return stream(context, async (output) => {
      const guard = new DeepEventSequenceGuard(request);
      const writeState = { failed: false };
      let writeTail: Promise<void> = Promise.resolve();
      const enqueue = (event: DeepAnalysisEvent): void => {
        if (writeState.failed || !guard.accept(event)) {
          throw new DeepAnalysisServiceError("internal");
        }
        writeTail = writeTail
          .then(async () => {
            if (writeState.failed || output.aborted) {
              throw new Error("stream-aborted");
            }
            await output.write(jsonLine(event));
          })
          .catch(() => {
            writeState.failed = true;
            activeRuns.abort(session.id);
          });
      };
      output.onAbort(() => {
        writeState.failed = true;
        activeRuns.abort(session.id);
      });

      try {
        const report = await service.run(request, token, enqueue, lease.signal);
        if (!writeState.failed) enqueue({ type: "complete", report });
        await writeTail;
      } catch (error) {
        if (!writeState.failed) {
          const event = {
            type: "error",
            error: { kind: publicErrorKind(error) },
          } as const;
          try {
            enqueue(event);
            await writeTail;
          } catch {
            activeRuns.abort(session.id);
          }
        }
      } finally {
        lease.finish();
      }
    });
  });
}
