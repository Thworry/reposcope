# RepoScope v0.1.1 Maintainability Design

**Date:** 2026-08-12

**Status:** Approved for implementation planning

**Target release:** `v0.1.1`

## Objective

Improve RepoScope's real maintainability without changing ruleset `1.0.0`, analysis semantics, report structure, score calculations, evidence order, security boundaries, or resource limits. A higher self-score is acceptable only when it follows from genuine documentation improvements; it is not a reason to change analysis behavior.

The work addresses five findings from RepoScope's first live self-analysis:

1. document installation and local use more clearly;
2. provide a concrete end-to-end usage example;
3. split very large analyzer files into coherent modules;
4. reduce maintainability risk from deeply nested implementation paths without changing their decisions; and
5. document stable cross-module APIs and version history.

## Non-goals

- No ruleset version change, new rule, threshold change, scoring change, or report-schema change.
- No parser, heuristic, duplicate-matching, import-resolution, or Python control-flow redesign.
- No new public runtime API or widened export surface.
- No new network endpoint, backend, token, login, analytics, AI service, persistence, or code execution.
- No aesthetic redesign or new product feature.
- No snapshot updates used to legitimize changed output.

## Public compatibility contract

The following entry points retain their current signatures and results:

- `analyzePython(...)`
- `computeDuplicateRatio(...)`
- `findCircularImports(...)`

For the same normalized inputs, the refactor must preserve every output field, array order, failure classification, file reference, token count, metric, score, confidence value, and finding severity. Ruleset `1.0.0` remains the only ruleset. Existing worker messages, cache payloads, report guards, bilingual copy keys, share URLs, and immutable evidence links remain compatible.

## Module architecture

### Python analyzer

`src/features/analyzers/python.ts` becomes a thin facade that filters and sorts files, isolates syntax failures, invokes internal analysis stages, and assembles `LanguageAnalysis`. Its stable implementation responsibilities move into `src/features/analyzers/python/`:

- `model.ts` — internal syntax-node, lexical-owner, metric-entry, and flow-result types;
- `syntax.ts` — Lezer parsing, iterative cursor flattening, source slicing, ECMAScript-independent Python line lookup, and logical-line ranges;
- `function-metrics.ts` — function discovery, cyclomatic complexity, nesting, logical lines, locations, and error-handling evidence;
- `bindings.ts` — assignment, target, parameter, import, comprehension, lexical-owner, and ambiguous-identifier accounting;
- `binding-flow.ts` — bounded module-level definite-binding flow across conditions, loops, `match`, `with`, exceptions, `finally`, and abrupt completions;
- `evidence.ts` — docstrings, public declarations, relative imports and candidates, top-level defined names, and normalized duplication tokens; and
- `analyze-file.ts` — per-file orchestration, including `.pyi` resolution-only behavior.

Dependencies flow from internal models and syntax helpers upward into evidence and orchestration. Lower layers never import the facade. The control-flow interpreter remains iterative or explicitly depth-bounded; extraction must not introduce recursive traversal where none existed.

### Cross-file analyzer

`src/features/analyzers/cross-file.ts` remains the facade for its two exported functions. Internals move into `src/features/analyzers/cross-file/`:

- `model.ts` — private duplicate-candidate, source, radix, occurrence, and graph types;
- `path-order.ts` — case-insensitive POSIX comparison and deterministic raw-path tie-breaking;
- `duplicate-index.ts` — token hashes, rolling windows, collision verification, exact grouping, and whole-file/period recognition;
- `duplicate-candidates.ts` — periodic, arithmetic, radix/LCP, and lazy candidate sources;
- `duplicate-selection.ts` — frozen global comparator, occupancy-aware non-overlap selection, duplicated-token union, and bounded evidence summaries;
- `import-resolution.ts` — JS/TS extension/index resolution and Python module/package/candidate qualification; and
- `scc.ts` — iterative graph traversal and deterministic strongly connected components.

The split must preserve lazy source topology and all existing structural operation budgets. It must not reintroduce file-pair candidate materialization or recursive graph traversal.

### Boundary rules

- Internal modules export only what the facade or a sibling stage needs.
- Private shared types stay under each analyzer directory and do not enter `features/analysis/model.ts` unless already public there.
- Modules must be cohesive rather than artificially small. A helper stays local when it has one caller and no independent invariant.
- Cyclic imports are prohibited. The intended direction is model/path/syntax → algorithm stages → per-file/facade orchestration.
- Existing dynamic imports continue targeting the facades, so the JS/TS and Python analyzer chunks remain separate and parsers remain absent from the initial bundle.

## Migration strategy

The refactor uses behavior-preserving extraction, not algorithm rewriting:

1. Freeze representative Python and cross-file outputs with exact deep-equality tests before moving code.
2. Extract one cohesive responsibility at a time without changing expressions, condition order, sorting, or iteration order.
3. Run its focused tests after every extraction.
4. Run the full analyzer suites after each facade is thinned.
5. Revert or shrink any extraction that changes output, performance instrumentation, or failure behavior.

Potential algorithm defects discovered during extraction are recorded separately. They are not fixed in this release unless they are required to preserve existing behavior or security, in which case they need a separately approved design change.

## Nesting reduction

Nesting is reduced only through semantics-preserving structure:

- name guard predicates and early-exit conditions;
- extract state transitions whose inputs and outputs can be explicit;
- replace nested dispatch blocks with small, ordered dispatch functions when the current ordering is retained; and
- keep complex state machines explicit rather than compressing them into clever generic abstractions.

The objective is easier local reasoning, not a particular self-score. Branch ordering, conservative joins, exception prefixes, abrupt completion overrides, candidate ordering, and occupancy pruning remain unchanged.

