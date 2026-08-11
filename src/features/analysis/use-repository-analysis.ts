import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ScanProgress,
  SerializableAnalysisError,
} from "../worker/protocol";
import { toSerializableAnalysisError } from "../worker/worker-client";
import type { AnalysisReport, RepoRef } from "./model";
import { analyzeRepository, type AnalyzeRepositoryOptions } from "./service";

export type RepositoryAnalysisStatus = "idle" | "running" | "success" | "error";

export interface RepositoryAnalysisState {
  status: RepositoryAnalysisStatus;
  progress: ScanProgress | null;
  report: AnalysisReport | null;
  error: SerializableAnalysisError | null;
}

type AnalyzeService = (
  ref: RepoRef,
  options: AnalyzeRepositoryOptions,
) => Promise<AnalysisReport>;

export interface UseRepositoryAnalysisOptions {
  analyzeService?: AnalyzeService;
}

export interface RepositoryAnalysisController extends RepositoryAnalysisState {
  analyze(ref: RepoRef): Promise<void>;
  refresh(): Promise<void>;
  cancel(): void;
  reset(): void;
}

const INITIAL_STATE: RepositoryAnalysisState = {
  status: "idle",
  progress: null,
  report: null,
  error: null,
};

export function useRepositoryAnalysis(
  options: UseRepositoryAnalysisOptions = {},
): RepositoryAnalysisController {
  const service = options.analyzeService ?? analyzeRepository;
  const [state, setState] = useState<RepositoryAnalysisState>(INITIAL_STATE);
  const activeControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastRef = useRef<RepoRef | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeControllerRef.current?.abort(
        new DOMException("analysis-unmounted", "AbortError"),
      );
      activeControllerRef.current = null;
    };
  }, []);

  const start = useCallback(
    async (
      ref: RepoRef,
      force: boolean,
      preserveReport: boolean,
    ): Promise<void> => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      activeControllerRef.current?.abort(
        new DOMException("analysis-replaced", "AbortError"),
      );
      const controller = new AbortController();
      activeControllerRef.current = controller;
      lastRef.current = { owner: ref.owner, repo: ref.repo };
      setState((current) => ({
        status: "running",
        progress: null,
        report: preserveReport ? current.report : null,
        error: null,
      }));

      try {
        const report = await service(ref, {
          force,
          signal: controller.signal,
          onProgress: (progress) => {
            if (
              mountedRef.current &&
              requestIdRef.current === requestId &&
              !controller.signal.aborted
            ) {
              setState((current) => ({ ...current, progress }));
            }
          },
        });
        if (
          mountedRef.current &&
          requestIdRef.current === requestId &&
          !controller.signal.aborted
        ) {
          setState({
            status: "success",
            progress: null,
            report,
            error: null,
          });
        }
      } catch (error) {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        const serialized = toSerializableAnalysisError(error);

        if (serialized === null || controller.signal.aborted) {
          setState((current) => ({
            ...current,
            status: current.report === null ? "idle" : "success",
            progress: null,
            error: null,
          }));
          return;
        }
        setState((current) => ({
          status: "error",
          progress: null,
          report: preserveReport ? current.report : null,
          error: serialized,
        }));
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
      }
    },
    [service],
  );

  const analyze = useCallback(
    (ref: RepoRef): Promise<void> => start(ref, false, false),
    [start],
  );
  const refresh = useCallback((): Promise<void> => {
    const ref = lastRef.current;

    return ref === null ? Promise.resolve() : start(ref, true, true);
  }, [start]);
  const cancel = useCallback((): void => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort(
      new DOMException("analysis-cancelled", "AbortError"),
    );
    activeControllerRef.current = null;
    setState((current) => ({
      ...current,
      status: current.report === null ? "idle" : "success",
      progress: null,
      error: null,
    }));
  }, []);
  const reset = useCallback((): void => {
    requestIdRef.current += 1;
    activeControllerRef.current?.abort(
      new DOMException("analysis-reset", "AbortError"),
    );
    activeControllerRef.current = null;
    lastRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { ...state, analyze, refresh, cancel, reset };
}
