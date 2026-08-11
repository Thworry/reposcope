import { describe, expect, it } from "vitest";

import { VALID_TREE_RESPONSE } from "../../test/fixtures/github";
import type { RawTreeEntry } from "../github/raw-model";
import { normalizeTree } from "./tree";

const sha = (character: string) => character.repeat(40);

describe("normalizeTree", () => {
  it("returns a new, sorted ordinary-file list without mutating input", () => {
    const entries = [
      {
        path: "z.ts",
        mode: "100755",
        type: "blob",
        sha: sha("b"),
        size: 2,
      },
      VALID_TREE_RESPONSE.tree[1],
      VALID_TREE_RESPONSE.tree[0],
    ] as const satisfies readonly RawTreeEntry[];
    const snapshot = structuredClone(entries);

    expect(normalizeTree(entries, true)).toEqual({
      files: [
        {
          path: "README.md",
          mode: "100644",
          sha: sha("c"),
          size: 128,
        },
        { path: "z.ts", mode: "100755", sha: sha("b"), size: 2 },
      ],
      complete: false,
      skippedEntries: [],
    });
    expect(entries).toEqual(snapshot);
  });

  it("sorts by a case-insensitive normalized key while preserving original paths", () => {
    const entries = [
      { path: "z.ts", mode: "100644", type: "blob", sha: sha("c"), size: 1 },
      { path: "B.ts", mode: "100644", type: "blob", sha: sha("b"), size: 1 },
      { path: "a.ts", mode: "100644", type: "blob", sha: sha("a"), size: 1 },
    ] as const satisfies readonly RawTreeEntry[];

    const first = normalizeTree(entries, false);
    const second = normalizeTree([...entries].reverse(), false);

    expect(first.files.map((file) => file.path)).toEqual([
      "a.ts",
      "B.ts",
      "z.ts",
    ]);
    expect(second).toEqual(first);
  });

  it("excludes symlinks and submodules explicitly", () => {
    const entries = [
      {
        path: "linked.ts",
        mode: "120000",
        type: "blob",
        sha: sha("a"),
        size: 10,
      },
      {
        path: "dependency",
        mode: "160000",
        type: "commit",
        sha: sha("b"),
      },
    ] as unknown as readonly RawTreeEntry[];

    expect(normalizeTree(entries, false)).toEqual({
      files: [],
      complete: true,
      skippedEntries: [
        { path: "dependency", reason: "invalid-entry" },
        { path: "linked.ts", reason: "invalid-entry" },
      ],
    });
  });

  it("accepts absent or valid optional submodule sizes", () => {
    const entries = [
      {
        path: "dependency-a",
        mode: "160000",
        type: "commit",
        sha: sha("a"),
      },
      {
        path: "dependency-b",
        mode: "160000",
        type: "commit",
        sha: sha("b"),
        size: 0,
      },
    ] as unknown as readonly RawTreeEntry[];

    expect(normalizeTree(entries, false).skippedEntries).toEqual([
      { path: "dependency-a", reason: "invalid-entry" },
      { path: "dependency-b", reason: "invalid-entry" },
    ]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects hostile optional submodule size %s",
    (size) => {
      expect(() =>
        normalizeTree(
          [
            {
              path: "dependency",
              mode: "160000",
              type: "commit",
              sha: sha("a"),
              size,
            },
          ] as unknown as readonly RawTreeEntry[],
          false,
        ),
      ).toThrow("Invalid tree size");
    },
  );

  it.each([
    ["empty", ""],
    ["leading slash", "/src/a.ts"],
    ["empty segment", "src//a.ts"],
    ["dot segment", "src/./a.ts"],
    ["dot-dot segment", "src/../a.ts"],
    ["backslash", "src\\a.ts"],
    ["NUL", "src/\0a.ts"],
    ["control", "src/\u001fa.ts"],
    ["Arabic letter mark", "src/\u061ca.ts"],
    ["left-to-right mark", "src/\u200ea.ts"],
    ["right-to-left mark", "src/\u200fa.ts"],
    ["line separator", "src/\u2028a.ts"],
    ["paragraph separator", "src/\u2029a.ts"],
    ["bidi embedding", "src/\u202aa.ts"],
    ["bidi override", "src/\u202ea.ts"],
    ["bidi isolate", "src/\u2066a.ts"],
    ["bidi isolate terminator", "src/\u2069a.ts"],
  ])("rejects a hostile %s path", (_label, path) => {
    expect(() =>
      normalizeTree(
        [
          {
            path,
            mode: "100644",
            type: "blob",
            sha: sha("a"),
            size: 1,
          },
        ],
        false,
      ),
    ).toThrow("Invalid tree path");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "rejects hostile size %s",
    (size) => {
      expect(() =>
        normalizeTree(
          [
            {
              path: "a.ts",
              mode: "100644",
              type: "blob",
              sha: sha("a"),
              size,
            },
          ],
          false,
        ),
      ).toThrow("Invalid tree size");
    },
  );

  it("rejects malformed ordinary files and duplicate normalized paths", () => {
    expect(() =>
      normalizeTree(
        [
          {
            path: "a.ts",
            mode: "100600",
            type: "blob",
            sha: sha("a"),
            size: 1,
          },
        ] as unknown as readonly RawTreeEntry[],
        false,
      ),
    ).toThrow("Invalid tree mode");
    expect(() =>
      normalizeTree(
        [
          {
            path: "a.ts",
            mode: "100644",
            type: "blob",
            sha: sha("a"),
            size: 1,
          },
          {
            path: "a.ts",
            mode: "100755",
            type: "blob",
            sha: sha("b"),
            size: 2,
          },
        ],
        false,
      ),
    ).toThrow("Duplicate tree path");
    expect(() =>
      normalizeTree(
        [
          {
            path: "Src/File.ts",
            mode: "100644",
            type: "blob",
            sha: sha("a"),
            size: 1,
          },
          {
            path: "src/file.TS",
            mode: "100644",
            type: "blob",
            sha: sha("b"),
            size: 2,
          },
        ],
        false,
      ),
    ).toThrow("Duplicate tree path");
  });

  it("accepts ordinary Unicode and emoji paths", () => {
    expect(
      normalizeTree(
        [
          {
            path: "src/质量😀.ts",
            mode: "100644",
            type: "blob",
            sha: sha("a"),
            size: 1,
          },
        ],
        false,
      ).files[0]?.path,
    ).toBe("src/质量😀.ts");
  });

  it("rejects malformed SHA and non-boolean truncation evidence", () => {
    expect(() =>
      normalizeTree(
        [
          {
            path: "a.ts",
            mode: "100644",
            type: "blob",
            sha: "not-a-sha",
            size: 1,
          },
        ],
        false,
      ),
    ).toThrow("Invalid tree SHA");
    expect(() => normalizeTree([], "false" as unknown as boolean)).toThrow(
      "Invalid tree completeness",
    );
  });
});
