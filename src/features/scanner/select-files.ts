import type {
  FileClassification,
  FileSkipReason,
  NormalizedTree,
  NormalizedTreeFile,
  SelectedFile,
  SelectionLimits,
  SelectionPlan,
} from "../analysis/model";
import {
  classifyFile,
  isConventionalEntryPoint,
  isPriorityDocumentation,
  toPathComparisonKey,
} from "./file-registry";

const HARD_LIMITS = Object.freeze({
  maxFiles: 200,
  maxBytes: 10 * 1024 * 1024,
  maxFileBytes: 256 * 1024,
});

const SKIP_REASONS = Object.freeze([
  "excluded",
  "binary",
  "oversized",
  "unsupported",
  "budget",
  "invalid-entry",
] as const satisfies readonly FileSkipReason[]);

interface ResolvedSelectionLimits {
  maxFiles: number;
  maxBytes: number;
  maxFileBytes: number;
}

interface Candidate extends NormalizedTreeFile, FileClassification {
  eligible: true;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topLevelArea: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFile(
  left: NormalizedTreeFile,
  right: NormalizedTreeFile,
): number {
  return (
    compareText(
      toPathComparisonKey(left.path),
      toPathComparisonKey(right.path),
    ) ||
    compareText(left.sha, right.sha) ||
    compareText(left.path, right.path)
  );
}

function resolveLimits(limits: SelectionLimits): ResolvedSelectionLimits {
  const resolved = {
    maxFiles: limits.maxFiles ?? HARD_LIMITS.maxFiles,
    maxBytes: limits.maxBytes ?? HARD_LIMITS.maxBytes,
    maxFileBytes: limits.maxFileBytes ?? HARD_LIMITS.maxFileBytes,
  };

  for (const [key, value] of Object.entries(resolved)) {
    const hardLimit = HARD_LIMITS[key as keyof typeof HARD_LIMITS];

    if (!Number.isSafeInteger(value) || value <= 0 || value > hardLimit) {
      throw new Error("Invalid selection limit");
    }
  }

  return resolved;
}

function stemOf(path: string): string {
  const normalized = toPathComparisonKey(path);
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const withoutExtension = basename.replace(/(?:\.d)?\.[^.]+$/u, "");

  return withoutExtension
    .replace(/\.(?:test|spec)$/u, "")
    .replace(/^test_/u, "")
    .replace(/_test$/u, "");
}

function topLevelArea(path: string): string {
  const parts = toPathComparisonKey(path).split("/");
  const directories = parts.slice(0, -1);
  const wrappers = new Set([
    "src",
    "source",
    "lib",
    "app",
    "apps",
    "pkg",
    "packages",
    "test",
    "tests",
    "__tests__",
    "spec",
    "specs",
  ]);
  const meaningful = directories.find((segment) => !wrappers.has(segment));

  if (meaningful !== undefined) {
    return meaningful;
  }

  const stem = stemOf(path);

  return ["index", "main", "app", "server", "cli", "__main__"].includes(stem)
    ? "root"
    : directories.length === 0
      ? "root"
      : stem;
}

function isTopLevelSource(path: string): boolean {
  return !path.includes("/");
}

function priorityFor(
  file: NormalizedTreeFile,
  classification: FileClassification & { eligible: true },
  area: string,
  supportedAreas: ReadonlySet<string>,
): 1 | 2 | 3 | 4 | 5 | 6 {
  if (
    classification.category === "documentation" &&
    isPriorityDocumentation(file.path)
  ) {
    return 1;
  }

  if (
    classification.category === "manifest" ||
    classification.category === "configuration"
  ) {
    return 2;
  }

  if (
    classification.category === "source" &&
    (isTopLevelSource(file.path) || isConventionalEntryPoint(file.path))
  ) {
    return 3;
  }

  if (classification.isTest && supportedAreas.has(area)) {
    return 4;
  }

  if (!classification.isTest && classification.language !== "none") {
    return 5;
  }

  return 6;
}

function roundRobin(candidates: readonly Candidate[]): Candidate[] {
  const grouped = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const group = grouped.get(candidate.topLevelArea) ?? [];
    group.push(candidate);
    grouped.set(candidate.topLevelArea, group);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, group]) => group.sort(compareFile));
  const result: Candidate[] = [];
  let round = 0;

  while (groups.some((group) => round < group.length)) {
    for (const group of groups) {
      const candidate = group[round];

      if (candidate !== undefined) {
        result.push(candidate);
      }
    }
    round += 1;
  }

  return result;
}

