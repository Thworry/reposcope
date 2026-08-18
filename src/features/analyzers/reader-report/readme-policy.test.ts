import { describe, expect, it } from "vitest";

import { compareReadmePaths, isCanonicalReadmePath } from "./readme-policy";

describe("canonical README paths", () => {
  it.each([
    ["README.md", true],
    ["README", true],
    ["README-guide.md", true],
    ["README_a.md", true],
    ["README.zh-CN.md", true],
    [".github/README.md", true],
    ["README.exe", false],
    ["docs/README.md", false],
    ["READMEevil.md", false],
  ])("classifies %s consistently", (path, expected) => {
    expect(isCanonicalReadmePath(path)).toBe(expected);
  });

  it("orders the exact root README first under every input permutation", () => {
    const paths = [
      ".github/README.md",
      "README_a.md",
      "README-guide.md",
      "README.md",
    ];

    for (const permutation of [
      paths,
      [...paths].reverse(),
      ["README-guide.md", ".github/README.md", "README.md", "README_a.md"],
    ]) {
      expect([...permutation].sort(compareReadmePaths)).toEqual([
        "README.md",
        "README-guide.md",
        "README_a.md",
        ".github/README.md",
      ]);
    }
  });
});
