import type { TreeCursor } from "@lezer/common";
import { parser } from "@lezer/python";

import type {
  AnalyzedSourceFile,
  FetchedTextFile,
  FunctionMetric,
  LanguageAnalysis,
} from "../analysis/model";
import { logicalLineNumbers } from "./line-metrics";

interface PythonNode {
  type: string;
  from: number;
  to: number;
  parent: number | null;
  children: number[];
  error: boolean;
}

interface MetricEntry {
  index: number;
  depth: number;
}

type LineLookup = (offset: number) => number;

const AMBIGUOUS_IDENTIFIER_ALLOWLIST = new Set([
  "_",
  "i",
  "j",
  "k",
  "x",
  "y",
  "z",
  "id",
  "ok",
  "db",
  "fs",
  "io",
  "ui",
  "api",
  "url",
  "uri",
  "ip",
  "os",
  "re",
  "rx",
  "tx",
  "err",
  "req",
  "res",
  "ctx",
]);

const TARGET_CONTAINERS = new Set([
  "ArrayExpression",
  "ParenthesizedExpression",
  "TupleExpression",
]);
const COMPREHENSION_CONTAINERS = new Set([
  "ArrayComprehensionExpression",
  "ComprehensionExpression",
  "DictionaryComprehensionExpression",
  "SetComprehensionExpression",
]);

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

function flattenCursor(cursor: TreeCursor): PythonNode[] {
  const nodes: PythonNode[] = [];
  const parents: number[] = [];

  for (;;) {
    const parent = parents.at(-1) ?? null;
    const index = nodes.length;
    const node: PythonNode = {
      type: cursor.type.name,
      from: cursor.from,
      to: cursor.to,
      parent,
      children: [],
      error: cursor.type.isError,
    };

    nodes.push(node);
    if (parent !== null) {
      nodes[parent]?.children.push(index);
    }

    if (cursor.firstChild()) {
      parents.push(index);
      continue;
    }

    while (!cursor.nextSibling()) {
      if (!cursor.parent()) {
        return nodes;
      }
      parents.pop();
    }
  }
}

function parsePython(text: string): PythonNode[] | null {
  try {
    const nodes = flattenCursor(parser.parse(text).cursor());

    return nodes.some((node) => node.error) ? null : nodes;
  } catch {
    return null;
  }
}

function nodeText(node: PythonNode, text: string): string {
  return text.slice(node.from, node.to);
}

function nodeTextAt(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): string {
  const node = nodes[index];

  return node === undefined ? "" : nodeText(node, text);
}

function lineLookup(text: string): LineLookup {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number): number => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
      throw new Error("Invalid text offset");
    }

    let low = 0;
    let high = lineStarts.length;

    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const start = lineStarts[middle];

      if (start !== undefined && start <= offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  };
}