## Documentation changes

### README files

`README.md` and `README.zh-CN.md` remain paragraph-level equivalents and reciprocal language links. They gain:

- a clear distinction between using the hosted site, which requires no installation, and contributor setup, which requires Node.js 24.x and pnpm 11.16.0;
- an installation/local-run sequence with frozen dependency installation and the local URL;
- a concrete, non-normative walkthrough from a public repository URL to score, confidence, six dimensions, scope, improvements, and immutable evidence links;
- an explicit reminder that example scores vary with the pinned public commit and ruleset; and
- a link to the version history.

The walkthrough must not claim that RepoScope executed code, verified functionality, measured runtime coverage, found vulnerabilities, or certified safety.

### Version history

Add `CHANGELOG.md` using a compact Keep a Changelog-style structure:

- an empty `Unreleased` section that remains available for later work;
- a dated `0.1.1` section in the final candidate commit, describing modular analyzer internals, API documentation, and README improvements without claiming scoring changes; and
- `0.1.0`, recording the initial bilingual browser-side release.

Repository contract tests require the changelog and exact current version heading.

### Architecture

`docs/architecture.md` gains the analyzer module tree, dependency direction, facade compatibility rule, and extraction invariants. Existing endpoint, CSP, cache, limit, and threat-boundary documentation remains unchanged.

### API documentation

Add useful TSDoc to stable cross-module entry points and public data contracts, focusing on:

- accepted inputs and canonicalization;
- outputs and deterministic ordering;
- error, cancellation, and partial-result behavior;
- resource limits and whether raw repository text is retained; and
- the guarantee that project code is treated as text and never executed.

Priority targets include repository URL parsing, GitHub snapshot/raw acquisition, tree normalization and selection, the three analyzer facades, scoring/confidence/findings, worker execution, cache access, and `AnalysisReport`-level models. Internal one-line helpers do not receive filler comments, and no internal symbol becomes public merely to increase documentation coverage.

## Testing strategy

### Exact behavior tests

- Existing Python analyzer fixtures must remain byte-for-byte and field-for-field equal.
- Existing duplicate and cycle fixtures, brute-force comparisons, collision cases, periodic streams, high-fanout groups, and operation budgets remain unchanged.
- Add facade parity fixtures covering `.py`, `.pyi`, syntax failures, f-strings, lexical scopes, exceptional flow, duplicate evidence, import candidates, and SCC ordering.
- Add import-boundary tests that fail on cycles between facade and internal modules.
- Keep public export-surface checks so extraction cannot leak new runtime APIs.

### Repository contract tests

Update `src/repository-files.test.ts` to require:

- `CHANGELOG.md` with exact `Unreleased`, `0.1.1`, and `0.1.0` headings in the final candidate;
- equivalent English and Chinese installation and walkthrough sections;
- the documented analyzer module tree; and
- unchanged ruleset, limits, CSP, privacy, and threat-boundary contracts.

### Full gates

Before publishing:

1. `pnpm format`
2. `pnpm lint`
3. `pnpm format:check`
4. `pnpm test:coverage`
5. `pnpm build`
6. `pnpm check:bundle`
7. `pnpm exec playwright test` — all 20 desktop/mobile scenarios
8. `pnpm check:lighthouse` — three runs, all four categories at or above the frozen threshold

Coverage floors, bundle budgets, request limits, and Lighthouse assertions may not be lowered. The production manifest must still contain independent worker, JS/TS, and Python chunks, with no parser payload in the initial application graph.

## Live compatibility acceptance

After CI and Pages deploy the candidate commit, use a clean browser session to analyze:

1. `Thworry/reposcope`; and
2. one supported public fixture repository.

Verify exactly three REST calls per fresh scan, immutable commit-pinned raw URLs, bounded raw attempts, progress/cancellation, score/dimensions/confidence, bilingual switching without network, share query, immutable file links, strict CSP, mobile keyboard focus, and no console warnings or errors.

For a fixed release commit analyzed before and after the refactor under ruleset `1.0.0`, core analysis results must match. Documentation-derived rules may improve only when the candidate commit genuinely contains the new installation, example, API, or version-history evidence. Such changes must be called out explicitly rather than treated as analyzer compatibility changes.

## Release process

Implementation occurs on `codex/reposcope-maintainability-v011` in intentional, non-amended commits. After independent specification and quality reviews pass:

1. merge or fast-forward the approved commits to `main` without rewriting published history;
2. push and wait for hosted CI and Pages deployment success;
3. perform the clean live compatibility acceptance;
4. verify that the accepted commit already contains the dated `0.1.1` changelog entry;
5. create annotated tag `v0.1.1` on that accepted `main` commit; and
6. publish a non-draft, non-prerelease GitHub release.

If hosted behavior differs, fix it in a new reviewed commit. Do not blindly rerun workflows, force-push, lower gates, or tag before the live acceptance passes.

## Success criteria

- The two large facades become understandable orchestration files backed by cohesive internal modules.
- No public API, report-schema, ruleset, score algorithm, evidence order, failure semantics, limit, CSP, or network boundary changes.
- All existing and new parity/performance tests pass.
- English and Chinese documentation are equivalent and give a real local installation path and concrete usage walkthrough.
- Stable cross-module APIs have useful TSDoc without widening the export surface.
- `CHANGELOG.md` accurately records `0.1.0` and `0.1.1`.
- Local and hosted gates pass without threshold changes.
- Live self-analysis and the supported fixture behave correctly.
- GitHub Pages serves the accepted commit and `v0.1.1` resolves publicly.
