import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";
import type {
  CopilotClientOptions,
  PermissionHandler,
  SessionConfig,
} from "@github/copilot-sdk";

import type { PanelPrompt } from "./model.js";
import { PANEL_PROMPT_CODE_POINT_LIMIT } from "./prompts.js";
import {
  allocatePanelModels,
  highestSupportedReasoningEffort,
  modelForPanelRole,
  normalizePanelModelCandidates,
} from "./model-selection.js";
import type {
  PanelModelAllocation,
  PanelModelCandidate,
  PanelReasoningEffort,
  PanelModelRole,
} from "./model-selection.js";

export const PANEL_MODEL_TIMEOUT_MS = 60_000;
export const PANEL_MODEL_CLEANUP_TIMEOUT_MS = 5_000;
export const PANEL_MODEL_SESSION_IDLE_TIMEOUT_SECONDS = 90;
export const PANEL_MODEL_RESPONSE_CODE_POINT_LIMIT = 256_000;

const TEMPORARY_DIRECTORY_PREFIX = "reposcope-copilot-";
const EXCLUDED_TOOL_PATTERNS = Object.freeze([
  "builtin:*",
  "mcp:*",
  "custom:*",
]);

export type PanelModelGatewayErrorKind =
  | "aborted"
  | "closed"
  | "invalid-response"
  | "invalid-request"
  | "open-failed"
  | "timeout"
  | "transport";

export class PanelModelGatewayError extends Error {
  readonly kind: PanelModelGatewayErrorKind;

  constructor(kind: PanelModelGatewayErrorKind) {
    super(`panel-model-${kind}`);
    this.name = "PanelModelGatewayError";
    this.kind = kind;
  }
}

export interface PanelModelRequest {
  readonly role: PanelModelRole;
  readonly prompt: PanelPrompt;
}

export interface PanelSdkSession {
  readonly sessionId: string;
  sendAndWait(options: { prompt: string }, timeout?: number): Promise<unknown>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface PanelSdkClient {
  start(): Promise<void>;
  listModels(): Promise<unknown>;
  createSession(config: SessionConfig): Promise<PanelSdkSession>;
  deleteSession(sessionId: string): Promise<void>;
  stop(): Promise<Error[]>;
  forceStop(): Promise<void>;
}

export type PanelSdkFactory = (
  options: Readonly<CopilotClientOptions>,
) => PanelSdkClient;

export interface PanelModelGatewayOptions {
  readonly createClient?: PanelSdkFactory;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly requestTimeoutMs?: number;
  readonly cleanupTimeoutMs?: number;
  readonly sessionIdleTimeoutSeconds?: number;
}

export interface PanelModelRun extends AsyncDisposable {
  readonly allocation: PanelModelAllocation;
  readonly candidates: readonly PanelModelCandidate[];
  runJson(request: PanelModelRequest): Promise<string>;
  close(): Promise<void>;
}

interface TemporaryDirectory {
  readonly path: string;
  readonly root: string;
}

interface SettledWithin<T> {
  readonly status: "fulfilled" | "rejected" | "timed-out";
  readonly value?: T;
}

type OperationOutcome<T> =
  | { readonly status: "fulfilled"; readonly value: T }
  | { readonly status: "rejected"; readonly error: unknown };

interface TerminalStopResult {
  readonly clean: boolean;
  readonly forced: boolean;
}

type TemporaryDirectoryRemovalResult =
  "failed" | "missing" | "removed" | "unsafe";

type RunCancellationKind = "aborted" | "closed";

class SessionAttemptError extends Error {
  readonly stage: "create" | "response";
  readonly kind:
    "aborted" | "closed" | "invalid-response" | "timeout" | "transport";

  constructor(
    stage: "create" | "response",
    kind: "aborted" | "closed" | "invalid-response" | "timeout" | "transport",
  ) {
    super("panel-model-session-attempt-failed");
    this.stage = stage;
    this.kind = kind;
  }
}

class PendingOperationTracker {
  private readonly pending = new Set<Promise<void>>();

  track<T>(operation: Promise<T>): Promise<OperationOutcome<T>> {
    const settlement: Promise<OperationOutcome<T>> = operation.then(
      (value) => ({ status: "fulfilled", value }),
      (error: unknown) => ({ status: "rejected", error }),
    );
    const completion = settlement.then(() => undefined);
    this.pending.add(completion);
    const remove = () => {
      this.pending.delete(completion);
    };
    void completion.then(remove, remove);
    return settlement;
  }

