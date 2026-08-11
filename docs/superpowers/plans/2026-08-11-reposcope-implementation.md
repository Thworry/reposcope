# RepoScope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publicly release RepoScope 项目透视, a bilingual, read-only static web application that produces deterministic, evidence-backed quality reports for public GitHub repositories.

**Architecture:** A React/Vite static site validates a public repository URL and delegates acquisition, selection, parsing, and scoring to a cancellable module Web Worker. The worker performs exactly three unauthenticated GitHub REST requests, then bounded immutable raw-file reads; pure JavaScript analyzers produce versioned metrics and a typed report that the main thread validates, caches without source text, localizes, and renders.

**Tech Stack:** Node.js 24.x, pnpm 11.16.0, React 19.2.8, TypeScript 6.0.3, Vite 8.2.1, Vitest 4.1.10, `@babel/parser` 8.0.4, `@babel/types` 8.0.4, `@lezer/common` 1.5.2, `@lezer/python` 1.1.19, `smol-toml` 1.7.1, Playwright 1.62.1, Axe 4.12.1, and Lighthouse CI 0.15.1.

## Global Constraints

- The authoritative product contract is `docs/superpowers/specs/2026-08-11-reposcope-design.md`, ruleset `1.0.0`.
- This is a separate public project from IssueReady. Do not modify, copy commits from, or publish files from the IssueReady worktree.
- Support complete English (`en`) and Simplified Chinese (`zh-CN`) application-owned copy from the first release. Language switching must not refetch or rescore.
- Accept only the normalized public GitHub repository URL forms specified in design §5.1. Invalid input sends zero requests.
- A fresh scan sends exactly three REST requests using `X-GitHub-Api-Version: 2026-03-10`, followed by at most 200 immutable raw-file fetch attempts.
- Enforce 200 selected files, 200 source fetch attempts, 10 MiB decoded text, 256 KiB per file, six concurrent raw requests, 15 seconds per raw request, and 90 seconds for the source-fetch phase.
- Treat all remote values as untrusted. Never execute, import, evaluate, persist, or render repository source as HTML. Findings contain generated evidence, paths, line ranges, counts, and metrics but no raw source excerpts.
- General inspection applies to every repository. Deep parsing applies only to JavaScript, TypeScript, and Python through pure JavaScript, same-origin lazy modules. Do not add WebAssembly or a CSP execution exception.
- Rules, thresholds, dictionaries, applicability, confidence, labels, and priority must match design §8 exactly. Do not tune scoring to make fixtures look better.
- Cache only validated final reports and normalized public metadata in `sessionStorage` for 15 minutes. Never cache source bodies or raw responses.
- Initial JavaScript must be at most 200 KiB gzip, initial CSS at most 50 KiB gzip, and each lazy language analyzer chunk at most 500 KiB gzip.
- Production CSP contains no `unsafe-inline` or `unsafe-eval` and permits connections only to self, `api.github.com`, and `raw.githubusercontent.com`.
- Meet WCAG 2.2 AA for the implemented scope, with 44-by-44 CSS-pixel targets, a visible 3-pixel focus indicator, reduced motion, and no page overflow at 375, 900, or 1366 CSS pixels.
- Use TDD for every behavior slice: add a focused failing test, record the expected red reason, implement the minimum, run focused green, then run the task-level gate.
- Keep existing user changes. Stage exact task files only. Do not amend commits, lower thresholds, add skips, suppress Axe, or use live GitHub data in automated tests.

---

## Planned File Structure

### Foundation and application shell

- `package.json` — pinned dependencies and quality scripts.
- `pnpm-lock.yaml` — frozen dependency graph.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — strict TypeScript projects.
- `eslint.config.js` — browser, worker, test, and Node lint scopes.
- `vite.config.ts` — React build, test collection, coverage, worker chunks, production base path, manifest, and CSP injection.
- `index.html` — semantic static metadata and app mount only.
- `src/main.tsx` — React entry point.
- `src/App.tsx` — route/query composition and top-level state.
- `src/test/setup.ts` — Testing Library and browser API shims.

### Shared domain and localization

- `src/features/analysis/model.ts` — serializable public domain types and enums.
- `src/features/analysis/guards.ts` — hostile-boundary runtime validation for reports and cache payloads.
- `src/i18n/messages.ts` — exhaustive English and Chinese dictionaries.
- `src/i18n/use-language.ts` — browser default, local preference, and switching.

### Repository input and GitHub transport

- `src/features/repository/repo-url.ts` — strict URL parsing and share query.
- `src/features/github/raw-model.ts` — minimal untrusted GitHub response shapes.
- `src/features/github/github-client.ts` — exactly three REST calls, typed errors, rate metadata, and immutable raw reads.

### Selection and analysis

- `src/features/scanner/file-registry.ts` — exact source, documentation, manifest, exclusion, and command dictionaries.
- `src/features/scanner/tree.ts` — tree guards, normalization, classification, and completeness.
- `src/features/scanner/select-files.ts` — deterministic priority/diversity selection and budgets.
- `src/features/analyzers/general.ts` — docs, manifests, commands, automation, and maintenance facts.
- `src/features/analyzers/js-ts.ts` — Babel-based JS/TS metrics and normalized tokens.
- `src/features/analyzers/python.ts` — Lezer-based Python metrics and normalized tokens.
- `src/features/analyzers/line-metrics.ts` — logical-line and source-position helpers.
- `src/features/analyzers/cross-file.ts` — duplicate ratio and relative-import cycles.
- `src/features/rules/rules.ts` — ruleset `1.0.0` scoring and applicability.
- `src/features/rules/confidence.ts` — exact confidence formula and labels.
- `src/features/rules/findings.ts` — deterministic strengths, priorities, and localized recommendation keys.

### Worker, cache, and orchestration

- `src/features/worker/protocol.ts` — serializable command/event contract.
- `src/features/worker/analysis.worker.ts` — acquisition, progress, analysis, abort, and report assembly.
- `src/features/worker/worker-client.ts` — one-run worker lifecycle and stale-result protection.
- `src/features/cache/report-cache.ts` — validated 15-minute report cache without source.
- `src/features/analysis/service.ts` — cache/force/worker orchestration.
- `src/features/analysis/use-repository-analysis.ts` — React lifecycle state.

### UI and design system

- `src/components/language-switcher.tsx` — persistent native language buttons.
- `src/components/repository-form.tsx` — input, examples, validation, and submit.
- `src/components/scan-progress.tsx` — five announced cancellable phases.
- `src/components/error-panel.tsx` — typed bilingual boundary errors.
- `src/components/report-summary.tsx` — identity, overall score, confidence, and scope.
- `src/components/dimension-scores.tsx` — six textual score cards.
- `src/components/strengths-and-risks.tsx` — limited strengths and prioritized weaknesses.
- `src/components/coverage-panel.tsx` — fetched/parsed/skipped/failed/unsupported scope.
- `src/components/evidence-explorer.tsx` — accessible filters and immutable GitHub file links.
- `src/components/copy-button.tsx` — race-safe localized Markdown clipboard action.
- `src/components/methodology.tsx` — in-page versioned method disclosure.
- `src/components/report-view.tsx` — selected guided A layout.
- `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/app.css` — local responsive design system.

### Quality, deployment, and open source

- Co-located `*.test.ts` and `*.test.tsx` files for every pure module/component.
- `src/test/fixtures/` — fixed repository, tree, source, metrics, and report fixtures.
- `e2e/fixtures.ts`, `e2e/reposcope.spec.ts` — deterministic route mocks and browser flows.
- `playwright.config.ts` — desktop and mobile projects.
- `scripts/check-bundle-size.mjs`, `scripts/check-bundle-size.test.mjs` — gzip gates.
- `lighthouserc.cjs` — three-run four-category `0.95` gate.
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml` — pinned CI and Pages deployment.
- `.github/dependabot.yml`, templates, governance files, bilingual READMEs, methodology, architecture, security, and release documentation.

---

### Task 1: Foundation, Shared Domain, and Bilingual Shell

**Files:**

- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `eslint.config.js`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/test/setup.ts`
- Create: `src/features/analysis/model.ts`
- Create: `src/i18n/messages.ts`
- Create: `src/i18n/use-language.ts`
- Test: `src/i18n/messages.test.ts`
- Test: `src/i18n/use-language.test.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**

- Produces: `Language = "en" | "zh-CN"`, `DimensionKey`, `RuleState`, `FindingSeverity`, `ScanPhase`, `RepoRef`, `CoverageSummary`, `RuleResult`, `DimensionResult`, `AnalysisReport`, and `AppMessageKey`.
- Produces: `getInitialLanguage(navigatorLanguages, stored): Language`, `messages: Record<Language, Record<AppMessageKey, string>>`, and `useLanguage()`.
- Consumers: every later task imports shared enums/types and message keys from this task.

- [ ] **Step 1: Create the package and strict toolchain files**

Create `package.json` with `private: true`, `type: "module"`, `packageManager: "pnpm@11.16.0"`, Node `>=24 <25`, and these exact runtime pins:

```json
{
  "@babel/parser": "8.0.4",
  "@babel/types": "8.0.4",
  "@lezer/common": "1.5.2",
  "@lezer/python": "1.1.19",
  "react": "19.2.8",
  "react-dom": "19.2.8",
  "smol-toml": "1.7.1"
}
```

Pin the same development versions as the Tech Stack and the tested IssueReady baseline: `@axe-core/playwright` 4.12.1, `@eslint/js` 10.0.1, `@lhci/cli` 0.15.1, `@playwright/test` 1.62.1, `@testing-library/jest-dom` 7.0.1, `@testing-library/react` 16.3.2, `@testing-library/user-event` 14.6.3, `@types/node` 26.2.0, `@types/react` 19.2.18, `@types/react-dom` 19.2.4, `@vitejs/plugin-react` 6.0.5, `@vitest/coverage-v8` 4.1.10, `eslint` 10.0.1, `eslint-plugin-react-hooks` 7.0.1, `eslint-plugin-react-refresh` 0.5.3, `globals` 17.9.0, `jsdom` 29.1.1, `prettier` 3.9.6, `typescript` 6.0.3, `typescript-eslint` 8.66.0, `vite` 8.2.1, and `vitest` 4.1.10.

Define these scripts now so every later task uses the same commands:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint . --max-warnings 0",
  "format": "prettier . --write",
  "format:check": "prettier . --check",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "check:bundle": "node scripts/check-bundle-size.mjs",
  "check:lighthouse": "lhci autorun",
  "check": "pnpm lint && pnpm format:check && pnpm test && pnpm build"
}
```

Set `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables` in the app TypeScript config. Configure Vitest to include only `src/**/*.test.{ts,tsx}` with jsdom setup and coverage over `src/**/*.{ts,tsx}` excluding entry/test/type-only files.

Run: `pnpm install`

Expected: a new `pnpm-lock.yaml`; no lifecycle script requires approval.

- [ ] **Step 2: Write the failing domain/i18n and shell tests**

Create the tests with these essential assertions:

```tsx
it("keeps English and Chinese keys exhaustive and selects browser Chinese", () => {
  expect(Object.keys(messages.en).sort()).toEqual(
    Object.keys(messages["zh-CN"]).sort(),
  );
  expect(getInitialLanguage(["zh-CN", "en"], null)).toBe("zh-CN");
  expect(getInitialLanguage(["fr-BE"], null)).toBe("en");
  expect(getInitialLanguage(["en"], "zh-CN")).toBe("zh-CN");
});

it("renders a bilingual RepoScope shell", async () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "RepoScope 项目透视" }),
  ).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Simplified Chinese" }),
  );
  expect(
    screen.getByText("看懂一个公开项目的质量、复杂度与改进空间。"),
  ).toBeVisible();
});
```

