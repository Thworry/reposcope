# README-first Project Interpretation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the human-readable report into a README-first project guide with bounded local interpretation, community facts, lightweight structural corroboration, and an editorial workflow visualization.

**Architecture:** Extend the existing validated GitHub metadata and one-pass safe Markdown scanner, then derive a frozen `ReaderReadmeProfile` and community facts outside the scorer. Carry the required shape through the worker, strict guard, serialized cache, and client before rendering it in a new focused React component above the existing six chapters; keep detailed code metrics in the closed technical appendix.

**Tech Stack:** TypeScript 6, React 19, Vite 8, Vitest 4, Testing Library, Playwright 1.62, plain CSS, GitHub REST API, browser Web Worker, sessionStorage cache.

## Global Constraints

- Remain fully local, deterministic, bounded, bilingual, and non-scoring; do not add an AI service, backend, login, token, analytics, or project execution.
- Keep ruleset `1.0.0`, every score input, dimension weight, confidence calculation, rule result, strength, and weakness unchanged.
- Use `subscribers_count` for the displayed Watch value; do not use GitHub's historical `watchers_count` alias.
- Community popularity facts never affect reliability, score, confidence, strengths, weaknesses, or named-alternative output.
- Scan the preferred README once under the existing 256 KiB limit; preserve fail-closed HTML, link, URL, credential, control, bidi, malformed-UTF, path, item-cap, and performance boundaries.
- Preserve repository-authored prose in its source language. Localize only RepoScope labels, commentary templates, cautions, and empty states.
- Code structure in the main report is limited to broad product shape, ecosystems, and major top-level areas; function metrics and detailed file evidence remain in the closed technical appendix.
- Render commands as inert text only. A semver range is not a command; existing compound command, remote-pipeline, nested-`env`, and destructive-command review behavior must not regress.
- Keep source links commit-pinned, independently encode owner/repository/path segments, and retain `target="_blank" rel="noopener noreferrer"`.
- Preserve the 200-file, 10 MiB decoded-text, 256 KiB per-file, six-fetch-concurrency, two-attempt, 2 MiB cache, CSP, and GitHub request-host limits.
- Preserve the editorial dossier visual system: 64–72ch prose, ruled groups, small radii, no radar score, no synthetic percentage, no card flood, no decorative motion.
- Preserve 44px targets, 3px focus indication, reduced motion, semantic landmarks, bilingual parity, and zero horizontal overflow at 375/768/1366 widths and 200% zoom-equivalent reflow.
- Use the bundled Node 24 and pnpm runtime already configured for this workspace; do not change dependencies or `pnpm-lock.yaml`.

---

## File and responsibility map

### New focused files

- `src/features/analyzers/reader-report/readme-policy.ts` — frozen English/Chinese heading families, category caps, canonical category order, and heading lookup.
- `src/features/analyzers/reader-report/readme-interpretation.ts` — pure mapping from safe Markdown evidence plus broad repository structure to `ReaderReadmeProfile` and canonical commentary identifiers.
- `src/features/analyzers/reader-report/readme-interpretation.test.ts` — commentary, availability, deduplication, cross-check, and determinism tests.
- `src/components/readme-interpretation.tsx` — community fact strip, README narrative, capability groups, workflow, claim/observation comparison, and commentary rendering.
- `src/components/readme-interpretation.test.tsx` — semantic, bilingual, hostile-text, accessibility-label, and layout-contract tests.

### Existing files with bounded changes

- `src/features/github/raw-model.ts` and `src/features/github/github-client.ts` — validate and normalize star, subscriber, and fork counts from the existing repository request.
- `src/features/analysis/model.ts` — add community, README profile, capability group, and frozen commentary types.
- `src/features/analyzers/reader-report/markdown.ts` — extend the current single scanner to collect safe README profile evidence; do not add a second Markdown pass.
- `src/features/analyzers/reader-report/commands.ts` — expose a documented-command admission helper so version constraints cannot become commands.
- `src/features/analyzers/reader-report.ts` — assemble community facts, README profile, existing signals, and lightweight structural corroboration.
- `src/features/analysis/reader-report-policy.ts` — retain existing reliability policy and add pure README availability/commentary helpers only if they are shared by producer and guard.
- `src/features/analysis/guards.ts` — strictly validate the new required serialized shape and recompute canonical availability/commentary.
- `src/features/worker/analysis.worker.ts` — carry the expanded reader report without adding it to score inputs.
- `src/features/cache/report-cache.ts` and `src/features/worker/worker-client.ts` — no intended production algorithm change; their tests prove stale/unsafe shapes fail closed through existing validation.
- `src/components/reader-report.tsx` — insert the new interpretation component, remove duplicated opening evidence, and simplify the main architecture chapter.
- `src/i18n/messages.ts` — complete English and Simplified Chinese labels, commentary, disclaimers, and empty states.
- `src/styles/app.css` — add ruled community, capability, workflow, comparison, and commentary layouts within the existing visual system.
- `src/test/fixtures/github.ts` and `src/test/fixtures/metrics.ts` — canonical community and rich README fixtures shared across boundary tests.
- `e2e/fixtures.ts`, `e2e/reposcope.spec.ts`, and `src/repository-files.test.ts` — rendered product contract, hostile content, request ledger, and documentation assertions.
- `README.md`, `README.zh-CN.md`, `docs/methodology.md`, `docs/architecture.md`, and `CHANGELOG.md` — public contract and limitations.

---

### Task 1: Validate GitHub community metadata

**Files:**

- Modify: `src/features/github/raw-model.ts:1-15`
- Modify: `src/features/github/github-client.ts:270-353`
- Modify: `src/features/github/github-client.test.ts`
- Modify: `src/features/analysis/model.ts:27-41`
- Modify: `src/test/fixtures/github.ts:1-15`
- Modify: `src/test/fixtures/metrics.ts:15-35`
- Test: `src/features/github/github-client.test.ts`

**Interfaces:**

- Consumes: the existing `GET /repos/{owner}/{repo}` response and `readNonNegativeInteger` guard.
- Produces: `RepositoryMetadata.starsCount`, `watchersCount`, and `forksCount`, where `watchersCount` is normalized exclusively from `subscribers_count`.

- [ ] **Step 1: Add failing response-boundary tests**

Add canonical values to `VALID_REPOSITORY_RESPONSE` and assert the normalized snapshot:

```ts
const communityFields = {
  stargazers_count: 1_284,
  subscribers_count: 37,
  forks_count: 146,
} as const;

expect(VALID_REPOSITORY_RESPONSE).toMatchObject(communityFields);
expect(snapshot.repository).toMatchObject({
  starsCount: 1_284,
  watchersCount: 37,
  forksCount: 146,
});
```

