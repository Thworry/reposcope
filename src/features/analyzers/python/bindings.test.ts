import { describe, expect, it } from "vitest";

import { bindingIdentifiers, isAmbiguousIdentifier } from "./bindings";
import { nodeTextAt, parsePython } from "./syntax";

function bindingNames(text: string): string[] {
  const nodes = parsePython(text) ?? [];

  return [...bindingIdentifiers(nodes, text)].map((index) =>
    nodeTextAt(nodes, index, text),
  );
}

describe("Python internal binding boundary", () => {
  it("keeps lambda/comprehension ownership and insertion order", () => {
    const text =
      "ab = 1\ndef choose(long_name=value_ref):\n    return [(xy := item) for cd in rows]\n";

    expect(bindingNames(text)).toEqual(["choose", "long_name", "cd", "xy"]);
  });

  it("respects global/nonlocal owners while excluding module and class properties", () => {
    const text = `module_property = 0
import package.submodule
from package import Thing as imported_thing

class Container:
    class_property = 1

    def method(self, parameter=default):
        global module_property
        local_value = 1
        values = [(walrus_name := item) for short in rows]
        return local_value, values

def outer(argument):
    captured = 1

    def inner(inner_parameter):
        nonlocal captured
        captured = 2
        own_value = 3
        return own_value

    return inner
`;
    const names = bindingNames(text);

    expect([...names].sort()).toEqual(
      [
        "Container",
        "argument",
        "captured",
        "imported_thing",
        "inner",
        "inner_parameter",
        "local_value",
        "method",
        "outer",
        "own_value",
        "package",
        "parameter",
        "self",
        "short",
        "values",
        "walrus_name",
      ].sort(),
    );
    expect(names).not.toContain("module_property");
    expect(names).not.toContain("class_property");
    expect(names.filter((name) => name === "captured")).toEqual(["captured"]);
  });

  it("keeps the exact case-sensitive ambiguous-name allowlist", () => {
    expect(isAmbiguousIdentifier("xy")).toBe(true);
    expect(isAmbiguousIdentifier("i")).toBe(false);
    expect(isAmbiguousIdentifier("ID")).toBe(true);
    expect(isAmbiguousIdentifier("long_name")).toBe(false);
  });
});