In `use-language.test.tsx`, render a small hook harness and assert a stored invalid value is ignored, storage read/write exceptions do not throw, a valid selection writes only `en`/`zh-CN`, and `document.documentElement.lang` follows the current language.

- [ ] **Step 3: Run the focused tests to verify red**

Run: `pnpm vitest run src/i18n/messages.test.ts src/i18n/use-language.test.tsx src/App.test.tsx`

Expected: FAIL because `messages`, `getInitialLanguage`, domain types, and `App` do not exist.

- [ ] **Step 4: Implement the minimal strict model and language shell**

Define stable serializable types; do not put `Date`, `Map`, class instances, functions, or DOM objects in worker/report payloads. Use ISO timestamp strings and arrays.

```ts
export type Language = "en" | "zh-CN";
export type DimensionKey =
  | "documentation"
  | "operability"
  | "readability"
  | "complexity"
  | "testing"
  | "maintenance";
export type RuleState = "passed" | "partial" | "failed" | "not-applicable";
export type FindingSeverity = "high" | "medium" | "low";
export type ScanPhase =
  "validating" | "repository" | "selecting" | "fetching" | "analyzing";

export interface RepoRef {
  owner: string;
  repo: string;
}

export type SourceLanguage =
  "javascript" | "typescript" | "python" | "recognized-unsupported" | "none";

export type FileCategory =
  "documentation" | "manifest" | "configuration" | "source" | "test";

export interface FetchedTextFile {
  path: string;
  text: string;
  bytes: number;
  declaredSize: number;
  language: SourceLanguage;
  category: FileCategory;
  isTest: boolean;
}

export interface CoverageSummary {
  treeComplete: boolean;
  eligibleFiles: number;
  eligibleBytes: number;
  eligibleSourceBytes: number;
  selectedFiles: number;
  selectedBytes: number;
  fetchedFiles: number;
  fetchedBytes: number;
  parsedFiles: number;
  parsedBytes: number;
  parsedSupportedBytes: number;
  failedFiles: number;
  unsupportedFiles: number;
  limitReached: boolean;
}

export type MessageArgument = string | number | boolean;

export interface LocalizedDescriptor {
  key: string;
  args: Record<string, MessageArgument>;
}

export interface FileReference {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface RuleResult {
  id: string;
  dimension: DimensionKey;
  state: RuleState;
  earned: number;
  available: number;
  evidence: LocalizedDescriptor;
  recommendation: LocalizedDescriptor;
  references: FileReference[];
}

export interface DimensionResult {
  key: DimensionKey;
  earned: number;
  available: number;
  score: number | null;
  rules: RuleResult[];
}

export interface Strength {
  ruleId: string;
  dimension: DimensionKey;
  evidence: LocalizedDescriptor;
  references: FileReference[];
}

export interface Improvement {
  ruleId: string;
  dimension: DimensionKey;
  severity: FindingSeverity;
  lostPoints: number;
  evidence: LocalizedDescriptor;
  recommendation: LocalizedDescriptor;
  references: FileReference[];
}

export interface AnalysisReport {
  rulesetVersion: "1.0.0";
  repository: {
    owner: string;
    repo: string;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    archived: boolean;
    pushedAt: string;
    commitSha: string;
    analyzedAt: string;
  };
  overall: {
    score: number;
    label: "strong" | "solid" | "needs-attention" | "limited";
    generalOnly: boolean;
    preliminary: boolean;
  };
  confidence: {
    percent: number;
    label: "high" | "medium" | "low";
  };
  dimensions: DimensionResult[];
  strengths: Strength[];
  weaknesses: Improvement[];
  coverage: CoverageSummary;
}
```

Implement `useLanguage` with a guarded `localStorage.getItem("reposcope:language")`, browser-language fallback, guarded writes, and `document.documentElement.lang` synchronization. The first dictionary contains the brand, positioning, language names, privacy sentence, and main landmark label required by the tests.

```ts
const en = {
  brand: "RepoScope 项目透视",
  tagline: "See a public project's quality, complexity, and room to improve.",
  english: "English",
  simplifiedChinese: "Simplified Chinese",
  privacy: "Read-only. No login or token. Analysis runs in your browser.",
  main: "RepoScope project analysis",
} as const;

export type AppMessageKey = keyof typeof en;
export const messages: Record<Language, Record<AppMessageKey, string>> = {
  en,
  "zh-CN": {
    brand: "RepoScope 项目透视",
    tagline: "看懂一个公开项目的质量、复杂度与改进空间。",
    english: "英文",
    simplifiedChinese: "简体中文",
    privacy: "只读、无需登录或令牌；分析在你的浏览器中运行。",
    main: "RepoScope 项目分析",
  },
};
```

- [ ] **Step 5: Run focused and project gates**

Run: `pnpm vitest run src/i18n/messages.test.ts src/i18n/use-language.test.tsx src/App.test.tsx`

Expected: PASS.

Run: `pnpm check`

Expected: lint, Prettier, tests, TypeScript, and Vite build all PASS.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js vite.config.ts index.html src/main.tsx src/App.tsx src/App.test.tsx src/test/setup.ts src/features/analysis/model.ts src/i18n/messages.ts src/i18n/messages.test.ts src/i18n/use-language.ts src/i18n/use-language.test.tsx
git diff --cached --check
git commit -m "feat: establish RepoScope foundation"
```

---

### Task 2: Strict Repository URL and Share Query

**Files:**

- Create: `src/features/repository/repo-url.ts`
- Test: `src/features/repository/repo-url.test.ts`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces: `RepoUrlError`, `parseRepositoryUrl(input: string): RepoRef`, `toCanonicalRepositoryUrl(ref: RepoRef): string`, `toShareSearch(ref: RepoRef): string`, and `parseShareSearch(search: string): RepoRef | null`.
- Consumes: `RepoRef` from Task 1.

- [ ] **Step 1: Write the exact accepted/rejected table as failing tests**

Use table-driven tests. Accepted inputs and result:

```ts
[
  ["https://github.com/owner/repo", { owner: "owner", repo: "repo" }],
  ["github.com/owner/repo", { owner: "owner", repo: "repo" }],
  [" https://github.com/owner/repo.git ", { owner: "owner", repo: "repo" }],
  ["https://github.com/owner/repo/", { owner: "owner", repo: "repo" }],
  ["https://github.com:443/owner/repo", { owner: "owner", repo: "repo" }],
];
```

Reject HTTP, credentials, port 444, subdomains, query, empty `?`, fragment, empty `#`, extra paths, duplicate slashes, dot segments, backslashes, internal whitespace, encoded separators, non-GitHub hosts, missing owner/repo, and repo names `.` or `..`. Share parsing must require exactly one non-empty `repo` parameter and reject duplicate parameters.

- [ ] **Step 2: Run focused red**

Run: `pnpm vitest run src/features/repository/repo-url.test.ts`

Expected: FAIL because `repo-url.ts` is absent.

- [ ] **Step 3: Implement raw-shape validation before WHATWG normalization**

Use an anchored raw expression that excludes `/`, `?`, `#`, and backslash from both path segments, then construct `URL` only after the raw form passes. Require `https:`, `github.com`, an empty normalized port, no username/password/search/hash, exactly two decoded non-dot path segments, and no decoded slash/backslash/control character.

```ts
const RAW_REPOSITORY_URL =
  /^(?:https:\/\/)?github\.com\/(?<owner>[^/?#\\]+)\/(?<repo>[^/?#\\]+?)(?:\.git)?\/?$/i;

export class RepoUrlError extends Error {
  readonly name = "RepoUrlError";
}
```

Serialize shares with `new URLSearchParams({ repo: `${owner}/${repo}` }).toString()` and parse with `getAll("repo")` to detect duplicates.

- [ ] **Step 4: Verify focused and full green**

Run: `pnpm vitest run src/features/repository/repo-url.test.ts`

Expected: all URL and share cases PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 5: Commit the URL boundary**

```bash
git add src/features/repository/repo-url.ts src/features/repository/repo-url.test.ts src/features/analysis/model.ts
git diff --cached --check
git commit -m "feat: validate public repository URLs"
```

---

### Task 3: GitHub Snapshot and Immutable Raw Client

**Files:**

- Create: `src/features/github/raw-model.ts`
- Create: `src/features/github/github-client.ts`
- Test: `src/features/github/github-client.test.ts`
- Create: `src/test/fixtures/github.ts`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces: `GitHubApiError`, `RepositorySnapshot`, `RawTreeEntry`, `RawTextResult`, `fetchRepositorySnapshot(ref, signal, fetchImpl?)`, and `fetchRawTextFile(input, signal, fetchImpl?)`.
- `fetchRepositorySnapshot` returns normalized repository metadata, pinned commit SHA, raw tree SHA, raw tree entries, `treeComplete`, and rate metadata.
- `fetchRawTextFile` consumes `{ ref, commitSha, path, declaredSize }` and returns `{ path, text, bytes }`; it never accepts a remote-provided URL.

- [ ] **Step 1: Write failing transport and hostile-shape tests**

The successful test must assert these exact request paths and headers in order:

```ts
expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
  "https://api.github.com/repos/owner/repo",
  "https://api.github.com/repos/owner/repo/commits/main",
  "https://api.github.com/repos/owner/repo/git/trees/tree-sha?recursive=1",
]);

for (const [, init] of fetchMock.mock.calls) {
  expect(init).toMatchObject({
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    signal,
  });
}
```

Add failures for malformed JSON shapes, private/404 ambiguity, empty-repository 409, rate-limit 403/429 with finite reset timestamp, other API status without body leakage, network error, abort preservation, moving/default branch names requiring encoding, invalid tree entry sizes/modes, raw file over 256 KiB before fetch, raw response over limit by `Content-Length`, streamed body crossing 256 KiB, invalid UTF-8, and timeout.

- [ ] **Step 2: Run focused red**

Run: `pnpm vitest run src/features/github/github-client.test.ts`

Expected: FAIL because the client and raw guards do not exist.

- [ ] **Step 3: Implement minimal raw interfaces and typed errors**

```ts
export type GitHubErrorKind =
  | "not-found"
  | "rate-limit"
  | "empty"
  | "network"
  | "api"
  | "invalid-response"
  | "file-limit"
  | "invalid-text";

export class GitHubApiError extends Error {
  constructor(
    public readonly kind: GitHubErrorKind,
    public readonly status?: number,
    public readonly resetAt?: string,
  ) {
    super(kind);
    this.name = "GitHubApiError";
  }
}
```

Guards must reject arrays/objects with missing fields, non-finite numbers, negative sizes, hexadecimal SHAs whose length is neither 40 nor 64, invalid timestamps, or non-blob/tree entry types. Do not include remote error messages in thrown errors.

- [ ] **Step 4: Implement the three-call snapshot sequence**

Fetch repository, read `default_branch`, fetch that encoded commit, read `sha` and `commit.tree.sha`, then fetch the recursive tree. Combine rate headers by keeping the lowest finite remaining count and the latest valid reset timestamp. Use the caller's abort signal for all calls.

```ts
const repository = await requestJson(repositoryUrl(ref), signal, fetchImpl);
const repo = guardRepository(repository);
const commit = guardCommit(
  await requestJson(commitUrl(ref, repo.defaultBranch), signal, fetchImpl),
);
const tree = guardTree(
  await requestJson(treeUrl(ref, commit.treeSha), signal, fetchImpl),
);
return {
  repository: repo,
  commitSha: commit.sha,
  treeSha: commit.treeSha,
  entries: tree.entries,
  treeComplete: !tree.truncated,
  rateLimit: mergeRateLimits(rateSamples),
};
```

