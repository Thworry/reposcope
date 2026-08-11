import type {
  DuplicateMetrics,
  DuplicatePathPairEvidence,
  ImportCycleMetrics,
  ImportingFile,
  TokenizedFile,
} from "../analysis/model";

const DUPLICATE_WINDOW_SIZE = 50;
const MAX_DUPLICATE_EVIDENCE = 20;
const HASH_BASE = 16_777_619;
const JS_TS_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".d.ts",
] as const;
const JS_TS_INDEX_FILES = JS_TS_EXTENSIONS.map(
  (extension) => `index${extension}`,
);
const PYTHON_MODULE_FILES = [".py", ".pyi"] as const;
const PYTHON_PACKAGE_FILES = ["__init__.py", "__init__.pyi"] as const;

interface DuplicateFile {
  path: string;
  tokens: readonly string[];
}

interface WindowOccurrence {
  fileIndex: number;
  start: number;
}

interface DuplicateCandidate {
  leftFileIndex: number;
  leftStart: number;
  rightFileIndex: number;
  rightStart: number;
  length: number;
}

interface GraphFile {
  path: string;
  comparisonPath: string;
  language: ImportingFile["language"];
  relativeImports: readonly string[];
}

function comparisonPath(path: string): string {
  return path.toLocaleLowerCase("en-US");
}

function comparePathValues(left: string, right: string): number {
  const normalizedLeft = comparisonPath(left);
  const normalizedRight = comparisonPath(right);

  return (
    normalizedLeft.localeCompare(normalizedRight, "en-US") ||
    left.localeCompare(right, "en-US")
  );
}

function compareDuplicateFiles(
  left: DuplicateFile,
  right: DuplicateFile,
): number {
  return comparePathValues(left.path, right.path);
}

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

function extendMatch(
  files: readonly DuplicateFile[],
  leftOccurrence: WindowOccurrence,
  rightOccurrence: WindowOccurrence,
): DuplicateCandidate | null {
  let leftFileIndex = leftOccurrence.fileIndex;
  let leftStart = leftOccurrence.start;
  let rightFileIndex = rightOccurrence.fileIndex;
  let rightStart = rightOccurrence.start;

  if (leftFileIndex === rightFileIndex) {
    return null;
  }
  if (leftFileIndex > rightFileIndex) {
    [leftFileIndex, rightFileIndex] = [rightFileIndex, leftFileIndex];
    [leftStart, rightStart] = [rightStart, leftStart];
  }

  const leftTokens = files[leftFileIndex]?.tokens;
  const rightTokens = files[rightFileIndex]?.tokens;

  if (
    leftTokens === undefined ||
    rightTokens === undefined ||
    !equalWindow(
      leftTokens,
      leftStart,
      rightTokens,
      rightStart,
      DUPLICATE_WINDOW_SIZE,
    )
  ) {
    return null;
  }

  while (
    leftStart > 0 &&
    rightStart > 0 &&
    leftTokens[leftStart - 1] === rightTokens[rightStart - 1]
  ) {
    leftStart -= 1;
    rightStart -= 1;
  }

  let length = DUPLICATE_WINDOW_SIZE;
  while (
    leftStart + length < leftTokens.length &&
    rightStart + length < rightTokens.length &&
    leftTokens[leftStart + length] === rightTokens[rightStart + length]
  ) {
    length += 1;
  }

  return { leftFileIndex, leftStart, rightFileIndex, rightStart, length };
}

