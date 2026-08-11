import type {
  DimensionKey,
  FileReference,
  FindingSeverity,
  FindingSummary,
  Improvement,
  RuleResult,
  ScoredProject,
  Strength,
} from "../analysis/model";

export type { FindingSummary, ScoredProject } from "../analysis/model";

const MAX_STRENGTHS = 5;
const MAX_STRENGTHS_PER_DIMENSION = 2;
const MAX_REFERENCES = 20;
const PRIORITY_ORDER: Record<FindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function validPath(path: string): boolean {
  let hasControlCharacter = false;

  for (let index = 0; index < path.length; index += 1) {
    const codeUnit = path.charCodeAt(index);

    if (codeUnit <= 31 || (codeUnit >= 127 && codeUnit <= 159)) {
      hasControlCharacter = true;
      break;
    }
  }

  if (
    path.length === 0 ||
    path.length > 1_024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    hasControlCharacter
  ) {
    return false;
  }

  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validLine(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

function sanitizeReferences(
  references: readonly FileReference[],
): FileReference[] {
  const output: FileReference[] = [];
  const seen = new Set<string>();

  for (const reference of references) {
    if (output.length >= MAX_REFERENCES || !validPath(reference.path)) {
      continue;
    }
    const startLine = validLine(reference.startLine);
    const candidateEnd = validLine(reference.endLine);
    const endLine =
      startLine === undefined
        ? undefined
        : Math.max(startLine, candidateEnd ?? startLine);
    const sanitized: FileReference = {
      path: reference.path,
      ...(startLine === undefined ? {} : { startLine }),
      ...(endLine === undefined ? {} : { endLine }),
    };
    const key = `${sanitized.path}:${String(sanitized.startLine ?? "")}:${String(sanitized.endLine ?? "")}`;

    if (!seen.has(key)) {
      seen.add(key);
      output.push(sanitized);
    }
  }

  return output;
}

function hasConcreteEvidence(rule: RuleResult): boolean {
  return (
    Object.keys(rule.evidence.args).length > 0 || rule.references.length > 0
  );
}

function dimensionAvailable(
  scored: ScoredProject,
  dimension: DimensionKey,
): number {
  const recorded = scored.dimensions.find(
    (candidate) => candidate.key === dimension,
  );

  if (recorded !== undefined) {
    return recorded.available;
  }

  return scored.rules
    .filter(
      (rule) => rule.dimension === dimension && rule.state !== "not-applicable",
    )
    .reduce((sum, rule) => sum + rule.available, 0);
}

function failedLostPoints(
  scored: ScoredProject,
  dimension: DimensionKey,
): number {
  return scored.rules
    .filter((rule) => rule.dimension === dimension && rule.state === "failed")
    .reduce((sum, rule) => sum + rule.available, 0);
}

function severityFor(rule: RuleResult, scored: ScoredProject): FindingSeverity {
  const lostPoints = rule.available - rule.earned;
  const available = dimensionAvailable(scored, rule.dimension);
  const clustered =
    rule.state === "failed" &&
    available > 0 &&
    failedLostPoints(scored, rule.dimension) / available >= 0.4;

  if (rule.state === "failed" && (rule.available >= 4 || clustered)) {
    return "high";
  }
  if (rule.state === "failed" || lostPoints >= 2) {
    return "medium";
  }

  return "low";
}

function strengthFrom(rule: RuleResult): Strength {
  return {
    ruleId: rule.id,
    dimension: rule.dimension,
    evidence: rule.evidence,
    references: sanitizeReferences(rule.references),
  };
}

function improvementFrom(rule: RuleResult, scored: ScoredProject): Improvement {
  return {
    ruleId: rule.id,
    dimension: rule.dimension,
    severity: severityFor(rule, scored),
    lostPoints: rule.available - rule.earned,
    evidence: rule.evidence,
    recommendation: rule.recommendation,
    references: sanitizeReferences(rule.references),
  };
}

export function buildFindings(scored: ScoredProject): FindingSummary {
  const strengthCandidates = scored.rules
    .filter((rule) => rule.state === "passed" && hasConcreteEvidence(rule))
    .sort(
      (left, right) =>
        right.available - left.available ||
        left.id.localeCompare(right.id, "en-US"),
    );
  const dimensionCounts = new Map<DimensionKey, number>();
  const strengths: Strength[] = [];

  for (const rule of strengthCandidates) {
    const count = dimensionCounts.get(rule.dimension) ?? 0;

    if (count >= MAX_STRENGTHS_PER_DIMENSION) {
      continue;
    }
    strengths.push(strengthFrom(rule));
    dimensionCounts.set(rule.dimension, count + 1);
    if (strengths.length === MAX_STRENGTHS) {
      break;
    }
  }

  const weaknesses = scored.rules
    .filter(
      (rule) =>
        (rule.state === "failed" || rule.state === "partial") &&
        hasConcreteEvidence(rule),
    )
    .map((rule) => improvementFrom(rule, scored))
    .sort(
      (left, right) =>
        PRIORITY_ORDER[left.severity] - PRIORITY_ORDER[right.severity] ||
        right.lostPoints - left.lostPoints ||
        left.ruleId.localeCompare(right.ruleId, "en-US"),
    );

  return { strengths, weaknesses };
}
