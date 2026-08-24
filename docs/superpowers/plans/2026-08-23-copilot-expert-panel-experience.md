# Copilot Expert-Panel Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub authorization, streamed expert progress, a grounded bilingual briefing, robust fallback behavior, deployment assets, and end-to-end quality gates to the static RepoScope experience.

**Architecture:** A small frontend client consumes typed session JSON and one NDJSON deep-analysis stream from an optional configured API origin. React keeps deterministic and expert-analysis state independent; the expert report renders between repository metadata and the deterministic README dossier, while failures leave the existing report untouched.

**Tech Stack:** React 19, TypeScript 6, Vite 8, existing CSS token system, Testing Library, Playwright 1.62, Hono service from the prior plans.

## Global Constraints

- Apply every global constraint from the foundation and analysis plans.
- No API origin means the current static product, privacy boundary, network allowlist, tests, and report remain functional.
- Production expert mode uses a same-site custom frontend/API domain pair. The
  default GitHub Pages domain remains in static mode because v1 does not rely on
  cross-site third-party cookies.
- The browser receives only session status, a CSRF token, bounded progress, and a strictly validated final report; it never receives GitHub or model credentials.
- First authorization requires an explicit public-evidence disclosure. Later scans may run automatically only after the user stores the exact preference value `enabled`.
- Do not translate repository quotations or present model interpretations as repository facts.
- Preserve exact community facts and immutable source links.
- Keep the primary report readable at 188, 320, 375, 768, and 1366 CSS pixels with no page-level horizontal overflow.
- Maintain keyboard, screen-reader, reduced-motion, CSP, bundle, Lighthouse, and deterministic fixture gates.

---

### Task 1: Configure one optional API origin and matching CSP

**Files:**

- Modify: `vite.config.ts`
- Create: `src/features/deep-analysis/api-origin.ts`
- Create: `src/features/deep-analysis/api-origin.test.ts`
- Create: `src/features/deep-analysis/globals.d.ts`
- Modify: `scripts/check-bundle-size.test.mjs`
- Modify: `src/repository-files.test.ts`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**

- Consumes: build-only `REPOSCOPE_API_ORIGIN`.
- Produces: `deepAnalysisApiOrigin(): URL | null` and a production CSP whose `connect-src` contains exactly the configured origin once.

- [ ] **Step 1: Write disabled/configured/malformed origin tests**

Assert empty means disabled, HTTPS is accepted, HTTP is accepted only for
canonical loopback hosts, paths/query/fragments/credentials are rejected, and CSP retains
the existing exact value when disabled.

```ts
expect(parseDeepAnalysisApiOrigin("", "production")).toBeNull();
expect(
  parseDeepAnalysisApiOrigin("https://api.reposcope.example", "production")
    ?.origin,
).toBe("https://api.reposcope.example");
expect(() =>
  parseDeepAnalysisApiOrigin("https://user@example.com/path", "production"),
).toThrow("origin");
```

- [ ] **Step 2: Run tests and verify missing parser/CSP behavior**

Run:

```sh
pnpm test -- src/features/deep-analysis/api-origin.test.ts src/repository-files.test.ts
node --test scripts/check-bundle-size.test.mjs
```

Expected: FAIL until optional-origin behavior exists.

- [ ] **Step 3: Implement one build-time source of truth**

Read and validate `REPOSCOPE_API_ORIGIN` in `vite.config.ts`. Inject its canonical
origin as the compile-time string `__REPOSCOPE_API_ORIGIN__`; declare that global
in `globals.d.ts`. `api-origin.ts` returns a detached `URL` or `null` and
never reads arbitrary runtime DOM configuration.

The authorization client constructs `returnTo` from the validated
`import.meta.env.BASE_URL`, preserving release paths such as `/reposcope/`; it
never assumes the application is mounted at `/`.

Refactor `CONTENT_SECURITY_POLICY` into `contentSecurityPolicy(apiOrigin)`.
When enabled, append the exact origin after the existing GitHub connect sources.
Do not alter any other directive and never admit wildcards, `unsafe-inline`, or
`unsafe-eval`.

- [ ] **Step 4: Configure Pages without secrets**

Pass the optional repository variable to both validation and release builds:

```yaml
env:
  REPOSCOPE_API_ORIGIN: ${{ vars.REPOSCOPE_API_ORIGIN }}
```

Do not add a secret, service credential, or backend artifact to the Pages job.

- [ ] **Step 5: Verify both production modes**

Run:

