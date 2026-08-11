import type {
  RateLimitMetadata,
  RepoRef,
  RepositoryMetadata,
} from "../analysis/model";
import type { RawTreeEntry, RawTreeResponse } from "./raw-model";

export type { RawTreeEntry } from "./raw-model";

export type GitHubErrorKind =
  | "not-found"
  | "rate-limit"
  | "empty"
  | "network"
  | "api"
  | "invalid-response"
  | "file-limit"
  | "invalid-text";

export class GitHubApiError extends Error {
  override readonly name = "GitHubApiError";

  constructor(
    public readonly kind: GitHubErrorKind,
    public readonly status?: number,
    public readonly resetAt?: string,
  ) {
    super(kind);
  }
}

export interface RepositorySnapshot {
  repository: RepositoryMetadata;
  commitSha: string;
  treeSha: string;
  entries: RawTreeEntry[];
  treeComplete: boolean;
  rateLimit: RateLimitMetadata;
}

export interface RawTextInput {
  ref: RepoRef;
  commitSha: string;
  path: string;
  declaredSize: number;
}

export interface RawTextResult {
  path: string;
  text: string;
  bytes: number;
}

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface JsonResponse {
  payload: unknown;
  rateLimit: RateLimitMetadata;
}

const API_ROOT = "https://api.github.com/repos";
const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
} as const;
const MAX_RAW_BYTES = 262_144;
const RAW_TIMEOUT_MS = 15_000;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const MODE_PATTERN = /^[0-7]{6}$/u;
const TIMESTAMP_PATTERN =
  /^(?<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new GitHubApiError("invalid-response");
}

function hasControlOrLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (
      codeUnit <= 31 ||
      (codeUnit >= 127 && codeUnit <= 159) ||
      (codeUnit >= 0xd800 && codeUnit <= 0xdfff)
    ) {
      return true;
    }
  }

  return false;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  allowEmpty = false,
): string {
  const value = record[key];

  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    hasControlOrLoneSurrogate(value)
  ) {
    return invalidResponse();
  }

  return value;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || hasControlOrLoneSurrogate(value)) {
    return invalidResponse();
  }

  return value;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    return invalidResponse();
  }

  return value;
}

function readNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
): number {
  const value = record[key];

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return invalidResponse();
  }

  return value;
}

function assertTimestamp(value: string): string {
  const match = TIMESTAMP_PATTERN.exec(value);
  const seconds = match?.groups?.seconds;
  const fraction = match?.groups?.fraction ?? "";
  const parsed = Date.parse(value);

  if (
    seconds === undefined ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== `${seconds}.${fraction.padEnd(3, "0")}Z`
  ) {
    return invalidResponse();
  }

  return value;
}

function assertSha(value: string): string {
  if (!SHA_PATTERN.test(value)) {
    return invalidResponse();
  }

  return value;
}

function assertComponent(value: string): string {
  if (
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    /\s/u.test(value) ||
    hasControlOrLoneSurrogate(value)
  ) {
    throw new GitHubApiError("invalid-response");
  }

  return value;
}

function assertRawPath(path: string): string {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    hasControlOrLoneSurrogate(path)
  ) {
    throw new GitHubApiError("invalid-response");
  }

  const segments = path.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new GitHubApiError("invalid-response");
  }

  return path;
}

function guardRepository(
  value: unknown,
  ref: RepoRef,
): { normalized: RepositoryMetadata } {
  if (!isRecord(value)) {
    return invalidResponse();
  }

  const name = readString(value, "name");
  const fullName = readString(value, "full_name");
  readString(value, "html_url");
  const description = readNullableString(value, "description");
  const defaultBranch = readString(value, "default_branch");
  const archived = readBoolean(value, "archived");
  const createdAt = assertTimestamp(readString(value, "created_at"));
  const updatedAt = assertTimestamp(readString(value, "updated_at"));
  const pushedAt = assertTimestamp(readString(value, "pushed_at"));
  const size = readNonNegativeInteger(value, "size");
  const openIssuesCount = readNonNegativeInteger(value, "open_issues_count");
  const rawTopics = value.topics;

  if (
    !Array.isArray(rawTopics) ||
    rawTopics.some(
      (topic) =>
        typeof topic !== "string" ||
        topic.length === 0 ||
        hasControlOrLoneSurrogate(topic),
    )
  ) {
    return invalidResponse();
  }

  const topics: string[] = [];

  for (const topic of rawTopics) {
    if (typeof topic !== "string") {
      return invalidResponse();
    }

    topics.push(topic);
  }
  const rawLicense = value.license;
  let licenseSpdxId: string | null;

  if (rawLicense === null) {
    licenseSpdxId = null;
  } else if (isRecord(rawLicense)) {
    licenseSpdxId = readNullableString(rawLicense, "spdx_id");
  } else {
    return invalidResponse();
  }

  const owner = assertComponent(ref.owner);
  const repo = assertComponent(ref.repo);
  const normalized: RepositoryMetadata = {
    owner,
    repo,
    name,
    fullName,
    url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    description,
    defaultBranch,
    archived,
    createdAt,
    updatedAt,
    pushedAt,
    size,
    openIssuesCount,
    topics,
    licenseSpdxId,
  };

  return { normalized };
}

