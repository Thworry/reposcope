# RepoScope architecture and threat boundaries

RepoScope has a deterministic static application and an optional expert-analysis service. In static mode, the React/Vite application is hosted by GitHub Pages, the visitor's browser communicates directly with GitHub, and a module Web Worker performs every calculation. This mode has no RepoScope application server, account system, token exchange, database, analytics collector, advertising service, or AI provider. A configured build may additionally connect to one validated RepoScope TypeScript API origin for an explicitly authorized, evidence-grounded GitHub Copilot briefing. GitHub Models is not used.

## Public-device compute model

GitHub Pages serves immutable static assets. After loading, the visitor's device validates input, downloads public evidence from GitHub, parses supported source, calculates deterministic rules, and renders the report. The publisher's computer is not in the request or analysis path, may be powered off, and contributes no runtime compute.

This model moves deterministic analysis cost to the visitor's browser; it does not remove GitHub's unauthenticated rate limits or the visitor's network and memory costs. The visible limits below bound that work. The optional service is a separate interpretation layer: it never changes the worker's evidence, score, confidence, ruleset, cache, or failure state.

## Data flow

```text
Repository URL
  → strict owner/repository validation
  → three GitHub REST reads
  → immutable commit + normalized recursive tree
  → deterministic bounded file selection
  → immutable raw text reads (maximum concurrency six)
  → lazy JS/TS and/or Python parser modules in a Web Worker
  → general evidence and project brief
  → deep analyzers and finalized coverage
  → bounded README-first reader report
  → isolated score input, versioned metrics, rules, confidence, and findings
  → descriptor preflight, detached clone, and strict report validation
  → optional snapshot-validated 15-minute session cache
  → bilingual React README-first rendering with a closed technical appendix
```

When expert mode is configured, a completed deterministic report can start this
independent branch after first-use consent:

```text
validated repository identity + inspected commit
  → no-scope GitHub OAuth App and opaque in-memory session
  → same-site POST /api/v1/deep-analysis with CSRF and NDJSON response
  → server re-verifies the public commit and fetches bounded public evidence
  → immutable, content-addressed evidence pack + public alternative shortlist
  → three parallel zero-tool Copilot specialist sessions
  → one zero-tool skeptic session
  → one zero-tool editor session
  → strict JSON, provenance, safety, evidence-reference, and narrative validation
  → server-side join of current community/maintenance facts
  → ten-chapter React expert briefing before the deterministic dossier
```

The browser keeps deterministic and expert state separate. An authorization,
allowance, model, cache, network, or stream failure cannot remove or rewrite the
deterministic report.

The main thread owns form state, language, progress, cancellation, report validation, and rendering. The worker owns acquisition, selection, raw-file scheduling, parser loading, metrics, and scoring. Commands and events use serializable typed objects with a request ID; late progress or results from an older run cannot replace a newer run.

Inside the worker, general evidence and the project brief are derived first. Then the deep analyzers finish and coverage is finalized. Next the bounded README-first reader report is derived from the same immutable snapshot. In other words, coverage and static analysis complete before the non-scoring reader report is derived; the reader report remains outside the unchanged scoring inputs, and scoring then runs from those unchanged inputs. More specifically, the isolated scoring input is scored without community popularity counts or reader evidence. The worker combines those products, and the complete report is strictly cloned and validated as a detached snapshot; that snapshot is strictly validated before it reaches the cache or UI. At the presentation boundary, the README evidence dossier renders before the decision summary and six reader chapters. Scores, confidence, rule evidence, refresh, and copy actions live in a closed technical appendix; opening the disclosure changes presentation only and does not refetch or recompute repository evidence.

The canonical report pipeline is contiguous: GitHub metadata and immutable tree evidence → preferred README selection and a single bounded safe scan → README interpretation and broad repository corroboration → unchanged scoring over a separate input → combined strict report guard → snapshot-validated session cache → React README-first UI and closed technical appendix. The analysis service validates the combined report, attempts the validated cache snapshot, and only then returns the report to React; denied or unavailable storage degrades safely without changing the evidence or UI order.

