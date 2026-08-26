# RepoScope v0.2.0 Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the README-first RepoScope release internally consistent, fully gated, safely maintained, and eligible for an honest v0.2.0 release.

**Architecture:** Preserve the existing deterministic browser analyzer and separately failing optional expert service. Tighten public positioning in the existing bilingual message system, align prompt evaluation with the shipped prompt, repair the React session state model for the stronger hooks lint rule, and use GitHub-native feedback, governance, and security controls.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Vitest 4, Playwright, pnpm 11, GitHub Actions, GitHub Pages, GitHub REST/GraphQL APIs.

## Global Constraints

- Analyze only public GitHub repositories and never execute repository-authored code or commands.
- Deterministic mode remains read-only, browser-local, login-free, token-free, backend-free, analytics-free, and AI-free.
- Optional expert mode remains opt-in and must not be publicly enabled without a dated passing two-reviewer scorecard for prompt `1.1.0`.
- English and Simplified Chinese application copy remain semantically equivalent and naturally written.
- Popularity counts are facts, never proof of quality, safety, or adoption.
- Keep Node support at `>=24 <25`; defer dependencies that require a higher floor.
- Do not weaken lint, tests, coverage, accessibility, bundle, Lighthouse, or safety thresholds.
- Future commits use `Thworry <31728500+Thworry@users.noreply.github.com>`; do not rewrite published history.
- The main ruleset must not require an external approval or prevent the solo maintainer from merging a green pull request.

---

### Task 1: Align the expert prompt evaluation contract

**Files:**

- Modify: `evals/deep-analysis/cases.json`
- Modify: `scripts/check-deep-analysis-eval.mjs`
- Modify: `scripts/check-deep-analysis-eval.test.mjs`

**Interfaces:**

- Consumes: `PANEL_PROMPT_VERSION = "1.1.0"` from `server/panel/prompts.ts` as the shipped contract.
- Produces: an evaluator and corpus that reject any scorecard whose `promptVersion` is not `1.1.0`.

- [ ] **Step 1: Change the evaluator test fixtures to prompt 1.1.0**

Update the shared valid corpus/scorecard fixture in `scripts/check-deep-analysis-eval.test.mjs` to `promptVersion: "1.1.0"`, while retaining the stale-version test with `"0.9.0"`.

- [ ] **Step 2: Run the evaluator tests before implementation**

Run: `node --test scripts/check-deep-analysis-eval.test.mjs`

Expected: FAIL because the implementation still expects `1.0.0`.

- [ ] **Step 3: Align implementation and corpus**

Set `EXPECTED_VERSIONS.promptVersion` in `scripts/check-deep-analysis-eval.mjs` and the top-level `promptVersion` in `evals/deep-analysis/cases.json` to `"1.1.0"`. Do not change `schemaVersion` or `evidenceSchemaVersion`.

- [ ] **Step 4: Verify corpus and deployment fail-closed behavior**

Run:

```bash
node --test scripts/check-deep-analysis-eval.test.mjs
pnpm check:deep-analysis-eval
pnpm gate:deep-analysis
```

Expected: tests and corpus validation PASS; `gate:deep-analysis` FAILS with `scorecard-required` when no private scorecard is supplied.

### Task 2: Make CI match the documented release gate

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `CONTRIBUTING.md`

**Interfaces:**

- Consumes: existing package scripts `typecheck:server`, `check:deep-analysis-eval`, and `test:e2e`.
- Produces: the GitHub Actions status context `quality`, covering both Playwright projects and the deterministic expert-evaluation corpus.

- [ ] **Step 1: Add missing static and evaluation checks**

After `pnpm exec tsc -b`, add `pnpm typecheck:server` and `pnpm check:deep-analysis-eval` to both CI validation paths.

- [ ] **Step 2: Run the full browser matrix**

Replace the desktop-only Playwright invocation with `pnpm test:e2e` in CI and Pages so both `desktop-chromium` and `mobile-chromium` execute.

- [ ] **Step 3: Keep the contributor contract exact**

