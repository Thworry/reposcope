import {
  READER_COMMAND_KINDS,
  READER_CONVENTIONAL_MANIFESTS,
  READER_SIGNAL_IDS,
  type CoverageSummary,
  type FetchedTextFile,
  type GeneralAnalysisInput,
  type GeneralMetrics,
  type ProjectBrief,
  type ProjectKind,
  type ReaderCommandFact,
  type ReaderConventionalManifest,
  type ReaderEcosystem,
  type ReaderReport,
  type ReaderSignalFact,
  type ReaderSignalId,
  type ReaderSignalState,
  type ReaderTextFact,
  type RepositoryMetadata,
} from "../analysis/model";
import {
  activityBand,
  activityState,
  deriveReaderAvailability,
  deriveReaderQuestions,
  deriveReliabilityStatus,
  observedReaderConventionalManifest,
} from "../analysis/reader-report-policy";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../analysis/project-brief-safety";
import {
  RECOGNIZED_SOURCE_EXTENSIONS,
  isConventionalEntryPoint,
  isExcludedPath,
  toPathComparisonKey,
} from "../scanner/file-registry";
import { preferredReadme } from "./general";
import { manifestReaderCommands } from "./reader-report/commands";
import { extractReaderMarkdownEvidence } from "./reader-report/markdown";
import { buildReadmeProfile } from "./reader-report/readme-interpretation";
import {
  compareReadmePaths,
  isCanonicalReadmePath,
} from "./reader-report/readme-policy";

const DAY_MS = 86_400_000;
const MAX_ARCHITECTURE_DOCUMENTS = 3;
const MAX_ARCHITECTURE_EXCERPTS = 2;
const MAX_ENTRY_POINTS = 4;
const MAX_SOURCE_AREAS = 5;
const MAX_SECURITY_DECLARATIONS = 3;

const SECURITY_SIGNAL_IDS = new Set<ReaderSignalId>([
  "license",
  "security-policy",
  "configuration",
]);
const MAINTENANCE_SIGNAL_IDS = new Set<ReaderSignalId>([
  "archived",
  "recent-activity",
  "tests",
  "ci",
  "coverage",
  "security-policy",
  "version-history",
  "contributing",
  "issue-templates",
  "dependency-updates",
]);
const NON_METADATA_SIGNAL_IDS = new Set<ReaderSignalId>(
  READER_SIGNAL_IDS.filter(
    (signal) => signal !== "archived" && signal !== "recent-activity",
  ),
);
const RECOGNIZED_SOURCE_EXTENSION_SET = new Set<string>(
  RECOGNIZED_SOURCE_EXTENSIONS.map((extension) => extension.toLowerCase()),
);
const DOCUMENT_EXTENSIONS = [
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".rst",
  ".adoc",
  ".asciidoc",
] as const;
const SOURCE_AREA_WRAPPERS = new Set([
  "src",
  "source",
  "lib",
  "app",
  "apps",
  "pkg",
  "packages",
]);
const TEST_SEGMENTS = new Set(["test", "tests", "__tests__", "spec", "specs"]);

const KIND_TERMS: Readonly<Record<ProjectKind, string>> = Object.freeze({
  application: "application",
  "command-line-tool": "cli",
  library: "library",
  plugin: "plugin",
  template: "template",
  documentation: "documentation",
});
const KIND_PRECEDENCE = [
  "application",
  "command-line-tool",
  "library",
  "plugin",
  "template",
  "documentation",
] as const satisfies readonly ProjectKind[];

