# Copilot Expert-Panel Repository Interpretation Design

Date: 2026-08-23
Status: Approved through explicit user delegation

## Goal

RepoScope should help a person understand an unfamiliar open-source project
quickly enough to decide whether to try, adopt, or extend it. The report should
read like a careful expert briefing rather than a README excerpt, rule dump, or
function-level code review.

The primary experience must answer:

1. what the project does and whether its claims appear credible;
2. who it helps and which practical business or personal situations it serves;
3. how it broadly works without requiring a deep source-code review;
4. how to install, run, and begin secondary development;
5. which security, privacy, operational, or adoption risks remain;
6. whether the project is active and maintained; and
7. which comparable GitHub projects a user should also consider.

Quality takes priority over minimizing model calls. A normal deep analysis uses
an expert panel, an adversarial reviewer, and a final editor. Existing
deterministic analysis remains available as an immediate fallback.

## Product decision

Keep the current static, deterministic report as the evidence-acquisition and
fallback layer. Add an optional GitHub-authorized deep interpretation service
implemented with the GitHub Copilot SDK.

After the user authorizes the RepoScope GitHub OAuth App, a deep analysis runs five
bounded roles:

1. **Product interpreter** — explains purpose, audience, problems, capabilities,
   workflow, and business use cases from the README.
2. **Onboarding and architecture reviewer** — explains prerequisites, install,
   run, development, technology family, and conceptual architecture.
3. **Trust and ecosystem reviewer** — examines security, privacy, license,
   maturity, maintenance, community signals, and bounded alternative projects.
4. **Skeptical reviewer** — challenges unsupported claims, conflicts, missing
   evidence, popularity bias, and overly confident conclusions from the first
   three reviews.
5. **Chief editor** — resolves disagreements and produces one coherent,
   evidence-linked report for a non-specialist reader.

The first three roles run in parallel. The skeptical reviewer consumes their
structured outputs. The chief editor consumes the evidence pack, expert
outputs, and skeptical review. A deterministic validator accepts the final
output only when every structural and evidence requirement passes.

Copilot Free accounts use GitHub's automatic model selection. When the user's
entitlement exposes multiple suitable models, the orchestrator may distribute
the first three roles across different available models. The product promises
multiple independent roles, not access to a particular model or a guaranteed
cross-model combination.

## Alternatives considered

### One model call

One call is fast and inexpensive but combines extraction, judgment, criticism,
and editing in one context. It is more likely to omit a required chapter or
state a plausible inference as a fact. It remains useful only as a diagnostic
mode, not the default product experience.

### Generate, then conditionally repair

A first call followed by validation and an optional repair call improves
reliability with moderate usage. It does not provide genuinely independent
views of product value, practical onboarding, and trust. This is the preferred
future low-usage mode if the product later needs one.

### Expert panel with adversarial review — selected

Independent specialist contexts reduce anchoring and expose disagreements. A
separate skeptic and editor make evidence discipline an explicit stage rather
than a prompt instruction competing with the rest of the task. Commit-keyed
caching prevents this quality choice from causing repeated charges for the
same public snapshot.

## User experience

### Entry and consent

The existing deterministic report renders first. Its primary action becomes
**Generate expert interpretation**. Before the first deep analysis, a concise
disclosure states that selected public repository evidence will be sent to
GitHub Copilot, usage applies to the user's GitHub Copilot entitlement, and no
repository code is executed.

Selecting the action begins GitHub authorization. After a successful first
authorization, deep interpretation starts automatically for later repository
searches until the user signs out or disables automatic deep analysis. The
preference stores only a boolean; credentials never enter browser storage.

If authorization is declined or Copilot is unavailable, the deterministic
report remains complete and useful. Deep interpretation is an enhancement, not
a requirement for scanning a public repository.

### Progress

The page exposes meaningful stages rather than an indefinite spinner:

1. preparing public evidence;
2. consulting three specialists;
3. challenging the findings;
4. editing the final briefing; and
5. validating sources.

The first three specialist statuses can complete independently. Progress copy
must not reveal provider internals, tokens, prompts, or exception bodies.

### Final information architecture

The deep report renders before the existing deterministic decision summary:

1. **Thirty-second orientation** — plain-language purpose and verdict;
2. **Good fit / poor fit** — intended users and meaningful exclusions;
3. **Practical situations** — concrete business and personal use cases;
4. **Capabilities and workflow** — what the README presents and how use flows;
5. **How it broadly works** — product shape, technology family, and concepts;
6. **Start and extend** — prerequisites, install, run, and development path;
7. **Trust review** — reliability signals, security, privacy, and unknowns;
8. **Maintenance and community** — activity, release, issue, and popularity
   facts without treating popularity as proof of quality;
9. **Alternatives** — a small comparison of bounded GitHub candidates; and
10. **Expert verdict** — agreements, disagreements, and what to verify next.

Every material statement carries one of four visible provenance labels:

- **Repository states** — a project-authored README or documentation claim;
- **Repository shows** — an observed GitHub, manifest, or tree fact;
- **Expert interpretation** — a bounded inference linked to supporting facts;
- **Not established** — an important unanswered question.

Exact Stars, Watch, Forks, open issues, dates, and license facts remain visible.
Function metrics, scoring rules, long file lists, and detailed analyzer output
remain in the closed technical appendix.

## System architecture

### Frontend

The existing React/Vite application remains a static GitHub Pages deployment.
It continues to own repository input, deterministic browser analysis, progress,
language, report rendering, and the existing session cache.

New frontend responsibilities are deliberately narrow:

- start or end a server-backed GitHub authorization session;
- request deep analysis for an already validated deterministic report;
- receive bounded stage progress;
- validate the deep-report response before rendering;
- merge live GitHub facts with a cached narrative; and
- fall back without disturbing the deterministic report.

The frontend never receives a GitHub user access token, Copilot credential,
OAuth App secret, provider key, raw model prompt, or raw model response.

### Backend

A small TypeScript service provides:

- scope-less GitHub OAuth App callback and short-lived server-side sessions;
- Copilot entitlement probing and model capability selection;
- evidence-pack construction from client evidence plus server-verifiable public
  GitHub facts;
- bounded GitHub alternative search;
- expert-panel orchestration through the GitHub Copilot SDK;
- structured-output validation and safe retry behavior;
- commit-keyed public report caching; and
- progress delivery through server-sent events or streamed newline-delimited
  JSON.

The service runs in a container-capable environment because the Copilot SDK
communicates with a headless Copilot CLI process. A long-running service is the
default deployment; an edge-only or browser-only implementation is out of
scope.

The backend exposes a versioned `/api/v1` surface. Requests use same-site,
secure, HTTP-only session cookies and explicit CSRF protection. Production CORS
admits only the RepoScope deployment origin. The frontend CSP adds only the
configured RepoScope API origin to `connect-src`.

Expert mode is enabled in production only when the frontend and API use a
same-site custom-domain pair, such as `reposcope.example.com` and
`api.reposcope.example.com`. The default `github.io` site remains a complete
deterministic deployment; the first release does not depend on cross-site
third-party cookies. OAuth return targets preserve the configured frontend base
path, including `/reposcope/`.

### Authentication and entitlement

Use a GitHub OAuth App authorization-code flow with no requested scopes. Its
short-lived RepoScope server session holds the resulting `gho_` user token so
the Copilot SDK can apply the user's entitlement and model routing. Do not pass
a GitHub App installation token to the SDK, and do not request private
repository access. The first release accepts only public repositories.

Tokens remain in the bounded in-memory server session and are removed on
sign-out or its eight-hour expiry. Provider authorization failures clear the
session and require authorization again. Do not log authorization headers,
token fingerprints, raw callbacks, or SDK environment variables.

Entitlement probing determines only whether a deep analysis can run and which
model-selection mode is available. A lack of entitlement returns a typed
`copilot-unavailable` result and never turns the deterministic scan into an
error.

## Evidence pack

The browser's validated deterministic report is useful context but is not
trusted merely because it came from the client. The backend checks repository
identity, inspected commit, source paths, caps, and evidence identifiers before
model use. Security-sensitive facts and alternative candidates are fetched or
verified server-side from fixed GitHub endpoints.

The bounded evidence pack may include:

- canonical owner, repository, and immutable commit SHA;
- GitHub description, topics, homepage, license, timestamps, community counts,
  and default branch;
