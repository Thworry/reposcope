import type {
  AnalysisReport,
  CoverageSummary,
  FetchedTextFile,
  LanguageAnalysis,
  ReaderReport,
  RepoRef,
  RepositoryMetadata,
  ScoringRepositoryMetadata,
  ScanPhase,
  SelectedFile,
} from "../analysis/model";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../analysis/project-brief-safety";
import {
  computeDuplicateRatio,
  findCircularImports,
} from "../analyzers/cross-file";
import { analyzeGeneralRepository } from "../analyzers/general";
import { analyzeProjectBrief } from "../analyzers/project-brief";
import {
  analyzeReaderReport,
  unavailableReaderReport,
} from "../analyzers/reader-report";
import {
  GitHubApiError,
  fetchRawTextFile,
  fetchRepositorySnapshot,
  type RawTextInput,
  type RawTextResult,
  type RepositorySnapshot,
} from "../github/github-client";
import { buildFindings } from "../rules/findings";
import { scoreProject } from "../rules/rules";
import { selectFiles } from "../scanner/select-files";
import { normalizeTree } from "../scanner/tree";
import type {
  SerializableAnalysisError,
  WorkerCommand,
  WorkerEvent,
} from "./protocol";

const MAX_ATTEMPTS = 200;
const MAX_FETCHED_BYTES = 10 * 1024 * 1024;
const MAX_CONCURRENCY = 6;
const FETCH_PHASE_TIMEOUT_MS = 90_000;

type NormalizeTree = typeof normalizeTree;
type SelectFiles = typeof selectFiles;
type AnalyzeGeneral = typeof analyzeGeneralRepository;
type ProjectBriefAnalyzer = typeof analyzeProjectBrief;
type ReaderReportAnalyzer = typeof analyzeReaderReport;
type Duplicate = typeof computeDuplicateRatio;
type Cycles = typeof findCircularImports;
type Score = typeof scoreProject;
type Findings = typeof buildFindings;

export interface AnalysisDependencies {
  fetchSnapshot: (
    ref: RepoRef,
    signal: AbortSignal,
  ) => Promise<RepositorySnapshot>;
  normalize: NormalizeTree;
  select: SelectFiles;
  fetchFile: (
    input: RawTextInput,
    signal: AbortSignal,
  ) => Promise<RawTextResult>;
  analyzeGeneral: AnalyzeGeneral;
  projectBrief: ProjectBriefAnalyzer;
  readerReport: ReaderReportAnalyzer;
  loadJavaScriptTypeScript: () => Promise<{
    analyzeJavaScriptTypeScript: (
      files: readonly FetchedTextFile[],
    ) => LanguageAnalysis;
  }>;
  loadPython: () => Promise<{
    analyzePython: (files: readonly FetchedTextFile[]) => LanguageAnalysis;
  }>;
  duplicate: Duplicate;
  cycles: Cycles;
  score: Score;
  findings: Findings;
  now: () => number;
  signal?: AbortSignal;
}

const productionDependencies: AnalysisDependencies = {
  fetchSnapshot: fetchRepositorySnapshot,
  normalize: normalizeTree,
  select: selectFiles,
  fetchFile: fetchRawTextFile,
  analyzeGeneral: analyzeGeneralRepository,
  projectBrief: analyzeProjectBrief,
  readerReport: analyzeReaderReport,
  loadJavaScriptTypeScript: () => import("../analyzers/js-ts"),
  loadPython: () => import("../analyzers/python"),
  duplicate: computeDuplicateRatio,
  cycles: findCircularImports,
  score: scoreProject,
  findings: buildFindings,
  now: Date.now,
};

function scoringRepository(
  repository: RepositoryMetadata,
): ScoringRepositoryMetadata {
  return {
    owner: repository.owner,
    repo: repository.repo,
    name: repository.name,
    fullName: repository.fullName,
    url: repository.url,
    description: repository.description,
    defaultBranch: repository.defaultBranch,
    archived: repository.archived,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    pushedAt: repository.pushedAt,
    size: repository.size,
    openIssuesCount: repository.openIssuesCount,
    topics: repository.topics,
    licenseSpdxId: repository.licenseSpdxId,
  } satisfies ScoringRepositoryMetadata;
}

type Failure = NonNullable<CoverageSummary["failures"]>[number];

function emptyLanguageAnalysis(): LanguageAnalysis {
  return {
    files: [],
    functions: [],
    identifierOccurrences: 0,
    ambiguousIdentifierOccurrences: 0,
    exportedDeclarations: 0,
    documentedExports: 0,
    parsedBytes: 0,
    parseFailures: [],
  };
}

