# Human-readable Repository Report Design

Date: 2026-08-17
Status: Approved for implementation planning

## Goal

RepoScope must help a person decide whether an unfamiliar public GitHub
repository is worth investigating further. The completed report should answer,
in ordinary language and in this order:

1. What does this project do, and which real-world situations is it for?
2. Is there enough public evidence to continue evaluating it?
3. What are its core operating principles and code architecture?
4. How can someone install, run, test, and extend it?
5. What security or privacy risks and unknowns should be checked?
6. How active and maintainable does it appear, and how should alternatives be
   compared?

The report is for human readers. Function length, cyclomatic complexity, rule
identifiers, and large file-reference lists must no longer dominate the primary
reading path.

## Product decision

Add a deterministic, non-scoring **reader report** above the existing technical
analysis. Render it as a single-column decision dossier with a short decision
summary followed by six evidence-based chapters. Move the current overall
score, six dimension scores, strengths, improvements, coverage details, rule
evidence, function metrics, and methodology into a closed-by-default
**Technical evidence and methodology** appendix.

The existing technical analysis remains available and unchanged. It becomes
supporting evidence rather than the product's opening conclusion.

## Alternatives considered

### Reorder the existing sections

Moving the current Project brief above the score would be small, but the page
would still be dominated by numeric scores, function-level findings, rule IDs,
and long evidence lists. It would not answer installation, architecture,
security, maintenance, or practical-use questions coherently.

### Replace the scoring system

Designing a new quality score could reduce the emphasis on function metrics,
but it would mix a reader-experience change with a new methodology and would
create another opaque number. It would also invalidate existing ruleset and
compatibility guarantees.

### Add a decision-oriented reader report — selected

This preserves deterministic analysis and traceability while giving people a
short, honest interpretation layer. It can be produced from the public evidence
RepoScope already fetches, without adding an AI service, backend, login, token,
or project execution.

## Information architecture

### Repository identity

Keep the repository owner/name, immutable commit, analyzed time, and repository
link at the top. The repository identity is followed immediately by the
decision summary, not by a numeric score.

### Project decision summary

The first screen contains five bounded items:

1. one concise statement of the repository's stated purpose;
2. up to three stated or evidence-backed usage scenarios;
3. one evidence-status judgement with plain-language reasons;
4. two to four high-priority questions the reader should verify;
5. the shortest supported installation and start path, when present.

Every fact either links to immutable repository evidence or is labelled as
GitHub metadata or deterministic analysis. Repository-authored prose remains in
its original language. RepoScope's labels and connective copy are localized.

### Six reader chapters

The summary is followed by six numbered chapters:

1. **Purpose and practical scenarios**
2. **Evidence of reliability**
3. **Core principles and code architecture**
4. **Installation, operation, and further development**
5. **Security and privacy risks**
6. **Activity, maintenance, and alternatives**

Each chapter begins with the most decision-relevant conclusion, then shows a
small number of evidence rows. It does not begin with rule identifiers or raw
metric names.

### Technical appendix

The current score and evidence surfaces live in one semantic `details` region
named **Technical evidence and methodology**. It is closed by default and
contains:

- overall score and confidence;
- six dimension scores;
- strengths and improvements;
- coverage and skipped/failure details;
- all rules, function-level metrics, and file references;
- methodology and ruleset links;
- existing report actions such as copying the full technical result.

Opening or closing the appendix does not recompute the report or change its URL.

## Reader-report evidence model

Add a required, strictly validated, non-scoring reader-report value to the
serialized `AnalysisReport`. Keep the existing `projectBrief` evidence as an
input or compatible substructure rather than extracting the same purpose twice.
The new value contains bounded structured facts, not prelocalized paragraphs.

Conceptually it contains:

- `summary`: purpose evidence, scenarios, evidence status, verification
  questions, and the quickest supported start path;
- `reliability`: onboarding, license, test/CI, maintenance, security-policy,
  and coverage signals;
- `architecture`: documented architecture excerpts, recognized entry points,
  top-level source areas, languages, and manifest evidence;
- `gettingStarted`: inert install, start, development, test, and build command
  facts;
