import type {
  ReaderCapabilityGroup,
  ReaderCommentaryId,
  ReaderCommandKind,
  ReaderReadmeProfile,
  ReaderTextFact,
} from "../../analysis/model";
import {
  PRACTICAL_IDS,
  VERIFY_IDS,
  WORTH_NOTING_IDS,
  deriveReadmeAvailability,
  type PreferredReadmeState,
} from "../../analysis/reader-report-policy";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../../analysis/project-brief-safety";
import { toPathComparisonKey } from "../../scanner/file-registry";
import type { ReaderMarkdownReadmeEvidence } from "./markdown";
import { README_PROFILE_CAPS } from "./readme-policy";

const CONVENTIONAL_ECOSYSTEM_MANIFESTS = new Set([
  "build.gradle",
  "build.gradle.kts",
  "cargo.toml",
  "composer.json",
  "gemfile",
  "go.mod",
  "package.json",
  "package.swift",
  "pom.xml",
  "pubspec.yaml",
  "pyproject.toml",
]);
const ONBOARDING_COMMAND_KINDS = new Set<ReaderCommandKind>([
  "install",
  "run",
  "develop",
]);
const MAX_EVIDENCE_ITEMS_TO_INSPECT = 128;
const INVALID_DATA_PROPERTY = Symbol("invalid-data-property");

export interface ReaderReadmeCorroboration {
  productShapeObserved: boolean;
  ecosystemsObserved: boolean;
  treeComplete: boolean;
  observedManifestBasenames: readonly string[];
  readmeCommandKinds: readonly ReaderCommandKind[];
  securityPrivacyFactCount: number;
}

export interface BuildReadmeProfileInput {
  preferredReadmeState: PreferredReadmeState;
  evidence: ReaderMarkdownReadmeEvidence;
  purposeKeys: ReadonlySet<string>;
  corroboration: ReaderReadmeCorroboration;
}

function canonicalKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function ownDataProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return INVALID_DATA_PROPERTY;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : INVALID_DATA_PROPERTY;
  } catch {
    return INVALID_DATA_PROPERTY;
  }
}

function containsUnsafeCodePoint(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0);

    if (
      point === undefined ||
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      (point >= 0xd800 && point <= 0xdfff) ||
      point === 0x061c ||
      point === 0x200e ||
      point === 0x200f ||
      point === 0x2028 ||
      point === 0x2029 ||
      (point >= 0x202a && point <= 0x202e) ||
      (point >= 0x2066 && point <= 0x2069)
    ) {
      return true;
    }
  }

  return false;
}

function canonicalSafeValue(value: unknown): value is string {
  if (typeof value !== "string" || containsUnsafeCodePoint(value)) {
    return false;
  }
  const normalized = value.normalize("NFKC");
  return (
    canonicalKey(value).length > 0 &&
    !containsUnsafeCodePoint(normalized) &&
    !containsCredentialLikeValue(value) &&
    !containsCredentialLikeValue(normalized)
  );
}

function canonicalReadmePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const normalizedPath = path.normalize("NFKC");
  if (
    !isSafeProjectBriefPath(path) ||
    !isSafeProjectBriefPath(normalizedPath) ||
    containsCredentialLikeValue(path) ||
    containsCredentialLikeValue(normalizedPath)
  ) {
    return false;
  }
  const normalized = toPathComparisonKey(normalizedPath);
  const slash = normalized.lastIndexOf("/");
  const directory = slash === -1 ? "" : normalized.slice(0, slash);
  const basename = slash === -1 ? normalized : normalized.slice(slash + 1);

  return (
    (directory === "" || directory === ".github") &&
    (basename === "readme" || basename.startsWith("readme."))
  );
}

function canonicalReadmeFact(fact: unknown): ReaderTextFact | null {
  const source = ownDataProperty(fact, "source");
  const path = ownDataProperty(fact, "path");
  const text = ownDataProperty(fact, "text");

  if (
    source !== "readme" ||
    !canonicalReadmePath(path) ||
    !canonicalSafeValue(text)
  ) {
    return null;
  }

  return { source, path, text };
}

