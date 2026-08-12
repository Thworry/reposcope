import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "../../test/fixtures/metrics";
import type { AnalysisReport, RepoRef } from "../analysis/model";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import {
  cacheKey,
  getCachedReport,
  removeCachedReport,
  setCachedReport,
} from "./report-cache";

const ref: RepoRef = { owner: "Example", repo: "Project" };
const now = Date.parse("2026-08-11T12:00:00.000Z");

function validReport(): AnalysisReport {
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

describe("report cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round trips a validated report under a canonical key", () => {
    const report = validReport();
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    setCachedReport(ref, report, now);
    expect(cacheKey(ref)).toBe("reposcope:v1:example/project");
    expect(getCachedReport(ref, now)).toEqual(report);
  });

  it.each([now + 1, now - 900_001])(
    "removes invalid saved time %s",
    (savedAt) => {
      sessionStorage.setItem(
        cacheKey(ref),
        JSON.stringify({ savedAt, report: validReport() }),
      );
      expect(getCachedReport(ref, now)).toBeNull();
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    },
  );

  it("rejects wrong repository identity and oversized entries", () => {
    const wrongReport = validReport();
    wrongReport.repository.owner = "different";
    wrongReport.repository.fullName = "different/project";
    wrongReport.repository.url = "https://github.com/different/project";
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report: wrongReport }),
    );
    expect(getCachedReport(ref, now)).toBeNull();

    const huge = "x".repeat(2 * 1024 * 1024);
    sessionStorage.setItem(cacheKey(ref), huge);
    expect(getCachedReport(ref, now)).toBeNull();
  });

  it.each([
    [
      "ruleset",
      (report: AnalysisReport) => {
        Object.assign(report, { rulesetVersion: "2.0.0" });
      },
    ],
    [
      "dimension set",
      (report: AnalysisReport) => {
        report.dimensions.pop();
      },
    ],
    [
      "duplicate rule ID",
      (report: AnalysisReport) => {
        const first = report.dimensions[0]?.rules[0];
        const second = report.dimensions[0]?.rules[1];
        if (first !== undefined && second !== undefined) second.id = first.id;
      },
    ],
    [
      "non-finite count",
      (report: AnalysisReport) => {
        report.coverage.fetchedFiles = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "inconsistent skipped count",
      (report: AnalysisReport) => {
        report.coverage.skippedFiles = 2;
        report.coverage.skipped = [
          { path: "excluded/file.txt", reason: "excluded" },
        ];
      },
    ],
    [
      "out-of-range points",
      (report: AnalysisReport) => {
        const rule = report.dimensions[0]?.rules[0];
        if (rule !== undefined) rule.earned = rule.available + 1;
      },
    ],
    [
      "invalid enum",
      (report: AnalysisReport) => {
        Object.assign(report.confidence, { label: "certain" });
      },
    ],
    [
      "invalid path",
      (report: AnalysisReport) => {
        const reference = report.strengths[0]?.references[0];
        if (reference !== undefined) reference.path = "../source.ts";
      },
    ],
    [
      "invalid ISO timestamp",
      (report: AnalysisReport) => {
        report.repository.analyzedAt = "2026-02-31T00:00:00.000Z";
      },
    ],
    [
      "invalid commit SHA",
      (report: AnalysisReport) => {
        report.repository.commitSha = "main";
      },
    ],
    [
      "source-text field",
      (report: AnalysisReport) => {
        const rule = report.dimensions[0]?.rules[0];
        if (rule !== undefined) {
          Object.assign(rule.evidence, { sourceText: "remote source" });
        }
      },
    ],
  ])("removes a cache entry with invalid nested %s", (_name, mutate) => {
    const report = validReport();
    mutate(report);
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report }),
    );
    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("degrades when storage operations throw", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(getCachedReport(ref, now)).toBeNull();
    get.mockRestore();

    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => {
      setCachedReport(ref, validReport(), now);
    }).not.toThrow();
    set.mockRestore();

    const remove = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    expect(() => {
      removeCachedReport(ref);
    }).not.toThrow();
    remove.mockRestore();
  });
});
