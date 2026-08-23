import { Hono } from "hono";

import type { ServerConfig } from "./config.js";
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
  readonly sessionStore: unknown;
  readonly oauthClient: unknown;
}

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();

  installHttpSecurity(app, {
    apiOrigin: dependencies.config.apiOrigin,
    frontendOrigin: dependencies.config.frontendOrigin,
    logger: dependencies.logger,
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