- [ ] **Step 5: Implement bounded immutable raw streaming**

Construct the URL from validated components:

```ts
const encodedPath = input.path.split("/").map(encodeURIComponent).join("/");
const url = `https://raw.githubusercontent.com/${encodeURIComponent(input.ref.owner)}/${encodeURIComponent(input.ref.repo)}/${input.commitSha}/${encodedPath}`;
```

Reject a declared size over 262,144 bytes before the request. Read `response.body` with a reader, abort when accumulated bytes exceed 262,144, decode with `new TextDecoder("utf-8", { fatal: true })`, and return only validated text and actual bytes. A per-file timeout combines with the run abort signal and is cleared in `finally`.

- [ ] **Step 6: Verify focused and full green**

Run: `pnpm vitest run src/features/github/github-client.test.ts`

Expected: all transport, guard, limit, and abort cases PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit the transport boundary**

```bash
git add src/features/github/raw-model.ts src/features/github/github-client.ts src/features/github/github-client.test.ts src/features/analysis/model.ts src/test/fixtures/github.ts
git diff --cached --check
git commit -m "feat: fetch immutable public repository data"
```

---

### Task 4: Tree Classification and Deterministic Selection

**Files:**

- Create: `src/features/scanner/file-registry.ts`
- Create: `src/features/scanner/tree.ts`
- Create: `src/features/scanner/select-files.ts`
- Test: `src/features/scanner/file-registry.test.ts`
- Test: `src/features/scanner/tree.test.ts`
- Test: `src/features/scanner/select-files.test.ts`
- Modify: `src/features/analysis/model.ts`
- Modify: `src/test/fixtures/github.ts`

**Interfaces:**

- Produces: `normalizeTree(entries, truncated): NormalizedTree`, `classifyFile(path, size): FileClassification`, `isExcludedPath(path): boolean`, and `selectFiles(tree, limits?): SelectionPlan`.
- `SelectionPlan` contains ordered `SelectedFile[]`, eligible counts/bytes, unsupported counts, declared selected bytes, `limitReached`, and per-reason skip counts.
- Consumes: raw tree entries from Task 3 and the exact dictionaries in design §§6.4–6.5 and 8.11.

```ts
export interface NormalizedTreeFile {
  path: string;
  sha: string;
  size: number;
  mode: "100644" | "100755";
}

export interface FileClassification {
  eligible: boolean;
  language: SourceLanguage;
  category: FileCategory;
  deep: boolean;
  isTest: boolean;
  treeEvidence?: "lockfile" | "generated-directory";
  skipReason?: "excluded" | "binary" | "oversized" | "unsupported";
}

export interface SelectedFile extends NormalizedTreeFile, FileClassification {
  eligible: true;
  priority: 1 | 2 | 3 | 4 | 5 | 6;
  topLevelArea: string;
}
```

- [ ] **Step 1: Write failing registry and normalization tests**

Assert POSIX-only normalized paths; reject control characters, NUL, empty/dot/dot-dot segments, leading slash, backslash, non-blob entries in the file list, blob modes other than ordinary `100644`/`100755` files, symlink mode `120000`, submodule mode `160000`, negative/non-finite sizes, and duplicate normalized paths. Assert exact deep/general extensions, documentation/config categories, lockfile presence without content selection, and every exclusion segment from design §6.4.

```ts
expect(classifyFile("src/main.ts", 1200)).toMatchObject({
  eligible: true,
  language: "typescript",
  category: "source",
  deep: true,
});
expect(classifyFile("node_modules/x/index.js", 10).eligible).toBe(false);
expect(classifyFile("pnpm-lock.yaml", 10)).toMatchObject({
  eligible: false,
  treeEvidence: "lockfile",
});
```

- [ ] **Step 2: Write failing deterministic selection tests**

Build a fixture with docs, manifests, entry points, tests, three source directories, unsupported Go, generated output, oversized text, and more than the supplied test limit. Assert priority tiers, round-robin source diversity, path/SHA tie-breaking, selected/file/fetch limits, 10 MiB and 256 KiB boundaries, reproducibility after shuffled input, and explicit skip reasons.

```ts
const first = selectFiles(normalizeTree(shuffledA, false), {
  maxFiles: 8,
  maxBytes: 2_000,
  maxFileBytes: 500,
});
const second = selectFiles(normalizeTree(shuffledB, false), {
  maxFiles: 8,
  maxBytes: 2_000,
  maxFileBytes: 500,
});
expect(first.selected.map((file) => file.path)).toEqual(
  second.selected.map((file) => file.path),
);
expect(
  new Set(first.selected.map((file) => file.topLevelArea)).size,
).toBeGreaterThan(1);
```

- [ ] **Step 3: Run focused red**

Run: `pnpm vitest run src/features/scanner`

Expected: FAIL because registry, tree normalization, and selection are absent.

- [ ] **Step 4: Implement exact registries and pure tree normalization**

Copy the canonical file sets, heading/command dictionaries, source extensions, and exclusions from design §8.11 into frozen exported constants. Normalize one entry at a time; return new arrays sorted by normalized path and SHA. Do not mutate GitHub fixtures.

```ts
export function normalizeTree(
  entries: readonly RawTreeEntry[],
  truncated: boolean,
): NormalizedTree {
  const files = entries
    .filter(isOrdinaryBlob)
    .map(normalizeOrdinaryBlob)
    .sort((a, b) => a.path.localeCompare(b.path) || a.sha.localeCompare(b.sha));
  assertUniquePaths(files);
  return { files, complete: !truncated };
}
```

- [ ] **Step 5: Implement stable priority and round-robin selection**

Map categories to integer tiers 1–6 from design §6.5. Within tiers 1–4 sort by normalized path/SHA. For supported-source tiers 5–6, group by first meaningful source area, sort each group, then take one from each lexicographically ordered group per round until the next file would cross a limit. Record, rather than silently omit, size, extension, excluded-path, budget, unsupported, and invalid-entry reasons.

```ts
while (groups.some((group) => group.length > 0)) {
  for (const group of groups) {
    const candidate = group.shift();
    if (!candidate) continue;
    if (wouldCrossLimit(candidate, selected, limits)) {
      skipped.push({ path: candidate.path, reason: "budget" });
      continue;
    }
    selected.push(candidate);
  }
}
```

- [ ] **Step 6: Verify focused and full green**

Run: `pnpm vitest run src/features/scanner`

Expected: all registry, hostile tree, priority, diversity, and boundary cases PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit selection**

```bash
git add src/features/scanner/file-registry.ts src/features/scanner/file-registry.test.ts src/features/scanner/tree.ts src/features/scanner/tree.test.ts src/features/scanner/select-files.ts src/features/scanner/select-files.test.ts src/features/analysis/model.ts src/test/fixtures/github.ts
git diff --cached --check
git commit -m "feat: select bounded repository evidence"
```

---

### Task 5: General Repository Evidence

**Files:**

- Create: `src/features/analyzers/general.ts`
- Create: `src/features/analyzers/line-metrics.ts`
- Test: `src/features/analyzers/general.test.ts`
- Test: `src/features/analyzers/line-metrics.test.ts`
- Create: `src/test/fixtures/text-files.ts`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces: `analyzeGeneralRepository(input: GeneralAnalysisInput): GeneralMetrics`.
- Produces: `countLogicalLines(text, language): number`, `lineAtOffset(text, offset): number`, `findMarkdownEvidence(text): MarkdownEvidence`, and structured package/TOML readers.
- `GeneralAnalysisInput` contains normalized repository metadata, normalized tree evidence, and successfully fetched `FetchedTextFile[]`; no network or DOM dependency is allowed.
- `GeneralMetrics` exposes one typed field for every general rule fact rather than pre-scored prose.

- [ ] **Step 1: Write failing line and Markdown evidence tests**

Use fixed English and Chinese README fixtures containing setup, run, architecture, and configuration headings. Assert Unicode NFKC, Markdown-marker stripping, whole-phrase matching, fenced-command executable allowlist, prompt stripping, and the rule that prose-only headings are partial rather than full evidence.

```ts
expect(findMarkdownEvidence(englishReadme)).toMatchObject({
  installHeading: true,
  installCommand: true,
  usageHeading: true,
  usageCommandOrExample: true,
  architectureHeading: true,
  configurationHeading: true,
});
expect(findMarkdownEvidence("## 安装\n这里介绍安装概念。")).toMatchObject({
  installHeading: true,
  installCommand: false,
});
```

Assert logical-line counts exclude blank/comment-only lines for JS/TS/Python and preserve mixed code/comment lines.

- [ ] **Step 2: Write failing structured-evidence tests**

Provide valid and malformed `package.json` and `pyproject.toml` fixtures. Assert exact entry-point, run/build, test, static-check, coverage, version, environment example, CI, dependency update, community-file, test-file ratio inputs, and tree-hygiene facts from design §8.11. Malformed files become recorded parse failures and never throw the entire analysis.

- [ ] **Step 3: Run focused red**

Run: `pnpm vitest run src/features/analyzers/general.test.ts src/features/analyzers/line-metrics.test.ts`

Expected: FAIL because the general analyzer and helpers are missing.

- [ ] **Step 4: Implement pure text and structured readers**

Parse JSON with a size-bounded `JSON.parse` and validate objects before reading fields. Parse TOML with `smol-toml`; catch and record syntax failures. For other manifests, extract only file-presence evidence in `0.1.0`. Treat selected files below path segments `example`, `examples`, `demo`, `sample`, or `samples` as example evidence, with README concrete usage as the documented alternative. Scan Markdown headings and fenced blocks with a line state machine so remote Markdown is never rendered.

Return explicit facts such as:

```ts
export interface GeneralMetrics {
  hasReadme: boolean;
  installHeading: boolean;
  installCommand: boolean;
  usageHeading: boolean;
  usageCommandOrExample: boolean;
  hasContributing: boolean;
  hasLicenseFile: boolean;
  apiLicenseDetected: boolean;
  hasArchitectureEvidence: boolean;
  hasManifest: boolean;
  hasStructuredEntryPoint: boolean;
  hasConventionalEntryPoint: boolean;
  hasRunCommand: boolean;
  hasBuildCommand: boolean;
  hasExample: boolean;
  hasVersionHistory: boolean;
  hasManifestVersion: boolean;
  hasConfigurationEvidence: boolean;
  testFileCount: number;
  supportedSourceFileCount: number;
  hasCi: boolean;
  hasTestCommand: boolean;
  hasStaticCheckCommand: boolean;
  hasCoverageEvidence: boolean;
  hasLockfile: boolean;
  hasDependencyUpdates: boolean;
  hasIssueOrPrTemplates: boolean;
  hasSecurityPolicy: boolean;
  hasCodeOfConduct: boolean;
  committedGeneratedDirectoryCount: number;
  parseFailures: Array<{ path: string; reason: "json" | "toml" }>;
}
```

- [ ] **Step 5: Verify focused and full green**

Run: `pnpm vitest run src/features/analyzers/general.test.ts src/features/analyzers/line-metrics.test.ts`

Expected: all English/Chinese heading, command, manifest, malformed-input, and logical-line cases PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 6: Commit general evidence**

```bash
git add src/features/analyzers/general.ts src/features/analyzers/line-metrics.ts src/features/analyzers/general.test.ts src/features/analyzers/line-metrics.test.ts src/features/analysis/model.ts src/test/fixtures/text-files.ts
git diff --cached --check
git commit -m "feat: extract general project evidence"
```

---

### Task 6: JavaScript and TypeScript Deep Analyzer

**Files:**

- Create: `src/features/analyzers/js-ts.ts`
- Test: `src/features/analyzers/js-ts.test.ts`
- Create: `src/test/fixtures/js-ts-source.ts`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces: `analyzeJavaScriptTypeScript(files: FetchedTextFile[]): LanguageAnalysis`.
- `LanguageAnalysis` contains per-file logical lines, per-function length/complexity/nesting/error handling, identifier counts, export/doc counts, normalized tokens, relative imports, and parse failures.
- The module is dynamically imported only by the worker and must not be statically imported by the main bundle.

Use this shared output shape for Tasks 6–8:

```ts
export interface FunctionMetric {
  path: string;
  name: string;
  startLine: number;
  endLine: number;
  logicalLines: number;
  cyclomatic: number;
  maxNesting: number;
  hasErrorHandling: boolean;
  isTest: boolean;
}