Add a table that replaces each raw field with `undefined`, `-1`, `1.5`,
`Number.POSITIVE_INFINITY`, and `Number.MAX_SAFE_INTEGER + 1`, expecting
`GitHubApiError("invalid-response")`. Add zero and `Number.MAX_SAFE_INTEGER`
positive cases. Add a mismatch probe proving `watchers_count: 9_999` cannot
override `subscribers_count: 37`.

- [ ] **Step 2: Run the focused GitHub test and record RED**

Run:

```bash
pnpm exec vitest run src/features/github/github-client.test.ts
```

Expected: failures because the three required raw fields are not read and the
normalized metadata lacks the three count properties.

- [ ] **Step 3: Extend raw and normalized metadata**

Append these exact fields to `RawRepositoryResponse` after `license`:

```ts
stargazers_count: number;
subscribers_count: number;
forks_count: number;
```

Append these exact fields to `RepositoryMetadata` after `openIssuesCount`:

```ts
starsCount: number;
watchersCount: number;
forksCount: number;
```

In `guardRepository`, read and assign them with the existing integer helper:

```ts
const starsCount = readNonNegativeInteger(value, "stargazers_count");
const watchersCount = readNonNegativeInteger(value, "subscribers_count");
const forksCount = readNonNegativeInteger(value, "forks_count");
```

Append the shorthand properties `starsCount`, `watchersCount`, and `forksCount`
to the existing normalized `RepositoryMetadata` object.

Update `perfectRepository` once so all consumers receive canonical fixture
values without scattered casts.

- [ ] **Step 4: Run metadata and compatibility gates**

Run:

```bash
pnpm exec vitest run \
  src/features/github/github-client.test.ts \
  src/features/analyzers/general.test.ts \
  src/features/rules/rules.test.ts \
  src/features/analysis/service.test.ts \
  src/features/worker/analysis.worker.test.ts
pnpm exec tsc -b
pnpm lint
pnpm format:check
```

Expected: all pass; no score/rule assertions change.

- [ ] **Step 5: Commit the metadata boundary**

```bash
git add \
  src/features/github/raw-model.ts \
  src/features/github/github-client.ts \
  src/features/github/github-client.test.ts \
  src/features/analysis/model.ts \
  src/test/fixtures/github.ts \
  src/test/fixtures/metrics.ts
git commit -m "feat: capture repository community facts"
```

---

### Task 2: Expand the one-pass safe README scanner

**Files:**

- Create: `src/features/analyzers/reader-report/readme-policy.ts`
- Modify: `src/features/analyzers/reader-report/markdown.ts:15-98,181-211,736-end`
- Modify: `src/features/analyzers/reader-report/markdown.test.ts`
- Modify: `src/features/analyzers/reader-report/commands.ts:52-78,379-end`
- Modify: `src/features/analyzers/reader-report/commands.test.ts`
- Test: `src/features/analyzers/reader-report/markdown.test.ts`
- Test: `src/features/analyzers/reader-report/commands.test.ts`

**Interfaces:**

- Consumes: one preferred `FetchedTextFile`, existing Markdown safety state, and existing command classification.
- Produces: `ReaderMarkdownEvidence.readme`, a raw safe profile with `overview`, `audiences`, `problems`, `useCases`, `capabilityGroups`, `workflow`, `dependencies`, `limitations`, and `maturity`; also produces `documentedCommandDisposition(command): ReaderCommandDisposition | null`.

- [ ] **Step 1: Freeze headings, caps, and raw evidence types in failing tests**

Add a bilingual fixture that exercises all categories in one scan:

```ts
const richReadme = fetchedDocumentation(`
# StoryForge

An end-to-end workspace for long-form fiction.

## Who is this for?
- Independent novelists
- Writing teams

## Problems
- Keeping a long narrative consistent

## Features
### Planning
- Worldbuilding
- Character arcs
### Production
- Chapter generation
- Whole-book review

## Workflow
1. Capture an idea
2. Build the world
3. Plan chapters
4. Draft and review

## Requirements
- Node.js 24
- A model provider API key

## Limitations
- Collaborative editing is experimental

## Roadmap
- Stable migration tooling
`);

expect(extractReaderMarkdownEvidence(richReadme).readme).toEqual({
  overview: [fact("An end-to-end workspace for long-form fiction.")],
  audiences: [fact("Independent novelists"), fact("Writing teams")],
  problems: [fact("Keeping a long narrative consistent")],
  useCases: [],
  capabilityGroups: [
    group("Planning", ["Worldbuilding", "Character arcs"]),
    group("Production", ["Chapter generation", "Whole-book review"]),
  ],
  workflow: [
    fact("Capture an idea"),
    fact("Build the world"),
    fact("Plan chapters"),
    fact("Draft and review"),
  ],
  dependencies: [fact("Node.js 24"), fact("A model provider API key")],
  limitations: [fact("Collaborative editing is experimental")],
  maturity: [fact("Stable migration tooling")],
});
```

Add the equivalent Chinese heading matrix, a mixed-language README, nested
feature headings, a bounded two-cell table, duplicate NFKC text, source-language
preservation, reverse-order determinism, and exact caps `4/4/4/4/6×6/8/8/6/6`.

- [ ] **Step 2: Add RED safety and conservative-fallback cases**

Extend the existing hostile matrix so each new category rejects:

```ts
[
  "<!-- hidden -->",
  "<details>hidden</details>",
  "[label](https://secret.invalid/path)",
  "https://secret.invalid/raw",
  `token=ghp_${"a".repeat(36)}`,
  "\u202Ehidden",
  "bad\uD800text",
];
```

Add a README with no recognized overview heading and assert only an early safe
descriptive paragraph becomes `overview`; audiences, capabilities, workflow,
dependencies, limitations, and maturity must remain empty. Add a table of
badge, table-of-contents, navigation, release-log, slogan-only, image-only,
link-definition, and command-shaped fallback candidates that remain empty.

- [ ] **Step 3: Add RED command-admission cases**

Add direct and README-level tests:

```ts
expect(
  documentedCommandDisposition("^20.19.0 || ^22.12.0 || >=24.0.0"),
).toBeNull();
expect(documentedCommandDisposition("Node.js >= 24")).toBeNull();
expect(documentedCommandDisposition("pnpm run dev")).toBe("ready");
expect(documentedCommandDisposition("npm test || chmod 777 file")).toBe(
  "review",
);
```

In a `## Run` README section, prove the semver range stays in dependency prose
and does not occupy the single run-command slot before a later real command.

- [ ] **Step 4: Run the scanner suites and record RED**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report/markdown.test.ts \
  src/features/analyzers/reader-report/commands.test.ts
