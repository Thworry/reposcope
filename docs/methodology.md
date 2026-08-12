# RepoScope methodology

This document is the public, reproducible contract for ruleset `1.0.0`. RepoScope evaluates observable repository evidence. It does not run project code, verify behavior, measure runtime coverage, audit security, detect vulnerabilities, decide license compliance, or certify project quality or safety.

All rules are deterministic. Threshold comparisons use unrounded counts and exact inclusive boundaries; only displayed values are rounded. Remote prose and code do not generate inferred narrative. Findings use versioned templates populated with paths, line ranges, counts, and metrics.

## Score model

| Dimension                    | Weight |
| ---------------------------- | -----: |
| Documentation and onboarding |     15 |
| Operability evidence         |     20 |
| Code readability             |     20 |
| Complexity and structure     |     20 |
| Testing and automation       |     15 |
| Maintenance health           |     10 |

Each signal is `passed`, `partial`, `failed`, or `not-applicable`. Passed earns the full listed points, partial earns the listed partial points, failed earns zero, and `not-applicable` removes the signal's points from the dimension's available points. A dimension with no applicable points is unavailable rather than zero.

The overall score is the weighted mean of applicable dimension percentages, normalized to 100 and rounded to the nearest integer. A report without applicable readability or complexity is **general-only** and **preliminary**. Results with different applicable dimensions must not be represented as directly comparable.

Overall labels are:

- 85–100: Strong evidence / 证据较强
- 70–84: Solid foundation / 基础扎实
- 50–69: Needs attention / 需要关注
- 0–49: Limited evidence / 证据有限

These labels describe observed evidence, not project worth or safety.

## Signal tables

### Documentation and onboarding

| Rule ID                      | Observable signal                                                       | Full |                                               Partial |
| ---------------------------- | ----------------------------------------------------------------------- | ---: | ----------------------------------------------------: |
| `documentation.readme`       | Preferred README exists                                                 |    3 |                                                     — |
| `documentation.installation` | README has an installation/setup heading and at least one command block |    3 |                      Heading without command block: 1 |
| `documentation.usage`        | README has a usage/run heading and a command or concrete example        |    3 |                    Heading without command/example: 1 |
| `documentation.contributing` | Contribution guide exists                                               |    2 |                                                     — |
| `documentation.license`      | Recognized license file exists                                          |    2 |               Repository API license metadata only: 1 |
| `documentation.architecture` | Architecture, code map, or explicit structure explanation exists        |    2 | README names at least three top-level source areas: 1 |

### Operability evidence

| Rule ID                       | Observable signal                                                               | Full |                                  Partial |
| ----------------------------- | ------------------------------------------------------------------------------- | ---: | ---------------------------------------: |
| `operability.manifest`        | Recognized package/build manifest exists                                        |    4 |                                        — |
| `operability.entry-point`     | Recognized executable entry point or application/library export is identifiable |    4 |    Conventional-path entry point only: 2 |
| `operability.run-build`       | Manifest or documented command provides both run and build evidence             |    4 |        Only run or build is evidenced: 2 |
| `operability.example`         | Example, demo, sample, or concrete API usage exists                             |    3 |          Prose-only usage description: 1 |
| `operability.error-handling`  | Error-handling constructs appear in at least 5% of parsed non-test functions    |    2 |                      Present below 5%: 1 |
| `operability.version-history` | Changelog/history/release-notes file has a version heading                      |    2 | Non-empty valid manifest version only: 1 |
| `operability.configuration`   | Environment/config example or explicit configuration section exists             |    1 |                                        — |

The error-handling rule is evidence of constructs, not their quality, and is `not-applicable` below the deep-analysis applicability threshold. This dimension never claims that the project was executed or works.

### Code readability

Readability applies when at least five non-generated JavaScript, TypeScript, or Python source files **or** at least 2,000 supported logical source lines parse successfully.

| Rule ID                              | Observable signal                                                      | Full |               Partial |
| ------------------------------------ | ---------------------------------------------------------------------- | ---: | --------------------: |
| `readability.median-function-length` | Median non-test function length ≤ 40 logical lines                     |    4 |              41–60: 2 |
| `readability.p90-function-length`    | 90th-percentile non-test function length ≤ 80                          |    4 |             81–120: 2 |
| `readability.large-file-ratio`       | Files over 500 logical lines are ≤ 10% of parsed source files          |    4 |   >10% through 20%: 2 |
| `readability.median-nesting`         | Median function nesting depth ≤ 3                                      |    3 |                  4: 1 |
| `readability.ambiguous-identifiers`  | Ambiguous short identifiers are ≤ 10% of identifier occurrences        |    3 |   >10% through 20%: 1 |
| `readability.documented-exports`     | At least 20% of exported/public declarations are documented adjacently |    2 | 10% through 19.99%: 1 |

