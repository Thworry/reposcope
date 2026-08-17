import {
  PROJECT_BRIEF_CAUTIONS,
  PROJECT_KINDS,
  READER_COMMAND_KINDS,
  READER_ECOSYSTEMS,
  READER_SIGNAL_IDS,
} from "./model";
import {
  containsCredentialLikeValue,
  isSafeProjectBriefPath,
} from "./project-brief-safety";
import type {
  AnalysisReport,
  DimensionKey,
  FileReference,
  LocalizedDescriptor,
  ProjectBrief,
  ProjectKind,
  ReaderCommandFact,
  ReaderEcosystem,
  ReaderReport,
  ReaderSignalFact,
  ReaderSignalId,
  ReaderTextFact,
  RuleResult,
} from "./model";
import {
  activityBand,
  activityState,
  deriveReaderAvailability,
  deriveReaderQuestions,
  deriveReliabilityStatus,
} from "./reader-report-policy";
import { toPathComparisonKey } from "../scanner/file-registry";
import { buildFindings } from "../rules/findings";
import { calculateConfidence } from "../rules/confidence";
import {
  DIMENSION_WEIGHTS,
  RULE_IDS,
  RULESET_VERSION,
  overallLabel,
  scoreRule,
  type RuleId,
} from "../rules/rules";

const DIMENSIONS = Object.freeze(
  Object.keys(DIMENSION_WEIGHTS) as DimensionKey[],
);
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu;
const KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const ARGUMENT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;
const PROJECT_BRIEF_EXCERPT_SOURCE_SEQUENCES: readonly string[] = Object.freeze(
  [
    "",
    "github-description",
    "readme",
    "readme,readme",
    "github-description,readme",
  ],
);
const RULE_ID_SET: ReadonlySet<string> = new Set(RULE_IDS);
const RULE_MAXIMUMS: Readonly<Record<RuleId, number>> = Object.fromEntries(
  RULE_IDS.map((id) => [id, scoreRule(id, {}).available]),
) as Readonly<Record<RuleId, number>>;
const ZERO_POINT_PARTIAL_RULE_IDS: ReadonlySet<RuleId> = new Set([
  "maintenance.generated-directories",
]);
const SECURITY_READER_SIGNAL_IDS = [
  "license",
  "security-policy",
  "configuration",
] as const satisfies readonly ReaderSignalId[];
const MAINTENANCE_READER_SIGNAL_IDS = [
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
] as const satisfies readonly ReaderSignalId[];
const NON_METADATA_READER_SIGNAL_IDS = READER_SIGNAL_IDS.filter(
  (signal) => signal !== "archived" && signal !== "recent-activity",
);
const READER_KIND_PRECEDENCE = [
  "application",
  "command-line-tool",
  "library",
  "plugin",
  "template",
  "documentation",
] as const satisfies readonly ProjectKind[];
const READER_KIND_TERMS: Readonly<Record<ProjectKind, string>> = Object.freeze({
  application: "application",
  "command-line-tool": "cli",
  library: "library",
  plugin: "plugin",
  template: "template",
  documentation: "documentation",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);

  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function finiteInteger(value: unknown, minimum = 0, maximum = 100): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function finiteNumber(value: unknown, minimum = 0, maximum = 100): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function safeString(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!allowEmpty && value.length === 0)
  ) {
    return false;
  }

  for (const character of value) {
    const point = character.codePointAt(0);

    if (
      point === undefined ||
      point === 0 ||
      point <= 31 ||
      (point >= 127 && point <= 159) ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      return false;
    }
  }

  return true;
}

function validIso(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

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

function validComponent(value: unknown): value is string {
  return (
    safeString(value, 100) &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\s]/u.test(value)
  );
}

function validPath(value: unknown): value is string {
  return isSafeProjectBriefPath(value);
}

function hasDirectionalOrLineControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const point = character.codePointAt(0);

    return (
      point === 0x061c ||
      point === 0x200e ||
      point === 0x200f ||
      point === 0x2028 ||
      point === 0x2029 ||
      (point !== undefined && point >= 0x202a && point <= 0x202e) ||
      (point !== undefined && point >= 0x2066 && point <= 0x2069)
    );
  });
}

function validProjectBriefText(value: unknown): value is string {
  return (
    safeString(value, 960) &&
    Array.from(value).length <= 480 &&
    !hasDirectionalOrLineControl(value) &&
    !containsCredentialLikeValue(value)
  );
}

