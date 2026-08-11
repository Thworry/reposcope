import type { NormalizedTree, NormalizedTreeFile } from "../analysis/model";
import type { RawTreeEntry } from "../github/raw-model";
import { toPathComparisonKey } from "./file-registry";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePath(left: string, right: string): number {
  return (
    compareText(toPathComparisonKey(left), toPathComparisonKey(right)) ||
    compareText(left, right)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/")
  ) {
    throw new Error("Invalid tree path");
  }

  const hasUnsafeCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);

    return (
      character === "\\" ||
      codePoint === undefined ||
      codePoint <= 31 ||
      (codePoint >= 127 && codePoint <= 159) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    );
  });

  if (
    hasUnsafeCharacter ||
    value
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid tree path");
  }

  return value;
}

function assertSha(value: unknown): string {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error("Invalid tree SHA");
  }

  return value;
}

function assertSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error("Invalid tree size");
  }

  return value;
}

export function normalizeTree(
  entries: readonly RawTreeEntry[],
  truncated: boolean,
): NormalizedTree {
  if (!Array.isArray(entries)) {
    throw new Error("Invalid tree entries");
  }

  if (typeof truncated !== "boolean") {
    throw new Error("Invalid tree completeness");
  }

  const files: NormalizedTreeFile[] = [];
  const skippedEntries: NormalizedTree["skippedEntries"] = [];
  const pathKeys = new Set<string>();

  for (const rawEntry of entries as readonly unknown[]) {
    if (!isRecord(rawEntry)) {
      throw new Error("Invalid tree entry");
    }

    const path = assertPath(rawEntry.path);
    const sha = assertSha(rawEntry.sha);
    const pathKey = toPathComparisonKey(path);

    if (pathKeys.has(pathKey)) {
      throw new Error("Duplicate tree path");
    }
    pathKeys.add(pathKey);

    if (rawEntry.type === "tree") {
      if (rawEntry.mode !== "040000") {
        throw new Error("Invalid tree mode");
      }

      if (rawEntry.size !== undefined) {
        assertSize(rawEntry.size);
      }
      continue;
    }

    if (rawEntry.type === "commit" && rawEntry.mode === "160000") {
      if (Object.prototype.hasOwnProperty.call(rawEntry, "size")) {
        assertSize(rawEntry.size);
      }
      skippedEntries.push({ path, reason: "invalid-entry" });
      continue;
    }

    if (rawEntry.type !== "blob") {
      throw new Error("Invalid tree entry");
    }

    const size = assertSize(rawEntry.size);

    if (rawEntry.mode === "120000") {
      skippedEntries.push({ path, reason: "invalid-entry" });
      continue;
    }

    if (rawEntry.mode !== "100644" && rawEntry.mode !== "100755") {
      throw new Error("Invalid tree mode");
    }

    files.push({ path, sha, size, mode: rawEntry.mode });
  }

  files.sort(
    (left, right) =>
      compareText(
        toPathComparisonKey(left.path),
        toPathComparisonKey(right.path),
      ) ||
      compareText(left.sha, right.sha) ||
      compareText(left.path, right.path),
  );
  skippedEntries.sort((left, right) => comparePath(left.path, right.path));

  return { files, complete: !truncated, skippedEntries };
}
