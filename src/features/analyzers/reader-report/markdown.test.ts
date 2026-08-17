import { describe, expect, it } from "vitest";

import type { FetchedTextFile } from "../../analysis/model";
import { extractReaderMarkdownEvidence } from "./markdown";

function fetched(path: string, text: string): FetchedTextFile {
  const bytes = new TextEncoder().encode(text).byteLength;

  return {
    path,
    text,
    bytes,
    declaredSize: bytes,
    language: "none",
    category: "documentation",
    isTest: false,
  };
}

function emptyEvidence() {
  return {
    scenarios: [],
    architecture: [],
    securityPrivacy: [],
    commands: [],
  };
}

describe("extractReaderMarkdownEvidence", () => {
  it("extracts bounded prose and inert commands from preferred sections", () => {
    const readme = fetched(
      "README.md",
      `# Tool

## Use cases

- Triage newcomer issues before publishing them.
- Review contributor instructions during release preparation.

## Architecture

The browser fetches a pinned public commit and sends bounded text to a Worker.

## Install

\`\`\`sh
pnpm install
\`\`\`

## Development

\`pnpm dev\`

## Security

Repository text stays in the browser and is never executed.
`,
    );

    expect(extractReaderMarkdownEvidence(readme)).toEqual({
      scenarios: [
        {
          source: "readme",
          text: "Triage newcomer issues before publishing them.",
          path: "README.md",
        },
        {
          source: "readme",
          text: "Review contributor instructions during release preparation.",
          path: "README.md",
        },
      ],
      architecture: [
        {
          source: "readme",
          text: "The browser fetches a pinned public commit and sends bounded text to a Worker.",
          path: "README.md",
        },
      ],
      securityPrivacy: [
        {
          source: "readme",
          text: "Repository text stays in the browser and is never executed.",
          path: "README.md",
        },
      ],
      commands: [
        {
          source: "readme",
          path: "README.md",
          kind: "install",
          command: "pnpm install",
          disposition: "ready",
        },
        {
          source: "readme",
          path: "README.md",
          kind: "develop",
          command: "pnpm dev",
          disposition: "ready",
        },
      ],
    });
  });

  it("retains repository-authored Chinese prose without translation", () => {
    const readme = fetched(
      "README.zh-CN.md",
      `# 工具

## 适用场景

- 在采用项目前检查公开证据。

## 工作原理

浏览器只读取固定提交中的有限文本。

## 数据处理

仓库文本不会作为代码执行。

## 快速开始

\`pnpm start\`
`,
    );

    expect(extractReaderMarkdownEvidence(readme)).toEqual({
      scenarios: [
        {
          source: "readme",
          text: "在采用项目前检查公开证据。",
          path: "README.zh-CN.md",
        },
      ],
      architecture: [
        {
          source: "readme",
          text: "浏览器只读取固定提交中的有限文本。",
          path: "README.zh-CN.md",
        },
      ],
      securityPrivacy: [
        {
          source: "readme",
          text: "仓库文本不会作为代码执行。",
          path: "README.zh-CN.md",
        },
      ],
      commands: [
        {
          source: "readme",
          path: "README.zh-CN.md",
          kind: "run",
          command: "pnpm start",
          disposition: "ready",
        },
      ],
    });
  });

  it.each([
    "use cases",
    "who is this for",
    "examples",
    "business scenarios",
    "用途",
    "适用场景",
    "使用场景",
    "示例",
  ])("recognizes the frozen scenario heading %s", (heading) => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `## ${heading}\n\n- A concrete scenario.`),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "A concrete scenario.",
    ]);
  });

  it.each([
    "architecture",
    "design",
    "how it works",
    "internals",
    "架构",
    "设计",
    "工作原理",
    "实现原理",
  ])("recognizes the frozen architecture heading %s", (heading) => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## ${heading}\n\nA bounded architecture statement.`,
      ),
    );

    expect(result.architecture.map(({ text }) => text)).toEqual([
      "A bounded architecture statement.",
    ]);
  });

  it.each([
    "security",
    "privacy",
    "permissions",
    "data handling",
    "安全",
    "隐私",
    "权限",
    "数据处理",
  ])("recognizes the frozen security heading %s", (heading) => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `## ${heading}\n\nA bounded security statement.`),
    );

    expect(result.securityPrivacy.map(({ text }) => text)).toEqual([
      "A bounded security statement.",
    ]);
  });

  it.each([
    ["install", "install"],
    ["installation", "install"],
    ["setup", "install"],
    ["安装", "install"],
    ["配置环境", "install"],
    ["usage", "run"],
    ["run", "run"],
    ["quick start", "run"],
    ["使用", "run"],
    ["运行", "run"],
    ["快速开始", "run"],
    ["development", "develop"],
    ["develop", "develop"],
    ["开发", "develop"],
    ["二次开发", "develop"],
    ["test", "test"],
    ["testing", "test"],
    ["测试", "test"],
    ["build", "build"],
    ["building", "build"],
    ["构建", "build"],
  ] as const)("recognizes the frozen command heading %s", (heading, kind) => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `## ${heading}\n\n\`pnpm example\``),
    );

    expect(result.commands).toMatchObject([
      { kind, command: "pnpm example", disposition: "ready" },
    ]);
  });

  it("supports setext headings and deeper subsections through heading-stack state", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `Use cases
---------

### Teams

- Review evidence before adoption.

Installation
============

### pnpm

\`$ pnpm install\`
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Review evidence before adoption.",
    ]);
    expect(result.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
  });

  it("caps facts, removes NFKC duplicates, and preserves first source order", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- First scenario.
- Ｆｉｒｓｔ scenario.
- Second scenario.
- Third scenario.
- Fourth scenario.

## Architecture

First architecture paragraph.

Second architecture paragraph.

Third architecture paragraph.

## Security

First declaration.

Second declaration.

Third declaration.

Fourth declaration.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "First scenario.",
      "Second scenario.",
      "Third scenario.",
    ]);
    expect(result.architecture.map(({ text }) => text)).toEqual([
      "First architecture paragraph.",
      "Second architecture paragraph.",
    ]);
    expect(result.securityPrivacy.map(({ text }) => text)).toEqual([
      "First declaration.",
      "Second declaration.",
      "Third declaration.",
    ]);
  });

  it("applies optional scenario exclusions before the three-fact cap", () => {
    const readme = fetched(
      "README.md",
      `## Use cases

- Purpose one.
- Ｐｕｒｐｏｓｅ two.
- Unique one.
- Unique two.
- Unique three.
`,
    );

    expect(
      extractReaderMarkdownEvidence(readme).scenarios.map(({ text }) => text),
    ).toEqual(["Purpose one.", "Ｐｕｒｐｏｓｅ two.", "Unique one."]);
    expect(
      extractReaderMarkdownEvidence(readme, {
        scenarioExclusions: new Set(["Purpose one.", "Purpose two."]),
      }).scenarios.map(({ text }) => text),
    ).toEqual(["Unique one.", "Unique two.", "Unique three."]);
  });

  it("omits prose over 480 code points rather than truncating it", () => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `## Use cases\n\n- ${"界".repeat(481)}`),
    );

    expect(result.scenarios).toEqual([]);
  });

  it("ignores code outside command sections and retains one fact per command kind", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `\`\`\`sh
pnpm outside
\`\`\`

## Install

\`pnpm first\`
\`pnpm duplicate\`

## Run

\`pnpm start\`

## Development

\`pnpm dev\`

## Test

\`pnpm test\`

## Build

\`pnpm build\`
`,
      ),
    );

    expect(
      result.commands.map(({ kind, command }) => ({ kind, command })),
    ).toEqual([
      { kind: "install", command: "pnpm first" },
      { kind: "run", command: "pnpm start" },
      { kind: "develop", command: "pnpm dev" },
      { kind: "test", command: "pnpm test" },
      { kind: "build", command: "pnpm build" },
    ]);
  });

  it("returns command facts in canonical kind order when sections are shuffled", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        "## Build\n\n`pnpm build`\n\n## Run\n\n`pnpm start`\n\n## Install\n\n`pnpm install`",
      ),
    );

    expect(result.commands.map(({ kind }) => kind)).toEqual([
      "install",
      "run",
      "build",
    ]);
  });

  it("recognizes plain and indented commands only inside command sections", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

    pnpm hidden
- Visible scenario.

## Install

    pnpm install

## Development

pnpm dev
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible scenario.",
    ]);
    expect(
      result.commands.map(({ kind, command }) => ({ kind, command })),
    ).toEqual([
      { kind: "install", command: "pnpm install" },
      { kind: "develop", command: "pnpm dev" },
    ]);
  });

  it("keeps link labels but drops destinations and raw URLs from prose", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- [Review public evidence](https://secret.invalid/TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa).
- [https://hidden.invalid](https://destination.invalid).
- https://example.invalid/private
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Review public evidence.",
    ]);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
    expect(JSON.stringify(result)).not.toContain("ghp_");
  });

  it("drops generic, protocol-relative, and www raw destinations with ASCII identifier boundaries", () => {
    const hidden = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- ftp://ftp.secret.invalid/private
- git://git.secret.invalid/private
- custom://custom.secret.invalid/private
- //relative.secret.invalid/private
- www.web-secret.invalid/private
`,
      ),
    );
    const identifiers = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- Identifier mywww.example.com remains prose.
- Identifier namespace//value remains prose.
`,
      ),
    );
    expect(hidden.scenarios).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain("secret.invalid");
    expect(identifiers.scenarios.map(({ text }) => text)).toEqual([
      "Identifier mywww.example.com remains prose.",
      "Identifier namespace//value remains prose.",
    ]);
  });

  it.each([
    "ftp://label.secret.invalid",
    "custom://label.secret.invalid",
    "//label.secret.invalid",
    "www.label.secret.invalid",
  ])("drops a raw URL link label %s", (label) => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases\n\n- [${label}](https://destination.invalid).`,
      ),
    );

    expect(result.scenarios).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
  });

  it.each(['"', "'"])(
    "keeps a %s-quoted link title parenthesis inside the discarded destination",
    (quote) => {
      const credential = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const result = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Use cases\n\n- [Review evidence](https://secret.invalid ${quote}Hidden ) ${credential}${quote}) safely.`,
        ),
      );

      expect(result.scenarios.map(({ text }) => text)).toEqual([
        "Review evidence safely.",
      ]);
      expect(JSON.stringify(result)).not.toContain("secret.invalid");
      expect(JSON.stringify(result)).not.toContain(credential);
    },
  );

  it("ignores images, badges, navigation, HTML, inline code, and tables", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Contents

- [Use cases](#use-cases)

## Use cases

![badge](https://example.invalid/badge.svg)
<img src="https://example.invalid/hidden.png" alt="Hidden scenario">
- \`pnpm hidden\`
| Scenario | Audience |
| --- | --- |
| Hidden | Everyone |
<!-- - Commented scenario. -->
<details>
<summary>Hidden</summary>
- Hidden HTML scenario.
</details>
- Visible scenario.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible scenario.",
    ]);
  });

  it("fails closed for an unclosed mid-line HTML comment", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- Visible before malformed input.
Visible text <!-- hidden
- Hidden after the unclosed comment.
`,
      ),
    );

    expect(result).toEqual(emptyEvidence());
  });

  it("tracks uppercase HTML after list containers without trusting quoted, commented, or fake closing tags", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- <DIV data-example="</DIV>">
  - Hidden inside HTML.
  <!-- </DIV> -->
  </division>
  </DIV>
- Visible after HTML.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible after HTML.",
    ]);
  });

  it("retains HTML block state when a closed comment follows its opening tag", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- <DIV><!-- comment with </division> -->
  - Hidden inside HTML.
  </DIV>
- Visible after HTML.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible after HTML.",
    ]);
  });

  it("does not treat comment markers inside inline code or link destinations as HTML state", () => {
    const inlineCode = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

\`<!--\`
- Visible after inline code.
`,
      ),
    );
    const linkDestination = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- [Review evidence](custom://secret.invalid/<!--marker) safely.
- Visible after link destination.
`,
      ),
    );

    expect(inlineCode.scenarios.map(({ text }) => text)).toEqual([
      "Visible after inline code.",
    ]);
    expect(linkDestination.scenarios.map(({ text }) => text)).toEqual([
      "Review evidence safely.",
      "Visible after link destination.",
    ]);
  });

  it.each([
    ["inline code", "`unclosed <!--"],
    ["link destination", "[bad](custom://example.invalid/( <!--"],
    [
      "over-deep link destination",
      `[bad](custom://example.invalid/${"(".repeat(129)} <!--`,
    ],
  ])(
    "fails closed for an unclosed %s before an HTML comment",
    (_label, malformed) => {
      const result = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Use cases

- Visible before malformed inline Markdown.
${malformed}
- Hidden after the comment.
`,
        ),
      );

      expect(result).toEqual(emptyEvidence());
    },
  );

  it("hides closed CDATA and fails closed for unclosed CDATA", () => {
    const closed = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

<![CDATA[
- Hidden CDATA scenario.
]]>
- Visible after CDATA.
`,
      ),
    );
    const unclosed = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- Visible before CDATA.