function candidateKey(candidate: DuplicateCandidate): string {
  return [
    candidate.leftFileIndex,
    candidate.leftStart,
    candidate.rightFileIndex,
    candidate.rightStart,
    candidate.length,
  ].join(":");
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

function duplicateCandidates(
  files: readonly DuplicateFile[],
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const candidateKeys = new Set<string>();
  const buckets = indexWindows(files, DUPLICATE_WINDOW_SIZE);
  const orderedHashes = [...buckets.keys()].sort((left, right) => left - right);

  for (const hash of orderedHashes) {
    const occurrences = buckets.get(hash) ?? [];

    for (let leftIndex = 0; leftIndex < occurrences.length; leftIndex += 1) {
      const left = occurrences[leftIndex];

      if (left === undefined) {
        continue;
      }
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < occurrences.length;
        rightIndex += 1
      ) {
        const right = occurrences[rightIndex];

        if (right === undefined || left.fileIndex === right.fileIndex) {
          continue;
        }
        const candidate = extendMatch(files, left, right);

        if (candidate === null) {
          continue;
        }
        const key = candidateKey(candidate);

        if (!candidateKeys.has(key)) {
          candidateKeys.add(key);
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates.sort(candidateComparator(files));
}

function rangeIsFree(
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

function markRange(occupied: boolean[], start: number, length: number): void {
  for (let index = start; index < start + length; index += 1) {
    occupied[index] = true;
  }
}

function chooseNonOverlapping(
  files: readonly DuplicateFile[],
  candidates: readonly DuplicateCandidate[],
): { accepted: DuplicateCandidate[]; occupied: boolean[][] } {
  const occupied = files.map((file) =>
    Array.from({ length: file.tokens.length }, () => false),
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
    accepted.push(candidate);
  }

  return { accepted, occupied };
}

function summarizeEvidence(
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

export function computeDuplicateRatio(
  input: readonly TokenizedFile[],
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

  const candidates = duplicateCandidates(files);
  const { accepted, occupied } = chooseNonOverlapping(files, candidates);
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

function normalizePosixPath(path: string): string | null {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.length === 0 ? null : segments.join("/");
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");

  return separator === -1 ? "" : path.slice(0, separator);
}

function joinPath(directory: string, target: string): string | null {
  return normalizePosixPath(
    directory.length === 0 ? target : `${directory}/${target}`,
  );
}

function isJavaScriptTypeScriptLanguage(
  language: ImportingFile["language"],
): boolean {
  return language === "javascript" || language === "typescript";
}

function resolveCandidate(
  candidates: readonly string[],
  filesByPath: ReadonlyMap<string, GraphFile>,
  language: ImportingFile["language"],
): GraphFile | null {
  for (const candidate of candidates) {
    const normalized = normalizePosixPath(candidate);

    if (normalized === null) {
      continue;
    }
    const target = filesByPath.get(comparisonPath(normalized));

    if (
      target !== undefined &&
      (language === "python"
        ? target.language === "python"
        : isJavaScriptTypeScriptLanguage(target.language))
    ) {
      return target;
    }
  }

  return null;
}

function resolveJavaScriptTypeScriptImport(
  file: GraphFile,
  specifier: string,
  filesByPath: ReadonlyMap<string, GraphFile>,
): GraphFile | null {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return null;
  }
  const base = joinPath(directoryOf(file.path), specifier);

  if (base === null) {
    return null;
  }

  return resolveCandidate(
    [
      base,
      ...JS_TS_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...JS_TS_INDEX_FILES.map((indexFile) => `${base}/${indexFile}`),
    ],
    filesByPath,
    file.language,
  );
}

function pythonImportBase(file: GraphFile, specifier: string): string | null {
  const relative = /^(\.+)(.*)$/u.exec(specifier);

  if (relative === null) {
    return null;
  }
  const dots = relative[1]?.length ?? 0;
  const module = relative[2] ?? "";
  const directorySegments = directoryOf(file.path).split("/").filter(Boolean);
  const levelsUp = dots - 1;

  if (levelsUp > directorySegments.length) {
    return null;
  }
  directorySegments.splice(directorySegments.length - levelsUp, levelsUp);

  const moduleSegments = module.length === 0 ? [] : module.split(".");

  return normalizePosixPath(
    [...directorySegments, ...moduleSegments].join("/"),
  );
}

function resolvePythonImport(
  file: GraphFile,
  specifier: string,
  filesByPath: ReadonlyMap<string, GraphFile>,
): GraphFile | null {
  const base = pythonImportBase(file, specifier);

  if (base === null) {
    return null;
  }
  const hasModule = /^(\.+).+$/u.test(specifier);
  const candidates = hasModule
    ? [
        ...PYTHON_MODULE_FILES.map((extension) => `${base}${extension}`),
        ...PYTHON_PACKAGE_FILES.map((fileName) => `${base}/${fileName}`),
      ]
    : PYTHON_PACKAGE_FILES.map((fileName) => `${base}/${fileName}`);

  return resolveCandidate(candidates, filesByPath, "python");
}

function buildGraph(input: readonly ImportingFile[]): Map<string, string[]> {
  const ordered = input
    .map((file) => ({
      path: file.path,
      comparisonPath: comparisonPath(file.path),
      language: file.language,
      relativeImports: file.relativeImports,
    }))
    .sort((left, right) => comparePathValues(left.path, right.path));
  const filesByPath = new Map<string, GraphFile>();

  for (const file of ordered) {
    if (!filesByPath.has(file.comparisonPath)) {
      filesByPath.set(file.comparisonPath, file);
    }
  }

  const graph = new Map<string, string[]>();
  for (const file of filesByPath.values()) {
    const edges = new Set<string>();
    const imports = [...file.relativeImports].sort((left, right) =>
      left.localeCompare(right, "en-US"),
    );

    for (const specifier of imports) {
      const target =
        file.language === "python"
          ? resolvePythonImport(file, specifier, filesByPath)
          : resolveJavaScriptTypeScriptImport(file, specifier, filesByPath);

      if (target !== null && target.comparisonPath !== file.comparisonPath) {
        edges.add(target.path);
      }
    }
    graph.set(file.path, [...edges].sort(comparePathValues));
  }

  return graph;
}

function stronglyConnectedComponents(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    const index = nextIndex;

    nextIndex += 1;
    indices.set(node, index);
    lowLinks.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? index, lowLinks.get(target) ?? index),
        );
      } else if (onStack.has(target)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node) ?? index, indices.get(target) ?? index),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component: string[] = [];
    for (;;) {
      const member = stack.pop();

      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
    }
    components.push(component.sort(comparePathValues));
  };

  for (const node of [...graph.keys()].sort(comparePathValues)) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return components;
}

function compareComponents(
  left: readonly string[],
  right: readonly string[],
): number {
  if (left.length !== right.length) {
    return right.length - left.length;
  }
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = comparePathValues(left[index] ?? "", right[index] ?? "");

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

export function findCircularImports(
  input: readonly ImportingFile[],
): ImportCycleMetrics {
  const components = stronglyConnectedComponents(buildGraph(input))
    .filter((component) => component.length > 1)
    .sort(compareComponents);

  return {
    components,
    largestComponentSize: components[0]?.length ?? 0,
  };
}
