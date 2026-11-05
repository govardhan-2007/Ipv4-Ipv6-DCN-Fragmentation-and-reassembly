# Experiment 05 (IPv6) V4.0: sidebar, settings, UI and simulation upgrade

Only the `ipv6/` folder and `tests/ipv6-reassembly.test.js` changed. The IPv4 lab is untouched.

## Sidebar
- Click-to-expand menu: every group (Learn, Experiment workspace, Assessment, Preferences, Other experiment) opens and closes with a click; closed groups are remembered.
- Three sidebar modes: Expanded, Compact (icons/numbers only, with tooltips) and Hidden (full-width page). Header button, collapse arrow, `B` / Ctrl+B, or Settings.
- Mobile drawer has a close (x) button; the floating Menu button hides while the drawer is open.
- Pages you have visited get a dot; the footer shows "n of 8 pages visited" and your best quiz score.
- Voice assistant switch label now reads Off/On correctly.

## Settings page (page 09, gear icon in the header)
Appearance: theme (light/dark/system), accent colour (green/teal/blue/violet), text size, high contrast, reduce motion.
Sidebar: mode, remember collapsed groups, show course card, show voice assistant, expand all groups.
Simulation: default speed, start automatically, show calculation steps, show event log, pause when tab hidden, keyboard shortcuts.
Protocol values: Identification format (hex/decimal), initial Hop Limit (64/128/255), reassembly timeout (5-120 s, default 60 per RFC 8200).
Data: export / import settings, reset experiment values, clear progress, reset all.

## UI
- Whole colour system is now one hue variable, so the accent switches everywhere (sidebar, hero, simulation stage, buttons).
- Overview progress card with a Continue button; page entrance animation; toasts.
- Setup: one-click presets for packet size and Path MTU (1280, 1492 PPPoE, 1500 Ethernet, 9000 jumbo); header overhead row.
- Header inspector: new Raw header bytes view (48 bytes in hex) that highlights the bytes of the selected field; open a fragment directly from the simulation tray.
- Results: Download CSV, Print report, bytes sent on Link B and header overhead.

## Simulation
- Back button and clickable stage stepper: jump to any stage; earlier stages are replayed so the log, calculations and fragment tray stay correct.
- MTU gauge above the router compares packet size with the Path MTU (red when too big).
- Overhead chip (extra bytes caused by fragmenting), Space / arrows / R shortcuts (left arrow = back).
- Reduced-motion and tab-hidden behaviour follow Settings; voice narration skips replayed stages.

## Logic
- Reassembly timer length is configurable (model `createReassembly(calc, {timeout})`); ICMPv6 Time Exceeded behaviour unchanged.
- Hop Limit shown follows the chosen initial value (router subtracts 1).
- Fragment calculations are unchanged.

Tests: 14 IPv6 tests, 7 legacy IPv6 tests, 43 IPv4 tests pass; browser checks cover settings, sidebar modes, stage jumping and mobile drawer.
