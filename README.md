# DCN Virtual Lab: IP Fragmentation and Reassembly

**Experiment No. 4** · Data Communication and Networking (DCN) · Network Layer
Hosted on the University website under the tag **V-Lab**.

An interactive, browser-based laboratory that simulates IPv4 fragmentation when the MTU is smaller than the datagram, and reassembly at the destination. Every number on screen (payloads, offsets, flags, total lengths, checksums, missing byte ranges) is computed from the student's inputs. Nothing is hardcoded.

---

## 1. Features

| Section | What it does |
|---|---|
| Overview | Objectives, learning outcomes, Source, Router, Destination diagram |
| Theory | Datagram, MTU, offset, MF, DF, Identification, reassembly, lost and out-of-order fragments, worked example |
| Experiment setup | Sliders for datagram size and MTU, header length, DF flag, live preview and validation, 6 one-click scenarios |
| Interactive simulation | Animated SVG topology with Start, Pause, Resume, Step, Reset, speed slider, progress bar, calculation steps and event log |
| Packet header inspector | 32-bit-row IPv4 header for any packet, click any field for an explanation using that packet's real values, real checksum validity |
| Reassembly laboratory | Deliver fragments in any order, shuffle, lose one, duplicate, retry, advance the reassembly timer, byte-range bar with missing ranges |
| Results and analysis | Table of every packet, summary values, rule verification, auto-generated conclusion |
| Quiz | 12 questions drawn from a bank of 15 (numeric ones are computed by the engine), instant feedback, score, retry |
| Video and references | Demo video player (or placeholder), aim, procedure, viva questions, references, team block |
| Voice assistant | Text-to-speech narration with live values, play / pause / resume / repeat, optional voice commands |

### The six scenarios

1. Normal fragmentation: D = 4000, MTU = 1500, H = 20, DF = 0 gives 3 fragments
2. No fragmentation required: D = 1000, MTU = 1500
3. Small MTU: D = 4000, MTU = 600 gives 7 fragments
4. Fragmentation prohibited: DF = 1 gives drop and ICMP Type 3, Code 4
5. Missing fragment: the middle fragment is lost, reassembly stays incomplete
6. Out-of-order delivery: shuffled arrival, reassembly still succeeds

---

## 2. Run locally

No installation, no server, no internet connection needed.

1. Copy the whole `dcn_virtual_lab` folder to your computer.
2. **Double-click `index.html`.** It opens in your default browser (Chrome, Edge, Firefox or Safari).
3. Start from **Experiment setup**, or click a scenario button.

The lab uses classic `<script>` tags (no ES modules), so it works straight from `file://`.

### Run the tests (optional, needs Node.js)

```
node tests/fragmentation.test.js
```

Prints PASS or FAIL for each test and exits with a non-zero code if anything fails. Expected result: `43 passed, 0 failed`.

---

## 3. Deploy to the university website

The lab is a static folder: HTML, CSS, JavaScript and SVG. It makes no network requests and needs no backend, database or paid API.

1. **Upload the entire folder** (keep the structure: `index.html`, `css/`, `js/`, `assets/`) to the web space or CMS file manager provided for V-Lab pages. All paths are relative, so it works from any sub-folder.
2. Open `https://<university-site>/<path>/dcn_virtual_lab/index.html` and check that the sidebar, simulation and quiz load.
3. **To embed inside an existing page or CMS**, use an iframe:

   ```html
   <iframe src="dcn_virtual_lab/index.html" title="DCN V-Lab: IP Fragmentation"
           width="100%" height="900" style="border:0" allow="microphone"></iframe>
   ```

   The `allow="microphone"` attribute is only needed for the optional spoken commands.
4. Do not upload `tests/` if you want a lighter deployment. The lab does not use it.


### Interface, themes and navigation

