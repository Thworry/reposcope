import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  assertCanonicalTimestamp,
  assertRepositoryComponent,
  assertRepositoryPath,
} from "../github/guards.js";
import type { EvidenceTextFile } from "../github/model.js";
import { extractManifestFacts } from "./manifest-facts.js";
import { EVIDENCE_LIMITS, EVIDENCE_SCHEMA_VERSION } from "./model.js";
import type {
  BuildEvidencePackInput,
  EvidenceContentBlock,
  EvidenceContentBlockDraft,
  EvidenceFact,
  EvidenceFactCategory,
  EvidenceKind,
  EvidencePack,
  VerifiedAlternativeRepository,
} from "./model.js";
import { sanitizeDocumentForModel } from "./safe-document.js";
import { isCredentialShapedText } from "./safe-document.js";
import { sanitizeReadmeForModel } from "./safe-readme.js";

const UNSAFE_TEXT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const UNSAFE_BLOCK_UNICODE_PATTERN = /[\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;
const RAW_TAG_PATTERN =
  /<(?:\/?[A-Za-z][A-Za-z0-9:_-]*\b|!\s*DOCTYPE\b|\?xml\b)[^>]*>/iu;
const EVIDENCE_ID_PATTERN = /^evi-[A-Za-z0-9_-]{43}$/u;
const EVIDENCE_ID_DOMAIN = "reposcope:evidence-entry:v1";
const SNAPSHOT_MAX_DEPTH = 16;
const SNAPSHOT_MAX_NODES = 2_000;
const SNAPSHOT_MAX_PROPERTIES = 12_000;
const SNAPSHOT_MAX_STRING_CODE_UNITS = 8_192;
const SNAPSHOT_MAX_TOTAL_STRING_CODE_UNITS = 512 * 1_024;
const FACT_PRIORITY: Readonly<Record<EvidenceKind, number>> = Object.freeze({
  github: 0,
  tree: 1,
  readme: 2,
  manifest: 3,
  documentation: 4,
  alternative: 5,
});
const BLOCK_PRIORITY = Object.freeze({
  readme: 0,
  manifest: 1,
  documentation: 2,
} as const);

type EvidenceFactDraft = Omit<EvidenceFact, "id">;
type DataRecord = Record<string, unknown>;
type EvidenceEntryDraft = EvidenceFactDraft | EvidenceContentBlockDraft;

function canonicalText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function safeFactText(value: string, maximum = 640): string | null {
  if (
    value.length === 0 ||
    Array.from(value).length > maximum ||
    UNSAFE_TEXT_PATTERN.test(value) ||
    isCredentialShapedText(value)
  ) {
    return null;
  }
  const sanitized = value
    .replace(/\b(?:https?|ftp):\/\/[^\s"'<>]+/giu, "[link destination omitted]")
    .replace(/<\/?[A-Za-z][^>\n]*>/gu, "")
    .trim();
  return sanitized.length > 0 ? sanitized : null;
}

function canonicalFactJson(prefix: string, value: unknown): string {
  return `${prefix}${JSON.stringify(value)}`;
}

function encodePath(path: string): string {
  return assertRepositoryPath(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

export function buildPrimaryRepositoryFileUrl(
  repository: { owner: string; repo: string },
  commitSha: string,
  path: string,
): string {
  if (!/^[0-9a-f]{40}$/u.test(commitSha))
    throw new TypeError("Invalid commit SHA");
  const owner = assertRepositoryComponent(repository.owner, "owner");
  const repo = assertRepositoryComponent(repository.repo, "repo");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${commitSha}/${encodePath(path)}`;
}

export function buildAlternativeRepositoryUrl(repository: {
  owner: string;
  repo: string;
}): string {
  const owner = assertRepositoryComponent(repository.owner, "owner");
  const repo = assertRepositoryComponent(repository.repo, "repo");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function isValidEvidenceUrl(
  value: string,
  input:
    | {
        kind: "primary-file";
        repository: { owner: string; repo: string };
        commitSha: string;
        path: string;
      }
    | {
        kind: "alternative";
        repository: { owner: string; repo: string };
      },
): boolean {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      parsed.port !== "" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return false;
    }
    const expected =
      input.kind === "primary-file"
        ? buildPrimaryRepositoryFileUrl(
            input.repository,
            input.commitSha,
            input.path,
          )
        : buildAlternativeRepositoryUrl(input.repository);
    return value === expected;
  } catch {
    return false;
  }
}

function addFact(facts: EvidenceFactDraft[], fact: EvidenceFactDraft): void {
  const label = safeFactText(fact.label, 160);
  const text = safeFactText(fact.text);
  if (label === null || text === null) return;
  facts.push({ ...fact, label, text });
}

function fileLabel(kind: EvidenceTextFile["kind"]): string {
  if (kind === "readme") return "README source";
  if (kind === "manifest") return "Manifest source";
  return "Documentation source";
}

function addRepositoryFacts(
  input: BuildEvidencePackInput,
  facts: EvidenceFactDraft[],
): void {
  const { repository } = input.snapshot;
  addFact(facts, {
    category: "repository-identity",
    kind: "github",
    label: "Repository",
    text: `Public repository: ${repository.fullName}`,
    path: null,
    url: null,
    trust: "observed",
    retention: "narrative",
  });
  const description =
    repository.description === null
      ? null
      : safeFactText(repository.description, 640);
  addFact(facts, {
    category: "authored-description",
    kind: "github",
    label: "GitHub description",
    text: description ?? "No safe GitHub description was observed",
    path: null,
    url: null,
    trust: description === null ? "observed" : "repository-authored",
    retention: "narrative",
  });
  const seenTopics = new Set<string>();
  const safeTopics = repository.topics
    .map((topic) => safeFactText(topic, 80))
    .filter((topic): topic is string => topic !== null)
    .sort((left, right) =>
      canonicalText(left).localeCompare(canonicalText(right), "en"),
    )
    .filter((topic) => {
      const key = canonicalText(topic);
      if (seenTopics.has(key)) return false;
      seenTopics.add(key);
      return true;
    })
    .slice(0, 10);
  addFact(facts, {
    category: "authored-topics",
    kind: "github",
    label: "GitHub topics",
    text:
      safeTopics.length > 0
        ? `Topics: ${safeTopics.join(", ")}`
        : "No safe GitHub topics were observed",
    path: null,
    url: null,
    trust: safeTopics.length === 0 ? "observed" : "repository-authored",
    retention: "narrative",
  });
  const defaultBranch =
    safeFactText(repository.defaultBranch, 255) ?? "[unsafe value omitted]";
  const license =
    repository.licenseSpdxId === null
      ? "unknown"
      : (safeFactText(repository.licenseSpdxId, 128) ??
        "[unsafe value omitted]");
  addFact(facts, {
    category: "repository-live-state",
    kind: "github",
    label: "Repository state",
    text: canonicalFactJson("Repository state: ", {
      archived: repository.archived,
      defaultBranch,
      pushedAt: repository.pushedAt,
      license,
    }),
    path: null,
    url: null,
    trust: "observed",
    retention: "live",
  });
  addFact(facts, {
    category: "community-live-counts",
    kind: "github",
    label: "Community counts",
    text: canonicalFactJson("Community counts: ", {
      stars: repository.starsCount,
      watchers: repository.watchersCount,
      forks: repository.forksCount,
      openIssues: repository.openIssuesCount,
    }),
    path: null,
    url: null,
    trust: "observed",
    retention: "live",
  });
  addFact(facts, {
    category: "tree-observation",
    kind: "tree",
    label: "Repository tree",
    text: canonicalFactJson("Repository tree: ", {
      filesObserved: input.snapshot.files.length,
      recursiveTreeComplete: input.snapshot.treeComplete,
    }),
    path: null,
    url: null,
    trust: "observed",
    retention: "narrative",
  });

  const orderedFiles = [...input.files].sort((left, right) => {
    const kind = FACT_PRIORITY[left.kind] - FACT_PRIORITY[right.kind];
    return kind !== 0
      ? kind
      : left.path
          .normalize("NFC")
          .localeCompare(right.path.normalize("NFC"), "en");
  });
  for (const file of orderedFiles) {
    const path = assertRepositoryPath(file.path);
    if (isCredentialShapedText(path)) continue;
    const url = buildPrimaryRepositoryFileUrl(
      repository,
      input.snapshot.commitSha,
      path,
    );
    if (
      !isValidEvidenceUrl(url, {
        kind: "primary-file",
        repository,
        commitSha: input.snapshot.commitSha,
        path,
      })
    ) {
      throw new TypeError("Invalid primary evidence URL");
    }
    addFact(facts, {
      category: "file-source",
      kind: file.kind,
      label: fileLabel(file.kind),
      text: `Repository file: ${path}`,
      path,
      url,
      trust: "repository-authored",
      retention: "narrative",
    });
  }
}

function addDynamicFacts(
  input: BuildEvidencePackInput,
  facts: EvidenceFactDraft[],
): void {
  const releases = input.releaseSummary;
  const releaseDetails =
    releases?.releases.slice(0, 3).map((release) => ({
      tag: safeFactText(release.tagName, 64) ?? "[unsafe tag omitted]",
      publishedAt: release.publishedAt,
      prerelease: release.prerelease,
    })) ?? [];
  addFact(facts, {
    category: "release-live-summary",
    kind: "github",
    label: "Release summary",
    text: canonicalFactJson(
      "Release summary: ",
      releases === undefined
        ? { status: "not-acquired" }
        : releases.endpointAvailable
          ? {
              status: "available",
              releasesObserved: releases.releases.length,
              recent: releaseDetails,
            }
          : { status: "unavailable" },
    ),
    path: null,
    url: null,
    trust: "observed",
    retention: "live",
  });
  const activity = input.activitySummary;
  addFact(facts, {
    category: "activity-live-summary",
    kind: "github",
    label: "Recent activity",
    text: canonicalFactJson(
      "Recent activity: ",
      activity === undefined
        ? { status: "not-acquired" }
        : {
            status: "available",
            eventsScanned: activity.eventsScanned,
            latestActivityAt: activity.latestActivityAt,
            counts: {
              push: activity.counts.push,
              issue: activity.counts.issue,
              pullRequest: activity.counts["pull-request"],
              release: activity.counts.release,
              other: activity.counts.other,
            },
          },
    ),
    path: null,
    url: null,
    trust: "observed",
    retention: "live",
  });
}

function addAlternativeFacts(
  alternatives: readonly VerifiedAlternativeRepository[],
  facts: EvidenceFactDraft[],
): void {
  const admitted = alternatives.slice(0, EVIDENCE_LIMITS.alternatives);
  for (const repository of admitted) {
    const url = buildAlternativeRepositoryUrl(repository);
    if (!isValidEvidenceUrl(url, { kind: "alternative", repository })) {
      throw new TypeError("Invalid alternative evidence URL");
    }
    const description =
      repository.description === null
        ? null
        : safeFactText(repository.description, 320);
    const license =
      repository.licenseSpdxId === null
        ? "unknown"
        : (safeFactText(repository.licenseSpdxId, 128) ??
          "[unsafe value omitted]");
    const fullName = `${repository.owner}/${repository.repo}`;
    addFact(facts, {
      category: "alternative-description",
      kind: "alternative",
      label: `Alternative ${fullName} description`,
      text:
        description === null
          ? `Repository ${fullName} has no safe description`
          : `Repository ${fullName} description: ${description}`,
      path: null,
      url,
      trust: description === null ? "observed" : "external-repository",
      retention: "narrative",
    });
    addFact(facts, {
      category: "alternative-live-state",
      kind: "alternative",
      label: `Alternative ${fullName} observed facts`,
      text: canonicalFactJson("Alternative state: ", {
        repository: fullName,
        stars: repository.starsCount,
        forks: repository.forksCount,
        watchers: repository.watchersCount,
        openIssues: repository.openIssuesCount,
        pushedAt: repository.pushedAt,
        archived: repository.archived,
        license,
      }),
      path: null,
      url,
      trust: "observed",
      retention: "live",
    });
  }
}

function canonicalizeFactsInSlotOrder(
  facts: readonly EvidenceFactDraft[],
): EvidenceFactDraft[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = [
      fact.category,
      fact.kind,
      canonicalText(fact.label),
      fact.path ?? "",
      fact.url ?? "",
      canonicalText(fact.text),
      fact.trust,
      fact.retention,
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortAndDedupeBlocks(
  blocks: readonly EvidenceContentBlockDraft[],
  maximumBlocks: number,
): EvidenceContentBlockDraft[] {
  const sorted = [...blocks].sort((left, right) => {
    const priority = BLOCK_PRIORITY[left.kind] - BLOCK_PRIORITY[right.kind];
    if (priority !== 0) return priority;
    return lexicalCompare(
      [
        left.path.normalize("NFC"),
        String(left.startLine).padStart(10, "0"),
        String(left.endLine).padStart(10, "0"),
        canonicalText(left.heading ?? ""),
        canonicalText(left.text),
      ].join("\u0000"),
      [
        right.path.normalize("NFC"),
        String(right.startLine).padStart(10, "0"),
        String(right.endLine).padStart(10, "0"),
        canonicalText(right.heading ?? ""),
        canonicalText(right.text),
      ].join("\u0000"),
    );
  });
  const seen = new Set<string>();
  const result: EvidenceContentBlockDraft[] = [];
  let codePoints = 0;
  for (const block of sorted) {
    const key = [
      block.kind,
      block.path.normalize("NFC"),
      canonicalText(block.heading ?? ""),
      canonicalText(block.text),
    ].join("\u0000");
    if (seen.has(key)) continue;
    const length = Array.from(block.text).length;
    if (
      result.length >= maximumBlocks ||
      codePoints + length > EVIDENCE_LIMITS.modelCodePoints
    ) {
      continue;
    }
    seen.add(key);
    result.push(block);
    codePoints += length;
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}

function canonicalEntryPayload(
  repository: EvidencePack["repository"],
  entryType: "fact" | "content-block",
  entry: EvidenceEntryDraft,
): string {
  const entryFields =
    entryType === "fact"
      ? (() => {
          const fact = entry as EvidenceFactDraft;
          return [
            fact.category,
            fact.kind,
            fact.label,
            fact.text,
            fact.path,
            fact.url,
            fact.trust,
            fact.retention,
          ];
        })()
      : (() => {
          const block = entry as EvidenceContentBlockDraft;
          return [
            block.kind,
            block.path,
            block.heading,
            block.text,
            block.startLine,
            block.endLine,
            block.trust,
          ];
        })();
  return JSON.stringify([
    EVIDENCE_ID_DOMAIN,
    EVIDENCE_SCHEMA_VERSION,
    repository.owner,
    repository.repo,
    repository.commitSha,
    entryType,
    ...entryFields,
  ]);
}

function evidenceEntryId(payload: string): string {
  return `evi-${createHash("sha256").update(payload, "utf8").digest("base64url")}`;
}

function registerEvidenceIdentity(
  seen: Map<string, string>,
  id: string,
  payload: string,
): void {
  const previous = seen.get(id);
  if (previous !== undefined) {
    if (previous !== payload) throw new TypeError("Evidence ID collision");
    throw new TypeError("Duplicate evidence identity");
  }
  seen.set(id, payload);
}

function identifyEntries(
  repository: EvidencePack["repository"],
  facts: readonly EvidenceFactDraft[],
  blocks: readonly EvidenceContentBlockDraft[],
): { facts: EvidenceFact[]; blocks: EvidenceContentBlock[] } {
  const seen = new Map<string, string>();
  const identifiedFacts = facts.map((fact) => {
    const payload = canonicalEntryPayload(repository, "fact", fact);
    const id = evidenceEntryId(payload);
    registerEvidenceIdentity(seen, id, payload);
    return { id, ...fact };
  });
  const identifiedBlocks = blocks.map((block) => {
    const payload = canonicalEntryPayload(repository, "content-block", block);
    const id = evidenceEntryId(payload);
    registerEvidenceIdentity(seen, id, payload);
    return { id, ...block };
  });
  return { facts: identifiedFacts, blocks: identifiedBlocks };
}

/** Builds a detached, canonical, deeply immutable pack from already-verified inputs. */
export function buildEvidencePack(input: BuildEvidencePackInput): EvidencePack {
  const facts: EvidenceFactDraft[] = [];
  const blockDrafts: EvidenceContentBlockDraft[] = [];
  let readmeSeen = false;
  let readmeComplete = true;

  addRepositoryFacts(input, facts);
  addDynamicFacts(input, facts);
  addAlternativeFacts(
    input.alternativesAvailable === false ? [] : (input.alternatives ?? []),
    facts,
  );

  for (const file of input.files) {
    const path = assertRepositoryPath(file.path);
    if (isCredentialShapedText(path)) continue;
    if (file.kind === "readme") {
      readmeSeen = true;
      const result = sanitizeReadmeForModel(file);
      if (!result.complete) readmeComplete = false;
      blockDrafts.push(...result.blocks);
    } else if (file.kind === "documentation") {
      blockDrafts.push(...sanitizeDocumentForModel(file).blocks);
    } else {
      blockDrafts.push(...extractManifestFacts(file));
    }
  }

  const canonicalFacts = canonicalizeFactsInSlotOrder(facts);
  const canonicalBlocks = sortAndDedupeBlocks(
    blockDrafts,
    EVIDENCE_LIMITS.totalEvidence,
  );
  const admittedReadmeBlocks = canonicalBlocks.filter(
    (block) => block.kind === "readme",
  ).length;
  const sourceReadmeBlocks = blockDrafts.filter(
    (block) => block.kind === "readme",
  ).length;
  if (admittedReadmeBlocks < sourceReadmeBlocks) readmeComplete = false;

  const acquiredAt = assertCanonicalTimestamp(input.acquiredAt);
  const repository = {
    owner: input.snapshot.repository.owner,
    repo: input.snapshot.repository.repo,
    commitSha: input.snapshot.commitSha,
  };
  const admittedFacts = [...canonicalFacts];
  const admittedBlocks = [...canonicalBlocks];
  const alternativesCoverage =
    input.alternativesAvailable === false || input.alternatives === undefined
      ? "unavailable"
      : "available";
  const assemblePack = (): EvidencePack => {
    const identified = identifyEntries(
      repository,
      admittedFacts,
      admittedBlocks,
    );
    const allReadmeAdmitted =
      admittedBlocks.filter((block) => block.kind === "readme").length ===
      sourceReadmeBlocks;
    return {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      repository,
      acquiredAt,
      facts: identified.facts,
      contentBlocks: identified.blocks,
      coverage: {
        readme: readmeSeen
          ? readmeComplete && allReadmeAdmitted
            ? "complete"
            : "partial"
          : "missing",
        alternatives: alternativesCoverage,
        treeComplete: input.snapshot.treeComplete,
      },
    };
  };

  let pack = assemblePack();
  while (
    admittedFacts.length + admittedBlocks.length >
      EVIDENCE_LIMITS.totalEvidence ||
    Array.from(serializeValidatedEvidencePack(pack)).length >
      EVIDENCE_LIMITS.serializedModelCodePoints
  ) {
    const removeLastFact = (
      predicate: (fact: EvidenceFactDraft) => boolean,
    ): boolean => {
      const index = admittedFacts.findLastIndex(predicate);
      if (index < 0) return false;
      admittedFacts.splice(index, 1);
      return true;
    };
    const removeLastBlock = (
      kind: EvidenceContentBlockDraft["kind"],
    ): boolean => {
      const index = admittedBlocks.findLastIndex(
        (block) => block.kind === kind,
      );
      if (index < 0) return false;
      admittedBlocks.splice(index, 1);
      return true;
    };

    const removed =
      removeLastFact((fact) => fact.retention === "live") ||
      removeLastBlock("documentation") ||
      removeLastFact((fact) => fact.kind === "documentation") ||
      removeLastBlock("manifest") ||
      removeLastFact((fact) => fact.kind === "manifest") ||
      removeLastFact(
        (fact) => fact.retention === "narrative" && fact.kind !== "readme",
      ) ||
      removeLastFact((fact) => fact.kind === "readme") ||
      removeLastBlock("readme");
    if (!removed) {
      throw new RangeError(
        "Evidence pack cannot fit the serialized model bound",
      );
    }
    pack = assemblePack();
  }
  serializeEvidencePackForModel(pack);
  return deepFreeze(structuredClone(pack));
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function invalidEvidence(message = "Invalid evidence pack"): never {
  throw new TypeError(message);
}

function strictDataSnapshot(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return invalidEvidence();
  try {
    const pending: Array<{ value: object; depth: number }> = [
      { value, depth: 0 },
    ];
    const seen = new WeakSet<object>();
    let nodes = 0;
    let properties = 0;
    let stringCodeUnits = 0;
    while (pending.length > 0) {
      const item = pending.pop();
      if (item === undefined) return invalidEvidence();
      const current = item.value;
      if (
        item.depth > SNAPSHOT_MAX_DEPTH ||
        nodeUtilTypes.isProxy(current) ||
        seen.has(current)
      ) {
        return invalidEvidence();
      }
      seen.add(current);
      nodes += 1;
      if (nodes > SNAPSHOT_MAX_NODES) return invalidEvidence();
      if (Array.isArray(current) && current.length > SNAPSHOT_MAX_PROPERTIES) {
        return invalidEvidence();
      }
      const prototype = Object.getPrototypeOf(current) as unknown;
      if (
        prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null
      ) {
        return invalidEvidence();
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string") return invalidEvidence();
        if (key === "length" && Array.isArray(current)) continue;
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor)
        ) {
          return invalidEvidence();
        }
        properties += 1;
        if (properties > SNAPSHOT_MAX_PROPERTIES) return invalidEvidence();
        const child = descriptor.value as unknown;
        if (typeof child === "function" || typeof child === "symbol") {
          return invalidEvidence();
        }
        if (typeof child === "string") {
          if (child.length > SNAPSHOT_MAX_STRING_CODE_UNITS) {
            return invalidEvidence();
          }
          stringCodeUnits += child.length;
          if (stringCodeUnits > SNAPSHOT_MAX_TOTAL_STRING_CODE_UNITS) {
            return invalidEvidence();
          }
        }
        if (typeof child === "object" && child !== null) {
          pending.push({ value: child, depth: item.depth + 1 });
        }
      }
    }
    return structuredClone(value);
  } catch {
    return invalidEvidence();
  }
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
): value is DataRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === requiredKeys.length &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function denseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const keys = Object.keys(value);
  return (
    keys.length === value.length &&
    keys.every((key, index) => key === String(index))
  );
}

function validatedPath(value: unknown): string {
  try {
    const path = assertRepositoryPath(value);
    if (isCredentialShapedText(path))
      return invalidEvidence("Unsafe evidence path");
    return path;
  } catch {
    return invalidEvidence("Unsafe evidence path");
  }
}

function validBlockText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const hasUnsafeControl = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 8) ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        (codePoint >= 127 && codePoint <= 159))
    );
  });
  return (
    value.trim().length > 0 &&
    Array.from(value).length <= EVIDENCE_LIMITS.blockCodePoints &&
    !UNSAFE_BLOCK_UNICODE_PATTERN.test(value) &&
    !hasUnsafeControl &&
    !RAW_TAG_PATTERN.test(value) &&
    !isCredentialShapedText(value)
  );
}

const EVIDENCE_KINDS = new Set<string>([
  "github",
  "readme",
  "documentation",
  "manifest",
  "tree",
  "alternative",
]);
const EVIDENCE_TRUST = new Set<string>([
  "observed",
  "repository-authored",
  "external-repository",
]);
const EVIDENCE_RETENTION = new Set<string>(["narrative", "live"]);
const EVIDENCE_FACT_CATEGORIES = new Set<EvidenceFactCategory>([
  "repository-identity",
  "authored-description",
  "authored-topics",
  "repository-live-state",
  "community-live-counts",
  "tree-observation",
  "file-source",
  "release-live-summary",
  "activity-live-summary",
  "alternative-description",
  "alternative-live-state",
]);
const CONTENT_KINDS = new Set<string>(["readme", "documentation", "manifest"]);

function canonicalJsonRecord(
  text: string,
  prefix: string,
  keys: readonly string[],
): DataRecord | null {
  if (!text.startsWith(prefix)) return null;
  const payload = text.slice(prefix.length);
  try {
    const parsed = JSON.parse(payload) as unknown;
    return exactRecord(parsed, keys) && JSON.stringify(parsed) === payload
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function validCanonicalCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validCanonicalTimestamp(value: unknown): value is string {
  try {
    return assertCanonicalTimestamp(value) === value;
  } catch {
    return false;
  }
}

function validCanonicalRepositoryState(text: string): boolean {
  const value = canonicalJsonRecord(text, "Repository state: ", [
    "archived",
    "defaultBranch",
    "pushedAt",
    "license",
  ]);
  return (
    value !== null &&
    typeof value.archived === "boolean" &&
    typeof value.defaultBranch === "string" &&
    safeFactText(value.defaultBranch, 255) === value.defaultBranch &&
    validCanonicalTimestamp(value.pushedAt) &&
    typeof value.license === "string" &&
    safeFactText(value.license, 128) === value.license
  );
}

function validCanonicalCommunityCounts(text: string): boolean {
  const value = canonicalJsonRecord(text, "Community counts: ", [
    "stars",
    "watchers",
    "forks",
    "openIssues",
  ]);
  return (
    value !== null &&
    validCanonicalCount(value.stars) &&
    validCanonicalCount(value.watchers) &&
    validCanonicalCount(value.forks) &&
    validCanonicalCount(value.openIssues)
  );
}

function validCanonicalTreeObservation(text: string): boolean {
  const value = canonicalJsonRecord(text, "Repository tree: ", [
    "filesObserved",
    "recursiveTreeComplete",
  ]);
  return (
    value !== null &&
    validCanonicalCount(value.filesObserved) &&
    typeof value.recursiveTreeComplete === "boolean"
  );
}

function validCanonicalReleaseSummary(text: string): boolean {
  if (
    text === 'Release summary: {"status":"not-acquired"}' ||
    text === 'Release summary: {"status":"unavailable"}'
  ) {
    return true;
  }
  const value = canonicalJsonRecord(text, "Release summary: ", [
    "status",
    "releasesObserved",
    "recent",
  ]);
  if (
    value === null ||
    value.status !== "available" ||
    !validCanonicalCount(value.releasesObserved) ||
    !denseArray(value.recent, 3)
  ) {
    return false;
  }
  return value.recent.every(
    (entry) =>
      exactRecord(entry, ["tag", "publishedAt", "prerelease"]) &&
      typeof entry.tag === "string" &&
      safeFactText(entry.tag, 64) === entry.tag &&
      validCanonicalTimestamp(entry.publishedAt) &&
      typeof entry.prerelease === "boolean",
  );
}

function validCanonicalActivitySummary(text: string): boolean {
  if (text === 'Recent activity: {"status":"not-acquired"}') return true;
  const value = canonicalJsonRecord(text, "Recent activity: ", [
    "status",
    "eventsScanned",
    "latestActivityAt",
    "counts",
  ]);
  if (
    value === null ||
    value.status !== "available" ||
    !validCanonicalCount(value.eventsScanned) ||
    (value.latestActivityAt !== null &&
      !validCanonicalTimestamp(value.latestActivityAt)) ||
    !exactRecord(value.counts, [
      "push",
      "issue",
      "pullRequest",
      "release",
      "other",
    ])
  ) {
    return false;
  }
  return [
    value.counts.push,
    value.counts.issue,
    value.counts.pullRequest,
    value.counts.release,
    value.counts.other,
  ].every(validCanonicalCount);
}

function validCanonicalTopics(text: string): boolean {
  if (!text.startsWith("Topics: ")) return false;
  const topics = text.slice("Topics: ".length).split(", ");
  if (topics.length < 1 || topics.length > 10) return false;
  const canonical = [...topics].sort((left, right) =>
    canonicalText(left).localeCompare(canonicalText(right), "en"),
  );
  return (
    new Set(topics.map(canonicalText)).size === topics.length &&
    topics.every((topic) => safeFactText(topic, 80) === topic) &&
    topics.every((topic, index) => topic === canonical[index])
  );
}

function validCanonicalAlternativeState(
  text: string,
  fullName: string,
): boolean {
  const value = canonicalJsonRecord(text, "Alternative state: ", [
    "repository",
    "stars",
    "forks",
    "watchers",
    "openIssues",
    "pushedAt",
    "archived",
    "license",
  ]);
  return (
    value !== null &&
    value.repository === fullName &&
    validCanonicalCount(value.stars) &&
    validCanonicalCount(value.forks) &&
    validCanonicalCount(value.watchers) &&
    validCanonicalCount(value.openIssues) &&
    validCanonicalTimestamp(value.pushedAt) &&
    typeof value.archived === "boolean" &&
    typeof value.license === "string" &&
    safeFactText(value.license, 128) === value.license
  );
}

function validatedAlternativeIdentity(value: string): {
  url: string;
  fullName: string;
} {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const owner = segments[0];
    const repo = segments[1];
    if (
      segments.length !== 2 ||
      owner === undefined ||
      repo === undefined ||
      !isValidEvidenceUrl(value, {
        kind: "alternative",
        repository: {
          owner: decodeURIComponent(owner),
          repo: decodeURIComponent(repo),
        },
      })
    ) {
      return invalidEvidence("Unsafe alternative URL");
    }
    return {
      url: value,
      fullName: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`,
    };
  } catch {
    return invalidEvidence("Unsafe alternative URL");
  }
}

function validatedFact(
  value: unknown,
  repository: EvidencePack["repository"],
): EvidenceFact {
  if (
    !exactRecord(value, [
      "id",
      "category",
      "kind",
      "label",
      "text",
      "path",
      "url",
      "trust",
      "retention",
    ]) ||
    typeof value.id !== "string" ||
    !EVIDENCE_ID_PATTERN.test(value.id) ||
    typeof value.category !== "string" ||
    !EVIDENCE_FACT_CATEGORIES.has(value.category as EvidenceFactCategory) ||
    typeof value.kind !== "string" ||
    !EVIDENCE_KINDS.has(value.kind) ||
    typeof value.label !== "string" ||
    safeFactText(value.label, 160) !== value.label ||
    typeof value.text !== "string" ||
    safeFactText(value.text) !== value.text ||
    typeof value.trust !== "string" ||
    !EVIDENCE_TRUST.has(value.trust) ||
    typeof value.retention !== "string" ||
    !EVIDENCE_RETENTION.has(value.retention)
  ) {
    return invalidEvidence("Unsafe evidence fact");
  }
  const category = value.category as EvidenceFactCategory;
  const kind = value.kind as EvidenceFact["kind"];
  const trust = value.trust as EvidenceFact["trust"];
  const retention = value.retention as EvidenceFact["retention"];
  const path = value.path === null ? null : validatedPath(value.path);
  const url = value.url;
  if (url !== null && typeof url !== "string") {
    return invalidEvidence("Unsafe evidence URL");
  }

  if (category === "file-source") {
    if (
      (kind !== "readme" && kind !== "documentation" && kind !== "manifest") ||
      path === null ||
      typeof url !== "string" ||
      trust !== "repository-authored" ||
      retention !== "narrative" ||
      value.label !== fileLabel(kind) ||
      !isValidEvidenceUrl(url, {
        kind: "primary-file",
        repository,
        commitSha: repository.commitSha,
        path,
      })
    ) {
      return invalidEvidence("Unsafe primary evidence URL");
    }
  } else if (category === "alternative-description") {
    const alternative =
      typeof url === "string" ? validatedAlternativeIdentity(url) : null;
    if (
      kind !== "alternative" ||
      path !== null ||
      typeof url !== "string" ||
      (trust !== "external-repository" && trust !== "observed") ||
      retention !== "narrative" ||
      alternative === null ||
      value.label !== `Alternative ${alternative.fullName} description` ||
      (trust === "observed"
        ? value.text !==
          `Repository ${alternative.fullName} has no safe description`
        : !value.text.startsWith(
            `Repository ${alternative.fullName} description: `,
          ))
    ) {
      return invalidEvidence("Unsafe alternative evidence fact");
    }
  } else if (category === "alternative-live-state") {
    const alternative =
      typeof url === "string" ? validatedAlternativeIdentity(url) : null;
    if (
      kind !== "alternative" ||
      path !== null ||
      typeof url !== "string" ||
      trust !== "observed" ||
      retention !== "live" ||
      alternative === null ||
      value.label !== `Alternative ${alternative.fullName} observed facts` ||
      !validCanonicalAlternativeState(value.text, alternative.fullName)
    ) {
      return invalidEvidence("Unsafe alternative evidence fact");
    }
  } else {
    if (path !== null || url !== null || trust === "external-repository") {
      return invalidEvidence("Unsafe repository evidence fact");
    }
    const validCategoryCombination =
      (category === "repository-identity" &&
        kind === "github" &&
        value.label === "Repository" &&
        value.text ===
          `Public repository: ${repository.owner}/${repository.repo}` &&
        trust === "observed" &&
        retention === "narrative") ||
      (category === "authored-description" &&
        kind === "github" &&
        value.label === "GitHub description" &&
        retention === "narrative" &&
        (trust !== "observed" ||
          value.text === "No safe GitHub description was observed")) ||
      (category === "authored-topics" &&
        kind === "github" &&
        value.label === "GitHub topics" &&
        retention === "narrative" &&
        (trust === "observed"
          ? value.text === "No safe GitHub topics were observed"
          : validCanonicalTopics(value.text))) ||
      (category === "repository-live-state" &&
        kind === "github" &&
        value.label === "Repository state" &&
        validCanonicalRepositoryState(value.text) &&
        trust === "observed" &&
        retention === "live") ||
      (category === "community-live-counts" &&
        kind === "github" &&
        value.label === "Community counts" &&
        validCanonicalCommunityCounts(value.text) &&
        trust === "observed" &&
        retention === "live") ||
      (category === "release-live-summary" &&
        kind === "github" &&
        value.label === "Release summary" &&
        validCanonicalReleaseSummary(value.text) &&
        trust === "observed" &&
        retention === "live") ||
      (category === "activity-live-summary" &&
        kind === "github" &&
        value.label === "Recent activity" &&
        validCanonicalActivitySummary(value.text) &&
        trust === "observed" &&
        retention === "live") ||
      (category === "tree-observation" &&
        kind === "tree" &&
        value.label === "Repository tree" &&
        validCanonicalTreeObservation(value.text) &&
        trust === "observed" &&
        retention === "narrative");
    if (!validCategoryCombination) {
      return invalidEvidence("Unsafe evidence fact category");
    }
  }

  return {
    id: value.id,
    category,
    kind,
    label: value.label,
    text: value.text,
    path,
    url,
    trust,
    retention,
  };
}

function validatedBlock(value: unknown): EvidenceContentBlock {
  if (
    !exactRecord(value, [
      "id",
      "kind",
      "path",
      "heading",
      "text",
      "startLine",
      "endLine",
      "trust",
    ]) ||
    typeof value.id !== "string" ||
    !EVIDENCE_ID_PATTERN.test(value.id) ||
    typeof value.kind !== "string" ||
    !CONTENT_KINDS.has(value.kind) ||
    (value.heading !== null &&
      (typeof value.heading !== "string" ||
        safeFactText(value.heading) !== value.heading)) ||
    !validBlockText(value.text) ||
    !Number.isSafeInteger(value.startLine) ||
    typeof value.startLine !== "number" ||
    value.startLine < 1 ||
    !Number.isSafeInteger(value.endLine) ||
    typeof value.endLine !== "number" ||
    value.endLine < value.startLine ||
    value.trust !== "repository-authored"
  ) {
    return invalidEvidence("Unsafe evidence content block");
  }
  return {
    id: value.id,
    kind: value.kind as EvidenceContentBlock["kind"],
    path: validatedPath(value.path),
    heading: value.heading,
    text: value.text,
    startLine: value.startLine,
    endLine: value.endLine,
    trust: "repository-authored",
  };
}

function assertEvidenceIdentities(pack: EvidencePack): void {
  const seen = new Map<string, string>();
  for (const fact of pack.facts) {
    const draft: EvidenceFactDraft = {
      category: fact.category,
      kind: fact.kind,
      label: fact.label,
      text: fact.text,
      path: fact.path,
      url: fact.url,
      trust: fact.trust,
      retention: fact.retention,
    };
    const payload = canonicalEntryPayload(pack.repository, "fact", draft);
    const expected = evidenceEntryId(payload);
    if (fact.id !== expected)
      return invalidEvidence("Evidence ID digest mismatch");
    registerEvidenceIdentity(seen, fact.id, payload);
  }
  for (const block of pack.contentBlocks) {
    const draft: EvidenceContentBlockDraft = {
      kind: block.kind,
      path: block.path,
      heading: block.heading,
      text: block.text,
      startLine: block.startLine,
      endLine: block.endLine,
      trust: block.trust,
    };
    const payload = canonicalEntryPayload(
      pack.repository,
      "content-block",
      draft,
    );
    const expected = evidenceEntryId(payload);
    if (block.id !== expected)
      return invalidEvidence("Evidence ID digest mismatch");
    registerEvidenceIdentity(seen, block.id, payload);
  }
}

function validatedEvidencePack(value: unknown): EvidencePack {
  const snapshot = strictDataSnapshot(value);
  if (
    !exactRecord(snapshot, [
      "schemaVersion",
      "repository",
      "acquiredAt",
      "facts",
      "contentBlocks",
      "coverage",
    ]) ||
    snapshot.schemaVersion !== EVIDENCE_SCHEMA_VERSION ||
    !exactRecord(snapshot.repository, ["owner", "repo", "commitSha"]) ||
    !exactRecord(snapshot.coverage, [
      "readme",
      "alternatives",
      "treeComplete",
    ]) ||
    !denseArray(snapshot.facts, EVIDENCE_LIMITS.totalEvidence) ||
    !denseArray(snapshot.contentBlocks, EVIDENCE_LIMITS.contentBlocks) ||
    snapshot.facts.length + snapshot.contentBlocks.length >
      EVIDENCE_LIMITS.totalEvidence
  ) {
    return invalidEvidence();
  }

  let owner: string;
  let repo: string;
  let acquiredAt: string;
  try {
    owner = assertRepositoryComponent(snapshot.repository.owner, "owner");
    repo = assertRepositoryComponent(snapshot.repository.repo, "repo");
    acquiredAt = assertCanonicalTimestamp(snapshot.acquiredAt);
  } catch {
    return invalidEvidence();
  }
  const commitSha = snapshot.repository.commitSha;
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/u.test(commitSha)) {
    return invalidEvidence();
  }
  const repository = { owner, repo, commitSha };
  const readme = snapshot.coverage.readme;
  const alternatives = snapshot.coverage.alternatives;
  const treeComplete = snapshot.coverage.treeComplete;
  if (
    (readme !== "complete" && readme !== "partial" && readme !== "missing") ||
    (alternatives !== "available" && alternatives !== "unavailable") ||
    typeof treeComplete !== "boolean"
  ) {
    return invalidEvidence();
  }

  const facts = snapshot.facts.map((fact) => validatedFact(fact, repository));
  const contentBlocks = snapshot.contentBlocks.map(validatedBlock);
  const hasReadmeEvidence =
    facts.some((fact) => fact.kind === "readme") ||
    contentBlocks.some((block) => block.kind === "readme");
  if (
    (readme === "missing") === hasReadmeEvidence ||
    (alternatives === "unavailable" &&
      facts.some((fact) => fact.kind === "alternative"))
  ) {
    return invalidEvidence("Inconsistent evidence coverage");
  }
  const blockCodePoints = contentBlocks.reduce(
    (total, block) => total + Array.from(block.text).length,
    0,
  );
  if (blockCodePoints > EVIDENCE_LIMITS.modelCodePoints) {
    return invalidEvidence("Evidence content exceeds the model bound");
  }
  const pack: EvidencePack = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    repository,
    acquiredAt,
    facts,
    contentBlocks,
    coverage: { readme, alternatives, treeComplete },
  };
  assertEvidenceIdentities(pack);
  return deepFreeze(pack);
}

/** The only model serializer; repository prose is JSON data inside explicit delimiters. */
export function serializeEvidencePackForModel(pack: unknown): string {
  const snapshot = validatedEvidencePack(pack);
  const serialized = serializeValidatedEvidencePack(snapshot);
  if (
    Array.from(serialized).length > EVIDENCE_LIMITS.serializedModelCodePoints
  ) {
    return invalidEvidence("Evidence serialization exceeds the model bound");
  }
  return serialized;
}

function serializeValidatedEvidencePack(snapshot: EvidencePack): string {
  const header = safeJson({
    schemaVersion: snapshot.schemaVersion,
    repository: snapshot.repository,
    acquiredAt: snapshot.acquiredAt,
    facts: snapshot.facts,
    coverage: snapshot.coverage,
  });
  const blocks = snapshot.contentBlocks.map(
    (block) =>
      `<<<BEGIN_UNTRUSTED_REPOSITORY_CONTENT id=${JSON.stringify(block.id)}>>>\n${safeJson(block)}\n<<<END_UNTRUSTED_REPOSITORY_CONTENT>>>`,
  );
  return [header, ...blocks].join("\n");
}
