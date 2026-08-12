import type {
  AnalyzedSourceFile,
  FetchedTextFile,
  LanguageAnalysis,
} from "../../analysis/model";
import { logicalLineNumbers } from "../line-metrics";
import { bindingIdentifiers, isAmbiguousIdentifier } from "./bindings";
import { topLevelBindingMetadata } from "./binding-flow";
import {
  collectRelativeImports,
  hasDocstring,
  normalizedTokens,
  publicApiKind,
} from "./evidence";
import { firstDirectVariable, functionMetric } from "./function-metrics";
import type { PythonNode } from "./model";
import { createPythonLineLookup, nodeTextAt } from "./syntax";

function extensionOf(path: string): string {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const index = basename.lastIndexOf(".");

  return index === -1 ? "" : basename.slice(index).toLocaleLowerCase("en-US");
}

function isStubPath(path: string): boolean {
  return extensionOf(path) === ".pyi";
}

export function analyzeParsedPythonFile(
  file: FetchedTextFile,
  nodes: readonly PythonNode[],
  output: LanguageAnalysis,
): void {
  const bindingMetadata = topLevelBindingMetadata(nodes, file.text);
  const relativeImports = collectRelativeImports(
    nodes,
    file.text,
    /(?:^|\/)__init__\.pyi?$/iu.test(file.path)
      ? bindingMetadata.namesBeforeImport
      : undefined,
  );
  const definedNames = bindingMetadata.finalNames;

  if (isStubPath(file.path)) {
    output.files.push({
      path: file.path,
      language: "python",
      logicalLines: 0,
      isTest: file.isTest,
      normalizedTokens: [],
      relativeImports: relativeImports.definite,
      relativeImportCandidates: relativeImports.candidates,
      topLevelDefinedNames: definedNames,
    });
    return;
  }

  const logicalLines = logicalLineNumbers(file.text, "python");
  const lineAt = createPythonLineLookup(file.text);
  const analyzedFile: AnalyzedSourceFile = {
    path: file.path,
    language: "python",
    logicalLines: logicalLines.length,
    isTest: file.isTest,
    normalizedTokens: normalizedTokens(nodes, file.text),
    relativeImports: relativeImports.definite,
    relativeImportCandidates: relativeImports.candidates,
    topLevelDefinedNames: definedNames,
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (node === undefined) {
      continue;
    }
    if (node.type === "FunctionDefinition") {
      const metric = functionMetric(nodes, index, file, logicalLines, lineAt);

      if (metric !== null) {
        output.functions.push(metric);
      }
    }
    if (
      (node.type === "FunctionDefinition" || node.type === "ClassDefinition") &&
      publicApiKind(nodes, index) !== null
    ) {
      const nameIndex = firstDirectVariable(nodes, index);

      if (
        nameIndex !== null &&
        !nodeTextAt(nodes, nameIndex, file.text).startsWith("_")
      ) {
        output.exportedDeclarations += 1;
        if (hasDocstring(nodes, index, file.text)) {
          output.documentedExports += 1;
        }
      }
    }
  }

  for (const identifierIndex of bindingIdentifiers(nodes, file.text)) {
    const name = nodeTextAt(nodes, identifierIndex, file.text);

    output.identifierOccurrences += 1;
    if (isAmbiguousIdentifier(name)) {
      output.ambiguousIdentifierOccurrences += 1;
    }
  }

  output.files.push(analyzedFile);
}
