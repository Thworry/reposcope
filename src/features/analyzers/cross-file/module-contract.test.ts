// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const INTERNAL_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const FACADE_PATH = fileURLToPath(new URL("../cross-file.ts", import.meta.url));
const FACADE_MODULE = "cross-file.ts";

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

function readInternalModuleSources(): ReadonlyMap<string, string> {
  return new Map(
    readdirSync(INTERNAL_DIRECTORY, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".ts") &&
          !entry.name.endsWith(".test.ts"),
      )
      .map((entry): [string, string] => [
        `cross-file/${entry.name}`,
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

function assertCrossFileModuleContract(
  sources: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> {
  const { graph, reverseFacadeImports } = buildInternalImportGraph(sources);

  if (reverseFacadeImports.length > 0) {
    throw new Error(
      `Cross-file internals reverse-import the facade: ${reverseFacadeImports.join(", ")}`,
    );
  }
  const cycle = findImportCycle(graph);

  if (cycle !== null) {
    throw new Error(`Cross-file internal import cycle: ${cycle.join(" -> ")}`);
  }

  return graph;
}

describe("cross-file module contract", () => {
  it("reads every supported module syntax without scanning ordinary text", () => {
    const source = `
      import "./side-effect";
      export { value } from "./re-export.js";
      import legacy = require("./legacy.ts");
      void import("./dynamic");
      const ignored = "./ordinary-string";
      // import "./commented-out";
    `;

    expect(moduleSpecifiers("cross-file/synthetic.ts", source)).toEqual([
      "./side-effect",
      "./re-export.js",
      "./legacy.ts",
      "./dynamic",
    ]);
  });

  it.each(["../cross-file", "../cross-file.ts", "../cross-file.js"])(
    "rejects a synthetic reverse facade import through %s",
    (specifier) => {
      expect(() =>
        assertCrossFileModuleContract(
          new Map([
            ["cross-file/synthetic.ts", `void import("${specifier}");\n`],
          ]),
        ),
      ).toThrow(
        `Cross-file internals reverse-import the facade: cross-file/synthetic.ts -> ${specifier}`,
      );
    },
  );

  it("rejects a synthetic internal import cycle", () => {
    expect(() =>
      assertCrossFileModuleContract(
        new Map([
          ["cross-file/a.ts", 'import "./b.js";\n'],
          ["cross-file/b.ts", 'export * from "./a.ts";\n'],
        ]),
      ),
    ).toThrow(
      "Cross-file internal import cycle: cross-file/a.ts -> cross-file/b.ts -> cross-file/a.ts",
    );
  });

  it("resolves extensionless internal index modules", () => {
    const { graph } = buildInternalImportGraph(
      new Map([
        ["cross-file/entry.ts", 'import "./nested";\n'],
        ["cross-file/nested/index.ts", "export {};\n"],
      ]),
    );

    expect(Object.fromEntries(graph)).toEqual({
      "cross-file/entry.ts": ["cross-file/nested/index.ts"],
      "cross-file/nested/index.ts": [],
    });
  });

  it("keeps the facade thin and its export surface stable", async () => {
    const source = readFileSync(FACADE_PATH, "utf8");
    const surface = [
      ...source.matchAll(/export\s+(?:interface|function)\s+(\w+)/gu),
    ]
      .map((match) => match[1] ?? "")
      .sort();

    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(140);
    expect(surface).toEqual([
      "DuplicateRatioInstrumentation",
      "computeDuplicateRatio",
      "findCircularImports",
    ]);
    expect(Object.keys(await import("../cross-file")).sort()).toEqual([
      "computeDuplicateRatio",
      "findCircularImports",
    ]);
  });

  it("keeps all current internals acyclic and directed away from the facade", () => {
    const graph = assertCrossFileModuleContract(readInternalModuleSources());

    expect(Object.fromEntries(graph)).toEqual({
      "cross-file/duplicate-candidates.ts": [
        "cross-file/duplicate-index.ts",
        "cross-file/model.ts",
        "cross-file/path-order.ts",
      ],
      "cross-file/duplicate-index.ts": ["cross-file/model.ts"],
      "cross-file/duplicate-selection.ts": [
        "cross-file/duplicate-candidates.ts",
        "cross-file/duplicate-index.ts",
        "cross-file/model.ts",
        "cross-file/path-order.ts",
      ],
      "cross-file/import-resolution.ts": [
        "cross-file/model.ts",
        "cross-file/path-order.ts",
      ],
      "cross-file/model.ts": [],
      "cross-file/path-order.ts": [],
      "cross-file/scc.ts": ["cross-file/path-order.ts"],
    });
  });
});
