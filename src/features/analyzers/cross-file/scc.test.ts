import { describe, expect, it } from "vitest";

import { stronglyConnectedComponents } from "./scc";

describe("cross-file strongly connected components", () => {
  it("sorts deterministic components by size then path", () => {
    const graph = new Map([
      ["b.ts", ["a.ts"]],
      ["a.ts", ["b.ts"]],
      ["z.ts", []],
    ]);

    expect(stronglyConnectedComponents(graph)).toEqual([
      ["a.ts", "b.ts"],
      ["z.ts"],
    ]);
  });

  it("traverses the full supported 200-file graph depth", () => {
    const nodes = Array.from(
      { length: 200 },
      (_, index) => `src/node-${String(index).padStart(3, "0")}.ts`,
    );
    const graph = new Map(
      nodes.map((node, index) => [
        node,
        [nodes[(index + 1) % nodes.length] ?? node],
      ]),
    );

    expect(stronglyConnectedComponents(graph)).toEqual([nodes]);
  });
});
