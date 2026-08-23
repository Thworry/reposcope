import { describe, expect, it, vi } from "vitest";

import {
  DEEP_STAGES,
  type DeepAnalysisEvent,
  type DeepAnalysisRequest,
  type DeepReport,
  type DeepStatement,
} from "../../src/features/deep-analysis/model.js";
import { AlternativeShortlistCache } from "../cache/alternative-shortlist-cache.js";
import { DeepNarrativeCache } from "../cache/deep-narrative-cache.js";
import type {
  EvidencePack,
  VerifiedAlternativeRepository,
} from "../evidence/model.js";
import { ServerGitHubError } from "../github/model.js";
import type { VerifiedRepositorySnapshot } from "../github/model.js";
import {
  PanelModelGatewayError,
  type PanelModelRun,
} from "../panel/copilot-gateway.js";
import type { DeepReportDraft } from "../panel/model.js";
import {
  PanelOrchestrationError,
  type PanelNarrativeResult,
} from "../panel/orchestrator.js";
import { VERIFIED_GITHUB_SNAPSHOT } from "../test/github-fixtures.js";
import {
  DeepAnalysisService,
  DeepAnalysisServiceError,
  type DeepAnalysisServiceOptions,
} from "./service.js";

const ACQUIRED_AT = "2026-08-24T00:00:00.000Z";
const TOKEN = "gho_test_user_token";
const REQUEST: DeepAnalysisRequest = {
  repository: {
    owner: "owner",
    repo: "repo",
    commitSha: VERIFIED_GITHUB_SNAPSHOT.commitSha,
  },
  language: "en",
};

type GitHubClient = DeepAnalysisServiceOptions["githubClient"];
type RunPanel = NonNullable<DeepAnalysisServiceOptions["runPanel"]>;

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value");
  return value;
}

function repositorySnapshot(
  overrides: Partial<VerifiedRepositorySnapshot["repository"]> = {},
): VerifiedRepositorySnapshot {
  return {
    ...structuredClone(VERIFIED_GITHUB_SNAPSHOT),
    repository: {
      ...structuredClone(VERIFIED_GITHUB_SNAPSHOT.repository),
      ...overrides,
    },
  };
}

function alternativeRepository(
  overrides: Partial<VerifiedAlternativeRepository> = {},
): VerifiedAlternativeRepository {
  return {
    owner: "sample",
    repo: "alternative",
    fullName: "sample/alternative",
    description: "A comparable TypeScript quality project",
    topics: ["quality", "typescript"],
    homepage: null,
    archived: false,
    defaultBranch: "main",
    pushedAt: "2026-08-18T00:00:00.000Z",
    starsCount: 42,
    watchersCount: 7,
    forksCount: 5,
    openIssuesCount: 2,
    licenseSpdxId: "Apache-2.0",
    ...overrides,
  };
}

function narrativeEvidenceId(pack: EvidencePack): string {
  return required(
    pack.facts.find(
      (fact) => fact.trust === "observed" && fact.retention === "narrative",
    ),
  ).id;
}

function statement(text: string, pack: EvidencePack): DeepStatement {
  return {
    text,
    provenance: "observed-fact",
    confidence: "high",
    evidenceIds: [narrativeEvidenceId(pack)],
  };
}