```

Expected: failures for the absent README profile, absent heading policy, and
the semver range currently admitted as a command.

- [ ] **Step 5: Implement the frozen README policy**

Create `readme-policy.ts` with exact categories and caps:

```ts
export const README_PROFILE_CAPS = Object.freeze({
  overview: 4,
  audiences: 4,
  problems: 4,
  useCases: 4,
  capabilityGroups: 6,
  capabilityFacts: 6,
  workflow: 8,
  dependencies: 8,
  limitations: 6,
  maturity: 6,
} as const);

export const README_SECTION_HEADINGS = Object.freeze({
  overview: ["overview", "introduction", "about", "简介", "项目介绍", "概述"],
  audiences: ["who is this for", "audience", "适合谁", "目标用户"],
  problems: ["problem", "why", "motivation", "解决的问题", "为什么"],
  useCases: ["use cases", "business scenarios", "用途", "适用场景", "使用场景"],
  capabilities: ["features", "capabilities", "功能", "特性", "核心能力"],
  workflow: [
    "workflow",
    "how it works",
    "core concepts",
    "流程",
    "工作流",
    "工作原理",
    "核心概念",
  ],
  dependencies: [
    "requirements",
    "prerequisites",
    "installation",
    "deployment",
    "providers",
    "integrations",
    "configuration",
    "依赖",
    "环境要求",
    "安装",
    "部署",
    "模型服务",
    "集成",
    "配置",
  ],
  limitations: [
    "limitations",
    "known issues",
    "security",
    "privacy",
    "data handling",
    "限制",
    "已知问题",
    "安全",
    "隐私",
    "数据处理",
  ],
  maturity: [
    "roadmap",
    "status",
    "migration",
    "preview",
    "beta",
    "路线图",
    "项目状态",
    "迁移",
    "预览",
    "测试版",
  ],
} as const);
```

Build one normalized lookup from these arrays. Keep install/run/develop/test/build
command sections in the same policy so the scanner still performs one pass.

- [ ] **Step 6: Extend the existing scanner without adding a second pass**

Expand `HeadingFrame` to retain canonical section, raw safe label, and parent
capability group. Extend the existing line loop so the same HTML/fence/link
state feeds both legacy evidence and the new profile. Use the existing
`visibleProse`, `canonicalText`, source/path construction, paragraph accumulator,
and cap checks. Model raw evidence locally:

```ts
export interface ReaderMarkdownReadmeEvidence {
  overview: ReaderTextFact[];
  audiences: ReaderTextFact[];
  problems: ReaderTextFact[];
  useCases: ReaderTextFact[];
  capabilityGroups: Array<{ label: string; facts: ReaderTextFact[] }>;
  workflow: ReaderTextFact[];
  dependencies: ReaderTextFact[];
  limitations: ReaderTextFact[];
  maturity: ReaderTextFact[];
}
```

For ordered lists in workflow sections, preserve document order. For
capabilities, use the nearest safe nested heading as the group label and fall
back to the parent feature heading only when there is no nested group. Admit a
table row only when exactly two safe visible cells remain after Markdown
sanitization; serialize it as `left — right` within the 480-code-point fact
limit.

- [ ] **Step 7: Add the executable-position admission helper**

Reuse `normalizedVisibleCommand`, `scanShellCommand`, and `unwrapCommand`; do
not invent a second shell parser:

```ts
export function documentedCommandDisposition(
  command: string,
): ReaderCommandDisposition | null {
  const normalized = normalizedVisibleCommand(command);
  if (normalized === null) return "withheld";
  const scanned = scanShellCommand(normalized);
  const first = scanned.pipelines[0]?.[0];
  if (first === undefined) return null;
  const executable = unwrapCommand(first).executable;
  if (!DOCUMENTED_EXECUTABLES.has(executable)) return null;
  return reviewBeforeRunning(normalized) ? "review" : "ready";
}
```

The frozen executable set includes only commands already supported by README
and manifest extraction: package managers, `node`, `deno`, `python`, `python3`,
`pip`, `pip3`, `uv`, `poetry`, `go`, `cargo`, `dotnet`, `java`, `mvn`, `gradle`,
`ruby`, `bundle`, `php`, `composer`, `swift`, `dart`, `flutter`, `docker`,
`make`, and directly documented project executables prefixed with `./`.
`markdown.ts` calls this helper before reserving a command kind; `null` leaves
the slot available for a later real command, while `withheld` preserves the
fact without copying unsafe text.

- [ ] **Step 8: Run scanner, compatibility, performance, and static gates**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report/markdown.test.ts \
  src/features/analyzers/reader-report/commands.test.ts \
  src/features/analyzers/project-brief.test.ts \
  src/features/analyzers/general.test.ts \
  src/features/scanner/line-metrics.test.ts
pnpm exec tsc -b
pnpm lint
pnpm format:check
```

Add one explicit near-256 KiB rich README timing assertion using the repository's
existing generous threshold; add one 255 KiB unmatched-link adversarial case to
prove the new grouping logic remains linear.

- [ ] **Step 9: Commit the safe README scanner**

```bash
git add \
  src/features/analyzers/reader-report/readme-policy.ts \
  src/features/analyzers/reader-report/markdown.ts \
  src/features/analyzers/reader-report/markdown.test.ts \
  src/features/analyzers/reader-report/commands.ts \
  src/features/analyzers/reader-report/commands.test.ts
git commit -m "feat: extract rich README evidence"
```

---

### Task 3: Derive a canonical README profile and commentary

**Files:**

- Create: `src/features/analyzers/reader-report/readme-interpretation.ts`
- Create: `src/features/analyzers/reader-report/readme-interpretation.test.ts`
- Modify: `src/features/analysis/model.ts:240-346`
- Modify: `src/features/analysis/reader-report-policy.ts`
- Modify: `src/features/analysis/reader-report-policy.test.ts`
- Test: `src/features/analyzers/reader-report/readme-interpretation.test.ts`
- Test: `src/features/analysis/reader-report-policy.test.ts`

**Interfaces:**

- Consumes: `ReaderMarkdownReadmeEvidence`, a canonical preferred-README input state, project-purpose canonical keys, and broad product shape/ecosystem/tree facts.
- Produces: `buildReadmeProfile(input): ReaderReadmeProfile`, `deriveReadmeCommentary(profile, corroboration): ReaderCommentaryId[]`, and frozen model types used by Task 4.

- [ ] **Step 1: Write failing model and commentary decision-table tests**

Freeze the commentary groups, canonical order, and exact triggers. Use an
explicit fixture so the expected identifiers cannot depend on an implicit
`richProfile` helper:

