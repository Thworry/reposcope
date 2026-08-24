import { GITHUB_LIMITS, ServerGitHubError } from "./model.js";
import type {
  GitHubActivityEvent,
  GitHubAlternativeCandidate,
  GitHubReleaseFact,
  ValidatedGitHubSnapshotRequest,
  VerifiedRepositorySnapshot,
} from "./model.js";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/u;
const SAFE_QUERY_PATTERN = /^[\p{L}\p{N} -]+$/u;
const TIMESTAMP_PATTERN =
  /^(?<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/u;
const UNSAFE_TEXT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const MAX_PATH_CODE_POINTS = 1_024;
const MAX_TEXT_CODE_POINTS = 8_192;

type DataRecord = Record<string, unknown>;

function invalidResponse(): never {
  throw new ServerGitHubError("invalid-response");
}

function codePoints(value: string): number {
  return Array.from(value).length;
}

function dataRecord(value: unknown): DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidResponse();
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return invalidResponse();
  }

  return value as DataRecord;
}

function ownValue(record: DataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    return invalidResponse();
  }
  return descriptor.value as unknown;
}

function denseArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return invalidResponse();
  }
  const keys = Object.keys(value);
  if (
    keys.length !== value.length ||
    keys.some((key, index) => key !== String(index))
  ) {
    return invalidResponse();
  }
  return value;
}

function safeString(
  value: unknown,
  maximum = MAX_TEXT_CODE_POINTS,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    codePoints(value) > maximum ||
    UNSAFE_TEXT_PATTERN.test(value)
  ) {
    return invalidResponse();
  }
  return value;
}

function nullableString(
  value: unknown,
  maximum = MAX_TEXT_CODE_POINTS,
): string | null {
  return value === null ? null : safeString(value, maximum, true);
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    return invalidResponse();
  }
  return value;
}

function booleanValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : invalidResponse();
}

export function assertCanonicalSha(value: unknown): string {
  return typeof value === "string" && SHA_PATTERN.test(value)
    ? value
    : invalidResponse();
}

export function assertCanonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") return invalidResponse();
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

export function assertRepositoryComponent(
  value: unknown,
  kind: "owner" | "repo",
): string {
  if (typeof value !== "string") return invalidResponse();
  const valid =
    kind === "owner"
      ? OWNER_PATTERN.test(value)
      : REPOSITORY_PATTERN.test(value);
  if (
    !valid ||
    value === "." ||
    value === ".." ||
    (kind === "repo" && /\.git$/iu.test(value))
  ) {
    return invalidResponse();
  }
  return value;
}

export function assertRepositoryPath(value: unknown): string {
  const path = safeString(value, MAX_PATH_CODE_POINTS);
  const segments = path.split("/");
  if (
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return invalidResponse();
  }
  return path;
}

export function assertDeepAnalysisRequest(
  value: unknown,
): ValidatedGitHubSnapshotRequest {
  const request = dataRecord(value);
  const keys = Object.keys(request);
  if (
    keys.length !== 2 ||
    !keys.includes("repository") ||
    !keys.includes("language")
  ) {
    return invalidResponse();
  }
  const repository = dataRecord(ownValue(request, "repository"));
  const repositoryKeys = Object.keys(repository);
  if (
    repositoryKeys.length !== 3 ||
    !repositoryKeys.includes("owner") ||
    !repositoryKeys.includes("repo") ||
    !repositoryKeys.includes("commitSha")
  ) {
    return invalidResponse();
  }
  const language = ownValue(request, "language");
  if (language !== "en" && language !== "zh-CN") return invalidResponse();
  return {
    repository: {
      owner: assertRepositoryComponent(ownValue(repository, "owner"), "owner"),
      repo: assertRepositoryComponent(ownValue(repository, "repo"), "repo"),
      commitSha: assertCanonicalSha(ownValue(repository, "commitSha")),
    },
    language,
  };
}

