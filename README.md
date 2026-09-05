# RepoScope 项目透视

[简体中文](README.zh-CN.md)

RepoScope helps people understand an unfamiliar public GitHub repository before they invest time in it. Its bilingual, deterministic mode explains the README, project fit, broad architecture, setup path, risks, maintenance, alternatives, and supporting evidence in a Web Worker on the visitor's device. A separately deployed, explicitly authorized expert mode can add a deeper GitHub Copilot briefing without replacing the deterministic report.

**Live site:** <https://thworry.github.io/reposcope/>

RepoScope is an evidence inspector, not a verdict. It does not run a repository, prove that its features work, measure runtime test coverage, audit security, find vulnerabilities, or certify that software is safe to use.

**RepoScope and DAYU are different tools.** RepoScope explains a repository for someone deciding whether and how to adopt it. [DAYU](https://github.com/Thworry/dayu) is a pre-beta research reality check focused on public repository signals, unusual ratios, and mismatches between claims and visible substance. Neither treats popularity as proof.

## Usage

1. Open the [RepoScope site](https://thworry.github.io/reposcope/).
2. Paste one public URL in the form `https://github.com/owner/repository`.
3. Choose **Analyze repository**. RepoScope handles one repository at a time.
4. Start with the README-first evidence dossier and decision summary. Open **Technical evidence and methodology** only when you need the score, confidence, six dimensions, strengths, improvements, coverage, and rule-level evidence; it is closed by default.
5. When the site operator has configured expert mode, choose **Generate expert interpretation** to review the disclosure and authorize the RepoScope GitHub OAuth App. This step is optional; the deterministic report remains usable if it is skipped or fails.
6. Use **English / 简体中文** to change the interface language. Switching language does not refetch deterministic data or recompute scores.

A successful report has a share URL containing only the repository slug. A fresh scan makes exactly three unauthenticated, read-only GitHub REST requests, then bounded reads from immutable raw-file URLs pinned to the inspected commit.

General inspection works for repositories in any language. Deep static metrics are available for JavaScript, TypeScript, and Python. When supported source does not meet the applicability threshold, readability and complexity are unavailable and the overall result is labeled **general-only** and **preliminary**.

For any inspected public repository, the deterministic reader report keeps purpose and project-kind evidence distinct. Purpose evidence comes from the public GitHub description and preferred README. Project-kind evidence comes from bounded structural checks of manifests, topics, and the repository tree. Evidence links are pinned to the inspected commit, and repository-authored purpose prose remains in its source language. This deterministic report does not use an AI service and is not personalized advice: it does not infer private requirements or claim that a repository is right for a particular user.

See the complete [ruleset `1.0.0` methodology](docs/methodology.md), [architecture and threat boundaries](docs/architecture.md), and [version history](CHANGELOG.md).

## README-first evidence dossier

Completed reports begin with an eight-region README-first evidence dossier for people evaluating an unfamiliar project:

1. **Project orientation** presents the public repository description and bounded project brief with source captions.
2. **Community and maintenance facts** shows exact Stars, Watchers, Forks, open issues and pull requests, last push, and license evidence in one semantic definition list.
3. **Reader takeaways** quotes concrete capability, workflow, architecture, and adoption evidence, explains why each item matters to a prospective user, and links directly to the fuller chapter. It does not use extraction counts as a substitute for understanding the project.
4. **What the README says** organizes bounded README overview, audience, problem, use-case, dependency, limitation, and maturity statements without rewriting repository prose.
5. **Core capabilities** groups up to nine capability areas documented by the repository.
6. **Documented workflow** presents the repository's ordered process as text that remains understandable without its connecting line.
7. **README claims and repository observations** separates repository claims from broad project-kind, ecosystem, and source-area observations. It does not expose rule or function-level scoring detail.
8. **RepoScope commentary** groups deterministic notes under **Worth noting**, **Verify before relying on it**, and **What this means in practice**.

GitHub's `stargazers_count`, `subscribers_count`, and `forks_count` supply Stars, Watchers, and Forks respectively; `subscribers_count` is labeled **Watchers**. GitHub's `open_issues_count` includes both issues and pull requests. These figures describe public attention. Popularity is not proof of quality or safety.

Repository-authored prose stays in its source language when the interface switches language. README interpretation is deterministic and does not use AI; neither does the rest of the deterministic scan. If no preferred README is found, the dossier says so. If a preferred README is known but was not fetched, the UI presents a partial README interpretation instead of filling gaps. Optional expert mode is a second, clearly labeled interpretation layer and never changes these deterministic facts or scores.

Common feature, download, installation, quick-start, usage, and development headings are recognized in both English and Chinese. Useful prose below those headings and meaning from ordinary three-to-five-column Markdown tables are kept within the existing evidence limits. Up to six selected public setup or usage guides may supplement scenarios and commands when the README does not contain them; every item retains its real file source, and README evidence keeps priority.

The dossier is followed by the project decision summary and six numbered, evidence-linked chapters covering project-fit cautions, reliability, broad architecture, installation and development, security and privacy, and maintenance and alternatives.

The evidence status is one of **Sufficient evidence to continue evaluation**, **Key gaps require verification before use**, or **Public evidence is insufficient to judge**. These statuses are deterministic, non-scoring summaries of the inspected public evidence. They do not prove that a project is suitable, correct, secure, private, or safe.

Repository-authored commands are displayed as inert text and are never run. Commands marked for review should be inspected before copying. Source captions link only to the immutable inspected commit. Use the GitHub alternative search as a starting point, then apply the same evidence checks to every candidate. The scoring report and detailed methodology remain available in the **Technical evidence and methodology** appendix, which is closed by default and can be opened without refetching or recomputing the repository.

## Optional expert briefing

When configured by the site operator, RepoScope can turn selected public evidence into a longer, human-readable second opinion. Three specialists cover product fit and scenarios, onboarding and broad architecture, and trust and ecosystem. A skeptic challenges unsupported claims before an editor assembles ten evidence-linked chapters. The final briefing explains the user's likely input, the documented path, the usable result, why a capability matters, how broad components divide responsibility, and what a limitation changes in practice. It distinguishes using the project from developing it and avoids function-by-function code criticism.

Expert mode requires explicit first-use consent and authorization through a RepoScope GitHub OAuth App with no requested scopes. The service uses the visitor's short-lived in-memory GitHub token and their own GitHub Copilot allowance; it does not use GitHub Models or a project-owned model credential. Selected public README, documentation, manifest, tree, release/activity, and alternative evidence is sent to zero-tool Copilot sessions. Repository code and commands remain untrusted text and are never executed.

Every model-visible statement must cite admitted evidence. RepoScope rejects unknown references, fabricated alternatives, live popularity numbers inside narrative prose, unsafe command recommendations, and unsupported security/privacy assurances. Exact Stars, Watch, Forks, issues, push time, archive status, and license are refreshed and joined by the server after model output validation. A reduced or failed expert run never removes the deterministic report.

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

The deterministic static mode requires no login, GitHub token, account, backend, database, analytics, advertising, or AI service. Public repository data travels directly between the visitor's browser and GitHub, and analysis uses the visitor's device.

Repository source is treated as untrusted text. RepoScope never executes, imports, evaluates, or renders it as HTML. Raw source bodies and raw GitHub responses are not persisted. A validated final report and normalized public metadata may be cached in `sessionStorage` for 15 minutes; the only persistent preference is `en` or `zh-CN` in local storage.

Optional expert mode adds a TypeScript backend, GitHub authorization, GitHub Copilot processing, and a bounded SQLite cache. The OAuth token stays only in an opaque, `HttpOnly`, in-memory session for up to eight idle hours and is deleted on sign-out or restart. The narrative cache retains validated public-evidence interpretation for up to 30 days; a public alternative shortlist is cached for up to 24 hours. Raw README bodies, source code, model transcripts, prompts, tokens, live popularity counts, and private repositories are not stored. See the [deployment and data-flow contract](docs/deep-analysis-deployment.md).

## Install and run locally

Using the [hosted site](https://thworry.github.io/reposcope/) needs no installation and still requires no GitHub token. Contributor setup requires Node.js 24.x and pnpm 11.16.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Then open <http://localhost:5173/>. The Vite development server is local-only and must not be deployed as the public application.

The default local build keeps expert mode disabled. To run the optional API, create a no-scope GitHub OAuth App, configure the exact same-site environment described in [docs/deep-analysis-deployment.md](docs/deep-analysis-deployment.md), and run `pnpm server:dev` in a separate process. Do not place the OAuth secret or a user GitHub token in a frontend environment variable.

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
- `src/features/deep-analysis` for the optional browser client, stream guard, and independent React state;
- `src/components`, `i18n`, and `styles` for the bilingual report experience;
- `server/github`, `evidence`, `panel`, `cache`, and `deep-analysis` for authorized evidence acquisition, zero-tool Copilot orchestration, strict validation, and bounded retention;
- `e2e` and co-located tests for deterministic browser and module evidence; and
- `.github/workflows` for CI and GitHub Pages deployment.

The detailed data flow, fixed endpoints, cache policy, CSP, and threat model are in [docs/architecture.md](docs/architecture.md).

## Deployment

Pushes to `main` run CI and the pinned GitHub Pages workflow. Without `REPOSCOPE_API_ORIGIN`, the Pages artifact is a static Vite build with `REPOSCOPE_BASE_PATH=/<repository-name>/`; deployment uses GitHub Actions and requires no runtime secret.

For a local subpath build:

```sh
REPOSCOPE_BASE_PATH=/reposcope/ pnpm build
pnpm check:bundle
```

Expert mode is a separate opt-in deployment: host the supplied non-root container on a same-site custom API domain, keep its SQLite path on a persistent volume, keep OAuth credentials in the host secret store, and set the non-secret Pages variable `REPOSCOPE_API_ORIGIN` to that HTTPS origin. Follow the exact [expert-analysis deployment guide](docs/deep-analysis-deployment.md) and complete its human quality gate before enabling it publicly.

Do not deploy the development server or add another token input, proxy, analytics endpoint, model provider, or remote runtime asset without an approved architecture, security, privacy, methodology, and bilingual-copy review.

## Contributing

Issues and pull requests are welcome. Changes that affect rules, thresholds, limits, report meaning, or application-owned copy must update tests and the corresponding English/Chinese or methodology documentation. Please use private vulnerability reporting for security issues; do not put secrets or sensitive data in a public issue.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [SUPPORT.md](SUPPORT.md), [GOVERNANCE.md](GOVERNANCE.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Feedback

Share usage questions, project-reading examples, and product ideas in [GitHub Discussions](https://github.com/Thworry/reposcope/discussions). Use the structured issue forms for reproducible defects. Security concerns belong in [private vulnerability reporting](https://github.com/Thworry/reposcope/security/advisories/new), never a public discussion or issue. RepoScope does not use analytics or telemetry to infer usage.

## License

RepoScope is released under the [MIT License](LICENSE).
