import type { Language, RepoRef } from "../analysis/model.js";

export const DEEP_PROVENANCE = Object.freeze([
  "repository-claim",
  "observed-fact",
  "interpretation",
  "unknown",
] as const);

export const DEEP_CONFIDENCE = Object.freeze([
  "high",
  "medium",
  "low",
] as const);

export const DEEP_STAGES = Object.freeze([
  "preparing-evidence",
  "consulting-specialists",
  "challenging-findings",
  "editing-briefing",
  "validating-sources",
] as const);

export const DEEP_ERROR_KINDS = Object.freeze([
  "disabled",
  "signed-out",
  "copilot-unavailable",
  "allowance-exhausted",
  "rate-limit",
  "repository-changed",
  "github-unavailable",
  "invalid-evidence",
  "cancelled",
  "internal",
] as const);

export const DEEP_SPECIALIST_ROLES = Object.freeze([
  "product",
  "onboarding-architecture",
  "trust-ecosystem",
] as const);

export const DEEP_REPORT_CAPS = Object.freeze({
  evidence: 160,
  statementsPerList: 12,
  capabilityGroups: 8,
  capabilityStatements: 8,
  workflow: 10,
  alternatives: 5,
  disagreements: 6,
  textCodePoints: 640,
} as const);

export type DeepProvenance = (typeof DEEP_PROVENANCE)[number];
export type DeepConfidence = (typeof DEEP_CONFIDENCE)[number];
export type DeepAnalysisStage = (typeof DEEP_STAGES)[number];
export type DeepAnalysisErrorKind = (typeof DEEP_ERROR_KINDS)[number];
export type DeepSpecialistRole = (typeof DEEP_SPECIALIST_ROLES)[number];

export interface DeepStatement {
  text: string;
  provenance: DeepProvenance;
  confidence: DeepConfidence;
  evidenceIds: string[];
}

export interface DeepEvidence {
  id: string;
  kind:
    "github" | "readme" | "documentation" | "manifest" | "tree" | "alternative";
  label: string;
  path: string | null;
  url: string | null;
}

export interface DeepRepositoryIdentity extends RepoRef {
  commitSha: string;
}

export interface DeepAnalysisRequest {
  repository: DeepRepositoryIdentity;
  language: Language;
}

export type DeepAnalysisEvent =
  | { type: "stage"; stage: DeepAnalysisStage }
  | {
      type: "specialist";
      role: DeepSpecialistRole;
      status: "started" | "complete" | "failed";
    }
  | { type: "complete"; report: DeepReport }
  | { type: "error"; error: { kind: DeepAnalysisErrorKind } };

export interface DeepCapabilityGroup {
  title: DeepStatement;
  items: DeepStatement[];
}

export interface DeepAlternative {
  repository: RepoRef;
  github: {
    stars: number;
    forks: number;
    watchers: number;
    openIssues: number;
    pushedAt: string | null;
    archived: boolean;
    license: string | null;
  };
  whyCompare: DeepStatement;
}

export interface DeepReport {
  schemaVersion: "1.0.0";
  repository: DeepRepositoryIdentity;
  language: Language;
  generatedAt: string;
  review: {
    coverage: "full" | "reduced";
    capabilityClass: "auto" | "multi-model";
  };
  orientation: { summary: DeepStatement[]; verdict: DeepStatement };
  fit: { goodFor: DeepStatement[]; poorFor: DeepStatement[] };
  situations: DeepStatement[];
  capabilities: DeepCapabilityGroup[];
  workflow: DeepStatement[];
  architecture: {
    summary: DeepStatement[];
    technologies: DeepStatement[];
    concepts: DeepStatement[];
  };
  onboarding: {
    prerequisites: DeepStatement[];
    install: DeepStatement[];
    run: DeepStatement[];
    develop: DeepStatement[];
    cautions: DeepStatement[];
  };
  trust: {
    reliability: DeepStatement[];
    security: DeepStatement[];
    privacy: DeepStatement[];
    unknowns: DeepStatement[];
  };
  maintenance: {
    summary: DeepStatement[];
    signals: DeepStatement[];
    community: {
      stars: number;
      forks: number;
      watchers: number;
      openIssues: number;
      pushedAt: string | null;
      archived: boolean;
      license: string | null;
    };
  };
  alternatives: DeepAlternative[];
  disagreements: DeepStatement[];
  nextChecks: DeepStatement[];
  finalVerdict: {
    decision: "worth-trying" | "compare-first" | "not-enough-evidence";
    summary: DeepStatement;
  };
  evidence: DeepEvidence[];
}
