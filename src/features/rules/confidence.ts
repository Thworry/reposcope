import type { ConfidenceResult, CoverageSummary } from "../analysis/model";

export type { ConfidenceResult } from "../analysis/model";

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeRatio(numerator: number, denominator: number): number {
  const safeNumerator = finiteNonNegative(numerator);
  const safeDenominator = finiteNonNegative(denominator);

  if (safeDenominator === 0) {
    return 0;
  }

  return Math.min(1, safeNumerator / safeDenominator);
}

export function confidenceLabel(rawPercent: number): ConfidenceResult["label"] {
  if (rawPercent >= 80) {
    return "high";
  }
  if (rawPercent >= 60) {
    return "medium";
  }

  return "low";
}

export function calculateConfidence(
  coverage: CoverageSummary,
): ConfidenceResult {
  const treeCompleteness = coverage.treeComplete ? 1 : 0;
  const eligibleByteCoverage = safeRatio(
    coverage.fetchedBytes,
    coverage.eligibleBytes,
  );
  const supportedParserCoverage = safeRatio(
    coverage.parsedSupportedBytes,
    coverage.eligibleSourceBytes,
  );
  const raw =
    100 *
    (0.25 * treeCompleteness +
      0.35 * eligibleByteCoverage +
      0.4 * supportedParserCoverage);

  return {
    percent: Math.round(raw),
    label: confidenceLabel(raw),
  };
}
