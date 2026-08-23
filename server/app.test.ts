import { describe, expect, it, vi } from "vitest";

import { createApp, type AppDependencies } from "./app.js";
import { readServerConfig } from "./config.js";

function dependencies(deepAnalysisEnabled: boolean): AppDependencies {
  const credentialEnv = deepAnalysisEnabled
    ? {
        REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
        REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
        REPOSCOPE_GITHUB_CALLBACK_URL:
          "http://127.0.0.1:8787/api/v1/auth/callback",
      }
    : {};

  return {
    config: readServerConfig({
      NODE_ENV: "test",
      REPOSCOPE_API_ORIGIN: "http://127.0.0.1:8787",
      REPOSCOPE_FRONTEND_URL: "https://thworry.github.io/reposcope/",
      ...credentialEnv,
    }),
    clock: { nowMs: () => 1_000 },
    randomSource: { bytes: (length) => new Uint8Array(length) },
    logger: { error: vi.fn(), info: vi.fn() },
    sessionStore: null,
    oauthClient: null,
  };
}

describe("createApp", () => {
  it.each([
    [false, "disabled"],
    [true, "enabled"],
  ] as const)(
    "reports the redacted health state",
    async (enabled, expected) => {
      const appDependencies = dependencies(enabled);
      const response = await createApp(appDependencies).request(
        "/api/v1/health",
        { headers: { Origin: "https://thworry.github.io" } },
      );
      const bodyText = await response.text();

      expect(response.status).toBe(200);
      expect(JSON.parse(bodyText)).toEqual({
        status: "ok",
        deepAnalysis: expected,
      });
      expect(bodyText).not.toContain("client-id");
      expect(bodyText).not.toContain("client-secret");
      expect(bodyText).not.toContain("127.0.0.1");
    },
  );

  it("uses no-store on session and authorization responses", async () => {
    const app = createApp(dependencies(false));

    const session = await app.request("/api/v1/session");
    const authorization = await app.request("/api/v1/auth/start");

    expect(session.headers.get("cache-control")).toBe("no-store");
    expect(authorization.headers.get("cache-control")).toBe("no-store");
  });

  it("maps unknown routes to a safe JSON response", async () => {
    const response = await createApp(dependencies(false)).request(
      "/not-present",
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { kind: "not-found" } });
  });

  it("maps unexpected handler failures without disclosing the cause", async () => {
    const appDependencies = dependencies(false);
    const app = createApp(appDependencies);
    app.get("/api/v1/failure", () => {
      throw new Error("gho_never-return-this");
    });

    const response = await app.request("/api/v1/failure");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { kind: "internal" } });
    expect(
      JSON.stringify(vi.mocked(appDependencies.logger.error).mock.calls),
    ).not.toContain("gho_never-return-this");
  });
});
