import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectProjectBrief,
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
    projectBrief: structuredClone(perfectProjectBrief),
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: structuredClone(perfectCoverage),
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

  it("removes a stale report without the required project brief", () => {
    const stale = structuredClone(validReport()) as unknown as Record<
      string,
      unknown
    >;
    delete stale.projectBrief;
    sessionStorage.setItem(
      cacheKey(ref),
      JSON.stringify({ savedAt: now, report: stale }),
    );

    expect(getCachedReport(ref, now)).toBeNull();
    expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
  });

  it("keeps the maximum valid project brief below the existing 2 MiB cap", () => {
    const report = validReport();
    report.repository.owner = ref.owner;
    report.repository.repo = ref.repo;
    report.repository.fullName = `${ref.owner}/${ref.repo}`;
    report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
    report.projectBrief = {
      excerpts: [
        {
          source: "github-description",
          text: "a".repeat(480),
          path: null,
        },
        { source: "readme", text: "b".repeat(320), path: "r".repeat(1_024) },
      ],
      kinds: [
        { kind: "application", source: "manifest", path: "a".repeat(1_024) },
        {
          kind: "command-line-tool",
          source: "tree",
          path: "b".repeat(1_024),
        },
        { kind: "library", source: "manifest", path: "c".repeat(1_024) },
      ],
      cautions: [
        { caution: "archived", source: "github-metadata", path: null },
        {
          caution: "insufficient-explanation",
          source: "analysis",
          path: null,
        },
        {
          caution: "license-evidence-absent",
          source: "analysis",
          path: null,
        },
        {
          caution: "entry-point-evidence-absent",
          source: "analysis",
          path: null,
        },
      ],
    };
    const serialized = JSON.stringify({ savedAt: now, report });

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(
      2 * 1024 * 1024,
    );
    setCachedReport(ref, report, now);
    expect(sessionStorage.getItem(cacheKey(ref))).toBe(serialized);
  });

  it.each([
    ["password assignment", "password=hunter2"],
    ["inline password assignment", "password=`hunter2`"],
    ["braced secret assignment", "secret={hunter2}"],
    ["GitHub token", `ghp_${"a".repeat(36)}`],
    ["PEM private key", "-----BEGIN PRIVATE KEY-----"],
  ])("never persists a report containing a %s", (_label, credential) => {
    for (const target of ["description", "excerpt"] as const) {
      const report = validReport();
      report.repository.owner = ref.owner;
      report.repository.repo = ref.repo;
      report.repository.fullName = `${ref.owner}/${ref.repo}`;
      report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
      if (target === "description") {
        report.repository.description = `Purpose ${credential}`;
      } else {
        const firstExcerpt = report.projectBrief.excerpts[0];
        expect(firstExcerpt).toBeDefined();
        if (firstExcerpt === undefined)
          throw new Error("Missing fixture excerpt");
        firstExcerpt.text = `Purpose ${credential}`;
      }

      setCachedReport(ref, report, now);
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    }
  });

  it.each([
    "  token: hunter2 # nested YAML",
    "- password: huntersecret # list item",
    "Password: required.\ntoken: hunter2",
    "token: hunter2\nPassword: required.",
  ])("never persists structured YAML credential text: %s", (credential) => {
    for (const target of ["description", "excerpt"] as const) {
      const report = validReport();
      report.repository.owner = ref.owner;
      report.repository.repo = ref.repo;
      report.repository.fullName = `${ref.owner}/${ref.repo}`;
      report.repository.url = `https://github.com/${ref.owner}/${ref.repo}`;
      if (target === "description") {
        report.repository.description = credential;
      } else {
        const firstExcerpt = report.projectBrief.excerpts[0];
        expect(firstExcerpt).toBeDefined();
        if (firstExcerpt === undefined)
          throw new Error("Missing fixture excerpt");
        firstExcerpt.text = credential;
      }

      setCachedReport(ref, report, now);
      expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
    }
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
      "more skipped details than the aggregate count",
      (report: AnalysisReport) => {
        report.coverage.skippedFiles = 1;
        report.coverage.skipped = [
          { path: "excluded/file.txt", reason: "excluded" },
          { path: "excluded/other.txt", reason: "excluded" },
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
