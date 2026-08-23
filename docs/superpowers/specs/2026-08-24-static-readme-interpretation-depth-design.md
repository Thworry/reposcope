# Static README Interpretation Depth Design

Date: 2026-08-24
Status: Approved by the user's standing authorization for default design decisions

## Goal

Make RepoScope's no-login, static GitHub Pages report explain an unfamiliar
repository like a careful human reviewer. The report should help a reader answer:

1. what the project is and whether it appears worth further evaluation;
2. which concrete capabilities and business situations the README describes;
3. how the documented workflow proceeds and how the code is broadly organized;
4. how to install, run, and continue development;
5. which security, privacy, maturity, and maintenance questions remain open.

The result must remain deterministic, bounded, source-linked, bilingual, and
safe to run entirely in the browser. Repository prose is evidence, not verified
fact. Detailed function-level judgments remain in the closed technical appendix.

## Evidence from the current product

The existing architecture already has the right foundation: one bounded
Markdown scan, a validated README profile, exact GitHub community counts,
separate claim and observation sources, and an editorial report UI. The main
remaining problems are classification and presentation:

- common human headings such as `✨ 项目简介`, `现在已经能做什么`,
  `典型使用路径`, and `技术栈与架构` do not match exact heading aliases;
- numbered headings and decorative symbols are retained for display but also
  prevent section matching;
- safe inline-code labels such as UI page names cause otherwise useful list
  items to be discarded;
- an inline version string outside a dependency section can be misclassified
  as a runtime requirement;
- the same README excerpts reappear in orientation, narrative, and comparison;
- broad structural evidence exists, yet the architecture chapter can still
  open with an unhelpful unavailable message;
- generic commentary reports that evidence exists, but does too little to
  explain what the evidence means to a prospective user.

## Approaches considered

### Expand the exact heading list only

This is the smallest patch and fixes a few known repositories. It remains
brittle for emoji, numbering, bilingual suffixes, and future README wording. It
also does not address repeated excerpts or weak commentary.

### Add bounded normalization and deterministic synthesis — selected

Normalize headings only for lookup while preserving the author's original
label for display. Recognize a broader but frozen heading vocabulary, retain
safe inline-code labels as prose, and apply a few high-confidence audience,
problem, and use-case cues to otherwise general overview text. Reuse the
validated report model to generate concise, localized reader takeaways and a
broad architecture explanation in the UI.

This route improves the static default experience without adding a service,
model call, dependency, second Markdown pass, or unverifiable claim.

### Depend on the optional expert model panel

The expert panel can produce deeper bespoke analysis, but it requires a
separately deployed authenticated backend. Making it the only route to a useful
report would leave GitHub Pages users with the same shallow static output. It
remains an optional second layer, not the default remedy.

## Extraction design

### Heading lookup normalization

For classification only:

- normalize Unicode with NFKC and collapse whitespace;
- remove trailing Markdown heading markers and punctuation;
- remove leading decorative symbols and emoji;
- remove a single leading numeric section marker such as `1.`, `2)` or `3、`;
- lowercase Latin text using a stable locale;
- require an exact match against the frozen heading vocabulary after cleanup.

The original safe heading text remains the capability group label. Matching
does not use arbitrary substring or fuzzy similarity, so headings such as
"security research notes" cannot silently become security declarations.

Add common English and Simplified Chinese aliases for project positioning,
capability overviews, typical usage paths, onboarding, technical architecture,
security/privacy, limitations, and current status. Include the real target
README shapes in short synthetic fixtures rather than copying the full README.

### Safe inline-code prose

Inline code often marks UI paths, filenames, settings, or product concepts. A
profile fact may retain the visible inline-code content when:

- the backtick runs are balanced and bounded;
- the complete original and normalized line contain no URL, credential-like
  value, control, bidi-control, malformed UTF, HTML, image, or Markdown link;
- the inline value is not admitted as an executable command;
- the resulting visible prose passes the existing length and safety checks.

Command extraction remains separate and inert. Runtime-version prose is added
to dependency evidence only inside a dependency or documented command context,
preventing release numbers elsewhere in the README from leaking into the
requirements section. When more than one command of the same kind appears,
prefer a command under its matching explicit heading over a command merely
inherited from a broad parent such as Quick Start; preserve source order within
the same priority. This lets a dedicated "start development" step supersede an
incidental desktop command mentioned under installation.

