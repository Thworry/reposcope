import { parse, tokTypes, type ParserPlugin } from "@babel/parser";
import * as t from "@babel/types";

import type {
  AnalyzedSourceFile,
  FetchedTextFile,
  FunctionMetric,
  LanguageAnalysis,
} from "../analysis/model";
import { logicalLineNumbers } from "./line-metrics";

type JavaScriptTypeScriptLanguage = "javascript" | "typescript";
type FunctionNode =
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression
  | t.ObjectMethod
  | t.ClassMethod
  | t.ClassPrivateMethod;

interface WalkEntry {
  node: t.Node;
  parent: t.Node | null;
}

interface MetricEntry {
  node: t.Node;
  depth: number;
}

interface ParseSuccess {
  ast: ReturnType<typeof parse>;
  language: JavaScriptTypeScriptLanguage;
}

type LineLookup = (offset: number) => number;

const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const JSX_EXTENSIONS = new Set([".jsx", ".tsx"]);
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
const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function extensionOf(path: string): string {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const index = basename.lastIndexOf(".");

  return index === -1 ? "" : basename.slice(index).toLocaleLowerCase("en-US");
}

function languageForPath(path: string): JavaScriptTypeScriptLanguage | null {
  const extension = extensionOf(path);

  if (TYPESCRIPT_EXTENSIONS.has(extension)) {
    return "typescript";
  }
  if (JAVASCRIPT_EXTENSIONS.has(extension)) {
    return "javascript";
  }

  return null;
}

function parserPluginsFor(path: string): ParserPlugin[] {
  const extension = extensionOf(path);
  const plugins: ParserPlugin[] = ["decorators"];

  if (TYPESCRIPT_EXTENSIONS.has(extension)) {
    plugins.push("typescript");
  }
  if (JSX_EXTENSIONS.has(extension)) {
    plugins.push("jsx");
  }

  return plugins;
}

function parseFile(file: FetchedTextFile): ParseSuccess | null {
  const language = languageForPath(file.path);

  if (language === null) {
    return null;
  }

  try {
    const ast = parse(file.text, {
      sourceType: "unambiguous",
      errorRecovery: true,
      ranges: true,
      tokens: true,
      plugins: parserPluginsFor(file.path),
    });

    return ast.errors.length === 0 ? { ast, language } : null;
  } catch {
    return null;
  }
}

function nodeChildren(node: t.Node): t.Node[] {
  const keys = t.VISITOR_KEYS[node.type] ?? [];
  const record = node as unknown as Record<string, unknown>;
  const children: t.Node[] = [];

  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      for (const child of value) {
        if (t.isNode(child)) {
          children.push(child);
        }
      }
    } else if (t.isNode(value)) {
      children.push(value);
    }
  }

  return children;
}

function walk(
  root: t.Node,
  enter: (node: t.Node, parent: t.Node | null) => void,
): void {
  const pending: WalkEntry[] = [{ node: root, parent: null }];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    enter(current.node, current.parent);

    const children = nodeChildren(current.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];

      if (child !== undefined) {
        pending.push({ node: child, parent: current.node });
      }
    }
  }
}

function isFunctionNode(node: t.Node): node is FunctionNode {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isObjectMethod(node) ||
    t.isClassMethod(node) ||
    t.isClassPrivateMethod(node)
  );
}

function identifierName(node: t.Node | null | undefined): string | null {
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isPrivateName(node)) {
    return node.id.name;
  }
  if (t.isStringLiteral(node) || t.isNumericLiteral(node)) {
    return String(node.value);
  }

  return null;
}

function propertyFunctionName(node: FunctionNode): string | null {
  if (
    t.isObjectMethod(node) ||
    t.isClassMethod(node) ||
    t.isClassPrivateMethod(node)
  ) {
    const name = identifierName(node.key);

    if (name === null) {
      return null;
    }
    if (node.kind === "get" || node.kind === "set") {
      return `${node.kind} ${name}`;
    }

    return name;
  }

  return null;
}

function assignedFunctionName(parent: t.Node | null): string | null {
  if (t.isVariableDeclarator(parent)) {
    return identifierName(parent.id);
  }
  if (t.isObjectProperty(parent) || t.isClassProperty(parent)) {
    return parent.computed ? null : identifierName(parent.key);
  }
  if (t.isAssignmentExpression(parent)) {
    return identifierName(parent.left);
  }

  return null;
}

function functionName(node: FunctionNode, parent: t.Node | null): string {
  if (
    (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) &&
    node.id != null
  ) {
    return node.id.name;
  }

  return (
    propertyFunctionName(node) ?? assignedFunctionName(parent) ?? "<anonymous>"
  );
}

