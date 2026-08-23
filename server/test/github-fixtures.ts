import type { VerifiedRepositorySnapshot } from "../github/model.js";

export const GITHUB_FIXTURE_SHA = "a".repeat(40);
export const GITHUB_FIXTURE_TREE_SHA = "b".repeat(40);

export const GITHUB_REPOSITORY_RESPONSE = {
  name: "repo",
  full_name: "owner/repo",
  owner: { login: "owner" },
  private: false,
  description: "A public fixture repository",
  topics: ["quality", "typescript"],
  homepage: "https://example.test/project",
  archived: false,
  default_branch: "main",
  pushed_at: "2026-08-01T12:00:00Z",
  stargazers_count: 1_284,
  subscribers_count: 37,
  forks_count: 146,
  open_issues_count: 3,
  license: { spdx_id: "MIT" },
} as const;

export const GITHUB_COMMIT_RESPONSE = {
  sha: GITHUB_FIXTURE_SHA,
  commit: { tree: { sha: GITHUB_FIXTURE_TREE_SHA } },
} as const;

export const GITHUB_TREE_RESPONSE = {
  sha: GITHUB_FIXTURE_TREE_SHA,
  truncated: false,
  tree: [
    {
      path: "README.md",
      mode: "100644",
      type: "blob",
      sha: "c".repeat(40),
      size: 6,
    },
    {
      path: "package.json",
      mode: "100644",
      type: "blob",
      sha: "d".repeat(40),
      size: 3,
    },
    {
      path: "src",
      mode: "040000",
      type: "tree",
      sha: "e".repeat(40),
    },
  ],
} as const;

export const VERIFIED_GITHUB_SNAPSHOT: VerifiedRepositorySnapshot = {
  repository: {
    owner: "owner",
    repo: "repo",
    fullName: "owner/repo",
    description: "A public fixture repository",
    topics: ["quality", "typescript"],
    homepage: "https://example.test/project",
    archived: false,
    defaultBranch: "main",
    pushedAt: "2026-08-01T12:00:00Z",
    starsCount: 1_284,
    watchersCount: 37,
    forksCount: 146,
    openIssuesCount: 3,
    licenseSpdxId: "MIT",
  },
  commitSha: GITHUB_FIXTURE_SHA,
  treeSha: GITHUB_FIXTURE_TREE_SHA,
  files: [
    { path: "README.md", mode: "100644", sha: "c".repeat(40), size: 6 },
    { path: "package.json", mode: "100644", sha: "d".repeat(40), size: 3 },
  ],
  treeComplete: true,
};

export const GITHUB_RELEASE_RESPONSE = [
  {
    id: 10,
    url: "https://api.github.com/repos/owner/repo/releases/10",
    tag_name: "v1.0.0",
    name: "Version 1.0.0",
    draft: false,
    prerelease: false,
    published_at: "2026-08-10T00:00:00Z",
  },
] as const;

export const GITHUB_ACTIVITY_RESPONSE = [
  {
    id: "event-1",
    type: "PushEvent",
    repo: { name: "owner/repo" },
    created_at: "2026-08-20T00:00:00Z",
  },
  {
    id: "event-2",
    type: "IssuesEvent",
    repo: { name: "owner/repo" },
    created_at: "2026-08-19T00:00:00Z",
  },
] as const;

export const GITHUB_SEARCH_RESPONSE = {
  total_count: 1,
  incomplete_results: false,
  items: [
    {
      name: "alternative",
      full_name: "sample/alternative",
      owner: { login: "sample" },
      private: false,
      description: "A comparable quality tool",
      topics: ["quality"],
      archived: false,
      fork: false,
      stargazers_count: 42,
      forks_count: 5,
      open_issues_count: 2,
      pushed_at: "2026-08-18T00:00:00Z",
      license: { spdx_id: "Apache-2.0" },
    },
  ],
} as const;
