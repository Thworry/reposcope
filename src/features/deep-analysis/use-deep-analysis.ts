import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AnalysisReport, Language } from "../analysis/model";
import { deepAnalysisApiOrigin } from "./api-origin";
import {
  DeepAnalysisClientError,
  getDeepSession,
  runDeepAnalysis,
  signOutDeepSession,
  startGitHubAuthorization,
  type DeepSession,
  type ReadyDeepSession,
} from "./client";
import { reportMatchesDeepRequest } from "./guards";
import {
  DEEP_SPECIALIST_ROLES,
  type DeepAnalysisErrorKind,
  type DeepAnalysisEvent,
  type DeepAnalysisRequest,
  type DeepAnalysisStage,
  type DeepReport,
  type DeepSpecialistRole,
} from "./model";

export type DeepAvailability =
  "disabled" | "checking" | "signed-out" | "ready" | "unavailable";

export type DeepAnalysisStatus = "idle" | "running" | "success" | "error";
export type DeepSpecialistStatus =
  "pending" | "running" | "complete" | "failed";

export interface UseDeepAnalysisResult {
  availability: DeepAvailability;
  status: DeepAnalysisStatus;
  stage: DeepAnalysisStage | null;
  specialists: Record<DeepSpecialistRole, DeepSpecialistStatus>;
  report: DeepReport | null;
  error: DeepAnalysisErrorKind | null;
  authorize(): void;
  generate(): Promise<void>;
  cancel(): void;
  signOut(): Promise<void>;
  setAutomatic(enabled: boolean): void;
  automatic: boolean;
}

export interface UseDeepAnalysisInput {
  deterministicReport: AnalysisReport | null;
  language: Language;
}

type RunService = (
  request: DeepAnalysisRequest,
  session: ReadyDeepSession,
  onEvent: (event: DeepAnalysisEvent) => void,
  options: { signal: AbortSignal },
) => Promise<DeepReport>;

