# Experiment 05 – IPv6 improvements (V2.8)

- Rebuilt the IPv6 knowledge check as a one-question-at-a-time flow with Previous / Next navigation, immediate answer feedback, live score, final score, and retry.
- Removed pass-mark messaging and pass criteria from the quiz page.
- Expanded theory with explicit mathematical notation and a worked 4000 B / 1500 B example.
- Improved packet setup with quick presets, clearer preview interpretation, and a direct route to header inspection.
- Added an IPv6 base-header / Fragment Header layout overview to the header inspector.
- Expanded results with step-by-step derivation and a constraint audit.
- Expanded destination reassembly with byte-range equations and completion conditions.
- Kept all changes within the separate `ipv6/` experiment folder; the IPv4 implementation was not edited.

## Verification

- IPv6 calculation tests: 7 passed.
- IPv6 page tests: 5 passed.
- Existing IPv4 regression tests: 43 passed.
- JavaScript syntax checks: passed.
- HTML duplicate-ID and local-link scan across IPv6 pages: passed.
- Browser interaction test could not run because Chromium is not installed in the execution environment.