```ts
const profile = profileWith({
  overview: [fact("A complete overview."), fact("A second overview fact.")],
  capabilityGroups: [group("Planning", ["Worldbuilding"])],
  workflow: [fact("Plan"), fact("Draft")],
  dependencies: [fact("Node.js 24")],
});

expect(
  deriveReadmeCommentary(profile, {
    productShapeObserved: true,
    ecosystemsObserved: true,
    directStructureReferenceMissing: false,
  }),
).toEqual([
  "readme-substantial-overview",
  "readme-capabilities-documented",
  "readme-workflow-documented",
  "readme-security-data-flow-unestablished",
  "readme-limitations-unestablished",
  "readme-maturity-unestablished",
  "readme-external-dependencies-declared",
]);
```

Add cases for missing README, overview-only README, use cases without workflow,
explicit limitations, explicit maturity, no security/data handling, no
requirements, product-shape corroboration, incomplete README fetch, unrelated
coverage failure, absent broad structure, a README-mentioned conventional
manifest missing from a complete tree, the same manifest under an incomplete
tree, and reverse-order deterministic equality. The missing-structure cases
must emit a verification prompt, never a claim that the README is false.

- [ ] **Step 2: Run the new tests and record RED**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report/readme-interpretation.test.ts \
  src/features/analysis/reader-report-policy.test.ts
```

Expected: import-resolution and missing-type failures.

- [ ] **Step 3: Add frozen model types without changing `ReaderReport` yet**

Add exact types:

```ts
export const READER_COMMENTARY_IDS = Object.freeze([
  "readme-substantial-overview",
  "readme-audience-or-use-cases-documented",
  "readme-capabilities-documented",
  "readme-workflow-documented",
  "readme-onboarding-documented",
  "readme-limitations-documented",
  "readme-maturity-documented",
  "readme-broad-structure-corroborated",
  "readme-security-data-flow-unestablished",
  "readme-limitations-unestablished",
  "readme-maturity-unestablished",
  "readme-broad-structure-needs-verification",
  "readme-external-dependencies-declared",
] as const);

export type ReaderCommentaryId = (typeof READER_COMMENTARY_IDS)[number];

export interface ReaderCapabilityGroup {
  label: string;
  facts: ReaderTextFact[];
}

export interface ReaderReadmeProfile {
  availability: ReaderAvailability;
  overview: ReaderTextFact[];
  audiences: ReaderTextFact[];
  problems: ReaderTextFact[];
  useCases: ReaderTextFact[];
  capabilityGroups: ReaderCapabilityGroup[];
  workflow: ReaderTextFact[];
  dependencies: ReaderTextFact[];
  limitations: ReaderTextFact[];
  maturity: ReaderTextFact[];
  commentary: ReaderCommentaryId[];
}

export interface ReaderCommunityFacts {
  starsCount: number;
  watchersCount: number;
  forksCount: number;
}
```

Define frozen commentary groups alongside the vocabulary:

```ts
const WORTH_NOTING_IDS = [
  "readme-substantial-overview",
  "readme-audience-or-use-cases-documented",
  "readme-capabilities-documented",
  "readme-workflow-documented",
  "readme-onboarding-documented",
  "readme-limitations-documented",
  "readme-maturity-documented",
  "readme-broad-structure-corroborated",
] as const;

const VERIFY_IDS = [
  "readme-security-data-flow-unestablished",
  "readme-limitations-unestablished",
  "readme-maturity-unestablished",
  "readme-broad-structure-needs-verification",
] as const;

const PRACTICAL_IDS = ["readme-external-dependencies-declared"] as const;
```

Select at most three `worth-noting`, all four `verify`, and one `practical`
identifier, then flatten those groups in that order for serialization. The
eight-item cap therefore cannot hide a verification prompt behind positive
README observations. Add one isolated decision-table row for every identifier,
including the positive corroboration identifier that the multi-trigger example
can omit after the worth-noting cap.

Do not add them to `ReaderReport` in this task, so the current serialized report
and full test suite remain valid until Task 4 updates producer and guard in one
atomic boundary.

- [ ] **Step 4: Implement pure availability and commentary policy**

Use an exact README-specific input state rather than global coverage:

```ts
export type PreferredReadmeState = "missing" | "incomplete" | "fetched";

export function deriveReadmeAvailability(input: {
  preferredReadmeState: PreferredReadmeState;
  safeFactCount: number;
}): ReaderAvailability {
  if (input.preferredReadmeState === "missing") return "unavailable";
  if (input.preferredReadmeState === "incomplete") return "partial";
  return input.safeFactCount > 0 ? "available" : "unavailable";
}
```

Derive `PreferredReadmeState` in Task 4 from the normalized tree, the preferred
README path, fetched paths, `coverage.treeComplete`, and a matching README path
in coverage failures/skips: a fetched preferred README is `fetched`; a known
path that was skipped or failed is `incomplete`; no known path under an
incomplete tree is also `incomplete`; only a complete tree with no preferred
README is `missing`. Unrelated raw-file failures must not make a fetched README
partial. Commentary generation checks canonical profile arrays and bounded
broad corroboration inputs only. It emits at most eight identifiers in the
frozen group/order policy, with no repository text embedded in identifiers.

For cross-checking, recognize only conventional manifest basenames already
used by structural ecosystem detection. If a safe README dependency fact names
one exactly and a complete tree lacks it, emit
`readme-broad-structure-needs-verification`; an incomplete tree can establish
only that corroboration is unavailable. Do not infer a contradiction from
arbitrary nouns, paths, component names, or feature prose.

- [ ] **Step 5: Implement `buildReadmeProfile`**

The function canonicalizes and deduplicates each array, removes project-purpose
duplicates from overview/use cases before caps, preserves document order for
workflow, preserves policy order for commentary, and copies no mutable input:

```ts
export function buildReadmeProfile(
  input: BuildReadmeProfileInput,
): ReaderReadmeProfile {
  const profile = {
    availability: deriveReadmeAvailability({
      preferredReadmeState: input.preferredReadmeState,
      safeFactCount: countFacts(input.evidence),
    }),
    overview: boundedFacts(input.evidence.overview, 4, input.purposeKeys),
    audiences: boundedFacts(input.evidence.audiences, 4),
    problems: boundedFacts(input.evidence.problems, 4),
    useCases: boundedFacts(input.evidence.useCases, 4, input.purposeKeys),
    capabilityGroups: boundedGroups(input.evidence.capabilityGroups),
    workflow: boundedFacts(input.evidence.workflow, 8),
    dependencies: boundedFacts(input.evidence.dependencies, 8),
    limitations: boundedFacts(input.evidence.limitations, 6),
    maturity: boundedFacts(input.evidence.maturity, 6),
    commentary: [],
  } satisfies ReaderReadmeProfile;

  return {
    ...profile,
    commentary: deriveReadmeCommentary(profile, input.corroboration),
  };
}
```

For an `incomplete` preferred README, retain any safe acquired arrays but mark
the profile partial; when no text was acquired, return a canonical partial
profile with empty arrays. For `missing`, return a canonical unavailable
profile. Unsafe values are already removed by the scanner; this layer still
refuses duplicates and noncanonical source/path combinations in tests.

- [ ] **Step 6: Run policy and full compatibility tests**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report/readme-interpretation.test.ts \
  src/features/analysis/reader-report-policy.test.ts \
  src/features/analyzers/reader-report/markdown.test.ts
pnpm exec vitest run
pnpm exec tsc -b
pnpm lint
pnpm format:check
```

