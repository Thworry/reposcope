import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  DEEP_NARRATIVE_CACHE_LIMITS,
  DeepNarrativeCache,
} from "./deep-narrative-cache.js";

const SHA = "a".repeat(40);
const README_FIXTURE = "UNREFERENCED README PROSE MUST NEVER REACH SQLITE";

function cacheKey(
  overrides: Partial<{
    owner: string;
    repo: string;
    commitSha: string;
    evidenceSchemaVersion: string;
    promptVersion: string;
    language: "en" | "zh-CN";
    capabilityClass: "auto" | "multi-model";
  }> = {},
) {
  return {
    repository: {
      owner: overrides.owner ?? "Owner",
      repo: overrides.repo ?? "Repo",
      commitSha: overrides.commitSha ?? SHA,
    },
    evidenceSchemaVersion: overrides.evidenceSchemaVersion ?? "1.0.0",
    promptVersion: overrides.promptVersion ?? "panel-1",
    language: overrides.language ?? ("en" as const),
    capabilityClass: overrides.capabilityClass ?? ("auto" as const),
  };
}

interface DraftFixture {
  schemaVersion: "1.0.0";
  language: "en" | "zh-CN";
  orientation: { summary: string };
}

function draftSnapshot(value: unknown): DraftFixture | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  const orientation = record.orientation;
  if (
    record.schemaVersion !== "1.0.0" ||
    (record.language !== "en" && record.language !== "zh-CN") ||
    typeof orientation !== "object" ||
    orientation === null ||
    Array.isArray(orientation) ||
    typeof (orientation as Record<string, unknown>).summary !== "string"
  ) {
    return null;
  }
  return {
    schemaVersion: "1.0.0",
    language: record.language,
    orientation: {
      summary: (orientation as Record<string, unknown>).summary as string,
    },
  };
}

function draft(summary = "A bounded human-readable explanation"): DraftFixture {
  return {
    schemaVersion: "1.0.0",
    language: "en",
    orientation: { summary },
  };
}

function sqliteContains(database: DatabaseSync, text: string): boolean {
  return Buffer.from(database.serialize()).includes(Buffer.from(text, "utf8"));
}

