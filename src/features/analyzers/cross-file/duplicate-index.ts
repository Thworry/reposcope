import type {
  DuplicateCandidate,
  DuplicateFile,
  ExactWindowGroup,
  PreparedWindowGroup,
  WindowOccurrence,
} from "./model";

export const DUPLICATE_WINDOW_SIZE = 50;
export const MAX_DUPLICATE_EVIDENCE = 20;
const HASH_BASE = 16_777_619;

function tokenHash(token: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, HASH_BASE);
  }

  return hash >>> 0;
}

function windowHashes(tokens: readonly string[], size: number): number[] {
  if (tokens.length < size) {
    return [];
  }

  const prefix = new Uint32Array(tokens.length + 1);
  let power = 1;

  for (let index = 0; index < size; index += 1) {
    power = Math.imul(power, HASH_BASE) >>> 0;
  }
  for (let index = 0; index < tokens.length; index += 1) {
    prefix[index + 1] =
      (Math.imul(prefix[index] ?? 0, HASH_BASE) +
        tokenHash(tokens[index] ?? "")) >>>
      0;
  }

  const hashes: number[] = [];
  for (let start = 0; start <= tokens.length - size; start += 1) {
    const endHash = prefix[start + size] ?? 0;
    const startHash = Math.imul(prefix[start] ?? 0, power) >>> 0;

    hashes.push((endHash - startHash) >>> 0);
  }

  return hashes;
}

function indexWindows(
  files: readonly DuplicateFile[],
  size: number,
): Map<number, WindowOccurrence[]> {
  const buckets = new Map<number, WindowOccurrence[]>();

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const hashes = windowHashes(files[fileIndex]?.tokens ?? [], size);

    for (let start = 0; start < hashes.length; start += 1) {
      const hash = hashes[start];

      if (hash === undefined) {
        continue;
      }
      const occurrences = buckets.get(hash) ?? [];

      occurrences.push({ fileIndex, start });
      buckets.set(hash, occurrences);
    }
  }

  return buckets;
}

function equalWindow(
  left: readonly string[],
  leftStart: number,
  right: readonly string[],
  rightStart: number,
  length: number,
): boolean {
  for (let offset = 0; offset < length; offset += 1) {
    if (left[leftStart + offset] !== right[rightStart + offset]) {
      return false;
    }
  }

  return true;
}

export function filePairKey(
  leftFileIndex: number,
  rightFileIndex: number,
): string {
  return `${String(leftFileIndex)}:${String(rightFileIndex)}`;
}

function equalTokenArrays(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && equalWindow(left, 0, right, 0, left.length)
  );
}

function wholeFileHash(tokens: readonly string[]): number {
  let hash = 0;

  for (const token of tokens) {
    hash = (Math.imul(hash, HASH_BASE) + tokenHash(token)) >>> 0;
  }

  return hash;
}

export function identicalFileCandidates(files: readonly DuplicateFile[]): {
  candidates: DuplicateCandidate[];
  skippedPairs: Set<string>;
} {
  const fingerprintBuckets = new Map<string, number[]>();

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const tokens = files[fileIndex]?.tokens ?? [];

    if (tokens.length < DUPLICATE_WINDOW_SIZE) {
      continue;
    }
    const fingerprint = `${String(tokens.length)}:${String(wholeFileHash(tokens))}`;
    const bucket = fingerprintBuckets.get(fingerprint) ?? [];

    bucket.push(fileIndex);
    fingerprintBuckets.set(fingerprint, bucket);
  }

  const candidates: DuplicateCandidate[] = [];
  const skippedPairs = new Set<string>();

  for (const bucket of fingerprintBuckets.values()) {
    const identicalGroups: number[][] = [];

    for (const fileIndex of bucket) {
      const tokens = files[fileIndex]?.tokens ?? [];
      const group = identicalGroups.find((candidateGroup) => {
        const representative = candidateGroup[0];

        return (
          representative !== undefined &&
          equalTokenArrays(files[representative]?.tokens ?? [], tokens)
        );
      });

      if (group === undefined) {
        identicalGroups.push([fileIndex]);
      } else {
        group.push(fileIndex);
      }
    }

    for (const group of identicalGroups) {
      // A whole-file match sorts before every shifted match for this pair. If
      // rejected, an earlier equal-length candidate already occupies an entire
      // file, so no shifted match for the pair could later be accepted.
      for (let left = 0; left < group.length; left += 1) {
        const leftFileIndex = group[left];

        if (leftFileIndex === undefined) {
          continue;
        }
        for (let right = left + 1; right < group.length; right += 1) {
          const rightFileIndex = group[right];

          if (rightFileIndex === undefined) {
            continue;
          }
          candidates.push({
            leftFileIndex,
            leftStart: 0,
            rightFileIndex,
            rightStart: 0,
            length: files[leftFileIndex]?.tokens.length ?? 0,
          });
          skippedPairs.add(filePairKey(leftFileIndex, rightFileIndex));
        }
      }
    }
  }

  return { candidates, skippedPairs };
}