- the preferred README's safe visible prose and documented commands;
- package manifests and conventional project metadata;
- license, security, contributing, governance, and code-of-conduct evidence;
- top-level directories and broad technology ecosystems;
- a bounded release and recent-activity summary; and
- up to five server-verified alternative repository candidates.

The default evidence pack excludes source-file bodies, patches, issue bodies,
pull-request discussions, arbitrary remote pages, images, binary files,
dependency installation, builds, tests, and runtime execution.

Every admitted fact receives a stable opaque evidence ID. Text is normalized,
deduplicated, credential-filtered, length-bounded, and marked with source type,
immutable path or API field, acquisition time, and trust class. The model sees
repository prose inside an explicit untrusted-data envelope.

## Alternative discovery

Alternatives are limited to public GitHub repositories. The server constructs
at most three conservative search queries from validated repository topics,
description concepts, and product-shape evidence. It does not execute
model-authored query syntax directly.

Candidates are filtered for identity, archived status, obvious forks, topic or
description relevance, license visibility, and minimum evidence completeness.
Stars can order equally relevant candidates but cannot establish suitability.
The trust reviewer compares at most five candidates using current GitHub facts
and clearly states that the comparison is a shortlist, not an exhaustive market
survey.

## Structured model contracts

Each specialist returns strict JSON rather than Markdown. A finding contains:

```text
id: stable local identifier
section: frozen report section
claim: bounded plain text
provenance: repository-claim | observed-fact | interpretation | unknown
evidenceIds: one to six known evidence identifiers
confidence: high | medium | low
importance: primary | supporting
```

The skeptical review references specialist finding IDs and classifies each
challenge as unsupported, overstated, conflicting, incomplete, popularity-bias,
or unsafe-advice. It may recommend removal, qualification, or additional
evidence, but cannot create new factual claims.

The chief editor returns a frozen deep-report schema with bounded paragraphs,
lists, comparison rows, disagreements, and evidence references. It cannot emit
HTML, executable Markdown, remote image links, raw URLs, secrets, shell actions,
or fields outside the schema.

The deterministic validator recomputes canonical order, verifies every ID,
requires evidence for assertive material claims, rejects cycles and unknown
keys, enforces section caps, and prevents an `unknown` from becoming a positive
assurance statement. Invalid final output receives one bounded schema-repair
attempt. If that fails, no model-generated report is shown.

## Prompt-injection and tool boundaries

Repository content is hostile input. System prompts state that README text,
filenames, manifests, topics, and search results are evidence only and can never
change instructions. Repository content is never interpolated into system
instructions.

Each user run owns one isolated Copilot client and five isolated sessions; the
same user token is set at both client and session scope, and no client/model
cache crosses users. Role instructions append to the SDK system message rather
than replacing its safety guardrails. Timeout or cancellation actively aborts
the session before bounded disconnect, deletion, client shutdown, and temporary
workspace removal.

Panel sessions receive no shell, filesystem, browser, network, package manager,
code execution, or HTTP tool. The server builds and verifies the bounded
alternative shortlist before any role runs; no model can issue a search. Every
role, including the trust reviewer and editor, receives zero tools.

No role may recommend executing an undocumented repository command. Documented
commands remain inert quoted evidence and carry the existing command-safety
classification. Security and privacy conclusions use calibrated wording and
must not claim that static evidence proves absence of vulnerabilities, malware,
tracking, secret leakage, or legal risk.

## Caching and freshness

Model-generated narrative is public-project output and is cached independently
of user identity using:

```text
repository + commit SHA + evidence schema version + panel prompt version +
output language + capability class
```

Narrative cache entries expire after 30 days and are invalidated by any version
change. Raw prompts, model transcripts, README bodies, OAuth tokens, user IDs,
and session cookies are not part of the shared cache value.

Community counts and maintenance timestamps remain live facts with a short
client cache. Alternative candidates use a 24-hour server cache. The UI shows
the inspected commit and the freshness of dynamic facts separately, preventing
a cached narrative from implying that community data is equally old.

## Failures and partial availability

- GitHub authorization denied: keep the deterministic report and show a neutral
  sign-in action.
- Copilot unavailable or allowance exhausted: keep the deterministic report and
  explain that deep interpretation is temporarily unavailable.