export interface UseDeepAnalysisOptions {
  apiOrigin?: URL | null;
  getSession?: () => Promise<DeepSession>;
  runAnalysis?: RunService;
  startAuthorization?: () => void;
  signOutSession?: (session: ReadyDeepSession) => Promise<void>;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

interface DeepState {
  status: DeepAnalysisStatus;
  stage: DeepAnalysisStage | null;
  specialists: Record<DeepSpecialistRole, DeepSpecialistStatus>;
  report: DeepReport | null;
  error: DeepAnalysisErrorKind | null;
}

const AUTOMATIC_STORAGE_KEY = "reposcope:deep-analysis";

function pendingSpecialists(): Record<
  DeepSpecialistRole,
  DeepSpecialistStatus
> {
  return Object.fromEntries(
    DEEP_SPECIALIST_ROLES.map((role) => [role, "pending"]),
  ) as Record<DeepSpecialistRole, DeepSpecialistStatus>;
}

function initialDeepState(): DeepState {
  return {
    status: "idle",
    stage: null,
    specialists: pendingSpecialists(),
    report: null,
    error: null,
  };
}

function requestFor(
  report: AnalysisReport | null,
  language: Language,
): DeepAnalysisRequest | null {
  if (report === null) return null;
  return {
    repository: {
      owner: report.repository.owner,
      repo: report.repository.repo,
      commitSha: report.repository.commitSha,
    },
    language,
  };
}

function requestIdentity(request: DeepAnalysisRequest | null): string | null {
  if (request === null) return null;
  return JSON.stringify([
    request.repository.owner.toLocaleLowerCase("en-US"),
    request.repository.repo.toLocaleLowerCase("en-US"),
    request.repository.commitSha,
    request.language,
  ]);
}

function storedAutomatic(
  storage: Pick<Storage, "getItem"> | undefined,
): boolean {
  try {
    return storage?.getItem(AUTOMATIC_STORAGE_KEY) === "enabled";
  } catch {
    return false;
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function errorKind(error: unknown): DeepAnalysisErrorKind {
  return error instanceof DeepAnalysisClientError ? error.kind : "internal";
}

function activeRequestId(value: {
  current: { requestId: number } | null;
}): number | null {
  return value.current?.requestId ?? null;
}

/** Keeps optional expert analysis isolated from the deterministic report. */
export function useDeepAnalysis(
  input: UseDeepAnalysisInput,
  options: UseDeepAnalysisOptions = {},
): UseDeepAnalysisResult {
  const origin = useMemo(
    () =>
      options.apiOrigin === undefined
        ? deepAnalysisApiOrigin()
        : options.apiOrigin,
    [options.apiOrigin],
  );
  const originHref = origin?.origin ?? null;
  const storage = useMemo(
    () => options.storage ?? browserStorage(),
    [options.storage],
  );
  const [automatic, setAutomaticState] = useState(() =>
    storedAutomatic(storage),
  );
  const [availability, setAvailability] = useState<DeepAvailability>(() =>
    origin === null ? "disabled" : "checking",
  );
  const [session, setSession] = useState<ReadyDeepSession | null>(null);
  const [state, setState] = useState<DeepState>(initialDeepState);

  const request = useMemo(
    () => requestFor(input.deterministicReport, input.language),
    [input.deterministicReport, input.language],
  );
  const identity = requestIdentity(request);
  const renderedIdentityRef = useRef(identity);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRef = useRef<{
    controller: AbortController;
    identity: string;
    requestId: number;
  } | null>(null);
  const signingOutRef = useRef(false);
  const handledIdentityRef = useRef(identity);
  const automaticAttemptRef = useRef<string | null>(null);

  const getSessionService = options.getSession;
  const runService = options.runAnalysis;
  const authorizationService = options.startAuthorization;
  const signOutService = options.signOutSession;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      activeRef.current?.controller.abort(
        new DOMException("deep-analysis-unmounted", "AbortError"),
      );
      activeRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    renderedIdentityRef.current = identity;
    if (handledIdentityRef.current === identity) return;
    handledIdentityRef.current = identity;
    requestIdRef.current += 1;
    activeRef.current?.controller.abort(
      new DOMException("deep-analysis-identity-changed", "AbortError"),
    );
    activeRef.current = null;
    setState((current) => {
      const keepReport =
        request !== null &&
        current.report !== null &&
        reportMatchesDeepRequest(current.report, request);
      return {
        status: keepReport ? "success" : "idle",
        stage: null,
        specialists: pendingSpecialists(),
        report: keepReport ? current.report : null,
        error: null,
      };
    });
  }, [identity, request]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (originHref === null) {
      setSession(null);
      setAvailability("disabled");
      return () => {
        current = false;
      };
    }

    setAvailability("checking");
    const load =
      getSessionService ??
      (() =>
        getDeepSession({
          apiOrigin: new URL(`${originHref}/`),
          signal: controller.signal,
        }));
    void load().then(
      (nextSession) => {
        if (!current || !mountedRef.current) return;
        if (nextSession.status === "ready") {
          setSession(nextSession);
          setAvailability("ready");
        } else {
          setSession(null);
          setAvailability(nextSession.status);
        }
      },
      () => {
        if (!current || !mountedRef.current) return;
        setSession(null);
        setAvailability("unavailable");
      },
    );
    return () => {
      current = false;
      controller.abort(
        new DOMException("deep-session-check-replaced", "AbortError"),
      );
    };
  }, [getSessionService, originHref]);

