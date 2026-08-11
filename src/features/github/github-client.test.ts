import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VALID_COMMIT_RESPONSE,
  VALID_REPOSITORY_RESPONSE,
  VALID_TREE_RESPONSE,
} from "../../test/fixtures/github";
import {
  fetchRawTextFile,
  fetchRepositorySnapshot,
  GitHubApiError,
} from "./github-client";
import type { FetchImplementation } from "./github-client";

const ref = { owner: "owner", repo: "repo" } as const;
const commitSha = "a".repeat(40);

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  rate: { remaining?: string; reset?: string } = {},
): Response {
  const headers = new Headers(init.headers);

  if (rate.remaining !== undefined) {
    headers.set("x-ratelimit-remaining", rate.remaining);
  }

  if (rate.reset !== undefined) {
    headers.set("x-ratelimit-reset", rate.reset);
  }

  return new Response(JSON.stringify(body), { ...init, headers });
}

function rawResponse(
  chunks: readonly Uint8Array[],
  init: ResponseInit = {},
): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];

      if (chunk === undefined) {
        controller.close();
        return;
      }

      index += 1;
      controller.enqueue(chunk);
    },
  });

  return new Response(body, init);
}

function successfulSnapshotFetch() {
  return vi
    .fn<FetchImplementation>()
    .mockResolvedValueOnce(
      jsonResponse(
        VALID_REPOSITORY_RESPONSE,
        {},
        {
          remaining: "59",
          reset: "1786500000",
        },
      ),
    )
    .mockResolvedValueOnce(
      jsonResponse(
        VALID_COMMIT_RESPONSE,
        {},
        {
          remaining: "58",
          reset: "1786500060",
        },
      ),
    )
    .mockResolvedValueOnce(
      jsonResponse(
        VALID_TREE_RESPONSE,
        {},
        {
          remaining: "57",
          reset: "1786500030",
        },
      ),
    );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchRepositorySnapshot", () => {
  it("performs exactly three versioned REST requests and pins the snapshot", async () => {
    const fetchMock = successfulSnapshotFetch();
    const signal = new AbortController().signal;

    const snapshot = await fetchRepositorySnapshot(ref, signal, fetchMock);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/owner/repo",
      "https://api.github.com/repos/owner/repo/commits/main",
      `https://api.github.com/repos/owner/repo/git/trees/${"b".repeat(40)}?recursive=1`,
    ]);

    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        signal,
      });
    }

    expect(snapshot).toEqual({
      repository: {
        owner: "owner",
        repo: "repo",
        name: "repo",
        fullName: "owner/repo",
        url: "https://github.com/owner/repo",
        description: "A public fixture repository",
        defaultBranch: "main",
        archived: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
        pushedAt: "2026-08-01T12:00:00Z",
        size: 512,
        openIssuesCount: 3,
        topics: ["quality", "typescript"],
        licenseSpdxId: "MIT",
      },
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      entries: [
        {
          path: "README.md",
          mode: "100644",
          type: "blob",
          sha: "c".repeat(40),
          size: 128,
        },
        {
          path: "src",
          mode: "040000",
          type: "tree",
          sha: "d".repeat(40),
        },
        {
          path: "src/index.ts",
          mode: "100644",
          type: "blob",
          sha: "e".repeat(64),
          size: 256,
        },
      ],
      treeComplete: true,
      rateLimit: {
        remaining: 57,
        resetAt: new Date(1_786_500_060_000).toISOString(),
      },
    });
  });

  it("encodes a moving default branch as one URL segment", async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        jsonResponse({
          ...VALID_REPOSITORY_RESPONSE,
          default_branch: "release/v1 #ready",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(VALID_COMMIT_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(VALID_TREE_RESPONSE));

    await fetchRepositorySnapshot(ref, new AbortController().signal, fetchMock);

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.github.com/repos/owner/repo/commits/release%2Fv1%20%23ready",
    );
  });

  it.each([
    ["repository array", 0, []],
    [
      "missing repository field",
      0,
      { ...VALID_REPOSITORY_RESPONSE, name: undefined },
    ],
    [
      "invalid repository timestamp",
      0,
      { ...VALID_REPOSITORY_RESPONSE, pushed_at: "later" },
    ],
    [
      "impossible repository timestamp",
      0,
      { ...VALID_REPOSITORY_RESPONSE, pushed_at: "2026-02-31T00:00:00Z" },
    ],
    ["negative repository size", 0, { ...VALID_REPOSITORY_RESPONSE, size: -1 }],
    [
      "non-finite issue count",
      0,
      {
        ...VALID_REPOSITORY_RESPONSE,
        open_issues_count: Number.POSITIVE_INFINITY,
      },
    ],
    ["invalid commit SHA", 1, { ...VALID_COMMIT_RESPONSE, sha: "abc" }],
    [
      "invalid tree SHA",
      1,
      { ...VALID_COMMIT_RESPONSE, commit: { tree: { sha: "g".repeat(40) } } },
    ],
    ["tree array response", 2, []],
    [
      "tree with bad type",
      2,
      {
        ...VALID_TREE_RESPONSE,
        tree: [{ ...VALID_TREE_RESPONSE.tree[0], type: "commit" }],
      },
    ],
    [
      "tree with negative size",
      2,
      {
        ...VALID_TREE_RESPONSE,
        tree: [{ ...VALID_TREE_RESPONSE.tree[0], size: -1 }],
      },
    ],
    [
      "tree with non-finite size",
      2,
      {
        ...VALID_TREE_RESPONSE,
        tree: [{ ...VALID_TREE_RESPONSE.tree[0], size: Number.NaN }],
      },
    ],
    [
      "tree with missing blob size",
      2,
      {
        ...VALID_TREE_RESPONSE,
        tree: [
          { path: "a.ts", mode: "100644", type: "blob", sha: "c".repeat(40) },
        ],
      },
    ],
    [
      "tree with malformed mode",
      2,
      {
        ...VALID_TREE_RESPONSE,
        tree: [{ ...VALID_TREE_RESPONSE.tree[0], mode: "ordinary" }],
      },
    ],
  ])("rejects hostile %s", async (_label, failingIndex, invalidBody) => {
    const responses = [
      VALID_REPOSITORY_RESPONSE,
      VALID_COMMIT_RESPONSE,
      VALID_TREE_RESPONSE,
    ];
    responses[failingIndex] = invalidBody as never;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(responses[0]))
      .mockResolvedValueOnce(jsonResponse(responses[1]))
      .mockResolvedValueOnce(jsonResponse(responses[2]));

    await expect(
      fetchRepositorySnapshot(ref, new AbortController().signal, fetchMock),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("rejects malformed JSON as an invalid response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{", {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      fetchRepositorySnapshot(ref, new AbortController().signal, fetchMock),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, "not-found"],
    [409, "empty"],
  ])("maps status %s without exposing a remote body", async (status, kind) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ message: "SECRET remote explanation" }, { status }),
      );

    const error = await fetchRepositorySnapshot(
      ref,
      new AbortController().signal,
      fetchMock,
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind, status });
    expect(String(error)).not.toContain("SECRET");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429])(
    "maps rate status %s and validates the reset header",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { message: "rate body" },
            { status },
            { reset: "1786500060" },
          ),
        );

      await expect(
        fetchRepositorySnapshot(ref, new AbortController().signal, fetchMock),
      ).rejects.toMatchObject({
        kind: "rate-limit",
        status,
        resetAt: new Date(1_786_500_060_000).toISOString(),
      });
    },
  );

  it("drops an invalid rate reset instead of manufacturing a date", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({}, { status: 429 }, { reset: "Infinity" }),
      );

    const error = await fetchRepositorySnapshot(
      ref,
      new AbortController().signal,
      fetchMock,
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ kind: "rate-limit", status: 429 });
    expect(error).not.toHaveProperty("resetAt", expect.any(String));
  });

  it("maps other API statuses without reading or leaking the body", async () => {
    const response = jsonResponse(
      { message: "SECRET server body" },
      { status: 500 },
    );
    const jsonSpy = vi.spyOn(response, "json");
    const fetchMock = vi.fn().mockResolvedValue(response);

    const error = await fetchRepositorySnapshot(
      ref,
      new AbortController().signal,
      fetchMock,
    ).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: "api", status: 500 });
    expect(String(error)).not.toContain("SECRET");
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("maps a transport failure to a typed network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));

    await expect(
      fetchRepositorySnapshot(ref, new AbortController().signal, fetchMock),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("preserves a caller abort reason instead of wrapping it", async () => {
    const controller = new AbortController();
    const reason = new DOMException("user-cancelled", "AbortError");
    controller.abort(reason);
    const fetchMock = vi.fn().mockRejectedValue(reason);

    await expect(
      fetchRepositorySnapshot(ref, controller.signal, fetchMock),
    ).rejects.toBe(reason);
  });
});

