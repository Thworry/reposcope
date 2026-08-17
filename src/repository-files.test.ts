// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DIMENSION_WEIGHTS,
  RULE_IDS,
  RULESET_VERSION,
  type RuleId,
} from "./features/rules/rules";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "CHANGELOG.md",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "SUPPORT.md",
  "GOVERNANCE.md",
  "docs/methodology.md",
  "docs/architecture.md",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
] as const;

const RULE_DOCUMENTATION = {
  "documentation.readme": ["Preferred README exists", "3", "—"],
  "documentation.installation": [
    "README has an installation/setup heading and at least one command block",
    "3",
    "Heading without command block: 1",
  ],
  "documentation.usage": [
    "README has a usage/run heading and a command or concrete example",
    "3",
    "Heading without command/example: 1",
  ],
  "documentation.contributing": ["Contribution guide exists", "2", "—"],
  "documentation.license": [
    "Recognized license file exists",
    "2",
    "Repository API license metadata only: 1",
  ],
  "documentation.architecture": [
    "Architecture, code map, or explicit structure explanation exists",
    "2",
    "README names at least three top-level source areas: 1",
  ],
  "operability.manifest": [
    "Recognized package/build manifest exists",
    "4",
    "—",
  ],
  "operability.entry-point": [
    "Recognized executable entry point or application/library export is identifiable",
    "4",
    "Conventional-path entry point only: 2",
  ],
  "operability.run-build": [
    "Manifest or documented command provides both run and build evidence",
    "4",
    "Only run or build is evidenced: 2",
  ],
  "operability.example": [
    "Example, demo, sample, or concrete API usage exists",
    "3",
    "Prose-only usage description: 1",
  ],
  "operability.error-handling": [
    "Error-handling constructs appear in at least 5% of parsed non-test functions",
    "2",
    "Present below 5%: 1",
  ],
  "operability.version-history": [
    "Changelog/history/release-notes file has a version heading",
    "2",
    "Non-empty valid manifest version only: 1",
  ],
  "operability.configuration": [
    "Environment/config example or explicit configuration section exists",
    "1",
    "—",
  ],
  "readability.median-function-length": [
    "Median non-test function length ≤ 40 logical lines",
    "4",
    "41–60: 2",
  ],
  "readability.p90-function-length": [
    "90th-percentile non-test function length ≤ 80",
    "4",
    "81–120: 2",
  ],
  "readability.large-file-ratio": [
    "Files over 500 logical lines are ≤ 10% of parsed source files",
    "4",
    ">10% through 20%: 2",
  ],
  "readability.median-nesting": [
    "Median function nesting depth ≤ 3",
    "3",
    "4: 1",
  ],
  "readability.ambiguous-identifiers": [
    "Ambiguous short identifiers are ≤ 10% of identifier occurrences",
    "3",
    ">10% through 20%: 1",
  ],
  "readability.documented-exports": [
    "At least 20% of exported/public declarations are documented adjacently",
    "2",
    "10% through 19.99%: 1",
  ],
  "complexity.median-cyclomatic": [
    "Median cyclomatic complexity ≤ 5",
    "4",
    "6–8: 2",
  ],
  "complexity.p90-cyclomatic": [
    "90th-percentile cyclomatic complexity ≤ 15",
    "5",
    "16–25: 2",
  ],
  "complexity.max-nesting": [
    "Maximum function nesting depth ≤ 5",
    "3",
    "6–7: 1",
  ],
  "complexity.very-large-files": [
    "No parsed source file exceeds 1,000 logical lines",
    "3",
    "At most 2% exceed it: 1",
  ],
  "complexity.duplication": [
    "Approximate normalized-token duplication ≤ 5%",
    "3",
    ">5% through 10%: 1",
  ],
  "complexity.circular-imports": [
    "No resolvable internal circular import",
    "2",
    "One two-file strongly connected component: 1",
  ],
  "testing.test-files": [
    "Recognized test files exist",
    "4",
    "Test configuration only: 1",
  ],
  "testing.test-source-ratio": [
    "Test-file to supported-source-file ratio ≥ 0.25",
    "3",
    "0.10 through 0.2499: 1",
  ],
  "testing.ci": ["Recognized CI workflow/configuration exists", "3", "—"],
  "testing.test-command": [
    "Recognized test command exists",
    "2",
    "README-only command: 1",
  ],
  "testing.static-check": [
    "Recognized lint, type-check, or static-check command exists",
    "2",
    "README-only command: 1",
  ],
  "testing.coverage": [
    "Coverage configuration or coverage command exists",
    "1",
    "—",
  ],
  "maintenance.activity": [
    "Not archived and `pushed_at` is within 180 exact UTC days",
    "2",
    "181–365 days: 1",
  ],
  "maintenance.lockfile": ["Recognized dependency lockfile exists", "2", "—"],
  "maintenance.dependency-updates": [
    "Dependabot or Renovate configuration exists",
    "1",
    "—",
  ],
  "maintenance.templates": ["Issue or pull-request templates exist", "1", "—"],
  "maintenance.security": ["Security policy exists", "1", "—"],
  "maintenance.code-of-conduct": ["Code of conduct exists", "1", "—"],
  "maintenance.version-history": [
    "Version-history file has a version heading",
    "1",
    "—",
  ],
  "maintenance.generated-directories": [
    "No committed dependency/build/cache directory appears in the tree",
    "1",
    "Exactly one such directory: 0",
  ],
} as const satisfies Record<RuleId, readonly [string, string, string]>;

