import type { ImportingFile } from "../../analysis/model";

export interface DuplicateRatioInstrumentation {
  onCandidateSourcesPrepared?: (count: number) => void;
}

export interface DuplicateFile {
  path: string;
  tokens: readonly string[];
}

export interface WindowOccurrence {
  fileIndex: number;
  start: number;
}

export interface DuplicateCandidate {
  leftFileIndex: number;
  leftStart: number;
  rightFileIndex: number;
  rightStart: number;
  length: number;
}

export interface CandidateSource {
  fileIndices: readonly number[];
  next: () => DuplicateCandidate | null;
}

export interface CandidateHeapEntry {
  candidate: DuplicateCandidate;
  source: CandidateSource;
}

export interface ExactWindowGroup {
  representative: WindowOccurrence;
  occurrences: WindowOccurrence[];
}

export interface PreparedWindowGroup {
  startsByFile: ReadonlyMap<number, readonly number[]>;
}

export interface RankedGroupOccurrence extends WindowOccurrence {
  rank: number;
}

export interface RadixEdge {
  representative: RankedGroupOccurrence;
  child: MatchRadixNode;
}

export interface RankPartition {
  start: number;
  end: number;
}

export interface MatchRadixNode {
  depth: number;
  terminals: RankedGroupOccurrence[];
  children: Map<string, RadixEdge>;
  rangeStart: number;
  rangeEnd: number;
  partitions: RankPartition[];
  fileIndices: readonly number[];
}

export interface GraphFile {
  path: string;
  comparisonPath: string;
  language: ImportingFile["language"];
  relativeImports: readonly string[];
  relativeImportCandidates: readonly string[];
  topLevelDefinedNames: readonly string[];
}
