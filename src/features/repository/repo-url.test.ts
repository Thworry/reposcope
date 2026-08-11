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
    "https://github.com/owner/re\u0085po",
    "https://github.com/owner/re%C2%85po",
    "https://github.com/owner/re\ud800po",
    "https://github.com/owner/re\udc00po",
    "https://github.com/owner/repo%2Egit",
    "https://github.com/owner/%2Egit",
    "https://github.com/owner/repo%2Egit.git",
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

  it.each(["re\ud800po", "re\udc00po"])(
    "rejects a RepoRef containing the lone surrogate %j",
    (repo) => {
      const malformedRef = { owner: "owner", repo };

      expect(() => toCanonicalRepositoryUrl(malformedRef)).toThrow(
        RepoUrlError,
      );
      expect(() => toShareSearch(malformedRef)).toThrow(RepoUrlError);
    },
  );

  it("rejects a non-canonical RepoRef retaining a terminal .git suffix", () => {
    const nonCanonicalRef = { owner: "owner", repo: "repo.git" };

    expect(() => toCanonicalRepositoryUrl(nonCanonicalRef)).toThrow(
      RepoUrlError,
    );
    expect(() => toShareSearch(nonCanonicalRef)).toThrow(RepoUrlError);
  });

  it("keeps every parsed Unicode ref closed under canonical and share serialization", () => {
    const parsed = parseRepositoryUrl(
      "https://github.com/owner/r%C3%A9po-%F0%9F%98%80.git",
    );

    expect(parseRepositoryUrl(toCanonicalRepositoryUrl(parsed))).toEqual(
      parsed,
    );
    expect(parseShareSearch(toShareSearch(parsed))).toEqual(parsed);
  });

  it("keeps a normalized literal .git suffix closed under both serializers", () => {
    const parsed = parseRepositoryUrl("https://github.com/owner/repo.git");

    expect(parseRepositoryUrl(toCanonicalRepositoryUrl(parsed))).toEqual(
      parsed,
    );
    expect(parseShareSearch(toShareSearch(parsed))).toEqual(parsed);
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
    "?repo=owner%2Fre%C2%85po",
    "?repo=owner%2Fre\u0085po",
    "?repo=owner%2Frepo%ED%A0%80",
    "?repo=owner%2Frepo%ED%B0%80",
    "?repo=owner%2Fre\ud800po",
    "?repo=owner%2Fre\udc00po",
    "?repo=owner%2Frepo%2Egit",
    "?repo=owner%2Frepo&repo=other%2Frepo",
    "?repo=owner%2Frepo&repo=",
  ])("rejects %s", (search) => {
    expect(parseShareSearch(search)).toBeNull();
  });
});
