import type {
  AnalysisReport,
  DimensionKey,
  FileReference,
  LocalizedDescriptor,
  RuleResult,
} from "./model";
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
const RULE_ID_SET: ReadonlySet<string> = new Set(RULE_IDS);
const RULE_MAXIMUMS: Readonly<Record<RuleId, number>> = Object.fromEntries(
  RULE_IDS.map((id) => [id, scoreRule(id, {}).available]),
) as Readonly<Record<RuleId, number>>;

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
  return (
    safeString(value, 1_024) &&
    !Array.from(value).some((character) => {
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
    }) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (segment) => segment.length > 0 && segment !== "." && segment !== "..",
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

  return earned > 0 && earned < available;
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
    value.skipped !== undefined &&
    (!Array.isArray(value.skipped) ||
      value.skipped.length > 400 ||
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
      ))
  ) {
    return false;
  }

  if (
    (value.failures === undefined && value.failedFiles !== 0) ||
    (value.failures !== undefined &&
      (!Array.isArray(value.failures) ||
        value.failures.length > 400 ||
        value.failures.length !== value.failedFiles ||
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
      value.description === null || safeString(value.description, 4_096, true)
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isAnalysisReport(value: unknown): value is AnalysisReport {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "rulesetVersion",
      "repository",
      "overall",
      "confidence",
      "dimensions",
      "strengths",
      "weaknesses",
      "coverage",
    ]) ||
    value.rulesetVersion !== RULESET_VERSION ||
    !validRepository(value.repository) ||
    !validCoverage(value.coverage) ||
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
    Array.isArray(value.weaknesses) &&
    sameJson(value.strengths, expectedFindings.strengths) &&
    sameJson(value.weaknesses, expectedFindings.weaknesses)
  );
}