- `securityPrivacy`: policy, configuration/secrets-handling, declared network
  or permission evidence, cautions, and explicit unknowns;
- `maintenance`: archived state, last push, version history, contribution
  guidance, templates, CI, dependency-update evidence, and issue count;
- `alternatives`: bounded search terms and a fixed comparison checklist;
- a source reference for every repository-derived fact.

Each fact uses a frozen identifier, evidence state, bounded value, and optional
immutable path. Ordering and item caps are deterministic. Unknown fields,
invalid states, unsafe strings, oversized arrays, cycles, and inconsistent
source/path combinations fail closed at the report guard.

The reader report does not contribute to `score`, dimension points,
`confidence`, strengths, or improvements. Ruleset version remains `1.0.0`.

## Evidence extraction

### Purpose and scenarios

Reuse the existing safe project-purpose evidence. Add bounded scenario
extraction from preferred README sections such as `Use cases`, `Who is this
for`, `Examples`, `用途`, `适用场景`, and equivalent frozen headings.

- Keep at most three short, meaningful items.
- Preserve repository-authored language.
- Ignore badges, navigation, HTML blocks, link destinations, code, commands,
  tables, hidden content, and credential-like values.
- De-duplicate scenarios against the purpose and against each other.
- When no trustworthy scenario is stated, say that the repository does not
  publicly describe specific usage scenarios. Do not invent one from the
  technology stack.

The existing conditional fit statement may be retained, but it must not claim
that the project suits the user's private requirements.

### Evidence of reliability

Reliability is an evidence judgement, not a new score. Use these existing or
directly derivable signal groups:

- onboarding: documented install and start path;
- verification: test files, test command, CI, and coverage evidence;
- legal use: recognized license file or API license metadata;
- maintenance: archived state and exact elapsed time since the last push;
- security process: public security policy;
- release/contribution process: version history and contribution guidance.

Use one of three localized statuses:

1. **Sufficient evidence to continue evaluation** — the repository is not
   archived, has recognized license evidence, has a usable install/start path,
   was pushed within 180 exact UTC days at analysis time, and has at least one
   meaningful automated verification path. Missing security-policy or coverage
   evidence remains a visible caution and never becomes a positive claim.
2. **Key gaps require verification before use** — decisive public evidence is
   absent or negative, including an archived repository, missing license,
   missing onboarding, a last push more than 180 exact UTC days before analysis,
   or no meaningful test/CI path. The existing 181–365 and over-365-day bands
   remain available as reasons; no new maintenance threshold is introduced.
3. **Public evidence is insufficient to judge** — the scan could not obtain
   enough of the decisive evidence groups because of incomplete tree/fetch
   coverage or the repository exposes too little interpretable material.

The status is accompanied by positive evidence, gaps, and verification
questions. It must not say that software is safe, correct, production-ready,
popular, or well maintained.

### Core principles and code architecture

Prefer repository-authored architecture evidence:

1. bounded prose under architecture/design/how-it-works headings;
2. recognized architecture documents;
3. deterministic structural fallback from manifests, conventional entry
   points, top-level source areas, supported languages, and module boundaries.

The fallback describes observable structure only. It may say that the
repository has a browser entry point, worker, CLI entry, library export, or
separate source areas when those facts are directly established. It must not
infer business logic, runtime control flow, deployment topology, or component
ownership from filenames alone.

Function counts, median function length, cyclomatic complexity, identifier
metrics, and per-function references are prohibited from this chapter. They
remain available in the technical appendix.

### Installation, operation, and further development

Extract at most one primary fact for each of:

- install;
- start/run;
- development mode;
- test;
- build.

Prefer documented README commands, then recognized manifest commands. Commands
are single-line, length-bounded, rendered as inert text, linked to their source,
and never executed. RepoScope must not add a one-click execution action.

Credential-like values and unsafe control characters are rejected. Shell forms
that download and immediately execute remote content, request elevated
privileges, or contain destructive operations are not silently recommended;
they are displayed only as repository-provided evidence with a visible
**review before running** caution. When an exact command cannot be retained
safely, keep the fact that documentation exists and link to the source without
copying the command.

If a step is missing, render **Repository does not provide this step** rather
than deriving a plausible command from the language alone.

