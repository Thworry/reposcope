import { describe, expect, it } from "vitest";

import { SlidingWindowRateLimiter } from "./rate-limit.js";

const SESSION_A = "a".repeat(43);
const SESSION_B = "b".repeat(43);

describe("SlidingWindowRateLimiter", () => {
  it("allows five starts per session in a sliding hour", () => {
    let now = 1_000;
    const limiter = new SlidingWindowRateLimiter({ nowMs: () => now });
    for (let index = 0; index < 5; index += 1) {
      expect(limiter.consume(SESSION_A)).toMatchObject({ allowed: true });
    }
    expect(limiter.consume(SESSION_A)).toEqual({
      allowed: false,
      retryAfterMs: 60 * 60 * 1_000,
      remaining: 0,
    });
    expect(limiter.consume(SESSION_B)).toMatchObject({ allowed: true });

    now += 60 * 60 * 1_000;
    expect(limiter.consume(SESSION_A)).toMatchObject({
      allowed: true,
      remaining: 4,
    });
  });

  it("uses monotonic time when a wall clock moves backwards", () => {
    let now = 5_000;
    const limiter = new SlidingWindowRateLimiter({
      nowMs: () => now,
      starts: 1,
      windowMs: 100,
    });
    expect(limiter.consume(SESSION_A).allowed).toBe(true);
    now = 1;
    expect(limiter.consume(SESSION_A)).toMatchObject({
      allowed: false,
      retryAfterMs: 100,
    });
    now = 5_100;
    expect(limiter.consume(SESSION_A).allowed).toBe(true);
  });

  it("fails closed at capacity, expires idle keys, and supports sign-out deletion", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({
      nowMs: () => now,
      starts: 1,
      windowMs: 10,
      sessions: 1,
    });
    expect(limiter.consume(SESSION_A).allowed).toBe(true);
    expect(limiter.consume(SESSION_B).allowed).toBe(false);
    expect(limiter.delete(SESSION_A)).toBe(true);
    expect(limiter.consume(SESSION_B).allowed).toBe(true);

    now = 10;
    expect(limiter.consume(SESSION_A).allowed).toBe(true);
    expect(limiter.size).toBe(1);
  });

  it("rejects malformed session identifiers without allocating state", () => {
    const limiter = new SlidingWindowRateLimiter({ nowMs: () => 0 });
    expect(limiter.consume("short").allowed).toBe(false);
    expect(limiter.consume(new Proxy({}, {})).allowed).toBe(false);
    expect(limiter.size).toBe(0);
  });
});
