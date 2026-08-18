import { describe, expect, it } from "vitest";

import type { FetchedTextFile } from "../../analysis/model";
import {
  READER_MARKDOWN_PENDING_CAPABILITY_LIMITS,
  extractReaderMarkdownEvidence,
} from "./markdown";
import { README_PROFILE_CAPS, README_SECTION_HEADINGS } from "./readme-policy";

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
    readme: emptyReadmeEvidence(),
  };
}

function emptyReadmeEvidence() {
  return {
    overview: [],
    audiences: [],
    problems: [],
    useCases: [],
    capabilityGroups: [],
    workflow: [],
    dependencies: [],
    limitations: [],
    maturity: [],
  };
}

function fact(text: string, path = "README.md") {
  return { source: "readme", path, text } as const;
}

function group(label: string, facts: readonly string[]) {
  return { label, facts: facts.map((text) => fact(text)) };
}

describe("extractReaderMarkdownEvidence", () => {
  it("uses canonical README path semantics for evidence provenance", () => {
    expect(
      extractReaderMarkdownEvidence(
        fetched("README-guide.md", "## Overview\n\nGuide orientation."),
      ).readme.overview[0]?.source,
    ).toBe("readme");
    expect(
      extractReaderMarkdownEvidence(
        fetched("README.exe", "## Overview\n\nLookalike orientation."),
      ).readme.overview[0]?.source,
    ).toBe("documentation");
  });

  it("freezes the exact bilingual README vocabulary and caps", () => {
    expect(README_PROFILE_CAPS).toEqual({
      overview: 4,
      audiences: 4,
      problems: 4,
      useCases: 4,
      capabilityGroups: 6,
      capabilityFacts: 6,
      workflow: 8,
      dependencies: 8,
      limitations: 6,
      maturity: 6,
    });
    expect(README_SECTION_HEADINGS).toEqual({
      overview: [
        "overview",
        "introduction",
        "about",
        "简介",
        "项目介绍",
        "概述",
      ],
      audiences: ["who is this for", "audience", "适合谁", "目标用户"],
      problems: ["problem", "why", "motivation", "解决的问题", "为什么"],
      useCases: [
        "use cases",
        "business scenarios",
        "用途",
        "适用场景",
        "使用场景",
      ],
      capabilities: ["features", "capabilities", "功能", "特性", "核心能力"],
      workflow: [
        "workflow",
        "how it works",
        "core concepts",
        "流程",
        "工作流",
        "工作原理",
        "核心概念",
      ],
      dependencies: [
        "requirements",
        "prerequisites",
        "installation",
        "deployment",
        "providers",
        "integrations",
        "configuration",
        "依赖",
        "环境要求",
        "安装",
        "部署",
        "模型服务",
        "集成",
        "配置",
      ],
      limitations: [
        "limitations",
        "known issues",
        "security",
        "privacy",
        "data handling",
        "限制",
        "已知问题",
        "安全",
        "隐私",
        "数据处理",
      ],
      maturity: [
        "roadmap",
        "status",
        "migration",
        "preview",
        "beta",
        "路线图",
        "项目状态",
        "迁移",
        "预览",
        "测试版",
      ],
    });
    expect(Object.isFrozen(README_PROFILE_CAPS)).toBe(true);
    expect(Object.isFrozen(README_SECTION_HEADINGS)).toBe(true);
    for (const headings of Object.values(README_SECTION_HEADINGS)) {
      expect(Object.isFrozen(headings)).toBe(true);
    }
  });

  it("extracts a rich README profile in one source-ordered scan", () => {
    const richReadme = fetched(
      "README.md",
      `# StoryForge

An end-to-end workspace for long-form fiction.

## Who is this for?
- Independent novelists
- Writing teams

## Problems
- Keeping a long narrative consistent

## Features
### Planning
- Worldbuilding
- Character arcs
### Production
- Chapter generation
- Whole-book review

## Workflow
1. Capture an idea
2. Build the world
3. Plan chapters
4. Draft and review

## Requirements
- Node.js 24
- A model provider API key

## Limitations
- Collaborative editing is experimental

## Roadmap
- Stable migration tooling
`,
    );

    expect(extractReaderMarkdownEvidence(richReadme).readme).toEqual({
      overview: [fact("An end-to-end workspace for long-form fiction.")],
      audiences: [fact("Independent novelists"), fact("Writing teams")],
      problems: [fact("Keeping a long narrative consistent")],
      useCases: [],
      capabilityGroups: [
        group("Planning", ["Worldbuilding", "Character arcs"]),
        group("Production", ["Chapter generation", "Whole-book review"]),
      ],
      workflow: [
        fact("Capture an idea"),
        fact("Build the world"),
        fact("Plan chapters"),
        fact("Draft and review"),
      ],
      dependencies: [fact("Node.js 24"), fact("A model provider API key")],
      limitations: [fact("Collaborative editing is experimental")],
      maturity: [fact("Stable migration tooling")],
    });
  });

  it("recognizes Chinese and mixed-language profile headings without translating repository prose", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.zh-CN.md",
        `# 写作工具

## 简介
这是一个帮助写作者维护长篇故事一致性的本地工具。

## 目标用户
- 独立作者

## 解决的问题
- 长篇设定容易前后冲突

## Features
### 规划
- 世界观管理

## 工作流
1. 记录想法
2. 审阅章节

## 环境要求
- Node.js 24

## 已知问题
- 协作编辑仍在测试

## 项目状态
- 公开预览阶段
`,
      ),
    ).readme;

    expect(result).toEqual({
      overview: [
        fact(
          "这是一个帮助写作者维护长篇故事一致性的本地工具。",
          "README.zh-CN.md",
        ),
      ],
      audiences: [fact("独立作者", "README.zh-CN.md")],
      problems: [fact("长篇设定容易前后冲突", "README.zh-CN.md")],
      useCases: [],
      capabilityGroups: [
        {
          label: "规划",
          facts: [fact("世界观管理", "README.zh-CN.md")],
        },
      ],
      workflow: [
        fact("记录想法", "README.zh-CN.md"),
        fact("审阅章节", "README.zh-CN.md"),
      ],
      dependencies: [fact("Node.js 24", "README.zh-CN.md")],
      limitations: [fact("协作编辑仍在测试", "README.zh-CN.md")],
      maturity: [fact("公开预览阶段", "README.zh-CN.md")],
    });
  });

  it("admits bounded two-cell table facts and skips header, separator, and wider rows", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Features
### Output formats
Format | Result
--- | ---
PDF | Print-ready export
EPUB | Reflowable export
Too | Many | Cells
`,
      ),
    ).readme;

    expect(result.capabilityGroups).toEqual([
      group("Output formats", [
        "PDF — Print-ready export",
        "EPUB — Reflowable export",
      ]),
    ]);
  });

  it("keeps nested recognized headings inside the nearest capability group", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Features
### Workflow
- Visual editor
`,
      ),
    ).readme;

    expect(result.capabilityGroups).toEqual([
      group("Workflow", ["Visual editor"]),
    ]);
    expect(result.workflow).toEqual([]);
  });

  it("preserves the first safe capability label spelling across NFKC duplicates", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Features
### Ｐｌａｎｎｉｎｇ
- Visual editor
### Planning
- Export review
`,
      ),
    ).readme;

    expect(result.capabilityGroups).toEqual([
      group("Ｐｌａｎｎｉｎｇ", ["Visual editor", "Export review"]),
    ]);
  });

  it.each([
    ["raw URL", "Planning https://secret.invalid/group"],
    ["fullwidth raw URL", "ｈｔｔｐｓ：／／secret.invalid／group"],
    [
      "fullwidth Markdown link",
      "Ｐｌａｎｎｉｎｇ ［guide］（ｈｔｔｐｓ：／／secret.invalid／group）",
    ],
    ["credential", `Planning ghp_${"a".repeat(36)}`],
    ["control", "Planning\u0000hidden"],
    ["bidi", "Planning\u202ehidden"],
    ["malformed UTF-16", "Planning\ud800hidden"],
  ])(
    "rejects an unsafe %s capability label and its facts",
    (_label, heading) => {
      const result = extractReaderMarkdownEvidence(
        fetched("README.md", `## Features\n### ${heading}\n- Hidden fact`),
      ).readme;

      expect(result.capabilityGroups).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("Hidden fact");
    },
  );

  it("rejects escaped URLs after Markdown cleanup in profile facts and labels", () => {
    const escapedUrl = String.raw`Documentation https\:\/\/secret.invalid\/group`;
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Overview
- ${escapedUrl}

## Features
### ${escapedUrl}
- Hidden under label
### Safe group
- ${escapedUrl}
`,
      ),
    ).readme;

    expect(result.overview).toEqual([]);
    expect(result.capabilityGroups).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("secret.invalid");
  });

  it("preserves safe Markdown escapes in repository-authored profile text", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        String.raw`## Features
### Planning \*tools\*
- Local \*planning\* workspace
`,
      ),
    ).readme;

    expect(result.capabilityGroups).toEqual([
      group("Planning tools", ["Local *planning* workspace"]),
    ]);
  });

  it("keeps dependency table rows as prose without reserving the install command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation
Runtime | Version
--- | ---
npm | >=10

pnpm install
`,
      ),
    );

    expect(result.readme.dependencies).toEqual([fact("npm — >=10")]);
    expect(result.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
  });

  it("applies exact caps and NFKC deduplication while preserving first source spelling", () => {
    const paragraphs = (prefix: string, count: number) =>
      Array.from(
        { length: count },
        (_, index) => `${prefix} ${String(index + 1)}.`,
      ).join("\n\n");
    const lists = (prefix: string, count: number) =>
      Array.from(
        { length: count },
        (_, index) => `- ${prefix} ${String(index + 1)}`,
      ).join("\n");
    const capabilityGroups = Array.from(
      { length: README_PROFILE_CAPS.capabilityGroups + 1 },
      (_, groupIndex) =>
        `### Group ${String(groupIndex + 1)}\n${lists(
          `Capability ${String(groupIndex + 1)}.`,
          README_PROFILE_CAPS.capabilityFacts + 1,
        )}`,
    ).join("\n");
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Overview
First overview.

Ｆｉｒｓｔ overview.

${paragraphs("Overview", 5)}

## Audience
${lists("Audience", 5)}

## Problem
${lists("Problem", 5)}

## Use cases
${lists("Use case", 5)}

## Features
${capabilityGroups}

## Workflow
${lists("Step", 9)}

## Requirements
${lists("Requirement", 9)}

## Limitations
${lists("Limitation", 7)}

## Roadmap
${lists("Milestone", 7)}
`,
      ),
    ).readme;

    expect(result.overview).toHaveLength(README_PROFILE_CAPS.overview);
    expect(result.overview[0]?.text).toBe("First overview.");
    expect(result.audiences).toHaveLength(README_PROFILE_CAPS.audiences);
    expect(result.problems).toHaveLength(README_PROFILE_CAPS.problems);
    expect(result.useCases).toHaveLength(README_PROFILE_CAPS.useCases);
    expect(result.capabilityGroups).toHaveLength(
      README_PROFILE_CAPS.capabilityGroups,
    );
    expect(
      result.capabilityGroups.every(({ facts }) => facts.length === 6),
    ).toBe(true);
    expect(result.workflow).toHaveLength(README_PROFILE_CAPS.workflow);
    expect(result.dependencies).toHaveLength(README_PROFILE_CAPS.dependencies);
    expect(result.limitations).toHaveLength(README_PROFILE_CAPS.limitations);
    expect(result.maturity).toHaveLength(README_PROFILE_CAPS.maturity);
  });

  it("excludes NFKC purpose duplicates from every README profile section before caps", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Overview
Primary purpose.

Overview one.

Overview two.

Overview three.

Overview four.

## Audience
- Ｐｒｉｍａｒｙ purpose.
- Maintainers.

## Features
### Core
- Primary purpose.
- Safe capability.

## Workflow
1. Primary purpose.
2. Inspect evidence.
`,
      ),
      { scenarioExclusions: new Set(["Ｐｒｉｍａｒｙ purpose."]) },
    ).readme;

    expect(result.overview.map(({ text }) => text)).toEqual([
      "Overview one.",
      "Overview two.",
      "Overview three.",
      "Overview four.",
    ]);
    expect(result.audiences.map(({ text }) => text)).toEqual(["Maintainers."]);
    expect(result.capabilityGroups).toEqual([
      group("Core", ["Safe capability."]),
    ]);
    expect(result.workflow.map(({ text }) => text)).toEqual([
      "Inspect evidence.",
    ]);
  });

  it("deduplicates capability labels in model order before applying the group cap", () => {
    const groups = (labels: readonly string[]) =>
      labels
        .map((label) => `### ${label}\n- ${label} capability.`)
        .join("\n\n");
    const unique = [
      "Group 2",
      "Group 3",
      "Group 4",
      "Group 5",
      "Group 6",
      "Group 7",
    ];
    const extract = (labels: readonly string[]) =>
      extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Overview\n\nDuplicate label\n\n## Features\n\n${groups(labels)}`,
        ),
      ).readme.capabilityGroups;

    expect(
      extract(["Ｄｕｐｌｉｃａｔｅ label", ...unique]).map(
        ({ label }) => label,
      ),
    ).toEqual(unique);
    expect(
      extract(["Ｄｕｐｌｉｃａｔｅ label", ...unique].reverse()).map(
        ({ label }) => label,
      ),
    ).toEqual([...unique].reverse());
  });

  it("keeps category output deterministic when recognized section order is reversed", () => {
    const sections = [
      "## Overview\nA deterministic repository inspection application.",
      "## Audience\n- Maintainers",
      "## Problem\n- Public evidence is difficult to compare",
      "## Workflow\n1. Inspect evidence",
      "## Requirements\n- Node.js 24",
      "## Limitations\n- Runtime behavior is not observed",
      "## Roadmap\n- Stable evidence exports",
    ];
    const forward = extractReaderMarkdownEvidence(
      fetched("README.md", sections.join("\n\n")),
    ).readme;
    const reverse = extractReaderMarkdownEvidence(
      fetched("README.md", [...sections].reverse().join("\n\n")),
    ).readme;

    expect(reverse).toEqual(forward);
  });

  it.each([
    "<!-- hidden -->",
    "<details>hidden</details>",
    "[label](https://secret.invalid/path)",
    "https://secret.invalid/raw",
    "ｈｔｔｐｓ：／／secret.invalid／raw",
    "［label］（ｈｔｔｐｓ：／／secret.invalid／path）",
    `token=ghp_${"a".repeat(36)}`,
    "\u202Ehidden",
    "bad\uD800text",
  ])("rejects unsafe README profile evidence %s", (unsafe) => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Overview\n${unsafe}\n\n## Audience\n- ${unsafe}\n\n## Problem\n- ${unsafe}\n\n## Use cases\n- ${unsafe}\n\n## Features\n### Group\n- ${unsafe}\n\n## Workflow\n1. ${unsafe}\n\n## Requirements\n- ${unsafe}\n\n## Limitations\n- ${unsafe}\n\n## Roadmap\n- ${unsafe}`,
      ),
    );

    expect(result.readme).toEqual(emptyReadmeEvidence());
    expect(JSON.stringify(result.readme)).not.toContain("secret.invalid");
    expect(JSON.stringify(result.readme)).not.toContain("ghp_");
  });

  it("uses only an early descriptive paragraph as conservative overview fallback", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `# StoryForge

A local writing workspace that helps authors plan long-form fiction.

## Notes
- Independent authors
- Generate chapters
- Requires a model API
- Collaborative editing is experimental
`,
      ),
    ).readme;

    expect(result).toEqual({
      ...emptyReadmeEvidence(),
      overview: [
        fact(
          "A local writing workspace that helps authors plan long-form fiction.",
        ),
      ],
    });
  });

  it.each([
    ["badge", "[![Build](https://img.invalid/badge.svg)](https://ci.invalid)"],
    ["table of contents", "[Usage](#usage)"],
    ["navigation", "Home | Documentation"],
    ["release log", "v1.2.3 — Added faster exports"],
    ["slogan", "Write faster."],
    ["image", "![StoryForge](https://img.invalid/logo.svg)"],
    ["link definition", "[guide]: https://docs.invalid/guide"],
    ["command", "$ pnpm install"],
  ])("does not use %s as fallback orientation", (_label, candidate) => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", `# StoryForge\n\n${candidate}`),
    ).readme;

    expect(result).toEqual(emptyReadmeEvidence());
  });

  it("keeps semver and runtime requirements as prose without reserving the run command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Run

^20.19.0 || ^22.12.0 || >=24.0.0

Node.js >= 24

pnpm run dev
`,
      ),
    );

    expect(result.readme.dependencies).toEqual([
      fact("^20.19.0 || ^22.12.0 || >=24.0.0"),
      fact("Node.js >= 24"),
    ]);
    expect(result.commands).toMatchObject([
      { kind: "run", command: "pnpm run dev", disposition: "ready" },
    ]);
  });

  it("routes dependency installation out of a quick-start run slot before the actual startup command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `# Story Desk

## Quick start

Install the project dependencies, then start the local workspace.

\`\`\`sh
pnpm install
pnpm run dev
\`\`\`
`,
      ),
    );

    expect(
      result.commands.map(({ kind, command, disposition }) => ({
        kind,
        command,
        disposition,
      })),
    ).toEqual([
      { kind: "install", command: "pnpm install", disposition: "ready" },
      { kind: "run", command: "pnpm run dev", disposition: "ready" },
    ]);
  });

  it("keeps reviewed install evidence out of development and preserves a later develop command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `# Story Desk

## 二次开发

\`npm install && chmod 777 ./cache\`

\`pnpm run dev\`

## Run

\`npm start\`
`,
      ),
    );

    expect(
      result.commands.map(({ kind, command, disposition }) => ({
        kind,
        command,
        disposition,
      })),
    ).toEqual([
      {
        kind: "install",
        command: "npm install && chmod 777 ./cache",
        disposition: "review",
      },
      { kind: "run", command: "npm start", disposition: "ready" },
      { kind: "develop", command: "pnpm run dev", disposition: "ready" },
    ]);
  });

  it.each([
    ["npm --prefix ./web install", "npm start", "run"],
    ["pnpm --filter @scope/app install", "pnpm run dev", "run"],
    ["yarn --cwd ./web install", "yarn start", "run"],
    ["bun --cwd ./web install", "bun run dev", "develop"],
  ] as const)(
    "routes option-prefixed install command %s without consuming %s",
    (installCommand, startupCommand, startupKind) => {
      const heading = startupKind === "develop" ? "Development" : "Quick start";
      const result = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `# Local Workbench

## ${heading}

\`\`\`sh
${installCommand}
${startupCommand}
\`\`\`
`,
        ),
      );

      expect(
        result.commands.map(({ kind, command }) => ({ kind, command })),
      ).toEqual([
        { kind: "install", command: installCommand },
        { kind: startupKind, command: startupCommand },
      ]);
    },
  );

  it.each([
    ["pnpm -C ./web install", "pnpm run dev"],
    ["pnpm -F@scope/app install", "pnpm start"],
    ["npm -w web install", "npm start"],
    ["bun -C ./web install", "bun run dev"],
  ] as const)(
    "routes short-option install command %s before the real quick-start command",
    (installCommand, runCommand) => {
      const result = extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Quick start

\`${installCommand}\`

\`${runCommand}\`
`,
        ),
      );

      expect(
        result.commands.map(({ kind, command }) => ({ kind, command })),
      ).toEqual([
        { kind: "install", command: installCommand },
        { kind: "run", command: runCommand },
      ]);
    },
  );

  it.each([
    ["npm install && node server.js", "run"],
    ["node server.js && npm install", "run"],
    ["npm test && npm install", "test"],
    ["pnpm install && npm run build", "build"],
  ] as const)(
    "keeps mixed install command %s in its documented %s slot",
    (command, headingKind) => {
      const heading =
        headingKind === "test"
          ? "Test"
          : headingKind === "build"
            ? "Build"
            : "Quick start";
      const result = extractReaderMarkdownEvidence(
        fetched("README.md", `## ${heading}\n\n\`${command}\``),
      );

      expect(result.commands).toMatchObject([{ kind: headingKind, command }]);
    },
  );

  it.each([
    ["Quick start", "npm install && npm start", "run"],
    ["Development", "pnpm install; pnpm run dev", "develop"],
    ["Quick start", "yarn && yarn start", "run"],
  ] as const)(
    "preserves %s startup semantics in the mixed control list %s",
    (heading, command, expectedKind) => {
      const result = extractReaderMarkdownEvidence(
        fetched("README.md", `## ${heading}\n\n\`${command}\``),
      );

      expect(result.commands).toMatchObject([
        { kind: expectedKind, command, disposition: "ready" },
      ]);
    },
  );

  it("keeps quoted and escaped separators inside reviewed install evidence without hiding a later start", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Quick start

\`npm install "&&" npm start\`

\`npm install \\&\\& npm start\`

\`npm start\`
`,
      ),
    );

    expect(
      result.commands.map(({ kind, command }) => ({ kind, command })),
    ).toEqual([
      { kind: "install", command: 'npm install "&&" npm start' },
      { kind: "run", command: "npm start" },
    ]);
  });

  it("keeps dangerous option-prefixed install tails reviewed while preserving a later run command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Quick start

\`npm --prefix ./web install && chmod 777 ./cache\`

\`npm start\`
`,
      ),
    );

    expect(result.commands).toMatchObject([
      {
        kind: "install",
        command: "npm --prefix ./web install && chmod 777 ./cache",
        disposition: "review",
      },
      { kind: "run", command: "npm start", disposition: "ready" },
    ]);
  });

  it("keeps lowercase runtime requirements as dependencies before a later run command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Run

node >= 24
python 3.12
go 1.22
npm >= 10
pnpm >= 9
npm can be installed globally.

pnpm run dev
`,
      ),
    );

    expect(result.readme.dependencies).toEqual([
      fact("node >= 24"),
      fact("python 3.12"),
      fact("go 1.22"),
      fact("npm >= 10"),
      fact("pnpm >= 9"),
    ]);
    expect(result.commands).toMatchObject([
      { kind: "run", command: "pnpm run dev", disposition: "ready" },
    ]);
  });

  it("does not let non-command prose with dangerous text reserve a command kind", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Run

Don't install this globally.
This sentence && rm -rf ./generated
pnpm run dev
`,
      ),
    );

    expect(result.commands).toMatchObject([
      { kind: "run", command: "pnpm run dev", disposition: "ready" },
    ]);
  });

  it("does not let curl or wget prose reserve the install command", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation

curl support is optional.
wget downloads files for setup.
pnpm install
`,
      ),
    );

    expect(result.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
  });

  it("does not let a remote pipe to a non-shell sudo command reserve install", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation

curl https://x.invalid/file | sudo tee /tmp/file
pnpm install
`,
      ),
    );

    expect(result.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
  });

  it("uses actual sudo preserve-env grammar before reserving install", () => {
    const nonShell = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation

curl https://x.invalid/file | sudo --preserve-env FOO sh
pnpm install
`,
      ),
    );
    const shell = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation

curl https://x.invalid/install | sudo --preserve-env sh
`,
      ),
    );

    expect(nonShell.commands).toMatchObject([
      { kind: "install", command: "pnpm install", disposition: "ready" },
    ]);
    expect(shell.commands).toMatchObject([
      { kind: "install", disposition: "review" },
    ]);
  });

  it("treats sudo shell mode as a remote shell sink", () => {
    const result = extractReaderMarkdownEvidence(
      fetched(
        "README.md",
        `## Installation

curl https://x.invalid/install | sudo -s
pnpm install
`,
      ),
    );

    expect(result.commands).toMatchObject([
      {
        kind: "install",
        command: "curl https://x.invalid/install | sudo -s",
        disposition: "review",
      },
    ]);
  });

  it("keeps a dangerous documented command as review evidence rather than prose fallback", () => {
    const result = extractReaderMarkdownEvidence(
      fetched("README.md", "## Run\n\nnpm test || chmod 777 file"),
    );

    expect(result.commands).toMatchObject([
      { kind: "run", disposition: "review" },
    ]);
    expect(result.readme.dependencies).toEqual([]);
    expect(result.readme.overview).toEqual([]);
  });
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
      readme: {
        ...emptyReadmeEvidence(),
        useCases: [
          fact("Triage newcomer issues before publishing them."),
          fact("Review contributor instructions during release preparation."),
        ],
        limitations: [
          fact("Repository text stays in the browser and is never executed."),
        ],
      },
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
      readme: {
        ...emptyReadmeEvidence(),
        useCases: [fact("在采用项目前检查公开证据。", "README.zh-CN.md")],
        workflow: [
          fact("浏览器只读取固定提交中的有限文本。", "README.zh-CN.md"),
        ],
        limitations: [fact("仓库文本不会作为代码执行。", "README.zh-CN.md")],
      },
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
    const excluded = extractReaderMarkdownEvidence(readme, {
      scenarioExclusions: new Set(["Purpose one.", "Purpose two."]),
    });
    expect(excluded.scenarios.map(({ text }) => text)).toEqual([
      "Unique one.",
      "Unique two.",
      "Unique three.",
    ]);
    expect(excluded.readme.useCases.map(({ text }) => text)).toEqual([
      "Unique one.",
      "Unique two.",
      "Unique three.",
    ]);
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
    expect(JSON.stringify(result.readme)).not.toContain("setup note");
    expect(JSON.stringify(result.readme)).not.toContain("npm fake");
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

  it("handles a near-256 KiB rich README with bounded profile groups", () => {
    const prefix =
      "# Reader guide\n\nA repository analysis application for maintainers.\n\n";
    const block = `## Features
### Evidence map
- Inspect public evidence

## Workflow
1. Inspect a commit

## Requirements
- Node.js 24

## Limitations
- Runtime behavior is not observed

`;
    const blockBytes = new TextEncoder().encode(block).byteLength;
    const prefixBytes = new TextEncoder().encode(prefix).byteLength;
    const repetitions = Math.floor((255 * 1024 - prefixBytes) / blockBytes);
    const file = fetched("README.md", prefix + block.repeat(repetitions));
    const started = performance.now();
    const result = extractReaderMarkdownEvidence(file);

    expect(file.bytes).toBeGreaterThan(250 * 1024);
    expect(file.bytes).toBeLessThanOrEqual(255 * 1024);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.readme.capabilityGroups).toEqual([
      group("Evidence map", ["Inspect public evidence"]),
    ]);
    expect(result.readme.workflow).toEqual([fact("Inspect a commit")]);
    expect(result.readme.dependencies).toEqual([fact("Node.js 24")]);
    expect(result.readme.limitations).toEqual([
      fact("Runtime behavior is not observed"),
    ]);
  });

  it("handles 30,000 unique facts in one near-limit capability group linearly", () => {
    const candidates = Array.from(
      { length: 30_000 },
      (_, index) => `- x${index < 22_000 ? "zz" : "z"}${index.toString(36)}`,
    );
    const file = fetched(
      "README.md",
      `## Features\n\n### Massive group\n\n${candidates.join("\n")}`,
    );
    const started = performance.now();
    const result = extractReaderMarkdownEvidence(file);

    expect(file.bytes).toBeGreaterThan(254 * 1024);
    expect(file.bytes).toBeLessThanOrEqual(256 * 1024);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.readme.capabilityGroups).toEqual([]);
  });

  it("bounds 15,000 micro-groups with small output-related budgets", () => {
    const groups = Array.from({ length: 15_000 }, (_, index) => {
      const fact = index === 14_999 ? "unique" : "dup";
      return `### grp${index.toString(36)}\n- ${fact}`;
    });
    const file = fetched(
      "README.md",
      `## Features\n${groups.join("\n")}\n\n## Workflow\n- Inspect bounded evidence.`,
    );
    const started = performance.now();
    const result = extractReaderMarkdownEvidence(file);

    expect(file.bytes).toBeGreaterThan(247 * 1024);
    expect(file.bytes).toBeLessThanOrEqual(256 * 1024);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(READER_MARKDOWN_PENDING_CAPABILITY_LIMITS).toEqual({
      maxGroups: 128,
      maxFactsPerGroup: 64,
      maxFactsTotal: 8_192,
    });
    expect(result.readme.capabilityGroups).toEqual([]);
    expect(result.readme.workflow).toEqual([fact("Inspect bounded evidence.")]);
  });

  it("keeps exact capability budgets and fails closed on the next distinct candidate", () => {
    const groups = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `### Group ${String(index)}\n- Fact ${String(index)}`,
      ).join("\n");
    const facts = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `- Fact ${String(index)}`,
      ).join("\n");

    expect(
      extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Features\n${groups(READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxGroups)}`,
        ),
      ).readme.capabilityGroups.map(({ label }) => label),
    ).toEqual(
      Array.from({ length: 6 }, (_, index) => `Group ${String(index)}`),
    );
    expect(
      extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Features\n${groups(READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxGroups + 1)}`,
        ),
      ).readme.capabilityGroups,
    ).toEqual([]);
    expect(
      extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Features\n### One group\n${facts(READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxFactsPerGroup)}`,
        ),
      ).readme.capabilityGroups,
    ).toEqual([
      group(
        "One group",
        Array.from({ length: 6 }, (_, index) => `Fact ${String(index)}`),
      ),
    ]);
    expect(
      extractReaderMarkdownEvidence(
        fetched(
          "README.md",
          `## Features\n### One group\n${facts(READER_MARKDOWN_PENDING_CAPABILITY_LIMITS.maxFactsPerGroup + 1)}`,
        ),
      ).readme.capabilityGroups,
    ).toEqual([]);
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
