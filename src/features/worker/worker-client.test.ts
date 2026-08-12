import { describe, expect, it, vi } from "vitest";

import {
  perfectCoverage,
  perfectCycles,
  perfectDuplicates,
  perfectGeneralMetrics,
  perfectLanguageAnalysis,
  perfectRepository,
} from "../../test/fixtures/metrics";
import type { AnalysisReport } from "../analysis/model";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import type { WorkerEvent } from "./protocol";
import { RepositoryAnalysisError, runAnalysis } from "./worker-client";

class FakeWorker extends EventTarget {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
}

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
    overall: scored.overall,
    confidence: scored.confidence,
    dimensions: scored.dimensions,
    strengths: findings.strengths,
    weaknesses: findings.weaknesses,
    coverage: perfectCoverage,
  };
}

describe("runAnalysis", () => {
  it("resolves only a valid matching completion and reports progress", async () => {
    const worker = new FakeWorker();
    const onProgress = vi.fn();
    const run = runAnalysis(
      { owner: "example", repo: "project" },
      {
        onProgress,
        workerFactory: () => worker as unknown as Worker,
        analyzedAt: "2026-08-11T12:00:00.000Z",
      },
    );
    const start = worker.postMessage.mock.calls[0]?.[0] as {
      requestId: number;
    };
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "start",
      requestId: start.requestId,
      ref: { owner: "example", repo: "project" },
      analyzedAt: "2026-08-11T12:00:00.000Z",
    });
    const progress: WorkerEvent = {
      type: "progress",
      requestId: start.requestId,
      progress: {
        phase: "fetching",
        completedFiles: 1,
        totalFiles: 2,
        completedBytes: 10,
        totalBytes: 20,
      },
    };
    worker.dispatchEvent(new MessageEvent("message", { data: progress }));
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "complete",
          requestId: start.requestId,
          report: validReport(),
        },
      }),
    );
    await expect(run.promise).resolves.toEqual(validReport());
    expect(onProgress).toHaveBeenCalledWith(progress.progress);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("posts cancel, terminates, and rejects with AbortError", async () => {
    const worker = new FakeWorker();
    const run = runAnalysis(
      { owner: "example", repo: "project" },
      { workerFactory: () => worker as unknown as Worker },
    );
    run.cancel();
    await expect(run.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "cancel" }),
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects a non-canonical injected analysis timestamp before posting", () => {
    const worker = new FakeWorker();

    expect(() =>
      runAnalysis(
        { owner: "example", repo: "project" },
        {
          analyzedAt: "not-a-time",
          workerFactory: () => worker as unknown as Worker,
        },
      ),
    ).toThrow(RepositoryAnalysisError);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed matching events without exposing their payload", async () => {
    const worker = new FakeWorker();
    const run = runAnalysis(
      { owner: "example", repo: "project" },
      { workerFactory: () => worker as unknown as Worker },
    );
    const start = worker.postMessage.mock.calls[0]?.[0] as {
      requestId: number;
    };
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "complete",
          requestId: start.requestId,
          report: { sourceText: "hostile" },
        },
      }),
    );
    await expect(run.promise).rejects.toMatchObject({
      detail: { kind: "worker" },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("ignores events for an older request ID", async () => {
    const worker = new FakeWorker();
    const onProgress = vi.fn();
    const run = runAnalysis(
      { owner: "example", repo: "project" },
      { onProgress, workerFactory: () => worker as unknown as Worker },
    );
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "progress",
          requestId: -1,
          progress: {
            phase: "fetching",
            completedFiles: 1,
            totalFiles: 1,
            completedBytes: 1,
            totalBytes: 1,
          },
        },
      }),
    );
    expect(onProgress).not.toHaveBeenCalled();
    run.cancel();
    await expect(run.promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a cyclic completion as a safe worker error", async () => {
    const worker = new FakeWorker();
    const run = runAnalysis(
      { owner: "example", repo: "project" },
      { workerFactory: () => worker as unknown as Worker },
    );
    const start = worker.postMessage.mock.calls[0]?.[0] as {
      requestId: number;
    };
    const report = validReport();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    Object.assign(report, { strengths: cyclic });
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "complete", requestId: start.requestId, report },
      }),
    );

    await expect(run.promise).rejects.toMatchObject({
      detail: { kind: "worker" },
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