function validProjectBrief(value: unknown): value is ProjectBrief {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["excerpts", "kinds", "cautions"]) ||
    !Array.isArray(value.excerpts) ||
    value.excerpts.length > 2 ||
    !Array.isArray(value.kinds) ||
    value.kinds.length > 3 ||
    !Array.isArray(value.cautions) ||
    value.cautions.length > PROJECT_BRIEF_CAUTIONS.length
  ) {
    return false;
  }

  let combinedCodePoints = 0;
  const excerptSources: string[] = [];
  for (const excerpt of value.excerpts) {
    if (
      !isRecord(excerpt) ||
      !exactKeys(excerpt, ["source", "text", "path"]) ||
      !validProjectBriefText(excerpt.text)
    ) {
      return false;
    }
    if (
      (excerpt.source === "github-description" && excerpt.path !== null) ||
      (excerpt.source === "readme" && !validPath(excerpt.path)) ||
      (excerpt.source !== "github-description" && excerpt.source !== "readme")
    ) {
      return false;
    }
    excerptSources.push(excerpt.source);
    combinedCodePoints += Array.from(excerpt.text).length;
  }
  if (
    combinedCodePoints > 800 ||
    !PROJECT_BRIEF_EXCERPT_SOURCE_SEQUENCES.includes(excerptSources.join(","))
  ) {
    return false;
  }

  let previousKind = -1;
  for (const fact of value.kinds) {
    if (!isRecord(fact) || !exactKeys(fact, ["kind", "source", "path"])) {
      return false;
    }
    const kindIndex = PROJECT_KINDS.indexOf(
      fact.kind as (typeof PROJECT_KINDS)[number],
    );
    const source = fact.source;
    const pathValid =
      source === "manifest" || source === "tree"
        ? validPath(fact.path)
        : (source === "github-metadata" || source === "analysis") &&
          fact.path === null;

    if (kindIndex <= previousKind || !pathValid) return false;
    previousKind = kindIndex;
  }

  let previousCaution = -1;
  for (const fact of value.cautions) {
    if (
      !isRecord(fact) ||
      !exactKeys(fact, ["caution", "source", "path"]) ||
      fact.path !== null
    ) {
      return false;
    }
    const cautionIndex = PROJECT_BRIEF_CAUTIONS.indexOf(
      fact.caution as (typeof PROJECT_BRIEF_CAUTIONS)[number],
    );
    const sourceValid =
      fact.caution === "archived"
        ? fact.source === "github-metadata"
        : fact.source === "analysis";

    if (cautionIndex <= previousCaution || !sourceValid) return false;
    previousCaution = cautionIndex;
  }

  return true;
}