Ensure `CONTRIBUTING.md` lists the same commands and explicitly states that the private human scorecard is a deployment gate, not a requirement for the static Pages build.

- [ ] **Step 4: Validate workflow syntax and local commands**

Run:

```bash
pnpm typecheck:server
pnpm check:deep-analysis-eval
pnpm test:e2e
```

Expected: all commands PASS; Playwright reports both desktop and mobile projects.

### Task 3: Adopt React Hooks 7.1.1 without effect-driven state resets

**Files:**

- Modify: `src/features/deep-analysis/use-deep-analysis.ts`
- Modify: `src/features/deep-analysis/use-deep-analysis.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `originHref: string | null` and asynchronous `getSession(): Promise<DeepSession>`.
- Produces: `availability` and `session` derived for the current origin, with no synchronous state update inside the session-checking effect.

- [ ] **Step 1: Add an origin-transition regression test**

Render the hook with a configured API origin, resolve a ready session, rerender with `apiOrigin: null`, and assert availability becomes `disabled` immediately without another session request. Rerender with a different URL and assert `checking` is exposed until that URL's asynchronous result resolves.

- [ ] **Step 2: Confirm the stronger lint rule fails on the current model**

Apply only the `eslint-plugin-react-hooks` 7.1.1 package/lockfile update, then run `pnpm lint`.

Expected: FAIL at the synchronous `setSession`/`setAvailability` calls in the effect.

- [ ] **Step 3: Tag session state by origin**

Replace separate untagged effect-reset state with one state object carrying `originHref`, `availability`, and `session`. Derive `disabled` when the current origin is null and `checking` when stored state belongs to another origin. Only asynchronous success/failure callbacks may commit tagged session state.

- [ ] **Step 4: Verify behavior and lint**

Run:

```bash
pnpm exec vitest run src/features/deep-analysis/use-deep-analysis.test.tsx
pnpm lint
pnpm typecheck:server
```

Expected: all PASS with `react-hooks/set-state-in-effect` still enabled.

### Task 4: Tighten README-first positioning and add transparent feedback

**Files:**

- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles/app.css`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `SUPPORT.md`

**Interfaces:**

- Consumes: the existing `baseEn`/`baseZh` message objects and landing layout.
- Produces: an adoption-oriented first viewport plus a secondary DAYU boundary and Discussions feedback link.

- [ ] **Step 1: Add copy assertions**

Assert that English names a `public GitHub repository`, `README`, and evidence; Chinese names `公开 GitHub 仓库`, `README`, and `可核对` information. Assert a visible DAYU link explains that DAYU is a pre-beta signal reality check rather than the same product.

- [ ] **Step 2: Update the first viewport**

Use these meaning-equivalent messages:

```text
EN title: Understand a public GitHub repository—starting with its README.
EN tagline: Evidence-backed guidance on what it does, how to run it, where the risks are, and whether it is worth your time.
ZH title: 先从 README 看懂一个公开 GitHub 仓库，再决定要不要用。
ZH tagline: 用可核对的公开信息讲清项目用途、上手方式、风险、维护情况和替代方案。
```

Add a restrained secondary product-boundary sentence linking to `https://github.com/Thworry/dayu`; do not let it compete with the repository analysis form.

- [ ] **Step 3: Update public docs and metadata text**

Add a short `RepoScope and DAYU` section to both READMEs and a `Feedback` section linking to `https://github.com/Thworry/reposcope/discussions`. Update `SUPPORT.md` to route usage questions and ideas to Discussions and security reports to private vulnerability reporting. Set the neutral HTML title/description to the README-first repository-inspector position.

- [ ] **Step 4: Validate bilingual rendering**

Run:

```bash
pnpm exec vitest run src/App.test.tsx src/i18n/messages.test.ts
pnpm format:check
pnpm build
pnpm test:e2e
pnpm check:lighthouse
```

Expected: all PASS at desktop and mobile widths with no horizontal overflow or serious Axe violation.

