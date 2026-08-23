export interface AuthSession {
  id: string;
  csrfToken: string;
  createdAtMs: number;
  expiresAtMs: number;
  oauthState: string | null;
  returnTo: string | null;
  githubToken: string | null;
}

export interface AuthClock {
  nowMs(): number;
}

export interface AuthRandomSource {
  bytes(length: number): Uint8Array;
}

export interface ConsumedOAuthRequest {
  readonly returnTo: string;
}
