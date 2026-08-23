import { describe, expect, it } from "vitest";

import { AuthSessionStore } from "./session-store.js";

function bytes(value: number): Uint8Array {
  return new Uint8Array(32).fill(value);
}

describe("AuthSessionStore", () => {
  it("expires records after the configured eight-hour retention", () => {
    let nowMs = 1_000;
    let next = 1;
    const store = new AuthSessionStore({
      clock: { nowMs: () => nowMs },
      randomSource: { bytes: () => bytes(next++) },
      ttlMs: 8 * 60 * 60 * 1_000,
    });
    const session = store.createSession();

    nowMs = session.expiresAtMs;

    expect(store.getSession(session.id)).toBeNull();
    expect(store.size).toBe(0);
  });

  it("retries random identifier collisions without replacing a session", () => {
    const values = [1, 2, 1, 3, 4];
    const store = new AuthSessionStore({
      clock: { nowMs: () => 1_000 },
      randomSource: { bytes: () => bytes(values.shift() ?? 9) },
      ttlMs: 1_000,
    });
    const first = store.createSession();
    const second = store.createSession();

    expect(second.id).not.toBe(first.id);
    expect(store.getSession(first.id)).toEqual(first);
  });

  it("consumes OAuth state once and rotates both session and CSRF identifiers", () => {
    let next = 1;
    const store = new AuthSessionStore({
      clock: { nowMs: () => 1_000 },
      randomSource: { bytes: () => bytes(next++) },
      ttlMs: 1_000,
    });
    const session = store.createSession();
    const state = store.beginOAuth(session.id, "/reposcope/");

    expect(store.consumeOAuthState(session.id, `${state}wrong`)).toBeNull();
    expect(store.consumeOAuthState(session.id, state)).toEqual({
      returnTo: "/reposcope/",
    });
    expect(store.consumeOAuthState(session.id, state)).toBeNull();

    const rotated = store.authorizeSession(session.id, "gho_secret");
    expect(rotated?.id).not.toBe(session.id);
    expect(rotated?.csrfToken).not.toBe(session.csrfToken);
    expect(store.getSession(session.id)).toBeNull();
    expect(store.getSession(rotated?.id ?? "missing")?.githubToken).toBe(
      "gho_secret",
    );
  });

  it("caps records and sweeps no more than the requested number", () => {
    let nowMs = 0;
    let next = 1;
    const store = new AuthSessionStore({
      clock: { nowMs: () => nowMs },
      randomSource: { bytes: () => bytes(next++) },
      ttlMs: 10,
      maxSessions: 2,
    });
    store.createSession();
    store.createSession();
    expect(() => store.createSession()).toThrow("session-capacity");

    nowMs = 10;
    expect(store.sweepExpired(1)).toBe(1);
    expect(store.size).toBe(1);
  });
});