function validNodeOffsets(
  node: t.Node,
): node is t.Node & { start: number; end: number } {
  return (
    typeof node.start === "number" &&
    typeof node.end === "number" &&
    node.start >= 0 &&
    node.end >= node.start
  );
}

function lineLookup(text: string): LineLookup {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }
      lineStarts.push(index + 1);
    } else if (
      text[index] === "\n" ||
      text[index] === "\u2028" ||
      text[index] === "\u2029"
    ) {
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

function isLoopNode(node: t.Node): boolean {
  return (
    t.isForStatement(node) ||
    t.isForInStatement(node) ||
    t.isForOfStatement(node) ||
    t.isWhileStatement(node) ||
    t.isDoWhileStatement(node)
  );
}

function branchIncrement(node: t.Node): number {
  if (
    t.isIfStatement(node) ||
    isLoopNode(node) ||
    t.isCatchClause(node) ||
    t.isConditionalExpression(node)
  ) {
    return 1;
  }
  if (t.isSwitchCase(node)) {
    return node.test === null ? 0 : 1;
  }
  if (
    t.isLogicalExpression(node) &&
    ["&&", "||", "??"].includes(node.operator)
  ) {
    return 1;
  }

  return 0;
}

function incrementsNesting(node: t.Node): boolean {
  return (
    t.isIfStatement(node) ||
    isLoopNode(node) ||
    t.isCatchClause(node) ||
    t.isSwitchStatement(node) ||
    t.isConditionalExpression(node)
  );
}

function functionMetric(
  node: FunctionNode,
  parent: t.Node | null,
  file: FetchedTextFile,
  logicalLines: readonly number[],
  lineAt: LineLookup,
): FunctionMetric | null {
  if (!validNodeOffsets(node)) {
    return null;
  }

  const startLine = lineAt(node.start);
  const endOffset = node.end > node.start ? node.end - 1 : node.end;
  const endLine = lineAt(endOffset);
  let cyclomatic = 1;
  let maxNesting = 0;
  let hasErrorHandling = false;
  const pending: MetricEntry[] = nodeChildren(node).map((child) => ({
    node: child,
    depth: 0,
  }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }
    if (isFunctionNode(current.node)) {
      maxNesting = Math.max(maxNesting, current.depth + 1);
      continue;
    }

    cyclomatic += branchIncrement(current.node);
    if (
      t.isTryStatement(current.node) ||
      t.isCatchClause(current.node) ||
      t.isThrowStatement(current.node)
    ) {
      hasErrorHandling = true;
    }

    const depth = incrementsNesting(current.node)
      ? current.depth + 1
      : current.depth;
    maxNesting = Math.max(maxNesting, depth);

    for (const child of nodeChildren(current.node)) {
      pending.push({ node: child, depth });
    }
  }

  return {
    path: file.path,
    name: functionName(node, parent),
    startLine,
    endLine,
    logicalLines: logicalLinesInRange(logicalLines, startLine, endLine),
    cyclomatic,
    maxNesting,
    hasErrorHandling,
    isTest: file.isTest,
  };
}

function bindingIdentifiers(node: t.Node | null | undefined): t.Identifier[] {
  if (node === null || node === undefined) {
    return [];
  }
  if (t.isIdentifier(node)) {
    return [node];
  }
  if (t.isRestElement(node)) {
    return bindingIdentifiers(node.argument);
  }
  if (t.isAssignmentPattern(node)) {
    return bindingIdentifiers(node.left);
  }
  if (t.isArrayPattern(node)) {
    return node.elements.flatMap((element) =>
      element === null ? [] : bindingIdentifiers(element),
    );
  }
  if (t.isObjectPattern(node)) {
    return node.properties.flatMap((property) =>
      t.isRestElement(property)
        ? bindingIdentifiers(property.argument)
        : bindingIdentifiers(property.value),
    );
  }
  if (t.isTSParameterProperty(node)) {
    return bindingIdentifiers(node.parameter);
  }

  return [];
}

function declaredIdentifiers(node: t.Node): t.Identifier[] {
  if (t.isVariableDeclarator(node)) {
    return bindingIdentifiers(node.id);
  }
  if (isFunctionNode(node)) {
    const result = node.params.flatMap((parameter) =>
      bindingIdentifiers(parameter),
    );

    if (
      (t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) &&
      node.id != null
    ) {
      result.unshift(node.id);
    }
    if (
      (t.isObjectMethod(node) ||
        t.isClassMethod(node) ||
        t.isClassPrivateMethod(node)) &&
      !node.computed
    ) {
      const name = t.isPrivateName(node.key) ? node.key.id : node.key;

      if (t.isIdentifier(name)) {
        result.unshift(name);
      }
    }

    return result;
  }
  if ((t.isClassDeclaration(node) || t.isClassExpression(node)) && node.id) {
    return [node.id];
  }
  if (
    t.isImportSpecifier(node) ||
    t.isImportDefaultSpecifier(node) ||
    t.isImportNamespaceSpecifier(node)
  ) {
    return [node.local];
  }
  if (t.isTSImportEqualsDeclaration(node)) {
    return [node.id];
  }
  if (t.isCatchClause(node)) {
    return bindingIdentifiers(node.param);
  }

  return [];
}

function isAmbiguousIdentifier(name: string): boolean {
  const codePoints = Array.from(name).length;

  return (
    codePoints <= 2 &&
    !RESERVED_WORDS.has(name) &&
    !AMBIGUOUS_IDENTIFIER_ALLOWLIST.has(name)
  );
}

function isRelativeSpecifier(value: string): boolean {
  return value.startsWith(".");
}

function isTypeOnlyImportKind(value: unknown): boolean {
  return value === "type" || value === "typeof";
}

function importHasRuntimeValue(node: t.ImportDeclaration): boolean {
  if (node.importKind === "type" || node.importKind === "typeof") {
    return false;
  }
  if (node.specifiers.length === 0) {
    return true;
  }

  return node.specifiers.some(
    (specifier) =>
      !t.isImportSpecifier(specifier) ||
      (specifier.importKind !== "type" && specifier.importKind !== "typeof"),
  );
}

function exportHasRuntimeValue(node: t.ExportNamedDeclaration): boolean {
  if (node.exportKind === "type") {
    return false;
  }
  if (node.declaration !== null) {
    return true;
  }
  if (node.specifiers.length === 0) {
    return true;
  }

  return node.specifiers.some(
    (specifier) =>
      !t.isExportSpecifier(specifier) || specifier.exportKind !== "type",
  );
}

function relativeSpecifier(node: t.Node): string | null {
  if (
    t.isImportDeclaration(node) &&
    importHasRuntimeValue(node) &&
    isRelativeSpecifier(node.source.value)
  ) {
    return node.source.value;
  }
  if (
    t.isExportNamedDeclaration(node) &&
    node.source != null &&
    exportHasRuntimeValue(node) &&
    isRelativeSpecifier(node.source.value)
  ) {
    return node.source.value;
  }
  if (
    t.isExportAllDeclaration(node) &&
    node.exportKind !== "type" &&
    isRelativeSpecifier(node.source.value)
  ) {
    return node.source.value;
  }
  if (
    t.isTSImportEqualsDeclaration(node) &&
    !isTypeOnlyImportKind(node.importKind) &&
    t.isTSExternalModuleReference(node.moduleReference) &&
    t.isStringLiteral(node.moduleReference.expression) &&
    isRelativeSpecifier(node.moduleReference.expression.value)
  ) {
    return node.moduleReference.expression.value;
  }
  if (
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee, { name: "require" }) &&
    node.arguments.length === 1 &&
    t.isStringLiteral(node.arguments[0]) &&
    isRelativeSpecifier(node.arguments[0].value)
  ) {
    return node.arguments[0].value;
  }

  return null;
}