### Security and privacy risks

This chapter separates observed evidence from unknowns. It may report:

- presence or absence of a security policy;
- presence of environment/configuration examples without copying values;
- repository-authored security or privacy documentation;
- declared network/API, permission, telemetry, storage, or credential-handling
  behavior when bounded public documentation states it explicitly;
- suspicious install-command shapes that require manual review;
- license evidence relevant to adoption.

It always states the analysis boundary: RepoScope does not execute the project,
perform a dependency vulnerability scan, observe runtime network traffic,
verify permissions, detect malicious behavior, or prove privacy compliance.
Absence of detected evidence is rendered as **not established from the scanned
public repository**, never as **no risk**.

### Activity, maintenance, and alternatives

Present exact public maintenance facts:

- archived state;
- last push date and deterministic elapsed-day band;
- changelog or release-notes evidence;
- contributing guide, issue/PR templates, and security policy;
- CI, dependency-update configuration, test command, and coverage evidence;
- open issue count, explicitly labelled as a count rather than a quality signal.

RepoScope does not automatically name or rank competing repositories. It
instead provides:

- a fixed comparison checklist covering purpose, license, onboarding, tests,
  security process, maintenance, ecosystem fit, and operational constraints;
- an optional GitHub repository-search link built from validated project kinds
  and at most a few validated topics.

The search link is user-initiated and does not trigger another request during
analysis. When no reliable search terms exist, only the comparison checklist is
shown.

## Verification questions

The summary contains two to four deterministic, prioritized questions derived
from the highest-impact gaps. Examples include:

- Is the license compatible with the intended use?
- Can the documented install and start path be reproduced in an isolated
  environment?
- Which data leaves the local environment at runtime?
- How are vulnerabilities reported and patched?
- Is the last supported release compatible with the intended platform?

Questions describe what the reader should verify; they must not imply that an
unobserved problem exists.

## Visual and interaction design

Use the selected **single-column decision dossier** layout.

- Preserve the existing warm editorial inspection-sheet palette, serif display
  type, plain borders, and restrained blue accent.
- Do not add a dashboard card grid, decorative gradients, glass effects,
  illustrations, or new motion.
- Replace the dominant large numeric score with a textual evidence status and
  its reasons.
- Keep prose to a readable measure of approximately 64–72 characters while the
  overall report can use the existing wider shell.
- Use numbered chapters and ruled evidence rows to create hierarchy.
- Use icons only when they add meaning; status must never rely on color alone.
- Evidence links are adjacent to the claims they support and independently
  encode owner, repository, commit, and every path segment.
- All visible links and controls retain at least 44 by 44 CSS pixels, a visible
  3-pixel keyboard focus indicator, and safe long-text wrapping.
- At 375 px and the existing 200%-zoom-equivalent viewport, the report becomes
  one column with no horizontal overflow.
- Respect reduced-motion preferences; the appendix needs no animated reveal.

## Data flow

1. The existing GitHub client obtains validated metadata, the immutable commit,
   and the normalized bounded tree.
2. Existing file selection and acquisition fetch eligible text under unchanged
   request, byte, file-count, and timeout limits.
3. The existing project-brief analyzer supplies safe purpose/kind evidence.
4. A new isolated reader-report analyzer derives bounded structured facts from
   metadata, tree, preferred documentation, recognized manifests, and existing
   general-analysis signals.
5. The worker adds the reader report after repository analysis without adding
   it to any scoring input.
6. The strict guard validates the entire nested shape before the report can
   reach the UI or session cache.
7. Localized React components turn fact identifiers into explanatory prose and
   immutable evidence links.
8. The technical appendix renders the existing score and rule-based analysis
   without recomputation.

## Missing, partial, and hostile evidence

Each reader section supports explicit `available`, `partial`, and `unavailable`
presentation states.

- Missing documentation produces a localized **Repository does not provide
  this evidence** message.
- Fetch failures and incomplete tree coverage produce **Not established from
  the scanned evidence**, not a negative repository claim.
- Conflicting public evidence is presented as a verification question; the
  analyzer does not choose the more flattering interpretation.
- Malformed or hostile Markdown, structured files, paths, or metadata fail
  closed to less reader content, never to unvalidated prose.
