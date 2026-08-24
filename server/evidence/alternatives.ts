import type { ServerGitHubClient } from "../github/client.js";
import { ServerGitHubError } from "../github/model.js";
import type {
  AlternativeSearchResult,
  GitHubAlternativeCandidate,
  VerifiedRepositorySnapshot,
} from "../github/model.js";
import { EVIDENCE_LIMITS } from "./model.js";
import type {
  SanitizedEvidenceDocument,
  VerifiedAlternativeRepository,
} from "./model.js";

const QUERY_TOKEN_PATTERN = /^[\p{L}\p{N}-]+$/u;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "project",
  "repository",
  "the",
  "to",
  "with",
]);
const PROJECT_KINDS = Object.freeze([
  ["command line", "cli"],
  ["cli", "cli"],
  ["framework", "framework"],
  ["library", "library"],
  ["plugin", "plugin"],
  ["extension", "extension"],
  ["server", "server"],
  ["application", "application"],
] as const);

type AlternativeClient = Pick<
  ServerGitHubClient,
  "fetchAlternatives" | "fetchRepositoryFacts"
>;

interface CacheEntry {
  expiresAt: number;
  repositories: readonly VerifiedAlternativeRepository[];
}

function canonicalTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 40 &&
        QUERY_TOKEN_PATTERN.test(token) &&
        !STOP_WORDS.has(token),
    );
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
}

function boundedQuery(tokens: readonly string[]): string | null {
  let query = "";
  for (const token of tokens) {
    const next = query.length === 0 ? token : `${query} ${token}`;
    if (Array.from(next).length > 120) break;
    query = next;
  }
  return query.length > 0 ? query : null;
}

function readmeText(readme: SanitizedEvidenceDocument): string {
  return readme.blocks
    .map((block) => `${block.heading ?? ""} ${block.text}`)
    .join(" ");
}

/** Produces server-authored plain search terms. GitHub syntax is added only by the client. */
export function buildAlternativeQueries(
  snapshot: VerifiedRepositorySnapshot,
  readmeEvidence: SanitizedEvidenceDocument,
): readonly string[] {
  const topics = uniqueSorted(
    snapshot.repository.topics.flatMap(canonicalTokens),
  );
  const description = uniqueSorted(
    canonicalTokens(snapshot.repository.description ?? ""),
  );
  const combinedReadme = readmeText(readmeEvidence)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  const kind = PROJECT_KINDS.find(([phrase]) =>
    combinedReadme.includes(phrase),
  )?.[1];

  const candidates: string[] = [];
  const topicQuery = boundedQuery(topics.slice(0, 4));
  if (topicQuery !== null) candidates.push(topicQuery);
  const descriptionQuery = boundedQuery(description.slice(0, 4));
  if (descriptionQuery !== null) candidates.push(descriptionQuery);
  const kindQuery = boundedQuery(
    uniqueSorted([
      ...topics.slice(0, 2),
      ...(kind === undefined ? [] : [kind]),
    ]),
  );
  if (kindQuery !== null) candidates.push(kindQuery);

  const canonical = uniqueSorted(candidates)
    .filter((query) => /^[\p{L}\p{N} -]+$/u.test(query))
    .slice(0, EVIDENCE_LIMITS.alternativeQueries);
  return Object.freeze(canonical);
}

function relevanceTerms(
  snapshot: VerifiedRepositorySnapshot,
): ReadonlySet<string> {
  return new Set([
    ...snapshot.repository.topics.flatMap(canonicalTokens),
    ...canonicalTokens(snapshot.repository.description ?? ""),
  ]);
}

function relevanceScore(
  sourceTerms: ReadonlySet<string>,
  candidate: GitHubAlternativeCandidate,
): number {
  const candidateTerms = new Set([
    ...candidate.topics.flatMap(canonicalTokens),
    ...canonicalTokens(candidate.description ?? ""),
  ]);
  let score = 0;
  for (const term of candidateTerms) if (sourceTerms.has(term)) score += 1;
  return score;
}

function verifiedRelevanceScore(
  sourceTerms: ReadonlySet<string>,
  repository: VerifiedAlternativeRepository,
): number {
  const terms = new Set([
    ...repository.topics.flatMap(canonicalTokens),
    ...canonicalTokens(repository.description ?? ""),
  ]);
  let score = 0;
  for (const term of terms) if (sourceTerms.has(term)) score += 1;
  return score;
}

function sameRepository(
  left: { owner: string; repo: string },
  right: { owner: string; repo: string },
): boolean {
  return (
    left.owner.toLocaleLowerCase("en-US") ===
      right.owner.toLocaleLowerCase("en-US") &&
    left.repo.toLocaleLowerCase("en-US") ===
      right.repo.toLocaleLowerCase("en-US")
  );
}

function obviousFork(candidate: GitHubAlternativeCandidate): boolean {
  if (candidate.fork) return true;
  const name = candidate.repository.repo
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  return /(?:^|[-_.])(?:fork|clone|copy)(?:$|[-_.])/u.test(name);
}

