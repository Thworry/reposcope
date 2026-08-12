# RepoScope architecture and threat boundaries

RepoScope is a static React/Vite application hosted by GitHub Pages. The visitor's browser communicates directly with GitHub and performs static analysis in a module Web Worker. There is no RepoScope application server, account system, token exchange, database, analytics collector, advertising service, or AI provider.

## Public-device compute model

GitHub Pages serves immutable static assets. After loading, the visitor's device validates input, downloads public evidence from GitHub, parses supported source, calculates deterministic rules, and renders the report. The publisher's computer is not in the request or analysis path, may be powered off, and contributes no runtime compute.

This model moves analysis cost to the visitor's browser; it does not remove GitHub's unauthenticated rate limits or the visitor's network and memory costs. The visible limits below bound that work.

## Data flow

```text
Repository URL
  → strict owner/repository validation
  → three GitHub REST reads
  → immutable commit + normalized recursive tree
  → deterministic bounded file selection
  → immutable raw text reads (maximum concurrency six)
  → lazy JS/TS and/or Python parser modules in a Web Worker
  → versioned metrics, rules, confidence, and findings
  → strict report validation
  → bilingual React text rendering
  → optional validated 15-minute session cache
```

The main thread owns form state, language, progress, cancellation, report validation, and rendering. The worker owns acquisition, selection, raw-file scheduling, parser loading, metrics, and scoring. Commands and events use serializable typed objects with a request ID; late progress or results from an older run cannot replace a newer run.

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

## Cache and browser state

The cache key is versioned and scoped to the canonical lowercase repository slug. `sessionStorage` contains only a strictly validated final report, normalized public repository metadata, inspected commit SHA, coverage summary, ruleset version, and save time. The TTL is a 15-minute (`900000` millisecond) window, and one serialized entry is capped at 2 MiB.

Raw source bodies and raw GitHub responses are never persisted. Every nested field, enum, count, finite score, timestamp, SHA, path, repository identity, rule set, and unknown field boundary is validated when reading. Malformed, oversized, expired, future-dated, or cross-repository entries are deleted and treated as a miss. Storage denial or quota failure does not prevent analysis.

The only persistent preference is the exact language value `en` or `zh-CN` in local storage. A share URL stores only `owner/repository`; it contains no score, source, token, or language preference.

## Content Security Policy

Production output contains one strict Content Security Policy:

```text
default-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com; img-src 'self' data:; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

The production policy must not contain `unsafe-inline` or `unsafe-eval`. It permits exactly three connection destinations: the same-origin hosting origin, `https://api.github.com`, and `https://raw.githubusercontent.com`. There is no remote font/script/style/image, WebAssembly asset, tracker, or advertisement. Parser and worker chunks are same-origin static build assets. Development output omits the production meta policy because Vite's development runtime is not the deployed artifact.

## Hostile-content handling

Repository metadata, paths, trees, source, Markdown, manifests, parser input, worker messages, cached reports, response headers, and error conditions are all untrusted.

- REST objects are accepted only after narrow shape, string, timestamp, numeric, SHA, and mode validation.
- Raw URLs are constructed from validated components; arbitrary remote URLs are ignored.
- Text decoding is fatal UTF-8 and byte bounded.
- Markdown is scanned with a text state machine and never converted to HTML.
- React renders repository names, descriptions, paths, and generated evidence as text.
- Findings contain descriptors, counts, metrics, and locations, not raw code excerpts.
- New-tab GitHub links use immutable commits and `noopener noreferrer`.
- Transport errors are mapped to local types; remote bodies, messages, stack traces, and credentials are never rendered.

## Threat boundaries

RepoScope's security boundary covers the static application and its interaction with a visitor's browser and GitHub. Its outbound connection allowlist has exactly three connection destinations: the same-origin hosting origin, `https://api.github.com`, and `https://raw.githubusercontent.com`.

**Repository author:** An inspected public repository may deliberately provide malformed metadata, oversized trees, hostile filenames, invalid text, parser stress cases, misleading prose, or HTML/script-shaped strings. Validation, limits, worker isolation, text-only rendering, and CSP constrain these inputs. Static analysis is still heuristic and parser/resource exhaustion can yield a partial report.

**GitHub and network:** RepoScope relies on GitHub Pages, `api.github.com`, and `raw.githubusercontent.com` availability and TLS. It reports typed failures and rate limits but does not defend against a compromised GitHub origin or browser trust store. The immutable commit reduces moving-ref races after snapshot resolution.

**Visitor device:** Browser extensions, local malware, developer tools, storage tampering, constrained hardware, and shared-device access are outside the application's control. Cache validation prevents storage contents from becoming trusted report data; users remain responsible for their device and for not treating public-repository inspection as confidential processing.

**Publisher and hosting:** The publisher distributes static assets through GitHub Pages and can change future deployments. The publisher's personal machine receives no scan traffic and supplies no runtime compute. GitHub Actions has least-privilege Pages permissions and uses no repository runtime secret.

**Inspected-project assurance:** RepoScope does not execute code or inspect runtime behavior, dependencies, vulnerabilities, malware, secrets, legal compliance, or deployment configuration exhaustively. A high score or confidence is not a security, correctness, maintainability, or adoption guarantee.

## Deployment boundary

CI performs a frozen dependency install, lint, formatting check, TypeScript check, coverage, production build, bundle budgets, deterministic Chromium E2E, and three-run Lighthouse gate. The Pages workflow repeats validation, builds with `REPOSCOPE_BASE_PATH=/<repository-name>/`, uploads only `dist`, and deploys through GitHub's Pages actions.

Production JavaScript is capped at 200 KiB gzip initially, CSS at 50 KiB gzip, and each lazy analyzer at 500 KiB gzip. The public deployment needs no token input, backend secret, service worker, or publisher workstation.
