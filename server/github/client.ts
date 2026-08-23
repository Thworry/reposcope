import { buildRecentActivitySummary, buildReleaseSummary } from "./activity.js";
import {
  assertAlternativeQuery,
  assertDeepAnalysisRequest,
  assertRepositoryComponent,
  assertSnapshotInput,
  guardActivityPage,
  guardCommitResponse,
  guardReleasePage,
  guardRepositoryResponse,
  guardSearchResponse,
  guardTreeResponse,
} from "./guards.js";
import { GITHUB_LIMITS, ServerGitHubError } from "./model.js";
import type {
  AlternativeSearchResult,
  EvidenceTextFile,
  GitHubClock,
  GitHubSnapshotRequest,
  RecentActivitySummary,
  ReleaseSummary,
  ServerFetch,
  ServerGitHubClientOptions,
  VerifiedRepositorySnapshot,
} from "./model.js";

const API_ORIGIN = "https://api.github.com";
const RAW_ORIGIN = "https://raw.githubusercontent.com";
const API_VERSION = "2026-03-10";
const MAX_JSON_BYTES = Object.freeze({
  repository: 512 * 1024,
  commit: 256 * 1024,
  tree: 16 * 1024 * 1024,
  release: 2 * 1024 * 1024,
  activity: 4 * 1024 * 1024,
  search: 4 * 1024 * 1024,
});
const MANIFEST_NAMES = new Set([
  "package.json",
  "deno.json",
  "deno.jsonc",
  "pyproject.toml",
  "requirements.txt",
  "pipfile",
  "poetry.lock",
  "cargo.toml",
  "go.mod",
  "composer.json",
  "gemfile",
  "mix.exs",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "project.clj",
  "pubspec.yaml",
  "package.swift",
]);
const CONVENTIONAL_DOCUMENT_NAMES = new Set([
  "security.md",
  "security.rst",
  "contributing.md",
  "contributing.rst",
  "changelog.md",
  "changelog.rst",
  "changes.md",
  "history.md",
  "governance.md",
  "code_of_conduct.md",
  "code-of-conduct.md",
  "architecture.md",
  "license",
  "license.md",
  "license.txt",
  "copying",
  "copying.md",
  "notice",
  "notice.md",
  "authors",
  "authors.md",
  "maintainers.md",
  "support.md",
]);

interface SelectedFile {
  path: string;
  size: number;
  kind: EvidenceTextFile["kind"];
}

function invalidResponse(): never {
  throw new ServerGitHubError("invalid-response");
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function apiHeaders(token: string): Readonly<Record<string, string>> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
}

function rawHeaders(): Readonly<Record<string, string>> {
  return {};
}

function assertToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    !/^gho_[A-Za-z0-9_]+$/u.test(value) ||
    /[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
  ) {
    return invalidResponse();
  }
  return value;
}

