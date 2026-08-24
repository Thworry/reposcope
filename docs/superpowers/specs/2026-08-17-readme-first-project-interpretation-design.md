# README-first Project Interpretation Design

Date: 2026-08-17
Status: Approved design, pending final user review

## Goal

RepoScope should read an unfamiliar repository's README carefully enough to
give a person a useful project introduction, not merely a checklist of detected
files and rules. The primary report should explain:

1. what the project says it is and which problem it addresses;
2. who it is for and which practical situations it describes;
3. which capabilities and workflow the README presents;
4. what installation, runtime, model, service, and credential dependencies the
   README declares;
5. what the README suggests about limitations and maturity;
6. what remains unclear and what that means for someone evaluating the project.

The report remains fully local, deterministic, bounded, and non-scoring. It
does not call an AI service, upload repository content, execute project code, or
turn repository claims into verified facts.

## Product decision

Make the README the narrative spine of the human-readable report. Add a
bounded README interpretation value to the existing reader report, then render
it as a hybrid editorial-and-data dossier:

- an evidence-backed one-sentence orientation;
- a compact community and maintenance fact strip;
- a multi-paragraph README interpretation;
- grouped capabilities and a documented-workflow visualization;
- a README-claim versus repository-observation comparison;
- short, localized RepoScope commentary covering strengths, gaps, and practical
  implications;
- the existing six evidence chapters and closed technical appendix.

Code structure becomes corroborating context only. The main report should
roughly establish the product shape, technology family, and major top-level
areas. Deep entry-point lists, function metrics, rule output, and detailed file
analysis remain in the technical appendix.

## Alternatives considered

### Expand the existing heading whitelist

Adding more recognized headings is inexpensive, but it still produces sparse
reports for non-standard READMEs and does not create a coherent explanation.
It is retained as one part of the extractor, not as the whole design.

### Rank arbitrary README paragraphs

Ranking every visible paragraph gives broader coverage, but it can elevate
marketing copy, table-of-contents entries, badges, changelog fragments, or
incidental prose. A narrowly bounded ranking fallback is useful only when no
recognized section exists.

### Build a README evidence map with a bounded fallback — selected

Perform one section-aware scan over the preferred README, organize safe prose
into a frozen evidence model, and use deterministic localized templates to
explain it. Use a conservative paragraph-ranking fallback only for the project
orientation when section structure is absent. This provides more depth while
preserving privacy, traceability, repeatability, and the no-AI-service promise.

## Information architecture

### Repository orientation

The report begins with repository identity and an evidence-backed orientation.
The orientation combines at most four safe facts from the GitHub description,
README overview, stated audience, and stated problem. Repository prose remains
in its original language; localized connective copy identifies it as a
repository claim.

### Community and maintenance fact strip

Display these GitHub facts in one ruled row:

- stars from `stargazers_count`;
- watches from `subscribers_count`;
- forks from `forks_count`;
- open issues from `open_issues_count`;
- last push and recognized license.

Use `subscribers_count`, not GitHub's historical `watchers_count` alias, for
the user-facing Watch value. Counts are nonnegative safe integers. Compact
number formatting is localized, while the exact integer remains available to
assistive technology. Popularity facts never affect reliability, score,
confidence, strengths, or weaknesses. The UI states that community activity is
not proof of quality or safety.

### README interpretation

The main narrative presents these subsections in order:

1. **What the README says this project is** — two to four short evidence-backed
   paragraphs.
2. **Who it is for and which problem it addresses** — stated audiences,
   problems, and use cases.
3. **Core capabilities** — grouped using the README's own section labels rather
   than an invented universal taxonomy.
4. **How the documented workflow proceeds** — up to eight ordered steps.
5. **Requirements and external dependencies** — runtime prerequisites, model
   providers, services, storage, environment variables, or credentials, without
   copying values.
6. **Limitations and maturity** — explicit warnings, known issues, roadmap,
   preview/beta status, migration notes, and release expectations.
7. **What is not established** — evidence gaps that matter to installation,
   deployment, security, privacy, or further development.

### RepoScope commentary

Commentary is shown in three ruled groups:

- **Worth noting** — strong or unusually complete README evidence;
- **Verify before relying on it** — missing, partial, conflicting, or
  repository-claimed-only evidence;
- **What this means in practice** — bounded implications for trying, deploying,
  or extending the project.

Commentary is generated from frozen identifiers and localized templates, not
stored as unconstrained prose. A commentary item references the evidence group
or signal that caused it. Templates use disciplined language:

- **Repository states** for README claims;
- **Repository structure shows** for manifest or tree observations;
- **This suggests** for a limited interpretation;
- **The scanned evidence does not establish** for gaps.