function firstLineAtOrAfter(lines: readonly number[], target: number): number {
  let low = 0;
  let high = lines.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const line = lines[middle];

    if (line !== undefined && line < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function logicalLinesInRange(
  lines: readonly number[],
  startLine: number,
  endLine: number,
): number {
  return (
    firstLineAtOrAfter(lines, endLine + 1) -
    firstLineAtOrAfter(lines, startLine)
  );
}

function directChildCount(
  nodes: readonly PythonNode[],
  index: number,
  type: string,
): number {
  return (
    nodes[index]?.children.filter((child) => nodes[child]?.type === type)
      .length ?? 0
  );
}

function isDefaultMatchClause(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean {
  const node = nodes[index];
  const patternIndex = node?.children.find((child) => {
    const type = nodes[child]?.type;

    return type !== "case" && type !== "Guard" && type !== "Body";
  });

  if (
    patternIndex === undefined ||
    nodes[patternIndex]?.type !== "CapturePattern" ||
    directChildCount(nodes, patternIndex, "VariableName") !== 1 ||
    directChildCount(nodes, index, "Guard") !== 0
  ) {
    return false;
  }

  const variableIndex = nodes[patternIndex].children.find(
    (child) => nodes[child]?.type === "VariableName",
  );

  return (
    variableIndex !== undefined &&
    nodeTextAt(nodes, variableIndex, text) === "_"
  );
}

function branchIncrement(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): number {
  const node = nodes[index];

  if (node === undefined) {
    return 0;
  }
  if (node.type === "IfStatement") {
    return (
      directChildCount(nodes, index, "if") +
      directChildCount(nodes, index, "elif")
    );
  }
  if (node.type === "ForStatement" || node.type === "WhileStatement") {
    return 1;
  }
  if (node.type === "TryStatement") {
    return directChildCount(nodes, index, "except");
  }
  if (node.type === "ConditionalExpression") {
    return 1;
  }
  if (node.type === "BinaryExpression") {
    return (
      directChildCount(nodes, index, "and") +
      directChildCount(nodes, index, "or")
    );
  }
  if (node.type === "MatchClause") {
    return isDefaultMatchClause(nodes, index, text) ? 0 : 1;
  }

  return 0;
}

function increasesNesting(type: string): boolean {
  return (
    type === "IfStatement" ||
    type === "ForStatement" ||
    type === "WhileStatement" ||
    type === "ConditionalExpression" ||
    type === "MatchStatement"
  );
}

function tryChildren(
  nodes: readonly PythonNode[],
  index: number,
  depth: number,
): { entries: MetricEntry[]; handlerDepth: number } {
  const entries: MetricEntry[] = [];
  let clause: "try" | "except" | "else" | "finally" = "try";
  let handlerDepth = depth;

  for (const child of nodes[index]?.children ?? []) {
    const type = nodes[child]?.type;

    if (type === "except" || type === "else" || type === "finally") {
      clause = type;
    }
    const childDepth =
      type === "Body" && clause === "except" ? depth + 1 : depth;

    if (childDepth > depth) {
      handlerDepth = Math.max(handlerDepth, childDepth);
    }
    entries.push({ index: child, depth: childDepth });
  }

  return { entries, handlerDepth };
}

function firstDirectVariable(
  nodes: readonly PythonNode[],
  index: number,
): number | null {
  return (
    nodes[index]?.children.find(
      (child) => nodes[child]?.type === "VariableName",
    ) ?? null
  );
}

function functionMetric(
  nodes: readonly PythonNode[],
  index: number,
  file: FetchedTextFile,
  logicalLines: readonly number[],
  lineAt: LineLookup,
): FunctionMetric | null {
  const node = nodes[index];
  const nameIndex = firstDirectVariable(nodes, index);

  if (node === undefined || nameIndex === null) {
    return null;
  }

  const startLine = lineAt(node.from);
  const endLine = lineAt(node.to > node.from ? node.to - 1 : node.to);
  let cyclomatic = 1;
  let maxNesting = 0;
  let hasErrorHandling = false;
  const pending: MetricEntry[] = [...node.children]
    .reverse()
    .map((child) => ({ index: child, depth: 0 }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const currentNode = nodes[current.index];

    if (currentNode === undefined) {
      continue;
    }
    if (currentNode.type === "FunctionDefinition") {
      maxNesting = Math.max(maxNesting, current.depth + 1);
      continue;
    }

    cyclomatic += branchIncrement(nodes, current.index, file.text);
    if (
      currentNode.type === "TryStatement" ||
      currentNode.type === "RaiseStatement"
    ) {
      hasErrorHandling = true;
    }

    let children: MetricEntry[];

    if (currentNode.type === "TryStatement") {
      const result = tryChildren(nodes, current.index, current.depth);

      children = result.entries;
      maxNesting = Math.max(maxNesting, result.handlerDepth);
    } else {
      const depth = increasesNesting(currentNode.type)
        ? current.depth + 1
        : current.depth;

      if (depth > current.depth) {
        maxNesting = Math.max(maxNesting, depth);
      }
      children = currentNode.children.map((child) => ({ index: child, depth }));
    }

    for (
      let childIndex = children.length - 1;
      childIndex >= 0;
      childIndex -= 1
    ) {
      const child = children[childIndex];

      if (child !== undefined) {
        pending.push(child);
      }
    }
  }

  return {
    path: file.path,
    name: nodeTextAt(nodes, nameIndex, file.text),
    startLine,
    endLine,
    logicalLines: logicalLinesInRange(logicalLines, startLine, endLine),
    cyclomatic,
    maxNesting,
    hasErrorHandling,
    isTest: file.isTest,
  };
}

function collectTargetVariables(
  nodes: readonly PythonNode[],
  index: number,
  output: Set<number>,
): void {
  const pending = [index];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = nodes[current];

    if (node === undefined) {
      continue;
    }
    if (node.type === "VariableName") {
      output.add(current);
      continue;
    }
    if (!TARGET_CONTAINERS.has(node.type)) {
      continue;
    }
    for (const child of node.children) {
      pending.push(child);
    }
  }
}

function collectAssignmentBindings(
  nodes: readonly PythonNode[],
  index: number,
  output: Set<number>,
): void {
  const children = nodes[index]?.children ?? [];
  const hasAssignment = children.some(
    (child) => nodes[child]?.type === "AssignOp",
  );
  let segmentStart = 0;

  if (!hasAssignment) {
    const typePosition = children.findIndex(
      (child) => nodes[child]?.type === "TypeDef",
    );

    for (let position = 0; position < typePosition; position += 1) {
      const target = children[position];

      if (target !== undefined) {
        collectTargetVariables(nodes, target, output);
      }
    }
    return;
  }

  for (let position = 0; position < children.length; position += 1) {
    const child = children[position];

    if (child === undefined || nodes[child]?.type !== "AssignOp") {
      continue;
    }
    for (
      let targetPosition = segmentStart;
      targetPosition < position;
      targetPosition += 1
    ) {
      const target = children[targetPosition];

      if (target !== undefined) {
        collectTargetVariables(nodes, target, output);
      }
    }
    segmentStart = position + 1;
  }
}

function collectForBindings(
  nodes: readonly PythonNode[],
  index: number,
  output: Set<number>,
): void {
  const children = nodes[index]?.children ?? [];
  for (let forPosition = 0; forPosition < children.length; forPosition += 1) {
    const forChild = children[forPosition];

    if (forChild === undefined || nodes[forChild]?.type !== "for") {
      continue;
    }
    const inPosition = children.findIndex(
      (child, position) =>
        position > forPosition && nodes[child]?.type === "in",
    );

    if (inPosition === -1) {
      continue;
    }
    for (
      let targetPosition = forPosition + 1;
      targetPosition < inPosition;
      targetPosition += 1
    ) {
      const target = children[targetPosition];

      if (target !== undefined) {
        collectTargetVariables(nodes, target, output);
      }
    }
  }
}

function collectAsBindings(
  nodes: readonly PythonNode[],
  index: number,
  output: Set<number>,
): void {
  const children = nodes[index]?.children ?? [];

  for (let position = 0; position < children.length - 1; position += 1) {
    const child = children[position];
    const next = children[position + 1];

    if (
      child !== undefined &&
      next !== undefined &&
      nodes[child]?.type === "as" &&
      nodes[next]?.type === "VariableName"
    ) {
      output.add(next);
    }
  }
}

function leafIndices(
  nodes: readonly PythonNode[],
  rootIndex: number,
): number[] {
  const result: number[] = [];
  const pending = [rootIndex];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = nodes[current];

    if (node === undefined) {
      continue;
    }
    if (node.children.length === 0) {
      result.push(current);
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];

      if (child !== undefined) {
        pending.push(child);
      }
    }
  }

  return result;
}

function collectImportBindings(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
  output: Set<number>,
): void {
  const leaves = leafIndices(nodes, index);
  let importPosition = -1;

  for (let position = 0; position < leaves.length; position += 1) {
    const leaf = leaves[position];

    if (leaf !== undefined && nodeTextAt(nodes, leaf, text) === "import") {
      importPosition = position;
    }
  }
  if (importPosition === -1) {
    return;
  }

  let group: number[] = [];
  const collectGroup = (): void => {
    const asPosition = group.findIndex(
      (leaf) => nodeTextAt(nodes, leaf, text) === "as",
    );
    const candidates = group.filter(
      (leaf) => nodes[leaf]?.type === "VariableName",
    );
    const binding =
      asPosition === -1
        ? candidates[0]
        : group
            .slice(asPosition + 1)
            .find((leaf) => nodes[leaf]?.type === "VariableName");

    if (binding !== undefined) {
      output.add(binding);
    }
  };

  for (
    let position = importPosition + 1;
    position <= leaves.length;
    position += 1
  ) {
    const leaf = leaves[position];
    const value = leaf === undefined ? "," : nodeTextAt(nodes, leaf, text);

    if (value === ",") {
      collectGroup();
      group = [];
    } else if (leaf !== undefined && value !== "(" && value !== ")") {
      group.push(leaf);
    }
  }
}

function bindingIdentifiers(
  nodes: readonly PythonNode[],
  text: string,
): Set<number> {
  const result = new Set<number>();

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (node === undefined) {
      continue;
    }
    if (node.type === "FunctionDefinition" || node.type === "ClassDefinition") {
      const name = firstDirectVariable(nodes, index);

      if (name !== null) {
        result.add(name);
      }
    } else if (node.type === "ParamList") {
      for (const child of node.children) {
        if (nodes[child]?.type === "VariableName") {
          result.add(child);
        }
      }
    } else if (
      node.type === "AssignStatement" ||
      node.type === "NamedExpression"
    ) {
      collectAssignmentBindings(nodes, index, result);
    } else if (
      node.type === "ForStatement" ||
      COMPREHENSION_CONTAINERS.has(node.type)
    ) {
      collectForBindings(nodes, index, result);
    } else if (node.type === "WithStatement" || node.type === "TryStatement") {
      collectAsBindings(nodes, index, result);
    } else if (node.type === "ImportStatement") {
      collectImportBindings(nodes, index, text, result);
    } else if (
      node.type === "CapturePattern" ||
      node.type === "TypeDefinition"
    ) {
      const name = firstDirectVariable(nodes, index);

      if (
        name !== null &&
        (node.type !== "CapturePattern" ||
          nodeTextAt(nodes, name, text) !== "_")
      ) {
        result.add(name);
      }
    }
  }

  return result;
}

