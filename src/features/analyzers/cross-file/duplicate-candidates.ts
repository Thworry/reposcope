import type {
  CandidateHeapEntry,
  CandidateSource,
  DuplicateCandidate,
  DuplicateFile,
  DuplicateRatioInstrumentation,
  MatchRadixNode,
  PreparedWindowGroup,
  RadixEdge,
  RankedGroupOccurrence,
  RankPartition,
} from "./model";
import {
  DUPLICATE_WINDOW_SIZE,
  filePairKey,
  identicalFileCandidates,
  minimalPeriod,
  prepareGeneralGroups,
} from "./duplicate-index";
import { comparePathValues } from "./path-order";

function compatiblePeriodDeltas(
  left: readonly string[],
  right: readonly string[],
  period: number,
): number[] {
  const deltas: number[] = [];

  for (let delta = 0; delta < period; delta += 1) {
    let compatible = true;

    for (let index = 0; index < period; index += 1) {
      if (left[index] !== right[(index + delta) % period]) {
        compatible = false;
        break;
      }
    }
    if (compatible) {
      deltas.push(delta);
    }
  }

  return deltas;
}

function firstCongruentAtOrAfter(
  minimum: number,
  residue: number,
  modulus: number,
): number {
  const difference = (((residue - minimum) % modulus) + modulus) % modulus;

  return minimum + difference;
}

function lastCongruentAtOrBefore(
  maximum: number,
  residue: number,
  modulus: number,
): number {
  const difference = (((maximum - residue) % modulus) + modulus) % modulus;

  return maximum - difference;
}

function periodicDeltaSource(
  files: readonly DuplicateFile[],
  leftFileIndex: number,
  rightFileIndex: number,
  initialDelta: number,
  finalDelta: number,
  deltaStep: number,
): CandidateSource {
  let delta = initialDelta;

  return {
    fileIndices: [leftFileIndex, rightFileIndex],
    next: () => {
      if (
        (deltaStep > 0 && delta > finalDelta) ||
        (deltaStep < 0 && delta < finalDelta)
      ) {
        return null;
      }
      const leftTokens = files[leftFileIndex]?.tokens ?? [];
      const rightTokens = files[rightFileIndex]?.tokens ?? [];
      const leftStart = Math.max(0, -delta);
      const rightStart = Math.max(0, delta);
      const candidate = {
        leftFileIndex,
        leftStart,
        rightFileIndex,
        rightStart,
        length: Math.min(
          leftTokens.length - leftStart,
          rightTokens.length - rightStart,
        ),
      };

      delta += deltaStep;
      return candidate;
    },
  };
}