function canonicalReaderText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function validReaderPath(value: unknown): value is string {
  return (
    validPath(value) &&
    !hasDirectionalOrLineControl(value) &&
    !containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function validReaderText(value: unknown): value is string {
  return (
    safeString(value, 960) &&
    Array.from(value).length <= 480 &&
    canonicalReaderText(value).length > 0 &&
    !hasDirectionalOrLineControl(value) &&
    !containsCredentialLikeValue(value) &&
    !containsCredentialLikeValue(value.normalize("NFKC"))
  );
}

function validReaderTextFact(
  value: unknown,
  sources: ReadonlySet<string>,
): value is ReaderTextFact {
  return (
    isRecord(value) &&
    exactKeys(value, ["source", "path", "text"]) &&
    typeof value.source === "string" &&
    sources.has(value.source) &&
    validReaderPath(value.path) &&
    validReaderText(value.text)
  );
}

function validReaderTextFacts(
  value: unknown,
  cap: number,
  sources: ReadonlySet<string>,
): value is ReaderTextFact[] {
  if (!Array.isArray(value) || value.length > cap) return false;

  const seen = new Set<string>();
  for (const fact of value) {
    if (!validReaderTextFact(fact, sources)) return false;
    const key = canonicalReaderText(fact.text);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function validReaderSignalFact(
  value: unknown,
  signal: ReaderSignalId,
): value is ReaderSignalFact {
  const metadata = signal === "archived" || signal === "recent-activity";

  return (
    isRecord(value) &&
    exactKeys(value, ["signal", "state", "source", "path"]) &&
    value.signal === signal &&
    typeof value.state === "string" &&
    ["present", "absent", "unknown"].includes(value.state) &&
    value.source === (metadata ? "github-metadata" : "analysis") &&
    value.path === null
  );
}

function validCanonicalReaderSignals(
  value: unknown,
): value is ReaderSignalFact[] {
  return (
    Array.isArray(value) &&
    value.length === READER_SIGNAL_IDS.length &&
    READER_SIGNAL_IDS.every((signal, index) =>
      validReaderSignalFact(value[index], signal),
    )
  );
}

function equalReaderSignal(
  left: ReaderSignalFact,
  right: ReaderSignalFact,
): boolean {
  return (
    left.signal === right.signal &&
    left.state === right.state &&
    left.source === right.source &&
    left.path === right.path
  );
}

function validReaderSignalSubset(
  value: unknown,
  signals: readonly ReaderSignalFact[],
  ids: readonly ReaderSignalId[],
): value is ReaderSignalFact[] {
  const facts: unknown[] = Array.isArray(value) ? value : [];
  return (
    Array.isArray(value) &&
    value.length === ids.length &&
    ids.every((id, index) => {
      const fact: unknown = facts[index];
      const canonical = signals.find(({ signal }) => signal === id);
      return (
        canonical !== undefined &&
        validReaderSignalFact(fact, id) &&
        equalReaderSignal(fact, canonical)
      );
    })
  );
}

function validReaderCommand(value: unknown): value is ReaderCommandFact {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["source", "path", "kind", "command", "disposition"]) ||
    (value.source !== "readme" &&
      value.source !== "documentation" &&
      value.source !== "manifest") ||
    !validReaderPath(value.path) ||
    !READER_COMMAND_KINDS.includes(
      value.kind as (typeof READER_COMMAND_KINDS)[number],
    ) ||
    typeof value.disposition !== "string" ||
    !["ready", "review", "withheld"].includes(value.disposition)
  ) {
    return false;
  }

  if (value.command === null) return value.disposition === "withheld";
  return (
    value.disposition !== "withheld" &&
    safeString(value.command, 320) &&
    Array.from(value.command).length <= 160 &&
    value.command.trim().length > 0 &&
    !hasDirectionalOrLineControl(value.command) &&
    !containsCredentialLikeValue(value.command) &&
    !containsCredentialLikeValue(value.command.normalize("NFKC"))
  );
}

function validReaderCommands(value: unknown): value is ReaderCommandFact[] {
  if (!Array.isArray(value) || value.length > READER_COMMAND_KINDS.length) {
    return false;
  }

  let previous = -1;
  for (const command of value) {
    if (!validReaderCommand(command)) return false;
    const index = READER_COMMAND_KINDS.indexOf(command.kind);
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function compareReaderPath(left: string, right: string): number {
  const leftKey = toPathComparisonKey(left);
  const rightKey = toPathComparisonKey(right);

  return (
    (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) ||
    Number(right === rightKey) - Number(left === leftKey) ||
    (left < right ? -1 : left > right ? 1 : 0)
  );
}

function validSortedReaderPaths(
  value: unknown,
  cap: number,
): value is string[] {
  if (!Array.isArray(value) || value.length > cap) return false;

  let previous: string | undefined;
  const seen = new Set<string>();
  for (const path of value) {
    if (!validReaderPath(path)) return false;
    const key = toPathComparisonKey(path);
    if (
      seen.has(key) ||
      (previous !== undefined && compareReaderPath(previous, path) >= 0)
    ) {
      return false;
    }
    seen.add(key);
    previous = path;
  }
  return true;
}

function validReaderEcosystems(value: unknown): value is ReaderEcosystem[] {
  if (!Array.isArray(value) || value.length > READER_ECOSYSTEMS.length) {
    return false;
  }

  let previous = -1;
  for (const ecosystem of value) {
    const index = READER_ECOSYSTEMS.indexOf(
      ecosystem as (typeof READER_ECOSYSTEMS)[number],
    );
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

function validReaderAlternatives(
  value: unknown,
  repository: AnalysisReport["repository"],
  projectBrief: ProjectBrief,
  unavailableFallback: boolean,
): boolean {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["searchTerms"]) ||
    !Array.isArray(value.searchTerms)
  ) {
    return false;
  }

  const kinds = new Set(projectBrief.kinds.map(({ kind }) => kind));
  const kind = READER_KIND_PRECEDENCE.find((candidate) => kinds.has(candidate));
  const kindTerm = kind === undefined ? undefined : READER_KIND_TERMS[kind];
  const terms: unknown[] = value.searchTerms;
  const topicStart = kindTerm === undefined ? 0 : 1;

  if (unavailableFallback && terms.length === 0) return true;
  if (
    terms.length > topicStart + 3 ||
    (kindTerm !== undefined && terms[0] !== kindTerm)
  ) {
    return false;
  }

  const repositoryName = repository.repo
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  const represented = new Set(
    kind === undefined || kindTerm === undefined ? [] : [kind, kindTerm],
  );
  let previous: string | undefined;
  for (let index = topicStart; index < terms.length; index += 1) {
    const term: unknown = terms[index];
    if (
      typeof term !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,49}$/u.test(term) ||
      term !== term.normalize("NFKC").toLocaleLowerCase("en-US") ||
      represented.has(term) ||
      term === repositoryName ||
      containsCredentialLikeValue(term) ||
      (previous !== undefined && previous >= term)
    ) {
      return false;
    }
    previous = term;
  }
  return true;
}

function coverageIsComplete(coverage: AnalysisReport["coverage"]): boolean {
  return (
    coverage.treeComplete &&
    !coverage.limitReached &&
    coverage.failedFiles === 0
  );
}

function validReaderAvailability(
  actual: unknown,
  itemCount: number,
  complete: boolean,
  unavailableFallback: boolean,
): boolean {
  const expected = unavailableFallback
    ? "unavailable"
    : deriveReaderAvailability(itemCount, complete);
  return actual === expected;
}

function validReaderReport(
  value: unknown,
  repository: AnalysisReport["repository"],
  projectBrief: ProjectBrief,
  coverage: AnalysisReport["coverage"],
): value is ReaderReport {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "reliability",
      "scenarios",
      "architecture",
      "gettingStarted",
      "securityPrivacy",
      "maintenance",
      "alternatives",
    ]) ||
    !isRecord(value.reliability) ||
    !exactKeys(value.reliability, [
      "availability",
      "status",
      "signals",
      "questions",
    ]) ||
    !validCanonicalReaderSignals(value.reliability.signals) ||
    !Array.isArray(value.reliability.questions) ||
    !isRecord(value.scenarios) ||
    !exactKeys(value.scenarios, ["availability", "facts"]) ||
    !validReaderTextFacts(
      value.scenarios.facts,
      3,
      new Set(["readme", "documentation"]),
    ) ||
    !isRecord(value.architecture) ||
    !exactKeys(value.architecture, [
      "availability",
      "excerpts",
      "documents",
      "entryPoints",
      "sourceAreas",
      "ecosystems",
    ]) ||
    !validReaderTextFacts(
      value.architecture.excerpts,
      2,
      new Set(["readme", "documentation"]),
    ) ||
    !validSortedReaderPaths(value.architecture.documents, 3) ||
    !validSortedReaderPaths(value.architecture.entryPoints, 4) ||
    !validSortedReaderPaths(value.architecture.sourceAreas, 5) ||
    !validReaderEcosystems(value.architecture.ecosystems) ||
    !isRecord(value.gettingStarted) ||
    !exactKeys(value.gettingStarted, ["availability", "commands"]) ||
    !validReaderCommands(value.gettingStarted.commands) ||
    !isRecord(value.securityPrivacy) ||
    !exactKeys(value.securityPrivacy, [
      "availability",
      "signals",
      "declarations",
    ]) ||
    !validReaderSignalSubset(
      value.securityPrivacy.signals,
      value.reliability.signals,
      SECURITY_READER_SIGNAL_IDS,
    ) ||
    !validReaderTextFacts(
      value.securityPrivacy.declarations,
      3,
      new Set(["readme", "documentation"]),
    ) ||
    !isRecord(value.maintenance) ||
    !exactKeys(value.maintenance, [
      "availability",
      "signals",
      "activity",
      "openIssuesCount",
    ]) ||
    !validReaderSignalSubset(
      value.maintenance.signals,
      value.reliability.signals,
      MAINTENANCE_READER_SIGNAL_IDS,
    ) ||
    !isRecord(value.maintenance.activity) ||
    !exactKeys(value.maintenance.activity, ["elapsedUtcDays", "band"]) ||
    !finiteInteger(
      value.maintenance.openIssuesCount,
      0,
      Number.MAX_SAFE_INTEGER,
    ) ||
    !validReaderAlternatives(
      value.alternatives,
      repository,
      projectBrief,
      value.reliability.signals.every(({ state }) => state === "unknown"),
    )
  ) {
    return false;
  }

  const reader = value as unknown as ReaderReport;
  const signals = reader.reliability.signals;
  const purposeKeys = new Set(
    projectBrief.excerpts.map(({ text }) => canonicalReaderText(text)),
  );
  if (
    reader.scenarios.facts.some(({ text }) =>
      purposeKeys.has(canonicalReaderText(text)),
    )
  ) {
    return false;
  }
  const status = deriveReliabilityStatus(signals);
  const questions = deriveReaderQuestions(status, signals);
  if (
    reader.reliability.status !== status ||
    reader.reliability.questions.length !== questions.length
  ) {
    return false;
  }
  for (let index = 0; index < questions.length; index += 1) {
    const question = reader.reliability.questions[index];
    if (typeof question !== "string" || question !== questions[index]) {
      return false;
    }
  }

  const elapsedUtcDays =
    (Date.parse(repository.analyzedAt) - Date.parse(repository.pushedAt)) /
    86_400_000;
  if (
    !Number.isFinite(elapsedUtcDays) ||
    elapsedUtcDays < 0 ||
    reader.maintenance.activity.elapsedUtcDays !== elapsedUtcDays ||
    reader.maintenance.activity.band !== activityBand(elapsedUtcDays)
  ) {
    return false;
  }

  const allUnknown = signals.every(({ state }) => state === "unknown");
  const complete = coverageIsComplete(coverage);
  if (!allUnknown) {
    const archived = signals[READER_SIGNAL_IDS.indexOf("archived")];
    const recentActivity =
      signals[READER_SIGNAL_IDS.indexOf("recent-activity")];
    const install = signals[READER_SIGNAL_IDS.indexOf("install")];
    const run = signals[READER_SIGNAL_IDS.indexOf("run")];
    const commandState = (kind: "install" | "run"): string => {
      const present = reader.gettingStarted.commands.some(
        (command) =>
          command.kind === kind &&
          (command.disposition === "ready" || command.disposition === "review"),
      );
      return present ? "present" : complete ? "absent" : "unknown";
    };

    if (
      archived?.state !== (repository.archived ? "present" : "absent") ||
      recentActivity?.state !==
        activityState(elapsedUtcDays, repository.archived) ||
      install?.state !== commandState("install") ||
      run?.state !== commandState("run") ||
      NON_METADATA_READER_SIGNAL_IDS.some((signal) => {
        const state = signals[READER_SIGNAL_IDS.indexOf(signal)]?.state;
        return complete ? state === "unknown" : state === "absent";
      })
    ) {
      return false;
    }
  }

  const unavailableFallback = allUnknown;
  if (
    unavailableFallback &&
    (reader.scenarios.facts.length > 0 ||
      reader.architecture.excerpts.length > 0 ||
      reader.architecture.documents.length > 0 ||
      reader.architecture.entryPoints.length > 0 ||
      reader.architecture.sourceAreas.length > 0 ||
      reader.architecture.ecosystems.length > 0 ||
      reader.gettingStarted.commands.length > 0 ||
      reader.securityPrivacy.declarations.length > 0 ||
      reader.alternatives.searchTerms.length > 0)
  ) {
    return false;
  }

  const nonMetadataAbsent = NON_METADATA_READER_SIGNAL_IDS.every(
    (signal) => signals[READER_SIGNAL_IDS.indexOf(signal)]?.state === "absent",
  );
  const expectedReliabilityAvailability = unavailableFallback
    ? "unavailable"
    : !complete
      ? "partial"
      : nonMetadataAbsent
        ? "unavailable"
        : "available";
  const architectureCount =
    reader.architecture.excerpts.length +
    reader.architecture.documents.length +
    reader.architecture.entryPoints.length +
    reader.architecture.sourceAreas.length +
    reader.architecture.ecosystems.length;
  const securityCount =
    reader.securityPrivacy.declarations.length +
    reader.securityPrivacy.signals.filter(({ state }) => state === "present")
      .length;
  const maintenanceCount =
    1 +
    reader.maintenance.signals.filter(({ state }) => state === "present")
      .length;

  return (
    reader.reliability.availability === expectedReliabilityAvailability &&
    validReaderAvailability(
      reader.scenarios.availability,
      projectBrief.excerpts.length + reader.scenarios.facts.length,
      complete,
      unavailableFallback,
    ) &&
    validReaderAvailability(
      reader.architecture.availability,
      architectureCount,
      complete,
      unavailableFallback,
    ) &&
    validReaderAvailability(
      reader.gettingStarted.availability,
      reader.gettingStarted.commands.length,
      complete,
      unavailableFallback,
    ) &&
    validReaderAvailability(
      reader.securityPrivacy.availability,
      securityCount,
      complete,
      unavailableFallback,
    ) &&
    validReaderAvailability(
      reader.maintenance.availability,
      maintenanceCount,
      complete,
      unavailableFallback,
    )
  );
}

