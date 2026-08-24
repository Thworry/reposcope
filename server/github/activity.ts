import type {
  GitHubActivityEvent,
  GitHubActivityKind,
  GitHubReleaseFact,
  RecentActivitySummary,
  ReleaseSummary,
} from "./model.js";

function canonicalNow(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new TypeError("The injected GitHub clock returned an invalid date");
  }
  return now.toISOString();
}

export function buildReleaseSummary(
  pages: readonly (readonly GitHubReleaseFact[])[],
  endpointAvailable: boolean,
  now: Date,
): ReleaseSummary {
  const seen = new Set<number>();
  const releases: GitHubReleaseFact[] = [];
  for (const page of pages) {
    for (const release of page) {
      if (seen.has(release.id)) continue;
      seen.add(release.id);
      releases.push(release);
    }
  }
  releases.sort((left, right) => {
    const byPublished = right.publishedAt.localeCompare(left.publishedAt, "en");
    if (byPublished !== 0) return byPublished;
    return left.id - right.id;
  });
  return {
    acquiredAt: canonicalNow(now),
    endpointAvailable,
    releases,
  };
}

function emptyCounts(): Record<GitHubActivityKind, number> {
  return {
    push: 0,
    issue: 0,
    "pull-request": 0,
    release: 0,
    other: 0,
  };
}

export function buildRecentActivitySummary(
  pages: readonly (readonly GitHubActivityEvent[])[],
  now: Date,
): RecentActivitySummary {
  const seen = new Set<string>();
  const counts = emptyCounts();
  let latestActivityAt: string | null = null;

  for (const page of pages) {
    for (const event of page) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      counts[event.kind] += 1;
      if (latestActivityAt === null || event.occurredAt > latestActivityAt) {
        latestActivityAt = event.occurredAt;
      }
    }
  }

  return {
    acquiredAt: canonicalNow(now),
    eventsScanned: seen.size,
    latestActivityAt,
    counts,
  };
}