```sh
pnpm test -- src/features/deep-analysis/api-origin.test.ts src/repository-files.test.ts
node --test scripts/check-bundle-size.test.mjs
REPOSCOPE_API_ORIGIN=https://api.example.test pnpm build
pnpm check:bundle
```

Expected: disabled and configured exact CSP tests pass; browser bundles contain
only the public API origin string.

- [ ] **Step 6: Commit**

```sh
git add vite.config.ts src/features/deep-analysis/api-origin.ts src/features/deep-analysis/api-origin.test.ts src/features/deep-analysis/globals.d.ts scripts/check-bundle-size.test.mjs src/repository-files.test.ts .github/workflows/pages.yml
git commit -m "feat: configure optional expert analysis API"
```

### Task 2: Build the session and NDJSON browser client

**Files:**

- Create: `src/features/deep-analysis/client.ts`
- Create: `src/features/deep-analysis/client.test.ts`
- Create: `src/features/deep-analysis/use-deep-analysis.ts`
- Create: `src/features/deep-analysis/use-deep-analysis.test.tsx`

**Interfaces:**

- Consumes: `deepAnalysisApiOrigin`, `DeepAnalysisRequest`, strict guards, injected `fetch`, and `AbortSignal`.
- Produces: `getDeepSession`, `startGitHubAuthorization`, `signOutDeepSession`, `runDeepAnalysis`, and `useDeepAnalysis`.

- [ ] **Step 1: Write streaming and hook state-machine tests**

Cover split UTF-8 chunks, multiple lines per chunk, missing newline at EOF,
invalid UTF-8, a 2 MiB response cap, a 2 MiB line cap, stage regression,
duplicate terminal events, unknown JSON keys, HTTP errors, cancellation, stale
repository results, language changes, disabled origin, signed-out session,
success, and deterministic-report preservation.

```ts
const events: DeepAnalysisEvent[] = [];
await runDeepAnalysis(request, session, (event) => events.push(event), {
  fetch,
});
expect(events.filter((event) => event.type === "stage")).toHaveLength(5);
expect(events.filter((event) => event.type === "specialist")).toHaveLength(6);
expect(events.at(-1)?.type).toBe("complete");

const { result, rerender } = renderHook(
  ({ report }) =>
    useDeepAnalysis({ deterministicReport: report, language: "en" }),
  { initialProps: { report: firstReport } },
);
rerender({ report: secondReport });
expect(firstRun.cancel).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run tests and verify missing client/hook**

Run: `pnpm test -- src/features/deep-analysis/client.test.ts src/features/deep-analysis/use-deep-analysis.test.tsx`

Expected: FAIL because client and hook do not exist.

- [ ] **Step 3: Implement typed session and authorization calls**

`getDeepSession` uses `GET /api/v1/session`, exact-origin credentials, no cache,
and a strict own-property guard for `disabled`, `signed-out`, or `ready`.
`startGitHubAuthorization` constructs only
`/api/v1/auth/start?returnTo={encoded-relative-share-url}` and performs a
top-level navigation. `signOutDeepSession` posts the exact CSRF header and
requires a no-content success response.

- [ ] **Step 4: Implement a bounded NDJSON reader**

`runDeepAnalysis` posts owner, repo, commit SHA, and language with credentials
and CSRF. Decode UTF-8 fatally, retain at most one partial line, validate each
event before callback, require canonical stage order and exactly one terminal
event, and cancel the reader on any violation. Map status codes and terminal
error kinds to local UI-safe errors.

- [ ] **Step 5: Implement independent React state**

The hook returns:

```ts
export interface UseDeepAnalysisResult {
  availability:
    "disabled" | "checking" | "signed-out" | "ready" | "unavailable";
  status: "idle" | "running" | "success" | "error";
  stage: DeepAnalysisStage | null;
  specialists: Record<
    DeepSpecialistRole,
    "pending" | "running" | "complete" | "failed"
  >;
  report: DeepReport | null;
  error: DeepAnalysisErrorKind | null;
  authorize(): void;
  generate(): Promise<void>;
  cancel(): void;
  signOut(): Promise<void>;
  setAutomatic(enabled: boolean): void;
  automatic: boolean;
}
```

Persist only exact key `reposcope:deep-analysis` with value `enabled`; every
other value means disabled. Key work by owner/repo/commit SHA/language rather
than object identity. On an identity change, abort the old request, increment a
request ID, and clear only a mismatched deep report. A same-identity retry
failure preserves the last valid report; cancellation returns to success when
one exists, otherwise idle. Reject late events unless request ID, identity, and
AbortSignal all match. A session-network failure is `unavailable`, not
`signed-out`; an unconfigured API makes zero session calls. Automatic
generation requires ready session, successful deterministic report, stored
consent, and idle state, and must not duplicate under React StrictMode.

- [ ] **Step 6: Verify client/hook tests and commit**

Run:

```sh
pnpm test -- src/features/deep-analysis
pnpm exec tsc -p tsconfig.app.json
```

Then commit:

```sh
git add src/features/deep-analysis
git commit -m "feat: stream expert reports in the browser"
```

### Task 3: Add consent, authorization, and expert progress UI

**Files:**

- Create: `src/components/expert-analysis-control.tsx`
- Create: `src/components/expert-analysis-control.test.tsx`
- Create: `src/components/expert-progress.tsx`
- Create: `src/components/expert-progress.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`
- Modify: `src/styles/app.css`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**

- Consumes: `UseDeepAnalysisResult`, active language, and deterministic report identity.
- Produces: first-use disclosure, sign-in/generate/cancel/retry/sign-out actions, five-stage progress, and accessible status announcements.

- [ ] **Step 1: Write interaction and copy tests**

Assert no control when API is disabled, disclosure before first authorization,
public-evidence/Copilot-allowance/no-execution wording, one primary action,
keyboard order, cancel behavior, error fallback, remembered automatic mode,
English/Chinese key parity, and no claim that analysis is local-only after the
feature is enabled.

```tsx
render(<ExpertAnalysisControl state={signedOutState} language="zh-CN" />);
await user.click(screen.getByRole("button", { name: "生成专家解读" }));
expect(screen.getByText(/公开仓库证据.*GitHub Copilot/u)).toBeVisible();
expect(signedOutState.authorize).not.toHaveBeenCalled();
await user.click(
  screen.getByRole("button", { name: "同意并使用 GitHub 登录" }),
);
expect(signedOutState.authorize).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```sh
pnpm test -- src/components/expert-analysis-control.test.tsx src/components/expert-progress.test.tsx src/App.test.tsx src/i18n/messages.test.ts
```

