import { describe, expect, it } from "vitest";

import { topLevelBindingMetadata } from "./binding-flow";
import { parsePython } from "./syntax";

function metadata(text: string) {
  const source = `${text}\n`;

  return topLevelBindingMetadata(parsePython(source) ?? [], source);
}

describe("Python top-level binding flow boundary", () => {
  it("propagates return through finally and lets an abrupt finally override it", () => {
    const result = metadata(
      [
        "b = None",
        "for x in rows:",
        "    try:",
        "        return None",
        "    finally:",
        "        break",
        "else:",
        "    b = None",
        "from . import b",
      ].join("\n"),
    );

    // Baseline parity: the existing interpreter retains the initial binding.
    expect(result.finalNames).toEqual(["b"]);
  });

  it("intersects exceptional prefixes before a relative package import", () => {
    const text = [
      "stable = None",
      "try:",
      "    before = None",
      "    risky = call()",
      "    after = None",
      "except Exception:",
      "    from . import stable, before, risky, after",
    ].join("\n");
    const result = metadata(text);
    const importOffset = text.indexOf("from . import");

    expect(
      [...(result.namesBeforeImport.get(importOffset) ?? [])].sort(),
    ).toEqual(["before", "stable"]);
  });

  it("keeps loop exhaustion separate from reachable break completions", () => {
    const result = metadata(
      [
        "stable = None",
        "for item in rows:",
        "    chosen = None",
        "    if item:",
        "        break",
        "else:",
        "    exhausted = None",
        "from . import stable, chosen, exhausted",
      ].join("\n"),
    );

    expect(result.finalNames).toEqual(["stable"]);
  });
});