function repositoryApiBase(repository: {
  owner: string;
  repo: string;
}): string {
  const owner = assertRepositoryComponent(repository.owner, "owner");
  const repo = assertRepositoryComponent(repository.repo, "repo");
  return `${API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function cancelBody(response: Response): void {
  if (response.body === null || response.body.locked) return;
  void response.body.cancel().catch(() => {
    // Boundary errors remain authoritative when best-effort cancellation fails.
  });
}

function rateReset(headers: Headers): string | undefined {
  const raw = headers.get("x-ratelimit-reset");
  if (raw === null || !/^\d+$/u.test(raw)) return undefined;
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return undefined;
  try {
    return new Date(seconds * 1_000).toISOString();
  } catch {
    return undefined;
  }
}

function statusError(response: Response): ServerGitHubError {
  if (response.status === 404) {
    return new ServerGitHubError("not-found", response.status);
  }
  if (response.status === 403 || response.status === 429) {
    return new ServerGitHubError(
      "rate-limit",
      response.status,
      rateReset(response.headers),
    );
  }
  if (response.status === 408 || response.status === 504) {
    return new ServerGitHubError("timeout", response.status);
  }
  if (response.status >= 500) {
    return new ServerGitHubError("network", response.status);
  }
  return new ServerGitHubError("invalid-response", response.status);
}

function parseContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  if (!/^\d+$/u.test(raw)) return invalidResponse();
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : invalidResponse();
}

function abortPromise(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let listener: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    listener = () => {
      // Caller cancellation is an opaque platform value and must be preserved.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(signal.reason);
    };
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
  });
  return {
    promise,
    dispose: () => {
      if (listener !== undefined) signal.removeEventListener("abort", listener);
    },
  };
}

async function readBoundedBody(
  response: Response,
  maximum: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let declared: number | null;
  try {
    declared = parseContentLength(response);
  } catch (error) {
    cancelBody(response);
    throw error;
  }
  if (declared !== null && declared > maximum) {
    cancelBody(response);
    return invalidResponse();
  }
  if (response.body === null) return invalidResponse();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const abort = abortPromise(signal);
      let result:
        { done: false; value: Uint8Array } | { done: true; value?: undefined };
      try {
        result = await Promise.race([reader.read(), abort.promise]);
      } finally {
        abort.dispose();
      }
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximum) {
        void reader.cancel().catch(() => {
          // The byte cap remains authoritative.
        });
        return invalidResponse();
      }
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {
      // Preserve the original cancellation or transport failure.
    });
    throw error;
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalidResponse();
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ServerGitHubError) throw error;
    return invalidResponse();
  }
}

function mapRequestFailure(
  error: unknown,
  callerSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): never {
  if (callerSignal.aborted) throw callerSignal.reason;
  if (timeoutSignal.aborted) throw new ServerGitHubError("timeout");
  if (error instanceof ServerGitHubError) throw error;
  throw new ServerGitHubError("network");
}

async function boundedRequest(
  fetchImpl: ServerFetch,
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal,
  maximumBytes: number,
): Promise<{ response: Response; bytes: Uint8Array }> {
  callerSignal.throwIfAborted();
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort(
      new DOMException("GitHub request timed out", "TimeoutError"),
    );
  }, GITHUB_LIMITS.requestTimeoutMs);
  const signal = AbortSignal.any([callerSignal, timeoutController.signal]);
  try {
    const abort = abortPromise(signal);
    let response: Response;
    try {
      response = await Promise.race([
        fetchImpl(url, {
          ...init,
          redirect: "error",
          signal,
        }),
        abort.promise,
      ]);
    } finally {
      abort.dispose();
    }
    if (response.redirected || response.type === "opaqueredirect") {
      cancelBody(response);
      return invalidResponse();
    }
    if (!response.ok) {
      cancelBody(response);
      throw statusError(response);
    }
    const bytes = await readBoundedBody(response, maximumBytes, signal);
    return { response, bytes };
  } catch (error) {
    return mapRequestFailure(error, callerSignal, timeoutController.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(
  fetchImpl: ServerFetch,
  url: string,
  token: string,
  signal: AbortSignal,
  maximumBytes: number,
): Promise<unknown> {
  const result = await boundedRequest(
    fetchImpl,
    url,
    { headers: apiHeaders(token), method: "GET" },
    signal,
    maximumBytes,
  );
  return parseJson(result.bytes);
}

function readmeRank(path: string): readonly [number, number, string] | null {
  const segments = path.split("/");
  const name = segments.at(-1)?.toLocaleLowerCase("en-US") ?? "";
  const ranks: Record<string, number> = {
    "readme.md": 0,
    readme: 1,
    "readme.rst": 2,
    "readme.adoc": 3,
    "readme.txt": 4,
  };
  const rank = ranks[name];
  if (rank === undefined) return null;
  const parent = segments.slice(0, -1).join("/").toLocaleLowerCase("en-US");
  const location =
    parent === ""
      ? 0
      : parent === ".github"
        ? 1
        : parent === "docs"
          ? 2
          : 3 + segments.length;
  return [location, rank, path.normalize("NFC")];
}

function classifyNonReadme(path: string): EvidenceTextFile["kind"] | null {
  const lower = path.toLocaleLowerCase("en-US");
  const name = lower.split("/").at(-1) ?? "";
  if (MANIFEST_NAMES.has(name)) return "manifest";
  if (CONVENTIONAL_DOCUMENT_NAMES.has(name)) return "documentation";
  if (
    (lower.startsWith("docs/") || lower.startsWith("doc/")) &&
    /\.(?:md|mdx|rst|adoc|txt)$/u.test(lower)
  ) {
    return "documentation";
  }
  return null;
}

export function selectEvidenceFiles(
  snapshotInput: VerifiedRepositorySnapshot,
): SelectedFile[] {
  const snapshot = assertSnapshotInput(snapshotInput);
  const eligible = snapshot.files.filter(
    (file) => file.size <= GITHUB_LIMITS.fileBytes,
  );
  const readmes = eligible
    .map((file) => ({ file, rank: readmeRank(file.path) }))
    .filter(
      (
        item,
      ): item is {
        file: typeof item.file;
        rank: readonly [number, number, string];
      } => item.rank !== null,
    )
    .sort((left, right) => {
      const depth = left.rank[0] - right.rank[0];
      if (depth !== 0) return depth;
      const format = left.rank[1] - right.rank[1];
      return format !== 0
        ? format
        : lexicalCompare(left.rank[2], right.rank[2]);
    });
  const candidates: SelectedFile[] = [];
  const preferredReadme = readmes[0]?.file;
  if (preferredReadme !== undefined) {
    candidates.push({
      path: preferredReadme.path,
      size: preferredReadme.size,
      kind: "readme",
    });
  }
  for (const file of eligible) {
    if (file.path === preferredReadme?.path) continue;
    const kind = classifyNonReadme(file.path);
    if (kind !== null)
      candidates.push({ path: file.path, size: file.size, kind });
  }
  candidates.sort((left, right) => {
    const priority = { readme: 0, manifest: 1, documentation: 2 } as const;
    const byKind = priority[left.kind] - priority[right.kind];
    return byKind !== 0
      ? byKind
      : lexicalCompare(left.path.normalize("NFC"), right.path.normalize("NFC"));
  });

  const selected: SelectedFile[] = [];
  let bytes = 0;
  for (const candidate of candidates) {
    if (selected.length === GITHUB_LIMITS.evidenceFiles) break;
    if (bytes + candidate.size > GITHUB_LIMITS.documentationBytes) continue;
    selected.push(candidate);
    bytes += candidate.size;
  }
  return selected;
}

async function parallelMap<T, U>(
  values: readonly T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await map(value, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

function rawUrl(snapshot: VerifiedRepositorySnapshot, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${RAW_ORIGIN}/${encodeURIComponent(snapshot.repository.owner)}/${encodeURIComponent(snapshot.repository.repo)}/${snapshot.commitSha}/${encodedPath}`;
}

