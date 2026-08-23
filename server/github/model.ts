import type { DeepAnalysisRequest } from "../../src/features/deep-analysis/model.js";

export const GITHUB_LIMITS = Object.freeze({
  requestTimeoutMs: 15_000,
  readConcurrency: 6,
  evidenceFiles: 32,
  fileBytes: 256 * 1024,
  documentationBytes: 1024 * 1024,
  treeEntries: 100_000,
  releasePages: 2,
  releasesPerPage: 20,
  activityPages: 2,
  activityPerPage: 100,
  alternativeQueries: 3,
  alternativesPerQuery: 10,
} as const);

export type GitHubFailureKind =
  "not-found" | "rate-limit" | "network" | "timeout" | "invalid-response";

/** A deliberately body-free failure safe to map to a public application error. */
export class ServerGitHubError extends Error {
  override readonly name = "ServerGitHubError";

  constructor(
    public readonly kind: GitHubFailureKind,
    public readonly status?: number,
    public readonly resetAt?: string,
  ) {
    super(kind);
  }
}

export interface VerifiedRepositorySnapshot {
  repository: {
    owner: string;
    repo: string;
    fullName: string;
    description: string | null;
    topics: string[];
    homepage: string | null;
    archived: boolean;
    defaultBranch: string;
    pushedAt: string;
    starsCount: number;
    watchersCount: number;
    forksCount: number;
    openIssuesCount: number;
    licenseSpdxId: string | null;
  };
  commitSha: string;
  treeSha: string;
  files: Array<{
    path: string;
    sha: string;
    size: number;
    mode: "100644" | "100755";
  }>;
  treeComplete: boolean;
}

export interface EvidenceTextFile {
  path: string;
  text: string;
  bytes: number;
  kind: "readme" | "documentation" | "manifest";
}

export interface GitHubReleaseFact {
  id: number;
  tagName: string;
  name: string | null;
  publishedAt: string;
  url: string;
  prerelease: boolean;
}

export interface ReleaseSummary {
  acquiredAt: string;
  endpointAvailable: boolean;
  releases: GitHubReleaseFact[];
}

export type GitHubActivityKind =
  "push" | "issue" | "pull-request" | "release" | "other";

export interface GitHubActivityEvent {
  id: string;
  kind: GitHubActivityKind;
  occurredAt: string;
}

export interface RecentActivitySummary {
  acquiredAt: string;
  eventsScanned: number;
  latestActivityAt: string | null;
  counts: Record<GitHubActivityKind, number>;
}

export interface GitHubAlternativeCandidate {
  repository: { owner: string; repo: string; fullName: string };
  description: string | null;
  topics: string[];
  archived: boolean;
  fork: boolean;
  starsCount: number;
  forksCount: number;
  openIssuesCount: number;
  pushedAt: string;
  licenseSpdxId: string | null;
}

export interface AlternativeSearchResult {
  query: string;
  candidates: GitHubAlternativeCandidate[];
}

export type ServerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type GitHubClock = () => Date;

export interface ServerGitHubClientOptions {
  fetch?: ServerFetch;
  now?: GitHubClock;
}

export type GitHubSnapshotRequest = DeepAnalysisRequest;

/** Detached data-only form returned after independently guarding a request. */
export interface ValidatedGitHubSnapshotRequest {
  repository: { owner: string; repo: string; commitSha: string };
  language: "en" | "zh-CN";
}
