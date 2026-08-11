# RepoScope 项目透视 — Product and Technical Design

**Status:** Approved design awaiting written-spec review

**Date:** 2026-08-11

**Ruleset:** `1.0.0`

## 1. Product summary

RepoScope 项目透视 is a public, bilingual, read-only GitHub repository inspector. A visitor pastes the URL of a public GitHub repository and receives an explainable report covering documentation, operability evidence, code readability, structural complexity, testing and automation, and maintenance health.

The application is a static site. GitHub Pages serves the files; public repository data travels directly between the visitor's browser and GitHub; analysis runs in a Web Worker on the visitor's device. RepoScope has no application backend, account system, database, token exchange, analytics, advertising, or AI service.

The initial release supports general inspection for all repositories and deep source analysis for JavaScript, TypeScript, and Python. It does not execute repository code and cannot prove that software works correctly.

### Brand

- English product name: **RepoScope**
- Chinese product name: **项目透视**
- English positioning: **See a public project's quality, complexity, and room to improve.**
- Chinese positioning: **看懂一个公开项目的质量、复杂度与改进空间。**

The name is provisional for the first implementation cycle but is the canonical name in code, copy, documentation, package metadata, and deployment until the user explicitly renames it.

## 2. Users and jobs

RepoScope serves two audiences in one guided report:

1. A potential user or contributor wants to know whether a project is understandable, appears operable, is maintained, and is approachable.
2. A maintainer wants concrete, prioritized, file-linked evidence about strengths, technical debt, and the next improvements worth making.

The report therefore begins with a plain-language conclusion and gradually reveals dimensions, strengths, risks, recommendations, and file-level evidence. It is not a dense expert-only dashboard.

## 3. Goals

- Analyze any supported public `github.com` repository without login or a personal access token.
- Produce a deterministic overall score, six dimension scores, a confidence score, strengths, weaknesses, and prioritized improvements.
- Tie every scored result and recommendation to a versioned rule and inspectable evidence.
- Keep the analysis safe: remote source is untrusted text and is never executed, imported, evaluated, or rendered as HTML.
- Remain transparent about sampling, unsupported languages, failed downloads, parse failures, and truncated GitHub responses.
- Provide complete English and Simplified Chinese experiences from the first release.
- Deploy as a public GitHub Pages project with no runtime secrets or personal-machine involvement.

## 4. Non-goals

Version `0.1.0` will not:

- inspect private repositories or request GitHub credentials;
- clone with Git, execute builds, run tests, install dependencies, or open repository-produced HTML;
- claim that a project is functionally correct, secure, vulnerability-free, or safe to adopt;
- perform a security audit, malware scan, license-compliance ruling, dependency-vulnerability lookup, or secret scan;
- use an LLM, generate probabilistic findings, or send source code to an AI provider;
- provide repository rankings, historical trends, organization dashboards, accounts, saved projects, or collaboration features;
- guarantee full-repository analysis when GitHub or product limits require sampling;
- deeply parse languages other than JavaScript, TypeScript, and Python.

## 5. User experience

### 5.1 Landing page

The landing page contains:

- the RepoScope / 项目透视 brand and one-sentence explanation;
- a persistent `English / 简体中文` language switch;
- one field accepting a full public GitHub repository URL;
- one primary **Analyze repository / 分析项目** action;
- two public example buttons: `Thworry/issueready` for TypeScript and `psf/requests` for Python; these are conveniences, not test fixtures;
- a short privacy statement: read-only, no login, no token, browser-side analysis;
- a link to the complete versioned methodology.

Only HTTPS `github.com/{owner}/{repository}` URLs with exactly two path segments are accepted. The parser trims outer whitespace and normalizes an omitted protocol to HTTPS, one trailing slash, and a terminal `.git`. It rejects credentials, non-default ports, subdomains, query strings, fragments, additional path segments, backslashes, dot segments, empty segments, and non-GitHub hosts. Invalid input causes zero network requests.

### 5.2 Progress

Analysis exposes five cancellable phases:

1. Validate the repository URL.
2. Fetch repository metadata, the default-branch commit, and the recursive file tree.
3. Rank eligible files and disclose the planned scope.
4. Download selected public text with visible file-count and byte progress.
5. Parse and score in a Web Worker, then assemble the report.

Progress text is announced accessibly. Starting a new analysis or leaving the analysis view aborts in-flight work. An earlier analysis can never overwrite the state of a later one.

### 5.3 Guided report

The selected layout is **A — guided report**. Report order is fixed:

