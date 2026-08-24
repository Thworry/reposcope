import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "../analysis/project-brief-safety.js";
import {
  DEEP_CONFIDENCE,
  DEEP_ERROR_KINDS,
  DEEP_PROVENANCE,
  DEEP_REPORT_CAPS,
  DEEP_SPECIALIST_ROLES,
  DEEP_STAGES,
} from "./model.js";
import type {
  DeepAlternative,
  DeepAnalysisEvent,
  DeepAnalysisRequest,
  DeepAnalysisStage,
  DeepEvidence,
  DeepReport,
  DeepRepositoryIdentity,
  DeepSpecialistRole,
  DeepStatement,
} from "./model.js";

const EVIDENCE_KINDS: ReadonlySet<string> = new Set([
  "github",
  "readme",
  "documentation",
  "manifest",
  "tree",
  "alternative",
]);
const SPECIALIST_STATUSES = new Set(["started", "complete", "failed"]);
const LANGUAGES = new Set(["en", "zh-CN"]);
const MAX_GRAPH_NODES = 10_000;
const MAX_GRAPH_PROPERTIES = 50_000;
const MAX_PATH_CODE_POINTS = 1_024;
const MAX_LABEL_CODE_POINTS = 640;
const MAX_LICENSE_CODE_POINTS = 128;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/u;
const EVIDENCE_ID_PATTERN = /^ev-(?<number>\d{4})$/u;
const UNSAFE_CODE_POINT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u;

type DataRecord = Record<string, unknown>;

function sameDescriptor(
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor | undefined,
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    left.enumerable === right.enumerable &&
    left.configurable === right.configurable &&
    "value" in left &&
    "value" in right &&
    left.writable === right.writable &&
    Object.is(left.value, right.value)
  );
}

/** Returns a detached JSON-like data snapshot without invoking accessors. */
function strictDataSnapshot(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return null;

  const pending: unknown[] = [value];
  const seen = new WeakSet();
  let nodeCount = 0;
  let propertyCount = 0;

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (typeof current !== "object" || current === null) continue;
      if (seen.has(current)) return null;
      seen.add(current);

      nodeCount += 1;
      if (nodeCount > MAX_GRAPH_NODES) return null;

      const prototype = Object.getPrototypeOf(current) as unknown;
      if (
        prototype !== Object.prototype &&
        prototype !== Array.prototype &&
        prototype !== null
      ) {
        return null;
      }

      const descriptors = Object.getOwnPropertyDescriptors(current) as Record<
        PropertyKey,
        PropertyDescriptor | undefined
      >;
      const repeated = Object.getOwnPropertyDescriptors(current) as Record<
        PropertyKey,
        PropertyDescriptor | undefined
      >;
      const keys = Reflect.ownKeys(descriptors);
      const repeatedKeys = Reflect.ownKeys(repeated);
      if (
        keys.length !== repeatedKeys.length ||
        keys.some((key, index) => key !== repeatedKeys[index])
      ) {
        return null;
      }

      if (Array.isArray(current)) {
        const lengthDescriptor = descriptors["length"];
        const length =
          lengthDescriptor !== undefined && "value" in lengthDescriptor
            ? (lengthDescriptor.value as unknown)
            : null;
        if (
          typeof length !== "number" ||
          !Number.isSafeInteger(length) ||
          keys.length !== length + 1 ||
          !keys.includes("length")
        ) {
          return null;
        }
      }

      for (const key of keys) {
        if (typeof key !== "string") return null;
        const descriptor = descriptors[key];
        const repeatedDescriptor = repeated[key];
        if (!sameDescriptor(descriptor, repeatedDescriptor)) return null;

        if (key === "length" && Array.isArray(current)) {
          if (descriptor?.enumerable !== false) return null;
          continue;
        }
        if (descriptor?.enumerable !== true || !("value" in descriptor)) {
          return null;
        }

        propertyCount += 1;
        if (propertyCount > MAX_GRAPH_PROPERTIES) return null;
        const child = descriptor.value as unknown;
        if (typeof child === "function" || typeof child === "symbol") {
          return null;
        }
        if (typeof child === "string" && child.length > 8_192) return null;
        if (typeof child === "object" && child !== null) pending.push(child);
      }
    }

    return structuredClone(value);
  } catch {
    return null;
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
    requiredKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
}

