# Chinese Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RepoScope's Simplified Chinese interface and reports read like native Chinese product writing while preserving repository source text and every existing evidence boundary.

**Architecture:** Keep the existing bilingual message table and deterministic report model. Rewrite only RepoScope-authored Chinese, replace component-level English punctuation and fixed-order sentence assembly with localized templates, and strengthen the optional expert prompt so new Chinese briefings use natural zh-CN; bump the prompt version so stale generated copy is not reused.

**Tech Stack:** TypeScript 6, React 19, Vitest 4, Testing Library, Playwright 1.62, Vite 8, GitHub Copilot SDK prompt pipeline.

## Global Constraints

- Preserve README excerpts, repository descriptions, project names, code, commands, paths, versions, and other repository-authored text byte-for-byte after existing safety normalization.
- Do not add facts, translate repository claims, change scores, alter analysis rules, or change GitHub metadata calculations.
- Keep English and `zh-CN` message keys exhaustive and keep placeholder names identical across both languages.
- Prefer natural Mainland Simplified Chinese, short active sentences, familiar words, and Chinese punctuation.
- Keep common developer terms as README, Star, Watch, Fork, Issue, PR, CI, API, CLI, RAG, TypeScript, and GitHub Copilot.
- RepoScope-authored Chinese must not contain em dashes or en dashes.
- Omit unavailable summary fragments instead of displaying zero-count or `无法确认` filler inside fixed English sentence shapes.
- Preserve the fixed unknown prefix `现有证据无法确认` and all existing expert-output security guards.
- Do not add dependencies or change `pnpm-lock.yaml`.

---

## File and responsibility map

- `src/i18n/messages.ts` owns all localized static copy and full-sentence formatting templates.
- `src/i18n/messages.test.ts` owns bilingual parity, placeholder parity, critical Chinese copy, terminology, and punctuation contracts.
- `src/components/readme-interpretation.tsx` owns dynamic README-summary composition and community accessible labels.
- `src/components/reader-report.tsx` owns localized signal-state and alternative-search sentences.
- `src/components/methodology.tsx` owns localized weight rows.
- `src/components/expert-evidence.tsx` owns client-visible evidence-source labels by language.
- `src/components/expert-report.tsx` owns localized missing-value display.
- Component test files own complete Chinese sentence and source-text-preservation assertions.
- `server/panel/prompts.ts` owns native-zh-CN generation guidance and prompt cache versioning.
- `server/panel/prompts.test.ts` owns the Chinese prompt contract.
- `e2e/fixtures/deep-report.ts` contains model-authored fixture prose and may be rewritten; repository-source fixtures may not.
- `README.zh-CN.md`, `docs/methodology.md`, and `CHANGELOG.md` describe the public Chinese contract.
- `e2e/reposcope.spec.ts` owns end-to-end Chinese reading-path acceptance.

---

### Task 1: Rewrite and lock the Chinese message contract

**Files:**

- Modify: `src/i18n/messages.test.ts`
- Modify: `src/i18n/messages.ts`

**Interfaces:**

- Consumes: existing `baseEn`, `baseZh`, `formatMessage`, and rule-message expansion.
- Produces: natural Chinese values for every existing key plus these new bilingual keys: `readerCommunityFactAccessible`, `readerSignalStateSummary`, `readerAlternativeSearchTerm`, `methodologyWeightItem`, `readerTakeawayBoundary`, `readerTakeawayArchitectureKinds`, `readerTakeawayArchitectureEcosystems`, `readerTakeawayArchitectureAreas`, `readerTakeawayRiskLicense`, `readerTakeawayRiskSecurity`, `readerTakeawayRiskConfiguration`, `deepValueUnavailable`, `deepEvidenceGithub`, `deepEvidenceReadme`, `deepEvidenceDocumentation`, `deepEvidenceManifest`, `deepEvidenceTree`, and `deepEvidenceAlternative`.

- [ ] **Step 1: Add failing native-Chinese contract tests**

Add placeholder parity and critical-copy checks:

