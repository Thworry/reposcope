import { describe, expect, it } from "vitest";

import {
  collectRelativeImports,
  hasDocstring,
  normalizedTokens,
  publicApiKind,
} from "./evidence";
import { nodeTextAt, parsePython } from "./syntax";

function definitionIndex(
  nodes: NonNullable<ReturnType<typeof parsePython>>,
  text: string,
  name: string,
): number {
  return nodes.findIndex(
    (node, index) =>
      (node.type === "FunctionDefinition" || node.type === "ClassDefinition") &&
      node.children.some(
        (child) =>
          nodes[child]?.type === "VariableName" &&
          nodeTextAt(nodes, child, text) === name,
      ) &&
      index >= 0,
  );
}

describe("Python internal evidence boundary", () => {
  it("classifies only top-level declarations and direct methods", () => {
    const text = `@decorate
def public_function():
    pass

class PublicClass:
    def method(self):
        def nested():
            pass
        return nested
`;
    const nodes = parsePython(text) ?? [];

    expect(
      publicApiKind(nodes, definitionIndex(nodes, text, "public_function")),
    ).toBe("function");
    expect(
      publicApiKind(nodes, definitionIndex(nodes, text, "PublicClass")),
    ).toBe("class");
    expect(publicApiKind(nodes, definitionIndex(nodes, text, "method"))).toBe(
      "method",
    );
    expect(
      publicApiKind(nodes, definitionIndex(nodes, text, "nested")),
    ).toBeNull();
  });

  it("accepts ordinary docstring forms and rejects bytes or f-strings", () => {
    const text = `def parenthesized():
    (r"raw docs")

def continued():
    u"first " "second"

def bytes_doc():
    b"not docs"

def formatted_doc():
    f"not docs {value}"
`;
    const nodes = parsePython(text) ?? [];

    expect(
      hasDocstring(nodes, definitionIndex(nodes, text, "parenthesized"), text),
    ).toBe(true);
    expect(
      hasDocstring(nodes, definitionIndex(nodes, text, "continued"), text),
    ).toBe(true);
    expect(
      hasDocstring(nodes, definitionIndex(nodes, text, "bytes_doc"), text),
    ).toBe(false);
    expect(
      hasDocstring(nodes, definitionIndex(nodes, text, "formatted_doc"), text),
    ).toBe(false);
  });

  it("sorts runtime relative imports and excludes canonical TYPE_CHECKING branches", () => {
    const text = `from .runtime import runtime
if TYPE_CHECKING:
    from .types import TypeOnly
if (typing.TYPE_CHECKING):
    from .more_types import MoreType
from . import local, present
from ..shared import Shared
`;
    const nodes = parsePython(text) ?? [];
    const localImport = nodes.find(
      (node) =>
        node.type === "ImportStatement" &&
        nodeTextAt(nodes, nodes.indexOf(node), text).includes("local"),
    );
    const namesBeforeImport = new Map<number, ReadonlySet<string>>([
      [localImport?.from ?? -1, new Set(["present"])],
    ]);

    expect(collectRelativeImports(nodes, text, namesBeforeImport)).toEqual({
      definite: [".", "..shared", ".runtime"],
      candidates: [".local"],
    });
  });

  it("normalizes nested f-string replacements exactly once", () => {
    const text = `value = f"{f'{x + 1}'}"\n`;

    expect(normalizedTokens(parsePython(text) ?? [], text)).toEqual([
      "value",
      "=",
      "TEMPLATE",
      "TEMPLATE",
      "x",
      "+",
      "NUMBER",
    ]);
  });

  it("normalizes ordinary literals and removes comments without changing token order", () => {
    const text = `value = "secret"\ncount = 42  # hidden\n`;

    expect(normalizedTokens(parsePython(text) ?? [], text)).toEqual([
      "value",
      "=",
      "STRING",
      "count",
      "=",
      "NUMBER",
    ]);
  });
});
