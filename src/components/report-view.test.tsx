/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("leads with the reader decision and keeps each technical section in one closed appendix", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReportView report={report} language="en" onRefresh={vi.fn()} />,
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: "owner/repo" }),
    ).toBeVisible();
    expect(screen.queryByText('<img src=x onerror="alert(1)">')).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("sourceText");

    expect(
      Array.from(container.querySelector(".report-view")?.children ?? []).map(
        (node) => node.getAttribute("data-report-section"),
      ),
    ).toEqual(["summary", "reader", "technical-appendix"]);

    expect(
      screen.getByRole("heading", { name: "Project decision summary" }),
    ).toBeVisible();
    const appendixSummary = screen.getByText(
      "Technical evidence and methodology",
    );
    const appendix = appendixSummary.closest("details");
    expect(appendix).not.toBeNull();
    expect(appendix).not.toHaveAttribute("open");
    expect(screen.getByText("80 / 100")).not.toBeVisible();
    expect(
      within(container).getByRole("button", { name: "Refresh public data" }),
    ).not.toBeVisible();
    expect(
      within(container).getByRole("button", {
        name: "Copy improvement checklist",
      }),
    ).not.toBeVisible();

    await user.click(appendixSummary);

    expect(appendix).toHaveAttribute("open");
    expect(screen.getByText("80 / 100")).toBeVisible();
    expect(
      within(container).getByRole("button", { name: "Refresh public data" }),
    ).toBeVisible();
    expect(
      within(container).getByRole("button", {
        name: "Copy improvement checklist",
      }),
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

  it("keeps the reader dossier narrow, ruled, inert, and motion-free", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

    expect(css).toMatch(
      /\.reader-report\s*\{[^}]*width:\s*min\(100%,\s*72ch\)[^}]*border-top:/isu,
    );
    expect(css).toMatch(
      /\.reader-report__commands pre\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere/isu,
    );
    expect(css).toMatch(
      /\.reader-report__source,\s*\.reader-report__search\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
    expect(css).toMatch(
      /\.technical-appendix\s*>\s*summary\s*\{[^}]*min-height:\s*var\(--target-min\)/isu,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*64rem\)\s*\{[\s\S]*?\.reader-report\s*\{[^}]*width:\s*min\(100%,\s*calc\(72ch\s*\+\s*4rem\s*\+\s*var\(--space-6\)\)\)[\s\S]*?\.reader-chapter\s*\{[^}]*grid-template-columns:\s*4rem\s+minmax\(0,\s*72ch\)/isu,
    );
    expect(css).not.toMatch(
      /(?:reader-report|reader-chapter|technical-appendix|technical-overview)[^{]*\{[^}]*(?:position:\s*(?:fixed|sticky)|transition:|animation:)/isu,
    );
  });
});
