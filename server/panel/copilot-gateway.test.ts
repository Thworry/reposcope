import { access, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopilotClientOptions, SessionConfig } from "@github/copilot-sdk";

import {
  PanelModelGateway,
  scrubCopilotRuntimeEnvironment,
} from "./copilot-gateway.js";
import type {
  PanelSdkClient,
  PanelSdkFactory,
  PanelSdkSession,
} from "./copilot-gateway.js";

const filesystemFaults = vi.hoisted(() => ({
  createFailure: null as "mkdtemp" | "realpath" | null,
  removalAttempts: [] as string[],
  removalFailuresRemaining: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    mkdtemp: vi.fn(async (prefix: string) => {
      if (filesystemFaults.createFailure === "mkdtemp") {
        filesystemFaults.createFailure = null;
        throw Object.assign(new Error("SECRET mkdtemp path"), { code: "EIO" });
      }
      return await actual.mkdtemp(prefix);
    }),
    realpath: vi.fn(async (path: Parameters<typeof actual.realpath>[0]) => {
      if (filesystemFaults.createFailure === "realpath") {
        filesystemFaults.createFailure = null;
        throw Object.assign(new Error("SECRET realpath path"), { code: "EIO" });
      }
      return await actual.realpath(path);
    }),
    rm: vi.fn(
      async (
        path: Parameters<typeof actual.rm>[0],
        options: Parameters<typeof actual.rm>[1],
      ) => {
        const target = String(path);
        if (target.includes("reposcope-copilot-")) {
          filesystemFaults.removalAttempts.push(target);
          if (filesystemFaults.removalFailuresRemaining > 0) {
            filesystemFaults.removalFailuresRemaining -= 1;
            throw Object.assign(new Error("SECRET transient removal path"), {
              code: "EBUSY",
            });
          }
        }
        await actual.rm(path, options);
      },
    ),
  };
});

const prompt = Object.freeze({
  system: "Return grounded JSON only.",
  user: '{"evidence":[]}',
});

function deferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function assistant(content: string): unknown {
  return {
    type: "assistant.message",
    data: { content },
  };
}

function model(id: string, reasoning: readonly string[] = []): unknown {
  return {
    id,
    name: id,
    capabilities: {
      supports: { vision: false, reasoningEffort: reasoning.length > 0 },
      limits: { max_context_window_tokens: 100_000 },
    },
    policy: { state: "enabled", terms: "" },
    supportedReasoningEfforts: [...reasoning],
  };
}

function fakeSession(
  sessionId: string,
  response: () => Promise<unknown> = () =>
    Promise.resolve(assistant('{"ok":true}')),
) {
  const sendAndWait = vi.fn((options: { prompt: string }, timeout?: number) => {
    void options;
    void timeout;
    return response();
  });
  const abort = vi.fn(() => Promise.resolve());
  const disconnect = vi.fn(() => Promise.resolve());
  const session: PanelSdkSession = {
    sessionId,
    sendAndWait,
    abort,
    disconnect,
  };
  return { session, sendAndWait, abort, disconnect };
}

type SessionBuilder = (
  config: SessionConfig,
) => Promise<PanelSdkSession> | PanelSdkSession;

function fakeClient(models: readonly unknown[], buildSession?: SessionBuilder) {
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const start = vi.fn(() => Promise.resolve());
  const listModels = vi.fn(() => Promise.resolve<unknown>(models));
  const createSession = vi.fn(async (config: SessionConfig) => {
    if (buildSession !== undefined) {
      return await buildSession(config);
    }
    const state = fakeSession(requiredSessionId(config));
    sessions.push(state);
    return state.session;
  });
  const deleteSession = vi.fn((sessionId: string) => {
    void sessionId;
    return Promise.resolve();
  });
  const stop = vi.fn(() => Promise.resolve<Error[]>([]));
  const forceStop = vi.fn(() => Promise.resolve());
  const client: PanelSdkClient = {
    start,
    listModels,
    createSession,
    deleteSession,
    stop,
    forceStop,
  };
  return {
    client,
    sessions,
    start,
    listModels,
    createSession,
    deleteSession,
    stop,
    forceStop,
  };
}

