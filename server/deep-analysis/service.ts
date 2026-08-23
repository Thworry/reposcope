import type { Language } from "../../src/features/analysis/model.js";
import { DeepEventSequenceGuard } from "../../src/features/deep-analysis/guards.js";
import type {
  DeepAnalysisErrorKind,
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
} from "../../src/features/deep-analysis/model.js";
import { AlternativeShortlistCache } from "../cache/alternative-shortlist-cache.js";
import {
  DeepNarrativeCache,
  type DeepNarrativeCacheKey,
} from "../cache/deep-narrative-cache.js";
import {
  AlternativeShortlistService,
  buildAlternativeQueries,
} from "../evidence/alternatives.js";
import { buildEvidencePack } from "../evidence/build-evidence-pack.js";
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidencePack,
  type SanitizedEvidenceDocument,
  type VerifiedAlternativeRepository,
} from "../evidence/model.js";
import { sanitizeReadmeForModel } from "../evidence/safe-readme.js";
import { ServerGitHubClient } from "../github/client.js";
import { ServerGitHubError } from "../github/model.js";
import type {
  EvidenceTextFile,
  RecentActivitySummary,
  ReleaseSummary,
  VerifiedRepositorySnapshot,
} from "../github/model.js";
import {
  PanelModelGateway,
  PanelModelGatewayError,
} from "../panel/copilot-gateway.js";
import type { PanelModelRun } from "../panel/copilot-gateway.js";
import {
  materializeDeepReportDraft,
  snapshotDeepReportDraft,
} from "../panel/guards.js";
import type {
  DeepReportDraft,
  DeepReportServerFields,
} from "../panel/model.js";
import {
  PanelOrchestrationError,
  runExpertPanel,
  type PanelNarrativeResult,
  type PanelProgressEvent,
} from "../panel/orchestrator.js";
import { PANEL_PROMPT_VERSION } from "../panel/prompts.js";
import { snapshotJsonData } from "../panel/parse-json.js";

export const ALTERNATIVE_STRATEGY_VERSION = "1.0.0" as const;

export type DeepAnalysisServiceErrorKind = Extract<
  DeepAnalysisErrorKind,
  | "cancelled"
  | "copilot-unavailable"
  | "github-unavailable"
  | "invalid-evidence"
  | "rate-limit"
  | "repository-changed"
  | "internal"
>;

export class DeepAnalysisServiceError extends Error {
  override readonly name = "DeepAnalysisServiceError";

  constructor(readonly kind: DeepAnalysisServiceErrorKind) {
    super(`deep-analysis-${kind}`);
  }
}

type GitHubEvidenceClient = Pick<
  ServerGitHubClient,
  | "verifySnapshot"
  | "fetchEvidenceFiles"
  | "fetchReleaseSummary"
  | "fetchRecentActivity"
  | "fetchAlternatives"
  | "fetchRepositoryFacts"
>;

type AlternativeService = Pick<AlternativeShortlistService, "getShortlist">;
type PanelGateway = Pick<PanelModelGateway, "open">;

type RunPanel = (options: {
  readonly pack: EvidencePack;
  readonly language: Language;
  readonly modelRun: PanelModelRun;
  readonly signal: AbortSignal;
  readonly onEvent: (event: PanelProgressEvent) => void;
}) => Promise<PanelNarrativeResult>;

export interface DeepAnalysisServiceOptions {
  readonly githubClient: GitHubEvidenceClient;
  readonly panelGateway: PanelGateway;
  readonly narrativeCache: DeepNarrativeCache;
  readonly alternativeCache: AlternativeShortlistCache;
  readonly alternativeService?: AlternativeService;
  readonly runPanel?: RunPanel;
  readonly now?: () => Date;
}

export type DeepAnalysisProgressEvent = Extract<
  DeepAnalysisEvent,
  { type: "stage" | "specialist" }
>;

