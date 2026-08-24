export interface RawRepositoryResponse {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  open_issues_count: number;
  topics: string[];
  license: { spdx_id: string | null } | null;
  stargazers_count: number;
  subscribers_count: number;
  forks_count: number;
}

export interface RawCommitResponse {
  sha: string;
  commit: {
    tree: {
      sha: string;
    };
  };
}

export interface RawBlobTreeEntry {
  path: string;
  mode: "100644" | "100755" | "120000";
  type: "blob";
  sha: string;
  size: number;
}

export interface RawDirectoryTreeEntry {
  path: string;
  mode: "040000";
  type: "tree";
  sha: string;
}

export type RawTreeEntry = RawBlobTreeEntry | RawDirectoryTreeEntry;

export interface RawTreeResponse {
  sha: string;
  truncated: boolean;
  tree: RawTreeEntry[];
}
