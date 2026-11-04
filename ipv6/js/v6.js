/* v6.js · Experiment 05 (IPv6): page controllers (setup, simulation, header inspector, reassembly, results, quiz).
 * All numbers come from DCNIPv6Model (model.js). This file only builds the interface. */
(function () {
  'use strict';
  var V6 = window.V6 = window.V6 || {};
  var M = window.DCNIPv6Model;
  var $ = function (id) { return document.getElementById(id); };
  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined && text !== null) n.textContent = text; return n; }
  function fcl(i) { return 'fc-' + (i % 8); }
  function proto(c) { return M.protocolName(c.nextHeader) + ' (' + c.nextHeader + ')'; }
  function run() { var c = V6.config.read(); return { c: c, id: V6.getId() }; }
  function calcFor(c, id) { return M.calculate(c.packetSize, c.mtu, id); }
  function maxTotal(r) { return r.fragments.reduce(function (m, f) { return Math.max(m, f.total); }, 0); }
  function range(f) { return f.offsetBytes + '–' + f.endByte; }

  /* ═══════════════ Setup ═══════════════ */
  var SCENARIOS = {
    1: { size: 4000, mtu: 1500, text: 'Scenario 1: the worked example. A 4000-byte packet over a 1500-byte Path MTU gives 3 fragments.' },
    2: { size: 1200, mtu: 1500, text: 'Scenario 2: the packet fits the Path MTU, so the router forwards it and nothing is fragmented.' },
    3: { size: 4000, mtu: 1280, text: 'Scenario 3: the smallest legal IPv6 link MTU (1280 B) forces more, smaller fragments.' },
    4: { size: 9000, mtu: 1280, text: 'Scenario 4: a 9000-byte packet over 1280 B produces many fragments, the most this lab can make.' },
    5: { size: 4000, mtu: 1500, text: 'Scenario 5: as scenario 1, but the Reassembly lab loses the middle fragment, so reassembly stays incomplete.' },
    6: { size: 4000, mtu: 1500, text: 'Scenario 6: as scenario 1, but the Reassembly lab delivers the fragments shuffled. Out of order is not lost.' }
  };

  function initSetup() {
    var size = $('in-size'); if (!size) return;
    var mtu = $('in-mtu'), sizeNum = $('in-size-num'), mtuNum = $('in-mtu-num'), errors = $('setup-errors');
    var c = V6.config.read();
    function nh() { var r = document.querySelector('input[name="next-header"]:checked'); return r ? Number(r.value) : 17; }
    function setFromConfig(cc) {
      size.value = cc.packetSize; sizeNum.value = cc.packetSize; mtu.value = cc.mtu; mtuNum.value = cc.mtu;
      var r = document.querySelector('input[name="next-header"][value="' + cc.nextHeader + '"]'); if (r) r.checked = true;
      V6.paintRange(size); V6.paintRange(mtu);
    }
    function draw(keepScenario) {
      var cur = V6.config.read();
      var x = { packetSize: V6.config.clamp(size.value, 40, 9000), mtu: V6.config.clamp(mtu.value, 1280, 9000), nextHeader: nh(), speed: cur.speed, scenario: keepScenario ? cur.scenario : 0 };
      V6.config.save(x);
      $('in-size-val').textContent = x.packetSize; $('in-mtu-val').textContent = x.mtu;
      var r = calcFor(x, 0), viz = $('split-viz'), prev = $('setup-preview');
      viz.textContent = ''; prev.textContent = '';
      if (r.error) { errors.textContent = r.error; return x; }
      var sv = mk('div', 'sv-head'); sv.innerHTML = '<span>Packet <b>' + x.packetSize + ' B</b></span><span>Path MTU <b>' + x.mtu + ' B</b></span>'; viz.appendChild(sv);
      var bar = mk('div', 'sv-bar');
      if (r.noFragmentation) { var w = mk('div', 'sv-seg is-whole', 'Fits: sent whole'); w.style.flex = '1 1 100%'; bar.appendChild(w); }
      else r.fragments.forEach(function (f, i) { var s = mk('div', 'sv-seg ' + fcl(i), r.fragments.length > 6 ? 'F' + f.number : 'F' + f.number + ' · ' + f.data); s.style.flexBasis = (f.data / r.fragmentable * 100) + '%'; s.style.flexGrow = 0; s.title = 'Fragment ' + f.number + ': ' + f.data + ' B of data'; bar.appendChild(s); });
      viz.appendChild(bar);
      viz.appendChild(mk('div', 'sv-foot', r.noFragmentation ? 'Nothing to fragment.' : 'Bars show the data split. Each fragment also carries a 40 B base header and an 8 B Fragment Header.'));
      var rows = [['Fragmentable part F = P − 40', r.fragmentable + ' B'],
        ['Dmax = floor((MTU − 48) / 8) × 8', r.maxData + ' B'],
        ['Fragments created', r.noFragmentation ? '0' : String(r.fragments.length)]];
      if (!r.noFragmentation) rows.push(['Last fragment data', r.fragments[r.fragments.length - 1].data + ' B'], ['Largest fragment on the wire', maxTotal(r) + ' B (limit ' + x.mtu + ' B)']);
      rows.forEach(function (p) { var d = mk('div', 'prev-row'); d.appendChild(mk('span', '', p[0])); d.appendChild(mk('span', '', p[1])); prev.appendChild(d); });
      var v = mk('div', 'prev-verdict ' + (r.noFragmentation ? 'ok' : ''), r.noFragmentation
        ? 'Fits the Path MTU. The router forwards the packet unchanged.'
        : 'Too big for Link B. The router drops it and sends Packet Too Big; the source then creates ' + r.fragments.length + ' fragments.');
      prev.appendChild(v);
      document.querySelectorAll('#scenario-buttons [data-scenario]').forEach(function (b) { b.classList.toggle('selected', Number(b.dataset.scenario) === x.scenario); });
      return x;
    }
    function fromNumber(input, slider, min, max, label) {
      var v = Number(input.value);
      if (input.value !== '' && Number.isInteger(v) && v >= min && v <= max) { errors.textContent = ''; slider.value = v; V6.paintRange(slider); draw(false); }
      else errors.textContent = label + ' must be a whole number from ' + min + ' to ' + max + ' bytes.';
    }
    size.addEventListener('input', function () { sizeNum.value = size.value; errors.textContent = ''; draw(false); });
    mtu.addEventListener('input', function () { mtuNum.value = mtu.value; errors.textContent = ''; draw(false); });
    sizeNum.addEventListener('input', function () { fromNumber(sizeNum, size, 40, 9000, 'Packet size'); });
    mtuNum.addEventListener('input', function () { fromNumber(mtuNum, mtu, 1280, 9000, 'Path MTU'); });
    [sizeNum, mtuNum].forEach(function (n) { n.addEventListener('change', function () { var s = n === sizeNum ? size : mtu; n.value = s.value; errors.textContent = ''; }); });
    document.querySelectorAll('input[name="next-header"]').forEach(function (r) { r.addEventListener('change', function () { draw(true); }); });
    document.querySelectorAll('#scenario-buttons [data-scenario]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.dataset.scenario), s = SCENARIOS[n], cur = V6.config.read();
        V6.config.save({ packetSize: s.size, mtu: s.mtu, nextHeader: cur.nextHeader, speed: cur.speed, scenario: n });
        setFromConfig(V6.config.read()); errors.textContent = ''; draw(true); $('scenario-desc').textContent = s.text;
      });
    });
    $('btn-simulate').addEventListener('click', function () { draw(true); window.location.href = 'simulation.html'; });
    setFromConfig(c); draw(true);
    if (c.scenario && SCENARIOS[c.scenario]) $('scenario-desc').textContent = SCENARIOS[c.scenario].text;
  }

  /* ═══════════════ Simulation ═══════════════ */
  function initSim() {
    var A = window.V6Anim, startBtn = $('btn-sim-start'); if (!A || !startBtn) return;
    var section = $('sec-simulation'), c = V6.config.read(), id = V6.newId(), r = calcFor(c, id), stageList = [];
    var logEl = $('sim-log'), work = $('sim-workings'), tray = $('frag-tray'), trayList = $('tray-list');
    var fragmented = !r.error && !r.noFragmentation;

    function chips() {
      var box = $('sim-summary'); box.textContent = '';
      var items = [['Packet', c.packetSize + ' B'], ['Path MTU', c.mtu + ' B'], ['Fragments', r.error ? '—' : String(fragmented ? r.fragments.length : 0)], ['Protocol', proto(c)], ['Identification', V6.fmtId(id)]];
      items.forEach(function (p) { var s = mk('span', 'sim-chip'); s.appendChild(mk('span', '', p[0])); s.appendChild(mk('b', '', p[1])); box.appendChild(s); });
      var o = mk('span', 'sim-chip ' + (fragmented ? 'is-warn' : 'is-ok')); o.appendChild(mk('b', '', fragmented ? 'Router drops, source fragments' : 'Fits: forwarded whole')); box.appendChild(o);
    }
    function logLine(text, type) { var li = mk('li', type || '', text); logEl.appendChild(li); logEl.scrollTop = logEl.scrollHeight; }
    function work1(text) { if (work.querySelector('.hint')) work.textContent = ''; work.appendChild(mk('li', '', text)); work.scrollTop = work.scrollHeight; }

    function narrate(name) {
      var P = c.packetSize, F = P - 40, n = fragmented ? r.fragments.length : 0;
      switch (name) {
        case 'create': return 'Source creates a ' + P + '-byte IPv6 packet: a 40-byte base header plus ' + F + ' bytes of payload (' + proto(c) + ').';
        case 'to-router': return 'The packet crosses Link A (MTU 9000 B). It fits, so it reaches the router.';
        case 'check': return fragmented
          ? 'Router checks Link B: ' + P + ' B is larger than the Path MTU of ' + c.mtu + ' B. An IPv6 router never fragments, so it drops the packet.'
          : 'Router checks Link B: ' + P + ' B fits the Path MTU of ' + c.mtu + ' B, so it forwards the packet unchanged.';
        case 'ptb': return 'The router returns ICMPv6 Packet Too Big (Type 2, Code 0) to the source, reporting MTU ' + c.mtu + ' B.';
        case 'fragment': return 'The source learns the Path MTU and fragments the packet itself: Dmax = ' + r.maxData + ' B, so ' + F + ' B become ' + n + ' fragments, each with its own base header and Fragment Header (Identification ' + V6.fmtId(id) + ').';
        case 'travel': return fragmented ? 'The ' + n + ' fragments cross Link B. The router forwards each one as it is; it does not fragment or reassemble.' : 'The packet crosses Link B and passes the router unchanged.';
        case 'arrive': return fragmented ? 'The destination places each fragment at offset × 8 and the M = 0 fragment marks the end. The original ' + P + '-byte packet is rebuilt.' : 'The destination receives the original ' + P + '-byte packet intact. No reassembly is needed.';
      }
      return '';
    }
    function onStageWork(name) {
      var P = c.packetSize, F = P - 40;
      if (name === 'create') work1('P = ' + P + ' B  (40 B base header + ' + F + ' B payload)');
      else if (name === 'check') work1(fragmented ? P + ' B > Path MTU ' + c.mtu + ' B: the router cannot forward it' : P + ' B ≤ Path MTU ' + c.mtu + ' B: forward unchanged');
      else if (name === 'ptb') work1('ICMPv6 Type 2, Code 0 reports MTU = ' + c.mtu + ' B');
      else if (name === 'fragment') {
        work1('F = ' + P + ' − 40 = ' + F + ' B');
        work1('Dmax = floor((' + c.mtu + ' − 40 − 8) / 8) × 8 = ' + r.maxData + ' B');
        r.fragments.slice(0, 12).forEach(function (f) { work1('F' + f.number + ': data ' + f.data + ' B · offset ' + f.offsetBytes + ' ÷ 8 = ' + f.offset + ' · M = ' + f.more + ' · payload ' + f.payloadLength + ' B · total ' + f.total + ' B'); });
        if (r.fragments.length > 12) work1('… and ' + (r.fragments.length - 12) + ' more fragments (see Results)');
      } else if (name === 'travel' && fragmented) work1('Largest fragment = ' + maxTotal(r) + ' B ≤ Path MTU ' + c.mtu + ' B');
      else if (name === 'arrive' && fragmented) { var last = r.fragments[r.fragments.length - 1]; work1('Rebuilt: last offset ' + last.offset + ' × 8 + ' + last.data + ' = ' + (last.offsetBytes + last.data) + ' B, plus 40 B header = ' + P + ' B'); }
    }
    var LOGTYPE = { check: fragmented ? 'warn' : 'ok', ptb: 'warn', fragment: 'ok', arrive: 'ok' };
    var LOGTEXT = { create: 'Source created a ' + c.packetSize + '-byte packet.', 'to-router': 'Packet crossed Link A and reached the router.',
      check: fragmented ? 'Router dropped the ' + c.packetSize + ' B packet (larger than Path MTU ' + c.mtu + ' B).' : 'Router forwarded the packet (fits Path MTU).',
      ptb: 'Packet Too Big (Type 2, Code 0, MTU ' + c.mtu + ' B) reached the source.', fragment: fragmented ? 'Source created ' + r.fragments.length + ' fragments.' : '',
      travel: fragmented ? 'Fragments crossed Link B through the router.' : 'Packet crossed Link B.', arrive: fragmented ? 'Destination reassembled the packet by offset.' : 'Destination received the packet intact.' };

    /* stepper + tray */
    function buildStepper(list) {
      var ol = $('sim-stepper'); ol.textContent = '';
      list.forEach(function (s, i) { var li = mk('li', 'step'); li.dataset.stage = s.name; li.appendChild(mk('span', 'step-dot', String(i + 1))); li.appendChild(mk('span', 'step-name', s.label)); ol.appendChild(li); });
    }
    function markSteps(index, done) {
      Array.prototype.forEach.call($('sim-stepper').children, function (li, i) {
        li.classList.toggle('is-done', i < index || (i === index && done)); li.classList.toggle('is-active', i === index && !done);
      });
    }
    function buildTray() {
      trayList.textContent = ''; tray.classList.toggle('is-dense', fragmented && r.fragments.length > 6);
      if (!fragmented) return;
      r.fragments.forEach(function (f, i) {
        var li = mk('li', 'tray-item ' + fcl(i)); li.dataset.state = 'pending'; li.dataset.index = i;
        li.appendChild(mk('b', '', 'F' + f.number)); li.appendChild(mk('span', 'tray-meta', f.data + ' B'));
        li.appendChild(mk('span', 'tray-meta tray-off', 'offset ' + f.offset + ' · M ' + f.more)); li.appendChild(mk('em', 'tray-state', 'Pending'));
        trayList.appendChild(li);
      });
    }
    var STATE_TEXT = { pending: 'Pending', created: 'At source', transit: 'In transit', arrived: 'Arrived' };
    function setFrag(i, st) {
      var li = trayList.children[i]; if (!li) return; li.dataset.state = st; li.querySelector('.tray-state').textContent = STATE_TEXT[st] || st;
      var arrived = Array.prototype.filter.call(trayList.children, function (x) { return x.dataset.state === 'arrived'; }).length;
      $('tray-hint').textContent = arrived === r.fragments.length ? 'All ' + arrived + ' fragments arrived.' : (st === 'created' ? r.fragments.length + ' fragments created by the source.' : arrived + ' of ' + r.fragments.length + ' arrived.');
    }

    /* controls */
    var CHIP = { idle: ['Ready', ''], running: ['Running', 'run'], paused: ['Paused', 'pause'], stepping: ['Step mode', 'step'], finished: ['Complete', 'done'] };
    var chipEl = $('sim-stage');
    function refreshButtons(st) {
      var map = { idle: [1, 0, 0, 1, 1], running: [1, 1, 0, 1, 1], paused: [1, 0, 1, 1, 1], stepping: [1, 0, 1, 1, 1], finished: [1, 0, 0, 1, 1] }[st];
      ['start', 'pause', 'resume', 'step', 'reset'].forEach(function (n, i) { $('btn-sim-' + n).disabled = !map[i]; });
      section.dataset.simState = st;
    }
    function stageChip(index, count) {
      var st = A.getState(), info = CHIP[st];
      chipEl.dataset.tone = info[1];
      chipEl.textContent = (st === 'idle') ? 'Ready' : (st === 'finished' ? 'Complete' : 'Stage ' + (index + 1) + ' of ' + count + (st === 'paused' ? ' · paused' : ''));
    }

    var lastInfo = null;
    A.init({
      onProgress: function (p) { $('sim-progress').value = p; },
      onState: function (st) { refreshButtons(st); if (lastInfo) stageChip(lastInfo.index, lastInfo.count); else stageChip(0, stageList.length); },
      onEvent: function (e) {
        if (e.type === 'load') { stageList = e.stages; buildStepper(stageList); }
        else if (e.type === 'restart' || e.type === 'reset') {
          lastInfo = null; logEl.textContent = ''; work.textContent = ''; work.appendChild(mk('li', 'hint', 'Press Start to see each calculation.'));
          markSteps(-1, false); $('sim-next').hidden = true; tray.hidden = true; buildTray(); $('sim-progress').value = 0;
          $('sim-status').textContent = e.type === 'reset' ? 'Reset. Press Start, or Step to go one stage at a time.' : 'Starting the simulation.'; $('topology-caption').textContent = 'Packets appear here during the simulation.';
          stageChip(0, stageList.length);
        } else if (e.type === 'stageStart') {
          lastInfo = e.stage; markSteps(e.stage.index, false); stageChip(e.stage.index, e.stage.count);
          var txt = narrate(e.stage.name); $('sim-status').textContent = txt; $('topology-caption').textContent = txt; if (window.V6Voice && window.V6Voice.isEnabled()) window.V6Voice.speak(txt);
          if (e.stage.name === 'fragment') { tray.hidden = false; }
          if (LOGTEXT[e.stage.name]) logLine(LOGTEXT[e.stage.name], LOGTYPE[e.stage.name] || '');
          onStageWork(e.stage.name);
        } else if (e.type === 'stageDone') { markSteps(e.stage.index, true); }
        else if (e.type === 'fragState') { setFrag(e.index, e.state); }
        else if (e.type === 'focus') {
          Array.prototype.forEach.call(trayList.children, function (li, i) { li.classList.toggle('is-focus', i === e.index); });
        } else if (e.type === 'finish') {
          Array.prototype.forEach.call(trayList.children, function (li) { li.classList.remove('is-focus'); });
          var next = $('sim-next'); next.hidden = false;
          var box = $('sim-next-actions'); box.textContent = '';
          [['Inspect a header', 'headers.html', true], ['Reassembly lab', 'reassembly.html'], ['View results', 'results.html']].forEach(function (b) { var a = mk('a', 'btn' + (b[2] ? ' primary' : ''), b[0]); a.href = b[1]; box.appendChild(a); });
          var again = mk('button', 'btn', 'Run again'); again.type = 'button'; again.addEventListener('click', function () { A.start(); }); box.appendChild(again);
          $('sim-next-text').textContent = fragmented ? 'See the real header fields, or deliver the fragments yourself.' : 'The packet fit the Path MTU. Try a larger packet or a smaller MTU on the setup page.';
        }
      }
    });

    function press(fn) { return function () { fn(); this.blur(); }; }
    $('btn-sim-start').addEventListener('click', press(function () { A.start(); }));
    $('btn-sim-pause').addEventListener('click', press(function () { A.pause(); }));
    $('btn-sim-resume').addEventListener('click', press(function () { A.resume(); }));
    $('btn-sim-step').addEventListener('click', press(function () { A.step(); }));
    $('btn-sim-reset').addEventListener('click', press(function () { id = V6.newId(); r = calcFor(c, id); loadAnim(); chips(); }));

    var speedEl = $('sim-speed');
    function setSpeed(v) {
      v = Math.max(0.25, Math.min(3, Number(v) || 1)); speedEl.value = v; V6.paintRange(speedEl); $('sim-speed-val').textContent = v + '×'; A.setSpeed(v);
      document.querySelectorAll('.speed-presets [data-speed]').forEach(function (b) { b.classList.toggle('is-active', Number(b.dataset.speed) === v); });
      var cur = V6.config.read(); cur.speed = v; V6.config.save(cur);
    }
    speedEl.addEventListener('input', function () { setSpeed(speedEl.value); });
    document.querySelectorAll('.speed-presets [data-speed]').forEach(function (b) { b.addEventListener('click', function () { setSpeed(b.dataset.speed); }); });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); var st = A.getState(); if (st === 'running') A.pause(); else if (st === 'paused' || st === 'stepping') A.resume(); else A.start(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); A.step(); }
      else if (e.key.toLowerCase() === 'r') { $('btn-sim-reset').click(); }
    });

    function loadAnim() {
      fragmented = !r.error && !r.noFragmentation;
      if (r.error) { $('sim-status').textContent = r.error; return; }
      $('label-link-b').textContent = 'Link B: Path MTU ' + c.mtu;
      A.load(c, r); setSpeed(c.speed);
      buildTray(); markSteps(-1, false);
    }
    chips(); loadAnim();
  }

  /* ═══════════════ Header inspector ═══════════════ */
  var SRC = [0x2001, 0x0db8, 0x0001, 0, 0, 0, 0, 0x0010], DST = [0x2001, 0x0db8, 0x0002, 0, 0, 0, 0, 0x0020];
  function hex4(n) { return n.toString(16).padStart(4, '0'); }
  function addrRows(a) { return [hex4(a[0]) + ':' + hex4(a[1]), hex4(a[2]) + ':' + hex4(a[3]), hex4(a[4]) + ':' + hex4(a[5]), hex4(a[6]) + ':' + hex4(a[7])]; }

  function initHeaders() {
    var list = $('inspector-list'); if (!list) return;
    var ru = run(), c = ru.c, id = ru.id, r = calcFor(c, id), observe = 'source', selected = 0, field = null;
    var fragmented = !r.error && !r.noFragmentation;
    var packets = fragmented ? r.fragments : [{ number: 1, data: c.packetSize - 40, total: c.packetSize, payloadLength: c.packetSize - 40, offsetBytes: 0, offset: 0, more: 0, whole: true }];
    var pn = M.protocolName(c.nextHeader);

    function fieldsFor(f) {
      var hop = observe === 'link-b' ? 63 : 64, idTxt = V6.fmtId(id);
      var F = {
        version: { name: 'Version', val: '6', text: 'Always 6 for IPv6 (it is 4 in IPv4).', eq: 'Version = 0110 (binary) = 6' },
        tc: { name: 'Traffic Class', val: '0x00', text: 'Priority and congestion marking (DSCP and ECN). The lab sends 0.', eq: 'Traffic Class = 0x00' },
        flow: { name: 'Flow Label', val: '0x00000', text: 'Lets routers treat packets of one flow alike. The lab sends 0.', eq: 'Flow Label = 0' },
        plen: { name: 'Payload Length', val: String(f.payloadLength), text: fragmented ? 'Bytes after the 40-byte base header. In a fragment this is the 8-byte Fragment Header plus the fragment data.' : 'Bytes after the 40-byte base header. This packet is not fragmented.', eq: fragmented ? 'Payload Length = 8 + ' + f.data + ' = ' + f.payloadLength + ' B' : 'Payload Length = ' + c.packetSize + ' − 40 = ' + f.payloadLength + ' B' },
        nh: { name: 'Next Header', val: fragmented ? '44' : String(c.nextHeader), text: fragmented ? '44 means a Fragment Header follows the base header. The transport protocol is named inside the Fragment Header.' : 'No Fragment Header: the base header names the transport protocol directly (' + pn + ').', eq: fragmented ? 'Next Header = 44 → Fragment Header' : 'Next Header = ' + c.nextHeader + ' → ' + pn },
        hop: { name: 'Hop Limit', val: String(hop), text: 'The source sets 64. The router decrements it by 1 when it forwards, so the packet is seen as 63 on Link B. At 0 a router discards the packet.', eq: 'Hop Limit: source 64 → after router ' + (64 - 1) + (observe === 'link-b' ? '   (showing Link B)' : '   (showing source)') },
        src: { name: 'Source Address', val: '2001:db8:1::10', text: 'The 128-bit address of the sender, shown in four 32-bit rows. The same in every fragment.', eq: 'Source = 2001:0db8:0001:0000:0000:0000:0000:0010' },
        dst: { name: 'Destination Address', val: '2001:db8:2::20', text: 'The 128-bit address of the receiver. The destination uses source, destination and Identification to group fragments.', eq: 'Destination = 2001:0db8:0002:0000:0000:0000:0000:0020' }
      };
      if (fragmented) {
        F.fnh = { name: 'Next Header (Fragment Header)', val: String(c.nextHeader), text: 'Names the header that follows the Fragment Header: ' + pn + '.', eq: 'Next Header = ' + c.nextHeader + ' → ' + pn };
        F.fres = { name: 'Reserved', val: '0', text: 'Reserved. Sent as zero and ignored by the receiver.', eq: 'Reserved = 0' };
        F.foff = { name: 'Fragment Offset', val: String(f.offset), text: 'Where this fragment\'s data starts inside the fragmentable part, in 8-byte units.', eq: 'Offset = ' + f.offsetBytes + ' ÷ 8 = ' + f.offset + '   (bytes ' + range(f) + ')' };
        F.fres2 = { name: 'Res', val: '0', text: 'Two reserved bits, sent as zero.', eq: 'Res = 00' };
        F.fm = { name: 'M flag', val: String(f.more), text: f.more ? 'M = 1: more fragments follow this one.' : 'M = 0: this is the last fragment. It tells the destination where the data ends.', eq: 'M = ' + f.more + (f.more ? '   (not the last fragment)' : '   (last fragment)') };
        F.fid = { name: 'Identification', val: idTxt, text: 'A 32-bit number chosen by the source. Identical in all ' + r.fragments.length + ' fragments, so the destination can group them.', eq: 'Identification = ' + idTxt };
      }
      return F;
    }

    function hf(key, span, extra) { return { key: key, span: span, cls: extra || '' }; }
    function render() {
      var f = packets[selected], F = fieldsFor(f), diag = $('header-diagram'); diag.textContent = '';
      var wrap = mk('div', 'ipv4-hdr'), inner = mk('div', 'hdr-inner'); wrap.appendChild(inner);
      var ruler = mk('div', 'bit-ruler'); for (var b = 0; b < 32; b++) ruler.appendChild(mk('span', '', (b % 8 === 0 || b === 31) ? String(b) : '')); inner.appendChild(ruler);
      var g1 = mk('div', 'hdr-group'); g1.innerHTML = 'IPv6 base header · <b>40 bytes</b>'; inner.appendChild(g1);
      function row(cells) {
        var rw = mk('div', 'hdr-row');
        cells.forEach(function (cell) {
          var def = F[cell.key], btn = mk('button', 'hf ' + cell.cls + (cell.span <= 2 ? ' tiny' : '') + (cell.key === 'hop' && observe === 'link-b' ? ' changed' : '')); btn.type = 'button';
          btn.style.gridColumn = 'span ' + cell.span; btn.dataset.field = cell.key;
          btn.appendChild(mk('span', 'name', cell.label || def.name)); btn.appendChild(mk('span', 'val', cell.val !== undefined ? cell.val : def.val));
          if (field === cell.key) btn.classList.add('selected');
          btn.addEventListener('click', function () { field = cell.key; render(); });
          rw.appendChild(btn);
        });
        inner.appendChild(rw);
      }
      row([hf('version', 4), hf('tc', 8), hf('flow', 20)]);
      row([hf('plen', 16), hf('nh', 8), hf('hop', 8)]);
      var sa = addrRows(SRC), da = addrRows(DST);
      sa.forEach(function (t, i) { var h = t.split(':'); row([{ key: 'src', span: 16, cls: 'addr', label: 'Source · bits ' + (i * 32) + '–' + (i * 32 + 15), val: h[0] }, { key: 'src', span: 16, cls: 'addr', label: 'Source · bits ' + (i * 32 + 16) + '–' + (i * 32 + 31), val: h[1] }]); });
      da.forEach(function (t, i) { var h = t.split(':'); row([{ key: 'dst', span: 16, cls: 'addr', label: 'Destination · bits ' + (i * 32) + '–' + (i * 32 + 15), val: h[0] }, { key: 'dst', span: 16, cls: 'addr', label: 'Destination · bits ' + (i * 32 + 16) + '–' + (i * 32 + 31), val: h[1] }]); });
      if (fragmented) {
        var g2 = mk('div', 'hdr-group'); g2.innerHTML = 'Fragment Extension Header · <b>8 bytes</b>'; inner.appendChild(g2);
        row([hf('fnh', 8, 'frag'), hf('fres', 8, 'frag'), hf('foff', 13, 'frag'), { key: 'fres2', span: 2, cls: 'frag', label: 'Res' }, { key: 'fm', span: 1, cls: 'frag', label: 'M' }]);
        row([hf('fid', 32, 'frag')]);
      } else {
        var note = mk('p', 'hint', 'No Fragment Header: the packet (' + c.packetSize + ' B) fits the Path MTU (' + c.mtu + ' B).'); note.style.marginTop = '12px'; inner.appendChild(note);
      }
      diag.appendChild(wrap);
      // highlight every row of a multi-row field
      diag.querySelectorAll('.hf').forEach(function (n) { n.classList.toggle('selected', n.dataset.field === field); });

      var chipsBox = $('insp-chips'); chipsBox.textContent = '';
      [['Total length', f.total + ' B'], ['Payload Length', f.payloadLength + ' B'], ['Data', f.data + ' B']].forEach(function (p) { var s = mk('span', 'sim-chip'); s.appendChild(mk('span', '', p[0])); s.appendChild(mk('b', '', p[1])); chipsBox.appendChild(s); });

      var ex = $('field-explain'); ex.textContent = '';
      if (field && F[field]) { ex.appendChild(mk('h2', '', F[field].name)); ex.appendChild(mk('p', '', F[field].text)); ex.appendChild(mk('p', 'eq', F[field].eq)); }
      else ex.appendChild(mk('p', 'hint', 'Select a field in the header to read what it does.'));
    }

    list.textContent = '';
    packets.forEach(function (f, i) {
      var b = mk('button', 'insp-item ' + fcl(i)); b.type = 'button'; b.setAttribute('role', 'option');
      b.appendChild(mk('span', '', f.whole ? 'Original packet' : 'Fragment ' + f.number));
      b.appendChild(mk('small', '', f.whole ? c.packetSize + ' B · not fragmented' : 'offset ' + f.offset + ' · ' + f.data + ' B data'));
      b.addEventListener('click', function () { selected = i; markList(); render(); });
      list.appendChild(b);
    });
    function markList() { Array.prototype.forEach.call(list.children, function (b, i) { b.classList.toggle('selected', i === selected); b.setAttribute('aria-selected', i === selected ? 'true' : 'false'); }); }
    document.querySelectorAll('#observe-toggle [data-observe]').forEach(function (b) {
      b.addEventListener('click', function () { observe = b.dataset.observe; document.querySelectorAll('#observe-toggle [data-observe]').forEach(function (x) { x.classList.toggle('is-active', x === b); }); render(); });
    });
    if (r.error) { $('header-diagram').textContent = r.error; return; }
    markList(); render();
  }

  /* ═══════════════ Reassembly lab ═══════════════ */
  function initReassembly() {
    var cards = $('re-packets'); if (!cards) return;
    var ru = run(), c = ru.c, r = calcFor(c, ru.id);
    if (r.error) { cards.textContent = r.error; return; }
    if (r.noFragmentation) {
      cards.appendChild(mk('p', 'hint', 'The configured packet (' + c.packetSize + ' B) fits the Path MTU (' + c.mtu + ' B), so there is nothing to reassemble. Choose a larger packet or a smaller MTU on the setup page.'));
      document.querySelectorAll('.sim-bar .btn, .sim-bar select').forEach(function (b) { b.disabled = true; });
      return;
    }
    var eng = M.createReassembly(r), n = r.fragments.length, lost = {}, queue = [], pos = 0, lastDelivered = null;
    var orderSel = $('re-order'), logLines = [];
    if (c.scenario === 5) lost[Math.ceil(n / 2)] = true;
    if (c.scenario === 6) orderSel.value = 'shuffle';

    function makeQueue() {
      var q = r.fragments.map(function (f) { return f.number; });
      if (orderSel.value === 'reverse') q.reverse();
      else if (orderSel.value === 'shuffle') { do { for (var i = q.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = q[i]; q[i] = q[j]; q[j] = t; } } while (n > 1 && q.every(function (v, i) { return v === i + 1; })); }
      return q;
    }
    queue = makeQueue();
    var info = {}; // per fragment: delivered / lostInNetwork / dup flag

    function deliver(num, fromQueue) {
      if (eng.state.status === 'complete' || eng.state.status === 'timeout') return;
      if (lost[num] && !info[num + 'lostDone']) { info[num + 'lostDone'] = true; info[num + 'lost'] = true; render(); return; }
      var res = eng.receive(num);
      if (res.kind === 'new') info[num + 'delivered'] = true;
      if (res.kind === 'duplicate') { info[num + 'dup'] = true; }
      lastDelivered = num;
      render();
    }
    function nextPending() { while (pos < queue.length && info[queue[pos] + 'delivered']) pos++; return pos < queue.length ? queue[pos] : null; }
    function receiveNext() { var num = nextPending(); if (num === null) return; pos++; deliver(num, true); }

    function status() {
      var s = eng.state, el = $('re-status');
      el.className = 'status-badge';
      if (s.status === 'waiting') el.textContent = 'Waiting for fragments.';
      else if (s.status === 'partial') { el.classList.add('is-partial'); el.textContent = 'Incomplete: waiting for the missing byte ranges.'; }
      else if (s.status === 'complete') { el.classList.add('is-complete'); el.textContent = 'Complete: the ' + c.packetSize + '-byte packet is reassembled.'; }
      else { el.classList.add('is-timeout'); el.textContent = 'Discarded: reassembly timeout (' + M.REASSEMBLY_TIMEOUT_S + ' s).'; }
    }
    function render() {
      var s = eng.state, F = r.fragmentable;
      // cards
      cards.textContent = '';
      r.fragments.forEach(function (f, i) {
        var d = mk('div', 're-card ' + fcl(i) + (s.received.indexOf(f.number) !== -1 ? ' delivered' : '') + (info[f.number + 'lost'] && s.received.indexOf(f.number) === -1 ? ' lost' : '') + (info[f.number + 'dup'] ? ' dup' : ''));
        d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', 'Deliver fragment ' + f.number);
        var st = mk('strong', '', 'F' + f.number); if (f.offset === 0) st.appendChild(mk('span', 'tag-first', 'first')); if (f.more === 0) st.appendChild(mk('span', 'tag-first', 'last · M = 0'));
        d.appendChild(st); d.appendChild(mk('span', 'mono', 'offset ' + f.offset + ' · ' + f.data + ' B'));
        var lab = mk('label'); var cb = mk('input'); cb.type = 'checkbox'; cb.checked = !!lost[f.number]; cb.setAttribute('aria-label', 'Lose fragment ' + f.number);
        cb.addEventListener('click', function (e) { e.stopPropagation(); }); cb.addEventListener('change', function () { lost[f.number] = cb.checked; if (!cb.checked) { delete info[f.number + 'lost']; delete info[f.number + 'lostDone']; } });
        lab.appendChild(cb); lab.appendChild(document.createTextNode('lose')); d.appendChild(lab);
        function go() { var pi = queue.indexOf(f.number); if (pi !== -1 && pi >= pos) { queue.splice(pi, 1); queue.splice(pos, 0, f.number); pos++; } deliver(f.number); }
        d.addEventListener('click', go); d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        cards.appendChild(d);
      });
      // byte bar
      var bar = $('re-bar'); bar.textContent = '';
      s.received.forEach(function (num) {
        var f = r.fragments[num - 1], seg = mk('div', 'byte-seg ' + fcl(num - 1), 'F' + num); seg.style.left = (f.offsetBytes / F * 100) + '%'; seg.style.width = (f.data / F * 100) + '%'; seg.title = 'F' + num + ': bytes ' + range(f); bar.appendChild(seg);
      });
      var sc = $('re-scale'); sc.textContent = ''; sc.appendChild(mk('span', '', '0')); sc.appendChild(mk('span', '', Math.round(F / 2) + '')); sc.appendChild(mk('span', '', F + ' B'));
      // merge strip: pieces in OFFSET order, never arrival order
      var mg = $('re-merge'); mg.textContent = '';
      s.received.slice().sort(function (a, b) { return r.fragments[a - 1].offsetBytes - r.fragments[b - 1].offsetBytes; }).forEach(function (num) { var p = mk('span', 'merge-piece ' + fcl(num - 1), 'F' + num + ' · ' + r.fragments[num - 1].data + ' B'); mg.appendChild(p); });
      if (s.status === 'complete') mg.appendChild(mk('span', 'merged-datagram', '✓ ' + c.packetSize + ' B packet rebuilt (' + F + ' B + 40 B header)'));
      // stats
      var st = $('re-stats'); st.textContent = '';
      [['Fragments received', s.received.length + ' of ' + n], ['Bytes received', eng.receivedBytes() + ' of ' + F], ['Duplicates ignored', String(s.duplicates)], ['Arrival order', s.arrivals.length ? s.arrivals.map(function (x) { return 'F' + x; }).join(' → ') : '—']].forEach(function (p) { var d = mk('div'); d.appendChild(mk('dt', '', p[0])); d.appendChild(mk('dd', '', p[1])); st.appendChild(d); });
      status();
      // missing ranges
      var miss = $('re-missing'); miss.textContent = '';
      if (s.status === 'partial' || s.status === 'timeout') {
        var gaps = eng.gaps(), parts = gaps.map(function (g) {
          var who = r.fragments.filter(function (f) { return f.offsetBytes < g[1] && f.offsetBytes + f.data > g[0] && s.received.indexOf(f.number) === -1; }).map(function (f) { return 'F' + f.number; });
          return 'bytes ' + g[0] + '–' + (g[1] - 1) + (who.length ? ' (' + who.join(', ') + ')' : '');
        });
        var t = parts.length ? 'Missing: ' + parts.join('; ') + '.' : '';
        if (!s.totalKnown) t += ' The last fragment (M = 0) has not arrived, so the destination does not know the total length yet.';
        miss.textContent = t;
      }
      // timer
      var tm = $('re-timer'); tm.textContent = '';
      if (s.status === 'waiting') tm.textContent = 'The ' + M.REASSEMBLY_TIMEOUT_S + '-second reassembly timer starts when the first fragment arrives.';
      else {
        tm.appendChild(document.createTextNode('Reassembly timer: ' + s.clock + ' s of ' + M.REASSEMBLY_TIMEOUT_S + ' s' + (s.status === 'complete' ? ' (stopped: complete)' : '')));
        var tr = mk('div', 'timer-track'); var sp = mk('span'); sp.style.width = (s.clock / M.REASSEMBLY_TIMEOUT_S * 100) + '%'; tr.appendChild(sp); tm.appendChild(tr);
        if (s.icmp) tm.appendChild(mk('div', '', s.icmp.text));
      }
      var nothing = nextPending() === null;
      $('btn-re-next').disabled = nothing || s.status === 'complete' || s.status === 'timeout';
      $('btn-re-all').disabled = $('btn-re-next').disabled;
      $('btn-re-duplicate').disabled = lastDelivered === null || s.status === 'complete' || s.status === 'timeout';
      $('btn-re-retry').disabled = !Object.keys(info).some(function (k) { return /lost$/.test(k) && info[k] && s.received.indexOf(Number(k.replace('lost', ''))) === -1; }) || s.status === 'timeout';
      $('btn-re-timeout').disabled = s.status !== 'partial';
    }

    $('btn-re-next').addEventListener('click', receiveNext);
    $('btn-re-all').addEventListener('click', function () { var guard = 0; while (nextPending() !== null && guard++ < 200 && eng.state.status !== 'complete') receiveNext(); render(); });
    $('btn-re-duplicate').addEventListener('click', function () { if (lastDelivered !== null) deliver(lastDelivered); });
    $('btn-re-retry').addEventListener('click', function () {
      r.fragments.forEach(function (f) { if (info[f.number + 'lost'] && eng.state.received.indexOf(f.number) === -1) { lost[f.number] = false; delete info[f.number + 'lost']; info[f.number + 'lostDone'] = true; var res = eng.receive(f.number); if (res.kind === 'new') info[f.number + 'delivered'] = true; lastDelivered = f.number; } });
      render();
    });
    $('btn-re-timeout').addEventListener('click', function () { eng.advance(M.REASSEMBLY_TIMEOUT_S); render(); });
    function reset() { eng.reset(); info = {}; lastDelivered = null; queue = makeQueue(); pos = 0; render(); }
    $('btn-re-reset').addEventListener('click', reset);
    orderSel.addEventListener('change', reset);
    render();
  }

  /* ═══════════════ Results ═══════════════ */
  function initResults() {
    var body = $('results-body'); if (!body) return;
    var ru = run(), c = ru.c, id = ru.id, r = calcFor(c, id);
    if (r.error) { body.textContent = r.error; return; }
    var fragmented = !r.noFragmentation, frs = r.fragments;
    var sum = $('results-summary'); sum.textContent = '';
    [['Packet size', c.packetSize + ' B'], ['Path MTU', c.mtu + ' B'], ['Fragmentable part', r.fragmentable + ' B'], ['Dmax', r.maxData + ' B'], ['Fragments', fragmented ? String(frs.length) : '0'], ['Identification', fragmented ? V6.fmtId(id) : 'not used']].forEach(function (p) { var d = mk('div'); d.appendChild(mk('dt', '', p[0])); d.appendChild(mk('dd', '', p[1])); sum.appendChild(d); });
    $('results-caption').textContent = fragmented ? 'Packets sent by the source' : 'Packet sent by the source (not fragmented)';
    var tb = document.querySelector('#results-table tbody'); tb.textContent = '';
    if (fragmented) frs.forEach(function (f, i) {
      var tr = mk('tr'); var first = mk('td'); var dot = mk('span', fcl(i)); dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:var(--fc)'; first.appendChild(dot); first.appendChild(document.createTextNode('F' + f.number)); tr.appendChild(first);
      [f.data, 8, f.payloadLength, f.total, range(f), f.offset, f.more].forEach(function (v) { tr.appendChild(mk('td', '', String(v))); }); tb.appendChild(tr);
    });
    else { var tr0 = mk('tr'); ['Original', c.packetSize - 40, 'none', c.packetSize - 40, c.packetSize, '0–' + (c.packetSize - 41), '—', '—'].forEach(function (v) { tr0.appendChild(mk('td', '', String(v))); }); tb.appendChild(tr0); }

    // verification: real checks on the real numbers
    var checks = [];
    function chk(ok, text) { checks.push([ok, text]); }
    if (fragmented) {
      var total = frs.reduce(function (s, f) { return s + f.data; }, 0), run0 = 0, contiguous = true;
      frs.forEach(function (f) { if (f.offsetBytes !== run0) contiguous = false; run0 += f.data; });
      chk(total === r.fragmentable, 'Fragment data adds up to the fragmentable part: ' + total + ' B = ' + r.fragmentable + ' B.');
      chk(frs.every(function (f) { return f.total <= c.mtu; }), 'Every fragment fits the Path MTU: largest is ' + maxTotal(r) + ' B ≤ ' + c.mtu + ' B.');
      chk(frs.slice(0, -1).every(function (f) { return f.data % 8 === 0; }), 'Every non-final fragment carries a multiple of 8 bytes.');
      chk(contiguous && frs.every(function (f) { return f.offset * 8 === f.offsetBytes; }), 'Offsets are byte start ÷ 8 and the fragments are contiguous with no gap or overlap.');
      chk(frs.slice(0, -1).every(function (f) { return f.more === 1; }) && frs[frs.length - 1].more === 0, 'M = 1 on every fragment except the last, which has M = 0.');
      chk(frs.every(function (f) { return f.identification === frs[0].identification; }), 'All fragments share one Identification (' + V6.fmtId(id) + ').');
      var last = frs[frs.length - 1];
      chk(last.offset * 8 + last.data + 40 === c.packetSize, 'Rebuilt length: last offset × 8 + last data + 40 = ' + (last.offset * 8 + last.data + 40) + ' B = original packet.');
    } else {
      chk(c.packetSize <= c.mtu, 'The packet fits the Path MTU: ' + c.packetSize + ' B ≤ ' + c.mtu + ' B.');
      chk(true, 'No Fragment Header, offset or M flag is needed.');
    }
    var ul = $('results-verify'); ul.textContent = '';
    checks.forEach(function (k) { ul.appendChild(mk('li', k[0] ? '' : 'fail', k[1])); });

    var w = $('results-workings'); w.textContent = '';
    function wl(t) { w.appendChild(mk('li', '', t)); }
    wl('P = ' + c.packetSize + ' B, Path MTU = ' + c.mtu + ' B');
    if (!fragmented) { wl(c.packetSize + ' ≤ ' + c.mtu + ': the router forwards the packet unchanged'); }
    else {
      wl(c.packetSize + ' > ' + c.mtu + ': the router drops it and returns ICMPv6 Packet Too Big');
      wl('F = P − 40 = ' + c.packetSize + ' − 40 = ' + r.fragmentable + ' B');
      wl('Dmax = floor((MTU − 40 − 8) / 8) × 8 = floor(' + (c.mtu - 48) + ' / 8) × 8 = ' + r.maxData + ' B');
      wl('Number of fragments = ceil(F / Dmax) = ceil(' + r.fragmentable + ' / ' + r.maxData + ') = ' + frs.length);
      frs.slice(0, 12).forEach(function (f) { wl('F' + f.number + ': data ' + f.data + ' B, offset ' + f.offsetBytes + ' ÷ 8 = ' + f.offset + ', payload 8 + ' + f.data + ' = ' + f.payloadLength + ' B, total 40 + ' + f.payloadLength + ' = ' + f.total + ' B, M = ' + f.more); });
      if (frs.length > 12) wl('… and ' + (frs.length - 12) + ' more fragments (see the table)');
    }
    var v4 = M.ipv4Comparison(c.packetSize, c.mtu), cmp = $('results-compare');
    cmp.textContent = fragmented
      ? 'With IPv4 (20-byte header, DF = 0) the router would make ' + v4.count + ' fragments (Pmax = ' + v4.pmax + ' B). IPv6 makes ' + frs.length + (frs.length > v4.count ? ': each fragment also pays for the 8-byte Fragment Header, so it carries less data' : ': the same count') + ', and it is the source, not the router, that does the work.'
      : 'The packet fits the Path MTU, so IPv4 and IPv6 both send it whole.';
    $('results-conclusion').textContent = fragmented
      ? 'The ' + c.packetSize + '-byte packet is larger than the ' + c.mtu + '-byte Path MTU, so the router drops it and returns Packet Too Big. The source splits the ' + r.fragmentable + ' fragmentable bytes into ' + frs.length + ' fragments (Dmax = ' + r.maxData + ' B). Only the destination reassembles them, placing each by offset × 8.'
      : 'The ' + c.packetSize + '-byte packet fits the ' + c.mtu + '-byte Path MTU, so it is forwarded unchanged. No Packet Too Big message, Fragment Header or reassembly is needed.';
  }

  /* ═══════════════ Quiz ═══════════════ */
  var STATIC_Q = [
    ['Which node is permitted to fragment an IPv6 packet?', ['The source node', 'Any intermediate router', 'The destination node', 'Every router on the path'], 0, 'IPv6 routers never fragment packets in transit. Only the originating source may create fragments.'],
    ['What does an IPv6 router send when a packet is larger than the outgoing link MTU?', ['ICMPv6 Packet Too Big', 'ICMPv6 Echo Reply', 'A TCP Reset', 'ICMP Fragmentation Needed (IPv4)'], 0, 'The router drops the packet and reports the usable MTU with ICMPv6 Packet Too Big (Type 2, Code 0).'],
    ['How large is the IPv6 base header?', ['40 bytes', '20 bytes', '32 bytes', '60 bytes'], 0, 'The IPv6 base header has a fixed length of 40 bytes.'],
    ['How large is the IPv6 Fragment Extension Header?', ['8 bytes', '4 bytes', '16 bytes', '20 bytes'], 0, 'The Fragment Header is 8 bytes long.'],
    ['How many bits does the IPv6 Fragment Identification field have?', ['32 bits', '16 bits', '13 bits', '8 bits'], 0, 'It has 32 bits (IPv4 uses 16). All fragments of one packet share the same value.'],
    ['What does M = 0 mean in the Fragment Header?', ['This is the last fragment', 'More fragments follow', 'The packet must be discarded', 'The router must fragment it'], 0, 'M is 0 only on the final fragment, so the destination learns where the data ends.'],
    ['Which Next Header value in the base header means "Fragment Header follows"?', ['44', '17', '6', '58'], 0, 'Next Header 44 identifies the Fragment Header. 17 is UDP, 6 is TCP and 58 is ICMPv6.'],
    ['Where does IPv6 reassembly take place?', ['At the final destination', 'At every router', 'At the first router', 'At the source before sending'], 0, 'Only the destination host reassembles IPv6 fragments.'],
    ['What is the smallest MTU every IPv6 link must support?', ['1280 bytes', '576 bytes', '68 bytes', '1500 bytes'], 0, 'RFC 8200 requires every IPv6 link to support at least 1280 bytes.'],
    ['How long does the destination wait for missing fragments before discarding the packet (RFC 8200)?', ['60 seconds', '15 seconds', '5 seconds', '5 minutes'], 0, 'The reassembly timer is 60 seconds. If fragment 0 had arrived, ICMPv6 Time Exceeded (Type 3, Code 1) is sent.']
  ];

  function dynamicQuestions() {
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    var mtu = pick([1280, 1400, 1500, 1492, 1600, 2000]), size = pick([3000, 4000, 5000, 6000, 7500]);
    var r = M.calculate(size, mtu, 1), f = r.fragments;
    function opts(correct, cands) {
      var set = [correct]; cands.forEach(function (x) { if (x > 0 && set.indexOf(x) === -1) set.push(x); });
      var bump = 8; while (set.length < 4) { var x = correct + bump * (set.length % 2 ? 1 : -1) * Math.ceil(set.length / 2); if (x > 0 && set.indexOf(x) === -1) set.push(x); bump += 8; }
      return set.slice(0, 4).map(function (x) { return String(x); });
    }
    return [
      ['A ' + size + '-byte packet crosses a Path MTU of ' + mtu + ' bytes. What is the maximum data in a non-final fragment?', opts(r.maxData, [Math.floor((mtu - 40) / 8) * 8, Math.floor((mtu - 20 - 8) / 8) * 8, mtu - 48 + 4]).map(function (x) { return x + ' bytes'; }), 0, 'Dmax = floor((' + mtu + ' − 40 − 8) / 8) × 8 = ' + r.maxData + ' bytes.'],
      ['A ' + size + '-byte packet crosses a Path MTU of ' + mtu + ' bytes. How many fragments does the source create?', opts(f.length, [f.length + 1, f.length - 1, Math.ceil(size / r.maxData)]), 0, 'F = ' + size + ' − 40 = ' + r.fragmentable + ' B and Dmax = ' + r.maxData + ' B, so ceil(' + r.fragmentable + ' / ' + r.maxData + ') = ' + f.length + ' fragments.'],
      ['Same packet (' + size + ' B, Path MTU ' + mtu + ' B). What is the Fragment Offset of the second fragment?', opts(f[1].offset, [f[1].offsetBytes, f[1].offset + 1, f[1].offset - 1]), 0, 'Offset = ' + f[1].offsetBytes + ' ÷ 8 = ' + f[1].offset + '.'],
      ['Same packet (' + size + ' B, Path MTU ' + mtu + ' B). What is the total length of the last fragment?', opts(f[f.length - 1].total, [f[f.length - 1].data, f[f.length - 1].data + 40, f[f.length - 1].payloadLength]).map(function (x) { return x + ' bytes'; }), 0, 'Total = 40 + 8 + ' + f[f.length - 1].data + ' = ' + f[f.length - 1].total + ' bytes.']
    ];
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function initQuiz() {
    var qEl = $('quiz-q'); if (!qEl) return;
    var set, idx, score, answered;
    function start() {
      var dyn = dynamicQuestions();
      set = shuffle(dyn.concat(shuffle(STATIC_Q).slice(0, 6))).map(function (q) {
        var correct = q[1][q[2]], opts = shuffle(q[1]); return { q: q[0], opts: opts, correct: opts.indexOf(correct), why: q[3] };
      });
      idx = 0; score = 0; $('quiz-run').hidden = false; $('quiz-done').hidden = true; show();
    }
    function show() {
      var q = set[idx]; answered = false;
      $('quiz-progress').textContent = 'Question ' + (idx + 1) + ' of ' + set.length + ' · Score ' + score;
      $('quiz-bar').max = set.length; $('quiz-bar').value = idx;
      qEl.textContent = q.q; var box = $('quiz-options'); box.textContent = '';
      q.opts.forEach(function (o, i) {
        var b = mk('button', 'quiz-opt', o); b.type = 'button';
        b.addEventListener('click', function () {
          if (answered) return; answered = true;
          var ok = i === q.correct; if (ok) score++;
          Array.prototype.forEach.call(box.children, function (x, j) { x.disabled = true; if (j === q.correct) x.classList.add('correct'); else if (j === i) x.classList.add('wrong'); });
          var fb = $('quiz-feedback'); fb.className = 'quiz-feedback ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? 'Correct. ' : 'Not quite. ') + q.why;
          $('quiz-progress').textContent = 'Question ' + (idx + 1) + ' of ' + set.length + ' · Score ' + score;
          $('quiz-next').disabled = false; $('quiz-next').textContent = idx === set.length - 1 ? 'See my score' : 'Next question →';
        });
        box.appendChild(b);
      });
      $('quiz-feedback').className = 'quiz-feedback'; $('quiz-feedback').textContent = ''; $('quiz-next').disabled = true; $('quiz-next').textContent = idx === set.length - 1 ? 'See my score' : 'Next question →';
    }
    $('quiz-next').addEventListener('click', function () {
      if (idx < set.length - 1) { idx++; show(); }
      else { $('quiz-run').hidden = true; $('quiz-done').hidden = false; $('quiz-bar').value = set.length; $('quiz-score').textContent = score + ' / ' + set.length; $('quiz-summary').textContent = score === set.length ? 'Perfect score.' : 'Review the theory page for the questions you missed, then try again: the numbers change each time.'; }
    });
    $('quiz-retry').addEventListener('click', start);
    start();
  }

  /* ═══════════════ Dispatch ═══════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    var p = document.body.dataset.page;
    if (p === 'setup') initSetup();
    if (p === 'simulation') initSim();
    if (p === 'headers') initHeaders();
    if (p === 'reassembly') initReassembly();
    if (p === 'results') initResults();
    if (p === 'quiz') initQuiz();
  });
}());
