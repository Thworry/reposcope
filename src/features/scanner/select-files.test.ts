import { describe, expect, it } from "vitest";

import { SELECTION_TREE_ENTRIES } from "../../test/fixtures/github";
import type { RawTreeEntry } from "../github/raw-model";
import { selectFiles } from "./select-files";
import { normalizeTree } from "./tree";

const sha = (value: number) => value.toString(16).padStart(40, "0");

function shuffled<T>(input: readonly T[], order: readonly number[]): T[] {
  return order
    .map((index) => input[index])
    .filter((value) => value !== undefined);
}

describe("selectFiles", () => {
  it("assigns exact priority tiers and samples supported source areas round-robin", () => {
    const plan = selectFiles(normalizeTree(SELECTION_TREE_ENTRIES, false), {
      maxFiles: 10,
      maxBytes: 4_000,
      maxFileBytes: 500,
    });

    expect(
      plan.selected.map(({ path, priority, topLevelArea }) => ({
        path,
        priority,
        topLevelArea,
      })),
    ).toEqual([
      { path: "README.md", priority: 1, topLevelArea: "root" },
      { path: "package.json", priority: 2, topLevelArea: "root" },
      { path: "src/index.ts", priority: 3, topLevelArea: "root" },
      { path: "tests/core.test.ts", priority: 4, topLevelArea: "core" },
      { path: "src/core/a.ts", priority: 5, topLevelArea: "core" },
      { path: "src/data/a.ts", priority: 5, topLevelArea: "data" },
      { path: "src/ui/a.ts", priority: 5, topLevelArea: "ui" },
      { path: "src/core/b.ts", priority: 5, topLevelArea: "core" },
      { path: "src/data/b.ts", priority: 5, topLevelArea: "data" },
      { path: "src/ui/b.ts", priority: 5, topLevelArea: "ui" },
    ]);
    expect(plan.limitReached).toBe(true);
    expect(plan.skipCounts).toMatchObject({
      excluded: 2,
      binary: 1,
      oversized: 1,
      unsupported: 1,
      budget: 1,
      "invalid-entry": 0,
    });

    const completePlan = selectFiles(
      normalizeTree(SELECTION_TREE_ENTRIES, false),
      { maxFiles: 16, maxBytes: 4_000, maxFileBytes: 500 },
    );
    expect(completePlan.selected.at(-1)).toMatchObject({
      path: "docs/details.md",
      priority: 6,
    });
  });

  it("is reproducible after hostile input order changes", () => {
    const indexes = SELECTION_TREE_ENTRIES.map((_entry, index) => index);
    const first = selectFiles(
      normalizeTree(shuffled(SELECTION_TREE_ENTRIES, indexes), false),
      { maxFiles: 8, maxBytes: 2_000, maxFileBytes: 500 },
    );
    const second = selectFiles(
      normalizeTree(shuffled(SELECTION_TREE_ENTRIES, indexes.reverse()), false),
      { maxFiles: 8, maxBytes: 2_000, maxFileBytes: 500 },
    );

    expect(first).toEqual(second);
    expect(
      new Set(first.selected.map((file) => file.topLevelArea)).size,
    ).toBeGreaterThan(1);
  });

  it("reports eligible, unsupported, selected, and skipped byte/file accounting", () => {
    const plan = selectFiles(normalizeTree(SELECTION_TREE_ENTRIES, true), {
      maxFiles: 8,
      maxBytes: 2_000,
      maxFileBytes: 500,
    });

    expect(plan.treeComplete).toBe(false);
    expect(plan.eligibleFiles).toBe(11);
    expect(plan.eligibleBytes).toBe(1_440);
    expect(plan.unsupportedFiles).toBe(1);
    expect(plan.unsupportedBytes).toBe(120);
    expect(plan.selectedFiles).toBe(8);
    expect(plan.selectedBytes).toBe(
      plan.selected.reduce((total, file) => total + file.size, 0),
    );
    expect(plan.skipped).toHaveLength(
      Object.values(plan.skipCounts).reduce((total, count) => total + count, 0),
    );
  });

  it("does not double-count excluded recognized source as unsupported", () => {
    const plan = selectFiles(
      normalizeTree(
        [
          {
            path: "vendor/main.go",
            mode: "100644",
            type: "blob",
            sha: sha(1),
            size: 100,
          },
        ],
        false,
      ),
    );

    expect(plan.unsupportedFiles).toBe(0);
    expect(plan.unsupportedBytes).toBe(0);
    expect(plan.skipCounts.excluded).toBe(1);
    expect(plan.skipCounts.unsupported).toBe(0);
  });

  it("allows exact boundaries and enforces supplied byte, file, and per-file limits", () => {
    const entries: RawTreeEntry[] = [
      {
        path: "a.ts",
        mode: "100644",
        type: "blob",
        sha: sha(1),
        size: 500,
      },
      {
        path: "b.ts",
        mode: "100644",
        type: "blob",
        sha: sha(2),
        size: 500,
      },
      {
        path: "c.ts",
        mode: "100644",
        type: "blob",
        sha: sha(3),
        size: 501,
      },
    ];
    const plan = selectFiles(normalizeTree(entries, false), {
      maxFiles: 2,
      maxBytes: 1_000,
      maxFileBytes: 500,
    });

    expect(plan.selected.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
    expect(plan.selectedBytes).toBe(1_000);
    expect(plan.skipCounts.oversized).toBe(1);
    expect(plan.skipCounts.budget).toBe(0);
  });

  it("uses the exact hard defaults of 200 files, 10 MiB, and 256 KiB", () => {
    const entries: RawTreeEntry[] = Array.from(
      { length: 202 },
      (_value, index) => ({
        path: `src/area-${String(index).padStart(3, "0")}/file.ts`,
        mode: "100644" as const,
        type: "blob" as const,
        sha: sha(index + 1),
        size: index === 201 ? 262_145 : 52_166,
      }),
    );

    const plan = selectFiles(normalizeTree(entries, false));

    expect(plan.selectedFiles).toBe(200);
    expect(plan.selectedBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(plan.skipCounts.oversized).toBe(1);
    expect(plan.skipCounts.budget).toBe(1);
    expect(plan.limitReached).toBe(true);
  });

  it("validates custom limits instead of silently accepting unsafe values", () => {
    const tree = normalizeTree([], false);

    expect(() => selectFiles(tree, { maxFiles: 0 })).toThrow(
      "Invalid selection limit",
    );
    expect(() => selectFiles(tree, { maxBytes: Number.NaN })).toThrow(
      "Invalid selection limit",
    );
    expect(() => selectFiles(tree, { maxFileBytes: 262_145 })).toThrow(
      "Invalid selection limit",
    );
  });
});