function reportDraft(
  pack: EvidencePack,
  language = REQUEST.language,
): DeepReportDraft {
  const alternatives = pack.facts
    .filter(
      (fact) =>
        fact.category === "alternative-description" && fact.url !== null,
    )
    .slice(0, 1)
    .map((fact) => {
      if (fact.url === null) throw new Error("Missing alternative URL");
      const url = new URL(fact.url);
      const [owner, repo] = url.pathname.slice(1).split("/");
      return {
        repository: { owner: required(owner), repo: required(repo) },
        whyCompare: {
          text: "This repository offers a relevant comparison point",
          provenance: "repository-claim" as const,
          confidence: "medium" as const,
          evidenceIds: [fact.id],
        },
      };
    });
  return {
    schemaVersion: "1.0.0",
    language,
    orientation: {
      summary: [statement("Orientation summary", pack)],
      verdict: statement("Orientation verdict", pack),
    },
    fit: {
      goodFor: [statement("Appropriate user fit", pack)],
      poorFor: [statement("Inappropriate user fit", pack)],
    },
    situations: [statement("Representative usage situation", pack)],
    capabilities: [
      {
        title: statement("Capability group", pack),
        items: [statement("Capability item", pack)],
      },
    ],
    workflow: [statement("Observed project workflow", pack)],
    architecture: {
      summary: [statement("Architecture summary", pack)],
      technologies: [statement("Architecture technology", pack)],
      concepts: [statement("Architecture concept", pack)],
    },
    onboarding: {
      prerequisites: [statement("Onboarding prerequisite", pack)],
      install: [statement("Onboarding installation guidance", pack)],
      run: [statement("Onboarding run guidance", pack)],
      develop: [statement("Onboarding development guidance", pack)],
      cautions: [statement("Onboarding caution", pack)],
    },
    trust: {
      reliability: [statement("Reliability assessment", pack)],
      security: [statement("Security assessment", pack)],
      privacy: [statement("Privacy assessment", pack)],
      unknowns: [
        {
          text:
            language === "zh-CN"
              ? "现有证据无法确认所有信任属性"
              : "Evidence does not establish every trust property",
          provenance: "unknown",
          confidence: "low",
          evidenceIds: [],
        },
      ],
    },
    maintenance: {
      summary: [statement("Maintenance summary", pack)],
      signals: [statement("Maintenance signal", pack)],
    },
    alternatives,
    disagreements: [],
    nextChecks: [
      {
        statement: statement("Verify remaining operational assumptions", pack),
        sourceChallengeId: null,
      },
    ],
    finalVerdict: {
      decision: "compare-first",
      summary: statement("Final qualified verdict", pack),
    },
  };
}

function panelResult(
  pack: EvidencePack,
  language: "en" | "zh-CN",
): PanelNarrativeResult {
  return {
    draft: reportDraft(pack, language),
    acceptedExpertReviews: [],
    skepticalReview: { schemaVersion: "1.0.0", challenges: [] },
    coverage: "full",
  };
}

function emitPanelProgress(onEvent: Parameters<RunPanel>[0]["onEvent"]): void {
  onEvent({ type: "stage", stage: "consulting-specialists" });
  for (const role of [
    "product",
    "onboarding-architecture",
    "trust-ecosystem",
  ] as const) {
    onEvent({ type: "specialist", role, status: "started" });
  }
  for (const role of [
    "product",
    "onboarding-architecture",
    "trust-ecosystem",
  ] as const) {
    onEvent({ type: "specialist", role, status: "complete" });
  }
  onEvent({ type: "stage", stage: "challenging-findings" });
  onEvent({ type: "stage", stage: "editing-briefing" });
}

function successfulPanel(): ReturnType<typeof vi.fn<RunPanel>> {
  return vi.fn<RunPanel>(({ pack, language, onEvent }) => {
    emitPanelProgress(onEvent);
    return Promise.resolve(panelResult(pack, language));
  });
}

function modelRun(
  capabilityClass: "auto" | "multi-model" = "auto",
  close: () => Promise<void> = () => Promise.resolve(),
): PanelModelRun {
  return {
    allocation: {
      capabilityClass,
      product: null,
      onboardingArchitecture: null,
      trustEcosystem: null,
      skeptic: null,
      editor: null,
    },
    candidates: [],
    runJson: vi.fn(() =>
      Promise.reject(new Error("runJson must not be called by this fixture")),
    ),
    close: vi.fn(close),
    async [Symbol.asyncDispose]() {
      await this.close();
    },
  };
}

function createGateway(
  capabilityClass: "auto" | "multi-model" = "auto",
  close: () => Promise<void> = () => Promise.resolve(),
): {
  gateway: DeepAnalysisServiceOptions["panelGateway"];
  runs: PanelModelRun[];
  runJsonCalls: number[];
  closeCalls: number[];
  open: ReturnType<
    typeof vi.fn<DeepAnalysisServiceOptions["panelGateway"]["open"]>
  >;
} {
  const runs: PanelModelRun[] = [];
  const runJsonCalls: number[] = [];
  const closeCalls: number[] = [];
  const open = vi.fn<DeepAnalysisServiceOptions["panelGateway"]["open"]>(() => {
    const index = runs.length;
    const run = modelRun(capabilityClass, close);
    const originalRunJson = run.runJson.bind(run);
    const originalClose = run.close.bind(run);
    run.runJson = (request) => {
      runJsonCalls[index] = (runJsonCalls[index] ?? 0) + 1;
      return originalRunJson(request);
    };
    run.close = () => {
      closeCalls[index] = (closeCalls[index] ?? 0) + 1;
      return originalClose();
    };
    runs.push(run);
    return Promise.resolve(run);
  });
  return { gateway: { open }, runs, runJsonCalls, closeCalls, open };
}

