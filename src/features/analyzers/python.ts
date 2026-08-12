import type {
  AnalyzedSourceFile,
  FetchedTextFile,
  LanguageAnalysis,
} from "../analysis/model";
import { firstDirectVariable, functionMetric } from "./python/function-metrics";
import type { PythonNode } from "./python/model";
import {
  createPythonLineLookup,
  nodeText,
  nodeTextAt,
  parsePython,
} from "./python/syntax";
import { logicalLineNumbers } from "./line-metrics";

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

interface TopLevelBindingMetadata {
  finalNames: string[];
  namesBeforeImport: ReadonlyMap<number, ReadonlySet<string>>;
}

interface BindingFlowContext {
  nodes: readonly PythonNode[];
  text: string;
  namesBeforeImport: Map<number, ReadonlySet<string>>;
}

interface BindingFlowResult {
  normal: Set<string>;
  exceptional: Set<string> | null;
  breaks?: Set<string> | null;
  continues?: Set<string> | null;
  returns?: Set<string> | null;
  normalReachable?: boolean;
}

const MAX_BINDING_FLOW_DEPTH = 128;

function cloneBindingState(state: ReadonlySet<string>): Set<string> {
  return new Set(state);
}

function intersectBindingStates(
  states: readonly ReadonlySet<string>[],
): Set<string> {
  const first = states[0];

  if (first === undefined) {
    return new Set();
  }
  const result = new Set(first);

  for (const name of result) {
    if (states.some((state) => !state.has(name))) {
      result.delete(name);
    }
  }

  return result;
}

function addBindingIndices(
  context: BindingFlowContext,
  state: Set<string>,
  indices: ReadonlySet<number>,
): void {
  for (const index of indices) {
    const name = nodeTextAt(context.nodes, index, context.text);

    if (name.length > 0) {
      state.add(name);
    }
  }
}

