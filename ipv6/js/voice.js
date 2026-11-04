/* IPv6 voice assistant — mirrors the IPv4 assistant UI and controls. */
(function () {
  'use strict';
  var KEY = 'dcn-v6-voice-enabled', VOICE_KEY = 'dcn-v6-voice-name';
  var synth = window.speechSynthesis, Utter = window.SpeechSynthesisUtterance;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var enabled = false, paused = false, lastText = '', voice = null, recognizer = null, listening = false;
  function $(id) { return document.getElementById(id); }

  var lessons = {
    fragmentation: 'IPv6 fragmentation is performed only by the source node. If a packet is larger than the Path MTU, an intermediate router does not split it. The router discards the oversized packet and sends an ICMPv6 Packet Too Big message, type 2 code 0, to the source. The source then creates fragments using a Fragment Extension Header.',
    router: 'An IPv6 router never fragments a packet. If the packet is too large for the outgoing link, the router drops it and sends an ICMPv6 Packet Too Big message containing the next-hop MTU. The source uses this information to send smaller packets.',
    header: 'The IPv6 Fragment Extension Header is 8 bytes long. It contains a Next Header field, a reserved byte, a 13-bit Fragment Offset, two reserved bits, the M flag and a 32-bit Identification value. The IPv6 base header Next Header field is 44 when a Fragment Header follows.',
    offset: 'The Fragment Offset is measured in units of eight bytes. It identifies where fragment data belongs in the original fragmentable part. The M flag is 1 when more fragments follow and 0 for the final fragment. Non-final fragment data lengths must be multiples of eight bytes.',
    reassembly: 'IPv6 fragments are reassembled only by the destination. The destination identifies fragments belonging to the same packet and places their data at the byte positions indicated by their offsets. Reassembly completes when all required data has arrived, including the final fragment. Missing data leaves the packet incomplete until the reassembly timer expires.',
    pmtu: 'Path MTU Discovery finds the smallest MTU along the route. When a router cannot forward a packet because it is too large, it sends ICMPv6 Packet Too Big, Type 2 Code 0, with the next-hop MTU. The source then sends packets that fit. Routers do not fragment IPv6 packets.',
    identification: 'The Fragment Identification field is 32 bits. All fragments of one original IPv6 packet carry the same Identification value so the destination can associate them during reassembly.',
    start: 'Starting the IPv6 simulation. Watch the original packet travel to the router. The router reports Packet Too Big, then the source creates fragments and sends them to the destination for reassembly.'
  };
  var pageText = {
    index: 'Welcome to the IPv6 fragmentation and reassembly virtual lab. This experiment covers source-only fragmentation, Path MTU Discovery, the Fragment Extension Header, fragment offsets and destination reassembly.',
    theory: 'This theory section explains the 40-byte IPv6 base header, the 8-byte Fragment Extension Header, source-only fragmentation, the 13-bit Fragment Offset, the M flag, 32-bit Identification, Path MTU Discovery and destination reassembly.',
    setup: 'Configure the original IPv6 packet size, Path MTU and upper-layer protocol. Review the calculated fragment data sizes, offsets, M flags and header lengths, then save the configuration before running the simulation.',
    simulation: 'This is the IPv6 live simulation. Follow the packet from source to router, the ICMPv6 Packet Too Big response, source-side fragmentation, fragment transmission and destination reception. Use Start, Pause, Resume, Step and Reset to control the simulation.',
    headers: 'The packet header inspector shows the IPv6 base header and Fragment Extension Header. Review Version, Traffic Class, Flow Label, Payload Length, Next Header, Hop Limit, source and destination addresses, Fragment Offset, M flag and Identification.',
    reassembly: 'In the destination reassembly lab, fragments are placed into the receive buffer according to their offsets. Try out-of-order arrival, duplicates or a missing fragment and observe whether the original packet can be reconstructed.',
    results: 'The results page lists fragment data bytes, Fragment Header size, IPv6 Payload Length, total length, byte start, offset and M flag. Check that each fragment fits the Path MTU and every non-final fragment data length is divisible by eight.',
    quiz: 'The IPv6 knowledge check covers source-only fragmentation, ICMPv6 Packet Too Big, the Fragment Extension Header, offsets, M flag, Identification, Path MTU Discovery and reassembly.'
  };
  var stageText = {
    create: 'The source creates the original IPv6 packet.',
    linkA: 'The packet travels across Link A towards the router.',
    router: 'The router checks the outgoing link MTU. It cannot fragment IPv6 packets.',
    tooBig: 'The router drops the oversized packet and sends an ICMPv6 Packet Too Big message to the source.',
    fragment: 'The source fragments the packet and adds a Fragment Extension Header to each fragment.',
    headers: 'The source builds fragment headers. All fragments share the same 32-bit Identification value and use offsets in eight-byte units.',
    linkB: 'The fragments travel across the link towards the destination.',
    destination: 'The destination receives the fragments and reassembles the original packet.'
  };

  function buildPanel() {
    if ($('v6-voice-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'v6-voice-panel'; panel.className = 'voice-panel';
    panel.innerHTML = '<details class="voice-details" id="v6-voice-details">' +
      '<summary class="voice-summary"><span class="voice-summary-icon" aria-hidden="true">♫</span><span class="voice-summary-copy"><strong>IPv6 Voice assistant</strong><small>Listen &amp; ask the lab</small></span><span class="voice-summary-chevron" aria-hidden="true">⌄</span></summary>' +
      '<div class="voice-content"><div class="voice-head"><span>Speech controls</span><label class="switch"><input type="checkbox" id="v6-voice-toggle"><span>On</span></label></div>' +
      '<label class="v6-voice-label" for="v6-voice-select">Narrator voice</label><select id="v6-voice-select" class="v6-voice-select" aria-label="Narrator voice"></select>' +
      '<div class="voice-buttons"><button id="v6-voice-play" type="button">Play</button><button id="v6-voice-pause" type="button" disabled>Pause</button><button id="v6-voice-resume" type="button" disabled>Resume</button><button id="v6-voice-repeat" type="button" disabled>Repeat</button></div>' +
      '<div class="voice-commands" aria-label="IPv6 voice commands"><button data-v6-command="fragmentation">Explain IPv6 fragmentation</button><button data-v6-command="router">Explain router behaviour</button><button data-v6-command="header">Explain Fragment Header</button><button data-v6-command="offset">Explain fragment offset and M flag</button><button data-v6-command="identification">Explain Identification</button><button data-v6-command="pmtu">Explain Path MTU Discovery</button><button data-v6-command="reassembly">Explain destination reassembly</button><button data-v6-command="start">Start IPv6 simulation</button><button id="v6-voice-mic" type="button">Speak a command</button></div>' +
      '<p class="voice-note" id="v6-voice-note" aria-live="polite">Voice is off. Turn it on to hear IPv6 explanations.</p></div></details>';
    var sidebar = document.querySelector('.sidebar');
    (sidebar || document.body).appendChild(panel);
  }
  function setNote(t) { var n = $('v6-voice-note'); if (n) n.textContent = t; }
  function updateButtons() {
    var busy = !!(synth && (synth.speaking || synth.pending));
    $('v6-voice-play').disabled = !synth || !Utter;
    $('v6-voice-pause').disabled = !enabled || !busy || paused;
    $('v6-voice-resume').disabled = !enabled || !paused;
    $('v6-voice-repeat').disabled = !lastText;
    var mic = $('v6-voice-mic'); if (mic) { mic.classList.toggle('listening', listening); mic.textContent = listening ? 'Listening… (click to stop)' : 'Speak a command'; }
  }
  function chooseVoice() {
    if (!synth) return;
    var list = synth.getVoices() || [], select = $('v6-voice-select'), saved = '';
    try { saved = localStorage.getItem(VOICE_KEY) || ''; } catch (e) {}
    select.innerHTML = '';
    list.filter(function (v) { return /^en(-|$)/i.test(v.lang); }).forEach(function (v) {
      var opt = document.createElement('option'); opt.value = v.name; opt.textContent = v.name + ' · ' + v.lang; select.appendChild(opt);
    });
    if (!select.options.length) { var opt = document.createElement('option'); opt.value = ''; opt.textContent = 'Default browser voice'; select.appendChild(opt); }
    voice = list.find(function (v) { return v.name === saved; }) || list.find(function (v) { return /female|zira|samantha|aria|jenny|susan|hazel|google.*female/i.test(v.name) && /^en/i.test(v.lang); }) || list.find(function (v) { return /^en-IN/i.test(v.lang); }) || list.find(function (v) { return /^en/i.test(v.lang); }) || null;
    if (voice) select.value = voice.name;
  }
  function speak(text) {
    lastText = text; setNote(text);
    if (!enabled || !synth || !Utter) { updateButtons(); return; }
    synth.cancel(); paused = false;
    window.setTimeout(function () {
      var u = new Utter(text); if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-IN';
      u.rate = 0.97; u.pitch = 1; u.onend = u.onerror = updateButtons; synth.speak(u); updateButtons();
    }, 60);
    updateButtons();
  }
  function runCommand(cmd) {
    if (cmd === 'start') {
      var button = document.querySelector('#sim-start,#btn-sim-start,[data-action="start"],#start-sim');
      if (button) { button.click(); speak(lessons.start); }
      else { var link = document.querySelector('[data-page="simulation"],a[href*="simulation"]'); if (link) link.click(); speak('Open the Live Simulation page and press Start to begin.'); }
    } else speak(lessons[cmd] || lessons.fragmentation);
  }
  function currentPage() { return document.body.dataset.page || (location.pathname.split('/').pop() || 'index').replace('.html', ''); }
  function playPage() { speak(pageText[currentPage()] || pageText.index); }
  function matchCommand(t) {
    t = String(t || '').toLowerCase();
    if (/start|run|simulate/.test(t)) return 'start';
    if (/reassembl/.test(t)) return 'reassembly';
    if (/identification/.test(t)) return 'identification';
    if (/offset|m flag|more fragment/.test(t)) return 'offset';
    if (/header/.test(t)) return 'header';
    if (/router|packet too big/.test(t)) return 'router';
    if (/path mtu|pmtu|discovery/.test(t)) return 'pmtu';
    if (/fragment/.test(t)) return 'fragmentation';
    return null;
  }
  function listen() {
    if (!Recognition) { setNote('Speech recognition is not supported in this browser. Use the command buttons instead.'); return; }
    if (listening && recognizer) { recognizer.stop(); return; }
    try {
      recognizer = new Recognition(); recognizer.lang = 'en-IN'; recognizer.interimResults = false; recognizer.maxAlternatives = 3;
      recognizer.onstart = function () { listening = true; updateButtons(); setNote('Listening… say an IPv6 topic or command.'); };
      recognizer.onresult = function (e) { var heard = e.results[0][0].transcript, cmd = null; for (var i = 0; i < e.results[0].length && !cmd; i++) cmd = matchCommand(e.results[0][i].transcript); if (cmd) { setNote('Heard: “' + heard + '”'); runCommand(cmd); } else setNote('Heard: “' + heard + '”. Try “explain Fragment Header” or “explain reassembly”.'); };
      recognizer.onerror = function (e) { setNote(e.error === 'not-allowed' ? 'Microphone access blocked. Allow it in browser settings or use the command buttons.' : e.error === 'network' ? 'Speech recognition needs an internet connection in this browser.' : 'Could not recognise speech. Please try again.'); };
      recognizer.onend = function () { listening = false; updateButtons(); };
      recognizer.start();
    } catch (e) { setNote('Could not start the microphone. Use the command buttons instead.'); }
  }
  function init() {
    buildPanel();
    var toggle = $('v6-voice-toggle');
    try { enabled = localStorage.getItem(KEY) === 'true'; } catch (e) {}
    toggle.checked = enabled;
    if (!synth || !Utter) { toggle.disabled = true; setNote('Speech synthesis is not supported in this browser.'); }
    chooseVoice(); if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', chooseVoice);
    toggle.addEventListener('change', function () { enabled = toggle.checked; try { localStorage.setItem(KEY, String(enabled)); } catch (e) {} if (!enabled && synth) { synth.cancel(); paused = false; setNote('Voice is off.'); } else speak('IPv6 voice assistant on.'); updateButtons(); });
    $('v6-voice-select').addEventListener('change', function () { voice = (synth.getVoices() || []).find(function (v) { return v.name === this.value; }, this) || null; try { localStorage.setItem(VOICE_KEY, this.value); } catch (e) {} if (enabled) speak('Narrator voice updated.'); });
    $('v6-voice-play').addEventListener('click', playPage);
    $('v6-voice-pause').addEventListener('click', function () { if (synth && enabled) { synth.pause(); paused = true; updateButtons(); } });
    $('v6-voice-resume').addEventListener('click', function () { if (synth && enabled) { synth.resume(); paused = false; updateButtons(); } });
    $('v6-voice-repeat').addEventListener('click', function () { if (lastText) speak(lastText); });
    document.querySelectorAll('[data-v6-command]').forEach(function (b) { b.addEventListener('click', function () { runCommand(b.dataset.v6Command); }); });
    $('v6-voice-mic').addEventListener('click', listen); updateButtons();
  }
  window.V6Voice = {
    speak: function (text) { if (enabled) speak(text); },
    narrateStage: function (name) { if (enabled && stageText[name]) speak(stageText[name]); },
    isEnabled: function () { return enabled; },
    runCommand: runCommand
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
