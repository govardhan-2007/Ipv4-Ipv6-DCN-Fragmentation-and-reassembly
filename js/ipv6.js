/* IPv6 fragmentation simulator — seven-stage source-fragmentation model. */
(function (root) {
  'use strict';
  var VLab = root.VLab = root.VLab || {};
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    events: [], index: -1, timer: null, running: false,
    fragments: [], identification: 0, selected: 0,
    fragmentableBytes: 0, lastResult: null
  };

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }
  function clearTimer() {
    if (state.timer !== null) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  }
  function makeFragments(packetSize, mtu) {
    var baseHeader = 40;
    var fragmentHeader = 8;
    var fragmentableBytes = packetSize - baseHeader;
    var maxData = Math.floor((mtu - baseHeader - fragmentHeader) / 8) * 8;
    if (packetSize < baseHeader) {
      return { error: 'An IPv6 packet cannot be smaller than its 40-byte base header.' };
    }
    if (packetSize <= mtu || fragmentableBytes === 0) {
      return { fragments: [], maxData: maxData, fragmentableBytes: fragmentableBytes, noFragmentation: true, baseHeader: baseHeader, fragmentHeader: fragmentHeader };
    }
    if (maxData < 8) {
      return { error: 'The selected Path MTU leaves no room for fragment data after the 40-byte IPv6 header and 8-byte Fragment Header.' };
    }
    var fragments = [];
    var remaining = fragmentableBytes;
    var offsetBytes = 0;
    while (remaining > 0) {
      var data = Math.min(maxData, remaining);
      var more = remaining > data;
      fragments.push({
        number: fragments.length + 1,
        data: data,
        total: baseHeader + fragmentHeader + data,
        payloadLength: fragmentHeader + data,
        offsetBytes: offsetBytes,
        offset: offsetBytes / 8,
        more: more ? 1 : 0,
        identification: state.identification
      });
      remaining -= data;
      offsetBytes += data;
    }
    return {
      fragments: fragments,
      maxData: maxData,
      fragmentableBytes: fragmentableBytes,
      baseHeader: baseHeader,
      fragmentHeader: fragmentHeader
    };
  }
  function appendLog(message, kind) {
    var log = $('v6-event-log');
    if (!log) return;
    var item = document.createElement('li');
    item.className = kind || '';
    item.textContent = message;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }
  function getPhaseLabel() {
    if (state.index < 0) return 'Calculated preview';
    if (state.index < 4) return 'Waiting at source';
    if (state.index === 4) return 'Created at source';
    if (state.index === 5) return 'Crossing Link B';
    return 'Received at destination';
  }
  function renderFragmentCards() {
    var host = $('v6-fragment-cards');
    if (!host) return;
    host.textContent = '';
    if (!state.fragments.length) {
      var empty = document.createElement('div');
      empty.className = 'v6-fragment-empty';
      empty.textContent = 'No fragments are required: the packet fits within the selected Path MTU.';
      host.appendChild(empty);
      setText('v6-fragment-status', 'No fragmentation required');
      return;
    }
    setText('v6-fragment-status', state.fragments.length + ' fragment' + (state.fragments.length === 1 ? '' : 's') + ' · ' + getPhaseLabel());
    state.fragments.forEach(function (fragment, index) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'v6-fragment-card' + (index === state.selected ? ' selected' : '');
      card.setAttribute('aria-pressed', String(index === state.selected));
      var top = document.createElement('span'); top.className = 'v6-frag-top';
      var name = document.createElement('b'); name.textContent = 'F' + fragment.number;
      var bytes = document.createElement('small'); bytes.textContent = fragment.data + ' B data';
      top.appendChild(name); top.appendChild(bytes);
      var offset = document.createElement('strong'); offset.textContent = 'Offset ' + fragment.offset;
      var flags = document.createElement('span'); flags.textContent = 'M = ' + fragment.more + ' · ' + fragment.total + ' B total';
      var phase = document.createElement('em'); phase.textContent = getPhaseLabel();
      card.appendChild(top); card.appendChild(offset); card.appendChild(flags); card.appendChild(phase);
      card.addEventListener('click', function () {
        state.selected = index;
        renderFragmentCards();
        renderTable();
        showFragment(fragment);
      });
      host.appendChild(card);
    });
  }
  function renderCalculation(packetSize, mtu) {
    var node = $('v6-calculations');
    if (!node) return;
    if (packetSize <= mtu) {
      node.textContent = 'The complete packet (' + packetSize + ' B) fits within the Path MTU (' + mtu + ' B). No Fragment Header is required.';
      return;
    }
    var result = makeFragments(packetSize, mtu);
    if (result.error) { node.textContent = result.error; return; }
    node.textContent = 'Fragmentable part = packet size − 40-byte base header = ' + packetSize + ' − 40 = ' + result.fragmentableBytes + ' B. Maximum non-final fragment data = floor((Path MTU − 40 − 8) / 8) × 8 = floor((' + mtu + ' − 48) / 8) × 8 = ' + result.maxData + ' B. The source creates ' + result.fragments.length + ' fragments. Each fragment total = 40-byte IPv6 base header + 8-byte Fragment Header + fragment data.';
  }
  function renderTable() {
    var body = $('v6-fragment-rows');
    if (!body) return;
    body.textContent = '';
    if (!state.fragments.length) {
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No fragment rows: the packet fits the Path MTU.';
      row.appendChild(cell); body.appendChild(row);
      return;
    }
    state.fragments.forEach(function (fragment, index) {
      var row = document.createElement('tr');
      if (index === state.selected) row.classList.add('v6-row-selected');
      [String(fragment.number), fragment.data + ' B', fragment.total + ' B', String(fragment.offset), String(fragment.more)].forEach(function (value) {
        var cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
      });
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Inspect fragment ' + fragment.number);
      function select() {
        state.selected = index;
        renderTable(); renderFragmentCards(); showFragment(fragment);
      }
      row.addEventListener('click', select);
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
      body.appendChild(row);
    });
  }
  function showFragment(fragment) {
    var hexId = '0x' + state.identification.toString(16).toUpperCase().padStart(8, '0');
    setText('v6-fragment-detail',
      'Fragment ' + fragment.number + ' header detail: IPv6 base header = 40 B; IPv6 Payload Length = ' + fragment.payloadLength + ' B; Fragment Extension Header = 8 B; fragment data = ' + fragment.data + ' B; total packet length = ' + fragment.total + ' B. Fragment Header fields — Next Header: 17 (UDP, assumed for this model); Reserved: 0; Fragment Offset: ' + fragment.offset + ' (byte position ' + fragment.offsetBytes + '); Res: 0; M flag: ' + fragment.more + '; Identification: ' + hexId + ' (shared by every fragment).');
  }
  function updateMetrics(packetSize, mtu) {
    var host = $('v6-metrics');
    if (!host) return;
    host.textContent = '';
    var count = state.fragments.length ? String(state.fragments.length) : (packetSize <= mtu ? '0' : '—');
    [['Original packet', packetSize + ' B'], ['Path MTU', mtu + ' B'], ['Fragments', count]].forEach(function (pair) {
      var box = document.createElement('div');
      var small = document.createElement('small'); small.textContent = pair[0];
      var strong = document.createElement('strong'); strong.textContent = pair[1];
      box.appendChild(small); box.appendChild(strong); host.appendChild(box);
    });
  }
  function updateProgress() {
    var rail = $('v6-progress');
    if (!rail) return;
    var activeIndex = state.index;
    Array.prototype.forEach.call(rail.children, function (item, index) {
      item.classList.toggle('done', activeIndex >= 0 && index < activeIndex);
      item.classList.toggle('current', index === (activeIndex < 0 ? 0 : activeIndex));
      var dot = item.querySelector('i');
      if (dot) dot.textContent = activeIndex >= 0 && index < activeIndex ? '✓' : String(index + 1);
    });
    var fill = $('v6-progress-fill');
    if (fill) fill.style.width = (activeIndex < 0 ? 0 : ((activeIndex + 1) / 7 * 100)) + '%';
    setText('v6-stage-number', activeIndex < 0 ? 'READY TO BEGIN' : 'STAGE ' + (activeIndex + 1) + ' OF 7');
    var chip = $('v6-packet-chip');
    var event = state.events[activeIndex];
    if (chip) {
      chip.classList.toggle('fragment-chip', !!(event && event.kind === 'fragments'));
      chip.classList.toggle('ptb-chip', !!(event && event.kind === 'warning'));
      if (event && event.kind === 'warning') {
        chip.textContent = 'ICMPv6 PTB'; chip.style.left = '50%';
      } else if (event && event.kind === 'fragments') {
        chip.textContent = state.fragments.length + ' fragments'; chip.style.left = '78%';
      } else if (event && event.node === 'destination') {
        chip.textContent = 'Received'; chip.style.left = '83%';
      } else if (event && event.node === 'router') {
        chip.textContent = 'Packet'; chip.style.left = '50%';
      } else if (event && event.node === 'source') {
        chip.textContent = $('v6-size').value + ' B'; chip.style.left = '22%';
      } else {
        chip.textContent = $('v6-size').value + ' B'; chip.style.left = '22%';
      }
    }
  }
  function setNode(name) {
    document.querySelectorAll('[data-v6-node]').forEach(function (node) {
      node.classList.toggle('v6-node-active', node.getAttribute('data-v6-node') === name);
    });
  }
  function buildEvents(packetSize, mtu, result) {
    var oversized = packetSize > mtu;
    var events = [
      { node: 'source', title: '1 · Source creates the IPv6 packet', text: 'The source creates a ' + packetSize + '-byte IPv6 packet. Its 40-byte base header is followed by ' + (packetSize - 40) + ' bytes of packet data.', log: 'Source created an IPv6 packet of ' + packetSize + ' bytes.' },
      { node: 'router', title: '2 · Packet crosses Link A', text: 'The packet travels from the source to the router across Link A. In this model Link A has an MTU of 9000 bytes, so it can carry the original packet.', log: 'Packet crossed Link A and reached the router.' },
      { node: 'router', title: oversized ? '3 · Router checks MTU and returns Packet Too Big' : '3 · Router checks the outgoing MTU', text: oversized ? 'The packet (' + packetSize + ' B) is larger than Link B MTU (' + mtu + ' B). IPv6 routers cannot fragment packets, so this router drops it and returns ICMPv6 Packet Too Big (Type 2, Code 0) with the MTU value.' : 'The packet (' + packetSize + ' B) fits within Link B MTU (' + mtu + ' B). The router forwards it unchanged; no Packet Too Big message is needed.', log: oversized ? 'Router dropped the oversized packet and returned ICMPv6 Packet Too Big (Type 2, Code 0; MTU ' + mtu + ' B).' : 'Router verified that the packet fits the outgoing MTU.' , kind: oversized ? 'warning' : '' },
      { node: 'source', title: oversized ? '4 · Source processes the Packet Too Big message' : '4 · Source confirms no fragmentation is needed', text: oversized ? 'The source learns the Path MTU is ' + mtu + ' bytes. It calculates the fragmentable part (' + (packetSize - 40) + ' B) and the maximum non-final data size: floor((' + mtu + ' − 40 − 8) / 8) × 8 = ' + result.maxData + ' B.' : 'The source does not need to fragment this packet. It keeps the original IPv6 packet and sends it onward unchanged.', log: oversized ? 'Source learned the Path MTU and calculated a maximum of ' + result.maxData + ' data bytes per non-final fragment.' : 'Source retained the original unfragmented packet.' },
      { node: 'source', title: oversized ? '5 · Source creates fragments and Fragment Headers' : '5 · Source keeps the original packet', text: oversized ? 'The source creates ' + result.fragments.length + ' fragments. Each gets its own 40-byte IPv6 base header and an 8-byte Fragment Extension Header. All fragments share the same 32-bit Identification value.' : 'No Fragment Extension Header is inserted because the packet already fits the Path MTU.', log: oversized ? 'Source generated ' + result.fragments.length + ' fragments with a shared 32-bit Identification value.' : 'No fragments were generated.' , kind: oversized ? 'fragments' : '' },
      { node: 'destination', title: oversized ? '6 · Fragments cross Link B' : '6 · Original packet crosses Link B', text: oversized ? 'The source sends the fragments. Every fragment is no larger than the Path MTU. The router forwards them; it does not fragment them.' : 'The original packet crosses Link B intact because it fits the MTU.', log: oversized ? 'All ' + result.fragments.length + ' source-created fragments crossed Link B.' : 'Original packet crossed Link B without fragmentation.' },
      { node: 'destination', title: oversized ? '7 · Destination reassembles the original packet' : '7 · Destination receives the packet', text: oversized ? 'The destination matches fragments using the source and destination context and the shared Fragment Identification. It places fragment data using the Fragment Offset. The final fragment has M = 0. The original ' + packetSize + '-byte packet is reconstructed.' : 'The destination receives the original ' + packetSize + '-byte IPv6 packet. No reassembly is required.', log: oversized ? 'Destination received all ' + result.fragments.length + ' fragments and reconstructed the original ' + packetSize + '-byte packet.' : 'Destination received the original packet intact.', kind: 'success' }
    ];
    return events;
  }
  function renderCurrent() {
    var event = state.events[state.index];
    if (!event) return;
    setNode(event.node);
    setText('v6-result-title', event.title);
    setText('v6-stage', event.text);
    if (state.index >= 4) renderFragmentCards();
    appendLog(event.log, event.kind === 'fragments' ? '' : event.kind);
    updateProgress();
    updateButtons();
  }
  function updateButtons() {
    var has = state.events.length > 0;
    var done = state.index >= state.events.length - 1;
    if ($('v6-start')) $('v6-start').disabled = !has || state.running || (state.index >= 0 && !done);
    if ($('v6-pause')) $('v6-pause').disabled = !state.running;
    if ($('v6-resume')) $('v6-resume').disabled = state.running || !has || done || state.index < 0;
    if ($('v6-step')) $('v6-step').disabled = !has || state.running || done;
    Array.prototype.forEach.call(document.querySelectorAll('[data-v6-control="start"]'), function (button) { button.disabled = !has || state.running || (state.index >= 0 && !done); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-v6-control="pause"]'), function (button) { button.disabled = !state.running; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-v6-control="resume"]'), function (button) { button.disabled = state.running || !has || done || state.index < 0; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-v6-control="step"]'), function (button) { button.disabled = !has || state.running || done; });
  }
  function step() {
    if (state.index + 1 >= state.events.length) {
      state.running = false; clearTimer(); updateButtons(); return;
    }
    state.index += 1;
    renderCurrent();
    if (state.index >= state.events.length - 1) {
      state.running = false; clearTimer(); updateButtons();
    } else if (state.running) schedule();
  }
  function schedule() {
    clearTimer();
    var speed = Number($('v6-speed').value || 1);
    state.timer = window.setTimeout(step, 1800 / speed);
  }
  function resetSimulation() {
    clearTimer();
    state.running = false; state.index = -1; state.selected = 0;
    var packetSize = Number($('v6-size').value);
    var mtu = Number($('v6-mtu').value);
    state.identification = Math.floor(Math.random() * 4294967296);
    var result = makeFragments(packetSize, mtu);
    state.lastResult = result;
    state.fragments = packetSize > mtu && !result.error ? result.fragments : [];
    state.fragmentableBytes = result.fragmentableBytes || 0;
    updateMetrics(packetSize, mtu);
    renderTable(); renderFragmentCards(); renderCalculation(packetSize, mtu);
    setText('v6-link-b-label', 'Link B · MTU ' + mtu);
    setText('v6-identification', 'Fragment Identification: 0x' + state.identification.toString(16).toUpperCase().padStart(8, '0') + ' · 32-bit value shared by all fragments.');
    setText('v6-fragment-detail', 'Select a fragment card or table row to inspect the IPv6 and Fragment Extension Header fields.');
    setText('v6-result-title', 'Ready to simulate');
    setText('v6-stage', result.error || (packetSize > mtu ? 'Press Start to watch the ICMPv6 Packet Too Big response, source fragmentation and destination reassembly. You can also use Step to advance one stage at a time.' : 'This packet fits the selected Path MTU. Press Start to follow it through the network.'));
    setText('v6-reassembly-result', 'The destination is waiting for fragments. Run a delivery test after configuring an oversized packet.');
    var map = $('v6-byte-map');
    if (map) { map.textContent = ''; var empty = document.createElement('span'); empty.className = 'v6-byte-empty'; empty.textContent = 'Run the test to see received byte ranges.'; map.appendChild(empty); }
    var log = $('v6-event-log');
    if (log) { log.textContent = ''; var item = document.createElement('li'); item.textContent = 'Simulation reset. Ready to begin.'; log.appendChild(item); }
    document.querySelectorAll('[data-v6-node]').forEach(function (node) { node.classList.remove('v6-node-active'); });
    if ($('v6-flow')) $('v6-flow').classList.toggle('v6-fragmented', packetSize > mtu);
    state.events = buildEvents(packetSize, mtu, result);
    updateProgress(); updateButtons();
  }
  function runReassemblyTest() {
    var result = $('v6-reassembly-result');
    var map = $('v6-byte-map');
    if (!result || !map) return;
    if (!state.fragments.length) {
      result.textContent = 'No reassembly is needed because the packet fits within the Path MTU.';
      map.textContent = 'The original packet arrives intact.';
      return;
    }
    var mode = $('v6-arrival-mode').value;
    var order = state.fragments.map(function (fragment) { return fragment.number; });
    if (mode === 'out-of-order') order.reverse();
    var missing = null;
    if (mode === 'lose-middle') {
      missing = Math.ceil(order.length / 2);
      order = order.filter(function (number) { return number !== missing; });
    }
    map.textContent = '';
    state.fragments.forEach(function (fragment) {
      var segment = document.createElement('span');
      segment.className = 'v6-byte-segment' + (fragment.number === missing ? ' missing' : ' received');
      segment.style.flex = String(fragment.data) + ' 0 0';
      segment.textContent = 'F' + fragment.number + (fragment.number === missing ? ' · missing' : ' · ' + fragment.data + ' B');
      map.appendChild(segment);
    });
    var orderText = order.length ? order.join(' → ') : 'none';
    if (missing !== null) {
      result.className = 'v6-reassembly-result incomplete';
      result.textContent = 'Incomplete datagram. Arrival order: ' + orderText + '. Fragment ' + missing + ' is missing, leaving a byte range uncovered. The destination cannot deliver the reconstructed packet.';
    } else {
      result.className = 'v6-reassembly-result complete';
      result.textContent = 'Reassembly successful. Arrival order: ' + orderText + '. The destination uses each Fragment Offset to place the data; arrival order does not matter. All ' + state.fragmentableBytes + ' fragmentable bytes are present.';
    }
  }
  function syncRange(mainId, drawerId, mainOutputId, drawerOutputId, formatter) {
    var main = $(mainId), drawer = $(drawerId);
    if (!main || !drawer) return;
    function update(source, target) {
      target.value = source.value;
      var a = $(mainOutputId), b = $(drawerOutputId);
      var value = formatter ? formatter(source.value) : source.value;
      if (a) a.textContent = value;
      if (b) b.textContent = value;
    }
    main.addEventListener('input', function () { update(main, drawer); });
    drawer.addEventListener('input', function () {
      main.value = drawer.value;
      update(drawer, main);
      main.dispatchEvent(new Event('input', { bubbles: true }));
    });
    update(main, drawer);
  }
  function initDrawer() {
    syncRange('v6-size', 'v6-drawer-size', 'v6-size-label', 'v6-drawer-size-label');
    syncRange('v6-mtu', 'v6-drawer-mtu', 'v6-mtu-label', 'v6-drawer-mtu-label');
    syncRange('v6-speed', 'v6-drawer-speed', 'v6-speed-label', 'v6-drawer-speed-label', function (value) { return Number(value).toFixed(1).replace('.0', '') + '×'; });
    document.querySelectorAll('[data-v6-control]').forEach(function (button) {
      button.addEventListener('click', function () {
        var target = $('v6-' + button.getAttribute('data-v6-control'));
        if (target) target.click();
      });
    });
    var jumpTargets = {
      overview: { section: 'ipv6', id: 'sec-ipv6' },
      theory: { section: 'theory', id: 'ipv6-theory-block' },
      setup: { section: 'ipv6', id: 'ipv6-form' },
      simulation: { section: 'ipv6', id: 'v6-stage-card' },
      fragments: { section: 'ipv6', id: 'v6-fragment-overview' },
      headers: { section: 'ipv6', id: 'v6-inspector' },
      reassembly: { section: 'ipv6', id: 'v6-reassembly-panel' },
      calculations: { section: 'ipv6', id: 'v6-inspector' },
      'event-log': { section: 'ipv6', id: 'v6-event-log-card' },
      comparison: { section: 'ipv6', id: 'v6-comparison' },
      quiz: { section: 'quiz', id: 'quiz-root', mode: 'ipv6' }
    };
    document.querySelectorAll('[data-v6-jump]').forEach(function (button) {
      button.addEventListener('click', function () {
        var jump = jumpTargets[button.getAttribute('data-v6-jump')];
        if (!jump) return;
        if (VLab.App && VLab.App.showSection) VLab.App.showSection(jump.section);
        if (jump.mode === 'ipv6' && VLab.Quiz && VLab.Quiz.startIPv6) VLab.Quiz.startIPv6();
        window.setTimeout(function () {
          var target = $(jump.id);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      });
    });
    var drawer = $('ipv6-drawer-details');
    var voice = $('voice-details');
    if (drawer) drawer.addEventListener('toggle', function () { if (drawer.open && voice && voice.open) voice.open = false; });
    if (voice) voice.addEventListener('toggle', function () { if (voice.open && drawer && drawer.open) drawer.open = false; });
  }
  function init() {
    var size = $('v6-size'), mtu = $('v6-mtu');
    if (!size || !mtu) return;
    function labels() {
      setText('v6-size-label', size.value);
      setText('v6-mtu-label', mtu.value);
      var drawerSize = $('v6-drawer-size');
      var drawerMtu = $('v6-drawer-mtu');
      if (drawerSize) { drawerSize.value = size.value; setText('v6-drawer-size-label', size.value); }
      if (drawerMtu) { drawerMtu.value = mtu.value; setText('v6-drawer-mtu-label', mtu.value); }
      var drawerSpeed = $('v6-drawer-speed');
      if (drawerSpeed && $('v6-speed')) {
        drawerSpeed.value = $('v6-speed').value;
        setText('v6-drawer-speed-label', Number(drawerSpeed.value).toFixed(1).replace('.0', '') + '×');
      }
    }
    [size, mtu].forEach(function (input) { input.addEventListener('input', function () { labels(); resetSimulation(); }); });
    $('v6-start').addEventListener('click', function () {
      if (!state.events.length || state.index >= state.events.length - 1) resetSimulation();
      if (state.index < 0) { state.running = true; step(); }
    });
    $('v6-pause').addEventListener('click', function () { state.running = false; clearTimer(); updateButtons(); });
    $('v6-resume').addEventListener('click', function () { if (state.index < 0 || state.index >= state.events.length - 1) return; state.running = true; schedule(); updateButtons(); });
    $('v6-step').addEventListener('click', function () { if (!state.events.length) resetSimulation(); if (state.index >= state.events.length - 1) return; state.running = false; clearTimer(); step(); });
    $('v6-reset').addEventListener('click', function () { size.value = 4000; mtu.value = 1500; labels(); resetSimulation(); });
    $('v6-speed').addEventListener('input', function () { setText('v6-speed-label', Number(this.value).toFixed(1).replace('.0', '') + '×'); setText('v6-drawer-speed-label', Number(this.value).toFixed(1).replace('.0', '') + '×'); if (state.running) schedule(); });
    $('v6-run-reassembly').addEventListener('click', runReassemblyTest);
    labels(); resetSimulation(); initDrawer();
    document.addEventListener('keydown', function (event) {
      var active = $('sec-ipv6') && $('sec-ipv6').classList.contains('active');
      if (!active || event.target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (state.running) { state.running = false; clearTimer(); updateButtons(); }
        else if (state.index >= 0 && state.index < state.events.length - 1) { state.running = true; schedule(); updateButtons(); }
        else $('v6-start').click();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault(); $('v6-step').click();
      } else if (event.key.toLowerCase() === 'r') {
        $('v6-reset').click();
      }
    });
  }
  VLab.IPv6 = { init: init, reset: resetSimulation, runReassemblyTest: runReassemblyTest, calculateFragments: function (packetSize, mtu, identification) { state.identification = Number(identification || 1); return makeFragments(Number(packetSize), Number(mtu)); } };
})(typeof window !== 'undefined' ? window : globalThis);