Expected: all current serialized-report tests remain unchanged because the new
types and derivation are not attached yet.

- [ ] **Step 7: Commit the pure interpretation policy**

```bash
git add \
  src/features/analyzers/reader-report/readme-interpretation.ts \
  src/features/analyzers/reader-report/readme-interpretation.test.ts \
  src/features/analysis/model.ts \
  src/features/analysis/reader-report-policy.ts \
  src/features/analysis/reader-report-policy.test.ts
git commit -m "feat: derive bounded README interpretation"
```

---

### Task 4: Carry the required profile through report trust boundaries

**Files:**

- Modify: `src/features/analysis/model.ts:302-346`
- Modify: `src/features/analyzers/reader-report.ts:109-114,517-714`
- Modify: `src/features/analyzers/reader-report.test.ts`
- Modify: `src/features/analysis/guards.ts:584-840`
- Modify: `src/features/analysis/guards.test.ts`
- Modify: `src/features/worker/analysis.worker.ts:511-567`
- Modify: `src/features/worker/analysis.worker.test.ts`
- Modify: `src/features/worker/worker-client.test.ts`
- Modify: `src/features/cache/report-cache.test.ts`
- Modify: `src/test/fixtures/metrics.ts:64-220`
- Modify: all complete `AnalysisReport` fixtures reported by `rg "readerReport:" src --glob '*.test.ts*'`
- Test: `src/features/analyzers/reader-report.test.ts`
- Test: `src/features/analysis/guards.test.ts`
- Test: `src/features/worker/analysis.worker.test.ts`
- Test: `src/features/worker/worker-client.test.ts`
- Test: `src/features/cache/report-cache.test.ts`

**Interfaces:**

- Consumes: `buildReadmeProfile`, normalized repository community counts, the existing preferred README selection, safe tree paths, project brief, and coverage.
- Produces: required `ReaderReport.community` and `ReaderReport.readme` fields accepted by the strict guard and preserved through worker/cache/client serialization.

- [ ] **Step 1: Update the canonical fixture and write exact RED producer tests**

Add to `perfectReaderReport`:

```ts
community: {
  starsCount: 1_284,
  watchersCount: 37,
  forksCount: 146,
},
readme: {
  availability: "available",
  overview: [readmeFact("A bounded project overview.")],
  audiences: [readmeFact("Repository adopters")],
  problems: [readmeFact("Understanding unfamiliar repositories")],
  useCases: [readmeFact("Evaluate a public project before adoption")],
  capabilityGroups: [
    {
      label: "Reader report",
      facts: [readmeFact("Evidence-backed project interpretation")],
    },
  ],
  workflow: [readmeFact("Fetch evidence"), readmeFact("Interpret README")],
  dependencies: [readmeFact("A modern browser")],
  limitations: [readmeFact("Static evidence only")],
  maturity: [readmeFact("Versioned methodology")],
  commentary: [
    "readme-capabilities-documented",
    "readme-workflow-documented",
    "readme-limitations-documented",
    "readme-security-data-flow-unestablished",
    "readme-external-dependencies-declared",
  ],
},
```

In `reader-report.test.ts`, assert `analyzeReaderReport` copies exact community
counts, builds the profile, uses README-specific availability, excludes purpose
duplicates before caps, ignores unrelated fetch failures for README
availability, marks a skipped/failed preferred README and an unknown README
under an incomplete tree as partial, and returns a canonical empty `readme`
plus preserved `community` from `unavailableReaderReport`.

- [ ] **Step 2: Add strict guard, cache, and client RED mutations**

Add mutation tables for:

```ts
reader.community.starsCount = -1;
reader.community.watchersCount = 1.5;
reader.community.forksCount = Number.POSITIVE_INFINITY;
reader.readme.overview.push(...fiveFacts);
reader.readme.capabilityGroups[0]!.facts.push(...sevenFacts);
reader.readme.commentary.reverse();
reader.readme.commentary.push("unknown-id" as never);
reader.readme.workflow[0]!.text = `ghp_${"a".repeat(36)}`;
reader.readme.availability = "available"; // with empty facts
delete (reader as unknown as Record<string, unknown>).readme;
```

Cover sparse arrays, duplicate NFKC labels/facts, cross-array duplicate overview
and purpose text, inconsistent source/path, boxed strings, cycles, proxies,
getter state changes, stale old reports, hostile `toJSON`, and a maximum valid
profile under the 2 MiB cache limit. Cache set must serialize once, validate the
same parsed snapshot, and never persist an unsafe profile.

- [ ] **Step 3: Run the boundary suites and record RED**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report.test.ts \
  src/features/analysis/guards.test.ts \
  src/features/worker/analysis.worker.test.ts \
  src/features/worker/worker-client.test.ts \
  src/features/cache/report-cache.test.ts
