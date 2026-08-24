import { DEEP_REPORT_CAPS } from "../../src/features/deep-analysis/model.js";
import type {
  EvidenceTextFile,
  RecentActivitySummary,
  ReleaseSummary,
  VerifiedRepositorySnapshot,
} from "../github/model.js";

export const EVIDENCE_SCHEMA_VERSION = "1.0.0" as const;

export const EVIDENCE_LIMITS = Object.freeze({
  inputBytes: 256 * 1024,
  modelCodePoints: 48_000,
  /** Leaves room for the panel's outer evidence delimiters inside 44k. */
  serializedModelCodePoints: 43_800,
  contentBlocks: DEEP_REPORT_CAPS.evidence,
  totalEvidence: DEEP_REPORT_CAPS.evidence,
  blockCodePoints: 640,
  manifestEntries: 128,
  alternativeQueries: 3,
  alternatives: 5,
  alternativeCacheMs: 24 * 60 * 60 * 1_000,
  alternativeCacheEntries: 1_000,
} as const);

export type EvidenceKind =
  "github" | "readme" | "documentation" | "manifest" | "tree" | "alternative";

/** Narrative evidence may be cached; live evidence is joined by the server. */
export type EvidenceRetention = "narrative" | "live";

/** A closed semantic class used to enforce trust/retention combinations. */
export type EvidenceFactCategory =
  | "repository-identity"
  | "authored-description"
  | "authored-topics"
  | "repository-live-state"
  | "community-live-counts"
  | "tree-observation"
  | "file-source"
  | "release-live-summary"
  | "activity-live-summary"
  | "alternative-description"
  | "alternative-live-state";

export interface EvidenceFact {
  id: string;
  category: EvidenceFactCategory;
  kind: EvidenceKind;
  label: string;
  text: string;
  path: string | null;
  url: string | null;
  trust: "observed" | "repository-authored" | "external-repository";
  retention: EvidenceRetention;
}

export interface EvidenceContentBlock {
  id: string;
  kind: "readme" | "documentation" | "manifest";
  path: string;
  heading: string | null;
  text: string;
  startLine: number;
  endLine: number;
  trust: "repository-authored";
}

export type EvidenceContentBlockDraft = Omit<EvidenceContentBlock, "id">;

export interface SanitizedEvidenceDocument {
  blocks: EvidenceContentBlockDraft[];
  complete: boolean;
}

export interface EvidencePack {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  repository: { owner: string; repo: string; commitSha: string };
  acquiredAt: string;
  facts: EvidenceFact[];
  contentBlocks: EvidenceContentBlock[];
  coverage: {
    readme: "complete" | "partial" | "missing";
    alternatives: "available" | "unavailable";
    treeComplete: boolean;
  };
}

export type VerifiedAlternativeRepository =
  VerifiedRepositorySnapshot["repository"];

export interface BuildEvidencePackInput {
  snapshot: VerifiedRepositorySnapshot;
  files: readonly EvidenceTextFile[];
  releaseSummary?: ReleaseSummary;
  activitySummary?: RecentActivitySummary;
  alternatives?: readonly VerifiedAlternativeRepository[];
  alternativesAvailable?: boolean;
  acquiredAt: string;
}
