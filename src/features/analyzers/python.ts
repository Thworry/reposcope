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

interface LexicalOwner {
  kind: "function" | "lambda" | "comprehension";
  index: number;
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
    if (currentNode.type === "LambdaExpression") {
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

function collectParameterBindings(
  nodes: readonly PythonNode[],
  index: number,
  output: Set<number>,
): void {
  const children = nodes[index]?.children ?? [];
  let group: number[] = [];

  const collectGroup = (): void => {
    const binding = group.find(
      (child) => nodes[child]?.type === "VariableName",
    );

    if (binding !== undefined) {
      output.add(binding);
    }
  };

  for (let position = 0; position <= children.length; position += 1) {
    const child = children[position];

    if (child === undefined || nodes[child]?.type === ",") {
      collectGroup();
      group = [];
    } else {
      group.push(child);
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

function functionScopeDeclarations(
  nodes: readonly PythonNode[],
  text: string,
): ReadonlyMap<number, ReadonlySet<string>> {
  const result = new Map<number, ReadonlySet<string>>();

  for (let index = 0; index < nodes.length; index += 1) {
    if (nodes[index]?.type !== "FunctionDefinition") {
      continue;
    }
    const body = nodes[index]?.children.find(
      (child) => nodes[child]?.type === "Body",
    );

    if (body === undefined) {
      continue;
    }
    const names = new Set<string>();
    const pending = [body];

    while (pending.length > 0) {
      const current = pending.pop();

      if (current === undefined) {
        break;
      }
      const node = nodes[current];

      if (node === undefined) {
        continue;
      }
      if (
        current !== body &&
        (node.type === "FunctionDefinition" ||
          node.type === "LambdaExpression" ||
          node.type === "ClassDefinition")
      ) {
        continue;
      }
      if (node.type === "ScopeStatement") {
        for (const child of node.children) {
          if (nodes[child]?.type === "VariableName") {
            names.add(nodeTextAt(nodes, child, text));
          }
        }
        continue;
      }
      for (const child of node.children) {
        pending.push(child);
      }
    }

    if (names.size > 0) {
      result.set(index, names);
    }
  }

  return result;
}

function bindingIdentifiers(
  nodes: readonly PythonNode[],
  text: string,
): Set<number> {
  const result = new Set<number>();
  const scopeDeclarations = functionScopeDeclarations(nodes, text);

  const localLexicalOwner = (
    index: number,
    skipComprehensions = false,
  ): LexicalOwner | null => {
    let parent = nodes[index]?.parent ?? null;
    let crossedSignature = false;

    while (parent !== null) {
      const type = nodes[parent]?.type;

      if (type === "ParamList" || type === "TypeDef") {
        crossedSignature = true;
      } else if (
        !skipComprehensions &&
        COMPREHENSION_CONTAINERS.has(type ?? "")
      ) {
        return { kind: "comprehension", index: parent };
      } else if (type === "FunctionDefinition" || type === "LambdaExpression") {
        if (crossedSignature) {
          crossedSignature = false;
        } else {
          return {
            kind: type === "FunctionDefinition" ? "function" : "lambda",
            index: parent,
          };
        }
      } else if (type === "ClassDefinition" || type === "Script") {
        return null;
      }
      parent = nodes[parent]?.parent ?? null;
    }

    return null;
  };

  const addLocalBindings = (
    candidates: ReadonlySet<number>,
    skipComprehensions = false,
  ): void => {
    for (const candidate of candidates) {
      const owner = localLexicalOwner(candidate, skipComprehensions);

      if (owner === null) {
        continue;
      }
      if (
        owner.kind === "function" &&
        scopeDeclarations
          .get(owner.index)
          ?.has(nodeTextAt(nodes, candidate, text)) === true
      ) {
        continue;
      }
      result.add(candidate);
    }
  };

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
      collectParameterBindings(nodes, index, result);
    } else if (
      node.type === "AssignStatement" ||
      node.type === "NamedExpression"
    ) {
      const candidates = new Set<number>();

      collectAssignmentBindings(nodes, index, candidates);
      addLocalBindings(candidates, node.type === "NamedExpression");
    } else if (
      node.type === "ForStatement" ||
      COMPREHENSION_CONTAINERS.has(node.type)
    ) {
      const candidates = new Set<number>();

      collectForBindings(nodes, index, candidates);
      addLocalBindings(candidates);
    } else if (node.type === "WithStatement" || node.type === "TryStatement") {
      const candidates = new Set<number>();

      collectAsBindings(nodes, index, candidates);
      addLocalBindings(candidates);
    } else if (node.type === "ImportStatement") {
      collectImportBindings(nodes, index, text, result);
    } else if (node.type === "CapturePattern") {
      const name = firstDirectVariable(nodes, index);

      if (name !== null && nodeTextAt(nodes, name, text) !== "_") {
        addLocalBindings(new Set([name]));
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

function hasDocstring(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean {
  const bodyIndex = nodes[index]?.children.find(
    (child) => nodes[child]?.type === "Body",
  );

  if (bodyIndex === undefined) {
    return false;
  }
  const statementIndex = nodes[bodyIndex]?.children.find((child) => {
    const type = nodes[child]?.type;

    return type !== ":" && type !== "Comment";
  });

  if (
    statementIndex === undefined ||
    nodes[statementIndex]?.type !== "ExpressionStatement"
  ) {
    return false;
  }
  const expressions = nodes[statementIndex].children.filter((child) => {
    const type = nodes[child]?.type;

    return type !== undefined && type !== "," && type !== "Comment";
  });

  if (expressions.length !== 1) {
    return false;
  }
  const expression = expressions[0];

  if (expression === undefined) {
    return false;
  }

  const pending = [expression];
  let sawString = false;

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = nodes[current];

    if (node === undefined) {
      return false;
    }
    if (node.type === "String") {
      const prefix = /^([a-z]*)['"]/iu.exec(nodeText(node, text))?.[1];

      if (prefix !== undefined && /[bf]/iu.test(prefix)) {
        return false;
      }
      sawString = true;
      continue;
    }
    if (node.type === "ContinuedString") {
      const parts = node.children.filter(
        (child) => nodes[child]?.type !== "Comment",
      );

      if (
        parts.length === 0 ||
        parts.some((part) => {
          const type = nodes[part]?.type;

          return type !== "String" && type !== "FormatString";
        })
      ) {
        return false;
      }
      for (const part of parts) {
        pending.push(part);
      }
      continue;
    }
    if (node.type === "ParenthesizedExpression") {
      const parts = node.children.filter((child) => {
        const type = nodes[child]?.type;

        return type !== "(" && type !== ")" && type !== "Comment";
      });

      if (parts.length !== 1 || parts[0] === undefined) {
        return false;
      }
      pending.push(parts[0]);
      continue;
    }

    return false;
  }

  return sawString;
}

function relativePythonImports(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): { definite: string[]; candidates: string[] } {
  const leaves = leafIndices(nodes, index);
  const values = leaves.map((leaf) => nodeTextAt(nodes, leaf, text));

  if (values[0] !== "from") {
    return { definite: [], candidates: [] };
  }
  const importPosition = values.indexOf("import", 1);

  if (importPosition === -1) {
    return { definite: [], candidates: [] };
  }
  const module = values.slice(1, importPosition).join("");

  if (!module.startsWith(".")) {
    return { definite: [], candidates: [] };
  }

  const definite = [module];
  const candidates: string[] = [];

  if (!/^\.+$/u.test(module)) {
    return { definite, candidates };
  }

  let skipAlias = false;
  for (
    let position = importPosition + 1;
    position < leaves.length;
    position += 1
  ) {
    const leaf = leaves[position];
    const value = values[position];

    if (value === "as") {
      skipAlias = true;
    } else if (leaf !== undefined && nodes[leaf]?.type === "VariableName") {
      if (skipAlias) {
        skipAlias = false;
      } else if (value !== undefined) {
        candidates.push(`${module}${value}`);
      }
    }
  }

  return { definite, candidates };
}

function stripOuterParentheses(value: string): string {
  let result = value;

  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wrapsWholeValue = true;

    for (let index = 0; index < result.length; index += 1) {
      const character = result[index];

      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0 && index < result.length - 1) {
          wrapsWholeValue = false;
          break;
        }
      }
      if (depth < 0) {
        wrapsWholeValue = false;
        break;
      }
    }
    if (!wrapsWholeValue || depth !== 0) {
      break;
    }
    result = result.slice(1, -1);
  }

  return result;
}

function isCanonicalTypeCheckingIf(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean {
  const children = nodes[index]?.children ?? [];
  const ifIndex = children.find((child) => nodes[child]?.type === "if");
  const bodyIndex = children.find((child) => nodes[child]?.type === "Body");

  if (ifIndex === undefined || bodyIndex === undefined) {
    return false;
  }
  const condition = stripOuterParentheses(
    text
      .slice(nodes[ifIndex]?.to ?? 0, nodes[bodyIndex]?.from ?? 0)
      .replace(/\s+/gu, ""),
  );

  return condition === "TYPE_CHECKING" || condition === "typing.TYPE_CHECKING";
}

function isTypeCheckingOnlyImport(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean {
  let current = nodes[index]?.parent ?? null;

  while (current !== null) {
    const node = nodes[current];

    if (node?.type === "Body" && node.parent !== null) {
      const owner = nodes[node.parent];

      if (owner?.type === "IfStatement") {
        const trueBody = owner.children.find(
          (child) => nodes[child]?.type === "Body",
        );

        if (
          trueBody === current &&
          isCanonicalTypeCheckingIf(nodes, node.parent, text)
        ) {
          return true;
        }
      }
    }
    current = node?.parent ?? null;
  }

  return false;
}

function collectRelativeImports(
  nodes: readonly PythonNode[],
  text: string,
  packageBindingsBeforeImport?: ReadonlyMap<number, ReadonlySet<string>>,
): { definite: string[]; candidates: string[] } {
  const imports = new Set<string>();
  const candidates = new Set<string>();

  for (let index = 0; index < nodes.length; index += 1) {
    if (
      nodes[index]?.type !== "ImportStatement" ||
      isTypeCheckingOnlyImport(nodes, index, text)
    ) {
      continue;
    }
    const relative = relativePythonImports(nodes, index, text);

    for (const definite of relative.definite) {
      imports.add(definite);
    }
    for (const candidate of relative.candidates) {
      const importedName = /^\.+(.+)$/u.exec(candidate)?.[1];
      const importOffset = nodes[index]?.from ?? 0;

      if (
        importedName !== undefined &&
        packageBindingsBeforeImport?.get(importOffset)?.has(importedName) ===
          true
      ) {
        continue;
      }
      candidates.add(candidate);
    }
  }

  return {
    definite: [...imports].sort(),
    candidates: [...candidates].sort(),
  };
}

function hasModuleScope(nodes: readonly PythonNode[], index: number): boolean {
  let current = nodes[index]?.parent ?? null;

  while (current !== null) {
    const type = nodes[current]?.type;

    if (type === "Script") {
      return true;
    }
    if (
      type === "FunctionDefinition" ||
      type === "LambdaExpression" ||
      type === "ClassDefinition" ||
      COMPREHENSION_CONTAINERS.has(type ?? "")
    ) {
      return false;
    }
    current = nodes[current]?.parent ?? null;
  }

  return false;
}

function hasDefiniteModuleExecution(
  nodes: readonly PythonNode[],
  index: number,
): boolean {
  if (!hasModuleScope(nodes, index)) {
    return false;
  }

  let current = index;
  while (current !== 0) {
    const parent = nodes[current]?.parent ?? null;

    if (parent === null) {
      return false;
    }
    if (nodes[parent]?.type === "Body") {
      const owner = nodes[parent].parent;

      if (owner !== null && nodes[owner]?.type !== "Script") {
        return false;
      }
    }
    if (nodes[parent]?.type === "Script") {
      return true;
    }
    current = parent;
  }

  return true;
}

function normalizedCondition(
  nodes: readonly PythonNode[],
  keywordIndex: number,
  bodyIndex: number,
  text: string,
): string {
  return stripOuterParentheses(
    text
      .slice(nodes[keywordIndex]?.to ?? 0, nodes[bodyIndex]?.from ?? 0)
      .replace(/\s+/gu, ""),
  );
}

function conditionTruth(value: string): boolean | null {
  if (value === "True") {
    return true;
  }
  if (
    value === "False" ||
    value === "TYPE_CHECKING" ||
    value === "typing.TYPE_CHECKING"
  ) {
    return false;
  }

  return null;
}

function isReachableIfBody(
  nodes: readonly PythonNode[],
  ifIndex: number,
  bodyIndex: number,
  text: string,
): boolean {
  const children = nodes[ifIndex]?.children ?? [];
  let keywordIndex: number | null = null;
  let previousBranchDefinitelyTrue = false;

  for (const child of children) {
    const type = nodes[child]?.type;

    if (type === "if" || type === "elif" || type === "else") {
      keywordIndex = child;
      continue;
    }
    if (type !== "Body" || keywordIndex === null) {
      continue;
    }
    const keywordType = nodes[keywordIndex]?.type;
    const truth =
      keywordType === "else"
        ? true
        : conditionTruth(normalizedCondition(nodes, keywordIndex, child, text));

    if (child === bodyIndex) {
      return !previousBranchDefinitelyTrue && truth !== false;
    }
    if (truth === true) {
      previousBranchDefinitelyTrue = true;
    }
    keywordIndex = null;
  }

  return true;
}

function hasReachableModuleExecution(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): boolean {
  if (!hasModuleScope(nodes, index)) {
    return false;
  }

  let current = index;
  while (current !== 0) {
    const parent = nodes[current]?.parent ?? null;

    if (parent === null) {
      return false;
    }
    if (nodes[parent]?.type === "Body") {
      const owner = nodes[parent].parent;

      if (
        owner !== null &&
        nodes[owner]?.type === "IfStatement" &&
        !isReachableIfBody(nodes, owner, parent, text)
      ) {
        return false;
      }
    }
    if (nodes[parent]?.type === "Script") {
      return true;
    }
    current = parent;
  }

  return true;
}

interface ModuleBindingEvent {
  offset: number;
  kind: "set" | "delete" | "import";
  names: readonly string[];
}

interface TopLevelBindingMetadata {
  finalNames: string[];
  namesBeforeImport: ReadonlyMap<number, ReadonlySet<string>>;
}

function topLevelBindingMetadata(
  nodes: readonly PythonNode[],
  text: string,
): TopLevelBindingMetadata {
  const events: ModuleBindingEvent[] = [];
  const addSetEvent = (
    offset: number,
    candidates: ReadonlySet<number>,
  ): void => {
    const names: string[] = [];

    for (const candidate of candidates) {
      if (
        hasDefiniteModuleExecution(nodes, candidate) &&
        !isTypeCheckingOnlyImport(nodes, candidate, text)
      ) {
        names.push(nodeTextAt(nodes, candidate, text));
      }
    }
    if (names.length > 0) {
      events.push({ offset, kind: "set", names });
    }
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (node === undefined) {
      continue;
    }
    if (
      (node.type === "FunctionDefinition" || node.type === "ClassDefinition") &&
      hasDefiniteModuleExecution(nodes, index) &&
      !isTypeCheckingOnlyImport(nodes, index, text)
    ) {
      const name = firstDirectVariable(nodes, index);

      if (name !== null) {
        events.push({
          offset: node.from,
          kind: "set",
          names: [nodeTextAt(nodes, name, text)],
        });
      }
    } else if (
      node.type === "AssignStatement" &&
      node.children.some((child) => nodes[child]?.type === "AssignOp")
    ) {
      const bindings = new Set<number>();

      collectAssignmentBindings(nodes, index, bindings);
      addSetEvent(node.from, bindings);
    } else if (node.type === "NamedExpression") {
      const bindings = new Set<number>();

      collectAssignmentBindings(nodes, index, bindings);
      addSetEvent(node.from, bindings);
    } else if (node.type === "UpdateStatement") {
      const binding = node.children.find(
        (child) => nodes[child]?.type === "VariableName",
      );

      if (binding !== undefined) {
        addSetEvent(node.from, new Set([binding]));
      }
    } else if (node.type === "ImportStatement") {
      if (isTypeCheckingOnlyImport(nodes, index, text)) {
        continue;
      }
      const relative = relativePythonImports(nodes, index, text);

      if (relative.candidates.length > 0) {
        events.push({ offset: node.from, kind: "import", names: [] });
        continue;
      }
      const bindings = new Set<number>();

      collectImportBindings(nodes, index, text, bindings);
      addSetEvent(node.from, bindings);
    } else if (
      node.type === "DeleteStatement" &&
      hasReachableModuleExecution(nodes, index, text)
    ) {
      const names = node.children
        .filter((child) => nodes[child]?.type === "VariableName")
        .map((child) => nodeTextAt(nodes, child, text));

      if (names.length > 0) {
        events.push({ offset: node.from, kind: "delete", names });
      }
    }
  }

  events.sort(
    (left, right) =>
      left.offset - right.offset ||
      left.kind.localeCompare(right.kind, "en-US"),
  );
  const present = new Set<string>();
  const namesBeforeImport = new Map<number, ReadonlySet<string>>();

  for (const event of events) {
    if (event.kind === "import") {
      namesBeforeImport.set(event.offset, new Set(present));
    } else if (event.kind === "set") {
      for (const name of event.names) {
        present.add(name);
      }
    } else {
      for (const name of event.names) {
        present.delete(name);
      }
    }
  }

  return {
    finalNames: [...present].sort(),
    namesBeforeImport,
  };
}

function normalizedTokens(
  nodes: readonly PythonNode[],
  text: string,
): string[] {
  const result: string[] = [];
  const formatExpressionRoots = (formatIndex: number): number[] => {
    const replacements: number[] = [];
    const pending = [...(nodes[formatIndex]?.children ?? [])].reverse();

    while (pending.length > 0) {
      const current = pending.pop();

      if (current === undefined) {
        break;
      }
      const node = nodes[current];

      if (node === undefined) {
        continue;
      }
      if (node.type === "FormatReplacement") {
        replacements.push(current);
      }
      if (node.type === "FormatString") {
        continue;
      }
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        const child = node.children[index];

        if (child !== undefined) {
          pending.push(child);
        }
      }
    }

    const roots: number[] = [];

    for (const replacement of replacements) {
      for (const child of nodes[replacement]?.children ?? []) {
        const type = nodes[child]?.type;

        if (
          type !== "{" &&
          type !== "}" &&
          type !== "FormatSelfDoc" &&
          type !== "FormatConversion" &&
          type !== "FormatSpec"
        ) {
          roots.push(child);
        }
      }
    }

    return roots;
  };
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
      const roots = formatExpressionRoots(current);

      for (let index = roots.length - 1; index >= 0; index -= 1) {
        const root = roots[index];

        if (root !== undefined) {
          pending.push(root);
        }
      }
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
  const lineAt = lineLookup(file.text);
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
