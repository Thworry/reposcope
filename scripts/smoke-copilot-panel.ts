import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AlternativeShortlistCache } from "../server/cache/alternative-shortlist-cache.js";
import { DeepNarrativeCache } from "../server/cache/deep-narrative-cache.js";
import {
  DeepAnalysisService,
  DeepAnalysisServiceError,
} from "../server/deep-analysis/service.js";
import { ServerGitHubClient } from "../server/github/client.js";
import { PanelModelGateway } from "../server/panel/copilot-gateway.js";
import {
  isDeepReport,
  reportMatchesDeepRequest,
} from "../src/features/deep-analysis/guards.js";
import type {
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepReport,
} from "../src/features/deep-analysis/model.js";

const FIXED_REPOSITORY = Object.freeze({
  owner: "Thworry",
  repo: "reposcope",
});
const API_VERSION = "2026-03-10";
const MAX_DISCOVERY_BYTES = 512 * 1024;
const SMOKE_TIMEOUT_MS = 12 * 60 * 1_000;
const FIRST_RUN_STAGES = Object.freeze([
  "preparing-evidence",
  "consulting-specialists",
  "challenging-findings",
  "editing-briefing",
  "validating-sources",
] as const);
const CACHE_HIT_STAGES = Object.freeze([
  "preparing-evidence",
  "validating-sources",
] as const);

class LiveSmokeError extends Error {
  override readonly name = "LiveSmokeError";

  constructor(
    readonly kind:
      "disabled" | "token" | "github" | "copilot" | "report" | "internal",
  ) {
    super(kind);
  }
}

function requiredOptIn(environment: NodeJS.ProcessEnv): string {
  if (environment.REPOSCOPE_LIVE_COPILOT_SMOKE !== "1") {
    throw new LiveSmokeError("disabled");
  }
  const token = environment.REPOSCOPE_LIVE_COPILOT_GITHUB_TOKEN;
  if (
    typeof token !== "string" ||
    token.length > 512 ||
    !/^gho_[A-Za-z0-9_]+$/u.test(token)
  ) {
    throw new LiveSmokeError("token");
  }
  return token;
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  if (!response.ok || response.body === null) {
    await response.body?.cancel().catch(() => undefined);
    throw new LiveSmokeError("github");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const value: unknown = result.value as unknown;
      if (!(value instanceof Uint8Array)) {
        throw new LiveSmokeError("github");
      }
      total += value.byteLength;
      if (total > maximumBytes) throw new LiveSmokeError("github");
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the redacted smoke failure.
    }
    if (error instanceof LiveSmokeError) throw error;
    throw new LiveSmokeError("github");
  } finally {
    reader.releaseLock();
  }
}

function dataProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LiveSmokeError("github");
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new LiveSmokeError("github");
  }
  return descriptor.value as unknown;
}

