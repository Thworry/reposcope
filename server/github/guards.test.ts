import { describe, expect, it } from "vitest";

import {
  GITHUB_COMMIT_RESPONSE,
  GITHUB_FIXTURE_SHA,
  GITHUB_FIXTURE_TREE_SHA,
  GITHUB_REPOSITORY_RESPONSE,
  GITHUB_TREE_RESPONSE,
} from "../test/github-fixtures.js";
import {
  assertCanonicalTimestamp,
  assertDeepAnalysisRequest,
  guardCommitResponse,
  guardRepositoryResponse,
  guardTreeResponse,
} from "./guards.js";

describe("GitHub response guards", () => {
  it("accepts canonical repository, commit, and tree fixtures", () => {
    expect(
      guardRepositoryResponse(GITHUB_REPOSITORY_RESPONSE, {
        owner: "owner",
        repo: "repo",
      }),
    ).toMatchObject({ fullName: "owner/repo", watchersCount: 37 });
    expect(
      guardCommitResponse(GITHUB_COMMIT_RESPONSE, GITHUB_FIXTURE_SHA),
    ).toEqual({
      commitSha: GITHUB_FIXTURE_SHA,
      treeSha: GITHUB_FIXTURE_TREE_SHA,
    });
    expect(
      guardTreeResponse(GITHUB_TREE_RESPONSE, GITHUB_FIXTURE_TREE_SHA),
    ).toMatchObject({
      treeComplete: true,
      files: [{ path: "README.md" }, { path: "package.json" }],
    });
  });

  it("rejects a repository body for another public repository", () => {
    expect(() =>
      guardRepositoryResponse(
        { ...GITHUB_REPOSITORY_RESPONSE, full_name: "attacker/repo" },
        { owner: "owner", repo: "repo" },
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
  });

  it("rejects malformed or substituted commit SHAs", () => {
    expect(() =>
      guardCommitResponse(
        { ...GITHUB_COMMIT_RESPONSE, sha: "ABC" },
        GITHUB_FIXTURE_SHA,
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
    expect(() =>
      guardCommitResponse(
        { ...GITHUB_COMMIT_RESPONSE, sha: "f".repeat(40) },
        GITHUB_FIXTURE_SHA,
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
  });

  it.each([
    [
      "duplicate",
      [
        { ...GITHUB_TREE_RESPONSE.tree[0] },
        { ...GITHUB_TREE_RESPONSE.tree[0] },
      ],
    ],
    [
      "symlink",
      [
        {
          ...GITHUB_TREE_RESPONSE.tree[0],
          mode: "120000",
          path: "README-link",
        },
      ],
    ],
    [
      "submodule",
      [
        {
          ...GITHUB_TREE_RESPONSE.tree[0],
          mode: "160000",
          type: "commit",
          path: "vendor",
        },
      ],
    ],
    ["unsafe path", [{ ...GITHUB_TREE_RESPONSE.tree[0], path: "../secret" }]],
  ])("rejects a hostile %s tree", (_label, tree) => {
    expect(() =>
      guardTreeResponse(
        { ...GITHUB_TREE_RESPONSE, tree },
        GITHUB_FIXTURE_TREE_SHA,
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
  });

  it("retains explicitly incomplete tree coverage without inventing completeness", () => {
    expect(
      guardTreeResponse(
        { ...GITHUB_TREE_RESPONSE, truncated: true },
        GITHUB_FIXTURE_TREE_SHA,
      ).treeComplete,
    ).toBe(false);
  });

  it("uses own data properties and never invokes request accessors", () => {
    let reads = 0;
    const request = {
      repository: {
        owner: "owner",
        repo: "repo",
        commitSha: GITHUB_FIXTURE_SHA,
      },
      language: "en",
    };
    Object.defineProperty(request.repository, "owner", {
      enumerable: true,
      get() {
        reads += 1;
        return "owner";
      },
    });
    expect(() => assertDeepAnalysisRequest(request)).toThrow(
      expect.objectContaining({ kind: "invalid-response" }),
    );
    expect(reads).toBe(0);
  });

  it.each(["2026-02-31T00:00:00Z", "2026-08-01T12:00:00+00:00", "later"])(
    "rejects non-canonical timestamp %s",
    (timestamp) => {
      expect(() => assertCanonicalTimestamp(timestamp)).toThrow(
        expect.objectContaining({ kind: "invalid-response" }),
      );
    },
  );
});