### High-confidence narrative routing

When a descriptive fact is found in an overview-like or fallback area, route it
to a more useful category only for strong authored cues:

- audience cues such as `适合`, `面向`, `目标用户`, `built for`, or
  `intended for`;
- use-case cues such as `如果你想`, `想验证`, `想研究`, `when to use`, or
  `if you need`;
- problem cues that explicitly describe a difficulty, pain point, or failure
  the project claims to address.

These rules classify the README's own sentence; they do not generate new
project claims. Exact source text and commit-pinned evidence links remain
available.

## Reader-facing synthesis

Add a compact "reader takeaways" block near the top of the dossier. It derives
four bounded observations from already validated data:

1. **Capability shape** — number and names of documented capability groups;
2. **Typical path** — number of README workflow steps and install/run evidence;
3. **Broad implementation shape** — project kind, ecosystems, and named source
   areas, explicitly labeled as a structural outline rather than runtime proof;
4. **Risk boundary** — present or absent onboarding, license, security policy,
   external requirements, and recent activity, followed by what still needs
   verification.

The prose comes from localized templates with counts and canonical labels. It
must say "README describes", "repository structure shows", or "evidence does
not establish" as appropriate. It must never claim correctness, safety,
production readiness, or suitability for private requirements.

Replace the repeated claim excerpt column with a compact README evidence map:
category labels, counts, and capability names. Keep one source link for each
evidence group where practical. This preserves traceability while reducing
verbatim repetition.

The architecture chapter should show the broad project kind, ecosystems, and
top-level source areas already derived by the analyzer. Entry points and
function metrics stay in the technical appendix. Generic unavailable notices
should not precede a chapter that already has structural evidence.

## Visual direction

> A calm editorial due-diligence interface for people evaluating unfamiliar
> GitHub repositories, built around a source-margin evidence trail, using a
> serif-led hierarchy, warm paper/ink/cobalt palette, and near-static motion.

Fixed decisions:

- preserve the Charter-style display face and neutral sans-serif body face;
- preserve the warm paper, dark ink, muted rule, and cobalt evidence colors;
- keep prose at roughly 64–72 characters and use spacing to separate reading
  modes rather than wrapping every item in a card;
- retain small radii, ruled sections, and flat surfaces;
- make the evidence trail and numbered workflow the single signature motif;
- use no new animation library, blur, glass, gradient, chart, or decorative
  illustration;
- keep body text at least 16px, 44px controls, visible focus, semantic heading
  order, reduced motion, and zero horizontal overflow.

The local UI database suggested a content-first editorial pattern and a
Newsreader-style serif hierarchy; those lessons match the existing product.
Its glass/dark recommendation is intentionally rejected because it conflicts
with RepoScope's established paper dossier system and would reduce long-form
readability.

## Scope and boundaries

- No new schema, API, model call, package, network request, or score input.
- No deep control-flow or function-level interpretation in the main report.
- No execution of analyzed repository code or copied commands.
- No named alternative repositories in deterministic mode; keep the existing
  evidence-based GitHub comparison launch point and let the expert layer handle
  verified named alternatives.
- Preserve all byte, item, path, HTML, credential, cache, CSP, and worker
  boundaries.
- Preserve exact stars, watches, forks, issues, activity, and license facts.

## Acceptance criteria

- A README fixture with emoji and numbered headings produces overview,
  capability groups, a seven-step workflow, dependency facts, architecture
  evidence, and the intended install/run commands.
- Safe inline UI labels remain visible; commands, URLs, secrets, malformed
  Markdown, and release-only version strings remain excluded or correctly
  routed.
- Cap and adversarial tests remain deterministic and fail closed.
- The report renders human-readable takeaways, a non-repetitive evidence map,
  and broad architecture context in both English and Simplified Chinese.
- Repository-authored visible wording remains preserved after safe Markdown
  cleanup and is never translated or presented as verified fact.
- Desktop, tablet, 375px mobile, keyboard, reduced-motion, and 200%-equivalent
  reflow checks show no clipping or horizontal overflow.
- Unit, server, type, lint, format, build, E2E, accessibility, bundle, and
  Lighthouse gates pass before the branch is pushed.
