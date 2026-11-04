/**
 * voice_assistant.js
 * Voice assistant for the DCN Virtual Lab.
 * Uses the browser's free Web Speech API.
 */

(function (root) {
  'use strict';

  var STORAGE_KEY = 'vlab.voice.enabled';

  var synth = window.speechSynthesis || null;
  var Utter = window.SpeechSynthesisUtterance || null;
  var Recognition = window.SpeechRecognition ||
                   window.webkitSpeechRecognition || null;

  var supported = !!(synth && Utter);

  var enabled = false;
  var paused = false;
  var voice = null;
  var lastText = '';
  var active = [];
  var recognizer = null;
  var listening = false;

  function $(id) {
    return document.getElementById(id);
  }

  // --------------------------------------------------
  // WORDING HELPERS
  // --------------------------------------------------

  var WORDS = [
    'zero', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen',
    'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty'
  ];

  function word(n) {
    return (n >= 0 && n <= 20 && n === Math.floor(n))
      ? WORDS[n]
      : String(n);
  }

  function pronounce(text) {
    return text
      .replace(/\bIPv4\b/g, 'I P version 4')
      .replace(/\bICMP\b/g, 'I C M P')
      .replace(/\bMTU\b/g, 'M T U')
      .replace(/\bTTL\b/g, 'T T L')
      .replace(/\bDF\b/g, 'D F')
      .replace(/\bMF\b/g, 'M F')
      .replace(/\bIP\b/g, 'I P')
      .replace(/\bTCP\b/g, 'T C P')
      .replace(/\bUDP\b/g, 'U D P');
  }

  function splitSentences(text) {
    var parts = text.match(/[^.!?]+[.!?]*/g) || [text];

    return parts.map(function (s) {
      return s.trim();
    }).filter(Boolean);
  }

  function currentResult() {
    var app = root.VLab && root.VLab.App;

    return (app && app.getState && app.getState().result) || null;
  }

  // --------------------------------------------------
  // NARRATION CUES
  // --------------------------------------------------

  var CUES = {

    'welcome': function () {
      return 'Welcome to the IP Fragmentation Virtual Laboratory. Set the datagram size and the MTU, then press Simulate.';
    },

    'needs-fragmentation': function (d) {
      return 'The original datagram of ' + d.size +
        ' bytes exceeds the network MTU of ' + d.mtu +
        ' bytes. Fragmentation is now required.';
    },

    'no-fragmentation': function (d) {
      return 'The datagram of ' + d.size +
        ' bytes fits within the MTU of ' + d.mtu +
        ' bytes, so no fragmentation is needed.';
    },

    'fragments-generated': function (d) {
      return 'The router has generated ' + d.count +
        ' fragments. Every fragment except the last carries ' +
        d.pmax + ' bytes of payload.';
    },

    'fragment-detail': function (d) {
      return 'Fragment ' + word(d.index) +
        ' has a fragment offset of ' + word(d.offset) +
        '. Its More Fragments flag is set to ' + word(d.mf) + '.';
    },

    'final-fragment': function () {
      return 'The final fragment has its More Fragments flag set to zero.';
    },

    'fragments-arrived': function (d) {
      return 'All ' + d.count +
        ' fragments have reached the destination. Open the Reassembly laboratory to rebuild the datagram.';
    },

    'df-dropped': function (d) {
      return 'The Don’t Fragment flag is set and the packet is larger than the MTU of ' +
        d.mtu + ' bytes. The router cannot fragment it, so it drops the packet.';
    },

    'icmp-returned': function (d) {
      return 'The router returns an ICMP Destination Unreachable message, type 3, code 4, telling the sender that the next hop MTU is ' +
        d.mtu + ' bytes.';
    },

    'fragment-received': function (d) {
      return 'Fragment ' + word(d.index) +
        ' received. Its offset of ' + d.offset +
        ' places it at byte ' + (d.offset * 8) + '.';
    },

    'reassembly-complete': function (d) {
      return 'All required fragments have arrived. The destination can now reconstruct the original datagram' +
        (d && d.size ? ' of ' + d.size + ' bytes.' : '.');
    },

    'reassembly-missing': function (d) {
      return 'A fragment is missing, so the destination cannot reconstruct the datagram yet. It is still waiting for ' +
        (d && d.range ? d.range : 'some bytes') + '.';
    },

    'reassembly-timeout': function () {
      return 'The reassembly timer has expired. The destination discards the incomplete datagram.';
    }

  };

  var LOW_PRIORITY = {
    'fragment-received': true
  };

  // --------------------------------------------------
  // EXPLANATIONS
  // --------------------------------------------------

  function explainFragmentation() {
    var text = 'Fragmentation happens when an IP datagram is larger than the MTU of the next link. The router cuts the payload into pieces whose sizes are multiples of 8 bytes, gives each piece its own IP header, and forwards them. Only the destination puts them back together.';

    var r = currentResult();

    if (r && r.status === 'fragmented') {
      text += ' In your simulation the payload is ' +
        r.originalPayloadSize + ' bytes and each fragment carries at most ' +
        r.maxFragmentPayload + ' bytes.';
    }

    return text;
  }

  function explainOffset() {
    var text = 'The fragment offset says where a fragment’s data starts inside the original payload, counted in units of 8 bytes. A fragment that starts at byte 1480 has an offset of 1480 divided by 8, which is 185.';

    var r = currentResult();

    if (r && r.status === 'fragmented' && r.fragments.length > 1) {
      var f = r.fragments[1];

      text += ' In your simulation, fragment 2 starts at byte ' +
        f.byteOffset + ', so its offset is ' + f.fragmentOffset + '.';
    }

    return text;
  }

  function explainDf() {
    return 'The Don’t Fragment flag, D F, tells routers not to fragment a packet. If D F is 1 and the packet is larger than the MTU, the router drops it and sends back an ICMP message, type 3, code 4, with the next hop MTU. If D F is 0, the router may fragment.';
  }

  function explainReassembly() {
    return 'Reassembly happens only at the destination. It groups fragments by source, destination, protocol and Identification, places each one using its offset, and learns the total length from the fragment whose More Fragments flag is zero. When no byte range is missing, the datagram is rebuilt. Fragments arriving out of order are not lost. If a fragment really is lost, the incomplete datagram is discarded when the reassembly timer expires.';
  }

  function explainMtu() {
    return 'The MTU, or Maximum Transmission Unit, is the largest IP packet, header included, that a link can carry. Ethernet uses 1500 bytes. A datagram bigger than the MTU of the next link must be fragmented, unless D F forbids it.';
  }

  function explainMf() {
    return 'The More Fragments flag, M F, is 1 on every fragment except the last one. The final fragment has M F equal to 0, which tells the destination where the datagram ends.';
  }

  function explainId() {
    return 'The Identification field is a number the source gives each datagram. Every fragment of that datagram carries the same value, so the destination knows which fragments belong together.';
  }

  var COMMANDS = {
    'explain-fragmentation': explainFragmentation,
    'explain-offset': explainOffset,
    'explain-df': explainDf,
    'explain-reassembly': explainReassembly,
    'explain-mtu': explainMtu,
    'explain-mf': explainMf,
    'explain-id': explainId
  };

  // --------------------------------------------------
  // RESULT SUMMARY
  // --------------------------------------------------

  function resultSentence() {
    var r = currentResult();

    if (!r) return null;

    var p = r.params;

    if (r.status === 'no-fragmentation') {
      return 'Your last simulation sent a ' + p.datagramSize +
        ' byte datagram over an MTU of ' + p.mtu +
        ', so it was forwarded unchanged.';
    }

    if (r.status === 'dropped-df') {
      return 'Your last simulation sent a ' + p.datagramSize +
        ' byte datagram with D F set over an MTU of ' + p.mtu +
        ', so the router dropped it and returned ICMP type 3, code 4.';
    }

    return 'Your last simulation split a ' + p.datagramSize +
      ' byte datagram into ' + r.fragments.length +
      ' fragments for an MTU of ' + p.mtu + '.';
  }

  // --------------------------------------------------
  // SECTION EXPLANATIONS
  // --------------------------------------------------

  var SECTION_TEXT = {

    home: function () {
      return 'Welcome to the IP Fragmentation Virtual Laboratory. When a datagram is bigger than the link MTU, the router splits it into fragments, and only the destination puts them back together. Use the menu to read the theory, set up an experiment and simulate it.';
    },

    theory: function () {
      return 'This section covers datagrams, MTU, the Identification field, fragment offset, the More Fragments flag, the Don’t Fragment flag and reassembly. The maximum fragment payload is the floor of MTU minus header length, divided by 8, times 8.';
    },

    setup: function () {
      return 'Choose the datagram size, the MTU, the header length and the Don’t Fragment flag, or load one of the six scenarios. Then press Simulate.';
    },

    simulation: function () {
      var s = resultSentence();

      return (s ? s + ' ' : '') +
        'Press Start to watch the packet travel from the source to the router and on to the destination. Use Pause, Step and the speed slider to follow each stage.';
    },

    inspector: function () {
      return 'Pick a packet to see its IPv4 header. The purple fields are the ones fragmentation uses: Identification, the flags and the fragment offset. Select a field for an explanation with this packet’s values.';
    },

    reassembly: function () {
      return 'You are the destination. Deliver the fragments in any order, mark one as lost, or repeat one. The bar shows which byte ranges have arrived. Arriving out of order is fine, but a missing range keeps the datagram incomplete.';
    },

    results: function () {
      var s = resultSentence();

      return s
        ? s + ' The table lists every packet with its payload, total length, offset and flags.'
        : 'Run a simulation to see the results table and the conclusion.';
    },

    quiz: function () {
      return 'Answer each question to get immediate feedback and an explanation. Your final score appears at the end, and you can retry.';
    },

    resources: function () {
      return 'This page holds the demonstration video, the experiment documentation with the procedure and viva questions, the references and your team members.';
    }

  };

  function activeSection() {
    var sec = document.querySelector('.lab-section.active');

    return sec ? sec.id.replace('sec-', '') : 'home';
  }

  // --------------------------------------------------
  // FEMALE-SOUNDING VOICE SELECTION
  // --------------------------------------------------

  function pickVoice() {
    if (!supported) return;

    var voices = synth.getVoices() || [];

    if (!voices.length) return;

    var englishVoices = voices.filter(function (v) {
      return v.lang && /^en(-|$)/i.test(v.lang);
    });

    var preferredNames =
      /zira|samantha|aria|jenny|female|susan|hazel|heera|veena|sonia|libby|natasha|ava|allison|karen|victoria|tessa|moira|fiona|google.*female|microsoft.*(zira|aria|jenny)/i;

    voice = englishVoices.find(function (v) {
      return preferredNames.test(v.name || '');
    }) ||
    englishVoices.find(function (v) {
      return /^en-IN/i.test(v.lang);
    }) ||
    englishVoices.find(function (v) {
      return /^en-US/i.test(v.lang);
    }) ||
    englishVoices[0] ||
    voices[0] ||
    null;
  }

  // --------------------------------------------------
  // USER INTERFACE
  // --------------------------------------------------

  function setNote(text) {
    var note = $('voice-note');

    if (note) note.textContent = text;
  }

  function updateButtons() {
    var speaking = supported && (synth.speaking || synth.pending);
    var on = supported && enabled;

    var set = function (id, disabled) {
      var b = $(id);
      if (b) b.disabled = disabled;
    };

    set('voice-play', !supported);
    set('voice-pause', !on || !speaking || paused);
    set('voice-resume', !on || !paused);
    set('voice-repeat', !supported || !lastText);
  }

  // --------------------------------------------------
  // TEXT TO SPEECH
  // --------------------------------------------------

  function say(text, opts) {
    var o = opts || {};

    lastText = text;
    setNote(text);

    if (!supported) {
      updateButtons();
      return;
    }

    if (o.low && (synth.speaking || synth.pending)) {
      updateButtons();
      return;
    }

    if (!o.queue) {
      synth.cancel();
      paused = false;
    }

    var chunks = splitSentences(pronounce(text));

    var start = function () {
      chunks.forEach(function (chunk, i) {
        var u = new Utter(chunk);

        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else {
          u.lang = 'en-US';
        }

        // Requested narration settings
        u.rate = 1.45;
        u.pitch = 0.80

        u.onend = u.onerror = function () {
          var idx = active.indexOf(u);

          if (idx !== -1) active.splice(idx, 1);

          updateButtons();
        };

        if (i === 0) u.onstart = updateButtons;

        active.push(u);
        synth.speak(u);
      });

      updateButtons();
    };

    if (o.queue) {
      start();
    } else {
      window.setTimeout(start, 60);
    }
  }

  // --------------------------------------------------
  // PUBLIC ACTIONS
  // --------------------------------------------------

  function narrate(name, data) {
    if (!enabled || !supported) return;

    var build = CUES[name];

    if (!build) return;

    try {
      say(build(data || {}), {
        queue: true,
        low: !!LOW_PRIORITY[name]
      });
    } catch (err) {
      if (window.console) {
        window.console.warn('Voice assistant error:', err);
      }
    }
  }

  function speak(text, opts) {
    if (!enabled || !supported) return;

    say(text, opts);
  }

  function explain(text) {
    if (enabled && supported) {
      try {
        say(text);
      } catch (err) {
        setNote(text);

        if (window.console) {
          window.console.warn('Voice assistant error:', err);
        }
      }
    } else {
      lastText = text;

      setNote(
        text + (
          supported
            ? ' (Turn the voice assistant on to hear this.)'
            : ' (Speech is not supported in this browser.)'
        )
      );

      updateButtons();
    }
  }

  function runCommand(cmd) {
    if (cmd === 'start-simulation') {
      var app = root.VLab && root.VLab.App;

      var ok = app && app.startSimulation
        ? app.startSimulation()
        : false;

      explain(
        ok
          ? 'Starting the simulation.'
          : 'The simulation could not start. Check the values on the setup page.'
      );

      return;
    }

    var build = COMMANDS[cmd];

    if (build) explain(build());
  }

  // --------------------------------------------------
  // SPEECH COMMAND RECOGNITION
  // --------------------------------------------------

  function matchCommand(transcript) {
    var t = String(transcript || '').toLowerCase();

    if (/offset/.test(t)) return 'explain-offset';

    if (/\bdf\b|d\.?\s*f|don'?t fragment|do not fragment/.test(t)) {
      return 'explain-df';
    }

    if (/reassembl/.test(t)) return 'explain-reassembly';

    if (/start|simulat|run/.test(t)) return 'start-simulation';

    if (/\bmtu\b|m\.?\s*t\.?\s*u|maximum transmission/.test(t)) {
      return 'explain-mtu';
    }

    if (/more fragments|\bmf\b/.test(t)) return 'explain-mf';

    if (/identification|\bid\b/.test(t)) return 'explain-id';

    if (/fragment/.test(t)) return 'explain-fragmentation';

    return null;
  }

  function playExplanation() {
    var build = SECTION_TEXT[activeSection()] || SECTION_TEXT.home;

    explain(build());
  }

  function pauseSpeech() {
    if (!supported || !enabled) return;

    synth.pause();
    paused = true;

    updateButtons();
  }

  function resumeSpeech() {
    if (!supported || !enabled) return;

    synth.resume();
    paused = false;

    updateButtons();
  }

  function repeatSpeech() {
    if (lastText) explain(lastText);
  }

  function setEnabled(on, fromUser) {
    enabled = !!on;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(enabled)
      );
    } catch (e) {}

    var toggle = $('voice-toggle');

    if (toggle) toggle.checked = enabled;

    if (!enabled) {
      if (supported) synth.cancel();

      paused = false;

      setNote('Voice is off. Turn it on to hear explanations.');
    } else if (fromUser) {
      say('Voice assistant on.');
    } else {
      setNote('Voice is on. Spoken text will also appear here.');
    }

    updateButtons();
  }

  // --------------------------------------------------
  // MICROPHONE COMMANDS
  // --------------------------------------------------

  function listen() {
    if (!Recognition) return;

    if (listening && recognizer) {
      recognizer.stop();
      return;
    }

    try {
      recognizer = new Recognition();

      recognizer.lang = 'en-IN';
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 3;

      recognizer.onstart = function () {
        listening = true;

        $('voice-mic').classList.add('listening');
        $('voice-mic').textContent = 'Listening… (click to stop)';
      };

      recognizer.onresult = function (e) {
        var heard = e.results[0][0].transcript;
        var cmd = null;

        for (
          var i = 0;
          i < e.results[0].length && !cmd;
          i++
        ) {
          cmd = matchCommand(e.results[0][i].transcript);
        }

        if (cmd) {
          setNote('Heard: "' + heard + '"');
          runCommand(cmd);
        } else {
          setNote(
            'Heard: "' + heard +
            '". Try: explain fragmentation, explain fragment offset, explain DF flag, explain reassembly, or start simulation.'
          );
        }
      };

      recognizer.onerror = function (e) {
        var denied =
          e.error === 'not-allowed' ||
          e.error === 'service-not-allowed';

        var offline = e.error === 'network';

        setNote(
          denied
            ? 'Microphone access was blocked. Use the command buttons instead, or allow the microphone (needs https or localhost).'
            : offline
              ? 'Speech recognition needs an internet connection in this browser. Use the command buttons instead.'
              : 'Could not hear a command. Try again or use the command buttons.'
        );
      };

      recognizer.onend = function () {
        listening = false;

        var mic = $('voice-mic');

        if (mic) {
          mic.classList.remove('listening');
          mic.textContent = 'Speak a command';
        }
      };

      recognizer.start();

    } catch (err) {
      setNote('Speech recognition could not start. Use the command buttons instead.');
    }
  }

  // --------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------

  function init() {
    var toggle = $('voice-toggle');

    if (!toggle) return;

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-voice-cmd]'),
      function (b) {
        b.addEventListener('click', function () {
          runCommand(b.getAttribute('data-voice-cmd'));
        });
      }
    );

    $('voice-play').addEventListener('click', playExplanation);
    $('voice-pause').addEventListener('click', pauseSpeech);
    $('voice-resume').addEventListener('click', resumeSpeech);
    $('voice-repeat').addEventListener('click', repeatSpeech);

    toggle.addEventListener('change', function () {
      setEnabled(toggle.checked, true);
    });

    var note = $('voice-note');

    if (note) {
      note.setAttribute('aria-live', 'polite');
    }

    var mic = $('voice-mic');

    if (!Recognition) {
      mic.disabled = true;
      mic.title =
        'Speech recognition is not available in this browser. Use the command buttons.';
    } else {
      mic.addEventListener('click', listen);
    }

    if (!supported) {
      toggle.disabled = true;

      setNote(
        'Speech is not supported in this browser. Explanations still appear here as text; use the command buttons.'
      );

    } else {
      pickVoice();

      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', pickVoice);
      } else {
        synth.onvoiceschanged = pickVoice;
      }

      var saved = null;

      try {
        saved = JSON.parse(
          window.localStorage.getItem(STORAGE_KEY)
        );
      } catch (e) {
        saved = null;
      }

      if (saved === true) {
        setEnabled(true, false);
      }
    }

    updateButtons();
  }

  // --------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------

  root.VLab = root.VLab || {};

  root.VLab.Voice = {
    init: init,
    narrate: narrate,
    speak: speak,
    runCommand: runCommand,
    matchCommand: matchCommand,
    isEnabled: function () {
      return enabled;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);