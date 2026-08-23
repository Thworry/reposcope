# Static README Interpretation Depth Implementation Plan

> **Execution mode:** TDD with parallel, non-overlapping implementation slices;
> the user has pre-authorized the recommended default and does not require an
> intermediate design confirmation.

**Goal:** Make RepoScope's deterministic static report extract and explain the
capabilities, workflow, business situations, onboarding, broad architecture,
and evidence gaps found in real-world README structures.

**Architecture:** Extend the existing one-pass bounded Markdown scanner with
lookup-only heading normalization, frozen aliases, safe inline-code prose, and
context-aware command priority. Reuse the existing validated `ReaderReport`
shape to render localized reader takeaways, a compact evidence map, and restored
broad structure/scenario facts. Do not change scoring, API contracts, packages,
or the optional model layer.

**Tech stack:** TypeScript 6, React 19, Vitest 4, Testing Library, Playwright
1.62, Vite 8, plain CSS.

---

## Global constraints

- Keep the Markdown input limit at 256 KiB and preserve every existing cap.
- Keep extraction single-pass, deterministic, non-executing, and fail closed.
- Preserve URL, credential, control, bidi, malformed UTF, HTML, Markdown-link,
  proxy/accessor, path, cache, and source-link protections.
- Preserve the original safe display label while normalizing only lookup keys.
- Do not use fuzzy or substring heading classification.
- Do not add model calls, backend requirements, runtime repository requests,
  packages, score inputs, or named deterministic alternatives.
- Keep function metrics and entry-point detail in the technical appendix.
- Keep English and Simplified Chinese behavior and tests in parity.
- Keep the existing editorial paper/ink/cobalt system; no glass, gradient,
  animation library, decorative chart, or card flood.

## Task 1: Lock real-world heading and inline-prose behavior with failing tests

**Files:**

- Modify: `src/features/analyzers/reader-report/readme-policy.test.ts`
- Modify: `src/features/analyzers/reader-report/markdown.test.ts`

- [ ] Add table-driven heading lookup cases for emoji prefixes, numeric
      prefixes, trailing punctuation, NFKC forms, and target aliases including
      `项目简介`, `现在已经能做什么`, `典型使用路径`, `技术栈与架构`,
      `当前路线图`, and their English equivalents.
- [ ] Add negative cases proving substring-like headings such as "security
      research notes" remain unclassified.
- [ ] Add a short synthetic AI-writing-workbench README fixture with:
      emoji introduction; numbered capability groups; seven ordered workflow
      items containing safe inline UI labels; environment requirements; an
      incidental release version; explicit install and start headings; and a
      technical architecture section.
- [ ] Assert six bounded capability groups, seven ordered workflow items,
      useful dependency facts without the release number, architecture prose,
      and `pnpm dev` preferred over an incidental `pnpm dev:desktop` mention.
- [ ] Add adversarial inline-code cases for URLs, credential-like values,
      unbalanced runs, commands in prose, controls, bidi, malformed UTF, and
      overlong text.
- [ ] Run:

  ```bash
  pnpm vitest run src/features/analyzers/reader-report/readme-policy.test.ts \
    src/features/analyzers/reader-report/markdown.test.ts
  ```

  Expected: new assertions fail for the missing behavior before production
  changes.

## Task 2: Implement bounded README classification and command selection

**Files:**

- Modify: `src/features/analyzers/reader-report/readme-policy.ts`
- Modify: `src/features/analyzers/reader-report/markdown.ts`
- Modify: `src/features/analyzers/reader-report/readme-policy.test.ts`
- Modify: `src/features/analyzers/reader-report/markdown.test.ts`

- [ ] Export a pure heading lookup normalizer that performs NFKC, whitespace,
      decoration, one numeric marker, trailing punctuation, and stable-case
      cleanup while retaining exact alias lookup.
- [ ] Expand frozen heading families with common English and Chinese overview,
      capability, workflow, dependency, limitation, maturity, architecture,
      and security/privacy names.
- [ ] Route only strong audience/problem/use-case cues out of overview/fallback
      prose; preserve source text and category caps.
- [ ] Add a bounded inline-code flattener used only for safe profile prose.
      Keep command admission independent and reject unsafe originals before
      cleanup.
- [ ] Restrict inline runtime requirements to dependency/command contexts.
- [ ] Store a small internal command priority and replace an inherited command
      only when a later command appears under its matching explicit heading;
      preserve source order for equal priority.
- [ ] Re-run the focused parser tests until green.
- [ ] Run parser coverage and safety regressions:

  ```bash
  pnpm vitest run src/features/analyzers/reader-report/*.test.ts \
    src/features/analyzers/reader-report.test.ts
  ```

## Task 3: Restore business-scenario and broad-architecture evidence

**Files:**

