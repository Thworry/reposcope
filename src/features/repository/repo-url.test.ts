import { describe, expect, it } from "vitest";

import {
  parseRepositoryUrl,
  parseShareSearch,
  RepoUrlError,
  toCanonicalRepositoryUrl,
  toShareSearch,
} from "./repo-url";

describe("parseRepositoryUrl", () => {
  it.each([
    ["https://github.com/owner/repo", { owner: "owner", repo: "repo" }],
    ["github.com/owner/repo", { owner: "owner", repo: "repo" }],
    ["HTTPS://GITHUB.COM/owner/repo", { owner: "owner", repo: "repo" }],
    [" https://github.com/owner/repo.git ", { owner: "owner", repo: "repo" }],
    ["https://github.com/owner/repo/", { owner: "owner", repo: "repo" }],
    ["https://github.com:443/owner/repo", { owner: "owner", repo: "repo" }],
  ])("accepts %s", (input, expected) => {
    expect(parseRepositoryUrl(input)).toEqual(expected);
  });

  it.each([
    "http://github.com/owner/repo",
    "https://user:password@github.com/owner/repo",
    "https://github.com:444/owner/repo",
    "https://www.github.com/owner/repo",
    "https://api.github.com/owner/repo",
    "https://github.com/owner/repo?tab=readme",
    "https://github.com/owner/repo?",
    "https://github.com/owner/repo#readme",
    "https://github.com/owner/repo#",
    "https://github.com/owner/repo/issues",
    "https://github.com/owner//repo",
    "https://github.com//repo",
    "https://github.com/owner/",
    "https://github.com/owner",
    "https://github.com/./repo",
    "https://github.com/../repo",
    "https://github.com/owner/.",
    "https://github.com/owner/..",
    "https://github.com/owner\\repo",
    "https://github.com/owner/repo\\issues",
    "https://github.com/own er/repo",
    "https://github.com/owner/re po",
    "https://github.com/owner/repo%2Fissues",
    "https://github.com/owner%2Fremainder/repo",
    "https://github.com/owner/repo%5Cissues",
    "https://github.com/owner/%2E",
    "https://github.com/owner/%2e%2e",
    "https://gitlab.com/owner/repo",
    "owner/repo",
    "",
    "https://github.com/owner/repo\u0000",
    "https://github.com/owner/\u0007repo",
  ])("rejects %j", (input) => {
    expect(() => parseRepositoryUrl(input)).toThrow(RepoUrlError);
  });
});

describe("repository URL serialization", () => {
  const ref = { owner: "owner", repo: "repo" };

  it("produces the canonical HTTPS URL", () => {
    expect(toCanonicalRepositoryUrl(ref)).toBe("https://github.com/owner/repo");
  });

  it("produces a query-only share location", () => {
    expect(toShareSearch(ref)).toBe("?repo=owner%2Frepo");
  });
});

describe("parseShareSearch", () => {
  it.each([
    ["?repo=owner%2Frepo", { owner: "owner", repo: "repo" }],
    ["repo=owner%2Frepo", { owner: "owner", repo: "repo" }],
    ["?source=shared&repo=owner%2Frepo", { owner: "owner", repo: "repo" }],
  ])("parses %s", (search, expected) => {
    expect(parseShareSearch(search)).toEqual(expected);
  });

  it.each([
    "",
    "?",
    "?source=shared",
    "?repo=",
    "?repo=%20",
    "?repo=owner",
    "?repo=owner%2Frepo%2Fissues",
    "?repo=owner%5Crepo",
    "?repo=owner%2Frepo&repo=other%2Frepo",
    "?repo=owner%2Frepo&repo=",
  ])("rejects %s", (search) => {
    expect(parseShareSearch(search)).toBeNull();
  });
});