function evidenceArray(value: unknown): readonly unknown[] {
  try {
    if (!Array.isArray(value)) return [];
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return [];
    }

    const result: unknown[] = [];
    const length = Math.min(
      lengthDescriptor.value,
      MAX_EVIDENCE_ITEMS_TO_INSPECT,
    );
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor !== undefined && "value" in descriptor) {
        result.push(descriptor.value);
      }
    }
    return result;
  } catch {
    return [];
  }
}

function evidenceField(
  evidence: ReaderMarkdownReadmeEvidence,
  key: keyof ReaderMarkdownReadmeEvidence,
): unknown {
  const value = ownDataProperty(evidence, key);
  return value === INVALID_DATA_PROPERTY ? undefined : value;
}

function boundedFacts(
  facts: unknown,
  cap: number,
  seenFacts: Set<string>,
  excludedKeys: ReadonlySet<string> = new Set<string>(),
): ReaderTextFact[] {
  const result: ReaderTextFact[] = [];

  for (const fact of evidenceArray(facts)) {
    const snapshot = canonicalReadmeFact(fact);
    if (snapshot === null) continue;
    const key = canonicalKey(snapshot.text);
    if (excludedKeys.has(key) || seenFacts.has(key)) continue;
    seenFacts.add(key);
    result.push(snapshot);
    if (result.length >= cap) break;
  }

  return result;
}

function boundedGroups(
  groups: unknown,
  seenFacts: Set<string>,
): ReaderCapabilityGroup[] {
  const result: ReaderCapabilityGroup[] = [];
  const byLabel = new Map<string, ReaderCapabilityGroup>();

  for (const sourceGroup of evidenceArray(groups)) {
    const label = ownDataProperty(sourceGroup, "label");
    const facts = ownDataProperty(sourceGroup, "facts");
    if (!canonicalSafeValue(label) || facts === INVALID_DATA_PROPERTY) {
      continue;
    }
    const labelKey = canonicalKey(label);
    let target = byLabel.get(labelKey);

    if (
      target === undefined &&
      result.length >= README_PROFILE_CAPS.capabilityGroups
    ) {
      continue;
    }
    for (const fact of evidenceArray(facts)) {
      const snapshot = canonicalReadmeFact(fact);
      if (snapshot === null) continue;
      const factKey = canonicalKey(snapshot.text);
      if (seenFacts.has(factKey)) continue;
      if (target === undefined) {
        target = { label, facts: [] };
        byLabel.set(labelKey, target);
        result.push(target);
      }
      if (target.facts.length >= README_PROFILE_CAPS.capabilityFacts) break;
      seenFacts.add(factKey);
      target.facts.push(snapshot);
    }
  }

  return result;
}

function emptyProfile(
  availability: ReaderReadmeProfile["availability"],
): ReaderReadmeProfile {
  return {
    availability,
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
  };
}