- Modify: `src/components/reader-report.tsx`
- Modify: `src/components/reader-report.test.tsx`
- Modify: `src/features/analyzers/reader-report.ts`
- Modify: `src/features/analyzers/reader-report.test.ts`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`

- [ ] Add failing component tests proving the project-fit chapter shows unique
      business situations and observed project kinds without repeating the
      orientation excerpts.
- [ ] Add failing tests proving the architecture chapter shows architecture
      excerpts, documents, ecosystems, and top-level source areas when present,
      while omitting detailed entry points from the main report.
- [ ] Make the generic availability notice describe partial coverage rather
      than saying "not established" when safe evidence is already shown.
- [ ] Remove the duplicate evidence caption currently rendered for every
      signal.
- [ ] Count present and explicitly absent security signals as evaluated
      evidence when coverage is complete; do not imply that a negative result
      means the repository was not inspected.
- [ ] Add localized group labels and cautious broad-structure explanation.
- [ ] Render alternative-search terms as separate starting points instead of
      one overly strict `topic:a topic:b` AND query, and state clearly that the
      links are not verified recommendations.
- [ ] Run:

  ```bash
  pnpm vitest run src/components/reader-report.test.tsx \
    src/i18n/messages.test.ts
  ```

## Task 4: Add human reader takeaways and a non-repetitive evidence map

**Files:**

- Modify: `src/components/readme-interpretation.tsx`
- Modify: `src/components/readme-interpretation.test.tsx`
- Modify: `src/i18n/messages.ts`
- Modify: `src/i18n/messages.test.ts`

- [ ] Add failing English and Chinese tests for a four-item takeaway list:
      capability shape, typical workflow/onboarding, broad implementation
      outline, and risk/verification boundary.
- [ ] Derive takeaways only from validated report values and frozen labels.
      Use conservative templates and never rewrite README prose as verified
      fact.
- [ ] Replace the comparison's repeated raw-claim list with an evidence map
      containing category counts, capability labels, workflow count, and one
      grouped README source link.
- [ ] Preserve the repository-observation column and its project kind,
      ecosystem, and source-area evidence.
- [ ] Keep source text in the narrative/capability/workflow sections, but group
      repeated identical source links when every item has the same source.
- [ ] Keep semantic `section`, `h3`/`h4`, `dl`, `ul`, and `ol` structure and
      ensure language switching recomputes no analysis and performs no fetch.
- [ ] Run:

  ```bash
  pnpm vitest run src/components/readme-interpretation.test.tsx \
    src/components/reader-report.test.tsx src/i18n/messages.test.ts
  ```

## Task 5: Refine long-report hierarchy without changing the art direction

**Files:**

- Modify: `src/styles/app.css`
- Modify: `src/components/readme-interpretation.test.tsx`
- Modify: `e2e/reposcope.spec.ts` only if an observable product contract needs
  updating

- [ ] Style takeaways as a numbered editorial digest with one cobalt margin
      rule, not a card grid.
- [ ] Keep capability labels easy to scan and source captions visually quieter
      than authored facts.
- [ ] Make the evidence map and broad-architecture lists collapse to one column
      below 48rem and preserve the 72ch reading measure.
- [ ] Verify headings, long CJK, long paths, code, count labels, and source links
      wrap without clipping at 375px, 768px, 1024px, and 1366px.
- [ ] Verify focus visibility, 44px targets, keyboard order, semantic headings,
      reduced motion, and 200%-equivalent reflow.

## Task 6: Verify against the target README and the full local gate

**Files:**

- Modify production/tests only for defects found by verification.

- [ ] Run the extractor locally against the publicly fetched target README and
      inspect only category labels/counts, not copied full content. Confirm:
      capabilities > 0; workflow = 7; architecture > 0; the install command is
      `pnpm install`; the run command is `pnpm dev`; and release `0.4.13` is not
      a dependency.
- [ ] Run focused tests, then:

  ```bash
  pnpm check
  pnpm test:coverage
  pnpm check:bundle
  pnpm test:e2e
  pnpm check:lighthouse
  pnpm audit --prod --audit-level high
  git diff --check
  ```

- [ ] Rebuild the default-root preview after any E2E base-path build.
- [ ] Inspect the real target report in the in-app browser at desktop and mobile
      widths and capture console/page errors and overflow measurements.
- [ ] Read the website quality-gate checklist and address every applicable item
      before handoff.

## Task 7: Commit, push, and follow CI

**Files:**

- Update the open PR body only if the validation/scope summary changes.

- [ ] Commit parser, report synthesis, UI, and verification changes in coherent
      slices without rewriting existing user history.
- [ ] Push `codex/readme-first-project-interpretation`.
- [ ] Update PR #4 with the new static-depth behavior and latest validation.
- [ ] Watch GitHub Actions to completion; inspect and fix any in-scope failure.
- [ ] Leave the local preview at the normal root path and report any honest
      remaining limitation (for example unavailable Docker CLI or model token).
