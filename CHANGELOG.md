# Changelog

## Simulation UI and bug-fix release

### Simulation UI
- Run summary chips, stage timeline, narrator card with stage label.
- Fragment tray with per-fragment state, header highlight and tooltips on the stage.
- Reassembly buffer drawn at the destination, filled by byte position.
- Speed presets, button icons, keyboard shortcuts (Space, Right arrow, R).
- "Run complete" banner with context-aware next actions; DF drops offer "Clear DF and run again".
- Event log shows a glyph per message type.
- Phones: stage scrolls horizontally at a legible size and follows the action.

### Bugs fixed
- **Step mode dead end:** after pressing Step, Start / Pause / Resume were all disabled, so the student could not return to automatic playback without resetting. Resume now works from step mode.
- **Step after finish:** Step was disabled once a run finished; it now restarts the run in step mode.
- **Background playback:** the animation (and voice narration) kept running after the student left the simulation page or switched tabs. It now pauses.
- **Unlabelled last fragment:** the short final fragment was drawn too narrow to show its "F" label.
- **Mobile overflow:** the team-member fields pushed the Video and references page wider than a phone screen.
- **Console warning:** removed the unsupported `web-share` permission from the video iframe `allow` list.

### Tests
- `tests/ui_smoke.py` (optional, needs Python and Playwright) drives the simulation page in a real browser.


## V2.1 – IPv6 and sidebar refinement
- Added a separate IPv6 source-fragmentation learning module with dynamic fragment calculations.
- Added IPv6 navigation and retained the existing IPv4 experiment logic.
- Made the voice assistant panel collapsible and refined sidebar navigation styling.


## V2.3 — IPv6 interactive simulation and navigation refinement
- Replaced the one-click IPv6 calculation with a step-by-step packet journey: source transmission, router ICMPv6 Packet Too Big response, source-side fragment creation, and destination reassembly.
- Added Start, Pause, Resume, Step, Reset and adjustable animation speed controls.
- Added a live event log, progress indicator, fragment table with shared 32-bit Identification, and clickable fragment-header inspection.
- Updated the knowledge check to include five IPv6 questions in every 15-question attempt (10 IPv4 + 5 IPv6).
- Fixed the desktop sidebar so the navigation list scrolls independently while the voice assistant and readiness footer remain visible at the bottom.

## IPv6 simulator and theory refresh

- Reworked the IPv6 workspace into a seven-stage, full-width network journey.
- Added a source/router/destination network diagram, moving packet indicator, stage rail, fragment cards, calculation panel and event log.
- Added responsive layout for desktop and mobile.
- Expanded the theory section with IPv6 Fragment Header fields, offset/M flag, MTU calculation, ICMPv6 Packet Too Big, Path MTU Discovery, destination reassembly and a worked example.
- Preserved the existing IPv4 simulator and the five IPv6 quiz questions.

## V2.6 — IPv6 workspace drawer and simulation corrections
- Replaced the full-screen simulator action with a collapsible IPv6 workspace drawer in the left sidebar.
- Added synchronized packet size, Path MTU and speed controls plus Start/Pause/Resume/Step/Reset shortcuts.
- Added shortcuts for IPv6 theory, configuration, simulation, fragments, header inspection, reassembly, calculations, event log, comparison and quiz.
- Removed the oversized decorative IPv6 wordmark that overlapped the hero.
- Corrected the Path MTU slider to accept exact byte values such as 1500.
- Rebuilt the animation as exactly seven meaningful stages.
- Added an in-order / out-of-order / lost-fragment reassembly exercise.
- Expanded the quiz bank to ten IPv6 questions alongside ten IPv4 questions.
- Added an IPv6-only quiz launch from the sidebar drawer; the main Knowledge Check remains mixed-protocol.