function applyNamedExpressions(
  context: BindingFlowContext,
  rootIndices: readonly number[],
  state: Set<string>,
): void {
  const pending = [...rootIndices].reverse();

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = context.nodes[current];

    if (node === undefined) {
      continue;
    }
    if (
      node.type === "FunctionDefinition" ||
      node.type === "ClassDefinition" ||
      node.type === "LambdaExpression" ||
      node.type === "Body" ||
      COMPREHENSION_CONTAINERS.has(node.type)
    ) {
      continue;
    }
    if (node.type === "NamedExpression") {
      const bindings = new Set<number>();

      collectAssignmentBindings(context.nodes, current, bindings);
      addBindingIndices(context, state, bindings);
    }
    for (
      let position = node.children.length - 1;
      position >= 0;
      position -= 1
    ) {
      const child = node.children[position];

      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
}

function recordImportState(
  context: BindingFlowContext,
  offset: number,
  state: ReadonlySet<string>,
): void {
  const existing = context.namesBeforeImport.get(offset);

  context.namesBeforeImport.set(
    offset,
    existing === undefined
      ? cloneBindingState(state)
      : intersectBindingStates([existing, state]),
  );
}

function mergeBindingCompletionStates(
  states: readonly (ReadonlySet<string> | null | undefined)[],
): Set<string> | null {
  const reachable = states.filter(
    (state): state is ReadonlySet<string> => state != null,
  );

  return reachable.length === 0 ? null : intersectBindingStates(reachable);
}

function normalBindingFlowIsReachable(flow: BindingFlowResult): boolean {
  return flow.normalReachable !== false;
}

function conservativeBindingFlow(): BindingFlowResult {
  return { normal: new Set(), exceptional: new Set() };
}

function interpretBindingBlockFlow(
  context: BindingFlowContext,
  blockIndex: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  if (depth > MAX_BINDING_FLOW_DEPTH) {
    return conservativeBindingFlow();
  }

  let normal = cloneBindingState(input);
  let exceptional: Set<string> | null = null;
  let breaks: Set<string> | null = null;
  let continues: Set<string> | null = null;
  let returns: Set<string> | null = null;
  let normalReachable = true;

  for (const child of context.nodes[blockIndex]?.children ?? []) {
    if (!normalReachable) {
      break;
    }
    const flow = interpretBindingStatementFlow(context, child, normal, depth);

    exceptional = mergeBindingCompletionStates([exceptional, flow.exceptional]);
    breaks = mergeBindingCompletionStates([breaks, flow.breaks]);
    continues = mergeBindingCompletionStates([continues, flow.continues]);
    returns = mergeBindingCompletionStates([returns, flow.returns]);
    normal = flow.normal;
    normalReachable = normalBindingFlowIsReachable(flow);
  }

  return {
    normal,
    exceptional,
    breaks,
    continues,
    returns,
    normalReachable,
  };
}

function interpretIfStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  const children = context.nodes[index]?.children ?? [];
  const outcomes: Set<string>[] = [];
  const remaining = cloneBindingState(input);
  let exceptional: Set<string> | null = null;
  let breaks: Set<string> | null = null;
  let continues: Set<string> | null = null;
  let returns: Set<string> | null = null;
  let remainingPossible = true;
  let keywordIndex: number | null = null;
  let conditionChildren: number[] = [];

  for (const child of children) {
    const type = context.nodes[child]?.type;

    if (type === "if" || type === "elif" || type === "else") {
      keywordIndex = child;
      conditionChildren = [];
      continue;
    }
    if (type !== "Body") {
      if (keywordIndex !== null) {
        conditionChildren.push(child);
      }
      continue;
    }
    if (keywordIndex === null || !remainingPossible) {
      continue;
    }
    const keywordType = context.nodes[keywordIndex]?.type;

    if (keywordType === "else") {
      const flow = interpretBindingBlockFlow(
        context,
        child,
        remaining,
        depth + 1,
      );

      if (normalBindingFlowIsReachable(flow)) {
        outcomes.push(flow.normal);
      }
      exceptional = mergeBindingCompletionStates([
        exceptional,
        flow.exceptional,
      ]);
      breaks = mergeBindingCompletionStates([breaks, flow.breaks]);
      continues = mergeBindingCompletionStates([continues, flow.continues]);
      returns = mergeBindingCompletionStates([returns, flow.returns]);
      remainingPossible = false;
      continue;
    }

    const beforeCondition = cloneBindingState(remaining);

    applyNamedExpressions(context, conditionChildren, remaining);
    const truth = conditionTruth(
      normalizedCondition(context.nodes, keywordIndex, child, context.text),
    );

    if (truth === null) {
      exceptional = mergeBindingCompletionStates([
        exceptional,
        intersectBindingStates([beforeCondition, remaining]),
      ]);
    }
    if (truth !== false) {
      const flow = interpretBindingBlockFlow(
        context,
        child,
        remaining,
        depth + 1,
      );

      if (normalBindingFlowIsReachable(flow)) {
        outcomes.push(flow.normal);
      }
      exceptional = mergeBindingCompletionStates([
        exceptional,
        flow.exceptional,
      ]);
      breaks = mergeBindingCompletionStates([breaks, flow.breaks]);
      continues = mergeBindingCompletionStates([continues, flow.continues]);
      returns = mergeBindingCompletionStates([returns, flow.returns]);
    }
    if (truth === true) {
      remainingPossible = false;
    }
  }

  if (remainingPossible) {
    outcomes.push(remaining);
  }

  return {
    normal: intersectBindingStates(outcomes),
    exceptional,
    breaks,
    continues,
    returns,
    normalReachable: outcomes.length > 0,
  };
}

function interpretTryStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  const children = context.nodes[index]?.children ?? [];
  const handlers: { body: number; bindings: number[] }[] = [];
  let clause: "try" | "except" | "else" | "finally" | null = null;
  let tryBody: number | null = null;
  let elseBody: number | null = null;
  let finallyBody: number | null = null;
  let handlerBindings: number[] = [];
  let previousChild: number | null = null;

  for (const child of children) {
    const type = context.nodes[child]?.type;

    if (
      type === "try" ||
      type === "except" ||
      type === "else" ||
      type === "finally"
    ) {
      clause = type;
      if (type === "except") {
        handlerBindings = [];
      }
      previousChild = child;
      continue;
    }
    if (type !== "Body") {
      if (
        clause === "except" &&
        type === "VariableName" &&
        previousChild !== null &&
        context.nodes[previousChild]?.type === "as"
      ) {
        handlerBindings.push(child);
      }
      previousChild = child;
      continue;
    }
    if (clause === "try") {
      tryBody = child;
    } else if (clause === "except") {
      handlers.push({ body: child, bindings: [...handlerBindings] });
    } else if (clause === "else") {
      elseBody = child;
    } else if (clause === "finally") {
      finallyBody = child;
    }
    previousChild = child;
  }

  const tryFlow =
    tryBody === null
      ? { normal: cloneBindingState(input), exceptional: null }
      : interpretBindingBlockFlow(context, tryBody, input, depth + 1);
  let normal = tryFlow.normal;
  let normalReachable = normalBindingFlowIsReachable(tryFlow);
  let exceptional = tryFlow.exceptional;
  let breaks = tryFlow.breaks ?? null;
  let continues = tryFlow.continues ?? null;
  let returns = tryFlow.returns ?? null;

  if (elseBody !== null && normalReachable) {
    const elseFlow = interpretBindingBlockFlow(
      context,
      elseBody,
      normal,
      depth + 1,
    );

    normal = elseFlow.normal;
    normalReachable = normalBindingFlowIsReachable(elseFlow);
    exceptional = mergeBindingCompletionStates([
      exceptional,
      elseFlow.exceptional,
    ]);
    breaks = mergeBindingCompletionStates([breaks, elseFlow.breaks]);
    continues = mergeBindingCompletionStates([continues, elseFlow.continues]);
    returns = mergeBindingCompletionStates([returns, elseFlow.returns]);
  }
  const continuing = normalReachable ? [normal] : [];

  if (tryFlow.exceptional !== null) {
    for (const handler of handlers) {
      const handlerInput = cloneBindingState(tryFlow.exceptional);

      addBindingIndices(context, handlerInput, new Set(handler.bindings));
      const rawHandlerFlow = interpretBindingBlockFlow(
        context,
        handler.body,
        handlerInput,
        depth + 1,
      );
      const handlerNames = handler.bindings.map((binding) =>
        nodeTextAt(context.nodes, binding, context.text),
      );
      const handlerNormal = cloneBindingState(rawHandlerFlow.normal);
      const handlerExceptional =
        rawHandlerFlow.exceptional === null
          ? null
          : cloneBindingState(rawHandlerFlow.exceptional);
      const handlerBreaks =
        rawHandlerFlow.breaks == null
          ? null
          : cloneBindingState(rawHandlerFlow.breaks);
      const handlerContinues =
        rawHandlerFlow.continues == null
          ? null
          : cloneBindingState(rawHandlerFlow.continues);
      const handlerReturns =
        rawHandlerFlow.returns == null
          ? null
          : cloneBindingState(rawHandlerFlow.returns);

      for (const name of handlerNames) {
        handlerNormal.delete(name);
        handlerExceptional?.delete(name);
        handlerBreaks?.delete(name);
        handlerContinues?.delete(name);
        handlerReturns?.delete(name);
      }
      if (normalBindingFlowIsReachable(rawHandlerFlow)) {
        continuing.push(handlerNormal);
      }
      exceptional = mergeBindingCompletionStates([
        exceptional,
        handlerExceptional,
      ]);
      breaks = mergeBindingCompletionStates([breaks, handlerBreaks]);
      continues = mergeBindingCompletionStates([continues, handlerContinues]);
      returns = mergeBindingCompletionStates([returns, handlerReturns]);
    }
  }
  normal = intersectBindingStates(continuing);
  normalReachable = continuing.length > 0;

  if (finallyBody !== null) {
    const completions: {
      kind: "normal" | "exceptional" | "break" | "continue" | "return";
      state: ReadonlySet<string>;
    }[] = [];

    if (normalReachable) {
      completions.push({ kind: "normal", state: normal });
    }
    if (exceptional !== null) {
      completions.push({ kind: "exceptional", state: exceptional });
    }
    if (breaks !== null) {
      completions.push({ kind: "break", state: breaks });
    }
    if (continues !== null) {
      completions.push({ kind: "continue", state: continues });
    }
    if (returns !== null) {
      completions.push({ kind: "return", state: returns });
    }

    const finalNormal: Set<string>[] = [];
    let finalExceptional: Set<string> | null = null;
    let finalBreaks: Set<string> | null = null;
    let finalContinues: Set<string> | null = null;
    let finalReturns: Set<string> | null = null;

    for (const completion of completions) {
      const finalFlow = interpretBindingBlockFlow(
        context,
        finallyBody,
        completion.state,
        depth + 1,
      );

      finalExceptional = mergeBindingCompletionStates([
        finalExceptional,
        finalFlow.exceptional,
      ]);
      finalBreaks = mergeBindingCompletionStates([
        finalBreaks,
        finalFlow.breaks,
      ]);
      finalContinues = mergeBindingCompletionStates([
        finalContinues,
        finalFlow.continues,
      ]);
      finalReturns = mergeBindingCompletionStates([
        finalReturns,
        finalFlow.returns,
      ]);
      if (!normalBindingFlowIsReachable(finalFlow)) {
        continue;
      }
      if (completion.kind === "normal") {
        finalNormal.push(finalFlow.normal);
      } else if (completion.kind === "exceptional") {
        finalExceptional = mergeBindingCompletionStates([
          finalExceptional,
          finalFlow.normal,
        ]);
      } else if (completion.kind === "break") {
        finalBreaks = mergeBindingCompletionStates([
          finalBreaks,
          finalFlow.normal,
        ]);
      } else if (completion.kind === "continue") {
        finalContinues = mergeBindingCompletionStates([
          finalContinues,
          finalFlow.normal,
        ]);
      } else {
        finalReturns = mergeBindingCompletionStates([
          finalReturns,
          finalFlow.normal,
        ]);
      }
    }

    normal = intersectBindingStates(finalNormal);
    normalReachable = finalNormal.length > 0;
    exceptional = finalExceptional;
    breaks = finalBreaks;
    continues = finalContinues;
    returns = finalReturns;
  }

  return {
    normal,
    exceptional,
    breaks,
    continues,
    returns,
    normalReachable,
  };
}

