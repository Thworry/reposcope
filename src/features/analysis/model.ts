export type Language = "en" | "zh-CN";

export type DimensionKey =
  | "documentation"
  | "operability"
  | "readability"
  | "complexity"
  | "testing"
  | "maintenance";

export type RuleState = "passed" | "partial" | "failed" | "not-applicable";
export type FindingSeverity = "high" | "medium" | "low";

export type ScanPhase =
  "validating" | "repository" | "selecting" | "fetching" | "analyzing";

/** Identifies a GitHub repository by owner and repository name. */
export interface RepoRef {
  owner: string;
  repo: string;
}

/**
 * Validated public metadata returned for the inspected repository. The URL is
 * canonical and contains no credentials, branch, path, query, or fragment.
 */
export interface RepositoryMetadata extends RepoRef {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  defaultBranch: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  size: number;
  openIssuesCount: number;
  topics: string[];
  licenseSpdxId: string | null;
}

export interface RateLimitMetadata {
  remaining: number | null;
  resetAt: string | null;
}

export type SourceLanguage =
  "javascript" | "typescript" | "python" | "recognized-unsupported" | "none";

export type FileCategory =
  "documentation" | "manifest" | "configuration" | "source" | "test";

export type FileSkipReason =
  | "excluded"
  | "binary"
  | "oversized"
  | "unsupported"
  | "budget"
  | "invalid-entry";

export interface NormalizedTreeFile {
  path: string;
  sha: string;
  size: number;
  mode: "100644" | "100755";
}

/**
 * Deterministically ordered ordinary blobs from a validated recursive tree.
 * `complete` is false when GitHub reported truncation.
 * Only shape-valid symlinks and submodules become skip evidence.
 * Malformed or duplicate tree entries fail closed by throwing.
 */
export interface NormalizedTree {
  files: NormalizedTreeFile[];
  complete: boolean;
  skippedEntries: Array<{
    path: string;
    reason: "invalid-entry";
  }>;
}

export interface FileClassification {
  eligible: boolean;
  language: SourceLanguage;
  category: FileCategory;
  deep: boolean;
  isTest: boolean;
  treeEvidence?: "lockfile" | "generated-directory";
  skipReason?: "excluded" | "binary" | "oversized" | "unsupported";
}

export interface SelectedFile extends NormalizedTreeFile, FileClassification {
  eligible: true;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topLevelArea: string;
}

/** Optional selection limits; callers may only reduce the built-in hard caps. */
export interface SelectionLimits {
  maxFiles?: number;
  maxBytes?: number;
  maxFileBytes?: number;
}

/**
 * Deterministic bounded scan plan, with selected files in acquisition order
 * and every exclusion or budget decision represented in `skipped`.
 */
export interface SelectionPlan {
  treeComplete: boolean;
  selected: SelectedFile[];
  /** Recognized tree evidence, including unsupported source and size-limited files. */
  eligibleFiles: number;
  /** Declared bytes for every file counted by eligibleFiles. */
  eligibleBytes: number;
  /** Declared supported and recognized-unsupported source bytes. */
  eligibleSourceBytes: number;
  unsupportedFiles: number;
  unsupportedBytes: number;
  selectedFiles: number;
  selectedBytes: number;
  limitReached: boolean;
  skipped: Array<{ path: string; reason: FileSkipReason }>;
  skipCounts: Record<FileSkipReason, number>;
}

/**
 * Fatal-UTF-8-decoded repository text retained only for the active analysis.
 * The final report and cache never contain `text`.
 */
export interface FetchedTextFile {
  path: string;
  text: string;
  bytes: number;
  declaredSize: number;
  language: SourceLanguage;
  category: FileCategory;
  isTest: boolean;
}

/** Validated repository, normalized tree, and bounded text used by general analysis. */
export interface GeneralAnalysisInput {
  repository: RepositoryMetadata;
  tree: NormalizedTree;
  files: readonly FetchedTextFile[];
}

export const PROJECT_KINDS = Object.freeze([
  "application",
  "command-line-tool",
  "library",
  "plugin",
  "template",
  "documentation",
] as const);

