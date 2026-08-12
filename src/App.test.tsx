import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "./test/fixtures/metrics";
import { buildFindings } from "./features/rules/findings";
import { scoreProject } from "./features/rules/rules";
import type { AnalysisReport, RepoRef } from "./features/analysis/model";
import type { RepositoryAnalysisController } from "./features/analysis/use-repository-analysis";
import { App } from "./App";

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock("./features/analysis/use-repository-analysis", () => ({
  useRepositoryAnalysis: hookMock,
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
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

let controller: RepositoryAnalysisController;
let analyzeMock: Mock<(ref: RepoRef) => Promise<void>>;
let cancelMock: Mock<() => void>;

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    hookMock.mockReset();
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
  });

  it("renders the approved bilingual landing and changes language without analysis", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "Inspect a public project before you depend on it.",
      }),
    ).toBeVisible();
    expect(screen.getByText(/read-only\. no login or token/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /methodology 1\.0\.0/i }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "简体中文" }));

    expect(
      screen.getByText("在依赖一个公开项目之前，先看清它。"),
    ).toBeVisible();
    expect(analyzeMock).not.toHaveBeenCalled();
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
});