function combineLanguageAnalyses(
  analyses: readonly LanguageAnalysis[],
): LanguageAnalysis {
  return analyses.reduce<LanguageAnalysis>(
    (combined, analysis) => ({
      files: [...combined.files, ...analysis.files],
      functions: [...combined.functions, ...analysis.functions],
      identifierOccurrences:
        combined.identifierOccurrences + analysis.identifierOccurrences,
      ambiguousIdentifierOccurrences:
        combined.ambiguousIdentifierOccurrences +
        analysis.ambiguousIdentifierOccurrences,
      exportedDeclarations:
        combined.exportedDeclarations + analysis.exportedDeclarations,
      documentedExports:
        combined.documentedExports + analysis.documentedExports,
      parsedBytes: combined.parsedBytes + analysis.parsedBytes,
      parseFailures: [...combined.parseFailures, ...analysis.parseFailures],
    }),
    emptyLanguageAnalysis(),
  );
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError")
  );
}

function fetchFailureReason(
  error: unknown,
  timedOut: boolean,
): Failure["reason"] {
  if (
    timedOut ||
    (error instanceof DOMException && error.name === "TimeoutError")
  ) {
    return "timeout";
  }
  if (error instanceof GitHubApiError) {
    return error.kind === "empty" ? "api" : error.kind;
  }

  return "network";
}

function serializableError(error: unknown): SerializableAnalysisError {
  if (error instanceof GitHubApiError) {
    const supportedKind = [
      "not-found",
      "rate-limit",
      "empty",
      "network",
      "api",
      "invalid-response",
    ].includes(error.kind)
      ? error.kind
      : "invalid-response";

    return {
      kind: supportedKind as SerializableAnalysisError["kind"],
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.resetAt === undefined ? {} : { resetAt: error.resetAt }),
    };
  }

  return { kind: "worker" };
}

function fetchedFile(
  selected: SelectedFile,
  result: RawTextResult,
): FetchedTextFile {
  return {
    path: selected.path,
    text: result.text,
    bytes: result.bytes,
    declaredSize: selected.size,
    language: selected.language,
    category: selected.category,
    isTest: selected.isTest,
  };
}

function progress(
  phase: ScanPhase,
  completedFiles = 0,
  totalFiles = 0,
  completedBytes = 0,
  totalBytes = 0,
) {
  return {
    phase,
    completedFiles,
    totalFiles,
    completedBytes,
    totalBytes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);

  return actual.length === keys.length && keys.every((key) => key in value);
}

function validAnalyzedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
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

function validRequestId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validRef(value: unknown): value is RepoRef {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["owner", "repo"]) &&
    typeof value.owner === "string" &&
    value.owner.length > 0 &&
    typeof value.repo === "string" &&
    value.repo.length > 0
  );
}

function validWorkerCommand(value: unknown): value is WorkerCommand {
  if (!isRecord(value) || !validRequestId(value.requestId)) return false;

  if (value.type === "cancel") {
    return hasExactKeys(value, ["type", "requestId"]);
  }

  return (
    value.type === "start" &&
    hasExactKeys(value, ["type", "requestId", "ref", "analyzedAt"]) &&
    validRef(value.ref) &&
    validAnalyzedAt(value.analyzedAt)
  );
}

