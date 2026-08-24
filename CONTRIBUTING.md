# Contributing to RepoScope

Thank you for helping improve RepoScope. Contributions must preserve its two explicit public contracts: bilingual, deterministic, read-only inspection of public GitHub repositories in the visitor's browser, plus an independently failing optional expert service that operates only after informed GitHub authorization.

## Before opening an issue

- Use the structured bug or feature form.
- Search existing issues first.
- Share only public repository information needed to reproduce the issue.
- Never post credentials, tokens, private source, personal data, or an unpatched vulnerability. Follow [SECURITY.md](SECURITY.md) for security reports.

## Development setup

Use Node.js 24.x and pnpm 11.16.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Create a focused branch, keep changes small, and add a failing test before implementation. Automated tests must use fixed fixtures; they must not depend on a mutable live repository or hide failures with skips, reduced thresholds, or Axe suppressions.

## Required checks

Run the complete local gate before requesting review:

```sh
pnpm format
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:server
pnpm typecheck:server
pnpm check:deep-analysis-eval
pnpm build
pnpm check:bundle
pnpm exec playwright test
pnpm check:lighthouse
```

Do not lower coverage, accessibility, Lighthouse, or bundle thresholds to make a change pass.

## Product and methodology changes

A pull request must update all affected contracts:

- Application-owned copy remains semantically equivalent in English and Simplified Chinese.
- Rule IDs, thresholds, weights, applicability, confidence, and precedence stay synchronized with [docs/methodology.md](docs/methodology.md) and tests.
- Network, file, byte, concurrency, timeout, cache, and CSP limits stay synchronized with [docs/architecture.md](docs/architecture.md) and tests.
- Optional-service changes keep OAuth no-scope, tokens memory-only, sessions opaque and CSRF-protected, one active run per session, Copilot sessions tool-free, provider errors redacted, and deterministic-report failure isolation.
- Prompt, schema, evidence, cache, or model-allocation changes update their version decision and the frozen human-evaluation corpus. Expert mode must not be enabled publicly without a dated passing two-reviewer scorecard.
- New interactions meet WCAG 2.2 AA for the implemented scope, including keyboard use, 44-by-44-pixel targets, visible 3-pixel focus, reduced motion, and responsive reflow.
- Remote repository content remains untrusted text and never becomes executable code or HTML.
- Tests and fixtures never call live GitHub or Copilot by default. The guarded live smoke requires an explicit opt-in and an existing user credential; it must never print, store, or commit that credential or model output.

Changing the meaning of a published score requires a ruleset-version decision. Do not silently tune a threshold to improve a particular repository's result.

## Pull requests

Complete the pull-request template, explain the evidence behind the change, and identify any user-visible or compatibility effect. By contributing, you agree that your contribution is licensed under the repository's MIT License and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