- Existing credential, control-character, bidi, path, size, cycle, and strict
  serialization protections apply to every new string and source reference.
- Repository text is rendered through React text nodes. No raw HTML or Markdown
  execution surface is introduced.
- Raw source text remains ephemeral and is not written to the report or cache.

If the reader layer fails to derive safe content, the technical report can
still complete with honest unavailable states. It must not crash the worker or
erase valid scoring output.

## Compatibility and protected boundaries

- Ruleset version stays `1.0.0`.
- Existing rule thresholds, dimension weights, scores, confidence, findings,
  coverage totals, scanner selection, parser loading, and lazy chunks are
  unchanged.
- GitHub REST endpoints, request limits, byte limits, timeouts, cache TTL/cap,
  CSP, network allowlist, Pages base path, and privacy/threat boundaries are
  unchanged.
- No AI service, backend, login, repository token, analytics, repository code
  execution, or raw-source persistence is introduced.
- The report schema changes deliberately. Cached reports with the old shape are
  rejected and recomputed under the existing cache policy.

## Testing and acceptance criteria

### Reader analyzer

- Exact English and Chinese heading fixtures for all six evidence areas.
- Purpose/scenario de-duplication, deterministic order, item caps, and shuffled
  input invariance.
- Architecture-document preference and conservative structural fallbacks.
- Install/start/develop/test/build precedence, source paths, command safety,
  and missing-step states.
- Reliability decision-table boundaries for archived, license, onboarding,
  activity, test/CI, security-policy, coverage, and incomplete-scan cases.
- Maintenance facts, alternative search terms, and no automatic competitor
  names.
- Malformed Markdown/manifests, credentials, controls, bidi, hostile HTML,
  oversized inputs, deep structures, frozen-input non-mutation, and bounded
  runtime.

### Report boundary and compatibility

- Exact model/guard shape, source/path combinations, string and item caps,
  unknown fields, cycles, throwing proxies, and inconsistent evidence states.
- Worker serialization, worker-client acceptance, cache round trip, stale cache
  rejection, TTL, and 2 MiB cap.
- Existing score, dimensions, confidence, strengths, improvements, coverage,
  ruleset, and parser-chunk expectations remain unchanged for frozen fixtures.

### UI

- The decision summary is the first report content after repository identity.
- Six reader chapters appear in the approved order.
- Function metrics, raw rule IDs, dimension scores, and long file-reference
  lists do not appear in the primary reading path.
- The technical appendix is closed by default and exposes every existing
  technical surface when opened.
- Exact English and Simplified Chinese copy for statuses, fallbacks, questions,
  labels, and disclaimers; repository prose remains in its source language.
- Source links are immutable and safely encoded; hostile prose stays inert.
- Empty, partial, archived, stale, command-caution, and conflicting-evidence
  states remain coherent.

### Browser acceptance

- Deterministic TypeScript, Python, Go, minimal-evidence, missing-documentation,
  archived/stale, and hostile fixtures on desktop and mobile.
- Zero horizontal overflow at 375, 900, and 1366 px and at the existing
  200%-zoom-equivalent viewport.
- Every visible interactive target is at least 44 by 44 CSS pixels; every
  keyboard stop has a nontransparent 3-pixel focus indicator.
- Axe reports zero serious or critical WCAG 2A/AA/2.1A/AA violations on landing,
  decision summary, and opened technical appendix.
- Reduced-motion rules, language switching without refetch, no unexpected
  external hosts, no console errors, and no page errors remain enforced.
- Real acceptance uses RepoScope's own repository and at least one unrelated
  public repository. Both must explain what the project does before exposing
  technical scoring details.

## Out of scope

- Personalized recommendations based on private user requirements.
- Automatically naming, ranking, or reviewing competing repositories.
- Popularity, adoption, performance, correctness, production-readiness,
  security, privacy, or legal guarantees.
- Dependency vulnerability scanning, SBOM generation, malware detection,
  runtime traffic capture, or project execution.
- Arbitrary AI-generated summarization or translation.
- New scoring rules, score weights, ruleset version, or parser support.
- Authentication, private repositories, GitHub tokens, backend storage, or
  analytics.
