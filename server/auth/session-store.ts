import { timingSafeEqual } from "node:crypto";

import type {
  AuthClock,
  AuthRandomSource,
  AuthSession,
  ConsumedOAuthRequest,
} from "./model.js";

const RANDOM_BYTE_COUNT = 32;
const DEFAULT_MAX_SESSIONS = 10_000;
const MAX_RANDOM_ATTEMPTS = 16;

export interface AuthSessionStoreOptions {
  readonly clock: AuthClock;
  readonly randomSource: AuthRandomSource;
  readonly ttlMs: number;
  readonly maxSessions?: number;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export class AuthSessionStore {
  readonly #clock: AuthClock;
  readonly #randomSource: AuthRandomSource;
  readonly #ttlMs: number;
  readonly #maxSessions: number;
  readonly #sessions = new Map<string, AuthSession>();

  constructor(options: AuthSessionStoreOptions) {
    if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("invalid-session-ttl");
    }
    const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    if (!Number.isSafeInteger(maxSessions) || maxSessions <= 0) {
      throw new Error("invalid-session-capacity");
    }
    this.#clock = options.clock;
    this.#randomSource = options.randomSource;
    this.#ttlMs = options.ttlMs;
    this.#maxSessions = maxSessions;
  }

  get size(): number {
    return this.#sessions.size;
  }

  createSession(): AuthSession {
    if (this.#sessions.size >= this.#maxSessions) {
      this.sweepExpired(this.#maxSessions);
    }
    if (this.#sessions.size >= this.#maxSessions) {
      throw new Error("session-capacity");
    }

    const nowMs = this.#clock.nowMs();
    const session: AuthSession = {
      id: this.#uniqueSessionId(),
      csrfToken: this.#randomToken(),
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.#ttlMs,
      oauthState: null,
      returnTo: null,
      githubToken: null,
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): AuthSession | null {
    const session = this.#sessions.get(id);
    if (session === undefined) {
      return null;
    }
    if (session.expiresAtMs <= this.#clock.nowMs()) {
      this.#sessions.delete(id);
      return null;
    }
    return session;
  }

  beginOAuth(id: string, returnTo: string): string {
    const session = this.getSession(id);
    if (session === null) {
      throw new Error("session-not-found");
    }
    const state = this.#randomToken();
    session.oauthState = state;
    session.returnTo = returnTo;
    return state;
  }

  consumeOAuthState(
    id: string,
    suppliedState: string,
  ): ConsumedOAuthRequest | null {
    const session = this.getSession(id);
    if (
      session === null ||
      session.oauthState === null ||
      session.returnTo === null ||
      !constantTimeEqual(session.oauthState, suppliedState)
    ) {
      return null;
    }
    const returnTo = session.returnTo;
    session.oauthState = null;
    session.returnTo = null;
    return { returnTo };
  }

  authorizeSession(id: string, githubToken: string): AuthSession | null {
    const current = this.getSession(id);
    if (current === null) {
      return null;
    }
    const nowMs = this.#clock.nowMs();
    const rotated: AuthSession = {
      id: this.#uniqueSessionId(),
      csrfToken: this.#randomToken(),
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.#ttlMs,
      oauthState: null,
      returnTo: null,
      githubToken,
    };
    this.#sessions.delete(id);
    this.#sessions.set(rotated.id, rotated);
    return rotated;
  }

  clearAuthorization(id: string): void {
    const session = this.getSession(id);
    if (session !== null) {
      session.githubToken = null;
      session.oauthState = null;
      session.returnTo = null;
    }
  }

  deleteSession(id: string): boolean {
    return this.#sessions.delete(id);
  }

  sweepExpired(limit: number): number {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new Error("invalid-sweep-limit");
    }
    const nowMs = this.#clock.nowMs();
    let inspected = 0;
    let removed = 0;
    for (const [id, session] of this.#sessions) {
      if (inspected >= limit) {
        break;
      }
      inspected += 1;
      if (session.expiresAtMs <= nowMs) {
        this.#sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  #randomToken(): string {
    const value = this.#randomSource.bytes(RANDOM_BYTE_COUNT);
    if (value.byteLength !== RANDOM_BYTE_COUNT) {
      throw new Error("invalid-random-source");
    }
    return Buffer.from(value).toString("base64url");
  }

  #uniqueSessionId(): string {
    for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
      const candidate = this.#randomToken();
      if (!this.#sessions.has(candidate)) {
        return candidate;
      }
    }
    throw new Error("session-id-collision");
  }
}
