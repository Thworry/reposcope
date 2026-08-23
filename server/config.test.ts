import { describe, expect, it } from "vitest";

import { readServerConfig } from "./config.js";

const BASE_ENV = {
  NODE_ENV: "test",
  REPOSCOPE_API_ORIGIN: "http://127.0.0.1:8787",
  REPOSCOPE_FRONTEND_URL: "http://127.0.0.1:5173/reposcope/",
} as const;

describe("readServerConfig", () => {
  it("derives canonical origins while preserving the frontend base path", () => {
    const config = readServerConfig(BASE_ENV);

    expect(config).toEqual({
      environment: "test",
      host: "127.0.0.1",
      port: 8787,
      frontendBaseUrl: "http://127.0.0.1:5173/reposcope/",
      frontendOrigin: "http://127.0.0.1:5173",
      apiOrigin: "http://127.0.0.1:8787",
      cachePath: ".data/deep-reports.sqlite",
      githubClientId: null,
      githubClientSecret: null,
      githubCallbackUrl: null,
      sessionIdleMs: 8 * 60 * 60 * 1_000,
      deepAnalysisEnabled: false,
    });
  });

  it("enables deep analysis only when every OAuth App value is present", () => {
    const config = readServerConfig({
      ...BASE_ENV,
      REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
      REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
      REPOSCOPE_GITHUB_CALLBACK_URL:
        "http://127.0.0.1:8787/api/v1/auth/callback",
    });

    expect(config.deepAnalysisEnabled).toBe(true);
  });

  it("allows an entirely absent production OAuth configuration", () => {
    const config = readServerConfig({
      NODE_ENV: "production",
      REPOSCOPE_API_ORIGIN: "https://api.example.com",
      REPOSCOPE_FRONTEND_URL: "https://reposcope.example.com/",
    });

    expect(config.deepAnalysisEnabled).toBe(false);
  });

  it("accepts the documented custom-domain topology for production expert mode", () => {
    const config = readServerConfig({
      NODE_ENV: "production",
      REPOSCOPE_API_ORIGIN: "https://api.reposcope.example.com",
      REPOSCOPE_FRONTEND_URL: "https://reposcope.example.com/",
      REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
      REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
      REPOSCOPE_GITHUB_CALLBACK_URL:
        "https://api.reposcope.example.com/api/v1/auth/callback",
    });

    expect(config.deepAnalysisEnabled).toBe(true);
  });

  it("rejects partial OAuth credentials in production", () => {
    expect(() =>
      readServerConfig({
        NODE_ENV: "production",
        REPOSCOPE_API_ORIGIN: "https://api.example.com",
        REPOSCOPE_FRONTEND_URL: "https://reposcope.example.com/",
        REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
      }),
    ).toThrow(/all GitHub OAuth App values/i);
  });

  it.each([
    ["wildcard frontend URL", { REPOSCOPE_FRONTEND_URL: "*" }],
    [
      "public HTTP frontend URL",
      { REPOSCOPE_FRONTEND_URL: "http://reposcope.example.com/" },
    ],
    [
      "public HTTP API origin",
      { REPOSCOPE_API_ORIGIN: "http://api.example.com" },
    ],
    ["port zero", { PORT: "0" }],
    ["non-numeric port", { PORT: "eight" }],
    [
      "callback with a query",
      {
        REPOSCOPE_GITHUB_CALLBACK_URL:
          "http://127.0.0.1:8787/api/v1/auth/callback?code=x",
      },
    ],
    ["malformed callback URL", { REPOSCOPE_GITHUB_CALLBACK_URL: "not-a-url" }],
    [
      "callback on another origin",
      {
        REPOSCOPE_GITHUB_CALLBACK_URL:
          "http://localhost:8787/api/v1/auth/callback",
      },
    ],
  ])("rejects %s", (_label, override) => {
    expect(() => readServerConfig({ ...BASE_ENV, ...override })).toThrow();
  });

  it("rejects an enabled cross-site production deployment", () => {
    expect(() =>
      readServerConfig({
        NODE_ENV: "production",
        REPOSCOPE_API_ORIGIN: "https://api.other.example",
        REPOSCOPE_FRONTEND_URL: "https://reposcope.example.com/",
        REPOSCOPE_GITHUB_CLIENT_ID: "client-id",
        REPOSCOPE_GITHUB_CLIENT_SECRET: "client-secret",
        REPOSCOPE_GITHUB_CALLBACK_URL:
          "https://api.other.example/api/v1/auth/callback",
      }),
    ).toThrow(/same-site custom domains/i);
  });
});
