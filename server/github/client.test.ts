import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GITHUB_ACTIVITY_RESPONSE,
  GITHUB_COMMIT_RESPONSE,
  GITHUB_FIXTURE_SHA,
  GITHUB_FIXTURE_TREE_SHA,
  GITHUB_RELEASE_RESPONSE,
  GITHUB_REPOSITORY_RESPONSE,
  GITHUB_SEARCH_RESPONSE,
  GITHUB_TREE_RESPONSE,
  VERIFIED_GITHUB_SNAPSHOT,
} from "../test/github-fixtures.js";
import { ServerGitHubClient, selectEvidenceFiles } from "./client.js";
import { GITHUB_LIMITS } from "./model.js";
import type { ServerFetch, VerifiedRepositorySnapshot } from "./model.js";

const request = {
  repository: { owner: "owner", repo: "repo", commitSha: GITHUB_FIXTURE_SHA },
  language: "en",
} as const;

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), init);
}

function byteResponse(bytes: Uint8Array, init: ResponseInit = {}): Response {
  return new Response(bytes, init);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ServerGitHubClient.verifySnapshot", () => {
  it("verifies the requested commit through exactly three fixed authenticated endpoints", async () => {
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValueOnce(jsonResponse(GITHUB_REPOSITORY_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(GITHUB_COMMIT_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(GITHUB_TREE_RESPONSE));
    const signal = new AbortController().signal;
    const client = new ServerGitHubClient({ fetch: fetchMock });

    const snapshot = await client.verifySnapshot(request, "gho_user", signal);

    expect(snapshot.commitSha).toBe(GITHUB_FIXTURE_SHA);
    expect(snapshot.treeSha).toBe(GITHUB_FIXTURE_TREE_SHA);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/owner/repo",
      `https://api.github.com/repos/owner/repo/commits/${GITHUB_FIXTURE_SHA}`,
      `https://api.github.com/repos/owner/repo/git/trees/${GITHUB_FIXTURE_TREE_SHA}?recursive=1`,
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer gho_user",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("maps a pending request to timeout at exactly 15 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<ServerFetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(new Error("request aborted"));
            },
            {
              once: true,
            },
          );
        }),
    );
    const promise = new ServerGitHubClient({ fetch: fetchMock }).verifySnapshot(
      request,
      "gho_user",
      new AbortController().signal,
    );
    const rejected = expect(promise).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(GITHUB_LIMITS.requestTimeoutMs - 1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
  });

  it("times out even when an injected fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<ServerFetch>(() => new Promise(() => undefined));
    const promise = new ServerGitHubClient({ fetch: fetchMock }).verifySnapshot(
      request,
      "gho_user",
      new AbortController().signal,
    );
    const rejected = expect(promise).rejects.toMatchObject({ kind: "timeout" });

    await vi.advanceTimersByTimeAsync(GITHUB_LIMITS.requestTimeoutMs);
    await rejected;
  });

  it("rejects redirected responses without reading their bodies", async () => {
    const response = jsonResponse(GITHUB_REPOSITORY_RESPONSE);
    Object.defineProperty(response, "redirected", { value: true });
    const text = vi.spyOn(response, "text");
    const fetchMock = vi.fn<ServerFetch>().mockResolvedValue(response);
    await expect(
      new ServerGitHubClient({ fetch: fetchMock }).verifySnapshot(
        request,
        "gho_user",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    expect(text).not.toHaveBeenCalled();
  });

  it("maps provider failures without retaining hostile response prose", async () => {
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValue(
        jsonResponse({ message: "SECRET provider text" }, { status: 500 }),
      );
    const error = await new ServerGitHubClient({ fetch: fetchMock })
      .verifySnapshot(request, "gho_user", new AbortController().signal)
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ kind: "network", status: 500 });
    expect(String(error)).not.toContain("SECRET");
  });
});

