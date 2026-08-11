import { describe, expect, it } from "vitest";

import type { ImportingFile, TokenizedFile } from "../analysis/model";
import {
  declarationImportSource,
  sourceFile,
} from "../../test/fixtures/js-ts-source";
import {
  pythonSourceFile,
  pythonStubImportSource,
} from "../../test/fixtures/python-source";
import { analyzeJavaScriptTypeScript } from "./js-ts";
import { analyzePython } from "./python";
import { computeDuplicateRatio, findCircularImports } from "./cross-file";

const WINDOW_SIZE = 50;

function sequence(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index)}`,
  );
}

function tokenizedFile(
  path: string,
  normalizedTokens: readonly string[],
  isTest = false,
): TokenizedFile {
  return { path, normalizedTokens, isTest };
}

function importingFile(
  path: string,
  language: ImportingFile["language"],
  relativeImports: readonly string[],
): ImportingFile {
  return { path, language, relativeImports };
}

describe("cross-file duplicate metrics", () => {
  it("counts one exact cross-file 50-token span in both files", () => {
    const shared = sequence("shared", WINDOW_SIZE);
    const files = [
      tokenizedFile("src/a.ts", [...shared, ...sequence("a", 950)]),
      tokenizedFile("src/b.ts", [...shared, ...sequence("b", 950)]),
    ];

    expect(computeDuplicateRatio(files)).toEqual({
      totalEligibleTokens: 2000,
      duplicatedTokens: 100,
      ratio: 0.05,
      evidence: [
        {
          leftPath: "src/a.ts",
          rightPath: "src/b.ts",
          tokenCount: 50,
        },
      ],
    });
  });

  it("extends matches maximally before counting duplicate tokens", () => {
    const shared = sequence("maximal", 60);
    const result = computeDuplicateRatio([
      tokenizedFile("src/a.ts", ["a-start", ...shared, "a-end"]),
      tokenizedFile("src/b.ts", ["b-start", ...shared, "b-end"]),
    ]);

    expect(result).toEqual({
      totalEligibleTokens: 124,
      duplicatedTokens: 120,
      ratio: 120 / 124,
      evidence: [
        {
          leftPath: "src/a.ts",
          rightPath: "src/b.ts",
          tokenCount: 60,
        },
      ],
    });
  });

  it("uses parser-normalized literals while preserving structural tokens", () => {
    const declarations = Array.from(
      { length: 20 },
      (_, index) =>
        `result += call(value, ${String(index)}, ${JSON.stringify(`left-${String(index)}`)});`,
    ).join("\n");
    const changedLiterals = Array.from(
      { length: 20 },
      (_, index) =>
        `result += call(value, ${String(index + 100)}, ${JSON.stringify(`right-${String(index)}`)});`,
    ).join("\n");
    const analyzed = analyzeJavaScriptTypeScript([
      sourceFile(
        "src/a.ts",
        `export function calculate(value: number) { let result = 0; ${declarations} return result; }`,
      ),
      sourceFile(
        "src/b.ts",
        `export function calculate(value: number) { let result = 0; ${changedLiterals} return result; }`,
      ),
    ]);
    const result = computeDuplicateRatio(analyzed.files);

    expect(result.totalEligibleTokens).toBeGreaterThanOrEqual(100);
    expect(result.duplicatedTokens).toBe(result.totalEligibleTokens);
    expect(result.ratio).toBe(1);
  });

  it("excludes tests and never compares repeated spans within one file", () => {
    const shared = sequence("repeat", WINDOW_SIZE);
    const result = computeDuplicateRatio([
      tokenizedFile("src/a.ts", [...shared, "separator", ...shared]),
      tokenizedFile("tests/a.test.ts", shared, true),
    ]);

    expect(result).toEqual({
      totalEligibleTokens: 101,
      duplicatedTokens: 0,
      ratio: 0,
      evidence: [],
    });
  });

  it("discards overlapping matches after accepting the longest candidate", () => {
    const shared = sequence("overlap", 60);
    const result = computeDuplicateRatio([
      tokenizedFile("src/a.ts", shared),
      tokenizedFile("src/b.ts", shared),
      tokenizedFile("src/c.ts", shared.slice(0, WINDOW_SIZE)),
    ]);

    expect(result).toMatchObject({
      totalEligibleTokens: 170,
      duplicatedTokens: 120,
      ratio: 120 / 170,
      evidence: [
        {
          leftPath: "src/a.ts",
          rightPath: "src/b.ts",
          tokenCount: 60,
        },
      ],
    });
  });

  it("returns the exact inclusive 10% boundary without rounding", () => {
    const shared = sequence("boundary", WINDOW_SIZE);
    const result = computeDuplicateRatio([
      tokenizedFile("src/a.ts", [...shared, ...sequence("a", 450)]),
      tokenizedFile("src/b.ts", [...shared, ...sequence("b", 450)]),
    ]);

    expect(result).toMatchObject({
      totalEligibleTokens: 1000,
      duplicatedTokens: 100,
      ratio: 0.1,
    });
  });

  it("returns zero metrics when no eligible tokens exist", () => {
    expect(
      computeDuplicateRatio([
        tokenizedFile("src/empty.ts", []),
        tokenizedFile("tests/only.test.ts", sequence("test", 80), true),
      ]),
    ).toEqual({
      totalEligibleTokens: 0,
      duplicatedTokens: 0,
      ratio: 0,
      evidence: [],
    });
  });

  it("bounds and deterministically orders path-pair evidence", () => {
    const files = Array.from({ length: 25 }, (_, pair) => {
      const shared = sequence(`pair-${String(pair)}`, WINDOW_SIZE);

      return [
        tokenizedFile(`src/${String(pair).padStart(2, "0")}-a.ts`, shared),
        tokenizedFile(`src/${String(pair).padStart(2, "0")}-b.ts`, shared),
      ];
    }).flat();
    const forward = computeDuplicateRatio(files);
    const reverse = computeDuplicateRatio([...files].reverse());

    expect(forward).toEqual(reverse);
    expect(forward.evidence).toHaveLength(20);
    expect(forward.evidence[0]).toEqual({
      leftPath: "src/00-a.ts",
      rightPath: "src/00-b.ts",
      tokenCount: 50,
    });
    expect(forward.evidence.at(-1)).toEqual({
      leftPath: "src/19-a.ts",
      rightPath: "src/19-b.ts",
      tokenCount: 50,
    });
  });

  it("does not mutate file or token ordering", () => {
    const files = [
      tokenizedFile("src/b.ts", sequence("b", 60)),
      tokenizedFile("src/a.ts", sequence("a", 60)),
    ];
    const snapshot = structuredClone(files);

    computeDuplicateRatio(files);

    expect(files).toEqual(snapshot);
  });
});

describe("relative import graph metrics", () => {
  it("resolves JavaScript explicit extensions, supported extensions, and index files", () => {
    const result = findCircularImports([
      importingFile("src/entry.ts", "typescript", [
        "./direct.ts",
        "./extensionless",
        "./folder",
        "package-name",
      ]),
      importingFile("src/direct.ts", "typescript", ["./entry"]),
      importingFile("src/extensionless.js", "javascript", ["./entry"]),
      importingFile("src/folder/index.tsx", "typescript", ["../entry"]),
    ]);

    expect(result).toEqual({
      components: [
        [
          "src/direct.ts",
          "src/entry.ts",
          "src/extensionless.js",
          "src/folder/index.tsx",
        ],
      ],
      largestComponentSize: 4,
    });
  });

  it("normalizes POSIX candidates and compares paths case-insensitively", () => {
    const result = findCircularImports([
      importingFile("Src/A.ts", "typescript", ["./nested/../B"]),
      importingFile("src/b.TS", "typescript", ["./a"]),
    ]);

    expect(result.components).toEqual([["Src/A.ts", "src/b.TS"]]);
  });

  it("resolves Python modules and package __init__ files", () => {
    const result = findCircularImports([
      importingFile("pkg/a.py", "python", [".b", ".sub", "external"]),
      importingFile("pkg/b.py", "python", [".a"]),
      importingFile("pkg/sub/__init__.py", "python", ["..a"]),
    ]);

    expect(result).toEqual({
      components: [["pkg/a.py", "pkg/b.py", "pkg/sub/__init__.py"]],
      largestComponentSize: 3,
    });
  });

  it("keeps .d.ts and .pyi imports resolution-only while finding their cycles", () => {
    const js = analyzeJavaScriptTypeScript([
      sourceFile("src/types.d.ts", declarationImportSource),
      sourceFile(
        "src/runtime.ts",
        'import { declaredValue } from "./types"; export const runtimeValue = declaredValue;',
      ),
    ]);
    const python = analyzePython([
      pythonSourceFile("pkg/types.pyi", pythonStubImportSource),
      pythonSourceFile(
        "pkg/runtime.py",
        "from .types import DeclaredValue\nRuntimeValue = DeclaredValue",
      ),
      pythonSourceFile("pkg/model.py", "class Model: pass"),
    ]);
    const result = findCircularImports([...js.files, ...python.files]);

    expect(result.components).toEqual([
      ["pkg/runtime.py", "pkg/types.pyi"],
      ["src/runtime.ts", "src/types.d.ts"],
    ]);
    expect(js.files.find((file) => file.path.endsWith(".d.ts"))).toMatchObject({
      logicalLines: 0,
      normalizedTokens: [],
      relativeImports: [
        "./runtime",
        "./runtime-all",
        "./runtime-equals",
        "./runtime-export",
      ],
    });
    expect(
      python.files.find((file) => file.path.endsWith(".pyi")),
    ).toMatchObject({
      logicalLines: 0,
      normalizedTokens: [],
      relativeImports: [".model", ".runtime"],
    });
  });

  it("excludes acyclic graphs, unresolved imports, and self loops", () => {
    const result = findCircularImports([
      importingFile("src/a.ts", "typescript", ["./b", "./a", "react"]),
      importingFile("src/b.ts", "typescript", ["./missing"]),
      importingFile("pkg/a.py", "python", ["package", ".missing"]),
    ]);

    expect(result).toEqual({ components: [], largestComponentSize: 0 });
  });

  it("sorts components by descending size and then path", () => {
    const result = findCircularImports([
      importingFile("z/one.ts", "typescript", ["./two"]),
      importingFile("z/two.ts", "typescript", ["./three"]),
      importingFile("z/three.ts", "typescript", ["./one"]),
      importingFile("a/one.py", "python", [".two"]),
      importingFile("a/two.py", "python", [".one"]),
      importingFile("b/one.js", "javascript", ["./two"]),
      importingFile("b/two.js", "javascript", ["./one"]),
    ]);

    expect(result).toEqual({
      components: [
        ["z/one.ts", "z/three.ts", "z/two.ts"],
        ["a/one.py", "a/two.py"],
        ["b/one.js", "b/two.js"],
      ],
      largestComponentSize: 3,
    });
  });

  it("is stable after input and import arrays are shuffled", () => {
    const files = [
      importingFile("src/c.ts", "typescript", ["./a", "./b"]),
      importingFile("src/a.ts", "typescript", ["./b"]),
      importingFile("src/b.ts", "typescript", ["./c"]),
    ];
    const shuffled = [...files].reverse().map((file) => ({
      ...file,
      relativeImports: [...file.relativeImports].reverse(),
    }));

    expect(findCircularImports(shuffled)).toEqual(findCircularImports(files));
  });
});
