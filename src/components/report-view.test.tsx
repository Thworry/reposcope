import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnalysisReport, DimensionKey } from "../features/analysis/model";
import {
  perfectProjectBrief,
  perfectReaderReport,
} from "../test/fixtures/metrics";
import { ReportView } from "./report-view";

const dimensionKeys: DimensionKey[] = [
  "documentation",
  "operability",
  "readability",
  "complexity",
  "testing",
  "maintenance",
];

const report = {
  rulesetVersion: "1.0.0",
  repository: {
    owner: "owner",
    repo: "repo",
    fullName: "owner/repo",
    url: "https://github.com/owner/repo",
    description: '<img src=x onerror="alert(1)">',
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
    generalOnly: false,
    preliminary: false,
  },
  confidence: { percent: 90, label: "high" },
  dimensions: dimensionKeys.map((key) => ({
    key,
    earned: 1,
    available: 1,
    score: 100,
    rules: [],
  })),
  strengths: [],
  weaknesses: [],
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
    skippedFiles: 0,
    failedFiles: 0,
    unsupportedFiles: 0,
    limitReached: false,
  },
} satisfies AnalysisReport;

describe("ReportView", () => {
  it("renders the fixed seven-section guided report without remote HTML or source fields", () => {
    const { container } = render(
      <ReportView report={report} language="en" onRefresh={vi.fn()} />,
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: "owner/repo" }),
    ).toBeVisible();
    expect(screen.queryByText('<img src=x onerror="alert(1)">')).toBeNull();
    expect(screen.getByRole("region", { name: "Project brief" })).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("region", { name: "Methodology" })).toBeVisible();
    expect(container.querySelectorAll("#methodology")).toHaveLength(1);
    expect(container.textContent).not.toContain("sourceText");

    expect(
      Array.from(container.querySelectorAll("[data-report-section]")).map(
        (node) => node.getAttribute("data-report-section"),
      ),
    ).toEqual([
      "summary",
      "dimensions",
      "strengths",
      "improvements",
      "coverage",
      "evidence",
      "methodology",
    ]);
    expect(
      within(container).getByRole("button", { name: "Refresh public data" }),
    ).toBeVisible();
    expect(
      within(container).getByRole("button", {
        name: "Copy improvement checklist",
      }),
    ).toBeVisible();
  });
});