The UI never says that a README claim is implemented, correct, safe,
production-ready, or suitable for the user's private requirements.

### Six chapters and technical appendix

Keep the existing six chapters, but let README evidence supply their opening
explanation. Rename the architecture reading emphasis to **How it broadly
works** in localized copy. The main architecture content is README concepts and
workflow; code-tree evidence is limited to product shape, ecosystems, and major
top-level areas.

Detailed entry points, function metrics, rule identifiers, scoring evidence,
and long file lists remain in the closed-by-default technical appendix.

## Evidence model

Extend `ReaderReport` with two required, strictly validated structures.

### Community facts

Conceptually:

```text
community:
  stars: nonnegative safe integer
  watchers: nonnegative safe integer
  forks: nonnegative safe integer
```

Open issues, activity, and license remain in their existing canonical
locations. The UI composes the fact strip without duplicating score inputs.

### README profile

Conceptually:

```text
readme:
  availability: available | partial | unavailable
  overview: ReaderTextFact[0..4]
  audiences: ReaderTextFact[0..4]
  problems: ReaderTextFact[0..4]
  useCases: ReaderTextFact[0..4]
  capabilityGroups: ReaderEvidenceGroup[0..6]
  workflow: ReaderTextFact[0..8]
  dependencies: ReaderTextFact[0..8]
  limitations: ReaderTextFact[0..6]
  maturity: ReaderTextFact[0..6]
  commentary: ReaderCommentaryId[0..8]
```

A capability group has one safe README-authored label and up to six safe text
facts. Group labels and facts share the existing code-point, credential,
control-character, bidi, malformed-UTF, source, path, and duplicate boundaries.
Commentary identifiers use a frozen vocabulary and canonical order.

The project-purpose evidence remains the canonical short statement and is
deduplicated from README-profile evidence. Old cache entries fail closed after
the required shape changes. The strict guard rejects unknown keys, sparse
arrays, invalid counts, invalid order, duplicate normalized text, inconsistent
availability, unsafe strings, cycles, proxies, and noncanonical source/path
pairings.

## README extraction

### One bounded scan

Extend the current safe Markdown scanner rather than adding a second parser.
Scan only the preferred fetched README, once, under the existing 256 KiB input
limit. Preserve the existing fail-closed handling of HTML blocks and comments,
fences, inline code, link destinations, raw URLs, controls, malformed UTF,
credentials, and pathological Markdown.

Recognize frozen English and Chinese heading families for:

- overview and introduction;
- audience, use cases, and problems;
- features and capabilities;
- workflow, how it works, and core concepts;
- requirements, installation, deployment, providers, integrations, and
  configuration;
- limitations, known issues, roadmap, status, migration, security, privacy,
  and data handling.

Within recognized sections, admit meaningful visible paragraphs, list items,
ordered steps, and bounded two-cell table facts. Ignore badges, navigation,
table-of-contents rows, image-only lines, link definitions, commands in prose
categories, and repeated headings.

### Conservative fallback

When no overview-like section exists, rank only the first bounded set of
visible, non-heading README paragraphs. Prefer early paragraphs with project
name-independent descriptive language and reject command-like, badge-like,
navigation, release-log, slogan-only, or unsafe candidates. The fallback may
populate orientation only. It must not invent audiences, workflows,
capabilities, dependencies, limitations, or maturity claims.

### Cross-checking

Manifest and tree evidence may corroborate only these broad facts:

- application, library, CLI, service, desktop, or mixed product shape when
  directly established;
- recognized technology ecosystems;
- major top-level source areas;
- existence of README-mentioned manifests or conventional subsystems.

The cross-check must not infer runtime control flow, component ownership,
business behavior, deployment topology, or feature completeness from names.
Contradictory or absent structure creates a verification prompt, not a claim
that the README is false.

### Command boundary correction

README runtime requirements and version ranges are prose evidence, not
commands. Command extraction requires a recognized executable position in a
documented command context or a canonical manifest script. Semver ranges such
as `^20.19.0 || ^22.12.0 || >=24.0.0` must never become a run command. Existing
compound-command and remote-pipeline review rules remain in force.

## Data flow

1. The existing GitHub repository request validates stars, subscribers, forks,
   open issues, topics, timestamps, and license metadata.
2. File selection fetches the preferred README under existing count and byte
   budgets.
3. The worker derives the safe project brief, README profile, lightweight
   structural corroboration, community facts, and unchanged score inputs.
4. The strict report guard validates the combined immutable report.
5. Cache serialization validates the exact serialized snapshot before storage.
6. The UI maps frozen evidence and commentary identifiers to localized copy.

README interpretation and community facts never enter the scorer. Ruleset
version remains `1.0.0`.