1. Repository identity, scan timestamp, inspected commit, overall score, confidence label, and scope summary.
2. Six dimension scores with short explanations.
3. Three to five evidence-backed strengths.
4. High-, medium-, and low-priority weaknesses and improvements.
5. A coverage panel listing selected, fetched, parsed, skipped, failed, and unsupported files and bytes.
6. A filterable evidence explorer with rule, severity, path, line range when available, evidence, and suggested action.
7. A methodology disclosure containing ruleset version, weights, thresholds, exclusions, and limitations.

The report offers:

- a link to each referenced file at the inspected commit;
- a **Copy improvement checklist** action that emits localized Markdown;
- a **Refresh public data** action that bypasses the cache;
- a share URL in the form `?repo=owner%2Frepository` after a successful analysis.

The report never renders remote Markdown or HTML. Repository names, descriptions, paths, and other remote values are rendered as text. Findings store numeric evidence and file locations, not raw code excerpts.

### 5.4 Bilingual behavior

- Every application-owned string ships in English and Simplified Chinese, including progress, errors, rules, evidence explanations, recommendations, accessibility names, metadata, documentation summaries, and copied Markdown.
- First visit selects Simplified Chinese when the browser's preferred language begins with `zh`; otherwise it selects English.
- An explicit language switch is always visible and uses native buttons with a pressed state.
- The preference is stored locally and contains only the language code.
- Language switching does not refetch or recompute a report.
- The share URL stores only the repository slug. Each viewer sees the report in that viewer's selected language.
- Remote repository prose, code, identifiers, paths, and rule IDs remain unchanged; RepoScope does not machine-translate them.
- English and Chinese rules must be semantically equivalent and tested against the same rule keys and numeric results.

## 6. Data acquisition

### 6.1 REST requests

A fresh scan uses GitHub REST API version `2026-03-10` and the recommended JSON media type. It sends three unauthenticated, read-only REST requests in sequence where dependencies require it:

```text
GET https://api.github.com/repos/{owner}/{repo}
GET https://api.github.com/repos/{owner}/{repo}/commits/{defaultBranch}
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{treeSha}?recursive=1
```

The repository response supplies public identity, description, default branch, archive state, timestamps, repository size, issue count, topics, and other public metadata used by general rules. The commit response pins the analysis to an immutable commit SHA and supplies the tree SHA. The recursive tree supplies paths, blob sizes, modes, types, and blob SHAs.

Public unauthenticated REST requests are associated with the visitor's originating IP and currently have a primary limit of 60 requests per hour. RepoScope displays remaining/reset headers when GitHub provides them and caches completed reports to avoid waste.

### 6.2 Source requests

After deterministic selection, text files are fetched from immutable URLs shaped as:

```text
https://raw.githubusercontent.com/{owner}/{repo}/{commitSha}/{encodedPath}
```

Source requests use at most six concurrent connections. They have a 15-second per-file timeout and a 90-second overall source-fetch budget. The user may cancel earlier. No ref that can move after the initial commit resolution is used.

The production Content Security Policy permits connections only to the site's own origin, `https://api.github.com`, and `https://raw.githubusercontent.com`.

### 6.3 Hard limits

The scanner enforces all of these limits before parsing:

- at most 200 selected files and at most 200 source-fetch attempts, whether they succeed or fail;
- at most 10 MiB of decoded text across fetched files;
- at most 256 KiB for an individual source or documentation file;
- at most six concurrent source requests;
- at most 90 seconds for the source-fetch phase;
- UTF-8 text only, with an explicit invalid-text skip state;
- recursive tree limits and the GitHub `truncated` flag preserved as report evidence.

Reaching a limit stops additional selection or download without discarding already fetched safe data. The report becomes partial and confidence decreases.

### 6.4 Exclusions

The scanner never fetches tree entries that are not ordinary blobs. It excludes binary and generated extensions plus paths under dependency, vendor, generated, build, coverage, cache, and version-control directories, including these normalized path segments:

```text
.git, .hg, .svn, node_modules, vendor, third_party, dist, build, out,
coverage, .coverage, .cache, .next, .nuxt, target, bin, obj, __pycache__,
.venv, venv
```

It excludes source maps, minified files, media, fonts, archives, compiled objects, executables, databases, package caches, and lockfile bodies. The tree-level presence of a recognized lockfile contributes the maintenance lockfile signal without downloading its contents.

### 6.5 Deterministic file selection

Eligible files receive a stable priority and are then ordered by priority, normalized path, and blob SHA. The priority tiers are:

1. README, license, contribution, security, code-of-conduct, changelog, architecture, and setup documentation.
2. Package manifests, build/test/type/lint configuration, CI workflows, dependency-update configuration, environment examples, and deployment configuration.
3. Recognized entry points and top-level source modules.
4. Test files paired with selected source areas.
5. Supported-language source sampled across top-level directories in round-robin order so one large folder cannot consume the full budget.
6. Remaining eligible documentation and supported source.

Selection stops at the hard file and declared-size budgets. A selected file that fails validation or fetching is recorded and does not silently disappear. The implementation must make selection pure and reproducible from the same repository, commit, tree, and limits.

## 7. Analysis pipeline and module boundaries

RepoScope uses small modules with typed boundaries:

- **repository URL** — parsing, canonicalization, share-query serialization, and share-query parsing;
- **GitHub client** — the three REST requests, immutable raw-file reads, rate-limit headers, timeouts, aborts, and typed transport/status errors;
- **tree normalizer** — untrusted response validation, path normalization, file-type classification, exclusions, and tree completeness;
- **selector** — deterministic priority, diversity sampling, and byte/file budgets;
- **language registry** — extension mapping and lazy parser registration;
- **worker protocol** — serializable scan input, progress events, cancellation, findings, metrics, and failures;
- **general analyzer** — repository files, manifests, scripts, documentation, automation, and maintenance signals;
- **JS/TS analyzer** — AST-derived functions, branches, nesting, identifiers, imports, and duplication tokens;
- **Python analyzer** — AST-derived functions, branches, nesting, identifiers, imports, and duplication tokens;
- **rules engine** — versioned dimension scores, overall score, applicability, confidence, strengths, weaknesses, and priorities;
- **cache** — validated final report and public metadata only; never raw source bodies;
- **report UI** — guided summary, dimensions, findings, coverage, copy, refresh, and methodology;
- **i18n** — exhaustive English and Simplified Chinese message dictionaries keyed by stable semantic IDs.

JavaScript, TypeScript, and Python parsers are pure-JavaScript, static, same-origin modules loaded only after the selected file set shows that they are needed. They must work under `script-src 'self'` without WebAssembly, `unsafe-eval`, or another CSP execution exception. Parser code does not execute repository source.

## 8. Ruleset `1.0.0`

### 8.1 Score model

The complete score has six dimensions totaling 100 points when all dimensions are applicable:

| Dimension                    | Weight |
| ---------------------------- | -----: |
| Documentation and onboarding |     15 |
| Operability evidence         |     20 |
| Code readability             |     20 |
| Complexity and structure     |     20 |
| Testing and automation       |     15 |
| Maintenance health           |     10 |

Each signal is `passed`, `partial`, `failed`, or `not-applicable`. Passed earns full signal points, partial earns the explicitly listed partial points, failed earns zero, and not-applicable is removed from that dimension's available points. A dimension with no applicable points is shown as unavailable rather than zero.

The overall score is the weighted mean of applicable dimensions, normalized to 100 and rounded to the nearest integer. If readability or complexity is unavailable because supported source was not parsed, the overall score is labeled **general-only** and **preliminary**. Scores from reports with different applicable dimensions must not be presented as directly comparable.

### 8.2 Documentation and onboarding — 15

| Signal                                                                      | Full |                                               Partial |
| --------------------------------------------------------------------------- | ---: | ----------------------------------------------------: |
| Preferred README exists                                                     |    3 |                                                     — |
| README has an installation/setup heading and at least one command block     |    3 |                    heading without a command block: 1 |
| README has a usage/run heading and at least one command or concrete example |    3 |                  heading without a command/example: 1 |
| Contribution guide exists                                                   |    2 |                                                     — |
| Recognized license file exists                                              |    2 |               repository API license metadata only: 1 |
| Architecture, code map, or explicit repository-structure explanation exists |    2 | README names at least three top-level source areas: 1 |

Heading matching is case-insensitive and uses versioned English and Chinese synonym lists documented with the ruleset.

### 8.3 Operability evidence — 20

| Signal                                                                                                                     | Full |                                                                       Partial |
| -------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------: |
| Recognized package/build manifest exists                                                                                   |    4 |                                                                             — |
| A recognized executable entry point or application/library export is identifiable                                          |    4 |                               likely entry point by conventional path only: 2 |
| Manifest or documented command provides run/build behavior                                                                 |    4 |                                      only one of run or build is evidenced: 2 |
| Example, demo, sample, or concrete API usage exists                                                                        |    3 |                                               prose-only usage description: 1 |
| Error-handling constructs appear in at least 5% of parsed non-test functions, capped as evidence rather than quality proof |    2 |                                                           present below 5%: 1 |
| Changelog, history, or release-notes file contains at least one version heading                                            |    2 | a manifest declares a non-empty version but no version-history file exists: 1 |
| Environment/configuration example or explicit configuration section exists                                                 |    1 |                                                                             — |

