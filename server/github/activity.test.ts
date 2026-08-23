import { describe, expect, it } from "vitest";

import {
  GITHUB_ACTIVITY_RESPONSE,
  GITHUB_RELEASE_RESPONSE,
} from "../test/github-fixtures.js";
import { buildRecentActivitySummary, buildReleaseSummary } from "./activity.js";
import { guardActivityPage, guardReleasePage } from "./guards.js";

const repository = { owner: "owner", repo: "repo" } as const;
const now = new Date("2026-08-23T00:00:00Z");

describe("GitHub activity summaries", () => {
  it("sorts and de-duplicates validated releases", () => {
    const page = guardReleasePage(GITHUB_RELEASE_RESPONSE, repository);
    expect(buildReleaseSummary([page, page], true, now)).toEqual({
      acquiredAt: "2026-08-23T00:00:00.000Z",
      endpointAvailable: true,
      releases: [
        {
          id: 10,
          tagName: "v1.0.0",
          name: "Version 1.0.0",
          publishedAt: "2026-08-10T00:00:00Z",
          url: "https://github.com/owner/repo/releases/tag/v1.0.0",
          prerelease: false,
        },
      ],
    });
  });

  it("derives server-owned activity counts and latest time", () => {
    const page = guardActivityPage(GITHUB_ACTIVITY_RESPONSE, repository);
    expect(buildRecentActivitySummary([page, page], now)).toEqual({
      acquiredAt: "2026-08-23T00:00:00.000Z",
      eventsScanned: 2,
      latestActivityAt: "2026-08-20T00:00:00Z",
      counts: {
        push: 1,
        issue: 1,
        "pull-request": 0,
        release: 0,
        other: 0,
      },
    });
  });

  it("rejects release and activity bodies for another repository", () => {
    expect(() =>
      guardReleasePage(
        [
          {
            ...GITHUB_RELEASE_RESPONSE[0],
            url: "https://api.github.com/repos/other/repo/releases/10",
          },
        ],
        repository,
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
    expect(() =>
      guardActivityPage(
        [
          {
            ...GITHUB_ACTIVITY_RESPONSE[0],
            repo: { name: "other/repo" },
          },
        ],
        repository,
      ),
    ).toThrow(expect.objectContaining({ kind: "invalid-response" }));
  });
});