Logical lines exclude blank and comment-only lines. The identifier signal is a fixed heuristic, not a naming verdict.

### Complexity and structure

Complexity has the same applicability threshold as readability: at least five parsed supported source files or at least 2,000 parsed supported logical lines.

| Rule ID                        | Observable signal                                 | Full |                                      Partial |
| ------------------------------ | ------------------------------------------------- | ---: | -------------------------------------------: |
| `complexity.median-cyclomatic` | Median cyclomatic complexity ≤ 5                  |    4 |                                       6–8: 2 |
| `complexity.p90-cyclomatic`    | 90th-percentile cyclomatic complexity ≤ 15        |    5 |                                     16–25: 2 |
| `complexity.max-nesting`       | Maximum function nesting depth ≤ 5                |    3 |                                       6–7: 1 |
| `complexity.very-large-files`  | No parsed source file exceeds 1,000 logical lines |    3 |                      At most 2% exceed it: 1 |
| `complexity.duplication`       | Approximate normalized-token duplication ≤ 5%     |    3 |                           >5% through 10%: 1 |
| `complexity.circular-imports`  | No resolvable internal circular import            |    2 | One two-file strongly connected component: 1 |

Cyclomatic complexity starts at one. Duplication is approximate, excludes tests and generated files, requires a cross-file span of at least 50 normalized tokens, and discards overlapping matches.

### Testing and automation

| Rule ID                     | Observable signal                                           | Full |                    Partial |
| --------------------------- | ----------------------------------------------------------- | ---: | -------------------------: |
| `testing.test-files`        | Recognized test files exist                                 |    4 | Test configuration only: 1 |
| `testing.test-source-ratio` | Test-file to supported-source-file ratio ≥ 0.25             |    3 |     0.10 through 0.2499: 1 |
| `testing.ci`                | Recognized CI workflow/configuration exists                 |    3 |                          — |
| `testing.test-command`      | Recognized test command exists                              |    2 |     README-only command: 1 |
| `testing.static-check`      | Recognized lint, type-check, or static-check command exists |    2 |     README-only command: 1 |
| `testing.coverage`          | Coverage configuration or coverage command exists           |    1 |                          — |

The ratio rule is `not-applicable` when the tree has no supported-language source. These signals detect configured evidence; they do not claim that tests pass or report runtime coverage.

### Maintenance health

| Rule ID                             | Observable signal                                                 | Full |                         Partial |
| ----------------------------------- | ----------------------------------------------------------------- | ---: | ------------------------------: |
| `maintenance.activity`              | Not archived and `pushed_at` is within 180 exact UTC days         |    2 |                 181–365 days: 1 |
| `maintenance.lockfile`              | Recognized dependency lockfile exists                             |    2 |                               — |
| `maintenance.dependency-updates`    | Dependabot or Renovate configuration exists                       |    1 |                               — |
| `maintenance.templates`             | Issue or pull-request templates exist                             |    1 |                               — |
| `maintenance.security`              | Security policy exists                                            |    1 |                               — |
| `maintenance.code-of-conduct`       | Code of conduct exists                                            |    1 |                               — |
| `maintenance.version-history`       | Version-history file has a version heading                        |    1 |                               — |
| `maintenance.generated-directories` | No committed dependency/build/cache directory appears in the tree |    1 | One or more such directories: 0 |

Activity uses exact elapsed 24-hour days in UTC and the report's explicit analysis timestamp.

## Confidence

Confidence is evidence coverage, separate from the quality score. Before display rounding:

```text
confidence = 100 × (
  0.25 × treeCompleteness +
  0.35 × eligibleByteCoverage +
  0.40 × supportedParserCoverage
)
```

- `treeCompleteness` is 1 for a complete recursive GitHub tree and 0 when GitHub marks it truncated.
- `eligibleByteCoverage` is successfully decoded eligible bytes divided by eligible bytes declared by the available tree, clamped to [0, 1].
- `supportedParserCoverage` is successfully parsed JavaScript/TypeScript/Python bytes divided by all eligible source bytes; unsupported-language bytes remain in the denominator. The ratio is clamped to [0, 1].

The displayed integer is rounded to the nearest percent: 80–100 is High / 高可信度, 60–79 is Medium / 中可信度, and 0–59 is Low / 低可信度. Low confidence is preliminary. A truncated tree cannot reach high confidence. A repository without supported-language source can receive a general report but not high confidence.

## Applicability, aggregation, and precedence

Applicability is resolved before score aggregation. An explicit `not-applicable` precondition takes precedence over a numeric evaluator. Readability, complexity, and operability error-handling use the shared deep-analysis threshold. Testing ratio requires supported source in the available tree. Unavailable points are removed rather than treated as failures.

