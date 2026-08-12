import { describe, expect, it } from "vitest";

import { buildImportGraph } from "./import-resolution";

describe("cross-file import resolution", () => {
  it("qualifies Python from-dot candidates against package bindings", () => {
    expect(
      buildImportGraph([
        {
          path: "pkg/__init__.py",
          language: "python",
          relativeImports: ["."],
          relativeImportCandidates: [".b"],
          topLevelDefinedNames: [],
        },
        {
          path: "pkg/b.py",
          language: "python",
          relativeImports: [".marker"],
        },
        {
          path: "pkg/marker.py",
          language: "python",
          relativeImports: [],
        },
      ]),
    ).toEqual(
      new Map([
        ["pkg/__init__.py", ["pkg/b.py"]],
        ["pkg/b.py", ["pkg/marker.py"]],
        ["pkg/marker.py", []],
      ]),
    );
  });
});
