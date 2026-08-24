export const DEEP_ANALYSIS_RATE_LIMIT = Object.freeze({
  starts: 5,
  windowMs: 60 * 60 * 1_000,
  sessions: 10_000,
} as const);

export interface SlidingWindowRateLimitOptions {
  readonly nowMs: () => number;
  readonly starts?: number;
  readonly windowMs?: number;
  readonly sessions?: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
  readonly remaining: number;
}

interface SessionWindow {
  timestamps: number[];
  lastAccessedAt: number;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function sessionKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,256}$/u.test(value)
    ? value
    : null;
}

/** In-process, fail-closed per-session start limiter for a single server. */
export class SlidingWindowRateLimiter {
  readonly #nowMs: () => number;
  readonly #starts: number;
  readonly #windowMs: number;
  readonly #sessions: number;
  readonly #windows = new Map<string, SessionWindow>();
  #lastNow = 0;

  constructor(options: SlidingWindowRateLimitOptions) {
    this.#nowMs = options.nowMs;
    this.#starts = positiveInteger(
      options.starts,
      DEEP_ANALYSIS_RATE_LIMIT.starts,
    );
    this.#windowMs = positiveInteger(
      options.windowMs,
      DEEP_ANALYSIS_RATE_LIMIT.windowMs,
    );
    this.#sessions = positiveInteger(
      options.sessions,
      DEEP_ANALYSIS_RATE_LIMIT.sessions,
    );
  }

  consume(sessionId: unknown): RateLimitDecision {
    const key = sessionKey(sessionId);
    if (key === null) return this.denied(this.#windowMs);
    const now = this.monotonicNow();
    this.sweepExpired(now);
    let window = this.#windows.get(key);
    if (window === undefined) {
      if (this.#windows.size >= this.#sessions) {
        return this.denied(this.#windowMs);
      }
      window = { timestamps: [], lastAccessedAt: now };
      this.#windows.set(key, window);
    }
    this.prune(window, now);
    window.lastAccessedAt = now;
    if (window.timestamps.length >= this.#starts) {
      const oldest = window.timestamps[0] ?? now;
      return this.denied(Math.max(1, oldest + this.#windowMs - now));
    }
    window.timestamps.push(now);
    return Object.freeze({
      allowed: true,
      retryAfterMs: 0,
      remaining: this.#starts - window.timestamps.length,
    });
  }

  delete(sessionId: unknown): boolean {
    const key = sessionKey(sessionId);
    return key === null ? false : this.#windows.delete(key);
  }

  get size(): number {
    return this.#windows.size;
  }

  private monotonicNow(): number {
    let observed: number;
    try {
      observed = this.#nowMs();
    } catch {
      observed = this.#lastNow;
    }
    if (!Number.isSafeInteger(observed) || observed < 0) {
      observed = this.#lastNow;
    }
    this.#lastNow = Math.max(this.#lastNow, observed);
    return this.#lastNow;
  }

  private prune(window: SessionWindow, now: number): void {
    const threshold = now - this.#windowMs;
    let retainedFrom = 0;
    while (
      retainedFrom < window.timestamps.length &&
      (window.timestamps[retainedFrom] ?? now) <= threshold
    ) {
      retainedFrom += 1;
    }
    if (retainedFrom > 0) window.timestamps.splice(0, retainedFrom);
  }

  private sweepExpired(now: number): void {
    for (const [key, window] of this.#windows) {
      this.prune(window, now);
      if (
        window.timestamps.length === 0 &&
        window.lastAccessedAt + this.#windowMs <= now
      ) {
        this.#windows.delete(key);
      }
    }
  }

  private denied(retryAfterMs: number): RateLimitDecision {
    return Object.freeze({
      allowed: false,
      retryAfterMs,
      remaining: 0,
    });
  }
}
