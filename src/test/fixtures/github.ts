export const VALID_REPOSITORY_RESPONSE = {
  name: "repo",
  full_name: "owner/repo",
  html_url: "https://github.com/owner/repo",
  description: "A public fixture repository",
  default_branch: "main",
  archived: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-08-01T12:00:00Z",
  pushed_at: "2026-08-01T12:00:00Z",
  size: 512,
  open_issues_count: 3,
  topics: ["quality", "typescript"],
  license: { spdx_id: "MIT" },
} as const;

export const VALID_COMMIT_RESPONSE = {
  sha: "a".repeat(40),
  commit: {
    tree: {
      sha: "b".repeat(40),
    },
  },
} as const;

export const VALID_TREE_RESPONSE = {
  sha: "b".repeat(40),
  truncated: false,
  tree: [
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
} as const;