Expected: FAIL because expert controls and copy are missing.

- [ ] **Step 3: Implement first-use consent and states**

Use an inline editorial disclosure region rather than a modal. It explains
selected public evidence, GitHub Copilot usage, user entitlement, no code
execution, and deterministic fallback. The confirm action stores consent and
begins authorization; cancel leaves the report unchanged.

Ready sessions show Generate, automatic-mode checkbox, and a restrained
sign-out action. Errors use local copy for unavailable, allowance exhausted,
rate-limited, repository changed, GitHub unavailable, and internal failure.

- [ ] **Step 4: Implement five-stage progress**

Render a semantic ordered list with current/completed/pending text states and a
three-item visual specialist sublist driven by the typed role events. Keep one
polite live-region sentence at the five-stage level; do not announce token
counts, model IDs, or every rapid specialist transition. Cancel is a real
button and returns focus to the Generate action.

- [ ] **Step 5: Integrate without coupling deterministic state**

Instantiate `useDeepAnalysis` in `App` from `analysis.report` and language.
Render the control after `ReportSummary` through a new prop on `ReportView` in
the next task; until then render it immediately before `ReportView`. A deep
failure must not set `analysis.error`, clear `analysis.report`, change the share
URL, or disable deterministic refresh.

When an API origin is configured, select the optional-mode privacy,
`privacyMark`, and methodology-boundary copy; those strings explain that the
deterministic scan remains local and that only an authorized expert run sends
selected public evidence. An unconfigured static build retains the existing
absolute local-only copy.

- [ ] **Step 6: Verify UI tests and commit**

Run:

```sh
pnpm test -- src/components/expert-analysis-control.test.tsx src/components/expert-progress.test.tsx src/App.test.tsx src/i18n/messages.test.ts
pnpm lint
```

Then commit:

```sh
git add src/components/expert-analysis-control.tsx src/components/expert-analysis-control.test.tsx src/components/expert-progress.tsx src/components/expert-progress.test.tsx src/i18n src/styles/app.css src/App.tsx src/App.test.tsx
git commit -m "feat: add expert analysis consent and progress"
```

### Task 4: Render the grounded expert briefing

**Files:**

- Create: `src/components/expert-report.tsx`
- Create: `src/components/expert-report.test.tsx`
- Create: `src/components/expert-statement.tsx`
- Create: `src/components/expert-evidence.tsx`
- Modify: `src/components/report-view.tsx`
- Modify: `src/components/report-view.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/styles/app.css`

