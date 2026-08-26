/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectProjectBrief,
  perfectReaderReport,
  perfectRepository,
} from "./test/fixtures/metrics";
import { buildFindings } from "./features/rules/findings";
import { scoreProject } from "./features/rules/rules";
import type { AnalysisReport, RepoRef } from "./features/analysis/model";
import type { RepositoryAnalysisController } from "./features/analysis/use-repository-analysis";
import type { UseDeepAnalysisResult } from "./features/deep-analysis/use-deep-analysis";
import { App } from "./App";

const { hookMock, deepHookMock } = vi.hoisted(() => ({
  hookMock: vi.fn(),
  deepHookMock: vi.fn(),
}));

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");
const globalCss = readFileSync(
  join(process.cwd(), "src/styles/global.css"),
  "utf8",
);

vi.mock("./features/analysis/use-repository-analysis", () => ({
  useRepositoryAnalysis: hookMock,
}));

vi.mock("./features/deep-analysis/use-deep-analysis", () => ({
  useDeepAnalysis: deepHookMock,
}));

function validReport(ref: RepoRef): AnalysisReport {
  const analyzedAt = "2026-08-11T12:00:00.000Z";
  const scored = scoreProject({
    repository: perfectRepository,
    general: perfectGeneralMetrics,
    language: perfectLanguageAnalysis,
    duplicates: perfectDuplicates,
    cycles: perfectCycles,
    coverage: perfectCoverage,
    analyzedAt,
  });
  const findings = buildFindings(scored);

  return {
    rulesetVersion: "1.0.0",
    repository: {
      owner: ref.owner,
      repo: ref.repo,
      fullName: `${ref.owner}/${ref.repo}`,
      url: `https://github.com/${ref.owner}/${ref.repo}`,
      description: "fixture",
      defaultBranch: "main",
      archived: false,
      pushedAt: "2026-08-01T12:00:00.000Z",
      commitSha: "a".repeat(40),
      analyzedAt,
    },
    projectBrief: perfectProjectBrief,
    readerReport: structuredClone(perfectReaderReport),
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

let controller: RepositoryAnalysisController;
let deepState: UseDeepAnalysisResult;
let analyzeMock: Mock<(ref: RepoRef) => Promise<void>>;
let cancelMock: Mock<() => void>;

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    hookMock.mockReset();
    deepHookMock.mockReset();
    window.localStorage.clear();
    window.localStorage.setItem("reposcope:language", "en");
    window.history.replaceState(null, "", "/reposcope/");
    analyzeMock = vi.fn().mockResolvedValue(undefined);
    cancelMock = vi.fn();
    controller = {
      status: "idle",
      progress: null,
      report: null,
      error: null,
      analyze: analyzeMock,
      refresh: vi.fn().mockResolvedValue(undefined),
      cancel: cancelMock,
      reset: vi.fn(),
    };
    hookMock.mockImplementation(() => controller);
    deepState = {
      availability: "disabled",
      status: "idle",
      stage: null,
      specialists: {
        product: "pending",
        "onboarding-architecture": "pending",
        "trust-ecosystem": "pending",
      },
      report: null,
      error: null,
      authorize: vi.fn(),
      generate: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      setAutomatic: vi.fn(),
      automatic: false,
    };
    deepHookMock.mockImplementation(() => deepState);
  });

  it("renders the approved bilingual landing and changes language without analysis", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Understand a public GitHub repository—starting with its README.",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Evidence-backed guidance on what it does, how to run it, where the risks are, and whether it is worth your time.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "DAYU" })).toHaveAttribute(
      "href",
      "https://github.com/Thworry/dayu",
    );
    expect(
      screen.getByText(/pre-beta reality check focused on repository signals/i),
    ).toBeVisible();
    expect(screen.getByText(/read-only\. no login or token/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /methodology 1\.0\.0/i }),
    ).toHaveAttribute("href", "#methodology");
    expect(
      screen.getByRole("heading", { name: "Methodology 1.0.0" }),
    ).toBeVisible();
    expect(document.querySelector("#methodology")).toContainElement(
      screen.getByText(/six dimensions are documentation \(15\)/i),
    );

    await user.click(screen.getByRole("button", { name: "简体中文" }));

    expect(
      screen.getByRole("heading", {
        name: "先从 README 看懂一个公开 GitHub 仓库，再决定要不要用。",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "用可核对的公开信息讲清项目用途、上手方式、风险、维护情况和替代方案。",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "DAYU（大禹治水）" }),
    ).toHaveAttribute("href", "https://github.com/Thworry/dayu");
    expect(
      screen.getByRole("heading", { name: "分析方法 1.0.0" }),
    ).toBeVisible();
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("keeps document width fluid and declares narrow single-column reflow", () => {
    expect(globalCss).not.toMatch(/(?:html|body)\s*\{[^}]*min-width\s*:/isu);
    expect(appCss).toMatch(
      /\.site-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/isu,
    );
    expect(appCss).toMatch(
      /\.language-switcher\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/isu,
    );
    expect(appCss).toMatch(
      /\.repository-form__action-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/isu,
    );
    expect(appCss).toMatch(
      /\.site-header,\s*\.landing__intro,\s*\.repository-form,\s*\.repository-form__field,\s*\.repository-form__action-row,\s*\.privacy-note,\s*\.related-product,\s*\.scan-progress\s*\{[^}]*min-width:\s*0/isu,
    );
    expect(appCss).toMatch(
      /\.landing h1\s*\{[^}]*max-width:\s*18ch[^}]*font-size:\s*clamp\(2\.35rem,\s*5\.8vw,\s*4\.9rem\)/isu,
    );
  });

  it("changes language selection without a transient low-contrast color transition", () => {
    const languageButtonRule =
      /\.language-switcher button\s*\{(?<body>[^}]*)\}/isu.exec(appCss)?.groups
        ?.body ?? "";

    expect(languageButtonRule).not.toMatch(
      /transition(?:-property)?\s*:[^;]*(?:color|background-color)/iu,
    );
    expect(appCss).toMatch(
      /\.primary-action,\s*\.secondary-action\s*\{[^}]*transition:\s*background-color/isu,
    );
  });

  it("replaces absolute local-only claims when optional expert mode is configured", () => {
    deepState = { ...deepState, availability: "ready" };
    render(<App />);

    expect(
      screen.getByText(
        "The deterministic scan stays in this browser. An expert briefing runs only after authorization and sends selected public evidence to GitHub Copilot.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Repository source remains untrusted text and is never executed. The deterministic scan is local; only an authorized expert run sends selected public evidence to GitHub Copilot with zero tools.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/read-only\. no login or token/iu)).toBeNull();
    expect(
      screen.queryByText(/no login, token, backend, AI service/iu),
    ).toBeNull();
  });

  it("gives native report controls the same visible three-pixel focus ring", () => {
    expect(globalCss).toMatch(
      /button:focus-visible,\s*input:focus-visible,\s*select:focus-visible,\s*summary:focus-visible,\s*a:focus-visible\s*\{[^}]*outline:\s*var\(--focus-width\)\s+solid/isu,
    );
  });

  it("auto-starts one valid shared-query analysis and never records it again", async () => {
    window.history.replaceState(null, "", "?repo=owner%2Frepo");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(analyzeMock).toHaveBeenCalledOnce();
    });
    expect(analyzeMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
    });
    expect(screen.getByRole("textbox")).toHaveValue(
      "https://github.com/owner/repo",
    );

    rerender(<App />);
    expect(analyzeMock).toHaveBeenCalledOnce();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each([
    "?repo=owner%2Frepo&repo=other%2Frepo",
    "?repo=owner%2Frepo%2Fissues",
    "?repo=owner%2Frepo%2Egit",
  ])("rejects an invalid or duplicate shared query: %s", async (search) => {
    window.history.replaceState(null, "", search);
    render(<App />);

    await Promise.resolve();
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("updates history only after a successful manual analysis", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "?previous=1");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { rerender } = render(<App />);

    await user.type(
      screen.getByRole("textbox"),
      "https://github.com/owner/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Analyze repository" }),
    );

    expect(analyzeMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
    });
    expect(replaceState).not.toHaveBeenCalled();

    controller = {
      ...controller,
      status: "success",
      report: validReport({ owner: "owner", repo: "repo" }),
    };
    rerender(<App />);

    await waitFor(() => {
      expect(replaceState).toHaveBeenCalledWith(null, "", "?repo=owner%2Frepo");
    });
  });

  it("preserves the prior URL when manual analysis fails", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "?keep=1");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { rerender } = render(<App />);

    await user.type(
      screen.getByRole("textbox"),
      "https://github.com/owner/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Analyze repository" }),
    );
    controller = {
      ...controller,
      status: "error",
      error: { kind: "network" },
    };
    rerender(<App />);

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?keep=1");
  });

  it("renders hook-owned real progress and delegates cancellation", async () => {
    const user = userEvent.setup();
    controller = {
      ...controller,
      status: "running",
      progress: {
        phase: "fetching",
        completedFiles: 12,
        totalFiles: 24,
        completedBytes: 1_024,
        totalBytes: 4_096,
      },
    };
    render(<App />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
    await user.click(screen.getByRole("button", { name: "Cancel analysis" }));
    expect(cancelMock).toHaveBeenCalledOnce();
  });

  it("renders a successful report, reuses the sole methodology target, and refreshes public data", async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    controller = {
      ...controller,
      status: "success",
      report: validReport({ owner: "owner", repo: "repo" }),
      refresh: refreshMock,
    };

    const { container } = render(<App />);

    expect(
      screen.getByRole("heading", { level: 2, name: "owner/repo" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Understand a public GitHub repository—starting with its README.",
      }),
    ).toBeInTheDocument();
    expect(container.querySelector(".landing")).toHaveClass("landing--compact");
    expect(screen.getByRole("link", { name: "View report" })).toHaveAttribute(
      "href",
      "#report-title",
    );
    expect(document.querySelectorAll("#methodology")).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "Methodology" })).toHaveLength(
      1,
    );
    await user.click(
      screen.getByRole("button", { name: "Refresh public data" }),
    );
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("moves focus to a newly completed manual report", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    await user.type(
      screen.getByRole("textbox"),
      "https://github.com/owner/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Analyze repository" }),
    );

    controller = {
      ...controller,
      status: "success",
      report: validReport({ owner: "owner", repo: "repo" }),
    };
    rerender(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 2, name: "owner/repo" }),
      ).toHaveFocus();
    });
  });

  it("shows a safe refresh error and stale timestamp without clearing the prior report or URL", () => {
    window.history.replaceState(null, "", "?repo=owner%2Frepo");
    const report = validReport({ owner: "owner", repo: "repo" });
    controller = {
      ...controller,
      status: "error",
      report,
      error: { kind: "network" },
    };

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /network request failed/i,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "owner/repo" }),
    ).toBeVisible();
    expect(screen.getByText(/showing the report from/i)).toBeVisible();
    expect(window.location.search).toBe("?repo=owner%2Frepo");
  });
});