  const cancel = useCallback((): void => {
    requestIdRef.current += 1;
    activeRef.current?.controller.abort(
      new DOMException("deep-analysis-cancelled", "AbortError"),
    );
    activeRef.current = null;
    setState((current) => ({
      ...current,
      status: current.report === null ? "idle" : "success",
      stage: null,
      specialists: pendingSpecialists(),
      error: null,
    }));
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    const readySession = session;
    if (request === null || identity === null) return;
    if (readySession === null) {
      setState((current) => ({
        ...current,
        status: "error",
        error:
          availability === "disabled"
            ? "disabled"
            : availability === "signed-out"
              ? "signed-out"
              : "internal",
      }));
      return;
    }
    if (activeRef.current !== null || signingOutRef.current) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const controller = new AbortController();
    activeRef.current = { controller, identity, requestId };
    setState((current) => ({
      status: "running",
      stage: null,
      specialists: pendingSpecialists(),
      report:
        current.report !== null &&
        reportMatchesDeepRequest(current.report, request)
          ? current.report
          : null,
      error: null,
    }));

    const isCurrent = (): boolean =>
      mountedRef.current &&
      requestIdRef.current === requestId &&
      activeRequestId(activeRef) === requestId &&
      renderedIdentityRef.current === identity &&
      !controller.signal.aborted;
    const onEvent = (event: DeepAnalysisEvent): void => {
      if (!isCurrent()) return;
      if (event.type === "stage") {
        setState((current) => ({ ...current, stage: event.stage }));
      } else if (event.type === "specialist") {
        setState((current) => ({
          ...current,
          specialists: {
            ...current.specialists,
            [event.role]: event.status === "started" ? "running" : event.status,
          },
        }));
      }
    };

    const execute =
      runService ??
      ((nextRequest, nextSession, emit, runOptions) =>
        runDeepAnalysis(nextRequest, nextSession, emit, {
          apiOrigin: origin,
          signal: runOptions.signal,
        }));
    try {
      const report = await execute(request, readySession, onEvent, {
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (!reportMatchesDeepRequest(report, request)) {
        throw new DeepAnalysisClientError("invalid-evidence");
      }
      setState((current) => ({
        ...current,
        status: "success",
        report,
        error: null,
      }));
    } catch (error) {
      if (
        !mountedRef.current ||
        requestIdRef.current !== requestId ||
        renderedIdentityRef.current !== identity
      ) {
        return;
      }
      const kind = controller.signal.aborted ? "cancelled" : errorKind(error);
      if (kind === "cancelled") {
        setState((current) => ({
          ...current,
          status: current.report === null ? "idle" : "success",
          stage: null,
          specialists: pendingSpecialists(),
          error: null,
        }));
      } else {
        if (kind === "signed-out") {
          setSession(null);
          setAvailability("signed-out");
        }
        setState((current) => ({
          ...current,
          status: "error",
          stage: null,
          specialists: pendingSpecialists(),
          error: kind,
        }));
      }
    } finally {
      if (activeRequestId(activeRef) === requestId) {
        activeRef.current = null;
        requestIdRef.current += 1;
      }
    }
  }, [availability, identity, origin, request, runService, session]);

  useEffect(() => {
    if (
      !automatic ||
      availability !== "ready" ||
      request === null ||
      identity === null ||
      state.status !== "idle" ||
      automaticAttemptRef.current === identity
    ) {
      return;
    }
    automaticAttemptRef.current = identity;
    void generate();
  }, [automatic, availability, generate, identity, request, state.status]);

  const authorize = useCallback((): void => {
    try {
      if (authorizationService !== undefined) {
        authorizationService();
      } else {
        startGitHubAuthorization({ apiOrigin: origin });
      }
    } catch {
      setAvailability(origin === null ? "disabled" : "unavailable");
    }
  }, [authorizationService, origin]);

  const setAutomatic = useCallback(
    (enabled: boolean): void => {
      try {
        if (enabled) {
          storage?.setItem(AUTOMATIC_STORAGE_KEY, "enabled");
        } else {
          storage?.removeItem(AUTOMATIC_STORAGE_KEY);
        }
      } catch {
        // The in-memory preference still works when storage is unavailable.
      }
      if (!enabled) automaticAttemptRef.current = null;
      setAutomaticState(enabled);
    },
    [storage],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const readySession = session;
    if (readySession === null || signingOutRef.current) return;
    signingOutRef.current = true;
    cancel();
    try {
      if (signOutService !== undefined) {
        await signOutService(readySession);
      } else {
        await signOutDeepSession(readySession, { apiOrigin: origin });
      }
      if (!mountedRef.current) return;
      setSession(null);
      setAvailability("signed-out");
      setAutomatic(false);
    } catch (error) {
      signingOutRef.current = false;
      if (!mountedRef.current) return;
      const kind = errorKind(error);
      if (kind === "signed-out") {
        setSession(null);
        setAvailability("signed-out");
        setAutomatic(false);
      }
      setState((current) => ({
        ...current,
        status: "error",
        error: kind,
      }));
    }
  }, [cancel, origin, session, setAutomatic, signOutService]);

  return {
    availability,
    status: state.status,
    stage: state.stage,
    specialists: state.specialists,
    report: state.report,
    error: state.error,
    authorize,
    generate,
    cancel,
    signOut,
    setAutomatic,
    automatic,
  };
}
