import type { DuplicatePathPairEvidence } from "../../analysis/model";
import {
  orderedCandidates,
  prepareDuplicateCandidateSources as duplicateCandidateSources,
  rangeIsFree,
} from "./duplicate-candidates";
import {
  DUPLICATE_WINDOW_SIZE,
  MAX_DUPLICATE_EVIDENCE,
} from "./duplicate-index";
import type {
  DuplicateCandidate,
  DuplicateFile,
  DuplicateRatioInstrumentation,
} from "./model";
import { comparisonPath, comparePathValues } from "./path-order";

function markRange(occupied: boolean[], start: number, length: number): void {
  for (let index = start; index < start + length; index += 1) {
    occupied[index] = true;
  }
}

function hasFreeDuplicateWindow(occupied: readonly boolean[]): boolean {
  let free = 0;

  for (const duplicate of occupied) {
    free = duplicate ? 0 : free + 1;
    if (free >= DUPLICATE_WINDOW_SIZE) {
      return true;
    }
  }

  return false;
}

export function chooseNonOverlapping(
  files: readonly DuplicateFile[],
  instrumentation?: DuplicateRatioInstrumentation,
): {
  accepted: DuplicateCandidate[];
  occupied: boolean[][];
} {
  const occupied = files.map((file) =>
    Array.from({ length: file.tokens.length }, () => false),
  );
  const fileCanMatch = occupied.map(hasFreeDuplicateWindow);
  const candidates = orderedCandidates(
    files,
    duplicateCandidateSources(files, occupied, fileCanMatch, instrumentation),
    fileCanMatch,
  );
  const accepted: DuplicateCandidate[] = [];

  for (const candidate of candidates) {
    const leftOccupied = occupied[candidate.leftFileIndex];
    const rightOccupied = occupied[candidate.rightFileIndex];

    if (
      leftOccupied === undefined ||
      rightOccupied === undefined ||
      !rangeIsFree(leftOccupied, candidate.leftStart, candidate.length) ||
      !rangeIsFree(rightOccupied, candidate.rightStart, candidate.length)
    ) {
      continue;
    }

    markRange(leftOccupied, candidate.leftStart, candidate.length);
    markRange(rightOccupied, candidate.rightStart, candidate.length);
    fileCanMatch[candidate.leftFileIndex] =
      hasFreeDuplicateWindow(leftOccupied);
    fileCanMatch[candidate.rightFileIndex] =
      hasFreeDuplicateWindow(rightOccupied);
    accepted.push(candidate);
  }

  return { accepted, occupied };
}

export function summarizeEvidence(
  files: readonly DuplicateFile[],
  accepted: readonly DuplicateCandidate[],
): DuplicatePathPairEvidence[] {
  const pathPairs = new Map<string, DuplicatePathPairEvidence>();

  for (const candidate of accepted) {
    const leftPath = files[candidate.leftFileIndex]?.path;
    const rightPath = files[candidate.rightFileIndex]?.path;

    if (leftPath === undefined || rightPath === undefined) {
      continue;
    }
    const key = `${comparisonPath(leftPath)}\0${comparisonPath(rightPath)}`;
    const existing = pathPairs.get(key);

    pathPairs.set(key, {
      leftPath,
      rightPath,
      tokenCount: (existing?.tokenCount ?? 0) + candidate.length,
    });
  }

  return [...pathPairs.values()]
    .sort(
      (left, right) =>
        comparePathValues(left.leftPath, right.leftPath) ||
        comparePathValues(left.rightPath, right.rightPath),
    )
    .slice(0, MAX_DUPLICATE_EVIDENCE);
}
