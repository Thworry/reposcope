// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createPythonLineLookup, nodeTextAt, parsePython } from "./syntax";

describe("Python internal syntax boundary", () => {
  it("flattens valid syntax and preserves Python line lookup semantics", () => {
    const text = "value = 1\r\nsecond = value\rthird = second\n";
    const nodes = parsePython(text);

    expect(nodes).not.toBeNull();
    expect(nodes?.[0]).toMatchObject({
      type: "Script",
      from: 0,
      to: text.length,
      parent: null,
      error: false,
    });

    const firstVariable = nodes?.findIndex(
      (node) => node.type === "VariableName",
    );

    expect(nodeTextAt(nodes ?? [], firstVariable ?? -1, text)).toBe("value");

    const lineAt = createPythonLineLookup(text);

    expect(lineAt(0)).toBe(1);
    expect(lineAt(text.indexOf("second"))).toBe(2);
    expect(lineAt(text.indexOf("third"))).toBe(3);
    expect(lineAt(text.length)).toBe(4);
    expect(() => lineAt(-1)).toThrow("Invalid text offset");
  });

  it("fails closed when Lezer reports recovered syntax", () => {
    expect(parsePython("def broken(value:\n    return value")).toBeNull();
  });

  it("keeps the facade runtime export surface singular", async () => {
    const module = await import("../python");

    expect(Object.keys(module).sort()).toEqual(["analyzePython"]);

    const source = readFileSync(
      fileURLToPath(new URL("../python.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain("@lezer/python");
  });
});
