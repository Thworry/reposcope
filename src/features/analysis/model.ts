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

export interface RepoRef {
  owner: string;
  repo: string;
}

export type SourceLanguage =
  "javascript" | "typescript" | "python" | "recognized-unsupported" | "none";

export type FileCategory =
  "documentation" | "manifest" | "configuration" | "source" | "test";

export interface FetchedTextFile {
  path: string;
  text: string;
  bytes: number;
  declaredSize: number;
  language: SourceLanguage;
  category: FileCategory;
  isTest: boolean;
}

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
  failedFiles: number;
  unsupportedFiles: number;
  limitReached: boolean;
}

export type MessageArgument = string | number | boolean;

export interface LocalizedDescriptor {
  key: string;
  args: Record<string, MessageArgument>;
}

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
}

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

export interface DimensionResult {
  key: DimensionKey;
  earned: number;
  available: number;
  score: number | null;
  rules: RuleResult[];
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
  overall: {
    score: number;
    label: "strong" | "solid" | "needs-attention" | "limited";
    generalOnly: boolean;
    preliminary: boolean;
  };
  confidence: {
    percent: number;
    label: "high" | "medium" | "low";
  };
  dimensions: DimensionResult[];
  strengths: Strength[];
  weaknesses: Improvement[];
  coverage: CoverageSummary;
}