This dimension is always described as operability evidence. It never states that the software was executed or works correctly.
The error-handling signal is not applicable when the deep parser applicability threshold is not met.

### 8.4 Code readability — 20

This dimension applies only when at least five non-generated JS, TS, or Python source files or at least 2,000 supported source lines parse successfully.

| Signal                                                                                 | Full |                 Partial |
| -------------------------------------------------------------------------------------- | ---: | ----------------------: |
| Median non-test function length is at most 40 logical lines                            |    4 |                41–60: 2 |
| 90th-percentile non-test function length is at most 80 logical lines                   |    4 |               81–120: 2 |
| Files over 500 logical lines are at most 10% of parsed source files                    |    4 | over 10% through 20%: 2 |
| Median function nesting depth is at most 3                                             |    3 |                    4: 1 |
| Ambiguous short identifier occurrences are at most 10% of identifier occurrences       |    3 | over 10% through 20%: 1 |
| At least 20% of exported/public declarations have an adjacent doc comment or docstring |    2 |   10% through 19.99%: 1 |

Logical lines exclude blank and comment-only lines. The short-identifier rule excludes language keywords and a fixed allowlist of conventional names documented with the ruleset. Findings show that this is a heuristic, not a naming verdict.

### 8.5 Complexity and structure — 20

This dimension has the same applicability threshold as readability.

| Signal                                                 | Full |                                                  Partial |
| ------------------------------------------------------ | ---: | -------------------------------------------------------: |
| Median cyclomatic complexity is at most 5              |    4 |                                                   6–8: 2 |
| 90th-percentile cyclomatic complexity is at most 15    |    5 |                                                 16–25: 2 |
| Maximum function nesting depth is at most 5            |    3 |                                                   6–7: 1 |
| No parsed source file exceeds 1,000 logical lines      |    3 |                                  at most 2% exceed it: 1 |
| Approximate normalized-token duplication is at most 5% |    3 |                                   over 5% through 10%: 1 |
| No resolvable internal circular import is found        |    2 | one strongly connected component containing two files: 1 |

Cyclomatic complexity begins at 1 and increments for decision branches defined per parser in the methodology. Duplication uses normalized token windows, ignores comments/whitespace/literals, excludes tests and generated files, requires a duplicated span of at least 50 tokens, and reports matches as approximate.

### 8.6 Testing and automation — 15

| Signal                                                        | Full |                           Partial |
| ------------------------------------------------------------- | ---: | --------------------------------: |
| Recognized test files exist                                   |    4 | only test configuration exists: 1 |
| Test-file to supported-source-file ratio is at least 0.25     |    3 |            0.10 through 0.2499: 1 |
| CI workflow/configuration exists                              |    3 |                                 — |
| A recognized test command exists                              |    2 |            README-only command: 1 |
| A recognized lint, type-check, or static-check command exists |    2 |            README-only command: 1 |
| Coverage configuration or coverage command exists             |    1 |                                 — |

This dimension detects testing evidence and automation configuration; it does not claim tests pass or measure runtime coverage.
The test/source ratio signal is not applicable when the tree contains no supported-language source file.

### 8.7 Maintenance health — 10

| Signal                                                                     | Full |               Partial |
| -------------------------------------------------------------------------- | ---: | --------------------: |
| Repository is not archived and `pushed_at` is within 180 days              |    2 |       181–365 days: 1 |
| Recognized dependency lockfile exists                                      |    2 |                     — |
| Dependabot or Renovate configuration exists                                |    1 |                     — |
| Issue or pull-request templates exist                                      |    1 |                     — |
| Security policy exists                                                     |    1 |                     — |
| Code of conduct exists                                                     |    1 |                     — |
| Changelog, history, or release-notes file with a version heading exists    |    1 |                     — |
| No committed dependency/build/cache directory appears in the analyzed tree |    1 | one such directory: 0 |

The analysis timestamp is explicit, and all date thresholds use exact elapsed 24-hour days in UTC.

### 8.8 Overall labels

- `85–100`: Strong evidence / 证据较强
- `70–84`: Solid foundation / 基础扎实
- `50–69`: Needs attention / 需要关注
- `0–49`: Limited evidence / 证据有限

These labels describe observed repository evidence, not project worth or safety.

### 8.9 Confidence

Confidence is separate from quality. It is calculated before rounding as:

```text
confidence = 100 × (
  0.25 × treeCompleteness +
  0.35 × eligibleByteCoverage +
  0.40 × supportedParserCoverage
)
```