## Fixed endpoints

A fresh scan performs these three unauthenticated REST requests in dependency order:

```text
GET https://api.github.com/repos/{owner}/{repo}
GET https://api.github.com/repos/{owner}/{repo}/commits/{defaultBranch}
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{treeSha}?recursive=1
```

Every REST request uses exactly these API headers:

```text
X-GitHub-Api-Version: 2026-03-10
Accept: application/vnd.github+json
```

Selected text is then fetched only from an immutable URL constructed locally:

```text
https://raw.githubusercontent.com/{owner}/{repo}/{commitSha}/{encodedPath}
```

Owner, repository, moving default-branch name, commit/tree identifiers, and each path segment are validated and percent-encoded separately. RepoScope does not follow an arbitrary repository-provided content URL. The inspected commit SHA pins file links and raw reads even if the default branch moves later.

The optional browser client connects only to the single build-time
`REPOSCOPE_API_ORIGIN` and uses these service endpoints:

```text
GET  /api/v1/health
GET  /api/v1/session
GET  /api/v1/auth/start
GET  /api/v1/auth/callback
POST /api/v1/sign-out
POST /api/v1/deep-analysis
```

The analysis response is bounded, strictly ordered `application/x-ndjson`.
Cookies are opaque, `HttpOnly`, `SameSite=Lax`, and `Secure` in production;
state-changing requests require the session CSRF token. There is one active run
per session and at most five starts per rolling hour. Signing out deletes the
session, aborts the run, and removes its in-process allowance state.

Accepted input may use an omitted `https://` protocol, a terminal `.git`, one trailing slash, or explicit `:443`. After trimming outer whitespace and removing those accepted presentation variants, RepoScope produces the canonical HTTPS `github.com/{owner}/{repository}` form with exactly two non-empty path segments. Credentials, other explicit ports, subdomains, queries, fragments, additional path segments, duplicate/empty/dot segments, backslashes, encoded separators, controls, internal whitespace, and ambiguous forms are rejected before any request.

## Resource limits

The selection and worker scheduling layers enforce:

- at most 200 selected files;
- at most 200 eligible raw-text fetch attempts, including failures, across source, documentation, manifest, and configuration files;
- at most 10 MiB of successfully decoded eligible text across the scan;
- at most 256 KiB for any one eligible fetched text file, including source, documentation, manifest, and configuration text;
- at most six concurrent raw requests;
- a 15-second per-file timeout; and
- a 90-second source-fetch phase budget.

Only UTF-8 text is accepted. Streaming reads stop when the individual-file limit is crossed. Reaching a limit stops new scheduling without discarding already fetched safe evidence. Tree truncation, skipped files, failures, parser failures, unsupported source, and limits are recorded in coverage and confidence.

The recursive GitHub tree includes only validated ordinary blobs with normal file modes. Symlinks, submodules, malformed paths, duplicate paths, invalid sizes, binary/generated content, and excluded dependency/build/cache directories are never sent to a parser. Lockfile presence can be recorded from the tree without downloading its body.

## Analysis modules

The reader-report path is deliberately split into bounded extraction, deterministic assembly, strict transport validation, and presentation:

- `src/features/analyzers/reader-report/markdown.ts` extracts bounded human-facing Markdown evidence without rendering repository HTML.
- `src/features/analyzers/reader-report/commands.ts` keeps repository commands inert, classifies review-sensitive shapes, and never executes or guesses commands.
- `src/features/analyzers/reader-report.ts` assembles the canonical six-section, non-scoring reader evidence model.
- `src/features/worker/analysis.worker.ts` completes coverage and static analysis, derives reader evidence, and only then calls the unchanged scorer; reader evidence never enters the score input.
- `src/features/analysis/guards.ts` strictly validates the full report, frozen vocabularies, caps, source provenance, safety boundaries, and recomputed reader states.
- `src/features/cache/report-cache.ts` serializes, reparses, and validates a snapshot before storing the bounded report in `sessionStorage`.
- `src/components/reader-report.tsx` renders repository prose as React text with immutable source captions and inert command blocks.
- `src/components/readme-interpretation.tsx` renders the eight-region README evidence dossier, including reader takeaways, semantic community facts, ordered workflow, claim-versus-observation comparison, and canonical commentary.
- `src/components/technical-appendix.tsx` owns the default-closed scoring and methodology disclosure.
- `src/features/deep-analysis` owns the optional API origin, authorization and NDJSON client, strict browser guard, independent hook state, cancellation, and stale-result isolation.
- `server/github` re-verifies the already-inspected commit and acquires only bounded public evidence with the visitor's in-memory OAuth token.
- `server/evidence` sanitizes README/document text, derives conservative alternative queries, and builds immutable content-addressed evidence packs.
- `server/panel` creates isolated Copilot SDK sessions with `tools: []`, no built-in plugins, an empty temporary working directory, bounded responses, adversarial review, and strict output guards.
- `server/cache` stores only validated narrative drafts and public alternative facts under versioned SQLite keys with TTL, row, entry, and aggregate limits.
- `server/deep-analysis` coordinates acquisition, cache revalidation, specialist/skeptic/editor stages, current-fact joining, and the cancellable HTTP stream.

- `features/repository` parses canonical repository and share URLs.
- `features/github` validates hostile REST shapes, constructs the three endpoints, merges rate metadata, and streams bounded raw text.
- `features/scanner` normalizes the tree, classifies files, applies exclusions, and selects a stable diverse sample.
- `features/analyzers/general` reads bounded documentation, manifest, automation, community, and maintenance evidence without rendering Markdown.
- `features/analyzers/js-ts` and `features/analyzers/python` are lazy, same-origin, pure-JavaScript parser chunks loaded only when selected evidence needs them.
- `features/analyzers/cross-file` calculates approximate duplicates and relative-import cycles.
- `features/rules` applies ruleset `1.0.0`, applicability, confidence, and finding precedence.
- `features/worker` coordinates cancellation, concurrency, progress, parser isolation, and report assembly.
- `features/analysis/guards` validates the complete serializable result before use.
- `features/cache` treats browser storage as hostile and stores no source.
- React components render generated descriptors and remote values as text.

The analyzer facades retain their public contracts while implementation details stay private under their matching directories:

```text
src/features/analyzers/
├── python.ts
├── python/model.ts
├── python/syntax.ts
├── python/function-metrics.ts
├── python/bindings.ts
├── python/binding-flow.ts
├── python/evidence.ts
├── python/analyze-file.ts
├── cross-file.ts
├── cross-file/model.ts
├── cross-file/path-order.ts
├── cross-file/duplicate-index.ts
├── cross-file/duplicate-candidates.ts
├── cross-file/duplicate-selection.ts
├── cross-file/import-resolution.ts
└── cross-file/scc.ts
```

The Python dependency arrows (dependency → consumer) are:

- `model.ts → syntax.ts`;
- `model.ts + syntax.ts → bindings.ts + function-metrics.ts`;
- `bindings.ts + model.ts + syntax.ts → evidence.ts`;
- `bindings.ts + evidence.ts + function-metrics.ts + model.ts + syntax.ts → binding-flow.ts`; and
- `bindings.ts + binding-flow.ts + evidence.ts + function-metrics.ts → analyze-file.ts → python.ts` (with `analyze-file.ts` also using the shared model and syntax helpers).

The cross-file dependency arrows are:

- `model.ts → duplicate-index.ts`;
- `duplicate-index.ts + model.ts + path-order.ts → duplicate-candidates.ts`;
- `duplicate-candidates.ts + duplicate-index.ts + model.ts + path-order.ts → duplicate-selection.ts`;
- `model.ts + path-order.ts → import-resolution.ts`;
- `path-order.ts → scc.ts`; and
- `duplicate-selection.ts + import-resolution.ts + scc.ts → cross-file.ts` (with the facade also using the shared path comparator and internal model type).

Lower layers do not import their facade, and cyclic imports are prohibited.