/** Filters strict search results without treating stars as relevance evidence. */
export function selectAlternativeCandidates(
  snapshot: VerifiedRepositorySnapshot,
  results: readonly AlternativeSearchResult[],
): GitHubAlternativeCandidate[] {
  const sourceTerms = relevanceTerms(snapshot);
  const selected = new Map<
    string,
    { candidate: GitHubAlternativeCandidate; score: number }
  >();
  for (const result of results) {
    for (const candidate of result.candidates) {
      if (
        candidate.archived ||
        obviousFork(candidate) ||
        sameRepository(candidate.repository, snapshot.repository)
      ) {
        continue;
      }
      const score = relevanceScore(sourceTerms, candidate);
      if (score === 0) continue;
      const key = candidate.repository.fullName
        .normalize("NFKC")
        .toLocaleLowerCase("en-US");
      const current = selected.get(key);
      if (current === undefined || score > current.score)
        selected.set(key, { candidate, score });
    }
  }
  return [...selected.values()]
    .sort((left, right) => {
      const relevance = right.score - left.score;
      if (relevance !== 0) return relevance;
      const stars = right.candidate.starsCount - left.candidate.starsCount;
      if (stars !== 0) return stars;
      return left.candidate.repository.fullName.localeCompare(
        right.candidate.repository.fullName,
        "en",
      );
    })
    .slice(0, EVIDENCE_LIMITS.alternatives)
    .map(({ candidate }) => candidate);
}

function frozenRepositories(
  repositories: readonly VerifiedAlternativeRepository[],
): readonly VerifiedAlternativeRepository[] {
  const detached: VerifiedAlternativeRepository[] = repositories.map(
    (repository) => ({
      ...repository,
      topics: [...repository.topics],
    }),
  );
  for (const repository of detached) {
    Object.freeze(repository.topics);
    Object.freeze(repository);
  }
  return Object.freeze(detached);
}

/** Public-repository shortlist with direct fixed-endpoint revalidation and a 24h cache. */
export class AlternativeShortlistService {
  readonly #cache = new Map<string, CacheEntry>();

  constructor(
    private readonly client: AlternativeClient,
    private readonly now: () => number = Date.now,
  ) {}

  async getShortlist(
    snapshot: VerifiedRepositorySnapshot,
    readmeEvidence: SanitizedEvidenceDocument,
    token: string,
    signal: AbortSignal,
  ): Promise<readonly VerifiedAlternativeRepository[]> {
    signal.throwIfAborted();
    const queries = buildAlternativeQueries(snapshot, readmeEvidence);
    const key = JSON.stringify([
      snapshot.repository.owner.toLocaleLowerCase("en-US"),
      snapshot.repository.repo.toLocaleLowerCase("en-US"),
      snapshot.commitSha,
      queries,
    ]);
    const now = this.now();
    const cached = this.#cache.get(key);
    if (cached !== undefined && cached.expiresAt > now)
      return cached.repositories;
    if (cached !== undefined) this.#cache.delete(key);

    if (queries.length === 0) return Object.freeze([]);
    const searchResults = await this.client.fetchAlternatives(
      queries,
      token,
      signal,
    );
    const candidates = selectAlternativeCandidates(snapshot, searchResults);
    const settled = await Promise.allSettled(
      candidates.map((candidate) =>
        this.client.fetchRepositoryFacts(
          {
            owner: candidate.repository.owner,
            repo: candidate.repository.repo,
          },
          token,
          signal,
        ),
      ),
    );
    if (signal.aborted) throw signal.reason;
    const verified: VerifiedAlternativeRepository[] = [];
    const sourceTerms = relevanceTerms(snapshot);
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const candidate = candidates[index];
      if (result?.status === "rejected") {
        if (
          result.reason instanceof ServerGitHubError &&
          result.reason.kind === "not-found"
        ) {
          continue;
        }
        if (result.reason instanceof Error) throw result.reason;
        throw new ServerGitHubError("invalid-response");
      }
      if (
        result === undefined ||
        candidate === undefined ||
        result.value.archived ||
        !sameRepository(result.value, candidate.repository) ||
        verifiedRelevanceScore(sourceTerms, result.value) === 0
      ) {
        continue;
      }
      verified.push(result.value);
    }
    verified.sort((left, right) => {
      const relevance =
        verifiedRelevanceScore(sourceTerms, right) -
        verifiedRelevanceScore(sourceTerms, left);
      if (relevance !== 0) return relevance;
      const stars = right.starsCount - left.starsCount;
      if (stars !== 0) return stars;
      return left.fullName.localeCompare(right.fullName, "en");
    });
    const repositories = frozenRepositories(verified);
    this.#cache.set(key, {
      expiresAt: now + EVIDENCE_LIMITS.alternativeCacheMs,
      repositories,
    });
    while (this.#cache.size > EVIDENCE_LIMITS.alternativeCacheEntries) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
    return repositories;
  }
}