interface CachedPanelNarrative {
  readonly schemaVersion: "1.0.0";
  readonly coverage: "full" | "reduced";
  readonly draft: DeepReportDraft;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function snapshotCachedNarrative(
  value: unknown,
  pack: EvidencePack,
  language: Language,
): CachedPanelNarrative | null {
  const snapshot = snapshotJsonData(value);
  if (
    !exactRecord(snapshot, ["schemaVersion", "coverage", "draft"]) ||
    snapshot.schemaVersion !== "1.0.0" ||
    (snapshot.coverage !== "full" && snapshot.coverage !== "reduced")
  ) {
    return null;
  }
  const draft = snapshotDeepReportDraft(snapshot.draft, pack, language);
  return draft === null
    ? null
    : {
        schemaVersion: "1.0.0",
        coverage: snapshot.coverage,
        draft,
      };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DeepAnalysisServiceError("cancelled");
}

function safeNow(now: () => Date): string {
  let value: Date;
  try {
    value = now();
  } catch {
    throw new DeepAnalysisServiceError("internal");
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new DeepAnalysisServiceError("internal");
  }
  return value.toISOString();
}

function serviceError(
  error: unknown,
  signal: AbortSignal,
): DeepAnalysisServiceError {
  if (signal.aborted) return new DeepAnalysisServiceError("cancelled");
  try {
    if (error instanceof DeepAnalysisServiceError) return error;
    if (error instanceof ServerGitHubError) {
      switch (error.kind) {
        case "not-found":
          return new DeepAnalysisServiceError("repository-changed");
        case "rate-limit":
          return new DeepAnalysisServiceError("rate-limit");
        case "network":
        case "timeout":
          return new DeepAnalysisServiceError("github-unavailable");
        case "invalid-response":
          return new DeepAnalysisServiceError("invalid-evidence");
      }
    }
    if (error instanceof PanelModelGatewayError) {
      return new DeepAnalysisServiceError(
        error.kind === "aborted" || error.kind === "closed"
          ? "cancelled"
          : "copilot-unavailable",
      );
    }
    if (error instanceof PanelOrchestrationError) {
      switch (error.kind) {
        case "aborted":
          return new DeepAnalysisServiceError("cancelled");
        case "unavailable":
          return new DeepAnalysisServiceError("copilot-unavailable");
        case "insufficient-coverage":
        case "invalid-output":
          return new DeepAnalysisServiceError("invalid-evidence");
      }
    }
  } catch {
    // Provider failures are hostile values; never expose classification traps.
  }
  return new DeepAnalysisServiceError("internal");
}

function sequenceGuard(request: DeepAnalysisRequest): DeepEventSequenceGuard {
  try {
    return new DeepEventSequenceGuard(request);
  } catch {
    throw new DeepAnalysisServiceError("invalid-evidence");
  }
}

function readmeEvidence(
  files: readonly EvidenceTextFile[],
): SanitizedEvidenceDocument {
  const readme = files.find((file) => file.kind === "readme");
  return readme === undefined
    ? { blocks: [], complete: true }
    : sanitizeReadmeForModel(readme);
}

function alternativeCacheKey(snapshot: VerifiedRepositorySnapshot) {
  return {
    repository: {
      owner: snapshot.repository.owner,
      repo: snapshot.repository.repo,
      commitSha: snapshot.commitSha,
    },
    strategyVersion: ALTERNATIVE_STRATEGY_VERSION,
  } as const;
}

function narrativeCacheKey(
  request: DeepAnalysisRequest,
  capabilityClass: "auto" | "multi-model",
): DeepNarrativeCacheKey {
  return {
    repository: { ...request.repository },
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    promptVersion: PANEL_PROMPT_VERSION,
    language: request.language,
    capabilityClass,
  };
}

function serverFields(
  snapshot: VerifiedRepositorySnapshot,
  alternatives: readonly VerifiedAlternativeRepository[],
  review: DeepReportServerFields["review"],
): DeepReportServerFields {
  return {
    review: { ...review },
    community: {
      stars: snapshot.repository.starsCount,
      forks: snapshot.repository.forksCount,
      watchers: snapshot.repository.watchersCount,
      openIssues: snapshot.repository.openIssuesCount,
      pushedAt: snapshot.repository.pushedAt,
      archived: snapshot.repository.archived,
      license: snapshot.repository.licenseSpdxId,
    },
    alternatives: alternatives.map((repository) => ({
      repository: { owner: repository.owner, repo: repository.repo },
      github: {
        stars: repository.starsCount,
        forks: repository.forksCount,
        watchers: repository.watchersCount,
        openIssues: repository.openIssuesCount,
        pushedAt: repository.pushedAt,
        archived: repository.archived,
        license: repository.licenseSpdxId,
      },
    })),
  };
}

async function optionalEvidence<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    throwIfAborted(signal);
    return undefined;
  }
}

