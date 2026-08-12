import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AnalysisReport, RuleResult } from "../features/analysis/model";
import { EvidenceExplorer } from "./evidence-explorer";

function rule(
  id: string,
  dimension: RuleResult["dimension"],
  state: RuleResult["state"],
  path?: string,
): RuleResult {
  return {
    id,
    dimension,
    state,
    earned: state === "passed" ? 2 : 0,
    available: state === "not-applicable" ? 0 : 2,
    evidence: {
      key: "evidence.documentation.readme",
      args: { exists: state === "passed" },
    },
    recommendation: { key: "recommendation.documentation.readme", args: {} },
    references: path === undefined ? [] : [{ path, startLine: 12 }],
  };
}

const readmeRule = rule(
  "documentation.readme",
  "documentation",
  "passed",
  "docs/space name.md",
);
const manifestRule = rule(
  "operability.manifest",
  "operability",
  "failed",
  "src/main.ts",
);
const testingRule = rule("testing.ci", "testing", "partial");
const duplicationRule = rule(
  "complexity.duplication",
  "complexity",
  "not-applicable",
);

const report = {
  rulesetVersion: "1.0.0",
  repository: {
    owner: "owner",
    repo: "repo",
    fullName: "owner/repo",
    url: "https://github.com/owner/repo",
    description: null,
    defaultBranch: "main",
    archived: false,
    pushedAt: "2026-08-01T12:00:00.000Z",
    commitSha: "0123456789012345678901234567890123456789",
    analyzedAt: "2026-08-11T12:00:00.000Z",
  },
  overall: {
    score: 50,
    label: "needs-attention",
    generalOnly: false,
    preliminary: false,
  },
  confidence: { percent: 90, label: "high" },
  dimensions: [
    {
      key: "documentation",
      earned: 2,
      available: 2,
      score: 100,
      rules: [readmeRule],
    },
    {
      key: "operability",
      earned: 0,
      available: 2,
      score: 0,
      rules: [manifestRule],
    },
    { key: "readability", earned: 0, available: 0, score: null, rules: [] },
    {
      key: "complexity",
      earned: 0,
      available: 0,
      score: null,
      rules: [duplicationRule],
    },
    { key: "testing", earned: 0, available: 2, score: 0, rules: [testingRule] },
    { key: "maintenance", earned: 0, available: 0, score: null, rules: [] },
  ],
  strengths: [],
  weaknesses: [
    {
      ruleId: "operability.manifest",
      dimension: "operability",
      severity: "high",
      lostPoints: 2,
      evidence: manifestRule.evidence,
      recommendation: manifestRule.recommendation,
      references: manifestRule.references,
    },
    {
      ruleId: "testing.ci",
      dimension: "testing",
      severity: "low",
      lostPoints: 1,
      evidence: testingRule.evidence,
      recommendation: testingRule.recommendation,
      references: [],
    },
  ],
  coverage: {
    treeComplete: true,
    eligibleFiles: 1,
    eligibleBytes: 1,
    eligibleSourceBytes: 1,
    selectedFiles: 1,
    selectedBytes: 1,
    fetchedFiles: 1,
    fetchedBytes: 1,
    parsedFiles: 1,
    parsedBytes: 1,
    parsedSupportedBytes: 1,
    failedFiles: 0,
    unsupportedFiles: 0,
    limitReached: false,
  },
} satisfies AnalysisReport;

describe("EvidenceExplorer", () => {
  it("filters generated evidence with native controls and builds immutable encoded links", async () => {
    const user = userEvent.setup();
    render(<EvidenceExplorer report={report} language="en" />);

    expect(screen.getByText("4 rules shown")).toBeVisible();
    const encodedLink = screen.getByRole("link", {
      name: /docs\/space name\.md/i,
    });
    expect(encodedLink).toHaveAttribute(
      "href",
      "https://github.com/owner/repo/blob/0123456789012345678901234567890123456789/docs/space%20name.md#L12",
    );
    expect(encodedLink).toHaveAttribute("target", "_blank");
    expect(encodedLink).toHaveAttribute("rel", "noopener noreferrer");

    await user.selectOptions(screen.getByLabelText("Dimension"), "operability");
    expect(screen.getByText("1 rule shown")).toBeVisible();
    expect(screen.getByText("operability.manifest")).toBeVisible();
    expect(screen.queryByText("documentation.readme")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Severity"), "high");
    expect(screen.getByText("1 rule shown")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("State"), "passed");
    expect(
      screen.getByText("No evidence matches these filters."),
    ).toBeVisible();
  });

  it("keeps canonical rule order and never turns coverage failures into rule findings", () => {
    const hostile = {
      ...report,
      coverage: {
        ...report.coverage,
        failedFiles: 1,
        failures: [
          {
            path: "bad.ts",
            stage: "parse" as const,
            reason: "syntax" as const,
          },
        ],
      },
    };
    render(<EvidenceExplorer report={hostile} language="en" />);

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("documentation.readme"),
      expect.stringContaining("operability.manifest"),
      expect.stringContaining("complexity.duplication"),
      expect.stringContaining("testing.ci"),
    ]);
    expect(screen.queryByText("bad.ts")).toBeNull();
  });
});