const EXACT_CSP =
  "default-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

function read(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function documentedRuleRows(markdown: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();

  for (const line of markdown.split("\n")) {
    const match = /^\| `(?<id>[^`]+)`\s*\|(?<rest>.*)\|$/u.exec(line);
    if (match?.groups?.id === undefined || match.groups.rest === undefined) {
      continue;
    }
    rows.set(
      match.groups.id,
      match.groups.rest.split("|").map((cell) => cell.trim()),
    );
  }

  return rows;
}

describe("open-source repository contract", () => {
  it("ships every required repository file", () => {
    for (const path of REQUIRED_FILES) {
      expect(existsSync(resolve(projectRoot, path)), path).toBe(true);
    }
  });

  it("keeps the English and Chinese READMEs reciprocal and complete", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");

    expect(english).toContain("README.zh-CN.md");
    expect(chinese).toContain("README.md");

    for (const heading of [
      "Usage",
      "Limits",
      "Privacy",
      "Development",
      "Deployment",
      "License",
    ]) {
      expect(english).toContain(`## ${heading}`);
    }

    for (const heading of ["使用", "限制", "隐私", "开发", "部署", "许可证"]) {
      expect(chinese).toContain(`## ${heading}`);
    }

    const sharedLimits = ["200", "10 MiB", "256 KiB", "15", "90"];
    for (const value of sharedLimits) {
      expect(english).toContain(value);
      expect(chinese).toContain(value);
    }

    for (const statement of [
      "no login",
      "GitHub token",
      "backend",
      "AI service",
      "never executes",
      "not persisted",
    ]) {
      expect(english).toContain(statement);
    }
    for (const statement of [
      "不需要登录",
      "GitHub 令牌",
      "后端",
      "AI 服务",
      "不会执行",
      "不会被持久化",
    ]) {
      expect(chinese).toContain(statement);
    }

    for (const [englishHeading, chineseHeading] of [
      ["## Install and run locally", "## 安装并在本地运行"],
      ["## Example report walkthrough", "## 报告示例解读"],
    ] as const) {
      expect(english).toContain(englishHeading);
      expect(chinese).toContain(chineseHeading);
    }

    for (const value of [
      "Node.js 24.x",
      "pnpm 11.16.0",
      "pnpm install --frozen-lockfile",
      "pnpm dev",
      "http://localhost:5173/",
    ]) {
      expect(english).toContain(value);
      expect(chinese).toContain(value);
    }

    for (const [englishStatement, chineseStatement] of [
      ["needs no installation", "无需安装"],
      ["local-only", "仅供本地使用"],
      ["must not be deployed", "不得将它作为公开应用部署"],
      ["non-normative example", "非规范性示例"],
      ["six dimensions", "六个维度"],
      ["scope and failures", "范围与失败项"],
      ["improvements list", "改进项列表"],
      ["blob/<commit>/path#Lx-Ly", "blob/<commit>/path#Lx-Ly"],
      ["public commit", "公开提交"],
      ["does not execute", "不会执行"],
      ["authenticate its behavior", "认证项目行为"],
      ["certify its correctness", "证明项目正确"],
      ["reader report", "读者报告"],
      [
        "Purpose evidence comes from the public GitHub description and preferred README.",
        "用途证据来自公开 GitHub 仓库说明和首选 README。",
      ],
      [
        "Project-kind evidence comes from bounded structural checks of manifests, topics, and the repository tree.",
        "项目类型证据来自对清单、主题和仓库文件树的有界结构检查。",
      ],
      ["source language", "源语言"],
      ["does not use an AI service", "不使用 AI 服务"],
      ["not personalized advice", "不是个性化建议"],
    ] as const) {
      expect(english).toContain(englishStatement);
      expect(chinese).toContain(chineseStatement);
    }
  });

  it("publishes the bilingual decision-first reader-report contract", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");

    for (const statement of [
      "Completed reports lead with project purpose and practical scenarios",
      "evidence of reliability",
      "core principles and code architecture",
      "install, run, test, and extend",
      "security and privacy risks and unknowns",
      "activity, maintenance, and alternatives",
      "Technical evidence and methodology",
      "closed by default",
    ]) {
      expect(english).toContain(statement);
    }
    for (const statement of [
      "完成的报告会先说明项目用途与实际场景",
      "可靠性证据",
      "核心原理与代码架构",
      "安装、运行、测试和二次开发",
      "安全与隐私风险及未知项",
      "活跃度、维护状况与替代方案",
      "技术证据与方法",
      "默认关闭",
    ]) {
      expect(chinese).toContain(statement);
    }
  });

  it("publishes the current version history", () => {
    const changelog = read("CHANGELOG.md");
    const packageManifest = JSON.parse(read("package.json")) as {
      version?: unknown;
    };

    expect(changelog).toMatch(/^## \[Unreleased\]$/mu);
    expect(changelog).toMatch(/^## 0\.1\.1 - 2026-08-13$/mu);
    expect(changelog).toMatch(/^## 0\.1\.0 - 2026-08-12$/mu);
    expect(changelog).toContain(
      "Added a deterministic, evidence-linked decision-first reader report",
    );
    expect(changelog).toContain("closed technical appendix");
    expect(changelog).toContain("immutable source links");
    expect(packageManifest.version).toBe("0.1.1");
  });

  it("isolates instrumented coverage from cross-suite CPU contention", () => {
    const packageManifest = JSON.parse(read("package.json")) as {
      scripts?: Record<string, unknown>;
    };

    expect(packageManifest.scripts?.["test:coverage"]).toBe(
      "vitest run --coverage --maxWorkers=1 --no-file-parallelism",
    );
  });

  it("documents public tree and dimension contracts without overclaiming", () => {
    const model = read("src/features/analysis/model.ts");

    for (const contract of [
      "Only shape-valid symlinks and submodules become skip evidence.",
      "Malformed or duplicate tree entries fail closed by throwing.",
      "One quality dimension's ordered rules and earned/available point totals.",
      "`score` is `null` when no rule contributes applicable points.",
    ] as const) {
      expect(model).toContain(contract);
    }
  });

  it("publishes every ruleset signal and reproducibility boundary", () => {
    const methodology = read("docs/methodology.md");

    expect(methodology).toContain(`ruleset \`${RULESET_VERSION}\``);
    for (const [dimension, weight] of [
      ["Documentation and onboarding", DIMENSION_WEIGHTS.documentation],
      ["Operability evidence", DIMENSION_WEIGHTS.operability],
      ["Code readability", DIMENSION_WEIGHTS.readability],
      ["Complexity and structure", DIMENSION_WEIGHTS.complexity],
      ["Testing and automation", DIMENSION_WEIGHTS.testing],
      ["Maintenance health", DIMENSION_WEIGHTS.maintenance],
    ] as const) {
      expect(methodology).toMatch(
        new RegExp(`\\| ${dimension} +\\| +${String(weight)} \\|`, "u"),
      );
    }
    expect(methodology).toContain("0.25 × treeCompleteness");
    expect(methodology).toContain("0.35 × eligibleByteCoverage");
    expect(methodology).toContain("0.40 × supportedParserCoverage");
    expect(methodology).toContain("at least five");
    expect(methodology).toContain("2,000");
    expect(methodology).toContain("not-applicable");
    expect(methodology).toContain("precedence");

    const rows = documentedRuleRows(methodology);
    expect([...rows.keys()]).toEqual([...RULE_IDS]);
    expect(Object.keys(RULE_DOCUMENTATION)).toEqual([...RULE_IDS]);
    for (const ruleId of RULE_IDS) {
      expect(rows.get(ruleId), ruleId).toEqual(RULE_DOCUMENTATION[ruleId]);
    }

    for (const prerequisite of [
      "at least one parsed non-test function",
      "positive identifier-occurrence denominator",
      "positive exported/public-declaration denominator",
      "positive eligible-token denominator",
      "positive supported-source-file denominator",
      "A zero rule-level denominator makes that rule `not-applicable`",
      "Hostile or invalid numeric evidence takes precedence and yields `failed`",
    ]) {
      expect(methodology).toContain(prerequisite);
    }
    expect(methodology).toContain(
      "Two or more such directories: `failed` with 0 points.",
    );
  });

  it("documents the non-scoring reader judgement and exact activity boundary", () => {
    const methodology = read("docs/methodology.md");

    for (const status of [
      "Sufficient evidence to continue evaluation",
      "Key gaps require verification before use",
      "Public evidence is insufficient to judge",
    ]) {
      expect(methodology).toContain(status);
    }
    expect(methodology).toContain("180 exact UTC days");
    expect(methodology).toContain("non-scoring");
    expect(methodology).toContain("does not prove suitability or safety");
  });

  it("documents the fixed architecture, limits, cache, CSP, and threats", () => {
    const architecture = read("docs/architecture.md");

    for (const needle of [
      "GET https://api.github.com/repos/{owner}/{repo}",
      "GET https://api.github.com/repos/{owner}/{repo}/commits/{defaultBranch}",
      "GET https://api.github.com/repos/{owner}/{repo}/git/trees/{treeSha}?recursive=1",
      "X-GitHub-Api-Version: 2026-03-10",
      "Accept: application/vnd.github+json",
      "https://raw.githubusercontent.com",
      "200 selected files",
      "200 eligible raw-text fetch attempts",
      "10 MiB of successfully decoded eligible text",
      "256 KiB for any one eligible fetched text file",
      "six concurrent",
      "15-second",
      "90-second",
      "sessionStorage",
      "15-minute",
      "2 MiB",
      "Content Security Policy",
      EXACT_CSP,
      "must not contain `unsafe-inline` or `unsafe-eval`",
      "exactly three connection destinations",
      "same-origin hosting origin, `https://api.github.com`, and `https://raw.githubusercontent.com`",
      "Threat boundaries",
      "Repository author",
      "GitHub and network",
      "Visitor device",
      "Publisher and hosting",
      "Inspected-project assurance",
      "omitted `https://` protocol",
      "terminal `.git`",
      "one trailing slash",
      "explicit `:443`",
      "canonical HTTPS `github.com/{owner}/{repository}`",
      "other explicit ports",
      "additional path segments",
    ]) {
      expect(architecture, needle).toContain(needle);
    }

    for (const modulePath of [
      "python/model.ts",
      "python/syntax.ts",
      "python/function-metrics.ts",
      "python/bindings.ts",
      "python/binding-flow.ts",
      "python/evidence.ts",
      "python/analyze-file.ts",
      "cross-file/model.ts",
      "cross-file/path-order.ts",
      "cross-file/duplicate-index.ts",
      "cross-file/duplicate-candidates.ts",
      "cross-file/duplicate-selection.ts",
      "cross-file/import-resolution.ts",
      "cross-file/scc.ts",
    ] as const) {
      expect(architecture).toContain(modulePath);
    }
    for (const dependencyArrow of [
      "model.ts → syntax.ts",
      "bindings.ts + evidence.ts + function-metrics.ts + model.ts + syntax.ts → binding-flow.ts",
      "binding-flow.ts + evidence.ts + function-metrics.ts → analyze-file.ts → python.ts",
      "model.ts → duplicate-index.ts",
      "duplicate-index.ts + model.ts + path-order.ts → duplicate-candidates.ts",
      "duplicate-candidates.ts + duplicate-index.ts + model.ts + path-order.ts → duplicate-selection.ts",
      "model.ts + path-order.ts → import-resolution.ts",
      "path-order.ts → scc.ts",
      "duplicate-selection.ts + import-resolution.ts + scc.ts → cross-file.ts",
    ] as const) {
      expect(architecture).toContain(dependencyArrow);
    }
  });

  it("documents the reader analyzer, strict boundary, cache, and UI appendix", () => {
    const architecture = read("docs/architecture.md");

    for (const modulePath of [
      "src/features/analyzers/reader-report.ts",
      "src/features/analyzers/reader-report/markdown.ts",
      "src/features/analyzers/reader-report/commands.ts",
      "src/features/worker/analysis.worker.ts",
      "src/features/analysis/guards.ts",
      "src/features/cache/report-cache.ts",
      "src/components/reader-report.tsx",
      "src/components/technical-appendix.tsx",
    ]) {
      expect(architecture).toContain(modulePath);
    }
    expect(architecture).toContain(
      "scoring completes before the non-scoring reader report is derived",
    );
    expect(architecture).toContain(
      "strictly validated before it reaches the cache or UI",
    );
    expect(architecture).toContain("closed technical appendix");
  });

  it("records the decision-first UI without claiming a scoring change", () => {
    const changelog = read("CHANGELOG.md");
    const decisionEntry = changelog
      .split("\n")
      .find((line) => line.includes("decision-first reader report"));

    expect(decisionEntry).toBeDefined();
    expect(decisionEntry ?? "").toContain("closed technical appendix");
    expect(decisionEntry ?? "").not.toMatch(/ruleset|scor|threshold|weight/iu);
  });

  it("routes vulnerability reports privately", () => {
    expect(read("SECURITY.md")).toMatch(/privately|private report|私密/iu);
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toContain(
      "https://github.com/Thworry/reposcope/security/advisories/new",
    );
  });
});
