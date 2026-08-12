import { getCachedReport, setCachedReport } from "../cache/report-cache";
import {
  RepositoryAnalysisError,
  runAnalysis,
  type AnalysisRun,
  type RunAnalysisOptions,
} from "../worker/worker-client";
import type { ScanProgress } from "../worker/protocol";
import { isAnalysisReport } from "./guards";
import type { AnalysisReport, RepoRef } from "./model";

export interface AnalyzeRepositoryOptions {
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  runner?: (ref: RepoRef, options?: RunAnalysisOptions) => AnalysisRun;
  nowMs?: () => number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason;
}

export async function analyzeRepository(
  ref: RepoRef,
  options: AnalyzeRepositoryOptions = {},
): Promise<AnalysisReport> {
  const now = options.nowMs ?? Date.now;
  const startedAtMs = now();
  if (
    !Number.isSafeInteger(startedAtMs) ||
    startedAtMs < 0 ||
    !Number.isFinite(new Date(startedAtMs).getTime())
  ) {
    throw new RepositoryAnalysisError({ kind: "worker" });
  }
  const analyzedAt = new Date(startedAtMs).toISOString();
  throwIfAborted(options.signal);

  if (options.force !== true) {
    const cached = getCachedReport(ref, startedAtMs);

    if (cached !== null) return cached;
  }

  const runner = options.runner ?? runAnalysis;
  const runOptions: RunAnalysisOptions = {
    analyzedAt,
    ...(options.onProgress === undefined
      ? {}
      : { onProgress: options.onProgress }),
  };
  const run = runner(ref, runOptions);
  let rejectOnAbort!: (reason: unknown) => void;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  const abort = (): void => {
    try {
      run.cancel();
    } finally {
      rejectOnAbort(
        options.signal?.reason ??
          new DOMException("analysis-cancelled", "AbortError"),
      );
    }
  };
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    const report = await Promise.race([run.promise, abortPromise]);
    throwIfAborted(options.signal);
    if (!isAnalysisReport(report)) {
      throw new RepositoryAnalysisError({ kind: "worker" });
    }
    setCachedReport(ref, report, now());
    return report;
  } catch (error) {
    if (options.signal?.aborted === true) throw options.signal.reason;
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}