function validDescriptor(
  value: unknown,
  expectedKey?: string,
): value is LocalizedDescriptor {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["key", "args"]) ||
    !safeString(value.key, 200) ||
    !KEY_PATTERN.test(value.key) ||
    (expectedKey !== undefined && value.key !== expectedKey) ||
    !isRecord(value.args)
  ) {
    return false;
  }

  const entries = Object.entries(value.args);

  return (
    entries.length <= 50 &&
    entries.every(
      ([key, argument]) =>
        ARGUMENT_KEY_PATTERN.test(key) &&
        (typeof argument === "boolean" ||
          finiteNumber(
            argument,
            -Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
          )),
    )
  );
}

function validReference(value: unknown): value is FileReference {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["path"], ["startLine", "endLine"]) ||
    !validPath(value.path)
  ) {
    return false;
  }
  const start = value.startLine;
  const end = value.endLine;

  return (
    (start === undefined || finiteInteger(start, 1, Number.MAX_SAFE_INTEGER)) &&
    (end === undefined || finiteInteger(end, 1, Number.MAX_SAFE_INTEGER)) &&
    (end === undefined ||
      (typeof start === "number" && typeof end === "number" && end >= start))
  );
}

function validReferences(value: unknown): value is FileReference[] {
  return (
    Array.isArray(value) && value.length <= 20 && value.every(validReference)
  );
}