```ts
const placeholders = (value: string) =>
  [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)]
    .map((match) => match[1])
    .sort();

for (const key of Object.keys(messages.en) as Array<keyof typeof messages.en>) {
  expect(placeholders(messages["zh-CN"][key])).toEqual(
    placeholders(messages.en[key]),
  );
}

expect(messages["zh-CN"]).toMatchObject({
  heroTitle: "先看懂一个公开项目，再决定要不要用。",
  readerDecisionHeading: "是否值得继续了解",
  readerTakeawayCapabilitiesHeading: "主要功能",
  readerTakeawayWorkflowHeading: "怎么使用",
  readerTakeawayArchitectureHeading: "代码大致怎么组织",
  readerTakeawayRiskHeading: "使用前还要确认",
  readerCommunityStars: "Star 数",
  readerCommunityWatch: "Watch 数",
  readerCommunityForks: "Fork 数",
  readerCommunityOpenIssues: "未关闭的 Issue 和 PR",
});
```

Join the high-frequency reader-path values and assert they do not contain `证据档案`, `能力轮廓`, `实现轮廓`, `采用边界`, `宽泛`, `有边界`, `UTC 日`, `安全文本边界`, `确定性分析`, `Forks（派生）`, `—`, or `–`.

- [ ] **Step 2: Run the message test and record RED**

Run:

```bash
pnpm exec vitest run src/i18n/messages.test.ts
```

Expected: failures on the old translated copy and absent formatting/evidence keys.

- [ ] **Step 3: Rewrite the primary reading path**

Rewrite landing, form, progress, report header, README interpretation, decision, fit, reliability, architecture, onboarding, security, maintenance, alternatives, error, methodology, and expert-mode Chinese copy according to the design. Use the following terminology consistently:

```text
公开项目解读
先看结论
当前判断
判断依据
RepoScope 规则分析
已找到 / 未找到 / 暂时无法确认
距今 {days} 天
Star 数 / Watch 数 / Fork 数
未关闭的 Issue 和 PR
```

Replace `readerTakeawayWorkflow`, `readerTakeawayArchitecture`, and `readerTakeawayRisk` placeholders with `{details}` in both languages. Add the listed detail and full-sentence formatting keys with identical placeholders.

- [ ] **Step 4: Naturalize secondary and technical copy**

Rewrite obvious field-dump and word-for-word translations in the optional technical appendix, especially `是否存在：是`, `供应商/生成路径`, `证据浏览器`, and the circular-import/error-handling recommendations. Preserve every threshold and measurement.

- [ ] **Step 5: Run the focused contract and formatting checks**

Run:

```bash
pnpm exec vitest run src/i18n/messages.test.ts
pnpm exec prettier --check src/i18n/messages.ts src/i18n/messages.test.ts
pnpm exec eslint src/i18n/messages.ts src/i18n/messages.test.ts --max-warnings 0
```

Expected: all pass.

- [ ] **Step 6: Commit the message layer**

```bash
git add src/i18n/messages.ts src/i18n/messages.test.ts
git commit -m "feat: rewrite Simplified Chinese product copy"
```

---

### Task 2: Replace English sentence assembly in React components

**Files:**

- Modify: `src/components/readme-interpretation.test.tsx`
- Modify: `src/components/readme-interpretation.tsx`
- Modify: `src/components/reader-report.test.tsx`
- Modify: `src/components/reader-report.tsx`
- Modify: `src/components/methodology.test.tsx`
- Modify: `src/components/methodology.tsx`
- Modify: `src/components/expert-report.test.tsx`
- Modify: `src/components/expert-report.tsx`
- Modify: `src/components/expert-evidence.tsx`

**Interfaces:**

- Consumes: the new message keys from Task 1 and unchanged `AnalysisReport` / `DeepReport` models.
- Produces: complete localized sentences, omission of absent summary fragments, localized evidence labels, and unchanged rendering of repository-authored facts.

- [ ] **Step 1: Add failing dynamic-summary tests**

Create Chinese cases where only one architecture dimension exists and where workflow steps or commands are zero. Assert the rendered text contains the available detail and excludes `0 个`, `无法确认、`, and `无法确认，并有`.

Add a source-preservation assertion:

```ts
expect(screen.getByText("Source-language scenario — 原文场景。")).toBeVisible();
```

The repository-authored fixture retains its original punctuation; only RepoScope-authored copy is subject to the no-dash rule.

- [ ] **Step 2: Add failing full-sentence localization tests**

Assert these complete Chinese results:

```text
Star 数：1,284
安装说明：已找到
在 GitHub 搜索：novel writing assistant
文档与上手体验：15
暂无数据
README 原文
```

