import { describe, expect, it } from "vitest";

import { chineseReadme, englishReadme } from "../../test/fixtures/text-files";
import { RECOGNIZED_SOURCE_EXTENSIONS } from "../scanner/file-registry";
import {
  CODE_FENCE_LANGUAGE_ALIASES,
  RECOGNIZED_CODE_FENCE_LANGUAGES,
  countLogicalLines,
  findMarkdownEvidence,
  lineAtOffset,
  logicalLineNumbers,
} from "./line-metrics";

describe("Markdown evidence", () => {
  it("normalizes English headings and recognizes commands and examples", () => {
    expect(findMarkdownEvidence(englishReadme)).toMatchObject({
      installHeading: true,
      installCommand: true,
      usageHeading: true,
      usageCommand: false,
      usageConcreteExample: true,
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
      usageCommand: false,
      usageConcreteExample: true,
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

  it("keeps visible link labels but discards inline and reference destinations", () => {
    expect(findMarkdownEvidence("## [Guide](setup)").installHeading).toBe(
      false,
    );
    expect(
      findMarkdownEvidence("## [Install guide](https://example.test/setup)")
        .installHeading,
    ).toBe(true);
    expect(
      findMarkdownEvidence(
        "## [Guide][installation]\n\n[installation]: https://example.test",
      ).installHeading,
    ).toBe(false);
    expect(
      findMarkdownEvidence("## ![Setup diagram](diagram.svg)").installHeading,
    ).toBe(true);
    expect(
      findMarkdownEvidence("## <a href='/install'>Guide</a>").installHeading,
    ).toBe(false);
    expect(
      findMarkdownEvidence("## <a href='/guide'>Install guide</a>")
        .installHeading,
    ).toBe(true);
    expect(
      findMarkdownEvidence("## <https://example.test/install>").installHeading,
    ).toBe(false);
  });

  it("handles a near-limit run of unmatched brackets without destination leakage", () => {
    const hostile = `## ${"[".repeat(256 * 1024 - 32)}Guide`;

    expect(findMarkdownEvidence(hostile).installHeading).toBe(false);
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

  it.each([
    ["```sh\nnpm test\n```", true, false],
    ["```sh\n./gradlew test\n```", true, false],
    ['```ts\nscan("owner/repo");\n```', false, true],
    ["```text\nThis is prose only.\n```", false, false],
    ['```json\n{"command":"npm run dev"}\n```', false, false],
    ['```ts\n// scan("owner/repo");\n```', false, false],
  ])(
    "separates command and concrete-example fences: %s",
    (fence, usageCommand, usageConcreteExample) => {
      expect(findMarkdownEvidence(`## Usage\n${fence}`)).toMatchObject({
        usageCommand,
        usageConcreteExample,
        usageCommandOrExample: usageCommand || usageConcreteExample,
      });
    },
  );

  it.each([
    ['```\nscan("owner/repo");\n```', true],
    ["```\nvalue = createValue()\n```", true],
    ["```ts\nimport\n```", false],
    ["```python\nclass\n```", false],
    ["```\nThis prose mentions import and class only.\n```", false],
  ])(
    "requires an actual code shape for concrete examples: %s",
    (fence, expected) => {
      expect(
        findMarkdownEvidence(`## Usage\n${fence}`).usageConcreteExample,
      ).toBe(expected);
    },
  );

  it("exports the full recognized fence alias registry without data languages", () => {
    expect(RECOGNIZED_CODE_FENCE_LANGUAGES).toEqual(
      expect.arrayContaining([
        "r",
        "elixir",
        "erlang",
        "clojure",
        "haskell",
        "sh",
        "bash",
        "zsh",
        "fish",
        "ex",
        "erl",
        "clj",
        "hs",
      ]),
    );
    expect(RECOGNIZED_CODE_FENCE_LANGUAGES).not.toContain("json");
    expect(RECOGNIZED_CODE_FENCE_LANGUAGES).not.toContain("text");
    expect(
      RECOGNIZED_SOURCE_EXTENSIONS.map((extension) =>
        extension.slice(1).toLocaleLowerCase("en-US"),
      ).filter(
        (extension) => !RECOGNIZED_CODE_FENCE_LANGUAGES.includes(extension),
      ),
    ).toEqual([]);
    expect(Object.isFrozen(CODE_FENCE_LANGUAGE_ALIASES)).toBe(true);
    expect(
      Object.values(CODE_FENCE_LANGUAGE_ALIASES).every(Object.isFrozen),
    ).toBe(true);
    expect(Object.isFrozen(RECOGNIZED_CODE_FENCE_LANGUAGES)).toBe(true);
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

  it("preserves JS and Python strings across trailing-backslash continuations", () => {
    const javascript = [
      'const value = "first \\',
      '// still inside the string";',
      "// comment",
      "const next = 1;",
    ].join("\n");
    const python = [
      'value = "first \\',
      '# still inside the string"',
      "# comment",
      "next_value = 1",
    ].join("\n");

    expect(countLogicalLines(javascript, "javascript")).toBe(3);
    expect(countLogicalLines(python, "python")).toBe(3);
  });

  it("normalizes CRLF only for JS/Python logical-line continuation scanning", () => {
    const javascript =
      'const value = "first \\\r\n// still inside";\r\n// comment\r\nconst next = 1;';
    const python =
      'value = "first \\\r\n# still inside"\r\n# comment\r\nnext_value = 1';

    expect(countLogicalLines(javascript, "javascript")).toBe(3);
    expect(countLogicalLines(python, "python")).toBe(3);
    expect(lineAtOffset("a\r\nb", 3)).toBe(2);
  });

  it.each([
    ["LINE SEPARATOR", "\u2028"],
    ["PARAGRAPH SEPARATOR", "\u2029"],
  ])(
    "treats ECMAScript %s as a JS/TS logical-line terminator",
    (_label, separator) => {
      const source = [
        "// comment",
        "const first = 1;",
        "",
        "const second = 2;",
      ].join(separator);

      expect(logicalLineNumbers(source, "javascript")).toEqual([2, 4]);
      expect(logicalLineNumbers(source, "typescript")).toEqual([2, 4]);
    },
  );

  it.each([
    [
      "JavaScript single-quoted LS followed by //",
      "javascript",
      "'",
      "\u2028",
      "//",
    ],
    [
      "JavaScript double-quoted PS followed by /*",
      "javascript",
      '"',
      "\u2029",
      "/*",
    ],
    [
      "TypeScript double-quoted LS followed by /*",
      "typescript",
      '"',
      "\u2028",
      "/*",
    ],
    [
      "TypeScript single-quoted PS followed by //",
      "typescript",
      "'",
      "\u2029",
      "//",
    ],
  ] as const)(
    "keeps %s inside the ordinary string token",
    (_label, language, quote, separator, commentPrefix) => {
      const source = `function inspect() { return ${quote}first${separator}${commentPrefix} still string${quote}; }`;

      expect(logicalLineNumbers(source, language)).toEqual([1, 2]);
    },
  );

  it("handles mixed ECMAScript line terminators without changing Python syntax", () => {
    const javascript =
      "// comment\rconst first = 1;\n\r\nconst second = 2;\u2028// comment\u2029const third = 3;";

    expect(logicalLineNumbers(javascript, "javascript")).toEqual([2, 4, 6]);
    expect(logicalLineNumbers(javascript, "typescript")).toEqual([2, 4, 6]);
    expect(countLogicalLines("# comment\u2028value = 1", "python")).toBe(0);
  });

  it("only closes Python triple strings on unescaped delimiters", () => {
    const source = [
      String.raw`value = r"""first \""" still string`,
      "continued",
      '"""',
      "# comment after string",
      "next_value = 1",
    ].join("\n");

    expect(countLogicalLines(source, "python")).toBe(4);
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
