# SPEC.md: DCN Virtual Lab, IP Fragmentation & Reassembly (Revised)

Act as a senior full-stack developer, networking engineer, UI/UX designer and educational-simulation developer. Build a complete, interactive, professional Virtual Laboratory (V-Lab) for undergraduate engineering students. It will be hosted on the University website under the tag **V-Lab**.

Do not build a static page. Build a working simulator with accurate IPv4 logic. All results must be computed dynamically from user input, never hardcoded.

---

## 0. Assignment context

- Subject: Data Communication and Networking (DCN)
- Domain: Network Layer
- **Experiment No. 4: IP Fragmentation & Reassembly** ("Simulate fragmentation when MTU is small; reassemble at destination.")
- Required by the assignment: colourful animations, voice assistant, demo video.
- Group work: 10 batches, 6 students per group. Submission deadline: 03 Nov 2026.

---

## 1. Hard technical constraints

1. Standalone browser app: HTML5, CSS3, vanilla JavaScript, SVG. No backend, no paid APIs.
2. **Must work by double-clicking `index.html` (`file://`).** Therefore do NOT use ES modules (`import`/`export`). Use classic `<script>` tags with one shared namespace: `window.VLab = window.VLab || {}`. Each file attaches its API to it (e.g. `VLab.Fragmentation`).
3. Core logic files (`fragmentation.js`, `reassembly.js`, checksum) must also be loadable in Node for tests, using a guard such as `if (typeof module !== 'undefined') module.exports = ...`. They must have no DOM dependencies.
4. **Fully self-contained:** no CDN links, no Google Fonts, no external images. Relative paths only. Use system font stacks. It must keep working when embedded in an iframe or hosted in a CMS.
5. LocalStorage is allowed for progress/settings. Wrap every access in try/catch.
6. Responsive for desktop, tablet and mobile. Dark engineering theme with blue, cyan, purple and green accents.

---

## 2. Folder structure

```
dcn_virtual_lab/
├── index.html
├── SPEC.md
├── README.md
├── DEMO_SCRIPT.md
├── css/style.css
├── js/
│   ├── app.js                  (navigation, state, UI wiring)
│   ├── fragmentation.js        (pure logic)
│   ├── reassembly.js           (pure logic)
│   ├── checksum.js             (pure logic)
│   ├── network_animation.js
│   ├── packet_inspector.js
│   ├── voice_assistant.js
│   └── quiz.js
├── tests/fragmentation.test.js (run with: node tests/fragmentation.test.js)
└── assets/ (images/, icons/, videos/)
```

Load order in `index.html`: checksum, fragmentation, reassembly, quiz, packet_inspector, network_animation, voice_assistant, app.

---

## 3. IPv4 fragmentation rules (authoritative)

Inputs: datagram size `D` (500 to 6000, default 4000), MTU (128 to 2000, default 1500), header length `H` in {20, 24, 28} (default 20), DF in {0, 1}.

```
Original payload  = D - H
Pmax              = floor((MTU - H) / 8) * 8
Fragment payload  = min(Pmax, remaining payload)
Total length      = fragment payload + H
Fragment offset   = byteOffset / 8
MF                = 1 for all fragments except the last, 0 for the last
```

Rules and validation:

- If `D <= MTU`: no fragmentation is needed. Say so, and send the packet unchanged.
- If `D > MTU` and DF = 1: the router drops the packet and returns **ICMP Type 3, Code 4** ("Destination Unreachable: Fragmentation Needed and DF set"), including the **Next-Hop MTU** field. Visualise this in the animation and the results.
- If `D > MTU` and DF = 0: fragment.
- Reject MTU <= H, and any case where `Pmax < 8`. Show a clear error message and block simulation.
- Every non-final fragment payload is divisible by 8. The final fragment may be any size.
- Total length of every fragment is <= MTU. The sum of fragment payloads equals the original payload. Fragment offsets are contiguous.
- All fragments share the same Identification, source IP, destination IP, protocol and TTL. Each fragment has its own header and its own checksum.
- **Options assumption (state this in the UI and README):** H = 24 or 28 means IP options are present. Assume all options are "copied" so every fragment keeps the same header length. Note that real IPv4 copies only options with the copied flag set.
- Total datagram payload at the destination = (last fragment offset × 8) + last fragment payload.
- The Identification value is generated per simulation (random 16-bit) and shown to the student.

### Header checksum
Implement the real 16-bit one's-complement checksum over the header, with the checksum field zeroed before computing. Recompute it for every fragment. Include a `verifyChecksum()` that returns true for a valid header. In the demo, the router decrements TTL by 1 and recomputes the checksum, and the UI shows this. Do not display "illustrative" or fake values.

---

## 4. Reassembly rules

- Group fragments by the tuple (source IP, destination IP, protocol, Identification).
- Place each payload using its byte range `[offset*8, offset*8 + payloadLen)`. **Never concatenate in arrival order.**
- The datagram end is known only once the fragment with MF = 0 arrives. Out-of-order arrival must not be treated as loss.
- Track received byte ranges as merged intervals and compute the **missing byte ranges** at any moment.
- Complete when the end is known and there are no gaps. Then rebuild the payload and the original datagram.
- Handle **duplicate fragments** (ignore, or overwrite identically, and show a "duplicate" notice) and overlapping ranges safely.
- **Reassembly timeout:** model a configurable timer (default 15 s, as suggested by RFC 791; real stacks use about 30 to 60 s). On expiry with gaps, discard the partial datagram and show the status "Discarded: timeout". A real destination would also send ICMP Time Exceeded, Code 1. Mention this in the explanation.
- Status values: Waiting, Partial (with missing ranges), Complete, Timed out.

---

## 5. Application sections (navigation)