```

Expected: producer lacks fields, guard rejects the new canonical fixture, and
worker/client/cache fixtures disagree with the required shape.

- [ ] **Step 4: Make community and README required in `ReaderReport`**

Change the interface atomically by inserting these required declarations before
the existing `reliability` declaration; leave the seven existing nested field
types unchanged:

```ts
community: ReaderCommunityFacts;
readme: ReaderReadmeProfile;
```

Keep canonical object key order exactly as listed. Update every complete fixture
with `structuredClone(perfectReaderReport)` rather than inline partial values.

- [ ] **Step 5: Integrate the producer without touching score inputs**

In `analyzeReaderReport`:

```ts
const preferredPath = preferredReadmePath(treePaths);
const readme = preferredReadme(fetchedFiles);
const preferredReadmeState = derivePreferredReadmeState({
  preferredPath,
  fetchedPath: readme?.path ?? null,
  treeComplete: input.coverage.treeComplete,
  skipped: input.coverage.skipped,
  failures: input.coverage.failures,
});
const readmeProfile = buildReadmeProfile({
  preferredReadmeState,
  evidence: readmeEvidence.readme,
  purposeKeys,
  corroboration: {
    productShapeObserved: input.projectBrief.kinds.length > 0,
    ecosystemsObserved: structure.ecosystems.length > 0,
    directStructureReferenceMissing: directReadmeStructureReferenceMissing(
      readmeEvidence.readme.dependencies,
      treePaths,
      input.coverage.treeComplete,
    ),
  },
});
```

Prepend these entries to the existing returned `ReaderReport` object and leave
all existing entries unchanged:

```ts
{
  community: {
    starsCount: validateCommunityCount(input.repository.starsCount),
    watchersCount: validateCommunityCount(input.repository.watchersCount),
    forksCount: validateCommunityCount(input.repository.forksCount),
  },
  readme: readmeProfile,
}
```

`unavailableReaderReport` validates and preserves community counts but returns
`readme.availability = "unavailable"` with every array empty. Reader derivation
exceptions remain isolated from the unchanged scorer.

- [ ] **Step 6: Implement strict canonical validation**

Extend `exactKeys` with `community` and `readme`. Add focused helpers:

```ts
function validReaderCommunity(value: unknown): value is ReaderCommunityFacts;
function validReaderCapabilityGroups(
  value: unknown,
): value is ReaderCapabilityGroup[];
function validReaderReadmeProfile(
  value: unknown,
  projectBrief: ProjectBrief,
  unavailableFallback: boolean,
): value is ReaderReadmeProfile;
```

Validate count integers, exact keys, caps, dense arrays, source/path pairs,
credential-safe text, label/fact NFKC uniqueness, cross-purpose deduplication,
canonical commentary membership/group order, and structural availability
consistency: `available` requires at least one safe fact; `unavailable` requires
empty arrays and commentary; `partial` may retain safe evidence. Producer tests
own the tree/fetch-to-availability decision because the nested profile does not
serialize raw acquisition state. For the unavailable fallback, require all
README arrays and commentary to be empty while allowing validated community
metadata.

- [ ] **Step 7: Lock worker and scorer isolation**

In `analysis.worker.test.ts`, capture both invocation payloads and assert:

```ts
expect(readerReport).toHaveBeenCalledWith(
  expect.objectContaining({ repository: perfectRepository }),
);
expect(score).toHaveBeenCalledWith(
  expect.not.objectContaining({ readerReport: expect.anything() }),
);
expect(complete.report.readerReport.community).toEqual(
  perfectReaderReport.community,
);
```

Also assert reader derivation occurs before score as the existing architecture
contract states, reader failure returns the canonical unavailable profile, and
score/finding exceptions are still not swallowed.

- [ ] **Step 8: Run boundary, full, and static gates**

Run:

```bash
pnpm exec vitest run \
  src/features/analyzers/reader-report.test.ts \
  src/features/analysis/guards.test.ts \
  src/features/worker/analysis.worker.test.ts \
  src/features/worker/worker-client.test.ts \
  src/features/cache/report-cache.test.ts \
  src/features/rules/rules.test.ts
pnpm exec vitest run
pnpm exec tsc -b
pnpm lint
pnpm format:check
git diff --check
```

Expected: all pass; `src/features/rules`, score/confidence code, package files,
and `pnpm-lock.yaml` have no diff.

- [ ] **Step 9: Commit the trust-boundary integration**

```bash
git add \
  src/features/analysis/model.ts \
  src/features/analyzers/reader-report.ts \
  src/features/analyzers/reader-report.test.ts \
  src/features/analysis/guards.ts \
  src/features/analysis/guards.test.ts \
  src/features/worker/analysis.worker.ts \
  src/features/worker/analysis.worker.test.ts \
  src/features/worker/worker-client.test.ts \
  src/features/cache/report-cache.test.ts \
  src/test/fixtures/metrics.ts \
  src/App.test.tsx \
  src/features/analysis/service.test.ts \
  src/features/analysis/use-repository-analysis.test.tsx
git commit -m "feat: carry README interpretation through reports"
```

---

### Task 5: Render the README-first editorial report

**Files:**

- Create: `src/components/readme-interpretation.tsx`
- Create: `src/components/readme-interpretation.test.tsx`
- Modify: `src/components/reader-report.tsx:419-end`
- Modify: `src/components/reader-report.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`
- Modify: `src/styles/app.css:544-760,1178-1225`
- Test: `src/components/readme-interpretation.test.tsx`
- Test: `src/components/reader-report.test.tsx`
- Test: `src/i18n/messages.test.ts`

**Interfaces:**

- Consumes: strict `AnalysisReport.readerReport.community`, `.readme`, existing project brief, broad kinds/ecosystems/source areas, immutable source context, and `Language`.
- Produces: `ReadmeInterpretationView({ report, language }): ReactElement`, rendered once before the six chapters; no fetch, effect, cache, score, or recomputation behavior.

- [ ] **Step 1: Write semantic RED component tests**

Render `perfectReaderReport` and assert this exact visible order:

```ts
expect(regionHeadings()).toEqual([
  "Project orientation",
  "Community and maintenance facts",
  "What the README says",
  "Core capabilities",
  "Documented workflow",
  "README claims and repository observations",
  "RepoScope commentary",
]);
```

Assert the community strip is one `dl` containing Stars, Watch, Forks, Open
issues, Last push, and License; exact values appear in accessible text and the
copy says popularity is not proof of quality or safety. Assert all README facts
render as React text, every source uses the existing immutable source helper,
and commentary is mapped from frozen IDs rather than repository-authored HTML.

Add English/Chinese rerender tests proving repository prose is byte-for-byte
unchanged and no effect/refetch is triggered. Add missing and partial README
states. Add duplicate capability labels, long words, punctuation, CJK, hostile
`<script>`, fake links, and bidi text already accepted by the upstream guard as
inert text.

- [ ] **Step 2: Write visual-contract RED tests**

Assert class and semantic contracts rather than snapshots:

```ts
expect(screen.getByRole("list", { name: "Documented workflow" })).toHaveClass(
  "readme-interpretation__workflow",
);
expect(screen.getByRole("definition", { name: /Stars/ })).toHaveAttribute(
  "data-exact-value",
  "1284",
);
expect(screen.queryByText(/overall README score/i)).toBeNull();
expect(screen.queryByRole("img", { name: /radar/i })).toBeNull();
```

Lock the high-level CSS contract: ruled `dl`, no card class, wide-screen ordered
workflow grid, narrow-screen single column, comparison two columns only at
`min-width: 64rem`, `overflow-wrap: anywhere`, and reduced-motion rule with no
new animation.

- [ ] **Step 3: Run component tests and record RED**

Run:

```bash
pnpm exec vitest run \
  src/components/readme-interpretation.test.tsx \
  src/components/reader-report.test.tsx \
  src/i18n/messages.test.ts
