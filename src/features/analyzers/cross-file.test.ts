import { describe, expect, it, vi } from "vitest";

import type {
  DuplicateMetrics,
  ImportingFile,
  TokenizedFile,
} from "../analysis/model";
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

interface BruteForceCandidate {
  leftFile: number;
  leftStart: number;
  rightFile: number;
  rightStart: number;
  length: number;
}

function bruteForceDuplicateRatio(
  input: readonly TokenizedFile[],
): DuplicateMetrics {
  const files = input
    .filter((file) => !file.isTest)
    .map((file) => ({ path: file.path, tokens: file.normalizedTokens }))
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  const candidates: BruteForceCandidate[] = [];
  const keys = new Set<string>();

  for (let leftFile = 0; leftFile < files.length; leftFile += 1) {
    for (
      let rightFile = leftFile + 1;
      rightFile < files.length;
      rightFile += 1
    ) {
      const leftTokens = files[leftFile]?.tokens ?? [];
      const rightTokens = files[rightFile]?.tokens ?? [];

      for (
        let leftWindow = 0;
        leftWindow <= leftTokens.length - WINDOW_SIZE;
        leftWindow += 1
      ) {
        for (
          let rightWindow = 0;
          rightWindow <= rightTokens.length - WINDOW_SIZE;
          rightWindow += 1
        ) {
          let equal = true;
          for (let offset = 0; offset < WINDOW_SIZE; offset += 1) {
            if (
              leftTokens[leftWindow + offset] !==
              rightTokens[rightWindow + offset]
            ) {
              equal = false;
              break;
            }
          }
          if (!equal) {
            continue;
          }

          let leftStart = leftWindow;
          let rightStart = rightWindow;
          while (
            leftStart > 0 &&
            rightStart > 0 &&
            leftTokens[leftStart - 1] === rightTokens[rightStart - 1]
          ) {
            leftStart -= 1;
            rightStart -= 1;
          }
          let length = WINDOW_SIZE;
          while (
            leftStart + length < leftTokens.length &&
            rightStart + length < rightTokens.length &&
            leftTokens[leftStart + length] === rightTokens[rightStart + length]
          ) {
            length += 1;
          }

          const key = [leftFile, leftStart, rightFile, rightStart, length].join(
            ":",
          );
          if (!keys.has(key)) {
            keys.add(key);
            candidates.push({
              leftFile,
              leftStart,
              rightFile,
              rightStart,
              length,
            });
          }
        }
      }
    }
  }

  candidates.sort(
    (left, right) =>
      right.length - left.length ||
      (files[left.leftFile]?.path ?? "").localeCompare(
        files[right.leftFile]?.path ?? "",
        "en-US",
      ) ||
      (files[left.rightFile]?.path ?? "").localeCompare(
        files[right.rightFile]?.path ?? "",
        "en-US",
      ) ||
      left.leftStart - right.leftStart ||
      left.rightStart - right.rightStart,
  );

  const occupied = files.map((file) =>
    Array.from({ length: file.tokens.length }, () => false),
  );
  const accepted: BruteForceCandidate[] = [];
  for (const candidate of candidates) {
    const leftOccupied = occupied[candidate.leftFile] ?? [];
    const rightOccupied = occupied[candidate.rightFile] ?? [];
    const overlaps = Array.from(
      { length: candidate.length },
      (_, offset) => offset,
    ).some(
      (offset) =>
        leftOccupied[candidate.leftStart + offset] === true ||
        rightOccupied[candidate.rightStart + offset] === true,
    );

    if (overlaps) {
      continue;
    }
    for (let offset = 0; offset < candidate.length; offset += 1) {
      leftOccupied[candidate.leftStart + offset] = true;
      rightOccupied[candidate.rightStart + offset] = true;
    }
    accepted.push(candidate);
  }

  const evidence = new Map<
    string,
    { leftPath: string; rightPath: string; tokenCount: number }
  >();
  for (const candidate of accepted) {
    const leftPath = files[candidate.leftFile]?.path ?? "";
    const rightPath = files[candidate.rightFile]?.path ?? "";
    const key = `${leftPath}\0${rightPath}`;
    const previous = evidence.get(key);

    evidence.set(key, {
      leftPath,
      rightPath,
      tokenCount: (previous?.tokenCount ?? 0) + candidate.length,
    });
  }

  const totalEligibleTokens = files.reduce(
    (total, file) => total + file.tokens.length,
    0,
  );
  const duplicatedTokens = occupied.reduce(
    (total, file) =>
      total + file.reduce((count, duplicate) => count + Number(duplicate), 0),
    0,
  );

  return {
    totalEligibleTokens,
    duplicatedTokens,
    ratio:
      totalEligibleTokens === 0 ? 0 : duplicatedTokens / totalEligibleTokens,
    evidence: [...evidence.values()]
      .sort(
        (left, right) =>
          left.leftPath.localeCompare(right.leftPath, "en-US") ||
          left.rightPath.localeCompare(right.rightPath, "en-US"),
      )
      .slice(0, 20),
  };
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

  it("keeps adversarial repeated-token matching within a deterministic read budget", () => {
    let indexedReads = 0;
    const budgetedTokens = (count: number): readonly string[] =>
      new Proxy(
        Array.from({ length: count }, () => "same"),
        {
          get(target, property, receiver) {
            if (typeof property === "string" && /^\d+$/u.test(property)) {
              indexedReads += 1;
              if (indexedReads > 100_000) {
                throw new Error(
                  "duplicate matcher exceeded its token-read budget",
                );
              }
            }

            return Reflect.get(target, property, receiver) as unknown;
          },
        },
      );

    expect(
      computeDuplicateRatio([
        tokenizedFile("src/a.ts", budgetedTokens(2000)),
        tokenizedFile("src/b.ts", budgetedTokens(2001)),
      ]),
    ).toEqual({
      totalEligibleTokens: 4001,
      duplicatedTokens: 4000,
      ratio: 4000 / 4001,
      evidence: [
        {
          leftPath: "src/a.ts",
          rightPath: "src/b.ts",
          tokenCount: 2000,
        },
      ],
    });
    expect(indexedReads).toBeLessThanOrEqual(100_000);
  });

  it(
    "keeps periodic duplicate matching within the task analysis budget",
    { timeout: 1500 },
    () => {
      const periodicTokens = (count: number): string[] =>
        Array.from({ length: count }, (_, index) =>
          index % 2 === 0 ? "identifier" : ";",
        );

      expect(
        computeDuplicateRatio([
          tokenizedFile("src/a.ts", periodicTokens(20_000)),
          tokenizedFile("src/b.ts", periodicTokens(20_001)),
        ]),
      ).toEqual({
        totalEligibleTokens: 40_001,
        duplicatedTokens: 40_000,
        ratio: 40_000 / 40_001,
        evidence: [
          {
            leftPath: "src/a.ts",
            rightPath: "src/b.ts",
            tokenCount: 20_000,
          },
        ],
      });
    },
  );

  it("preserves disconnected maximal matches on one periodic diagonal", () => {
    const left = Array.from(
      { length: 117 },
      (_, index) => `p${String(index % 20)}`,
    );
    const right = Array.from(
      { length: 118 },
      (_, index) => `p${String((index + 19) % 20)}`,
    );

    left[63] = "left-break";
    right[67] = "right-break";
    const files = [
      tokenizedFile("src/a.ts", left),
      tokenizedFile("src/b.ts", right),
    ];

    expect(bruteForceDuplicateRatio(files)).toMatchObject({
      duplicatedTokens: 226,
      evidence: [
        {
          leftPath: "src/a.ts",
          rightPath: "src/b.ts",
          tokenCount: 113,
        },
      ],
    });
    expect(computeDuplicateRatio(files)).toEqual(
      bruteForceDuplicateRatio(files),
    );
  });

  it(
    "does not materialize candidates for every periodic file-pair delta",
    { timeout: 5000 },
    () => {
      const originalSort = Array.prototype.sort;
      let largestSortedArray = 0;
      const sortSpy = vi
        .spyOn(Array.prototype, "sort")
        .mockImplementation(function (
          this: unknown[],
          compareFunction?: (left: unknown, right: unknown) => number,
        ): unknown[] {
          largestSortedArray = Math.max(largestSortedArray, this.length);

          return Reflect.apply(originalSort, this, [
            compareFunction,
          ]) as unknown[];
        });
      const files = Array.from({ length: 20 }, (_, fileIndex) =>
        tokenizedFile(
          `src/${String(fileIndex).padStart(2, "0")}.ts`,
          Array.from({ length: 5000 + fileIndex }, (_, tokenIndex) =>
            tokenIndex % 2 === 0 ? "identifier" : ";",
          ),
        ),
      );

      try {
        const result = computeDuplicateRatio(files);

        expect(result.totalEligibleTokens).toBe(100_190);
        expect(result.duplicatedTokens).toBe(100_180);
      } finally {
        sortSpy.mockRestore();
      }

      expect(largestSortedArray).toBeLessThanOrEqual(100_190);
    },
  );

  it(
    "does not materialize the repeated-block candidate cross product",
    { timeout: 5000 },
    () => {
      const originalSort = Array.prototype.sort;
      let largestSortedArray = 0;
      const sortSpy = vi
        .spyOn(Array.prototype, "sort")
        .mockImplementation(function (
          this: unknown[],
          compareFunction?: (left: unknown, right: unknown) => number,
        ): unknown[] {
          largestSortedArray = Math.max(largestSortedArray, this.length);

          return Reflect.apply(originalSort, this, [
            compareFunction,
          ]) as unknown[];
        });
      const shared = sequence("shared-block", WINDOW_SIZE);
      const copiesPerFile = 80;
      const files = Array.from({ length: 20 }, (_, fileIndex) => {
        const tokens: string[] = [];

        for (let copy = 0; copy < copiesPerFile; copy += 1) {
          tokens.push(...shared);
          tokens.push(
            ...sequence(
              `gap-${String(fileIndex)}-${String(copy)}`,
              1 + ((copy * 17 + fileIndex * 13) % 9),
            ),
          );
        }

        return tokenizedFile(
          `src/${String(fileIndex).padStart(2, "0")}.ts`,
          tokens,
        );
      });

      try {
        const result = computeDuplicateRatio(files);

        expect(result.duplicatedTokens).toBe(
          files.length * copiesPerFile * WINDOW_SIZE,
        );
      } finally {
        sortSpy.mockRestore();
      }

      expect(largestSortedArray).toBeLessThanOrEqual(
        files.reduce((total, file) => total + file.normalizedTokens.length, 0),
      );
    },
  );

  it(
    "stops draining periodic pair sources once no 50-token range remains",
    { timeout: 5000 },
    () => {
      const originalMax = Math.max;
      let maxCalls = 0;
      const maxSpy = vi.spyOn(Math, "max").mockImplementation((...values) => {
        maxCalls += 1;
        if (maxCalls > 1_000_000) {
          throw new Error(
            "periodic candidate drain exceeded its operation budget",
          );
        }

        return originalMax(...values);
      });
      const files = Array.from({ length: 100 }, (_, fileIndex) =>
        tokenizedFile(
          `src/${String(fileIndex).padStart(3, "0")}.ts`,
          Array.from({ length: 5000 + fileIndex }, (_, tokenIndex) =>
            tokenIndex % 2 === 0 ? "identifier" : ";",
          ),
        ),
      );

      try {
        expect(computeDuplicateRatio(files)).toMatchObject({
          totalEligibleTokens: 504_950,
          duplicatedTokens: 504_900,
        });
      } finally {
        maxSpy.mockRestore();
      }

      expect(maxCalls).toBeLessThanOrEqual(1_000_000);
    },
  );

  it.each([
    [
      "period seven",
      [
        tokenizedFile(
          "src/a.ts",
          Array.from({ length: 91 }, (_, index) => `p${String(index % 7)}`),
        ),
        tokenizedFile(
          "src/b.ts",
          Array.from({ length: 95 }, (_, index) => `p${String(index % 7)}`),
        ),
      ],
    ],
    [
      "two maximal spans around a mismatch",
      (() => {
        const left = Array.from(
          { length: 130 },
          (_, index) => `p${String(index % 3)}`,
        );
        const right = [...left];

        left[64] = "left-break";
        right[64] = "right-break";
        return [
          tokenizedFile("src/a.ts", left),
          tokenizedFile("src/b.ts", right),
        ];
      })(),
    ],
    [
      "different arithmetic repetition steps",
      (() => {
        const shared = sequence("shared", WINDOW_SIZE);

        return [
          tokenizedFile("src/a.ts", [
            ...shared,
            "left-one",
            ...shared,
            "left-two",
            ...shared,
          ]),
          tokenizedFile("src/b.ts", [
            ...shared,
            "right-one",
            "right-two",
            ...shared,
            "right-three",
            "right-four",
            ...shared,
          ]),
        ];
      })(),
    ],
  ] as const)(
    "matches the brute-force greedy reference for %s",
    (_label, files) => {
      expect(computeDuplicateRatio(files)).toEqual(
        bruteForceDuplicateRatio(files),
      );
    },
  );
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

  it("resolves submodules named by Python from-dot import lists", () => {
    const analyzed = analyzePython([
      pythonSourceFile("pkg/__init__.py", "PACKAGE = True"),
      pythonSourceFile("pkg/a.py", "from . import b"),
      pythonSourceFile("pkg/b.py", "from . import a"),
    ]);

    expect(findCircularImports(analyzed.files)).toEqual({
      components: [["pkg/a.py", "pkg/b.py"]],
      largestComponentSize: 2,
    });
  });

  it("does not infer a submodule edge when package __init__ shadows the imported name", () => {
    const analyzed = analyzePython([
      pythonSourceFile("pkg/__init__.py", "b = object()"),
      pythonSourceFile("pkg/a.py", "from . import b\nvalue = b"),
      pythonSourceFile("pkg/b.py", "from .a import value"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({ topLevelDefinedNames: ["b"] });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [],
      largestComponentSize: 0,
    });
  });

  it("does not treat conditional package bindings as definite submodule shadows", () => {
    const analyzed = analyzePython([
      pythonSourceFile("pkg/__init__.py", "if False:\n    b = object()"),
      pythonSourceFile("pkg/a.py", "from . import b"),
      pythonSourceFile("pkg/b.py", "from . import a"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({ topLevelDefinedNames: [] });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [["pkg/a.py", "pkg/b.py"]],
      largestComponentSize: 2,
    });
  });

  it("retains a package initializer's own from-dot submodule edge", () => {
    const analyzed = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        "from . import b\nb = object()\nINIT_VALUE = 1",
      ),
      pythonSourceFile("pkg/b.py", "from . import INIT_VALUE"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({
      relativeImportCandidates: [".b"],
      topLevelDefinedNames: ["INIT_VALUE", "b"],
    });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [["pkg/__init__.py", "pkg/b.py"]],
      largestComponentSize: 2,
    });
  });

  it("suppresses only from-dot candidates shadowed before an initializer import", () => {
    const analyzed = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        "INIT_VALUE = 1\nb = object()\nfrom . import b",
      ),
      pythonSourceFile("pkg/b.py", "from . import INIT_VALUE"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({ relativeImportCandidates: [] });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [],
      largestComponentSize: 0,
    });
  });

  it("does not treat annotation-only package names as runtime shadows", () => {
    const analyzed = analyzePython([
      pythonSourceFile("pkg/__init__.py", "b: object"),
      pythonSourceFile("pkg/a.py", "from . import b"),
      pythonSourceFile("pkg/b.py", "from . import a"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({ topLevelDefinedNames: [] });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [["pkg/a.py", "pkg/b.py"]],
      largestComponentSize: 2,
    });
  });

  it("restores a from-dot edge after a definite package attribute deletion", () => {
    const analyzed = analyzePython([
      pythonSourceFile(
        "pkg/__init__.py",
        "b = object()\ndel b\nfrom . import b",
      ),
      pythonSourceFile("pkg/b.py", "from . import INIT_VALUE"),
    ]);

    expect(
      analyzed.files.find((file) => file.path === "pkg/__init__.py"),
    ).toMatchObject({
      relativeImportCandidates: [".b"],
      topLevelDefinedNames: [],
    });
    expect(findCircularImports(analyzed.files)).toEqual({
      components: [["pkg/__init__.py", "pkg/b.py"]],
      largestComponentSize: 2,
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
      relativeImportCandidates: [],
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