function requiredSessionId(config: SessionConfig): string {
  if (typeof config.sessionId !== "string") {
    throw new Error("test expected an explicit session ID");
  }
  return config.sessionId;
}

async function missing(path: string): Promise<boolean> {
  return access(path).then(
    () => false,
    () => true,
  );
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
  filesystemFaults.createFailure = null;
  filesystemFaults.removalAttempts.length = 0;
  filesystemFaults.removalFailuresRemaining = 0;
});

describe("PanelModelGateway isolation and session config", () => {
  it("isolates concurrent user tokens, model caches, directories, and child environments", async () => {
    const clients: Array<ReturnType<typeof fakeClient>> = [];
    const optionsSeen: CopilotClientOptions[] = [];
    const factory: PanelSdkFactory = (options) => {
      optionsSeen.push({ ...options });
      const token = options.gitHubToken;
      const state = fakeClient([
        model(token === "gho_user_a" ? "model-user-a" : "model-user-b"),
      ]);
      clients.push(state);
      return state.client;
    };
    const gateway = new PanelModelGateway({
      createClient: factory,
      environment: {
        PATH: "/safe/bin",
        TMPDIR: "/safe/tmp",
        LANG: "C.UTF-8",
        HOME: "/secret/home",
        GITHUB_TOKEN: "parent-github-secret",
        GH_TOKEN: "parent-gh-secret",
        COPILOT_GITHUB_TOKEN: "parent-copilot-secret",
        COPILOT_HOME: "/secret/copilot-home",
        OTEL_EXPORTER_OTLP_HEADERS: "authorization=secret",
        NODE_OPTIONS: "--require=/secret/hook.cjs",
      },
    });
    const signal = new AbortController().signal;

    const [runA, runB] = await Promise.all([
      gateway.open("gho_user_a", signal),
      gateway.open("gho_user_b", signal),
    ]);
    expect(runA.allocation.product).toBe("model-user-a");
    expect(runB.allocation.product).toBe("model-user-b");
    await Promise.all([
      runA.runJson({ role: "product", prompt }),
      runB.runJson({ role: "product", prompt }),
    ]);

    expect(clients).toHaveLength(2);
    const optionA = optionsSeen.find(
      ({ gitHubToken }) => gitHubToken === "gho_user_a",
    );
    const optionB = optionsSeen.find(
      ({ gitHubToken }) => gitHubToken === "gho_user_b",
    );
    const clientA = clients.find(
      ({ createSession }) =>
        createSession.mock.calls[0]?.[0].gitHubToken === "gho_user_a",
    );
    const clientB = clients.find(
      ({ createSession }) =>
        createSession.mock.calls[0]?.[0].gitHubToken === "gho_user_b",
    );
    expect(clientA?.listModels).toHaveBeenCalledOnce();
    expect(clientB?.listModels).toHaveBeenCalledOnce();
    expect(optionA).toMatchObject({
      mode: "empty",
      gitHubToken: "gho_user_a",
      useLoggedInUser: false,
      enableRemoteSessions: false,
      sessionIdleTimeoutSeconds: 90,
      logLevel: "none",
      builtinPluginDirectories: [],
      env: { PATH: "/safe/bin", TMPDIR: "/safe/tmp", LANG: "C.UTF-8" },
    });
    expect(optionB).toMatchObject({ gitHubToken: "gho_user_b" });
    expect(optionA?.baseDirectory).not.toBe(optionB?.baseDirectory);
    expect(optionA?.workingDirectory).toBe(optionA?.baseDirectory);
    expect(optionA?.env).not.toHaveProperty("HOME");
    expect(optionA?.env).not.toHaveProperty("GITHUB_TOKEN");
    expect(optionA?.env).not.toHaveProperty("OTEL_EXPORTER_OTLP_HEADERS");
    expect(optionA?.env).not.toHaveProperty("NODE_OPTIONS");
    expect(clientA?.createSession.mock.calls[0]?.[0].gitHubToken).toBe(
      "gho_user_a",
    );
    expect(clientB?.createSession.mock.calls[0]?.[0].gitHubToken).toBe(
      "gho_user_b",
    );

    const directoryA = optionA?.baseDirectory;
    const directoryB = optionB?.baseDirectory;
    await Promise.all([runA.close(), runB.close()]);
    expect(clientA?.stop).toHaveBeenCalledOnce();
    expect(clientB?.stop).toHaveBeenCalledOnce();
    expect(typeof directoryA === "string" && (await missing(directoryA))).toBe(
      true,
    );
    expect(typeof directoryB === "string" && (await missing(directoryB))).toBe(
      true,
    );
  });

  it("starts specialist sessions in parallel with a zero-capability config", async () => {
    const pending: Array<ReturnType<typeof deferred<unknown>>> = [];
    const states: ReturnType<typeof fakeSession>[] = [];
    const clientState = fakeClient(
      [
        model("claude-sonnet-4.6", ["low", "max"]),
        model("gpt-5.4", ["high", "xhigh"]),
        model("gemini-3-pro"),
      ],
      (config) => {
        const response = deferred<unknown>();
        pending.push(response);
        const state = fakeSession(
          requiredSessionId(config),
          () => response.promise,
        );
        states.push(state);
        return state.session;
      },
    );
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    const specialistCalls = [
      run.runJson({ role: "product", prompt }),
      run.runJson({ role: "onboarding-architecture", prompt }),
      run.runJson({ role: "trust-ecosystem", prompt }),
    ];
    await flushMicrotasks();
    expect(clientState.createSession).toHaveBeenCalledTimes(3);
    for (const response of pending) {
      response.resolve(assistant('{"specialist":true}'));
    }
    await expect(Promise.all(specialistCalls)).resolves.toEqual([
      '{"specialist":true}',
      '{"specialist":true}',
      '{"specialist":true}',
    ]);

    const skeptic = run.runJson({ role: "skeptic", prompt });
    await flushMicrotasks();
    pending.at(-1)?.resolve(assistant('{"skeptic":true}'));
    await skeptic;
    const editor = run.runJson({ role: "editor", prompt });
    await flushMicrotasks();
    pending.at(-1)?.resolve(assistant('{"editor":true}'));
    await editor;

    const configs = clientState.createSession.mock.calls.map(
      ([config]) => config,
    );
    expect(configs[0]).toMatchObject({
      gitHubToken: "gho_user",
      model: "claude-sonnet-4.6",
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
      excludedTools: ["builtin:*", "mcp:*", "custom:*"],
      toolSearch: { enabled: false },
      enableConfigDiscovery: false,
      skipCustomInstructions: true,
      enableSkills: false,
      skipEmbeddingRetrieval: true,
      embeddingCacheStorage: "in-memory",
      enableOnDemandInstructionDiscovery: false,
      enableFileHooks: false,
      enableHostGitOperations: false,
      enableSessionStore: false,
      infiniteSessions: { enabled: false },
      memory: { enabled: false },
      remoteSession: "off",
      enableSessionTelemetry: false,
      enableMcpApps: false,
      requestCanvasRenderer: false,
      requestExtensions: false,
      systemMessage: { mode: "append", content: prompt.system },
    });
    expect(configs[0]).not.toHaveProperty("reasoningEffort");
    expect(configs[3]).toMatchObject({
      model: "claude-sonnet-4.6",
      reasoningEffort: "max",
    });
    expect(configs[4]).toMatchObject({
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
    });
    const decision = await configs[0]?.onPermissionRequest?.(
      { kind: "read" } as never,
      { sessionId: requiredSessionId(configs[0]) },
    );
    expect(decision).toEqual({
      kind: "reject",
      feedback: "No tools are available for this analysis session.",
    });
    expect(new Set(configs.map(({ sessionId }) => sessionId)).size).toBe(5);
    expect(clientState.deleteSession).toHaveBeenCalledTimes(5);
    for (const state of states) {
      expect(state.disconnect).toHaveBeenCalledOnce();
      expect(state.sendAndWait).toHaveBeenCalledWith(
        { prompt: prompt.user },
        61_000,
      );
    }
    await run.close();
  });

  it("exposes only a minimal explicit environment allowlist", () => {
    expect(
      scrubCopilotRuntimeEnvironment({
        PATH: "/bin",
        TEMP: "/tmp",
        SystemRoot: "C:\\Windows",
        HOME: "/home/user",
        USERPROFILE: "C:\\Users\\user",
        GH_TOKEN: "secret",
        GITHUB_TOKEN: "secret",
        COPILOT_HOME: "secret",
        OTEL_SERVICE_NAME: "secret",
        OPENAI_API_KEY: "secret",
      }),
    ).toEqual({
      PATH: "/bin",
      TEMP: "/tmp",
      SystemRoot: "C:\\Windows",
    });
  });

  it.each(["realpath", "mkdtemp"] as const)(
    "maps a %s failure to a redacted open-failed error",
    async (operation) => {
      filesystemFaults.createFailure = operation;
      const clientState = fakeClient([]);

      const error = await new PanelModelGateway({
        createClient: () => clientState.client,
      })
        .open("gho_user", new AbortController().signal)
        .catch((reason: unknown) => reason);

      expect(error).toMatchObject({ kind: "open-failed" });
      expect(String(error)).not.toContain("SECRET");
      expect(clientState.start).not.toHaveBeenCalled();
    },
  );

  it("re-verifies and retries a transient temporary-directory removal failure", async () => {
    const clientState = fakeClient([]);
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
    }).open("gho_user", new AbortController().signal);
    const directory = optionsSeen[0]?.baseDirectory;
    filesystemFaults.removalFailuresRemaining = 1;

    await expect(run.close()).resolves.toBeUndefined();

    expect(typeof directory).toBe("string");
    expect(
      filesystemFaults.removalAttempts.filter((target) => target === directory),
    ).toHaveLength(2);
    expect(typeof directory === "string" && (await missing(directory))).toBe(
      true,
    );
  });
});

