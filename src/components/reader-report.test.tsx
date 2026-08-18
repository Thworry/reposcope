import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  AnalysisReport,
  Language,
  ReaderAvailability,
  ReliabilityStatus,
} from "../features/analysis/model";
import {
  perfectProjectBrief,
  perfectReaderReport,
} from "../test/fixtures/metrics";
import { ReaderReportView } from "./reader-report";
import { ReportView } from "./report-view";

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

function renderReader(
  report: AnalysisReport = completeReport(),
  language: Language = "en",
) {
  return render(<ReaderReportView report={report} language={language} />);
}

describe("ReaderReportView", () => {
  it("integrates the README interpretation once before decision chapters and keeps one closed appendix", () => {
    const report = completeReport();
    const { container } = render(
      <ReportView report={report} language="en" onRefresh={() => undefined} />,
    );

    expect(container.querySelectorAll(".readme-interpretation")).toHaveLength(
      1,
    );
    expect(container.querySelectorAll(".technical-appendix")).toHaveLength(1);
    expect(container.querySelector(".technical-appendix")).not.toHaveAttribute(
      "open",
    );

    const orderedRegions = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-readme-region], [data-reader-section]",
      ),
    ].map(
      (region) => region.dataset.readmeRegion ?? region.dataset.readerSection,
    );
    expect(orderedRegions).toEqual([
      "orientation",
      "community",
      "readme-narrative",
      "capabilities",
      "workflow",
      "claim-observation",
      "commentary",
      "decision-summary",
      "project-fit-cautions",
      "reliability",
      "architecture",
      "getting-started",
      "security-privacy",
      "maintenance-alternatives",
    ]);
  });

  it("renders the decision summary followed by six semantic chapters", () => {
    renderReader();

    expect(
      [...document.querySelectorAll<HTMLElement>("[data-reader-section]")].map(
        (region) => region.dataset.readerSection,
      ),
    ).toEqual([
      "decision-summary",
      "project-fit-cautions",
      "reliability",
      "architecture",
      "getting-started",
      "security-privacy",
      "maintenance-alternatives",
    ]);

    for (const heading of [
      "Project decision summary",
      "Project-fit cautions",
      "Evidence of reliability",
      "How it broadly works",
      "Install, run, and develop",
      "Security and privacy risks",
      "Activity, maintenance, and alternatives",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
  });

  it("keeps the primary decision bounded to human evidence and out of technical scoring", () => {
    const report = completeReport();
    report.readerReport.scenarios.facts.push({
      source: "readme",
      path: "README.md",
      text: "A third bounded scenario.",
    });
    const { container } = renderReader(report);
    const summary = within(
      screen.getByRole("region", { name: "Project decision summary" }),
    );

    expect(
      summary.queryByText("A deterministic fixture repository."),
    ).toBeNull();
    expect(
      summary.queryByText(
        "This fixture demonstrates deterministic repository analysis.",
      ),
    ).toBeNull();
    const orientation = within(
      screen.getByRole("region", { name: "Project orientation" }),
    );
    expect(
      orientation.getByRole("link", {
        name: "README.md at inspected commit",
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/README.md`,
    );
    expect(summary.queryByText("A third bounded scenario.")).toBeNull();
    expect(
      summary.getByText("Sufficient evidence to continue evaluation"),
    ).toBeVisible();
    expect(
      summary.getByText("Is the license compatible with the intended use?"),
    ).toBeVisible();
    expect(summary.getByText("pnpm install")).toBeVisible();
    expect(summary.getByText("pnpm start")).toBeVisible();
    expect(summary.queryByText("pnpm dev")).toBeNull();

    expect(container).not.toHaveTextContent("67 / 100");
    expect(container).not.toHaveTextContent("Dimension scores");
    expect(container).not.toHaveTextContent("documentation.readme");
    expect(container).not.toHaveTextContent("cyclomatic");
    expect(container).not.toHaveTextContent("function length");
  });

  it.each<[ReliabilityStatus, string, string]>([
    [
      "continue-evaluation",
      "Sufficient evidence to continue evaluation",
      "有较充分证据，可以继续评估",
    ],
    [
      "verify-before-use",
      "Key gaps require verification before use",
      "存在关键缺口，使用前需要核实",
    ],
    [
      "insufficient-evidence",
      "Public evidence is insufficient to judge",
      "公开证据不足，暂时无法判断",
    ],
  ])("localizes the %s status", (status, english, chinese) => {
    const report = completeReport();
    report.readerReport.reliability.status = status;
    const { rerender } = renderReader(report, "en");

    expect(screen.getAllByText(english).length).toBeGreaterThan(0);

    rerender(<ReaderReportView report={report} language="zh-CN" />);
    expect(screen.getAllByText(chinese).length).toBeGreaterThan(0);
  });

  it("localizes the complete structure but retains repository prose in its source language", () => {
    const report = completeReport();
    report.projectBrief.excerpts = [
      {
        source: "github-description",
        text: "English purpose — 中文用途。",
        path: null,
      },
    ];
    report.readerReport.scenarios.facts = [
      {
        source: "readme",
        path: "README.md",
        text: "Source-language scenario — 原文场景。",
      },
    ];
    report.readerReport.readme.useCases = [
      {
        source: "readme",
        path: "README.md",
        text: "Source-language scenario — 原文场景。",
      },
    ];
    const { rerender } = renderReader(report, "en");

    expect(screen.getAllByText("English purpose — 中文用途。")).toHaveLength(1);
    expect(
      screen.getAllByText("Source-language scenario — 原文场景。"),
    ).toHaveLength(2);

    rerender(<ReaderReportView report={report} language="zh-CN" />);
    for (const heading of [
      "项目决策摘要",
      "项目适用性注意事项",
      "是否靠谱",
      "整体如何运作",
      "安装、运行和二次开发",
      "安全与隐私风险",
      "活跃度、维护状况和替代方案",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
    expect(screen.getAllByText("English purpose — 中文用途。")).toHaveLength(1);
    expect(
      screen.getAllByText("Source-language scenario — 原文场景。"),
    ).toHaveLength(2);
    expect(screen.getAllByText("应用程序").length).toBeGreaterThan(0);
    expect(screen.queryByText("Application")).toBeNull();
  });

  it.each<ReaderAvailability>(["available", "partial", "unavailable"])(
    "exposes coherent %s availability for the five evidence chapters",
    (availability) => {
      const report = completeReport();
      report.readerReport.scenarios.availability = availability;
      report.readerReport.reliability.availability = availability;
      report.readerReport.architecture.availability = availability;
      report.readerReport.gettingStarted.availability = availability;
      report.readerReport.securityPrivacy.availability = availability;
      report.readerReport.maintenance.availability = availability;
      renderReader(report);

      for (const section of [
        "reliability",
        "architecture",
        "getting-started",
        "security-privacy",
        "maintenance-alternatives",
      ]) {
        const region = document.querySelector(
          `[data-reader-section="${section}"]`,
        );
        expect(region).not.toBeNull();
        expect(region).toHaveAttribute(
          "data-reader-availability",
          availability,
        );
        if (availability === "partial") {
          expect(
            within(region as HTMLElement).getByText(
              "Not established from the scanned public evidence.",
            ),
          ).toBeVisible();
        }
        if (availability === "unavailable") {
          expect(
            within(region as HTMLElement).getByText(
              "Repository does not provide this evidence.",
            ),
          ).toBeVisible();
        }
      }
    },
  );

  it.each<Exclude<ReaderAvailability, "available">>(["partial", "unavailable"])(
    "keeps %s scenario availability out of the bilingual caution chapter",
    (scenarioAvailability) => {
      const report = completeReport();
      report.readerReport.scenarios.availability = scenarioAvailability;
      report.projectBrief.cautions = [
        {
          caution: "license-evidence-absent",
          source: "analysis",
          path: null,
        },
      ];
      const { container, rerender } = renderReader(report, "en");
      const cautionChapter = container.querySelector<HTMLElement>(
        '[data-reader-section="project-fit-cautions"]',
      );
      expect(cautionChapter).not.toBeNull();
      if (cautionChapter === null) throw new Error("Missing caution chapter");
      expect(cautionChapter).not.toHaveAttribute("data-reader-availability");
      expect(cautionChapter).toHaveTextContent(
        "No recognized license evidence was detected.",
      );
      expect(cautionChapter).not.toHaveTextContent(
        "Repository does not provide this evidence.",
      );
      expect(cautionChapter).not.toHaveTextContent(
        "Not established from the scanned public evidence.",
      );

      rerender(<ReaderReportView report={report} language="zh-CN" />);
      expect(cautionChapter).toHaveTextContent("未检测到受识别的许可证证据。");
      expect(cautionChapter).not.toHaveTextContent("仓库未提供这项证据。");
      expect(cautionChapter).not.toHaveTextContent(
        "无法从已扫描的公开证据中确认。",
      );
    },
  );

  it("renders hostile repository text inertly without creating request-bearing elements", () => {
    const hostile =
      '<img src="https://evil.invalid/x" onerror="alert(1)"><script>alert(2)</script>';
    const report = completeReport();
    report.projectBrief.excerpts = [
      { source: "github-description", path: null, text: hostile },
    ];
    report.readerReport.scenarios.facts = [
      { source: "readme", path: "README.md", text: hostile },
    ];

    const { container } = renderReader(report);

    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
    expect(
      container.querySelector(
        "img, script, iframe, video, audio, source, object, embed, link",
      ),
    ).toBeNull();
    expect(container.querySelector("[onerror], [src]")).toBeNull();
  });

  it("uses immutable independently encoded blob and tree links", () => {
    const report = completeReport();
    report.repository.owner = "owner name";
    report.repository.repo = "repo#name";
    report.readerReport.architecture.documents = [
      "docs & notes/architecture #1.md",
    ];
    report.readerReport.architecture.entryPoints = ["src/main entry.ts"];
    report.readerReport.architecture.sourceAreas = ["src/features & more"];
    renderReader(report);

    expect(
      screen.queryByRole("link", {
        name: "docs & notes/architecture #1.md at inspected commit",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", {
        name: "src/main entry.ts at inspected commit",
      }),
    ).toBeNull();
    const comparison = within(
      screen.getByRole("region", {
        name: "README claims and repository observations",
      }),
    );
    expect(
      comparison.getByRole("link", {
        name: "src/features & more at inspected commit",
      }),
    ).toHaveAttribute(
      "href",
      `https://github.com/owner%20name/repo%23name/tree/${commitSha}/src/features%20%26%20more`,
    );
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("labels computed status, signal, and structural fallback evidence as deterministic analysis", () => {
    const report = completeReport();
    report.readerReport.architecture.excerpts = [
      {
        source: "analysis",
        path: null,
        text: "Observed structure only.",
      },
    ];
    renderReader(report);

    const architectureFact = screen
      .getByText("Observed structure only.")
      .closest("figure");
    expect(architectureFact).not.toBeNull();
    expect(architectureFact).toHaveTextContent("Deterministic analysis");
    const architecture = within(
      screen.getByRole("region", { name: "How it broadly works" }),
    );
    const comparison = within(
      screen.getByRole("region", {
        name: "README claims and repository observations",
      }),
    );
    const ecosystemGroup = comparison
      .getByRole("heading", { name: "Observed ecosystems" })
      .closest("section");
    expect(ecosystemGroup).not.toBeNull();
    expect(ecosystemGroup).toHaveTextContent("Repository inspection evidence");
    expect(
      comparison.getByRole("link", {
        name: "src/features at inspected commit",
      }),
    ).toHaveAttribute("data-evidence-source", "tree");
    expect(architecture.queryByText("Top-level source areas")).toBeNull();
    expect(architecture.queryByText("Observed ecosystems")).toBeNull();
    expect(architecture.queryByText("Observed entry points")).toBeNull();
  });

  it("labels analysis-derived project kinds and cautions with their canonical source captions", () => {
    const report = completeReport();
    report.projectBrief.kinds = [
      { kind: "documentation", source: "analysis", path: null },
    ];
    report.projectBrief.cautions = [
      {
        caution: "license-evidence-absent",
        source: "analysis",
        path: null,
      },
    ];
    renderReader(report);

    const comparison = within(
      screen.getByRole("region", {
        name: "README claims and repository observations",
      }),
    );
    const purpose = within(
      screen.getByRole("region", { name: "Project-fit cautions" }),
    );
    const kind = comparison.getByText("Documentation project").closest("li");
    expect(kind).not.toBeNull();
    expect(kind).toHaveTextContent("Repository inspection evidence");

    const caution = purpose
      .getByText("No recognized license evidence was detected.")
      .closest("li");
    expect(caution).not.toBeNull();
    expect(caution).toHaveTextContent("Deterministic analysis");
    expect(caution).not.toHaveTextContent("Repository inspection evidence");
  });

  it("keeps broad observations in the comparison and only unique evidence in later chapters", () => {
    const report = completeReport();
    report.projectBrief.kinds = [
      { kind: "application", source: "analysis", path: null },
    ];
    report.projectBrief.cautions = [
      {
        caution: "license-evidence-absent",
        source: "analysis",
        path: null,
      },
    ];
    report.readerReport.architecture = {
      ...report.readerReport.architecture,
      excerpts: [
        {
          source: "documentation",
          path: "docs/architecture.md",
          text: "A unique broad architecture explanation.",
        },
      ],
      sourceAreas: ["src/features"],
      ecosystems: ["javascript-typescript"],
    };
    const { container } = renderReader(report);

    const comparison = within(
      screen.getByRole("region", {
        name: "README claims and repository observations",
      }),
    );
    expect(comparison.getByText("Application")).toBeVisible();
    expect(comparison.getByText("JavaScript / TypeScript")).toBeVisible();
    expect(
      comparison.getByRole("link", {
        name: "src/features at inspected commit",
      }),
    ).toBeVisible();

    const purposeElement = container.querySelector<HTMLElement>(
      '[data-reader-section="project-fit-cautions"]',
    );
    expect(purposeElement).not.toBeNull();
    if (purposeElement === null) throw new Error("Missing purpose chapter");
    const purpose = within(purposeElement);
    expect(purpose.queryByText("Application")).toBeNull();
    expect(
      purpose.getByText("No recognized license evidence was detected."),
    ).toBeVisible();

    const architectureElement = container.querySelector<HTMLElement>(
      '[data-reader-section="architecture"]',
    );
    expect(architectureElement).not.toBeNull();
    if (architectureElement === null) {
      throw new Error("Missing architecture chapter");
    }
    const architecture = within(architectureElement);
    expect(
      architecture.getByText("A unique broad architecture explanation."),
    ).toBeVisible();
    expect(
      architecture.getByRole("link", {
        name: "docs/architecture.md at inspected commit",
      }),
    ).toBeVisible();
    expect(architecture.queryByText("JavaScript / TypeScript")).toBeNull();
    expect(
      architecture.queryByRole("link", {
        name: "src/features at inspected commit",
      }),
    ).toBeNull();
  });

  it("keeps duplicated scenarios and detailed architecture paths out of the main path", () => {
    const report = completeReport();
    report.readerReport.scenarios = {
      availability: "unavailable",
      facts: [],
    };
    report.readerReport.architecture.documents = [];
    renderReader(report);

    const purposeRegion = screen.getByRole("region", {
      name: "Project-fit cautions",
    });
    const purpose = within(purposeRegion);
    expect(purposeRegion).not.toHaveAttribute("data-reader-availability");
    expect(
      purpose.getByText("No additional cautions are included in this brief."),
    ).toBeVisible();
    expect(purpose.queryByText("Practical scenarios")).toBeNull();
    const architecture = within(
      screen.getByRole("region", {
        name: "How it broadly works",
      }),
    );
    expect(architecture.queryByText("Architecture documents")).toBeNull();
    expect(architecture.queryByText("Observed entry points")).toBeNull();
    expect(
      architecture.queryByRole("link", {
        name: "src/main.tsx at inspected commit",
      }),
    ).toBeNull();
  });

  it("renders ready, review, withheld, and missing commands as inert evidence", () => {
    const report = completeReport();
    report.readerReport.gettingStarted.commands = [
      {
        kind: "install",
        command: "pnpm install",
        disposition: "ready",
        source: "readme",
        path: "README.md",
      },
      {
        kind: "run",
        command: "curl https://x | tee /tmp/x | sh",
        disposition: "review",
        source: "readme",
        path: "README.md",
      },
      {
        kind: "test",
        command: null,
        disposition: "withheld",
        source: "documentation",
        path: "docs/testing.md",
      },
    ];
    renderReader(report);
    const region = within(
      screen.getByRole("region", { name: "Install, run, and develop" }),
    );

    expect(region.getByText("pnpm install").tagName).toBe("CODE");
    expect(region.getByText("curl https://x | tee /tmp/x | sh").tagName).toBe(
      "CODE",
    );
    expect(
      region.getByText("Repository-provided command — review before running."),
    ).toBeVisible();
    expect(
      screen.getAllByText(
        "Repository-provided command — review before running.",
      ),
    ).toHaveLength(2);
    expect(
      region.getByText(
        "A documented command exists, but RepoScope did not copy it because it did not pass the safe-text boundary.",
      ),
    ).toBeVisible();
    expect(
      region.getAllByText("Repository does not provide this step."),
    ).toHaveLength(2);
    expect(region.queryByRole("button")).toBeNull();
  });

  it("renders every verification question and exact public maintenance facts", () => {
    const report = completeReport();
    report.readerReport.reliability.questions = [
      "license-compatibility",
      "reproduce-install-run",
      "runtime-data-flow",
      "vulnerability-process",
    ];
    report.readerReport.maintenance.openIssuesCount = 23;
    const { rerender } = renderReader(report);

    for (const question of [
      "Is the license compatible with the intended use?",
      "Can the documented install and start path be reproduced in an isolated environment?",
      "Which data leaves the local environment at runtime?",
      "How are vulnerabilities reported and patched?",
    ]) {
      expect(screen.getAllByText(question).length).toBeGreaterThan(0);
    }
    expect(
      screen.getByText("Open issues reported by GitHub: 23"),
    ).toBeVisible();
    expect(screen.getByText("Last push: Aug 1, 2026")).toBeVisible();
    expect(
      screen.getByText("10 elapsed UTC days (within 180 days)"),
    ).toBeVisible();

    report.readerReport.reliability.questions = ["release-compatibility"];
    rerender(<ReaderReportView report={report} language="en" />);
    expect(
      screen.getAllByText(
        "Is the last supported release compatible with the intended platform?",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("describes fractional activity bands accurately in both languages", () => {
    const report = completeReport();
    report.readerReport.maintenance.activity = {
      elapsedUtcDays: 180.5,
      band: "181-365-days",
    };
    const { rerender } = renderReader(report);

    expect(
      screen.getByText(
        "180.5 elapsed UTC days (more than 180 and up to 365 days)",
      ),
    ).toBeVisible();

    rerender(<ReaderReportView report={report} language="zh-CN" />);
    expect(
      screen.getByText("已过 180.5 个 UTC 日（超过 180 日且不超过 365 日）"),
    ).toBeVisible();

    report.readerReport.maintenance.activity = {
      elapsedUtcDays: 365.5,
      band: "over-365-days",
    };
    rerender(<ReaderReportView report={report} language="en" />);
    expect(
      screen.getByText("365.5 elapsed UTC days (over 365 days)"),
    ).toBeVisible();
  });

  it("offers only a user-initiated alternative search and fixed comparison criteria", () => {
    const report = completeReport();
    report.readerReport.alternatives.searchTerms = [
      "application",
      "repository-analysis",
      "typescript",
    ];
    const { rerender } = renderReader(report);
    const alternatives = within(
      screen.getByRole("region", {
        name: "Activity, maintenance, and alternatives",
      }),
    );
    const link = screen.getByRole("link", {
      name: "Search GitHub repositories using these evidence terms",
    });

    expect(link).toHaveAttribute(
      "href",
      "https://github.com/search?q=topic%3Aapplication%20topic%3Arepository-analysis%20topic%3Atypescript&type=repositories",
    );
    for (const criterion of [
      "Purpose",
      "License",
      "Onboarding",
      "Automated tests",
      "Security process",
      "Maintenance",
      "Ecosystem fit",
      "Operational constraints",
    ]) {
      expect(alternatives.getByText(criterion)).toBeVisible();
    }
    expect(document.body).not.toHaveTextContent("recommended competitor");

    report.readerReport.alternatives.searchTerms = [];
    rerender(<ReaderReportView report={report} language="en" />);
    expect(
      screen.queryByRole("link", {
        name: "Search GitHub repositories using these evidence terms",
      }),
    ).toBeNull();
  });

  it("keeps project-purpose source, kind, missing-purpose, and language parity", () => {
    const report = completeReport();
    report.projectBrief = {
      excerpts: [
        {
          source: "readme",
          text: "A composable public tool.",
          path: "docs & notes/README #1.md",
        },
      ],
      kinds: [
        {
          kind: "command-line-tool",
          source: "manifest",
          path: "package.json",
        },
      ],
      cautions: [],
    };
    const { rerender } = renderReader(report);

    expect(screen.getAllByText("Command-line tool").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", {
        name: "docs & notes/README #1.md at inspected commit",
      })[0],
    ).toHaveAttribute(
      "href",
      `https://github.com/owner/repo/blob/${commitSha}/docs%20%26%20notes/README%20%231.md`,
    );

    report.projectBrief.excerpts = [];
    rerender(<ReaderReportView report={report} language="en" />);
    expect(
      screen.getAllByText(
        "Public repository evidence is insufficient to explain this project reliably.",
      ).length,
    ).toBeGreaterThan(0);

    rerender(<ReaderReportView report={report} language="zh-CN" />);
    expect(screen.getAllByText("命令行工具").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("公开仓库证据不足，无法可靠说明这个项目的用途。")
        .length,
    ).toBeGreaterThan(0);
  });

  it("always states the security and privacy analysis boundary", () => {
    renderReader();

    expect(
      screen.getByText(
        "RepoScope does not execute the project, scan dependencies for vulnerabilities, observe runtime traffic, verify permissions, detect malicious behavior, or prove privacy compliance.",
      ),
    ).toBeVisible();
  });
});