function expectedDimension(id: string): DimensionKey | null {
  if (!RULE_ID_SET.has(id)) return null;

  return scoreRule(id, {}).dimension;
}

function validRule(
  value: unknown,
  dimension: DimensionKey,
): value is RuleResult {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "id",
      "dimension",
      "state",
      "earned",
      "available",
      "evidence",
      "recommendation",
      "references",
    ]) ||
    typeof value.id !== "string" ||
    !RULE_ID_SET.has(value.id) ||
    value.dimension !== dimension ||
    expectedDimension(value.id) !== dimension ||
    !["passed", "partial", "failed", "not-applicable"].includes(
      String(value.state),
    ) ||
    !finiteInteger(value.earned, 0, 20) ||
    !finiteInteger(value.available, 0, 20) ||
    !validDescriptor(value.evidence, `evidence.${value.id}`) ||
    !validDescriptor(value.recommendation, `recommendation.${value.id}`) ||
    !validReferences(value.references)
  ) {
    return false;
  }

  const maximum = RULE_MAXIMUMS[value.id as RuleId];
  const earned = value.earned as number;
  const available = value.available as number;

  if (value.state === "not-applicable") return earned === 0 && available === 0;
  if (available !== maximum) return false;
  if (value.state === "passed") return earned === available;
  if (value.state === "failed") return earned === 0;

  return (
    (earned > 0 && earned < available) ||
    (earned === 0 &&
      ZERO_POINT_PARTIAL_RULE_IDS.has(value.id as RuleId) &&
      available > 0)
  );
}

