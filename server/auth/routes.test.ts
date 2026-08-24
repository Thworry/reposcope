import { describe, expect, it, vi } from "vitest";

import { createApp, type AppDependencies } from "../app.js";
import { readServerConfig } from "../config.js";
import { ActiveRunRegistry } from "../http/active-runs.js";
import { SlidingWindowRateLimiter } from "../http/rate-limit.js";
import { cookieNameFor, readSessionCookie } from "./cookies.js";
import type { GitHubOAuth } from "./github-oauth.js";
import { AuthSessionStore } from "./session-store.js";

function makeDependencies(options?: {
  readonly enabled?: boolean;
  readonly frontendUrl?: string;
  readonly exchangeCode?: GitHubOAuth["exchangeCode"];
}): AppDependencies {
  let next = 1;
  const clock = { nowMs: () => 1_000 };
  const randomSource = {
    bytes: () => new Uint8Array(32).fill(next++),
  };
  const enabled = options?.enabled ?? true;
  return {
    config: readServerConfig({
      NODE_ENV: "test",
      REPOSCOPE_API_ORIGIN: "http://127.0.0.1:8787",
      REPOSCOPE_FRONTEND_URL:
        options?.frontendUrl ?? "https://thworry.github.io/reposcope/",
      ...(enabled
        ? {
            REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
            REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
            REPOSCOPE_GITHUB_CALLBACK_URL:
              "http://127.0.0.1:8787/api/v1/auth/callback",
          }
        : {}),
    }),
    clock,
    randomSource,
    logger: { error: vi.fn(), info: vi.fn() },
    sessionStore: new AuthSessionStore({
      clock,
      randomSource,
      ttlMs: 8 * 60 * 60 * 1_000,
    }),
    oauthClient: enabled
      ? {
          authorizationUrl: (state) =>
            `https://github.com/login/oauth/authorize?state=${state}`,
          exchangeCode:
            options?.exchangeCode ??
            (() => Promise.resolve(`gho_${"a".repeat(36)}`)),
        }
      : null,
    deepAnalysisService: null,
    rateLimiter: new SlidingWindowRateLimiter({ nowMs: clock.nowMs }),
    activeRuns: new ActiveRunRegistry(),
  };
}

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function redirectState(response: Response): string {
  return (
    new URL(response.headers.get("location") ?? "missing").searchParams.get(
      "state",
    ) ?? ""
  );
}