export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_BRIEF_CAUTIONS = Object.freeze([
  "archived",
  "insufficient-explanation",
  "license-evidence-absent",
  "entry-point-evidence-absent",
] as const);

export type ProjectBriefCaution = (typeof PROJECT_BRIEF_CAUTIONS)[number];

export interface ProjectBriefExcerpt {
  source: "github-description" | "readme";
  text: string;
  path: string | null;
}

export interface ProjectKindFact {
  kind: ProjectKind;
  source: "github-metadata" | "manifest" | "tree" | "analysis";
  path: string | null;
}

export interface ProjectBriefCautionFact {
  caution: ProjectBriefCaution;
  source: "github-metadata" | "analysis";
  path: null;
}

export interface ProjectBrief {
  excerpts: ProjectBriefExcerpt[];
  kinds: ProjectKindFact[];
  cautions: ProjectBriefCautionFact[];
}

export const READER_AVAILABILITY = Object.freeze([
  "available",
  "partial",
  "unavailable",
] as const);

export type ReaderAvailability = (typeof READER_AVAILABILITY)[number];

export const RELIABILITY_STATUSES = Object.freeze([
  "continue-evaluation",
  "verify-before-use",
  "insufficient-evidence",
] as const);

export type ReliabilityStatus = (typeof RELIABILITY_STATUSES)[number];

export const READER_SIGNAL_IDS = Object.freeze([
  "archived",
  "install",
  "run",
  "license",
  "recent-activity",
  "tests",
  "ci",
  "coverage",
  "security-policy",
  "version-history",
  "contributing",
  "issue-templates",
  "dependency-updates",
  "configuration",
] as const);

export type ReaderSignalId = (typeof READER_SIGNAL_IDS)[number];
export type ReaderSignalState = "present" | "absent" | "unknown";

export const READER_QUESTION_IDS = Object.freeze([
  "license-compatibility",
  "reproduce-install-run",
  "runtime-data-flow",
  "vulnerability-process",
  "release-compatibility",
] as const);

export type ReaderQuestionId = (typeof READER_QUESTION_IDS)[number];

/** Identifies the public evidence behind one reader-facing fact. */
export interface ReaderEvidenceSource {
  source:
    | "github-metadata"
    | "readme"
    | "documentation"
    | "manifest"
    | "tree"
    | "analysis";
  path: string | null;
}

export interface ReaderTextFact extends ReaderEvidenceSource {
  text: string;
}

export interface ReaderSignalFact extends ReaderEvidenceSource {
  signal: ReaderSignalId;
  state: ReaderSignalState;
}

export const READER_COMMAND_KINDS = Object.freeze([
  "install",
  "run",
  "develop",
  "test",
  "build",
] as const);

export type ReaderCommandKind = (typeof READER_COMMAND_KINDS)[number];
export type ReaderCommandDisposition = "ready" | "review" | "withheld";

export interface ReaderCommandFact extends ReaderEvidenceSource {
  kind: ReaderCommandKind;
  command: string | null;
  disposition: ReaderCommandDisposition;
}

export const READER_ECOSYSTEMS = Object.freeze([
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
] as const);

export type ReaderEcosystem = (typeof READER_ECOSYSTEMS)[number];

export const READER_ACTIVITY_BANDS = Object.freeze([
  "within-180-days",
  "181-365-days",
  "over-365-days",
] as const);

export type ReaderActivityBand = (typeof READER_ACTIVITY_BANDS)[number];

/**
 * Bounded, deterministic evidence for the human-readable report. This value is
 * intentionally independent from ruleset scoring.
 */
export interface ReaderReport {
  reliability: {
    availability: ReaderAvailability;
    status: ReliabilityStatus;
    signals: ReaderSignalFact[];
    questions: ReaderQuestionId[];
  };
  scenarios: {
    availability: ReaderAvailability;
    facts: ReaderTextFact[];
  };
  architecture: {
    availability: ReaderAvailability;
    excerpts: ReaderTextFact[];
    documents: string[];
    entryPoints: string[];
    sourceAreas: string[];
    ecosystems: ReaderEcosystem[];
  };
  gettingStarted: {
    availability: ReaderAvailability;
    commands: ReaderCommandFact[];
  };
  securityPrivacy: {
    availability: ReaderAvailability;
    signals: ReaderSignalFact[];
    declarations: ReaderTextFact[];
  };
  maintenance: {
    availability: ReaderAvailability;
    signals: ReaderSignalFact[];
    activity: {
      elapsedUtcDays: number;
      band: ReaderActivityBand;
    };
    openIssuesCount: number;
  };
  alternatives: {
    searchTerms: string[];
  };
}

