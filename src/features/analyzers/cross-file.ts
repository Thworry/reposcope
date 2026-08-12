import type {
  DuplicateMetrics,
  ImportCycleMetrics,
  ImportingFile,
  TokenizedFile,
} from "../analysis/model";
import { buildImportGraph } from "./cross-file/import-resolution";
import type { DuplicateFile } from "./cross-file/model";
import { comparePathValues } from "./cross-file/path-order";
import {
  chooseNonOverlapping,
  summarizeEvidence,
} from "./cross-file/duplicate-selection";
import {
  compareComponents,
  stronglyConnectedComponents,
} from "./cross-file/scc";

/** @internal Test-only structural telemetry; it does not affect analysis. */
export interface DuplicateRatioInstrumentation {
  onCandidateSourcesPrepared?: (count: number) => void;
}

function compareDuplicateFiles(
  left: DuplicateFile,
  right: DuplicateFile,
): number {
  return comparePathValues(left.path, right.path);
}

export function computeDuplicateRatio(
  input: readonly TokenizedFile[],
  instrumentation?: DuplicateRatioInstrumentation,
): DuplicateMetrics {
  const files = input
    .filter((file) => !file.isTest)
    .map((file) => ({
      path: file.path,
      tokens: file.normalizedTokens,
    }))
    .sort(compareDuplicateFiles);
  const totalEligibleTokens = files.reduce(
    (total, file) => total + file.tokens.length,
    0,
  );

  if (totalEligibleTokens === 0) {
    return {
      totalEligibleTokens: 0,
      duplicatedTokens: 0,
      ratio: 0,
      evidence: [],
    };
  }

  const { accepted, occupied } = chooseNonOverlapping(files, instrumentation);
  const duplicatedTokens = occupied.reduce(
    (total, file) =>
      total + file.reduce((count, duplicate) => count + Number(duplicate), 0),
    0,
  );

  return {
    totalEligibleTokens,
    duplicatedTokens,
    ratio: duplicatedTokens / totalEligibleTokens,
    evidence: summarizeEvidence(files, accepted),
  };
}

export function findCircularImports(
  input: readonly ImportingFile[],
): ImportCycleMetrics {
  const components = stronglyConnectedComponents(buildImportGraph(input))
    .filter((component) => component.length > 1)
    .sort(compareComponents);

  return {
    components,
    largestComponentSize: components[0]?.length ?? 0,
  };
}
