# Experiment 04 (IPv4) V4.1: Settings tab and sidebar, matching Experiment 05 (IPv6)

The IPv4 lab now has the same Settings tab and sidebar behaviour as the IPv6 lab. Fragmentation and reassembly calculations are unchanged.

## Sidebar
- Click-to-expand menu: Learn, Experiment workspace, Assessment & resources, Preferences and Other experiment each open and close with a click; closed groups are remembered. The page you are on is never left inside a closed group.
- Three sidebar modes: Expanded, Compact (page numbers only, with tooltips) and Hidden (full-width page). Header button, collapse arrow, `B` / Ctrl+B, or Settings.
- Mobile drawer has a close (x) button; the floating Menu button hides while the drawer is open.
- Visited pages get a dot; the footer shows "n of 9 pages visited" and your best IPv4 quiz score.
- The IPv6 lab link moved to its own "Other experiment" group (as the IPv4 link is in the IPv6 sidebar).

## Settings page (section 10, gear icon in the header, key `0`)
- Appearance: theme (light/dark/system), accent colour (indigo/teal/green/violet), text size, high contrast, reduce motion.
- Sidebar: mode, remember collapsed groups, show course card, show voice assistant, expand all groups.
- Simulation: default speed (kept in step with the speed slider), start automatically, show calculation steps, show event log, pause when tab hidden, keyboard shortcuts.
- Protocol values: Identification format (decimal/hex, applied in the simulation summary, log, results and header inspector), initial TTL (64/128/255), reassembly timeout (5-120 s, default 15 s).
- Data: export / import settings, reset experiment values (4000 B, MTU 1500, 20 B header, DF 0), clear progress, reset all.

## Notes
- Defaults reproduce the previous behaviour exactly: indigo accent, medium text, packets start automatically, TTL 64, 15 s timeout, decimal Identification.
- Settings are stored under `dcn-vlab-ipv4-settings-v1`, separate from the IPv6 lab's settings; the light/dark choice is mirrored in `dcn-vlab-theme`.
- Reduce motion turns off decorative CSS animation. The packet journey is script-driven and keeps its own speed control.
- Protocol values apply to the next run (TTL, timeout); Identification format applies immediately.
- Number shortcuts 1-9 still map to the nine IPv4 pages; `0` opens Settings.

## Files
New: `js/settings.js`, `css/settings.css`, `tests/settings_smoke.py`. Changed: `index.html`, `js/app.js`, `js/ui_enhancements.js`, `js/packet_inspector.js`, `js/network_animation.js`, `js/quiz.js`.

Tests: 43 IPv4 + 7 legacy IPv6 + 14 IPv6 unit tests pass; `ui_smoke.py` and the new `settings_smoke.py` (settings, sidebar modes, groups, simulation wiring, import/export, mobile drawer) pass.