function guardCommit(value: unknown): { sha: string; treeSha: string } {
  if (!isRecord(value)) {
    return invalidResponse();
  }

  const sha = assertSha(readString(value, "sha"));
  const commit = value.commit;

  if (!isRecord(commit) || !isRecord(commit.tree)) {
    return invalidResponse();
  }

  return {
    sha,
    treeSha: assertSha(readString(commit.tree, "sha")),
  };
}

function guardTreeEntry(value: unknown): RawTreeEntry {
  if (!isRecord(value)) {
    return invalidResponse();
  }

  const path = readString(value, "path");
  const mode = readString(value, "mode");
  const type = readString(value, "type");
  const sha = assertSha(readString(value, "sha"));

  if (!MODE_PATTERN.test(mode)) {
    return invalidResponse();
  }

  if (type === "blob") {
    return {
      path,
      mode,
      type,
      sha,
      size: readNonNegativeInteger(value, "size"),
    };
  }

  if (type === "tree") {
    if (value.size !== undefined) {
      readNonNegativeInteger(value, "size");
    }

    return { path, mode, type, sha };
  }

  return invalidResponse();
}

function guardTree(value: unknown, expectedSha: string): RawTreeResponse {
  if (!isRecord(value)) {
    return invalidResponse();
  }

  const sha = assertSha(readString(value, "sha"));

  if (
    sha !== expectedSha ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.tree)
  ) {
    return invalidResponse();
  }

  return {
    sha,
    truncated: value.truncated,
    tree: value.tree.map(guardTreeEntry),
  };
}

function parseRateLimitReset(value: string | null): string | null {
  if (value === null || !/^\d+$/u.test(value)) {
    return null;
  }

  const seconds = Number(value);

  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    return null;
  }

  const milliseconds = seconds * 1000;

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function readRateLimit(headers: Headers): RateLimitMetadata {
  const rawRemaining = headers.get("x-ratelimit-remaining");
  const remaining =
    rawRemaining !== null && /^\d+$/u.test(rawRemaining)
      ? Number(rawRemaining)
      : null;

  return {
    remaining:
      remaining !== null && Number.isSafeInteger(remaining) ? remaining : null,
    resetAt: parseRateLimitReset(headers.get("x-ratelimit-reset")),
  };
}

function mergeRateLimits(
  samples: readonly RateLimitMetadata[],
): RateLimitMetadata {
  const remaining = samples
    .map((sample) => sample.remaining)
    .filter((value): value is number => value !== null);
  const resetTimes = samples
    .map((sample) => sample.resetAt)
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  return {
    remaining: remaining.length === 0 ? null : Math.min(...remaining),
    resetAt:
      resetTimes.length === 0
        ? null
        : new Date(Math.max(...resetTimes)).toISOString(),
  };
}

function throwForStatus(response: Response): never {
  const status = response.status;

  if (status === 404) {
    throw new GitHubApiError("not-found", status);
  }

  if (status === 409) {
    throw new GitHubApiError("empty", status);
  }

  if (status === 403 || status === 429) {
    const resetAt = parseRateLimitReset(
      response.headers.get("x-ratelimit-reset"),
    );

    throw new GitHubApiError(
      "rate-limit",
      status,
      resetAt === null ? undefined : resetAt,
    );
  }

  throw new GitHubApiError("api", status);
}

function preserveAbort(signal: AbortSignal): never {
  if (signal.aborted) {
    throw signal.reason;
  }

  throw new GitHubApiError("network");
}

