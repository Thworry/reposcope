# Repository Project Brief Design

Date: 2026-08-13
Status: Approved for implementation planning

## Goal

After a user submits any supported public GitHub repository URL, RepoScope must
help them answer two questions within a few seconds:

1. What does this repository do?
2. Is it plausibly relevant to the kind of thing I am looking for?

This applies to every analyzed repository, not only RepoScope or its example
repositories. The brief is descriptive, not a recommendation that the software
is safe, correct, or suitable for a particular deployment.

## Product decision

Add a compact **Project brief** section near the top of every completed report,
between the repository identity and the score details. It has four parts:

1. **What it does** — one or two bounded public-prose excerpts that explain the
   repository's stated purpose.
2. **Likely fit** — a short structured statement derived from the stated purpose
   and detected repository kind.
3. **What it is** — deterministic kind labels such as application, library,
   command-line tool, template, plugin, documentation, or unknown.
4. **Before you use it** — only decision-relevant facts already established by
   repository metadata and analysis, such as archived state, license evidence,
   entry-point evidence, and insufficient public explanation.

The section also exposes its source. README evidence links to the inspected
commit; repository-description evidence is labelled as GitHub metadata.

## Alternatives considered

### README first paragraph only

This is simple but frequently returns badges, slogans, navigation, translated
README links, or prose that does not identify the project. It also provides no
useful fallback when the README is absent.

### Long generated introduction

This can contain more detail, but it is slow to scan and would encourage
unsupported inference. It also conflicts with RepoScope's local,
deterministic, no-AI-service boundary.

### Structured project brief — selected

A structured brief gives users the fastest comparison surface, supports honest
fallbacks, and can be generated deterministically from already fetched public
evidence without changing the scoring ruleset.

## Evidence model

The worker adds a non-scoring `projectBrief` value to `AnalysisReport`. It
contains bounded, serializable evidence rather than localized presentation
sentences:

- normalized GitHub repository description, if present;
- one preferred README path and at most two selected prose excerpts;
- zero or more detected project kinds from a frozen ordered vocabulary;
- structured caution facts: archived, license evidence absent, entry-point
  evidence absent, and explanation evidence insufficient;
- evidence origin for each displayed fact.

All strings have explicit character and item caps. The strict report guard,
session cache validation, worker protocol tests, and cache size ceiling apply to
the new value.

## Deterministic README extraction

The existing preferred-README selection remains authoritative. Extraction is a
new isolated pure function with these rules:

1. Normalize line endings and Unicode using the same bounded text assumptions
   as general analysis.
2. Ignore front matter, HTML blocks, comments, badges, images, tables of
   contents, reference definitions, fenced code, indented code, block quotes,
   and command-only lines.
3. Prefer prose under an explicit overview heading such as `Overview`,
   `About`, `What is`, `简介`, `概述`, or `关于`.
4. Otherwise choose the first meaningful prose after the primary title.
5. Keep at most two paragraphs and a small bounded character budget.
6. Remove a README excerpt when its normalized content merely repeats the
   GitHub description.
7. Never interpret Markdown as HTML and never execute, fetch, or follow README
   content.

If no trustworthy prose remains, `What it does` reports that the public
repository evidence is insufficient to explain the project reliably.

## Repository-kind detection

Kinds are inferred from bounded structural facts, not marketing keywords alone.
Examples include:

- application: conventional application entry plus run evidence;
- library: package/library exports or recognized library layout;
- command-line tool: structured binary/script entry or conventional CLI area;
- template: repository-template metadata or strong template/scaffold evidence;
- plugin: structured plugin metadata or recognized plugin entry;
- documentation: documentation-dominant tree without supported runtime source;
- unknown: none of the frozen conditions is established.

Multiple kinds may be retained when the evidence genuinely supports them, with
a deterministic priority order and a small cap. The exact vocabulary and
conditions are tested as a public report contract. A kind is an evidence-based
classification, not a claim that the project runs.

## Likely-fit wording

RepoScope does not know the user's private requirements from a URL alone. It
therefore must not display an unconditional “this is right for you” verdict.
Instead, the UI uses conditional wording:

