import type {
  CoverageSummary,
  DuplicateMetrics,
  GeneralMetrics,
  ImportCycleMetrics,
  LanguageAnalysis,
  ProjectBrief,
  ReaderReport,
  ReaderSignalFact,
  ReaderSignalId,
  RepositoryMetadata,
} from "../../features/analysis/model";
import { READER_SIGNAL_IDS } from "../../features/analysis/model";

export const perfectRepository: RepositoryMetadata = {
  owner: "example",
  repo: "project",
  name: "project",
  fullName: "example/project",
  url: "https://github.com/example/project",
  description: "fixture",
  defaultBranch: "main",
  archived: false,
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  pushedAt: "2026-08-01T12:00:00Z",
  size: 100,
  openIssuesCount: 0,
  topics: [],
  licenseSpdxId: "MIT",
};

export const perfectProjectBrief: ProjectBrief = {
  excerpts: [
    {
      source: "github-description",
      text: "A deterministic fixture repository.",
      path: null,
    },
    {
      source: "readme",
      text: "This fixture demonstrates deterministic repository analysis.",
      path: "README.md",
    },
  ],
  kinds: [
    { kind: "application", source: "manifest", path: "package.json" },
    { kind: "library", source: "manifest", path: "package.json" },
  ],
  cautions: [],
};

function perfectSignal(signal: ReaderSignalId): ReaderSignalFact {
  const metadataSignal = signal === "archived" || signal === "recent-activity";

  return {
    signal,
    state: signal === "archived" ? "absent" : "present",
    source: metadataSignal ? "github-metadata" : "analysis",
    path: null,
  };
}

export const perfectReaderReport: ReaderReport = {
  reliability: {
    availability: "available",
    status: "continue-evaluation",
    signals: READER_SIGNAL_IDS.map(perfectSignal),
    questions: [
      "license-compatibility",
      "reproduce-install-run",
      "runtime-data-flow",
    ],
  },
  scenarios: {
    availability: "available",
    facts: [
      {
        source: "readme",
        path: "README.md",
        text: "Inspect an unfamiliar public repository before adoption.",
      },
      {
        source: "readme",
        path: "README.md",
        text: "Review repository evidence without executing project code.",
      },
    ],
  },
  architecture: {
    availability: "available",
    excerpts: [
      {
        source: "documentation",
        path: "docs/architecture.md",
        text: "Analysis runs locally in a browser worker from bounded evidence.",
      },
    ],
    documents: ["docs/architecture.md"],
    entryPoints: ["src/main.tsx"],
    sourceAreas: ["src/components", "src/features"],
    ecosystems: ["javascript-typescript"],
  },
  gettingStarted: {
    availability: "available",
    commands: [
      {
        kind: "install",
        command: "pnpm install",
        disposition: "ready",
        source: "readme",
        path: "README.md",
      },
      {
        kind: "run",
        command: "pnpm start",
        disposition: "ready",
        source: "readme",
        path: "README.md",
      },
      {
        kind: "develop",
        command: "pnpm dev",
        disposition: "ready",
        source: "manifest",
        path: "package.json",
      },
      {
        kind: "test",
        command: "pnpm test",
        disposition: "ready",
        source: "manifest",
        path: "package.json",
      },
      {
        kind: "build",
        command: "pnpm build",
        disposition: "ready",
        source: "manifest",
        path: "package.json",
      },
    ],
  },
  securityPrivacy: {
    availability: "available",
    signals: READER_SIGNAL_IDS.filter((signal) =>
      ["license", "security-policy", "configuration"].includes(signal),
    ).map(perfectSignal),
    declarations: [
      {
        source: "documentation",
        path: "SECURITY.md",
        text: "Report vulnerabilities through the documented private channel.",
      },
    ],
  },
  maintenance: {
    availability: "available",
    signals: READER_SIGNAL_IDS.filter((signal) =>
      [
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
      ].includes(signal),
    ).map(perfectSignal),
    activity: {
      elapsedUtcDays: 10,
      band: "within-180-days",
    },
    openIssuesCount: 0,
  },
  alternatives: {
    searchTerms: ["application", "repository-analysis", "typescript"],
  },
};

export const perfectGeneralMetrics: GeneralMetrics = {
  hasReadme: true,
  installHeading: true,
  installCommand: true,
  usageHeading: true,
  usageCommand: true,
  usageConcreteExample: true,
  usageCommandOrExample: true,
  usageProseDescription: true,
  hasContributing: true,
  hasLicenseFile: true,
  apiLicenseDetected: true,
  hasArchitectureEvidence: true,
  readmeTopLevelSourceAreaCount: 3,
  hasManifest: true,
  hasStructuredEntryPoint: true,
  hasConventionalEntryPoint: true,
  hasRunCommand: true,
  hasBuildCommand: true,
  hasDocumentedRunCommand: true,
  hasDocumentedBuildCommand: true,
  hasExample: true,
  hasVersionHistory: true,
  hasManifestVersion: true,
  hasConfigurationEvidence: true,
  testFileCount: 3,
  supportedSourceFileCount: 10,
  hasTestConfiguration: true,
  hasCi: true,
  hasTestCommand: true,
  hasDocumentedTestCommand: true,
  hasStaticCheckCommand: true,
  hasDocumentedStaticCheckCommand: true,
  hasCoverageEvidence: true,
  hasLockfile: true,
  hasDependencyUpdates: true,
  hasIssueOrPrTemplates: true,
  hasSecurityPolicy: true,
  hasCodeOfConduct: true,
  committedGeneratedDirectoryCount: 0,
  parseFailures: [],
};

export const perfectLanguageAnalysis: LanguageAnalysis = {
  files: Array.from({ length: 5 }, (_, index) => ({
    path: `src/file-${String(index)}.ts`,
    language: "typescript" as const,
    logicalLines: 100,
    isTest: false,
    normalizedTokens: Array.from({ length: 200 }, () => "token"),
    relativeImports: [],
  })),
  functions: Array.from({ length: 5 }, (_, index) => ({
    path: `src/file-${String(index)}.ts`,
    name: `function${String(index)}`,
    startLine: 1,
    endLine: 20,
    logicalLines: 20,
    cyclomatic: 2,
    maxNesting: 2,
    hasErrorHandling: true,
    isTest: false,
  })),
  identifierOccurrences: 100,
  ambiguousIdentifierOccurrences: 5,
  exportedDeclarations: 10,
  documentedExports: 5,
  parsedBytes: 2_500,
  parseFailures: [],
};

export const perfectDuplicates: DuplicateMetrics = {
  totalEligibleTokens: 1_000,
  duplicatedTokens: 0,
  ratio: 0,
  evidence: [],
};

export const perfectCycles: ImportCycleMetrics = {
  components: [],
  largestComponentSize: 0,
};

export const perfectCoverage: CoverageSummary = {
  treeComplete: true,
  eligibleFiles: 10,
  eligibleBytes: 10_000,
  eligibleSourceBytes: 5_000,
  selectedFiles: 10,
  selectedBytes: 10_000,
  fetchedFiles: 10,
  fetchedBytes: 10_000,
  parsedFiles: 5,
  parsedBytes: 5_000,
  parsedSupportedBytes: 5_000,
  skippedFiles: 0,
  failedFiles: 0,
  unsupportedFiles: 0,
  limitReached: false,
};
