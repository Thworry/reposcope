import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import commitJson from "./fixtures/commit.json" with { type: "json" };
import repositoryJson from "./fixtures/repository.json" with { type: "json" };
import treeJson from "./fixtures/tree.json" with { type: "json" };
import {
  GO_SOURCE_FILES,
  PYTHON_SOURCE_FILES,
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
  | "partial"
  | "hostile"
  | "not-found"
  | "rate-limit";

export interface FixtureOptions {
  kind?: FixtureKind;
  owner?: string;
  repo?: string;
  blockFirstRest?: boolean;
  failRestAttempt?: number;
}

export interface RequestLedger {
  restGets(): readonly string[];
  rawGets(): readonly string[];
  analyzerChunks(): readonly string[];
  releaseFirstRest(): void;
  assertComplete(expected?: { rest: number; raw: number }): Promise<void>;
}

interface FixtureData {
  repository: Record<string, unknown>;
  tree: Record<string, unknown>;
  sources: SourceFileMap;
}

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
  if (kind === "partial") {
    return {
      repository: baseRepository,
      tree: treeFor(SOURCE_FILES, true),
      sources: SOURCE_FILES,
    };
  }
  if (kind === "hostile") {
    const hostile = {
      ...SOURCE_FILES,
      "src/<img src=x onerror=alert(1)>.ts": `export const = "<script src=https://evil.example/x.js></script>";\n`,
    };
    return {
      repository: {
        ...baseRepository,
        description:
          '</p><img src="https://evil.example/pixel" onerror="alert(1)"><script>alert(1)</script>',
        topics: ["<svg/onload=alert(1)>"],
      },
      tree: treeFor(hostile),
      sources: hostile,
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
  const expectedRawUrls = new Set(
    Object.keys(data.sources).map(
      (path) =>
        `https://raw.githubusercontent.com/${encodedOwner}/${encodedRepo}/${COMMIT_SHA}/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
    ),
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
        !expectedRawUrls.has(url.href)
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
