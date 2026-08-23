import { describe, expect, it } from "vitest";

import { sanitizeDocumentForModel } from "./safe-document.js";

describe("sanitizeDocumentForModel", () => {
  it("applies the same hostile-content boundary to documentation", () => {
    const text =
      "# Security\r\nAPI_KEY=sk_live_abcdefghijklmnop\r\nSee <https://evil.test>.";
    const result = sanitizeDocumentForModel({
      path: "SECURITY.md",
      text,
      bytes: new TextEncoder().encode(text).byteLength,
      kind: "documentation",
    });

    expect(result.blocks).not.toHaveLength(0);
    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "documentation",
          trust: "repository-authored",
        }),
      ]),
    );
    expect(result.blocks.map((block) => block.text).join("\n")).toContain(
      "[credential-like line omitted]",
    );
    expect(JSON.stringify(result)).not.toContain("evil.test");
  });
});