The facades preserve `analyzePython(...)`, `computeDuplicateRatio(...)`, and `findCircularImports(...)`, including result fields and deterministic ordering. Dynamic imports still target the facades so the initial application, JavaScript/TypeScript analyzer, and Python analyzer remain independent chunks. Internal extraction does not change ruleset `1.0.0`, parser behavior, import resolution, duplicate selection, score calculations, evidence order, failure isolation, cancellation, or resource limits. Repository text remains untrusted input and is never executed.

Parsers never execute repository source. They do not install dependencies, run builds or tests, import remote modules, open repository HTML, or use WebAssembly.

## Cancellation and failure isolation

Starting another analysis, leaving the active analysis, or selecting cancel aborts in-flight work and terminates the run's worker. An overall phase controller combines the caller abort with the 90-second budget, while each raw read has its own 15-second timeout. Independent fetch and syntax failures are retained as bounded per-file coverage evidence so other safe files can still produce a partial report.

Worker completion is accepted only for the current request ID and only after strict report validation. A failed forced refresh preserves the last successful report and its share URL. An abort returns the interface to the latest intentional state without presenting a failure message.

An expert run has a separate monotonically increasing request identity and
`AbortController`. Changing repository or language, cancelling, signing out,
unmounting, losing the stream, or shutting down the server aborts the matching
Copilot sessions. Late chunks and late results cannot attach to another report.
The gateway bounds start, model listing, session creation, response, abort,
disconnect, deletion, and terminal stop. Provider errors are reduced to local
types; raw messages and cleanup errors are not returned to the browser.

## Cache and browser state

The cache key is versioned and scoped to the canonical lowercase repository slug. `sessionStorage` contains only a strictly validated final report, normalized public repository metadata, inspected commit SHA, coverage summary, ruleset version, and save time. The TTL is a 15-minute (`900000` millisecond) window, and one serialized entry is capped at 2 MiB.

Raw source bodies and raw GitHub responses are never persisted. Every nested field, enum, count, finite score, timestamp, SHA, path, repository identity, rule set, and unknown field boundary is validated when reading. Malformed, oversized, expired, future-dated, or cross-repository entries are deleted and treated as a miss. Storage denial or quota failure does not prevent analysis.

The only persistent preference is the exact language value `en` or `zh-CN` in local storage. A share URL stores only `owner/repository`; it contains no score, source, token, or language preference.

The optional API holds the OAuth token only in an opaque in-memory session for
up to eight idle hours. It is not written to browser storage, SQLite, URLs, model
prompts, or application logs. The 30-day narrative cache key includes canonical
repository/commit identity, evidence schema, prompt version, language, and model
capability class. It stores a strictly revalidated report draft without live
community metrics, raw evidence, prompts, transcripts, tokens, or session data.
The 24-hour alternative cache stores at most five strictly validated public
repository fact records. Both caches fail closed for malformed, oversized,
credential-shaped, future-dated, or expired rows and apply LRU plus aggregate
byte caps. Current Stars, Watch, Forks, issues, push time, archive state, and
license are refreshed and joined after a narrative cache hit.

## Content Security Policy

Production output contains one strict Content Security Policy:

```text
default-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

The production policy must not contain `unsafe-inline` or `unsafe-eval`. Static builds permit exactly three connection destinations: the same-origin hosting origin, `https://api.github.com`, and `https://raw.githubusercontent.com`. Configured builds append exactly the validated `REPOSCOPE_API_ORIGIN`; they do not add a wildcard or model/provider origin. There is no remote font/script/style/image, WebAssembly asset, tracker, or advertisement. Parser and worker chunks are same-origin static build assets. Development output omits the production meta policy because Vite's development runtime is not the deployed artifact.

## Hostile-content handling

Repository metadata, paths, trees, source, Markdown, manifests, parser input, worker messages, cached reports, response headers, and error conditions are all untrusted.

