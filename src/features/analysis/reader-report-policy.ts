import {
  READER_CONVENTIONAL_MANIFESTS,
  type ReaderCommentaryId,
  type ReaderActivityBand,
  type ReaderAvailability,
  type ReaderCommandKind,
  type ReaderConventionalManifest,
  type ReaderReadmeProfile,
  type ReaderQuestionId,
  type ReaderSignalFact,
  type ReaderSignalId,
  type ReaderSignalState,
  type ReliabilityStatus,
} from "./model";

export const WORTH_NOTING_IDS = Object.freeze([
  "readme-substantial-overview",
  "readme-audience-or-use-cases-documented",
  "readme-capabilities-documented",
  "readme-workflow-documented",
  "readme-onboarding-documented",
  "readme-limitations-documented",
  "readme-maturity-documented",
  "readme-broad-structure-corroborated",
] as const satisfies readonly ReaderCommentaryId[]);

export const VERIFY_IDS = Object.freeze([
  "readme-security-data-flow-unestablished",
  "readme-limitations-unestablished",
  "readme-maturity-unestablished",
  "readme-broad-structure-needs-verification",
] as const satisfies readonly ReaderCommentaryId[]);

export const PRACTICAL_IDS = Object.freeze([
  "readme-external-dependencies-declared",
] as const satisfies readonly ReaderCommentaryId[]);

export interface CanonicalReadmeCommentaryEvidence {
  productShapeObserved: boolean;
  ecosystemsObserved: boolean;
  treeComplete: boolean;
  readmeCommandKinds: readonly ReaderCommandKind[];
  securityPrivacyFactCount: number;
}

export function readerConventionalManifest(
  value: string,
): ReaderConventionalManifest | null {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

  return (
    READER_CONVENTIONAL_MANIFESTS.find((manifest) => manifest === normalized) ??
    null
  );
}

export const READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID = Object.freeze({
  "build.gradle": "build.gradle",
  "build.gradle.kts": "build.gradle.kts",
  "Cargo.toml": "cargo.toml",
  "composer.json": "composer.json",
  Gemfile: "gemfile",
  "go.mod": "go.mod",
  "package.json": "package.json",
  "Package.swift": "package.swift",
  "pom.xml": "pom.xml",
  "pubspec.yaml": "pubspec.yaml",
  "pyproject.toml": "pyproject.toml",
} as const satisfies Readonly<Record<string, ReaderConventionalManifest>>);

/** Exact raw tree identity; README prose normalization must not reach here. */
export function observedReaderConventionalManifest(
  basename: string,
): ReaderConventionalManifest | null {
  if (!Object.hasOwn(READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID, basename)) {
    return null;
  }

  return READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID[
    basename as keyof typeof READER_CONVENTIONAL_MANIFEST_RAW_NAME_TO_ID
  ];
}

function readmeProfileFactCount(profile: ReaderReadmeProfile): number {
  return (
    profile.overview.length +
    profile.audiences.length +
    profile.problems.length +
    profile.useCases.length +
    profile.capabilityGroups.reduce(
      (total, group) => total + group.facts.length,
      0,
    ) +
    profile.workflow.length +
    profile.dependencies.length +
    profile.limitations.length +
    profile.maturity.length
  );
}

/** Canonical commentary derived only from evidence serialized in the report. */
export function deriveCanonicalReadmeCommentary(
  profile: ReaderReadmeProfile,
  evidence: CanonicalReadmeCommentaryEvidence,
): ReaderCommentaryId[] {
  if (
    profile.availability === "unavailable" ||
    readmeProfileFactCount(profile) === 0
  ) {
    return [];
  }

  const onboardingDocumented = evidence.readmeCommandKinds.some(
    (kind) => kind === "install" || kind === "run" || kind === "develop",
  );
  const observedManifests = new Set(profile.observedManifests);
  const hasUnobservedManifestClaim = profile.dependencies.some(({ text }) => {
    const manifest = readerConventionalManifest(text);
    return manifest !== null && !observedManifests.has(manifest);
  });
  const broadStructureCorroborated =
    evidence.treeComplete &&
    evidence.productShapeObserved &&
    evidence.ecosystemsObserved &&
    !hasUnobservedManifestClaim;
  const broadStructureNeedsVerification =
    evidence.treeComplete &&
    (hasUnobservedManifestClaim ||
      (!evidence.productShapeObserved && !evidence.ecosystemsObserved));
  const triggers: Readonly<Record<ReaderCommentaryId, boolean>> = {
    "readme-substantial-overview": profile.overview.length >= 2,
    "readme-audience-or-use-cases-documented":
      profile.audiences.length > 0 || profile.useCases.length > 0,
    "readme-capabilities-documented": profile.capabilityGroups.length > 0,
    "readme-workflow-documented": profile.workflow.length > 0,
    "readme-onboarding-documented": onboardingDocumented,
    "readme-limitations-documented": profile.limitations.length > 0,
    "readme-maturity-documented": profile.maturity.length > 0,
    "readme-broad-structure-corroborated": broadStructureCorroborated,
    "readme-security-data-flow-unestablished":
      evidence.securityPrivacyFactCount <= 0,
    "readme-limitations-unestablished": profile.limitations.length === 0,
    "readme-maturity-unestablished": profile.maturity.length === 0,
    "readme-broad-structure-needs-verification":
      broadStructureNeedsVerification,
    "readme-external-dependencies-declared": profile.dependencies.length > 0,
  };
  const selected = (ids: readonly ReaderCommentaryId[]) =>
    ids.filter((id) => triggers[id]);

  return [
    ...selected(WORTH_NOTING_IDS).slice(0, 3),
    ...selected(VERIFY_IDS),
    ...selected(PRACTICAL_IDS),
  ];
}

