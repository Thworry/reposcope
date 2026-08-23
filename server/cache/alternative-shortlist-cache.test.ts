import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  ALTERNATIVE_SHORTLIST_CACHE_LIMITS,
  AlternativeShortlistCache,
} from "./alternative-shortlist-cache.js";

const SHA = "a".repeat(40);

function cacheKey(
  overrides: Partial<{
    owner: string;
    repo: string;
    commitSha: string;
    strategyVersion: string;
  }> = {},
) {
  return {
    repository: {
      owner: overrides.owner ?? "Owner",
      repo: overrides.repo ?? "Source",
      commitSha: overrides.commitSha ?? SHA,
    },
    strategyVersion: overrides.strategyVersion ?? "alternatives-1",
  };
}

function repository(
  owner = "Example",
  repo = "Project",
  description = "Comparable project",
) {
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description,
    topics: ["tooling"],
    homepage: "https://example.com",
    archived: false,
    defaultBranch: "main",
    pushedAt: "2026-08-20T10:00:00.000Z",
    starsCount: 100,
    watchersCount: 9,
    forksCount: 10,
    openIssuesCount: 3,
    licenseSpdxId: "MIT",
  };
}

describe("AlternativeShortlistCache", () => {
  it("always closes a database it creates, even when ownership is opted out", () => {
    const directory = mkdtempSync(join(tmpdir(), "reposcope-owned-alts-"));
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
      const cache = new AlternativeShortlistCache({
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

  it("round-trips detached frozen verified public repository facts", () => {
    const cache = new AlternativeShortlistCache({
      now: () => 1_800_000_000_000,
    });
    const source = [repository()];

    expect(cache.write(cacheKey(), source)).toBe(true);
    Object.assign(source[0] ?? {}, { starsCount: 999 });
    const result = cache.read(cacheKey({ owner: "owner", repo: "source" }));

    expect(result?.[0]?.starsCount).toBe(100);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.[0])).toBe(true);
    expect(Object.isFrozen(result?.[0]?.topics)).toBe(true);
    cache.close();
  });

  it("isolates source repository, commit, and strategy version", () => {
    const cache = new AlternativeShortlistCache({
      now: () => 1_800_000_000_000,
    });
    expect(cache.write(cacheKey(), [repository()])).toBe(true);
    expect(cache.read(cacheKey({ owner: "Other" }))).toBeNull();
    expect(cache.read(cacheKey({ repo: "Other" }))).toBeNull();
    expect(cache.read(cacheKey({ commitSha: "b".repeat(40) }))).toBeNull();
    expect(
      cache.read(cacheKey({ strategyVersion: "alternatives-2" })),
    ).toBeNull();
    cache.close();
  });

  it("deletes malformed, future-dated, expired, and key-mismatched rows", () => {
    const cases = [
      (database: DatabaseSync, now: number) => {
        void now;
        return database
          .prepare("UPDATE alternative_shortlist_cache SET shortlist_json = ?")
          .run("{}");
      },
      (database: DatabaseSync, now: number) =>
        database
          .prepare(
            "UPDATE alternative_shortlist_cache SET saved_at = ?, accessed_at = ?, expires_at = ?",
          )
          .run(
            now + 1,
            now + 1,
            now + 1 + ALTERNATIVE_SHORTLIST_CACHE_LIMITS.ttlMs,
          ),
      (database: DatabaseSync, now: number) =>
        database
          .prepare(
            "UPDATE alternative_shortlist_cache SET saved_at = ?, accessed_at = ?, expires_at = ?",
          )
          .run(now - ALTERNATIVE_SHORTLIST_CACHE_LIMITS.ttlMs, now - 1, now),
      (database: DatabaseSync) =>
        database
          .prepare("UPDATE alternative_shortlist_cache SET cache_key = ?")
          .run("mismatch"),
    ];
    for (const corrupt of cases) {
      const now = 1_800_000_000_000;
      const database = new DatabaseSync(":memory:");
      const cache = new AlternativeShortlistCache({ database, now: () => now });
      expect(cache.write(cacheKey(), [repository()])).toBe(true);
      corrupt(database, now);

      expect(cache.read(cacheKey())).toBeNull();
      expect(cache.count()).toBe(0);
      cache.close();
      database.close();
    }
  });

  it("evicts the least recently used shortlist at a bounded entry count", () => {
    let now = 1_800_000_000_000;
    const cache = new AlternativeShortlistCache({
      now: () => now,
      limits: { entries: 2 },
    });
    expect(
      cache.write(cacheKey({ repo: "one" }), [repository("A", "One")]),
    ).toBe(true);
    now += 1;
    expect(
      cache.write(cacheKey({ repo: "two" }), [repository("B", "Two")]),
    ).toBe(true);
    now += 1;
    expect(cache.read(cacheKey({ repo: "one" }))).not.toBeNull();
    now += 1;
    expect(
      cache.write(cacheKey({ repo: "three" }), [repository("C", "Three")]),
    ).toBe(true);

    expect(cache.count()).toBe(2);
    expect(cache.read(cacheKey({ repo: "one" }))).not.toBeNull();
    expect(cache.read(cacheKey({ repo: "two" }))).toBeNull();
    expect(cache.read(cacheKey({ repo: "three" }))).not.toBeNull();
    cache.close();
  });

  it("enforces an aggregate UTF-8 byte budget in recency order", () => {
    let now = 1_800_000_000_000;
    const first = [repository("A", "One", "a".repeat(96))];
    const second = [repository("B", "Two", "b".repeat(96))];
    const rowBytes = Buffer.byteLength(JSON.stringify(first), "utf8");
    const cache = new AlternativeShortlistCache({
      now: () => now,
      limits: {
        rowBytes: 1_024,
        entries: 10,
        totalBytes: rowBytes * 2 - 1,
      },
    });

    expect(cache.write(cacheKey({ repo: "one" }), first)).toBe(true);
    now += 1;
    expect(cache.write(cacheKey({ repo: "two" }), second)).toBe(true);

    expect(cache.count()).toBe(1);
    expect(cache.read(cacheKey({ repo: "one" }))).toBeNull();
    expect(cache.read(cacheKey({ repo: "two" }))).toEqual(second);
    cache.close();
  });

  it("reads metadata and content from one SQLite snapshot", () => {
    const now = 1_800_000_000_000;
    const database = new DatabaseSync(":memory:");
    const cache = new AlternativeShortlistCache({ database, now: () => now });
    const firstKey = cacheKey({ repo: "First" });
    const replacementKey = cacheKey({ repo: "Replacement" });
    const first = [repository("A", "One", "first shortlist")];
    const replacement = [repository("B", "Two", "replacement shortlist")];
    expect(cache.write(firstKey, first)).toBe(true);

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
          database.exec("DELETE FROM alternative_shortlist_cache");
          database
            .prepare(
              `
              INSERT INTO alternative_shortlist_cache (
                rowid, owner, repo, commit_sha, strategy_version, cache_key,
                shortlist_json, saved_at, expires_at, accessed_at
              ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            )
            .run(
              "owner",
              "replacement",
              SHA,
              "alternatives-1",
              JSON.stringify(["owner", "replacement", SHA, "alternatives-1"]),
              JSON.stringify(replacement),
              now,
              now + ALTERNATIVE_SHORTLIST_CACHE_LIMITS.ttlMs,
              now,
            );
        }
        return row;
      },
    });
    let result: unknown;
    try {
      result = cache.read(firstKey);
    } finally {
      Object.defineProperty(StatementSync.prototype, "get", descriptor);
    }

    expect(result).toEqual(first);
    expect(cache.read(replacementKey)).toEqual(replacement);
    cache.close();
    database.close();
  });

  it("deletes a database row whose UTF-8 value exceeds the configured bound", () => {
    const database = new DatabaseSync(":memory:");
    const cache = new AlternativeShortlistCache({
      database,
      now: () => 1_800_000_000_000,
      limits: { rowBytes: 1_024 },
    });
    expect(cache.write(cacheKey(), [repository()])).toBe(true);
    database
      .prepare("UPDATE alternative_shortlist_cache SET shortlist_json = ?")
      .run(`["${"x".repeat(1_100)}"]`);

    expect(cache.read(cacheKey())).toBeNull();
    expect(cache.count()).toBe(0);
    cache.close();
    database.close();
  });

  it("accepts only credential-free HTTP(S) homepages and non-future activity", () => {
    const cache = new AlternativeShortlistCache({
      now: () => 1_800_000_000_000,
    });

    expect(cache.write(cacheKey(), [repository()])).toBe(true);
    expect(cache.delete(cacheKey())).toBe(true);
    for (const homepage of [
      "javascript:alert(1)",
      "example.com",
      "",
      "https://user:password@example.com/private",
    ]) {
      expect(cache.write(cacheKey(), [{ ...repository(), homepage }])).toBe(
        false,
      );
    }
    expect(
      cache.write(cacheKey(), [
        { ...repository(), pushedAt: "2999-01-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
    expect(cache.count()).toBe(0);
    cache.close();
  });

  it("rejects oversize, archived, duplicate, credential, and accessor input", () => {
    const cache = new AlternativeShortlistCache({
      now: () => 1_800_000_000_000,
      limits: { rowBytes: 256 },
    });
    expect(
      cache.write(cacheKey(), [repository("A", "Big", "x".repeat(1_000))]),
    ).toBe(false);
    expect(cache.write(cacheKey(), [{ ...repository(), archived: true }])).toBe(
      false,
    );
    expect(cache.write(cacheKey(), [repository("Owner", "Source")])).toBe(
      false,
    );
    expect(cache.write(cacheKey(), [repository(), repository()])).toBe(false);
    expect(
      cache.write(cacheKey(), [
        repository("A", "Token", `ghp_${"a".repeat(36)}`),
      ]),
    ).toBe(false);
    let reads = 0;
    const hostileKey = Object.defineProperty({}, "repository", {
      enumerable: true,
      get() {
        reads += 1;
        return cacheKey().repository;
      },
    });
    const hostileValue = [
      Object.defineProperty({}, "owner", {
        enumerable: true,
        get() {
          reads += 1;
          return "A";
        },
      }),
    ];
    expect(cache.read(hostileKey)).toBeNull();
    expect(cache.write(cacheKey(), hostileValue)).toBe(false);
    expect(reads).toBe(0);
    expect(cache.count()).toBe(0);
    cache.close();
    cache.close();
  });
});
