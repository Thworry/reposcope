// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
});
