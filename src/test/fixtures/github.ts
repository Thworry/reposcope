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
  stargazers_count: 1_284,
  subscribers_count: 37,
  forks_count: 146,
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

export const SELECTION_TREE_ENTRIES = [
  {
    path: "README.md",
    mode: "100644",
    type: "blob",
    sha: "1".repeat(40),
    size: 100,
  },
  {
    path: "package.json",
    mode: "100644",
    type: "blob",
    sha: "2".repeat(40),
    size: 100,
  },
  {
    path: "src/index.ts",
    mode: "100644",
    type: "blob",
    sha: "3".repeat(40),
    size: 100,
  },
  {
    path: "tests/core.test.ts",
    mode: "100644",
    type: "blob",
    sha: "4".repeat(40),
    size: 100,
  },
  {
    path: "src/core/a.ts",
    mode: "100644",
    type: "blob",
    sha: "5".repeat(40),
    size: 100,
  },
  {
    path: "src/core/b.ts",
    mode: "100644",
    type: "blob",
    sha: "6".repeat(40),
    size: 100,
  },
  {
    path: "src/data/a.ts",
    mode: "100644",
    type: "blob",
    sha: "7".repeat(40),
    size: 100,
  },
  {
    path: "src/data/b.ts",
    mode: "100644",
    type: "blob",
    sha: "8".repeat(40),
    size: 100,
  },
  {
    path: "src/ui/a.ts",
    mode: "100644",
    type: "blob",
    sha: "9".repeat(40),
    size: 100,
  },
  {
    path: "src/ui/b.ts",
    mode: "100644",
    type: "blob",
    sha: "a".repeat(40),
    size: 100,
  },
  {
    path: "docs/details.md",
    mode: "100644",
    type: "blob",
    sha: "b".repeat(40),
    size: 440,
  },
  {
    path: "server/main.go",
    mode: "100644",
    type: "blob",
    sha: "c".repeat(40),
    size: 120,
  },
  {
    path: "dist/app.js",
    mode: "100644",
    type: "blob",
    sha: "d".repeat(40),
    size: 100,
  },
  {
    path: "web/app.min.js",
    mode: "100644",
    type: "blob",
    sha: "e".repeat(40),
    size: 100,
  },
  {
    path: "assets/logo.png",
    mode: "100644",
    type: "blob",
    sha: "f".repeat(40),
    size: 100,
  },
  {
    path: "docs/huge.md",
    mode: "100644",
    type: "blob",
    sha: "0".repeat(40),
    size: 501,
  },
] as const;
