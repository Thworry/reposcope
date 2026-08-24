import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";

import { containsCredentialLikeValue } from "../../src/features/analysis/project-brief-safety.js";
import {
  containsPotentialCredentialMaterial,
  parseStrictJsonObject,
  snapshotJsonData,
} from "../panel/parse-json.js";

export const DEEP_NARRATIVE_CACHE_LIMITS = Object.freeze({
  ttlMs: 30 * 24 * 60 * 60 * 1_000,
  rowBytes: 2 * 1024 * 1024,
  entries: 5_000,
  totalBytes: 256 * 1024 * 1024,
} as const);

export interface DeepNarrativeCacheKey {
  repository: { owner: string; repo: string; commitSha: string };
  evidenceSchemaVersion: string;
  promptVersion: string;
  language: "en" | "zh-CN";
  capabilityClass: "auto" | "multi-model";
}

export type NarrativeSnapshot<T> = (value: unknown) => T | null;

export interface DeepNarrativeCacheOptions {
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
  evidenceSchemaVersion: string;
  promptVersion: string;
  language: "en" | "zh-CN";
  capabilityClass: "auto" | "multi-model";
  serialized: string;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/u;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/u;
const CREDENTIAL_NARRATIVE_KEY_PATTERN =
  /password|passphrase|passwd|secret|token|credential|authorization|apikey|accesskey|privatekey|databaseurl|databaseuri|connectionstring|dsn/iu;
const LIVE_METRIC_TEXT_PATTERN =
  /(?:(?:\b(?:stars|stargazers|watchers|forks|subscribers|open issues?|pushed|last push|latest activity)\b|星标|收藏数|关注数|派生数|分叉数|未解决问题|最近推送|最近活动)[^\p{N}\r\n]{0,24}\p{N}|\p{N}[\p{N},._\s万亿千百kKmM]{0,20}(?:\b(?:stars|stargazers|watchers|forks|subscribers|open issues?)\b|星标|收藏数|关注数|派生数|分叉数|未解决问题))/iu;
const FORBIDDEN_NARRATIVE_KEYS = new Set([
  "authorization",
  "community",
  "contentblocks",
  "cookie",
  "credentials",
  "evidence",
  "facts",
  "forks",
  "forkscount",
  "generatedat",
  "github",
  "identity",
  "license",
  "licensespdxid",
  "login",
  "messages",
  "openissues",
  "openissuescount",
  "pack",
  "prompt",
  "pushedat",
  "rawreadme",
  "review",
  "stars",
  "starscount",
  "system",
  "token",
  "transcript",
  "userid",
  "watchers",
  "watcherscount",
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

function canonicalKey(value: unknown): CanonicalKey | null {
  const snapshot = snapshotJsonData(value);
  if (
    !exactRecord(snapshot, [
      "repository",
      "evidenceSchemaVersion",
      "promptVersion",
      "language",
      "capabilityClass",
    ]) ||
    !exactRecord(snapshot.repository, ["owner", "repo", "commitSha"])
  ) {
    return null;
  }
  const { owner, repo, commitSha } = snapshot.repository;
  const { evidenceSchemaVersion, promptVersion, language, capabilityClass } =
    snapshot;
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
    typeof evidenceSchemaVersion !== "string" ||
    !VERSION_PATTERN.test(evidenceSchemaVersion) ||
    containsCredentialLikeValue(evidenceSchemaVersion) ||
    typeof promptVersion !== "string" ||
    !VERSION_PATTERN.test(promptVersion) ||
    containsCredentialLikeValue(promptVersion) ||
    (language !== "en" && language !== "zh-CN") ||
    (capabilityClass !== "auto" && capabilityClass !== "multi-model")
  ) {
    return null;
  }
  const key: Omit<CanonicalKey, "serialized"> = {
    owner: owner.toLocaleLowerCase("en-US"),
    repo: repo.toLocaleLowerCase("en-US"),
    commitSha,
    evidenceSchemaVersion,
    promptVersion,
    language: language === "en" ? "en" : "zh-CN",
    capabilityClass: capabilityClass === "auto" ? "auto" : "multi-model",
  };
  return {
    ...key,
    serialized: JSON.stringify([
      key.owner,
      key.repo,
      key.commitSha,
      key.evidenceSchemaVersion,
      key.promptVersion,
      key.language,
      key.capabilityClass,
    ]),
  };
}

function statementArguments(key: CanonicalKey): readonly string[] {
  return [
    key.owner,
    key.repo,
    key.commitSha,
    key.evidenceSchemaVersion,
    key.promptVersion,
    key.language,
    key.capabilityClass,
  ];
}

function narrativeRetentionIsSafe(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (
        containsPotentialCredentialMaterial(current) ||
        LIVE_METRIC_TEXT_PATTERN.test(current.normalize("NFKC"))
      ) {
        return false;
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (const entry of current as unknown[]) pending.push(entry);
      continue;
    }
    if (typeof current !== "object" || current === null) continue;
    for (const [key, entry] of Object.entries(current)) {
      const normalizedKey = key
        .normalize("NFKC")
        .replace(/[-_ ]/gu, "")
        .toLocaleLowerCase("en-US");
      if (
        FORBIDDEN_NARRATIVE_KEYS.has(normalizedKey) ||
        CREDENTIAL_NARRATIVE_KEY_PATTERN.test(normalizedKey) ||
        normalizedKey === "pwd" ||
        normalizedKey.endsWith("token") ||
        normalizedKey.endsWith("secret") ||
        normalizedKey.endsWith("password")
      ) {
        return false;
      }
      pending.push(entry);
    }
  }
  return true;
}

function jsonUtf8BytesAtMost(value: unknown, maximum: number): boolean {
  let bytes = 0;
  const add = (amount: number): boolean => {
    bytes += amount;
    return bytes <= maximum;
  };
  const stringBytes = (text: string): boolean => {
    if (!add(2)) return false;
    for (const character of text) {
      const point = character.codePointAt(0) ?? 0;
      const amount =
        character === '"' || character === "\\"
          ? 2
          : point <= 0x1f
            ? 6
            : Buffer.byteLength(character, "utf8");
      if (!add(amount)) return false;
    }
    return true;
  };
  const pending: Array<{ value: unknown; containerPrefix: number }> = [
    { value, containerPrefix: 0 },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || !add(current.containerPrefix)) return false;
    const item = current.value;
    if (item === null) {
      if (!add(4)) return false;
    } else if (typeof item === "boolean") {
      if (!add(item ? 4 : 5)) return false;
    } else if (typeof item === "number") {
      if (!add(String(item).length)) return false;
    } else if (typeof item === "string") {
      if (!stringBytes(item)) return false;
    } else if (Array.isArray(item)) {
      if (!add(2)) return false;
      for (let index = item.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: item[index],
          containerPrefix: index === 0 ? 0 : 1,
        });
      }
    } else if (typeof item === "object") {
      const entries = Object.entries(item);
      if (!add(2)) return false;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry === undefined || !stringBytes(entry[0]) || !add(1))
          return false;
        pending.push({ value: entry[1], containerPrefix: index === 0 ? 0 : 1 });
      }
    } else {
      return false;
    }
  }
  return true;
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
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid cache clock");
  }
  return value;
}

