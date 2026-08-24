import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
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
import {
  DEEP_ANALYSIS_REQUEST_FIXTURE,
  DEEP_REPORT_FIXTURE,
} from "../../test/fixtures/deep-analysis";
import type { AnalysisReport, Language } from "../analysis/model";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import { DeepAnalysisClientError, type ReadyDeepSession } from "./client";
import type {
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
} from "./model";
import {
  useDeepAnalysis,
  type UseDeepAnalysisOptions,
} from "./use-deep-analysis";

const API_ORIGIN = new URL("https://api.example.test/");
const READY_SESSION = { status: "ready", csrfToken: "csrf-token" } as const;

function deterministicReport(commitSha = "a".repeat(40)): AnalysisReport {
  const analyzedAt = "2026-08-23T12:00:00.000Z";
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
      pushedAt: "2026-08-20T12:00:00.000Z",
      commitSha,
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

function readyOptions(
  overrides: Partial<UseDeepAnalysisOptions> = {},
): UseDeepAnalysisOptions {
  return {
    apiOrigin: API_ORIGIN,
    getSession: vi.fn().mockResolvedValue(READY_SESSION),
    ...overrides,
  };
}

describe("useDeepAnalysis availability", () => {
  it("makes zero session calls when the API origin is disabled", () => {
    const getSession = vi.fn();
    const report = deterministicReport();
    const options = { apiOrigin: null, getSession } as const;
    const { result } = renderHook(() =>
      useDeepAnalysis({ deterministicReport: report, language: "en" }, options),
    );
    expect(result.current.availability).toBe("disabled");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("distinguishes signed-out from a session-network failure", async () => {
    const report = deterministicReport();
    const signedOutOptions = readyOptions({
      getSession: vi.fn().mockResolvedValue({ status: "signed-out" }),
    });
    const signedOut = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: report, language: "en" },
        signedOutOptions,
      ),
    );
    await waitFor(() => {
      expect(signedOut.result.current.availability).toBe("signed-out");
    });
    signedOut.unmount();

    const unavailableOptions = readyOptions({
      getSession: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const unavailable = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: report, language: "en" },
        unavailableOptions,
      ),
    );
    await waitFor(() => {
      expect(unavailable.result.current.availability).toBe("unavailable");
    });
    await act(async () => unavailable.result.current.generate());
    expect(unavailable.result.current.error).toBe("internal");
    expect(unavailable.result.current.error).not.toBe("signed-out");
  });
});