  snapshot(): Promise<void>[] {
    return [...this.pending];
  }

  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all(this.snapshot());
    }
  }
}

class RunCancellation {
  private currentKind: RunCancellationKind | undefined;
  private readonly resolveCancellation: (kind: RunCancellationKind) => void;
  private readonly onCallerAbort = () => {
    this.observe("aborted");
  };
  private readonly onClose = () => {
    this.observe("closed");
  };
  readonly promise: Promise<RunCancellationKind>;

  constructor(
    private readonly callerSignal: AbortSignal,
    private readonly closeSignal: AbortSignal,
  ) {
    let resolveCancellation: (kind: RunCancellationKind) => void = () =>
      undefined;
    this.promise = new Promise((resolve) => {
      resolveCancellation = resolve;
    });
    this.resolveCancellation = resolveCancellation;
    if (callerSignal.aborted) {
      this.observe("aborted");
      return;
    }
    if (closeSignal.aborted) {
      this.observe("closed");
      return;
    }
    callerSignal.addEventListener("abort", this.onCallerAbort, { once: true });
    closeSignal.addEventListener("abort", this.onClose, { once: true });
  }

  get kind(): RunCancellationKind | undefined {
    return this.currentKind;
  }

  throwIfCancelled(stage: "create" | "response"): void {
    if (this.currentKind !== undefined) {
      throw new SessionAttemptError(stage, this.currentKind);
    }
  }

  dispose(): void {
    this.callerSignal.removeEventListener("abort", this.onCallerAbort);
    this.closeSignal.removeEventListener("abort", this.onClose);
  }

  private observe(kind: RunCancellationKind): void {
    if (this.currentKind !== undefined) {
      return;
    }
    this.currentKind = kind;
    this.resolveCancellation(kind);
    this.dispose();
  }
}

const alwaysDenyPermission: PermissionHandler = () => ({
  kind: "reject",
  feedback: "No tools are available for this analysis session.",
});

function finitePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function ownDataProperty(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? (descriptor.value as unknown)
      : undefined;
  } catch {
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  try {
    if (Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function snapshotPrompt(value: unknown): PanelPrompt | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const system = ownDataProperty(value, "system");
  const user = ownDataProperty(value, "user");
  if (
    typeof system !== "string" ||
    typeof user !== "string" ||
    system.length === 0 ||
    user.length === 0 ||
    system.length + user.length > PANEL_PROMPT_CODE_POINT_LIMIT ||
    Array.from(system).length + Array.from(user).length >
      PANEL_PROMPT_CODE_POINT_LIMIT
  ) {
    return null;
  }
  return Object.freeze({ system, user });
}

function snapshotPanelModelRequest(value: unknown): PanelModelRequest | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const role = ownDataProperty(value, "role");
  if (
    role !== "product" &&
    role !== "onboarding-architecture" &&
    role !== "trust-ecosystem" &&
    role !== "skeptic" &&
    role !== "editor"
  ) {
    return null;
  }
  const prompt = snapshotPrompt(ownDataProperty(value, "prompt"));
  return prompt === null ? null : Object.freeze({ role, prompt });
}

function snapshotAssistantContent(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const type = ownDataProperty(value, "type");
  const data = ownDataProperty(value, "data");
  if (type !== "assistant.message" || !isPlainRecord(data)) {
    return null;
  }
  const content = ownDataProperty(data, "content");
  if (
    typeof content !== "string" ||
    content.length === 0 ||
    content.length > PANEL_MODEL_RESPONSE_CODE_POINT_LIMIT ||
    Array.from(content).length > PANEL_MODEL_RESPONSE_CODE_POINT_LIMIT
  ) {
    return null;
  }
  return content;
}

function assertOAuthToken(token: unknown): asserts token is string {
  if (
    typeof token !== "string" ||
    !/^gho_[A-Za-z0-9_]+$/u.test(token) ||
    token.length > 512
  ) {
    throw new PanelModelGatewayError("invalid-request");
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new PanelModelGatewayError("aborted");
  }
}

export function scrubCopilotRuntimeEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
): Record<string, string> {
  const allowedKeys = [
    "PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
  ] as const;
  const scrubbed: Record<string, string> = {};
  for (const key of allowedKeys) {
    const value = ownDataProperty(environment, key);
    if (typeof value === "string" && value.length > 0) {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

async function createTemporaryDirectory(): Promise<TemporaryDirectory> {
  const root = await realpath(tmpdir());
  const path = await mkdtemp(join(root, TEMPORARY_DIRECTORY_PREFIX));
  return { path, root };
}

function isMissingFileError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    ownDataProperty(error, "code") === "ENOENT"
  );
}

async function removeVerifiedTemporaryDirectoryAttempt(
  temporaryDirectory: TemporaryDirectory,
): Promise<TemporaryDirectoryRemovalResult> {
  try {
    const expectedRoot = resolve(temporaryDirectory.root);
    const expectedPath = resolve(temporaryDirectory.path);
    const suffix = basename(expectedPath).slice(
      TEMPORARY_DIRECTORY_PREFIX.length,
    );
    if (
      dirname(expectedPath) !== expectedRoot ||
      !basename(expectedPath).startsWith(TEMPORARY_DIRECTORY_PREFIX) ||
      !/^[A-Za-z0-9_-]{6,}$/u.test(suffix)
    ) {
      return "unsafe";
    }
    const [metadata, canonicalPath] = await Promise.all([
      lstat(expectedPath),
      realpath(expectedPath),
    ]);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      canonicalPath !== expectedPath
    ) {
      return "unsafe";
    }
    await rm(expectedPath, { recursive: true, force: false });
    return "removed";
  } catch (error) {
    // Cleanup is deliberately best-effort and never widens the deletion target.
    return isMissingFileError(error) ? "missing" : "failed";
  }
}