async function requestJson(
  url: string,
  signal: AbortSignal,
  fetchImpl: FetchImplementation,
): Promise<JsonResponse> {
  signal.throwIfAborted();
  let response: Response;

  try {
    response = await fetchImpl(url, { headers: API_HEADERS, signal });
  } catch {
    return preserveAbort(signal);
  }

  if (!response.ok) {
    return throwForStatus(response);
  }

  let payload: unknown;

  try {
    payload = (await response.json()) as unknown;
  } catch {
    if (signal.aborted) {
      return preserveAbort(signal);
    }

    return invalidResponse();
  }

  return { payload, rateLimit: readRateLimit(response.headers) };
}

function repositoryUrl(ref: RepoRef): string {
  const owner = assertComponent(ref.owner);
  const repo = assertComponent(ref.repo);
  return `${API_ROOT}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export async function fetchRepositorySnapshot(
  ref: RepoRef,
  signal: AbortSignal,
  fetchImpl: FetchImplementation = fetch,
): Promise<RepositorySnapshot> {
  const baseUrl = repositoryUrl(ref);
  const rateSamples: RateLimitMetadata[] = [];
  const repositoryResult = await requestJson(baseUrl, signal, fetchImpl);
  rateSamples.push(repositoryResult.rateLimit);
  const repository = guardRepository(repositoryResult.payload, ref);
  const commitResult = await requestJson(
    `${baseUrl}/commits/${encodeURIComponent(repository.normalized.defaultBranch)}`,
    signal,
    fetchImpl,
  );
  rateSamples.push(commitResult.rateLimit);
  const commit = guardCommit(commitResult.payload);
  const treeResult = await requestJson(
    `${baseUrl}/git/trees/${encodeURIComponent(commit.treeSha)}?recursive=1`,
    signal,
    fetchImpl,
  );
  rateSamples.push(treeResult.rateLimit);
  const tree = guardTree(treeResult.payload, commit.treeSha);

  return {
    repository: repository.normalized,
    commitSha: commit.sha,
    treeSha: commit.treeSha,
    entries: tree.tree,
    treeComplete: !tree.truncated,
    rateLimit: mergeRateLimits(rateSamples),
  };
}

function parseContentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");

  if (raw === null) {
    return null;
  }

  if (!/^\d+$/u.test(raw)) {
    return invalidResponse();
  }

  const size = Number(raw);

  if (!Number.isSafeInteger(size)) {
    return invalidResponse();
  }

  return size;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const contentLength = parseContentLength(response.headers);

  if (contentLength !== null && contentLength > MAX_RAW_BYTES) {
    throw new GitHubApiError("file-limit");
  }

  if (response.body === null) {
    return invalidResponse();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  for (
    let result = await reader.read();
    !result.done;
    result = await reader.read()
  ) {
    bytes += result.value.byteLength;

    if (bytes > MAX_RAW_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size boundary remains authoritative even when cancellation fails.
      }

      throw new GitHubApiError("file-limit");
    }

    chunks.push(result.value);
  }

  const body = new Uint8Array(bytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function fetchRawTextFile(
  input: RawTextInput,
  signal: AbortSignal,
  fetchImpl: FetchImplementation = fetch,
): Promise<RawTextResult> {
  signal.throwIfAborted();

  if (
    !Number.isFinite(input.declaredSize) ||
    !Number.isSafeInteger(input.declaredSize) ||
    input.declaredSize < 0
  ) {
    throw new GitHubApiError("invalid-response");
  }

  if (input.declaredSize > MAX_RAW_BYTES) {
    throw new GitHubApiError("file-limit");
  }

  const owner = assertComponent(input.ref.owner);
  const repo = assertComponent(input.ref.repo);
  const commit = assertSha(input.commitSha);
  const path = assertRawPath(input.path);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commit}/${encodedPath}`;
  const timeoutController = new AbortController();
  const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
  const timeout = globalThis.setTimeout(() => {
    timeoutController.abort(new DOMException("raw-timeout", "TimeoutError"));
  }, RAW_TIMEOUT_MS);

  try {
    let response: Response;

    try {
      response = await fetchImpl(url, { signal: combinedSignal });
    } catch {
      if (signal.aborted) {
        throw signal.reason;
      }

      throw new GitHubApiError("network");
    }

    if (!response.ok) {
      throwForStatus(response);
    }

    let body: Uint8Array;

    try {
      body = await readBoundedBody(response);
    } catch (error) {
      if (signal.aborted) {
        throw signal.reason;
      }

      if (timeoutController.signal.aborted) {
        throw new GitHubApiError("network");
      }

      if (error instanceof GitHubApiError) {
        throw error;
      }

      throw new GitHubApiError("network");
    }

    let text: string;

    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      throw new GitHubApiError("invalid-text");
    }

    return { path, text, bytes: body.byteLength };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
