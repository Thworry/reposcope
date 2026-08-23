import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  HttpBoundaryError,
  installHttpSecurity,
  mapHttpError,
} from "./security.js";

describe("HTTP security", () => {
  function createSecuredApp() {
    const app = new Hono();
    const logger = { error: vi.fn(), info: vi.fn() };
    installHttpSecurity(app, {
      apiOrigin: "https://api.example.com",
      frontendOrigin: "https://reposcope.example.com",
      logger,
    });
    app.onError((error, context) => mapHttpError(error, context, logger));
    app.get("/api/ok", (context) => context.json({ ok: true }));
    app.post("/api/echo", async (context) =>
      context.json({ body: await context.req.text() }),
    );
    return { app, logger };
  }

  it("sets defensive response headers", async () => {
    const { app } = createSecuredApp();
    const response = await app.request("/api/ok");

    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-site",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).not.toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows only the exact configured browser origin with credentials", async () => {
    const { app } = createSecuredApp();
    const allowed = await app.request("/api/ok", {
      headers: { Origin: "https://reposcope.example.com" },
    });
    const rejected = await app.request("/api/ok", {
      headers: { Origin: "https://evil.example.com" },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://reposcope.example.com",
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(allowed.headers.get("vary")).toContain("Origin");
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({
      error: { kind: "origin-not-allowed" },
    });
  });

  it("requires the configured origin for state-changing requests", async () => {
    const { app } = createSecuredApp();
    const missing = await app.request("/api/echo", {
      method: "POST",
      body: "request",
    });
    const preflight = await app.request("/api/echo", {
      method: "OPTIONS",
      headers: { Origin: "https://reposcope.example.com" },
    });

    expect(missing.status).toBe(403);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, X-RepoScope-CSRF",
    );
  });

  it("returns a bounded JSON error for oversized bodies", async () => {
    const { app } = createSecuredApp();
    const response = await app.request("/api/echo", {
      method: "POST",
      headers: {
        "Content-Length": String(64 * 1_024 + 1),
        "Content-Type": "text/plain",
        Origin: "https://reposcope.example.com",
      },
      body: "small physical body",
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { kind: "payload-too-large" },
    });
  });

  it("maps typed and unknown errors without exposing their messages", async () => {
    const { app, logger } = createSecuredApp();
    app.get("/api/typed", () => {
      throw new HttpBoundaryError(400, "invalid-request");
    });
    app.get("/api/unknown", () => {
      throw new Error("gho_secret-value");
    });

    const typed = await app.request("/api/typed");
    const unknown = await app.request("/api/unknown");

    expect(await typed.json()).toEqual({
      error: { kind: "invalid-request" },
    });
    expect(await unknown.json()).toEqual({ error: { kind: "internal" } });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      "gho_secret-value",
    );
  });
});