/** Bounded documentation, operability, testing, and maintenance evidence. */
export interface GeneralMetrics {
  hasReadme: boolean;
  installHeading: boolean;
  installCommand: boolean;
  usageHeading: boolean;
  usageCommand: boolean;
  usageConcreteExample: boolean;
  usageCommandOrExample: boolean;
  usageProseDescription: boolean;
  hasContributing: boolean;
  hasLicenseFile: boolean;
  apiLicenseDetected: boolean;
  hasArchitectureEvidence: boolean;
  readmeTopLevelSourceAreaCount: number;
  hasManifest: boolean;
  hasStructuredEntryPoint: boolean;
  hasConventionalEntryPoint: boolean;
  hasRunCommand: boolean;
  hasBuildCommand: boolean;
  hasDocumentedRunCommand: boolean;
  hasDocumentedBuildCommand: boolean;
  hasExample: boolean;
  hasVersionHistory: boolean;
  hasManifestVersion: boolean;
  hasConfigurationEvidence: boolean;
  testFileCount: number;
  supportedSourceFileCount: number;
  hasTestConfiguration: boolean;
  hasCi: boolean;
  hasTestCommand: boolean;
  hasDocumentedTestCommand: boolean;
  hasStaticCheckCommand: boolean;
  hasDocumentedStaticCheckCommand: boolean;
  hasCoverageEvidence: boolean;
  hasLockfile: boolean;
  hasDependencyUpdates: boolean;
  hasIssueOrPrTemplates: boolean;
  hasSecurityPolicy: boolean;
  hasCodeOfConduct: boolean;
  committedGeneratedDirectoryCount: number;
  parseFailures: Array<{ path: string; reason: "json" | "toml" }>;
}

/** Static, non-executing function evidence with one-based source locations. */
export interface FunctionMetric {
  path: string;
  name: string;
  startLine: number;
  endLine: number;
  logicalLines: number;
  cyclomatic: number;
  maxNesting: number;
  hasErrorHandling: boolean;
  isTest: boolean;
}

/**
 * Parser-derived source evidence. Declaration-only files may participate in
 * import resolution while contributing no executable-code metrics or tokens.
 */
export interface AnalyzedSourceFile {
  path: string;
  language: "javascript" | "typescript" | "python";
  logicalLines: number;
  isTest: boolean;
  normalizedTokens: string[];
  relativeImports: string[];
  relativeImportCandidates?: string[];
  topLevelDefinedNames?: string[];
}

/**
 * Deterministically ordered, non-executing parser results. Syntax failures are
 * isolated per file and do not discard evidence from other accepted files.
 */
export interface LanguageAnalysis {
  files: AnalyzedSourceFile[];
  functions: FunctionMetric[];
  identifierOccurrences: number;
  ambiguousIdentifierOccurrences: number;
  exportedDeclarations: number;
  documentedExports: number;
  parsedBytes: number;
  parseFailures: Array<{
    path: string;
    language: "javascript" | "typescript" | "python";
    reason: "syntax";
  }>;
}

/** Minimal immutable input used by bounded cross-file duplicate analysis. */
export interface TokenizedFile {
  path: string;
  isTest: boolean;
  normalizedTokens: readonly string[];
}

/** Parser-qualified relative-import evidence used for internal cycle resolution. */
export interface ImportingFile {
  path: string;
  language: "javascript" | "typescript" | "python";
  relativeImports: readonly string[];
  relativeImportCandidates?: readonly string[];
  topLevelDefinedNames?: readonly string[];
}

export interface DuplicatePathPairEvidence {
  leftPath: string;
  rightPath: string;
  tokenCount: number;
}

/**
 * Bounded, deterministic approximate-duplication result. Evidence contains
 * file paths and token counts, not source excerpts.
 */
