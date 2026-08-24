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
  "docs/deep-analysis-deployment.md",
  "Dockerfile",
  ".dockerignore",
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
    "More than 180 and up to 365 days: 1",
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

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ");
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

  it("publishes the bilingual README-first evidence-dossier contract", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");

    for (const statement of [
      "eight-region README-first evidence dossier",
      "Project orientation",
      "Community and maintenance facts",
      "Reader takeaways",
      "What the README says",
      "Core capabilities",
      "up to nine capability areas",
      "Documented workflow",
      "README claims and repository observations",
      "RepoScope commentary",
      "Worth noting",
      "Verify before relying on it",
      "What this means in practice",
      "`subscribers_count` is labeled **Watchers**",
      "`open_issues_count` includes both issues and pull requests",
      "Popularity is not proof of quality or safety.",
      "does not use AI",
      "partial README interpretation",
      "Technical evidence and methodology",
      "closed by default",
    ]) {
      expect(english).toContain(statement);
    }
    for (const statement of [
      "由八个区域组成的 README 优先证据档案",
      "项目定位",
      "社区与维护事实",
      "读者结论",
      "README 如何介绍项目",
      "核心能力",
      "最多九个能力分组",
      "README 中的工作流程",
      "README 声明与仓库观察",
      "RepoScope 解读",
      "值得注意",
      "依赖前需要核实",
      "对实际使用意味着什么",
      "`subscribers_count` 标记为 **Watchers**",
      "`open_issues_count` 同时包含 Issue 与 PR",
      "流行度不能证明项目质量或安全性。",
      "不使用 AI",
      "README 解读会标记为部分可用",
      "技术证据与方法",
      "默认关闭",
    ]) {
      expect(chinese).toContain(statement);
    }
    expect(english).toContain(
      "**Project orientation** presents the public repository description and bounded project brief",
    );
    expect(english).toContain(
      "**What the README says** organizes bounded README overview, audience, problem, use-case",
    );
    expect(chinese).toContain("**项目定位**：展示公开仓库说明和有界的项目简介");
    expect(chinese).toContain(
      "**README 如何介绍项目**：按原始语言组织 README 的概览、目标读者、待解决问题、使用场景",
    );
    expect(chinese).not.toContain("依赖前请核实");
    expect(chinese).not.toContain("这在实际中意味着什么");
  });

  it("documents bounded README interpretation without changing score or assurance claims", () => {
    const methodology = read("docs/methodology.md");

    for (const statement of [
      "README interpretation is deterministic and does not use AI.",
      "The dossier presents eight regions in this order: project orientation; community and maintenance facts; reader takeaways",
      "`subscribers_count` is the GitHub source for **Watchers**",
      "GitHub `open_issues_count` combines issues and pull requests",
      "This signal records evidence existence, not license compatibility",
      "Popularity is attention evidence, not quality or safety evidence.",
      "overview 4; audiences 4; problems 4; use cases 4; capability groups 9 with 6 facts each; workflow 8; dependencies 8; limitations 6; maturity 6",
      "**Worth noting**",
      "**Verify before relying on it**",
      "**What this means in practice**",
      "preferred README is missing",
      "preferred README was identified but not fetched",
      "does not change dimension scores, rule applicability, thresholds, weights, confidence, or findings",
      "does not prove suitability or safety",
    ]) {
      expect(methodology).toContain(statement);
    }
  });

  it("documents the real README-report assembly and rendering order", () => {
    const architecture = read("docs/architecture.md");
    const pipeline =
      "GitHub metadata and immutable tree evidence → preferred README selection and a single bounded safe scan → README interpretation and broad repository corroboration → unchanged scoring over a separate input → combined strict report guard → snapshot-validated session cache → React README-first UI and closed technical appendix";

    expect(architecture).toContain(pipeline);

    for (const statement of [
      "general evidence and the project brief are derived",
      "deep analyzers finish and coverage is finalized",
      "the bounded README-first reader report is derived",
      "the isolated scoring input is scored without community popularity counts or reader evidence",
      "the complete report is strictly cloned and validated",
      "the README evidence dossier renders before the decision summary and six reader chapters",
      "the eight-region README evidence dossier",
      "src/components/readme-interpretation.tsx",
    ]) {
      expect(architecture).toContain(statement);
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
      "Added a deterministic, evidence-linked README-first evidence dossier with seven ordered interpretation regions, followed by the project decision summary and six human reader chapters; a closed technical appendix keeps full evidence and methodology.",
    );
    expect(changelog).not.toContain(
      "decision-first reader report covering purpose",
    );
    expect(changelog).toContain("closed technical appendix");
    expect(changelog).toContain("immutable source links");
    const dossierEntry = changelog
      .split("\n")
      .find((line) => line.includes("README-first evidence dossier"));
    expect(dossierEntry).toBeDefined();
    expect(dossierEntry ?? "").not.toMatch(
      /AI|security|scor|ruleset|threshold|weight/iu,
    );
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

  it("validates the optional server without changing the Pages artifact", () => {
    const packageManifest = JSON.parse(read("package.json")) as {
      scripts?: Record<string, unknown>;
    };
    const check = packageManifest.scripts?.check;
    const ci = read(".github/workflows/ci.yml");
    const pages = read(".github/workflows/pages.yml");

    expect(check).toEqual(expect.any(String));
    expect(check).toContain("pnpm test:server");
    expect(check).toContain("pnpm typecheck:server");
    expect(ci).toContain("run: pnpm test:server");
    expect(pages).toContain("run: pnpm test:server");
    expect(ci).toContain(
      "REPOSCOPE_API_ORIGIN: ${{ vars.REPOSCOPE_API_ORIGIN }}",
    );
    expect(
      pages.match(
        /REPOSCOPE_API_ORIGIN: \$\{\{ vars\.REPOSCOPE_API_ORIGIN \}\}/gu,
      ),
    ).toHaveLength(2);
    expect(pages).toMatch(
      /uses: actions\/upload-pages-artifact@[^\n]+\n\s+with:\n\s+path: dist/u,
    );
    expect(pages).not.toMatch(/path: server-dist/u);
  });

  it("documents both static and optional expert modes without hiding data flow", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");

    for (const [englishStatement, chineseStatement] of [
      [
        "The deterministic static mode requires no login",
        "确定性静态模式不需要登录",
      ],
      [
        "Optional expert mode adds a TypeScript backend",
        "可选专家模式会增加 TypeScript 后端",
      ],
      ["explicit first-use consent", "首次使用前必须明确同意"],
      [
        "GitHub OAuth App with no requested scopes",
        "不申请任何 scope 的 RepoScope GitHub OAuth App",
      ],
      [
        "their own GitHub Copilot allowance",
        "访问者自己的 GitHub Copilot 额度",
      ],
      ["does not use GitHub Models", "不使用 GitHub Models"],
      [
        "Repository code and commands remain untrusted text and are never executed",
        "仓库代码和命令始终是不可信文本，绝不会被执行",
      ],
      ["never removes the deterministic report", "确定性报告仍会保留"],
      ["up to 30 days", "最多缓存 30 天"],
      ["up to 24 hours", "最多缓存 24 小时"],
      ["model transcripts, prompts, tokens", "模型会话记录、提示词、令牌"],
    ] as const) {
      expect(english, englishStatement).toContain(englishStatement);
      expect(chinese, chineseStatement).toContain(chineseStatement);
    }
  });

  it("ships a least-privilege optional-service deployment contract", () => {
    const dockerfile = read("Dockerfile");
    const ignored = read(".dockerignore");
    const deployment = read("docs/deep-analysis-deployment.md");
    const deploymentProse = compactWhitespace(deployment);

    expect(dockerfile).toContain("node:24.19.0-bookworm-slim");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile");
    expect(dockerfile).toContain("USER reposcope:reposcope");
    expect(dockerfile).toContain('VOLUME ["/data"]');
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain('CMD ["node", "server-dist/server/index.js"]');
    for (const path of [
      ".env",
      ".env.*",
      ".git",
      "node_modules",
      "coverage",
      "e2e",
    ]) {
      expect(ignored).toContain(path);
    }

    for (const variable of [
      "NODE_ENV",
      "REPOSCOPE_FRONTEND_URL",
      "REPOSCOPE_API_ORIGIN",
      "REPOSCOPE_GITHUB_CLIENT_ID",
      "REPOSCOPE_GITHUB_CLIENT_SECRET",
      "REPOSCOPE_GITHUB_CALLBACK_URL",
      "REPOSCOPE_HOST",
      "REPOSCOPE_PORT",
      "REPOSCOPE_CACHE_PATH",
      "REPOSCOPE_BASE_PATH",
    ]) {
      expect(deployment, variable).toContain(variable);
    }
    for (const boundary of [
      "no requested OAuth scopes",
      "does not request private-repository access",
      "same-site custom-domain pair",
      "/api/v1/auth/callback",
      "GitHub Models is not used",
      "never run",
      "only in an in-memory",
      "Raw README bodies",
      "rotate the client secret",
      "external deployment operations",
      "expert deployment remains blocked",
    ]) {
      expect(deploymentProse, boundary).toContain(boundary);
    }
    expect(deployment).not.toMatch(/gho_[A-Za-z0-9_]{20,}/u);
    expect(deployment).not.toMatch(/github_pat_[A-Za-z0-9_]{20,}/u);
  });

  it("documents the optional expert trust boundary and quality gate", () => {
    const architecture = read("docs/architecture.md");
    const architectureProse = compactWhitespace(architecture);
    const security = read("SECURITY.md");
    const contributing = read("CONTRIBUTING.md");
    const changelog = read("CHANGELOG.md");
    const pullRequest = read(".github/PULL_REQUEST_TEMPLATE.md");

    for (const statement of [
      "three parallel zero-tool Copilot specialist sessions",
      "one zero-tool skeptic session",
      "one zero-tool editor session",
      "one active run",
      "five starts per rolling hour",
      "30-day narrative cache key",
      "24-hour alternative cache",
      "Current Stars, Watch, Forks",
      "GitHub Models itself is not used",
      "provider's model behavior",
      "dated passing two-reviewer quality scorecard",
    ]) {
      expect(architectureProse, statement).toContain(statement);
    }
    expect(security).toContain("OAuth state or CSRF bypass");
    expect(security).toContain("prompt-injection acceptance");
    expect(contributing).toContain("pnpm check:deep-analysis-eval");
    expect(contributing).toContain("dated passing two-reviewer scorecard");
    expect(changelog).toContain("optional GitHub-authorized expert briefing");
    expect(pullRequest).toContain("zero-tool/no-plugin Copilot sessions");
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
    expect(methodology).toContain("more than 180 and up to 365 days");
    expect(methodology).toContain("超过 180 日且不超过 365 日");
    expect(methodology).toContain("more than 365 days");
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
      "coverage and static analysis complete before the non-scoring reader report is derived",
    );
    expect(architecture).toContain(
      "reader report remains outside the unchanged scoring inputs",
    );
    expect(architecture).toContain(
      "scoring then runs from those unchanged inputs",
    );
    expect(architecture).toContain(
      "strictly validated before it reaches the cache or UI",
    );
    expect(architecture).toContain("closed technical appendix");
  });

  it("records the README-first UI without claiming a scoring change", () => {
    const changelog = read("CHANGELOG.md");
    const dossierEntry = changelog
      .split("\n")
      .find((line) => line.includes("README-first evidence dossier"));

    expect(dossierEntry).toBeDefined();
    expect(dossierEntry ?? "").toContain("closed technical appendix");
    expect(dossierEntry ?? "").not.toMatch(/ruleset|scor|threshold|weight/iu);
  });

  it("routes vulnerability reports privately", () => {
    expect(read("SECURITY.md")).toMatch(/privately|private report|私密/iu);
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toContain(
      "https://github.com/Thworry/reposcope/security/advisories/new",
    );
  });
});