Where:

- `treeCompleteness` is `1` when GitHub reports a complete recursive tree and `0` when it reports `truncated`, because the omitted share is unknowable;
- `eligibleByteCoverage` is successfully decoded eligible bytes divided by all eligible bytes declared by the available tree, clamped to `[0, 1]`;
- `supportedParserCoverage` is successfully parsed JS/TS/Python bytes divided by all eligible source bytes, with unsupported-language bytes remaining in the denominator, clamped to `[0, 1]`.

The displayed integer is rounded to the nearest whole percent.

- `80–100`: High confidence / 高可信度
- `60–79`: Medium confidence / 中可信度
- `0–59`: Low confidence / 低可信度

A low-confidence report is marked preliminary. A tree truncated by GitHub can never reach high confidence under this formula. A repository with no supported-language source can still receive a general report but cannot receive high confidence.

### 8.10 Strengths, weaknesses, and priority

- Strength candidates are passed signals with concrete evidence, ordered by signal points descending, then rule ID; show at most five and no more than two from one dimension.
- Weakness candidates are failed or partial signals with concrete evidence, ordered by improvement priority, available lost points, then rule ID.
- Priority is deterministic: **high** for a failed signal worth at least 4 points or any cluster of failed signals losing at least 40% of a dimension; **medium** for other failed signals or partial signals worth at least 2 lost points; **low** for the remaining partial signals.
- Recommendations are versioned bilingual templates populated only with paths, line ranges, counts, and metrics. No generated prose is inferred from source semantics.

### 8.11 Ruleset dictionaries and syntax definitions

All path comparisons are case-insensitive after POSIX-separator normalization. A trailing extension wildcard below means any text/documentation extension already accepted by the scanner; it does not permit a binary file.

The canonical repository-file sets are:

- README: root or `.github/` basename beginning `README`.
- License: root basename beginning `LICENSE`, `LICENCE`, or `COPYING`.
- Contribution: root, `.github/`, or `docs/` basename beginning `CONTRIBUTING`.
- Security: root, `.github/`, or `docs/` basename `SECURITY`.
- Code of conduct: root, `.github/`, or `docs/` basename beginning `CODE_OF_CONDUCT`.
- Version history: root or `docs/` basename beginning `CHANGELOG`, `CHANGES`, `HISTORY`, or `RELEASES`.
- Architecture: root or `docs/` basename beginning `ARCHITECTURE`, or a README section matched by the architecture heading dictionary.
- Package/build manifests: `package.json`, `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Pipfile`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `composer.json`, `Gemfile`, `Package.swift`, `pubspec.yaml`, `CMakeLists.txt`, `Makefile`, `Taskfile.yml`, `Taskfile.yaml`, `justfile`, any root `*.csproj`, and any root `*.sln`.
- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `bun.lock`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`, and `Package.resolved`.
- CI: `.github/workflows/*.yml`, `.github/workflows/*.yaml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `Jenkinsfile`, `.travis.yml`, `bitbucket-pipelines.yml`, or `appveyor.yml`.
- Dependency updates: `.github/dependabot.yml`, `.github/dependabot.yaml`, `renovate.json`, `renovate.json5`, `.renovaterc`, `.renovaterc.json`, or `.renovaterc.json5`.
- Issue/PR templates: an ordinary file below `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE/`, or `.github/pull_request_template.md`.
- Coverage configuration: `.coveragerc`, `coverage.xml`, `codecov.yml`, `codecov.yaml`, `.codecov.yml`, `.codecov.yaml`, `jest.config.*`, `vitest.config.*`, `nyc.config.*`, or a recognized manifest command containing `coverage` as a command token.
- Environment/config examples: `.env.example`, `.env.sample`, `config.example.*`, `config.sample.*`, `example.config.*`, or `sample.config.*`.

The deep-parser source extensions are `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, and `.py`. Generated `.d.ts` and interface-only `.pyi` files participate only in internal-import resolution and are excluded from function and source-line denominators. The general recognized-source registry additionally includes `.go`, `.rs`, `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.java`, `.kt`, `.kts`, `.cs`, `.fs`, `.fsx`, `.rb`, `.php`, `.swift`, `.dart`, `.scala`, `.sc`, `.sh`, `.bash`, `.zsh`, `.fish`, `.lua`, `.r`, `.R`, `.ex`, `.exs`, `.erl`, `.hrl`, `.clj`, `.cljs`, `.hs`, `.lhs`, `.vue`, `.svelte`, and `.astro`. Files outside this registry can still contribute documentation, manifest, configuration, and maintenance evidence but not source-byte or test/source-ratio denominators.

Markdown heading matching applies Unicode NFKC normalization, strips inline Markdown markers, lowercases, collapses punctuation/whitespace, and compares whole normalized words against these versioned phrases:

- Installation/setup English: `install`, `installation`, `setup`, `getting started`, `quick start`, `prerequisites`.
- Installation/setup Chinese: `安装`, `配置环境`, `环境要求`, `准备工作`, `快速开始`.
- Usage/run English: `usage`, `use`, `run`, `running`, `example`, `examples`, `quick start`.
- Usage/run Chinese: `使用`, `用法`, `运行`, `示例`, `快速开始`.
- Architecture/structure English: `architecture`, `structure`, `project layout`, `repository layout`, `codebase`, `code map`.
- Architecture/structure Chinese: `架构`, `结构`, `项目结构`, `目录结构`, `代码结构`, `代码地图`.
- Configuration English: `configuration`, `config`, `environment variables`, `settings`.
- Configuration Chinese: `配置`, `环境变量`, `设置`.

A command block is a fenced code block whose first non-comment token is not prose punctuation and which contains a known command executable or prompt-free invocation. The initial executable allowlist is `npm`, `npx`, `pnpm`, `yarn`, `bun`, `node`, `deno`, `python`, `python3`, `pip`, `pip3`, `uv`, `poetry`, `pytest`, `tox`, `make`, `just`, `task`, `go`, `cargo`, `mvn`, `gradle`, `gradlew`, `dotnet`, `swift`, `docker`, and `docker-compose`. Shell prompts `$` and `>` are stripped before matching.

Structured JS/TS evidence is read from valid `package.json` fields. Entry-point evidence uses non-empty `main`, `module`, `browser`, `bin`, or `exports`, or a selected conventional source basename `index`, `main`, `app`, `server`, or `cli`. Run/build evidence uses script keys `start`, `dev`, `serve`, or `build`. Test evidence uses `test` or a key beginning `test:`. Static-check evidence uses a key equal to or beginning with `lint`, `typecheck`, `type-check`, `check`, or `format:check`.

Structured Python entry-point evidence uses `[project.scripts]`, `[project.gui-scripts]`, `[tool.poetry.scripts]`, `console_scripts`, or a selected `__main__.py`, top-level `main.py`, `app.py`, or `cli.py`. Test evidence uses a selected configuration section/file for `pytest`, `unittest`, `tox`, or `nox`, or a documented command whose executable is one of those tools. Static-check evidence uses selected configuration or commands for `ruff`, `mypy`, `pyright`, `flake8`, `pylint`, or `black --check`.

Test files are files in the recognized-source registry that match a path segment `test`, `tests`, `__tests__`, `spec`, or `specs`; a JS/TS basename containing `.test.` or `.spec.`; or a Python basename matching `test_*.py` or `*_test.py`. Generated declaration files ending `.d.ts` are not source files for score denominators.

A version-history heading matches a normalized line beginning with an optional Markdown heading marker, optional `v`, and a semantic numeric version containing at least `major.minor`. A manifest-only version is partial evidence when its trimmed value is non-empty and not `0.0.0`, `0.0.0-development`, `private`, or `workspace`.

Deep syntax metrics use these definitions:

- JS/TS functions: function declarations/expressions, arrow functions, object/class methods, getters, and setters. Python functions: `FunctionDef` and `AsyncFunctionDef`.
- JS/TS cyclomatic increments: `if`, each loop, `catch`, each non-default `switch` case, conditional expressions, and each `&&`, `||`, or `??` short-circuit branch. Python increments: `if`, `for`, `async for`, `while`, exception handlers, conditional expressions, each additional Boolean operand, and each non-default `match` case.
- Nesting increments only when a function contains another function or one of the decision/loop/exception/switch/match constructs above. Sequential constructs do not increase nesting.
- Error handling: JS/TS `try`, `catch`, or `throw` within a function; Python `try`, exception handlers, or `raise` within a function. A function counts once regardless of construct count.
- Ambiguous short identifiers: one- or two-code-point local variable, parameter, function, method, class, or imported-binding names after excluding keywords and this exact lowercase allowlist: `_`, `i`, `j`, `k`, `x`, `y`, `z`, `id`, `ok`, `db`, `fs`, `io`, `ui`, `api`, `url`, `uri`, `ip`, `os`, `re`, `rx`, `tx`, `err`, `req`, `res`, `ctx`.
- Documentation adjacency: a JS/TS exported declaration has a JSDoc block ending on the immediately preceding nonblank line; a Python public top-level function/class or public method has a first-statement string docstring. Python names beginning `_` are non-public.
- Internal imports: only relative JS/TS imports and relative Python imports are resolved. JS/TS resolution checks the explicit path, supported extensions, and `index` files. Python resolution follows package directories and `__init__.py`. Unresolved, dynamic, package, and type-only imports do not create graph edges.
- Duplicate ratio: tokenize non-test parsed source; discard comments and whitespace; replace string, template, and numeric literals with typed placeholders; preserve identifiers and operators; hash consecutive 50-token windows; require matching spans to occur in different files and extend matches maximally; discard overlapping matches; divide tokens belonging to duplicate spans by total eligible tokens.

All thresholds use exact inclusive boundaries as written. Percentages are calculated from unrounded counts; only displayed values are rounded.

## 9. Error and degradation behavior

- **Invalid URL:** inline validation; no request and no retry action.
- **Not found:** explain that the repository may not exist or may not be public; never guess which.
- **Rate limit:** show GitHub's reset time in the selected locale when valid and provide a retry action only after the state can change.
- **Network/API error:** show a safe typed message and retry; never render remote error bodies, stack traces, or tokens.
- **Empty repository:** explain that no source tree exists and stop without a score.
- **Truncated tree:** continue with the returned tree, mark partial, lower confidence, and disclose GitHub's limit.
- **Fetch timeout/failure:** preserve per-file failure evidence, continue with other selected files, and lower coverage/confidence.
- **Invalid UTF-8 or binary:** skip with reason; do not coerce arbitrary bytes into text.
- **Parser failure:** fall back to general/file-level evidence for that file, preserve the failure count, and lower parser coverage.
- **Unsupported language:** produce only applicable general dimensions; mark readability and complexity unavailable and overall score general-only/preliminary.
- **Hard limit reached:** stop scheduling new source requests, finish in-flight safe work, and generate a partial report.
- **Worker failure:** terminate the worker, discard incomplete scores, and offer a clean retry.
- **Abort:** remain silent except for returning the UI to its latest intentional state.

A failed refresh never replaces a previously successful report or changes the share URL.

## 10. Cache and browser state

- Cache only the validated final report, normalized public repository metadata, inspected commit SHA, coverage summary, ruleset version, and save time. Cached findings contain generated explanations, metrics, paths, and line ranges but no remote source text.
- Never cache raw source bodies or raw GitHub responses.
- Use `sessionStorage` with a 15-minute TTL and a versioned key scoped to the canonical repository slug. The payload contains the inspected commit SHA; a normal repeat within the TTL uses that immutable completed report without a network request, while refresh bypasses it.
- Treat storage as untrusted: validate every field, date, finite number, enum, count, path, and version before use.
- Delete malformed, expired, or future-dated entries and continue as a cache miss.
- Storage denial or quota errors cannot prevent analysis.
- A successful manual analysis updates the query string only after report completion. A failed attempt preserves the prior URL.
- The language preference uses one local value containing only `en` or `zh-CN`.

## 11. Security and privacy

- Validate the repository host and path before constructing fixed GitHub endpoints.
- Percent-encode owner, repository, commit, and every path segment separately.
- Reject control characters, NUL, traversal segments, ambiguous separators, and malformed URL forms.
- Treat API and raw responses as hostile and validate shapes, lengths, modes, encodings, and numeric bounds.
- Never call repository-provided URLs directly when a fixed immutable GitHub URL can be constructed from validated fields.
- Never execute repository code, create script elements from remote data, dynamically import remote URLs, use `eval`, or insert remote HTML.
- Use React text rendering for remote strings and `noopener noreferrer` for GitHub links opened in a new tab.
- Keep parsers in a Worker and enforce message size and time limits.
- Apply a production CSP with no `unsafe-inline` or `unsafe-eval`; allow connections only to self, `api.github.com`, and `raw.githubusercontent.com`.
- Load no remote fonts, scripts, stylesheets, images, analytics, ads, or trackers.
- Make the privacy boundary visible: the visitor's device and GitHub perform the work; the publisher's computer is not involved.

## 12. Accessibility and responsive design

- Meet WCAG 2.2 AA for the implemented scope.
- Use semantic landmarks, headings, forms, buttons, lists, tables, progress, and live regions.
- All interactions are operable with keyboard alone and have a visible 3-pixel focus indicator.
- Visible interactive targets are at least 44 by 44 CSS pixels.
- Color is never the sole carrier of score, severity, progress, or status.
- Support 200% zoom, reduced motion, and widths of 375, 900, and 1366 CSS pixels without horizontal page overflow.
- Charts, if used, have adjacent numeric text and accessible names; the primary six-dimension presentation remains readable without charts.
- Long remote paths and generated evidence text wrap or use bounded component scrolling rather than forcing page overflow.

## 13. Performance budgets

- Initial application JavaScript: at most 200 KiB gzip.
- Each lazy language analyzer chunk, including its parser asset: at most 500 KiB gzip.
- Initial CSS: at most 50 KiB gzip.
- No parser is fetched before a scan requires its language.
- Worker analysis after all selected text is available must finish within 2 seconds for the fixed medium fixture on CI hardware; progress remains visible for longer real repositories.
- Lighthouse on the landing page runs three times and requires at least `0.95` for performance, accessibility, best practices, and SEO.
- A slow network or GitHub response is not counted as local analysis time and is represented separately in progress.

## 14. Testing and quality gates

### 14.1 Test layers

- Pure unit tests for URL parsing, response guards, path normalization, exclusions, deterministic selection, all scoring thresholds, applicability, confidence, labels, priorities, and bilingual rule-key parity.
- Parser fixture tests for JS, TS, and Python functions, branches, nesting, imports, docs, identifiers, errors, malformed syntax, and token duplication.
- Worker protocol tests for progress ordering, cancellation, limits, timeouts, partial results, parser failure, and stale-result prevention.
- Cache tests treating storage as hostile and verifying TTL, future timestamps, invalid numbers, wrong versions, oversized payloads, and storage exceptions.
- React component tests for both languages, accessible names, copy output, progress, report disclosure, filters, links, empty states, and typed errors.
- Application integration tests for share-query startup, successful URL update, failed URL preservation, cache/refresh, language switching without refetch, and prior-report preservation.
- Playwright E2E with fixed time and fully mocked GitHub/API/raw routes. No E2E test depends on a mutable live repository.
- Browser checks at desktop and mobile sizes for landing, progress, full report, partial report, unsupported language, invalid input, 404, rate limit, hostile remote strings, cancellation, refresh, share URL, and clipboard behavior.
- Axe checks with zero serious or critical violations, responsive overflow checks, 44-pixel interactive-target checks, focus checks, reduced-motion checks, CSP checks, and console-error checks.

### 14.2 CI gates

Every pull request and push to the default branch runs a frozen install, lint, formatting check, TypeScript check, unit/component/integration coverage, production build, bundle budgets, browser installation, desktop E2E, and Lighthouse. Coverage thresholds may not be reduced to make a change pass. Tests may not skip, exclude, suppress Axe, or use live GitHub data to conceal fixture gaps.

## 15. Deployment and open-source repository

RepoScope is a separate public repository from IssueReady. The repository contains:

- English and Chinese READMEs with equivalent usage, limitations, privacy, development, and deployment sections;
- the full versioned methodology and architecture/threat-boundary documents;
- MIT license, contribution guide, code of conduct, security policy, support guidance, and governance notes;
- structured issue and pull-request templates with private vulnerability-reporting guidance;
- Dependabot configuration and pinned GitHub Actions;
- CI and GitHub Pages workflows;
- a production-only strict CSP and local favicon/robots metadata;
- a `v0.1.0` public release only after all local and hosted quality gates pass.

Deployment uses GitHub Pages with GitHub Actions and no runtime secret. The publisher's personal computer does not serve or analyze visitor requests and may be offline.

## 16. Acceptance criteria

Version `0.1.0` is complete only when all of these are true:

1. A visitor can analyze a public GitHub repository without login or token.
2. A fresh supported scan uses exactly three REST API requests plus bounded immutable raw-file reads.
3. No remote code executes, no raw source is persisted, and CSP contains no inline/eval exception.
4. General inspection works for any language; JS, TS, and Python deep metrics are fixture-proven.
5. Limits, sampling, failures, unsupported content, and confidence are visible and mathematically reproducible.
6. Overall, six dimensions, strengths, weaknesses, recommendations, coverage, evidence, and methodology render in English and Chinese.
7. Language switching changes no scores and triggers no network request.
8. Share URLs, refresh, cancellation, rate-limit recovery, cache validation, and stale-result prevention work as specified.
9. All unit, component, integration, browser, accessibility, bundle, build, coverage, and Lighthouse gates pass locally and in GitHub Actions.
10. The separate repository, Pages deployment, bilingual documentation, security controls, and `v0.1.0` release are public and verifiable.

## 17. Authoritative GitHub references

- [GitHub REST API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10)
- [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2026-03-10)
- [REST API endpoints for Git trees](https://docs.github.com/en/rest/git/trees?apiVersion=2026-03-10)
- [REST API endpoints for repository contents](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10)
