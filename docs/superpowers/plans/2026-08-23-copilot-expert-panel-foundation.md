# Copilot Expert-Panel Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict deep-report contracts and a secure TypeScript service with GitHub App user authorization, while leaving the existing deterministic report unchanged.

**Architecture:** Browser-safe contracts live under `src/features/deep-analysis`; a Hono service under `server` owns configuration, HTTP security, short-lived sessions, and the GitHub authorization code exchange. The static application remains usable when the service is not configured.

**Tech Stack:** TypeScript 6, Node.js 24, Hono 4.13.3, `@hono/node-server` 2.1.1, Vitest 4, existing React/Vite frontend.

## Global Constraints

- Public repositories only; do not add private-repository permissions.
- Never expose a GitHub user token, GitHub App secret, OAuth code, or raw callback to frontend JavaScript, browser storage, logs, or error responses.
- Use secure HTTP-only same-site cookies, exact-origin CORS, OAuth state validation, and an explicit CSRF token for state-changing API calls.
- Keep the deterministic ruleset, score input, resource caps, worker behavior, and technical appendix unchanged.
- Deep analysis must fail independently and leave the deterministic report available.
- Node.js remains `>=24 <25`; pnpm remains `11.16.0`.
- Do not enable the deep-analysis UI in this foundation plan.

---

