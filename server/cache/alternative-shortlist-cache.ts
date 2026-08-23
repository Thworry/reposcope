import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";

import { containsCredentialLikeValue } from "../../src/features/analysis/project-brief-safety.js";
import type { VerifiedAlternativeRepository } from "../evidence/model.js";
import {
  containsPotentialCredentialMaterial,
  snapshotJsonData,
} from "../panel/parse-json.js";

export const ALTERNATIVE_SHORTLIST_CACHE_LIMITS = Object.freeze({
  ttlMs: 24 * 60 * 60 * 1_000,
  rowBytes: 256 * 1024,
  entries: 1_000,
  totalBytes: 32 * 1024 * 1024,
  repositories: 5,
} as const);

export interface AlternativeShortlistCacheKey {
  repository: { owner: string; repo: string; commitSha: string };
  strategyVersion: string;
}

export interface AlternativeShortlistCacheOptions {
  path?: string;
  database?: DatabaseSync;
  now?: () => number;
  ownDatabase?: boolean;
  limits?: {
    rowBytes?: number;
    entries?: number;
    totalBytes?: number;
  };
}

interface CanonicalKey {
  owner: string;
  repo: string;
  commitSha: string;
  strategyVersion: string;
  serialized: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/u;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/u;
const UNSAFE_TEXT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const TIMESTAMP_PATTERN =
  /^(?<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/u;
const REPOSITORY_KEYS = Object.freeze([
  "owner",
  "repo",
  "fullName",
  "description",
  "topics",
  "homepage",
  "archived",
  "defaultBranch",
  "pushedAt",
  "starsCount",
  "watchersCount",
  "forksCount",
  "openIssuesCount",
  "licenseSpdxId",
]);

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function safeText(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    Array.from(value).length <= maximum &&
    !UNSAFE_TEXT_PATTERN.test(value) &&
    !containsPotentialCredentialMaterial(value)
  );
}

function safeNullableText(
  value: unknown,
  maximum: number,
): value is string | null {
  return value === null || safeText(value, maximum, true);
}

function safeHomepage(value: unknown): value is string | null {
  if (value === null) return true;
  if (!safeText(value, 2_048) || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function canonicalTimestamp(value: unknown, maximum: number): value is string {
  if (typeof value !== "string") return false;
  const match = TIMESTAMP_PATTERN.exec(value);
  const seconds = match?.groups?.seconds;
  const fraction = match?.groups?.fraction ?? "";
  const parsed = Date.parse(value);
  return (
    seconds !== undefined &&
    Number.isFinite(parsed) &&
    parsed <= maximum &&
    new Date(parsed).toISOString() === `${seconds}.${fraction.padEnd(3, "0")}Z`
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function canonicalKey(value: unknown): CanonicalKey | null {
  const snapshot = snapshotJsonData(value);
  if (
    !exactRecord(snapshot, ["repository", "strategyVersion"]) ||
    !exactRecord(snapshot.repository, ["owner", "repo", "commitSha"])
  ) {
    return null;
  }
  const { owner, repo, commitSha } = snapshot.repository;
  const { strategyVersion } = snapshot;
  if (
    typeof owner !== "string" ||
    !OWNER_PATTERN.test(owner) ||
    containsCredentialLikeValue(owner) ||
    typeof repo !== "string" ||
    !REPOSITORY_PATTERN.test(repo) ||
    containsCredentialLikeValue(repo) ||
    repo === "." ||
    repo === ".." ||
    /\.git$/iu.test(repo) ||
    typeof commitSha !== "string" ||
    !SHA_PATTERN.test(commitSha) ||
    typeof strategyVersion !== "string" ||
    !VERSION_PATTERN.test(strategyVersion) ||
    containsCredentialLikeValue(strategyVersion)
  ) {
    return null;
  }
  const key = {
    owner: owner.toLocaleLowerCase("en-US"),
    repo: repo.toLocaleLowerCase("en-US"),
    commitSha,
    strategyVersion,
  };
  return {
    ...key,
    serialized: JSON.stringify([
      key.owner,
      key.repo,
      key.commitSha,
      key.strategyVersion,
    ]),
  };
}

function statementArguments(key: CanonicalKey): readonly string[] {
  return [key.owner, key.repo, key.commitSha, key.strategyVersion];
}

function validRepository(
  value: unknown,
  now: number,
): VerifiedAlternativeRepository | null {
  if (!exactRecord(value, REPOSITORY_KEYS)) return null;
  const {
    owner,
    repo,
    fullName,
    description,
    topics,
    homepage,
    archived,
    defaultBranch,
    pushedAt,
    starsCount,
    watchersCount,
    forksCount,
    openIssuesCount,
    licenseSpdxId,
  } = value;
  if (
    typeof owner !== "string" ||
    !OWNER_PATTERN.test(owner) ||
    typeof repo !== "string" ||
    !REPOSITORY_PATTERN.test(repo) ||
    repo === "." ||
    repo === ".." ||
    /\.git$/iu.test(repo) ||
    !safeText(fullName, 140) ||
    fullName.toLocaleLowerCase("en-US") !==
      `${owner}/${repo}`.toLocaleLowerCase("en-US") ||
    !safeNullableText(description, 2_000) ||
    !Array.isArray(topics) ||
    topics.length > 20 ||
    !Object.keys(topics).every((key, index) => key === String(index)) ||
    !topics.every((topic) => safeText(topic, 50)) ||
    new Set(topics.map((topic) => topic.toLocaleLowerCase("en-US"))).size !==
      topics.length ||
    !safeHomepage(homepage) ||
    archived !== false ||
    !safeText(defaultBranch, 255) ||
    !canonicalTimestamp(pushedAt, now) ||
    !nonNegativeInteger(starsCount) ||
    !nonNegativeInteger(watchersCount) ||
    !nonNegativeInteger(forksCount) ||
    !nonNegativeInteger(openIssuesCount) ||
    !safeNullableText(licenseSpdxId, 128)
  ) {
    return null;
  }
  return {
    owner,
    repo,
    fullName,
    description,
    topics: [...topics],
    homepage,
    archived,
    defaultBranch,
    pushedAt,
    starsCount,
    watchersCount,
    forksCount,
    openIssuesCount,
    licenseSpdxId,
  };
}

function snapshotRepositories(
  value: unknown,
  now: number,
): readonly VerifiedAlternativeRepository[] | null {
  const snapshot = snapshotJsonData(value);
  if (
    !Array.isArray(snapshot) ||
    snapshot.length > ALTERNATIVE_SHORTLIST_CACHE_LIMITS.repositories ||
    !Object.keys(snapshot).every((key, index) => key === String(index))
  ) {
    return null;
  }
  const repositories: VerifiedAlternativeRepository[] = [];
  const identities = new Set<string>();
  for (const entry of snapshot) {
    const repository = validRepository(entry, now);
    if (repository === null) return null;
    const identity = repository.fullName.toLocaleLowerCase("en-US");
    if (identities.has(identity)) return null;
    identities.add(identity);
    Object.freeze(repository.topics);
    Object.freeze(repository);
    repositories.push(repository);
  }
  return Object.freeze(repositories);
}

function boundedLimit(value: number | undefined, maximum: number): number {
  return value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
    ? maximum
    : value;
}

function validNow(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid cache clock");
  return value;
}

function column(row: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(row, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

/** Persistent 24-hour cache for directly verified public alternative facts. */
export class AlternativeShortlistCache {
  readonly #database: DatabaseSync;
  readonly #ownsDatabase: boolean;
  readonly #now: () => number;
  readonly #rowBytes: number;
  readonly #entries: number;
  readonly #totalBytes: number;
  readonly #readRow: StatementSync;
  readonly #touch: StatementSync;
  readonly #removeRow: StatementSync;
  readonly #removeKey: StatementSync;
  readonly #upsert: StatementSync;
  readonly #evict: StatementSync;
  readonly #count: StatementSync;
  #closed = false;

  constructor(options: string | AlternativeShortlistCacheOptions = ":memory:") {
    const normalized: AlternativeShortlistCacheOptions =
      typeof options === "string" ? { path: options } : options;
    if (normalized.database !== undefined && normalized.path !== undefined) {
      throw new Error("Specify a cache path or database, not both");
    }
    this.#database =
      normalized.database ??
      new DatabaseSync(normalized.path ?? ":memory:", {
        allowExtension: false,
        timeout: 5_000,
      });
    this.#ownsDatabase =
      normalized.database === undefined || normalized.ownDatabase === true;
    this.#now = normalized.now ?? Date.now;
    this.#totalBytes = boundedLimit(
      normalized.limits?.totalBytes,
      ALTERNATIVE_SHORTLIST_CACHE_LIMITS.totalBytes,
    );
    this.#rowBytes = Math.min(
      boundedLimit(
        normalized.limits?.rowBytes,
        ALTERNATIVE_SHORTLIST_CACHE_LIMITS.rowBytes,
      ),
      this.#totalBytes,
    );
    this.#entries = boundedLimit(
      normalized.limits?.entries,
      ALTERNATIVE_SHORTLIST_CACHE_LIMITS.entries,
    );

    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA trusted_schema = OFF;
      CREATE TABLE IF NOT EXISTS alternative_shortlist_cache (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        shortlist_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        PRIMARY KEY (owner, repo, commit_sha, strategy_version)
      ) STRICT;
    `);
    const whereKey =
      "owner = ? AND repo = ? AND commit_sha = ? AND strategy_version = ?";
    this.#readRow = this.#database.prepare(`
      SELECT rowid, owner, repo, commit_sha, strategy_version, cache_key,
        typeof(shortlist_json) AS shortlist_type,
        length(CAST(shortlist_json AS BLOB)) AS shortlist_bytes,
        CASE
          WHEN typeof(shortlist_json) = 'text'
            AND length(CAST(shortlist_json AS BLOB)) <= ?
          THEN shortlist_json
          ELSE NULL
        END AS shortlist_json,
        saved_at, expires_at, accessed_at
      FROM alternative_shortlist_cache WHERE ${whereKey}
    `);
    this.#touch = this.#database.prepare(
      `UPDATE alternative_shortlist_cache SET accessed_at = ? WHERE ${whereKey}`,
    );
    this.#removeRow = this.#database.prepare(
      `DELETE FROM alternative_shortlist_cache WHERE rowid = ? AND ${whereKey}`,
    );
    this.#removeKey = this.#database.prepare(
      `DELETE FROM alternative_shortlist_cache WHERE ${whereKey}`,
    );
    this.#upsert = this.#database.prepare(`
      INSERT INTO alternative_shortlist_cache (
        owner, repo, commit_sha, strategy_version, cache_key,
        shortlist_json, saved_at, expires_at, accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (owner, repo, commit_sha, strategy_version) DO UPDATE SET
        cache_key = excluded.cache_key,
        shortlist_json = excluded.shortlist_json,
        saved_at = excluded.saved_at,
        expires_at = excluded.expires_at,
        accessed_at = excluded.accessed_at
    `);
    this.#evict = this.#database.prepare(`
      DELETE FROM alternative_shortlist_cache
      WHERE rowid IN (
        SELECT rowid FROM (
          SELECT rowid,
            ROW_NUMBER() OVER (
              ORDER BY accessed_at DESC, saved_at DESC, rowid DESC
            ) AS recency_rank,
            SUM(length(CAST(shortlist_json AS BLOB))) OVER (
              ORDER BY accessed_at DESC, saved_at DESC, rowid DESC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_bytes
          FROM alternative_shortlist_cache
        )
        WHERE recency_rank > ? OR running_bytes > ?
      )
    `);
    this.#count = this.#database.prepare(
      "SELECT COUNT(*) AS count FROM alternative_shortlist_cache",
    );
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Cache is closed");
  }

  #deleteRow(rowid: unknown, key: CanonicalKey): void {
    if (typeof rowid !== "number" || !Number.isSafeInteger(rowid) || rowid < 1)
      return;
    try {
      this.#removeRow.run(rowid, ...statementArguments(key));
    } catch {
      // Invalid cached content is never returned, even if cleanup fails.
    }
  }

  read(key: unknown): readonly VerifiedAlternativeRepository[] | null {
    this.#assertOpen();
    const normalized = canonicalKey(key);
    if (normalized === null) return null;
    const now = validNow(this.#now());
    let rawRow: unknown;
    try {
      rawRow = this.#readRow.get(
        this.#rowBytes,
        ...statementArguments(normalized),
      );
    } catch {
      return null;
    }
    if (typeof rawRow !== "object" || rawRow === null || Array.isArray(rawRow))
      return null;
    const row = rawRow as Record<string, unknown>;
    const rowid = column(row, "rowid");
    const expectedColumns: ReadonlyArray<[string, unknown]> = [
      ["owner", normalized.owner],
      ["repo", normalized.repo],
      ["commit_sha", normalized.commitSha],
      ["strategy_version", normalized.strategyVersion],
      ["cache_key", normalized.serialized],
    ];
    const savedAt = column(row, "saved_at");
    const expiresAt = column(row, "expires_at");
    const accessedAt = column(row, "accessed_at");
    const shortlistType = column(row, "shortlist_type");
    const shortlistBytes = column(row, "shortlist_bytes");
    const invalidMetadata =
      expectedColumns.some(
        ([name, expected]) => column(row, name) !== expected,
      ) ||
      typeof savedAt !== "number" ||
      !Number.isSafeInteger(savedAt) ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(expiresAt) ||
      typeof accessedAt !== "number" ||
      !Number.isSafeInteger(accessedAt) ||
      savedAt < 0 ||
      savedAt > now ||
      accessedAt < savedAt ||
      accessedAt > now ||
      expiresAt !== savedAt + ALTERNATIVE_SHORTLIST_CACHE_LIMITS.ttlMs ||
      expiresAt <= now ||
      shortlistType !== "text" ||
      typeof shortlistBytes !== "number" ||
      !Number.isSafeInteger(shortlistBytes) ||
      shortlistBytes < 2 ||
      shortlistBytes > this.#rowBytes;
    if (invalidMetadata) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    const shortlistJson = column(row, "shortlist_json");
    if (
      typeof shortlistJson !== "string" ||
      Buffer.byteLength(shortlistJson, "utf8") !== shortlistBytes
    ) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(shortlistJson) as unknown;
    } catch {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    const repositories = snapshotRepositories(parsed, now);
    if (
      repositories === null ||
      repositories.some(
        (repository) =>
          repository.owner.toLocaleLowerCase("en-US") === normalized.owner &&
          repository.repo.toLocaleLowerCase("en-US") === normalized.repo,
      )
    ) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    try {
      this.#touch.run(now, ...statementArguments(normalized));
    } catch {
      // LRU recency is best effort after strict validation.
    }
    return repositories;
  }

  write(key: unknown, value: unknown): boolean {
    this.#assertOpen();
    const normalized = canonicalKey(key);
    if (normalized === null) return false;
    const now = validNow(this.#now());
    const repositories = snapshotRepositories(value, now);
    if (
      repositories === null ||
      repositories.some(
        (repository) =>
          repository.owner.toLocaleLowerCase("en-US") === normalized.owner &&
          repository.repo.toLocaleLowerCase("en-US") === normalized.repo,
      )
    ) {
      return false;
    }
    const shortlistJson = JSON.stringify(repositories);
    if (Buffer.byteLength(shortlistJson, "utf8") > this.#rowBytes) return false;
    const expiresAt = now + ALTERNATIVE_SHORTLIST_CACHE_LIMITS.ttlMs;
    if (!Number.isSafeInteger(expiresAt)) return false;
    let transactionStarted = false;
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      this.#upsert.run(
        ...statementArguments(normalized),
        normalized.serialized,
        shortlistJson,
        now,
        expiresAt,
        now,
      );
      this.#evict.run(this.#entries, this.#totalBytes);
      this.#database.exec("COMMIT");
      return true;
    } catch {
      if (transactionStarted) {
        try {
          this.#database.exec("ROLLBACK");
        } catch {
          // The verified shortlist remains usable even when caching fails.
        }
      }
      return false;
    }
  }

  delete(key: unknown): boolean {
    this.#assertOpen();
    const normalized = canonicalKey(key);
    if (normalized === null) return false;
    try {
      return this.#removeKey.run(...statementArguments(normalized)).changes > 0;
    } catch {
      return false;
    }
  }

  count(): number {
    this.#assertOpen();
    const row = this.#count.get() as Record<string, unknown> | undefined;
    const value = row === undefined ? undefined : column(row, "count");
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0
      ? value
      : 0;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#ownsDatabase) this.#database.close();
  }
}
