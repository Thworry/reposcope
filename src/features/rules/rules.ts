import type {
  DimensionKey,
  DimensionResult,
  FileReference,
  FunctionMetric,
  GeneralMetrics,
  ImportCycleMetrics,
  LanguageAnalysis,
  LocalizedDescriptor,
  OverallResult,
  ScoringRepositoryMetadata,
  RuleResult,
  RuleState,
  ScoredProject,
  CoverageSummary,
  DuplicateMetrics,
} from "../analysis/model";
import { calculateConfidence } from "./confidence";

export type { ScoredProject } from "../analysis/model";

/** Exact ruleset identifier serialized into every accepted report and cache entry. */
export const RULESET_VERSION = "1.0.0" as const;

/** Fixed dimension weights; their insertion order is the public report order. */
export const DIMENSION_WEIGHTS = Object.freeze({
  documentation: 15,
  operability: 20,
  readability: 20,
  complexity: 20,
  testing: 15,
  maintenance: 10,
} as const) satisfies Readonly<Record<DimensionKey, number>>;

/** Frozen rule identifiers in deterministic evaluation and report order. */
export const RULE_IDS = Object.freeze([
  "documentation.readme",
  "documentation.installation",
  "documentation.usage",
  "documentation.contributing",
  "documentation.license",
  "documentation.architecture",
  "operability.manifest",
  "operability.entry-point",
  "operability.run-build",
  "operability.example",
  "operability.error-handling",
  "operability.version-history",
  "operability.configuration",
  "readability.median-function-length",
  "readability.p90-function-length",
  "readability.large-file-ratio",
  "readability.median-nesting",
  "readability.ambiguous-identifiers",
  "readability.documented-exports",
  "complexity.median-cyclomatic",
  "complexity.p90-cyclomatic",
  "complexity.max-nesting",
  "complexity.very-large-files",
  "complexity.duplication",
  "complexity.circular-imports",
  "testing.test-files",
  "testing.test-source-ratio",
  "testing.ci",
  "testing.test-command",
  "testing.static-check",
  "testing.coverage",
  "maintenance.activity",
  "maintenance.lockfile",
  "maintenance.dependency-updates",
  "maintenance.templates",
  "maintenance.security",
  "maintenance.code-of-conduct",
  "maintenance.version-history",
  "maintenance.generated-directories",
] as const);

/** One identifier from ruleset `1.0.0`. */
export type RuleId = (typeof RULE_IDS)[number];
type RuleMetrics = Readonly<Record<string, number | boolean | string | null>>;

const CONDITIONALLY_APPLICABLE_RULE_IDS: ReadonlySet<RuleId> = new Set([
  "operability.error-handling",
  "readability.median-function-length",
  "readability.p90-function-length",
  "readability.large-file-ratio",
  "readability.median-nesting",
  "readability.ambiguous-identifiers",
  "readability.documented-exports",
  "complexity.median-cyclomatic",
  "complexity.p90-cyclomatic",
  "complexity.max-nesting",
  "complexity.very-large-files",
  "complexity.duplication",
  "complexity.circular-imports",
  "testing.test-source-ratio",
]);

interface Evaluation {
  state: RuleState;
  earned: number;
}

interface RuleDefinition {
  dimension: DimensionKey;
  available: number;
  evaluate: (metrics: RuleMetrics) => Evaluation;
}