### Task 5: Review and resolve existing Dependabot pull requests

**Files:**

- Modify through dependency PRs only: `package.json`, `pnpm-lock.yaml`

**Interfaces:**

- Consumes: latest `main` and GitHub Actions `quality` check.
- Produces: individually reviewed merges for compatible updates and explicit deferral for incompatible updates.

- [ ] **Step 1: Rebase and merge low-risk PRs one at a time**

Process #6 (`eslint-plugin-react-refresh`), #5 (`globals`), then #3 (`eslint`). For each: update its branch to the latest main, inspect the two-file diff, wait for a fresh `quality` success on the updated SHA, merge, and wait for main CI/Pages before touching the next PR.

- [ ] **Step 2: Resolve the hooks PR through the tested human fix**

Land Task 3 as a dedicated pull request, wait for the complete `quality` check, merge it, then close Dependabot #2 as superseded with a link to the fix. Never disable the new lint rule.

- [ ] **Step 3: Defer jsdom 30**

Close or leave #1 unmerged with a clear note that jsdom 30 requires Node 24.15 while RepoScope currently supports all Node 24 releases. Do not raise the product's Node floor merely to absorb a test-only major update.

### Task 6: Prepare versioned release artifacts

**Files:**

- Modify: `package.json`
- Modify: `src/repository-files.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: all merged code and dependency decisions.
- Produces: package version `0.2.0`, dated changelog, and GitHub release notes that describe capabilities and boundaries without claiming expert deployment is enabled.

- [ ] **Step 1: Add the release version assertion**

Change the repository-file contract test to expect `0.2.0`, then run it and confirm it fails while `package.json` is still `0.1.1`.

- [ ] **Step 2: Set version and changelog date**

Set `package.json.version` to `0.2.0`. Rename `[Unreleased]` to `0.2.0 - <actual Beijing release date>` and preserve a new empty `[Unreleased]` section above it.

- [ ] **Step 3: Write honest release notes**

Cover the README-first dossier, human-readable project chapters, Chinese localization, optional Copilot expert service, security/privacy boundaries, CI improvements, and dependency decisions. State that Pages remains deterministic-only unless an operator separately configures and passes the expert deployment gate.

### Task 7: Apply repository settings and publish only after all gates

**Files:**

- Remote GitHub settings for `Thworry/reposcope`

**Interfaces:**

- Consumes: merged `main`, passing `quality`, successful Pages deployment, and release artifacts.
- Produces: protected main, supported security automation, Discussions, and an immutable v0.2.0 GitHub release.

- [ ] **Step 1: Update repository metadata and Discussions**

Set description to `README-first, evidence-backed analysis for understanding public GitHub repositories before adoption.` Keep the existing Homepage. Enable Discussions and preserve privacy-first/bilingual topics.

- [ ] **Step 2: Enable compatible security automation**

Enable vulnerability alerts, Dependabot security updates, and CodeQL default setup for Actions and JavaScript/TypeScript. Verify each setting through the corresponding read API and confirm the first CodeQL analysis completes without billable private-repository usage.

- [ ] **Step 3: Create the solo-maintainer main ruleset**

Target `refs/heads/main`; require a pull request with zero approvals, resolved review threads, strict `quality` status, and block deletion/non-fast-forward updates. Do not require CODEOWNERS or last-push approval. Verify the owner can merge a green pull request.

- [ ] **Step 4: Run the final local gate**

Run:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm exec tsc -b
pnpm typecheck:server
pnpm test:coverage
pnpm test:server
pnpm check:deep-analysis-eval
pnpm build
pnpm check:bundle
pnpm test:e2e
pnpm check:lighthouse
pnpm audit --prod
```

Expected: every release gate PASS and production audit reports no known vulnerability.

- [ ] **Step 5: Publish and verify v0.2.0**

After the release PR merges and remote `main` CI/Pages are green, create annotated tag/release `v0.2.0`. Verify the tag points to remote main, release is public/latest, Pages serves the new asset, and both local task branch and main have no task-created uncommitted changes.
