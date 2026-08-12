## Summary

Describe the user-visible or technical change and the evidence that motivates it.

## Contract impact

- Affected rule IDs/report areas:
- Compatibility or ruleset-version impact:
- Network, file, byte, timeout, cache, or CSP impact:

## Verification checklist

- [ ] I added or updated a focused test that failed for the intended reason before implementation.
- [ ] Unit, component, integration, browser, and production gates relevant to this change pass without skips or lowered thresholds.
- [ ] English and Simplified Chinese application-owned copy remain semantically equivalent.
- [ ] I updated `docs/methodology.md` for any rule, threshold, weight, applicability, confidence, precedence, or report-meaning change.
- [ ] I updated `docs/architecture.md` for any data-flow, endpoint, limit, cache, CSP, persistence, compute, or threat-boundary change.
- [ ] The 200-file, 200-attempt, 10 MiB, 256 KiB, six-request, 15-second, and 90-second limits remain enforced or the approved contract change is fully tested and documented.
- [ ] Keyboard access, 44-by-44-pixel targets, 3-pixel focus, reduced motion, responsive reflow, and accessible names remain covered where applicable.
- [ ] Remote repository content remains untrusted text: no execution, remote import, HTML rendering, raw-source persistence, credential input, or broadened connect origin was introduced.
- [ ] I included only public, non-sensitive fixtures and did not add credentials, tokens, private source, personal data, or vulnerability details.

## Gate evidence

List the commands run and their results, including coverage, browser count, bundle sizes, and Lighthouse when applicable.
