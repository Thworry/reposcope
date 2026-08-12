import { describe, expect, it } from "vitest";

import { fetchedTextFile } from "../../../test/fixtures/text-files";
import { logicalLineNumbers } from "../line-metrics";
import { functionMetric } from "./function-metrics";
import { createPythonLineLookup, parsePython } from "./syntax";

describe("Python internal function-metric boundary", () => {
  it("parses and measures the compact function through extracted stages", () => {
    const file = fetchedTextFile(
      "src/choice.py",
      "def choose(value):\n    if value:\n        return 1\n    return 0\n",
      { language: "python", category: "source" },
    );
    const nodes = parsePython(file.text);

    expect(nodes).not.toBeNull();

    const functionIndex = nodes?.findIndex(
      (node) => node.type === "FunctionDefinition",
    );

    expect(functionIndex).toBeGreaterThanOrEqual(0);
    expect(
      functionMetric(
        nodes ?? [],
        functionIndex ?? -1,
        file,
        logicalLineNumbers(file.text, "python"),
        createPythonLineLookup(file.text),
      ),
    ).toEqual({
      path: "src/choice.py",
      name: "choose",
      startLine: 1,
      endLine: 4,
      logicalLines: 4,
      cyclomatic: 2,
      maxNesting: 1,
      hasErrorHandling: false,
      isTest: false,
    });
  });
});