1. **Home**: title, Experiment No. 4, subject, Network Layer, objectives, intro, learning outcomes, "Start Experiment" and "Explore Theory" buttons, and a Source → Router → Destination diagram.
2. **Theory**: IP datagram, MTU, why fragmentation occurs, how it works, offset, MF, DF, Identification, reassembly, lost fragments, out-of-order fragments. Simple language, equations, a worked example and diagrams.
3. **Experiment Setup**: sliders (datagram size, MTU), a header-length selector, a DF toggle, scenario loader buttons and a prominent **SIMULATE** button. Show live validation.
4. **Interactive Simulation**: SVG topology (Source → Router → Destination) with controls Start, Pause, Resume, Reset, Step-by-Step and a speed slider, plus status and a progress bar. Animation order: packet leaves the source, router checks size against MTU, packet splits into colour-coded fragments (or is dropped with ICMP if DF = 1), fragments travel, destination receives them. Animations must be pausable and resettable.
5. **Packet Header Inspector**: select any packet or fragment, see a visual 32-bit-row IPv4 header layout with all 11 required fields highlighted. Include a short explanation for Identification, Fragment Offset, MF and DF, and the checksum validity.
6. **Reassembly Laboratory**: incoming fragment cards, with receive, deliver-in-custom-order, shuffle, drop-one, retry and duplicate controls. Show a byte-range bar of the original datagram that fills in as fragments arrive, the missing ranges, a status badge, the timeout timer, and an animation of the fragments merging.
7. **Results and Analysis**: dynamic table (fragment no., payload, total length, offset, MF, DF, checksum), summary values, reassembly status and an auto-generated conclusion. A "Reset and repeat" button.
8. **Quiz**: at least 10 MCQs covering MTU, fragmentation, offset, Identification, MF, DF, reassembly, missing fragments, out-of-order delivery, and payload calculation (include numeric questions). Immediate feedback, explanations, final score, retry.
9. **Demo Video and References**: video section, then references, documentation and team block.

### Demo video section
Placeholder area with instructions. Support a local MP4 (`assets/videos/demo.mp4`) or an approved hosting URL via one config variable. Do NOT invent a URL. If the file is absent, show the placeholder. List the 8 steps to demonstrate: introduction, set packet size, set MTU, perform fragmentation, inspect headers, perform reassembly, show missing fragment, show final result.

### References and documentation
Aim, required theory, procedure, observations, result, conclusion and viva questions. References: *Computer Networking: A Top-Down Approach* (Kurose & Ross); RFC 791; RFC 6864; RFC 792 (ICMP). Include a **Team Members** block (editable names/roll numbers, 6 slots).

---

## 6. Scenarios (one-click load)

1. Normal Fragmentation: D = 4000, MTU = 1500, H = 20, DF = 0.
2. No Fragmentation Required: D = 1000, MTU = 1500.
3. Small MTU: D = 4000, MTU = 600.
4. Fragmentation Prohibited: D = 4000, MTU = 1500, DF = 1 (ICMP Type 3 Code 4).
5. Missing Fragment: scenario 1 with the **middle** fragment removed. Show its missing byte range and incomplete reassembly.
6. Out-of-Order Delivery: scenario 1 with a shuffled arrival order. Reassembly succeeds.

Expected check for scenario 1: Pmax = 1480, payload = 3980, fragments = 1480 / 1480 / 1020, offsets = 0 / 185 / 370, MF = 1 / 1 / 0, total lengths = 1500 / 1500 / 1040. The code must still compute these, never hardcode them.

---

## 7. Voice assistant (Web Speech API)

- Text-to-speech with Enable/Disable, Play, Pause, Resume and Repeat.
- **Browsers block audio until a user gesture.** Never auto-speak on page load. Speak the welcome line after the "Start Experiment" click.
- Narrate the key events with values filled in dynamically (e.g. "The router has generated 3 fragments", "Fragment 2 has a fragment offset of 185", "The final fragment has MF set to zero", "All fragments have arrived. The datagram can be reconstructed.").
- Speech recognition (if supported) for: explain fragmentation, explain fragment offset, start simulation, explain reassembly, explain DF flag. It needs mic permission and usually HTTPS and an internet connection, so treat it as optional.
- Always provide equivalent **clickable command buttons**. Feature-detect and degrade gracefully with a visible note if TTS or recognition is unavailable.

---

## 8. Code quality

Meaningful names, comments on every networking formula, input validation, no unnecessary libraries, no dead buttons or broken links, no console errors.

## 9. Tests (required)

`tests/fragmentation.test.js`, runnable with plain Node (no framework), asserting for all 6 scenarios plus edge cases (MTU just above H, D = MTU, D = MTU + 1, H = 24 and 28):

- payload sum equals the original payload
- non-final payloads divisible by 8
- total length <= MTU
- offsets contiguous and correct
- MF set correctly, last MF = 0
- shared Identification
- checksum verifies, and fails after tampering
- reassembly succeeds for in-order, reversed and shuffled order
- missing middle fragment gives incomplete status and the correct missing range
- duplicate fragment handled
- DF = 1 gives drop and ICMP result

Print PASS/FAIL per test and exit non-zero on failure.

## 10. Build order (stop for approval after each file)

1. SPEC.md
2. js/checksum.js
3. js/fragmentation.js
4. js/reassembly.js
5. tests/fragmentation.test.js (run it and show the results)
6. index.html
7. css/style.css
8. js/app.js
9. js/network_animation.js
10. js/packet_inspector.js
11. js/voice_assistant.js
12. js/quiz.js
13. README.md (run locally, deploy to the university site, options assumption, folder guide)
14. DEMO_SCRIPT.md (narration script for the 8 video steps)

Priority: correct networking logic first, then a functional simulator, animations, inspector, voice, and finally quiz and docs. Never sacrifice correctness for visuals.