function validCoverage(value: unknown): value is AnalysisReport["coverage"] {
  const required = [
    "treeComplete",
    "eligibleFiles",
    "eligibleBytes",
    "eligibleSourceBytes",
    "selectedFiles",
    "selectedBytes",
    "fetchedFiles",
    "fetchedBytes",
    "parsedFiles",
    "parsedBytes",
    "parsedSupportedBytes",
    "skippedFiles",
    "failedFiles",
    "unsupportedFiles",
    "limitReached",
  ];
  if (
    !isRecord(value) ||
    !exactKeys(value, required, ["skipped", "failures"]) ||
    typeof value.treeComplete !== "boolean" ||
    typeof value.limitReached !== "boolean" ||
    !required
      .filter((key) => key !== "treeComplete" && key !== "limitReached")
      .every((key) => finiteInteger(value[key], 0, Number.MAX_SAFE_INTEGER))
  ) {
    return false;
  }

  if (
    Number(value.selectedFiles) > Number(value.eligibleFiles) ||
    Number(value.selectedFiles) > 200 ||
    Number(value.fetchedFiles) > Number(value.selectedFiles) ||
    Number(value.fetchedFiles) > 200 ||
    Number(value.parsedFiles) > Number(value.fetchedFiles) ||
    Number(value.failedFiles) > 400 ||
    Number(value.eligibleSourceBytes) > Number(value.eligibleBytes) ||
    Number(value.selectedBytes) > Number(value.eligibleBytes) ||
    Number(value.selectedBytes) > 10 * 1024 * 1024 ||
    Number(value.fetchedBytes) > 10 * 1024 * 1024 ||
    Number(value.parsedBytes) > Number(value.fetchedBytes) ||
    Number(value.parsedSupportedBytes) > Number(value.parsedBytes) ||
    Number(value.unsupportedFiles) > Number(value.eligibleFiles)
  ) {
    return false;
  }

  if (
    (value.skipped === undefined && value.skippedFiles !== 0) ||
    (value.skipped !== undefined &&
      (!Array.isArray(value.skipped) ||
        value.skipped.length > 400 ||
        value.skipped.length > Math.min(Number(value.skippedFiles), 400) ||
        !value.skipped.every(
          (item) =>
            isRecord(item) &&
            exactKeys(item, ["path", "reason"]) &&
            validPath(item.path) &&
            [
              "excluded",
              "binary",
              "oversized",
              "unsupported",
              "budget",
              "invalid-entry",
            ].includes(String(item.reason)),
        )))
  ) {
    return false;
  }

  if (
    (value.failures === undefined && value.failedFiles !== 0) ||
    (value.failures !== undefined &&
      (!Array.isArray(value.failures) ||
        value.failures.length > 400 ||
        value.failures.length > Number(value.failedFiles) ||
        !value.failures.every(
          (item) =>
            isRecord(item) &&
            exactKeys(item, ["path", "stage", "reason"]) &&
            validPath(item.path) &&
            ["fetch", "parse"].includes(String(item.stage)) &&
            [
              "not-found",
              "rate-limit",
              "network",
              "api",
              "invalid-response",
              "file-limit",
              "invalid-text",
              "timeout",
              "budget",
              "syntax",
            ].includes(String(item.reason)),
        )))
  ) {
    return false;
  }

  return true;
}

function validRepository(
  value: unknown,
): value is AnalysisReport["repository"] {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "owner",
      "repo",
      "fullName",
      "url",
      "description",
      "defaultBranch",
      "archived",
      "pushedAt",
      "commitSha",
      "analyzedAt",
    ]) ||
    !validComponent(value.owner) ||
    !validComponent(value.repo) ||
    value.fullName !== `${value.owner}/${value.repo}` ||
    value.url !==
      `https://github.com/${encodeURIComponent(value.owner)}/${encodeURIComponent(value.repo)}` ||
    !(
      value.description === null ||
      (safeString(value.description, 4_096, true) &&
        !containsCredentialLikeValue(value.description))
    ) ||
    !safeString(value.defaultBranch, 256) ||
    typeof value.archived !== "boolean" ||
    !validIso(value.pushedAt) ||
    !validIso(value.analyzedAt) ||
    typeof value.commitSha !== "string" ||
    !SHA_PATTERN.test(value.commitSha)
  ) {
    return false;
  }

  return true;
}