describe("fetchRawTextFile", () => {
  it("constructs an immutable URL from components and returns fatal UTF-8 text", async () => {
    const fetchMock = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(rawResponse([new TextEncoder().encode("héllo\n")]));
    const signal = new AbortController().signal;

    const result = await fetchRawTextFile(
      {
        ref: { owner: "owner#one", repo: "repo%one" },
        commitSha,
        path: "src/a file#1.ts",
        declaredSize: 7,
      },
      signal,
      fetchMock,
    );

    const rawCall = fetchMock.mock.calls[0];
    expect(rawCall?.[0]).toBe(
      `https://raw.githubusercontent.com/owner%23one/repo%25one/${commitSha}/src/a%20file%231.ts`,
    );
    expect(rawCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      path: "src/a file#1.ts",
      text: "héllo\n",
      bytes: 7,
    });
  });

  it("rejects a declared oversize before any request", async () => {
    const fetchMock = vi.fn<FetchImplementation>();

    await expect(
      fetchRawTextFile(
        { ref, commitSha, path: "large.ts", declaredSize: 262_145 },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "file-limit" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid repository component before any raw request", async () => {
    const fetchMock = vi.fn<FetchImplementation>();

    await expect(
      fetchRawTextFile(
        {
          ref: { owner: "owner space", repo: "repo" },
          commitSha,
          path: "index.ts",
          declaredSize: 1,
        },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized Content-Length before streaming", async () => {
    const response = rawResponse([new Uint8Array([1])], {
      headers: { "Content-Length": "262145" },
    });
    const fetchMock = vi.fn().mockResolvedValue(response);

    await expect(
      fetchRawTextFile(
        { ref, commitSha, path: "large.ts", declaredSize: 1 },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "file-limit" });
  });

  it("cancels a stream when accumulated bytes cross 256 KiB", async () => {
    const cancel = vi.fn();
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          return;
        }

        sent = true;
        controller.enqueue(new Uint8Array(262_145));
      },
      cancel,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));

    await expect(
      fetchRawTextFile(
        { ref, commitSha, path: "large.ts", declaredSize: 1 },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "file-limit" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects invalid UTF-8 rather than replacing bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(rawResponse([new Uint8Array([0xc3, 0x28])]));

    await expect(
      fetchRawTextFile(
        { ref, commitSha, path: "invalid.ts", declaredSize: 2 },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "invalid-text" });
  });

  it("maps a raw stream read failure to a typed network error", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new TypeError("stream failed"));
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));

    await expect(
      fetchRawTextFile(
        { ref, commitSha, path: "broken.ts", declaredSize: 1 },
        new AbortController().signal,
        fetchMock,
      ),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("times out a raw request after 15 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<FetchImplementation>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const reason = init.signal?.reason as unknown;
            reject(reason instanceof Error ? reason : new Error("aborted"));
          },
          { once: true },
        );
      });
    });
    const pending = fetchRawTextFile(
      { ref, commitSha, path: "slow.ts", declaredSize: 1 },
      new AbortController().signal,
      fetchMock,
    );
    const expectation = expect(pending).rejects.toMatchObject({
      kind: "network",
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });

  it("preserves a caller abort during a raw request", async () => {
    const controller = new AbortController();
    const reason = new DOMException("cancelled", "AbortError");
    const fetchMock = vi.fn<FetchImplementation>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const abortReason = init.signal?.reason as unknown;
            reject(
              abortReason instanceof Error ? abortReason : new Error("aborted"),
            );
          },
          { once: true },
        );
      });
    });
    const pending = fetchRawTextFile(
      { ref, commitSha, path: "slow.ts", declaredSize: 1 },
      controller.signal,
      fetchMock,
    );

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });
});