function createGitHubHarness(initial = repositorySnapshot()): {
  client: GitHubClient;
  setSnapshot(value: VerifiedRepositorySnapshot): void;
  setRepositoryFacts(
    implementation: GitHubClient["fetchRepositoryFacts"],
  ): void;
  fetchRepositoryFacts: ReturnType<
    typeof vi.fn<GitHubClient["fetchRepositoryFacts"]>
  >;
} {
  let current = initial;
  let repositoryFacts: GitHubClient["fetchRepositoryFacts"] = () =>
    Promise.reject(new ServerGitHubError("not-found"));
  const fetchRepositoryFacts = vi.fn<GitHubClient["fetchRepositoryFacts"]>(
    (...arguments_) => repositoryFacts(...arguments_),
  );
  const client: GitHubClient = {
    verifySnapshot: vi.fn(() => Promise.resolve(structuredClone(current))),
    fetchEvidenceFiles: vi.fn(() => Promise.resolve([])),
    fetchReleaseSummary: vi.fn(() =>
      Promise.resolve({
        acquiredAt: ACQUIRED_AT,
        endpointAvailable: true,
        releases: [],
      }),
    ),
    fetchRecentActivity: vi.fn(() =>
      Promise.resolve({
        acquiredAt: ACQUIRED_AT,
        eventsScanned: 0,
        latestActivityAt: null,
        counts: {
          push: 0,
          issue: 0,
          "pull-request": 0,
          release: 0,
          other: 0,
        },
      }),
    ),
    fetchAlternatives: vi.fn(() => Promise.resolve([])),
    fetchRepositoryFacts,
  };
  return {
    client,
    setSnapshot(value) {
      current = value;
    },
    setRepositoryFacts(implementation) {
      repositoryFacts = implementation;
    },
    fetchRepositoryFacts,
  };
}

function createService(options: {
  githubClient: GitHubClient;
  panelGateway: DeepAnalysisServiceOptions["panelGateway"];
  runPanel: RunPanel;
  alternativeService?: DeepAnalysisServiceOptions["alternativeService"];
}): {
  service: DeepAnalysisService;
  narrativeCache: DeepNarrativeCache;
  alternativeCache: AlternativeShortlistCache;
} {
  const narrativeCache = new DeepNarrativeCache();
  const alternativeCache = new AlternativeShortlistCache();
  return {
    service: new DeepAnalysisService({
      githubClient: options.githubClient,
      panelGateway: options.panelGateway,
      runPanel: options.runPanel,
      ...(options.alternativeService === undefined
        ? {}
        : { alternativeService: options.alternativeService }),
      narrativeCache,
      alternativeCache,
      now: () => new Date(ACQUIRED_AT),
    }),
    narrativeCache,
    alternativeCache,
  };
}

function stageNames(events: readonly DeepAnalysisEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "stage" ? [event.stage] : [],
  );
}

