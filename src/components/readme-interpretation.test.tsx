import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  READER_COMMENTARY_IDS,
  type AnalysisReport,
  type Language,
} from "../features/analysis/model";
import { messages } from "../i18n/messages";
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
  it("renders the eight editorial regions in their reading order", () => {
    const { container } = renderInterpretation();

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-readme-region]")].map(
        (region) =>
          within(region).getByRole("heading", { level: 4 }).textContent,
      ),
    ).toEqual([
      "Project orientation",
      "Community and maintenance facts",
      "Reader takeaways",
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

  it("turns validated evidence into bounded human-readable takeaways", () => {
    renderInterpretation();

    const region = screen.getByRole("region", { name: "Reader takeaways" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(4);
    expect(region).toHaveTextContent("1 capability area");
    expect(region).toHaveTextContent("Reader report");
    expect(region).toHaveTextContent("2 ordered steps");
    expect(region).toHaveTextContent("5 onboarding command types");
    expect(region).toHaveTextContent("Application");
    expect(region).toHaveTextContent("JavaScript / TypeScript");
    expect(region).toHaveTextContent("2 named source areas");
    expect(region).toHaveTextContent("License information: Present");
    expect(region).toHaveTextContent("Security policy: Present");
    expect(region).toHaveTextContent("1 external requirement");
    expect(region).toHaveTextContent(messages.en.readerTakeawayBoundary);
    expect(
      within(region).getAllByText(messages.en.readerTakeawayBoundary),
    ).toHaveLength(1);
  });

  it("renders equivalent Chinese takeaways without translating repository labels", () => {
    renderInterpretation(completeReport(), "zh-CN");

    const region = screen.getByRole("region", {
      name: messages["zh-CN"].readerTakeawaysHeading,
    });
    expect(region).toHaveTextContent("1 个主要功能分组");
    expect(region).toHaveTextContent("Reader report");
    expect(region).toHaveTextContent("2 个操作步骤");
    expect(region).toHaveTextContent("5 类可参考命令");
    expect(region).toHaveTextContent("应用程序");
    expect(region).toHaveTextContent("JavaScript / TypeScript");
    expect(region).toHaveTextContent("2 个主要区域");
    expect(region).toHaveTextContent("已找到许可证文件或 GitHub 识别信息");
    expect(region).toHaveTextContent(messages["zh-CN"].readerTakeawayBoundary);
  });

  it("builds Chinese takeaways only from details that are actually available", () => {
    const report = completeReport();
    report.projectBrief.kinds = [
      { kind: "application", source: "manifest", path: "package.json" },
    ];
    report.readerReport.readme.workflow = [];
    report.readerReport.readme.dependencies = [];
    report.readerReport.gettingStarted.commands = [
      {
        kind: "install",
        command: "pnpm install",
        disposition: "ready",
        source: "readme",
        path: "README.md",
      },
    ];
    report.readerReport.architecture.ecosystems = [];
    report.readerReport.architecture.sourceAreas = [];
    report.readerReport.reliability.signals = [
      {
        signal: "license",
        state: "present",
        source: "analysis",
        path: null,
      },
    ];
    renderInterpretation(report, "zh-CN");

    const region = screen.getByRole("region", {
      name: messages["zh-CN"].readerTakeawaysHeading,
    });
    expect(region).toHaveTextContent("1 类可参考命令");
    expect(region).toHaveTextContent("应用程序");
    expect(region).toHaveTextContent("已找到许可证文件或 GitHub 识别信息");
    expect(region).not.toHaveTextContent("0 个");
    expect(region).not.toHaveTextContent("无法确认、");
    expect(region).not.toHaveTextContent("无法确认，并有");
    expect(
      within(region).getAllByText(messages["zh-CN"].readerTakeawayBoundary),
    ).toHaveLength(1);
  });

  it("shows the plain unknown copy when no risk detail is available", () => {
    const report = completeReport();
    report.readerReport.reliability.signals = [];
    report.readerReport.readme.dependencies = [];
    renderInterpretation(report, "zh-CN");

    const region = screen.getByRole("region", {
      name: messages["zh-CN"].readerTakeawaysHeading,
    });
    const riskHeading = within(region).getByRole("heading", {
      name: messages["zh-CN"].readerTakeawayRiskHeading,
    });
    const risk = riskHeading.closest("li");
    expect(risk).not.toBeNull();
    if (risk === null) throw new Error("Missing risk takeaway");
    expect(risk).toHaveTextContent(messages["zh-CN"].readerNotEstablished);
    expect(risk).not.toHaveTextContent("公开信息显示：现有公开信息");
  });

  it("renders one semantic community definition list with exact accessible facts", () => {
    const report = completeReport();
    const { rerender } = renderInterpretation(report);
    const region = screen.getByRole("region", {
      name: "Community and maintenance facts",
    });

    expect(region.querySelectorAll("dl")).toHaveLength(1);
    for (const label of [
      "Stars",
      "Watchers",
      "Forks",
      "Open issues and PRs",
      "Last push",
      "License",
    ]) {
      expect(within(region).getByText(label, { selector: "dt" })).toBeVisible();
    }
    expect(
      within(region).getByRole("definition", { name: "Stars: 1,284" }),
    ).toHaveAttribute("data-exact-value", "1284");
    expect(
      within(region).getByRole("definition", { name: "Watchers: 37" }),
    ).toHaveAttribute("data-exact-value", "37");
    expect(
      within(region).getByRole("definition", { name: "Forks: 146" }),
    ).toHaveAttribute("data-exact-value", "146");
    expect(
      within(region).getByRole("definition", {
        name: "Open issues and PRs: 0",
      }),
    ).toHaveAttribute("data-exact-value", "0");
    expect(region).toHaveTextContent(
      "Popularity reflects attention, not proof of quality or safety.",
    );

    rerender(<ReadmeInterpretationView report={report} language="zh-CN" />);
    const chineseRegion = screen.getByRole("region", {
      name: messages["zh-CN"].readerCommunityHeading,
    });
    for (const label of ["Star 数", "Watch 数", "Fork 数"]) {
      expect(
        within(chineseRegion).getByText(label, { selector: "dt" }),
      ).toBeVisible();
    }
    expect(
      within(chineseRegion).getByRole("definition", {
        name: "Star 数：1,284",
      }),
    ).toHaveAttribute("data-exact-value", "1284");
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
      screen.getByRole("region", {
        name: messages["zh-CN"].readerReadmeNarrativeHeading,
      }),
    );
    const useCases = narrative
      .getByRole("heading", {
        name: messages["zh-CN"].readerReadmeUseCasesSubheading,
      })
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

  it("summarizes README coverage without repeating raw narrative excerpts", () => {
    const report = completeReport();
    renderInterpretation(report);

    const narrative = screen.getByRole("region", {
      name: "What the README says",
    });
    const comparison = screen.getByRole("region", {
      name: "README claims and repository observations",
    });

    expect(
      within(narrative).getByText("A bounded project overview."),
    ).toBeVisible();
    expect(
      within(comparison).queryByText("A bounded project overview."),
    ).toBeNull();
    expect(
      within(comparison).queryByText(
        "Evaluate a public project before adoption",
      ),
    ).toBeNull();
    expect(within(comparison).queryByText("A modern browser")).toBeNull();
    expect(comparison).toHaveTextContent("README evidence map");
    expect(comparison).toHaveTextContent("1 cited statement");
    expect(comparison).toHaveTextContent("1 capability group");
    expect(comparison).not.toHaveTextContent("Reader report");
    expect(comparison).toHaveTextContent("2 documented steps");
    expect(
      within(comparison).getAllByRole("link", {
        name: "README.md at inspected commit",
      }),
    ).toHaveLength(1);
  });

  it("uses honest fallback takeaways while retaining documented architecture references", () => {
    const report = completeReport();
    report.projectBrief.kinds = [];
    report.readerReport.readme.capabilityGroups = [];
    report.readerReport.readme.workflow = [];
    report.readerReport.readme.dependencies = [];
    report.readerReport.architecture.ecosystems = [];
    report.readerReport.architecture.sourceAreas = [];
    report.readerReport.gettingStarted.commands = [];
    renderInterpretation(report);

    const region = screen.getByRole("region", { name: "Reader takeaways" });
    expect(region).toHaveTextContent(
      "The README does not provide a bounded capability list.",
    );
    expect(region).toHaveTextContent(
      "No ordered README workflow or reusable onboarding command was established.",
    );
    expect(region).toHaveTextContent(
      "The repository provides 2 architecture references that outline components or responsibilities.",
    );
    expect(region).not.toHaveTextContent(
      "The scan does not establish a broad implementation outline.",
    );
  });

  it("uses the architecture fallback only when structure and references are absent", () => {
    const report = completeReport();
    report.projectBrief.kinds = [];
    report.readerReport.architecture.ecosystems = [];
    report.readerReport.architecture.sourceAreas = [];
    report.readerReport.architecture.excerpts = [];
    report.readerReport.architecture.documents = [];
    renderInterpretation(report);

    const region = screen.getByRole("region", { name: "Reader takeaways" });
    expect(region).toHaveTextContent(
      "The scan does not establish a broad implementation outline.",
    );
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
      /\.readme-interpretation__takeaways\s*\{[^}]*display:\s*grid[^}]*list-style:\s*none/su,
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