describe("PanelModelGateway fallback and hostile responses", () => {
  it("retries an explicitly rejected model once with runtime auto selection", async () => {
    const session = fakeSession("ignored");
    const clientState = fakeClient([model("gpt-5.4", ["max"])], (config) => {
      if (config.model !== undefined) {
        throw new Error("SECRET model rejection details");
      }
      return { ...session.session, sessionId: requiredSessionId(config) };
    });
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    await expect(run.runJson({ role: "skeptic", prompt })).resolves.toBe(
      '{"ok":true}',
    );

    expect(clientState.createSession).toHaveBeenCalledTimes(2);
    expect(clientState.createSession.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5.4",
      reasoningEffort: "max",
    });
    expect(clientState.createSession.mock.calls[1]?.[0]).not.toHaveProperty(
      "model",
    );
    expect(clientState.createSession.mock.calls[1]?.[0]).not.toHaveProperty(
      "reasoningEffort",
    );
    expect(run.allocation.capabilityClass).toBe("auto");
    expect(run.allocation.skeptic).toBeNull();
    expect(clientState.deleteSession).toHaveBeenCalledTimes(2);
    expect(new Set(clientState.deleteSession.mock.calls.flat()).size).toBe(2);
    await run.close();
  });

  it("never performs more than one auto fallback", async () => {
    const clientState = fakeClient([model("gpt-5.4")], () => {
      throw new Error("SECRET provider prose");
    });
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    const error = await run
      .runJson({ role: "product", prompt })
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ kind: "transport" });
    expect(String(error)).not.toContain("SECRET");
    expect(clientState.createSession).toHaveBeenCalledTimes(2);
    expect(clientState.deleteSession).toHaveBeenCalledTimes(2);
    await run.close();
  });

  it("accepts only an assistant.message own string content field", async () => {
    const contentGetter = vi.fn(() => '{"forged":true}');
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, "content", {
      get: contentGetter,
      enumerable: true,
    });
    const clientState = fakeClient([], (config) => {
      const state = fakeSession(requiredSessionId(config), () =>
        Promise.resolve({
          type: "assistant.message",
          data,
        }),
      );
      return state.session;
    });
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    await expect(run.runJson({ role: "editor", prompt })).rejects.toMatchObject(
      { kind: "invalid-response" },
    );
    expect(contentGetter).not.toHaveBeenCalled();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    await run.close();
  });

  it("does not invoke hostile request accessors", async () => {
    const roleGetter = vi.fn(() => "product");
    const request = { prompt } as Record<string, unknown>;
    Object.defineProperty(request, "role", {
      get: roleGetter,
      enumerable: true,
    });
    const clientState = fakeClient([]);
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    await expect(run.runJson(request as never)).rejects.toMatchObject({
      kind: "invalid-request",
    });
    expect(roleGetter).not.toHaveBeenCalled();
    expect(clientState.createSession).not.toHaveBeenCalled();
    await run.close();
  });
});

