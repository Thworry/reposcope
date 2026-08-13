import { describe, expect, it, vi } from "vitest";

import {
  perfectGeneralMetrics,
  perfectProjectBrief,
  perfectRepository,
} from "../../test/fixtures/metrics";
import type {
  LanguageAnalysis,
  ProjectBrief,
  RepoRef,
  SelectedFile,
} from "../analysis/model";
import { GitHubApiError } from "../github/github-client";
import { executeAnalysis, type AnalysisDependencies } from "./analysis.worker";
import type { WorkerEvent } from "./protocol";

const sha = "a".repeat(40);
const ref: RepoRef = { owner: "example", repo: "project" };
const analyzedAt = "2026-08-11T12:00:00.000Z";
const twoReadmeProjectBrief: ProjectBrief = {
  excerpts: [
    { source: "readme", text: "First README purpose.", path: "README.md" },
    {
      source: "readme",
      text: "Second README detail.",
      path: "README.md",
    },
  ],
  kinds: [],
  cautions: [],
};

function emptyLanguage(): LanguageAnalysis {
  return {
    files: [],
    functions: [],
    identifierOccurrences: 0,
    ambiguousIdentifierOccurrences: 0,
    exportedDeclarations: 0,
    documentedExports: 0,
    parsedBytes: 0,
    parseFailures: [],
  };
}

function selectedFiles(
  count: number,
  language: "typescript" | "python" = "typescript",
  size = 10,
): SelectedFile[] {
  const extension = language === "python" ? "py" : "ts";

  return Array.from({ length: count }, (_, index) => ({
    path: `src/file-${String(index)}.${extension}`,
    sha,
    size,
    mode: "100644",
    eligible: true,
    language,
    category: "source",
    deep: true,
    isTest: false,
    priority: 5,
    topLevelArea: "src",
  }));
}

function dependenciesFor(
  selected: SelectedFile[],
  fetchFile: AnalysisDependencies["fetchFile"],
): AnalysisDependencies & {
  fetchSnapshot: ReturnType<typeof vi.fn>;
  fetchFile: ReturnType<typeof vi.fn>;
  loadJavaScriptTypeScript: ReturnType<typeof vi.fn>;
  loadPython: ReturnType<typeof vi.fn>;
} {
  const selectedBytes = selected.reduce((sum, file) => sum + file.size, 0);

  return {
    fetchSnapshot: vi.fn().mockResolvedValue({
      repository: perfectRepository,
      commitSha: sha,
      treeSha: sha,
      entries: [],
      treeComplete: true,
      rateLimit: { remaining: 57, resetAt: null },
    }),
    normalize: vi
      .fn()
      .mockReturnValue({ files: [], complete: true, skippedEntries: [] }),
    select: vi.fn().mockReturnValue({
      treeComplete: true,
      selected,
      eligibleFiles: selected.length,
      eligibleBytes: selectedBytes,
      eligibleSourceBytes: selectedBytes,
      unsupportedFiles: 0,
      unsupportedBytes: 0,
      selectedFiles: selected.length,
      selectedBytes,
      limitReached: false,
      skipped: [],
      skipCounts: {
        excluded: 0,
        binary: 0,
        oversized: 0,
        unsupported: 0,
        budget: 0,
        "invalid-entry": 0,
      },
    }),
    fetchFile: vi.fn(fetchFile),
    analyzeGeneral: vi.fn().mockReturnValue(perfectGeneralMetrics),
    projectBrief: vi.fn().mockReturnValue(perfectProjectBrief),
    loadJavaScriptTypeScript: vi
      .fn()
      .mockResolvedValue({ analyzeJavaScriptTypeScript: emptyLanguage }),
    loadPython: vi.fn().mockResolvedValue({ analyzePython: emptyLanguage }),
    duplicate: vi.fn().mockReturnValue({
      totalEligibleTokens: 0,
      duplicatedTokens: 0,
      ratio: 0,
      evidence: [],
    }),
    cycles: vi
      .fn()
      .mockReturnValue({ components: [], largestComponentSize: 0 }),
    score: vi.fn().mockReturnValue({
      rules: [],
      dimensions: [],
      overall: {
        score: 0,
        label: "limited",
        generalOnly: true,
        preliminary: true,
      },
      confidence: { percent: 0, label: "low" },
    }),
    findings: vi.fn().mockReturnValue({ strengths: [], weaknesses: [] }),
    now: vi.fn(() => Date.parse("2026-08-11T12:00:00.000Z")),
  };
}