Also assert the Chinese signal list, search link, weight rows, expert evidence labels, and expert missing values contain no hard-coded em dash or English source label.

- [ ] **Step 3: Run component tests and record RED**

Run:

```bash
pnpm exec vitest run \
  src/components/readme-interpretation.test.tsx \
  src/components/reader-report.test.tsx \
  src/components/methodology.test.tsx \
  src/components/expert-report.test.tsx
```

Expected: failures on fixed-order templates, hard-coded punctuation, and English evidence labels.

- [ ] **Step 4: Implement detail-based takeaways**

Build arrays only from present values, localize each detail through Task 1 keys, join them with `Intl.ListFormat`, and pass one `{details}` value to the summary template. Do not add zero-count details. Render `readerTakeawayBoundary` once after the four-item list.

- [ ] **Step 5: Implement localized complete sentences**

Use `formatMessage` for community accessible names, signal states, alternative search, and methodology weights. In `ExpertEvidence`, use `kind` plus `path` to choose a localized label when language is `zh-CN`; keep the existing source label in English. Replace expert null-value `—` with `deepValueUnavailable`.

- [ ] **Step 6: Run component and accessibility regressions**

Run:

```bash
pnpm exec vitest run \
  src/components/readme-interpretation.test.tsx \
  src/components/reader-report.test.tsx \
  src/components/methodology.test.tsx \
  src/components/expert-report.test.tsx \
  src/components/expert-analysis-control.test.tsx \
  src/components/expert-progress.test.tsx
```

Expected: all pass and repository-source fixtures remain unchanged.

- [ ] **Step 7: Commit component localization**

```bash
git add src/components
git commit -m "feat: compose reports in native Chinese"
```

---

### Task 3: Make generated expert briefings use native Chinese

**Files:**

- Modify: `server/panel/prompts.test.ts`
- Modify: `server/panel/prompts.ts`
- Modify: `e2e/fixtures/deep-report.ts`
- Modify: `src/components/expert-analysis-control.test.tsx`
- Modify: `src/components/expert-progress.test.tsx`
- Modify: `src/components/expert-report.test.tsx`

**Interfaces:**

- Consumes: existing guarded panel schema and fixed unknown prefix.
- Produces: `PANEL_PROMPT_VERSION = "1.1.0"` and a zh-CN instruction that requests native Chinese without relaxing evidence or safety constraints.

- [ ] **Step 1: Add failing prompt-version and Chinese-style tests**

Assert:

```ts
expect(PANEL_PROMPT_VERSION).toBe("1.1.0");
expect(prompt.system).toContain("natural Mainland Simplified Chinese");
expect(prompt.system).toContain(
  "Do not translate English sentence structure word for word",
);
expect(prompt.system).toContain("现有证据无法确认");
expect(prompt.system).toContain("README, Star, Watch, Fork, Issue, PR");
```

Keep every existing prompt-boundary and schema assertion.

- [ ] **Step 2: Run the prompt suite and record RED**

Run:

```bash
pnpm exec vitest run --config vitest.server.config.ts server/panel/prompts.test.ts
```

Expected: version and style-guidance assertions fail.

- [ ] **Step 3: Strengthen the zh-CN instruction and invalidate old cache entries**

Set the prompt version to `1.1.0`. Require natural Chinese order, short active sentences, standard technical terms, no marketing tone or noun stacks, no repeated boilerplate, and exact preservation of project names, identifiers, commands, paths, and quoted repository text. Preserve the fixed unknown sentence rule unchanged.

- [ ] **Step 4: Rewrite model-authored Chinese fixtures and expert UI assertions**

Rewrite only the generated Chinese statements in `e2e/fixtures/deep-report.ts`. Do not translate its evidence source payloads or repository-authored fixture text. Add Chinese assertions for authorization copy, progress stages, chapter names, community labels, missing values, and evidence links.

- [ ] **Step 5: Run expert-mode tests**

Run:

```bash
pnpm exec vitest run --config vitest.server.config.ts \
  server/panel/prompts.test.ts \
  server/panel/guards.test.ts \
  server/panel/orchestrator.test.ts
pnpm exec vitest run \
  src/components/expert-analysis-control.test.tsx \
  src/components/expert-progress.test.tsx \
  src/components/expert-report.test.tsx
```

Expected: all pass; guard behavior and unknown prefix remain unchanged.

