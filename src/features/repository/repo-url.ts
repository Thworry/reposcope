import type { RepoRef } from "../analysis/model";

const RAW_REPOSITORY_URL =
  /^(?:https:\/\/)?github\.com(?::443)?\/(?<owner>[^/?#\\]+)\/(?<repo>[^/?#\\]+)\/?$/i;

const INTERNAL_WHITESPACE = /\s/u;

export class RepoUrlError extends Error {
  override readonly name = "RepoUrlError";

  constructor() {
    super("invalid-repository-url");
  }
}

function invalidRepositoryUrl(): never {
  throw new RepoUrlError();
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint !== undefined &&
      (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
    ) {
      return true;
    }
  }

  return false;
}

function hasLoneSurrogate(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint !== undefined && codePoint >= 0xd800 && codePoint <= 0xdfff) {
      return true;
    }
  }

  return false;
}

function assertDecodedSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    hasControlCharacter(segment) ||
    hasLoneSurrogate(segment) ||
    INTERNAL_WHITESPACE.test(segment)
  ) {
    invalidRepositoryUrl();
  }
}

function decodeSegment(rawSegment: string): string {
  let segment: string;

  try {
    segment = decodeURIComponent(rawSegment);
  } catch {
    return invalidRepositoryUrl();
  }

  assertDecodedSegment(segment);

  return segment;
}

function assertRepoRef(ref: RepoRef): void {
  assertDecodedSegment(ref.owner);
  assertDecodedSegment(ref.repo);

  if (/\.git$/i.test(ref.repo)) {
    invalidRepositoryUrl();
  }
}

export function parseRepositoryUrl(input: string): RepoRef {
  if (hasControlCharacter(input) || hasLoneSurrogate(input)) {
    return invalidRepositoryUrl();
  }

  const raw = input.trim();
  const match = RAW_REPOSITORY_URL.exec(raw);
  const rawOwner = match?.groups?.owner;
  let rawRepo = match?.groups?.repo;

  if (rawOwner === undefined || rawRepo === undefined) {
    return invalidRepositoryUrl();
  }

  const hasLiteralGitSuffix = /\.git$/i.test(rawRepo);

  if (hasLiteralGitSuffix) {
    rawRepo = rawRepo.slice(0, -4);
  }

  if (rawRepo.length === 0) {
    return invalidRepositoryUrl();
  }

  let url: URL;

  try {
    url = new URL(/^https:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return invalidRepositoryUrl();
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return invalidRepositoryUrl();
  }

  const owner = decodeSegment(rawOwner);
  const repo = decodeSegment(rawRepo);

  if (/\.git$/i.test(repo)) {
    return invalidRepositoryUrl();
  }

  return { owner, repo };
}

export function toCanonicalRepositoryUrl(ref: RepoRef): string {
  assertRepoRef(ref);

  return `https://github.com/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

export function toShareSearch(ref: RepoRef): string {
  assertRepoRef(ref);

  const parameters = new URLSearchParams({ repo: `${ref.owner}/${ref.repo}` });
  return `?${parameters.toString()}`;
}

export function parseShareSearch(search: string): RepoRef | null {
  if (hasControlCharacter(search) || hasLoneSurrogate(search)) {
    return null;
  }

  try {
    decodeURIComponent(search);
  } catch {
    return null;
  }

  const values = new URLSearchParams(search).getAll("repo");
  const value = values[0];

  if (values.length !== 1 || value === undefined || value.length === 0) {
    return null;
  }

  try {
    const ref = parseRepositoryUrl(`https://github.com/${value}`);
    return `${ref.owner}/${ref.repo}` === value ? ref : null;
  } catch (error) {
    if (error instanceof RepoUrlError) {
      return null;
    }

    throw error;
  }
}