## Visual direction

Continue the calm editorial due-diligence dossier. The signature motif is a
README evidence trail: repository prose on the left or above, RepoScope's
bounded interpretation next to or below it, and immutable evidence captions at
the edge.

- Keep the existing ink, surface, accent, typography, rules, and small-radius
  system.
- Keep ordinary prose near 64–72 characters per line.
- Render community facts as one semantic `dl`, not separate dashboard cards.
- Render capability groups as ruled editorial columns.
- Render workflow as an ordered horizontal evidence line on wide screens and a
  vertical ordered list below 64rem.
- Render README claim versus repository observation as a paired comparison,
  collapsing to one column on narrow screens.
- Use icons only when accompanied by text; do not rely on color alone.
- Do not add radar charts, synthetic percentages, decorative motion, sticky
  panels, glass effects, or a card grid that competes with reading.
- Preserve 44px interactive targets, 3px focus indication, reduced-motion
  behavior, source-link wrapping, and zero horizontal overflow at narrow and
  zoomed widths.

## Empty, partial, and error states

- Missing README: show community metadata and lightweight repository shape,
  state that no README interpretation is available, and do not synthesize a
  project story.
- Partial README fetch or incomplete coverage: retain safe acquired evidence,
  label the affected interpretation partial, and state that omissions may be
  caused by scan coverage.
- Unsafe or malformed section: omit that section without discarding unrelated
  safe sections unless the existing Markdown state requires fail-closed block
  handling.
- Missing social count or invalid GitHub response: reject the repository
  response rather than showing a fabricated zero.
- Commentary is omitted when its required evidence is unavailable.

## Accessibility and localization

Use semantic headings, `section`, `figure`, `blockquote`, `figcaption`, `dl`,
and ordered lists. Workflow order must remain understandable without its line
or color. Exact community counts receive descriptive accessible text. README
prose remains in the repository's language, while structural labels,
commentary, cautions, and empty states have complete English and Simplified
Chinese copy. Language switching does not refetch or recompute the report.

## Testing and acceptance

### Unit and contract coverage

- validate stars, subscribers, and forks at zero and safe-integer boundaries;
- reject missing, negative, fractional, infinite, boxed, getter-mutated, and
  unknown community values;
- cover English, Chinese, mixed-language, and non-standard README structures;
- cover overview, audience, use-case, capabilities, workflow, dependency,
  limitation, maturity, table, and conservative-fallback extraction;
- cover caps, canonical ordering, NFKC deduplication, source paths, partial
  coverage, missing README, and deterministic reverse-input equality;
- replay hostile HTML, comments, fences, links, URLs, credentials, controls,
  bidi, malformed UTF, oversized inputs, and adversarial Markdown performance;
- prove semver ranges are not commands and real README/manifest commands retain
  their ready/review/withheld disposition;
- prove reader interpretation and community values never enter scoring inputs;
- prove guard, worker, cache, and client reject stale or unsafe report shapes.

### Rendered acceptance

Add a rich README fixture that resembles a realistic project without copying a
third-party README wholesale. On desktop and mobile verify:

- orientation, community strip, README narrative, capability groups, workflow,
  comparison, and commentary appear in the approved order;
- every repository claim retains an immutable source link or metadata caption;
- community counts have exact accessible names and the popularity disclaimer;
- partial and missing README states remain honest;
- commands are inert and dangerous shapes carry review copy;
- technical details remain closed by default and complete when opened;
- language switching performs no network requests;
- hostile content creates no HTML, external request, control, or executable
  surface;
- keyboard focus, 44px targets, Axe serious/critical findings, reduced motion,
  375/768/1366 layouts, and 200% zoom-equivalent reflow pass.

Run lint, formatting, full coverage, TypeScript, default and Pages production
builds, bundle/CSP checks, Playwright, and Lighthouse. Re-run live acceptance on
at least one richly documented public repository and report any GitHub rate
limit as a coverage limitation rather than a product claim.

## Documentation

Update the English and Chinese READMEs, methodology, architecture, and
changelog. Document that README interpretation is deterministic, bounded,
non-scoring, and may be incomplete. Explain the exact Star, Watch, and Fork
sources and that popularity is not a quality or safety conclusion. Preserve the
existing privacy, cache, CSP, request-budget, unsupported-language, and static
analysis limitations.

## Non-goals

- AI-generated summaries or sending README content to a model;
- deep business-logic or function-level code interpretation in the main report;
- executing, building, installing, or dynamically testing the repository;
- vulnerability, malware, dependency, telemetry, or compliance verification;
- recommendation of named competing repositories;
- changing the score, confidence, ruleset, or existing technical metrics;
- treating popularity or repository claims as proof of suitability.
