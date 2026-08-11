import { describe, expect, it } from "vitest";

import { chineseReadme, englishReadme } from "../../test/fixtures/text-files";
import {
  countLogicalLines,
  findMarkdownEvidence,
  lineAtOffset,
} from "./line-metrics";

describe("Markdown evidence", () => {
  it("normalizes English headings and recognizes commands and examples", () => {
    expect(findMarkdownEvidence(englishReadme)).toMatchObject({
      installHeading: true,
      installCommand: true,
      usageHeading: true,
      usageCommandOrExample: true,
      architectureHeading: true,
      configurationHeading: true,
    });
  });

  it("recognizes the exact Chinese heading dictionary and prompt stripping", () => {
    expect(findMarkdownEvidence(chineseReadme)).toMatchObject({
      installHeading: true,
      installCommand: true,
      usageHeading: true,
      usageCommandOrExample: true,
      architectureHeading: true,
      configurationHeading: true,
    });
  });

  it("keeps prose-only headings as partial evidence", () => {
    expect(findMarkdownEvidence("## 安装\n这里介绍安装概念。")).toMatchObject({
      installHeading: true,
      installCommand: false,
    });
    expect(
      findMarkdownEvidence("## Usage\nThis section describes use."),
    ).toMatchObject({ usageHeading: true, usageCommandOrExample: false });
  });

  it("matches whole normalized phrases after NFKC and marker stripping", () => {
    const evidence = findMarkdownEvidence(
      "## `ＱＵＩＣＫ`—**ＳＴＡＲＴ**\n\n## Installer\n\n## Preinstallation",
    );

    expect(evidence.installHeading).toBe(true);
    expect(evidence.usageHeading).toBe(true);
    expect(
      findMarkdownEvidence("## Installer\n## Preinstallation").installHeading,
    ).toBe(false);
  });

  it("requires fenced commands and rejects prose punctuation as the first token", () => {
    const outsideFence = "## Install\n$ npm install";
    const proseFence = "## Install\n```text\n... npm install\n```";
    const promptedFence = "## Install\n```sh\n> npm install\n```";

    expect(findMarkdownEvidence(outsideFence).installCommand).toBe(false);
    expect(findMarkdownEvidence(proseFence).installCommand).toBe(false);
    expect(findMarkdownEvidence(promptedFence).installCommand).toBe(true);
  });

  it("associates fenced evidence with its enclosing heading section", () => {
    const markdown =
      "## Install\nOnly prose.\n\n## Usage\n```sh\npnpm start\n```";
    const evidence = findMarkdownEvidence(markdown);

    expect(evidence.installCommand).toBe(false);
    expect(evidence.usageCommandOrExample).toBe(true);
  });
});

describe("logical line helpers", () => {
  it("excludes blank and comment-only JS/TS lines while preserving mixed lines", () => {
    const source = [
      "// comment",
      "const first = 1; // mixed",
      "/* block",
      " * comment",
      " */",
      'const marker = "// code, not a comment";',
      "const second = 2; /* trailing */",
      "",
    ].join("\n");

    expect(countLogicalLines(source, "javascript")).toBe(3);
    expect(countLogicalLines(source, "typescript")).toBe(3);
  });

  it("excludes Python comments without treating hashes in strings as comments", () => {
    const source = [
      "# comment",
      "value = 1  # mixed",
      'marker = "# code, not a comment"',
      "",
      "    # indented comment",
    ].join("\n");

    expect(countLogicalLines(source, "python")).toBe(2);
  });

  it("closes single-line Python triple strings without consuming later comments", () => {
    const source = [
      '"""Module documentation."""',
      "# comment after the docstring",
      "value = 1",
    ].join("\n");

    expect(countLogicalLines(source, "python")).toBe(2);
  });

  it("returns one-based line numbers for valid offsets", () => {
    const text = "first\nsecond\nthird";

    expect(lineAtOffset(text, 0)).toBe(1);
    expect(lineAtOffset(text, 5)).toBe(1);
    expect(lineAtOffset(text, 6)).toBe(2);
    expect(lineAtOffset(text, text.length)).toBe(3);
    expect(() => lineAtOffset(text, -1)).toThrow("Invalid text offset");
    expect(() => lineAtOffset(text, text.length + 1)).toThrow(
      "Invalid text offset",
    );
  });
});
