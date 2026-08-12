import { describe, expect, it } from "vitest";

import type { LanguageAnalysis } from "../../analysis/model";
import { fetchedTextFile } from "../../../test/fixtures/text-files";
import { analyzeParsedPythonFile } from "./analyze-file";
import { parsePython } from "./syntax";

function emptyAnalysis(): LanguageAnalysis {
  return {
    files: [],
    functions: [],
    identifierOccurrences: 0,
    ambiguousIdentifierOccurrences: 0,
    exportedDeclarations: 0,
    documentedExports: 0,
    parsedBytes: 0,
    parseFailures: [],
  };
}

function analyzeFile(
  path: string,
  text: string,
  output: LanguageAnalysis,
): void {
  const file = fetchedTextFile(path, text, {
    language: "python",
    category: "source",
  });
  const nodes = parsePython(text);

  expect(nodes).not.toBeNull();
  analyzeParsedPythonFile(file, nodes ?? [], output);
}

describe("Python per-file analysis boundary", () => {
  it("keeps stubs resolution-only with zero source denominators", () => {
    const output = emptyAnalysis();

    analyzeFile(
      "pkg/__init__.pyi",
      "from . import sibling\ndef exposed(value: int) -> int: ...\n",
      output,
    );

    expect(output).toMatchObject({
      files: [
        {
          path: "pkg/__init__.pyi",
          language: "python",
          logicalLines: 0,
          normalizedTokens: [],
          relativeImports: ["."],
          relativeImportCandidates: [".sibling"],
          topLevelDefinedNames: ["exposed"],
        },
      ],
      functions: [],
      identifierOccurrences: 0,
      ambiguousIdentifierOccurrences: 0,
      exportedDeclarations: 0,
      documentedExports: 0,
      parsedBytes: 0,
    });
  });

  it("appends source evidence and metrics in per-file traversal order", () => {
    const output = emptyAnalysis();

    analyzeFile(
      "pkg/module.py",
      [
        "def first(value):",
        '    """First."""',
        "    return value",
        "",
        "class Container:",
        "    def method(self, xy):",
        "        return xy",
        "",
      ].join("\n"),
      output,
    );

    expect(output.files.map((file) => file.path)).toEqual(["pkg/module.py"]);
    expect(output.functions.map((metric) => metric.name)).toEqual([
      "first",
      "method",
    ]);
    expect(output).toMatchObject({
      exportedDeclarations: 3,
      documentedExports: 1,
      // Baseline parity: declaration names and parameters are all bindings.
      identifierOccurrences: 6,
      ambiguousIdentifierOccurrences: 1,
    });
  });
});
