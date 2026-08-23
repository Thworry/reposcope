import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type {
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
  DeepStatement,
} from "../../src/features/deep-analysis/model.js";
import { cookieNameFor } from "../auth/cookies.js";
import { AuthSessionStore } from "../auth/session-store.js";
import { readServerConfig } from "../config.js";
import { ActiveRunRegistry } from "../http/active-runs.js";
import { SlidingWindowRateLimiter } from "../http/rate-limit.js";
import {
  installHttpSecurity,
  mapHttpError,
  type AppLogger,
} from "../http/security.js";
import {
  installDeepAnalysisRoutes,
  type DeepAnalysisRunner,
} from "./routes.js";
import { DeepAnalysisServiceError } from "./service.js";

const FRONTEND_ORIGIN = "https://thworry.github.io";
const TOKEN = `gho_${"a".repeat(36)}`;
const REQUEST = {
  repository: {
    owner: "example",
    repo: "project",
    commitSha: "a".repeat(40),
  },
  language: "en",
} satisfies DeepAnalysisRequest;

function unknownStatement(text: string): DeepStatement {
  return {
    text,
    provenance: "unknown",
    confidence: "low",
    evidenceIds: [],
  };
}

const REPORT = {
  schemaVersion: "1.0.0",
  repository: { ...REQUEST.repository },
  language: REQUEST.language,
  generatedAt: "2026-08-24T00:00:00.000Z",
  review: { coverage: "full", capabilityClass: "auto" },
  orientation: {
    summary: [],
    verdict: unknownStatement(
      "The available evidence does not support a verdict.",
    ),
  },
  fit: { goodFor: [], poorFor: [] },
  situations: [],
  capabilities: [],
  workflow: [],
  architecture: { summary: [], technologies: [], concepts: [] },
  onboarding: {
    prerequisites: [],
    install: [],
    run: [],
    develop: [],
    cautions: [],
  },
  trust: { reliability: [], security: [], privacy: [], unknowns: [] },
  maintenance: {
    summary: [],
    signals: [],
    community: {
      stars: 0,
      forks: 0,
      watchers: 0,
      openIssues: 0,
      pushedAt: null,
      archived: false,
      license: null,
    },
  },
  alternatives: [],
  disagreements: [],
  nextChecks: [],
  finalVerdict: {
    decision: "not-enough-evidence",
    summary: unknownStatement("More evidence is required before adoption."),
  },
  evidence: [],
} satisfies DeepReport;

interface Harness {
  readonly app: Hono;
  readonly sessionId: string;
  readonly csrfToken: string;
  readonly cookie: string;
  readonly service: DeepAnalysisRunner | null;
  readonly activeRuns: ActiveRunRegistry;
  readonly rateLimiter: SlidingWindowRateLimiter;
}

function successfulRunner(): DeepAnalysisRunner {
  return {
    run: (_request, _token, onEvent) => {
      onEvent({ type: "stage", stage: "preparing-evidence" });
      onEvent({ type: "stage", stage: "consulting-specialists" });
      for (const role of [
        "product",
        "onboarding-architecture",
        "trust-ecosystem",
      ] as const) {
        onEvent({ type: "specialist", role, status: "started" });
        onEvent({ type: "specialist", role, status: "complete" });
      }
      onEvent({ type: "stage", stage: "challenging-findings" });
      onEvent({ type: "stage", stage: "editing-briefing" });
      onEvent({ type: "stage", stage: "validating-sources" });
      return Promise.resolve(structuredClone(REPORT));
    },
  };
}

function makeHarness(
  options: {
    readonly enabled?: boolean;
    readonly service?: DeepAnalysisRunner | null;
    readonly activeRuns?: ActiveRunRegistry;
    readonly rateLimiter?: SlidingWindowRateLimiter;
  } = {},
): Harness {
  let randomByte = 1;
  const clock = { nowMs: () => 1_000 };
  const randomSource = {
    bytes: () => new Uint8Array(32).fill(randomByte++),
  };
  const enabled = options.enabled ?? true;
  const config = readServerConfig({
    NODE_ENV: "test",
    REPOSCOPE_API_ORIGIN: "http://127.0.0.1:8787",
    REPOSCOPE_FRONTEND_URL: "https://thworry.github.io/reposcope/",
    ...(enabled
      ? {
          REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
          REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
          REPOSCOPE_GITHUB_CALLBACK_URL:
            "http://127.0.0.1:8787/api/v1/auth/callback",
        }
      : {}),
  });
  const sessionStore = new AuthSessionStore({
    clock,
    randomSource,
    ttlMs: config.sessionIdleMs,
  });
  const pending = sessionStore.createSession();
  const session = sessionStore.authorizeSession(pending.id, TOKEN);
  if (session === null) throw new Error("test session was not authorized");
  const activeRuns = options.activeRuns ?? new ActiveRunRegistry();
  const rateLimiter =
    options.rateLimiter ?? new SlidingWindowRateLimiter({ nowMs: clock.nowMs });
  const service = Object.hasOwn(options, "service")
    ? (options.service ?? null)
    : successfulRunner();
  const logger: AppLogger = { error: vi.fn(), info: vi.fn() };
  const app = new Hono();
  installHttpSecurity(app, {
    apiOrigin: config.apiOrigin,
    frontendOrigin: config.frontendOrigin,
    logger,
  });
  installDeepAnalysisRoutes(app, {
    config,
    sessionStore,
    service,
    rateLimiter,
    activeRuns,
  });
  app.onError((error, context) => mapHttpError(error, context, logger));

  return {
    app,
    sessionId: session.id,
    csrfToken: session.csrfToken,
    cookie: `${cookieNameFor(config.environment)}=${session.id}`,
    service,
    activeRuns,
    rateLimiter,
  };
}