- “Worth considering if you need …” followed by the repository's own bounded
  purpose prose;
- “This appears to be a library / CLI / application …” from detected kinds;
- “Public evidence is insufficient to judge fit” when purpose or kind evidence
  is missing.

This gives the user a fast relevance check without fabricating intent,
compatibility, quality, security, or operational guarantees.

## Localization

Section labels, kind names, cautions, fallbacks, and connective sentences are
available in English and Simplified Chinese. Repository-authored prose remains
in its original language; RepoScope does not claim to translate arbitrary
repository content. Switching UI language changes presentation only and never
starts another analysis.

## Interface and layout

The brief extends the existing editorial inspection-sheet visual system. It is
not a new card grid and introduces no decorative effects or motion.

- The purpose text is the strongest item after the repository name.
- Kind labels are textual facts, not colorful status badges.
- Likely fit and cautions use semantic headings and lists.
- The evidence source is a normal 44-pixel target when it is a link.
- Long repository prose and paths wrap without horizontal overflow at 375 px
  and at the existing 200% zoom-equivalent viewport.
- The section remains readable when only fallback content is available.

## Data flow

1. The existing GitHub snapshot supplies metadata and the immutable commit.
2. Existing deterministic file selection fetches the preferred README when it
   is eligible.
3. General analysis calls the isolated brief extractor with repository
   metadata, the normalized tree, and fetched text files.
4. The worker assembles `projectBrief` without changing scoring inputs.
5. The strict guard validates the exact nested shape before the report reaches
   cache or UI.
6. `ReportSummary` renders the brief using localized structural copy and
   commit-pinned evidence links.

## Failure and safety behavior

- Missing README or description yields an honest fallback, never an exception.
- Malformed or hostile Markdown fails closed to fewer excerpts.
- Bidi and line-control rejection remains consistent with existing text
  boundaries.
- React text rendering is used; no HTML injection sink is introduced.
- No raw source file, code block, credential, URL destination, or hidden HTML
  attribute is copied into the brief.
- No new network request, AI service, backend, analytics, code execution, or
  dependency is introduced.

## Compatibility

- Ruleset version remains `1.0.0`.
- Scores, dimensions, confidence, findings, coverage, selection, parser
  loading, request limits, CSP, and threat boundaries are unchanged.
- The report schema changes deliberately and therefore requires synchronized
  updates to model fixtures, strict guards, cache tests, worker tests, copy
  output tests where applicable, and browser fixtures.
- Cached reports without the new required shape are rejected and recomputed.

## Test and acceptance criteria

### Extraction

- English and Chinese overview headings.
- Lead-prose fallback.
- Description and README de-duplication.
- Badge, image, HTML, link destination, code, command, table-of-contents, and
  prose-free negative cases.
- Missing README/description and hostile bounded inputs.
- Frozen input non-mutation and deterministic output under shuffled files.

### Classification

- Positive and negative fixtures for every frozen repository kind.
- Ambiguous multi-kind ordering and cap.
- Unknown fallback and no runtime-proof wording.

### Report boundary

- Exact guard shape, unknown fields, item/string caps, cycles, throwing proxies,
  cache round trip, stale schema rejection, and worker serialization.
- Scoring and confidence fixtures remain byte-for-byte unchanged apart from the
  new non-scoring report field.

### UI

- English and Chinese labels and fallbacks.
- Source-language repository prose rendered as text.
- Commit-pinned README evidence link.
- No analysis on language switch.
- Keyboard access, 3 px focus, 44 px evidence link, narrow reflow, reduced
  motion, and hostile-text rendering.

### Browser acceptance

- Deterministic TypeScript, Python, minimal-evidence, missing-README, hostile
  README, and non-deep-language fixtures.
- A real public repository scan demonstrates that the brief explains the
  repository before the score while retaining zero unexpected external
  requests, console errors, or horizontal overflow.

## Out of scope

- Asking the user to describe their personal requirements.
- Personalized recommendation ranking or repository search.
- Arbitrary translation or summarization through an AI service.
- Compatibility, security, performance, popularity, or adoption guarantees.
- Any scoring or ruleset change.
