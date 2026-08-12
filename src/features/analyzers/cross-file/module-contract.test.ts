// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const INTERNAL_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const FACADE_PATH = fileURLToPath(new URL("../cross-file.ts", import.meta.url));

function internalDependencies(fileName: string): string[] {
  const source = readFileSync(`${INTERNAL_DIRECTORY}/${fileName}`, "utf8");

  return [...source.matchAll(/from\s+["']\.\/([^"']+)["']/gu)]
    .map((match) => match[1] ?? "")
    .filter((dependency) => dependency.length > 0)
    .map((dependency) => `${dependency}.ts`);
}

describe("cross-file module contract", () => {
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

  it("keeps internal dependencies acyclic and directed away from the facade", () => {
    const files = readdirSync(INTERNAL_DIRECTORY).filter(
      (fileName) => fileName.endsWith(".ts") && !fileName.endsWith(".test.ts"),
    );
    const graph = new Map(
      files.map((fileName) => [fileName, internalDependencies(fileName)]),
    );
    const visited = new Set<string>();
    const active = new Set<string>();

    const visit = (fileName: string): boolean => {
      if (active.has(fileName)) {
        return false;
      }
      if (visited.has(fileName)) {
        return true;
      }
      visited.add(fileName);
      active.add(fileName);
      for (const dependency of graph.get(fileName) ?? []) {
        if (graph.has(dependency) && !visit(dependency)) {
          return false;
        }
      }
      active.delete(fileName);
      return true;
    };

    for (const fileName of files) {
      const source = readFileSync(`${INTERNAL_DIRECTORY}/${fileName}`, "utf8");

      expect(source).not.toMatch(/from\s+["']\.\.\/cross-file["']/u);
      expect(visit(fileName)).toBe(true);
    }
  });
});
