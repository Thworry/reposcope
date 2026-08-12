import type { FetchedTextFile, FunctionMetric } from "../../analysis/model";
import type { LineLookup, MetricEntry, PythonNode } from "./model";
import { logicalLinesInRange, nodeTextAt } from "./syntax";

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

export function firstDirectVariable(
  nodes: readonly PythonNode[],
  index: number,
): number | null {
  return (
    nodes[index]?.children.find(
      (child) => nodes[child]?.type === "VariableName",
    ) ?? null
  );
}

export function functionMetric(
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
