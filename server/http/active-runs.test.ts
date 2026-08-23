import { describe, expect, it, vi } from "vitest";

import { ActiveRunRegistry } from "./active-runs.js";

const SESSION_A = "a".repeat(43);
const SESSION_B = "b".repeat(43);

describe("ActiveRunRegistry", () => {
  it("permits one run per session and releases idempotently", () => {
    const registry = new ActiveRunRegistry();
    const first = registry.begin(SESSION_A);
    expect(first).not.toBeNull();
    expect(registry.begin(SESSION_A)).toBeNull();
    expect(registry.begin(SESSION_B)).not.toBeNull();
    expect(registry.size).toBe(2);

    first?.finish();
    first?.finish();
    expect(registry.has(SESSION_A)).toBe(false);
    expect(registry.begin(SESSION_A)).not.toBeNull();
  });

  it("fans parent cancellation into the run and removes its lease", () => {
    const registry = new ActiveRunRegistry();
    const parent = new AbortController();
    const lease = registry.begin(SESSION_A, parent.signal);
    const listener = vi.fn();
    lease?.signal.addEventListener("abort", listener);

    parent.abort(new Error("private parent reason"));

    expect(listener).toHaveBeenCalledOnce();
    expect(lease?.signal.aborted).toBe(true);
    expect(lease?.signal.reason).toBeInstanceOf(DOMException);
    expect(registry.has(SESSION_A)).toBe(false);
  });

  it("aborts on sign-out, supports shutdown, and ignores stale finishes", () => {
    const registry = new ActiveRunRegistry();
    const first = registry.begin(SESSION_A);
    expect(registry.abort(SESSION_A)).toBe(true);
    expect(first?.signal.aborted).toBe(true);
    const replacement = registry.begin(SESSION_A);
    first?.finish();
    expect(registry.has(SESSION_A)).toBe(true);

    registry.begin(SESSION_B);
    registry.abortAll();
    expect(replacement?.signal.aborted).toBe(true);
    expect(registry.size).toBe(0);
  });

  it("rejects reentrant starts while aborting all leases", () => {
    const registry = new ActiveRunRegistry();
    const lease = registry.begin(SESSION_A);
    const attempted = vi.fn();
    let replacement: ReturnType<ActiveRunRegistry["begin"]> = null;
    lease?.signal.addEventListener("abort", () => {
      attempted();
      replacement = registry.begin(SESSION_A);
    });

    registry.abortAll();

    expect(attempted).toHaveBeenCalledOnce();
    expect(replacement).toBeNull();
    expect(registry.size).toBe(0);
    expect(registry.begin(SESSION_A)).not.toBeNull();
  });

  it("rejects malformed and already-aborted starts", () => {
    const registry = new ActiveRunRegistry();
    const aborted = AbortSignal.abort();
    expect(registry.begin("short")).toBeNull();
    expect(registry.begin(SESSION_A, aborted)).toBeNull();
    expect(registry.size).toBe(0);
  });
});