describe("PanelModelGateway cancellation and cleanup", () => {
  it("aborts on caller cancellation and ignores a late model completion", async () => {
    const response = deferred<unknown>();
    let sessionState: ReturnType<typeof fakeSession> | undefined;
    const clientState = fakeClient([], (config) => {
      sessionState = fakeSession(
        requiredSessionId(config),
        () => response.promise,
      );
      return sessionState.session;
    });
    const controller = new AbortController();
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", controller.signal);
    const result = run.runJson({ role: "product", prompt });
    const rejected = expect(result).rejects.toMatchObject({ kind: "aborted" });
    await vi.waitFor(() => {
      expect(sessionState?.sendAndWait).toHaveBeenCalledOnce();
    });

    controller.abort();
    await rejected;
    response.resolve(assistant('{"late":true}'));
    await flushMicrotasks();

    expect(sessionState?.abort).toHaveBeenCalledOnce();
    expect(sessionState?.disconnect).toHaveBeenCalledOnce();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    await run.close();
  });

  it("aborts at the configured request deadline even when send ignores abort", async () => {
    vi.useFakeTimers();
    const response = deferred<unknown>();
    let sessionState: ReturnType<typeof fakeSession> | undefined;
    const clientState = fakeClient([], (config) => {
      sessionState = fakeSession(
        requiredSessionId(config),
        () => response.promise,
      );
      return sessionState.session;
    });
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
      requestTimeoutMs: 100,
      cleanupTimeoutMs: 20,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    const rejected = expect(result).rejects.toMatchObject({ kind: "timeout" });
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(99);
    expect(sessionState?.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;

    expect(sessionState?.abort).toHaveBeenCalledOnce();
    expect(sessionState?.disconnect).toHaveBeenCalledOnce();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    const closed = run.close();
    await vi.advanceTimersByTimeAsync(20);
    await closed;
    response.resolve(assistant('{"late":true}'));
    await flushMicrotasks();
    expect(clientState.stop).toHaveBeenCalledTimes(2);
  });

  it("bounds hanging disconnect and delete while calling each exactly once", async () => {
    vi.useFakeTimers();
    const state = fakeSession("ignored");
    state.disconnect.mockImplementation(() => new Promise(() => undefined));
    const clientState = fakeClient([], (config) => ({
      ...state.session,
      sessionId: requiredSessionId(config),
      disconnect: state.disconnect,
    }));
    clientState.deleteSession.mockImplementation(
      () => new Promise(() => undefined),
    );
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
      cleanupTimeoutMs: 20,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    await flushMicrotasks();

    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toBe('{"ok":true}');

    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    await run.close();
  });

  it("force-stops after graceful stop errors and retains the directory", async () => {
    const clientState = fakeClient([]);
    clientState.stop.mockResolvedValue([new Error("SECRET cleanup prose")]);
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
    }).open("gho_user", new AbortController().signal);
    const directory = optionsSeen[0]?.baseDirectory;

    await expect(run.close()).resolves.toBeUndefined();

    expect(clientState.stop).toHaveBeenCalledOnce();
    expect(clientState.forceStop).toHaveBeenCalledOnce();
    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );
    if (typeof directory === "string") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("force-stops after a stop timeout and retains files if force-stop also hangs", async () => {
    vi.useFakeTimers();
    const clientState = fakeClient([]);
    clientState.stop.mockImplementation(
      () => new Promise<Error[]>(() => undefined),
    );
    clientState.forceStop.mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
      cleanupTimeoutMs: 20,
    }).open("gho_user", new AbortController().signal);
    const directory = optionsSeen[0]?.baseDirectory;
    const closed = run.close();

    await vi.advanceTimersByTimeAsync(20);
    expect(clientState.forceStop).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20);
    await closed;

    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );
    if (typeof directory === "string") {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("PanelModelGateway reviewed lifecycle races", () => {
  it("closes an already-started run before create/send and returns one idempotent close promise", async () => {
    const clientState = fakeClient([model("gpt-5.4")]);
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);

    const result = run.runJson({ role: "product", prompt });
    const firstClose = run.close();
    const secondClose = run.close();

    expect(secondClose).toBe(firstClose);
    await expect(result).rejects.toMatchObject({ kind: "closed" });
    await firstClose;
    expect(clientState.createSession).not.toHaveBeenCalled();
    expect(clientState.sessions).toHaveLength(0);
    expect(clientState.stop).toHaveBeenCalledOnce();
    expect(clientState.forceStop).not.toHaveBeenCalled();
  });

  it("rejects a started run when close begins during graceful session cleanup", async () => {
    const disconnected = deferred<undefined>();
    const state = fakeSession("ignored");
    state.disconnect.mockImplementation(() => disconnected.promise);
    const clientState = fakeClient([model("gpt-5.4")], (config) => ({
      ...state.session,
      sessionId: requiredSessionId(config),
      disconnect: state.disconnect,
    }));
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    await vi.waitFor(() => {
      expect(state.disconnect).toHaveBeenCalledOnce();
    });

    const closed = run.close();
    disconnected.resolve(undefined);

    await expect(result).rejects.toMatchObject({ kind: "closed" });
    await closed;
    expect(clientState.createSession).toHaveBeenCalledOnce();
    expect(state.sendAndWait).toHaveBeenCalledOnce();
    expect(clientState.stop).toHaveBeenCalledOnce();
    expect(clientState.forceStop).not.toHaveBeenCalled();
  });

  it("cleans a createSession that resolves after close and performs a second clean stop", async () => {
    const created = deferred<PanelSdkSession>();
    const order: string[] = [];
    const lateSession = fakeSession("late-session");
    lateSession.sendAndWait.mockImplementation(() => {
      order.push("send");
      return Promise.resolve(assistant('{"late":true}'));
    });
    lateSession.abort.mockImplementation(() => {
      order.push("abort");
      return Promise.resolve();
    });
    lateSession.disconnect.mockImplementation(() => {
      order.push("disconnect");
      return Promise.resolve();
    });
    const clientState = fakeClient([model("gpt-5.4")], () => created.promise);
    clientState.deleteSession.mockImplementation(() => {
      order.push("delete");
      return Promise.resolve();
    });
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
      cleanupTimeoutMs: 10,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    await vi.waitFor(() => {
      expect(clientState.createSession).toHaveBeenCalledOnce();
    });

    await run.close();
    expect(clientState.stop).toHaveBeenCalledOnce();
    const directory = optionsSeen[0]?.baseDirectory;
    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );

    created.resolve(lateSession.session);
    await expect(result).rejects.toMatchObject({ kind: "closed" });
    await vi.waitFor(() => {
      expect(clientState.stop).toHaveBeenCalledTimes(2);
    });

    expect(order).toEqual(["abort", "disconnect", "delete"]);
    expect(lateSession.sendAndWait).not.toHaveBeenCalled();
    expect(clientState.createSession).toHaveBeenCalledOnce();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    expect(typeof directory === "string" && (await missing(directory))).toBe(
      true,
    );
  });

  it("performs a second clean stop after a send settles later than close", async () => {
    const response = deferred<unknown>();
    const state = fakeSession("ignored", () => response.promise);
    const clientState = fakeClient([], (config) => ({
      ...state.session,
      sessionId: requiredSessionId(config),
    }));
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
      cleanupTimeoutMs: 10,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    const rejected = expect(result).rejects.toMatchObject({ kind: "closed" });
    await vi.waitFor(() => {
      expect(state.sendAndWait).toHaveBeenCalledOnce();
    });

    await run.close();
    await rejected;
    const directory = optionsSeen[0]?.baseDirectory;
    expect(clientState.stop).toHaveBeenCalledOnce();
    expect(state.abort).toHaveBeenCalledBefore(state.disconnect);
    expect(state.disconnect).toHaveBeenCalledBefore(clientState.deleteSession);
    expect(clientState.deleteSession).toHaveBeenCalledBefore(clientState.stop);
    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );

    response.resolve(assistant('{"late":true}'));
    await vi.waitFor(() => {
      expect(clientState.stop).toHaveBeenCalledTimes(2);
    });
    expect(typeof directory === "string" && (await missing(directory))).toBe(
      true,
    );
  });

  it("preserves caller-aborted for a late create settlement and uses the shared cleanup order", async () => {
    const created = deferred<PanelSdkSession>();
    const order: string[] = [];
    const lateSession = fakeSession("late-caller-abort");
    lateSession.abort.mockImplementation(() => {
      order.push("abort");
      return Promise.resolve();
    });
    lateSession.disconnect.mockImplementation(() => {
      order.push("disconnect");
      return Promise.resolve();
    });
    const clientState = fakeClient([], () => created.promise);
    clientState.deleteSession.mockImplementation(() => {
      order.push("delete");
      return Promise.resolve();
    });
    const controller = new AbortController();
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
      cleanupTimeoutMs: 10,
    }).open("gho_user", controller.signal);
    const result = run.runJson({ role: "product", prompt });
    await vi.waitFor(() => {
      expect(clientState.createSession).toHaveBeenCalledOnce();
    });

    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "aborted" });
    created.resolve(lateSession.session);
    await vi.waitFor(() => {
      expect(clientState.deleteSession).toHaveBeenCalledOnce();
    });

    expect(order).toEqual(["abort", "disconnect", "delete"]);
    expect(lateSession.sendAndWait).not.toHaveBeenCalled();
    await run.close();
  });

  it("does not auto-fallback when an explicit create rejects after close", async () => {
    const created = deferred<PanelSdkSession>();
    const clientState = fakeClient([model("gpt-5.4")], () => created.promise);
    const run = await new PanelModelGateway({
      createClient: () => clientState.client,
      cleanupTimeoutMs: 10,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    await vi.waitFor(() => {
      expect(clientState.createSession).toHaveBeenCalledOnce();
    });

    const closed = run.close();
    created.reject(new Error("SECRET late model rejection"));
    await expect(result).rejects.toMatchObject({ kind: "closed" });
    await closed;

    expect(clientState.createSession).toHaveBeenCalledOnce();
    expect(
      String(await result.catch((reason: unknown) => reason)),
    ).not.toContain("SECRET");
  });

  it("bounded-awaits hanging abort before disconnect/delete and retains on forceStop", async () => {
    vi.useFakeTimers();
    const sent = deferred<unknown>();
    const order: string[] = [];
    const state = fakeSession("ignored", () => sent.promise);
    state.abort.mockImplementation(() => {
      order.push("abort");
      return new Promise(() => undefined);
    });
    state.disconnect.mockImplementation(() => {
      order.push("disconnect");
      return Promise.resolve();
    });
    const clientState = fakeClient([], (config) => ({
      ...state.session,
      sessionId: requiredSessionId(config),
      abort: state.abort,
      disconnect: state.disconnect,
    }));
    clientState.deleteSession.mockImplementation(() => {
      order.push("delete");
      return Promise.resolve();
    });
    clientState.stop.mockImplementation(() => {
      order.push("stop");
      return Promise.resolve([new Error("stop failed")]);
    });
    const optionsSeen: CopilotClientOptions[] = [];
    const run = await new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
      cleanupTimeoutMs: 20,
    }).open("gho_user", new AbortController().signal);
    const result = run.runJson({ role: "product", prompt });
    await flushMicrotasks();
    expect(state.sendAndWait).toHaveBeenCalledOnce();

    const firstClose = run.close();
    expect(run.close()).toBe(firstClose);
    await flushMicrotasks();
    expect(order).toEqual(["abort"]);
    await vi.advanceTimersByTimeAsync(19);
    expect(order).toEqual(["abort"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(["abort", "disconnect", "delete"]);
    expect(clientState.stop).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await firstClose;
    await expect(result).rejects.toMatchObject({ kind: "closed" });

    expect(order).toEqual(["abort", "disconnect", "delete", "stop"]);
    expect(state.abort).toHaveBeenCalledOnce();
    expect(state.disconnect).toHaveBeenCalledOnce();
    expect(clientState.deleteSession).toHaveBeenCalledOnce();
    expect(clientState.forceStop).toHaveBeenCalledOnce();
    const directory = optionsSeen[0]?.baseDirectory;
    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );
    if (typeof directory === "string") {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("tracks a timed-out start and performs terminal stop again after late settlement", async () => {
    const started = deferred<undefined>();
    const clientState = fakeClient([]);
    clientState.start.mockImplementation(() => started.promise);
    const optionsSeen: CopilotClientOptions[] = [];
    const gateway = new PanelModelGateway({
      createClient: (options) => {
        optionsSeen.push({ ...options });
        return clientState.client;
      },
      requestTimeoutMs: 20,
      cleanupTimeoutMs: 10,
    });
    const opened = gateway.open("gho_user", new AbortController().signal);
    const rejected = expect(opened).rejects.toMatchObject({ kind: "timeout" });

    await rejected;
    expect(clientState.stop).toHaveBeenCalledOnce();
    const directory = optionsSeen[0]?.baseDirectory;
    expect(typeof directory === "string" && !(await missing(directory))).toBe(
      true,
    );

    started.resolve(undefined);
    await flushMicrotasks();
    expect(clientState.stop).toHaveBeenCalledTimes(2);
    expect(clientState.listModels).not.toHaveBeenCalled();
    await vi.waitFor(async () => {
      expect(typeof directory === "string" && (await missing(directory))).toBe(
        true,
      );
    });
  });

  it("pins stdio despite polluted process env and retains after forceStop even when list settles late", async () => {
    const listed = deferred<unknown>();
    const clientState = fakeClient([]);
    clientState.listModels.mockImplementation(() => listed.promise);
    clientState.stop
      .mockResolvedValueOnce([new Error("first stop failed")])
      .mockResolvedValueOnce([]);
    const optionsSeen: CopilotClientOptions[] = [];
    const previousTransport = process.env.COPILOT_SDK_DEFAULT_CONNECTION;
    process.env.COPILOT_SDK_DEFAULT_CONNECTION = "inprocess";
    try {
      const opened = new PanelModelGateway({
        createClient: (options) => {
          optionsSeen.push({ ...options });
          return clientState.client;
        },
        requestTimeoutMs: 20,
        cleanupTimeoutMs: 10,
      }).open("gho_user", new AbortController().signal);
      const rejected = expect(opened).rejects.toMatchObject({
        kind: "timeout",
      });

      await rejected;
      expect(optionsSeen[0]?.connection).toEqual({ kind: "stdio" });
      expect(clientState.forceStop).toHaveBeenCalledOnce();
      const directory = optionsSeen[0]?.baseDirectory;
      expect(typeof directory === "string" && !(await missing(directory))).toBe(
        true,
      );

      listed.resolve([]);
      await flushMicrotasks();
      expect(clientState.stop).toHaveBeenCalledTimes(2);
      expect(typeof directory === "string" && !(await missing(directory))).toBe(
        true,
      );
      if (typeof directory === "string") {
        await rm(directory, { recursive: true, force: true });
      }
    } finally {
      if (previousTransport === undefined) {
        delete process.env.COPILOT_SDK_DEFAULT_CONNECTION;
      } else {
        process.env.COPILOT_SDK_DEFAULT_CONNECTION = previousTransport;
      }
    }
  });
});