function isAmbiguousIdentifier(name: string): boolean {
  return (
    Array.from(name).length <= 2 && !AMBIGUOUS_IDENTIFIER_ALLOWLIST.has(name)
  );
}

function semanticParent(
  nodes: readonly PythonNode[],
  index: number,
): number | null {
  let parent = nodes[index]?.parent ?? null;

  if (parent !== null && nodes[parent]?.type === "DecoratedStatement") {
    parent = nodes[parent]?.parent ?? null;
  }

  return parent;
}

function publicApiKind(
  nodes: readonly PythonNode[],
  index: number,
): "top-level" | "method" | null {
  const node = nodes[index];
  const parent = semanticParent(nodes, index);

  if (node === undefined || parent === null) {
    return null;
  }
  if (nodes[parent]?.type === "Script") {
    return "top-level";
  }
  if (node.type !== "FunctionDefinition" || nodes[parent]?.type !== "Body") {
    return null;
  }

  const owner = nodes[parent].parent;

  return owner !== null && nodes[owner]?.type === "ClassDefinition"
    ? "method"
    : null;
}

function hasDocstring(nodes: readonly PythonNode[], index: number): boolean {
  const bodyIndex = nodes[index]?.children.find(
    (child) => nodes[child]?.type === "Body",
  );

  if (bodyIndex === undefined) {
    return false;
  }
  const statementIndex = nodes[bodyIndex]?.children.find(
    (child) => nodes[child]?.type !== ":",
  );

  if (
    statementIndex === undefined ||
    nodes[statementIndex]?.type !== "ExpressionStatement"
  ) {
    return false;
  }
  const expressionIndex = nodes[statementIndex].children.find((child) => {
    const type = nodes[child]?.type;

    return type === "String" || type === "ContinuedString";
  });

  return expressionIndex !== undefined;
}