async function removeVerifiedTemporaryDirectory(
  temporaryDirectory: TemporaryDirectory,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result =
      await removeVerifiedTemporaryDirectoryAttempt(temporaryDirectory);
    if (result === "removed" || result === "missing") {
      return true;
    }
    if (result === "unsafe") {
      return false;
    }
    // Re-verify the path from scratch before every retry. This yields to any
    // in-flight handle cleanup without ever broadening the deletion target.
    await Promise.resolve();
  }
  return false;
}

async function settledWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<SettledWithin<T>> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<SettledWithin<T>>((resolveTimeout) => {
    timer = setTimeout(() => {
      resolveTimeout({ status: "timed-out" });
    }, timeoutMs);
  });
  const operation: Promise<SettledWithin<T>> = promise.then(
    (value) => ({ status: "fulfilled", value }),
    () => ({ status: "rejected" }),
  );
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function openOperationWithin<T>(
  settlement: Promise<OperationOutcome<T>>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  throwIfAborted(signal);
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new PanelModelGatewayError("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new PanelModelGatewayError("timeout"));
    }, timeoutMs);
  });
  try {
    const outcome = await Promise.race([settlement, cancelled]);
    if (outcome.status === "rejected") {
      throw new PanelModelGatewayError("open-failed");
    }
    return outcome.value;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (onAbort !== undefined) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

async function raceRunOperation<T>(
  settlement: Promise<OperationOutcome<T>>,
  cancellation: RunCancellation,
  timeoutMs: number,
  stage: "create" | "response",
): Promise<OperationOutcome<T>> {
  cancellation.throwIfCancelled(stage);
  let timer: NodeJS.Timeout | undefined;
  const cancelled = cancellation.promise.then<never>((kind) => {
    throw new SessionAttemptError(stage, kind);
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new SessionAttemptError(stage, "timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([settlement, cancelled, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function terminalStopClient(
  client: PanelSdkClient,
  timeoutMs: number,
): Promise<TerminalStopResult> {
  const stopped = await settledWithin(
    Promise.resolve().then(async () => await client.stop()),
    timeoutMs,
  );
  let cleanStop = false;
  if (stopped.status === "fulfilled") {
    try {
      cleanStop = Array.isArray(stopped.value) && stopped.value.length === 0;
    } catch {
      cleanStop = false;
    }
  }
  if (cleanStop) {
    return { clean: true, forced: false };
  }
  await settledWithin(
    Promise.resolve().then(async () => {
      await client.forceStop();
    }),
    timeoutMs,
  );
  return { clean: false, forced: true };
}

function reasoningEffortForRole(
  role: PanelModelRole,
  modelId: string | null,
  candidates: readonly PanelModelCandidate[],
): PanelReasoningEffort | undefined {
  if ((role !== "skeptic" && role !== "editor") || modelId === null) {
    return undefined;
  }
  return highestSupportedReasoningEffort(
    candidates.find((candidate) => candidate.id === modelId),
  );
}

function sessionConfig(
  sessionId: string,
  token: string,
  workingDirectory: string,
  prompt: PanelPrompt,
  model: string | null,
  reasoningEffort: PanelReasoningEffort | undefined,
): SessionConfig {
  return {
    sessionId,
    clientName: "reposcope",
    gitHubToken: token,
    ...(model === null ? {} : { model }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    workingDirectory,
    tools: [],
    canvases: [],
    commands: [],
    mcpServers: {},
    customAgents: [],
    skillDirectories: [],
    pluginDirectories: [],
    instructionDirectories: [],
    additionalDirectories: [],
    availableTools: [],
    excludedTools: [...EXCLUDED_TOOL_PATTERNS],
    toolSearch: { enabled: false },
    systemMessage: { mode: "append", content: prompt.system },
    enableConfigDiscovery: false,
    skipCustomInstructions: true,
    customAgentsLocalOnly: true,
    enableExperimentalMode: false,
    requestCanvasRenderer: false,
    requestExtensions: false,
    enableMcpApps: false,
    enableCitations: false,
    enableFileChangeTracking: false,
    enableSessionTelemetry: false,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableSessionStore: false,
    enableSkills: false,
    skipEmbeddingRetrieval: true,
    embeddingCacheStorage: "in-memory",
    infiniteSessions: { enabled: false },
    memory: { enabled: false },
    mcpOAuthTokenStorage: "in-memory",
    remoteSession: "off",
    streaming: false,
    includeSubAgentStreamingEvents: false,
    coauthorEnabled: false,
    manageScheduleEnabled: false,
    onPermissionRequest: alwaysDenyPermission,
  };
}

interface ActiveSessionRecord {
  readonly sessionId: string;
  readonly session: PanelSdkSession;
}

interface SessionCleanupState {
  requireAbort: boolean;
  promise: Promise<void>;
}

class IsolatedPanelModelRun implements PanelModelRun {
  readonly candidates: readonly PanelModelCandidate[];

  private currentAllocation: PanelModelAllocation;
  private readonly closeController = new AbortController();
  private readonly operationTracker = new PendingOperationTracker();
  private readonly activeRuns = new Set<Promise<unknown>>();
  private readonly activeSessions = new Map<
    PanelSdkSession,
    ActiveSessionRecord
  >();
  private readonly abortPromises = new WeakMap<
    PanelSdkSession,
    Promise<boolean>
  >();
  private readonly cleanupStates = new WeakMap<
    PanelSdkSession,
    SessionCleanupState
  >();
  private readonly cleanupPromises = new Set<Promise<void>>();
  private readonly pendingSessionCleanup = new Set<Promise<unknown>>();
  private readonly internalTasks = new Set<Promise<void>>();
  private readonly deletionPromises = new Map<string, Promise<boolean>>();
  private terminalStopTail: Promise<void> = Promise.resolve();
  private closePromise: Promise<void> | undefined;
  private lateTerminalPromise: Promise<void> | undefined;
  private closing = false;
  private everForced = false;
  private temporaryDirectoryRemoved = false;

  constructor(
    private readonly client: PanelSdkClient,
    private readonly token: string,
    private readonly signal: AbortSignal,
    private readonly temporaryDirectory: TemporaryDirectory,
    candidates: readonly PanelModelCandidate[],
    allocation: PanelModelAllocation,
    private readonly requestTimeoutMs: number,
    private readonly cleanupTimeoutMs: number,
  ) {
    this.candidates = Object.freeze([...candidates]);
    this.currentAllocation = allocation;
  }

  get allocation(): PanelModelAllocation {
    return { ...this.currentAllocation };
  }

  runJson(request: PanelModelRequest): Promise<string> {
    if (this.closing) {
      return Promise.reject(new PanelModelGatewayError("closed"));
    }
    if (this.signal.aborted) {
      return Promise.reject(new PanelModelGatewayError("aborted"));
    }
    const cancellation = new RunCancellation(
      this.signal,
      this.closeController.signal,
    );
    const operation = this.runJsonInternal(request, cancellation).finally(
      () => {
        cancellation.dispose();
      },
    );
    this.activeRuns.add(operation);
    const remove = () => {
      this.activeRuns.delete(operation);
    };
    void operation.then(remove, remove);
    return operation;
  }

  private async runJsonInternal(
    request: PanelModelRequest,
    cancellation: RunCancellation,
  ): Promise<string> {
    cancellation.throwIfCancelled("create");
    const acceptedRequest = snapshotPanelModelRequest(request);
    if (acceptedRequest === null) {
      throw new PanelModelGatewayError("invalid-request");
    }
    const { prompt, role } = acceptedRequest;
    const model = modelForPanelRole(this.currentAllocation, role);
    const effort = reasoningEffortForRole(role, model, this.candidates);
    try {
      return await this.runAttempt(prompt, model, effort, cancellation);
    } catch (error) {
      const cancellationError = this.cancellationPublicError(cancellation);
      if (cancellationError !== null) {
        throw cancellationError;
      }
      if (
        !this.closing &&
        model !== null &&
        error instanceof SessionAttemptError &&
        error.stage === "create" &&
        error.kind === "transport"
      ) {
        cancellation.throwIfCancelled("create");
        this.markRoleAutomatic(role);
        try {
          return await this.runAttempt(prompt, null, undefined, cancellation);
        } catch (fallbackError) {
          const fallbackCancellationError =
            this.cancellationPublicError(cancellation);
          if (fallbackCancellationError !== null) {
            throw fallbackCancellationError;
          }
          throw this.publicError(fallbackError);
        }
      }
      throw this.publicError(error);
    }
  }

  private async runAttempt(
    prompt: PanelPrompt,
    model: string | null,
    reasoningEffort: PanelReasoningEffort | undefined,
    cancellation: RunCancellation,
  ): Promise<string> {
    cancellation.throwIfCancelled("create");
    const sessionId = `reposcope-panel-${randomUUID()}`;
    const session = await this.createBoundedSession(
      sessionConfig(
        sessionId,
        this.token,
        this.temporaryDirectory.path,
        prompt,
        model,
        reasoningEffort,
      ),
      cancellation,
    );
    const record = { sessionId, session };
    this.activeSessions.set(session, record);
    let requireAbort = false;
    let content: string | undefined;
    try {
      cancellation.throwIfCancelled("response");
      const response = await this.sendBounded(
        session,
        prompt.user,
        cancellation,
      );
      cancellation.throwIfCancelled("response");
      const acceptedContent = snapshotAssistantContent(response);
      if (acceptedContent === null) {
        throw new SessionAttemptError("response", "invalid-response");
      }
      content = acceptedContent;
    } catch (error) {
      requireAbort =
        this.closing ||
        cancellation.kind !== undefined ||
        (error instanceof SessionAttemptError && error.kind === "timeout");
      throw error;
    } finally {
      await this.cleanupSession(record, requireAbort);
    }
    cancellation.throwIfCancelled("response");
    return content;
  }

  private async createBoundedSession(
    config: SessionConfig,
    cancellation: RunCancellation,
  ): Promise<PanelSdkSession> {
    const invocation = { started: false };
    const settlement = this.operationTracker.track(
      Promise.resolve().then(async () => {
        cancellation.throwIfCancelled("create");
        if (this.closing) {
          throw new SessionAttemptError("create", "closed");
        }
        invocation.started = true;
        return await this.client.createSession(config);
      }),
    );
    let outcome: OperationOutcome<PanelSdkSession>;
    try {
      outcome = await raceRunOperation(
        settlement,
        cancellation,
        this.requestTimeoutMs,
        "create",
      );
    } catch (error) {
      this.scheduleLateCreateCleanup(
        settlement,
        config.sessionId,
        () => invocation.started,
      );
      throw error;
    }
    if (outcome.status === "rejected") {
      if (invocation.started && typeof config.sessionId === "string") {
        await this.deleteSessionOnce(config.sessionId);
      }
      cancellation.throwIfCancelled("create");
      if (outcome.error instanceof SessionAttemptError) {
        throw outcome.error;
      }
      throw new SessionAttemptError("create", "transport");
    }
    return outcome.value;
  }

  private scheduleLateCreateCleanup(
    settlement: Promise<OperationOutcome<PanelSdkSession>>,
    sessionId: string | undefined,
    wasInvoked: () => boolean,
  ): void {
    const task = settlement
      .then(async (outcome) => {
        if (outcome.status === "fulfilled") {
          await this.cleanupSession(
            {
              sessionId: sessionId ?? outcome.value.sessionId,
              session: outcome.value,
            },
            true,
          );
        } else if (wasInvoked() && sessionId !== undefined) {
          await this.deleteSessionOnce(sessionId);
        }
      })
      .catch(() => undefined);
    this.trackInternalTask(task);
  }

  private async sendBounded(
    session: PanelSdkSession,
    userPrompt: string,
    cancellation: RunCancellation,
  ): Promise<unknown> {
    cancellation.throwIfCancelled("response");
    const settlement = this.operationTracker.track(
      Promise.resolve().then(async () => {
        cancellation.throwIfCancelled("response");
        if (this.closing) {
          throw new SessionAttemptError("response", "closed");
        }
        return await session.sendAndWait(
          { prompt: userPrompt },
          this.requestTimeoutMs + 1_000,
        );
      }),
    );
    const outcome = await raceRunOperation(
      settlement,
      cancellation,
      this.requestTimeoutMs,
      "response",
    );
    cancellation.throwIfCancelled("response");
    if (outcome.status === "rejected") {
      if (outcome.error instanceof SessionAttemptError) {
        throw outcome.error;
      }
      throw new SessionAttemptError("response", "transport");
    }
    return outcome.value;
  }

  private cleanupSession(
    record: ActiveSessionRecord,
    requireAbort: boolean,
  ): Promise<void> {
    const existing = this.cleanupStates.get(record.session);
    if (existing !== undefined) {
      existing.requireAbort ||= requireAbort;
      return existing.promise;
    }
    const state: SessionCleanupState = {
      requireAbort,
      promise: Promise.resolve(),
    };
    this.cleanupStates.set(record.session, state);
    const cleanup = Promise.resolve()
      .then(async () => {
        await Promise.resolve();
        if (state.requireAbort) {
          await this.abortSessionOnce(record.session);
        }
        await settledWithin(
          Promise.resolve().then(async () => {
            await record.session.disconnect();
          }),
          this.cleanupTimeoutMs,
        );
        await this.deleteSessionOnce(record.sessionId);
      })
      .catch(() => undefined)
      .finally(() => {
        this.activeSessions.delete(record.session);
      });
    state.promise = cleanup;
    this.trackCleanupPromise(cleanup);
    return cleanup;
  }

  private abortSessionOnce(session: PanelSdkSession): Promise<boolean> {
    const existing = this.abortPromises.get(session);
    if (existing !== undefined) {
      return existing;
    }
    const aborted = settledWithin(
      Promise.resolve().then(async () => {
        await session.abort();
      }),
      this.cleanupTimeoutMs,
    ).then((outcome) => outcome.status === "fulfilled");
    this.abortPromises.set(session, aborted);
    this.trackPendingSessionCleanup(aborted);
    return aborted;
  }

  private deleteSessionOnce(sessionId: string): Promise<boolean> {
    const existing = this.deletionPromises.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const deleted = settledWithin(
      Promise.resolve().then(async () => {
        await this.client.deleteSession(sessionId);
      }),
      this.cleanupTimeoutMs,
    ).then((outcome) => outcome.status === "fulfilled");
    this.deletionPromises.set(sessionId, deleted);
    this.trackPendingSessionCleanup(deleted);
    return deleted;
  }

  private trackPendingSessionCleanup(promise: Promise<unknown>): void {
    this.pendingSessionCleanup.add(promise);
    const remove = () => {
      this.pendingSessionCleanup.delete(promise);
    };
    void promise.then(remove, remove);
  }

  private trackCleanupPromise(promise: Promise<void>): void {
    this.cleanupPromises.add(promise);
    const remove = () => {
      this.cleanupPromises.delete(promise);
    };
    void promise.then(remove, remove);
  }

  private trackInternalTask(promise: Promise<void>): void {
    this.internalTasks.add(promise);
    const remove = () => {
      this.internalTasks.delete(promise);
    };
    void promise.then(remove, remove);
  }

  private markRoleAutomatic(role: PanelModelRole): void {
    const next: PanelModelAllocation = {
      ...this.currentAllocation,
      capabilityClass: "auto",
    };
    switch (role) {
      case "product":
        next.product = null;
        break;
      case "onboarding-architecture":
        next.onboardingArchitecture = null;
        break;
      case "trust-ecosystem":
        next.trustEcosystem = null;
        break;
      case "skeptic":
        next.skeptic = null;
        break;
      case "editor":
        next.editor = null;
        break;
    }
    this.currentAllocation = next;
  }

  private publicError(error: unknown): PanelModelGatewayError {
    if (error instanceof PanelModelGatewayError) {
      return error;
    }
    if (error instanceof SessionAttemptError) {
      return new PanelModelGatewayError(error.kind);
    }
    return new PanelModelGatewayError("transport");
  }

  private cancellationPublicError(
    cancellation: RunCancellation,
  ): PanelModelGatewayError | null {
    const kind = cancellation.kind;
    return kind === undefined ? null : new PanelModelGatewayError(kind);
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) {
      return this.closePromise;
    }
    this.closing = true;
    this.closeController.abort();
    for (const record of this.activeSessions.values()) {
      void this.cleanupSession(record, true);
    }
    this.closePromise = this.closeInternal();
    return this.closePromise;
  }

  private async closeInternal(): Promise<void> {
    await this.whenPreStopSessionCleanupIsIdle();
    const idle = this.whenQuiescent();
    const settled = await settledWithin(idle, this.cleanupTimeoutMs);
    const terminal = await this.enqueueTerminalStop();
    if (settled.status === "fulfilled" && terminal.clean && !this.everForced) {
      await this.removeTemporaryDirectoryOnce();
      return;
    }
    if (settled.status !== "fulfilled") {
      this.scheduleLateTerminalStop(idle);
    }
  }

  private async whenPreStopSessionCleanupIsIdle(): Promise<void> {
    for (;;) {
      const pending = [...this.cleanupPromises, ...this.pendingSessionCleanup];
      if (pending.length === 0) {
        return;
      }
      await Promise.allSettled(pending);
    }
  }

  private async whenQuiescent(): Promise<void> {
    for (;;) {
      const pending = [
        ...this.activeRuns,
        ...this.operationTracker.snapshot(),
        ...this.cleanupPromises,
        ...this.internalTasks,
      ];
      if (pending.length === 0) {
        return;
      }
      await Promise.allSettled(pending);
    }
  }

  private enqueueTerminalStop(): Promise<TerminalStopResult> {
    const attempt = this.terminalStopTail.then(
      async () => await terminalStopClient(this.client, this.cleanupTimeoutMs),
    );
    this.terminalStopTail = attempt.then(
      () => undefined,
      () => undefined,
    );
    return attempt.then(
      (result) => {
        this.everForced ||= result.forced;
        return result;
      },
      () => {
        this.everForced = true;
        return { clean: false, forced: true };
      },
    );
  }

  private scheduleLateTerminalStop(idle: Promise<void>): void {
    if (this.lateTerminalPromise !== undefined) {
      return;
    }
    this.lateTerminalPromise = idle
      .then(async () => {
        const terminal = await this.enqueueTerminalStop();
        if (terminal.clean && !this.everForced) {
          await this.removeTemporaryDirectoryOnce();
        }
      })
      .catch(() => undefined);
  }

  private async removeTemporaryDirectoryOnce(): Promise<void> {
    if (this.temporaryDirectoryRemoved) {
      return;
    }
    if (await removeVerifiedTemporaryDirectory(this.temporaryDirectory)) {
      this.temporaryDirectoryRemoved = true;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

export class PanelModelGateway {
  private readonly createClient: PanelSdkFactory;
  private readonly environment: Readonly<NodeJS.ProcessEnv>;
  private readonly requestTimeoutMs: number;
  private readonly cleanupTimeoutMs: number;
  private readonly sessionIdleTimeoutSeconds: number;

  constructor(options: PanelModelGatewayOptions = {}) {
    this.createClient =
      options.createClient ??
      ((clientOptions) => new CopilotClient(clientOptions));
    this.environment = options.environment ?? process.env;
    this.requestTimeoutMs = finitePositiveInteger(
      options.requestTimeoutMs,
      PANEL_MODEL_TIMEOUT_MS,
    );
    this.cleanupTimeoutMs = finitePositiveInteger(
      options.cleanupTimeoutMs,
      PANEL_MODEL_CLEANUP_TIMEOUT_MS,
    );
    this.sessionIdleTimeoutSeconds = finitePositiveInteger(
      options.sessionIdleTimeoutSeconds,
      PANEL_MODEL_SESSION_IDLE_TIMEOUT_SECONDS,
    );
  }

  async open(token: string, signal: AbortSignal): Promise<PanelModelRun> {
    assertOAuthToken(token);
    throwIfAborted(signal);
    let temporaryDirectory: TemporaryDirectory;
    try {
      temporaryDirectory = await createTemporaryDirectory();
    } catch {
      throw new PanelModelGatewayError("open-failed");
    }
    if (signal.aborted) {
      await removeVerifiedTemporaryDirectory(temporaryDirectory);
      throw new PanelModelGatewayError("aborted");
    }
    let client: PanelSdkClient | undefined;
    const operationTracker = new PendingOperationTracker();
    try {
      const createdClient = this.createClient({
        connection: RuntimeConnection.forStdio(),
        mode: "empty",
        baseDirectory: temporaryDirectory.path,
        workingDirectory: temporaryDirectory.path,
        builtinPluginDirectories: [],
        gitHubToken: token,
        useLoggedInUser: false,
        enableRemoteSessions: false,
        sessionIdleTimeoutSeconds: this.sessionIdleTimeoutSeconds,
        logLevel: "none",
        env: scrubCopilotRuntimeEnvironment(this.environment),
      });
      client = createdClient;
      await openOperationWithin(
        operationTracker.track(
          Promise.resolve().then(async () => {
            await createdClient.start();
          }),
        ),
        signal,
        this.requestTimeoutMs,
      );
      throwIfAborted(signal);
      const listedModels = await openOperationWithin(
        operationTracker.track(
          Promise.resolve().then(async () => await createdClient.listModels()),
        ),
        signal,
        this.requestTimeoutMs,
      );
      const candidates = normalizePanelModelCandidates(listedModels);
      throwIfAborted(signal);
      return new IsolatedPanelModelRun(
        client,
        token,
        signal,
        temporaryDirectory,
        candidates,
        allocatePanelModels(candidates),
        this.requestTimeoutMs,
        this.cleanupTimeoutMs,
      );
    } catch (error) {
      if (client === undefined) {
        await removeVerifiedTemporaryDirectory(temporaryDirectory);
      } else {
        await this.cleanupFailedOpen(
          client,
          operationTracker,
          temporaryDirectory,
        );
      }
      if (
        error instanceof PanelModelGatewayError &&
        (error.kind === "aborted" || error.kind === "timeout")
      ) {
        throw error;
      }
      throw new PanelModelGatewayError("open-failed");
    }
  }

  private async cleanupFailedOpen(
    client: PanelSdkClient,
    operationTracker: PendingOperationTracker,
    temporaryDirectory: TemporaryDirectory,
  ): Promise<void> {
    const idle = operationTracker.whenIdle();
    const settled = await settledWithin(idle, this.cleanupTimeoutMs);
    const firstTerminal = await terminalStopClient(
      client,
      this.cleanupTimeoutMs,
    );
    let everForced = firstTerminal.forced;
    if (settled.status === "fulfilled" && firstTerminal.clean && !everForced) {
      await removeVerifiedTemporaryDirectory(temporaryDirectory);
      return;
    }
    if (settled.status === "fulfilled") {
      return;
    }
    const lateCleanup = idle
      .then(async () => {
        const secondTerminal = await terminalStopClient(
          client,
          this.cleanupTimeoutMs,
        );
        everForced ||= secondTerminal.forced;
        if (secondTerminal.clean && !everForced) {
          await removeVerifiedTemporaryDirectory(temporaryDirectory);
        }
      })
      .catch(() => undefined);
    void lateCleanup;
  }
}
