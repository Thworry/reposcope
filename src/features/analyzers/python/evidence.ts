import { leafIndices } from "./bindings";
import type { PythonNode } from "./model";
import { nodeText, nodeTextAt } from "./syntax";

export interface RelativeImportEvidence {
  definite: string[];
  candidates: string[];
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

export function publicApiKind(
  nodes: readonly PythonNode[],
  index: number,
): "function" | "class" | "method" | null {
  const node = nodes[index];
  const parent = semanticParent(nodes, index);

  if (node === undefined || parent === null) {
    return null;
  }
  if (nodes[parent]?.type === "Script") {
    if (node.type === "FunctionDefinition") {
      return "function";
    }

    return node.type === "ClassDefinition" ? "class" : null;
  }
  if (node.type !== "FunctionDefinition" || nodes[parent]?.type !== "Body") {
    return null;
  }

  const owner = nodes[parent].parent;

  return owner !== null && nodes[owner]?.type === "ClassDefinition"
    ? "method"
    : null;
}

export function hasDocstring(
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

export function relativePythonImports(
  nodes: readonly PythonNode[],
  index: number,
  text: string,
): RelativeImportEvidence {
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

export function stripOuterParentheses(value: string): string {
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

export function isTypeCheckingOnlyImport(
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

export function collectRelativeImports(
  nodes: readonly PythonNode[],
  text: string,
  namesBeforeImport?: ReadonlyMap<number, ReadonlySet<string>>,
): RelativeImportEvidence {
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
        namesBeforeImport?.get(importOffset)?.has(importedName) === true
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

export function normalizedTokens(
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