function periodicCandidateSources(
  files: readonly DuplicateFile[],
  alreadySkipped: ReadonlySet<string>,
): { sources: CandidateSource[]; skippedPairs: Set<string> } {
  const periods = files.map((file) => minimalPeriod(file.tokens));
  const sources: CandidateSource[] = [];
  const skippedPairs = new Set<string>();

  for (
    let leftFileIndex = 0;
    leftFileIndex < files.length;
    leftFileIndex += 1
  ) {
    const leftTokens = files[leftFileIndex]?.tokens ?? [];
    const period = periods[leftFileIndex] ?? 0;

    if (
      leftTokens.length < DUPLICATE_WINDOW_SIZE ||
      period === 0 ||
      period > DUPLICATE_WINDOW_SIZE
    ) {
      continue;
    }
    for (
      let rightFileIndex = leftFileIndex + 1;
      rightFileIndex < files.length;
      rightFileIndex += 1
    ) {
      const pairKey = filePairKey(leftFileIndex, rightFileIndex);
      const rightTokens = files[rightFileIndex]?.tokens ?? [];

      if (
        alreadySkipped.has(pairKey) ||
        periods[rightFileIndex] !== period ||
        rightTokens.length < DUPLICATE_WINDOW_SIZE
      ) {
        continue;
      }
      const compatibleDeltas = compatiblePeriodDeltas(
        leftTokens,
        rightTokens,
        period,
      );

      if (compatibleDeltas.length === 0) {
        continue;
      }

      const minimumDelta = -(leftTokens.length - DUPLICATE_WINDOW_SIZE);
      const maximumDelta = rightTokens.length - DUPLICATE_WINDOW_SIZE;
      const sourceCountBeforePair = sources.length;

      for (const residue of compatibleDeltas) {
        const firstNonNegative = firstCongruentAtOrAfter(
          Math.max(0, minimumDelta),
          residue,
          period,
        );
        if (firstNonNegative <= maximumDelta) {
          sources.push(
            periodicDeltaSource(
              files,
              leftFileIndex,
              rightFileIndex,
              firstNonNegative,
              maximumDelta,
              period,
            ),
          );
        }

        const lastNegative = lastCongruentAtOrBefore(
          Math.min(-1, maximumDelta),
          residue,
          period,
        );
        if (lastNegative >= minimumDelta) {
          sources.push(
            periodicDeltaSource(
              files,
              leftFileIndex,
              rightFileIndex,
              lastNegative,
              minimumDelta,
              -period,
            ),
          );
        }
      }
      if (sources.length > sourceCountBeforePair) {
        skippedPairs.add(pairKey);
      }
    }
  }

  return { sources, skippedPairs };
}

function candidateComparator(
  files: readonly DuplicateFile[],
): (left: DuplicateCandidate, right: DuplicateCandidate) => number {
  return (left, right) =>
    right.length - left.length ||
    comparePathValues(
      files[left.leftFileIndex]?.path ?? "",
      files[right.leftFileIndex]?.path ?? "",
    ) ||
    comparePathValues(
      files[left.rightFileIndex]?.path ?? "",
      files[right.rightFileIndex]?.path ?? "",
    ) ||
    left.leftStart - right.leftStart ||
    left.rightStart - right.rightStart;
}

function groupOccurrences(group: PreparedWindowGroup): {
  occurrences: RankedGroupOccurrence[];
  occurrencesByFile: ReadonlyMap<number, readonly RankedGroupOccurrence[]>;
  fileIndices: number[];
} {
  const fileIndices = [...group.startsByFile.keys()].sort(
    (left, right) => left - right,
  );
  const occurrences: RankedGroupOccurrence[] = [];
  const occurrencesByFile = new Map<number, RankedGroupOccurrence[]>();

  for (const fileIndex of fileIndices) {
    const perFile = (group.startsByFile.get(fileIndex) ?? []).map((start) => ({
      fileIndex,
      start,
      rank: -1,
    }));

    occurrences.push(...perFile);
    occurrencesByFile.set(fileIndex, perFile);
  }

  return { occurrences, occurrencesByFile, fileIndices };
}

