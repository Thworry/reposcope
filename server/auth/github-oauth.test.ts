import { describe, expect, it, vi } from "vitest";

import { GitHubOAuthClient, GitHubOAuthError } from "./github-oauth.js";

function client(fetchImplementation: typeof fetch): GitHubOAuthClient {
  return new GitHubOAuthClient({
    clientId: "client-id",
    clientSecret: "client-secret",
    callbackUrl: "https://api.example.com/api/v1/auth/callback",
    fetch: fetchImplementation,
  });
}

const VALID_USER_TOKEN = `gho_${"a".repeat(36)}`;

describe("GitHubOAuthClient", () => {
  it("constructs only the fixed scope-less GitHub authorization URL", () => {
    const url = new URL(client(vi.fn()).authorizationUrl("opaque-state"));

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/api/v1/auth/callback",
    );
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("uses a bounded, non-following JSON token exchange", async () => {
    let requestUrl: string | URL | Request | null = null;
    let requestInit: RequestInit | undefined;
    const fetchImplementation: typeof fetch = (input, init) => {
      requestUrl = input;
      requestInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: VALID_USER_TOKEN }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    };

    await expect(
      client(fetchImplementation).exchangeCode("callback-code"),
    ).resolves.toBe(VALID_USER_TOKEN);
    expect(requestUrl).toBe("https://github.com/login/oauth/access_token");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.redirect).toBe("error");
    expect(new Headers(requestInit?.headers).get("Accept")).toBe(
      "application/json",
    );
    expect(requestInit?.body).toBeInstanceOf(URLSearchParams);
    expect((requestInit?.body as URLSearchParams).get("client_secret")).toBe(
      "client-secret",
    );
  });

  it("times out after 15 seconds even when injected fetch ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const fetchImplementation: typeof fetch = () =>
        new Promise(() => undefined);
      const exchange =
        client(fetchImplementation).exchangeCode("callback-code");
      const rejection = expect(exchange).rejects.toMatchObject({
        kind: "provider-timeout",
      });

      await vi.advanceTimersByTimeAsync(15_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["non-json", new Response("gho_leaked", { status: 200 })],
    [
      "provider error",
      new Response(
        JSON.stringify({
          error: "bad_verification_code",
          secret: "gho_leaked",
        }),
      ),
    ],
    [
      "wrong token kind",
      new Response(JSON.stringify({ access_token: "ghs_installation" })),
    ],
    [
      "malformed user token",
      new Response(JSON.stringify({ access_token: "gho_secret" })),
    ],
    [
      "refresh token",
      new Response(
        JSON.stringify({
          access_token: "gho_valid",
          refresh_token: "ghr_forbidden",
        }),
      ),
    ],
    [
      "oversized response",
      new Response("x".repeat(64 * 1_024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
    ],
  ])("maps %s bodies to redacted local errors", async (_name, response) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

    const promise = client(fetchMock).exchangeCode("callback-code");
    await expect(promise).rejects.toBeInstanceOf(GitHubOAuthError);
    await expect(promise).rejects.not.toThrow(/gho_|ghs_|ghr_|callback-code/u);
  });
});
