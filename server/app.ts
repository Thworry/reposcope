import { Hono } from "hono";

import type { GitHubOAuth } from "./auth/github-oauth.js";
import { installAuthRoutes } from "./auth/routes.js";
import type { AuthSessionStore } from "./auth/session-store.js";
import type { ServerConfig } from "./config.js";
import {
  installDeepAnalysisRoutes,
  type DeepAnalysisRunner,
} from "./deep-analysis/routes.js";
import type { ActiveRunRegistry } from "./http/active-runs.js";
import type { SlidingWindowRateLimiter } from "./http/rate-limit.js";
import {
  installHttpSecurity,
  mapHttpError,
  type AppLogger,
} from "./http/security.js";

export interface Clock {
  nowMs(): number;
}

export interface RandomSource {
  bytes(length: number): Uint8Array;
}

export interface AppDependencies {
  readonly config: ServerConfig;
  readonly clock: Clock;
  readonly randomSource: RandomSource;
  readonly logger: AppLogger;
  readonly sessionStore: AuthSessionStore | null;
  readonly oauthClient: GitHubOAuth | null;
  readonly deepAnalysisService: DeepAnalysisRunner | null;
  readonly rateLimiter: SlidingWindowRateLimiter;
  readonly activeRuns: ActiveRunRegistry;
}

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();

  installHttpSecurity(app, {
    apiOrigin: dependencies.config.apiOrigin,
    frontendOrigin: dependencies.config.frontendOrigin,
    logger: dependencies.logger,
  });

  installAuthRoutes(app, {
    config: dependencies.config,
    logger: dependencies.logger,
    sessionStore: dependencies.sessionStore,
    oauthClient: dependencies.oauthClient,
    rateLimiter: dependencies.rateLimiter,
    activeRuns: dependencies.activeRuns,
  });

  installDeepAnalysisRoutes(app, {
    config: dependencies.config,
    sessionStore: dependencies.sessionStore,
    service: dependencies.deepAnalysisService,
    rateLimiter: dependencies.rateLimiter,
    activeRuns: dependencies.activeRuns,
  });

  app.get("/api/v1/health", (context) =>
    context.json({
      status: "ok",
      deepAnalysis: dependencies.config.deepAnalysisEnabled
        ? "enabled"
        : "disabled",
    } as const),
  );

  app.notFound((context) =>
    context.json({ error: { kind: "not-found" } } as const, 404),
  );
  app.onError((error, context) =>
    mapHttpError(error, context, dependencies.logger),
  );

  return app;
}