async function discoverCommit(
  token: string,
  signal: AbortSignal,
): Promise<string> {
  const base = `https://api.github.com/repos/${encodeURIComponent(FIXED_REPOSITORY.owner)}/${encodeURIComponent(FIXED_REPOSITORY.repo)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": API_VERSION,
  };
  let repositoryResponse: Response;
  try {
    repositoryResponse = await fetch(base, { headers, signal });
  } catch {
    throw new LiveSmokeError("github");
  }
  const repository = await readBoundedJson(
    repositoryResponse,
    MAX_DISCOVERY_BYTES,
  );
  const branch = dataProperty(repository, "default_branch");
  if (
    typeof branch !== "string" ||
    branch.length === 0 ||
    branch.length > 255 ||
    /[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(branch)
  ) {
    throw new LiveSmokeError("github");
  }
  let commitResponse: Response;
  try {
    commitResponse = await fetch(
      `${base}/commits/${encodeURIComponent(branch)}`,
      { headers, signal },
    );
  } catch {
    throw new LiveSmokeError("github");
  }
  const commit = await readBoundedJson(commitResponse, MAX_DISCOVERY_BYTES);
  const sha = dataProperty(commit, "sha");
  if (
    typeof sha !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(sha)
  ) {
    throw new LiveSmokeError("github");
  }
  return sha;
}

function reportCounts(report: DeepReport): Readonly<Record<string, number>> {
  return Object.freeze({
    chapters: 10,
    orientation: report.orientation.summary.length + 1,
    fit: report.fit.goodFor.length + report.fit.poorFor.length,
    situations: report.situations.length,
    capabilities: report.capabilities.length,
    workflow: report.workflow.length,
    architecture:
      report.architecture.summary.length +
      report.architecture.technologies.length +
      report.architecture.concepts.length,
    onboarding:
      report.onboarding.prerequisites.length +
      report.onboarding.install.length +
      report.onboarding.run.length +
      report.onboarding.develop.length +
      report.onboarding.cautions.length,
    trust:
      report.trust.reliability.length +
      report.trust.security.length +
      report.trust.privacy.length +
      report.trust.unknowns.length,
    maintenance:
      report.maintenance.summary.length + report.maintenance.signals.length,
    alternatives: report.alternatives.length,
    disagreements: report.disagreements.length,
    nextChecks: report.nextChecks.length,
    evidence: report.evidence.length,
  });
}

interface RunTrace {
  readonly report: DeepReport;
  readonly stages: ReadonlyArray<{ stage: string; elapsedMs: number }>;
  readonly specialistEvents: number;
}

async function runOnce(
  service: DeepAnalysisService,
  request: DeepAnalysisRequest,
  token: string,
  signal: AbortSignal,
): Promise<RunTrace> {
  const startedAt = performance.now();
  const stages: Array<{ stage: string; elapsedMs: number }> = [];
  let specialistEvents = 0;
  const report = await service.run(
    request,
    token,
    (event: Extract<DeepAnalysisEvent, { type: "stage" | "specialist" }>) => {
      if (event.type === "stage") {
        stages.push({
          stage: event.stage,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      } else {
        specialistEvents += 1;
      }
    },
    signal,
  );
  if (!isDeepReport(report) || !reportMatchesDeepRequest(report, request)) {
    throw new LiveSmokeError("report");
  }
  return Object.freeze({
    report,
    stages: Object.freeze(stages),
    specialistEvents,
  });
}

function hasExactStages(trace: RunTrace, expected: readonly string[]): boolean {
  return (
    trace.stages.length === expected.length &&
    trace.stages.every(({ stage }, index) => stage === expected[index])
  );
}

async function suppressSdkStderr<T>(operation: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "write");
  Object.defineProperty(process.stderr, "write", {
    configurable: true,
    value: () => true,
    writable: true,
  });
  try {
    return await operation();
  } finally {
    if (descriptor === undefined) {
      Reflect.deleteProperty(process.stderr, "write");
    } else {
      Object.defineProperty(process.stderr, "write", descriptor);
    }
  }
}

function redactedSmokeError(error: unknown): LiveSmokeError {
  if (error instanceof LiveSmokeError) return error;
  if (error instanceof DeepAnalysisServiceError) {
    return new LiveSmokeError(
      error.kind === "github-unavailable"
        ? "github"
        : error.kind === "copilot-unavailable"
          ? "copilot"
          : "report",
    );
  }
  return new LiveSmokeError("internal");
}

export async function runLiveCopilotSmoke(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Readonly<Record<string, unknown>>> {
  const token = requiredOptIn(environment);
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "reposcope-live-smoke-"),
  );
  let narrativeCache: DeepNarrativeCache | null = null;
  let alternativeCache: AlternativeShortlistCache | null = null;
  const timeoutSignal = AbortSignal.timeout(SMOKE_TIMEOUT_MS);
  const controller = new AbortController();
  const signal = AbortSignal.any([timeoutSignal, controller.signal]);
  const abort = () => {
    controller.abort();
  };
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  let result: Readonly<Record<string, unknown>> | null = null;
  let failure: LiveSmokeError | null = null;
  let cleanupFailed = false;
  try {
    narrativeCache = new DeepNarrativeCache({
      path: join(temporaryDirectory, "narrative.sqlite"),
    });
    alternativeCache = new AlternativeShortlistCache({
      path: join(temporaryDirectory, "alternatives.sqlite"),
    });
    const commitSha = await discoverCommit(token, signal);
    const request: DeepAnalysisRequest = {
      repository: { ...FIXED_REPOSITORY, commitSha },
      language: "en",
    };
    const service = new DeepAnalysisService({
      githubClient: new ServerGitHubClient(),
      panelGateway: new PanelModelGateway(),
      narrativeCache,
      alternativeCache,
    });
    const activeNarrativeCache = narrativeCache;
    const {
      first,
      second,
      cacheEntriesAfterFirstRun,
      cacheEntriesAfterSecondRun,
    } = await suppressSdkStderr(async () => {
      const firstRun = await runOnce(service, request, token, signal);
      const afterFirst = activeNarrativeCache.count();
      const secondRun = await runOnce(service, request, token, signal);
      return {
        first: firstRun,
        second: secondRun,
        cacheEntriesAfterFirstRun: afterFirst,
        cacheEntriesAfterSecondRun: activeNarrativeCache.count(),
      };
    });
    const firstRunUsedPanel =
      first.specialistEvents === 6 && hasExactStages(first, FIRST_RUN_STAGES);
    const cacheHit =
      firstRunUsedPanel &&
      cacheEntriesAfterFirstRun === 1 &&
      cacheEntriesAfterSecondRun === cacheEntriesAfterFirstRun &&
      second.specialistEvents === 0 &&
      hasExactStages(second, CACHE_HIT_STAGES);
    if (!cacheHit) throw new LiveSmokeError("report");
    result = Object.freeze({
      firstRun: Object.freeze({
        stages: first.stages,
        specialistEvents: first.specialistEvents,
      }),
      secondRun: Object.freeze({
        stages: second.stages,
        cacheStatus: "validated-hit",
      }),
      reportSections: reportCounts(second.report),
    });
  } catch (error) {
    failure = redactedSmokeError(error);
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    try {
      narrativeCache?.close();
    } catch {
      cleanupFailed = true;
    }
    try {
      alternativeCache?.close();
    } catch {
      cleanupFailed = true;
    }
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) throw new LiveSmokeError("internal");
  if (failure !== null) throw failure;
  if (result === null) throw new LiveSmokeError("internal");
  return result;
}

async function main(): Promise<void> {
  try {
    const result = await runLiveCopilotSmoke();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const kind = error instanceof LiveSmokeError ? error.kind : "internal";
    const message =
      kind === "disabled"
        ? "live Copilot smoke is disabled"
        : kind === "token"
          ? "live Copilot smoke requires a supported user OAuth token"
          : `live Copilot smoke failed: ${kind}`;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (
  typeof entryPath === "string" &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  await main();
}