For aggregation, a signal's exact state determines earned points, signal points form a dimension percentage, and applicable dimension percentages are combined using the weights above. Unrounded inputs take precedence over formatted display values. If a structured manifest and prose both contribute to one rule, the rule-specific full criterion takes precedence over partial prose evidence; the same evidence is not added twice.

The median is the middle sorted value for odd counts and the arithmetic mean of the two middle values for even counts. The 90th percentile uses nearest rank at zero-based index `ceil(0.9 × count) − 1`.

## Strengths and improvements

Strengths are passed signals with concrete evidence, ordered by signal points descending and then rule ID. A report shows at most five strengths and at most two from one dimension.

Weaknesses are failed or partial signals with concrete evidence. Ordering is improvement priority, available lost points, then rule ID. Priority is:

- **high:** a failed signal worth at least 4 points, or a cluster of failed signals losing at least 40% of a dimension;
- **medium:** another failed signal, or a partial signal losing at least 2 points;
- **low:** remaining partial signals.

Recommendations are bilingual templates using bounded paths, line ranges, counts, and metrics. They do not quote source or infer source-code intent.

## Canonical repository evidence

Path comparisons are case-insensitive after POSIX-separator normalization.

- README: root or `.github/` basename beginning `README`.
- License: root basename beginning `LICENSE`, `LICENCE`, or `COPYING`.
- Contribution: root, `.github/`, or `docs/` basename beginning `CONTRIBUTING`.
- Security: root, `.github/`, or `docs/` basename exactly `SECURITY`.
- Code of conduct: root, `.github/`, or `docs/` basename beginning `CODE_OF_CONDUCT`.
- Version history: root or `docs/` basename beginning `CHANGELOG`, `CHANGES`, `HISTORY`, or `RELEASES`.
- Architecture: root or `docs/` basename beginning `ARCHITECTURE`, or a matched README architecture heading.
- Package/build manifests: `package.json`, `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Pipfile`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `composer.json`, `Gemfile`, `Package.swift`, `pubspec.yaml`, `CMakeLists.txt`, `Makefile`, `Taskfile.yml`, `Taskfile.yaml`, `justfile`, and root `*.csproj` or `*.sln`.
- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `bun.lock`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Pipfile.lock`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`, and `Package.resolved`.
- CI: `.github/workflows/*.yml`, `.github/workflows/*.yaml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `Jenkinsfile`, `.travis.yml`, `bitbucket-pipelines.yml`, or `appveyor.yml`.
- Dependency updates: `.github/dependabot.yml`, `.github/dependabot.yaml`, `renovate.json`, `renovate.json5`, `.renovaterc`, `.renovaterc.json`, or `.renovaterc.json5`.
- Templates: an ordinary file below `.github/ISSUE_TEMPLATE/` or `.github/PULL_REQUEST_TEMPLATE/`, or `.github/pull_request_template.md`.
- Coverage: `.coveragerc`, `coverage.xml`, Codecov YAML, `jest.config.*`, `vitest.config.*`, `nyc.config.*`, or a recognized manifest command with `coverage` as a command token.
- Environment/config examples: `.env.example`, `.env.sample`, `config.example.*`, `config.sample.*`, `example.config.*`, or `sample.config.*`.

Lockfile bodies are not fetched; tree presence supplies that signal.

## Source and test registries

Deep-parser extensions are `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, and `.py`. Generated `.d.ts` and interface-only `.pyi` files participate only in internal-import resolution and not function or source-line denominators.

The general recognized-source registry additionally includes `.go`, `.rs`, `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.java`, `.kt`, `.kts`, `.cs`, `.fs`, `.fsx`, `.rb`, `.php`, `.swift`, `.dart`, `.scala`, `.sc`, `.sh`, `.bash`, `.zsh`, `.fish`, `.lua`, `.r`, `.R`, `.ex`, `.exs`, `.erl`, `.hrl`, `.clj`, `.cljs`, `.hs`, `.lhs`, `.vue`, `.svelte`, and `.astro`.

A test file is recognized source below a `test`, `tests`, `__tests__`, `spec`, or `specs` path segment; a JavaScript/TypeScript basename containing `.test.` or `.spec.`; or Python matching `test_*.py` or `*_test.py`.

## Markdown and structured evidence dictionaries

Headings undergo Unicode NFKC normalization, inline Markdown marker removal, lowercasing, and punctuation/whitespace collapse before whole-phrase matching.

