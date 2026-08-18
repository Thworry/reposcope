import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import commitJson from "./fixtures/commit.json" with { type: "json" };
import repositoryJson from "./fixtures/repository.json" with { type: "json" };
import treeJson from "./fixtures/tree.json" with { type: "json" };
import {
  GO_SOURCE_FILES,
  HOSTILE_SOURCE_FILES,
  MINIMAL_SOURCE_FILES,
  PYTHON_SOURCE_FILES,
  READER_COMPLETE_SOURCE_FILES,
  SOURCE_FILES,
  type SourceFileMap,
} from "./fixtures/source-files";

export const FIXED_NOW = "2026-08-11T12:00:00.000Z";
export const COMMIT_SHA = commitJson.sha;
const TREE_SHA = commitJson.commit.tree.sha;

export type FixtureKind =
  | "typescript"
  | "python"
  | "go"
  | "minimal"
  | "partial"
  | "hostile"
  | "reader-complete"
  | "archived-stale"
  | "not-found"
  | "rate-limit";

export interface FixtureOptions {
  kind?: FixtureKind;
  owner?: string;
  repo?: string;
  blockFirstRest?: boolean;
  failRestAttempt?: number;
  failRawPath?: string;
}

export interface RequestLedger {
  restGets(): readonly string[];
  rawGets(): readonly string[];
  expectedRestGets(): readonly string[];
  expectedRawGets(): readonly string[];
  analyzerChunks(): readonly string[];
  releaseFirstRest(): void;
  assertComplete(expected?: { rest: number; raw: number }): Promise<void>;
}

interface FixtureData {
  repository: Record<string, unknown>;
  tree: Record<string, unknown>;
  sources: SourceFileMap;
}

const FICTION_WORKBENCH_README = `# Fiction Workbench

Fiction Workbench 2.4.1 · maintained beta

## Overview

Fiction Workbench is a browser-based planning studio for shaping long-form stories without sending manuscript notes to a hosted service.

## Who is this for

Novelists, serial-fiction writers, and story editors who need a shared view of continuity before a manuscript is published.

## Problem

Long-form projects scatter character details, setting rules, scene goals, and unresolved plot threads across unrelated notes.

## Use cases

- Turn a premise into a structured story bible.
- Track characters, locations, and unresolved plot threads.
- Prepare a release briefing for an editor or writing group.

## Capabilities

### Story bible

- Organize characters, locations, factions, and setting constraints.
- Keep source notes beside the story decisions they support.

### Continuity review

- Record unresolved plot threads and scene-level questions.
- Review timeline conflicts before exporting a draft.

### Editorial handoff

- Assemble a bounded briefing for an editor or writing group.
- Export plain-text notes without executing manuscript content.

## Workflow

1. Capture the premise and intended audience.
2. Shape characters, settings, and story constraints.
3. Draft scenes against the shared story bible.
4. Review continuity notes before export.

## Architecture

The browser interface coordinates a worker that indexes local story notes, derives cross-reference views, and returns inert text to the editor. The package.json manifest defines the application scripts, while src contains interface and analysis code and test contains deterministic checks.

## Requirements

- A current browser for using the workbench.
- Node.js ^20.19.0 || ^22.12.0 || >=24.0.0
- pnpm 11 for contributor workflows.

## Installation

\`\`\`sh
pnpm install --frozen-lockfile
\`\`\`

## Usage

\`\`\`sh
pnpm start
\`\`\`

## Development

\`\`\`sh
pnpm dev
\`\`\`

## Testing

\`\`\`sh
pnpm test
\`\`\`

## Build

\`\`\`sh
pnpm build
\`\`\`

## Security and privacy

Story notes stay in the browser session unless the writer explicitly exports them. The workbench does not execute manuscript text or upload drafts to a hosted model service.

## Limitations

- There is no collaborative synchronization or account recovery.
- Exported notes still require a human continuity and privacy review.

## Status

Fiction Workbench 2.4.1 is a maintained beta with a versioned local data format.
`;

const FICTION_WORKBENCH_SOURCE_FILES: SourceFileMap = Object.freeze({
  ...READER_COMPLETE_SOURCE_FILES,
  "README.md": FICTION_WORKBENCH_README,
});

const PARTIAL_SOURCE_FILES: SourceFileMap = Object.freeze({
  ...SOURCE_FILES,
  "README.md": FICTION_WORKBENCH_README,
});

const TYPESCRIPT_RAW_PATHS = [
  "README.md",
  "package.json",
  "src/index.ts",
  "src/math.ts",
  "src/format.ts",
  "src/stats.ts",
  "src/validate.ts",
  "test/math.test.ts",
] as const;
const READER_COMPLETE_RAW_PATHS = [
  ...TYPESCRIPT_RAW_PATHS,
  "SECURITY.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".env.example",
] as const;

export const EXPECTED_RAW_PATHS_BY_FIXTURE: Readonly<
  Record<FixtureKind, readonly string[]>