function topics(value: unknown): string[] {
  return denseArray(value, 20).map((topic) => safeString(topic, 50));
}

function licenseSpdx(value: unknown): string | null {
  if (value === null) return null;
  const license = dataRecord(value);
  return nullableString(ownValue(license, "spdx_id"), 128);
}

function sameRepository(actual: string, owner: string, repo: string): boolean {
  return (
    actual.toLocaleLowerCase("en-US") ===
    `${owner}/${repo}`.toLocaleLowerCase("en-US")
  );
}

export function guardRepositoryResponse(
  value: unknown,
  requested: { owner: string; repo: string },
): VerifiedRepositorySnapshot["repository"] {
  const record = dataRecord(value);
  const fullName = safeString(ownValue(record, "full_name"), 140);
  const name = safeString(ownValue(record, "name"), 100);
  const owner = dataRecord(ownValue(record, "owner"));
  const ownerLogin = safeString(ownValue(owner, "login"), 39);
  if (
    !sameRepository(fullName, requested.owner, requested.repo) ||
    name.toLocaleLowerCase("en-US") !==
      requested.repo.toLocaleLowerCase("en-US") ||
    ownerLogin.toLocaleLowerCase("en-US") !==
      requested.owner.toLocaleLowerCase("en-US") ||
    booleanValue(ownValue(record, "private"))
  ) {
    return invalidResponse();
  }

  return {
    owner: requested.owner,
    repo: requested.repo,
    fullName,
    description: nullableString(ownValue(record, "description"), 2_000),
    topics: topics(ownValue(record, "topics")),
    homepage: nullableString(ownValue(record, "homepage"), 2_048),
    archived: booleanValue(ownValue(record, "archived")),
    defaultBranch: safeString(ownValue(record, "default_branch"), 255),
    pushedAt: assertCanonicalTimestamp(ownValue(record, "pushed_at")),
    starsCount: nonNegativeInteger(ownValue(record, "stargazers_count")),
    watchersCount: nonNegativeInteger(ownValue(record, "subscribers_count")),
    forksCount: nonNegativeInteger(ownValue(record, "forks_count")),
    openIssuesCount: nonNegativeInteger(ownValue(record, "open_issues_count")),
    licenseSpdxId: licenseSpdx(ownValue(record, "license")),
  };
}

export function guardCommitResponse(
  value: unknown,
  requestedSha: string,
): { commitSha: string; treeSha: string } {
  const record = dataRecord(value);
  const commitSha = assertCanonicalSha(ownValue(record, "sha"));
  const commit = dataRecord(ownValue(record, "commit"));
  const tree = dataRecord(ownValue(commit, "tree"));
  if (commitSha !== requestedSha) return invalidResponse();
  return { commitSha, treeSha: assertCanonicalSha(ownValue(tree, "sha")) };
}

export function guardTreeResponse(
  value: unknown,
  expectedTreeSha: string,
): Pick<VerifiedRepositorySnapshot, "files" | "treeComplete"> {
  const record = dataRecord(value);
  if (assertCanonicalSha(ownValue(record, "sha")) !== expectedTreeSha) {
    return invalidResponse();
  }
  const truncated = booleanValue(ownValue(record, "truncated"));
  const entries = denseArray(
    ownValue(record, "tree"),
    GITHUB_LIMITS.treeEntries,
  );
  const files: VerifiedRepositorySnapshot["files"] = [];
  const paths = new Set<string>();

  for (const rawEntry of entries) {
    const entry = dataRecord(rawEntry);
    const path = assertRepositoryPath(ownValue(entry, "path"));
    const normalizedPath = path.normalize("NFC");
    if (paths.has(normalizedPath)) return invalidResponse();
    paths.add(normalizedPath);

    const type = safeString(ownValue(entry, "type"), 16);
    const mode = safeString(ownValue(entry, "mode"), 16);
    assertCanonicalSha(ownValue(entry, "sha"));
    if (type === "tree" && mode === "040000") continue;
    if (type === "commit" || mode === "160000" || mode === "120000") {
      return invalidResponse();
    }
    if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {
      return invalidResponse();
    }
    files.push({
      path,
      sha: assertCanonicalSha(ownValue(entry, "sha")),
      size: nonNegativeInteger(ownValue(entry, "size")),
      mode,
    });
  }

  return { files, treeComplete: !truncated };
}