export interface ReaderReportInput extends GeneralAnalysisInput {
  general: GeneralMetrics;
  projectBrief: ProjectBrief;
  coverage: CoverageSummary;
  analyzedAt: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePath(left: string, right: string): number {
  const leftKey = toPathComparisonKey(left);
  const rightKey = toPathComparisonKey(right);

  return (
    compareText(leftKey, rightKey) ||
    Number(right === rightKey) - Number(left === leftKey) ||
    compareText(left, right)
  );
}

function observedConventionalManifests(
  paths: readonly string[],
): ReaderConventionalManifest[] {
  const observed = new Set<ReaderConventionalManifest>();

  for (const path of paths) {
    if (isExcludedPath(path) || isExcludedPath(path.normalize("NFKC"))) {
      continue;
    }
    const basename = path.slice(path.lastIndexOf("/") + 1);
    const manifest = observedReaderConventionalManifest(basename);
    if (manifest !== null) observed.add(manifest);
  }

  return READER_CONVENTIONAL_MANIFESTS.filter((manifest) =>
    observed.has(manifest),
  );
}

function isSafeReaderPath(value: unknown): value is string {
  return (
    isSafeProjectBriefPath(value) &&
    !containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function uniqueSortedPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of [...paths].filter(isSafeReaderPath).sort(comparePath)) {
    const key = toPathComparisonKey(path);

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }

  return result;
}

function uniqueSortedFetchedFiles(
  files: readonly FetchedTextFile[],
): FetchedTextFile[] {
  const safe = files.filter((file) => isSafeReaderPath(file.path));
  const counts = new Map<string, number>();

  for (const file of safe) {
    const key = toPathComparisonKey(file.path);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return safe
    .filter((file) => counts.get(toPathComparisonKey(file.path)) === 1)
    .sort((left, right) => comparePath(left.path, right.path));
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function coverageComplete(coverage: CoverageSummary): boolean {
  return (
    coverage.treeComplete &&
    !coverage.limitReached &&
    coverage.failedFiles === 0
  );
}

function elapsedUtcDays(analyzedAt: string, pushedAt: string): number {
  const elapsed = (Date.parse(analyzedAt) - Date.parse(pushedAt)) / DAY_MS;

  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new RangeError(
      "Repository activity dates must produce nonnegative elapsed UTC days",
    );
  }
  return elapsed;
}

function derivedState(present: boolean, complete: boolean): ReaderSignalState {
  return present ? "present" : complete ? "absent" : "unknown";
}

function signalFact(
  signal: ReaderSignalId,
  state: ReaderSignalState,
): ReaderSignalFact {
  const metadata = signal === "archived" || signal === "recent-activity";

  return {
    signal,
    state,
    source: metadata ? "github-metadata" : "analysis",
    path: null,
  };
}

function buildSignals(options: {
  repository: RepositoryMetadata;
  general: GeneralMetrics;
  commands: readonly ReaderCommandFact[];
  elapsedDays: number;
  complete: boolean;
}): ReaderSignalFact[] {
  const usableCommand = (kind: "install" | "run"): boolean =>
    options.commands.some(
      (command) =>
        command.kind === kind &&
        (command.disposition === "ready" || command.disposition === "review"),
    );
  const hasTestCommandOrConfiguration =
    options.commands.some((command) => command.kind === "test") ||
    options.general.hasTestCommand ||
    options.general.hasDocumentedTestCommand ||
    options.general.hasTestConfiguration;
  const present: Readonly<
    Record<Exclude<ReaderSignalId, "archived" | "recent-activity">, boolean>
  > = {
    install: usableCommand("install"),
    run: usableCommand("run"),
    license:
      options.general.hasLicenseFile || options.general.apiLicenseDetected,
    tests: options.general.testFileCount > 0 && hasTestCommandOrConfiguration,
    ci: options.general.hasCi,
    coverage: options.general.hasCoverageEvidence,
    "security-policy": options.general.hasSecurityPolicy,
    "version-history": options.general.hasVersionHistory,
    contributing: options.general.hasContributing,
    "issue-templates": options.general.hasIssueOrPrTemplates,
    "dependency-updates": options.general.hasDependencyUpdates,
    configuration: options.general.hasConfigurationEvidence,
  };

  return READER_SIGNAL_IDS.map((signal) => {
    if (signal === "archived") {
      return signalFact(
        signal,
        options.repository.archived ? "present" : "absent",
      );
    }
    if (signal === "recent-activity") {
      return signalFact(
        signal,
        activityState(options.elapsedDays, options.repository.archived),
      );
    }
    return signalFact(signal, derivedState(present[signal], options.complete));
  });
}

function documentStem(
  path: string,
): { directory: string; stem: string } | null {
  const normalized = toPathComparisonKey(path);
  const slash = normalized.lastIndexOf("/");
  const directory = slash === -1 ? "" : normalized.slice(0, slash);
  const basename = slash === -1 ? normalized : normalized.slice(slash + 1);
  const extension = DOCUMENT_EXTENSIONS.find((candidate) =>
    basename.endsWith(candidate),
  );

  if (extension === undefined) return null;
  return { directory, stem: basename.slice(0, -extension.length) };
}

function isArchitectureDocument(path: string): boolean {
  const document = documentStem(path);

  return (
    document !== null &&
    (document.directory === "" || document.directory === "docs") &&
    document.stem.startsWith("architecture")
  );
}

function isSecurityOrPrivacyDocument(path: string): boolean {
  const document = documentStem(path);

  return (
    document !== null &&
    ["", ".github", "docs"].includes(document.directory) &&
    (document.stem.startsWith("security") ||
      document.stem.startsWith("privacy"))
  );
}

function preferredReadmePath(paths: readonly string[]): string | null {
  return (
    paths.filter(isCanonicalReadmePath).sort(compareReadmePaths)[0] ?? null
  );
}

function derivePreferredReadmeState(input: {
  preferredPath: string | null;
  fetchedPath: string | null;
  treeComplete: boolean;
  skipped: CoverageSummary["skipped"];
  failures: CoverageSummary["failures"];
}): "missing" | "incomplete" | "fetched" {
  if (input.preferredPath !== null) {
    const key = toPathComparisonKey(input.preferredPath);
    if (input.fetchedPath === input.preferredPath) {
      return "fetched";
    }
    const explicitlyIncomplete = [
      ...(input.skipped ?? []),
      ...(input.failures ?? []),
    ].some(({ path }) => toPathComparisonKey(path) === key);

    if (explicitlyIncomplete || input.treeComplete) return "incomplete";
  }
  return input.treeComplete ? "missing" : "incomplete";
}

function collectTextFacts(
  candidates: readonly ReaderTextFact[],
  cap: number,
): ReaderTextFact[] {
  const seen = new Set<string>();
  const retained: ReaderTextFact[] = [];

  for (const fact of candidates) {
    const key = canonicalText(fact.text);

    if (seen.has(key)) continue;
    seen.add(key);
    retained.push(fact);
    if (retained.length >= cap) break;
  }

  return retained;
}

function fileExtension(path: string): string {
  const basename = toPathComparisonKey(path).split("/").at(-1) ?? "";
  const dot = basename.lastIndexOf(".");

  return dot <= 0 ? "" : basename.slice(dot);
}

function isRecognizedSource(path: string): boolean {
  return RECOGNIZED_SOURCE_EXTENSION_SET.has(fileExtension(path));
}

function isTestSource(path: string): boolean {
  const normalized = toPathComparisonKey(path);
  const parts = normalized.split("/");
  const basename = parts.at(-1) ?? "";

  return (
    parts.slice(0, -1).some((segment) => TEST_SEGMENTS.has(segment)) ||
    /(?:^test_|_test\.[^.]+$|\.(?:test|spec)\.)/u.test(basename)
  );
}

function sourceArea(path: string): string | null {
  const directories = toPathComparisonKey(path).split("/").slice(0, -1);

  if (directories.length === 0) return null;
  if (
    SOURCE_AREA_WRAPPERS.has(directories[0] ?? "") &&
    directories.length > 1
  ) {
    return directories.slice(0, 2).join("/");
  }
  return directories[0] ?? null;
}

function architectureStructure(paths: readonly string[]): {
  entryPoints: string[];
  sourceAreas: string[];
  ecosystems: ReaderEcosystem[];
} {
  const structuralPaths = paths.filter((path) => !isExcludedPath(path));
  const sourcePaths = structuralPaths.filter(
    (path) => isRecognizedSource(path) && !isTestSource(path),
  );
  const entryPoints = sourcePaths
    .filter(
      (path) =>
        !/(?:\.d\.ts|\.pyi)$/iu.test(path) && isConventionalEntryPoint(path),
    )
    .slice(0, MAX_ENTRY_POINTS);
  const sourceAreas = uniqueSortedPaths(
    sourcePaths.map(sourceArea).filter((area): area is string => area !== null),
  ).slice(0, MAX_SOURCE_AREAS);
  const basenames = new Set(
    structuralPaths.map(
      (path) => toPathComparisonKey(path).split("/").at(-1) ?? "",
    ),
  );
  const extensions = new Set(sourcePaths.map(fileExtension));
  const has = (values: readonly string[]): boolean =>
    values.some((value) => extensions.has(value));
  const found = new Set<ReaderEcosystem>();

  if (
    basenames.has("package.json") ||
    has([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"])
  ) {
    found.add("javascript-typescript");
  }
  if (basenames.has("pyproject.toml") || has([".py"])) found.add("python");
  if (basenames.has("go.mod") || has([".go"])) found.add("go");
  if (basenames.has("cargo.toml") || has([".rs"])) found.add("rust");
  if (
    ["pom.xml", "build.gradle", "build.gradle.kts"].some((name) =>
      basenames.has(name),
    ) ||
    has([".java", ".kt", ".kts", ".scala", ".sc"])
  ) {
    found.add("java-jvm");
  }
  if (
    structuralPaths.some((path) => /(?:\.sln|\.csproj)$/iu.test(path)) ||
    has([".cs", ".fs", ".fsx"])
  ) {
    found.add("dotnet");
  }
  if (
    basenames.has("gemfile") ||
    structuralPaths.some((path) => /\.gemspec$/iu.test(path)) ||
    has([".rb"])
  ) {
    found.add("ruby");
  }
  if (basenames.has("composer.json") || has([".php"])) found.add("php");
  if (basenames.has("package.swift") || has([".swift"])) found.add("swift");
  if (basenames.has("pubspec.yaml") || has([".dart"])) found.add("dart");

  const knownExtensions = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".kts",
    ".scala",
    ".sc",
    ".cs",
    ".fs",
    ".fsx",
    ".rb",
    ".php",
    ".swift",
    ".dart",
  ]);
  if (sourcePaths.some((path) => !knownExtensions.has(fileExtension(path)))) {
    found.add("other");
  }

  return {
    entryPoints,
    sourceAreas,
    ecosystems: [
      "javascript-typescript",
      "python",
      "go",
      "rust",
      "java-jvm",
      "dotnet",
      "ruby",
      "php",
      "swift",
      "dart",
      "other",
    ].filter((ecosystem): ecosystem is ReaderEcosystem =>
      found.has(ecosystem as ReaderEcosystem),
    ),
  };
}

function mergeCommands(
  readme: readonly ReaderCommandFact[],
  manifest: readonly ReaderCommandFact[],
): ReaderCommandFact[] {
  return READER_COMMAND_KINDS.flatMap((kind) => {
    const command =
      readme.find((fact) => fact.kind === kind) ??
      manifest.find((fact) => fact.kind === kind);

    return command === undefined ? [] : [command];
  });
}

function alternativeTerms(
  repository: RepositoryMetadata,
  projectBrief: ProjectBrief,
): string[] {
  const availableKinds = new Set(projectBrief.kinds.map(({ kind }) => kind));
  const kind = KIND_PRECEDENCE.find((candidate) =>
    availableKinds.has(candidate),
  );
  const kindTerm = kind === undefined ? undefined : KIND_TERMS[kind];
  const representedKindTerms = new Set(
    kind === undefined || kindTerm === undefined ? [] : [kind, kindTerm],
  );
  const topics = new Set<string>();
  const repositoryName = repository.name
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");

  for (const topic of repository.topics) {
    const normalizedOriginal = topic.normalize("NFKC");
    const normalized = normalizedOriginal.toLocaleLowerCase("en-US");

    if (
      !/^[a-z0-9][a-z0-9-]{0,49}$/u.test(normalized) ||
      representedKindTerms.has(normalized) ||
      normalized === repositoryName ||
      containsCredentialLikeValue(normalizedOriginal) ||
      containsCredentialLikeValue(normalized)
    ) {
      continue;
    }
    topics.add(normalized);
  }

  return [
    ...(kindTerm === undefined ? [] : [kindTerm]),
    ...[...topics].sort(compareText).slice(0, 3),
  ];
}

function validateOpenIssuesCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Open issue count must be a nonnegative safe integer");
  }
  return value;
}

function validateCommunityCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Community count must be a nonnegative safe integer");
  }
  return value;
}

/** Builds deterministic, non-scoring evidence for the human-readable report. */
export function analyzeReaderReport(input: ReaderReportInput): ReaderReport {
  const complete = coverageComplete(input.coverage);
  const elapsedDays = elapsedUtcDays(
    input.analyzedAt,
    input.repository.pushedAt,
  );
  const openIssuesCount = validateOpenIssuesCount(
    input.repository.openIssuesCount,
  );
  const treePaths = uniqueSortedPaths(input.tree.files.map(({ path }) => path));
  const fetchedFiles = uniqueSortedFetchedFiles(input.files);
  const preferredPath = preferredReadmePath(treePaths);
  const fallbackReadme = preferredReadme(fetchedFiles);
  const readme =
    fetchedFiles.find(({ path }) => path === preferredPath) ?? fallbackReadme;
  const preferredReadmeState = derivePreferredReadmeState({
    preferredPath,
    fetchedPath: readme?.path ?? null,
    treeComplete: input.coverage.treeComplete,
    skipped: input.coverage.skipped,
    failures: input.coverage.failures,
  });
  const purposeKeys = new Set(
    input.projectBrief.excerpts.map(({ text }) => canonicalText(text)),
  );
  const readmeEvidence = extractReaderMarkdownEvidence(readme, {
    scenarioExclusions: purposeKeys,
  });
  const commands = mergeCommands(
    readmeEvidence.commands,
    manifestReaderCommands(input),
  );
  const scenarios = collectTextFacts(
    readmeEvidence.scenarios.filter(
      ({ text }) => !purposeKeys.has(canonicalText(text)),
    ),
    3,
  );
  const recognizedDocuments = fetchedFiles.filter(
    (file) =>
      file.category === "documentation" &&
      (isArchitectureDocument(file.path) ||
        isSecurityOrPrivacyDocument(file.path)),
  );
  const architectureEvidence = [
    ...readmeEvidence.architecture,
    ...recognizedDocuments
      .filter(
        (file) =>
          file.path !== readme?.path && isArchitectureDocument(file.path),
      )
      .flatMap((file) => extractReaderMarkdownEvidence(file).architecture),
  ];
  const securityEvidence = [
    ...readmeEvidence.securityPrivacy,
    ...recognizedDocuments
      .filter(
        (file) =>
          file.path !== readme?.path && isSecurityOrPrivacyDocument(file.path),
      )
      .flatMap((file) => extractReaderMarkdownEvidence(file).securityPrivacy),
  ];
  const architectureExcerpts = collectTextFacts(
    architectureEvidence,
    MAX_ARCHITECTURE_EXCERPTS,
  );
  const securityDeclarations = collectTextFacts(
    securityEvidence,
    MAX_SECURITY_DECLARATIONS,
  );
  const architectureDocuments = uniqueSortedPaths(
    treePaths.filter(isArchitectureDocument),
  ).slice(0, MAX_ARCHITECTURE_DOCUMENTS);
  const structure = architectureStructure(treePaths);
  const readmeProfile = buildReadmeProfile({
    preferredReadmeState,
    evidencePath: readme?.path ?? null,
    evidence: readmeEvidence.readme,
    purposeKeys,
    corroboration: {
      productShapeObserved: input.projectBrief.kinds.length > 0,
      ecosystemsObserved: structure.ecosystems.length > 0,
      treeComplete: input.coverage.treeComplete,
      readmeCommandKinds: readmeEvidence.commands.map(({ kind }) => kind),
      securityPrivacyFactCount: readmeEvidence.securityPrivacy.length,
      observedManifests: observedConventionalManifests(treePaths),
    },
  });
  const signals = buildSignals({
    repository: input.repository,
    general: input.general,
    commands,
    elapsedDays,
    complete,
  });
  const status = deriveReliabilityStatus(signals);
  const securitySignals = signals.filter(({ signal }) =>
    SECURITY_SIGNAL_IDS.has(signal),
  );
  const maintenanceSignals = signals.filter(({ signal }) =>
    MAINTENANCE_SIGNAL_IDS.has(signal),
  );
  const hasOnlyMetadataEvidence = signals
    .filter(({ signal }) => NON_METADATA_SIGNAL_IDS.has(signal))
    .every(({ state }) => state === "absent");
  const architectureCount =
    architectureExcerpts.length +
    architectureDocuments.length +
    structure.entryPoints.length +
    structure.sourceAreas.length +
    structure.ecosystems.length;
  const securityCount =
    securityDeclarations.length +
    securitySignals.filter(({ state }) => state === "present").length;
  const maintenanceCount =
    1 + maintenanceSignals.filter(({ state }) => state === "present").length;

  return {
    community: {
      starsCount: validateCommunityCount(input.repository.starsCount),
      watchersCount: validateCommunityCount(input.repository.watchersCount),
      forksCount: validateCommunityCount(input.repository.forksCount),
    },
    readme: readmeProfile,
    reliability: {
      availability: !complete
        ? "partial"
        : hasOnlyMetadataEvidence
          ? "unavailable"
          : "available",
      status,
      signals,
      questions: deriveReaderQuestions(status, signals),
    },
    scenarios: {
      availability: deriveReaderAvailability(
        input.projectBrief.excerpts.length + scenarios.length,
        complete,
      ),
      facts: scenarios,
    },
    architecture: {
      availability: deriveReaderAvailability(architectureCount, complete),
      excerpts: architectureExcerpts,
      documents: architectureDocuments,
      entryPoints: structure.entryPoints,
      sourceAreas: structure.sourceAreas,
      ecosystems: structure.ecosystems,
    },
    gettingStarted: {
      availability: deriveReaderAvailability(commands.length, complete),
      commands,
    },
    securityPrivacy: {
      availability: deriveReaderAvailability(securityCount, complete),
      signals: securitySignals,
      declarations: securityDeclarations,
    },
    maintenance: {
      availability: deriveReaderAvailability(maintenanceCount, complete),
      signals: maintenanceSignals,
      activity: {
        elapsedUtcDays: elapsedDays,
        band: activityBand(elapsedDays),
      },
      openIssuesCount,
    },
    alternatives: {
      searchTerms: alternativeTerms(input.repository, input.projectBrief),
    },
  };
}