```

Expected: missing component/import and missing copy keys.

- [ ] **Step 4: Add complete bilingual copy and frozen commentary mapping**

Add keys for orientation, community labels, popularity limitation, README
subsections, comparison labels, commentary groups, commentary identifiers,
partial/missing states, and the renamed **How it broadly works** chapter.

Use an exhaustive mapping:

```ts
const COMMENTARY_KEYS = {
  "readme-substantial-overview": "readerCommentarySubstantialOverview",
  "readme-audience-or-use-cases-documented": "readerCommentaryAudience",
  "readme-capabilities-documented": "readerCommentaryCapabilities",
  "readme-workflow-documented": "readerCommentaryWorkflow",
  "readme-onboarding-documented": "readerCommentaryOnboarding",
  "readme-limitations-documented": "readerCommentaryLimitations",
  "readme-maturity-documented": "readerCommentaryMaturity",
  "readme-broad-structure-corroborated": "readerCommentaryCorroboration",
  "readme-security-data-flow-unestablished": "readerCommentarySecurityGap",
  "readme-limitations-unestablished": "readerCommentaryLimitationsGap",
  "readme-maturity-unestablished": "readerCommentaryMaturityGap",
  "readme-broad-structure-needs-verification":
    "readerCommentaryStructureVerification",
  "readme-external-dependencies-declared": "readerCommentaryDependencies",
} as const satisfies Record<ReaderCommentaryId, keyof Messages>;
```

Use disciplined copy such as **The README states**, **Repository structure
shows**, **This suggests**, and **The scanned evidence does not establish**.
Do not add “recommended”, “safe”, “production-ready”, or suitability claims.

- [ ] **Step 5: Implement `ReadmeInterpretationView`**

Keep the file focused with private subcomponents:

```tsx
export function ReadmeInterpretationView({
  report,
  language,
}: ReadmeInterpretationViewProps): ReactElement {
  return (
    <section className="readme-interpretation" aria-labelledby={headingId}>
      <Orientation report={report} language={language} />
      <CommunityFacts report={report} language={language} />
      <ReadmeNarrative report={report} language={language} />
      <CapabilityGroups report={report} language={language} />
      <Workflow report={report} language={language} />
      <ClaimObservationComparison report={report} language={language} />
      <Commentary report={report} language={language} />
    </section>
  );
}
```

Community values use `Intl.NumberFormat(language, { notation: "compact" })`
visually while an `aria-label` and `data-exact-value` retain the exact integer.
The comparison shows README facts on one side and only broad product
kinds/ecosystems/top-level areas on the other. It does not render detailed
entry-point paths. Reuse `ReaderReportSource` for every repository fact.

- [ ] **Step 6: Integrate once and remove duplicate main-path content**

Insert the component after repository identity and before the current decision
status/six chapters. In the existing purpose chapter, avoid repeating all
overview/use-case facts already shown above; retain evidence status and source
links where needed. In the architecture chapter, render README concepts,
ecosystems, project kinds, and at most the broad source areas; remove the main
path's detailed entry-point and architecture-document lists. The technical
appendix and serialized report retain all existing technical evidence.

Assert `ReadmeInterpretationView` appears exactly once and the technical
appendix still appears exactly once, closed by default.

- [ ] **Step 7: Add the editorial visualization CSS**

Extend existing tokens only:

```css
.readme-interpretation__community {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  margin: 0;
  border-top: 1px solid var(--color-rule);
}

.readme-interpretation__workflow {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  padding: 0;
  list-style: none;
}

.readme-interpretation__workflow li {
  position: relative;
  padding: var(--space-3) 0 var(--space-3) var(--space-6);
  border-left: 1px solid var(--color-rule-strong);
}