function denseArray(
  value: unknown,
  cap: number,
  minimum = 0,
): value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > cap) {
    return false;
  }
  return Object.keys(value).every((key, index) => key === String(index));
}

function isSafeUnicode(value: string): boolean {
  return !UNSAFE_CODE_POINT_PATTERN.test(value);
}

function containsCredential(value: string): boolean {
  return (
    containsCredentialLikeValue(value) ||
    containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function safeText(value: unknown, cap: number): value is string {
  return (
    typeof value === "string" &&
    Array.from(value).length > 0 &&
    Array.from(value).length <= cap &&
    value.normalize("NFKC").replace(/\s+/gu, " ").trim().length > 0 &&
    isSafeUnicode(value) &&
    !containsCredential(value)
  );
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(?<seconds>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(?<fraction>\d{1,3}))?Z$/u.exec(
      value,
    );
  const seconds = match?.groups?.seconds;
  const fraction = match?.groups?.fraction ?? "";
  const parsed = Date.parse(value);
  return (
    seconds !== undefined &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === `${seconds}.${fraction.padEnd(3, "0")}Z`
  );
}

function validOwner(value: unknown): value is string {
  return (
    typeof value === "string" &&
    OWNER_PATTERN.test(value) &&
    !containsCredential(value)
  );
}

function validRepositoryName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    REPOSITORY_PATTERN.test(value) &&
    value !== "." &&
    value !== ".." &&
    !/\.git$/iu.test(value) &&
    !containsCredential(value)
  );
}

function validRepoRef(
  value: unknown,
): value is { owner: string; repo: string } {
  return (
    exactRecord(value, ["owner", "repo"]) &&
    validOwner(value.owner) &&
    validRepositoryName(value.repo)
  );
}

function validRepositoryIdentity(
  value: unknown,
): value is DeepRepositoryIdentity {
  return (
    exactRecord(value, ["owner", "repo", "commitSha"]) &&
    validOwner(value.owner) &&
    validRepositoryName(value.repo) &&
    typeof value.commitSha === "string" &&
    SHA_PATTERN.test(value.commitSha)
  );
}

function identityKey(value: { owner: string; repo: string }): string {
  return `${value.owner.toLocaleLowerCase("en-US")}/${value.repo.toLocaleLowerCase("en-US")}`;
}