function bindingStatementMayThrow(
  context: BindingFlowContext,
  index: number,
): boolean {
  const node = context.nodes[index];

  if (node === undefined || node.type === ":" || node.type === ";") {
    return false;
  }
  if (node.type === "PassStatement") {
    return false;
  }
  if (node.type === "AssignStatement") {
    const meaningful = node.children.filter(
      (child) => context.nodes[child]?.type !== "Comment",
    );
    const assignPosition = meaningful.findIndex(
      (child) => context.nodes[child]?.type === "AssignOp",
    );
    const target = meaningful[0];
    const value = meaningful[assignPosition + 1];

    if (
      meaningful.length === 3 &&
      assignPosition === 1 &&
      target !== undefined &&
      context.nodes[target]?.type === "VariableName" &&
      value !== undefined &&
      ["Boolean", "None", "Number", "String"].includes(
        context.nodes[value]?.type ?? "",
      )
    ) {
      return false;
    }
  }

  return node.type.endsWith("Statement") || node.type.endsWith("Definition");
}

function interpretDeleteStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
): BindingFlowResult {
  const normal = cloneBindingState(input);
  let exceptional: Set<string> | null = null;
  const pending = [...(context.nodes[index]?.children ?? [])].reverse();

  while (pending.length > 0) {
    const child = pending.pop();

    if (child === undefined) {
      break;
    }
    const type = context.nodes[child]?.type;

    if (type === "VariableName") {
      const name = nodeTextAt(context.nodes, child, context.text);

      if (!normal.has(name)) {
        exceptional = mergeBindingCompletionStates([exceptional, normal]);
      }
      normal.delete(name);
    } else if (type !== undefined && TARGET_CONTAINERS.has(type)) {
      const children = context.nodes[child]?.children ?? [];

      for (let position = children.length - 1; position >= 0; position -= 1) {
        const target = children[position];

        if (target !== undefined) {
          pending.push(target);
        }
      }
    } else if (
      type !== "del" &&
      type !== "," &&
      type !== ";" &&
      type !== "Comment" &&
      type !== "(" &&
      type !== ")" &&
      type !== "[" &&
      type !== "]"
    ) {
      exceptional = mergeBindingCompletionStates([exceptional, normal]);
    }
  }

  return { normal, exceptional };
}

function isAssignmentPunctuation(type: string | undefined): boolean {
  return (
    type === undefined ||
    type === "," ||
    type === "(" ||
    type === ")" ||
    type === "[" ||
    type === "]" ||
    type === "*" ||
    type === "Comment"
  );
}