function validateApiRepositoryUrl(
  value: unknown,
  requested: { owner: string; repo: string },
  suffix: string,
): void {
  const url = safeString(value, 2_048);
  const prefix = `https://api.github.com/repos/${encodeURIComponent(requested.owner)}/${encodeURIComponent(requested.repo)}/${suffix}`;
  if (url !== prefix) invalidResponse();
}

export function guardReleasePage(
  value: unknown,
  requested: { owner: string; repo: string },
): GitHubReleaseFact[] {
  const releases: GitHubReleaseFact[] = [];
  for (const rawRelease of denseArray(value, GITHUB_LIMITS.releasesPerPage)) {
    const release = dataRecord(rawRelease);
    const id = nonNegativeInteger(ownValue(release, "id"));
    validateApiRepositoryUrl(
      ownValue(release, "url"),
      requested,
      `releases/${String(id)}`,
    );
    const draft = booleanValue(ownValue(release, "draft"));
    const tagName = safeString(ownValue(release, "tag_name"), 255);
    const published = ownValue(release, "published_at");
    const prerelease = booleanValue(ownValue(release, "prerelease"));
    const name = nullableString(ownValue(release, "name"), 512);
    if (draft) {
      if (published !== null) invalidResponse();
      continue;
    }
    if (published === null) invalidResponse();
    releases.push({
      id,
      tagName,
      name,
      publishedAt: assertCanonicalTimestamp(published),
      url: `https://github.com/${encodeURIComponent(requested.owner)}/${encodeURIComponent(requested.repo)}/releases/tag/${encodeURIComponent(tagName)}`,
      prerelease,
    });
  }
  return releases;
}

function activityKind(type: string): GitHubActivityEvent["kind"] {
  if (type === "PushEvent") return "push";
  if (type === "IssuesEvent") return "issue";
  if (type === "PullRequestEvent") return "pull-request";
  if (type === "ReleaseEvent") return "release";
  return "other";
}

export function guardActivityPage(
  value: unknown,
  requested: { owner: string; repo: string },
): GitHubActivityEvent[] {
  return denseArray(value, GITHUB_LIMITS.activityPerPage).map((rawEvent) => {
    const event = dataRecord(rawEvent);
    const repository = dataRecord(ownValue(event, "repo"));
    const fullName = safeString(ownValue(repository, "name"), 140);
    if (!sameRepository(fullName, requested.owner, requested.repo)) {
      return invalidResponse();
    }
    return {
      id: safeString(ownValue(event, "id"), 128),
      kind: activityKind(safeString(ownValue(event, "type"), 128)),
      occurredAt: assertCanonicalTimestamp(ownValue(event, "created_at")),
    };
  });
}

export function assertAlternativeQuery(value: unknown): string {
  const query = safeString(value, 120);
  if (
    query !== query.trim() ||
    !SAFE_QUERY_PATTERN.test(query) ||
    /\s{2,}/u.test(query)
  ) {
    return invalidResponse();
  }
  return query;
}