function requestInit(
  harness: Harness,
  options: {
    readonly body?: string;
    readonly contentType?: string | null;
    readonly cookie?: string | null;
    readonly csrf?: string | null;
    readonly origin?: string | null;
    readonly signal?: AbortSignal;
  } = {},
): RequestInit {
  const headers = new Headers();
  const origin = Object.hasOwn(options, "origin")
    ? options.origin
    : FRONTEND_ORIGIN;
  const cookie = Object.hasOwn(options, "cookie")
    ? options.cookie
    : harness.cookie;
  const csrf = Object.hasOwn(options, "csrf")
    ? options.csrf
    : harness.csrfToken;
  const contentType = Object.hasOwn(options, "contentType")
    ? options.contentType
    : "application/json";
  if (origin !== null && origin !== undefined) headers.set("Origin", origin);
  if (cookie !== null && cookie !== undefined) headers.set("Cookie", cookie);
  if (csrf !== null && csrf !== undefined) {
    headers.set("X-RepoScope-CSRF", csrf);
  }
  if (contentType !== null && contentType !== undefined) {
    headers.set("Content-Type", contentType);
  }
  return {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify(REQUEST),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}

async function readEvents(response: Response): Promise<DeepAnalysisEvent[]> {
  const text = await response.text();
  return text.length === 0
    ? []
    : text
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as DeepAnalysisEvent);
}