function column(row: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(row, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function validatedSnapshot<T>(
  value: unknown,
  snapshot: NarrativeSnapshot<T>,
): T | null {
  const detachedInput = snapshotJsonData(value);
  if (
    detachedInput === null ||
    typeof detachedInput !== "object" ||
    Array.isArray(detachedInput)
  ) {
    return null;
  }
  let accepted: T | null;
  try {
    accepted = snapshot(detachedInput);
  } catch {
    return null;
  }
  if (accepted === null) return null;
  const detachedAccepted = snapshotJsonData(accepted);
  return detachedAccepted !== null &&
    typeof detachedAccepted === "object" &&
    !Array.isArray(detachedAccepted)
    ? (detachedAccepted as T)
    : null;
}

/** Persistent cache for validated narrative drafts only. */
export class DeepNarrativeCache {
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

  constructor(options: string | DeepNarrativeCacheOptions = ":memory:") {
    const normalized: DeepNarrativeCacheOptions =
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
      DEEP_NARRATIVE_CACHE_LIMITS.totalBytes,
    );
    this.#rowBytes = Math.min(
      boundedLimit(
        normalized.limits?.rowBytes,
        DEEP_NARRATIVE_CACHE_LIMITS.rowBytes,
      ),
      this.#totalBytes,
    );
    this.#entries = boundedLimit(
      normalized.limits?.entries,
      DEEP_NARRATIVE_CACHE_LIMITS.entries,
    );

    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA trusted_schema = OFF;
      CREATE TABLE IF NOT EXISTS deep_narrative_cache (
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        evidence_schema_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        language TEXT NOT NULL,
        capability_class TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        narrative_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        PRIMARY KEY (
          owner, repo, commit_sha, evidence_schema_version,
          prompt_version, language, capability_class
        )
      ) STRICT;
    `);
    const whereKey = `
      owner = ? AND repo = ? AND commit_sha = ? AND
      evidence_schema_version = ? AND prompt_version = ? AND
      language = ? AND capability_class = ?
    `;
    this.#readRow = this.#database.prepare(`
      SELECT rowid, owner, repo, commit_sha, evidence_schema_version,
        prompt_version, language, capability_class, cache_key,
        typeof(narrative_json) AS narrative_type,
        length(CAST(narrative_json AS BLOB)) AS narrative_bytes,
        CASE
          WHEN typeof(narrative_json) = 'text'
            AND length(CAST(narrative_json AS BLOB)) <= ?
          THEN narrative_json
          ELSE NULL
        END AS narrative_json,
        saved_at, expires_at, accessed_at
      FROM deep_narrative_cache WHERE ${whereKey}
    `);
    this.#touch = this.#database.prepare(
      `UPDATE deep_narrative_cache SET accessed_at = ? WHERE ${whereKey}`,
    );
    this.#removeRow = this.#database.prepare(
      `DELETE FROM deep_narrative_cache WHERE rowid = ? AND ${whereKey}`,
    );
    this.#removeKey = this.#database.prepare(
      `DELETE FROM deep_narrative_cache WHERE ${whereKey}`,
    );
    this.#upsert = this.#database.prepare(`
      INSERT INTO deep_narrative_cache (
        owner, repo, commit_sha, evidence_schema_version, prompt_version,
        language, capability_class, cache_key, narrative_json,
        saved_at, expires_at, accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
        owner, repo, commit_sha, evidence_schema_version,
        prompt_version, language, capability_class
      ) DO UPDATE SET
        cache_key = excluded.cache_key,
        narrative_json = excluded.narrative_json,
        saved_at = excluded.saved_at,
        expires_at = excluded.expires_at,
        accessed_at = excluded.accessed_at
    `);
    this.#evict = this.#database.prepare(`
      DELETE FROM deep_narrative_cache
      WHERE rowid IN (
        SELECT rowid FROM (
          SELECT rowid,
            ROW_NUMBER() OVER (
              ORDER BY accessed_at DESC, saved_at DESC, rowid DESC
            ) AS recency_rank,
            SUM(length(CAST(narrative_json AS BLOB))) OVER (
              ORDER BY accessed_at DESC, saved_at DESC, rowid DESC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_bytes
          FROM deep_narrative_cache
        )
        WHERE recency_rank > ? OR running_bytes > ?
      )
    `);
    this.#count = this.#database.prepare(
      "SELECT COUNT(*) AS count FROM deep_narrative_cache",
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
      // A cache cleanup failure must not expose malformed cached content.
    }
  }

  read<T>(key: unknown, snapshot: NarrativeSnapshot<T>): T | null {
    this.#assertOpen();
    const normalized = canonicalKey(key);
    if (normalized === null || typeof snapshot !== "function") return null;
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
      ["evidence_schema_version", normalized.evidenceSchemaVersion],
      ["prompt_version", normalized.promptVersion],
      ["language", normalized.language],
      ["capability_class", normalized.capabilityClass],
      ["cache_key", normalized.serialized],
    ];
    const savedAt = column(row, "saved_at");
    const expiresAt = column(row, "expires_at");
    const accessedAt = column(row, "accessed_at");
    const narrativeType = column(row, "narrative_type");
    const narrativeBytes = column(row, "narrative_bytes");
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
      expiresAt !== savedAt + DEEP_NARRATIVE_CACHE_LIMITS.ttlMs ||
      expiresAt <= now ||
      narrativeType !== "text" ||
      typeof narrativeBytes !== "number" ||
      !Number.isSafeInteger(narrativeBytes) ||
      narrativeBytes < 2 ||
      narrativeBytes > this.#rowBytes;
    if (invalidMetadata) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    const narrativeJson = column(row, "narrative_json");
    if (
      typeof narrativeJson !== "string" ||
      Buffer.byteLength(narrativeJson, "utf8") !== narrativeBytes
    ) {
      this.#deleteRow(rowid, normalized);
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseStrictJsonObject(narrativeJson, this.#rowBytes);
    } catch {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    if (!narrativeRetentionIsSafe(parsed)) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    const accepted = validatedSnapshot(parsed, snapshot);
    let acceptedJson: string | null;
    try {
      acceptedJson = accepted === null ? null : JSON.stringify(accepted);
    } catch {
      acceptedJson = null;
    }
    if (
      accepted === null ||
      acceptedJson !== narrativeJson ||
      !jsonUtf8BytesAtMost(accepted, this.#rowBytes) ||
      !narrativeRetentionIsSafe(accepted)
    ) {
      this.#deleteRow(rowid, normalized);
      return null;
    }
    try {
      this.#touch.run(now, ...statementArguments(normalized));
    } catch {
      // Access recency is best effort; the validated value remains safe to use.
    }
    return accepted;
  }

  write<T>(
    key: unknown,
    value: unknown,
    snapshot: NarrativeSnapshot<T>,
  ): boolean {
    this.#assertOpen();
    const normalized = canonicalKey(key);
    if (normalized === null || typeof snapshot !== "function") return false;
    const accepted = validatedSnapshot(value, snapshot);
    if (
      accepted === null ||
      !jsonUtf8BytesAtMost(accepted, this.#rowBytes) ||
      !narrativeRetentionIsSafe(accepted)
    ) {
      return false;
    }
    let narrativeJson: string;
    try {
      narrativeJson = JSON.stringify(accepted);
    } catch {
      return false;
    }
    if (Buffer.byteLength(narrativeJson, "utf8") > this.#rowBytes) return false;
    const now = validNow(this.#now());
    const expiresAt = now + DEEP_NARRATIVE_CACHE_LIMITS.ttlMs;
    if (!Number.isSafeInteger(expiresAt)) return false;

    let transactionStarted = false;
    try {
      this.#database.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      this.#upsert.run(
        ...statementArguments(normalized),
        normalized.serialized,
        narrativeJson,
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
          // The cache is optional and failure does not alter the validated value.
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
