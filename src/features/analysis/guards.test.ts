import { describe, expect, it } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "../../test/fixtures/metrics";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import type { AnalysisReport } from "./model";
import { isAnalysisReport } from "./guards";

export function validReport(): AnalysisReport {
  const analyzedAt = "2026-08-11T12:00:00.000Z";
  const scored = scoreProject({
    repository: perfectRepository,
    general: perfectGeneralMetrics,
    language: perfectLanguageAnalysis,
    duplicates: perfectDuplicates,
    cycles: perfectCycles,
    coverage: perfectCoverage,
    analyzedAt,
  });
  const findings = buildFindings(scored);

  return {
    rulesetVersion: "1.0.0",
    repository: {
      owner: "example",
      repo: "project",
      fullName: "example/project",
      url: "https://github.com/example/project",
      description: "fixture",
      defaultBranch: "main",
      archived: false,
      pushedAt: "2026-08-01T12:00:00.000Z",
      commitSha: "a".repeat(40),
      analyzedAt,
    },
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

function cloneReport(): AnalysisReport {
  return structuredClone(validReport());
}

describe("isAnalysisReport", () => {
  it("accepts a complete internally consistent report", () => {
    expect(isAnalysisReport(validReport())).toBe(true);
  });

  it.each([
    [
      "wrong ruleset",
      (report: AnalysisReport) =>
        Object.assign(report, { rulesetVersion: "2.0.0" }),
    ],
    ["missing dimension", (report: AnalysisReport) => report.dimensions.pop()],
    [
      "non-finite score",
      (report: AnalysisReport) =>
        Object.assign(report.overall, { score: Number.NaN }),
    ],
    [
      "invalid SHA",
      (report: AnalysisReport) =>
        Object.assign(report.repository, { commitSha: "main" }),
    ],
    [
      "invalid timestamp",
      (report: AnalysisReport) =>
        Object.assign(report.repository, { analyzedAt: "tomorrow" }),
    ],
    [
      "unknown source field",
      (report: AnalysisReport) =>
        Object.assign(report, { source: "remote source" }),
    ],
  ])("rejects %s", (_name, mutate) => {
    const report = cloneReport();
    mutate(report);
    expect(isAnalysisReport(report)).toBe(false);
  });

  it("rejects duplicate rule IDs and impossible points", () => {
    const duplicate = cloneReport();
    const first = duplicate.dimensions[0]?.rules[0];
    const second = duplicate.dimensions[0]?.rules[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) second.id = first.id;
    expect(isAnalysisReport(duplicate)).toBe(false);

    const impossible = cloneReport();
    const rule = impossible.dimensions[0]?.rules[0];
    expect(rule).toBeDefined();
    if (rule !== undefined) rule.earned = rule.available + 1;
    expect(isAnalysisReport(impossible)).toBe(false);
  });

  it("validates exact skipped totals independently from capped details", () => {
    const capped = cloneReport();
    capped.coverage.skippedFiles = 401;
    capped.coverage.skipped = Array.from({ length: 400 }, (_, index) => ({
      path: `excluded/file-${String(index)}.txt`,
      reason: "excluded" as const,
    }));
    expect(isAnalysisReport(capped)).toBe(true);

    const inconsistent = structuredClone(capped);
    inconsistent.coverage.skippedFiles = 399;
    expect(isAnalysisReport(inconsistent)).toBe(false);

    const missing = cloneReport();
    missing.coverage.skippedFiles = 1;
    expect(isAnalysisReport(missing)).toBe(false);
  });

  it("is total for cyclic hostile finding arrays", () => {
    const report = cloneReport();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    Object.assign(report, { strengths: cyclic });

    expect(() => isAnalysisReport(report)).not.toThrow();
    expect(isAnalysisReport(report)).toBe(false);
  });

  it("is total for hostile throwing property access", () => {
    const hostile = new Proxy(validReport(), {
      ownKeys() {
        throw new Error("hostile reflection");
      },
    });

    expect(() => isAnalysisReport(hostile)).not.toThrow();
    expect(isAnalysisReport(hostile)).toBe(false);
  });
});