> = Object.freeze({
  typescript: TYPESCRIPT_RAW_PATHS,
  python: [
    "README.md",
    "pyproject.toml",
    "src/__init__.py",
    "src/main.py",
    "src/formatting.py",
    "src/statistics.py",
    "src/validation.py",
    "tests/test_main.py",
  ],
  go: ["README.md", "go.mod"],
  minimal: ["package.json"],
  partial: TYPESCRIPT_RAW_PATHS,
  hostile: [...TYPESCRIPT_RAW_PATHS, "src/<img src=x onerror=alert(1)>.ts"],
  "reader-complete": READER_COMPLETE_RAW_PATHS,
  "archived-stale": READER_COMPLETE_RAW_PATHS,
  "not-found": [],
  "rate-limit": [],
});

function sha(index: number): string {
  return index.toString(16).padStart(40, "a").slice(-40);
}

function treeFor(sources: SourceFileMap, truncated = false) {
  return {
    ...treeJson,
    truncated,
    tree: Object.entries(sources).map(([path, source], index) => ({
      path,
      mode: "100644",
      type: "blob",
      sha: sha(index + 8),
      size: new TextEncoder().encode(source).byteLength,
    })),
  };
}

function dataFor(kind: FixtureKind, owner: string, repo: string): FixtureData {
  const baseRepository = {
    ...repositoryJson,
    name: repo,
    full_name: `${owner}/${repo}`,
    html_url: `https://github.com/${owner}/${repo}`,
    stargazers_count: 1284,
    subscribers_count: 37,
    forks_count: 146,
    open_issues_count: 23,
  };

  if (kind === "python") {
    return {
      repository: baseRepository,
      tree: treeFor(PYTHON_SOURCE_FILES),
      sources: PYTHON_SOURCE_FILES,
    };
  }
  if (kind === "go") {
    return {
      repository: baseRepository,
      tree: treeFor(GO_SOURCE_FILES),
      sources: GO_SOURCE_FILES,
    };
  }
  if (kind === "minimal") {
    return {
      repository: { ...baseRepository, description: null, license: null },
      tree: treeFor(MINIMAL_SOURCE_FILES),
      sources: MINIMAL_SOURCE_FILES,
    };
  }
  if (kind === "partial") {
    return {
      repository: baseRepository,
      tree: treeFor(PARTIAL_SOURCE_FILES, true),
      sources: PARTIAL_SOURCE_FILES,
    };
  }
  if (kind === "hostile") {
    return {
      repository: {
        ...baseRepository,
        description:
          'Safe description text [stays visible](https://evil.example/description) without its destination or image. <img src="https://evil.example/description-pixel" onerror="alert(1)"><script src="https://evil.example/description.js"></script>',
        topics: ["<svg/onload=alert(1)>"],
      },
      tree: treeFor(HOSTILE_SOURCE_FILES),
      sources: HOSTILE_SOURCE_FILES,
    };
  }
  if (kind === "reader-complete" || kind === "archived-stale") {
    const fictionRepository = {
      ...baseRepository,
      description:
        "A local-first fiction planning workbench for long-form writers and story editors.",
    };
    return {
      repository:
        kind === "archived-stale"
          ? {
              ...fictionRepository,
              archived: true,
              updated_at: "2024-07-01T00:00:00Z",
              pushed_at: "2024-07-01T00:00:00Z",
            }
          : fictionRepository,
      tree: treeFor(FICTION_WORKBENCH_SOURCE_FILES),
      sources: FICTION_WORKBENCH_SOURCE_FILES,
    };
  }
  return {
    repository: baseRepository,
    tree: treeFor(SOURCE_FILES),
    sources: SOURCE_FILES,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    headers: {
      "access-control-expose-headers":
        "x-ratelimit-remaining, x-ratelimit-reset",
      "x-ratelimit-remaining": status >= 400 ? "0" : "59",
      "x-ratelimit-reset": "1786453200",
    },
    body: JSON.stringify(body),
  };
}