function assignmentSequenceEntries(
  context: BindingFlowContext,
  index: number,
): number[] | null {
  const type = context.nodes[index]?.type;

  if (type !== "TupleExpression" && type !== "ArrayExpression") {
    return null;
  }

  return (context.nodes[index]?.children ?? []).filter(
    (child) => !isAssignmentPunctuation(context.nodes[child]?.type),
  );
}

function isDefinitelyNonThrowingAssignmentValue(
  context: BindingFlowContext,
  index: number,
): boolean {
  const pending = [index];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = context.nodes[current];

    if (node === undefined) {
      return false;
    }
    if (
      node.type === "Boolean" ||
      node.type === "None" ||
      node.type === "Number" ||
      node.type === "String"
    ) {
      continue;
    }
    if (
      node.type !== "ParenthesizedExpression" &&
      node.type !== "TupleExpression" &&
      node.type !== "ArrayExpression"
    ) {
      return false;
    }
    for (const child of node.children) {
      if (!isAssignmentPunctuation(context.nodes[child]?.type)) {
        pending.push(child);
      }
    }
  }

  return true;
}

type AssignmentTargetTask =
  | { kind: "node"; index: number; value: number | null }
  | { kind: "sequence"; indices: number[]; value: number | null };

function applyAssignmentTargets(
  context: BindingFlowContext,
  target: AssignmentTargetTask,
  state: Set<string>,
  inputExceptional: Set<string> | null,
): Set<string> | null {
  let exceptional = inputExceptional;
  const pending = [target];

  while (pending.length > 0) {
    const task = pending.pop();

    if (task === undefined) {
      break;
    }
    if (task.kind === "sequence") {
      const rawTargets = task.indices.filter(
        (index) => !isAssignmentPunctuation(context.nodes[index]?.type),
      );
      const hasStar = task.indices.some(
        (index) => context.nodes[index]?.type === "*",
      );
      const values =
        task.value === null
          ? null
          : assignmentSequenceEntries(context, task.value);
      const exactlyMatched =
        !hasStar && values !== null && values.length === rawTargets.length;

      if (!exactlyMatched) {
        exceptional = mergeBindingCompletionStates([exceptional, state]);
      }
      for (let position = rawTargets.length - 1; position >= 0; position -= 1) {
        const index = rawTargets[position];

        if (index !== undefined) {
          pending.push({
            kind: "node",
            index,
            value: exactlyMatched ? (values[position] ?? null) : null,
          });
        }
      }
      continue;
    }

    const node = context.nodes[task.index];

    if (node === undefined) {
      exceptional = mergeBindingCompletionStates([exceptional, state]);
    } else if (node.type === "VariableName") {
      const name = nodeTextAt(context.nodes, task.index, context.text);

      if (name.length > 0) {
        state.add(name);
      }
    } else if (node.type === "ParenthesizedExpression") {
      const targets = node.children.filter(
        (child) => !isAssignmentPunctuation(context.nodes[child]?.type),
      );

      for (let position = targets.length - 1; position >= 0; position -= 1) {
        const index = targets[position];

        if (index !== undefined) {
          pending.push({ kind: "node", index, value: task.value });
        }
      }
    } else if (
      node.type === "TupleExpression" ||
      node.type === "ArrayExpression"
    ) {
      pending.push({
        kind: "sequence",
        indices: node.children,
        value: task.value,
      });
    } else if (!isAssignmentPunctuation(node.type)) {
      exceptional = mergeBindingCompletionStates([exceptional, state]);
    }
  }

  return exceptional;
}

function interpretAssignStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
): BindingFlowResult {
  const children = context.nodes[index]?.children ?? [];
  const assignPositions = children.flatMap((child, position) =>
    context.nodes[child]?.type === "AssignOp" ? [position] : [],
  );
  const finalAssignPosition = assignPositions.at(-1);

  if (finalAssignPosition === undefined) {
    return {
      normal: cloneBindingState(input),
      exceptional: cloneBindingState(input),
    };
  }
  const rhsChildren = children.slice(finalAssignPosition + 1);
  const rhs = rhsChildren.find(
    (child) => !isAssignmentPunctuation(context.nodes[child]?.type),
  );
  const normal = cloneBindingState(input);

  applyNamedExpressions(context, rhsChildren, normal);
  let exceptional =
    rhs !== undefined && isDefinitelyNonThrowingAssignmentValue(context, rhs)
      ? null
      : intersectBindingStates([input, normal]);
  let segmentStart = 0;

  for (const assignPosition of assignPositions) {
    const segment = children.slice(segmentStart, assignPosition);
    const isSequence = segment.some(
      (child) => context.nodes[child]?.type === ",",
    );
    const targets = segment.filter(
      (child) => !isAssignmentPunctuation(context.nodes[child]?.type),
    );

    if (isSequence) {
      exceptional = applyAssignmentTargets(
        context,
        { kind: "sequence", indices: segment, value: rhs ?? null },
        normal,
        exceptional,
      );
    } else {
      for (const target of targets) {
        exceptional = applyAssignmentTargets(
          context,
          { kind: "node", index: target, value: rhs ?? null },
          normal,
          exceptional,
        );
      }
    }
    segmentStart = assignPosition + 1;
  }

  return { normal, exceptional };
}

function interpretLoopStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  const children = context.nodes[index]?.children ?? [];
  const bodies = children.filter(
    (child) => context.nodes[child]?.type === "Body",
  );
  const loopBody = bodies[0];
  const elseBody = bodies[1];
  const headerState = cloneBindingState(input);

  applyNamedExpressions(
    context,
    children.filter(
      (child) =>
        context.nodes[child]?.type !== "Body" &&
        context.nodes[child]?.type !== "else",
    ),
    headerState,
  );
  const bodyInput = cloneBindingState(headerState);

  if (context.nodes[index]?.type === "ForStatement") {
    const bindings = new Set<number>();

    collectForBindings(context.nodes, index, bindings);
    addBindingIndices(context, bodyInput, bindings);
  }
  const bodyFlow =
    loopBody === undefined
      ? { normal: bodyInput, exceptional: null }
      : interpretBindingBlockFlow(context, loopBody, bodyInput, depth + 1);
  const exhaustionStates: ReadonlySet<string>[] = [headerState];

  if (normalBindingFlowIsReachable(bodyFlow)) {
    exhaustionStates.push(bodyFlow.normal);
  }
  if (bodyFlow.continues !== null && bodyFlow.continues !== undefined) {
    exhaustionStates.push(bodyFlow.continues);
  }
  const exhaustionState = intersectBindingStates(exhaustionStates);
  let exceptional = mergeBindingCompletionStates([
    intersectBindingStates([input, headerState]),
    bodyFlow.exceptional,
    normalBindingFlowIsReachable(bodyFlow) ? bodyFlow.normal : null,
    bodyFlow.continues,
  ]);
  const normalOutcomes: ReadonlySet<string>[] = [];
  let breaks: Set<string> | null = null;
  let continues: Set<string> | null = null;
  let returns = bodyFlow.returns ?? null;

  if (elseBody !== undefined) {
    const elseFlow = interpretBindingBlockFlow(
      context,
      elseBody,
      exhaustionState,
      depth + 1,
    );

    if (normalBindingFlowIsReachable(elseFlow)) {
      normalOutcomes.push(elseFlow.normal);
    }
    exceptional = mergeBindingCompletionStates([
      exceptional,
      elseFlow.exceptional,
    ]);
    breaks = mergeBindingCompletionStates([breaks, elseFlow.breaks]);
    continues = mergeBindingCompletionStates([continues, elseFlow.continues]);
    returns = mergeBindingCompletionStates([returns, elseFlow.returns]);
  } else {
    normalOutcomes.push(exhaustionState);
  }
  if (bodyFlow.breaks !== null && bodyFlow.breaks !== undefined) {
    normalOutcomes.push(bodyFlow.breaks);
  }

  return {
    normal: intersectBindingStates(normalOutcomes),
    exceptional,
    breaks,
    continues,
    returns,
    normalReachable: normalOutcomes.length > 0,
  };
}

