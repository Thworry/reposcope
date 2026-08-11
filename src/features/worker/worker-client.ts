import { isAnalysisReport } from "../analysis/guards";
import type { AnalysisReport, RepoRef, ScanPhase } from "../analysis/model";
import type {
  ScanProgress,
  SerializableAnalysisError,
  WorkerCommand,
} from "./protocol";

let nextRequestId = 1;

export class RepositoryAnalysisError extends Error {
  override readonly name = "RepositoryAnalysisError";

  constructor(public readonly detail: SerializableAnalysisError) {
    super(detail.kind);
  }
}

export interface RunAnalysisOptions {
  onProgress?: (progress: ScanProgress) => void;
  workerFactory?: () => Worker;
}

export interface AnalysisRun {
  promise: Promise<AnalysisReport>;
  cancel(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);

  return (
    required.every((key) =>
      Object.prototype.hasOwnProperty.call(record, key),
    ) && Object.keys(record).every((key) => allowed.has(key))
  );
}

function validProgress(value: unknown): value is ScanProgress {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "phase",
      "completedFiles",
      "totalFiles",
      "completedBytes",
      "totalBytes",
    ]) ||
    ![
      "validating",
      "repository",
      "selecting",
      "fetching",
      "analyzing",
    ].includes(String(value.phase))
  ) {
    return false;
  }

  for (const key of [
    "completedFiles",
    "totalFiles",
    "completedBytes",
    "totalBytes",
  ] as const) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) {
      return false;
    }
  }

  return (
    Number(value.completedFiles) <= Number(value.totalFiles) &&
    Number(value.completedBytes) <= Number(value.totalBytes)
  );
}

function validError(value: unknown): value is SerializableAnalysisError {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["kind"], ["status", "resetAt"]) ||
    ![
      "invalid-url",
      "not-found",
      "rate-limit",
      "empty",
      "network",
      "api",
      "invalid-response",
      "worker",
    ].includes(String(value.kind)) ||
    (value.status !== undefined &&
      (!Number.isSafeInteger(value.status) ||
        Number(value.status) < 100 ||
        Number(value.status) > 599)) ||
    (value.resetAt !== undefined && !validIsoTimestamp(value.resetAt))
  ) {
    return false;
  }

  return true;
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match =
    /^(?<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/u.exec(
      value,
    );
  const seconds = match?.groups?.seconds;
  const fraction = match?.groups?.fraction ?? "";
  const parsed = Date.parse(value);

  return (
    seconds !== undefined &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === `${seconds}.${fraction.padEnd(3, "0")}Z`
  );
}

function createWorker(): Worker {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  });
}

function abortError(): DOMException {
  return new DOMException("analysis-cancelled", "AbortError");
}

export function runAnalysis(
  ref: RepoRef,
  options: RunAnalysisOptions = {},
): AnalysisRun {
  const requestId = nextRequestId;
  nextRequestId += 1;
  const worker = options.workerFactory?.() ?? createWorker();
  let settled = false;
  let resolvePromise!: (report: AnalysisReport) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<AnalysisReport>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const cleanup = (): void => {
    worker.removeEventListener("message", onMessage);
    worker.removeEventListener("error", onWorkerError);
    worker.removeEventListener("messageerror", onWorkerError);
    worker.terminate();
  };
  const rejectOnce = (reason: unknown): void => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectPromise(reason);
  };
  const resolveOnce = (report: AnalysisReport): void => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(report);
  };
  function onMessage(event: MessageEvent<unknown>): void {
    const value = event.data;

    if (!isRecord(value) || value.requestId !== requestId) return;
    if (value.type === "progress") {
      if (
        !exactKeys(value, ["type", "requestId", "progress"]) ||
        !validProgress(value.progress)
      ) {
        rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
        return;
      }
      try {
        options.onProgress?.(value.progress);
      } catch {
        // Consumer rendering errors do not corrupt worker lifecycle.
      }
      return;
    }
    if (value.type === "complete") {
      if (
        !exactKeys(value, ["type", "requestId", "report"]) ||
        !isAnalysisReport(value.report)
      ) {
        rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
        return;
      }
      resolveOnce(value.report);
      return;
    }
    if (value.type === "error") {
      if (
        !exactKeys(value, ["type", "requestId", "error"]) ||
        !validError(value.error)
      ) {
        rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
        return;
      }
      rejectOnce(new RepositoryAnalysisError(value.error));
      return;
    }
    rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
  }
  function onWorkerError(): void {
    rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
  }

  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onWorkerError);
  worker.addEventListener("messageerror", onWorkerError);

  const command: WorkerCommand = { type: "start", requestId, ref };
  try {
    worker.postMessage(command);
  } catch {
    rejectOnce(new RepositoryAnalysisError({ kind: "worker" }));
  }

  return {
    promise,
    cancel(): void {
      if (settled) return;
      try {
        const cancelCommand: WorkerCommand = { type: "cancel", requestId };
        worker.postMessage(cancelCommand);
      } catch {
        // Termination below is authoritative.
      }
      rejectOnce(abortError());
    },
  };
}

export function toSerializableAnalysisError(
  error: unknown,
): SerializableAnalysisError | null {
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (isRecord(error) && error.name === "AbortError")
  ) {
    return null;
  }
  if (error instanceof RepositoryAnalysisError) return error.detail;

  return { kind: "worker" };
}

export const SCAN_PHASES: readonly ScanPhase[] = Object.freeze([
  "validating",
  "repository",
  "selecting",
  "fetching",
  "analyzing",
]);