describe("auth routes", () => {
  it("reports disabled without creating a session", async () => {
    const response = await createApp(
      makeDependencies({ enabled: false }),
    ).request("/api/v1/session");

    expect(await response.json()).toEqual({ status: "disabled" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("starts authorization with an HttpOnly cookie and exact base-path return", async () => {
    const dependencies = makeDependencies();
    const app = createApp(dependencies);
    const start = await app.request(
      "/api/v1/auth/start?returnTo=%2Freposcope%2F%3Frepo%3Downer%252Frepo",
    );

    expect(start.status).toBe(302);
    expect(start.headers.get("set-cookie")).toContain("HttpOnly");
    expect(start.headers.get("set-cookie")).toContain("SameSite=Lax");
    const pendingSessionId = readSessionCookie(
      cookiePair(start),
      cookieNameFor("test"),
    );
    const lease = dependencies.activeRuns.begin(pendingSessionId);
    dependencies.rateLimiter.consume(pendingSessionId);

    const callback = await app.request(
      `/api/v1/auth/callback?code=x&state=${redirectState(start)}`,
      { headers: { Cookie: cookiePair(start) } },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "https://thworry.github.io/reposcope/?repo=owner%2Frepo&deep=authorized",
    );
    expect(cookiePair(callback)).not.toBe(cookiePair(start));
    expect(await callback.text()).not.toContain("gho_");
    expect(lease?.signal.aborted).toBe(true);
    expect(dependencies.activeRuns.size).toBe(0);
    expect(dependencies.rateLimiter.size).toBe(0);
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/other/",
    "/reposcope/child",
    "/reposcope/../other/",
    "/reposcope/#fragment",
  ])("rejects unsafe returnTo %s", async (returnTo) => {
    const response = await createApp(makeDependencies()).request(
      `/api/v1/auth/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "/api/v1/auth/callback?code=x",
    "/api/v1/auth/callback?state=x",
    "/api/v1/auth/callback?code=x&code=y&state=z",
    "/api/v1/auth/callback?code=x&state=y&state=z",
  ])("rejects missing or duplicate callback parameters", async (url) => {
    const response = await createApp(makeDependencies()).request(url);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("gho_");
  });

  it("rejects mismatched and replayed state without reflecting secrets", async () => {
    const app = createApp(makeDependencies());
    const start = await app.request("/api/v1/auth/start");
    const cookie = cookiePair(start);
    const state = redirectState(start);

    const mismatch = await app.request(
      "/api/v1/auth/callback?code=secret-code&state=wrong",
      { headers: { Cookie: cookie } },
    );
    expect(mismatch.status).toBe(400);
    expect(await mismatch.text()).not.toContain("secret-code");

    const valid = await app.request(
      `/api/v1/auth/callback?code=secret-code&state=${state}`,
      { headers: { Cookie: cookie } },
    );
    expect(valid.status).toBe(302);

    const replay = await app.request(
      `/api/v1/auth/callback?code=secret-code&state=${state}`,
      { headers: { Cookie: cookie } },
    );
    expect(replay.status).toBe(400);
  });

  it("consumes state and clears the session when GitHub authorization is denied", async () => {
    const dependencies = makeDependencies();
    const app = createApp(dependencies);
    const start = await app.request("/api/v1/auth/start");
    const deniedSessionId = readSessionCookie(
      cookiePair(start),
      cookieNameFor("test"),
    );
    expect(deniedSessionId).not.toBeNull();
    const lease = dependencies.activeRuns.begin(deniedSessionId);
    dependencies.rateLimiter.consume(deniedSessionId);
    const response = await app.request(
      `/api/v1/auth/callback?error=access_denied&error_description=${encodeURIComponent("gho_do-not-reflect")}&state=${redirectState(start)}`,
      { headers: { Cookie: cookiePair(start) } },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("gho_");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(lease?.signal.aborted).toBe(true);
    expect(dependencies.activeRuns.size).toBe(0);
    expect(dependencies.rateLimiter.size).toBe(0);
  });

  it("requires exact origin and CSRF on sign-out, then clears the session", async () => {
    const dependencies = makeDependencies();
    const app = createApp(dependencies);
    const start = await app.request("/api/v1/auth/start");
    const authorized = await app.request(
      `/api/v1/auth/callback?code=x&state=${redirectState(start)}`,
      { headers: { Cookie: cookiePair(start) } },
    );
    const cookie = cookiePair(authorized);
    const session = await app.request("/api/v1/session", {
      headers: { Cookie: cookie },
    });
    const csrf = ((await session.json()) as { csrfToken: string }).csrfToken;
    const sessionId = readSessionCookie(cookie, cookieNameFor("test"));
    expect(sessionId).not.toBeNull();
    const lease = dependencies.activeRuns.begin(sessionId);
    dependencies.rateLimiter.consume(sessionId);

    for (const headers of [
      {
        Cookie: cookie,
        Origin: "https://evil.example",
        "X-RepoScope-CSRF": csrf,
      },
      {
        Cookie: cookie,
        Origin: "https://thworry.github.io",
        "X-RepoScope-CSRF": "wrong",
      },
      { Cookie: cookie, Origin: "https://thworry.github.io" },
    ]) {
      const rejected = await app.request("/api/v1/sign-out", {
        method: "POST",
        headers,
      });
      expect(rejected.status).toBe(403);
      expect(lease?.signal.aborted).toBe(false);
      expect(dependencies.rateLimiter.size).toBe(1);
    }

    const signedOut = await app.request("/api/v1/sign-out", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://thworry.github.io",
        "X-RepoScope-CSRF": csrf,
      },
    });
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get("cache-control")).toBe("no-store");
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(lease?.signal.aborted).toBe(true);
    expect(dependencies.activeRuns.size).toBe(0);
    expect(dependencies.rateLimiter.size).toBe(0);

    const after = await app.request("/api/v1/session", {
      headers: { Cookie: cookie },
    });
    expect(await after.json()).toEqual({ status: "signed-out" });
  });

  it("redacts exchange failures and clears provider authorization state", async () => {
    const exchangeCode = vi.fn(() =>
      Promise.reject(new Error("gho_provider-secret callback-code")),
    );
    const dependencies = makeDependencies({ exchangeCode });
    const app = createApp(dependencies);
    const start = await app.request("/api/v1/auth/start");
    const failedSessionId = readSessionCookie(
      cookiePair(start),
      cookieNameFor("test"),
    );
    expect(failedSessionId).not.toBeNull();
    const lease = dependencies.activeRuns.begin(failedSessionId);
    dependencies.rateLimiter.consume(failedSessionId);
    const response = await app.request(
      `/api/v1/auth/callback?code=callback-code&state=${redirectState(start)}`,
      { headers: { Cookie: cookiePair(start) } },
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/gho_|callback-code/u);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(lease?.signal.aborted).toBe(true);
    expect(dependencies.rateLimiter.size).toBe(0);
    expect(
      JSON.stringify(vi.mocked(dependencies.logger.error).mock.calls),
    ).not.toMatch(/gho_|callback-code/u);
  });

  it("ignores unknown attacker cookies", async () => {
    const response = await createApp(makeDependencies()).request(
      "/api/v1/session",
      {
        headers: {
          Cookie: `${cookieNameFor("test")}=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        },
      },
    );
    expect(await response.json()).toEqual({ status: "signed-out" });
  });
});