function guardValue<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ServerGitHubError) throw error;
    return invalidResponse();
  }
}

/** Fixed-endpoint, authenticated client for public repository evidence only. */
export class ServerGitHubClient {
  readonly #fetch: ServerFetch;
  readonly #now: GitHubClock;

  constructor(options?: ServerGitHubClientOptions);
  constructor(fetchImpl?: ServerFetch, now?: GitHubClock);
  constructor(
    optionsOrFetch: ServerGitHubClientOptions | ServerFetch = {},
    positionalNow?: GitHubClock,
  ) {
    if (typeof optionsOrFetch === "function") {
      this.#fetch = optionsOrFetch;
      this.#now = positionalNow ?? (() => new Date());
    } else {
      this.#fetch = optionsOrFetch.fetch ?? fetch;
      this.#now = optionsOrFetch.now ?? (() => new Date());
    }
  }

  async verifySnapshot(
    requestInput: GitHubSnapshotRequest,
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<VerifiedRepositorySnapshot> {
    const request = guardValue(() => assertDeepAnalysisRequest(requestInput));
    const token = assertToken(tokenInput);
    const base = repositoryApiBase(request.repository);
    const repository = await this.fetchRepositoryFacts(
      request.repository,
      token,
      signal,
    );
    const commitPayload = await requestJson(
      this.#fetch,
      `${base}/commits/${request.repository.commitSha}`,
      token,
      signal,
      MAX_JSON_BYTES.commit,
    );
    const commit = guardValue(() =>
      guardCommitResponse(commitPayload, request.repository.commitSha),
    );
    const treePayload = await requestJson(
      this.#fetch,
      `${base}/git/trees/${commit.treeSha}?recursive=1`,
      token,
      signal,
      MAX_JSON_BYTES.tree,
    );
    const tree = guardValue(() =>
      guardTreeResponse(treePayload, commit.treeSha),
    );
    return {
      repository,
      commitSha: commit.commitSha,
      treeSha: commit.treeSha,
      files: tree.files,
      treeComplete: tree.treeComplete,
    };
  }

  async fetchRepositoryFacts(
    repository: { owner: string; repo: string },
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<VerifiedRepositorySnapshot["repository"]> {
    const token = assertToken(tokenInput);
    const base = repositoryApiBase(repository);
    const payload = await requestJson(
      this.#fetch,
      base,
      token,
      signal,
      MAX_JSON_BYTES.repository,
    );
    return guardValue(() => guardRepositoryResponse(payload, repository));
  }

  async fetchEvidenceFiles(
    snapshotInput: VerifiedRepositorySnapshot,
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<EvidenceTextFile[]> {
    const snapshot = guardValue(() => assertSnapshotInput(snapshotInput));
    assertToken(tokenInput);
    const selected = selectEvidenceFiles(snapshot);
    const files = await parallelMap(
      selected,
      GITHUB_LIMITS.readConcurrency,
      async (file): Promise<EvidenceTextFile> => {
        const result = await boundedRequest(
          this.#fetch,
          rawUrl(snapshot, file.path),
          { headers: rawHeaders(), method: "GET" },
          signal,
          GITHUB_LIMITS.fileBytes,
        );
        if (result.bytes.byteLength !== file.size) return invalidResponse();
        return {
          path: file.path,
          text: decodeUtf8(result.bytes),
          bytes: result.bytes.byteLength,
          kind: file.kind,
        };
      },
    );
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    if (total > GITHUB_LIMITS.documentationBytes) return invalidResponse();
    return files;
  }

  async fetchReleaseSummary(
    snapshotInput: VerifiedRepositorySnapshot,
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<ReleaseSummary> {
    const snapshot = guardValue(() => assertSnapshotInput(snapshotInput));
    const token = assertToken(tokenInput);
    const base = repositoryApiBase(snapshot.repository);
    const pages = [];
    for (let page = 1; page <= GITHUB_LIMITS.releasePages; page += 1) {
      let payload: unknown;
      try {
        payload = await requestJson(
          this.#fetch,
          `${base}/releases?per_page=${String(GITHUB_LIMITS.releasesPerPage)}&page=${String(page)}`,
          token,
          signal,
          MAX_JSON_BYTES.release,
        );
      } catch (error) {
        if (
          page === 1 &&
          error instanceof ServerGitHubError &&
          error.kind === "not-found"
        ) {
          return buildReleaseSummary([], false, this.#now());
        }
        throw error;
      }
      const releases = guardValue(() =>
        guardReleasePage(payload, snapshot.repository),
      );
      pages.push(releases);
      if (releases.length < GITHUB_LIMITS.releasesPerPage) break;
    }
    return buildReleaseSummary(pages, true, this.#now());
  }

  async fetchRecentActivity(
    snapshotInput: VerifiedRepositorySnapshot,
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<RecentActivitySummary> {
    const snapshot = guardValue(() => assertSnapshotInput(snapshotInput));
    const token = assertToken(tokenInput);
    const base = repositoryApiBase(snapshot.repository);
    const pages = [];
    for (let page = 1; page <= GITHUB_LIMITS.activityPages; page += 1) {
      const payload = await requestJson(
        this.#fetch,
        `${base}/events?per_page=${String(GITHUB_LIMITS.activityPerPage)}&page=${String(page)}`,
        token,
        signal,
        MAX_JSON_BYTES.activity,
      );
      const events = guardValue(() =>
        guardActivityPage(payload, snapshot.repository),
      );
      pages.push(events);
      if (events.length < GITHUB_LIMITS.activityPerPage) break;
    }
    return buildRecentActivitySummary(pages, this.#now());
  }

  async fetchAlternatives(
    queryInputs: readonly string[],
    tokenInput: string,
    signal: AbortSignal,
  ): Promise<AlternativeSearchResult[]> {
    if (
      !Array.isArray(queryInputs) ||
      queryInputs.length > GITHUB_LIMITS.alternativeQueries ||
      Object.keys(queryInputs).length !== queryInputs.length
    ) {
      return invalidResponse();
    }
    const token = assertToken(tokenInput);
    const queries = queryInputs.map((query) =>
      guardValue(() => assertAlternativeQuery(query)),
    );
    if (
      new Set(
        queries.map((query) =>
          query.normalize("NFKC").toLocaleLowerCase("en-US"),
        ),
      ).size !== queries.length
    ) {
      return invalidResponse();
    }
    return parallelMap(
      queries,
      GITHUB_LIMITS.readConcurrency,
      async (query): Promise<AlternativeSearchResult> => {
        const qualified = `${query} archived:false fork:false in:name,description`;
        const url = `${API_ORIGIN}/search/repositories?q=${encodeURIComponent(qualified)}&sort=stars&order=desc&per_page=${String(GITHUB_LIMITS.alternativesPerQuery)}&page=1`;
        const payload = await requestJson(
          this.#fetch,
          url,
          token,
          signal,
          MAX_JSON_BYTES.search,
        );
        return {
          query,
          candidates: guardValue(() => guardSearchResponse(payload)),
        };
      },
    );
  }
}