export interface AnalyzedSourceFile {
  path: string;
  language: "javascript" | "typescript" | "python";
  logicalLines: number;
  isTest: boolean;
  normalizedTokens: string[];
  relativeImports: string[];
}

export interface LanguageAnalysis {
  files: AnalyzedSourceFile[];
  functions: FunctionMetric[];
  identifierOccurrences: number;
  ambiguousIdentifierOccurrences: number;
  exportedDeclarations: number;
  documentedExports: number;
  parsedBytes: number;
  parseFailures: Array<{
    path: string;
    language: "javascript" | "typescript" | "python";
    reason: "syntax";
  }>;
}
```

- [ ] **Step 1: Write failing fixture metrics**

Use `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts` fixtures. Include function declaration/expression, arrow, method/getter/setter, loops, if/else, catch, switch, ternary, `&&`, `||`, `??`, nested functions, JSDoc export, undocumented export, relative/package/type-only/dynamic imports, malformed syntax, tests, and `.d.ts`.

For one compact fixture, assert exact results:

```ts
const result = analyzeJavaScriptTypeScript([
  sourceFile(
    "src/choose.ts",
    `/** Choose a value. */
     export function choose(value: number | null) {
       if (value && value > 1) return value;
       return value ?? 0;
     }`,
  ),
]);

expect(result.functions[0]).toMatchObject({
  path: "src/choose.ts",
  name: "choose",
  cyclomatic: 4,
  maxNesting: 1,
  hasErrorHandling: false,
  isTest: false,
});
expect(result.exportedDeclarations).toBe(1);
expect(result.documentedExports).toBe(1);
```

The complexity is `1` base + `if` + `&&` + `??`.

- [ ] **Step 2: Run focused red**

Run: `pnpm vitest run src/features/analyzers/js-ts.test.ts`

Expected: FAIL because `js-ts.ts` does not exist.

- [ ] **Step 3: Implement extension-specific Babel parsing**

Call `parse` with `sourceType: "unambiguous"`, `errorRecovery: true`, `ranges: true`, `tokens: true`, and plugins chosen from `jsx`, `typescript`, and `decorators` by syntax/extension. Include decorated-class/function fixtures so the enabled plugin set is proven. Parse each file independently; a failed file adds `{ path, language: "javascript" | "typescript", reason: "syntax" }` and cannot discard other metrics.

```ts
const ast = parse(file.text, {
  sourceType: "unambiguous",
  errorRecovery: true,
  ranges: true,
  tokens: true,
  plugins: parserPluginsFor(file.path),
});
walk(ast.program, {
  enter(node, parents) {
    collectFunctionAndBranchMetrics(node, parents, file, output);
  },
});
```

Traverse Babel nodes with an explicit visitor function and `@babel/types` guards. Use design §8.11 definitions exactly. Compute line positions from node offsets, logical-line masks from Task 5, function-local decision/nesting counts, and one error-handling boolean per function.

- [ ] **Step 4: Implement identifiers, exports, imports, and tokens**

Count binding/parameter/declaration/import identifiers only; do not count property keys, labels, JSX tag names, or object literal keys as local identifiers. Apply the exact lowercase allowlist. Associate a JSDoc block only when it ends on the preceding nonblank line. Retain relative value imports and exports, omit package/dynamic/type-only imports, and emit normalized token values with literals replaced by `STRING`, `TEMPLATE`, or `NUMBER`.

```ts
const normalizedTokens = ast.tokens.map((token) => {
  if (isStringToken(token)) return "STRING";
  if (isTemplateToken(token)) return "TEMPLATE";
  if (isNumericToken(token)) return "NUMBER";
  return file.text.slice(token.start, token.end);
});
```

- [ ] **Step 5: Verify focused and full green**

Run: `pnpm vitest run src/features/analyzers/js-ts.test.ts`

Expected: all extensions, node kinds, exact complexity, nesting, docs, identifiers, imports, tokens, declaration exclusion, and malformed-file cases PASS.

Run: `pnpm check`

Expected: PASS and the production build contains a separate JS/TS analyzer chunk.

- [ ] **Step 6: Commit the JS/TS analyzer**

```bash
git add src/features/analyzers/js-ts.ts src/features/analyzers/js-ts.test.ts src/features/analysis/model.ts src/test/fixtures/js-ts-source.ts
git diff --cached --check
git commit -m "feat: analyze JavaScript and TypeScript metrics"
```

---

### Task 7: Python Deep Analyzer

**Files:**

- Create: `src/features/analyzers/python.ts`
- Test: `src/features/analyzers/python.test.ts`
- Create: `src/test/fixtures/python-source.ts`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces: `analyzePython(files: FetchedTextFile[]): LanguageAnalysis` with the same serializable output contract as Task 6.
- Consumes: Lezer `parser` and `TreeCursor`; deep definitions from design §8.11.
- The module is a lazy worker import and is absent from the initial main chunk.

- [ ] **Step 1: Write failing Python syntax metrics**

Fixtures must cover `FunctionDefinition`, async functions, classes/methods, `IfStatement` with `elif`, `ForStatement`, `WhileStatement`, `TryStatement` with multiple `except`, `RaiseStatement`, `ConditionalExpression`, `BinaryExpression` using `and`/`or`, `MatchStatement`/`MatchClause`, nested functions, docstrings, public/private names, imports, malformed syntax, tests, and `.pyi` exclusion.

Assert one exact example:

```ts
const result = analyzePython([
  sourceFile(
    "src/choose.py",
    `def choose(value):
         """Choose a value."""
         if value and value > 1:
             return value
         return 0`,
  ),
]);

