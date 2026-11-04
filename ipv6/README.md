# Experiment 05 — IPv6 Fragmentation & Reassembly (V3.0)

A separate multi-page IPv6 laboratory with the same look and controls as Experiment 04. It does not modify the IPv4 simulator. See RELEASE_NOTES_V3_0.md.

Files: `css/lab.css` (shared design system), `css/v6.css`, `js/model.js` (pure logic), `js/shell.js`, `js/animation.js`, `js/v6.js`.

## Pages
- `index.html` — IPv6 overview
- `theory.html` — theory and concepts
- `setup.html` — packet configuration and calculated preview
- `simulation.html` — live packet journey (seven stages when fragmented, five when the packet fits)
- `headers.html` — IPv6 base header and Fragment Extension Header inspector
- `reassembly.html` — ordered, out-of-order and missing-fragment exercises
- `results.html` — calculations and results table
- `quiz.html` — ten-question IPv6-only quiz

## Run locally
Open the project root `index.html` in a browser, select **IPv6 fragmentation lab**, then use the dedicated Experiment 05 navigation. Alternatively open `ipv6/index.html` directly. No backend or build step is required.

## Model assumptions
- Packet size includes the 40-byte IPv6 base header.
- The simplified model omits all other extension headers.
- Each fragment has a 40-byte base header and an 8-byte Fragment Header.
- The Path MTU range starts at 1280 bytes, the IPv6 minimum link MTU.
- Fragmentable bytes = packet size − 40.
- Maximum non-final fragment data = floor((Path MTU − 48) / 8) × 8.
- For a 4000-byte packet and 1500-byte Path MTU: data sizes 1448, 1448, 1064; offsets 0, 181, 362; M flags 1, 1, 0; total packet lengths 1496, 1496, 1112.

Configuration is stored in browser localStorage under `dcn-vlab-ipv6-config-v27`. If storage is unavailable, defaults are used.

- Reassembly timeout is 60 s (RFC 8200). ICMPv6 Time Exceeded (Type 3, Code 1) is sent only if the first fragment arrived.
- The router decrements Hop Limit (64 to 63).


## IPv6 voice assistant (V3.1 update)

The IPv6 pages include a collapsible sidebar voice assistant. It uses the browser Web Speech API for narration and optional speech recognition; no API key or backend is required. Use the narrator dropdown to select an available English voice (female-sounding options are preferred automatically when available). Voice availability and names depend on the operating system and browser. Microphone recognition generally requires HTTPS or localhost.
