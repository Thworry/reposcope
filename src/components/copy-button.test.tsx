import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnalysisReport } from "../features/analysis/model";
import { buildImprovementMarkdown } from "../i18n/messages";
import {
  perfectProjectBrief,
  perfectReaderReport,
} from "../test/fixtures/metrics";
import { CopyButton } from "./copy-button";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const report = {
  rulesetVersion: "1.0.0",
  repository: {
    owner: "owner",
    repo: "repo",
    fullName: "owner/repo",
    url: "https://github.com/owner/repo",
    description: null,
    defaultBranch: "main",
    archived: false,
    pushedAt: "2026-08-01T12:00:00.000Z",
    commitSha: "0123456789012345678901234567890123456789",
    analyzedAt: "2026-08-11T12:00:00.000Z",
  },
  projectBrief: perfectProjectBrief,
  readerReport: structuredClone(perfectReaderReport),
  overall: {
    score: 60,
    label: "needs-attention",
    generalOnly: true,
    preliminary: true,
  },
  confidence: { percent: 55, label: "low" },
  dimensions: [],
  strengths: [
    {
      ruleId: "documentation.readme",
      dimension: "documentation",
      evidence: {
        key: "evidence.documentation.readme",
        args: { exists: true },
      },
      references: [],
    },
  ],
  weaknesses: [
    {
      ruleId: "documentation.installation",
      dimension: "documentation",
      severity: "high",
      lostPoints: 3,
      evidence: {
        key: "evidence.documentation.installation",
        args: { heading: false, command: false },
      },
      recommendation: {
        key: "recommendation.documentation.installation",
        args: {},
      },
      references: [{ path: "README.md", startLine: 12, endLine: 14 }],
    },
  ],
  coverage: {
    treeComplete: true,
    eligibleFiles: 1,
    eligibleBytes: 1,
    eligibleSourceBytes: 1,
    selectedFiles: 1,
    selectedBytes: 1,
    fetchedFiles: 1,
    fetchedBytes: 1,
    parsedFiles: 0,
    parsedBytes: 0,
    parsedSupportedBytes: 0,
    skippedFiles: 0,
    failedFiles: 0,
    unsupportedFiles: 1,
    limitReached: false,
  },
} satisfies AnalysisReport;

describe("CopyButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds ordered localized Markdown without passed findings or source text", () => {
    const english = buildImprovementMarkdown(report, "en");
    const chinese = buildImprovementMarkdown(report, "zh-CN");

    expect(english).toContain("# RepoScope improvement checklist");
    expect(english).toContain("Repository: owner/repo");
    expect(english).toContain(report.repository.commitSha);
    expect(english).toContain("Ruleset: 1.0.0");
    expect(english).toContain("55% (Low confidence)");
    expect(english).toContain("general-only, preliminary");
    expect(english).toContain("documentation.installation");
    expect(english).toContain("README.md:L12-L14");
    expect(english).not.toContain("documentation.readme");
    expect(english).not.toContain("sourceText");
    expect(chinese).toContain("# RepoScope 改进清单");
    expect(chinese).toContain("项目：owner/repo");
    expect(chinese).not.toContain("高可信度");
    expect(chinese).toContain("低可信度");
  });

  it("serializes overlapping clipboard outcomes and resets only the newest status", async () => {
    vi.useFakeTimers();
    const oldWrite = deferred<undefined>();
    const newWrite = deferred<undefined>();
    const writeText = vi
      .fn()
      .mockReturnValueOnce(oldWrite.promise)
      .mockReturnValueOnce(newWrite.promise);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { unmount } = render(<CopyButton text="safe" language="en" />);
    const button = screen.getByRole("button", {
      name: "Copy improvement checklist",
    });

    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {
      newWrite.resolve(undefined);
      await newWrite.promise;
    });
    expect(screen.getByText("Copied")).toBeVisible();

    await act(async () => {
      oldWrite.reject(new Error("old"));
      await oldWrite.promise.catch(() => undefined);
    });
    expect(screen.getByText("Copied")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(screen.getByText("Copied")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText("Copied")).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