function equalDescriptor(
  left: LocalizedDescriptor,
  right: LocalizedDescriptor,
): boolean {
  const leftEntries = Object.entries(left.args).sort(([a], [b]) =>
    a.localeCompare(b, "en-US"),
  );
  const rightEntries = Object.entries(right.args).sort(([a], [b]) =>
    a.localeCompare(b, "en-US"),
  );

  if (left.key !== right.key || leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (let index = 0; index < leftEntries.length; index += 1) {
    const leftEntry = leftEntries[index];
    const rightEntry = rightEntries[index];

    if (
      leftEntry === undefined ||
      rightEntry === undefined ||
      leftEntry[0] !== rightEntry[0] ||
      leftEntry[1] !== rightEntry[1]
    ) {
      return false;
    }
  }

  return true;
}

function equalReferences(
  left: readonly FileReference[],
  right: readonly FileReference[],
): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftReference = left[index];
    const rightReference = right[index];

    if (
      leftReference === undefined ||
      rightReference === undefined ||
      leftReference.path !== rightReference.path ||
      leftReference.startLine !== rightReference.startLine ||
      leftReference.endLine !== rightReference.endLine
    ) {
      return false;
    }
  }

  return true;
}

function equalStrengthArrays(
  left: readonly AnalysisReport["strengths"][number][],
  right: readonly AnalysisReport["strengths"][number][],
): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];

    if (
      leftItem === undefined ||
      rightItem === undefined ||
      !equalStrength(leftItem, rightItem)
    ) {
      return false;
    }
  }

  return true;
}

function equalImprovementArrays(
  left: readonly AnalysisReport["weaknesses"][number][],
  right: readonly AnalysisReport["weaknesses"][number][],
): boolean {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];

    if (
      leftItem === undefined ||
      rightItem === undefined ||
      !equalImprovement(leftItem, rightItem)
    ) {
      return false;
    }
  }

  return true;
}

function validStrength(
  value: unknown,
): value is AnalysisReport["strengths"][number] {
  return (
    isRecord(value) &&
    exactKeys(value, ["ruleId", "dimension", "evidence", "references"]) &&
    typeof value.ruleId === "string" &&
    RULE_ID_SET.has(value.ruleId) &&
    DIMENSIONS.includes(value.dimension as DimensionKey) &&
    validDescriptor(value.evidence) &&
    validReferences(value.references)
  );
}

function validImprovement(
  value: unknown,
): value is AnalysisReport["weaknesses"][number] {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "ruleId",
      "dimension",
      "severity",
      "lostPoints",
      "evidence",
      "recommendation",
      "references",
    ]) &&
    typeof value.ruleId === "string" &&
    RULE_ID_SET.has(value.ruleId) &&
    DIMENSIONS.includes(value.dimension as DimensionKey) &&
    ["high", "medium", "low"].includes(String(value.severity)) &&
    finiteInteger(value.lostPoints, 0, 20) &&
    validDescriptor(value.evidence) &&
    validDescriptor(value.recommendation) &&
    validReferences(value.references)
  );
}

function equalStrength(
  left: AnalysisReport["strengths"][number],
  right: AnalysisReport["strengths"][number],
): boolean {
  return (
    left.ruleId === right.ruleId &&
    left.dimension === right.dimension &&
    equalDescriptor(left.evidence, right.evidence) &&
    equalReferences(left.references, right.references)
  );
}

function equalImprovement(
  left: AnalysisReport["weaknesses"][number],
  right: AnalysisReport["weaknesses"][number],
): boolean {
  return (
    left.ruleId === right.ruleId &&
    left.dimension === right.dimension &&
    left.severity === right.severity &&
    left.lostPoints === right.lostPoints &&
    equalDescriptor(left.evidence, right.evidence) &&
    equalDescriptor(left.recommendation, right.recommendation) &&
    equalReferences(left.references, right.references)
  );
}