export function guardSearchResponse(
  value: unknown,
): GitHubAlternativeCandidate[] {
  const response = dataRecord(value);
  nonNegativeInteger(ownValue(response, "total_count"));
  booleanValue(ownValue(response, "incomplete_results"));
  return denseArray(
    ownValue(response, "items"),
    GITHUB_LIMITS.alternativesPerQuery,
  ).map((rawItem) => {
    const item = dataRecord(rawItem);
    const ownerRecord = dataRecord(ownValue(item, "owner"));
    const owner = assertRepositoryComponent(
      ownValue(ownerRecord, "login"),
      "owner",
    );
    const repo = assertRepositoryComponent(ownValue(item, "name"), "repo");
    const fullName = safeString(ownValue(item, "full_name"), 140);
    if (
      !sameRepository(fullName, owner, repo) ||
      booleanValue(ownValue(item, "private"))
    ) {
      return invalidResponse();
    }
    return {
      repository: { owner, repo, fullName },
      description: nullableString(ownValue(item, "description"), 2_000),
      topics: topics(ownValue(item, "topics")),
      archived: booleanValue(ownValue(item, "archived")),
      fork: booleanValue(ownValue(item, "fork")),
      starsCount: nonNegativeInteger(ownValue(item, "stargazers_count")),
      forksCount: nonNegativeInteger(ownValue(item, "forks_count")),
      openIssuesCount: nonNegativeInteger(ownValue(item, "open_issues_count")),
      pushedAt: assertCanonicalTimestamp(ownValue(item, "pushed_at")),
      licenseSpdxId: licenseSpdx(ownValue(item, "license")),
    };
  });
}

export function assertSnapshotInput(
  value: unknown,
): VerifiedRepositorySnapshot {
  const snapshot = dataRecord(value);
  const repository = dataRecord(ownValue(snapshot, "repository"));
  const owner = assertRepositoryComponent(
    ownValue(repository, "owner"),
    "owner",
  );
  const repo = assertRepositoryComponent(ownValue(repository, "repo"), "repo");
  const commitSha = assertCanonicalSha(ownValue(snapshot, "commitSha"));
  const treeSha = assertCanonicalSha(ownValue(snapshot, "treeSha"));
  booleanValue(ownValue(snapshot, "treeComplete"));
  const rawFiles = denseArray(
    ownValue(snapshot, "files"),
    GITHUB_LIMITS.treeEntries,
  );
  const paths = new Set<string>();
  const files = rawFiles.map((rawFile) => {
    const file = dataRecord(rawFile);
    const path = assertRepositoryPath(ownValue(file, "path"));
    if (paths.has(path.normalize("NFC"))) return invalidResponse();
    paths.add(path.normalize("NFC"));
    const rawMode = ownValue(file, "mode");
    if (rawMode !== "100644" && rawMode !== "100755") return invalidResponse();
    const mode: "100644" | "100755" = rawMode;
    return {
      path,
      sha: assertCanonicalSha(ownValue(file, "sha")),
      size: nonNegativeInteger(ownValue(file, "size")),
      mode,
    };
  });
  const fullName = safeString(ownValue(repository, "fullName"), 140);
  if (!sameRepository(fullName, owner, repo)) return invalidResponse();
  return {
    repository: {
      owner,
      repo,
      fullName,
      description: nullableString(ownValue(repository, "description"), 2_000),
      topics: topics(ownValue(repository, "topics")),
      homepage: nullableString(ownValue(repository, "homepage"), 2_048),
      archived: booleanValue(ownValue(repository, "archived")),
      defaultBranch: safeString(ownValue(repository, "defaultBranch"), 255),
      pushedAt: assertCanonicalTimestamp(ownValue(repository, "pushedAt")),
      starsCount: nonNegativeInteger(ownValue(repository, "starsCount")),
      watchersCount: nonNegativeInteger(ownValue(repository, "watchersCount")),
      forksCount: nonNegativeInteger(ownValue(repository, "forksCount")),
      openIssuesCount: nonNegativeInteger(
        ownValue(repository, "openIssuesCount"),
      ),
      licenseSpdxId: nullableString(ownValue(repository, "licenseSpdxId"), 128),
    },
    commitSha,
    treeSha,
    files,
    treeComplete: booleanValue(ownValue(snapshot, "treeComplete")),
  };
}