export function minimalPeriod(tokens: readonly string[]): number {
  if (tokens.length === 0) {
    return 0;
  }

  const prefix = new Uint32Array(tokens.length);
  for (let index = 1; index < tokens.length; index += 1) {
    let matched = prefix[index - 1] ?? 0;

    while (matched > 0 && tokens[index] !== tokens[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (tokens[index] === tokens[matched]) {
      matched += 1;
    }
    prefix[index] = matched;
  }

  return tokens.length - (prefix.at(-1) ?? 0);
}

export function groupExactWindows(
  files: readonly DuplicateFile[],
  occurrences: readonly WindowOccurrence[],
): ExactWindowGroup[] {
  const groups: ExactWindowGroup[] = [];

  // The rolling hash is only an index. Exact token comparison keeps collisions
  // from creating candidate matches.
  for (const occurrence of occurrences) {
    const tokens = files[occurrence.fileIndex]?.tokens;

    if (tokens === undefined) {
      continue;
    }
    const group = groups.find((candidateGroup) => {
      const representative = candidateGroup.representative;
      const representativeTokens = files[representative.fileIndex]?.tokens;

      return (
        representativeTokens !== undefined &&
        equalWindow(
          representativeTokens,
          representative.start,
          tokens,
          occurrence.start,
          DUPLICATE_WINDOW_SIZE,
        )
      );
    });

    if (group === undefined) {
      groups.push({ representative: occurrence, occurrences: [occurrence] });
    } else {
      group.occurrences.push(occurrence);
    }
  }

  return groups;
}

function hasAnyUnskippedFilePair(
  files: readonly DuplicateFile[],
  skippedPairs: ReadonlySet<string>,
): boolean {
  for (let left = 0; left < files.length; left += 1) {
    if ((files[left]?.tokens.length ?? 0) < DUPLICATE_WINDOW_SIZE) {
      continue;
    }
    for (let right = left + 1; right < files.length; right += 1) {
      if (
        (files[right]?.tokens.length ?? 0) >= DUPLICATE_WINDOW_SIZE &&
        !skippedPairs.has(filePairKey(left, right))
      ) {
        return true;
      }
    }
  }

  return false;
}

export function prepareGeneralGroups(
  files: readonly DuplicateFile[],
  skippedPairs: ReadonlySet<string>,
): PreparedWindowGroup[] {
  if (!hasAnyUnskippedFilePair(files, skippedPairs)) {
    return [];
  }

  const groups: PreparedWindowGroup[] = [];
  const buckets = indexWindows(files, DUPLICATE_WINDOW_SIZE);
  const orderedHashes = [...buckets.keys()].sort((left, right) => left - right);

  for (const hash of orderedHashes) {
    const occurrences = buckets.get(hash) ?? [];

    for (const exactGroup of groupExactWindows(files, occurrences)) {
      const startsByFile = new Map<number, number[]>();

      for (const occurrence of exactGroup.occurrences) {
        const starts = startsByFile.get(occurrence.fileIndex) ?? [];

        starts.push(occurrence.start);
        startsByFile.set(occurrence.fileIndex, starts);
      }

      const fileIndices = [...startsByFile.keys()].sort(
        (left, right) => left - right,
      );
      let hasUnskippedPair = false;

      for (let left = 0; left < fileIndices.length; left += 1) {
        const leftFileIndex = fileIndices[left];

        if (leftFileIndex === undefined) {
          continue;
        }
        for (let right = left + 1; right < fileIndices.length; right += 1) {
          const rightFileIndex = fileIndices[right];

          if (
            rightFileIndex === undefined ||
            skippedPairs.has(filePairKey(leftFileIndex, rightFileIndex))
          ) {
            continue;
          }
          hasUnskippedPair = true;
          break;
        }
        if (hasUnskippedPair) {
          break;
        }
      }
      if (hasUnskippedPair) {
        groups.push({ startsByFile });
      }
    }
  }

  return groups;
}
