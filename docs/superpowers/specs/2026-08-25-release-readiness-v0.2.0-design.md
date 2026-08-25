# RepoScope v0.2.0 Release Readiness Design

## Outcome

Ship RepoScope v0.2.0 only after the current README-first report, optional expert service, Chinese localization, dependency updates, and public repository settings are internally consistent and pass the complete quality gate. The hosted static experience must remain useful without login, a backend, analytics, or AI.

## Product position

RepoScope is a bilingual, README-first, evidence-backed inspector for public GitHub repositories. It helps a prospective adopter understand what a repository claims to do, how it is broadly organized, how to try it, what remains uncertain, and which maintenance, security, privacy, and alternative signals deserve attention.

RepoScope is distinct from DAYU. RepoScope is an adoption-oriented explainer; DAYU is a pre-beta research reality check focused on repository signals, ratios, and mismatches between public claims and visible substance. Neither product treats popularity as proof.

## Public experience

- The first viewport names public GitHub repositories, README-first interpretation, and evidence-backed guidance.
- English and Simplified Chinese retain the same meaning while using natural language for each audience.
- Deterministic mode remains browser-local and read-only.
- Optional expert mode remains separately disclosed and disabled on the hosted Pages build unless an operator configures it.
- A transparent GitHub Discussions link replaces any temptation to add hidden analytics or telemetry.

## Release and evaluation contract

The expert prompt is version 1.1.0, so the frozen evaluation corpus and evaluator must also require 1.1.0. CI may validate the corpus without a private scorecard. Public expert deployment remains blocked unless an operator supplies a dated two-reviewer scorecard for that exact prompt and evidence schema.

The release gate includes lint, formatting, TypeScript, frontend coverage, server tests, server type checking, deterministic expert-evaluation validation, production build, bundle budget, desktop and mobile Playwright, and Lighthouse. No threshold, lint rule, or accessibility check may be weakened to make the release pass.

## Dependency policy

Each Dependabot change is reviewed and revalidated against the latest `main`. Low-risk compatible updates may merge one at a time. `eslint-plugin-react-hooks` 7.1.1 is accepted only with a state-model refactor that satisfies `set-state-in-effect` and preserves behavior. jsdom 30 is deferred because its Node floor conflicts with the published `>=24 <25` support contract; RepoScope will not raise the public Node floor solely for a test dependency.

## Repository governance and security

The `main` ruleset requires pull requests with zero mandatory external approvals, the existing `quality` status check, current branches, resolved review threads, and protection from deletion and non-fast-forward pushes. GitHub Discussions, vulnerability alerts, Dependabot security updates, and public-repository CodeQL default setup may be enabled. Secret scanning, push protection, private vulnerability reporting, Pages, and read-only Actions token defaults remain in place.

## Privacy and authorship

No personal name, public email, location, or company is added. Future commits use `Thworry <31728500+Thworry@users.noreply.github.com>`. Published history is not rewritten.