* **Design system:** one token set in `css/style.css` drives both themes (light by default, dark on request). Headings use an editorial serif, UI text a system sans, and every number a student must read uses monospace. All fonts are system fonts, so the lab stays fully offline.
* **Theme:** use the **Dark mode / Light mode** control in the header, or press **D**. The choice is saved in local storage; if storage is blocked it still works for the current page view.
* **Jump anywhere:** press **Ctrl/Cmd + K** (or **/**) to open the section finder. Press **1** to **9** to go straight to a section. Each page ends with Previous / Next buttons that follow the recommended order.
* **Live fragment map** on the Experiment setup page: a colour-coded bar that re-splits the payload as the sliders move (fragments, a single "fits" block, or a DF drop).
* **Animated home scene** showing a 4000-byte datagram split by a router and rebuilt at the destination.
* **Simulation stage:** a dark, glowing stage in both themes so fragment colours stay vivid. The same colours are used on the stage, the header inspector, the reassembly cards and the byte-range bar.
* **Accessibility:** visible keyboard focus, skip link, `aria-current` on the active section, and the **Reduce motion** setting is respected (animations are replaced by a static end state).
* **Print:** printing the page produces all sections without the sidebar and controls.

### Simulation page

* **Run summary:** chips above the stage show datagram size, MTU, header length, DF, Identification and the outcome.
* **Stage timeline:** every stage of the run (create, cross Link A, router check, split, headers, cross Link B, delivery) lights up as it plays, with a live "Stage n of N" label and the current explanation beside it.
* **Fragment tray:** one card per fragment with its size, offset and MF, moving through *At source → Created → In transit → Arrived*. During the header stage the card for the fragment being described is highlighted.
* **Reassembly buffer:** a small bar under the destination fills in byte-position order as fragments land, so students see that offset, not arrival order, decides placement. Hover any fragment on the stage for its fields.
* **Controls:** Start, Pause, Resume, Step, Reset, plus 0.5× / 1× / 2× presets and a fine slider. **Step** plays one stage at a time and **Resume** hands the rest back to automatic playback.
* **Shortcuts** (on the simulation page): **Space** start / pause / resume, **→** step, **R** reset.
* **When a run ends** a banner offers the sensible next step (Reassemble, Inspect a header, View results). After a DF drop it offers **Clear DF and run again**.
* The animation pauses automatically if you leave the page or switch tabs, so it never plays or narrates unseen.
* **Settings** (section 10, gear icon, key **0**): theme, accent colour, text size, high contrast, reduce motion, sidebar mode (**B** hides it), default speed, auto-start, Identification format, initial TTL, reassembly timeout, export/import. See RELEASE_NOTES_V4_1.md.
* On phones the stage scrolls sideways (kept legible) and follows the action.

### Adding the demo video

Set **one** of these in the configuration block near the top of `index.html`. This project is already configured with the supplied YouTube demonstration video:

```html
window.VLAB_CONFIG = { videoSrc: "", videoUrl: "https://www.youtube.com/embed/O4iy_rZxbyQ" };
```

* **Local file:** copy the recorded MP4 to `assets/videos/demo.mp4` and set `videoSrc` as above. If the file is missing, the lab shows the placeholder instead of a broken player.
* **Hosted video:** leave `videoSrc` empty and set `videoUrl` to a YouTube link (`youtu.be`, `watch?v=`, or `/embed/`) or a university-approved `https://` embed URL. YouTube links are normalised to the correct `/embed/VIDEO_ID` format automatically.
* The YouTube iframe sends `referrerpolicy="strict-origin-when-cross-origin"` and the page includes the matching referrer meta policy. A direct **Watch on YouTube** link is shown below the player as a fallback.
* **Local testing:** do not double-click `index.html` when testing YouTube playback. Open a terminal in the project folder and run `py -m http.server 8000`, then visit `http://localhost:8000`. A `file://` page does not provide a normal HTTP Referer, which YouTube requires for embedded playback.
* **University hosting:** deploy the site over HTTPS. Ensure the video owner has enabled **Allow embedding** in YouTube Studio. The hosting server must not override the page with `Referrer-Policy: no-referrer` or `same-origin`; use `strict-origin-when-cross-origin`.

The supplied demonstration URL is `https://youtu.be/O4iy_rZxbyQ` (embedded as `https://www.youtube.com/embed/O4iy_rZxbyQ`).

### Browser notes

* Works offline. It uses system fonts only and loads nothing from a CDN.
* **Speech output** uses the browser's built-in Web Speech API. It is blocked until the user clicks, so the lab never speaks on page load. The welcome line plays after **Start experiment** is clicked, when the voice assistant is switched on.
* **Voice commands** (the "Speak a command" button) need microphone permission, usually need `https` or `localhost`, and in Chrome need an internet connection. If unavailable the button is disabled with a note. Every command also has a normal clickable button, so nothing depends on the microphone.
* Progress settings (last inputs, voice on/off, team names) are saved in the browser's local storage. If storage is blocked, the lab still works.

---

## 4. The rules the lab implements

```
Original payload  = D - H
Pmax              = floor((MTU - H) / 8) * 8
Fragment payload  = min(Pmax, remaining payload)
Total length      = fragment payload + H
Fragment offset   = byte offset / 8
MF                = 1 on every fragment except the last (MF = 0)
Destination payload length = (last offset * 8) + last fragment payload
```

* `D <= MTU`: forwarded unchanged. No fragmentation.
* `D > MTU` and DF = 1: the router drops the packet and returns **ICMP Type 3, Code 4** with the Next-Hop MTU.
* `D > MTU` and DF = 0: fragmented.
* Rejected inputs: MTU <= H, and any case where Pmax < 8.
* Every fragment has the same Identification, addresses, protocol and TTL, but its **own header and own checksum**.
* The router decrements TTL by 1 and the header checksum is recomputed. The checksum is the real 16-bit one's-complement checksum, never a placeholder.
* **Reassembly** groups fragments by (source, destination, protocol, Identification), places each payload by byte range and **never concatenates in arrival order**. Out-of-order arrival is not loss. Missing byte ranges are tracked as merged intervals. Duplicates and overlaps are handled safely.
* **Reassembly timeout:** default 15 s (RFC 791 suggestion; real systems use about 30 to 60 s). On expiry with gaps the partial datagram is discarded ("Discarded: timeout"). A real destination also sends **ICMP Time Exceeded, Type 11 Code 1**, but only if fragment zero had arrived; the lab shows this.

### Assumption about IP options (shown in the UI and Theory page)

> A header length of **24 or 28 bytes** means IP options are present. This lab **assumes every option is "copied"**, so every fragment keeps the same header length.
> In real IPv4 only options whose *copied* flag is set are copied into every fragment, and the others appear only in the first fragment, so real fragments can have different header lengths.

---

## 5. Folder guide

```
dcn_virtual_lab/
├── index.html                 Page structure, lab configuration (video), script loading
├── SPEC.md                    The full build specification
├── README.md                  This file
├── DEMO_SCRIPT.md             Narration script for the 8-step demo video
├── css/
│   └── style.css              Design system: tokens, both themes, responsive layout, fragment colours
├── js/
│   ├── checksum.js            IPv4 / ICMP checksum and IP helpers (pure logic)
│   ├── fragmentation.js       Fragmentation engine and rule verification (pure logic)
│   ├── reassembly.js          Destination reassembly engine and timer (pure logic)
│   ├── quiz.js                Quiz module
│   ├── packet_inspector.js    32-bit header diagram and field explanations
│   ├── network_animation.js   SVG topology animation (play, pause, step, reset)
│   ├── voice_assistant.js     Text-to-speech narration and voice commands
│   ├── settings.js            Settings store, sidebar modes and groups, progress, Settings page
│   ├── app.js                 Navigation, setup, scenarios, results, reassembly lab
│   └── ui_enhancements.js     Theme, fragment map, pager, section finder, simulation shortcuts
├── tests/
│   ├── fragmentation.test.js  Plain Node tests (no framework)
│   └── settings_smoke.py      Browser test for Settings and sidebar (optional, needs Playwright)
└── assets/
    ├── images/                (empty, for your own images)
    ├── icons/                 (empty)
    └── videos/                put demo.mp4 here
```

**Load order** in `index.html`: checksum, fragmentation, reassembly, quiz, packet_inspector, network_animation, voice_assistant, app, then `ui_enhancements.js`. The experiment modules share the `window.VLab` namespace. The final UI enhancement script only updates the portal breadcrumb and active navigation accessibility state; it does not change simulation behaviour. The three logic files have no DOM dependency and can also be loaded in Node.

### Customising

* **Team members:** open *Video and references*, type names and roll numbers. They are saved in your browser. To pre-fill them for everyone, edit the `team-grid` block in `index.html`.
* **Defaults and limits:** edit `LIMITS` and `DEFAULTS` at the top of `js/fragmentation.js` (and the slider `min`/`max` in `index.html`).
* **Reassembly timeout:** change `DEFAULT_TIMEOUT_MS` in `js/reassembly.js`, and the note text in `index.html`.
* **Quiz questions:** edit `buildBank()` in `js/quiz.js`. Numeric answers are taken from the engine.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Page opens but nothing responds | JavaScript is disabled. Enable it, or try another browser. |
| No sound | Turn the **Voice assistant** switch on in the sidebar, then click a button. Check the device volume. Speech is blocked until the first click. |
| "Speak a command" is greyed out | The browser has no speech recognition. Use the command buttons. |
| YouTube says “refused to connect” or shows error 153 | Use the HTTPS embed URL (the app normalises common YouTube links), serve locally with `py -m http.server 8000` rather than `file://`, ensure embedding is allowed in YouTube Studio, and ensure the host sends `Referrer-Policy: strict-origin-when-cross-origin`. Use the Watch on YouTube fallback while troubleshooting. |
| Video shows the placeholder | Both `videoSrc` and `videoUrl` are empty, or a local MP4 file is missing. |
| Layout looks narrow in an iframe | Give the iframe at least 900 px height and 100% width. |

---

## 7. References

* J. Kurose and K. Ross, *Computer Networking: A Top-Down Approach*, Pearson.
* RFC 791: Internet Protocol.
* RFC 6864: Updated Specification of the IPv4 ID Field.
* RFC 792: Internet Control Message Protocol.
* RFC 1071: Computing the Internet Checksum (used for the checksum algorithm).

---

*Submission: Data Communication and Networking, Experiment No. 4. Group work, 6 students per group. Deadline: 03 Nov 2026.*


### IPv6 fragmentation simulator
The IPv6 module is a separate interactive lab. Configure the original packet size and path MTU, then use Start/Pause/Resume/Step/Reset and the speed slider to inspect the sequence. The simulator demonstrates ICMPv6 Packet Too Big, source-only fragmentation, the 8-byte Fragment Header, 32-bit Identification, fragment offsets, the M flag and destination reassembly. Its simplified calculation assumes a 40-byte base header and no other extension headers. Each quiz attempt includes 10 IPv4 questions and 5 IPv6 questions.


### IPv6 module
The IPv6 module provides a separate source-fragmentation simulation and theory section. It models a 40-byte IPv6 base header and an 8-byte Fragment Header; the lab's calculations assume no additional extension headers.


## IPv6 workspace (V2.6)

The IPv6 Fragmentation Lab is available from the left sidebar. Open the **IPv6 workspace** drawer to access theory, packet setup, the seven-stage simulation, fragment cards, Fragment Header inspection, destination reassembly, calculations, the event log, IPv4/IPv6 comparison, and an IPv6-only knowledge check. The drawer also mirrors packet size, Path MTU, simulation speed, and Start/Pause/Resume/Step/Reset controls. It is a collapsible sidebar panel; it does not expand the simulation into a full-screen overlay.

The simulator uses a simplified packet model with a 40-byte IPv6 base header and an 8-byte Fragment Header, without additional extension headers. For a 4000-byte IPv6 packet and a 1500-byte Path MTU, the fragmentable part is 3960 bytes and the generated fragment data sizes are 1448, 1448, and 1064 bytes. Their offsets are 0, 181, and 362, their M flags are 1, 1, and 0, and their packet lengths are 1496, 1496, and 1112 bytes.

### IPv6 checks

Run the IPv6 calculation and quiz tests with:

```bash
node tests/ipv6.test.js
```

Run the existing IPv4 regression tests with:

```bash
node tests/fragmentation.test.js
```


## Experiment 05 — IPv6 (separate pages)
The IPv6 experiment now lives in the `ipv6/` directory as a separate multi-page laboratory. Start from `ipv6/index.html`, or use the IPv6 Fragmentation Lab link in the main sidebar. The IPv4 simulator pages and core files remain unchanged. See `ipv6/README.md` for the model assumptions and page list.
