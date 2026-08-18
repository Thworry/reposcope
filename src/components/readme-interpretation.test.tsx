import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  READER_COMMENTARY_IDS,
  type AnalysisReport,
  type Language,
} from "../features/analysis/model";
import {
  perfectProjectBrief,
  perfectReaderReport,
} from "../test/fixtures/metrics";
import { ReadmeInterpretationView } from "./readme-interpretation";

const commitSha = "0123456789012345678901234567890123456789";

function completeReport(): AnalysisReport {
  return {
    rulesetVersion: "1.0.0",
    repository: {
      owner: "owner",
      repo: "repo",
      fullName: "owner/repo",
      url: "https://github.com/owner/repo",
      description: "Fixture description.",
      defaultBranch: "main",
      archived: false,
      pushedAt: "2026-08-01T12:00:00.000Z",
      commitSha,
      analyzedAt: "2026-08-11T12:00:00.000Z",
    },
    projectBrief: structuredClone(perfectProjectBrief),
    readerReport: structuredClone(perfectReaderReport),
    overall: {
      score: 67,
      label: "needs-attention",
      generalOnly: false,
      preliminary: false,
    },
    confidence: { percent: 80, label: "high" },
    dimensions: [],
    strengths: [],
    weaknesses: [],
    coverage: {
      treeComplete: true,
      eligibleFiles: 10,
      eligibleBytes: 10_000,
      eligibleSourceBytes: 5_000,
      selectedFiles: 10,
      selectedBytes: 10_000,
      fetchedFiles: 10,
      fetchedBytes: 10_000,
      parsedFiles: 5,
      parsedBytes: 5_000,
      parsedSupportedBytes: 5_000,
      skippedFiles: 0,
      failedFiles: 0,
      unsupportedFiles: 0,
      limitReached: false,
    },
  };
}

function renderInterpretation(
  report: AnalysisReport = completeReport(),
  language: Language = "en",
) {
  return render(
    <ReadmeInterpretationView report={report} language={language} />,
  );
}

