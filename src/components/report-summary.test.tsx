/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnalysisReport } from "../features/analysis/model";
import { perfectReaderReport } from "../test/fixtures/metrics";
import { ReportSummary } from "./report-summary";

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
  projectBrief: {
    excerpts: [
      {
        source: "github-description",
        text: "A bounded project purpose.",
        path: null,
      },
    ],
    kinds: [{ kind: "application", source: "manifest", path: "package.json" }],
    cautions: [],
  },
  readerReport: structuredClone(perfectReaderReport),
  overall: {
    score: 67,
    label: "needs-attention",
    generalOnly: true,
    preliminary: true,
  },
  confidence: { percent: 58, label: "low" },
  dimensions: [],
  strengths: [],
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

describe("ReportSummary", () => {
  it("renders only immutable repository identity metadata", () => {
    render(<ReportSummary report={report} language="en" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "owner/repo" }),
    ).toBeVisible();
    expect(screen.queryByText('<img src=x onerror="alert(1)">')).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(report.repository.commitSha)).toBeVisible();
    expect(screen.getByText("main")).toBeVisible();
    expect(screen.getByText(/Aug 11, 2026/i)).toBeVisible();

    expect(screen.queryByRole("region", { name: "Project brief" })).toBeNull();
    expect(screen.queryByText("A bounded project purpose.")).toBeNull();
    expect(screen.queryByText("67 / 100")).toBeNull();
    expect(screen.queryByText(/Needs attention/i)).toBeNull();
    expect(screen.queryByText(/General-only/i)).toBeNull();
    expect(screen.queryByText(/Preliminary/i)).toBeNull();
    expect(screen.queryByText(/58%.*Low confidence/i)).toBeNull();
    expect(screen.queryByText(/12 selected.*10 fetched.*8 parsed/i)).toBeNull();
  });

  it("keeps the repository link at the minimum touch target size", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

    expect(css).toMatch(
      /\.report-summary__heading a\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
    render(<ReportSummary report={report} language="en" />);
    expect(
      screen.getByRole("link", { name: "Open repository on GitHub" }),
    ).toBeVisible();
  });
});