@media (min-width: 64rem) {
  .readme-interpretation__community {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .readme-interpretation__workflow {
    grid-template-columns: repeat(var(--workflow-columns), minmax(0, 1fr));
  }

  .readme-interpretation__comparison {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Set the workflow column count from a bounded inline custom property or cap it
at four columns per row; never build an unbounded CSS selector. Use borders and
typography, not new cards, shadows, gradients, or motion.

- [ ] **Step 8: Run UI, full, build, and bundle gates**

Run:

```bash
pnpm exec vitest run \
  src/components/readme-interpretation.test.tsx \
  src/components/reader-report.test.tsx \
  src/components/report-view.test.tsx \
  src/components/technical-appendix.test.tsx \
  src/i18n/messages.test.ts
pnpm exec vitest run
pnpm exec tsc -b
pnpm lint
pnpm format:check
pnpm build
pnpm check:bundle
git diff --check
```

Inspect the rendered rich fixture at 375, 768, and 1366 widths before commit.
Verify the prose remains 64–72ch, workflow order is understandable without its
line, community labels do not look like a score, and no main-section function
or rule details return.

- [ ] **Step 9: Commit the README-first UI**

```bash
git add \
  src/components/readme-interpretation.tsx \
  src/components/readme-interpretation.test.tsx \
  src/components/reader-report.tsx \
  src/components/reader-report.test.tsx \
  src/i18n/messages.ts \
  src/i18n/messages.test.ts \
  src/styles/app.css
git commit -m "feat: explain README evidence visually"
```

---

### Task 6: Lock browser behavior and public documentation

**Files:**

- Modify: `e2e/fixtures.ts`
- Modify: `e2e/reposcope.spec.ts`
- Modify: `src/repository-files.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/methodology.md`
- Modify: `docs/architecture.md`
- Modify: `CHANGELOG.md`
- Test: `src/repository-files.test.ts`
- Test: `e2e/reposcope.spec.ts`

**Interfaces:**

- Consumes: the completed README-first production UI and existing deterministic GitHub route fixtures.
- Produces: a rich bounded browser fixture, exact desktop/mobile acceptance, and an accurate bilingual public contract.

- [ ] **Step 1: Add documentation-contract RED assertions**

Require both READMEs to state that the primary explanation comes from bounded
README evidence, uses no AI service, and treats popularity as context rather
than quality. Require methodology to name the exact community fields and caps.
Require architecture to document:

```text
GitHub repository metadata
  -> preferred README single safe scan
  -> README interpretation + broad structural corroboration
  -> unchanged scorer in parallel input space
  -> combined strict report guard
  -> snapshot-validated cache
  -> README-first UI + closed technical appendix
```

Require the changelog to describe a reader-experience change without claiming a
new score, security audit, or AI summary.

- [ ] **Step 2: Run the repository contract and record RED**

Run:

```bash
pnpm exec vitest run src/repository-files.test.ts
```

Expected: missing README-first, community-source, cap, and changelog wording.

- [ ] **Step 3: Build a rich local E2E README fixture**

Extend the existing completed fixture with original test prose covering:

```md
# Fiction Workbench

A local-first workspace for planning and producing long-form fiction.

## Who is this for?

- Independent novelists
- Small writing teams

## Core capabilities

### Planning

- Worldbuilding and character arcs

### Production

- Chapter drafting and whole-book review

## Workflow

1. Capture an idea
2. Build the world
3. Plan chapters
4. Draft and review

## Requirements

- Node.js ^20.19.0 || ^22.12.0 || >=24.0.0
- A user-supplied model provider key

## Limitations

- Real-time collaboration is experimental

## Roadmap

- Stable migration tooling
```

Set repository metadata to distinct counts, for example stars `1284`,
subscribers `37`, forks `146`, and open issues `23`. Keep the fixture's raw-file
request count explicit and unique. Do not copy the live third-party README.

- [ ] **Step 4: Add browser RED assertions**

For desktop and mobile assert:

- exact heading/order of orientation, community facts, narrative, capability
  groups, workflow, comparison, commentary, six chapters, and appendix;
- exact accessible community values and popularity disclaimer;
- README prose remains inert and source-language stable across the language
  switch;
- workflow is an ordered list with eight-or-fewer items;
- comparison contains broad structure only and no function/rule identifiers;
- missing and partial README fixtures display honest copy;
- semver requirements are absent from command `<code>` elements;
- appendix closed hides score/rules/functions and opening reveals all of them;
- toggling language or appendix changes no URL, analyzed time, REST/raw ledger,
  progress state, or report identity;
- all repository links are commit-pinned and every external link has the
  required `rel` tokens;
- no command code is inside an anchor or button;
- Axe serious/critical is zero, visible targets are at least 44px, focus is at
  least 3px, reduced-motion duration is at most 0.001s, and 188/375/768/1366
  widths have no horizontal overflow.

- [ ] **Step 5: Run targeted browser RED**

Run:

```bash
CI=1 pnpm exec playwright test \
  --grep "README-first interpretation|missing README|hostile repository"
```

Expected: failures for absent community/profile UI and stale ordering.

- [ ] **Step 6: Update bilingual documentation**

Document exact evidence categories and caps, `subscribers_count` Watch
semantics, no-AI behavior, source-language preservation, commentary vocabulary,
README-specific partial state, lightweight code corroboration, unchanged score,
and security limitations. Keep existing API request, file/byte, cache, CSP,
unsupported-language, static-analysis, and rate-limit documentation intact.

- [ ] **Step 7: Run contract, full browser, static, and bundle gates**

Run serially to avoid performance-test contention:

```bash
pnpm exec vitest run src/repository-files.test.ts
pnpm exec vitest run
pnpm exec tsc -b
pnpm lint
pnpm format:check
pnpm build
pnpm check:bundle
CI=1 pnpm exec playwright test
git diff --check
```

Expected: all pass; every completed scan still makes exactly three unique GitHub
REST requests, stays under 200 unique raw requests, and makes no unexpected-host
request.

- [ ] **Step 8: Commit E2E and documentation**

```bash
git add \
  e2e/fixtures.ts \
  e2e/reposcope.spec.ts \
  src/repository-files.test.ts \
  README.md \
  README.zh-CN.md \
  docs/methodology.md \
  docs/architecture.md \
  CHANGELOG.md
git commit -m "test: verify README-first project interpretation"
```

---

### Task 7: Run the final release-candidate gate

**Files:**

- Verify only: all files changed by Tasks 1–6
- Do not modify production code, tests, documentation, dependencies, lockfile, configuration, tags, or remotes during this task.

**Interfaces:**

- Consumes: clean reviewed commits from Tasks 1–6.
- Produces: reproducible release evidence and live acceptance facts; no repository mutation.

- [ ] **Step 1: Capture baseline and protected-path evidence**

Run:

```bash
git status --short
git log --oneline -10
shasum -a 256 pnpm-lock.yaml
pnpm install --frozen-lockfile
shasum -a 256 pnpm-lock.yaml
git diff --check
```

Record exact zero-diff evidence for rule definitions, scorer/confidence/findings,
scanner limits, GitHub request limits/hosts, Vite config, `package.json`, and
`pnpm-lock.yaml`. Confirm intended guard/worker/cache/UI changes preserve the
2 MiB cache and all request/byte/concurrency limits.

- [ ] **Step 2: Run coverage and static gates serially**

```bash
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm exec tsc -b
```

Require every test to pass and retain repository thresholds of at least 90%
statements, 80% branches, 90% functions, and 90% lines. Record exact counts and
percentages.

- [ ] **Step 3: Run both production builds and bundle/CSP gates**

```bash
pnpm build
pnpm check:bundle
VITE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
```

Record default and Pages gzip sizes, lazy worker/analyzer graph, local subpath
resolution, raw-source-marker scan, CSP checks, and budget results. Do not raise
budgets to make the gate pass.

- [ ] **Step 4: Run complete rendered acceptance**

```bash
CI=1 pnpm exec playwright test
pnpm check:lighthouse
pnpm check:lighthouse
pnpm check:lighthouse
```

Require the full desktop/mobile matrix to pass. Each Lighthouse command uses
the configured three measurements; record performance, accessibility,
best-practices, SEO, and assertion results for all nine reports.

- [ ] **Step 5: Inspect the approved rich fixture visually**

Inspect screenshots at 375, 768, and 1366 widths plus 200% zoom-equivalent
reflow. Confirm the report reads as a project guide rather than a dashboard,
community values are contextual, the README narrative dominates, the workflow
is clear, code structure is light, and the technical appendix remains visibly
secondary.

- [ ] **Step 6: Run live current-build acceptance**

Use the current local Pages production build against:

```text
ExplosiveCoderflome/AI-Novel-Writing-Assistant
Thworry/issueready
ossf/scorecard
```

For each repository record completion state, README availability, community
facts, narrative/capability/workflow counts, commentary IDs rendered, exact
three REST requests, unique raw request count, pinned-link count, command count,
unexpected hosts, page/console errors, and appendix closed/open behavior.
Verify the AI Novel repository no longer displays its Node version constraint
as a run command. Report GitHub REST or raw CDN limits as network facts and
accept partial evidence only when the UI fails closed honestly.

- [ ] **Step 7: Final clean handoff**

```bash
git status --short
git diff --check
git log --oneline -10
```

Require empty status and no tag, push, deployment, or release. Summarize the
visible outcome, exact commits, test/coverage/build/browser/Lighthouse evidence,
live repository facts, and any non-blocking public GitHub rate-limit event.