**Interfaces:**

- Consumes: a strict `DeepReport`, active language, and expert-control/progress node.
- Produces: ten human-readable chapters, provenance labels, immutable citations, responsive alternatives, disagreements, next checks, and a closed evidence drawer.

- [ ] **Step 1: Write report semantics and hostile-text tests**

Assert chapter order, heading hierarchy, provenance text, exact Stars/Watch/Fork
values, evidence link commit pinning, `noopener noreferrer`, alternatives table
headers, disagreements, unknowns, closed evidence drawer, original-language
repository evidence, text-only rendering of HTML-shaped claims, and no raw role
transcript/model ID.

```ts
render(<ExpertReport report={DEEP_REPORT_FIXTURE} language="en" />);
expect(screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent))
  .toEqual(EXPERT_CHAPTER_HEADINGS_EN);
expect(screen.getByText("Repository states")).toBeVisible();
expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
expect(document.querySelector("img[src='x']")).toBeNull();
```

- [ ] **Step 2: Run report tests and verify missing renderer**

Run: `pnpm test -- src/components/expert-report.test.tsx src/components/report-view.test.tsx`

Expected: FAIL because the expert renderer does not exist.

- [ ] **Step 3: Implement compact statement and evidence primitives**

`ExpertStatement` renders plain text, localized provenance, confidence, and
numbered evidence links. `ExpertEvidence` resolves IDs only from the report's
strict evidence array and refuses an unknown ID. Repository-authored text is
visually distinct from interpretation without color-only meaning.

- [ ] **Step 4: Implement ten editorial chapters**

Render orientation/verdict first, then fit, situations, capabilities/workflow,
broad architecture, onboarding, trust, maintenance/community, alternatives,
and expert verdict with disagreements/next checks. Use paragraphs and lists,
not dashboard-card repetition. Keep ordinary prose at 64–72 characters per line.

Use a semantic table for alternatives on wide screens and CSS row blocks on
narrow screens while preserving headers for assistive technology. Dynamic
community facts show exact localized integers and dates; popularity copy states
that attention is not proof of quality or safety.

- [ ] **Step 5: Integrate the report at the presentation boundary**

Extend `ReportView` with an optional presentation boundary:

```ts
interface ReportViewProps {
  report: AnalysisReport;
  expert?: ReactNode;
  language: Language;
  onRefresh: () => void;
}
```

Render `ReportSummary`, then the expert control/progress/report node, then the
existing README-first reader report and closed technical appendix. Do not add
deep output to `AnalysisReport`, its cache, worker messages, or scorer.

- [ ] **Step 6: Verify visual component gates and commit**

Run:

```sh
pnpm test -- src/components/expert-report.test.tsx src/components/report-view.test.tsx src/App.test.tsx
pnpm exec tsc -p tsconfig.app.json
pnpm lint
```

Then commit:

```sh
git add src/components/expert-report.tsx src/components/expert-report.test.tsx src/components/expert-statement.tsx src/components/expert-evidence.tsx src/components/report-view.tsx src/components/report-view.test.tsx src/i18n/messages.ts src/styles/app.css src/App.tsx src/App.test.tsx
git commit -m "feat: explain repositories with an expert briefing"
```

### Task 5: Add deterministic browser flows and responsive accessibility gates

**Files:**

- Modify: `e2e/fixtures.ts`
- Create: `e2e/fixtures/deep-report.ts`
- Modify: `e2e/reposcope.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: fixed GitHub fixtures and strict deep-report fixture.
- Produces: mocked session/auth/NDJSON routes and desktop/mobile end-to-end coverage with no live model usage.

- [ ] **Step 1: Add failing expert-flow E2E cases**

Add tests for disabled static mode, cache-ready authorization session, first-use
consent, five streamed stages, success chapter order, Chinese generation,
automatic next-repository generation, cancellation, allowance failure fallback,
invalid terminal report rejection, deterministic refresh independence, and
late first-repository result isolation. Include a release-base-path case proving
the OAuth return target is `/reposcope/?repo=...`.

- [ ] **Step 2: Run one focused desktop case and verify failure**

Run: `pnpm exec playwright test --project=desktop-chromium -g "expert briefing"`

Expected: FAIL until fixtures and UI flow are complete.

- [ ] **Step 3: Implement same-origin API fixtures**

Build E2E with `REPOSCOPE_API_ORIGIN=http://127.0.0.1:4173`. Fulfill
`/api/v1/session`, auth start, sign-out, and deep-analysis requests inside
Playwright. Record request body, credentials mode, CSRF header, cancel signal,
and call count. Route fulfillment validates the complete user flow; exact UTF-8
split boundaries, 2 MiB caps, interrupted streams, and late chunks use a custom
`ReadableStream` in `client.test.ts` because route fulfillment does not prove
network chunking.

