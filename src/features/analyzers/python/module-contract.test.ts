// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PYTHON_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const FACADE_MODULE = "python.ts";

function moduleSpecifiers(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const result: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      result.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return result;
}

function resolvedModuleCandidates(from: string, specifier: string): string[] {
  const resolved = posix.normalize(posix.join(posix.dirname(from), specifier));

  if (resolved.endsWith(".ts")) {
    return [resolved];
  }
  if (resolved.endsWith(".js")) {
    return [`${resolved.slice(0, -3)}.ts`];
  }

  return [`${resolved}.ts`, `${resolved}/index.ts`];
}

function readPythonModuleSources(): ReadonlyMap<string, string> {
  return new Map(
    readdirSync(PYTHON_DIRECTORY, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts"),
      )
      .map((entry): [string, string] => [
        `python/${entry.name}`,
        readFileSync(new URL(entry.name, import.meta.url), "utf8"),
      ])
      .sort(([left], [right]) => left.localeCompare(right, "en-US")),
  );
}

function buildInternalImportGraph(sources: ReadonlyMap<string, string>): {
  graph: ReadonlyMap<string, readonly string[]>;
  reverseFacadeImports: string[];
} {
  const graph = new Map<string, readonly string[]>();
  const reverseFacadeImports: string[] = [];

  for (const [fileName, source] of sources) {
    const dependencies = new Set<string>();

    for (const specifier of moduleSpecifiers(fileName, source)) {
      if (!specifier.startsWith(".")) {
        continue;
      }
      const candidates = resolvedModuleCandidates(fileName, specifier);

      if (candidates.includes(FACADE_MODULE)) {
        reverseFacadeImports.push(`${fileName} -> ${specifier}`);
      }
      const dependency = candidates.find((candidate) => sources.has(candidate));

      if (dependency !== undefined) {
        dependencies.add(dependency);
      }
    }

    graph.set(
      fileName,
      [...dependencies].sort((left, right) =>
        left.localeCompare(right, "en-US"),
      ),
    );
  }

  return { graph, reverseFacadeImports };
}

function findImportCycle(
  graph: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visited = new Set<string>();
  const active = new Set<string>();
  const path: string[] = [];

  const visit = (module: string): string[] | null => {
    if (active.has(module)) {
      const start = path.indexOf(module);

      return [...path.slice(start), module];
    }
    if (visited.has(module)) {
      return null;
    }

    visited.add(module);
    active.add(module);
    path.push(module);

    for (const dependency of graph.get(module) ?? []) {
      const cycle = visit(dependency);

      if (cycle !== null) {
        return cycle;
      }
    }

    path.pop();
    active.delete(module);
    return null;
  };

  for (const module of graph.keys()) {
    const cycle = visit(module);

    if (cycle !== null) {
      return cycle;
    }
  }

  return null;
}

function assertPythonModuleContract(
  sources: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  const { graph, reverseFacadeImports } = buildInternalImportGraph(sources);

  if (reverseFacadeImports.length > 0) {
    throw new Error(
      `Python internals reverse-import the facade: ${reverseFacadeImports.join(", ")}`,
    );
  }
  const cycle = findImportCycle(graph);

  if (cycle !== null) {
    throw new Error(`Python internal import cycle: ${cycle.join(" -> ")}`);
  }

  return graph;
}

describe("Python facade module contract", () => {
  it("keeps python.ts as a thin public facade", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../python.ts", import.meta.url)),
      "utf8",
    );

    expect(source.split("\n").length).toBeLessThanOrEqual(180);
    expect(source).not.toMatch(/interpret(?:If|Try|Loop|Match|With|Binding)/u);
  });

  it("keeps the facade runtime export surface singular", async () => {
    const module = await import("../python");

    expect(Object.keys(module).sort()).toEqual(["analyzePython"]);
  });

  it("keeps internal imports directed away from the facade and acyclic", () => {
    const graph = assertPythonModuleContract(readPythonModuleSources());

    expect(Object.fromEntries(graph)).toEqual({
      "python/analyze-file.ts": [
        "python/binding-flow.ts",
        "python/bindings.ts",
        "python/evidence.ts",
        "python/function-metrics.ts",
        "python/model.ts",
        "python/syntax.ts",
      ],
      "python/binding-flow.ts": [
        "python/bindings.ts",
        "python/evidence.ts",
        "python/function-metrics.ts",
        "python/model.ts",
        "python/syntax.ts",
      ],
      "python/bindings.ts": ["python/model.ts", "python/syntax.ts"],
      "python/evidence.ts": [
        "python/bindings.ts",
        "python/model.ts",
        "python/syntax.ts",
      ],
      "python/function-metrics.ts": ["python/model.ts", "python/syntax.ts"],
      "python/model.ts": [],
      "python/syntax.ts": ["python/model.ts"],
    });
  });

  it("proves the contract rejects reverse facade imports and internal cycles", () => {
    expect(() =>
      assertPythonModuleContract(
        new Map([
          ["python/a.ts", 'import { analyzePython } from "../python";'],
        ]),
      ),
    ).toThrow("Python internals reverse-import the facade");

    expect(() =>
      assertPythonModuleContract(
        new Map([
          ["python/a.ts", 'import { analyzePython } from "../python.ts";'],
        ]),
      ),
    ).toThrow("Python internals reverse-import the facade");

    expect(() =>
      assertPythonModuleContract(
        new Map([
          ["python/a.ts", 'import "./b";'],
          ["python/b.ts", 'export * from "./a";'],
        ]),
      ),
    ).toThrow(
      "Python internal import cycle: python/a.ts -> python/b.ts -> python/a.ts",
    );
  });
});
