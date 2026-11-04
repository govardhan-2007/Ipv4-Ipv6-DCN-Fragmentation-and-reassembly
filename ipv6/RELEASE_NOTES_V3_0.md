# Experiment 05 (IPv6), V3.0: UI and simulation rebuilt to match Experiment 04

Only the `ipv6/` folder changed (plus `tests/ipv6-reassembly.test.js`). IPv4 files are untouched.

## UI
- Same design system as the IPv4 lab (`css/lab.css` is a copy of its stylesheet): light theme by default, dark mode toggle (shared setting), sidebar, portal header, Jump-to palette (Ctrl/Cmd+K, `/`), number shortcuts 1-8, previous/next pager, reading progress.
- Overview with animated hero scene (drop, Packet Too Big, source fragmentation, rebuild), network-flow figure, guided workflow cards.
- Theory rebuilt as expandable topics, now including the 60 s timer, IPv4 vs IPv6 table and lab assumptions.
- Setup: sliders plus exact number boxes, live fragment map, six scenarios.
- Header inspector: real 32-bit grid for the base header and Fragment Header, click-for-explanation with live values, Observe At source / On Link B (Hop Limit 64 vs 63).
- Results: computed pass/fail verification, step-by-step working, IPv4-on-same-inputs comparison.
- Quiz: options are shuffled (the correct answer was always first before), 4 questions are computed from the model, 10 per attempt.

## Simulation
- SVG stage like the IPv4 lab: Start / Pause / Resume / Step / Reset, speed presets, progress bar, stage stepper, narrator, fragment tray, reassembly buffer bar, calculation steps, event log, Space / right-arrow / R shortcuts.
- The router visibly drops the packet, an ICMPv6 Packet Too Big message travels back to the source, and the SOURCE builds and sends the fragments (header fields shown per fragment).

## Logic corrections
- Reassembly timeout 60 s (RFC 8200); ICMPv6 Time Exceeded (Type 3, Code 1) only if the offset-0 fragment arrived.
- Duplicate fragments ignored; gaps reported as merged byte ranges; arrival order never used for placement.
- Hop Limit is decremented by the router (64 to 63). Fragment calculations (`calculate`) are unchanged.

Tests: 12 IPv6 page/model tests, 7 legacy IPv6 tests, 43 IPv4 tests pass.

## V3.1
- Whole IPv6 module recoloured green (light and dark). Header inspector: addresses now shown as 16-bit cells on the 32-bit grid, cleaner group separators and ruler.