<![CDATA[
- Hidden forever.
`,
      ),
    );

    expect(closed.scenarios.map(({ text }) => text)).toEqual([
      "Visible after CDATA.",
    ]);
    expect(unclosed).toEqual(emptyEvidence());
  });

  it("skips bounded DOCTYPE declarations and fails closed at an unclosed boundary", () => {
    const closed = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

<!DOCTYPE html>
- Visible after DOCTYPE.
`,
      ),
    );
    const unclosed = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

- Visible before DOCTYPE.
<!DOCTYPE html
- Hidden after malformed declaration.
`,
      ),
    );

    expect(closed.scenarios.map(({ text }) => text)).toEqual([
      "Visible after DOCTYPE.",
    ]);
    expect(unclosed).toEqual(emptyEvidence());
  });

  it.each([
    ["processing instruction", "<?repository", "?>"],
    ["generic declaration", "<!DECLARATION", ">"],
  ])(
    "hides a multiline %s and fails closed when its boundary is missing",
    (_label, opening, closing) => {
      const closed = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Use cases

${opening}
- Hidden declaration body.
${closing}
- Visible after declaration.
`,
        ),
      );
      const unclosed = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Use cases

- Visible before declaration.
${opening}
- Hidden forever.
`,
        ),
      );

      expect(closed.scenarios.map(({ text }) => text)).toEqual([
        "Visible after declaration.",
      ]);
      expect(unclosed).toEqual(emptyEvidence());
    },
  );

  it("fails closed instead of leaking HTML hidden behind more than 16 containers", () => {
    const containers = "> ".repeat(17);
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

${containers}<DETAILS>
- Hidden after excessive containers.
</DETAILS>
`,
      ),
    );

    expect(result).toEqual(emptyEvidence());
  });

  it("continues scanning HTML after a multiline comment closes", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

<DIV><!--
hidden comment
--> </DIV>
- Visible after the root closes.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible after the root closes.",
    ]);
  });

  it("does not extract a command hidden in a blockquote HTML comment", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Install

> ordinary <!-- \`rm -rf /\` -->

\`pnpm install\`
`,
      ),
    );

    expect(result.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
  });

  it("ignores ToC links, borderless tables, and full reference definitions inside scenario sections", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Examples

- [Architecture](#architecture)
Name | Audience
--- | ---
Hidden row | Everyone
[label]: https://example.invalid/hidden
- Visible scenario.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible scenario.",
    ]);
  });

  it("ignores reference-style local navigation and its fragment definition", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Examples

- [Usage guide][usage]
[usage]: #usage
- Visible scenario.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible scenario.",
    ]);
  });

  it("does not close a normal fence with a four-space-indented fence marker", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Use cases

\`\`\`text
    \`\`\`
hidden fenced content
\`\`\`
- Visible after the real close.
`,
      ),
    );

    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible after the real close.",
    ]);
  });

  it("does not let comments, natural prose, or indented fence wrappers reserve a command kind", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Install

$ # setup note
Make sure Node.js is installed first.
npm is the supported package manager.
pnpm supports workspaces.
    \`\`\`sh
    npm fake
    \`\`\`
\`pnpm install\`

## Run

Go to the project page for details.
\`pnpm start\`
`,
      ),
    );

    expect(
      result.commands.map(({ kind, command }) => ({ kind, command })),
    ).toEqual([
      { kind: "install", command: "pnpm install" },
      { kind: "run", command: "pnpm start" },
    ]);
  });

  it("labels non-README Markdown evidence as documentation", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "docs/SECURITY.md",
        "## Security\n\nReport vulnerabilities through the documented channel.",
      ),
    );

    expect(result.securityPrivacy).toEqual([
      {
        source: "documentation",
        path: "docs/SECURITY.md",
        text: "Report vulnerabilities through the documented channel.",
      },
    ]);
  });

  it("labels a README control-list command for review", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        "## Installation\n\n`npm install && rm -rf ./generated`",
      ),
    );

    expect(result.commands).toEqual([
      {
        source: "readme",
        path: "README.md",
        kind: "install",
        command: "npm install && rm -rf ./generated",
        disposition: "review",
      },
    ]);
  });

  it.each([
    ["credential", "TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["control", "Visible\u0000hidden"],
    ["bidi", "Visible\u202ehidden"],
    ["line separator", "Visible\u2028hidden"],
    ["malformed UTF-16", "Visible\ud800hidden"],
  ])("omits unsafe %s prose", (_label, unsafe) => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `## Security\n\n${unsafe}`),
    );

    expect(result.securityPrivacy).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(unsafe);
  });

  it("withholds unsafe command text without retaining the value", () => {
    const credential =
      "TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa pnpm dev";
    const overlong = `pnpm ${"x".repeat(160)}`;
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Development\n\n\`${credential}\`\n\n## Build\n\n\`${overlong}\``,
      ),
    );

    expect(result.commands).toEqual([
      {
        source: "readme",
        path: "README.md",
        kind: "develop",
        command: null,
        disposition: "withheld",
      },
      {
        source: "readme",
        path: "README.md",
        kind: "build",
        command: null,
        disposition: "withheld",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("ghp_");
  });

  it.each([
    ["fence", "## Use cases\n\n- Visible.\n\n```sh\nhidden"],
    ["HTML comment", "## Use cases\n\n- Visible.\n\n<!-- hidden"],
    ["HTML block", "## Use cases\n\n- Visible.\n\n<details>\nhidden"],
  ])("fails closed for an unclosed %s", (_label, markdown) => {
    expect(
      extractReaderMarkdownEvidence(fetched("README.md", markdown)),
    ).toEqual(emptyEvidence());
  });

  it("rejects missing, non-documentation, unsafe-path, and oversized inputs", () => {
    const wrongCategory = {
      ...fetched("README.md", "## Use cases\n\n- Visible."),
      category: "manifest" as const,
    };

    expect(extractReaderMarkdownEvidence(undefined)).toEqual(emptyEvidence());
    expect(extractReaderMarkdownEvidence(wrongCategory)).toEqual(
      emptyEvidence(),
    );
    expect(
      extractReaderMarkdownEvidence(
        fetched("../README.md", "## Use cases\n\n- Visible."),
      ),
    ).toEqual(emptyEvidence());
    expect(
      extractReaderMarkdownEvidence(
        fetched("README.md", `## Use cases\n\n${"a".repeat(256 * 1024 + 1)}`),
      ),
    ).toEqual(emptyEvidence());
  });

  it("does not mutate frozen input and handles a near-limit README quickly", () => {
    const file = Object.freeze(
      fetched(
        "README.md",
        `## Use cases\n\n- Visible scenario.\n\n${"ordinary prose\n".repeat(17_000)}`,
      ),
    );
    const before = structuredClone(file);
    const started = performance.now();
    const result = extractReaderMarkdownEvidence(file);

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(file).toEqual(before);
    expect(result.scenarios.map(({ text }) => text)).toEqual([
      "Visible scenario.",
    ]);
  });

  it("fails fast on a near-limit line of unmatched link openers", () => {
    const file = fetched(
      "README.md",
      `## Use cases\n\n${"[".repeat(255 * 1024)}`,
    );
    const started = performance.now();
    const result = extractReaderMarkdownEvidence(file);

    expect(performance.now() - started).toBeLessThan(1_000);
    expect(result).toEqual(emptyEvidence());
  });
});
