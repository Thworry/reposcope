import { describe, expect, it } from "vitest";

import {
  bindingCoverageSource,
  compactChoiceSource,
  JAVASCRIPT_TYPESCRIPT_EXTENSIONS,
  malformedSource,
  nestedTestSource,
  sourceFile,
  syntaxCoverageSource,
} from "../../test/fixtures/js-ts-source";
import { analyzeJavaScriptTypeScript } from "./js-ts";

describe("JavaScript and TypeScript analyzer", () => {
  it("computes the exact compact function, export, and JSDoc metrics", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile("src/choose.ts", compactChoiceSource),
    ]);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]).toMatchObject({
      path: "src/choose.ts",
      name: "choose",
      startLine: 2,
      endLine: 5,
      logicalLines: 4,
      cyclomatic: 4,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: false,
    });
    expect(result.files[0]).toMatchObject({
      path: "src/choose.ts",
      language: "typescript",
      logicalLines: 4,
      isTest: false,
    });
    expect(result.exportedDeclarations).toBe(1);
    expect(result.documentedExports).toBe(1);
    expect(result.parseFailures).toEqual([]);
  });

  it.each(JAVASCRIPT_TYPESCRIPT_EXTENSIONS)(
    "parses %s with its extension-specific syntax",
    (extension) => {
      const jsx = extension === ".jsx" || extension === ".tsx";
      const typed = [".ts", ".tsx", ".mts", ".cts"].includes(extension);
      const source = typed
        ? `${jsx ? "const view = <div />;" : ""} export const value: number = 1;`
        : `${jsx ? "const view = <div />;" : ""} export const value = 1;`;
      const result = analyzeJavaScriptTypeScript([
        sourceFile(`src/value${extension}`, source),
      ]);

      expect(result.parseFailures).toEqual([]);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.language).toBe(
        typed ? "typescript" : "javascript",
      );
    },
  );

  it("covers all function kinds, decisions, nesting, error handling, decorators, and imports", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile("src/service.ts", syntaxCoverageSource),
    ]);
    const functions = new Map(
      result.functions.map((metric) => [metric.name, metric]),
    );

    expect([...functions.keys()]).toEqual(
      expect.arrayContaining([
        "namedExpression",
        "arrow",
        "iterate",
        "method",
        "get current",
        "set current",
        "run",
      ]),
    );
    expect(functions.get("arrow")).toMatchObject({
      cyclomatic: 2,
      maxNesting: 1,
    });
    expect(functions.get("iterate")).toMatchObject({
      cyclomatic: 3,
      maxNesting: 1,
    });
    expect(functions.get("run")).toMatchObject({
      cyclomatic: 11,
      maxNesting: 2,
      hasErrorHandling: true,
    });
    expect(result.files[0]?.relativeImports).toEqual([
      "./common",
      "./helper",
      "./re-export",
    ]);
    expect(result.exportedDeclarations).toBe(1);
    expect(result.documentedExports).toBe(0);
  });

  it("counts only binding identifiers and applies the exact short-name allowlist", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile("src/bindings.tsx", bindingCoverageSource),
    ]);

    expect(result.identifierOccurrences).toBe(15);
    expect(result.ambiguousIdentifierOccurrences).toBe(10);
  });

  it("counts TypeScript import-equals bindings but retains only runtime relative edges", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile(
        "src/import-equals.ts",
        `import q = require("./runtime");
import type uv = require("./types");
export const result = q;`,
      ),
    ]);

    expect(result.files[0]?.relativeImports).toEqual(["./runtime"]);
    expect(result.identifierOccurrences).toBe(3);
    expect(result.ambiguousIdentifierOccurrences).toBe(2);
  });

  it("applies lowercase allowlist and keyword exemptions case-sensitively", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile(
        "src/case-sensitive.ts",
        `const ok = 1, id = 2, OK = 3, ID = 4, IF = 5, DO = 6, IN = 7;
class Container { in() {} if() {} do() {} }`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(11);
    expect(result.ambiguousIdentifierOccurrences).toBe(5);
  });

  it("isolates nested-function decisions and carries the test-file flag", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile("tests/nested.test.ts", nestedTestSource, { isTest: true }),
    ]);
    const functions = new Map(
      result.functions.map((metric) => [metric.name, metric]),
    );

    expect(functions.get("outer")).toMatchObject({
      cyclomatic: 2,
      maxNesting: 2,
      hasErrorHandling: false,
      isTest: true,
    });
    expect(functions.get("inner")).toMatchObject({
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: true,
    });
    expect(result.files[0]?.isTest).toBe(true);
  });

  it("normalizes literals, discards comments, and keeps identifiers and operators", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile(
        "src/tokens.ts",
        'const text = "secret"; const count = 42; const view = `item`; // hidden',
      ),
    ]);
    const tokens = result.files[0]?.normalizedTokens ?? [];

    expect(tokens).toEqual(
      expect.arrayContaining(["text", "STRING", "count", "NUMBER", "TEMPLATE"]),
    );
    expect(tokens).not.toEqual(
      expect.arrayContaining(['"secret"', "42", "`item`", "hidden"]),
    );
  });

  it("isolates malformed files and counts only successfully parsed bytes", () => {
    const valid = sourceFile(
      "src/valid.js",
      "export function valid() { return 1; }",
    );
    const malformed = sourceFile("src/broken.ts", malformedSource);
    const result = analyzeJavaScriptTypeScript([malformed, valid]);

    expect(result.files.map((file) => file.path)).toEqual(["src/valid.js"]);
    expect(result.functions.map((metric) => metric.name)).toEqual(["valid"]);
    expect(result.parsedBytes).toBe(valid.bytes);
    expect(result.parseFailures).toEqual([
      { path: "src/broken.ts", language: "typescript", reason: "syntax" },
    ]);
  });

  it("excludes declaration-file denominators while retaining its path for resolution", () => {
    const declarations = sourceFile(
      "src/types.d.ts",
      "export declare function q(x: number): number;",
    );
    const result = analyzeJavaScriptTypeScript([declarations]);

    expect(result.files).toEqual([
      {
        path: "src/types.d.ts",
        language: "typescript",
        logicalLines: 0,
        isTest: false,
        normalizedTokens: [],
        relativeImports: [],
      },
    ]);
    expect(result.functions).toEqual([]);
    expect(result.identifierOccurrences).toBe(0);
    expect(result.exportedDeclarations).toBe(0);
    expect(result.parsedBytes).toBe(declarations.bytes);
  });

  it("associates JSDoc only with the preceding nonblank exported declaration", () => {
    const result = analyzeJavaScriptTypeScript([
      sourceFile(
        "src/docs.ts",
        `/** documented */

export const documented = 1;
/** detached */
const intervening = 1;
export const undocumented = 2;`,
      ),
    ]);

    expect(result.exportedDeclarations).toBe(2);
    expect(result.documentedExports).toBe(1);
  });

  it.each([
    ["CR-only", "\r"],
    ["CRLF", "\r\n"],
    ["LINE SEPARATOR", "\u2028"],
    ["PARAGRAPH SEPARATOR", "\u2029"],
  ])(
    "uses consistent %s line positions for functions, logical lines, and JSDoc",
    (_label, newline) => {
      const text = [
        "/** documented */",
        "export function choose(value: number) {",
        "  if (value) return value;",
        "  return 0;",
        "}",
      ].join(newline);
      const result = analyzeJavaScriptTypeScript([
        sourceFile("src/newlines.ts", text),
      ]);

      expect(result.files[0]?.logicalLines).toBe(4);
      expect(result.functions[0]).toMatchObject({
        startLine: 2,
        endLine: 5,
        logicalLines: 4,
      });
      expect(result.exportedDeclarations).toBe(1);
      expect(result.documentedExports).toBe(1);
    },
  );

  it.each([
    [
      "JavaScript single-quoted LS followed by //",
      "src/string-ls.js",
      "'",
      "\u2028",
      "//",
    ],
    [
      "JavaScript double-quoted PS followed by /*",
      "src/string-ps.js",
      '"',
      "\u2029",
      "/*",
    ],
    [
      "TypeScript double-quoted LS followed by /*",
      "src/string-ls.ts",
      '"',
      "\u2028",
      "/*",
    ],
    [
      "TypeScript single-quoted PS followed by //",
      "src/string-ps.ts",
      "'",
      "\u2029",
      "//",
    ],
  ] as const)(
    "keeps %s aligned with Babel's string-token positions",
    (_label, path, quote, separator, commentPrefix) => {
      const text = `export function inspect() { return ${quote}first${separator}${commentPrefix} still string${quote}; }`;
      const result = analyzeJavaScriptTypeScript([sourceFile(path, text)]);

      expect(result.parseFailures).toEqual([]);
      expect(result.files[0]?.logicalLines).toBe(2);
      expect(result.functions[0]).toMatchObject({
        path,
        name: "inspect",
        startLine: 1,
        endLine: 2,
        logicalLines: 2,
      });
    },
  );

  it("handles mixed ECMAScript terminators like the equivalent LF source", () => {
    const lines = [
      "/** documented */",
      " ",
      "export function choose(value: number) {",
      "  if (value) return value;",
      "  return 0;",
      "}",
    ];
    const terminators = ["\r", "\n", "\r\n", "\u2028", "\u2029"];
    const text = lines
      .flatMap((line, index) =>
        index < terminators.length ? [line, terminators[index] ?? ""] : [line],
      )
      .join("");
    const result = analyzeJavaScriptTypeScript([
      sourceFile("src/mixed-newlines.ts", text),
    ]);

    expect(result.files[0]?.logicalLines).toBe(4);
    expect(result.functions[0]).toMatchObject({
      startLine: 3,
      endLine: 6,
      logicalLines: 4,
    });
    expect(result.exportedDeclarations).toBe(1);
    expect(result.documentedExports).toBe(1);
  });

  it("does not mutate caller-owned files", () => {
    const file = sourceFile("src/immutable.ts", "export const value = 1;");
    const input = Object.freeze([Object.freeze({ ...file })]);

    expect(() => analyzeJavaScriptTypeScript(input)).not.toThrow();
    expect(input[0]).toEqual(file);
  });
});