function orderedCandidates(candidates: readonly Candidate[]): Candidate[] {
  const ordered: Candidate[] = [];

  for (const priority of [1, 2, 3, 4] as const) {
    ordered.push(
      ...candidates
        .filter((candidate) => candidate.priority === priority)
        .sort(compareFile),
    );
  }

  for (const priority of [5, 6] as const) {
    const atPriority = candidates.filter(
      (candidate) => candidate.priority === priority,
    );

    if (priority === 6) {
      ordered.push(
        ...atPriority
          .filter((candidate) => candidate.language === "none")
          .sort(compareFile),
      );
    }

    ordered.push(
      ...roundRobin(
        atPriority.filter((candidate) => candidate.language !== "none"),
      ),
    );
  }

  return ordered;
}

function newSkipCounts(): Record<FileSkipReason, number> {
  return Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<FileSkipReason, number>;
}

/**
 * Classifies and deterministically selects a diverse bounded file sample.
 * Optional limits may reduce, but never raise, the hard caps of 200 files,
 * 10 MiB total declared bytes, and 256 KiB per file; invalid limits throw.
 */
export function selectFiles(
  tree: NormalizedTree,
  limits: SelectionLimits = {},
): SelectionPlan {
  const resolved = resolveLimits(limits);
  const classifications = tree.files.map((file) => ({
    file,
    classification: classifyFile(file.path, file.size),
  }));
  const eligible = classifications
    .filter(
      (
        item,
      ): item is typeof item & {
        classification: FileClassification & { eligible: true };
      } => item.classification.eligible,
    )
    .filter((item) => item.file.size <= resolved.maxFileBytes);
  const supportedAreas = new Set(
    eligible
      .filter(
        ({ classification }) =>
          !classification.isTest && classification.language !== "none",
      )
      .map(({ file }) => topLevelArea(file.path)),
  );
  const candidates: Candidate[] = eligible.map(({ file, classification }) => {
    const area = topLevelArea(file.path);

    return {
      ...file,
      ...classification,
      eligible: true,
      priority: priorityFor(file, classification, area, supportedAreas),
      topLevelArea: area,
    };
  });
  const selected: SelectedFile[] = [];
  const skipped: SelectionPlan["skipped"] = [...tree.skippedEntries];
  const skipCounts = newSkipCounts();
  let selectedBytes = 0;

  for (const item of tree.skippedEntries) {
    skipCounts[item.reason] += 1;
  }

  for (const { file, classification } of classifications) {
    let reason = classification.skipReason;

    if (classification.eligible && file.size > resolved.maxFileBytes) {
      reason = "oversized";
    }

    if (reason !== undefined) {
      skipped.push({ path: file.path, reason });
      skipCounts[reason] += 1;
    }
  }

  for (const candidate of orderedCandidates(candidates)) {
    if (
      selected.length >= resolved.maxFiles ||
      selectedBytes + candidate.size > resolved.maxBytes
    ) {
      skipped.push({ path: candidate.path, reason: "budget" });
      skipCounts.budget += 1;
      continue;
    }

    selected.push(candidate);
    selectedBytes += candidate.size;
  }

  const unsupported = classifications.filter(
    ({ classification }) =>
      classification.language === "recognized-unsupported" &&
      classification.skipReason === "unsupported",
  );
  const oversized = classifications.filter(
    ({ file, classification }) =>
      classification.skipReason === "oversized" ||
      (classification.eligible && file.size > resolved.maxFileBytes),
  );
  const unsupportedBytes = unsupported.reduce(
    (total, item) => total + item.file.size,
    0,
  );
  const selectableBytes = candidates.reduce(
    (total, file) => total + file.size,
    0,
  );
  const oversizedBytes = oversized.reduce(
    (total, item) => total + item.file.size,
    0,
  );
  const eligibleBytes = selectableBytes + unsupportedBytes + oversizedBytes;
  const oversizedSourceBytes = oversized
    .filter(({ classification }) => classification.language !== "none")
    .reduce((total, item) => total + item.file.size, 0);
  const eligibleSourceBytes = candidates
    .filter((file) => file.language !== "none")
    .reduce(
      (total, file) => total + file.size,
      unsupportedBytes + oversizedSourceBytes,
    );

  return {
    treeComplete: tree.complete,
    selected,
    eligibleFiles: candidates.length + unsupported.length + oversized.length,
    eligibleBytes,
    eligibleSourceBytes,
    unsupportedFiles: unsupported.length,
    unsupportedBytes,
    selectedFiles: selected.length,
    selectedBytes,
    limitReached: skipCounts.oversized > 0 || skipCounts.budget > 0,
    skipped,
    skipCounts,
  };
}