describe("useDeepAnalysis requests", () => {
  it("tracks stages and specialists before accepting a successful report", async () => {
    const runAnalysis = vi.fn(
      (
        _request: DeepAnalysisRequest,
        _session: ReadyDeepSession,
        emit: (event: DeepAnalysisEvent) => void,
        runOptions: { signal: AbortSignal },
      ): Promise<DeepReport> => {
        expect(runOptions.signal).toBeInstanceOf(AbortSignal);
        emit({ type: "stage", stage: "preparing-evidence" });
        emit({ type: "stage", stage: "consulting-specialists" });
        emit({ type: "specialist", role: "product", status: "started" });
        emit({ type: "specialist", role: "product", status: "complete" });
        emit({ type: "complete", report: DEEP_REPORT_FIXTURE });
        return Promise.resolve(DEEP_REPORT_FIXTURE);
      },
    );
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const { result } = renderHook(() =>
      useDeepAnalysis({ deterministicReport: report, language: "en" }, options),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    await act(async () => result.current.generate());
    expect(result.current.status).toBe("success");
    expect(result.current.stage).toBe("consulting-specialists");
    expect(result.current.specialists.product).toBe("complete");
    expect(result.current.report).toEqual(DEEP_REPORT_FIXTURE);
    expect(runAnalysis).toHaveBeenCalledOnce();
    const call = runAnalysis.mock.calls[0];
    expect(call?.[0]).toEqual(DEEP_ANALYSIS_REQUEST_FIXTURE);
    expect(call?.[1]).toEqual(READY_SESSION);
    expect(call?.[3].signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves the last valid report when a same-identity retry fails", async () => {
    const runAnalysis = vi
      .fn()
      .mockResolvedValueOnce(DEEP_REPORT_FIXTURE)
      .mockRejectedValueOnce(new DeepAnalysisClientError("github-unavailable"));
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const { result } = renderHook(() =>
      useDeepAnalysis({ deterministicReport: report, language: "en" }, options),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    await act(async () => result.current.generate());
    await act(async () => result.current.generate());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("github-unavailable");
    expect(result.current.report).toEqual(DEEP_REPORT_FIXTURE);
  });

  it("rejects a returned report for a different request identity", async () => {
    const mismatched = structuredClone(DEEP_REPORT_FIXTURE);
    mismatched.repository.commitSha = "b".repeat(40);
    const options = readyOptions({
      runAnalysis: vi.fn().mockResolvedValue(mismatched),
    });
    const { result } = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: deterministicReport(), language: "en" },
        options,
      ),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });

    await act(async () => result.current.generate());

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("invalid-evidence");
    expect(result.current.report).toBeNull();
  });

  it("ignores an event emitted after its run promise has settled", async () => {
    let emitLate: ((event: DeepAnalysisEvent) => void) | undefined;
    const runAnalysis = vi.fn(
      (
        _request: DeepAnalysisRequest,
        _session: ReadyDeepSession,
        emit: (event: DeepAnalysisEvent) => void,
      ) => {
        emitLate = emit;
        return Promise.resolve(DEEP_REPORT_FIXTURE);
      },
    );
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const { result } = renderHook(() =>
      useDeepAnalysis({ deterministicReport: report, language: "en" }, options),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    await act(async () => result.current.generate());
    act(() => {
      emitLate?.({ type: "stage", stage: "editing-briefing" });
    });
    expect(result.current.status).toBe("success");
    expect(result.current.stage).toBeNull();
  });

  it("aborts an old identity and ignores all of its late events", async () => {
    const first = deferred<DeepReport>();
    let oldEmit: ((event: DeepAnalysisEvent) => void) | undefined;
    let oldSignal: AbortSignal | undefined;
    const runAnalysis = vi.fn(
      (
        _request: DeepAnalysisRequest,
        _session: ReadyDeepSession,
        emit: (event: DeepAnalysisEvent) => void,
        runOptions: { signal: AbortSignal },
      ) => {
        oldEmit = emit;
        oldSignal = runOptions.signal;
        return first.promise;
      },
    );
    const options = readyOptions({ runAnalysis });
    const { result, rerender } = renderHook(
      ({ report, language }: { report: AnalysisReport; language: Language }) =>
        useDeepAnalysis({ deterministicReport: report, language }, options),
      {
        initialProps: {
          report: deterministicReport(),
          language: "en" as Language,
        },
      },
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    let firstRun!: Promise<void>;
    act(() => {
      firstRun = result.current.generate();
    });
    rerender({ report: deterministicReport("b".repeat(40)), language: "en" });
    expect(oldSignal?.aborted).toBe(true);
    act(() => {
      oldEmit?.({ type: "complete", report: DEEP_REPORT_FIXTURE });
    });
    await act(async () => {
      first.reject(new DeepAnalysisClientError("cancelled"));
      await firstRun;
    });
    expect(result.current.report).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("clears a deep report when only the requested language changes", async () => {
    const runAnalysis = vi.fn().mockResolvedValue(DEEP_REPORT_FIXTURE);
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const { result, rerender } = renderHook(
      ({ language }: { language: Language }) =>
        useDeepAnalysis({ deterministicReport: report, language }, options),
      { initialProps: { language: "en" as Language } },
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    await act(async () => result.current.generate());
    expect(result.current.report).toEqual(DEEP_REPORT_FIXTURE);
    rerender({ language: "zh-CN" });
    expect(result.current.report).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("returns cancellation to success when a report exists, otherwise idle", async () => {
    const second = deferred<DeepReport>();
    const runAnalysis = vi
      .fn()
      .mockResolvedValueOnce(DEEP_REPORT_FIXTURE)
      .mockImplementationOnce(
        (
          _request: DeepAnalysisRequest,
          _session: ReadyDeepSession,
          _emit: (event: DeepAnalysisEvent) => void,
          runOptions: { signal: AbortSignal },
        ) => {
          runOptions.signal.addEventListener("abort", () => {
            second.reject(new DeepAnalysisClientError("cancelled"));
          });
          return second.promise;
        },
      );
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const { result } = renderHook(() =>
      useDeepAnalysis({ deterministicReport: report, language: "en" }, options),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    await act(async () => result.current.generate());
    act(() => void result.current.generate());
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(result.current.report).toEqual(DEEP_REPORT_FIXTURE);
    expect(result.current.error).toBeNull();
  });

  it("blocks generation and duplicate sign-out while sign-out is pending", async () => {
    const pendingSignOut = deferred<undefined>();
    const signOutSession = vi.fn(() => pendingSignOut.promise);
    const runAnalysis = vi.fn().mockResolvedValue(DEEP_REPORT_FIXTURE);
    const options = readyOptions({ runAnalysis, signOutSession });
    const { result } = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: deterministicReport(), language: "en" },
        options,
      ),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });

    let signOutPromise!: Promise<void>;
    act(() => {
      signOutPromise = result.current.signOut();
    });
    await act(async () => {
      await result.current.generate();
      await result.current.signOut();
    });

    expect(signOutSession).toHaveBeenCalledOnce();
    expect(runAnalysis).not.toHaveBeenCalled();

    await act(async () => {
      pendingSignOut.resolve(undefined);
      await signOutPromise;
    });
    expect(result.current.availability).toBe("signed-out");
  });

  it("clears a stale ready session when sign-out reports it expired", async () => {
    const runAnalysis = vi.fn().mockResolvedValue(DEEP_REPORT_FIXTURE);
    const expiredSignOut = deferred<undefined>();
    const signOutSession = vi.fn(() => expiredSignOut.promise);
    const options = readyOptions({ runAnalysis, signOutSession });
    const { result } = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: deterministicReport(), language: "en" },
        options,
      ),
    );
    await waitFor(() => {
      expect(result.current.availability).toBe("ready");
    });
    let signOutPromise!: Promise<void>;
    act(() => {
      result.current.setAutomatic(true);
      signOutPromise = result.current.signOut();
    });

    await act(async () => {
      expiredSignOut.reject(new DeepAnalysisClientError("signed-out"));
      await signOutPromise;
    });

    expect(result.current.availability).toBe("signed-out");
    expect(result.current.automatic).toBe(false);
    await act(async () => result.current.generate());
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(result.current.error).toBe("signed-out");
  });
});

