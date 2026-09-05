# Human Project Guide Implementation Plan

**Goal:** Make RepoScope explain queried projects through concrete evidence and readable interpretation.

**Architecture:** Extend existing bounded README extraction and derive richer presentation from the validated report without changing its wire schema. Update the optional expert prompt and evaluation version independently.

**Tech Stack:** React, TypeScript, Vitest, Playwright, existing GitHub evidence pipeline.

## Global constraints

- Preserve current source attribution, inert text rendering, score rules, privacy boundaries, and evidence caps.
- Use natural Chinese and English app copy; repository-authored text retains its original language.
- No new dependency, paid service, or access permission.
- Preserve unrelated user changes and finish through the existing CI and Pages workflow.

## Task 1 — Keep useful onboarding and feature information

Files: `src/features/analyzers/reader-report/readme-policy.ts`, `markdown.ts`, and adjacent tests.

- [x] Add common human-facing heading aliases and preserve onboarding prose in the existing workflow/dependencies fields.
- [x] Preserve supported table meaning with relevant column labels and bounded text.
- [x] Verify previously omitted prose, bilingual headings, ordinary tables, existing fixtures, and reader guards.

## Task 2 — Explain actual evidence in the reading interface

Files: `src/components/readme-interpretation.tsx`, new `reader-takeaways.tsx`, new `reader-takeaways-copy.ts`, adjacent component tests, `src/styles/app.css`.

- [x] Select concrete capability, workflow, architecture, and constraint evidence for four takeaways.
- [x] Show source text, explain its implication, and offer chapter anchors without reporting extraction counts as the substance.
- [x] Attach triggering source examples to commentary and keep missing evidence explicit.
- [x] Verify rich and sparse reports, bilingual copy, long content, source links, and reading navigation.

## Task 3 — Improve optional expert explanations

Files: `server/panel/prompts.ts`, prompt tests, `evals/deep-analysis`, version-aware script and server tests.

- [x] Specify role-specific concrete explanations and editor synthesis; preserve schemas and safety boundaries.
- [x] Increment prompt version and synchronize corpus/version expectations.
- [x] Verify the panel prompt envelope, cache/version separation, corpus checks, and server type checks.

## Task 4 — Verify and publish the coherent result

Files: bilingual READMEs, CHANGELOG and feature-dependent browser assertions.

- [x] Document user-visible changes and limitations.
- [x] Run lint, formatting, front/server tests, type checks, build and bundle gates; run existing desktop/mobile browser and performance checks.
- [x] Inspect rendered reports at desktop, tablet and mobile widths; address readability or overflow defects.
- [ ] Commit and push a focused PR; merge only after required checks pass, then verify main and Pages.