describe("ReadmeInterpretationView", () => {
  it("renders the seven editorial regions in their approved order", () => {
    const { container } = renderInterpretation();

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-readme-region]")].map(
        (region) =>
          within(region).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual([
      "Project orientation",
      "Community and maintenance facts",
      "What the README says",
      "Core capabilities",
      "Documented workflow",
      "README claims and repository observations",
      "RepoScope commentary",
    ]);

    const workflow = screen.getByRole("list", { name: "Documented workflow" });
    expect(workflow).toHaveClass("readme-interpretation__workflow");
    expect(workflow).toHaveAttribute("data-workflow-columns", "2");
    expect(workflow).not.toHaveAttribute("style");
    expect(screen.queryByText(/overall README score/iu)).toBeNull();
    expect(screen.queryByRole("img", { name: /radar/iu })).toBeNull();
  });

  it("renders one semantic community definition list with exact accessible facts", () => {
    renderInterpretation();
    const region = screen.getByRole("region", {
      name: "Community and maintenance facts",
    });

    expect(region.querySelectorAll("dl")).toHaveLength(1);
    for (const label of [
      "Stars",
      "Watch",
      "Forks",
      "Open issues",
      "Last push",
      "License",
    ]) {
      expect(within(region).getByText(label, { selector: "dt" })).toBeVisible();
    }
    expect(
      within(region).getByRole("definition", { name: "Stars: 1,284" }),
    ).toHaveAttribute("data-exact-value", "1284");
    expect(
      within(region).getByRole("definition", { name: "Watch: 37" }),
    ).toHaveAttribute("data-exact-value", "37");
    expect(
      within(region).getByRole("definition", { name: "Forks: 146" }),
    ).toHaveAttribute("data-exact-value", "146");
    expect(
      within(region).getByRole("definition", { name: "Open issues: 0" }),
    ).toHaveAttribute("data-exact-value", "0");
    expect(region).toHaveTextContent(
      "Popularity reflects attention, not proof of quality or safety.",
    );
  });

  it("keeps hostile, duplicate, long CJK, punctuation, links, and bidi prose inert and byte-preserved", () => {
    const report = completeReport();
    const hostile =
      '<script>alert("x")</script> [fake](https://evil.invalid/x) ‮原文；punctuation!?';
    const longCjk =
      "这是用于检查超长中文内容是否能够自然换行且不会改变任何仓库原文的句子。".repeat(
        12,
      );
    report.readerReport.readme.overview = [
      { source: "readme", path: "README.md", text: hostile },
      { source: "readme", path: "README.md", text: longCjk },
    ];
    report.readerReport.readme.capabilityGroups = [
      {
        label: "重复能力",
        facts: [{ source: "readme", path: "README.md", text: hostile }],
      },
      {
        label: "重复能力",
        facts: [{ source: "readme", path: "README.md", text: longCjk }],
      },
    ];
    report.readerReport.readme.workflow = [
      { source: "readme", path: "README.md", text: hostile },
    ];
    const before = structuredClone(report);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container, rerender } = renderInterpretation(report, "en");

    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
    expect(screen.getAllByText(longCjk).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: "重复能力" })).toHaveLength(
      2,
    );
    expect(
      container.querySelector("script, img, iframe, object, embed"),
    ).toBeNull();
    expect(container.querySelector('a[href*="evil.invalid"]')).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "README.md at inspected commit" })
        .length,
    ).toBeGreaterThan(0);

    rerender(<ReadmeInterpretationView report={report} language="zh-CN" />);
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
    expect(screen.getAllByText(longCjk).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report).toEqual(before);
    fetchSpy.mockRestore();
  });

  it("retains a unique legacy scenario in the README use-case narrative with its immutable source", () => {
    const report = completeReport();
    report.readerReport.readme.useCases = [];
    report.readerReport.scenarios.facts = [
      {
        source: "readme",
        path: "README.md",
        text: "Generate a release briefing",
      },
    ];
    renderInterpretation(report);

    const narrative = within(
      screen.getByRole("region", { name: "What the README says" }),
    );
    const useCases = narrative
      .getByRole("heading", { name: "Use cases described" })
      .closest("section");
    expect(useCases).not.toBeNull();
    if (useCases === null) throw new Error("Missing use-case annotation");
    expect(
      within(useCases).getByText("Generate a release briefing"),
    ).toBeVisible();
    expect(
      within(useCases).getByRole("link", {
        name: "README.md at inspected commit",
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/README.md`,
    );
  });

  it("deduplicates merged scenarios by NFKC while preserving the first spelling and order", () => {
    const report = completeReport();
    report.readerReport.readme.useCases = [
      {
        source: "readme",
        path: "README.md",
        text: "Generate a release briefing",
      },
    ];
    report.readerReport.scenarios.facts = [
      {
        source: "readme",
        path: "README.md",
        text: "Ｇｅｎｅｒａｔｅ a release briefing",
      },
      {
        source: "readme",
        path: "README.md",
        text: "A bounded project overview.",
      },
      {
        source: "analysis",
        path: null,
        text: "A deterministic fixture repository.",
      },
      {
        source: "readme",
        path: "README.md",
        text: "示例：整理发布说明",
      },
      {
        source: "readme",
        path: "README.md",
        text: "示例:整理发布说明",
      },
      {
        source: "readme",
        path: "README.md",
        text: "最后一个示例",
      },
    ];
    renderInterpretation(report, "zh-CN");

    const narrative = within(
      screen.getByRole("region", { name: "README 如何介绍项目" }),
    );
    const useCases = narrative
      .getByRole("heading", { name: "描述的使用场景" })
      .closest("section");
    expect(useCases).not.toBeNull();
    if (useCases === null) throw new Error("缺少使用场景区块");
    expect(
      [...useCases.querySelectorAll("li > p")].map((fact) => fact.textContent),
    ).toEqual([
      "Generate a release briefing",
      "示例：整理发布说明",
      "最后一个示例",
    ]);
  });

  it.each([
    {
      precedingGroup: "audiences" as const,
      precedingHeading: "Intended audience",
      first: "Who is this for",
      overlap: "Ｗｈｏ is this for",
    },
    {
      precedingGroup: "problems" as const,
      precedingHeading: "Problems described",
      first: "解决问题：发布说明分散",
      overlap: "解决问题:发布说明分散",
    },
  ])(
    "keeps $first only in the preceding $precedingGroup group",
    ({ precedingGroup, precedingHeading, first, overlap }) => {
      const report = completeReport();
      report.readerReport.readme[precedingGroup] = [
        { source: "readme", path: "README.md", text: first },
      ];
      report.readerReport.readme.useCases = [
        { source: "readme", path: "README.md", text: overlap },
      ];
      report.readerReport.scenarios.facts = [
        { source: "readme", path: "README.md", text: first },
        {
          source: "readme",
          path: "README.md",
          text: "示例：生成发布简报",
        },
        {
          source: "readme",
          path: "README.md",
          text: "示例:生成发布简报",
        },
        { source: "readme", path: "README.md", text: "最后一个示例" },
      ];
      renderInterpretation(report);

      const narrative = within(
        screen.getByRole("region", { name: "What the README says" }),
      );
      const preceding = narrative
        .getByRole("heading", { name: precedingHeading })
        .closest("section");
      expect(preceding).not.toBeNull();
      if (preceding === null) throw new Error("Missing preceding narrative");
      expect(within(preceding).getByText(first)).toBeVisible();

      const useCases = narrative
        .getByRole("heading", { name: "Use cases described" })
        .closest("section");
      expect(useCases).not.toBeNull();
      if (useCases === null) throw new Error("Missing use-case annotation");
      expect(
        [...useCases.querySelectorAll("li > p")].map(
          (fact) => fact.textContent,
        ),
      ).toEqual(["示例：生成发布简报", "最后一个示例"]);
      expect(
        within(useCases).getAllByRole("link", {
          name: "README.md at inspected commit",
        }),
      ).toHaveLength(2);
    },
  );

  it("renders honest missing and partial README states while retaining community facts", () => {
    const missing = completeReport();
    missing.readerReport.readme = {
      availability: "unavailable",
      observedManifests: [],
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
      commentary: [],
    };
    const { rerender } = renderInterpretation(missing);

    expect(
      screen.getByText("No README interpretation is available."),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Community and maintenance facts" }),
    ).toBeVisible();
    expect(screen.queryByText("A bounded project overview.")).toBeNull();

    const partial = completeReport();
    partial.readerReport.readme.availability = "partial";
    partial.readerReport.readme.overview = [
      {
        source: "readme",
        path: "README.md",
        text: "Retained partial README evidence.",
      },
    ];
    rerender(<ReadmeInterpretationView report={partial} language="en" />);

    expect(
      screen.getByText(
        "README interpretation is partial; scan coverage may explain omissions.",
      ),
    ).toBeVisible();
    expect(
      screen.getAllByText("Retained partial README evidence.").length,
    ).toBeGreaterThan(0);
  });

  it("maps every frozen commentary identifier into the three editorial groups", () => {
    const report = completeReport();
    report.readerReport.readme.commentary = [...READER_COMMENTARY_IDS];
    renderInterpretation(report);

    const region = screen.getByRole("region", { name: "RepoScope commentary" });
    for (const heading of [
      "Worth noting",
      "Verify before relying on it",
      "What this means in practice",
    ]) {
      expect(
        within(region).getByRole("heading", { name: heading }),
      ).toBeVisible();
    }
    expect(within(region).getAllByRole("listitem")).toHaveLength(
      READER_COMMENTARY_IDS.length,
    );
  });

  it("locks the ruled responsive CSS contract without cards, effects, or motion", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");
    const globalCss = readFileSync(
      join(process.cwd(), "src/styles/global.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.readme-interpretation__community\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*border-top:\s*1px solid var\(--color-rule\)/su,
    );
    expect(css).toMatch(
      /\.readme-interpretation__workflow\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*list-style:\s*none/su,
    );
    expect(css).toMatch(
      /@media\s*\(min-width:\s*64rem\)[\s\S]*?\.readme-interpretation__workflow\[data-workflow-columns="4"\]\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[\s\S]*?\.readme-interpretation__comparison\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/su,
    );
    expect(css).toMatch(
      /\.readme-interpretation[^{}]*\{[^}]*overflow-wrap:\s*anywhere/su,
    );
    expect(css).not.toMatch(
      /\.readme-interpretation[^{}]*\{[^}]*(?:box-shadow|gradient|animation\s*:|transition\s*:)/su,
    );
    expect(globalCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  });
});