export async function executeAnalysis(
  command: WorkerCommand,
  dependencies: AnalysisDependencies = productionDependencies,
  emit: (event: WorkerEvent) => void,
): Promise<void> {
  if (command.type !== "start") return;

  const { requestId, ref } = command;
  const callerSignal = dependencies.signal ?? new AbortController().signal;
  const emitProgress = (value: ReturnType<typeof progress>): void => {
    emit({ type: "progress", requestId, progress: value });
  };

  try {
    callerSignal.throwIfAborted();
    emitProgress(progress("validating"));
    emitProgress(progress("repository"));
    const snapshot = await dependencies.fetchSnapshot(ref, callerSignal);
    callerSignal.throwIfAborted();

    emitProgress(progress("selecting"));
    const normalizedTree = dependencies.normalize(
      snapshot.entries,
      !snapshot.treeComplete,
    );
    const unsafeTreePathCount =
      normalizedTree.files.filter((file) => !isSafeProjectBriefPath(file.path))
        .length +
      normalizedTree.skippedEntries.filter(
        (entry) => !isSafeProjectBriefPath(entry.path),
      ).length;
    const tree = {
      ...normalizedTree,
      files: normalizedTree.files.filter((file) =>
        isSafeProjectBriefPath(file.path),
      ),
      skippedEntries: normalizedTree.skippedEntries.filter((entry) =>
        isSafeProjectBriefPath(entry.path),
      ),
    };
    const selection = dependencies.select(tree);
    const candidates = selection.selected.slice(0, MAX_ATTEMPTS);
    const fetched: FetchedTextFile[] = [];
    const failures: Failure[] = [];
    let fetchedBytes = 0;
    let completedFiles = 0;
    let nextIndex = 0;
    let stopScheduling = false;
    let runtimeLimitReached = selection.selected.length > MAX_ATTEMPTS;
    const phaseController = new AbortController();
    const phaseSignal = AbortSignal.any([callerSignal, phaseController.signal]);
    const fetchStartedAt = dependencies.now();
    const phaseTimer = globalThis.setTimeout(() => {
      phaseController.abort(new DOMException("fetch-timeout", "TimeoutError"));
    }, FETCH_PHASE_TIMEOUT_MS);

    emitProgress(
      progress("fetching", 0, candidates.length, 0, selection.selectedBytes),
    );

    const fetchNext = async (): Promise<void> => {
      for (;;) {
        callerSignal.throwIfAborted();
        if (
          phaseController.signal.aborted ||
          dependencies.now() - fetchStartedAt >= FETCH_PHASE_TIMEOUT_MS ||
          fetchedBytes >= MAX_FETCHED_BYTES ||
          stopScheduling
        ) {
          runtimeLimitReached = true;
          return;
        }

        const index = nextIndex;
        nextIndex += 1;
        const selected = candidates[index];
        if (selected === undefined) return;

        try {
          const result = await dependencies.fetchFile(
            {
              ref,
              commitSha: snapshot.commitSha,
              path: selected.path,
              declaredSize: selected.size,
            },
            phaseSignal,
          );
          callerSignal.throwIfAborted();
          if (fetchedBytes + result.bytes > MAX_FETCHED_BYTES) {
            runtimeLimitReached = true;
            stopScheduling = true;
          } else {
            fetched.push(fetchedFile(selected, result));
            fetchedBytes += result.bytes;
          }
        } catch (error) {
          if (callerSignal.aborted) throw callerSignal.reason;
          failures.push({
            path: selected.path,
            stage: "fetch",
            reason: fetchFailureReason(error, phaseController.signal.aborted),
          });
          if (phaseSignal.aborted) runtimeLimitReached = true;
        } finally {
          completedFiles += 1;
          emitProgress(
            progress(
              "fetching",
              completedFiles,
              candidates.length,
              fetchedBytes,
              Math.max(selection.selectedBytes, fetchedBytes),
            ),
          );
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_CONCURRENCY, candidates.length) },
          fetchNext,
        ),
      );
    } finally {
      globalThis.clearTimeout(phaseTimer);
    }
    callerSignal.throwIfAborted();

    const fetchedPaths = new Set(fetched.map((file) => file.path));
    const failedFetchPaths = new Set(
      failures
        .filter((failure) => failure.stage === "fetch")
        .map((failure) => failure.path),
    );
    const runtimeBudgetSkipped: NonNullable<CoverageSummary["skipped"]> =
      selection.selected
        .filter(
          (file) =>
            !fetchedPaths.has(file.path) && !failedFetchPaths.has(file.path),
        )
        .map((file) => ({ path: file.path, reason: "budget" as const }));
    const skippedFiles =
      unsafeTreePathCount +
      selection.skipped.length +
      runtimeBudgetSkipped.length;
    const runtimeSkipped: NonNullable<CoverageSummary["skipped"]> = [
      ...selection.skipped,
      ...runtimeBudgetSkipped,
    ]
      .filter((item) => isSafeProjectBriefPath(item.path))
      .slice(0, 400);

    emitProgress(
      progress(
        "analyzing",
        completedFiles,
        candidates.length,
        fetchedBytes,
        Math.max(selection.selectedBytes, fetchedBytes),
      ),
    );
    const general = dependencies.analyzeGeneral({
      repository: snapshot.repository,
      tree,
      files: fetched,
    });
    const projectBrief = dependencies.projectBrief(
      { repository: snapshot.repository, tree, files: fetched },
      general,
    );
    const analyses: LanguageAnalysis[] = [];
    const selectedJavaScript = selection.selected.some(
      (file) =>
        file.deep &&
        (file.language === "javascript" || file.language === "typescript"),
    );
    const selectedPython = selection.selected.some(
      (file) => file.deep && file.language === "python",
    );

    if (selectedJavaScript) {
      const module = await dependencies.loadJavaScriptTypeScript();
      analyses.push(module.analyzeJavaScriptTypeScript(fetched));
    }
    if (selectedPython) {
      const module = await dependencies.loadPython();
      analyses.push(module.analyzePython(fetched));
    }
    callerSignal.throwIfAborted();

    const language = combineLanguageAnalyses(analyses);
    for (const failure of language.parseFailures) {
      failures.push({
        path: failure.path,
        stage: "parse",
        reason: "syntax",
      });
    }
    const duplicates = dependencies.duplicate(language.files);
    const cycles = dependencies.cycles(language.files);
    const parsedFiles = language.files.filter(
      (file) => !/(?:\.d\.ts|\.pyi)$/iu.test(file.path),
    ).length;
    const coverage: CoverageSummary = {
      treeComplete: selection.treeComplete,
      eligibleFiles: selection.eligibleFiles,
      eligibleBytes: selection.eligibleBytes,
      eligibleSourceBytes: selection.eligibleSourceBytes,
      selectedFiles: selection.selectedFiles,
      selectedBytes: selection.selectedBytes,
      fetchedFiles: fetched.length,
      fetchedBytes,
      parsedFiles,
      parsedBytes: language.parsedBytes,
      parsedSupportedBytes: language.parsedBytes,
      skippedFiles,
      failedFiles: failures.length,
      unsupportedFiles: selection.unsupportedFiles,
      limitReached: selection.limitReached || runtimeLimitReached,
      skipped: runtimeSkipped,
      failures: failures
        .filter((failure) => isSafeProjectBriefPath(failure.path))
        .slice(0, 400),
    };
    const { analyzedAt } = command;
    let readerReport: ReaderReport;

    try {
      readerReport = dependencies.readerReport({
        repository: snapshot.repository,
        tree,
        files: fetched,
        general,
        projectBrief,
        coverage,
        analyzedAt,
      });
    } catch {
      readerReport = unavailableReaderReport({
        repository: snapshot.repository,
        coverage,
        analyzedAt,
      });
    }

    const scored = dependencies.score({
      repository: scoringRepository(snapshot.repository),
      general,
      language,
      duplicates,
      cycles,
      coverage,
      analyzedAt,
    });
    const findingSummary = dependencies.findings(scored);
    const report: AnalysisReport = {
      rulesetVersion: "1.0.0",
      repository: {
        owner: snapshot.repository.owner,
        repo: snapshot.repository.repo,
        fullName: `${snapshot.repository.owner}/${snapshot.repository.repo}`,
        url: `https://github.com/${encodeURIComponent(snapshot.repository.owner)}/${encodeURIComponent(snapshot.repository.repo)}`,
        description:
          snapshot.repository.description !== null &&
          containsCredentialLikeValue(snapshot.repository.description)
            ? null
            : snapshot.repository.description,
        defaultBranch: snapshot.repository.defaultBranch,
        archived: snapshot.repository.archived,
        pushedAt: snapshot.repository.pushedAt,
        commitSha: snapshot.commitSha,
        analyzedAt,
      },
      projectBrief,
      readerReport,
      overall: scored.overall,
      confidence: scored.confidence,
      dimensions: scored.dimensions,
      strengths: findingSummary.strengths,
      weaknesses: findingSummary.weaknesses,
      coverage,
    };

    emit({ type: "complete", requestId, report });
  } catch (error) {
    if (callerSignal.aborted || isAbort(error)) return;
    emit({ type: "error", requestId, error: serializableError(error) });
  }
}

function installWorkerEntry(): void {
  if (
    typeof WorkerGlobalScope === "undefined" ||
    !(globalThis instanceof WorkerGlobalScope)
  ) {
    return;
  }

  const active = new Map<number, AbortController>();
  globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
    const command = event.data;
    if (!validWorkerCommand(command)) return;

    if (command.type === "cancel") {
      active
        .get(command.requestId)
        ?.abort(new DOMException("analysis-cancelled", "AbortError"));
      active.delete(command.requestId);
      return;
    }

    const controller = new AbortController();
    active
      .get(command.requestId)
      ?.abort(new DOMException("analysis-replaced", "AbortError"));
    active.set(command.requestId, controller);
    void executeAnalysis(
      command,
      { ...productionDependencies, signal: controller.signal },
      (workerEvent) => {
        globalThis.postMessage(workerEvent);
      },
    ).finally(() => {
      if (active.get(command.requestId) === controller) {
        active.delete(command.requestId);
      }
    });
  });
}

installWorkerEntry();