export type PreferredReadmeState = "missing" | "incomplete" | "fetched";

const DECISIVE_SIGNAL_IDS = [
  "archived",
  "install",
  "run",
  "license",
  "recent-activity",
] as const satisfies readonly ReaderSignalId[];

const NON_METADATA_SIGNAL_IDS = [
  "install",
  "run",
  "license",
  "tests",
  "ci",
  "coverage",
  "security-policy",
  "version-history",
  "contributing",
  "issue-templates",
  "dependency-updates",
  "configuration",
] as const satisfies readonly ReaderSignalId[];

function signalState(
  signals: readonly ReaderSignalFact[],
  signal: ReaderSignalId,
): ReaderSignalState {
  return signals.find((fact) => fact.signal === signal)?.state ?? "unknown";
}

function verificationState(
  signals: readonly ReaderSignalFact[],
): ReaderSignalState {
  const testState = signalState(signals, "tests");
  const ciState = signalState(signals, "ci");

  if (testState === "present" || ciState === "present") return "present";
  if (testState === "unknown" || ciState === "unknown") return "unknown";
  return "absent";
}

/** Derives the non-scoring evidence judgement from the frozen decisive signals. */
export function deriveReliabilityStatus(
  signals: readonly ReaderSignalFact[],
): ReliabilityStatus {
  const hasUnknownDecisiveSignal = DECISIVE_SIGNAL_IDS.some(
    (signal) => signalState(signals, signal) === "unknown",
  );
  const automatedVerification = verificationState(signals);

  if (hasUnknownDecisiveSignal || automatedVerification === "unknown") {
    return "insufficient-evidence";
  }

  const hasOnlyMetadataEvidence = NON_METADATA_SIGNAL_IDS.every(
    (signal) => signalState(signals, signal) === "absent",
  );
  if (hasOnlyMetadataEvidence) return "insufficient-evidence";

  if (
    signalState(signals, "archived") === "present" ||
    signalState(signals, "install") === "absent" ||
    signalState(signals, "run") === "absent" ||
    signalState(signals, "license") === "absent" ||
    signalState(signals, "recent-activity") === "absent" ||
    automatedVerification === "absent"
  ) {
    return "verify-before-use";
  }

  return "continue-evaluation";
}

/** Selects at most four unique verification questions in product priority order. */
export function deriveReaderQuestions(
  _status: ReliabilityStatus,
  signals: readonly ReaderSignalFact[],
): ReaderQuestionId[] {
  const questions: ReaderQuestionId[] = [
    "license-compatibility",
    "reproduce-install-run",
  ];

  if (
    signalState(signals, "archived") === "present" ||
    signalState(signals, "recent-activity") === "absent"
  ) {
    questions.push("release-compatibility");
  }

  if (signalState(signals, "security-policy") !== "present") {
    questions.push("vulnerability-process");
  }

  questions.push("runtime-data-flow");
  return [...new Set(questions)].slice(0, 4);
}

/** Maps exact UTC elapsed days and archived state to the activity signal. */
export function activityState(
  elapsedUtcDays: number,
  archived: boolean,
): ReaderSignalState {
  if (!Number.isFinite(elapsedUtcDays) || elapsedUtcDays < 0) {
    return "unknown";
  }
  return !archived && elapsedUtcDays <= 180 ? "present" : "absent";
}

/** Preserves the existing exact 180- and 365-day maintenance bands. */
export function activityBand(elapsedUtcDays: number): ReaderActivityBand {
  if (!Number.isFinite(elapsedUtcDays) || elapsedUtcDays < 0) {
    throw new RangeError("Elapsed UTC days must be finite and nonnegative");
  }
  if (elapsedUtcDays <= 180) return "within-180-days";
  if (elapsedUtcDays <= 365) return "181-365-days";
  return "over-365-days";
}

/** Incomplete coverage always yields a partial reader section. */
export function deriveReaderAvailability(
  itemCount: number,
  coverageComplete: boolean,
): ReaderAvailability {
  if (!coverageComplete) return "partial";
  return itemCount > 0 ? "available" : "unavailable";
}

/** Derives README availability from only the preferred README acquisition state. */
export function deriveReadmeAvailability(input: {
  preferredReadmeState: PreferredReadmeState;
  safeFactCount: number;
}): ReaderAvailability {
  if (input.preferredReadmeState === "missing") return "unavailable";
  if (input.preferredReadmeState === "incomplete") return "partial";
  return input.safeFactCount > 0 ? "available" : "unavailable";
}