function relativePythonImport(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): string | null {
  const leaves = leafIndices(nodes, index);
  const values = leaves.map((leaf) => nodeTextAt(nodes, leaf, text));

  if (values[0] !== "from") {
    return null;
  }
  const importPosition = values.indexOf("import", 1);

  if (importPosition === -1) {
    return null;
  }
  const module = values.slice(1, importPosition).join("");

  return module.startsWith(".") ? module : null;
}

function normalizedTokens(
  nodes: readonly PythonNode[],
  text: string,
): string[] {
  const result: string[] = [];
  const pending = [0];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = nodes[current];

    if (node === undefined || node.type === "Comment") {
      continue;
    }
    if (node.type === "String") {
      result.push("STRING");
      continue;
    }
    if (node.type === "FormatString") {
      result.push("TEMPLATE");
      continue;
    }
    if (node.type === "Number") {
      result.push("NUMBER");
      continue;
    }
    if (node.children.length === 0) {
      const value = nodeText(node, text);

      if (value.trim().length > 0) {
        result.push(value);
      }
      continue;
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];

      if (child !== undefined) {
        pending.push(child);
      }
    }
  }

  return result;
}

function analyzeParsedFile(
  file: FetchedTextFile,
  nodes: readonly PythonNode[],
  output: LanguageAnalysis,
): void {
  if (isStubPath(file.path)) {
    output.files.push({
      path: file.path,
      language: "python",
      logicalLines: 0,
      isTest: file.isTest,
      normalizedTokens: [],
      relativeImports: [],
    });
    return;
  }

  const logicalLines = logicalLineNumbers(file.text, "python");
  const lineAt = lineLookup(file.text);
  const imports = new Set<string>();
  const analyzedFile: AnalyzedSourceFile = {
    path: file.path,
    language: "python",
    logicalLines: logicalLines.length,
    isTest: file.isTest,
    normalizedTokens: normalizedTokens(nodes, file.text),
    relativeImports: [],
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
        if (hasDocstring(nodes, index)) {
          output.documentedExports += 1;
        }
      }
    }
    if (node.type === "ImportStatement") {
      const relative = relativePythonImport(nodes, index, file.text);

      if (relative !== null) {
        imports.add(relative);
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

  analyzedFile.relativeImports = [...imports].sort();
  output.files.push(analyzedFile);
}

function comparePaths(left: { path: string }, right: { path: string }): number {
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

    output.parsedBytes += file.bytes;
    analyzeParsedFile(file, nodes, output);
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