describe("useDeepAnalysis automatic preference", () => {
  it("keeps static mode usable when the browser storage getter throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      const { result } = renderHook(() =>
        useDeepAnalysis(
          { deterministicReport: deterministicReport(), language: "en" },
          { apiOrigin: null },
        ),
      );
      expect(result.current.availability).toBe("disabled");
      expect(result.current.automatic).toBe(false);
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(window, "localStorage", descriptor);
      }
    }
  });

  it("recognizes only the exact enabled value and removes the key when off", () => {
    localStorage.setItem("reposcope:deep-analysis", "true");
    const { result } = renderHook(() =>
      useDeepAnalysis(
        { deterministicReport: null, language: "en" },
        { apiOrigin: null },
      ),
    );
    expect(result.current.automatic).toBe(false);
    act(() => {
      result.current.setAutomatic(true);
    });
    expect(localStorage.getItem("reposcope:deep-analysis")).toBe("enabled");
    act(() => {
      result.current.setAutomatic(false);
    });
    expect(localStorage.getItem("reposcope:deep-analysis")).toBeNull();
  });

  it("starts once under StrictMode when ready, consented, and idle", async () => {
    localStorage.setItem("reposcope:deep-analysis", "enabled");
    const runAnalysis = vi.fn().mockResolvedValue(DEEP_REPORT_FIXTURE);
    const options = readyOptions({ runAnalysis });
    const report = deterministicReport();
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result } = renderHook(
      () =>
        useDeepAnalysis(
          { deterministicReport: report, language: "en" },
          options,
        ),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });
    expect(runAnalysis).toHaveBeenCalledOnce();
  });
});