- [ ] **Step 6: Commit expert localization**

```bash
git add server/panel/prompts.ts server/panel/prompts.test.ts e2e/fixtures/deep-report.ts src/components
git commit -m "feat: guide expert briefings toward native Chinese"
```

---

### Task 4: Synchronize public Chinese documentation and end-to-end contracts

**Files:**

- Modify: `README.zh-CN.md`
- Modify: `docs/methodology.md`
- Modify: `CHANGELOG.md`
- Modify: `src/repository-files.test.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/components/repository-form.test.tsx`
- Modify: `src/components/scan-progress.test.tsx`
- Modify: `src/components/error-panel.test.tsx`
- Modify: `e2e/reposcope.spec.ts`

**Interfaces:**

- Consumes: the final message and heading vocabulary from Tasks 1–3.
- Produces: one matching public Chinese vocabulary across product, docs, unit tests, and browser acceptance.

- [ ] **Step 1: Update document-contract tests first**

Change expected Chinese headings to the new reader vocabulary. Add assertions that `README.zh-CN.md` explains that repository source text is preserved and that RepoScope-authored Chinese is localized rather than generated through runtime translation. Correct the changelog's obsolete seven-region wording to eight regions.

- [ ] **Step 2: Rewrite the public Chinese documentation**

Remove `证据档案`, `有界`, `宽泛`, `采用边界`, and other internal implementation terms from the reader-facing sections. Keep numerical limits, safety promises, privacy boundaries, and methodology facts unchanged. In `docs/methodology.md`, replace reader-facing `UTC 日` wording with natural day ranges while retaining the exact UTC calculation rule.

- [ ] **Step 3: Update browser-contract locators and assertions**

Update `CHINESE_READER_HEADINGS`, Chinese landing/form/progress/error locators, expert chapter headings, and technical appendix heading. Add one Chinese flow assertion that covers the conclusion, Star/Watch/Fork data, README explanation, maintenance date, source label, and a natural empty state.

- [ ] **Step 4: Run public-contract and desktop E2E tests**

Run:

```bash
pnpm exec vitest run \
  src/repository-files.test.ts \
  src/App.test.tsx \
  src/components/repository-form.test.tsx \
  src/components/scan-progress.test.tsx \
  src/components/error-panel.test.tsx
pnpm exec playwright test e2e/reposcope.spec.ts --project=desktop-chromium
```

Expected: all pass.

- [ ] **Step 5: Commit docs and browser contract**

```bash
git add README.zh-CN.md docs/methodology.md CHANGELOG.md src/repository-files.test.ts src/App.test.tsx src/components e2e
git commit -m "docs: align Chinese product language"
```

---

### Task 5: Full verification, live review, and publication

**Files:**

- Verify only unless a failing check identifies an in-scope correction.

**Interfaces:**

- Consumes: the integrated branch.
- Produces: a clean commit series, green repository gates, visually accepted Chinese reports, and a GitHub Pages deployment.

- [ ] **Step 1: Run static and full test gates**

Run:

```bash
pnpm lint
pnpm format:check
pnpm test
pnpm test:server
pnpm typecheck:server
pnpm check:deep-analysis-eval
pnpm build
pnpm check:bundle
git diff --check
```

Expected: all pass and `pnpm-lock.yaml` is unchanged.

- [ ] **Step 2: Run the browser matrix**

Run desktop and mobile Playwright projects. Verify Chinese at 390, 768, and 1440 pixel widths, keyboard focus, no horizontal overflow, no console errors, and unchanged README source-language excerpts.

- [ ] **Step 3: Humanizer self-review**

Read every changed RepoScope-authored Chinese string aloud. Remove remaining noun stacks, field-dump phrasing, repeated disclaimer rhythm, marketing language, and em/en dashes. Confirm no fact, number, date, or source was invented.

- [ ] **Step 4: Push, open a PR, merge after green checks, and monitor Pages**

Push `codex/chinese-localization-pass`, open one PR to `main`, wait for CI, merge the exact reviewed head, and wait for the GitHub Pages deployment tied to the merge commit.

- [ ] **Step 5: Verify the public report**

Open the public AI-Novel-Writing-Assistant report in Chinese, confirm live Star/Watch/Fork values, all eight navigation links, natural headings and summaries, localized evidence labels, no console errors, and zero horizontal overflow. Keep the accepted page open for the user.
