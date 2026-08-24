import { describe, expect, it, vi } from "vitest";

import { VERIFIED_GITHUB_SNAPSHOT } from "../test/github-fixtures.js";
import { ServerGitHubError } from "../github/model.js";
import {
  AlternativeShortlistService,
  buildAlternativeQueries,
  selectAlternativeCandidates,
} from "./alternatives.js";

describe("alternative discovery", () => {
  it("builds at most three conservative deterministic queries", () => {
    const queries = buildAlternativeQueries(VERIFIED_GITHUB_SNAPSHOT, {
      blocks: [
        {
          kind: "readme",
          path: "README.md",
          heading: "CLI tool",
          text: "A TypeScript command line quality analyzer",
          startLine: 1,
          endLine: 2,
          trust: "repository-authored",
        },
      ],
      complete: true,
    });
    expect(queries).toEqual(
      [...queries].sort((a, b) => a.localeCompare(b, "en")),
    );
    expect(queries.length).toBeLessThanOrEqual(3);
    expect(queries.every((query) => /^[\p{L}\p{N} -]+$/u.test(query))).toBe(
      true,
    );
    expect(Object.isFrozen(queries)).toBe(true);
  });

  it("filters source, forks, archived, and irrelevant results before relevance-first sorting", () => {
    const candidates = selectAlternativeCandidates(VERIFIED_GITHUB_SNAPSHOT, [
      {
        query: "quality typescript",
        candidates: [
          candidate("owner", "repo", 99_999, ["quality"]),
          {
            ...candidate("forker", "repo-fork", 50_000, ["quality"]),
            fork: true,
          },
          {
            ...candidate("old", "archived", 40_000, ["quality"]),
            archived: true,
          },
          candidate("irrelevant", "thing", 30_000, ["music"]),
          candidate("lower", "relevant", 1, ["quality", "typescript"]),
          candidate("higher", "popular", 10_000, ["quality"]),
        ],
      },
    ]);
    expect(candidates.map((item) => item.repository.fullName)).toEqual([
      "lower/relevant",
      "higher/popular",
    ]);
  });

  it("revalidates selected repositories directly and caches the verified shortlist for 24 hours", async () => {
    let now = Date.parse("2026-08-23T00:00:00Z");
    const signal = new AbortController().signal;
    const client = {
      fetchAlternatives: vi.fn().mockResolvedValue([
        {
          query: "quality",
          candidates: [candidate("sample", "alternative", 5, ["quality"])],
        },
      ]),
      fetchRepositoryFacts: vi.fn().mockResolvedValue({
        ...VERIFIED_GITHUB_SNAPSHOT.repository,
        owner: "sample",
        repo: "alternative",
        fullName: "sample/alternative",
      }),
    };
    const service = new AlternativeShortlistService(client, () => now);

    const first = await service.getShortlist(
      VERIFIED_GITHUB_SNAPSHOT,
      { blocks: [], complete: true },
      "gho_user",
      signal,
    );
    const second = await service.getShortlist(
      VERIFIED_GITHUB_SNAPSHOT,
      { blocks: [], complete: true },
      "gho_user",
      signal,
    );
    expect(first).toEqual(second);
    expect(first[0]?.starsCount).toBe(
      VERIFIED_GITHUB_SNAPSHOT.repository.starsCount,
    );
    expect(client.fetchRepositoryFacts).toHaveBeenCalledWith(
      { owner: "sample", repo: "alternative" },
      "gho_user",
      signal,
    );
    expect(client.fetchAlternatives).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(first)).toBe(true);

    now += 24 * 60 * 60 * 1_000 + 1;
    await service.getShortlist(
      VERIFIED_GITHUB_SNAPSHOT,
      { blocks: [], complete: true },
      "gho_user",
      new AbortController().signal,
    );
    expect(client.fetchAlternatives).toHaveBeenCalledTimes(2);
  });

  it("drops a candidate when direct revalidation is archived or no longer relevant", async () => {
    const client = {
      fetchAlternatives: vi.fn().mockResolvedValue([
        {
          query: "quality",
          candidates: [candidate("sample", "alternative", 5, ["quality"])],
        },
      ]),
      fetchRepositoryFacts: vi.fn().mockResolvedValue({
        ...VERIFIED_GITHUB_SNAPSHOT.repository,
        owner: "sample",
        repo: "alternative",
        fullName: "sample/alternative",
        description: "A music player",
        topics: ["music"],
      }),
    };
    await expect(
      new AlternativeShortlistService(client).getShortlist(
        VERIFIED_GITHUB_SNAPSHOT,
        { blocks: [], complete: true },
        "gho_user",
        new AbortController().signal,
      ),
    ).resolves.toEqual([]);
  });

  it("drops and may negatively cache only a directly revalidated not-found candidate", async () => {
    const client = {
      fetchAlternatives: vi.fn().mockResolvedValue([
        {
          query: "quality",
          candidates: [candidate("gone", "repository", 5, ["quality"])],
        },
      ]),
      fetchRepositoryFacts: vi
        .fn()
        .mockRejectedValue(new ServerGitHubError("not-found", 404)),
    };
    const service = new AlternativeShortlistService(client);
    const request = () =>
      service.getShortlist(
        VERIFIED_GITHUB_SNAPSHOT,
        { blocks: [], complete: true },
        "gho_user",
        new AbortController().signal,
      );
    await expect(request()).resolves.toEqual([]);
    await expect(request()).resolves.toEqual([]);
    expect(client.fetchAlternatives).toHaveBeenCalledTimes(1);
  });

  it.each(["rate-limit", "network", "timeout", "invalid-response"] as const)(
    "propagates %s revalidation failures and never negative-caches them",
    async (kind) => {
      const client = {
        fetchAlternatives: vi.fn().mockResolvedValue([
          {
            query: "quality",
            candidates: [candidate("sample", "alternative", 5, ["quality"])],
          },
        ]),
        fetchRepositoryFacts: vi
          .fn()
          .mockRejectedValueOnce(new ServerGitHubError(kind))
          .mockResolvedValue({
            ...VERIFIED_GITHUB_SNAPSHOT.repository,
            owner: "sample",
            repo: "alternative",
            fullName: "sample/alternative",
          }),
      };
      const service = new AlternativeShortlistService(client);
      const request = () =>
        service.getShortlist(
          VERIFIED_GITHUB_SNAPSHOT,
          { blocks: [], complete: true },
          "gho_user",
          new AbortController().signal,
        );

      await expect(request()).rejects.toMatchObject({ kind });
      await expect(request()).resolves.toHaveLength(1);
      expect(client.fetchAlternatives).toHaveBeenCalledTimes(2);
    },
  );
});

function candidate(
  owner: string,
  repo: string,
  starsCount: number,
  topics: string[],
) {
  return {
    repository: { owner, repo, fullName: `${owner}/${repo}` },
    description: `A ${topics.join(" ")} project`,
    topics,
    archived: false,
    fork: false,
    starsCount,
    forksCount: 1,
    openIssuesCount: 1,
    pushedAt: "2026-08-20T00:00:00Z",
    licenseSpdxId: "MIT",
  };
}
