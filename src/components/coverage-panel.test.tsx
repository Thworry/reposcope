import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CoverageSummary } from "../features/analysis/model";
import { CoveragePanel } from "./coverage-panel";

const coverage: CoverageSummary = {
  treeComplete: false,
  eligibleFiles: 18,
  eligibleBytes: 18_000,
  eligibleSourceBytes: 11_000,
  selectedFiles: 12,
  selectedBytes: 12_000,
  fetchedFiles: 10,
  fetchedBytes: 9_000,
  parsedFiles: 7,
  parsedBytes: 7_000,
  parsedSupportedBytes: 6_500,
  failedFiles: 2,
  unsupportedFiles: 3,
  limitReached: true,
  skipped: [
    { path: "vendor/<img src=x>.go", reason: "unsupported" },
    { path: "large.ts", reason: "oversized" },
  ],
  failures: [{ path: "src/broken.ts", stage: "parse", reason: "syntax" }],
};

describe("CoveragePanel", () => {
  it("reports exact file and byte coverage while keeping unsupported and failed paths in coverage", () => {
    render(<CoveragePanel coverage={coverage} language="en" />);

    function expectStat(label: string, value: string): void {
      const container = screen.getByText(label).parentElement;
      if (container === null) throw new Error(`Missing statistic: ${label}`);
      expect(within(container).getByText(value)).toBeVisible();
    }

    expectStat("Selected files", "12");
    expectStat("Fetched files", "10");
    expectStat("Parsed files", "7");
    expectStat("Failed files", "2");
    expectStat("Unsupported files", "3");
    expect(screen.getByText(/12,000 B/)).toBeVisible();
    expect(screen.getByText("vendor/<img src=x>.go")).toBeVisible();
    expect(screen.getByText("src/broken.ts")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/partial GitHub tree/i)).toBeVisible();
    expect(screen.getByText(/inspection limit reached/i)).toBeVisible();
  });
});
