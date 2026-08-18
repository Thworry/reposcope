import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectProjectBrief,
  perfectReaderReport,
  perfectRepository,
} from "../../test/fixtures/metrics";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import type { AnalysisReport, RepoRef } from "./model";
import type { AnalyzeRepositoryOptions } from "./service";
import { useRepositoryAnalysis } from "./use-repository-analysis";

function validReport(): AnalysisReport {
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
      owner: "example",
      repo: "project",
      fullName: "example/project",
      url: "https://github.com/example/project",
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("useRepositoryAnalysis", () => {
  it("ignores stale completion and old progress after starting a newer run", async () => {
    const first = deferred<ReturnType<typeof validReport>>();
    const second = deferred<ReturnType<typeof validReport>>();
    const signals: AbortSignal[] = [];
    const analyzeService = vi
      .fn()
      .mockImplementationOnce(
        (_ref: RepoRef, options: AnalyzeRepositoryOptions) => {
          if (options.signal !== undefined) signals.push(options.signal);
          options.onProgress?.({
            phase: "fetching",
            completedFiles: 1,
            totalFiles: 2,
            completedBytes: 1,
            totalBytes: 2,
          });
          return first.promise;
        },
      )
      .mockImplementationOnce(
        (_ref: RepoRef, options: AnalyzeRepositoryOptions) => {
          if (options.signal !== undefined) signals.push(options.signal);
          return second.promise;
        },
      );
    const { result } = renderHook(() =>
      useRepositoryAnalysis({ analyzeService }),
    );
    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.analyze({ owner: "one", repo: "repo" });
    });
    act(() => {
      secondRun = result.current.analyze({ owner: "two", repo: "repo" });
    });
    expect(signals[0]?.aborted).toBe(true);
    const secondReport = validReport();
    secondReport.repository.owner = "two";
    await act(async () => {
      second.resolve(secondReport);
      await secondRun;
    });
    await act(async () => {
      first.resolve(validReport());
      await firstRun;
    });
    expect(result.current.report?.repository.owner).toBe("two");
  });

  it("refreshes with force and preserves a report on refresh failure", async () => {
    const report = validReport();
    const analyzeService = vi
      .fn()
      .mockResolvedValueOnce(report)
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() =>
      useRepositoryAnalysis({ analyzeService }),
    );
    await act(async () => {
      await result.current.analyze({ owner: "example", repo: "project" });
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(analyzeService).toHaveBeenLastCalledWith(
      { owner: "example", repo: "project" },
      expect.objectContaining({ force: true }),
    );
    expect(result.current.report).toEqual(report);
    expect(result.current.status).toBe("error");
  });

  it("cancels on unmount without surfacing abort", () => {
    const analyzeService = vi.fn(
      (_ref: RepoRef, options: AnalyzeRepositoryOptions) =>
        new Promise<ReturnType<typeof validReport>>((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new DOMException("cancelled", "AbortError"));
          });
        }),
    );
    const { result, unmount } = renderHook(() =>
      useRepositoryAnalysis({ analyzeService }),
    );
    act(() => {
      void result.current.analyze({ owner: "example", repo: "project" });
    });
    unmount();
    expect(analyzeService).toHaveBeenCalledOnce();
  });
});