expect(result.functions[0]).toMatchObject({
  path: "src/choose.py",
  name: "choose",
  cyclomatic: 3,
  maxNesting: 1,
  hasErrorHandling: false,
  isTest: false,
});
expect(result.exportedDeclarations).toBe(1);
expect(result.documentedExports).toBe(1);
```

- [ ] **Step 2: Run focused red**

Run: `pnpm vitest run src/features/analyzers/python.test.ts`

Expected: FAIL because `python.ts` does not exist.

- [ ] **Step 3: Implement a cursor-based Lezer traversal**

Parse each file independently. Traverse named nodes and keyword children; maintain a stack of current functions and nesting constructs. Count the exact node/keyword sets from design §8.11. Use the first `VariableName` after `def` as the function name, `ParamList` bindings for parameter identifiers, and the first statement string inside `Body` as a docstring.

Lezer returns a recovery tree for malformed input. Mark a file failed when the tree contains an error node; do not score its partial metrics.

```ts
const tree = parser.parse(file.text);
if (containsErrorNode(tree.cursor())) {
  return { path: file.path, language: "python", reason: "syntax" };
}
visitCursor(tree.cursor(), [], (cursor, ancestors) => {
  collectPythonMetric(cursor, ancestors, file, output);
});
```

- [ ] **Step 4: Implement Python imports, identifiers, and tokens**

Retain only relative `from .` imports for graph edges. Exclude keywords, property names, private public-API candidates, and allowlisted identifiers. Walk terminal tokens to normalize literals and preserve identifier/operator tokens for duplication.

```ts
if (cursor.type.name === "ImportStatement") {
  const statement = file.text.slice(cursor.from, cursor.to);
  const relative = parseRelativePythonImport(statement);
  if (relative) currentFile.relativeImports.push(relative);
}
```

- [ ] **Step 5: Verify focused and full green**

Run: `pnpm vitest run src/features/analyzers/python.test.ts`

Expected: exact functions, decisions, Boolean operands, nesting, error handling, docs, imports, tokens, malformed syntax, tests, and `.pyi` cases PASS.

Run: `pnpm check`

Expected: PASS and the build contains a separate Python analyzer chunk.

- [ ] **Step 6: Commit the Python analyzer**

```bash
git add src/features/analyzers/python.ts src/features/analyzers/python.test.ts src/features/analysis/model.ts src/test/fixtures/python-source.ts
git diff --cached --check
git commit -m "feat: analyze Python source metrics"
```

---

### Task 8: Cross-File Duplication and Import Structure

**Files:**

- Create: `src/features/analyzers/cross-file.ts`
- Test: `src/features/analyzers/cross-file.test.ts`
- Modify: `src/features/analysis/model.ts`
- Modify: `src/test/fixtures/js-ts-source.ts`
- Modify: `src/test/fixtures/python-source.ts`

**Interfaces:**

- Produces: `computeDuplicateRatio(files: TokenizedFile[]): DuplicateMetrics` and `findCircularImports(files: ImportingFile[]): ImportCycleMetrics`.
- `DuplicateMetrics` contains total eligible tokens, duplicated tokens, unrounded ratio, and bounded path-pair evidence.
- `ImportCycleMetrics` contains strongly connected components sorted by size/path and a `largestComponentSize`.

- [ ] **Step 1: Write failing duplicate boundary tests**

Create two files with exactly one shared, non-overlapping 50-token normalized span and a third same-file repeated span. Assert cross-file matching, maximal extension, literal normalization, test exclusion, overlap removal, deterministic evidence ordering, exactly 5%/10% ratio fixtures, and zero-token behavior.

```ts
expect(computeDuplicateRatio(files)).toMatchObject({
  totalEligibleTokens: 2000,
  duplicatedTokens: 100,
  ratio: 0.05,
});
```

- [ ] **Step 2: Write failing graph-resolution tests**

Assert JS extension/index resolution, Python package/`__init__.py` resolution, unresolved package import exclusion, acyclic graphs, one two-file cycle, one three-file strongly connected component, self-loop exclusion, and stable ordering after shuffled input.

- [ ] **Step 3: Run focused red**

Run: `pnpm vitest run src/features/analyzers/cross-file.test.ts`

Expected: FAIL because cross-file metrics do not exist.

- [ ] **Step 4: Implement rolling windows and maximal duplicate spans**

Hash 50-token windows, keep file/path/start positions, compare only hash buckets across different non-test files, extend equal spans, then choose non-overlapping spans in descending length and path/start order. Count tokens participating in at least one accepted span once.

```ts
const buckets = indexWindows(nonTestFiles, 50);
const candidates = extendCrossFileMatches(buckets).sort(
  byLengthThenPathThenStart,
);
const accepted = chooseNonOverlapping(candidates);
return summarizeDuplicateTokens(nonTestFiles, accepted);
```

- [ ] **Step 5: Implement relative resolution and Tarjan SCC**

Normalize candidate paths before lookup. Implement exact extension/index/package rules from design §8.11. Run Tarjan's algorithm over sorted nodes/edges, discard components of size one, and return stable evidence.

```ts
const graph = buildResolvedImportGraph(files);
const components = tarjan(graph)
  .filter((component) => component.length > 1)
  .map((component) => component.toSorted())
  .toSorted((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run src/features/analyzers/cross-file.test.ts`

Expected: all duplicate and graph cases PASS.

Run: `pnpm check`

Expected: PASS.

```bash
git add src/features/analyzers/cross-file.ts src/features/analyzers/cross-file.test.ts src/features/analysis/model.ts src/test/fixtures/js-ts-source.ts src/test/fixtures/python-source.ts
git diff --cached --check
git commit -m "feat: detect duplicate and circular structure"
```

---

### Task 9: Versioned Scoring, Confidence, and Findings

**Files:**

- Create: `src/features/rules/rules.ts`
- Create: `src/features/rules/confidence.ts`
- Create: `src/features/rules/findings.ts`
- Test: `src/features/rules/rules.test.ts`
- Test: `src/features/rules/confidence.test.ts`
- Test: `src/features/rules/findings.test.ts`
- Create: `src/test/fixtures/metrics.ts`
- Modify: `src/features/analysis/model.ts`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`

**Interfaces:**

- Produces: `RULESET_VERSION = "1.0.0"`, `scoreRule(ruleId: string, metrics: Readonly<Record<string, number | boolean | string | null>>): RuleResult`, `scoreProject(input: ScoreProjectInput): ScoredProject`, `calculateConfidence(coverage: CoverageSummary): ConfidenceResult`, and `buildFindings(scored: ScoredProject): FindingSummary`.
- Every `RuleResult` contains stable rule ID, dimension, state, earned/available points, generated evidence key/arguments, recommendation key/arguments, and bounded file references.
- All recommendation/evidence text is localized later from keys; the rules layer contains no English/Chinese prose.

```ts
export interface ScoreProjectInput {
  repository: RepositorySnapshot["repository"];
  general: GeneralMetrics;
  language: LanguageAnalysis;
  duplicates: DuplicateMetrics;
  cycles: ImportCycleMetrics;
  coverage: CoverageSummary;
  analyzedAt: string;
}

export interface ScoredProject {
  rules: RuleResult[];
  dimensions: DimensionResult[];
  overall: AnalysisReport["overall"];
  confidence: AnalysisReport["confidence"];
}

export interface ConfidenceResult {
  percent: number;
  label: "high" | "medium" | "low";
}

export interface FindingSummary {
  strengths: Strength[];
  weaknesses: Improvement[];
}
```

- [ ] **Step 1: Write all threshold boundary tests before implementation**

Use `it.each` for every full/partial/fail threshold in design §§8.2–8.7. Include exact elapsed UTC day boundaries at 180, 181, 365, and 366 days using `2026-08-11T12:00:00Z`. Assert unavailable readability/complexity below five files and 2,000 lines, applicability at either threshold, and not-applicable test ratio/error handling.

```ts
it.each([
  [40, "passed", 4],
  [41, "partial", 2],
  [60, "partial", 2],
  [61, "failed", 0],
])("scores median function length %s", (median, state, earned) => {
  const result = scoreRule("readability.median-function-length", { median });
  expect(result).toMatchObject({ state, earned, available: 4 });
});
```

- [ ] **Step 2: Write overall and confidence failing tests**

Assert a perfect applicable fixture scores 100, weights sum to 100, not-applicable points are removed and normalized, general-only reports are preliminary, labels change exactly at 49/50/69/70/84/85, and display rounding does not affect threshold input.

```ts
expect(
  calculateConfidence({
    treeComplete: false,
    eligibleBytes: 100,
    fetchedBytes: 100,
    eligibleSourceBytes: 100,
    parsedSupportedBytes: 100,
  }),
).toEqual({ percent: 75, label: "medium" });

expect(
  calculateConfidence({
    treeComplete: true,
    eligibleBytes: 100,
    fetchedBytes: 100,
    eligibleSourceBytes: 100,
    parsedSupportedBytes: 0,
  }),
).toEqual({ percent: 60, label: "medium" });
```

- [ ] **Step 3: Write deterministic finding selection tests**

Assert at most five strengths, at most two per dimension, high/medium/low priority rules, lost-point ordering, rule-ID tie-breaks, concrete references only, and exhaustive bilingual message keys for every evidence/recommendation key.

- [ ] **Step 4: Run focused red**

Run: `pnpm vitest run src/features/rules src/i18n/messages.test.ts`

Expected: FAIL because rules, confidence, findings, and new messages do not exist.

- [ ] **Step 5: Implement declarative rule definitions**

Define one frozen entry per design signal with exact points and a pure evaluator. Calculate unrounded percentiles/ratios from counts, then round only display fields. Use `not-applicable` rather than zero when its explicit precondition fails. Assert at module initialization that weights and signal points match the design totals.

Sort metric arrays numerically. Median is the middle item for odd length and the arithmetic mean of the two middle items for even length. The 90th percentile uses the nearest-rank item at zero-based index `Math.ceil(0.9 * length) - 1`. Empty arrays make their deep rule not applicable.

```ts
const RULE_DEFINITIONS = {
  "readability.median-function-length": {
    dimension: "readability",
    available: 4,
    evaluate: ({ median }: { median: number }) =>
      median <= 40
        ? result("passed", 4)
        : median <= 60
          ? result("partial", 2)
          : result("failed", 0),
  },
} as const;
```

The definition object must contain exactly these IDs, each with the points and inclusive thresholds from design §§8.2–8.7:

```ts
const RULE_IDS = [
  "documentation.readme",
  "documentation.installation",
  "documentation.usage",
  "documentation.contributing",
  "documentation.license",
  "documentation.architecture",
  "operability.manifest",
  "operability.entry-point",
  "operability.run-build",
  "operability.example",
  "operability.error-handling",
  "operability.version-history",
  "operability.configuration",
  "readability.median-function-length",
  "readability.p90-function-length",
  "readability.large-file-ratio",
  "readability.median-nesting",
  "readability.ambiguous-identifiers",
  "readability.documented-exports",
  "complexity.median-cyclomatic",
  "complexity.p90-cyclomatic",
  "complexity.max-nesting",
  "complexity.very-large-files",
  "complexity.duplication",
  "complexity.circular-imports",
  "testing.test-files",
  "testing.test-source-ratio",
  "testing.ci",
  "testing.test-command",
  "testing.static-check",
  "testing.coverage",
  "maintenance.activity",
  "maintenance.lockfile",
  "maintenance.dependency-updates",
  "maintenance.templates",
  "maintenance.security",
  "maintenance.code-of-conduct",
  "maintenance.version-history",
  "maintenance.generated-directories",
] as const;
```

- [ ] **Step 6: Implement confidence and overall score exactly**

```ts
const treeCompleteness = coverage.treeComplete ? 1 : 0;
const eligibleByteCoverage = safeRatio(
  coverage.fetchedBytes,
  coverage.eligibleBytes,
);
const supportedParserCoverage = safeRatio(
  coverage.parsedSupportedBytes,
  coverage.eligibleSourceBytes,
);
const raw =
  100 *
  (0.25 * treeCompleteness +
    0.35 * eligibleByteCoverage +
    0.4 * supportedParserCoverage);
```

Clamp inputs to valid finite non-negative counts before calculation. Apply exact confidence and overall labels from design §§8.8–8.9.

- [ ] **Step 7: Implement findings and bilingual templates**

Return only key/argument pairs from rules. Add semantically equivalent English/Chinese dictionary entries and assert parity. Sanitize numeric/path arguments at render boundaries rather than interpolating remote text inside HTML.

```ts
return {
  key: "finding.readability.medianFunctionLength",
  args: { value: metrics.medianFunctionLength, threshold: 40 },
};
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm vitest run src/features/rules src/i18n/messages.test.ts`

Expected: every signal boundary, overall score, confidence, applicability, label, strength cap, priority, ordering, and i18n key case PASS.

Run: `pnpm check`

Expected: PASS.

```bash
git add src/features/rules/rules.ts src/features/rules/rules.test.ts src/features/rules/confidence.ts src/features/rules/confidence.test.ts src/features/rules/findings.ts src/features/rules/findings.test.ts src/features/analysis/model.ts src/i18n/messages.ts src/i18n/messages.test.ts src/test/fixtures/metrics.ts
git diff --cached --check
git commit -m "feat: score versioned repository evidence"
```

---

### Task 10: Worker Pipeline, Concurrency, Cache, and React Orchestration

**Files:**

- Create: `src/features/worker/protocol.ts`
- Create: `src/features/worker/analysis.worker.ts`
- Create: `src/features/worker/worker-client.ts`
- Create: `src/features/cache/report-cache.ts`
- Create: `src/features/analysis/guards.ts`
- Create: `src/features/analysis/service.ts`
- Create: `src/features/analysis/use-repository-analysis.ts`
- Test: `src/features/worker/analysis.worker.test.ts`
- Test: `src/features/worker/worker-client.test.ts`
- Test: `src/features/cache/report-cache.test.ts`
- Test: `src/features/analysis/guards.test.ts`
- Test: `src/features/analysis/service.test.ts`
- Test: `src/features/analysis/use-repository-analysis.test.tsx`
- Modify: `src/features/analysis/model.ts`

**Interfaces:**

- Produces worker commands `start` and `cancel`; worker events `progress`, `complete`, and `error`, all carrying `requestId`.
- Produces dependency-injectable `executeAnalysis(command, dependencies, emit): Promise<void>` for worker tests and the worker entry.
- Produces `runAnalysis(ref, options): { promise: Promise<AnalysisReport>; cancel(): void }`.
- Produces `getCachedReport(ref, nowMs)`, `setCachedReport(ref, report, nowMs)`, `removeCachedReport(ref)`, and `analyzeRepository(ref, { force, signal, onProgress })`.
- Produces React state `{ status, progress, report, error }` and actions `{ analyze, refresh, cancel, reset }`.

- [ ] **Step 1: Write the hostile report-guard and cache red tests**

Build one valid complete report fixture and mutate each nested field: wrong ruleset, missing dimension, duplicate rule ID, non-finite score/count, out-of-range earned points, invalid enum/path/ISO date/SHA, remote source-text field, future saved time, expired saved time, wrong repository slug, and oversized serialized entry. Assert invalid entries are removed and return cache miss. Assert storage get/set/remove exceptions degrade without throwing.

```ts
expect(getCachedReport(ref, now)).toEqual(validReport);
sessionStorage.setItem(
  cacheKey(ref),
  JSON.stringify({
    savedAt: now + 1,
    report: validReport,
  }),
);
expect(getCachedReport(ref, now)).toBeNull();
expect(sessionStorage.getItem(cacheKey(ref))).toBeNull();
```

- [ ] **Step 2: Write worker progress, limits, and partial-result red tests**

Inject fixture fetch/analyzer dependencies into an exported `executeAnalysis` function used by the worker entry. Assert phase order, three REST requests, selected/fetch attempt cap, six-request concurrency maximum, 10 MiB stop, per-file failures retained, 90-second phase abort with fake timers, conditional dynamic imports by detected language, partial report completion, and raw source absence from the result.

- [ ] **Step 3: Write stale-result and cancellation red tests**

Use deferred workers/promises. Assert a second analysis cancels the first; late first completion cannot replace second state; unmount cancels; abort is not shown as an error; refresh sets `force: true`; failed refresh preserves the prior report; progress from an old request ID is ignored.

- [ ] **Step 4: Run focused red**

Run: `pnpm vitest run src/features/worker src/features/cache src/features/analysis/guards.test.ts src/features/analysis/service.test.ts src/features/analysis/use-repository-analysis.test.tsx`

Expected: FAIL because protocol, worker, cache, guards, service, and hook are absent.

- [ ] **Step 5: Implement the serializable protocol and bounded pool**

```ts
export interface ScanProgress {
  phase: ScanPhase;
  completedFiles: number;
  totalFiles: number;
  completedBytes: number;
  totalBytes: number;
}

export interface SerializableAnalysisError {
  kind:
    | "invalid-url"
    | "not-found"
    | "rate-limit"
    | "empty"
    | "network"
    | "api"
    | "invalid-response"
    | "worker";
  status?: number;
  resetAt?: string;
}

export type WorkerCommand =
  | { type: "start"; requestId: number; ref: RepoRef }
  | { type: "cancel"; requestId: number };

export type WorkerEvent =
  | { type: "progress"; requestId: number; progress: ScanProgress }
  | { type: "complete"; requestId: number; report: AnalysisReport }
  | { type: "error"; requestId: number; error: SerializableAnalysisError };
```

The worker owns one `AbortController` per active request. Fetch snapshot, normalize/select, then run a six-worker promise pool over the selected array. Check attempts, fetched count, accumulated decoded bytes, cancel state, and 90-second deadline before scheduling each next file. Dynamically import `js-ts.ts` only for selected deep JS/TS and `python.ts` only for selected Python.

- [ ] **Step 6: Implement strict report guards and 15-minute cache**

Validate every nested object/array, fixed dimension set, rule state/points, counts, finite score/confidence, ISO timestamps, commit SHA, paths, message keys, ruleset version, and absence of unknown/source fields. Cap serialized cache payload at 2 MiB. Use key `reposcope:v1:{owner}/{repo}` and TTL `900_000` milliseconds. A future timestamp is invalid.

```ts
const CACHE_TTL_MS = 900_000;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

export function getCachedReport(
  ref: RepoRef,
  nowMs: number,
): AnalysisReport | null {
  const key = cacheKey(ref);
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!isValidCacheEntry(parsed, nowMs)) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.report;
  } catch {
    safeRemove(key);
    return null;
  }
}
```

- [ ] **Step 7: Implement worker client, service, and hook**

Create a new module worker for each run with:

```ts
new Worker(new URL("./analysis.worker.ts", import.meta.url), {
  type: "module",
});
```

Validate `complete` reports before resolution. On cancel, post `cancel`, terminate, remove listeners, and reject with a local abort error. The service checks the lowercased canonical repository cache key unless forced, writes only after validated success, and preserves caller aborts. The hook uses a monotonically increasing request ID plus cleanup cancellation.

- [ ] **Step 8: Verify focused, coverage, and build green**

Run: `pnpm vitest run src/features/worker src/features/cache src/features/analysis/guards.test.ts src/features/analysis/service.test.ts src/features/analysis/use-repository-analysis.test.tsx`

Expected: all hostile cache, concurrency, limit, dynamic import, cancellation, stale-result, and prior-report cases PASS.

Run: `pnpm test:coverage`

Expected: project coverage meets the configured thresholds without exclusions added for worker logic.

Run: `pnpm check`

Expected: PASS and production build emits separate worker and parser chunks.

- [ ] **Step 9: Commit orchestration**

```bash
git add src/features/worker/protocol.ts src/features/worker/analysis.worker.ts src/features/worker/analysis.worker.test.ts src/features/worker/worker-client.ts src/features/worker/worker-client.test.ts src/features/cache/report-cache.ts src/features/cache/report-cache.test.ts src/features/analysis/guards.ts src/features/analysis/guards.test.ts src/features/analysis/service.ts src/features/analysis/service.test.ts src/features/analysis/use-repository-analysis.ts src/features/analysis/use-repository-analysis.test.tsx src/features/analysis/model.ts
git diff --cached --check
git commit -m "feat: orchestrate cancellable repository analysis"
```

---

### Task 11: Bilingual Landing, Form, and Progress Experience

**Required skills at execution:** Read and apply `ui-ux-pro-max` and `elevate-web-design` before changing UI files. The approved product/layout decisions in the spec override generic style suggestions.

**Files:**

- Create: `src/components/language-switcher.tsx`
- Create: `src/components/repository-form.tsx`
- Create: `src/components/scan-progress.tsx`
- Create: `src/components/status-announcer.tsx`
- Test: `src/components/language-switcher.test.tsx`
- Test: `src/components/repository-form.test.tsx`
- Test: `src/components/scan-progress.test.tsx`
- Test: `src/components/status-announcer.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/styles/app.css`

**Interfaces:**

- `RepositoryForm` consumes `{ language, disabled, initialValue, onAnalyze }` and emits a parsed `RepoRef` only after local validation.
- `ScanProgress` consumes serializable `ScanProgress` and `onCancel`.
- `App` consumes the Task 10 hook, starts valid shared-query analysis once, and updates history only after successful manual analysis.

- [ ] **Step 1: Write bilingual form and language-switch red tests**

Assert native textbox/button roles, explicit label/helper/error association, zero `onAnalyze` for invalid input, normalized valid input, Enter submission, disabled state while running, exact example buttons `Thworry/issueready` and `psf/requests`, persistent pressed language state, browser default, guarded storage, `html[lang]`, and no analysis callback when only language changes.

- [ ] **Step 2: Write progress and App route red tests**

Assert all five localized phase labels, determinate file/byte progress when totals exist, indeterminate analysis state otherwise, `aria-live` announcements without duplicate spam, a 44-pixel cancel button, shared-query auto-start, duplicate/invalid query rejection, successful manual `history.replaceState`, and URL preservation on failure.

```tsx
expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
expect(screen.getByRole("button", { name: "Cancel analysis" })).toBeEnabled();
expect(replaceState).toHaveBeenCalledWith(null, "", "?repo=owner%2Frepo");
```

- [ ] **Step 3: Run focused red**

Run: `pnpm vitest run src/components/language-switcher.test.tsx src/components/repository-form.test.tsx src/components/scan-progress.test.tsx src/components/status-announcer.test.tsx src/App.test.tsx`

Expected: FAIL because landing/progress components and complete messages are missing.

- [ ] **Step 4: Implement the approved landing composition**

Use one H1, one primary form, restrained examples, and the visible privacy sentence. Keep the language switch in the banner. Use native controls and real labels rather than clickable generic containers. Remote repository values are not present on the landing page.

The visual direction is an editorial inspection sheet: neutral warm canvas, high-contrast ink, one restrained blue action color, tabular numeric scores, generous spacing, and no decorative gradients, glass effects, stock art, or remote assets.

```tsx
<header className="site-header">
  <a className="brand" href={import.meta.env.BASE_URL}>RepoScope 项目透视</a>
  <LanguageSwitcher language={language} onChange={setLanguage} />
</header>
<main>
  <RepositoryForm
    language={language}
    disabled={state.status === "running"}
    initialValue={input}
    onAnalyze={analyze}
  />
  {state.status === "running" && (
    <ScanProgress progress={state.progress} onCancel={cancel} />
  )}
</main>
```

- [ ] **Step 5: Implement progress and top-level routing**

Map phase keys to localized copy and expose counts/bytes without creating timers that fabricate progress. Use hook state as the authority. Parse the share query on initial mount once; language changes reuse the current report. Update the URL only on manual success and preserve any successful report while refresh runs.

```ts
useEffect(() => {
  const shared = parseShareSearch(window.location.search);
  if (shared) void analyze(shared, { source: "shared" });
}, [analyze]);

function recordManualSuccess(ref: RepoRef) {
  history.replaceState(null, "", toShareSearch(ref));
}
```

- [ ] **Step 6: Verify focused and full green**

Run: `pnpm vitest run src/components/language-switcher.test.tsx src/components/repository-form.test.tsx src/components/scan-progress.test.tsx src/components/status-announcer.test.tsx src/App.test.tsx`

Expected: both-language, keyboard, validation, progress, privacy, query, and history cases PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit the landing experience**

```bash
git add src/App.tsx src/App.test.tsx src/components/language-switcher.tsx src/components/language-switcher.test.tsx src/components/repository-form.tsx src/components/repository-form.test.tsx src/components/scan-progress.tsx src/components/scan-progress.test.tsx src/components/status-announcer.tsx src/components/status-announcer.test.tsx src/i18n/messages.ts src/styles/tokens.css src/styles/global.css src/styles/app.css
git diff --cached --check
git commit -m "feat: add bilingual repository scan experience"
```

---

### Task 12: Guided Report, Evidence, Copy, and Boundary Errors

**Required skills at execution:** Continue applying `ui-ux-pro-max` and `elevate-web-design`; use the approved guided layout A.

**Files:**

- Create: `src/components/error-panel.tsx`
- Create: `src/components/report-summary.tsx`
- Create: `src/components/dimension-scores.tsx`
- Create: `src/components/strengths-and-risks.tsx`
- Create: `src/components/coverage-panel.tsx`
- Create: `src/components/evidence-explorer.tsx`
- Create: `src/components/copy-button.tsx`
- Create: `src/components/methodology.tsx`
- Create: `src/components/report-view.tsx`
- Test: one co-located `*.test.tsx` for every component above
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/app.css`

**Interfaces:**

- `ReportView` consumes `{ report, language, onRefresh }` and renders the fixed seven-section order from design §5.3.
- `EvidenceExplorer` filters by dimension, severity, and state through native buttons/selects and links to `https://github.com/{owner}/{repo}/blob/{commitSha}/{encodedPath}#L{line}`.
- `CopyButton` consumes a prebuilt localized string and serializes overlapping clipboard outcomes.
- `ErrorPanel` consumes only `SerializableAnalysisError`, language, and recoverable retry callback.

- [ ] **Step 1: Write report hierarchy and hostile-text red tests**

Assert one H2 report title, identity/commit/timestamp, overall/general-only/preliminary labels, all six ordered dimensions including unavailable states, maximum five strengths/two per dimension, prioritized weaknesses, exact coverage counts, one methodology region, and no raw source field. Inject remote strings shaped like tags/scripts/Markdown and assert they appear only as text.

```tsx
render(<ReportView report={hostileReport} language="en" onRefresh={vi.fn()} />);
expect(
  screen.getByRole("heading", { level: 2, name: /owner\/repo/ }),
).toBeVisible();
expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeVisible();
expect(document.querySelector("img")).toBeNull();
expect(screen.getByRole("region", { name: "Methodology" })).toBeVisible();
```

- [ ] **Step 2: Write evidence/filter/link red tests**

Assert visible counts update with filters, keyboard activation, stable rule ordering, path wrapping, generated evidence, exact immutable commit file href, encoded path segments, optional line fragment, `target="_blank"`, and `rel="noopener noreferrer"`. Unsupported/failed files must appear in coverage, not as quality failures.

```tsx
const link = screen.getByRole("link", { name: /src\/main\.ts/ });
expect(link).toHaveAttribute(
  "href",
  "https://github.com/owner/repo/blob/0123456789012345678901234567890123456789/src/main.ts#L12",
);
expect(link).toHaveAttribute("rel", "noopener noreferrer");
```

- [ ] **Step 3: Write localized copy and concurrency red tests**

Build exact English and Chinese Markdown outputs containing repository, commit, ruleset, confidence/scope disclaimer, ordered improvements, rule IDs, paths/lines, and no passed findings or source text. Use deferred clipboard promises to assert late old success/failure cannot replace the newest operation, one timer at a time, two-second reset, unmount cleanup, and `aria-live` feedback.

```ts
const oldWrite = deferred<void>();
const newWrite = deferred<void>();
writeText
  .mockReturnValueOnce(oldWrite.promise)
  .mockReturnValueOnce(newWrite.promise);
await user.click(
  screen.getByRole("button", { name: "Copy improvement checklist" }),
);
await user.click(
  screen.getByRole("button", { name: "Copy improvement checklist" }),
);
newWrite.resolve();
oldWrite.reject(new Error("old"));
expect(await screen.findByText("Copied")).toBeVisible();
```

- [ ] **Step 4: Write typed error and refresh red tests**

Assert invalid URL has no retry; not-found does not guess private/deleted; rate limit shows localized reset time and official GitHub rate-limit documentation link; network/API/worker errors use safe copy; abort is hidden; recoverable retry calls the prior ref with `force: true`; failed retry preserves report/URL.

```tsx
render(<ErrorPanel error={{ kind: "not-found", status: 404 }} language="en" />);
expect(screen.getByText(/not found or is not public/i)).toBeVisible();
expect(screen.queryByText(/deleted|private/i)).toBeNull();
expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
```

- [ ] **Step 5: Run focused red**

Run: `pnpm vitest run src/components src/App.test.tsx`

Expected: FAIL for missing guided report, filters, copy serialization, typed errors, and refresh integration.

- [ ] **Step 6: Implement the guided report in approved order**

Render textual numeric values as the primary representation. Use small bars only as redundant visuals with accessible names. Keep strengths and improvements before the detailed evidence table. Collapse methodology/evidence details with native disclosure only when all content remains keyboard and screen-reader reachable.

```tsx
<ReportSummary report={report} language={language} />
<DimensionScores dimensions={report.dimensions} language={language} />
<StrengthsAndRisks
  strengths={report.strengths}
  weaknesses={report.weaknesses}
  language={language}
/>
<CoveragePanel coverage={report.coverage} language={language} />
<EvidenceExplorer report={report} language={language} />
<Methodology rulesetVersion={report.rulesetVersion} language={language} />
```

- [ ] **Step 7: Implement localized Markdown and race-safe clipboard**

Build copy content from message keys and safe primitive/path arguments. Increment a request sequence before each `navigator.clipboard.writeText`; only the latest sequence may set status or create the reset timer. Clear an existing timer both before the request and immediately before creating the latest timer.

```ts
const requestId = ++requestIdRef.current;
clearResetTimer();
try {
  await navigator.clipboard.writeText(markdown);
  if (requestId !== requestIdRef.current) return;
  clearResetTimer();
  setStatus("success");
  resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 2000);
} catch {
  if (requestId === requestIdRef.current) setStatus("failure");
}
```

- [ ] **Step 8: Implement typed errors and App boundaries**

Switch on local error kind, never remote message/stack. A retry invokes `refresh`; a new form submission invokes `analyze`. Render an existing report beneath a non-destructive refresh error with explicit stale timestamp rather than clearing it.

```tsx
{
  state.report && (
    <ReportView report={state.report} language={language} onRefresh={refresh} />
  );
}
{
  state.error && !isAbort(state.error) && (
    <ErrorPanel
      error={state.error}
      language={language}
      {...(isRecoverable(state.error) ? { onRetry: refresh } : {})}
    />
  );
}
```

- [ ] **Step 9: Verify focused and full green**

Run: `pnpm vitest run src/components src/App.test.tsx`

Expected: all report hierarchy, hostile text, filters, immutable links, bilingual copy, race, unmount, error, retry, and preserved-report cases PASS.

Run: `pnpm test:coverage`

Expected: configured coverage thresholds PASS.

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 10: Commit report boundaries**

```bash
git add src/App.tsx src/App.test.tsx src/components/error-panel.tsx src/components/error-panel.test.tsx src/components/report-summary.tsx src/components/report-summary.test.tsx src/components/dimension-scores.tsx src/components/dimension-scores.test.tsx src/components/strengths-and-risks.tsx src/components/strengths-and-risks.test.tsx src/components/coverage-panel.tsx src/components/coverage-panel.test.tsx src/components/evidence-explorer.tsx src/components/evidence-explorer.test.tsx src/components/copy-button.tsx src/components/copy-button.test.tsx src/components/methodology.tsx src/components/methodology.test.tsx src/components/report-view.tsx src/components/report-view.test.tsx src/i18n/messages.ts src/styles/app.css
git diff --cached --check
git commit -m "feat: render explainable project reports"
```

---

### Task 13: Responsive Accessibility and Deterministic Browser Proof

**Required skills at execution:** Read and apply `playwright`, `ui-ux-pro-max`, and `elevate-web-design` before editing or running browser tests.

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/reposcope.spec.ts`
- Create: `e2e/fixtures/repository.json`
- Create: `e2e/fixtures/commit.json`
- Create: `e2e/fixtures/tree.json`
- Create: `e2e/fixtures/source-files.ts`
- Modify: `vite.config.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/styles/app.css`
- Modify: UI components only when browser evidence identifies a defect

**Interfaces:**

- Playwright route fixtures fulfill every `api.github.com` and `raw.githubusercontent.com` request; unmatched GitHub traffic fails the test.
- Projects: desktop Chromium at 1366×900 and mobile Chromium at 375×812.
- Browser clock: fixed at `2026-08-11T12:00:00Z` before every `goto`.

- [ ] **Step 1: Configure two projects and immutable route fixtures**

Set web server command to `pnpm build && pnpm preview --host 127.0.0.1`, reuse false in CI, and base URL `http://127.0.0.1:4173`. Give each test a fresh context/session storage. Route exact repository, commit, tree, and raw commit-path URLs. Count REST and raw requests separately.

- [ ] **Step 2: Write the complete failing E2E matrix**

Create ten scenarios, each executed in both projects for 20 tests:

1. English landing keyboard form submission, accessible progress, and cancellation; unit/worker tests remain the authoritative proof of all five phase transitions.
2. Chinese landing, language persistence, and no refetch on switching.
3. Complete JS/TS report with exact three REST calls, deep scores, immutable links, copy, and share URL.
4. Complete Python report with the Python analyzer chunk requested and JS/TS chunk absent.
5. Unsupported Go report with readability/complexity unavailable, general-only/preliminary label, and confidence at most 60.
6. Truncated/limit-reached partial report with confidence below 80 and explicit scope.
7. Invalid URL then not-found without speculative private/deleted language.
8. Rate limit with fixed localized reset time and safe official link.
9. Hostile repository strings rendered as text with no script/image/remote resource execution.
10. Cancellation followed by a successful newer analysis; failed forced refresh preserves the report.

For landing and complete report, run Axe with WCAG 2 A/AA/2.1 A/AA tags and require zero serious/critical violations.

```ts
test("complete TypeScript report is bounded and accessible", async ({
  page,
}) => {
  const requests = installGitHubRoutes(page, completeTypeScriptFixture);
  await page.goto("/");
  await page
    .getByLabel("Public GitHub repository")
    .fill("https://github.com/owner/repo");
  await page.getByRole("button", { name: "Analyze repository" }).click();
  await expect(
    page.getByRole("heading", { name: /owner\/repo/ }),
  ).toBeVisible();
  expect(requests.restGets()).toHaveLength(3);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(isSerious),
  ).toEqual([]);
});
```

- [ ] **Step 3: Add viewport, target, focus, motion, and console assertions**

For 375, 900, and 1366 widths, assert `document.documentElement.scrollWidth <= clientWidth`. Measure every visible `a`, `button`, and `input` at least 44×44. Keyboard-tab through language, input, submit, filters, refresh, copy, evidence links, and methodology; assert a 3-pixel non-transparent focus outline. Emulate reduced motion and assert animation/transition durations are zero or effectively disabled. Fail on page errors, console warnings/errors, unfulfilled GitHub routes, and unexpected external hosts.

- [ ] **Step 4: Run browser red and document exact UI defects**

Run: `pnpm exec playwright test`

Expected: the initial run fails only for missing browser polish or fixture integration; record exact selector, viewport, dimension, Axe rule, focus value, or route mismatch before changing CSS/components.

- [ ] **Step 5: Fix the smallest evidence-backed UI/CSS gaps**

Use CSS grid/flex min-width safeguards, `overflow-wrap: anywhere` for paths, local system font stacks, 44-pixel control minimums, semantic high/medium/low styles with text labels, clear pressed/hover/active/focus/disabled states, and a global `prefers-reduced-motion` override. Do not add remote assets or decorative animation.

```css
a,
button,
input,
select {
  min-block-size: 44px;
}

:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.path,
.remote-text {
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 6: Run full browser and project green**

Run: `pnpm exec playwright test`

Expected: 20/20 PASS; all REST/raw counts, language, report, partial, error, hostile, cancellation, responsive, target, focus, reduced-motion, Axe, and console assertions PASS.

Run: `pnpm check && pnpm test:coverage`

Expected: all non-browser gates and coverage PASS.

- [ ] **Step 7: Commit browser proof**

Run `git diff --name-only` first. If Step 5 changed an evidence-backed UI component, append that component's exact source and co-located test paths to the following `git add`; do not use a component-directory glob.

```bash
git add playwright.config.ts e2e/fixtures.ts e2e/reposcope.spec.ts e2e/fixtures/repository.json e2e/fixtures/commit.json e2e/fixtures/tree.json e2e/fixtures/source-files.ts vite.config.ts src/styles/tokens.css src/styles/global.css src/styles/app.css
git diff --cached --check
git commit -m "test: verify accessible project analysis flows"
```

---

### Task 14: Production Security, Performance, CI, and Pages

**Files:**

- Create: `scripts/check-bundle-size.mjs`
- Create: `scripts/check-bundle-size.test.mjs`
- Create: `lighthouserc.cjs`
- Create: `public/favicon.svg`
- Create: `public/robots.txt`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/pages.yml`
- Create: `.github/dependabot.yml`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Modify: `.gitignore`

**Interfaces:**

- Produces `measureBundle(distDir)` and `assertBundleBudgets(result)` for Node tests/CLI.
- Vite produces `dist/.vite/manifest.json`, production-only CSP, and `REPOSCOPE_BASE_PATH` subpath assets.
- CI is the required branch gate; Pages deploys only after local-equivalent validation.

- [ ] **Step 1: Write bundle-budget red tests**

Create temporary fake dist/manifest fixtures and assert:

- only the entry graph contributes to initial JS;
- CSS budget is measured separately;
- dynamic JS/TS and Python analyzer chunks are detected by manifest dynamic imports;
- exact equality at 204,800/51,200/512,000 bytes passes;
- one byte over each budget throws a message naming the artifact and measured/budget bytes;
- missing manifest or chunk exits non-zero;
- source maps and unrelated assets do not count.

```js
test("accepts exact budgets and rejects one byte over", () => {
  assert.doesNotThrow(() =>
    assertBundleBudgets({
      initialJs: 204800,
      initialCss: 51200,
      analyzers: [{ name: "js-ts", gzipBytes: 512000 }],
    }),
  );
  assert.throws(
    () =>
      assertBundleBudgets({ initialJs: 204801, initialCss: 0, analyzers: [] }),
    /initial JavaScript.*204801.*204800/,
  );
});
```

Run: `node --test scripts/check-bundle-size.test.mjs`

Expected: FAIL because the script is absent.

- [ ] **Step 2: Implement manifest-aware gzip measurement**

Recursively walk manifest imports from entries for initial JS, gzip actual emitted bytes with `zlib.gzipSync`, identify CSS assets, and measure each analyzer dynamic chunk including its static imports. Export pure functions and run CLI only when `import.meta.url` equals the executed file URL.

```js
export function gzipBytes(filePath) {
  return gzipSync(readFileSync(filePath)).byteLength;
}

export function assertBundleBudgets(result) {
  assertAtMost("initial JavaScript", result.initialJs, 204800);
  assertAtMost("initial CSS", result.initialCss, 51200);
  for (const analyzer of result.analyzers) {
    assertAtMost(analyzer.name, analyzer.gzipBytes, 512000);
  }
}
```

Run: `node --test scripts/check-bundle-size.test.mjs`

Expected: PASS.

- [ ] **Step 3: Add production-only CSP and base path tests**

Add a Vite configuration test or Node assertion that production output contains exactly one meta CSP with:

```text
default-src 'self';
connect-src 'self' https://api.github.com https://raw.githubusercontent.com;
img-src 'self' data:;
style-src 'self';
script-src 'self';
worker-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests
```

Development `index.html` must not contain the CSP. Build with `REPOSCOPE_BASE_PATH=/reposcope/` and assert JS, CSS, worker, parser, favicon, and manifest URLs use `/reposcope/`. Scan source and `dist` for inline React `style`, remote font/image/script/stylesheet, `unsafe-inline`, `unsafe-eval`, and WebAssembly assets.

```ts
const productionCsp = [
  "default-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");
```

- [ ] **Step 4: Configure Lighthouse and run three real builds**

Set `numberOfRuns: 3`, static preview URL, and `minScore: 0.95` for performance, accessibility, best-practices, and SEO. Add local favicon/robots so no 404 lowers results. If Lighthouse reveals a real defect, fix the defect; never lower a threshold or suppress an audit.

```js
module.exports = {
  ci: {
    collect: { numberOfRuns: 3, url: ["http://127.0.0.1:4173/"] },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
      },
    },
  },
};
```

Run: `pnpm build && pnpm check:bundle && pnpm check:lighthouse`

Expected: budgets PASS and each of three runs meets all four `0.95` thresholds.

- [ ] **Step 5: Add pinned CI and Pages workflows**

CI uses least permissions, Node 24, pnpm 11.16.0, frozen install, lint, format, coverage, build, bundle, Chromium install, desktop Playwright, and Lighthouse in that order. Pin actions to `actions/checkout@v7.0.1`, `pnpm/action-setup@v6.0.10`, and `actions/setup-node@v7.0.0`. Pages uses `contents: read`, `pages: write`, `id-token: write`; it runs the same quality gates, builds with `REPOSCOPE_BASE_PATH=/${{ github.event.repository.name }}/`, uploads only `dist`, and pins `actions/configure-pages@v6.0.0`, `actions/upload-pages-artifact@v5.0.0`, and `actions/deploy-pages@v5.0.0`. Dependabot checks npm and GitHub Actions weekly with `open-pull-requests-limit: 5` for each ecosystem.

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@v7.0.1
  - uses: pnpm/action-setup@v6.0.10
    with:
      version: 11.16.0
  - uses: actions/setup-node@v7.0.0
    with:
      node-version: 24
      cache: pnpm
  - run: pnpm install --frozen-lockfile
  - run: pnpm lint
  - run: pnpm format:check
  - run: pnpm test:coverage
  - run: pnpm build
  - run: pnpm check:bundle
```

- [ ] **Step 6: Run all production gates**

Run: `pnpm install --frozen-lockfile`

Expected: no lock changes.

Run: `pnpm lint && pnpm format:check && pnpm test:coverage && pnpm build && pnpm check:bundle`

Expected: PASS and all budgets printed.

Run: `pnpm exec playwright test`

Expected: 20/20 PASS.

Run: `pnpm check:lighthouse`

Expected: three runs, all four categories at least 0.95.

- [ ] **Step 7: Commit production release automation**

```bash
git add package.json pnpm-lock.yaml vite.config.ts index.html .gitignore scripts/check-bundle-size.mjs scripts/check-bundle-size.test.mjs lighthouserc.cjs public/favicon.svg public/robots.txt .github/workflows/ci.yml .github/workflows/pages.yml .github/dependabot.yml
git diff --cached --check
git commit -m "ci: enforce secure static release quality"
```

---

### Task 15: Bilingual Open-Source Repository and Public Release

**Files:**

- Create: `README.md`
- Create: `README.zh-CN.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `SUPPORT.md`
- Create: `GOVERNANCE.md`
- Create: `docs/methodology.md`
- Create: `docs/architecture.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `src/repository-files.test.ts`
- Modify: `package.json`

**Interfaces:**

- Repository docs expose the exact public contract, ruleset, limits, privacy boundary, local commands, deployment, and contribution policy.
- The repository-file test guarantees governance files and methodology remain complete and bilingual links remain reciprocal.
- Remote release target: `https://github.com/Thworry/reposcope`; Pages target: `https://thworry.github.io/reposcope/`; release: `v0.1.0`.

- [ ] **Step 1: Write the repository-files red test**

Use a Node-environment Vitest file that asserts all listed files exist, both READMEs link to each other and include usage/limits/privacy/development/deployment/license, methodology contains `1.0.0`, six weights, every signal ID/threshold, confidence formula, applicability and precedence, architecture contains all fixed endpoints/limits/cache/CSP/threat boundaries, and SECURITY directs private vulnerability reporting.

```ts
// @vitest-environment node
it("ships the complete bilingual open-source contract", () => {
  for (const path of REQUIRED_FILES) {
    expect(existsSync(resolve(projectRoot, path)), path).toBe(true);
  }
  expect(read("README.md")).toContain("README.zh-CN.md");
  expect(read("README.zh-CN.md")).toContain("README.md");
  expect(read("docs/methodology.md")).toContain("ruleset `1.0.0`");
  expect(read("docs/architecture.md")).toContain("raw.githubusercontent.com");
  expect(read("SECURITY.md")).toMatch(/privately|私密/i);
});
```

Run: `pnpm vitest run src/repository-files.test.ts`

Expected: FAIL with missing required files/sections.

- [ ] **Step 2: Write equivalent bilingual READMEs and governance files**

Document one-repository-at-a-time usage, English/Chinese switching, score/confidence interpretation, general-only behavior, exactly three REST plus bounded raw reads, 200/10 MiB/256 KiB/six/15-second/90-second limits, no login/token/backend/AI/code execution, source non-persistence, supported deep languages, local commands, Pages deployment, contribution rules, security disclaimer, and MIT license. Do not claim execution, coverage, vulnerability detection, or safety.

- [ ] **Step 3: Write exact methodology and architecture**

Promote the complete scoring tables/dictionaries/formulas from the approved design into user-facing methodology. Document module/data flow, worker/cancellation/cache, fixed origins/endpoints, encoding, raw-file boundaries, hostile content, CSP, parser limitations, browser/hosting threat boundary, and public-device compute model. Keep prose synchronized with implementation tests and actual package commands.

- [ ] **Step 4: Add structured templates and private-report guidance**

Bug template requests repository URL, browser, language, expected/actual result, and whether the issue contains public-only data; it warns against secrets/source disclosure. Feature template asks which rule/report area changes and demands bilingual/methodology impact. PR template checks tests, copy parity, methodology, limits, accessibility, and security. `config.yml` directs vulnerability reporters to `https://github.com/Thworry/reposcope/security/advisories/new`.

- [ ] **Step 5: Verify documentation and every local gate**

Run: `pnpm vitest run src/repository-files.test.ts`

Expected: PASS.

Run: `pnpm format && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm build && pnpm check:bundle && pnpm exec playwright test && pnpm check:lighthouse`

Expected: every unit/component/integration/browser/accessibility/bundle/build/Lighthouse gate PASS; formatting leaves no unstaged mechanical differences outside intended docs.

- [ ] **Step 6: Commit release documentation**

```bash
git add README.md README.zh-CN.md LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md SUPPORT.md GOVERNANCE.md docs/methodology.md docs/architecture.md .github/ISSUE_TEMPLATE/bug.yml .github/ISSUE_TEMPLATE/feature.yml .github/ISSUE_TEMPLATE/config.yml .github/PULL_REQUEST_TEMPLATE.md src/repository-files.test.ts package.json pnpm-lock.yaml
git diff --cached --check
git commit -m "docs: prepare RepoScope for open source"
```

- [ ] **Step 7: Resolve the exact remote target safely**

Run: `gh auth status`

Expected: active account `Thworry` with repository/workflow scopes.

Run: `gh repo view Thworry/reposcope --json nameWithOwner,url,visibility,defaultBranchRef`

Expected: not found before creation. If it exists, stop and compare ownership/history; never overwrite or force-push an existing repository.

Run: `git status --short --branch && git log --oneline --decorate -20`

Expected: clean `codex/reposcope-design` branch containing only intentional RepoScope history.

- [ ] **Step 8: Publish the public repository without rewriting history**

Rename the initial local branch for the public default, create the public remote, and push:

```bash
git branch -m main
gh repo create Thworry/reposcope --public --source=. --remote=origin --push --description "Bilingual, browser-side quality reports for public GitHub repositories"
gh repo edit Thworry/reposcope --homepage "https://thworry.github.io/reposcope/" --enable-issues=true
gh repo edit Thworry/reposcope --add-topic open-source --add-topic github --add-topic static-analysis --add-topic code-quality --add-topic maintainer-tools --add-topic typescript --add-topic python
gh api --method PUT repos/Thworry/reposcope/private-vulnerability-reporting
```

Configure Pages for workflow deployment with `gh api --method POST repos/Thworry/reposcope/pages -f build_type=workflow` only when `gh api repos/Thworry/reposcope/pages` returns 404; if Pages already exists, verify its `build_type` is `workflow` rather than posting again. Do not create a repository secret, GitHub App, OAuth flow, or token input.

- [ ] **Step 9: Wait for hosted CI and Pages before tagging**

Run: `gh run list --repo Thworry/reposcope --branch main --limit 10`

Wait for the main CI and Pages deployment to complete. Inspect failures by run ID and fix through new local commits; never rerun blindly, lower gates, or edit hosted artifacts.

Expected: main CI and Deploy Pages both `success`; `https://thworry.github.io/reposcope/` returns HTTP 200 and production assets use `/reposcope/`.

- [ ] **Step 10: Perform one clean live browser acceptance**

In a fresh browser tab/session, analyze `https://github.com/Thworry/reposcope` and one supported public fixture repository. Verify no login/token field; exactly three REST GET requests per fresh scan; bounded raw requests use the pinned commit; progress/cancel; total/dimensions/confidence; English/Chinese switch without network; share query; immutable file links; no console warning/error; strict CSP; and mobile keyboard focus. The self-repository may produce partial or general findings, but the UI and scope must be honest.

- [ ] **Step 11: Tag and release only after acceptance**

```bash
git tag -a v0.1.0 -m "RepoScope v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --repo Thworry/reposcope --title "RepoScope v0.1.0" --notes "First public release: bilingual, read-only, browser-side project quality reports for public GitHub repositories."
```

Expected: public repository, Pages site, successful hosted workflows, and non-draft/non-prerelease `v0.1.0` all resolve without authentication.

- [ ] **Step 12: Record final evidence**

Capture commit SHA, repository/Pages/release URLs, CI/Pages run URLs, unit count, coverage, 20/20 browser result, bundle budgets, three Lighthouse runs, and live REST/raw request counts in the implementation handoff. Confirm `git status --short --branch` is clean and local/remote `main` SHAs match.

---

## Plan Completion Gate

Before declaring the implementation complete, verify each task has:

1. a recorded focused red caused by the missing/incorrect behavior;
2. focused green after the minimal implementation;
3. the task-level full gate;
4. an independent review of its own bounded deliverable;
5. one intentional non-amended commit containing only listed files.

Then rerun the final Task 15 local and hosted gates without threshold changes. The application is not complete merely because it builds locally; public Pages, live bilingual analysis, strict network/security boundaries, and `v0.1.0` must all be verified.
