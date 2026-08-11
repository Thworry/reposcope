import { isAnalysisReport } from "../analysis/guards";
import type { AnalysisReport, RepoRef } from "../analysis/model";

const CACHE_TTL_MS = 900_000;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

function normalizedComponent(value: string): string {
  const hasControl = Array.from(value).some((character) => {
    const point = character.codePointAt(0);

    return point === undefined || point <= 31 || (point >= 127 && point <= 159);
  });

  if (
    value.length === 0 ||
    value.length > 100 ||
    value === "." ||
    value === ".." ||
    /[\\/\s]/u.test(value) ||
    hasControl
  ) {
    throw new Error("Invalid repository reference");
  }

  return value.toLocaleLowerCase("en-US");
}

export function cacheKey(ref: RepoRef): string {
  return `reposcope:v1:${normalizedComponent(ref.owner)}/${normalizedComponent(ref.repo)}`;
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage is an optional performance optimization.
  }
}

function reportMatchesRef(report: AnalysisReport, ref: RepoRef): boolean {
  return (
    report.repository.owner.toLocaleLowerCase("en-US") ===
      normalizedComponent(ref.owner) &&
    report.repository.repo.toLocaleLowerCase("en-US") ===
      normalizedComponent(ref.repo)
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function getCachedReport(
  ref: RepoRef,
  nowMs: number,
): AnalysisReport | null {
  let key: string;

  try {
    key = cacheKey(ref);
    const serialized = sessionStorage.getItem(key);

    if (serialized === null) return null;
    if (byteLength(serialized) > MAX_CACHE_BYTES) {
      safeRemove(key);
      return null;
    }

    const parsed: unknown = JSON.parse(serialized);

    if (
      typeof nowMs !== "number" ||
      !Number.isSafeInteger(nowMs) ||
      nowMs < 0 ||
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !("savedAt" in parsed) ||
      !("report" in parsed) ||
      typeof parsed.savedAt !== "number" ||
      !Number.isSafeInteger(parsed.savedAt) ||
      parsed.savedAt < 0 ||
      parsed.savedAt > nowMs ||
      nowMs - parsed.savedAt > CACHE_TTL_MS ||
      !isAnalysisReport(parsed.report) ||
      !reportMatchesRef(parsed.report, ref)
    ) {
      safeRemove(key);
      return null;
    }

    return parsed.report;
  } catch {
    try {
      key = cacheKey(ref);
      safeRemove(key);
    } catch {
      // Invalid references and denied storage both degrade to a miss.
    }
    return null;
  }
}

export function setCachedReport(
  ref: RepoRef,
  report: AnalysisReport,
  nowMs: number,
): void {
  let key: string;

  try {
    key = cacheKey(ref);
    if (
      !Number.isSafeInteger(nowMs) ||
      nowMs < 0 ||
      !isAnalysisReport(report) ||
      !reportMatchesRef(report, ref)
    ) {
      safeRemove(key);
      return;
    }
    const serialized = JSON.stringify({ savedAt: nowMs, report });

    if (byteLength(serialized) > MAX_CACHE_BYTES) {
      safeRemove(key);
      return;
    }
    sessionStorage.setItem(key, serialized);
  } catch {
    // Quota and privacy-mode failures cannot prevent analysis.
  }
}

export function removeCachedReport(ref: RepoRef): void {
  try {
    safeRemove(cacheKey(ref));
  } catch {
    // Invalid references and denied storage are intentionally ignored.
  }
}
