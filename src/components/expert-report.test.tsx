/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DeepReport } from "../features/deep-analysis/model";
import { DEEP_REPORT_FIXTURE } from "../test/fixtures/deep-analysis";
import { ExpertReport } from "./expert-report";

const CHAPTERS = [
  "Thirty-second orientation",
  "Good fit / poor fit",
  "Practical situations",
  "Capabilities and workflow",
  "How it broadly works",
  "Install, run, and extend",
  "Reliability, security, and privacy",
  "Maintenance and community",
  "Alternatives worth comparing",
  "Expert verdict",
];

function reportFixture(): DeepReport {
  return structuredClone(DEEP_REPORT_FIXTURE);
}

describe("ExpertReport", () => {
  it("renders one coherent ten-chapter briefing with an ordered heading outline", () => {
    render(<ExpertReport report={reportFixture()} language="en" />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Repository briefing" }),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(CHAPTERS);
    expect(screen.getAllByRole("heading", { level: 4 }).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("heading", { level: 5 })).toBeNull();
    expect(screen.getAllByText("Repository shows").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expert interpretation").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Not established").length).toBeGreaterThan(0);
    expect(screen.queryByText(/raw transcript/iu)).toBeNull();
  });

  it("shows exact community facts and keeps popularity separate from trust", () => {
    const report = reportFixture();
    report.maintenance.community = {
      ...report.maintenance.community,
      stars: 12_345,
      watchers: 67,
      forks: 890,
      openIssues: 95,
    };
    render(<ExpertReport report={report} language="en" />);

    const chapter = screen
      .getByRole("heading", { name: "Maintenance and community" })
      .closest("section");
    expect(chapter).not.toBeNull();
    expect(within(chapter as HTMLElement).getByText("12,345")).toBeVisible();
    expect(within(chapter as HTMLElement).getByText("67")).toBeVisible();
    expect(within(chapter as HTMLElement).getByText("890")).toBeVisible();
    expect(
      within(chapter as HTMLElement).getByText("Open issues and PRs"),
    ).toBeVisible();
    expect(within(chapter as HTMLElement).getByText("95")).toBeVisible();
    expect(chapter).toHaveTextContent(
      "Popularity indicates attention—not reliability, security, or suitability.",
    );
  });

  it("renders hostile claims only as text and opens only immutable safe sources", () => {
    const report = reportFixture();
    report.orientation.summary[0] = {
      text: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
      provenance: "repository-claim",
      confidence: "medium",
      evidenceIds: ["ev-0002"],
    };
    const { container } = render(
      <ExpertReport report={report} language="en" />,
    );

    expect(
      screen.getByText(
        '<img src=x onerror="alert(1)"><script>alert(2)</script>',
      ),
    ).toBeVisible();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(container.querySelector("script")).toBeNull();

    const readmeLink = screen.getAllByRole("link", {
      name: "2. Preferred README",
    })[0];
    expect(readmeLink).toBeDefined();
    expect(readmeLink).toHaveAttribute(
      "href",
      `https://github.com/example/project/blob/${"a".repeat(40)}/README.md`,
    );
    for (const link of container.querySelectorAll('a[target="_blank"]')) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("keeps the evidence drawer closed until the reader asks for it", () => {
    render(<ExpertReport report={reportFixture()} language="en" />);

    const summary = screen.getByText("Evidence cited by this briefing");
    const drawer = summary.closest("details");
    expect(drawer).not.toBeNull();
    expect(drawer).not.toHaveAttribute("open");
    expect(
      within(drawer as HTMLElement).getByText("Public repository metadata"),
    ).not.toBeVisible();
  });

  it("shows a useful unavailable state instead of an empty alternatives table", () => {
    const report = reportFixture();
    report.alternatives = [];
    render(<ExpertReport report={report} language="en" />);

    const chapter = screen
      .getByRole("heading", { name: "Alternatives worth comparing" })
      .closest("section");
    expect(chapter).not.toBeNull();
    expect(chapter).toHaveTextContent(
      "No verified alternative repositories were available for this briefing.",
    );
    expect(within(chapter as HTMLElement).queryByRole("table")).toBeNull();
  });

  it("reflows tables and long evidence safely at 188 and 320 CSS pixels", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

    expect(css).toMatch(
      /\.report-expert,\s*\.expert-control,[\s\S]*?\.expert-evidence-drawer\s*\{[^}]*min-width:\s*0/isu,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*47\.999rem\)[\s\S]*?\.expert-alternatives table,[\s\S]*?display:\s*block;[\s\S]*?\.expert-alternatives \[data-label\]::before/isu,
    );
    expect(css).toMatch(
      /\.expert-alternatives a,\s*\.expert-evidence-drawer a\s*\{[^}]*min-height:\s*var\(--target-min\)[^}]*overflow-wrap:\s*anywhere/isu,
    );
    expect(css).not.toMatch(
      /(?:expert-report|expert-chapter|expert-alternatives|expert-evidence-drawer)[^{]*\{[^}]*min-width:\s*[1-9]\d{2}px/isu,
    );
    expect(css).not.toMatch(
      /\.expert-report__header\s*>\s*\.section-index,[\s\S]{0,180}?grid-row:\s*1\s*\/\s*span/isu,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*20rem\)[\s\S]*?\.expert-report h2\s*\{[^}]*font-size:\s*1\.8rem/isu,
    );
  });
});
