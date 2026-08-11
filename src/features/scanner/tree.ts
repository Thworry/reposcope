import type { NormalizedTree, NormalizedTreeFile } from "../analysis/model";
import type { RawTreeEntry } from "../github/raw-model";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
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
  const paths = new Set<string>();

  for (const rawEntry of entries as readonly unknown[]) {
    if (!isRecord(rawEntry)) {
      throw new Error("Invalid tree entry");
    }

    const path = assertPath(rawEntry.path);
    const sha = assertSha(rawEntry.sha);

    if (paths.has(path)) {
      throw new Error("Duplicate tree path");
    }
    paths.add(path);

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
      compareText(left.path, right.path) || compareText(left.sha, right.sha),
  );
  skippedEntries.sort((left, right) => compareText(left.path, right.path));

  return { files, complete: !truncated, skippedEntries };
}