/** Returns a non-throwing, canonical fallback when reader analysis fails. */
export function unavailableReaderReport(input: {
  repository: RepositoryMetadata;
  coverage: CoverageSummary;
  analyzedAt: string;
}): ReaderReport {
  const elapsedDays = (() => {
    try {
      return elapsedUtcDays(input.analyzedAt, input.repository.pushedAt);
    } catch {
      return 0;
    }
  })();
  const signals = READER_SIGNAL_IDS.map((signal) =>
    signalFact(signal, "unknown"),
  );
  const status = deriveReliabilityStatus(signals);
  const securitySignals = signals.filter(({ signal }) =>
    SECURITY_SIGNAL_IDS.has(signal),
  );
  const maintenanceSignals = signals.filter(({ signal }) =>
    MAINTENANCE_SIGNAL_IDS.has(signal),
  );

  return {
    community: {
      starsCount: validateCommunityCount(input.repository.starsCount),
      watchersCount: validateCommunityCount(input.repository.watchersCount),
      forksCount: validateCommunityCount(input.repository.forksCount),
    },
    readme: {
      availability: "unavailable",
      observedManifests: [],
      overview: [],
      audiences: [],
      problems: [],
      useCases: [],
      capabilityGroups: [],
      workflow: [],
      dependencies: [],
      limitations: [],
      maturity: [],
      commentary: [],
    },
    reliability: {
      availability: "unavailable",
      status,
      signals,
      questions: deriveReaderQuestions(status, signals),
    },
    scenarios: { availability: "unavailable", facts: [] },
    architecture: {
      availability: "unavailable",
      excerpts: [],
      documents: [],
      entryPoints: [],
      sourceAreas: [],
      ecosystems: [],
    },
    gettingStarted: { availability: "unavailable", commands: [] },
    securityPrivacy: {
      availability: "unavailable",
      signals: securitySignals,
      declarations: [],
    },
    maintenance: {
      availability: "unavailable",
      signals: maintenanceSignals,
      activity: {
        elapsedUtcDays: elapsedDays,
        band: activityBand(elapsedDays),
      },
      openIssuesCount:
        Number.isSafeInteger(input.repository.openIssuesCount) &&
        input.repository.openIssuesCount >= 0
          ? input.repository.openIssuesCount
          : 0,
    },
    alternatives: { searchTerms: [] },
  };
}
