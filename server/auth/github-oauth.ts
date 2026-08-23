const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const RESPONSE_LIMIT_BYTES = 64 * 1_024;
const REQUEST_TIMEOUT_MS = 15_000;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const STATE_PATTERN = /^[A-Za-z0-9_-]{8,256}$/u;
const USER_ACCESS_TOKEN_PATTERN = /^gho_[A-Za-z0-9]{20,255}$/u;

export type GitHubOAuthErrorKind =
  | "invalid-oauth-request"
  | "invalid-provider-response"
  | "provider-rejected"
  | "provider-unavailable"
  | "provider-response-too-large"
  | "provider-timeout";

export class GitHubOAuthError extends Error {
  readonly kind: GitHubOAuthErrorKind;

  constructor(kind: GitHubOAuthErrorKind) {
    super(kind);
    this.name = "GitHubOAuthError";
    this.kind = kind;
  }
}

export interface GitHubOAuth {
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<string>;
}

export interface GitHubOAuthClientOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
  readonly fetch: typeof fetch;
}

export class GitHubOAuthClient implements GitHubOAuth {
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #callbackUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: GitHubOAuthClientOptions) {
    if (!CLIENT_ID_PATTERN.test(options.clientId)) {
      throw new Error("invalid-github-client-id");
    }
    const callback = new URL(options.callbackUrl);
    if (
      (callback.protocol !== "https:" && callback.protocol !== "http:") ||
      callback.username !== "" ||
      callback.password !== "" ||
      callback.pathname !== "/api/v1/auth/callback" ||
      callback.search !== "" ||
      callback.hash !== ""
    ) {
      throw new Error("invalid-github-callback-url");
    }
    if (options.clientSecret.length === 0) {
      throw new Error("invalid-github-client-secret");
    }
    this.#clientId = options.clientId;
    this.#clientSecret = options.clientSecret;
    this.#callbackUrl = callback.href;
    this.#fetch = options.fetch;
  }

  authorizationUrl(state: string): string {
    if (!STATE_PATTERN.test(state)) {
      throw new GitHubOAuthError("invalid-oauth-request");
    }
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.#clientId);
    url.searchParams.set("redirect_uri", this.#callbackUrl);
    url.searchParams.set("state", state);
    return url.href;
  }

  async exchangeCode(code: string): Promise<string> {
    if (code.length === 0 || code.length > 1_024 || hasControlCharacter(code)) {
      throw new GitHubOAuthError("invalid-oauth-request");
    }

    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const timeoutError = new GitHubOAuthError("provider-timeout");
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, REQUEST_TIMEOUT_MS);
      timeoutHandle.unref();
    });

    try {
      return await Promise.race([
        this.#performExchange(code, controller.signal),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  async #performExchange(code: string, signal: AbortSignal): Promise<string> {
    try {
      const response = await this.#fetch(TOKEN_URL, {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.#clientId,
          client_secret: this.#clientSecret,
          code,
          redirect_uri: this.#callbackUrl,
        }),
      });
      const body = await readBoundedBody(response);
      if (!response.ok) {
        throw new GitHubOAuthError("provider-rejected");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(body),
        );
      } catch {
        throw new GitHubOAuthError("invalid-provider-response");
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.hasOwn(parsed, "error") ||
        Object.hasOwn(parsed, "refresh_token") ||
        !Object.hasOwn(parsed, "access_token")
      ) {
        throw new GitHubOAuthError(
          typeof parsed === "object" &&
            parsed !== null &&
            Object.hasOwn(parsed, "error")
            ? "provider-rejected"
            : "invalid-provider-response",
        );
      }
      const token = (parsed as { access_token?: unknown }).access_token;
      if (typeof token !== "string" || !USER_ACCESS_TOKEN_PATTERN.test(token)) {
        throw new GitHubOAuthError("invalid-provider-response");
      }
      return token;
    } catch (error) {
      if (error instanceof GitHubOAuthError) {
        throw error;
      }
      throw new GitHubOAuthError(
        signal.aborted ? "provider-timeout" : "provider-unavailable",
      );
    }
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("Content-Length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > RESPONSE_LIMIT_BYTES
  ) {
    await response.body?.cancel();
    throw new GitHubOAuthError("provider-response-too-large");
  }
  if (response.body === null) {
    return new Uint8Array();
  }

  const reader =
    response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let result = await reader.read();
  while (!result.done) {
    size += result.value.byteLength;
    if (size > RESPONSE_LIMIT_BYTES) {
      await reader.cancel();
      throw new GitHubOAuthError("provider-response-too-large");
    }
    chunks.push(result.value);
    result = await reader.read();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}