- REST objects are accepted only after narrow shape, string, timestamp, numeric, SHA, and mode validation.
- Raw URLs are constructed from validated components; arbitrary remote URLs are ignored.
- Text decoding is fatal UTF-8 and byte bounded.
- Markdown is scanned with a text state machine and never converted to HTML.
- Model prompts delimit repository content as hostile data, provide no tools, and accept only strict versioned role output; prompt instructions found in repository text have no authority.
- Model output is detached and revalidated for exact shape, evidence identity, provenance, uncertainty, live-metric separation, command safety, and unsupported security/privacy assurance before display or cache.
- React renders repository names, descriptions, paths, and generated evidence as text.
- Findings contain descriptors, counts, metrics, and locations, not raw code excerpts.
- New-tab GitHub links use immutable commits and `noopener noreferrer`.
- Transport errors are mapped to local types; remote bodies, messages, stack traces, and credentials are never rendered.

## Threat boundaries

RepoScope's security boundary covers the static application, its interaction with the visitor's browser and GitHub, and—only when configured—the same-site expert API and its GitHub Copilot SDK sessions. The static outbound allowlist has exactly three destinations; configured builds add one exact API origin.

**Repository author:** An inspected public repository may deliberately provide malformed metadata, oversized trees, hostile filenames, invalid text, parser stress cases, misleading prose, or HTML/script-shaped strings. Validation, limits, worker isolation, text-only rendering, and CSP constrain these inputs. Static analysis is still heuristic and parser/resource exhaustion can yield a partial report.

**GitHub and network:** RepoScope relies on GitHub Pages, `api.github.com`, and `raw.githubusercontent.com` availability and TLS. It reports typed failures and rate limits but does not defend against a compromised GitHub origin or browser trust store. The immutable commit reduces moving-ref races after snapshot resolution.

**GitHub OAuth and Copilot:** Expert mode relies on GitHub's OAuth and Copilot
service availability, the visitor's entitlement/allowance, and the provider's
model behavior. No-scope authorization does not grant private repository access.
Zero-tool sessions, hostile-data delimiters, skepticism, exact schemas, evidence
references, and server-side joins constrain the result but do not make model
interpretation deterministic or infallible. GitHub Models itself is not used.

**Visitor device:** Browser extensions, local malware, developer tools, storage tampering, constrained hardware, and shared-device access are outside the application's control. Cache validation prevents storage contents from becoming trusted report data; users remain responsible for their device and for not treating public-repository inspection as confidential processing.

**Publisher and hosting:** The publisher distributes static assets through GitHub Pages and can change future deployments. In static mode, the publisher's personal machine receives no scan traffic and supplies no runtime compute; GitHub Actions has least-privilege Pages permissions and uses no repository runtime secret. An expert-mode operator additionally controls the OAuth App, API host, in-memory sessions, and encrypted-at-rest persistent cache volume. The supplied container runs as non-root with read-only application files, but platform isolation, backups, logging, TLS termination, secret storage, deletion, and incident response remain operator responsibilities.

**Inspected-project assurance:** RepoScope does not execute code or inspect runtime behavior, dependencies, vulnerabilities, malware, secrets, legal compliance, or deployment configuration exhaustively. A high score or confidence is not a security, correctness, maintainability, or adoption guarantee.

## Deployment boundary

CI performs a frozen dependency install, lint, formatting check, browser and server TypeScript checks, coverage, production builds, bundle budgets, deterministic Chromium E2E, and a three-run Lighthouse gate. The Pages workflow repeats validation, builds with `REPOSCOPE_BASE_PATH=/<repository-name>/`, optionally injects one non-secret API origin, uploads only `dist`, and deploys through GitHub's Pages actions.

Production JavaScript is capped at 200 KiB gzip initially, CSS at 50 KiB gzip, and each lazy analyzer at 500 KiB gzip. Static deployment needs no token input, backend secret, service worker, or publisher workstation. Optional expert deployment uses the pinned Node 24 container, a persistent `/data` volume, a same-site custom API domain, protected OAuth App credentials, and a dated passing two-reviewer quality scorecard. Exact setup and incident steps are in [deep-analysis-deployment.md](deep-analysis-deployment.md).