function sameRepository(
  left: { owner: string; repo: string },
  right: { owner: string; repo: string },
): boolean {
  return (
    left.owner.toLocaleLowerCase("en-US") ===
      right.owner.toLocaleLowerCase("en-US") &&
    left.repo.toLocaleLowerCase("en-US") ===
      right.repo.toLocaleLowerCase("en-US")
  );
}

/** Refreshes cached candidates without ever reusing their stale live metrics. */
async function refreshAlternativeFacts(
  client: GitHubEvidenceClient,
  shortlist: readonly VerifiedAlternativeRepository[],
  token: string,
  signal: AbortSignal,
): Promise<readonly VerifiedAlternativeRepository[]> {
  const settled = await Promise.allSettled(
    shortlist.map((repository) =>
      client.fetchRepositoryFacts(
        { owner: repository.owner, repo: repository.repo },
        token,
        signal,
      ),
    ),
  );
  throwIfAborted(signal);
  const refreshed: VerifiedAlternativeRepository[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const expected = shortlist[index];
    if (result?.status === "rejected") {
      if (
        result.reason instanceof ServerGitHubError &&
        result.reason.kind === "not-found"
      ) {
        continue;
      }
      throw result.reason instanceof Error
        ? result.reason
        : new ServerGitHubError("invalid-response");
    }
    if (
      result === undefined ||
      expected === undefined ||
      result.value.archived ||
      !sameRepository(result.value, expected)
    ) {
      continue;
    }
    refreshed.push(result.value);
  }
  return Object.freeze(refreshed);
}

/** Coordinates bounded evidence, the panel, cache freshness, and final joining. */
export class DeepAnalysisService {
  readonly #githubClient: GitHubEvidenceClient;
  readonly #panelGateway: PanelGateway;
  readonly #narrativeCache: DeepNarrativeCache;
  readonly #alternativeCache: AlternativeShortlistCache;
  readonly #alternativeService: AlternativeService;
  readonly #runPanel: RunPanel;
  readonly #now: () => Date;

  constructor(options: DeepAnalysisServiceOptions) {
    this.#githubClient = options.githubClient;
    this.#panelGateway = options.panelGateway;
    this.#narrativeCache = options.narrativeCache;
    this.#alternativeCache = options.alternativeCache;
    this.#alternativeService =
      options.alternativeService ??
      new AlternativeShortlistService(options.githubClient);
    this.#runPanel = options.runPanel ?? runExpertPanel;
    this.#now = options.now ?? (() => new Date());
  }

