import type {
  DeepReport,
  DeepStatement,
} from "../../src/features/deep-analysis/model.js";

export const EXPERT_ROLES = Object.freeze([
  "product",
  "onboarding-architecture",
  "trust-ecosystem",
] as const);

export const EXPERT_SECTIONS = Object.freeze([
  "orientation",
  "fit",
  "situations",
  "capabilities",
  "workflow",
  "architecture",
  "onboarding",
  "trust",
  "maintenance",
  "alternatives",
  "verdict",
] as const);

export const SKEPTIC_CHALLENGE_KINDS = Object.freeze([
  "unsupported",
  "overstated",
  "conflicting",
  "incomplete",
  "popularity-bias",
  "unsafe-advice",
] as const);

/**
 * Stage budgets are measured after JSON escaping, because safe transport can
 * expand otherwise short model text (for example, an ampersand becomes a
 * six-code-point escape). The payload budgets deliberately leave 12k code
 * points for fixed instructions and delimiters in the 96k prompt envelope.
 */
export const PANEL_LIMITS = Object.freeze({
  promptCodePoints: 96_000,
  evidenceSectionCodePoints: 44_000,
  findingsPerReview: 10,
  expertReviewCodePoints: 9_500,
  acceptedReviewsCodePoints: 29_000,
  challenges: 12,
  skepticalReviewCodePoints: 11_000,
} as const);

export type ExpertRole = (typeof EXPERT_ROLES)[number];
export type ExpertSection = (typeof EXPERT_SECTIONS)[number];
export type SkepticChallengeKind = (typeof SKEPTIC_CHALLENGE_KINDS)[number];
export type ChallengeDestination = "disagreements" | "nextChecks";

export const ROLE_REQUIRED_SECTIONS: Readonly<
  Record<ExpertRole, readonly ExpertSection[]>
> = Object.freeze({
  product: Object.freeze<ExpertSection[]>([
    "orientation",
    "fit",
    "situations",
    "capabilities",
    "workflow",
    "alternatives",
    "verdict",
  ]),
  "onboarding-architecture": Object.freeze<ExpertSection[]>([
    "orientation",
    "capabilities",
    "workflow",
    "architecture",
    "onboarding",
    "trust",
    "maintenance",
    "verdict",
  ]),
  "trust-ecosystem": Object.freeze<ExpertSection[]>([
    "fit",
    "situations",
    "capabilities",
    "architecture",
    "onboarding",
    "trust",
    "maintenance",
    "alternatives",
    "verdict",
  ]),
});

export const CHALLENGE_DESTINATIONS: Readonly<
  Record<SkepticChallengeKind, ChallengeDestination>
> = Object.freeze({
  unsupported: "disagreements",
  overstated: "disagreements",
  conflicting: "disagreements",
  incomplete: "nextChecks",
  "popularity-bias": "disagreements",
  "unsafe-advice": "disagreements",
});

export interface ExpertFinding {
  id: string;
  section: ExpertSection;
  claim: string;
  provenance: DeepStatement["provenance"];
  confidence: DeepStatement["confidence"];
  importance: "primary" | "supporting";
  evidenceIds: string[];
}

export interface ExpertReview {
  schemaVersion: "1.0.0";
  role: ExpertRole;
  findings: ExpertFinding[];
  unknowns: ExpertFinding[];
}

export interface SkepticalChallenge {
  id: string;
  findingId: string;
  kind: SkepticChallengeKind;
  reason: string;
  evidenceIds: string[];
}

export interface SkepticalReview {
  schemaVersion: "1.0.0";
  challenges: SkepticalChallenge[];
}

export interface DeepAlternativeDraft {
  repository: { owner: string; repo: string };
  whyCompare: DeepStatement;
}

export interface ChallengeLinkedStatementDraft {
  statement: DeepStatement;
  sourceChallengeId: string;
}

/** A routine follow-up which does not resolve a skeptical challenge. */
export interface UnchallengedNextCheckDraft {
  statement: DeepStatement;
  sourceChallengeId: null;
}

export type DeepReportDraft = Pick<
  DeepReport,
  | "schemaVersion"
  | "language"
  | "orientation"
  | "fit"
  | "situations"
  | "capabilities"
  | "workflow"
  | "architecture"
  | "onboarding"
  | "trust"
  | "finalVerdict"
> & {
  maintenance: Pick<DeepReport["maintenance"], "summary" | "signals">;
  alternatives: DeepAlternativeDraft[];
  disagreements: ChallengeLinkedStatementDraft[];
  nextChecks: Array<ChallengeLinkedStatementDraft | UnchallengedNextCheckDraft>;
};

/** Server-verified values which are never accepted from a model draft. */
export interface DeepReportServerFields {
  review: DeepReport["review"];
  community: DeepReport["maintenance"]["community"];
  alternatives: Array<{
    repository: { owner: string; repo: string };
    github: DeepReport["alternatives"][number]["github"];
  }>;
}

export interface PanelPrompt {
  readonly system: string;
  readonly user: string;
}