function eventCollector(): {
  events: WorkerEvent[];
  emit: (event: WorkerEvent) => void;
} {
  const events: WorkerEvent[] = [];

  return {
    events,
    emit: (event) => {
      events.push(event);
    },
  };
}

function completedReport(events: readonly WorkerEvent[]) {
  const complete = events.find((event) => event.type === "complete");

  expect(complete?.type).toBe("complete");
  if (complete?.type !== "complete") throw new Error("Missing completion");

  return complete.report;
}

describe("executeAnalysis", () => {
  it("emits ordered progress, bounds concurrency, and lazy loads detected parsers", async () => {
    let active = 0;
    let maximum = 0;
    const selected = selectedFiles(9);
    const dependencies = dependenciesFor(selected, async ({ path }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return { path, text: "export const value = 1", bytes: 10 };
    });
    dependencies.now = vi.fn(() => Date.parse("2030-01-01T00:00:00.000Z"));
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 7, ref, analyzedAt },
      dependencies,
      emit,
    );

    expect(maximum).toBe(6);
    expect(dependencies.fetchSnapshot).toHaveBeenCalledOnce();
    expect(dependencies.fetchFile).toHaveBeenCalledTimes(9);
    expect(dependencies.loadJavaScriptTypeScript).toHaveBeenCalledOnce();
    expect(dependencies.loadPython).not.toHaveBeenCalled();
    const report = completedReport(events);
    expect(report.repository.analyzedAt).toBe(analyzedAt);
    expect(report.projectBrief).toEqual(perfectProjectBrief);
    expect(dependencies.projectBrief).toHaveBeenCalledOnce();
    const briefCall = vi.mocked(dependencies.projectBrief).mock.calls[0];
    expect(briefCall?.[0].repository).toEqual(perfectRepository);
    expect(briefCall?.[0].tree).toEqual({
      files: [],
      complete: true,
      skippedEntries: [],
    });
    expect(briefCall?.[0].files[0]).toMatchObject({
      path: "src/file-0.ts",
      text: "export const value = 1",
    });
    expect(briefCall?.[1]).toEqual(perfectGeneralMetrics);
    const phases = events
      .filter((event) => event.type === "progress")
      .map((event) => event.progress.phase);
    expect(
      phases.filter((phase, index) => phases.indexOf(phase) === index),
    ).toEqual([
      "validating",
      "repository",
      "selecting",
      "fetching",
      "analyzing",
    ]);
    expect(JSON.stringify(events)).not.toContain("export const value");
  });

  it("caps attempts and decoded bytes while retaining a partial completion", async () => {
    const size = 64 * 1024;
    const selected = selectedFiles(205, "typescript", size);
    const dependencies = dependenciesFor(selected, ({ path }) => {
      if (path.endsWith("file-0.ts")) {
        return Promise.reject(new GitHubApiError("invalid-text"));
      }

      return Promise.resolve({ path, text: "raw-secret-body", bytes: size });
    });
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 8, ref, analyzedAt },
      dependencies,
      emit,
    );

    const report = completedReport(events);
    expect(dependencies.fetchFile.mock.calls.length).toBeLessThanOrEqual(200);
    expect(report.coverage.fetchedBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(report.coverage.limitReached).toBe(true);
    expect(report.coverage.failures).toContainEqual({
      path: "src/file-0.ts",
      stage: "fetch",
      reason: "invalid-text",
    });
    expect(JSON.stringify(report)).not.toContain("raw-secret-body");
  });

  it("serializes two README excerpts when no description excerpt exists", async () => {
    const dependencies = dependenciesFor([], () =>
      Promise.reject(new Error("must not fetch")),
    );
    vi.mocked(dependencies.projectBrief).mockReturnValue(twoReadmeProjectBrief);
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 85, ref, analyzedAt },
      dependencies,
      emit,
    );

    expect(completedReport(events).projectBrief).toEqual(twoReadmeProjectBrief);
  });

  it.each([
    ["password assignment", "password=hunter2"],
    ["GitHub token", `ghp_${"a".repeat(36)}`],
    ["PEM private key", "-----BEGIN PRIVATE KEY-----"],
  ])(
    "removes a %s from repository metadata before emitting a completion",
    async (_label, credential) => {
      const dependencies = dependenciesFor([], () =>
        Promise.reject(new Error("must not fetch")),
      );
      vi.mocked(dependencies.fetchSnapshot).mockResolvedValue({
        repository: {
          ...perfectRepository,
          description: `Purpose ${credential}`,
        },
        commitSha: "a".repeat(40),
        tree: [],
      });
      const { events, emit } = eventCollector();

      await executeAnalysis(
        { type: "start", requestId: 86, ref, analyzedAt },
        dependencies,
        emit,
      );

      const report = completedReport(events);
      expect(report.repository.description).toBeNull();
      expect(JSON.stringify(report)).not.toContain(credential);
    },
  );

  it("keeps the exact skipped total when serializable details reach their cap", async () => {
    const dependencies = dependenciesFor([], () =>
      Promise.reject(new Error("must not fetch")),
    );
    const skipped = Array.from({ length: 450 }, (_, index) => ({
      path: `excluded/file-${String(index)}.txt`,
      reason: "excluded" as const,
    }));
    vi.mocked(dependencies.select).mockReturnValue({
      treeComplete: true,
      selected: [],
      eligibleFiles: 0,
      eligibleBytes: 0,
      eligibleSourceBytes: 0,
      unsupportedFiles: 0,
      unsupportedBytes: 0,
      selectedFiles: 0,
      selectedBytes: 0,
      limitReached: false,
      skipped,
      skipCounts: {
        excluded: 450,
        binary: 0,
        oversized: 0,
        unsupported: 0,
        budget: 0,
        "invalid-entry": 0,
      },
    });
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 81, ref, analyzedAt },
      dependencies,
      emit,
    );

    const report = completedReport(events);
    expect(report.coverage.skippedFiles).toBe(450);
    expect(report.coverage.skipped).toHaveLength(400);
    expect(report.coverage.skipped?.at(-1)).toEqual({
      path: "excluded/file-399.txt",
      reason: "excluded",
    });
  });

  it("keeps project brief output outside the scoring input", async () => {
    const alternateBrief = {
      excerpts: [],
      kinds: [],
      cautions: [
        {
          caution: "insufficient-explanation" as const,
          source: "analysis" as const,
          path: null,
        },
      ],
    };
    const first = dependenciesFor([], () =>
      Promise.reject(new Error("must not fetch")),
    );
    const second = dependenciesFor([], () =>
      Promise.reject(new Error("must not fetch")),
    );
    vi.mocked(first.projectBrief).mockReturnValue(perfectProjectBrief);
    vi.mocked(second.projectBrief).mockReturnValue(alternateBrief);
    const firstEvents = eventCollector();
    const secondEvents = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 83, ref, analyzedAt },
      first,
      firstEvents.emit,
    );
    await executeAnalysis(
      { type: "start", requestId: 84, ref, analyzedAt },
      second,
      secondEvents.emit,
    );

    const firstScoreInput = vi.mocked(first.score).mock.calls[0]?.[0];
    const secondScoreInput = vi.mocked(second.score).mock.calls[0]?.[0];
    expect(firstScoreInput).toEqual(secondScoreInput);
    expect(firstScoreInput).not.toHaveProperty("projectBrief");
    expect(completedReport(firstEvents.events).projectBrief).toEqual(
      perfectProjectBrief,
    );
    expect(completedReport(secondEvents.events).projectBrief).toEqual(
      alternateBrief,
    );
  });

  it("counts selected files left unscheduled by runtime limits exactly once", async () => {
    const selected = selectedFiles(205, "typescript", 1);
    const dependencies = dependenciesFor(selected, ({ path }) =>
      Promise.resolve({ path, text: "source", bytes: 11 * 1024 * 1024 }),
    );
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 82, ref, analyzedAt },
      dependencies,
      emit,
    );

    const report = completedReport(events);
    expect(report.coverage.fetchedFiles).toBe(0);
    expect(report.coverage.failedFiles).toBe(0);
    expect(report.coverage.skippedFiles).toBe(205);
    expect(report.coverage.skipped).toHaveLength(205);
  });

  it("loads only the Python analyzer when Python is selected", async () => {
    const dependencies = dependenciesFor(
      selectedFiles(1, "python"),
      ({ path }) => Promise.resolve({ path, text: "value = 1", bytes: 9 }),
    );
    const { events, emit } = eventCollector();

    await executeAnalysis(
      { type: "start", requestId: 9, ref, analyzedAt },
      dependencies,
      emit,
    );

    expect(events.some((event) => event.type === "complete")).toBe(true);
    expect(dependencies.loadPython).toHaveBeenCalledOnce();
    expect(dependencies.loadJavaScriptTypeScript).not.toHaveBeenCalled();
  });

  it("aborts the source phase at 90 seconds and completes with timeout evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    try {
      const dependencies = dependenciesFor(
        selectedFiles(1),
        (_input, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("source phase timed out", "TimeoutError"),
                );
              },
              { once: true },
            );
          }),
      );
      dependencies.now = Date.now;
      const { events, emit } = eventCollector();
      const execution = executeAnalysis(
        { type: "start", requestId: 10, ref, analyzedAt },
        dependencies,
        emit,
      );
      await Promise.resolve();
      expect(dependencies.fetchFile).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(90_000);
      await execution;

      const report = completedReport(events);
      expect(report.coverage.limitReached).toBe(true);
      expect(report.coverage.failures).toEqual([
        {
          path: "src/file-0.ts",
          stage: "fetch",
          reason: "timeout",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops claiming new underdeclared files when the first body crosses 10 MiB", async () => {
    const selected = selectedFiles(12, "typescript", 1);
    let releaseCrossing!: () => void;
    let releaseInflight!: () => void;
    const crossing = new Promise<void>((resolve) => {
      releaseCrossing = resolve;
    });
    const inflight = new Promise<void>((resolve) => {
      releaseInflight = resolve;
    });
    const started: string[] = [];
    const dependencies = dependenciesFor(selected, async ({ path }) => {
      started.push(path);
      if (path.endsWith("file-0.ts")) {
        await crossing;
        return { path, text: "large", bytes: 10 * 1024 * 1024 + 1 };
      }

      await inflight;
      return { path, text: "small", bytes: 1 };
    });
    const { events, emit } = eventCollector();
    const execution = executeAnalysis(
      { type: "start", requestId: 11, ref, analyzedAt },
      dependencies,
      emit,
    );
    await vi.waitFor(() => {
      expect(started).toHaveLength(6);
    });
    releaseCrossing();
    await vi.waitFor(() => {
      expect(started).toHaveLength(6);
    });
    releaseInflight();
    await execution;

    const report = completedReport(events);
    expect(started).toHaveLength(6);
    expect(report.coverage.fetchedBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(report.coverage.limitReached).toBe(true);
    expect(report.coverage.skipped).toContainEqual({
      path: "src/file-0.ts",
      reason: "budget",
    });
  });
});
