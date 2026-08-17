import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisReport,
  DimensionKey,
  RuleResult,
} from "../features/analysis/model";
import {
  perfectProjectBrief,
  perfectReaderReport,
} from "../test/fixtures/metrics";
import { TechnicalAppendix } from "./technical-appendix";

const dimensionKeys: DimensionKey[] = [
  "documentation",
  "operability",
  "readability",
  "complexity",
  "testing",
  "maintenance",
];

const readmeRule: RuleResult = {
  id: "documentation.readme",
  dimension: "documentation",
  state: "passed",
  earned: 2,
  available: 2,
  evidence: {
    key: "evidence.documentation.readme",
    args: { exists: true },
  },
  recommendation: {
    key: "recommendation.documentation.readme",
    args: {},
  },
  references: [{ path: "src/function-metric.ts", startLine: 12 }],
};

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
  projectBrief: perfectProjectBrief,
  readerReport: structuredClone(perfectReaderReport),
  overall: {
    score: 80,
    label: "solid",
    generalOnly: true,
    preliminary: true,
  },
  confidence: { percent: 58, label: "low" },
  dimensions: dimensionKeys.map((key) => ({
    key,
    earned: key === "documentation" ? 2 : 0,
    available: key === "documentation" ? 2 : 0,
    score: key === "documentation" ? 100 : null,
    rules: key === "documentation" ? [readmeRule] : [],
  })),
  strengths: [
    {
      ruleId: readmeRule.id,
      dimension: readmeRule.dimension,
      evidence: readmeRule.evidence,
      references: readmeRule.references,
    },
  ],
  weaknesses: [],
  coverage: {
    treeComplete: false,
    eligibleFiles: 20,
    eligibleBytes: 20_000,
    eligibleSourceBytes: 10_000,
    selectedFiles: 12,
    selectedBytes: 12_000,
    fetchedFiles: 10,
    fetchedBytes: 9_000,
    parsedFiles: 8,
    parsedBytes: 8_000,
    parsedSupportedBytes: 7_000,
    skippedFiles: 5,
    failedFiles: 2,
    unsupportedFiles: 3,
    limitReached: true,
  },
} satisfies AnalysisReport;

describe("TechnicalAppendix", () => {
  it("keeps the complete technical report and actions behind one disclosure", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { container } = render(
      <TechnicalAppendix report={report} language="en" onRefresh={onRefresh} />,
    );

    const summary = screen.getByText("Technical evidence and methodology");
    const appendix = summary.closest("details");
    expect(appendix).not.toBeNull();
    expect(appendix).not.toHaveAttribute("open");
    expect(screen.getByText("80 / 100")).not.toBeVisible();
    expect(screen.getByText(/58%.*Low confidence/i)).not.toBeVisible();
    expect(
      screen.getByText(/12 selected.*10 fetched.*8 parsed/i),
    ).not.toBeVisible();
    expect(screen.getAllByText("documentation.readme")[0]).not.toBeVisible();
    const functionReference = screen.getByRole("link", {
      name: /src\/function-metric\.ts.*12/i,
    });
    expect(functionReference).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refresh public data" }),
    ).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy improvement checklist" }),
    ).not.toBeVisible();

    await user.click(summary);

    expect(appendix).toHaveAttribute("open");
    expect(screen.getByText("80 / 100")).toBeVisible();
    expect(screen.getByText(/58%.*Low confidence/i)).toBeVisible();
    expect(screen.getByText("General-only")).toBeVisible();
    expect(screen.getByText("Preliminary")).toBeVisible();
    expect(
      screen.getByText(/12 selected.*10 fetched.*8 parsed/i),
    ).toBeVisible();
    expect(functionReference).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refresh public data" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy improvement checklist" }),
    ).toBeVisible();

    for (const section of [
      "dimensions",
      "strengths",
      "improvements",
      "coverage",
      "evidence",
      "methodology",
    ]) {
      expect(
        container.querySelectorAll(`[data-report-section="${section}"]`),
      ).toHaveLength(1);
    }
  });
});