describe("DeepAnalysisService", () => {
  it("caches only narrative and rejoins fresh community metrics without model calls", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const runPanel = successfulPanel();
    const alternativeService = {
      getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
    };
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService,
    });
    const firstEvents: DeepAnalysisEvent[] = [];
    const first = await service.run(
      REQUEST,
      TOKEN,
      (event) => firstEvents.push(event),
      new AbortController().signal,
    );

    github.setSnapshot(
      repositorySnapshot({
        starsCount: 9_001,
        watchersCount: 88,
        forksCount: 777,
        openIssuesCount: 66,
        pushedAt: "2026-08-23T12:00:00.000Z",
      }),
    );
    const secondEvents: DeepAnalysisEvent[] = [];
    const second = await service.run(
      REQUEST,
      TOKEN,
      (event) => secondEvents.push(event),
      new AbortController().signal,
    );

    expect(first.maintenance.community).toMatchObject({
      stars: VERIFIED_GITHUB_SNAPSHOT.repository.starsCount,
      watchers: VERIFIED_GITHUB_SNAPSHOT.repository.watchersCount,
      forks: VERIFIED_GITHUB_SNAPSHOT.repository.forksCount,
    });
    expect(second.maintenance.community).toMatchObject({
      stars: 9_001,
      watchers: 88,
      forks: 777,
      openIssues: 66,
      pushedAt: "2026-08-23T12:00:00.000Z",
    });
    expect(runPanel).toHaveBeenCalledOnce();
    expect(gateway.open).toHaveBeenCalledTimes(2);
    expect(gateway.runJsonCalls).toEqual([]);
    expect(gateway.closeCalls).toEqual([1, 1]);
    expect(stageNames(firstEvents)).toEqual(DEEP_STAGES);
    expect(stageNames(secondEvents)).toEqual([
      "preparing-evidence",
      "validating-sources",
    ]);
    expect(narrativeCache.count()).toBe(1);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("keeps capability-class cache entries isolated", async () => {
    const github = createGitHubHarness();
    const autoGateway = createGateway("auto");
    const multiGateway = createGateway("multi-model");
    const runPanel = successfulPanel();
    const narrativeCache = new DeepNarrativeCache();
    const alternativeCache = new AlternativeShortlistCache();
    const shared = {
      githubClient: github.client,
      narrativeCache,
      alternativeCache,
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
      runPanel,
      now: () => new Date(ACQUIRED_AT),
    };
    const auto = new DeepAnalysisService({
      ...shared,
      panelGateway: autoGateway.gateway,
    });
    const multi = new DeepAnalysisService({
      ...shared,
      panelGateway: multiGateway.gateway,
    });

    await auto.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);
    await multi.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);
    await auto.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);

    expect(runPanel).toHaveBeenCalledTimes(2);
    expect(narrativeCache.count()).toBe(2);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("keeps language and verified commit cache entries isolated", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const runPanel = successfulPanel();
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });
    const chineseRequest: DeepAnalysisRequest = {
      ...REQUEST,
      repository: { ...REQUEST.repository },
      language: "zh-CN",
    };
    const otherCommit = "f".repeat(40);
    const otherRequest: DeepAnalysisRequest = {
      ...REQUEST,
      repository: { ...REQUEST.repository, commitSha: otherCommit },
    };

    await service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);
    await service.run(
      chineseRequest,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );
    github.setSnapshot({ ...repositorySnapshot(), commitSha: otherCommit });
    await service.run(
      otherRequest,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );
    github.setSnapshot(repositorySnapshot());
    await service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);

    expect(runPanel).toHaveBeenCalledTimes(3);
    expect(narrativeCache.count()).toBe(3);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("refreshes cached alternative metrics and reuses the narrative", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const runPanel = successfulPanel();
    const original = alternativeRepository();
    const refreshed = alternativeRepository({
      starsCount: 420,
      watchersCount: 70,
      forksCount: 50,
      openIssuesCount: 20,
      pushedAt: "2026-08-23T10:00:00.000Z",
    });
    github.setRepositoryFacts(() =>
      Promise.resolve(structuredClone(refreshed)),
    );
    const alternativeService = {
      getShortlist: vi.fn(() => Promise.resolve(Object.freeze([original]))),
    };
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService,
    });

    const first = await service.run(
      REQUEST,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );
    const second = await service.run(
      REQUEST,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );

    expect(first.alternatives[0]?.github).toMatchObject({
      stars: 42,
      watchers: 7,
      forks: 5,
    });
    expect(second.alternatives[0]?.github).toMatchObject({
      stars: 420,
      watchers: 70,
      forks: 50,
      openIssues: 20,
    });
    expect(alternativeService.getShortlist).toHaveBeenCalledOnce();
    expect(github.fetchRepositoryFacts).toHaveBeenCalledOnce();
    expect(runPanel).toHaveBeenCalledOnce();
    narrativeCache.close();
    alternativeCache.close();
  });

  it("degrades alternative discovery failures without failing the report", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const runPanel = successfulPanel();
    let observedCoverage: EvidencePack["coverage"]["alternatives"] | null =
      null;
    const inspectingPanel = vi.fn<RunPanel>(async (options) => {
      observedCoverage = options.pack.coverage.alternatives;
      return await runPanel(options);
    });
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel: inspectingPanel,
      alternativeService: {
        getShortlist: vi.fn(() =>
          Promise.reject(new ServerGitHubError("network")),
        ),
      },
    });

    const report = await service.run(
      REQUEST,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );

    expect(report.alternatives).toEqual([]);
    expect(observedCoverage).toBe("unavailable");
    narrativeCache.close();
    alternativeCache.close();
  });

  it("fans cancellation into the panel and always closes its model run", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const controller = new AbortController();
    const started = deferred<AbortSignal>();
    const runPanel = vi.fn<RunPanel>(async ({ onEvent, signal }) => {
      onEvent({ type: "stage", stage: "consulting-specialists" });
      for (const role of [
        "product",
        "onboarding-architecture",
        "trust-ecosystem",
      ] as const) {
        onEvent({ type: "specialist", role, status: "started" });
      }
      started.resolve(signal);
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            reject(new PanelOrchestrationError("aborted"));
          },
          { once: true },
        );
      });
      throw new PanelOrchestrationError("aborted");
    });
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });
    const running = service.run(REQUEST, TOKEN, vi.fn(), controller.signal);
    expect(await started.promise).toBe(controller.signal);
    controller.abort(new Error("private cancellation reason"));

    await expect(running).rejects.toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "cancelled",
        message: "deep-analysis-cancelled",
      }),
    );
    expect(gateway.runs).toHaveLength(1);
    expect(gateway.closeCalls).toEqual([1]);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("preserves typed failures and never leaks a model close error", async () => {
    const github = createGitHubHarness();
    const closeSecret = "provider-secret-from-close";
    const gateway = createGateway("auto", () =>
      Promise.reject(new Error(closeSecret)),
    );
    const runPanel = vi.fn<RunPanel>(() =>
      Promise.reject(new PanelOrchestrationError("invalid-output")),
    );
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });

    let failure: unknown;
    try {
      await service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "invalid-evidence",
        message: "deep-analysis-invalid-evidence",
      }),
    );
    expect(String(failure)).not.toContain(closeSecret);
    expect(gateway.closeCalls).toEqual([1]);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("maps a close-only provider failure to a body-free internal error", async () => {
    const github = createGitHubHarness();
    const closeSecret = "provider-secret-from-successful-run-close";
    const gateway = createGateway("auto", () =>
      Promise.reject(new Error(closeSecret)),
    );
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel: successfulPanel(),
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });

    let failure: unknown;
    try {
      await service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "internal",
        message: "deep-analysis-internal",
      }),
    );
    expect(String(failure)).not.toContain(closeSecret);
    expect(gateway.closeCalls).toEqual([1]);
    narrativeCache.close();
    alternativeCache.close();
  });

  it("maps provider and GitHub failures to body-free public errors", async () => {
    const github = createGitHubHarness();
    vi.mocked(github.client.verifySnapshot).mockRejectedValueOnce(
      new ServerGitHubError("rate-limit", 403, "private reset detail"),
    );
    const gateway = {
      open: vi.fn(() =>
        Promise.reject(new PanelModelGatewayError("open-failed")),
      ),
    };
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway,
      runPanel: successfulPanel(),
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });

    await expect(
      service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "rate-limit",
        message: "deep-analysis-rate-limit",
      }),
    );
    expect(gateway.open).not.toHaveBeenCalled();
    narrativeCache.close();
    alternativeCache.close();
  });

  it("rejects an invalid request with a typed error before using dependencies", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel: successfulPanel(),
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });
    const invalidRequest: DeepAnalysisRequest = {
      ...REQUEST,
      repository: { ...REQUEST.repository, commitSha: "not-a-commit" },
    };

    await expect(
      service.run(invalidRequest, TOKEN, vi.fn(), new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "invalid-evidence",
        message: "deep-analysis-invalid-evidence",
      }),
    );
    expect(vi.mocked(github.client.verifySnapshot)).not.toHaveBeenCalled();
    expect(gateway.open).not.toHaveBeenCalled();
    narrativeCache.close();
    alternativeCache.close();
  });

  it("fails closed when an unknown provider error traps classification", async () => {
    const github = createGitHubHarness();
    const hostile = new Proxy(new Error("private provider value"), {
      getPrototypeOf() {
        throw new Error("private provider trap");
      },
    });
    const gateway = {
      open: vi.fn(() => Promise.reject(hostile)),
    };
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway,
      runPanel: successfulPanel(),
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });

    await expect(
      service.run(REQUEST, TOKEN, vi.fn(), new AbortController().signal),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DeepAnalysisServiceError>>({
        kind: "internal",
        message: "deep-analysis-internal",
      }),
    );
    narrativeCache.close();
    alternativeCache.close();
  });

  it("returns a detached report snapshot", async () => {
    const github = createGitHubHarness();
    const gateway = createGateway();
    const runPanel = successfulPanel();
    const { service, narrativeCache, alternativeCache } = createService({
      githubClient: github.client,
      panelGateway: gateway.gateway,
      runPanel,
      alternativeService: {
        getShortlist: vi.fn(() => Promise.resolve(Object.freeze([]))),
      },
    });

    const first: DeepReport = await service.run(
      REQUEST,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );
    first.orientation.summary[0] = {
      text: "caller mutation",
      provenance: "unknown",
      confidence: "low",
      evidenceIds: [],
    };
    const second = await service.run(
      REQUEST,
      TOKEN,
      vi.fn(),
      new AbortController().signal,
    );

    expect(second.orientation.summary[0]?.text).toBe("Orientation summary");
    expect(runPanel).toHaveBeenCalledOnce();
    narrativeCache.close();
    alternativeCache.close();
  });
});