function addMatchClauseBindings(
  context: BindingFlowContext,
  clauseIndex: number,
  state: Set<string>,
): void {
  const pending = [...(context.nodes[clauseIndex]?.children ?? [])].reverse();

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    const node = context.nodes[current];

    if (node === undefined || node.type === "Body") {
      continue;
    }
    if (node.type === "CapturePattern") {
      const binding = firstDirectVariable(context.nodes, current);

      if (binding !== null) {
        const name = nodeTextAt(context.nodes, binding, context.text);

        if (name !== "_") {
          state.add(name);
        }
      }
      continue;
    }
    for (
      let position = node.children.length - 1;
      position >= 0;
      position -= 1
    ) {
      const child = node.children[position];

      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
}

function interpretMatchStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  const children = context.nodes[index]?.children ?? [];
  const matchBody = children.find(
    (child) => context.nodes[child]?.type === "MatchBody",
  );
  const headerState = cloneBindingState(input);

  applyNamedExpressions(
    context,
    children.filter((child) => child !== matchBody),
    headerState,
  );
  const outcomes = [headerState];
  let exceptional: Set<string> | null = intersectBindingStates([
    input,
    headerState,
  ]);
  let breaks: Set<string> | null = null;
  let continues: Set<string> | null = null;
  let returns: Set<string> | null = null;

  for (const clause of context.nodes[matchBody ?? -1]?.children ?? []) {
    const clauseNode = context.nodes[clause];

    if (clauseNode === undefined || clauseNode.type !== "MatchClause") {
      continue;
    }
    const body = clauseNode.children.find(
      (child) => context.nodes[child]?.type === "Body",
    );

    if (body === undefined) {
      continue;
    }
    const bodyInput = cloneBindingState(headerState);

    addMatchClauseBindings(context, clause, bodyInput);
    applyNamedExpressions(
      context,
      clauseNode.children.filter((child) => child !== body),
      bodyInput,
    );
    const bodyFlow = interpretBindingBlockFlow(
      context,
      body,
      bodyInput,
      depth + 1,
    );

    if (normalBindingFlowIsReachable(bodyFlow)) {
      outcomes.push(bodyFlow.normal);
    }
    exceptional = mergeBindingCompletionStates([
      exceptional,
      bodyFlow.exceptional,
    ]);
    breaks = mergeBindingCompletionStates([breaks, bodyFlow.breaks]);
    continues = mergeBindingCompletionStates([continues, bodyFlow.continues]);
    returns = mergeBindingCompletionStates([returns, bodyFlow.returns]);
  }

  return {
    normal: intersectBindingStates(outcomes),
    exceptional,
    breaks,
    continues,
    returns,
  };
}

function interpretWithStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  const node = context.nodes[index];
  const state = cloneBindingState(input);

  if (node === undefined) {
    return { normal: state, exceptional: null };
  }
  applyNamedExpressions(
    context,
    node.children.filter((child) => context.nodes[child]?.type !== "Body"),
    state,
  );
  const bindings = new Set<number>();

  collectAsBindings(context.nodes, index, bindings);
  addBindingIndices(context, state, bindings);
  const body = node.children.find(
    (child) => context.nodes[child]?.type === "Body",
  );
  const bodyFlow =
    body === undefined
      ? { normal: state, exceptional: null }
      : interpretBindingBlockFlow(context, body, state, depth + 1);

  return {
    normal: bodyFlow.normal,
    exceptional: mergeBindingCompletionStates([
      cloneBindingState(input),
      bodyFlow.exceptional,
      normalBindingFlowIsReachable(bodyFlow) ? bodyFlow.normal : null,
      bodyFlow.breaks,
      bodyFlow.continues,
      bodyFlow.returns,
    ]),
    breaks: bodyFlow.breaks ?? null,
    continues: bodyFlow.continues ?? null,
    returns: bodyFlow.returns ?? null,
    normalReachable: normalBindingFlowIsReachable(bodyFlow),
  };
}