function hasCanonicalPair(
  files: readonly DuplicateFile[],
  occurrencesByFile: ReadonlyMap<number, readonly RankedGroupOccurrence[]>,
  fileIndices: readonly number[],
  skippedPairs: ReadonlySet<string>,
): boolean {
  const previousTokens = new Map<number, Set<string | null>>();

  for (const fileIndex of fileIndices) {
    const tokens = files[fileIndex]?.tokens ?? [];
    const values = new Set<string | null>();

    for (const occurrence of occurrencesByFile.get(fileIndex) ?? []) {
      values.add(
        occurrence.start === 0 ? null : (tokens[occurrence.start - 1] ?? null),
      );
    }
    previousTokens.set(fileIndex, values);
  }

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
      for (const leftPrevious of previousTokens.get(leftFileIndex) ?? []) {
        for (const rightPrevious of previousTokens.get(rightFileIndex) ?? []) {
          if (
            leftPrevious === null ||
            rightPrevious === null ||
            leftPrevious !== rightPrevious
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function createRadixNode(depth: number): MatchRadixNode {
  return {
    depth,
    terminals: [],
    children: new Map(),
    rangeStart: 0,
    rangeEnd: 0,
    partitions: [],
    fileIndices: [],
  };
}

function extensionToken(
  files: readonly DuplicateFile[],
  occurrence: RankedGroupOccurrence,
  depth: number,
): string | undefined {
  return files[occurrence.fileIndex]?.tokens[
    occurrence.start + DUPLICATE_WINDOW_SIZE + depth
  ];
}

function extensionLength(
  files: readonly DuplicateFile[],
  occurrence: RankedGroupOccurrence,
): number {
  return Math.max(
    0,
    (files[occurrence.fileIndex]?.tokens.length ?? 0) -
      occurrence.start -
      DUPLICATE_WINDOW_SIZE,
  );
}

function insertRadixOccurrence(
  root: MatchRadixNode,
  files: readonly DuplicateFile[],
  occurrence: RankedGroupOccurrence,
): void {
  const finalDepth = extensionLength(files, occurrence);
  let node = root;

  for (;;) {
    if (node.depth === finalDepth) {
      node.terminals.push(occurrence);
      return;
    }
    const token = extensionToken(files, occurrence, node.depth);

    if (token === undefined) {
      node.terminals.push(occurrence);
      return;
    }
    const edge = node.children.get(token);

    if (edge === undefined) {
      const leaf = createRadixNode(finalDepth);

      leaf.terminals.push(occurrence);
      node.children.set(token, { representative: occurrence, child: leaf });
      return;
    }

    const comparisonEnd = Math.min(edge.child.depth, finalDepth);
    let matchedDepth = node.depth;

    while (
      matchedDepth < comparisonEnd &&
      extensionToken(files, edge.representative, matchedDepth) ===
        extensionToken(files, occurrence, matchedDepth)
    ) {
      matchedDepth += 1;
    }
    if (matchedDepth === edge.child.depth) {
      node = edge.child;
      continue;
    }

    const middle = createRadixNode(matchedDepth);
    const existingToken = extensionToken(
      files,
      edge.representative,
      matchedDepth,
    );

    node.children.set(token, {
      representative: edge.representative,
      child: middle,
    });
    if (existingToken !== undefined) {
      middle.children.set(existingToken, edge);
    } else {
      middle.terminals.push(edge.representative);
    }

    if (matchedDepth === finalDepth) {
      middle.terminals.push(occurrence);
    } else {
      const newToken = extensionToken(files, occurrence, matchedDepth);

      if (newToken === undefined) {
        middle.terminals.push(occurrence);
      } else {
        const leaf = createRadixNode(finalDepth);

        leaf.terminals.push(occurrence);
        middle.children.set(newToken, {
          representative: occurrence,
          child: leaf,
        });
      }
    }
    return;
  }
}

interface RadixRankFrame {
  node: MatchRadixNode;
  edges: RadixEdge[];
  nextChild: number;
  files: Set<number>;
  partitions: RankPartition[];
}

function createRadixRankFrame(
  node: MatchRadixNode,
  ranked: RankedGroupOccurrence[],
): RadixRankFrame {
  node.rangeStart = ranked.length;
  const files = new Set<number>();
  const partitions: RankPartition[] = [];

  for (const terminal of node.terminals) {
    const start = ranked.length;

    terminal.rank = start;
    ranked.push(terminal);
    files.add(terminal.fileIndex);
    partitions.push({ start, end: ranked.length });
  }

  return {
    node,
    edges: [...node.children.values()],
    nextChild: 0,
    files,
    partitions,
  };
}

function rankRadixTree(
  root: MatchRadixNode,
  ranked: RankedGroupOccurrence[],
  candidateNodes: MatchRadixNode[],
): void {
  const stack = [createRadixRankFrame(root, ranked)];

  while (stack.length > 0) {
    const frame = stack.at(-1);

    if (frame === undefined) {
      break;
    }
    const edge = frame.edges[frame.nextChild];

    if (edge !== undefined) {
      frame.nextChild += 1;
      stack.push(createRadixRankFrame(edge.child, ranked));
      continue;
    }

    frame.node.rangeEnd = ranked.length;
    frame.node.partitions = frame.partitions;
    frame.node.fileIndices = [...frame.files].sort(
      (left, right) => left - right,
    );
    if (frame.partitions.length > 1 && frame.files.size > 1) {
      candidateNodes.push(frame.node);
    }
    stack.pop();

    const parent = stack.at(-1);

    if (parent !== undefined) {
      for (const fileIndex of frame.files) {
        parent.files.add(fileIndex);
      }
      parent.partitions.push({
        start: frame.node.rangeStart,
        end: frame.node.rangeEnd,
      });
    }
  }
}

function partitionAtRank(node: MatchRadixNode, rank: number): number {
  let low = 0;
  let high = node.partitions.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const partition = node.partitions[middle];

    if (partition === undefined || rank < partition.start) {
      high = middle;
    } else if (rank >= partition.end) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return -1;
}

function radixNodeCandidateSource(
  node: MatchRadixNode,
  files: readonly DuplicateFile[],
  occurrencesByFile: ReadonlyMap<number, readonly RankedGroupOccurrence[]>,
  skippedPairs: ReadonlySet<string>,
  occupied: readonly (readonly boolean[])[],
  fileCanMatch: readonly boolean[],
): CandidateSource {
  let leftFileCursor = 0;
  let rightFileCursor = 1;
  let leftOccurrenceCursor = 0;
  let rightOccurrenceCursor = 0;
  const length = DUPLICATE_WINDOW_SIZE + node.depth;

  return {
    fileIndices: node.fileIndices,
    next: () => {
      while (leftFileCursor < node.fileIndices.length - 1) {
        if (rightFileCursor >= node.fileIndices.length) {
          leftFileCursor += 1;
          rightFileCursor = leftFileCursor + 1;
          leftOccurrenceCursor = 0;
          rightOccurrenceCursor = 0;
          continue;
        }
        const leftFileIndex = node.fileIndices[leftFileCursor];
        const rightFileIndex = node.fileIndices[rightFileCursor];

        if (
          leftFileIndex === undefined ||
          rightFileIndex === undefined ||
          fileCanMatch[leftFileIndex] !== true ||
          fileCanMatch[rightFileIndex] !== true ||
          skippedPairs.has(filePairKey(leftFileIndex, rightFileIndex))
        ) {
          rightFileCursor += 1;
          leftOccurrenceCursor = 0;
          rightOccurrenceCursor = 0;
          continue;
        }
        const leftOccurrences = occurrencesByFile.get(leftFileIndex) ?? [];
        const rightOccurrences = occurrencesByFile.get(rightFileIndex) ?? [];

        while (leftOccurrenceCursor < leftOccurrences.length) {
          const leftOccurrence = leftOccurrences[leftOccurrenceCursor];

          if (
            leftOccurrence === undefined ||
            leftOccurrence.rank < node.rangeStart ||
            leftOccurrence.rank >= node.rangeEnd ||
            !rangeIsFree(
              occupied[leftFileIndex] ?? [],
              leftOccurrence.start,
              length,
            )
          ) {
            leftOccurrenceCursor += 1;
            rightOccurrenceCursor = 0;
            continue;
          }

          while (rightOccurrenceCursor < rightOccurrences.length) {
            const rightOccurrence = rightOccurrences[rightOccurrenceCursor];

            rightOccurrenceCursor += 1;
            if (
              rightOccurrence === undefined ||
              rightOccurrence.rank < node.rangeStart ||
              rightOccurrence.rank >= node.rangeEnd ||
              !rangeIsFree(
                occupied[rightFileIndex] ?? [],
                rightOccurrence.start,
                length,
              ) ||
              partitionAtRank(node, leftOccurrence.rank) ===
                partitionAtRank(node, rightOccurrence.rank)
            ) {
              continue;
            }
            const leftTokens = files[leftFileIndex]?.tokens ?? [];
            const rightTokens = files[rightFileIndex]?.tokens ?? [];

            if (
              leftOccurrence.start > 0 &&
              rightOccurrence.start > 0 &&
              leftTokens[leftOccurrence.start - 1] ===
                rightTokens[rightOccurrence.start - 1]
            ) {
              continue;
            }

            return {
              leftFileIndex,
              leftStart: leftOccurrence.start,
              rightFileIndex,
              rightStart: rightOccurrence.start,
              length,
            };
          }
          leftOccurrenceCursor += 1;
          rightOccurrenceCursor = 0;
        }
        rightFileCursor += 1;
        leftOccurrenceCursor = 0;
        rightOccurrenceCursor = 0;
      }

      return null;
    },
  };
}

function generalGroupCandidateSource(
  files: readonly DuplicateFile[],
  group: PreparedWindowGroup,
  skippedPairs: ReadonlySet<string>,
  occupied: readonly (readonly boolean[])[],
  fileCanMatch: readonly boolean[],
): CandidateSource {
  const { occurrences, occurrencesByFile, fileIndices } =
    groupOccurrences(group);
  let initialized = false;
  let pendingSource: CandidateSource | null = null;
  const heap: CandidateHeapEntry[] = [];
  const compare = candidateComparator(files);

  const initialize = (): void => {
    initialized = true;
    if (
      !hasCanonicalPair(files, occurrencesByFile, fileIndices, skippedPairs)
    ) {
      return;
    }

    const root = createRadixNode(0);

    for (const occurrence of occurrences) {
      insertRadixOccurrence(root, files, occurrence);
    }
    const ranked: RankedGroupOccurrence[] = [];
    const candidateNodes: MatchRadixNode[] = [];

    rankRadixTree(root, ranked, candidateNodes);
    for (const node of candidateNodes) {
      const source = radixNodeCandidateSource(
        node,
        files,
        occurrencesByFile,
        skippedPairs,
        occupied,
        fileCanMatch,
      );

      if (!sourceCanContinue(source, fileCanMatch)) {
        continue;
      }
      const candidate = source.next();

      if (candidate !== null) {
        pushCandidateHeap(heap, { candidate, source }, compare);
      }
    }
  };

  return {
    fileIndices,
    next: () => {
      if (!initialized) {
        initialize();
      }
      if (
        pendingSource !== null &&
        sourceCanContinue(pendingSource, fileCanMatch)
      ) {
        const candidate = pendingSource.next();

        if (candidate !== null) {
          pushCandidateHeap(
            heap,
            { candidate, source: pendingSource },
            compare,
          );
        }
      }
      pendingSource = null;

      while (heap.length > 0) {
        const entry = popCandidateHeap(heap, compare);

        if (entry !== null && sourceCanContinue(entry.source, fileCanMatch)) {
          pendingSource = entry.source;
          return entry.candidate;
        }
      }

      return null;
    },
  };
}

function singletonCandidateSource(
  candidate: DuplicateCandidate,
): CandidateSource {
  let pending = true;

  return {
    fileIndices: [candidate.leftFileIndex, candidate.rightFileIndex],
    next: () => {
      if (!pending) {
        return null;
      }
      pending = false;
      return candidate;
    },
  };
}

function pushCandidateHeap(
  heap: CandidateHeapEntry[],
  entry: CandidateHeapEntry,
  compare: (left: DuplicateCandidate, right: DuplicateCandidate) => number,
): void {
  heap.push(entry);
  let index = heap.length - 1;

  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentEntry = heap[parent];

    if (
      parentEntry === undefined ||
      compare(entry.candidate, parentEntry.candidate) >= 0
    ) {
      break;
    }
    heap[index] = parentEntry;
    index = parent;
  }
  heap[index] = entry;
}

function popCandidateHeap(
  heap: CandidateHeapEntry[],
  compare: (left: DuplicateCandidate, right: DuplicateCandidate) => number,
): CandidateHeapEntry | null {
  const first = heap[0];
  const last = heap.pop();

  if (first === undefined || last === undefined) {
    return null;
  }
  if (heap.length === 0) {
    return first;
  }

  let index = 0;
  while (index < heap.length) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    const left = heap[leftIndex];
    const right = heap[rightIndex];
    let nextIndex = index;

    if (left !== undefined && compare(left.candidate, last.candidate) < 0) {
      nextIndex = leftIndex;
    }
    if (
      right !== undefined &&
      compare(
        right.candidate,
        (nextIndex === index ? last : heap[nextIndex])?.candidate ??
          last.candidate,
      ) < 0
    ) {
      nextIndex = rightIndex;
    }
    if (nextIndex === index) {
      break;
    }
    heap[index] = heap[nextIndex] ?? last;
    index = nextIndex;
  }
  heap[index] = last;

  return first;
}

export function prepareDuplicateCandidateSources(
  files: readonly DuplicateFile[],
  occupied: readonly (readonly boolean[])[],
  fileCanMatch: readonly boolean[],
  instrumentation?: DuplicateRatioInstrumentation,
): CandidateSource[] {
  const identical = identicalFileCandidates(files);
  const periodic = periodicCandidateSources(files, identical.skippedPairs);
  const skippedPairs = new Set([
    ...identical.skippedPairs,
    ...periodic.skippedPairs,
  ]);
  const general = prepareGeneralGroups(files, skippedPairs);
  const sources = [...periodic.sources];

  for (const candidate of identical.candidates) {
    sources.push(singletonCandidateSource(candidate));
  }
  for (const group of general) {
    sources.push(
      generalGroupCandidateSource(
        files,
        group,
        skippedPairs,
        occupied,
        fileCanMatch,
      ),
    );
  }
  instrumentation?.onCandidateSourcesPrepared?.(sources.length);

  return sources;
}

function sourceCanContinue(
  source: CandidateSource,
  fileCanMatch: readonly boolean[],
): boolean {
  let matchableFiles = 0;

  for (const fileIndex of source.fileIndices) {
    if (fileCanMatch[fileIndex] === true) {
      matchableFiles += 1;
      if (matchableFiles >= 2) {
        return true;
      }
    }
  }

  return false;
}

export function* orderedCandidates(
  files: readonly DuplicateFile[],
  sources: readonly CandidateSource[],
  fileCanMatch: readonly boolean[],
): Generator<DuplicateCandidate> {
  const compare = candidateComparator(files);
  const heap: CandidateHeapEntry[] = [];

  for (const source of sources) {
    if (!sourceCanContinue(source, fileCanMatch)) {
      continue;
    }
    const candidate = source.next();

    if (candidate !== null) {
      pushCandidateHeap(heap, { candidate, source }, compare);
    }
  }

  while (heap.length > 0) {
    const entry = popCandidateHeap(heap, compare);

    if (entry === null) {
      break;
    }
    if (!sourceCanContinue(entry.source, fileCanMatch)) {
      continue;
    }
    yield entry.candidate;
    const next = sourceCanContinue(entry.source, fileCanMatch)
      ? entry.source.next()
      : null;

    if (next !== null) {
      pushCandidateHeap(
        heap,
        { candidate: next, source: entry.source },
        compare,
      );
    }
  }
}

export function rangeIsFree(
  occupied: readonly boolean[],
  start: number,
  length: number,
): boolean {
  for (let index = start; index < start + length; index += 1) {
    if (occupied[index] === true) {
      return false;
    }
  }

  return true;
}