describe("DeepNarrativeCache", () => {
  it("uses WAL for a file-backed database and closes idempotently", () => {
    const directory = mkdtempSync(join(tmpdir(), "reposcope-cache-"));
    const database = new DatabaseSync(join(directory, "cache.sqlite"));
    try {
      const cache = new DeepNarrativeCache({
        database,
        now: () => 1_800_000_000_000,
      });
      const row = database.prepare("PRAGMA journal_mode").get() as
        Record<string, unknown> | undefined;

      expect(row?.journal_mode).toBe("wal");
      cache.close();
      cache.close();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("always closes a database it creates, even when ownership is opted out", () => {
    const directory = mkdtempSync(join(tmpdir(), "reposcope-owned-cache-"));
    const descriptor = Object.getOwnPropertyDescriptor(
      DatabaseSync.prototype,
      "close",
    );
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("DatabaseSync.close descriptor is unavailable");
    }
    let closes = 0;
    Object.defineProperty(DatabaseSync.prototype, "close", {
      ...descriptor,
      value: function (this: DatabaseSync, ...parameters: unknown[]) {
        closes += 1;
        Reflect.apply(
          descriptor.value as (...values: unknown[]) => void,
          this,
          parameters,
        );
      },
    });
    try {
      const cache = new DeepNarrativeCache({
        path: join(directory, "cache.sqlite"),
        ownDatabase: false,
      });

      cache.close();
      cache.close();
      expect(closes).toBe(1);
    } finally {
      Object.defineProperty(DatabaseSync.prototype, "close", descriptor);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("round-trips a detached validated draft and strips caller-only evidence", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({
      database,
      now: () => 1_800_000_000_000,
    });
    const input = { ...draft(), unusedReadme: README_FIXTURE };

    expect(cache.write(cacheKey(), input, draftSnapshot)).toBe(true);
    const result = cache.read(
      cacheKey({ owner: "owner", repo: "repo" }),
      draftSnapshot,
    );

    expect(result).toEqual(draft());
    expect(result).not.toBe(input);
    expect(sqliteContains(database, README_FIXTURE)).toBe(false);
    expect(
      sqliteContains(database, "A bounded human-readable explanation"),
    ).toBe(true);
    cache.close();
    database.close();
  });

  it("isolates every repository, commit, schema, prompt, language, and capability key", () => {
    let now = 1_800_000_000_000;
    const cache = new DeepNarrativeCache({ now: () => now });
    expect(cache.write(cacheKey(), draft(), draftSnapshot)).toBe(true);
    const differentKeys = [
      cacheKey({ owner: "Another" }),
      cacheKey({ repo: "Another" }),
      cacheKey({ commitSha: "b".repeat(40) }),
      cacheKey({ evidenceSchemaVersion: "2.0.0" }),
      cacheKey({ promptVersion: "panel-2" }),
      cacheKey({ language: "zh-CN" }),
      cacheKey({ capabilityClass: "multi-model" }),
    ];
    for (const key of differentKeys)
      expect(cache.read(key, draftSnapshot)).toBeNull();
    now += 1;
    expect(cache.read(cacheKey(), draftSnapshot)).toEqual(draft());
    cache.close();
  });

  it("deletes malformed, future-dated, expired, and key-mismatched rows", () => {
    const cases = [
      (database: DatabaseSync, now: number) => {
        void now;
        return database
          .prepare("UPDATE deep_narrative_cache SET narrative_json = ?")
          .run("[]");
      },
      (database: DatabaseSync, now: number) =>
        database
          .prepare(
            "UPDATE deep_narrative_cache SET saved_at = ?, accessed_at = ?, expires_at = ?",
          )
          .run(now + 1, now + 1, now + 1 + DEEP_NARRATIVE_CACHE_LIMITS.ttlMs),
      (database: DatabaseSync, now: number) =>
        database
          .prepare(
            "UPDATE deep_narrative_cache SET saved_at = ?, accessed_at = ?, expires_at = ?",
          )
          .run(now - DEEP_NARRATIVE_CACHE_LIMITS.ttlMs, now - 1, now),
      (database: DatabaseSync) =>
        database
          .prepare("UPDATE deep_narrative_cache SET cache_key = ?")
          .run("mismatch"),
    ];

    for (const corrupt of cases) {
      const now = 1_800_000_000_000;
      const database = new DatabaseSync(":memory:");
      const cache = new DeepNarrativeCache({ database, now: () => now });
      expect(cache.write(cacheKey(), draft(), draftSnapshot)).toBe(true);
      corrupt(database, now);

      expect(cache.read(cacheKey(), draftSnapshot)).toBeNull();
      expect(cache.count()).toBe(0);
      cache.close();
      database.close();
    }
  });

  it("uses access recency for bounded LRU-style eviction", () => {
    let now = 1_800_000_000_000;
    const cache = new DeepNarrativeCache({
      now: () => now,
      limits: { entries: 2 },
    });
    expect(
      cache.write(cacheKey({ repo: "one" }), draft("one"), draftSnapshot),
    ).toBe(true);
    now += 1;
    expect(
      cache.write(cacheKey({ repo: "two" }), draft("two"), draftSnapshot),
    ).toBe(true);
    now += 1;
    expect(cache.read(cacheKey({ repo: "one" }), draftSnapshot)).not.toBeNull();
    now += 1;
    expect(
      cache.write(cacheKey({ repo: "three" }), draft("three"), draftSnapshot),
    ).toBe(true);

    expect(cache.count()).toBe(2);
    expect(cache.read(cacheKey({ repo: "one" }), draftSnapshot)).not.toBeNull();
    expect(cache.read(cacheKey({ repo: "two" }), draftSnapshot)).toBeNull();
    expect(
      cache.read(cacheKey({ repo: "three" }), draftSnapshot),
    ).not.toBeNull();
    cache.close();
  });

  it("enforces an aggregate UTF-8 byte budget in recency order", () => {
    let now = 1_800_000_000_000;
    const first = draft("a".repeat(96));
    const second = draft("b".repeat(96));
    const rowBytes = Buffer.byteLength(JSON.stringify(first), "utf8");
    const cache = new DeepNarrativeCache({
      now: () => now,
      limits: {
        rowBytes: 1_024,
        entries: 10,
        totalBytes: rowBytes * 2 - 1,
      },
    });

    expect(cache.write(cacheKey({ repo: "one" }), first, draftSnapshot)).toBe(
      true,
    );
    now += 1;
    expect(cache.write(cacheKey({ repo: "two" }), second, draftSnapshot)).toBe(
      true,
    );

    expect(cache.count()).toBe(1);
    expect(cache.read(cacheKey({ repo: "one" }), draftSnapshot)).toBeNull();
    expect(cache.read(cacheKey({ repo: "two" }), draftSnapshot)).toEqual(
      second,
    );
    cache.close();
  });

  it("reads metadata and content from one SQLite snapshot", () => {
    const now = 1_800_000_000_000;
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({ database, now: () => now });
    const firstKey = cacheKey({ repo: "First" });
    const replacementKey = cacheKey({ repo: "Replacement" });
    const first = draft("first repository narrative");
    const replacement = draft("replacement repository narrative");
    expect(cache.write(firstKey, first, draftSnapshot)).toBe(true);

    const descriptor = Object.getOwnPropertyDescriptor(
      StatementSync.prototype,
      "get",
    );
    if (descriptor === undefined || typeof descriptor.value !== "function") {
      throw new Error("StatementSync.get descriptor is unavailable");
    }
    let replaceAfterRead = true;
    Object.defineProperty(StatementSync.prototype, "get", {
      ...descriptor,
      value: function (this: StatementSync, ...parameters: unknown[]) {
        const row = Reflect.apply(
          descriptor.value as (...values: unknown[]) => unknown,
          this,
          parameters,
        );
        if (replaceAfterRead) {
          replaceAfterRead = false;
          database.exec("DELETE FROM deep_narrative_cache");
          database
            .prepare(
              `
              INSERT INTO deep_narrative_cache (
                rowid, owner, repo, commit_sha, evidence_schema_version,
                prompt_version, language, capability_class, cache_key,
                narrative_json, saved_at, expires_at, accessed_at
              ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            )
            .run(
              "owner",
              "replacement",
              SHA,
              "1.0.0",
              "panel-1",
              "en",
              "auto",
              JSON.stringify([
                "owner",
                "replacement",
                SHA,
                "1.0.0",
                "panel-1",
                "en",
                "auto",
              ]),
              JSON.stringify(replacement),
              now,
              now + DEEP_NARRATIVE_CACHE_LIMITS.ttlMs,
              now,
            );
        }
        return row;
      },
    });
    let result: DraftFixture | null;
    try {
      result = cache.read(firstKey, draftSnapshot);
    } finally {
      Object.defineProperty(StatementSync.prototype, "get", descriptor);
    }

    expect(result).toEqual(first);
    expect(cache.read(replacementKey, draftSnapshot)).toEqual(replacement);
    cache.close();
    database.close();
  });

  it("deletes a database row whose UTF-8 value exceeds the configured bound", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({
      database,
      now: () => 1_800_000_000_000,
      limits: { rowBytes: 256 },
    });
    expect(cache.write(cacheKey(), draft("short"), draftSnapshot)).toBe(true);
    database
      .prepare("UPDATE deep_narrative_cache SET narrative_json = ?")
      .run(`{"padding":"${"x".repeat(300)}"}`);

    expect(cache.read(cacheKey(), draftSnapshot)).toBeNull();
    expect(cache.count()).toBe(0);
    cache.close();
    database.close();
  });

  it("deletes a row containing fields outside the validated narrative snapshot", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({
      database,
      now: () => 1_800_000_000_000,
    });
    expect(cache.write(cacheKey(), draft(), draftSnapshot)).toBe(true);
    database
      .prepare("UPDATE deep_narrative_cache SET narrative_json = ?")
      .run(JSON.stringify({ ...draft(), unusedReadme: README_FIXTURE }));

    expect(cache.read(cacheKey(), draftSnapshot)).toBeNull();
    expect(cache.count()).toBe(0);
    cache.close();
    database.close();
  });

  it("does not roll back an injected database transaction it did not start", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({
      database,
      now: () => 1_800_000_000_000,
    });
    database.exec("CREATE TABLE caller_state (value TEXT); BEGIN IMMEDIATE");
    database.prepare("INSERT INTO caller_state VALUES (?)").run("preserved");

    expect(cache.write(cacheKey(), draft(), draftSnapshot)).toBe(false);
    database.exec("COMMIT");
    expect(
      database.prepare("SELECT value FROM caller_state").get()?.value,
    ).toBe("preserved");
    cache.close();
    database.close();
  });

  it("rejects oversize, live metrics, credentials, and accessor-bearing input", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new DeepNarrativeCache({
      database,
      now: () => 1_800_000_000_000,
      limits: { rowBytes: 512 },
    });
    expect(
      cache.write(cacheKey(), draft("x".repeat(1_024)), draftSnapshot),
    ).toBe(false);
    expect(
      cache.write(
        cacheKey(),
        { ...draft(), community: { stars: 100, forks: 10, watchers: 9 } },
        (value) => value as DraftFixture,
      ),
    ).toBe(false);
    expect(
      cache.write(
        cacheKey(),
        draft("Observed 12,345 stars and 678 forks."),
        draftSnapshot,
      ),
    ).toBe(false);
    const proceduralKey = cacheKey({ repo: "Procedural" });
    expect(
      cache.write(
        proceduralKey,
        draft(
          "Step 1. Fork the repository for local development. A token is optional without integrations.",
        ),
        draftSnapshot,
      ),
    ).toBe(true);
    expect(cache.delete(proceduralKey)).toBe(true);
    expect(
      cache.write(
        cacheKey(),
        draft("AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCD"),
        draftSnapshot,
      ),
    ).toBe(false);
    expect(
      cache.write(
        cacheKey(),
        { ...draft(), apiKey: "opaque-provider-secret-value" },
        (value) =>
          value as DraftFixture & {
            apiKey: string;
          },
      ),
    ).toBe(false);
    expect(
      cache.write(
        cacheKey(),
        { ...draft(), note: `ghp_${"a".repeat(36)}` },
        (value) => value as DraftFixture,
      ),
    ).toBe(false);
    let reads = 0;
    const hostile = Object.defineProperty({}, "repository", {
      enumerable: true,
      get() {
        reads += 1;
        return cacheKey().repository;
      },
    });
    expect(cache.read(hostile, draftSnapshot)).toBeNull();
    expect(
      cache.write(
        cacheKey({ repo: `ghp_${"a".repeat(36)}` }),
        draft(),
        draftSnapshot,
      ),
    ).toBe(false);
    expect(
      cache.write(
        cacheKey(),
        Object.defineProperty({}, "schemaVersion", {
          enumerable: true,
          get() {
            reads += 1;
            return "1.0.0";
          },
        }),
        draftSnapshot,
      ),
    ).toBe(false);
    expect(reads).toBe(0);
    expect(cache.count()).toBe(0);
    expect(sqliteContains(database, "ghp_")).toBe(false);
    cache.close();
    cache.close();
    database.close();
  });
});