- Installation/setup English: `install`, `installation`, `setup`, `getting started`, `quick start`, `prerequisites`.
- Installation/setup Chinese: `安装`, `配置环境`, `环境要求`, `准备工作`, `快速开始`.
- Usage/run English: `usage`, `use`, `run`, `running`, `example`, `examples`, `quick start`.
- Usage/run Chinese: `使用`, `用法`, `运行`, `示例`, `快速开始`.
- Architecture English: `architecture`, `structure`, `project layout`, `repository layout`, `codebase`, `code map`.
- Architecture Chinese: `架构`, `结构`, `项目结构`, `目录结构`, `代码结构`, `代码地图`.
- Configuration English: `configuration`, `config`, `environment variables`, `settings`.
- Configuration Chinese: `配置`, `环境变量`, `设置`.

A command block is fenced, begins with a non-prose token after optional shell-prompt removal, and uses one of: `npm`, `npx`, `pnpm`, `yarn`, `bun`, `node`, `deno`, `python`, `python3`, `pip`, `pip3`, `uv`, `poetry`, `pytest`, `tox`, `make`, `just`, `task`, `go`, `cargo`, `mvn`, `gradle`, `gradlew`, `dotnet`, `swift`, `docker`, or `docker-compose`.

For valid `package.json`, entry-point evidence reads non-empty `main`, `module`, `browser`, `bin`, or `exports`; run/build reads `start`, `dev`, `serve`, or `build`; tests read `test` or `test:*`; static checks read `lint*`, `typecheck*`, `type-check*`, `check*`, or `format:check`.

Python structured entry points use `[project.scripts]`, `[project.gui-scripts]`, `[tool.poetry.scripts]`, `console_scripts`, `__main__.py`, or top-level `main.py`, `app.py`, or `cli.py`. Tests use selected `pytest`, `unittest`, `tox`, or `nox` configuration/commands. Static checks use selected `ruff`, `mypy`, `pyright`, `flake8`, `pylint`, or `black --check` configuration/commands.

A version-history heading begins with an optional Markdown marker and `v`, followed by at least `major.minor`. A manifest-only version is partial only when non-empty and not `0.0.0`, `0.0.0-development`, `private`, or `workspace`.

## Deep syntax definitions

- Functions: JavaScript/TypeScript declarations, expressions, arrows, methods, getters, and setters; Python `FunctionDef` and `AsyncFunctionDef` equivalents.
- Cyclomatic increments: JS/TS `if`, loops, `catch`, non-default `switch` cases, ternaries, `&&`, `||`, and `??`; Python `if`, `for`, async `for`, `while`, exception handlers, ternaries, each additional Boolean operand, and non-default `match` cases.
- Nesting increments when a function contains a nested function or a counted decision, loop, exception, switch, or match construct. Sequential statements do not increase nesting.
- Error handling: JS/TS `try`, `catch`, or `throw`; Python `try`, handlers, or `raise`. Each function counts once.
- Ambiguous identifiers are one- or two-code-point local variable, parameter, function, method, class, or imported-binding names, excluding keywords and the lowercase allowlist `_`, `i`, `j`, `k`, `x`, `y`, `z`, `id`, `ok`, `db`, `fs`, `io`, `ui`, `api`, `url`, `uri`, `ip`, `os`, `re`, `rx`, `tx`, `err`, `req`, `res`, `ctx`.
- Documentation adjacency: an exported JS/TS declaration has a JSDoc block ending on the immediately preceding nonblank line; a public Python top-level function/class or method has a first-statement string docstring. Python names beginning `_` are private.
- Internal imports: only relative JS/TS and relative Python imports resolve. JS/TS tries explicit paths, supported extensions, and `index` files. Python follows package directories and `__init__.py`. Dynamic, package, unresolved, and type-only imports create no graph edge.
- Duplicate ratio: tokenize non-test parsed source; discard comments/whitespace; replace strings, templates, and numbers with typed placeholders; preserve identifiers/operators; hash 50-token windows; require different files; extend maximally; discard overlap; divide tokens in accepted spans by all eligible tokens.

## Selection, exclusions, and incomplete evidence

Selection is ordered deterministically by evidence priority, normalized path, and blob SHA. Documentation/community files precede manifests/configuration, entry points, paired tests, supported source sampled round-robin across top-level areas, and remaining eligible documentation/source.

Dependency, vendor, generated, build, coverage, cache, and VCS areas are excluded, including `.git`, `.hg`, `.svn`, `node_modules`, `vendor`, `third_party`, `dist`, `build`, `out`, `coverage`, `.coverage`, `.cache`, `.next`, `.nuxt`, `target`, `bin`, `obj`, `__pycache__`, `.venv`, and `venv`. Binary, media, font, archive, compiled, executable, database, source-map, minified, and package-cache bodies are not fetched.

GitHub tree truncation, selection limits, raw failures, invalid UTF-8, unsupported source, and parser failures remain explicit scope evidence. Safe data already fetched is retained, while confidence falls. The report never converts these gaps into invented quality failures.
