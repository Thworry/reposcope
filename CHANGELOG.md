# Changelog

All notable changes to RepoScope are documented in this file.

## [Unreleased]

### Added

- Added a deterministic, evidence-linked project brief so users can quickly understand the stated purpose and likely kind of any inspected public repository.
- The brief uses public repository evidence, does not use an AI service, and is not personalized advice; ruleset `1.0.0`, scoring, privacy, and request boundaries are unchanged.

## 0.1.1 - 2026-08-13

### Changed

- Split Python and cross-file analyzers into cohesive private modules while preserving ruleset 1.0.0 and report semantics.
- Added useful documentation for stable cross-module APIs.
- Expanded bilingual installation and report walkthrough guidance.
- Isolated instrumented performance tests from cross-suite CPU contention in release gates.

## 0.1.0 - 2026-08-12

### Added

- First bilingual, read-only, browser-side quality reports for public GitHub repositories.
