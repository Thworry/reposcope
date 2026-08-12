// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
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

const RULE_IDS = [
  "documentation.readme",
  "documentation.installation",
  "documentation.usage",
  "documentation.contributing",
  "documentation.license",
  "documentation.architecture",
  "operability.manifest",
  "operability.entry-point",
  "operability.run-build",
  "operability.example",
  "operability.error-handling",
  "operability.version-history",
  "operability.configuration",
  "readability.median-function-length",
  "readability.p90-function-length",
  "readability.large-file-ratio",
  "readability.median-nesting",
  "readability.ambiguous-identifiers",
  "readability.documented-exports",
  "complexity.median-cyclomatic",
  "complexity.p90-cyclomatic",
  "complexity.max-nesting",
  "complexity.very-large-files",
  "complexity.duplication",
  "complexity.circular-imports",
  "testing.test-files",
  "testing.test-source-ratio",
  "testing.ci",
  "testing.test-command",
  "testing.static-check",
  "testing.coverage",
  "maintenance.activity",
  "maintenance.lockfile",
  "maintenance.dependency-updates",
  "maintenance.templates",
  "maintenance.security",
  "maintenance.code-of-conduct",
  "maintenance.version-history",
  "maintenance.generated-directories",
] as const;

function read(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
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
  });

  it("publishes every ruleset signal and reproducibility boundary", () => {
    const methodology = read("docs/methodology.md");

    expect(methodology).toContain("ruleset `1.0.0`");
    for (const [dimension, weight] of [
      ["Documentation and onboarding", 15],
      ["Operability evidence", 20],
      ["Code readability", 20],
      ["Complexity and structure", 20],
      ["Testing and automation", 15],
      ["Maintenance health", 10],
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

    for (const ruleId of RULE_IDS) {
      expect(methodology, ruleId).toContain(`\`${ruleId}\``);
    }
  });

  it("documents the fixed architecture, limits, cache, CSP, and threats", () => {
    const architecture = read("docs/architecture.md");

    for (const needle of [
      "https://api.github.com/repos/{owner}/{repo}",
      "commits/{defaultBranch}",
      "git/trees/{treeSha}?recursive=1",
      "https://raw.githubusercontent.com",
      "200 selected files",
      "10 MiB",
      "256 KiB",
      "six concurrent",
      "15-second",
      "90-second",
      "sessionStorage",
      "15-minute",
      "Content Security Policy",
      "unsafe-inline",
      "unsafe-eval",
      "Threat boundaries",
    ]) {
      expect(architecture, needle).toContain(needle);
    }
  });

  it("routes vulnerability reports privately", () => {
    expect(read("SECURITY.md")).toMatch(/privately|private report|私密/iu);
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toContain(
      "https://github.com/Thworry/reposcope/security/advisories/new",
    );
  });
});