  async run(
    request: DeepAnalysisRequest,
    token: string,
    onEvent: (event: DeepAnalysisProgressEvent) => void,
    signal: AbortSignal,
  ): Promise<DeepReport> {
    const sequence = sequenceGuard(request);
    const emit = (event: DeepAnalysisProgressEvent): void => {
      if (!sequence.accept(event)) {
        throw new DeepAnalysisServiceError("internal");
      }
      onEvent(event);
    };
    let modelRun: PanelModelRun | null = null;
    let report: DeepReport | null = null;
    let failure: DeepAnalysisServiceError | null = null;
    try {
      throwIfAborted(signal);
      emit({ type: "stage", stage: "preparing-evidence" });
      const snapshot = await this.#githubClient.verifySnapshot(
        request,
        token,
        signal,
      );
      const [files, releaseSummary, activitySummary] = await Promise.all([
        this.#githubClient.fetchEvidenceFiles(snapshot, token, signal),
        optionalEvidence(
          () => this.#githubClient.fetchReleaseSummary(snapshot, token, signal),
          signal,
        ),
        optionalEvidence(
          () => this.#githubClient.fetchRecentActivity(snapshot, token, signal),
          signal,
        ),
      ]);
      throwIfAborted(signal);
      const alternativeKey = alternativeCacheKey(snapshot);
      let alternatives = this.#alternativeCache.read(alternativeKey);
      let alternativesAvailable = alternatives !== null;
      const readme = readmeEvidence(files);
      if (alternatives !== null) {
        try {
          alternatives = await refreshAlternativeFacts(
            this.#githubClient,
            alternatives,
            token,
            signal,
          );
        } catch {
          throwIfAborted(signal);
          alternatives = Object.freeze([]);
          alternativesAvailable = false;
        }
      } else {
        const queries = buildAlternativeQueries(snapshot, readme);
        try {
          alternatives =
            queries.length === 0
              ? Object.freeze([])
              : await this.#alternativeService.getShortlist(
                  snapshot,
                  readme,
                  token,
                  signal,
                );
          alternativesAvailable = true;
          this.#alternativeCache.write(alternativeKey, alternatives);
        } catch {
          throwIfAborted(signal);
          alternatives = Object.freeze([]);
          alternativesAvailable = false;
        }
      }

      const pack = buildEvidencePack({
        snapshot,
        files,
        ...(releaseSummary === undefined ? {} : { releaseSummary }),
        ...(activitySummary === undefined ? {} : { activitySummary }),
        alternatives,
        alternativesAvailable,
        acquiredAt: safeNow(this.#now),
      });

      modelRun = await this.#panelGateway.open(token, signal);
      const initialCapabilityClass = modelRun.allocation.capabilityClass;
      let narrativeCapabilityClass = initialCapabilityClass;
      let activeNarrativeKey = narrativeCacheKey(
        request,
        initialCapabilityClass,
      );
      let narrative = this.#narrativeCache.read(activeNarrativeKey, (value) =>
        snapshotCachedNarrative(value, pack, request.language),
      );
      if (narrative === null) {
        const panel = await this.#runPanel({
          pack,
          language: request.language,
          modelRun,
          signal,
          onEvent: emit,
        });
        const acceptedDraft = snapshotDeepReportDraft(
          panel.draft,
          pack,
          request.language,
        );
        if (acceptedDraft === null) {
          throw new DeepAnalysisServiceError("invalid-evidence");
        }
        narrative = {
          schemaVersion: "1.0.0",
          coverage: panel.coverage,
          draft: acceptedDraft,
        };
        narrativeCapabilityClass = modelRun.allocation.capabilityClass;
        activeNarrativeKey = narrativeCacheKey(
          request,
          narrativeCapabilityClass,
        );
        this.#narrativeCache.write(activeNarrativeKey, narrative, (value) =>
          snapshotCachedNarrative(value, pack, request.language),
        );
      }

      emit({ type: "stage", stage: "validating-sources" });
      const materialized = materializeDeepReportDraft(
        narrative.draft,
        pack,
        serverFields(snapshot, alternatives, {
          coverage: narrative.coverage,
          capabilityClass: narrativeCapabilityClass,
        }),
      );
      if (materialized === null) {
        this.#narrativeCache.delete(activeNarrativeKey);
        throw new DeepAnalysisServiceError("invalid-evidence");
      }
      report = structuredClone(materialized);
      throwIfAborted(signal);
    } catch (error) {
      failure = serviceError(error, signal);
    }
    if (modelRun !== null) {
      try {
        await modelRun.close();
      } catch (error) {
        failure ??= serviceError(error, signal);
      }
    }
    if (failure === null && signal.aborted) {
      failure = new DeepAnalysisServiceError("cancelled");
    }
    if (failure !== null) throw failure;
    if (report === null) throw new DeepAnalysisServiceError("internal");
    return report;
  }
}

export type { RecentActivitySummary, ReleaseSummary };