function interpretBindingStatementFlow(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
  depth: number,
): BindingFlowResult {
  if (depth > MAX_BINDING_FLOW_DEPTH) {
    return conservativeBindingFlow();
  }
  const node = context.nodes[index];
  const state = cloneBindingState(input);

  if (node === undefined) {
    return { normal: state, exceptional: null };
  }
  if (node.type === "IfStatement") {
    return interpretIfStatementFlow(context, index, state, depth);
  }
  if (node.type === "TryStatement") {
    return interpretTryStatementFlow(context, index, state, depth);
  }
  if (node.type === "ForStatement" || node.type === "WhileStatement") {
    return interpretLoopStatementFlow(context, index, state, depth);
  }
  if (node.type === "MatchStatement") {
    return interpretMatchStatementFlow(context, index, state, depth);
  }
  if (node.type === "WithStatement") {
    return interpretWithStatementFlow(context, index, state, depth);
  }
  if (node.type === "DecoratedStatement") {
    const definition = node.children.find((child) => {
      const type = context.nodes[child]?.type;

      return type === "FunctionDefinition" || type === "ClassDefinition";
    });

    if (definition === undefined) {
      return { normal: state, exceptional: cloneBindingState(input) };
    }
    const flow = interpretBindingStatementFlow(
      context,
      definition,
      state,
      depth,
    );

    return {
      normal: flow.normal,
      exceptional: mergeBindingCompletionStates([
        cloneBindingState(input),
        flow.exceptional,
      ]),
      breaks: flow.breaks ?? null,
      continues: flow.continues ?? null,
      returns: flow.returns ?? null,
      normalReachable: normalBindingFlowIsReachable(flow),
    };
  }
  if (node.type === "FunctionDefinition" || node.type === "ClassDefinition") {
    const name = firstDirectVariable(context.nodes, index);

    if (name !== null) {
      state.add(nodeTextAt(context.nodes, name, context.text));
    }
    return { normal: state, exceptional: cloneBindingState(input) };
  }
  if (
    node.type === "AssignStatement" &&
    node.children.some((child) => context.nodes[child]?.type === "AssignOp")
  ) {
    return interpretAssignStatementFlow(context, index, state);
  }
  if (node.type === "UpdateStatement") {
    const binding = node.children.find(
      (child) => context.nodes[child]?.type === "VariableName",
    );

    if (binding !== undefined) {
      state.add(nodeTextAt(context.nodes, binding, context.text));
    }
    return { normal: state, exceptional: cloneBindingState(input) };
  }
  if (node.type === "ImportStatement") {
    if (isTypeCheckingOnlyImport(context.nodes, index, context.text)) {
      return { normal: state, exceptional: null };
    }
    const relative = relativePythonImports(context.nodes, index, context.text);

    if (relative.candidates.length > 0) {
      recordImportState(context, node.from, state);
      return { normal: state, exceptional: cloneBindingState(input) };
    }
    const bindings = new Set<number>();

    collectImportBindings(context.nodes, index, context.text, bindings);
    addBindingIndices(context, state, bindings);
    return { normal: state, exceptional: cloneBindingState(input) };
  }
  if (node.type === "DeleteStatement") {
    return interpretDeleteStatementFlow(context, index, state);
  }
  if (node.type === "BreakStatement") {
    return {
      normal: state,
      exceptional: null,
      breaks: state,
      normalReachable: false,
    };
  }
  if (node.type === "ContinueStatement") {
    return {
      normal: state,
      exceptional: null,
      continues: state,
      normalReachable: false,
    };
  }
  if (node.type === "ReturnStatement" || node.type === "RaiseStatement") {
    applyNamedExpressions(context, [index], state);
    const returnValues = node.children.filter(
      (child) =>
        !["return", ",", "Comment"].includes(context.nodes[child]?.type ?? ""),
    );
    const returnMayThrow = returnValues.some(
      (value) => !isDefinitelyNonThrowingAssignmentValue(context, value),
    );

    return {
      normal: state,
      exceptional:
        node.type === "RaiseStatement"
          ? intersectBindingStates([input, state])
          : returnMayThrow
            ? intersectBindingStates([input, state])
            : null,
      returns: node.type === "ReturnStatement" ? state : null,
      normalReachable: false,
    };
  }

  applyNamedExpressions(context, [index], state);
  return {
    normal: state,
    exceptional: bindingStatementMayThrow(context, index)
      ? intersectBindingStates([input, state])
      : null,
  };
}

function interpretBindingStatement(
  context: BindingFlowContext,
  index: number,
  input: ReadonlySet<string>,
): BindingFlowResult {
  return interpretBindingStatementFlow(context, index, input, 0);
}

function topLevelBindingMetadata(
  nodes: readonly PythonNode[],
  text: string,
): TopLevelBindingMetadata {
  const namesBeforeImport = new Map<number, ReadonlySet<string>>();
  const context: BindingFlowContext = { nodes, text, namesBeforeImport };
  const script = nodes.findIndex((node) => node.type === "Script");
  let present = new Set<string>();

  if (script !== -1) {
    for (const child of nodes[script]?.children ?? []) {
      const flow = interpretBindingStatement(context, child, present);

      present = flow.normal;
      if (!normalBindingFlowIsReachable(flow)) {
        break;
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