function validPath(value: unknown): value is string {
  return (
    isSafeProjectBriefPath(value) &&
    value === value.normalize("NFKC") &&
    Array.from(value).length <= MAX_PATH_CODE_POINTS &&
    isSafeUnicode(value) &&
    !containsCredential(value)
  );
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function canonicalRepositoryUrl(repository: {
  owner: string;
  repo: string;
}): string {
  return `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
}

function validEvidenceUrl(
  value: unknown,
  evidence: Pick<DeepEvidence, "kind" | "path">,
  repository: DeepRepositoryIdentity,
  alternativeUrls: ReadonlyMap<string, string>,
): value is string | null {
  if (value === null) return true;
  if (
    typeof value !== "string" ||
    !isSafeUnicode(value) ||
    containsCredential(value)
  ) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return false;
  }

  if (evidence.kind === "alternative") {
    if (evidence.path !== null || value.endsWith("/")) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return false;
    let owner: string;
    let repo: string;
    try {
      owner = decodeURIComponent(segments[0] ?? "");
      repo = decodeURIComponent(segments[1] ?? "");
    } catch {
      return false;
    }
    return (
      validOwner(owner) &&
      validRepositoryName(repo) &&
      alternativeUrls.get(identityKey({ owner, repo })) === value &&
      value === canonicalRepositoryUrl({ owner, repo })
    );
  }

  if (evidence.path === null) {
    return value === canonicalRepositoryUrl(repository);
  }
  return (
    validPath(evidence.path) &&
    value ===
      `${canonicalRepositoryUrl(repository)}/blob/${repository.commitSha}/${encodePath(evidence.path)}`
  );
}

interface ReportValidationContext {
  evidenceIds: ReadonlySet<string>;
  evidenceById: ReadonlyMap<string, DeepEvidence>;
  statementTexts: Set<string>;
}

function validStatement(
  value: unknown,
  context: ReportValidationContext,
): value is DeepStatement {
  if (
    !exactRecord(value, ["text", "provenance", "confidence", "evidenceIds"]) ||
    !safeText(value.text, DEEP_REPORT_CAPS.textCodePoints) ||
    typeof value.provenance !== "string" ||
    !DEEP_PROVENANCE.includes(value.provenance as never) ||
    typeof value.confidence !== "string" ||
    !DEEP_CONFIDENCE.includes(value.confidence as never) ||
    !denseArray(value.evidenceIds, 6)
  ) {
    return false;
  }

  const normalizedText = canonicalText(value.text);
  if (context.statementTexts.has(normalizedText)) return false;
  context.statementTexts.add(normalizedText);

  const references = value.evidenceIds;
  const seen = new Set<string>();
  for (const reference of references) {
    if (
      typeof reference !== "string" ||
      !context.evidenceIds.has(reference) ||
      seen.has(reference)
    ) {
      return false;
    }
    seen.add(reference);
  }

  if (value.provenance === "unknown") {
    return value.confidence === "low";
  }
  return references.length >= 1;
}

function validStatementList(
  value: unknown,
  context: ReportValidationContext,
  cap: number = DEEP_REPORT_CAPS.statementsPerList,
  minimum: number = 0,
): value is DeepStatement[] {
  return (
    denseArray(value, cap, minimum) &&
    value.every((statement) => validStatement(statement, context))
  );
}

function validOptionalTimestamp(value: unknown): value is string | null {
  return value === null || validIsoTimestamp(value);
}

function validCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_SAFE_INTEGER
  );
}

function validLicense(value: unknown): value is string | null {
  return value === null || safeText(value, MAX_LICENSE_CODE_POINTS);
}

function validCommunity(value: unknown): boolean {
  return (
    exactRecord(value, [
      "stars",
      "forks",
      "watchers",
      "openIssues",
      "pushedAt",
      "archived",
      "license",
    ]) &&
    validCount(value.stars) &&
    validCount(value.forks) &&
    validCount(value.watchers) &&
    validCount(value.openIssues) &&
    validOptionalTimestamp(value.pushedAt) &&
    typeof value.archived === "boolean" &&
    validLicense(value.license)
  );
}

function validAlternative(
  value: unknown,
  context: ReportValidationContext,
  primary: DeepRepositoryIdentity,
  seen: Set<string>,
): value is DeepAlternative {
  if (
    !exactRecord(value, ["repository", "github", "whyCompare"]) ||
    !validRepoRef(value.repository) ||
    !validCommunity(value.github)
  ) {
    return false;
  }
  const key = identityKey(value.repository);
  if (key === identityKey(primary) || seen.has(key)) return false;
  seen.add(key);
  if (!validStatement(value.whyCompare, context)) return false;
  const repositoryUrl = canonicalRepositoryUrl(value.repository);
  return value.whyCompare.evidenceIds.some((id) => {
    const evidence = context.evidenceById.get(id);
    return evidence?.kind === "alternative" && evidence.url === repositoryUrl;
  });
}

function validEvidence(
  value: unknown,
  index: number,
  repository: DeepRepositoryIdentity,
  alternativeUrls: ReadonlyMap<string, string>,
): value is DeepEvidence {
  if (
    !exactRecord(value, ["id", "kind", "label", "path", "url"]) ||
    typeof value.id !== "string" ||
    typeof value.kind !== "string" ||
    !EVIDENCE_KINDS.has(value.kind) ||
    !safeText(value.label, MAX_LABEL_CODE_POINTS) ||
    (value.path !== null && !validPath(value.path))
  ) {
    return false;
  }
  if (
    (value.kind === "github" && value.path !== null) ||
    ((value.kind === "readme" ||
      value.kind === "documentation" ||
      value.kind === "manifest") &&
      value.path === null) ||
    (value.kind === "alternative" &&
      (value.path !== null || value.url === null))
  ) {
    return false;
  }
  const match = EVIDENCE_ID_PATTERN.exec(value.id);
  if (
    match?.groups?.number === undefined ||
    Number(match.groups.number) !== index + 1
  ) {
    return false;
  }
  return validEvidenceUrl(
    value.url,
    { kind: value.kind as DeepEvidence["kind"], path: value.path },
    repository,
    alternativeUrls,
  );
}

function validReportSnapshot(value: unknown): value is DeepReport {
  if (
    !exactRecord(value, [
      "schemaVersion",
      "repository",
      "language",
      "generatedAt",
      "review",
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
      "disagreements",
      "nextChecks",
      "finalVerdict",
      "evidence",
    ]) ||
    value.schemaVersion !== "1.0.0" ||
    !validRepositoryIdentity(value.repository) ||
    typeof value.language !== "string" ||
    !LANGUAGES.has(value.language) ||
    !validIsoTimestamp(value.generatedAt) ||
    !exactRecord(value.review, ["coverage", "capabilityClass"]) ||
    (value.review.coverage !== "full" && value.review.coverage !== "reduced") ||
    (value.review.capabilityClass !== "auto" &&
      value.review.capabilityClass !== "multi-model") ||
    !denseArray(value.evidence, DEEP_REPORT_CAPS.evidence) ||
    !denseArray(value.alternatives, DEEP_REPORT_CAPS.alternatives)
  ) {
    return false;
  }

  const alternativesSeen = new Set<string>();
  const alternativeUrls = new Map<string, string>();
  for (const alternative of value.alternatives) {
    if (
      !exactRecord(alternative, ["repository", "github", "whyCompare"]) ||
      !validRepoRef(alternative.repository)
    ) {
      return false;
    }
    const key = identityKey(alternative.repository);
    if (key === identityKey(value.repository) || alternativesSeen.has(key))
      return false;
    alternativesSeen.add(key);
    alternativeUrls.set(key, canonicalRepositoryUrl(alternative.repository));
  }

  const evidenceIds = new Set<string>();
  const evidenceById = new Map<string, DeepEvidence>();
  for (let index = 0; index < value.evidence.length; index += 1) {
    const evidence = value.evidence[index];
    if (
      !validEvidence(evidence, index, value.repository, alternativeUrls) ||
      evidenceIds.has(evidence.id)
    ) {
      return false;
    }
    evidenceIds.add(evidence.id);
    evidenceById.set(evidence.id, evidence);
  }

  const context: ReportValidationContext = {
    evidenceIds,
    evidenceById,
    statementTexts: new Set<string>(),
  };

  if (
    !exactRecord(value.orientation, ["summary", "verdict"]) ||
    !validStatementList(value.orientation.summary, context) ||
    !validStatement(value.orientation.verdict, context) ||
    !exactRecord(value.fit, ["goodFor", "poorFor"]) ||
    !validStatementList(value.fit.goodFor, context) ||
    !validStatementList(value.fit.poorFor, context) ||
    !validStatementList(value.situations, context) ||
    !denseArray(value.capabilities, DEEP_REPORT_CAPS.capabilityGroups)
  ) {
    return false;
  }
  for (const group of value.capabilities) {
    if (
      !exactRecord(group, ["title", "items"]) ||
      !validStatement(group.title, context) ||
      !validStatementList(
        group.items,
        context,
        DEEP_REPORT_CAPS.capabilityStatements,
      )
    ) {
      return false;
    }
  }

  if (
    !validStatementList(value.workflow, context, DEEP_REPORT_CAPS.workflow) ||
    !exactRecord(value.architecture, ["summary", "technologies", "concepts"]) ||
    !validStatementList(value.architecture.summary, context) ||
    !validStatementList(value.architecture.technologies, context) ||
    !validStatementList(value.architecture.concepts, context) ||
    !exactRecord(value.onboarding, [
      "prerequisites",
      "install",
      "run",
      "develop",
      "cautions",
    ]) ||
    !validStatementList(value.onboarding.prerequisites, context) ||
    !validStatementList(value.onboarding.install, context) ||
    !validStatementList(value.onboarding.run, context) ||
    !validStatementList(value.onboarding.develop, context) ||
    !validStatementList(value.onboarding.cautions, context) ||
    !exactRecord(value.trust, [
      "reliability",
      "security",
      "privacy",
      "unknowns",
    ]) ||
    !validStatementList(value.trust.reliability, context) ||
    !validStatementList(value.trust.security, context) ||
    !validStatementList(value.trust.privacy, context) ||
    !validStatementList(value.trust.unknowns, context) ||
    !value.trust.unknowns.every(
      (statement) => statement.provenance === "unknown",
    ) ||
    !exactRecord(value.maintenance, ["summary", "signals", "community"]) ||
    !validStatementList(value.maintenance.summary, context) ||
    !validStatementList(value.maintenance.signals, context) ||
    !validCommunity(value.maintenance.community)
  ) {
    return false;
  }

  const validatedAlternatives = new Set<string>();
  for (const alternative of value.alternatives) {
    if (
      !validAlternative(
        alternative,
        context,
        value.repository,
        validatedAlternatives,
      )
    ) {
      return false;
    }
  }

  return (
    validStatementList(
      value.disagreements,
      context,
      DEEP_REPORT_CAPS.disagreements,
      0,
    ) &&
    validStatementList(value.nextChecks, context) &&
    exactRecord(value.finalVerdict, ["decision", "summary"]) &&
    (value.finalVerdict.decision === "worth-trying" ||
      value.finalVerdict.decision === "compare-first" ||
      value.finalVerdict.decision === "not-enough-evidence") &&
    validStatement(value.finalVerdict.summary, context)
  );
}

function validRequestSnapshot(value: unknown): value is DeepAnalysisRequest {
  return (
    exactRecord(value, ["repository", "language"]) &&
    validRepositoryIdentity(value.repository) &&
    typeof value.language === "string" &&
    LANGUAGES.has(value.language)
  );
}

function validEventSnapshot(value: unknown): value is DeepAnalysisEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const typeDescriptor = Object.getOwnPropertyDescriptor(value, "type");
  if (typeDescriptor === undefined || !("value" in typeDescriptor))
    return false;
  const type = typeDescriptor.value as unknown;
  if (type === "stage") {
    return (
      exactRecord(value, ["type", "stage"]) &&
      typeof value.stage === "string" &&
      DEEP_STAGES.includes(value.stage as DeepAnalysisStage)
    );
  }
  if (type === "specialist") {
    return (
      exactRecord(value, ["type", "role", "status"]) &&
      typeof value.role === "string" &&
      DEEP_SPECIALIST_ROLES.includes(value.role as DeepSpecialistRole) &&
      typeof value.status === "string" &&
      SPECIALIST_STATUSES.has(value.status)
    );
  }
  if (type === "complete") {
    return (
      exactRecord(value, ["type", "report"]) &&
      validReportSnapshot(value.report)
    );
  }
  if (type === "error") {
    return (
      exactRecord(value, ["type", "error"]) &&
      exactRecord(value.error, ["kind"]) &&
      typeof value.error.kind === "string" &&
      DEEP_ERROR_KINDS.includes(value.error.kind as never)
    );
  }
  return false;
}

export function isDeepAnalysisRequest(
  value: unknown,
): value is DeepAnalysisRequest {
  const snapshot = strictDataSnapshot(value);
  return snapshot !== null && validRequestSnapshot(snapshot);
}

export function isDeepReport(value: unknown): value is DeepReport {
  const snapshot = strictDataSnapshot(value);
  return snapshot !== null && validReportSnapshot(snapshot);
}

export function isDeepAnalysisEvent(
  value: unknown,
): value is DeepAnalysisEvent {
  const snapshot = strictDataSnapshot(value);
  return snapshot !== null && validEventSnapshot(snapshot);
}

export function reportMatchesDeepRequest(
  report: unknown,
  request: unknown,
): report is DeepReport {
  const reportSnapshot = strictDataSnapshot(report);
  const requestSnapshot = strictDataSnapshot(request);
  if (
    reportSnapshot === null ||
    requestSnapshot === null ||
    !validReportSnapshot(reportSnapshot) ||
    !validRequestSnapshot(requestSnapshot)
  ) {
    return false;
  }
  return (
    identityKey(reportSnapshot.repository) ===
      identityKey(requestSnapshot.repository) &&
    reportSnapshot.repository.commitSha ===
      requestSnapshot.repository.commitSha &&
    reportSnapshot.language === requestSnapshot.language
  );
}

type SpecialistState = "not-started" | "started" | "complete" | "failed";

/** Stateful validator for one deep-analysis event stream. */
export class DeepEventSequenceGuard {
  readonly #request: DeepAnalysisRequest | null;
  readonly #specialists = new Map<DeepSpecialistRole, SpecialistState>(
    DEEP_SPECIALIST_ROLES.map((role) => [role, "not-started"]),
  );
  #stageIndex = -1;
  #terminal = false;

  constructor(request?: DeepAnalysisRequest) {
    if (request === undefined) {
      this.#request = null;
      return;
    }
    const snapshot = strictDataSnapshot(request);
    if (snapshot === null || !validRequestSnapshot(snapshot)) {
      throw new TypeError("Invalid deep-analysis request");
    }
    this.#request = snapshot;
  }

  get terminated(): boolean {
    return this.#terminal;
  }

  finish(): boolean {
    return this.#terminal;
  }

  accept(value: unknown): value is DeepAnalysisEvent {
    if (this.#terminal) return false;
    const snapshot = strictDataSnapshot(value);
    if (snapshot === null || !validEventSnapshot(snapshot)) return false;

    if (snapshot.type === "error") {
      this.#terminal = true;
      return true;
    }

    if (snapshot.type === "stage") {
      const nextIndex = DEEP_STAGES.indexOf(snapshot.stage);
      if (
        (this.#stageIndex === -1 && nextIndex !== 0) ||
        (this.#stageIndex >= 0 && nextIndex <= this.#stageIndex)
      ) {
        return false;
      }
      if (
        this.#stageIndex === DEEP_STAGES.indexOf("consulting-specialists") &&
        nextIndex > DEEP_STAGES.indexOf("consulting-specialists") &&
        [...this.#specialists.values()].some(
          (state) => state !== "complete" && state !== "failed",
        )
      ) {
        return false;
      }
      this.#stageIndex = nextIndex;
      return true;
    }

    if (snapshot.type === "specialist") {
      if (this.#stageIndex !== DEEP_STAGES.indexOf("consulting-specialists")) {
        return false;
      }
      const current = this.#specialists.get(snapshot.role);
      if (snapshot.status === "started") {
        if (current !== "not-started") return false;
      } else if (current !== "started") {
        return false;
      }
      this.#specialists.set(snapshot.role, snapshot.status);
      return true;
    }

    if (
      this.#stageIndex !== DEEP_STAGES.length - 1 ||
      (this.#request !== null &&
        !reportMatchesDeepRequest(snapshot.report, this.#request))
    ) {
      return false;
    }
    this.#terminal = true;
    return true;
  }
}