### Task 1: Add isolated server tooling

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vitest.server.config.ts`
- Modify: `eslint.config.js`

**Interfaces:**

- Consumes: current root TypeScript, lint, test, and build scripts.
- Produces: `pnpm typecheck:server`, `pnpm test:server`, `pnpm build:server`, `pnpm server:dev`, and `pnpm server:start`.

- [ ] **Step 1: Add a failing server test command**

Add this script before the config exists:

```json
"test:server": "vitest run --config vitest.server.config.ts"
```

- [ ] **Step 2: Run the command and verify the missing-config failure**

Run: `pnpm test:server`

Expected: FAIL because `vitest.server.config.ts` does not exist.

- [ ] **Step 3: Install exact runtime and development dependencies**

Run:

```sh
pnpm add hono@4.13.3 @hono/node-server@2.1.1
pnpm add -D tsx@4.23.12
```

Add scripts:

```json
"typecheck:server": "tsc -p tsconfig.server.json --noEmit",
"test:server": "vitest run --config vitest.server.config.ts",
"build:server": "tsc -p tsconfig.server.json",
"server:dev": "tsx watch server/index.ts",
"server:start": "node server-dist/server/index.js"
```

Create `tsconfig.server.json` with `ES2023`, Node types, strict project options,
`rootDir: "."`, `outDir: "server-dist"`, and includes for `server`, the shared
deep-analysis contracts, and `vitest.server.config.ts`. Exclude server test
files from emit. Add it to the root project references.

Create `vitest.server.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    passWithNoTests: true,
    include: ["server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.test.ts", "server/index.ts"],
    },
  },
});
```

Extend ESLint's strict type-checked Node configuration to
`server/**/*.ts` and `vitest.server.config.ts`; add `server-dist/**` to ignores.

- [ ] **Step 4: Verify the isolated toolchain**

Run: `pnpm typecheck:server && pnpm test:server && pnpm build:server`

Expected: typecheck and build pass; Vitest reports no test files without a
configuration-loading error.

- [ ] **Step 5: Commit**

```sh
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.server.json vitest.server.config.ts eslint.config.js
git commit -m "build: add expert panel server toolchain"
```

### Task 2: Define strict browser/server contracts

**Files:**

- Create: `src/features/deep-analysis/model.ts`
- Create: `src/features/deep-analysis/guards.ts`
- Create: `src/features/deep-analysis/guards.test.ts`
- Create: `src/test/fixtures/deep-analysis.ts`

**Interfaces:**

- Consumes: `Language` and `RepoRef` from `src/features/analysis/model.ts`.
- Produces: `DeepAnalysisRequest`, `DeepAnalysisEvent`, `DeepReport`, `DeepStatement`, `DeepEvidence`, `isDeepAnalysisRequest`, `isDeepAnalysisEvent`, and `isDeepReport`.

- [ ] **Step 1: Write failing guard tests**

Cover an accepted complete fixture and rejection of unknown keys, sparse arrays,
unknown evidence IDs, duplicate normalized text, invalid repository identity,
unsafe Unicode, unsupported provenance, invalid order, oversized arrays, and an
assertive statement without evidence:

```ts
expect(isDeepReport(DEEP_REPORT_FIXTURE)).toBe(true);
expect(isDeepReport({ ...DEEP_REPORT_FIXTURE, surprise: true })).toBe(false);
expect(
  isDeepReport({
    ...DEEP_REPORT_FIXTURE,
    orientation: {
      ...DEEP_REPORT_FIXTURE.orientation,
      summary: [
        {
          text: "Definitely safe",
          provenance: "interpretation",
          confidence: "high",
          evidenceIds: [],
        },
      ],
    },
  }),
).toBe(false);
```

- [ ] **Step 2: Run the tests and verify missing exports**

Run: `pnpm test -- src/features/deep-analysis/guards.test.ts`

Expected: FAIL because the model and guards do not exist.

- [ ] **Step 3: Add frozen contracts and caps**

Define these discriminants and caps in `model.ts`:

```ts
export const DEEP_PROVENANCE = Object.freeze([
  "repository-claim",
  "observed-fact",
  "interpretation",
  "unknown",
] as const);
export const DEEP_CONFIDENCE = Object.freeze([
  "high",
  "medium",
  "low",
] as const);
export const DEEP_STAGES = Object.freeze([
  "preparing-evidence",
  "consulting-specialists",
  "challenging-findings",
  "editing-briefing",
  "validating-sources",
] as const);
export const DEEP_ERROR_KINDS = Object.freeze([
  "disabled",
  "signed-out",
  "copilot-unavailable",
  "allowance-exhausted",
  "rate-limit",
  "repository-changed",
  "github-unavailable",
  "invalid-evidence",
  "cancelled",
  "internal",
] as const);
export const DEEP_REPORT_CAPS = Object.freeze({
  evidence: 160,
  statementsPerList: 12,
  capabilityGroups: 8,
  capabilityStatements: 8,
  workflow: 10,
  alternatives: 5,
  disagreements: 6,
  textCodePoints: 640,
} as const);

export type DeepAnalysisStage = (typeof DEEP_STAGES)[number];
export type DeepAnalysisErrorKind = (typeof DEEP_ERROR_KINDS)[number];
```

Use the following top-level contracts:

```ts
export interface DeepStatement {
  text: string;
  provenance:
    "repository-claim" | "observed-fact" | "interpretation" | "unknown";
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
}

export interface DeepEvidence {
  id: string;
  kind:
    "github" | "readme" | "documentation" | "manifest" | "tree" | "alternative";
  label: string;
  path: string | null;
  url: string | null;
}

export interface DeepAnalysisRequest {
  repository: { owner: string; repo: string; commitSha: string };
  language: "en" | "zh-CN";
}

export type DeepAnalysisEvent =
  | { type: "stage"; stage: DeepAnalysisStage }
  | { type: "complete"; report: DeepReport }
  | { type: "error"; error: { kind: DeepAnalysisErrorKind } };

export interface DeepCapabilityGroup {
  title: DeepStatement;
  items: DeepStatement[];
}

export interface DeepAlternative {
  repository: { owner: string; repo: string };
  github: {
    stars: number;
    forks: number;
    watchers: number;
    openIssues: number;
    pushedAt: string | null;
    archived: boolean;
    license: string | null;
  };
  whyCompare: DeepStatement;
}

export interface DeepReport {
  schemaVersion: "1.0.0";
  repository: { owner: string; repo: string; commitSha: string };
  language: "en" | "zh-CN";
  generatedAt: string;
  review: {
    coverage: "full" | "reduced";
    capabilityClass: "auto" | "multi-model";
  };
  orientation: { summary: DeepStatement[]; verdict: DeepStatement };
  fit: { goodFor: DeepStatement[]; poorFor: DeepStatement[] };
  situations: DeepStatement[];
  capabilities: DeepCapabilityGroup[];
  workflow: DeepStatement[];
  architecture: {
    summary: DeepStatement[];
    technologies: DeepStatement[];
    concepts: DeepStatement[];
  };
  onboarding: {
    prerequisites: DeepStatement[];
    install: DeepStatement[];
    run: DeepStatement[];
    develop: DeepStatement[];
    cautions: DeepStatement[];
  };
  trust: {
    reliability: DeepStatement[];
    security: DeepStatement[];
    privacy: DeepStatement[];
    unknowns: DeepStatement[];
  };
  maintenance: {
    summary: DeepStatement[];
    signals: DeepStatement[];
    community: {
      stars: number;
      forks: number;
      watchers: number;
      openIssues: number;
      pushedAt: string | null;
      archived: boolean;
      license: string | null;
    };
  };
  alternatives: DeepAlternative[];
  disagreements: DeepStatement[];
  nextChecks: DeepStatement[];
  finalVerdict: {
    decision: "worth-trying" | "compare-first" | "not-enough-evidence";
    summary: DeepStatement;
  };
  evidence: DeepEvidence[];
}
```

Keep this shape exact across browser, server, cache, fixtures, and model-output
validation. Every prose leaf uses `DeepStatement`; raw repository metrics and
discriminants remain typed facts rather than model-authored prose.

- [ ] **Step 4: Implement descriptor-based strict guards**

Follow the hostile-object conventions in `src/features/analysis/guards.ts`:
read only own data properties, reject accessors/proxies, require exact keys,
reject sparse or oversized arrays, normalize text with NFKC for duplicate
checks, validate safe code points, and recompute all evidence references.

Enforce these semantic rules:

- `unknown` statements use low confidence;
- all non-`unknown` statements have one to six known evidence IDs;
- evidence IDs are canonical `ev-0001` through `ev-9999` values in order;
- repository and commit exactly match the request/report identity;
- the last event is either one `complete` or one `error` event; and
- a report contains no credential-shaped text.

- [ ] **Step 5: Run focused and full frontend tests**

Run:

```sh
pnpm test -- src/features/deep-analysis/guards.test.ts
pnpm exec tsc -p tsconfig.app.json
```

Expected: all guard tests and frontend typechecking pass.

- [ ] **Step 6: Commit**

```sh
git add src/features/deep-analysis src/test/fixtures/deep-analysis.ts
git commit -m "feat: define strict expert report contracts"
```

### Task 3: Add fail-closed service configuration and HTTP shell

**Files:**

- Create: `server/config.ts`
- Create: `server/config.test.ts`
- Create: `server/http/security.ts`
- Create: `server/http/security.test.ts`
- Create: `server/app.ts`
- Create: `server/app.test.ts`
- Create: `server/index.ts`
- Create: `.env.example`

**Interfaces:**

- Consumes: Node environment variables and Hono request primitives.
- Produces: `ServerConfig`, `readServerConfig(env)`, `createApp(dependencies)`, exact-origin CORS, safe JSON errors, and `GET /api/v1/health`.

- [ ] **Step 1: Write configuration and HTTP-boundary tests**

Assert that production startup rejects partially configured GitHub credentials,
non-HTTPS non-loopback public origins, wildcard origins, invalid ports, and
malformed callback URLs. A completely absent GitHub credential set keeps the
service in disabled static-fallback mode. Assert that health responses include no configuration values and
unknown errors become `{ "error": { "kind": "internal" } }`.

```ts
const response = await app.request("/api/v1/health", {
  headers: { Origin: "https://thworry.github.io" },
});
expect(await response.json()).toEqual({
  status: "ok",
  deepAnalysis: "disabled",
});
```

- [ ] **Step 2: Run server tests and verify failure**

Run: `pnpm test:server -- server/config.test.ts server/app.test.ts`

Expected: FAIL because the server files do not exist.

- [ ] **Step 3: Implement exact configuration parsing**

`ServerConfig` contains `environment`, `host`, `port`, `frontendOrigin`,
`apiOrigin`, `cachePath`, optional GitHub App client values, `sessionIdleMs`
fixed to eight hours, and a `deepAnalysisEnabled` boolean that is true only when
every required GitHub value is present. Every environment may start disabled;
production rejects a partially configured credential set. HTTPS is required
for non-loopback public origins; canonical loopback HTTP is admitted for local
validation only.

`.env.example` contains names and safe empty values only:

```dotenv
REPOSCOPE_FRONTEND_ORIGIN=http://127.0.0.1:5173
REPOSCOPE_API_ORIGIN=http://127.0.0.1:8787
REPOSCOPE_GITHUB_CLIENT_ID=
REPOSCOPE_GITHUB_CLIENT_SECRET=
REPOSCOPE_GITHUB_CALLBACK_URL=http://127.0.0.1:8787/api/v1/auth/callback
REPOSCOPE_CACHE_PATH=.data/deep-reports.sqlite
```

- [ ] **Step 4: Implement the HTTP shell**

`createApp` receives explicit config, clock, random source, logger, session
store, and OAuth client dependencies. Apply secure response headers, body size
limits, exact-origin CORS with credentials, no-store on session/auth responses,
and typed error mapping. `GET /api/v1/health` returns only enabled/disabled.

`server/index.ts` reads config, constructs dependencies, starts
`@hono/node-server`, and handles SIGINT/SIGTERM without printing secrets.

- [ ] **Step 5: Verify server boundaries**

Run:

```sh
pnpm test:server -- server/config.test.ts server/http/security.test.ts server/app.test.ts
pnpm typecheck:server
pnpm build:server
```

Expected: all tests, typecheck, and server emit pass.

- [ ] **Step 6: Commit**

```sh
git add server .env.example package.json
git commit -m "feat: add secure deep analysis service shell"
```

### Task 4: Implement bounded server sessions and GitHub authorization

**Files:**

- Create: `server/auth/model.ts`
- Create: `server/auth/session-store.ts`
- Create: `server/auth/session-store.test.ts`
- Create: `server/auth/cookies.ts`
- Create: `server/auth/cookies.test.ts`
- Create: `server/auth/github-oauth.ts`
- Create: `server/auth/github-oauth.test.ts`
- Create: `server/auth/routes.ts`
- Create: `server/auth/routes.test.ts`
- Modify: `server/app.ts`

**Interfaces:**

- Consumes: `ServerConfig`, injected `fetch`, clock, and cryptographic random bytes.
- Produces: `AuthSessionStore`, `GitHubOAuthClient`, `GET /api/v1/session`, `GET /api/v1/auth/start`, `GET /api/v1/auth/callback`, and `POST /api/v1/sign-out`.

- [ ] **Step 1: Write hostile session and OAuth tests**

Cover session fixation, expiration, random-ID collision, unknown cookies,
missing/mismatched/replayed OAuth state, duplicate callback parameters, unsafe
`returnTo`, token-exchange non-JSON, provider error bodies, CSRF mismatch,
cross-origin sign-out, and redaction.

```ts
const start = await app.request(
  "/api/v1/auth/start?returnTo=%2F%3Frepo%3Downer%252Frepo",
);
expect(start.status).toBe(302);
expect(start.headers.get("set-cookie")).toContain("HttpOnly");
expect(start.headers.get("set-cookie")).toContain("SameSite=Lax");

const callback = await app.request("/api/v1/auth/callback?code=x&state=wrong", {
  headers: { Cookie: sessionCookie },
});
expect(callback.status).toBe(400);
expect(await callback.text()).not.toContain("x");
```

- [ ] **Step 2: Run tests and verify missing implementation**

Run: `pnpm test:server -- server/auth`

Expected: FAIL because auth modules are missing.

- [ ] **Step 3: Implement the in-memory session store**

Use 32 random bytes encoded as base64url for session IDs and CSRF tokens.
Store only server-side records:

```ts
export interface AuthSession {
  id: string;
  csrfToken: string;
  createdAtMs: number;
  expiresAtMs: number;
  oauthState: string | null;
  returnTo: string | null;
  githubToken: string | null;
}
```

Rotate the session ID after successful authorization, consume OAuth state once,
delete expired entries on access, cap the store at 10,000 sessions, and expose a
bounded sweep method. Never serialize a session.

- [ ] **Step 4: Implement cookies and OAuth exchange**

Use cookie name `__Host-reposcope_session` in HTTPS production and
`reposcope_session` in HTTP development. Set `HttpOnly`, `SameSite=Lax`,
`Path=/`, bounded `Max-Age`, and `Secure` in production.

Construct only `https://github.com/login/oauth/authorize` with validated
`client_id`, fixed callback, and random state. Exchange only at
`https://github.com/login/oauth/access_token` with `Accept: application/json`.
Accept only an own-property string `access_token` beginning with `gho_` or
`ghu_`; map all provider bodies to local error kinds.

- [ ] **Step 5: Add auth routes**

`GET /session` returns one of:

```json
{ "status": "disabled" }
{ "status": "signed-out" }
{ "status": "ready", "csrfToken": "opaque-random-value" }
```

`auth/start` accepts only a relative `/?repo=owner%2Frepo` return target.
`auth/callback` rotates the session and redirects to that target with
`deep=authorized`; it never puts a token or provider error in the URL.
`sign-out` requires the exact CSRF header, deletes the session, and clears the
cookie.

- [ ] **Step 6: Verify auth and regression gates**

Run:

```sh
pnpm test:server -- server/auth server/app.test.ts
pnpm lint
pnpm exec tsc -b
pnpm test
```

Expected: auth tests, lint, all TypeScript projects, and existing frontend tests pass.

- [ ] **Step 7: Commit**

```sh
git add server/auth server/app.ts
git commit -m "feat: authorize expert analysis with GitHub"
```

### Task 5: Wire CI without enabling production behavior

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `package.json`

**Interfaces:**

- Consumes: foundation commands from Tasks 1–4.
- Produces: one root `pnpm check` that validates both browser and server code; Pages remains a static deterministic deployment while no API origin is configured.

- [ ] **Step 1: Add a script-contract test**

Extend the existing repository-file contract test to assert that `check`
includes `typecheck:server` and `test:server`, and that the Pages artifact still
uploads only `dist`.

- [ ] **Step 2: Run it and verify failure**

Run: `pnpm test -- src/repository-files.test.ts`

Expected: FAIL until root scripts and workflows include server validation.

- [ ] **Step 3: Extend local and CI gates**

Set:

```json
"check": "pnpm lint && pnpm format:check && pnpm test && pnpm test:server && pnpm exec tsc -b && pnpm build"
```

Add `pnpm test:server` after frontend coverage in both workflows. Keep the Pages
artifact path exactly `dist`; do not deploy `server-dist` and do not introduce
repository secrets in the Pages job.

- [ ] **Step 4: Run the complete foundation gate**

Run:

```sh
pnpm format
pnpm check
pnpm check:bundle
```

Expected: all checks pass and browser bundle budgets remain unchanged apart from
the small shared guard module only if it is imported by the frontend later.

- [ ] **Step 5: Commit**

```sh
git add .github/workflows package.json src/repository-files.test.ts
git commit -m "ci: validate expert analysis service"
```
