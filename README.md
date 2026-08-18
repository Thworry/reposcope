# RepoScope 项目透视

[简体中文](README.zh-CN.md)

RepoScope produces explainable, deterministic quality reports for public GitHub repositories. It inspects documentation, operability evidence, code readability, complexity and structure, testing and automation, and maintenance health. The static application is bilingual and runs the analysis in a Web Worker on the visitor's device.

**Live site:** <https://thworry.github.io/reposcope/>

RepoScope is an evidence inspector, not a verdict. It does not run a repository, prove that its features work, measure runtime test coverage, audit security, find vulnerabilities, or certify that software is safe to use.

## Usage

1. Open the [RepoScope site](https://thworry.github.io/reposcope/).
2. Paste one public URL in the form `https://github.com/owner/repository`.
3. Choose **Analyze repository**. RepoScope handles one repository at a time.
4. Start with the README-first evidence dossier and decision summary. Open **Technical evidence and methodology** only when you need the score, confidence, six dimensions, strengths, improvements, coverage, and rule-level evidence; it is closed by default.
5. Use **English / 简体中文** to change the interface language. Switching language does not refetch data or recompute scores.

A successful report has a share URL containing only the repository slug. A fresh scan makes exactly three unauthenticated, read-only GitHub REST requests, then bounded reads from immutable raw-file URLs pinned to the inspected commit.

General inspection works for repositories in any language. Deep static metrics are available for JavaScript, TypeScript, and Python. When supported source does not meet the applicability threshold, readability and complexity are unavailable and the overall result is labeled **general-only** and **preliminary**.

For any inspected public repository, the deterministic reader report keeps purpose and project-kind evidence distinct. Purpose evidence comes from the public GitHub description and preferred README. Project-kind evidence comes from bounded structural checks of manifests, topics, and the repository tree. Evidence links are pinned to the inspected commit, and repository-authored purpose prose remains in its source language. The report does not use an AI service and is not personalized advice: it does not infer private requirements or claim that a repository is right for a particular user.

See the complete [ruleset `1.0.0` methodology](docs/methodology.md), [architecture and threat boundaries](docs/architecture.md), and [version history](CHANGELOG.md).

## README-first evidence dossier

Completed reports begin with a seven-region README-first evidence dossier for people evaluating an unfamiliar project:

1. **Project orientation** presents the public repository description and bounded project brief with source captions.
2. **Community and maintenance facts** shows exact Stars, Watch, Forks, open issues, last push, and license evidence in one semantic definition list.
3. **What the README says** organizes bounded README overview, audience, problem, use-case, dependency, limitation, and maturity statements without rewriting repository prose.
4. **Core capabilities** groups the capabilities documented by the repository.
5. **Documented workflow** presents the repository's ordered process as text that remains understandable without its connecting line.
6. **README claims and repository observations** separates repository claims from broad project-kind, ecosystem, and source-area observations. It does not expose rule or function-level scoring detail.
7. **RepoScope commentary** groups deterministic notes under **Worth noting**, **Verify before relying on it**, and **What this means in practice**.

GitHub's `stargazers_count`, `subscribers_count`, and `forks_count` supply Stars, Watch, and Forks respectively; `subscribers_count` is labeled **Watch**. These figures describe public attention. Popularity is not proof of quality or safety.

Repository-authored prose stays in its source language when the interface switches language. README interpretation is deterministic and does not use AI; RepoScope does not use an AI service anywhere in the scan. If no preferred README is found, the dossier says so. If a preferred README is known but was not fetched, the UI presents a partial README interpretation instead of filling gaps.

The dossier is followed by the project decision summary and six numbered, evidence-linked chapters covering project-fit cautions, reliability, broad architecture, installation and development, security and privacy, and maintenance and alternatives.

The evidence status is one of **Sufficient evidence to continue evaluation**, **Key gaps require verification before use**, or **Public evidence is insufficient to judge**. These statuses are deterministic, non-scoring summaries of the inspected public evidence. They do not prove that a project is suitable, correct, secure, private, or safe.

Repository-authored commands are displayed as inert text and are never run. Commands marked for review should be inspected before copying. Source captions link only to the immutable inspected commit. Use the GitHub alternative search as a starting point, then apply the same evidence checks to every candidate. The scoring report and detailed methodology remain available in the **Technical evidence and methodology** appendix, which is closed by default and can be opened without refetching or recomputing the repository.

## Example report walkthrough

As a non-normative example, enter `https://github.com/Thworry/reposcope`. RepoScope first resolves the public default branch to a commit and pins the entire report to that immutable commit. The overall score summarizes the applicable rules, while confidence describes how completely the public tree and eligible evidence were fetched and parsed; confidence is not a second quality score.

Read the six dimensions separately: documentation and onboarding, operability evidence, code readability, complexity and structure, testing and automation, and maintenance health. Then check the scope and failures for truncation, skipped files, fetch failures, parser failures, unsupported source, or reached limits. The improvements list identifies the applicable rules that lost points and links them to supporting evidence where available.

Evidence links use the immutable form `blob/<commit>/path#Lx-Ly`, so they continue to identify the inspected revision if the default branch moves. Exact scores, confidence, findings, and links change when the repository's public commit or the stated ruleset changes. RepoScope treats repository contents as text: it does not execute the project, authenticate its behavior, or certify its correctness, security, or safety.

## Limits

Each scan is bounded to:

- 200 selected files and 200 eligible raw-text fetch attempts across source, documentation, manifest, and configuration files;
- 10 MiB of decoded text in total;
- 256 KiB per eligible fetched text file, including source, documentation, manifest, and configuration text;
- six concurrent raw-file requests;
- a 15-second timeout per raw file; and
- a 90-second overall source-fetch phase.

GitHub may also truncate a recursive tree or rate-limit unauthenticated requests. Sampling, skipped files, failures, unsupported source, and limit events remain visible in the report and reduce confidence. Scores with different applicable dimensions or evidence coverage should not be treated as directly comparable.

## Privacy

RepoScope requires no login, GitHub token, account, backend, database, analytics, advertising, or AI service. Public repository data travels directly between the visitor's browser and GitHub. Analysis uses the visitor's device; the publisher's computer does not serve or analyze scans and may be offline.

Repository source is treated as untrusted text. RepoScope never executes, imports, evaluates, or renders it as HTML. Raw source bodies and raw GitHub responses are not persisted. A validated final report and normalized public metadata may be cached in `sessionStorage` for 15 minutes; the only persistent preference is `en` or `zh-CN` in local storage.

## Install and run locally

Using the [hosted site](https://thworry.github.io/reposcope/) needs no installation and still requires no GitHub token. Contributor setup requires Node.js 24.x and pnpm 11.16.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Then open <http://localhost:5173/>. The Vite development server is local-only and must not be deployed as the public application.

## Development

Run the local quality gates:

```sh
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm build
pnpm check:bundle
pnpm exec playwright test
pnpm check:lighthouse
```

Automated browser tests use fixed GitHub fixtures and do not consume the live GitHub API. See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.

## Architecture

The main areas are:

- `src/features/github`, `repository`, and `scanner` for validated acquisition and deterministic selection;
- `src/features/analyzers`, `rules`, and `worker` for bounded static analysis and scoring;
- `src/components`, `i18n`, and `styles` for the bilingual report experience;
- `e2e` and co-located tests for deterministic browser and module evidence; and
- `.github/workflows` for CI and GitHub Pages deployment.

The detailed data flow, fixed endpoints, cache policy, CSP, and threat model are in [docs/architecture.md](docs/architecture.md).

## Deployment

Pushes to `main` run CI and the pinned GitHub Pages workflow. The Pages artifact is a static Vite build with `REPOSCOPE_BASE_PATH=/<repository-name>/`; deployment uses GitHub Actions and requires no runtime secret.

For a local subpath build:

```sh
REPOSCOPE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
```

Do not deploy the development server or add a token input, proxy, analytics endpoint, or remote runtime asset without an approved architecture, security, privacy, methodology, and bilingual-copy review.

## Contributing

Issues and pull requests are welcome. Changes that affect rules, thresholds, limits, report meaning, or application-owned copy must update tests and the corresponding English/Chinese or methodology documentation. Please use private vulnerability reporting for security issues; do not put secrets or sensitive data in a public issue.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [SUPPORT.md](SUPPORT.md), [GOVERNANCE.md](GOVERNANCE.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

RepoScope is released under the [MIT License](LICENSE).