function rawPath(url: URL, owner: string, repo: string): string | null {
  const prefix = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${COMMIT_SHA}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  return url.pathname
    .slice(prefix.length)
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

export async function installGitHubRoutes(
  context: BrowserContext,
  page: Page,
  options: FixtureOptions = {},
): Promise<RequestLedger> {
  const kind = options.kind ?? "typescript";
  const owner = options.owner ?? "owner";
  const repo = options.repo ?? "repo";
  const data = dataFor(kind, owner, repo);
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);
  const repositoryUrl = `https://api.github.com/repos/${encodedOwner}/${encodedRepo}`;
  const commitUrl = `${repositoryUrl}/commits/main`;
  const treeUrl = `${repositoryUrl}/git/trees/${TREE_SHA}?recursive=1`;
  const expectedRestUrls = [repositoryUrl, commitUrl, treeUrl] as const;
  const rawUrlForPath = (path: string): string =>
    `https://raw.githubusercontent.com/${encodedOwner}/${encodedRepo}/${COMMIT_SHA}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  const allowedRawUrls = new Set(
    Object.keys(data.sources).map((path) => rawUrlForPath(path)),
  );
  const expectedRawUrls = EXPECTED_RAW_PATHS_BY_FIXTURE[kind].map((path) =>
    rawUrlForPath(path),
  );
  const rest: string[] = [];
  const raw: string[] = [];
  const chunks: string[] = [];
  const routeFailures: string[] = [];
  const pending = new Set<Promise<void>>();
  const firstRest = deferred();
  let handlerStarts = 0;
  let handlerFinishes = 0;
  let restAttempt = 0;
  let blocked = false;

  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (/\/(?:js-ts|python)-[^/]+\.js$/u.test(url.pathname)) {
      chunks.push(url.pathname);
    }
  };
  page.on("request", observe);

  function tracked(
    handler: (route: Route) => Promise<void>,
  ): (route: Route) => Promise<void> {
    return async (route) => {
      handlerStarts += 1;
      const operation = handler(route);
      pending.add(operation);
      try {
        await operation;
      } finally {
        pending.delete(operation);
        handlerFinishes += 1;
      }
    };
  }

  await context.route(
    "https://api.github.com/**",
    tracked(async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      rest.push(url.href);
      restAttempt += 1;

      if (request.method() !== "GET") {
        routeFailures.push(
          `unexpected GitHub method: ${request.method()} ${url.href}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      if (url.search !== "" && url.href !== treeUrl) {
        routeFailures.push(`unexpected GitHub REST query: ${url.href}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!blocked && options.blockFirstRest === true) {
        blocked = true;
        await firstRest.promise;
      }
      if (options.failRestAttempt === restAttempt) {
        await route.fulfill(jsonResponse({ message: "fixture failure" }, 500));
        return;
      }

      if (url.href === repositoryUrl) {
        if (kind === "not-found") {
          await route.fulfill(jsonResponse({ message: "Not Found" }, 404));
        } else if (kind === "rate-limit") {
          await route.fulfill(jsonResponse({ message: "rate limit" }, 403));
        } else {
          await route.fulfill(jsonResponse(data.repository));
        }
        return;
      }
      if (url.href === commitUrl) {
        await route.fulfill(jsonResponse(commitJson));
        return;
      }
      if (url.href === treeUrl) {
        await route.fulfill(jsonResponse(data.tree));
        return;
      }

      routeFailures.push(`unmatched GitHub REST route: ${url.href}`);
      await route.abort("blockedbyclient");
    }),
  );

  await context.route(
    "https://raw.githubusercontent.com/**",
    tracked(async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      raw.push(url.href);
      const path = rawPath(url, owner, repo);

      if (
        request.method() !== "GET" ||
        path === null ||
        !(path in data.sources) ||
        !allowedRawUrls.has(url.href)
      ) {
        routeFailures.push(
          `unmatched GitHub raw route: ${request.method()} ${url.href}`,
        );
        await route.abort("blockedbyclient");
        return;
      }

      const source = data.sources[path];
      if (source === undefined) {
        routeFailures.push(`missing raw fixture: ${path}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (path === options.failRawPath) {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "fixture failure",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: source,
      });
    }),
  );

  return {
    restGets: () => rest,
    rawGets: () => raw,
    expectedRestGets: () => expectedRestUrls,
    expectedRawGets: () => expectedRawUrls,
    analyzerChunks: () => chunks,
    releaseFirstRest: () => {
      firstRest.resolve();
    },
    assertComplete: async (expected) => {
      await Promise.allSettled([...pending]);
      if (routeFailures.length > 0) throw new Error(routeFailures.join("\n"));
      if (pending.size > 0)
        throw new Error("GitHub route handlers still pending");
      if (handlerStarts !== handlerFinishes) {
        throw new Error(
          `GitHub route lifecycle mismatch: ${String(handlerStarts)} started, ${String(handlerFinishes)} finished`,
        );
      }
      if (expected !== undefined) {
        if (rest.length !== expected.rest || raw.length !== expected.raw) {
          throw new Error(
            `request count mismatch: REST ${String(rest.length)}/${String(expected.rest)}, raw ${String(raw.length)}/${String(expected.raw)}`,
          );
        }
      }
    },
  };
}

export async function installExternalRequestGuard(
  context: BrowserContext,
): Promise<() => Promise<void>> {
  const failures: string[] = [];
  const pending = new Set<Promise<void>>();
  let handlerStarts = 0;
  let handlerFinishes = 0;

  await context.route("**/*", async (route) => {
    handlerStarts += 1;
    const operation = (async () => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.protocol === "data:" ||
        url.protocol === "blob:" ||
        (url.protocol === "http:" && url.host === "127.0.0.1:4173")
      ) {
        await route.continue();
        return;
      }

      failures.push(
        `unexpected external request: ${request.method()} ${url.href}`,
      );
      await route.abort("blockedbyclient");
    })();
    pending.add(operation);
    try {
      await operation;
    } finally {
      pending.delete(operation);
      handlerFinishes += 1;
    }
  });

  return async () => {
    await Promise.allSettled([...pending]);
    if (failures.length > 0) throw new Error(failures.join("\n"));
    if (pending.size > 0)
      throw new Error("External route handlers still pending");
    if (handlerStarts !== handlerFinishes) {
      throw new Error(
        `External route lifecycle mismatch: ${String(handlerStarts)} started, ${String(handlerFinishes)} finished`,
      );
    }
  };
}