function numberMetric(metrics: RuleMetrics, key: string): number {
  const value = metrics[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanMetric(metrics: RuleMetrics, key: string): boolean {
  return metrics[key] === true;
}

function applicable(metrics: RuleMetrics): boolean {
  return metrics["applicable"] !== false;
}

function result(state: RuleState, earned: number): Evaluation {
  return { state, earned };
}

function passFail(condition: boolean, available: number): Evaluation {
  return condition ? result("passed", available) : result("failed", 0);
}

function unavailable(): Evaluation {
  return result("not-applicable", 0);
}

function safeRatio(count: number, total: number): number {
  const numerator = Number.isFinite(count) && count >= 0 ? count : 0;
  const denominator = Number.isFinite(total) && total > 0 ? total : 0;

  return denominator === 0 ? 0 : Math.min(1, numerator / denominator);
}

function validNonNegativeNumber(metrics: RuleMetrics, key: string): boolean {
  const value = metrics[key];

  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validAtLeastOne(metrics: RuleMetrics, key: string): boolean {
  const value = metrics[key];

  return typeof value === "number" && Number.isFinite(value) && value >= 1;
}

function validCount(metrics: RuleMetrics, key: string): boolean {
  const value = metrics[key];

  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validCountPair(metrics: RuleMetrics): boolean {
  if (!validCount(metrics, "count") || !validCount(metrics, "total")) {
    return false;
  }
  const count = numberMetric(metrics, "count");
  const total = numberMetric(metrics, "total");

  return total > 0 && count <= total;
}

function validOptionalDuplicateCounts(
  metrics: RuleMetrics,
  ratio: number,
): boolean {
  const hasCount = Object.prototype.hasOwnProperty.call(metrics, "count");
  const hasTotal = Object.prototype.hasOwnProperty.call(metrics, "total");

  if (!hasCount && !hasTotal) {
    return true;
  }
  if (!hasCount || !hasTotal || !validCountPair(metrics)) {
    return false;
  }
  const count = numberMetric(metrics, "count");
  const total = numberMetric(metrics, "total");
  const expected = count / total;

  return (
    Math.abs(ratio - expected) <= Number.EPSILON * Math.max(1, expected) * 4
  );
}

function validNumericMetrics(ruleId: RuleId, metrics: RuleMetrics): boolean {
  if (metrics["valid"] === false) {
    return false;
  }

  switch (ruleId) {
    case "documentation.architecture":
      return validCount(metrics, "areaCount");
    case "operability.error-handling":
    case "readability.large-file-ratio":
    case "readability.ambiguous-identifiers":
    case "readability.documented-exports":
    case "complexity.very-large-files":
      return validCountPair(metrics);
    case "readability.median-function-length":
    case "readability.median-nesting":
      return validNonNegativeNumber(metrics, "median");
    case "readability.p90-function-length":
      return validNonNegativeNumber(metrics, "p90");
    case "complexity.median-cyclomatic":
      return validAtLeastOne(metrics, "median");
    case "complexity.p90-cyclomatic":
      return validAtLeastOne(metrics, "p90");
    case "complexity.max-nesting":
      return validNonNegativeNumber(metrics, "max");
    case "complexity.duplication": {
      const ratio = metrics["ratio"];

      return (
        typeof ratio === "number" &&
        Number.isFinite(ratio) &&
        ratio >= 0 &&
        ratio <= 1 &&
        validOptionalDuplicateCounts(metrics, ratio)
      );
    }
    case "complexity.circular-imports": {
      if (
        !validCount(metrics, "components") ||
        !validCount(metrics, "largest")
      ) {
        return false;
      }
      const components = numberMetric(metrics, "components");
      const largest = numberMetric(metrics, "largest");

      return components === 0 ? largest === 0 : largest >= 2;
    }
    case "testing.test-files":
    case "maintenance.generated-directories":
      return validCount(metrics, "count");
    case "testing.test-source-ratio":
      return (
        validCount(metrics, "count") &&
        validCount(metrics, "total") &&
        numberMetric(metrics, "total") > 0
      );
    case "maintenance.activity":
      return validNonNegativeNumber(metrics, "elapsedDays");
    default:
      return true;
  }
}

const RULE_DEFINITIONS = {
  "documentation.readme": {
    dimension: "documentation",
    available: 3,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 3),
  },
  "documentation.installation": {
    dimension: "documentation",
    available: 3,
    evaluate: (metrics) =>
      booleanMetric(metrics, "heading") && booleanMetric(metrics, "command")
        ? result("passed", 3)
        : booleanMetric(metrics, "heading")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "documentation.usage": {
    dimension: "documentation",
    available: 3,
    evaluate: (metrics) =>
      booleanMetric(metrics, "heading") && booleanMetric(metrics, "concrete")
        ? result("passed", 3)
        : booleanMetric(metrics, "heading")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "documentation.contributing": {
    dimension: "documentation",
    available: 2,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 2),
  },
  "documentation.license": {
    dimension: "documentation",
    available: 2,
    evaluate: (metrics) =>
      booleanMetric(metrics, "file")
        ? result("passed", 2)
        : booleanMetric(metrics, "metadata")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "documentation.architecture": {
    dimension: "documentation",
    available: 2,
    evaluate: (metrics) =>
      booleanMetric(metrics, "explicit")
        ? result("passed", 2)
        : numberMetric(metrics, "areaCount") >= 3
          ? result("partial", 1)
          : result("failed", 0),
  },
  "operability.manifest": {
    dimension: "operability",
    available: 4,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 4),
  },
  "operability.entry-point": {
    dimension: "operability",
    available: 4,
    evaluate: (metrics) =>
      booleanMetric(metrics, "structured")
        ? result("passed", 4)
        : booleanMetric(metrics, "conventional")
          ? result("partial", 2)
          : result("failed", 0),
  },
  "operability.run-build": {
    dimension: "operability",
    available: 4,
    evaluate: (metrics) => {
      const run = booleanMetric(metrics, "run");
      const build = booleanMetric(metrics, "build");

      return run && build
        ? result("passed", 4)
        : run || build
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "operability.example": {
    dimension: "operability",
    available: 3,
    evaluate: (metrics) =>
      booleanMetric(metrics, "concrete")
        ? result("passed", 3)
        : booleanMetric(metrics, "prose")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "operability.error-handling": {
    dimension: "operability",
    available: 2,
    evaluate: (metrics) => {
      const count = numberMetric(metrics, "count");
      const total = numberMetric(metrics, "total");

      if (!applicable(metrics) || total <= 0) {
        return unavailable();
      }
      if (safeRatio(count, total) >= 0.05) {
        return result("passed", 2);
      }

      return count > 0 ? result("partial", 1) : result("failed", 0);
    },
  },
  "operability.version-history": {
    dimension: "operability",
    available: 2,
    evaluate: (metrics) =>
      booleanMetric(metrics, "history")
        ? result("passed", 2)
        : booleanMetric(metrics, "manifestVersion")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "operability.configuration": {
    dimension: "operability",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "readability.median-function-length": {
    dimension: "readability",
    available: 4,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const median = numberMetric(metrics, "median");

      return median <= 40
        ? result("passed", 4)
        : median <= 60
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "readability.p90-function-length": {
    dimension: "readability",
    available: 4,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const p90 = numberMetric(metrics, "p90");

      return p90 <= 80
        ? result("passed", 4)
        : p90 <= 120
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "readability.large-file-ratio": {
    dimension: "readability",
    available: 4,
    evaluate: (metrics) => {
      const total = numberMetric(metrics, "total");
      if (!applicable(metrics) || total <= 0) return unavailable();
      const ratio = safeRatio(numberMetric(metrics, "count"), total);

      return ratio <= 0.1
        ? result("passed", 4)
        : ratio <= 0.2
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "readability.median-nesting": {
    dimension: "readability",
    available: 3,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const median = numberMetric(metrics, "median");

      return median <= 3
        ? result("passed", 3)
        : median === 4
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "readability.ambiguous-identifiers": {
    dimension: "readability",
    available: 3,
    evaluate: (metrics) => {
      const total = numberMetric(metrics, "total");
      if (!applicable(metrics) || total <= 0) return unavailable();
      const ratio = safeRatio(numberMetric(metrics, "count"), total);

      return ratio <= 0.1
        ? result("passed", 3)
        : ratio <= 0.2
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "readability.documented-exports": {
    dimension: "readability",
    available: 2,
    evaluate: (metrics) => {
      const total = numberMetric(metrics, "total");
      if (!applicable(metrics) || total <= 0) return unavailable();
      const ratio = safeRatio(numberMetric(metrics, "count"), total);

      return ratio >= 0.2
        ? result("passed", 2)
        : ratio >= 0.1
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "complexity.median-cyclomatic": {
    dimension: "complexity",
    available: 4,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const median = numberMetric(metrics, "median");

      return median <= 5
        ? result("passed", 4)
        : median <= 8
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "complexity.p90-cyclomatic": {
    dimension: "complexity",
    available: 5,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const p90 = numberMetric(metrics, "p90");

      return p90 <= 15
        ? result("passed", 5)
        : p90 <= 25
          ? result("partial", 2)
          : result("failed", 0);
    },
  },
  "complexity.max-nesting": {
    dimension: "complexity",
    available: 3,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const max = numberMetric(metrics, "max");

      return max <= 5
        ? result("passed", 3)
        : max <= 7
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "complexity.very-large-files": {
    dimension: "complexity",
    available: 3,
    evaluate: (metrics) => {
      const count = numberMetric(metrics, "count");
      const total = numberMetric(metrics, "total");
      if (!applicable(metrics) || total <= 0) return unavailable();
      if (count === 0) return result("passed", 3);

      return safeRatio(count, total) <= 0.02
        ? result("partial", 1)
        : result("failed", 0);
    },
  },
  "complexity.duplication": {
    dimension: "complexity",
    available: 3,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const ratio = Math.max(0, numberMetric(metrics, "ratio"));

      return ratio <= 0.05
        ? result("passed", 3)
        : ratio <= 0.1
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "complexity.circular-imports": {
    dimension: "complexity",
    available: 2,
    evaluate: (metrics) => {
      if (!applicable(metrics)) return unavailable();
      const components = numberMetric(metrics, "components");
      const largest = numberMetric(metrics, "largest");

      return components === 0
        ? result("passed", 2)
        : components === 1 && largest === 2
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "testing.test-files": {
    dimension: "testing",
    available: 4,
    evaluate: (metrics) =>
      numberMetric(metrics, "count") > 0
        ? result("passed", 4)
        : booleanMetric(metrics, "configuration")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "testing.test-source-ratio": {
    dimension: "testing",
    available: 3,
    evaluate: (metrics) => {
      const total = numberMetric(metrics, "total");
      if (!applicable(metrics) || total <= 0) return unavailable();
      const ratio = safeRatio(numberMetric(metrics, "count"), total);

      return ratio >= 0.25
        ? result("passed", 3)
        : ratio >= 0.1
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "testing.ci": {
    dimension: "testing",
    available: 3,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 3),
  },
  "testing.test-command": {
    dimension: "testing",
    available: 2,
    evaluate: (metrics) =>
      booleanMetric(metrics, "structured")
        ? result("passed", 2)
        : booleanMetric(metrics, "documented")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "testing.static-check": {
    dimension: "testing",
    available: 2,
    evaluate: (metrics) =>
      booleanMetric(metrics, "structured")
        ? result("passed", 2)
        : booleanMetric(metrics, "documented")
          ? result("partial", 1)
          : result("failed", 0),
  },
  "testing.coverage": {
    dimension: "testing",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.activity": {
    dimension: "maintenance",
    available: 2,
    evaluate: (metrics) => {
      const days = numberMetric(metrics, "elapsedDays");
      if (booleanMetric(metrics, "archived") || days < 0) {
        return result("failed", 0);
      }

      return days <= 180
        ? result("passed", 2)
        : days <= 365
          ? result("partial", 1)
          : result("failed", 0);
    },
  },
  "maintenance.lockfile": {
    dimension: "maintenance",
    available: 2,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 2),
  },
  "maintenance.dependency-updates": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.templates": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.security": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.code-of-conduct": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.version-history": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => passFail(booleanMetric(metrics, "exists"), 1),
  },
  "maintenance.generated-directories": {
    dimension: "maintenance",
    available: 1,
    evaluate: (metrics) => {
      const count = numberMetric(metrics, "count");

      return count === 0
        ? result("passed", 1)
        : count === 1
          ? result("partial", 0)
          : result("failed", 0);
    },
  },
} as const satisfies Record<RuleId, RuleDefinition>;

for (const definition of Object.values(RULE_DEFINITIONS)) {
  Object.freeze(definition);
}
Object.freeze(RULE_DEFINITIONS);

function assertRuleset(): void {
  const definitionIds = Object.keys(RULE_DEFINITIONS);

  if (
    definitionIds.length !== RULE_IDS.length ||
    definitionIds.some((id, index) => id !== RULE_IDS[index])
  ) {
    throw new Error(RULESET_VERSION);
  }

  for (const dimension of Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]) {
    const actual = RULE_IDS.filter(
      (id) => RULE_DEFINITIONS[id].dimension === dimension,
    ).reduce((sum, id) => sum + RULE_DEFINITIONS[id].available, 0);

    if (actual !== DIMENSION_WEIGHTS[dimension]) {
      throw new Error(`${RULESET_VERSION}:${dimension}`);
    }
  }

  const total = Object.values(DIMENSION_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  if (total !== 100) {
    throw new Error(RULESET_VERSION);
  }
}

assertRuleset();

function isRuleId(value: string): value is RuleId {
  return Object.prototype.hasOwnProperty.call(RULE_DEFINITIONS, value);
}

function descriptorArgs(metrics: RuleMetrics): LocalizedDescriptor["args"] {
  const args: LocalizedDescriptor["args"] = {};

  for (const [key, value] of Object.entries(metrics)) {
    if (
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      args[key] = value;
    }
  }

  return args;
}

/**
 * Evaluates one ruleset `1.0.0` rule from finite derived metrics. Unknown IDs
 * throw; invalid numeric evidence fails conservatively, and conditional rules
 * with an explicit false applicability flag return `not-applicable`.
 */
export function scoreRule(ruleId: string, metrics: RuleMetrics): RuleResult {
  if (!isRuleId(ruleId)) {
    throw new Error(ruleId);
  }
  const definition = RULE_DEFINITIONS[ruleId];
  const evaluation =
    metrics["applicable"] === false &&
    CONDITIONALLY_APPLICABLE_RULE_IDS.has(ruleId)
      ? unavailable()
      : validNumericMetrics(ruleId, metrics)
        ? definition.evaluate(metrics)
        : result("failed", 0);
  const args = descriptorArgs(metrics);

  return {
    id: ruleId,
    dimension: definition.dimension,
    state: evaluation.state,
    earned: evaluation.earned,
    available: evaluation.state === "not-applicable" ? 0 : definition.available,
    evidence: { key: `evidence.${ruleId}`, args },
    recommendation: { key: `recommendation.${ruleId}`, args },
    references: [],
  };
}

/** Complete validated static evidence required for deterministic project scoring. */
export interface ScoreProjectInput {
  repository: ScoringRepositoryMetadata;
  general: GeneralMetrics;
  language: LanguageAnalysis;
  duplicates: DuplicateMetrics;
  cycles: ImportCycleMetrics;
  coverage: CoverageSummary;
  analyzedAt: string;
}

function numericValues(values: readonly number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
}

function median(values: readonly number[]): number | null {
  const sorted = numericValues(values);

  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function p90(values: readonly number[]): number | null {
  const sorted = numericValues(values);

  return sorted.length === 0
    ? null
    : (sorted[Math.ceil(0.9 * sorted.length) - 1] ?? null);
}

function maximum(values: readonly number[]): number | null {
  const sorted = numericValues(values);

  return sorted.length === 0 ? null : (sorted.at(-1) ?? null);
}

function elapsedUtcDays(analyzedAt: string, pushedAt: string): number {
  const analyzed = Date.parse(analyzedAt);
  const pushed = Date.parse(pushedAt);

  if (!Number.isFinite(analyzed) || !Number.isFinite(pushed)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (analyzed - pushed) / 86_400_000;
}

function isDeclarationOnly(path: string): boolean {
  return /(?:\.d\.ts|\.pyi)$/iu.test(path);
}

function validAnalysisCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validCyclomaticCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function validOccurrenceCounts(count: number, total: number): boolean {
  return (
    validAnalysisCount(count) && validAnalysisCount(total) && count <= total
  );
}

function validDuplicateMetrics(metrics: DuplicateMetrics): boolean {
  if (
    !validOccurrenceCounts(
      metrics.duplicatedTokens,
      metrics.totalEligibleTokens,
    ) ||
    !Number.isFinite(metrics.ratio) ||
    metrics.ratio < 0 ||
    metrics.ratio > 1
  ) {
    return false;
  }

  const expectedRatio =
    metrics.totalEligibleTokens === 0
      ? 0
      : metrics.duplicatedTokens / metrics.totalEligibleTokens;

  return (
    Math.abs(metrics.ratio - expectedRatio) <=
    Number.EPSILON * Math.max(1, expectedRatio) * 4
  );
}

function validCycleMetrics(metrics: ImportCycleMetrics): boolean {
  const expectedLargest = metrics.components.reduce(
    (largest, component) => Math.max(largest, component.length),
    0,
  );

  return (
    validAnalysisCount(metrics.largestComponentSize) &&
    metrics.components.every((component) => component.length >= 2) &&
    metrics.largestComponentSize === expectedLargest
  );
}

function referenceForFunction(metric: FunctionMetric): FileReference {
  return {
    path: metric.path,
    startLine: metric.startLine,
    endLine: metric.endLine,
  };
}

function sortedReferences(
  references: readonly FileReference[],
): FileReference[] {
  return [...references]
    .sort(
      (left, right) =>
        left.path
          .toLocaleLowerCase("en-US")
          .localeCompare(right.path.toLocaleLowerCase("en-US"), "en-US") ||
        left.path.localeCompare(right.path, "en-US") ||
        (left.startLine ?? 0) - (right.startLine ?? 0),
    )
    .slice(0, 20);
}

function projectRuleMetrics(input: ScoreProjectInput): {
  metrics: Record<RuleId, RuleMetrics>;
  references: Partial<Record<RuleId, FileReference[]>>;
} {
  const { general, language, duplicates, cycles } = input;
  const sourceFiles = language.files.filter(
    (file) => !isDeclarationOnly(file.path),
  );
  const sourceLogicalLinesValid = sourceFiles.every((file) =>
    validAnalysisCount(file.logicalLines),
  );
  const parsedLines = sourceLogicalLinesValid
    ? sourceFiles.reduce((sum, file) => sum + file.logicalLines, 0)
    : 0;
  const deepApplicable = sourceFiles.length >= 5 || parsedLines >= 2_000;
  const nonTestFunctions = language.functions.filter(
    (metric) => !metric.isTest,
  );
  const functionApplicable = deepApplicable && nonTestFunctions.length > 0;
  const functionLengths = nonTestFunctions.map((metric) => metric.logicalLines);
  const nestingDepths = nonTestFunctions.map((metric) => metric.maxNesting);
  const cyclomaticValues = nonTestFunctions.map((metric) => metric.cyclomatic);
  const functionLengthsValid = functionLengths.every(validAnalysisCount);
  const nestingDepthsValid = nestingDepths.every(validAnalysisCount);
  const cyclomaticValuesValid = cyclomaticValues.every(validCyclomaticCount);
  const identifierCountsValid = validOccurrenceCounts(
    language.ambiguousIdentifierOccurrences,
    language.identifierOccurrences,
  );
  const exportCountsValid = validOccurrenceCounts(
    language.documentedExports,
    language.exportedDeclarations,
  );
  const duplicateMetricsValid = validDuplicateMetrics(duplicates);
  const cycleMetricsValid = validCycleMetrics(cycles);
  const testFileCountValid = validAnalysisCount(general.testFileCount);
  const sourceFileCountValid = validAnalysisCount(
    general.supportedSourceFileCount,
  );
  const over500 = sourceFiles.filter((file) => file.logicalLines > 500);
  const over1000 = sourceFiles.filter((file) => file.logicalLines > 1_000);
  const handledFunctions = nonTestFunctions.filter(
    (metric) => metric.hasErrorHandling,
  );
  const run = general.hasRunCommand || general.hasDocumentedRunCommand;
  const build = general.hasBuildCommand || general.hasDocumentedBuildCommand;

  const metrics: Record<RuleId, RuleMetrics> = {
    "documentation.readme": { exists: general.hasReadme },
    "documentation.installation": {
      heading: general.installHeading,
      command: general.installCommand,
    },
    "documentation.usage": {
      heading: general.usageHeading,
      concrete: general.usageCommandOrExample,
    },
    "documentation.contributing": { exists: general.hasContributing },
    "documentation.license": {
      file: general.hasLicenseFile,
      metadata: general.apiLicenseDetected,
    },
    "documentation.architecture": {
      explicit: general.hasArchitectureEvidence,
      areaCount: general.readmeTopLevelSourceAreaCount,
    },
    "operability.manifest": { exists: general.hasManifest },
    "operability.entry-point": {
      structured: general.hasStructuredEntryPoint,
      conventional: general.hasConventionalEntryPoint,
    },
    "operability.run-build": { run, build },
    "operability.example": {
      concrete: general.hasExample,
      prose: general.usageProseDescription,
    },
    "operability.error-handling": {
      applicable: functionApplicable,
      count: handledFunctions.length,
      total: nonTestFunctions.length,
    },
    "operability.version-history": {
      history: general.hasVersionHistory,
      manifestVersion: general.hasManifestVersion,
    },
    "operability.configuration": {
      exists: general.hasConfigurationEvidence,
    },
    "readability.median-function-length": {
      applicable: functionApplicable,
      valid: functionLengthsValid,
      median: median(functionLengths),
    },
    "readability.p90-function-length": {
      applicable: functionApplicable,
      valid: functionLengthsValid,
      p90: p90(functionLengths),
    },
    "readability.large-file-ratio": {
      applicable: deepApplicable,
      valid: sourceLogicalLinesValid,
      count: over500.length,
      total: sourceFiles.length,
    },
    "readability.median-nesting": {
      applicable: functionApplicable,
      valid: nestingDepthsValid,
      median: median(nestingDepths),
    },
    "readability.ambiguous-identifiers": {
      applicable:
        deepApplicable &&
        (language.identifierOccurrences > 0 || !identifierCountsValid),
      valid: identifierCountsValid,
      count: language.ambiguousIdentifierOccurrences,
      total: language.identifierOccurrences,
    },
    "readability.documented-exports": {
      applicable:
        deepApplicable &&
        (language.exportedDeclarations > 0 || !exportCountsValid),
      valid: exportCountsValid,
      count: language.documentedExports,
      total: language.exportedDeclarations,
    },
    "complexity.median-cyclomatic": {
      applicable: functionApplicable,
      valid: cyclomaticValuesValid,
      median: median(cyclomaticValues),
    },
    "complexity.p90-cyclomatic": {
      applicable: functionApplicable,
      valid: cyclomaticValuesValid,
      p90: p90(cyclomaticValues),
    },
    "complexity.max-nesting": {
      applicable: functionApplicable,
      valid: nestingDepthsValid,
      max: maximum(nestingDepths),
    },
    "complexity.very-large-files": {
      applicable: deepApplicable,
      valid: sourceLogicalLinesValid,
      count: over1000.length,
      total: sourceFiles.length,
    },
    "complexity.duplication": {
      applicable:
        deepApplicable &&
        (duplicates.totalEligibleTokens > 0 || !duplicateMetricsValid),
      valid: duplicateMetricsValid,
      ratio: duplicates.ratio,
      count: duplicates.duplicatedTokens,
      total: duplicates.totalEligibleTokens,
    },
    "complexity.circular-imports": {
      applicable: deepApplicable,
      valid: cycleMetricsValid,
      components: cycles.components.length,
      largest: cycles.largestComponentSize,
    },
    "testing.test-files": {
      valid: testFileCountValid,
      count: general.testFileCount,
      configuration: general.hasTestConfiguration,
    },
    "testing.test-source-ratio": {
      applicable: general.supportedSourceFileCount > 0 || !sourceFileCountValid,
      valid: testFileCountValid && sourceFileCountValid,
      count: general.testFileCount,
      total: general.supportedSourceFileCount,
    },
    "testing.ci": { exists: general.hasCi },
    "testing.test-command": {
      structured: general.hasTestCommand,
      documented: general.hasDocumentedTestCommand,
    },
    "testing.static-check": {
      structured: general.hasStaticCheckCommand,
      documented: general.hasDocumentedStaticCheckCommand,
    },
    "testing.coverage": { exists: general.hasCoverageEvidence },
    "maintenance.activity": {
      archived: input.repository.archived,
      elapsedDays: elapsedUtcDays(input.analyzedAt, input.repository.pushedAt),
    },
    "maintenance.lockfile": { exists: general.hasLockfile },
    "maintenance.dependency-updates": {
      exists: general.hasDependencyUpdates,
    },
    "maintenance.templates": { exists: general.hasIssueOrPrTemplates },
    "maintenance.security": { exists: general.hasSecurityPolicy },
    "maintenance.code-of-conduct": { exists: general.hasCodeOfConduct },
    "maintenance.version-history": { exists: general.hasVersionHistory },
    "maintenance.generated-directories": {
      valid: validAnalysisCount(general.committedGeneratedDirectoryCount),
      count: general.committedGeneratedDirectoryCount,
    },
  };
  const functionReferences = sortedReferences(
    nonTestFunctions.map(referenceForFunction),
  );
  const references: Partial<Record<RuleId, FileReference[]>> = {
    "operability.error-handling": sortedReferences(
      handledFunctions.map(referenceForFunction),
    ),
    "readability.median-function-length": functionReferences,
    "readability.p90-function-length": functionReferences,
    "readability.large-file-ratio": sortedReferences(
      over500.map((file) => ({ path: file.path })),
    ),
    "readability.median-nesting": functionReferences,
    "complexity.median-cyclomatic": functionReferences,
    "complexity.p90-cyclomatic": functionReferences,
    "complexity.max-nesting": functionReferences,
    "complexity.very-large-files": sortedReferences(
      over1000.map((file) => ({ path: file.path })),
    ),
    "complexity.duplication": sortedReferences(
      duplicates.evidence.flatMap((item) => [
        { path: item.leftPath },
        { path: item.rightPath },
      ]),
    ),
    "complexity.circular-imports": sortedReferences(
      cycles.components.flatMap((component) =>
        component.map((path) => ({ path })),
      ),
    ),
  };

  return { metrics, references };
}

function dimensionResults(rules: readonly RuleResult[]): DimensionResult[] {
  return (Object.keys(DIMENSION_WEIGHTS) as DimensionKey[]).map((key) => {
    const dimensionRules = rules.filter((rule) => rule.dimension === key);
    const available = dimensionRules.reduce(
      (sum, rule) => sum + rule.available,
      0,
    );
    const earned = dimensionRules.reduce((sum, rule) => sum + rule.earned, 0);

    return {
      key,
      earned,
      available,
      score: available === 0 ? null : Math.round((100 * earned) / available),
      rules: dimensionRules,
    };
  });
}

/** Maps an unrounded overall score to the fixed ruleset `1.0.0` label bands. */
export function overallLabel(rawScore: number): OverallResult["label"] {
  if (rawScore >= 85) return "strong";
  if (rawScore >= 70) return "solid";
  if (rawScore >= 50) return "needs-attention";

  return "limited";
}

/**
 * Applies every ruleset `1.0.0` rule in `RULE_IDS` order, then derives the six
 * ordered dimension results, weighted overall score, and evidence confidence.
 * It consumes static evidence only and never executes repository code.
 */
export function scoreProject(input: ScoreProjectInput): ScoredProject {
  const derived = projectRuleMetrics(input);
  const rules = RULE_IDS.map((id) => ({
    ...scoreRule(id, derived.metrics[id]),
    references: derived.references[id] ?? [],
  }));
  const dimensions = dimensionResults(rules);
  const applicableDimensions = dimensions.filter(
    (dimension) => dimension.available > 0,
  );
  const availableWeight = applicableDimensions.reduce(
    (sum, dimension) => sum + DIMENSION_WEIGHTS[dimension.key],
    0,
  );
  const rawOverall =
    availableWeight === 0
      ? 0
      : (100 *
          applicableDimensions.reduce(
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
  const confidence = calculateConfidence(input.coverage);

  return {
    rules,
    dimensions,
    overall: {
      score: Math.round(rawOverall),
      label: overallLabel(rawOverall),
      generalOnly,
      preliminary: generalOnly || confidence.label === "low",
    },
    confidence,
  };
}