function validateAnalysisReport(value: unknown): value is AnalysisReport {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "rulesetVersion",
      "repository",
      "projectBrief",
      "readerReport",
      "overall",
      "confidence",
      "dimensions",
      "strengths",
      "weaknesses",
      "coverage",
    ]) ||
    value.rulesetVersion !== RULESET_VERSION ||
    !validRepository(value.repository) ||
    !validProjectBrief(value.projectBrief) ||
    !validCoverage(value.coverage) ||
    !validReaderReport(
      value.readerReport,
      value.repository,
      value.projectBrief,
      value.coverage,
    ) ||
    !Array.isArray(value.dimensions) ||
    value.dimensions.length !== DIMENSIONS.length
  ) {
    return false;
  }

  const seenRules = new Set<string>();
  const dimensions: AnalysisReport["dimensions"] = [];
  const rawDimensions: unknown[] = value.dimensions;

  for (let index = 0; index < DIMENSIONS.length; index += 1) {
    const expectedKey = DIMENSIONS[index];
    const dimension: unknown = rawDimensions[index];

    if (
      expectedKey === undefined ||
      !isRecord(dimension) ||
      !exactKeys(dimension, ["key", "earned", "available", "score", "rules"]) ||
      dimension.key !== expectedKey ||
      !finiteInteger(dimension.earned, 0, DIMENSION_WEIGHTS[expectedKey]) ||
      !finiteInteger(dimension.available, 0, DIMENSION_WEIGHTS[expectedKey]) ||
      !(dimension.score === null || finiteInteger(dimension.score, 0, 100)) ||
      !Array.isArray(dimension.rules) ||
      !dimension.rules.every((rule) => validRule(rule, expectedKey))
    ) {
      return false;
    }

    const rules = dimension.rules;
    const expectedRuleIds = RULE_IDS.filter(
      (id) => expectedDimension(id) === expectedKey,
    );
    if (
      rules.length !== expectedRuleIds.length ||
      rules.some((rule, ruleIndex) => rule.id !== expectedRuleIds[ruleIndex])
    ) {
      return false;
    }
    if (rules.some((rule) => seenRules.has(rule.id))) return false;
    rules.forEach((rule) => seenRules.add(rule.id));
    const earned = rules.reduce((sum, rule) => sum + rule.earned, 0);
    const available = rules.reduce((sum, rule) => sum + rule.available, 0);
    const score =
      available === 0 ? null : Math.round((100 * earned) / available);

    if (
      dimension.earned !== earned ||
      dimension.available !== available ||
      dimension.score !== score
    ) {
      return false;
    }
    dimensions.push(
      dimension as unknown as AnalysisReport["dimensions"][number],
    );
  }

  if (
    seenRules.size !== RULE_IDS.length ||
    RULE_IDS.some((id) => !seenRules.has(id))
  ) {
    return false;
  }

  if (
    !isRecord(value.confidence) ||
    !exactKeys(value.confidence, ["percent", "label"]) ||
    !finiteInteger(value.confidence.percent, 0, 100) ||
    !["high", "medium", "low"].includes(String(value.confidence.label)) ||
    value.confidence.label !==
      ((value.confidence.percent as number) >= 80
        ? "high"
        : (value.confidence.percent as number) >= 60
          ? "medium"
          : "low") ||
    !isRecord(value.overall) ||
    !exactKeys(value.overall, [
      "score",
      "label",
      "generalOnly",
      "preliminary",
    ]) ||
    !finiteInteger(value.overall.score, 0, 100) ||
    typeof value.overall.generalOnly !== "boolean" ||
    typeof value.overall.preliminary !== "boolean"
  ) {
    return false;
  }

  const applicable = dimensions.filter((dimension) => dimension.available > 0);
  const availableWeight = applicable.reduce(
    (sum, dimension) => sum + DIMENSION_WEIGHTS[dimension.key],
    0,
  );
  const raw =
    availableWeight === 0
      ? 0
      : (100 *
          applicable.reduce(
            (sum, dimension) =>
              sum +
              DIMENSION_WEIGHTS[dimension.key] *
                (dimension.earned / dimension.available),
            0,
          )) /
        availableWeight;
  const generalOnly = dimensions.some(
    (dimension) =>
      (dimension.key === "readability" || dimension.key === "complexity") &&
      dimension.score === null,
  );
  const expectedConfidence = calculateConfidence(value.coverage);

  if (
    (value.overall.score as number) !== Math.round(raw) ||
    value.overall.label !== overallLabel(raw) ||
    value.overall.generalOnly !== generalOnly ||
    value.overall.preliminary !==
      (generalOnly || value.confidence.label === "low") ||
    value.confidence.percent !== expectedConfidence.percent ||
    value.confidence.label !== expectedConfidence.label
  ) {
    return false;
  }

  const scored = {
    rules: dimensions.flatMap((dimension) => dimension.rules),
    dimensions,
    overall: value.overall as unknown as AnalysisReport["overall"],
    confidence: value.confidence as unknown as AnalysisReport["confidence"],
  };
  const expectedFindings = buildFindings(scored);

  return (
    Array.isArray(value.strengths) &&
    value.strengths.length <= 5 &&
    value.strengths.every(validStrength) &&
    Array.isArray(value.weaknesses) &&
    value.weaknesses.length <= RULE_IDS.length &&
    value.weaknesses.every(validImprovement) &&
    equalStrengthArrays(value.strengths, expectedFindings.strengths) &&
    equalImprovementArrays(value.weaknesses, expectedFindings.weaknesses)
  );
}

export function isAnalysisReport(value: unknown): value is AnalysisReport {
  try {
    return validateAnalysisReport(value);
  } catch {
    return false;
  }
}