function profileFactCount(profile: ReaderReadmeProfile): number {
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

function conventionalManifestName(value: string): string | null {
  const normalized = canonicalKey(value).toLocaleLowerCase("en-US");
  return CONVENTIONAL_ECOSYSTEM_MANIFESTS.has(normalized) ? normalized : null;
}

function unobservedManifestReference(
  profile: ReaderReadmeProfile,
  corroboration: ReaderReadmeCorroboration,
): boolean {
  const observed = new Set(
    corroboration.observedManifestBasenames.map((value) =>
      (toPathComparisonKey(value).split("/").at(-1) ?? "").toLocaleLowerCase(
        "en-US",
      ),
    ),
  );

  return profile.dependencies.some(({ text }) => {
    const mentioned = conventionalManifestName(text);
    return mentioned !== null && !observed.has(mentioned);
  });
}

/** Derives only frozen commentary identifiers from canonical README evidence. */
export function deriveReadmeCommentary(
  profile: ReaderReadmeProfile,
  corroboration: ReaderReadmeCorroboration,
): ReaderCommentaryId[] {
  if (
    profile.availability === "unavailable" ||
    profileFactCount(profile) === 0
  ) {
    return [];
  }

  const onboardingDocumented = corroboration.readmeCommandKinds.some((kind) =>
    ONBOARDING_COMMAND_KINDS.has(kind),
  );
  const manifestUnobserved = unobservedManifestReference(
    profile,
    corroboration,
  );
  const manifestMissing = corroboration.treeComplete && manifestUnobserved;
  const broadStructureAbsent =
    corroboration.treeComplete &&
    !corroboration.productShapeObserved &&
    !corroboration.ecosystemsObserved;
  const broadNeedsVerification = manifestMissing || broadStructureAbsent;
  const triggers: Readonly<Record<ReaderCommentaryId, boolean>> = {
    "readme-substantial-overview": profile.overview.length >= 2,
    "readme-audience-or-use-cases-documented":
      profile.audiences.length > 0 || profile.useCases.length > 0,
    "readme-capabilities-documented": profile.capabilityGroups.length > 0,
    "readme-workflow-documented": profile.workflow.length > 0,
    "readme-onboarding-documented": onboardingDocumented,
    "readme-limitations-documented": profile.limitations.length > 0,
    "readme-maturity-documented": profile.maturity.length > 0,
    "readme-broad-structure-corroborated":
      corroboration.productShapeObserved &&
      corroboration.ecosystemsObserved &&
      !manifestUnobserved,
    "readme-security-data-flow-unestablished":
      corroboration.securityPrivacyFactCount <= 0,
    "readme-limitations-unestablished": profile.limitations.length === 0,
    "readme-maturity-unestablished": profile.maturity.length === 0,
    "readme-broad-structure-needs-verification": broadNeedsVerification,
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

/** Builds a detached, bounded README profile without attaching it to ReaderReport. */
export function buildReadmeProfile(
  input: BuildReadmeProfileInput,
): ReaderReadmeProfile {
  if (input.preferredReadmeState === "missing") {
    return emptyProfile("unavailable");
  }

  const purposeKeys = new Set(
    [...input.purposeKeys]
      .map(canonicalKey)
      .filter((value) => value.length > 0),
  );
  const seenFacts = new Set<string>();
  const profile: ReaderReadmeProfile = {
    availability: "unavailable",
    overview: boundedFacts(
      evidenceField(input.evidence, "overview"),
      README_PROFILE_CAPS.overview,
      seenFacts,
      purposeKeys,
    ),
    audiences: boundedFacts(
      evidenceField(input.evidence, "audiences"),
      README_PROFILE_CAPS.audiences,
      seenFacts,
    ),
    problems: boundedFacts(
      evidenceField(input.evidence, "problems"),
      README_PROFILE_CAPS.problems,
      seenFacts,
    ),
    useCases: boundedFacts(
      evidenceField(input.evidence, "useCases"),
      README_PROFILE_CAPS.useCases,
      seenFacts,
      purposeKeys,
    ),
    capabilityGroups: boundedGroups(
      evidenceField(input.evidence, "capabilityGroups"),
      seenFacts,
    ),
    workflow: boundedFacts(
      evidenceField(input.evidence, "workflow"),
      README_PROFILE_CAPS.workflow,
      seenFacts,
    ),
    dependencies: boundedFacts(
      evidenceField(input.evidence, "dependencies"),
      README_PROFILE_CAPS.dependencies,
      seenFacts,
    ),
    limitations: boundedFacts(
      evidenceField(input.evidence, "limitations"),
      README_PROFILE_CAPS.limitations,
      seenFacts,
    ),
    maturity: boundedFacts(
      evidenceField(input.evidence, "maturity"),
      README_PROFILE_CAPS.maturity,
      seenFacts,
    ),
    commentary: [],
  };
  const safeFactCount = profileFactCount(profile);
  const availability = deriveReadmeAvailability({
    preferredReadmeState: input.preferredReadmeState,
    safeFactCount,
  });

  if (safeFactCount === 0) {
    return emptyProfile(availability);
  }
  profile.availability = availability;

  return {
    ...profile,
    commentary: deriveReadmeCommentary(profile, input.corroboration),
  };
}