export interface DuplicateMetrics {
  totalEligibleTokens: number;
  duplicatedTokens: number;
  ratio: number;
  evidence: DuplicatePathPairEvidence[];
}

/** Deterministically ordered multi-file strongly connected components. */
export interface ImportCycleMetrics {
  components: string[][];
  largestComponentSize: number;
}

/**
 * Scope, limit, skip, and failure evidence used to calculate confidence. It
 * records counts and paths only and does not retain raw repository text.
 */
export interface CoverageSummary {
  treeComplete: boolean;
  eligibleFiles: number;
  eligibleBytes: number;
  eligibleSourceBytes: number;
  selectedFiles: number;
  selectedBytes: number;
  fetchedFiles: number;
  fetchedBytes: number;
  parsedFiles: number;
  parsedBytes: number;
  parsedSupportedBytes: number;
  skippedFiles: number;
  failedFiles: number;
  unsupportedFiles: number;
  limitReached: boolean;
  skipped?: Array<{ path: string; reason: FileSkipReason }>;
  failures?: Array<{
    path: string;
    stage: "fetch" | "parse";
    reason:
      | "not-found"
      | "rate-limit"
      | "network"
      | "api"
      | "invalid-response"
      | "file-limit"
      | "invalid-text"
      | "timeout"
      | "budget"
      | "syntax";
  }>;
}

export type MessageArgument = string | number | boolean;

/** Locale-independent copy key and finite serializable interpolation values. */
export interface LocalizedDescriptor {
  key: string;
  args: Record<string, MessageArgument>;
}

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
}

/** One versioned rule decision, its earned points, descriptors, and file evidence. */
export interface RuleResult {
  id: string;
  dimension: DimensionKey;
  state: RuleState;
  earned: number;
  available: number;
  evidence: LocalizedDescriptor;
  recommendation: LocalizedDescriptor;
  references: FileReference[];
}

/**
 * One quality dimension's ordered rules and earned/available point totals.
 * `score` is a rounded percentage when applicable points exist.
 * `score` is `null` when no rule contributes applicable points.
 */
export interface DimensionResult {
  key: DimensionKey;
  earned: number;
  available: number;
  score: number | null;
  rules: RuleResult[];
}

/** Weighted applicable-dimension summary and applicability qualifications. */
export interface OverallResult {
  score: number;
  label: "strong" | "solid" | "needs-attention" | "limited";
  generalOnly: boolean;
  preliminary: boolean;
}

/** Evidence-completeness percentage and its high, medium, or low label. */
export interface ConfidenceResult {
  percent: number;
  label: "high" | "medium" | "low";
}

export interface Strength {
  ruleId: string;
  dimension: DimensionKey;
  evidence: LocalizedDescriptor;
  references: FileReference[];
}

export interface Improvement {
  ruleId: string;
  dimension: DimensionKey;
  severity: FindingSeverity;
  lostPoints: number;
  evidence: LocalizedDescriptor;
  recommendation: LocalizedDescriptor;
  references: FileReference[];
}

/** Complete ruleset output before strengths and improvements are selected. */
export interface ScoredProject {
  rules: RuleResult[];
  dimensions: DimensionResult[];
  overall: OverallResult;
  confidence: ConfidenceResult;
}

/** Deterministically prioritized, bounded strengths and improvement findings. */
export interface FindingSummary {
  strengths: Strength[];
  weaknesses: Improvement[];
}

/**
 * Strictly serializable final report for one immutable public commit under
 * ruleset `1.0.0`. It contains derived evidence and file references but no raw
 * repository text, credentials, runtime claims, or executed-project results.
 */
export interface AnalysisReport {
  rulesetVersion: "1.0.0";
  repository: {
    owner: string;
    repo: string;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    archived: boolean;
    pushedAt: string;
    commitSha: string;
    analyzedAt: string;
  };
  projectBrief: ProjectBrief;
  readerReport: ReaderReport;
  overall: OverallResult;
  confidence: ConfidenceResult;
  dimensions: DimensionResult[];
  strengths: Strength[];
  weaknesses: Improvement[];
  coverage: CoverageSummary;
}