describe("ServerGitHubClient.fetchEvidenceFiles", () => {
  it("uses immutable encoded raw URLs and fatal UTF-8 decoding", async () => {
    const snapshot: VerifiedRepositorySnapshot = {
      ...VERIFIED_GITHUB_SNAPSHOT,
      files: [
        {
          path: "docs/a file#.md",
          sha: "f".repeat(40),
          size: 2,
          mode: "100644",
        },
      ],
    };
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValue(byteResponse(new TextEncoder().encode("ok")));
    const files = await new ServerGitHubClient({
      fetch: fetchMock,
    }).fetchEvidenceFiles(snapshot, "gho_user", new AbortController().signal);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://raw.githubusercontent.com/owner/repo/${GITHUB_FIXTURE_SHA}/docs/a%20file%23.md`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: {},
    });
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1]?.headers)).not.toContain(
      "gho_user",
    );
    expect(files).toEqual([
      { path: "docs/a file#.md", text: "ok", bytes: 2, kind: "documentation" },
    ]);

    fetchMock.mockResolvedValueOnce(byteResponse(new Uint8Array([0xc3, 0x28])));
    await expect(
      new ServerGitHubClient({ fetch: fetchMock }).fetchEvidenceFiles(
        snapshot,
        "gho_user",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("caps selection at 32 files, 256 KiB each, and 1 MiB aggregate", () => {
    const files: VerifiedRepositorySnapshot["files"] = Array.from(
      { length: 50 },
      (_, index) => ({
        path: `docs/${String(index).padStart(2, "0")}.md`,
        sha: (index % 10).toString().repeat(40),
        size: 32 * 1024,
        mode: "100644" as const,
      }),
    );
    files.push({
      path: "docs/oversized.md",
      sha: "f".repeat(40),
      size: GITHUB_LIMITS.fileBytes + 1,
      mode: "100644",
    });
    const selected = selectEvidenceFiles({
      ...VERIFIED_GITHUB_SNAPSHOT,
      files,
    });
    expect(selected).toHaveLength(32);
    expect(selected.reduce((sum, file) => sum + file.size, 0)).toBe(
      GITHUB_LIMITS.documentationBytes,
    );
    expect(selected.some((file) => file.path === "docs/oversized.md")).toBe(
      false,
    );
  });

  it("never performs more than six raw reads concurrently", async () => {
    const snapshot: VerifiedRepositorySnapshot = {
      ...VERIFIED_GITHUB_SNAPSHOT,
      files: Array.from({ length: 12 }, (_, index) => ({
        path: `docs/${String(index)}.md`,
        sha: (index % 10).toString().repeat(40),
        size: 1,
        mode: "100644" as const,
      })),
    };
    let active = 0;
    let maximum = 0;
    const fetchMock = vi.fn<ServerFetch>(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return byteResponse(new Uint8Array([0x61]));
    });
    await new ServerGitHubClient({ fetch: fetchMock }).fetchEvidenceFiles(
      snapshot,
      "gho_user",
      new AbortController().signal,
    );
    expect(maximum).toBe(6);
  });

  it("rejects an oversized streaming body even without Content-Length", async () => {
    const snapshot: VerifiedRepositorySnapshot = {
      ...VERIFIED_GITHUB_SNAPSHOT,
      files: [
        {
          path: "docs/large.md",
          sha: "f".repeat(40),
          size: GITHUB_LIMITS.fileBytes,
          mode: "100644",
        },
      ],
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(GITHUB_LIMITS.fileBytes + 1));
      },
    });
    await expect(
      new ServerGitHubClient({
        fetch: vi.fn().mockResolvedValue(new Response(body)),
      }).fetchEvidenceFiles(snapshot, "gho_user", new AbortController().signal),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});

describe("fixed release, activity, and alternative methods", () => {
  it("uses fixed repository endpoints and an injected acquisition clock", async () => {
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValueOnce(jsonResponse(GITHUB_RELEASE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse(GITHUB_ACTIVITY_RESPONSE));
    const client = new ServerGitHubClient({
      fetch: fetchMock,
      now: () => new Date("2026-08-23T00:00:00Z"),
    });
    await expect(
      client.fetchReleaseSummary(
        VERIFIED_GITHUB_SNAPSHOT,
        "gho_user",
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ acquiredAt: "2026-08-23T00:00:00.000Z" });
    await expect(
      client.fetchRecentActivity(
        VERIFIED_GITHUB_SNAPSHOT,
        "gho_user",
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ eventsScanned: 2 });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/owner/repo/releases?per_page=20&page=1",
      "https://api.github.com/repos/owner/repo/events?per_page=100&page=1",
    ]);
  });

  it("revalidates shortlisted repository facts through the fixed endpoint", async () => {
    const response = {
      ...GITHUB_REPOSITORY_RESPONSE,
      full_name: "sample/alternative",
      name: "alternative",
      owner: { login: "sample" },
    };
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValue(jsonResponse(response));
    const facts = await new ServerGitHubClient({
      fetch: fetchMock,
    }).fetchRepositoryFacts(
      { owner: "sample", repo: "alternative" },
      "gho_user",
      new AbortController().signal,
    );

    expect(facts.watchersCount).toBe(37);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/repos/sample/alternative",
    );
  });

  it("treats a missing release endpoint as observed no release data", async () => {
    const client = new ServerGitHubClient({
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
      now: () => new Date("2026-08-23T00:00:00Z"),
    });
    await expect(
      client.fetchReleaseSummary(
        VERIFIED_GITHUB_SNAPSHOT,
        "gho_user",
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      acquiredAt: "2026-08-23T00:00:00.000Z",
      endpointAvailable: false,
      releases: [],
    });
  });

  it("adds only frozen search qualifiers and rejects authored syntax", async () => {
    const fetchMock = vi
      .fn<ServerFetch>()
      .mockResolvedValue(jsonResponse(GITHUB_SEARCH_RESPONSE));
    const client = new ServerGitHubClient({ fetch: fetchMock });
    await expect(
      client.fetchAlternatives(
        ["typescript quality"],
        "gho_user",
        new AbortController().signal,
      ),
    ).resolves.toMatchObject([{ query: "typescript quality" }]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/search/repositories?q=typescript%20quality%20archived%3Afalse%20fork%3Afalse%20in%3Aname%2Cdescription&sort=stars&order=desc&per_page=10&page=1",
    );
    await expect(
      client.fetchAlternatives(
        ["topic:quality"],
        "gho_user",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
