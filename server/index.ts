import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { GitHubOAuthClient } from "./auth/github-oauth.js";
import { AuthSessionStore } from "./auth/session-store.js";
import { AlternativeShortlistCache } from "./cache/alternative-shortlist-cache.js";
import { DeepNarrativeCache } from "./cache/deep-narrative-cache.js";
import { readServerConfig } from "./config.js";
import { DeepAnalysisService } from "./deep-analysis/service.js";
import { ServerGitHubClient } from "./github/client.js";
import { ActiveRunRegistry } from "./http/active-runs.js";
import { SlidingWindowRateLimiter } from "./http/rate-limit.js";
import type { AppLogger } from "./http/security.js";
import { PanelModelGateway } from "./panel/copilot-gateway.js";

const logger: AppLogger = {
  info(event, details) {
    console.info(event, details ?? {});
  },
  error(event, details) {
    console.error(event, details ?? {});
  },
};

interface ExpertRuntime {
  readonly sessionStore: AuthSessionStore;
  readonly oauthClient: GitHubOAuthClient;
  readonly service: DeepAnalysisService;
  readonly narrativeCache: DeepNarrativeCache;
  readonly alternativeCache: AlternativeShortlistCache;
}

function closeCache(cache: { close(): void } | null, name: string): void {
  if (cache === null) return;
  try {
    cache.close();
  } catch (error) {
    logger.error("RepoScope cache shutdown failed", {
      cache: name,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    process.exitCode = 1;
  }
}

function createExpertRuntime(
  config: ReturnType<typeof readServerConfig>,
  clock: { nowMs(): number },
  randomSource: { bytes(length: number): Uint8Array },
): ExpertRuntime | null {
  if (!config.deepAnalysisEnabled) return null;
  const { githubCallbackUrl, githubClientId, githubClientSecret } = config;
  if (
    githubClientId === null ||
    githubClientSecret === null ||
    githubCallbackUrl === null
  ) {
    throw new Error("incomplete-expert-runtime");
  }

  if (config.cachePath !== ":memory:") {
    mkdirSync(dirname(resolve(config.cachePath)), {
      recursive: true,
      mode: 0o700,
    });
  }
  let narrativeCache: DeepNarrativeCache | null = null;
  let alternativeCache: AlternativeShortlistCache | null = null;
  try {
    narrativeCache = new DeepNarrativeCache(config.cachePath);
    alternativeCache = new AlternativeShortlistCache(config.cachePath);
    const githubClient = new ServerGitHubClient({ fetch });
    const panelGateway = new PanelModelGateway({ environment: process.env });
    return {
      sessionStore: new AuthSessionStore({
        clock,
        randomSource,
        ttlMs: config.sessionIdleMs,
      }),
      oauthClient: new GitHubOAuthClient({
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        callbackUrl: githubCallbackUrl,
        fetch,
      }),
      service: new DeepAnalysisService({
        githubClient,
        panelGateway,
        narrativeCache,
        alternativeCache,
      }),
      narrativeCache,
      alternativeCache,
    };
  } catch (error) {
    closeCache(alternativeCache, "alternatives");
    closeCache(narrativeCache, "narrative");
    throw error;
  }
}

function startServer(): void {
  let config;
  try {
    config = readServerConfig(process.env);
  } catch {
    logger.error("RepoScope server configuration is invalid");
    process.exitCode = 1;
    return;
  }

  const clock = { nowMs: Date.now };
  const randomSource = {
    bytes: (length: number) => Uint8Array.from(randomBytes(length)),
  };
  const activeRuns = new ActiveRunRegistry();
  const rateLimiter = new SlidingWindowRateLimiter({ nowMs: clock.nowMs });
  let expertRuntime: ExpertRuntime | null;
  try {
    expertRuntime = createExpertRuntime(config, clock, randomSource);
  } catch {
    logger.error("RepoScope expert runtime initialization failed");
    process.exitCode = 1;
    return;
  }

  const app = createApp({
    config,
    clock,
    randomSource,
    logger,
    sessionStore: expertRuntime?.sessionStore ?? null,
    oauthClient: expertRuntime?.oauthClient ?? null,
    deepAnalysisService: expertRuntime?.service ?? null,
    rateLimiter,
    activeRuns,
  });
  let server: ReturnType<typeof serve>;
  try {
    server = serve(
      { fetch: app.fetch, hostname: config.host, port: config.port },
      () => {
        logger.info("RepoScope API listening", {
          deepAnalysis: config.deepAnalysisEnabled ? "enabled" : "disabled",
          host: config.host,
          port: config.port,
        });
        if (config.environment === "production" && config.deepAnalysisEnabled) {
          logger.info(
            "Expert mode requires same-site custom frontend and API domains; cross-site third-party-cookie operation is unsupported",
          );
        }
      },
    );
  } catch {
    closeCache(expertRuntime?.alternativeCache ?? null, "alternatives");
    closeCache(expertRuntime?.narrativeCache ?? null, "narrative");
    logger.error("RepoScope API failed to start");
    process.exitCode = 1;
    return;
  }

  let closing = false;
  let cachesClosed = false;
  const closeCaches = (): void => {
    if (cachesClosed) return;
    cachesClosed = true;
    closeCache(expertRuntime?.alternativeCache ?? null, "alternatives");
    closeCache(expertRuntime?.narrativeCache ?? null, "narrative");
  };
  const close = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info("RepoScope API shutting down", { signal });
    activeRuns.abortAll();
    server.close((error) => {
      closeCaches();
      if (error) {
        logger.error("RepoScope API shutdown failed", {
          errorType: error.name,
        });
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => {
    close("SIGINT");
  });
  process.once("SIGTERM", () => {
    close("SIGTERM");
  });
}

startServer();
