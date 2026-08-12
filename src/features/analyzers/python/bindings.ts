import type { PythonNode } from "./model";
import { nodeTextAt } from "./syntax";

interface LexicalOwner {
  kind: "function" | "lambda" | "comprehension";
  index: number;
}

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

export const TARGET_CONTAINERS = new Set([
  "ArrayExpression",
  "ParenthesizedExpression",
  "TupleExpression",
]);
export const COMPREHENSION_CONTAINERS = new Set([
  "ArrayComprehensionExpression",
  "ComprehensionExpression",
  "DictionaryComprehensionExpression",
  "SetComprehensionExpression",
]);

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

export function collectAssignmentBindings(
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

export function collectForBindings(
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

export function collectAsBindings(
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

export function leafIndices(
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

export function collectImportBindings(
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

export function bindingIdentifiers(
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

export function isAmbiguousIdentifier(name: string): boolean {
  return (
    Array.from(name).length <= 2 && !AMBIGUOUS_IDENTIFIER_ALLOWLIST.has(name)
  );
}