The external-request guard continues to reject every unexpected host. No E2E
test calls GitHub Copilot or consumes user entitlement.

- [ ] **Step 4: Add responsive and accessibility assertions**

At 188, 320, 375, 768, and 1366 widths assert no document-level horizontal
overflow, readable alternative rows, 44 CSS-pixel primary touch targets,
logical focus order, reduced-motion behavior, Axe zero serious/critical issues,
and meaningful content when CSS connecting lines are absent.

- [ ] **Step 5: Run complete browser gates**

Run:

```sh
pnpm build
pnpm exec playwright test
pnpm check:lighthouse
pnpm check:bundle
```

Expected: desktop/mobile E2E, Lighthouse, CSP, and bundle budgets pass.

- [ ] **Step 6: Commit**

```sh
git add e2e playwright.config.ts
git commit -m "test: verify expert interpretation flows"
```

### Task 6: Package the service and update public guarantees

**Files:**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docs/deep-analysis-deployment.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/architecture.md`
- Modify: `SECURITY.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CHANGELOG.md`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `src/repository-files.test.ts`

**Interfaces:**

- Consumes: built `server-dist`, static `dist`, GitHub OAuth App configuration, and a persistent cache volume.
- Produces: reproducible container service, exact deployment procedure, updated bilingual privacy/security claims, and release checklist.

- [ ] **Step 1: Write failing repository-document contract tests**

Assert that English and Chinese docs both disclose optional GitHub authorization,
Copilot evidence transfer, user allowance, static fallback, no code execution,
token retention, cache contents, and the fact that GitHub Models itself is not
used. Assert configured builds conditionally replace every absolute “no login /
no backend / no AI” interface claim while static builds retain it. Assert the
deployment guide lists every environment variable, the same-site custom-domain
requirement, and callback URL without example secrets.

- [ ] **Step 2: Run the documentation contract and verify failure**

Run: `pnpm test -- src/repository-files.test.ts`

Expected: FAIL because old documents still state that no backend or AI service
can participate.

- [ ] **Step 3: Add a least-privilege container**

Use a pinned Node 24 Debian image, frozen pnpm install, server build, non-root
runtime user, read-only application files, `/data` cache volume, port 8787,
health check against `/api/v1/health`, and `node server-dist/server/index.js`.
Do not bake environment files, GitHub credentials, source fixtures, or browser
test artifacts into the runtime image.

- [ ] **Step 4: Document GitHub OAuth App and hosting setup**

The guide specifies:

1. create a GitHub OAuth App and request no scopes or private-repository access;
2. configure a custom same-site domain pair for the frontend and API, then set
   the exact callback URL and frontend URL including its base path;
3. deploy the container with GitHub client ID/secret and persistent cache path;
4. set the Pages repository variable `REPOSCOPE_API_ORIGIN` to the HTTPS service origin;
5. verify health, signed-out session, OAuth state rejection, authorized session,
   one live public repository, sign-out, and static fallback; and
6. rotate the client secret and clear active sessions after a credential event.

State explicitly that actual OAuth App registration, secret creation, DNS, and hosting
are external deployment operations and are not performed by source builds.

- [ ] **Step 5: Update architecture, privacy, security, and contribution copy**

Replace absolute no-backend/no-AI statements with two explicit modes:

- deterministic static inspection, requiring no login or AI service; and
- optional GitHub-authorized expert interpretation, sending selected public
  evidence through the service to GitHub Copilot.

Document trust boundaries, prompt injection controls, no-tool sessions, cache
retention, token handling, CSP origin, failure isolation, and the unchanged
ruleset. Add the feature to Unreleased changelog and PR checklist.

- [ ] **Step 6: Run container and full release validation**

Run:

```sh
pnpm format
pnpm check
pnpm test:coverage
pnpm check:bundle
pnpm exec playwright test
pnpm check:lighthouse
docker build -t reposcope-expert-panel:test .
docker run --rm -d --name reposcope-expert-panel-test -p 8787:8787 \
  -e NODE_ENV=development \
  -e REPOSCOPE_FRONTEND_URL=http://127.0.0.1:4173/ \
  -e REPOSCOPE_API_ORIGIN=http://127.0.0.1:8787 \
  reposcope-expert-panel:test
