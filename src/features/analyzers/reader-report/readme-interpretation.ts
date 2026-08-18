import type {
  ReaderCapabilityGroup,
  ReaderCommentaryId,
  ReaderConventionalManifest,
  ReaderReadmeProfile,
  ReaderTextFact,
} from "../../analysis/model";
import { READER_CONVENTIONAL_MANIFESTS } from "../../analysis/model";
import {
  deriveCanonicalReadmeCommentary,
  deriveReadmeAvailability,
  readerConventionalManifest,
  type CanonicalReadmeCommentaryEvidence,
  type PreferredReadmeState,
} from "../../analysis/reader-report-policy";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../../analysis/project-brief-safety";
import type { ReaderMarkdownReadmeEvidence } from "./markdown";
import { isCanonicalReadmePath, README_PROFILE_CAPS } from "./readme-policy";

const MAX_EVIDENCE_ITEMS_TO_INSPECT = 128;
const INVALID_DATA_PROPERTY = Symbol("invalid-data-property");

export type ReaderReadmeCorroboration = CanonicalReadmeCommentaryEvidence & {
  observedManifests: readonly string[];
};

export interface BuildReadmeProfileInput {
  preferredReadmeState: PreferredReadmeState;
  evidencePath: string | null;
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
  return isCanonicalReadmePath(normalizedPath);
}

function canonicalReadmeFact(
  fact: unknown,
  evidencePath: string | null,
): ReaderTextFact | null {
  const source = ownDataProperty(fact, "source");
  const path = ownDataProperty(fact, "path");
  const text = ownDataProperty(fact, "text");

  if (
    source !== "readme" ||
    !canonicalReadmePath(path) ||
    path !== evidencePath ||
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

function canonicalObservedManifests(
  value: unknown,
): ReaderConventionalManifest[] {
  const observed = new Set<ReaderConventionalManifest>();

  for (const candidate of evidenceArray(value)) {
    if (typeof candidate !== "string") continue;
    const manifest = readerConventionalManifest(candidate);
    if (manifest !== null) observed.add(manifest);
  }

  return READER_CONVENTIONAL_MANIFESTS.filter((manifest) =>
    observed.has(manifest),
  );
}

function boundedFacts(
  facts: unknown,
  cap: number,
  seenFacts: Set<string>,
  evidencePath: string | null,
  excludedKeys: ReadonlySet<string> = new Set<string>(),
): ReaderTextFact[] {
  const result: ReaderTextFact[] = [];

  for (const fact of evidenceArray(facts)) {
    const snapshot = canonicalReadmeFact(fact, evidencePath);
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
  evidencePath: string | null,
  excludedKeys: ReadonlySet<string>,
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
      (excludedKeys.has(labelKey) ||
        seenFacts.has(labelKey) ||
        result.length >= README_PROFILE_CAPS.capabilityGroups)
    ) {
      continue;
    }
    for (const fact of evidenceArray(facts)) {
      const snapshot = canonicalReadmeFact(fact, evidencePath);
      if (snapshot === null) continue;
      const factKey = canonicalKey(snapshot.text);
      if (
        factKey === labelKey ||
        excludedKeys.has(factKey) ||
        seenFacts.has(factKey)
      ) {
        continue;
      }
      if (target === undefined) {
        target = { label, facts: [] };
        byLabel.set(labelKey, target);
        result.push(target);
        seenFacts.add(labelKey);
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

/** Derives only frozen commentary identifiers from canonical README evidence. */
export function deriveReadmeCommentary(
  profile: ReaderReadmeProfile,
  corroboration: ReaderReadmeCorroboration,
): ReaderCommentaryId[] {
  return deriveCanonicalReadmeCommentary(profile, corroboration);
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
    observedManifests: canonicalObservedManifests(
      ownDataProperty(input.corroboration, "observedManifests"),
    ),
    overview: boundedFacts(
      evidenceField(input.evidence, "overview"),
      README_PROFILE_CAPS.overview,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    audiences: boundedFacts(
      evidenceField(input.evidence, "audiences"),
      README_PROFILE_CAPS.audiences,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    problems: boundedFacts(
      evidenceField(input.evidence, "problems"),
      README_PROFILE_CAPS.problems,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    useCases: boundedFacts(
      evidenceField(input.evidence, "useCases"),
      README_PROFILE_CAPS.useCases,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    capabilityGroups: boundedGroups(
      evidenceField(input.evidence, "capabilityGroups"),
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    workflow: boundedFacts(
      evidenceField(input.evidence, "workflow"),
      README_PROFILE_CAPS.workflow,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    dependencies: boundedFacts(
      evidenceField(input.evidence, "dependencies"),
      README_PROFILE_CAPS.dependencies,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    limitations: boundedFacts(
      evidenceField(input.evidence, "limitations"),
      README_PROFILE_CAPS.limitations,
      seenFacts,
      input.evidencePath,
      purposeKeys,
    ),
    maturity: boundedFacts(
      evidenceField(input.evidence, "maturity"),
      README_PROFILE_CAPS.maturity,
      seenFacts,
      input.evidencePath,
      purposeKeys,
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