- One of the first three specialists fails: retry once; if it still fails, the
  panel may continue only when the missing role's required chapters have
  sufficient evidence from the other roles. The final UI discloses reduced
  review coverage.
- Skeptic or editor failure: retry once, then discard model output and retain the
  deterministic report.
- GitHub alternative search failure: omit alternatives and mark that chapter
  unavailable without blocking other chapters.
- Client cancellation or navigation: terminate active work, close progress
  streams, and prevent late results from replacing a newer repository.
- Invalid or unsafe model output: never render it; preserve a typed diagnostic
  without provider response text.

The last valid deep report remains visible if a refresh fails, matching the
existing deterministic-report behavior.

## Privacy and retention

The first release analyzes public repositories only. The consent disclosure
lists the evidence categories sent to GitHub Copilot and explains that model
usage is governed by the user's GitHub plan and GitHub's service terms.

Application logs contain request IDs, stage timing, model capability class,
cache status, typed failure kind, and aggregate token or credit metadata when
available. They exclude prompts, outputs, repository prose, user tokens, user
email, IP-derived identity, and cookie contents.

Server sessions have a bounded idle lifetime. Signing out deletes the server
session immediately. Shared narrative caches contain only validated public
report output and evidence references.

## Internationalization, accessibility, and visual behavior

The panel produces English or Simplified Chinese according to the active
RepoScope language. Repository-authored evidence remains in its original
language; translated interpretation must not masquerade as a quotation.

Progress updates use an accessible live region with restrained announcements.
Provenance labels combine text and shape rather than color alone. Expert
disagreements use semantic lists, alternative comparisons use a responsive
table, and all disclosures remain keyboard operable. Reduced-motion behavior
continues to disable nonessential transitions.

The visual direction remains an editorial due-diligence dossier. The expert
panel should feel like one coherent publication, not five chatbot transcripts.
Raw role outputs are not exposed in the primary report; a compact methodology
note describes the panel and an evidence drawer provides traceability.

## Testing and evaluation

### Deterministic tests

- evidence-pack caps, canonicalization, deduplication, and trust classes;
- specialist, skeptic, editor, and final-report schema guards;
- unknown evidence references, fabricated alternatives, and overconfident
  assurance rejection;
- OAuth callback, session expiry, CSRF, origin, and token-redaction behavior;
- cache-key isolation, expiry, prompt-version invalidation, and public-only
  values;
- cancellation, late-event isolation, retry caps, rate limits, and fallbacks;
- bilingual rendering, keyboard order, live-region behavior, and responsive
  alternative tables.

### Adversarial fixtures

README and metadata fixtures cover prompt injection, fake system messages,
credential-shaped text, remote-pipeline instructions, invisible Unicode,
malicious links, enormous sections, contradictory claims, popularity bait,
fabricated badges, and misleading security assertions.

### Quality evaluation

A versioned suite of representative public repositories covers applications,
libraries, CLIs, desktop tools, AI products, archived projects, sparse READMEs,
Chinese READMEs, and projects with strong marketing but weak operational
evidence.

Human review scores each output from one to five on correctness, evidence
traceability, explanatory depth, practical usefulness, uncertainty discipline,
and reading quality. Release requires:

- every required chapter present or explicitly unavailable;
- every material factual statement linked to admitted evidence;
- no high-confidence claim contradicted by its cited evidence;
- no unsafe command presented as a recommendation;
- median score of at least four in every quality dimension; and
- no token, prompt, or unvalidated provider output in browser storage or logs.

Automated groundedness checks support but do not replace the curated human
review gate.

## Rollout

1. Introduce versioned deep-report contracts and fixtures without changing the
   current UI.
2. Add the TypeScript backend, GitHub OAuth App authorization, session boundaries,
   and mocked Copilot adapter.
3. Implement evidence packing and bounded GitHub alternative discovery.
4. Add specialist orchestration, skepticism, editing, validation, and caching.
5. Add the deep-report UI behind a disabled-by-default feature flag.
6. Run security, quality, accessibility, responsive, performance, and live
   GitHub/Copilot smoke gates.
7. Enable explicit deep-analysis opt-in, then enable remembered automatic deep
   analysis only after stable telemetry and quality results.

The static deterministic report, existing ruleset, score inputs, resource caps,
and technical appendix remain unchanged unless a separate design explicitly
revises them.