curl --fail http://127.0.0.1:8787/api/v1/health
docker stop reposcope-expert-panel-test
```

Expected: every local release gate passes; the unconfigured container reports
deep analysis disabled and contains no secret.

- [ ] **Step 7: Commit**

```sh
git add Dockerfile .dockerignore docs README.md README.zh-CN.md SECURITY.md CONTRIBUTING.md CHANGELOG.md .github/PULL_REQUEST_TEMPLATE.md src/repository-files.test.ts
git commit -m "docs: ship expert analysis deployment boundaries"
```

### Task 7: Gate expert mode with curated human evaluation

**Files:**

- Create: `evals/deep-analysis/cases.json`
- Create: `evals/deep-analysis/rubric.md`
- Create: `scripts/check-deep-analysis-eval.mjs`
- Create: `scripts/check-deep-analysis-eval.test.mjs`
- Modify: `package.json`
- Modify: `docs/deep-analysis-deployment.md`

**Interfaces:**

- Consumes: versioned bilingual reports for 10–20 diverse public repositories,
  including sparse, mature, archived, multilingual, and malicious-README cases.
- Produces: a redacted six-dimension human scorecard gate; no model transcript,
  prompt, credential, or repository body is committed.

- [ ] **Step 1: Define the frozen corpus and rubric**

Score correctness, usefulness, evidence discipline, uncertainty, alternative
quality, and reading quality from one to five. Require median >= 4 in every
dimension, no high-severity unsupported security/privacy claim, and no prompt
injection success. Keep expert mode unconfigured in production until this gate
has a dated passing result.

- [ ] **Step 2: Implement and test the scorecard validator**

Reject missing cases/raters/dimensions, out-of-range values, duplicate case IDs,
unresolved severe findings, stale schema/prompt versions, and accidental secret
or transcript fields. The default repository test validates the corpus/rubric
shape without pretending human scores exist.

- [ ] **Step 3: Run the human gate when authorized reports exist**

Two reviewers independently score every generated report. A failing or absent
scorecard is a typed deployment blocker, not a source-build failure; the static
deterministic product remains publishable.

- [ ] **Step 4: Commit**

```sh
git add evals/deep-analysis scripts/check-deep-analysis-eval.mjs scripts/check-deep-analysis-eval.test.mjs package.json docs/deep-analysis-deployment.md
git commit -m "test: gate expert analysis reading quality"
```

### Task 8: Run guarded live smoke and publish the branch

**Files:**

- Create: `scripts/smoke-copilot-panel.ts`
- Modify: `package.json`
- Modify: `docs/deep-analysis-deployment.md`

**Interfaces:**

- Consumes: explicit local environment credentials and one public repository slug.
- Produces: redacted pass/fail output for authorization-independent SDK entitlement, panel structure, grounding, and cleanup; no committed result or token.

- [ ] **Step 1: Add an opt-in smoke script**

The script refuses to run unless `REPOSCOPE_LIVE_COPILOT_SMOKE=1` and a supported
GitHub user token is already present in the process environment. It analyzes one
fixed public repository commit, checks five-role completion and `isDeepReport`,
prints only stage durations/cache status/report section counts, and always stops
the SDK client and deletes its temporary workspace.

- [ ] **Step 2: Verify the default refusal path**

Run: `pnpm smoke:copilot`

Expected: exit nonzero with `live Copilot smoke is disabled`; output contains no
environment values.

- [ ] **Step 3: Run live smoke only when existing entitlement is safely available**

Run the script with the opt-in flag and token passed through the process
environment without printing it. If entitlement or external GitHub OAuth App setup is
unavailable, record a typed skipped result in the handoff; do not weaken tests,
embed a token, create an external app, or substitute a project-owned credential.

- [ ] **Step 4: Re-run final repository gates**

Run:

```sh
pnpm check
pnpm test:coverage
pnpm check:bundle
pnpm exec playwright test
pnpm check:lighthouse
git status --short
```

Expected: all gates pass and only intended committed changes remain.

- [ ] **Step 5: Commit and push the existing feature branch**

```sh
git add scripts/smoke-copilot-panel.ts package.json docs/deep-analysis-deployment.md
git commit -m "test: add guarded Copilot panel smoke"
git push origin codex/readme-first-project-interpretation
```

Update the existing draft pull request with the optional-backend architecture,
test evidence, live-smoke status, and the explicit external deployment steps.
