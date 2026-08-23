import { randomBytes } from "node:crypto";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { GitHubOAuthClient } from "./auth/github-oauth.js";
import { AuthSessionStore } from "./auth/session-store.js";
import { readServerConfig } from "./config.js";
import type { AppLogger } from "./http/security.js";

const logger: AppLogger = {
  info(event, details) {
    console.info(event, details ?? {});
  },
  error(event, details) {
    console.error(event, details ?? {});
  },
};

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
  let sessionStore: AuthSessionStore | null = null;
  let oauthClient: GitHubOAuthClient | null = null;
  if (config.deepAnalysisEnabled) {
    const { githubCallbackUrl, githubClientId, githubClientSecret } = config;
    if (
      githubClientId === null ||
      githubClientSecret === null ||
      githubCallbackUrl === null
    ) {
      logger.error("RepoScope authorization configuration is incomplete");
      process.exitCode = 1;
      return;
    }
    sessionStore = new AuthSessionStore({
      clock,
      randomSource,
      ttlMs: config.sessionIdleMs,
    });
    oauthClient = new GitHubOAuthClient({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      callbackUrl: githubCallbackUrl,
      fetch,
    });
  }

  const app = createApp({
    config,
    clock,
    randomSource,
    logger,
    sessionStore,
    oauthClient,
  });
  const server = serve(
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

  let closing = false;
  const close = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info("RepoScope API shutting down", { signal });
    server.close((error) => {
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
