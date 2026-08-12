import type { FetchedTextFile, LanguageAnalysis } from "../analysis/model";
import { analyzeParsedPythonFile } from "./python/analyze-file";
import { parsePython } from "./python/syntax";

function extensionOf(path: string): string {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const index = basename.lastIndexOf(".");

  return index === -1 ? "" : basename.slice(index).toLocaleLowerCase("en-US");
}

function isPythonPath(path: string): boolean {
  const extension = extensionOf(path);

  return extension === ".py" || extension === ".pyi";
}

function isStubPath(path: string): boolean {
  return extensionOf(path) === ".pyi";
}

function comparePaths(left: { path: string }, right: { path: string }): number {
  const leftNormalized = left.path
    .replaceAll("\\", "/")
    .toLocaleLowerCase("en-US");
  const rightNormalized = right.path
    .replaceAll("\\", "/")
    .toLocaleLowerCase("en-US");

  if (leftNormalized !== rightNormalized) {
    return leftNormalized < rightNormalized ? -1 : 1;
  }

  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

export function analyzePython(
  files: readonly FetchedTextFile[],
): LanguageAnalysis {
  const output: LanguageAnalysis = {
    files: [],
    functions: [],
    identifierOccurrences: 0,
    ambiguousIdentifierOccurrences: 0,
    exportedDeclarations: 0,
    documentedExports: 0,
    parsedBytes: 0,
    parseFailures: [],
  };
  const orderedFiles = [...files]
    .filter((file) => isPythonPath(file.path))
    .sort(comparePaths);

  for (const file of orderedFiles) {
    const nodes = parsePython(file.text);

    if (nodes === null) {
      output.parseFailures.push({
        path: file.path,
        language: "python",
        reason: "syntax",
      });
      continue;
    }

    if (!isStubPath(file.path)) {
      output.parsedBytes += file.bytes;
    }
    analyzeParsedPythonFile(file, nodes, output);
  }

  output.functions.sort(
    (left, right) =>
      comparePaths(left, right) ||
      left.startLine - right.startLine ||
      left.endLine - right.endLine ||
      left.name.localeCompare(right.name, "en-US"),
  );

  return output;
}
