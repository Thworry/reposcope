import { describe, expect, it } from "vitest";

import {
  compactPythonChoiceSource,
  malformedPythonSource,
  pythonBindingCoverageSource,
  pythonSourceFile,
  pythonSyntaxCoverageSource,
} from "../../test/fixtures/python-source";
import { analyzePython } from "./python";

describe("Python analyzer", () => {
  it("computes the exact compact function, public API, and docstring metrics", () => {
    const result = analyzePython([
      pythonSourceFile("src/choose.py", compactPythonChoiceSource),
    ]);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0]).toMatchObject({
      path: "src/choose.py",
      name: "choose",
      startLine: 1,
      endLine: 5,
      logicalLines: 5,
      cyclomatic: 3,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: false,
    });
    expect(result.files[0]).toMatchObject({
      path: "src/choose.py",
      language: "python",
      logicalLines: 5,
      isTest: false,
    });
    expect(result.exportedDeclarations).toBe(1);
    expect(result.documentedExports).toBe(1);
    expect(result.parseFailures).toEqual([]);
  });

  it("covers async functions, classes, methods, all decisions, nesting, errors, docs, and imports", () => {
    const result = analyzePython([
      pythonSourceFile("src/service.py", pythonSyntaxCoverageSource),
    ]);
    const functions = new Map(
      result.functions.map((metric) => [metric.name, metric]),
    );

    expect([...functions.keys()]).toEqual(
      expect.arrayContaining(["consume", "run", "inner", "_private"]),
    );
    expect(functions.get("consume")).toMatchObject({
      cyclomatic: 3,
      maxNesting: 2,
      hasErrorHandling: false,
    });
    expect(functions.get("run")).toMatchObject({
      cyclomatic: 14,
      maxNesting: 2,
      hasErrorHandling: true,
    });
    expect(functions.get("inner")).toMatchObject({
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
    });
    expect(result.files[0]?.relativeImports).toEqual([
      "..",
      "...core.tools",
      ".helper",
    ]);
    expect(result.exportedDeclarations).toBe(3);
    expect(result.documentedExports).toBe(2);
  });

  it("counts only Python bindings and applies the exact lowercase short-name allowlist", () => {
    const result = analyzePython([
      pythonSourceFile("src/bindings.py", pythonBindingCoverageSource),
    ]);

    expect(result.identifierOccurrences).toBe(15);
    expect(result.ambiguousIdentifierOccurrences).toBe(11);
  });

  it("counts annotations, named expressions, comprehensions, and real match captures as bindings", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/modern-bindings.py",
        `annotated: Model
values = [uv for uv in rows]
if (xy := value):
    pass
match value:
    case pq:
        pass
    case _:
        pass`,
      ),
    ]);

    expect(result.identifierOccurrences).toBe(5);
    expect(result.ambiguousIdentifierOccurrences).toBe(3);
  });

  it("normalizes literals, discards comments, and preserves identifiers and operators", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/tokens.py",
        `text = "secret"
count = 42
view = f"item {count}"
enabled = count and True  # hidden`,
      ),
    ]);
    const tokens = result.files[0]?.normalizedTokens ?? [];

    expect(tokens).toEqual(
      expect.arrayContaining([
        "text",
        "STRING",
        "count",
        "NUMBER",
        "TEMPLATE",
        "and",
      ]),
    );
    expect(tokens).not.toEqual(
      expect.arrayContaining(['"secret"', "42", 'f"item {count}"', "hidden"]),
    );
  });

  it("isolates a recovered malformed tree and counts only successful bytes", () => {
    const valid = pythonSourceFile(
      "src/valid.py",
      "def valid():\n    return 1",
    );
    const malformed = pythonSourceFile("src/broken.py", malformedPythonSource);
    const result = analyzePython([malformed, valid]);

    expect(result.files.map((file) => file.path)).toEqual(["src/valid.py"]);
    expect(result.functions.map((metric) => metric.name)).toEqual(["valid"]);
    expect(result.parsedBytes).toBe(valid.bytes);
    expect(result.parseFailures).toEqual([
      { path: "src/broken.py", language: "python", reason: "syntax" },
    ]);
  });

  it("excludes interface-only stubs from source denominators and metrics", () => {
    const stub = pythonSourceFile(
      "src/service.pyi",
      "def choose(value: int) -> int: ...",
    );
    const result = analyzePython([stub]);

    expect(result.files).toEqual([
      {
        path: "src/service.pyi",
        language: "python",
        logicalLines: 0,
        isTest: false,
        normalizedTokens: [],
        relativeImports: [],
      },
    ]);
    expect(result.functions).toEqual([]);
    expect(result.identifierOccurrences).toBe(0);
    expect(result.exportedDeclarations).toBe(0);
    expect(result.parsedBytes).toBe(stub.bytes);
  });

  it("counts only top-level public APIs and direct public methods with first-statement docstrings", () => {
    const result = analyzePython([
      pythonSourceFile(
        "src/docs.py",
        `"""Module docs do not document declarations."""

@decorate
def decorated():
    """Documented."""
    return 1

def detached():
    value = 1
    """Not a first-statement docstring."""
    return value

class Public:
    """Documented class."""

    @decorate
    def method(self):
        """Documented method."""
        return 1

    def _private_method(self):
        """Private."""
        return 2

def outer():
    def nested():
        """Nested is not public API."""
        return 1
    return nested()`,
      ),
    ]);

    expect(result.exportedDeclarations).toBe(5);
    expect(result.documentedExports).toBe(3);
  });

  it("carries test flags, uses stable path order, and never mutates inputs", () => {
    const testFile = Object.freeze(
      pythonSourceFile("tests/test_z.py", "def z():\n    return 1", {
        isTest: true,
      }),
    );
    const source = Object.freeze(
      pythonSourceFile("src/a.py", "def a():\n    return 1"),
    );
    const input = Object.freeze([testFile, source]);
    const result = analyzePython(input);

    expect(result.files.map((file) => file.path)).toEqual([
      "src/a.py",
      "tests/test_z.py",
    ]);
    expect(
      result.functions.map((metric) => [metric.name, metric.isTest]),
    ).toEqual([
      ["a", false],
      ["z", true],
    ]);
    expect(input[0]).toBe(testFile);
    expect(input[1]).toBe(source);
  });
});
