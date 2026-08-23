import { randomBytes } from "node:crypto";

import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
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

  const app = createApp({
    config,
    clock: { nowMs: Date.now },
    randomSource: {
      bytes: (length) => Uint8Array.from(randomBytes(length)),
    },
    logger,
    sessionStore: null,
    oauthClient: null,
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