interface ExportedDeclaration {
  anchor: t.Node;
  declaration: t.Declaration;
}

function exportedDeclaration(node: t.Node): ExportedDeclaration | null {
  if (
    t.isExportNamedDeclaration(node) &&
    node.declaration != null &&
    t.isDeclaration(node.declaration)
  ) {
    return { anchor: node, declaration: node.declaration };
  }
  if (t.isExportDefaultDeclaration(node) && t.isDeclaration(node.declaration)) {
    return { anchor: node, declaration: node.declaration };
  }

  return null;
}

function hasAdjacentJsdoc(
  ast: ReturnType<typeof parse>,
  declaration: t.Declaration,
  anchor: t.Node,
  text: string,
  lineAt: LineLookup,
): boolean {
  if (!validNodeOffsets(declaration) || !validNodeOffsets(anchor)) {
    return false;
  }

  const declarationLine = lineAt(anchor.start);
  const comments = ast.comments ?? [];

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (
      comment === undefined ||
      comment.type !== "CommentBlock" ||
      !comment.value.startsWith("*") ||
      typeof comment.start !== "number" ||
      typeof comment.end !== "number" ||
      comment.end > anchor.start
    ) {
      continue;
    }
    if (lineAt(comment.end) >= declarationLine) {
      return false;
    }

    return text.slice(comment.end, anchor.start).trim().length === 0;
  }

  return false;
}