describe("deep-analysis route", () => {
  it("fails closed when expert analysis is not fully configured", async () => {
    const harness = makeHarness({ enabled: false, service: null });
    const response = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { kind: "disabled" } });
  });

  it("requires a ready session and exact CSRF value", async () => {
    const harness = makeHarness();
    const signedOut = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, { cookie: null }),
    );
    const missingCsrf = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, { csrf: null }),
    );
    const hugeCsrf = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, { csrf: "x".repeat(100_000) }),
    );
    const unicodeCsrf = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, { csrf: "é".repeat(harness.csrfToken.length) }),
    );

    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ error: { kind: "signed-out" } });
    expect(missingCsrf.status).toBe(403);
    expect(await missingCsrf.json()).toEqual({ error: { kind: "signed-out" } });
    expect(hugeCsrf.status).toBe(403);
    expect(unicodeCsrf.status).toBe(403);
  });

  it("rejects a missing or non-exact origin before reading credentials", async () => {
    const harness = makeHarness();
    for (const origin of [null, "https://evil.example"] as const) {
      const response = await harness.app.request(
        "/api/v1/deep-analysis",
        requestInit(harness, { origin }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: { kind: "origin-not-allowed" },
      });
    }
  });

  it.each([
    ["missing content type", { contentType: null }, 400],
    ["wrong content type", { contentType: "text/plain" }, 400],
    ["malformed JSON", { body: "{" }, 400],
    [
      "duplicate JSON keys",
      {
        body: `{"repository":{"owner":"example","owner":"attacker","repo":"project","commitSha":"${"a".repeat(40)}"},"language":"en"}`,
      },
      400,
    ],
    [
      "unknown request key",
      { body: JSON.stringify({ ...REQUEST, unexpected: true }) },
      422,
    ],
  ] as const)("rejects %s", async (_name, options, status) => {
    const harness = makeHarness();
    const response = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, options),
    );

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: { kind: "invalid-evidence" },
    });
    expect(harness.activeRuns.size).toBe(0);
  });

  it("rejects non-UTF-8 JSON bytes before request validation", async () => {
    const harness = makeHarness();
    const response = await harness.app.request("/api/v1/deep-analysis", {
      ...requestInit(harness),
      body: new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { kind: "invalid-evidence" },
    });
  });

  it("rejects an oversized body before starting work", async () => {
    const harness = makeHarness();
    const response = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness, {
        body: JSON.stringify({ request: "x".repeat(70 * 1_024) }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { kind: "payload-too-large" },
    });
    expect(harness.activeRuns.size).toBe(0);
  });

  it("streams compact, ordered NDJSON with exactly one terminal event", async () => {
    const harness = makeHarness();
    const response = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );
    const events = await readEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(events.map((event) => event.type)).toEqual([
      "stage",
      "stage",
      "specialist",
      "specialist",
      "specialist",
      "specialist",
      "specialist",
      "specialist",
      "stage",
      "stage",
      "stage",
      "complete",
    ]);
    expect(events.at(-1)).toEqual({ type: "complete", report: REPORT });
    expect(events.filter((event) => event.type === "complete")).toHaveLength(1);
    expect(harness.activeRuns.size).toBe(0);
  });

  it.each([
    "cancelled",
    "copilot-unavailable",
    "github-unavailable",
    "invalid-evidence",
    "rate-limit",
    "repository-changed",
    "internal",
  ] as const)("maps a trusted %s service failure", async (kind) => {
    const service: DeepAnalysisRunner = {
      run: vi.fn(() => Promise.reject(new DeepAnalysisServiceError(kind))),
    };
    const harness = makeHarness({ service });
    const response = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );

    expect(await readEvents(response)).toEqual([
      { type: "error", error: { kind } },
    ]);
  });

  it("redacts untrusted failures and invalid event sequences", async () => {
    const secret = "gho_never-return-this-provider-content";
    const forgedServiceError = new DeepAnalysisServiceError("internal");
    Object.defineProperty(forgedServiceError, "kind", { value: secret });
    const untrustedFailure: DeepAnalysisRunner = {
      run: () => Promise.reject(new Error(secret)),
    };
    const forgedFailure: DeepAnalysisRunner = {
      run: () => Promise.reject(forgedServiceError),
    };
    const invalidSequence: DeepAnalysisRunner = {
      run: (_request, _token, onEvent) => {
        onEvent({ type: "stage", stage: "validating-sources" });
        return Promise.resolve(structuredClone(REPORT));
      },
    };
    for (const service of [untrustedFailure, forgedFailure, invalidSequence]) {
      const harness = makeHarness({ service });
      const response = await harness.app.request(
        "/api/v1/deep-analysis",
        requestInit(harness),
      );
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(text.trim()).toBe(
        JSON.stringify({ type: "error", error: { kind: "internal" } }),
      );
    }
  });

  it("allows only one active run per session without consuming another start", async () => {
    let runSignal: AbortSignal | undefined;
    const run = vi.fn<DeepAnalysisRunner["run"]>(
      async (_request, _token, onEvent, signal) => {
        runSignal = signal;
        onEvent({ type: "stage", stage: "preparing-evidence" });
        return await new Promise<DeepReport>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new DeepAnalysisServiceError("cancelled"));
            },
            { once: true },
          );
        });
      },
    );
    const service: DeepAnalysisRunner = {
      run,
    };
    const rateLimiter = new SlidingWindowRateLimiter({
      nowMs: () => 1_000,
      starts: 2,
    });
    const harness = makeHarness({ service, rateLimiter });
    const first = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );
    const concurrent = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );

    expect(concurrent.status).toBe(409);
    expect(await concurrent.json()).toEqual({
      error: { kind: "rate-limit" },
    });
    expect(run).toHaveBeenCalledOnce();
    await first.body?.cancel();
    await vi.waitFor(() => {
      expect(runSignal?.aborted).toBe(true);
    });
    await vi.waitFor(() => {
      expect(harness.activeRuns.size).toBe(0);
    });

    const afterDisconnect = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );
    expect(afterDisconnect.status).toBe(200);
    await afterDisconnect.body?.cancel();
  });

  it("limits starts to five per session in a sliding hour", async () => {
    const run = vi.fn<DeepAnalysisRunner["run"]>(() =>
      Promise.reject(new DeepAnalysisServiceError("internal")),
    );
    const service: DeepAnalysisRunner = {
      run,
    };
    const harness = makeHarness({ service });
    for (let index = 0; index < 5; index += 1) {
      const response = await harness.app.request(
        "/api/v1/deep-analysis",
        requestInit(harness),
      );
      expect(response.status).toBe(200);
      await response.text();
    }
    const limited = await harness.app.request(
      "/api/v1/deep-analysis",
      requestInit(harness),
    );

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await limited.json()).toEqual({
      error: { kind: "rate-limit" },
    });
    expect(run).toHaveBeenCalledTimes(5);
  });
});
