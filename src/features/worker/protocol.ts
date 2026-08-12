import type { AnalysisReport, RepoRef, ScanPhase } from "../analysis/model";

export interface ScanProgress {
  phase: ScanPhase;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
}

export interface SerializableAnalysisError {
  kind:
    | "invalid-url"
    | "not-found"
    | "rate-limit"
    | "empty"
    | "network"
    | "api"
    | "invalid-response"
    | "worker";
  status?: number;
  resetAt?: string;
}

export type WorkerCommand =
  | {
      type: "start";
      requestId: number;
      ref: RepoRef;
      analyzedAt: string;
    }
  | { type: "cancel"; requestId: number };

export type WorkerEvent =
  | { type: "progress"; requestId: number; progress: ScanProgress }
  | { type: "complete"; requestId: number; report: AnalysisReport }
  | {
      type: "error";
      requestId: number;
      error: SerializableAnalysisError;
    };