interface PositionedToken {
  type: unknown;
  start: number;
  end: number;
}

function isPositionedToken(value: unknown): value is PositionedToken {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const token = value as Record<string, unknown>;

  return (
    typeof token.start === "number" &&
    typeof token.end === "number" &&
    token.start >= 0 &&
    token.end >= token.start
  );
}

function normalizedTokens(
  ast: ReturnType<typeof parse>,
  text: string,
): string[] {
  const result: string[] = [];
  const tokens: readonly unknown[] = ast.tokens ?? [];
  const numberTypes = new Set<unknown>([
    tokTypes.num,
    tokTypes.bigint,
    tokTypes.decimal,
  ]);
  const templateTypes = new Set<unknown>([
    tokTypes.template,
    tokTypes.templateTail,
    tokTypes.templateNonTail,
    tokTypes.backQuote,
  ]);

  for (const token of tokens) {
    if (!isPositionedToken(token) || typeof token.type === "string") {
      continue;
    }
    if (token.type === tokTypes.eof || token.start === token.end) {
      continue;
    }
    if (token.type === tokTypes.string) {
      result.push("STRING");
    } else if (templateTypes.has(token.type)) {
      result.push("TEMPLATE");
    } else if (numberTypes.has(token.type)) {
      result.push("NUMBER");
    } else {
      result.push(text.slice(token.start, token.end));
    }
  }

  return result;
}

function declarationFile(path: string): boolean {
  return path.toLocaleLowerCase("en-US").endsWith(".d.ts");
}

function collectRelativeImports(ast: ReturnType<typeof parse>): string[] {
  const imports = new Set<string>();

  walk(ast.program, (node) => {
    const specifier = relativeSpecifier(node);

    if (specifier !== null) {
      imports.add(specifier);
    }
  });

  return [...imports].sort();
}

function analyzeParsedFile(
  file: FetchedTextFile,
  parsed: ParseSuccess,
  output: LanguageAnalysis,
): void {
  if (declarationFile(file.path)) {
    output.files.push({
      path: file.path,
      language: parsed.language,
      logicalLines: 0,
      isTest: file.isTest,
      normalizedTokens: [],
      relativeImports: collectRelativeImports(parsed.ast),
    });
    return;
  }

  const logicalLines = logicalLineNumbers(file.text, parsed.language);
  const lineAt = lineLookup(file.text);
  const imports = new Set<string>();
  const analyzedFile: AnalyzedSourceFile = {
    path: file.path,
    language: parsed.language,
    logicalLines: logicalLines.length,
    isTest: file.isTest,
    normalizedTokens: normalizedTokens(parsed.ast, file.text),
    relativeImports: [],
  };

  walk(parsed.ast.program, (node, parent) => {
    if (isFunctionNode(node)) {
      const metric = functionMetric(node, parent, file, logicalLines, lineAt);

      if (metric !== null) {
        output.functions.push(metric);
      }
    }

    for (const identifier of declaredIdentifiers(node)) {
      output.identifierOccurrences += 1;
      if (isAmbiguousIdentifier(identifier.name)) {
        output.ambiguousIdentifierOccurrences += 1;
      }
    }

    const specifier = relativeSpecifier(node);
    if (specifier !== null) {
      imports.add(specifier);
    }

    const exported = exportedDeclaration(node);
    if (exported !== null) {
      output.exportedDeclarations += 1;
      if (
        hasAdjacentJsdoc(
          parsed.ast,
          exported.declaration,
          exported.anchor,
          file.text,
          lineAt,
        )
      ) {
        output.documentedExports += 1;
      }
    }
  });

  analyzedFile.relativeImports = [...imports].sort();
  output.files.push(analyzedFile);
}

function comparePaths(left: { path: string }, right: { path: string }): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

/**
 * Parses selected JavaScript and TypeScript text without executing or importing
 * project code. Files and function metrics are returned in deterministic path
 * and location order; `.d.ts` files contribute import resolution only, and
 * per-file syntax failures are isolated in `parseFailures`.
 */
export function analyzeJavaScriptTypeScript(
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
    .filter((file) => languageForPath(file.path) !== null)
    .sort(comparePaths);

  for (const file of orderedFiles) {
    const language = languageForPath(file.path);
    const parsed = parseFile(file);

    if (language === null) {
      continue;
    }
    if (parsed === null) {
      output.parseFailures.push({
        path: file.path,
        language,
        reason: "syntax",
      });
      continue;
    }

    if (!declarationFile(file.path)) {
      output.parsedBytes += file.bytes;
    }
    analyzeParsedFile(file, parsed, output);
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
