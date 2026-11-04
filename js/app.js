/**
 * app.js
 * Main controller for the DCN Virtual Lab: navigation, experiment setup,
 * scenarios, results page, Reassembly Laboratory, video and persistence.
 * It connects the logic modules (fragmentation.js, reassembly.js) to the UI
 * modules.
 *
 * Contract with the other UI modules (each is optional: the app still runs
 * if one has not loaded):
 *
 *   VLab.Animation.init({onEvent, onState})   onEvent({text, type, progress, narrate:{name,data}})
 *   VLab.Animation.load(result) / start() / pause() / resume() / step() / reset() / setSpeed(x)
 *       onState receives 'idle' | 'running' | 'paused' | 'stepping' | 'finished'
 *   VLab.Inspector.init() / load(result)       result = Fragmentation.fragmentDatagram() output
 *   VLab.Voice.init() / narrate(name, data)    speaks only when the assistant is enabled
 *   VLab.Quiz.init(rootElement)
 *   VLab.App (exported below) lets other modules start a simulation or change section.
 */
(function () {
  'use strict';

  var VLab = window.VLab = window.VLab || {};
  var Frag = VLab.Fragmentation;
  var Reasm = VLab.Reassembly;
  var Checksum = VLab.Checksum;

  function $(id) { return document.getElementById(id); }
  function has(mod, fn) { return VLab[mod] && typeof VLab[mod][fn] === 'function'; }
  function narrate(name, data) { if (has('Voice', 'narrate')) VLab.Voice.narrate(name, data || {}); }
  function colorClass(index) { return 'fc-' + (((index - 1) % 8) + 8) % 8; }

  /** Create an element. props: className, text, attrs {name: value}. */
  function el(tag, props, children) {
    var node = document.createElement(tag);
    var p = props || {};
    if (p.className) node.className = p.className;
    if (p.text !== undefined) node.textContent = p.text;
    if (p.attrs) Object.keys(p.attrs).forEach(function (k) { node.setAttribute(k, p.attrs[k]); });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  function storageGet(key) {
    try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var SECTIONS = ['home', 'theory', 'setup', 'simulation', 'inspector', 'reassembly', 'results', 'ipv6', 'quiz', 'resources'];

  var state = {
    result: null,       // latest fragmentDatagram() result
    scenario: null,     // currently loaded scenario number
    animState: 'idle',
    re: null            // Reassembly Laboratory state
  };

  var SCENARIOS = {
    1: { params: { datagramSize: 4000, mtu: 1500, headerLength: 20, df: 0 }, target: 'simulation',
      text: 'Normal fragmentation: a 4000-byte datagram meets a 1500-byte MTU with DF = 0.' },
    2: { params: { datagramSize: 1000, mtu: 1500, headerLength: 20, df: 0 }, target: 'simulation',
      text: 'No fragmentation required: the datagram is smaller than the MTU, so it passes unchanged.' },
    3: { params: { datagramSize: 4000, mtu: 600, headerLength: 20, df: 0 }, target: 'simulation',
      text: 'Small MTU: the same 4000-byte datagram needs many more fragments when the MTU is 600.' },
    4: { params: { datagramSize: 4000, mtu: 1500, headerLength: 20, df: 1 }, target: 'simulation',
      text: 'Fragmentation prohibited: DF = 1, so the router drops the packet and returns ICMP Fragmentation Needed.' },
    5: { params: { datagramSize: 4000, mtu: 1500, headerLength: 20, df: 0 }, target: 'reassembly', preset: 'lose-middle',
      text: 'Missing fragment: normal fragments, but the middle one is lost. Deliver the rest in the Reassembly laboratory to see incomplete reassembly.' },
    6: { params: { datagramSize: 4000, mtu: 1500, headerLength: 20, df: 0 }, target: 'reassembly', preset: 'shuffle',
      text: 'Out-of-order delivery: normal fragments, shuffled arrival order. Press Receive all in the Reassembly laboratory.' }
  };

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function closeMenu() {
    $('app').classList.remove('menu-open');
    $('menu-toggle').setAttribute('aria-expanded', 'false');
  }

  function showSection(name) {
    if (SECTIONS.indexOf(name) === -1) return;
    SECTIONS.forEach(function (s) {
      var sec = $('sec-' + s);
      if (sec) sec.classList.toggle('active', s === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-section') === name);
    });
    var pageName = $('portal-page-name');
    var experimentLabel = $('portal-experiment-label');
    if (pageName) {
      var labelButton = document.querySelector('.nav-btn[data-section="' + name + '"]');
      pageName.textContent = labelButton ? labelButton.textContent.trim() : (name === 'theory' ? 'Theory and concepts' : name);
    }
    if (experimentLabel) experimentLabel.textContent = name === 'ipv6' ? 'Experiment 05' : 'Experiment 04';
    var ipv6Drawer = $('ipv6-drawer-details');
    if (name === 'ipv6' && ipv6Drawer) ipv6Drawer.open = true;
    closeMenu();
    window.scrollTo(0, 0);
    try { if (window.location.hash !== '#' + name) window.location.hash = name; } catch (e) { /* ignore */ }
  }

  function initNavigation() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (b) {
      b.addEventListener('click', function () { showSection(b.getAttribute('data-section')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (b) {
      b.addEventListener('click', function () { showSection(b.getAttribute('data-goto')); });
    });
    $('btn-start-experiment').addEventListener('click', function () {
      narrate('welcome');   // speech is allowed here: it follows a user click
    });
    $('menu-toggle').addEventListener('click', function () {
      var open = $('app').classList.toggle('menu-open');
      $('menu-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('hashchange', function () {
      var name = window.location.hash.replace('#', '');
      if (SECTIONS.indexOf(name) !== -1) showSection(name);
    });
  }

  // ---------------------------------------------------------------------
  // Experiment setup
  // ---------------------------------------------------------------------
  function checkedValue(name) {
    var node = document.querySelector('input[name="' + name + '"]:checked');
    return node ? Number(node.value) : null;
  }
  function setChecked(name, value) {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="' + name + '"]'), function (r) {
      r.checked = (Number(r.value) === value);
    });
  }

  function readParams() {
    return {
      datagramSize: Number($('in-size').value),
      mtu: Number($('in-mtu').value),
      headerLength: checkedValue('header-len'),
      df: checkedValue('df')
    };
  }

  function writeParams(p) {
    $('in-size').value = p.datagramSize;
    $('in-mtu').value = p.mtu;
    setChecked('header-len', p.headerLength);
    setChecked('df', p.df);
  }

  function addPreviewRow(parent, label, value) {
    parent.appendChild(el('div', { className: 'prev-row' }, [el('span', { text: label }), el('span', { text: String(value) })]));
  }

  /** Live preview: quick calculation of the expected outcome (no random Identification needed). */
  function updatePreview() {
    var p = readParams();
    $('in-size-val').textContent = p.datagramSize;
    $('in-mtu-val').textContent = p.mtu;

    var box = $('setup-preview');
    var errBox = $('setup-errors');
    box.textContent = '';
    errBox.textContent = '';

    var check = Frag.validateInputs(p);
    $('btn-simulate').disabled = !check.valid;
    if (!check.valid) {
      check.errors.forEach(function (m) { errBox.appendChild(el('p', { text: m })); });
      return;
    }

    var payload = p.datagramSize - p.headerLength;
    var pmax = Frag.computeMaxFragmentPayload(p.mtu, p.headerLength);
    addPreviewRow(box, 'Original payload (D − H)', payload + ' bytes');
    addPreviewRow(box, 'Datagram vs MTU', p.datagramSize + ' vs ' + p.mtu);
    addPreviewRow(box, 'Maximum fragment payload', pmax + ' bytes');

    var verdict = el('div', { className: 'prev-verdict' });
    if (p.datagramSize <= p.mtu) {
      verdict.classList.add('ok');
      verdict.textContent = 'The datagram fits in the MTU. No fragmentation is needed.';
    } else if (p.df === 1) {
      verdict.classList.add('bad');
      verdict.textContent = 'Too large and DF = 1. The router will drop it and send ICMP Type 3, Code 4.';
    } else {
      var n = Math.ceil(payload / pmax);
      addPreviewRow(box, 'Expected fragments', n);
      addPreviewRow(box, 'Last fragment payload', (payload - (n - 1) * pmax) + ' bytes');
      verdict.textContent = 'Fragmentation is required: ' + n + ' fragments.';
    }
    box.appendChild(verdict);
  }

  function clearScenarioHighlight() {
    state.scenario = null;
    Array.prototype.forEach.call(document.querySelectorAll('#scenario-buttons .btn'), function (b) { b.classList.remove('selected'); });
  }

  function initSetup() {
    var saved = storageGet('vlab.params');
    if (saved && Frag.validateInputs(saved).valid) writeParams(saved);

    ['in-size', 'in-mtu'].forEach(function (id) {
      $(id).addEventListener('input', function () { clearScenarioHighlight(); updatePreview(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="header-len"], input[name="df"]'), function (r) {
      r.addEventListener('change', function () { clearScenarioHighlight(); updatePreview(); });
    });
    $('btn-simulate').addEventListener('click', function () { runSimulation({ target: 'simulation' }); });

    Array.prototype.forEach.call(document.querySelectorAll('#scenario-buttons [data-scenario]'), function (b) {
      b.addEventListener('click', function () { loadScenario(Number(b.getAttribute('data-scenario'))); });
    });
    updatePreview();
  }

  function loadScenario(n) {
    var sc = SCENARIOS[n];
    if (!sc) return;
    writeParams(sc.params);
    updatePreview();
    Array.prototype.forEach.call(document.querySelectorAll('#scenario-buttons .btn'), function (b) {
      b.classList.toggle('selected', Number(b.getAttribute('data-scenario')) === n);
    });
    $('scenario-desc').textContent = sc.text;
    runSimulation({ target: sc.target, preset: sc.preset, scenario: n });
  }

  // ---------------------------------------------------------------------
  // Running a simulation
  // ---------------------------------------------------------------------
  function runSimulation(opts) {
    var o = opts || {};
    var params = readParams();
    var result = Frag.fragmentDatagram(params);
    if (result.status === 'invalid') {
      var errBox = $('setup-errors');
      errBox.textContent = '';
      result.errors.forEach(function (m) { errBox.appendChild(el('p', { text: m })); });
      showSection('setup');
      return false;
    }
    state.result = result;
    state.scenario = o.scenario || null;
    storageSet('vlab.params', params);

    renderWorkings(result);
    $('label-link-a').textContent = 'Link A: carries the full ' + params.datagramSize + '-byte datagram';
    $('label-link-b').textContent = 'Link B: MTU ' + params.mtu;
    clearLog();
    setStatus('Ready. Press Start to run the simulation.');
    $('sim-progress').value = 0;

    if (has('Animation', 'load')) VLab.Animation.load(result);
    renderSimUi(result);
    if (has('Inspector', 'load')) VLab.Inspector.load(result);
    $('inspector-empty').hidden = true;
    renderResults(result);
    initReassemblyLab(result, o.preset);

    var target = o.target || 'simulation';
    showSection(target);
    if (target === 'simulation' && has('Animation', 'start')) VLab.Animation.start();
    return true;
  }

  // ---------------------------------------------------------------------
  // Simulation panel
  // ---------------------------------------------------------------------
  function setStatus(text) { $('sim-status').textContent = text; }

  function clearLog() { $('sim-log').textContent = ''; }

  function addLog(text, type) {
    var li = el('li', { text: text, className: (type === 'ok' || type === 'warn' || type === 'bad') ? type : '' });
    var list = $('sim-log');
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  function renderWorkings(result) {
    var list = $('sim-workings');
    list.textContent = '';
    result.workings.forEach(function (line) { list.appendChild(el('li', { text: line })); });
  }

  // ----- Simulation UI helpers: summary chips, stage timeline, fragment tray, next steps -----
  var TRAY_STATE_TEXT = { pending: 'At source', created: 'Created', transit: 'In transit', arrived: 'Arrived' };

  function renderSimSummary(result) {
    var box = $('sim-summary');
    var p = result.params;
    var outcome = result.status === 'fragmented' ? result.fragments.length + ' fragments'
      : (result.status === 'no-fragmentation' ? 'No fragmentation' : 'Dropped (DF = 1)');
    var tone = result.status === 'fragmented' ? 'is-warn' : (result.status === 'no-fragmentation' ? 'is-ok' : 'is-bad');
    box.textContent = '';
    [['Datagram', p.datagramSize + ' B'], ['MTU', p.mtu + ' B'], ['Header', p.headerLength + ' B'],
      ['DF', p.df], ['Identification', result.identification], ['Outcome', outcome, tone]
    ].forEach(function (c) {
      box.appendChild(el('div', { className: 'sim-chip' + (c[2] ? ' ' + c[2] : '') }, [el('span', { text: c[0] }), el('b', { text: String(c[1]) })]));
    });
  }

  function renderStepper() {
    var list = $('sim-stepper');
    list.textContent = '';
    var stages = has('Animation', 'getStageList') ? VLab.Animation.getStageList() : [];
    stages.forEach(function (st, i) {
      list.appendChild(el('li', { className: 'step', attrs: { 'data-step': i } }, [
        el('span', { className: 'step-dot', text: String(i + 1) }),
        el('span', { className: 'step-name', text: st.label })
      ]));
    });
  }

  function setStageChip(text, tone) {
    var chip = $('sim-stage');
    chip.textContent = text;
    chip.setAttribute('data-tone', tone || '');
  }

  function markStage(index, label, count, name) {
    Array.prototype.forEach.call($('sim-stepper').children, function (li, i) {
      li.classList.toggle('is-done', i < index);
      li.classList.toggle('is-active', i === index);
      if (i === index && li.scrollIntoView) {
        var wrap = $('sim-stepper');
        if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, li.offsetLeft - wrap.clientWidth / 2 + li.offsetWidth / 2);
      }
    });
    state.stageLabel = 'Stage ' + (index + 1) + ' of ' + count + ': ' + label;
    setStageChip(state.stageLabel, 'run');
    followStage(name);
  }

  /** On narrow screens the stage scrolls sideways: keep the part where the action happens in view. */
  var STAGE_FOCUS = { 'create': 0, 'to-router': 0.25, 'check': 0.5, 'split': 0.55, 'headers': 0.55, 'travel': 0.85,
    'arrive': 1, 'forward': 0.8, 'drop': 0.5, 'icmp': 0.2, 'icmp-arrive': 0 };

  function followStage(name) {
    var frame = document.querySelector('.topology-frame');
    if (!frame || frame.scrollWidth <= frame.clientWidth + 4 || STAGE_FOCUS[name] === undefined) return;
    var left = STAGE_FOCUS[name] * (frame.scrollWidth - frame.clientWidth);
    if (frame.scrollTo) frame.scrollTo({ left: left, behavior: 'smooth' }); else frame.scrollLeft = left;
  }

  function renderTray(result) {
    var tray = $('frag-tray');
    var list = $('tray-list');
    list.textContent = '';
    if (result.status !== 'fragmented') { tray.hidden = true; return; }
    tray.hidden = false;
    tray.classList.toggle('is-dense', result.fragments.length > 12);
    $('tray-hint').textContent = 'Waiting for the router to split the datagram.';
    result.fragments.forEach(function (pk) {
      var li = el('li', { className: 'tray-item ' + colorClass(pk.index), attrs: { 'data-frag': pk.index, 'data-state': 'pending',
        title: 'Fragment ' + pk.index + ': payload ' + pk.payloadLength + ' B, total length ' + pk.totalLength + ' B, offset ' + pk.fragmentOffset + ', MF ' + pk.mf } }, [
        el('b', { text: 'F' + pk.index }),
        el('span', { className: 'tray-meta', text: pk.payloadLength + ' B' }),
        el('span', { className: 'tray-meta tray-off', text: 'off ' + pk.fragmentOffset + ' · MF ' + pk.mf }),
        el('em', { className: 'tray-state', text: TRAY_STATE_TEXT.pending })
      ]);
      list.appendChild(li);
    });
  }

  function setTrayState(index, st) {
    var items = $('tray-list').children;
    Array.prototype.forEach.call(items, function (li) {
      if (index !== 'all' && Number(li.getAttribute('data-frag')) !== index) return;
      li.setAttribute('data-state', st);
      li.querySelector('.tray-state').textContent = TRAY_STATE_TEXT[st];
    });
  }

  function focusTray(index) {
    var hint = $('tray-hint');
    Array.prototype.forEach.call($('tray-list').children, function (li) {
      li.classList.toggle('is-focus', index !== null && Number(li.getAttribute('data-frag')) === index);
    });
    if (index === null || !state.result) return;
    var pk = state.result.fragments.filter(function (f) { return f.index === index; })[0];
    if (pk) hint.textContent = 'Fragment ' + pk.index + ' header: Identification ' + state.result.identification + ', offset ' + pk.fragmentOffset + ', MF ' + pk.mf + ', total length ' + pk.totalLength + ' B.';
  }

  function hideNext() { $('sim-next').hidden = true; }

  function showNext(result) {
    var box = $('sim-next');
    var acts = $('sim-next-actions');
    acts.textContent = '';
    function go(label, section, primary) {
      var b = el('button', { className: 'btn' + (primary ? ' primary' : ''), text: label, attrs: { type: 'button' } });
      b.addEventListener('click', function () { showSection(section); });
      acts.appendChild(b);
    }
    if (result.status === 'fragmented') {
      $('sim-next-text').textContent = 'The fragments are at the destination. Rebuild the datagram next.';
      go('Reassemble at the destination', 'reassembly', true);
      go('Inspect a fragment header', 'inspector');
      go('View results', 'results');
    } else if (result.status === 'no-fragmentation') {
      $('sim-next-text').textContent = 'The datagram fitted in the MTU, so nothing was split.';
      go('Inspect the header', 'inspector', true);
      go('View results', 'results');
      go('Change the setup', 'setup');
    } else {
      $('sim-next-text').textContent = 'The router dropped the packet because DF = 1. Clear DF to see fragmentation instead.';
      var retry = el('button', { className: 'btn primary', text: 'Clear DF and run again', attrs: { type: 'button' } });
      retry.addEventListener('click', function () {
        var off = document.querySelector('input[name="df"][value="0"]');
        if (off) { off.checked = true; off.dispatchEvent(new Event('change', { bubbles: true })); }
        runSimulation({ target: 'simulation' });
      });
      acts.appendChild(retry);
      go('View results', 'results');
    }
    box.hidden = false;
  }

  function resetSimUi() {
    hideNext();
    Array.prototype.forEach.call($('sim-stepper').children, function (li) { li.classList.remove('is-done', 'is-active'); });
    if (state.result) renderTray(state.result);
    state.stageLabel = '';
    setStageChip('Ready', '');
  }

  function renderSimUi(result) {
    renderSimSummary(result);
    renderStepper();
    renderTray(result);
    hideNext();
    state.stageLabel = '';
    setStageChip('Ready', '');
  }

  function onAnimEvent(e) {
    if (e.text) {
      setStatus(e.text);
      addLog(e.text, e.type);
    }
    if (typeof e.progress === 'number') $('sim-progress').value = e.progress;
    if (e.stage) markStage(e.stage.index, e.stage.label, e.stage.count, e.stage.name);
    if (e.fragmentState) {
      setTrayState(e.fragmentState.all ? 'all' : e.fragmentState.index, e.fragmentState.state);
      var hint = $('tray-hint');
      if (e.fragmentState.state === 'created') hint.textContent = 'Each fragment is a complete IP packet with its own header and checksum.';
      else if (e.fragmentState.state === 'transit' && !state.transitSeen) { state.transitSeen = true; hint.textContent = 'Fragments travel independently and may arrive in any order.'; }
      else if (e.fragmentState.state === 'arrived') {
        var left = $('tray-list').querySelectorAll('[data-state]:not([data-state="arrived"])').length;
        if (!left) hint.textContent = 'All fragments arrived. Offset, not arrival order, decides where each payload goes.';
      }
    }
    if (e.focusFragment !== undefined) focusTray(e.focusFragment);
    if (e.narrate) narrate(e.narrate.name, e.narrate.data);
  }

  function onAnimState(s) {
    state.animState = s;
    var ready = !!state.result;
    var sec = $('sec-simulation');
    if (sec) sec.setAttribute('data-sim-state', s);
    $('btn-sim-start').disabled = !ready || s === 'running' || s === 'paused' || s === 'stepping';
    $('btn-sim-pause').disabled = s !== 'running';
    // Resume also leaves step mode, so a student who stepped can let the rest play.
    $('btn-sim-resume').disabled = !(s === 'paused' || s === 'stepping');
    $('btn-sim-resume').title = (s === 'stepping') ? 'Play the remaining stages automatically (Space)' : 'Resume playback (Space)';
    $('btn-sim-step').disabled = !ready || s === 'running';
    $('btn-sim-reset').disabled = !ready;
    if (s === 'paused') setStageChip((state.stageLabel || 'Simulation') + ' (paused)', 'pause');
    else if (s === 'stepping') setStageChip((state.stageLabel || 'Step mode') + ' (step mode)', 'step');
    else if (s === 'running' && state.stageLabel) setStageChip(state.stageLabel, 'run');
    else if (s === 'finished') {
      setStageChip('Complete', 'done');
      Array.prototype.forEach.call($('sim-stepper').children, function (li) { li.classList.remove('is-active'); li.classList.add('is-done'); });
      if (state.result) showNext(state.result);
    }
    else if (s === 'idle') { setStageChip('Ready', ''); hideNext(); }
  }

  function setSpeedUi(v) {
    $('sim-speed-val').textContent = v + '×';
    Array.prototype.forEach.call(document.querySelectorAll('.speed-presets [data-speed]'), function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-speed')) === v);
    });
  }

  function initSimulation() {
    $('btn-sim-start').addEventListener('click', function () {
      if (!state.result) { showSection('setup'); return; }
      clearLog(); $('sim-progress').value = 0; resetSimUi(); state.transitSeen = false;
      if (has('Animation', 'start')) VLab.Animation.start();
    });
    $('btn-sim-pause').addEventListener('click', function () { if (has('Animation', 'pause')) VLab.Animation.pause(); });
    $('btn-sim-resume').addEventListener('click', function () { if (has('Animation', 'resume')) VLab.Animation.resume(); });
    $('btn-sim-step').addEventListener('click', function () {
      if (state.animState === 'idle' || state.animState === 'finished') { clearLog(); $('sim-progress').value = 0; resetSimUi(); state.transitSeen = false; }
      if (has('Animation', 'step')) VLab.Animation.step();
    });
    $('btn-sim-reset').addEventListener('click', function () {
      if (has('Animation', 'reset')) VLab.Animation.reset();
      clearLog(); $('sim-progress').value = 0; resetSimUi(); state.transitSeen = false;
      setStatus('Reset. Press Start to run the simulation again.');
    });
    $('sim-speed').addEventListener('input', function () {
      var v = Number($('sim-speed').value);
      setSpeedUi(v);
      if (has('Animation', 'setSpeed')) VLab.Animation.setSpeed(v);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.speed-presets [data-speed]'), function (b) {
      b.addEventListener('click', function () {
        var slider = $('sim-speed');
        slider.value = b.getAttribute('data-speed');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    setSpeedUi(Number($('sim-speed').value));
    if (has('Animation', 'init')) VLab.Animation.init({ onEvent: onAnimEvent, onState: onAnimState });
    onAnimState('idle');
  }

  // ---------------------------------------------------------------------
  // Results and analysis
  // ---------------------------------------------------------------------
  function addStat(dl, label, value, id) {
    var dd = el('dd', { text: String(value) });
    if (id) dd.id = id;
    dl.appendChild(el('div', {}, [el('dt', { text: label }), dd]));
  }

  function renderResults(result) {
    var p = result.params;
    var dl = $('results-summary');
    dl.textContent = '';
    addStat(dl, 'Original datagram size', p.datagramSize + ' B');
    addStat(dl, 'Network MTU', p.mtu + ' B');
    addStat(dl, 'IPv4 header length', p.headerLength + ' B');
    addStat(dl, 'Original payload', result.originalPayloadSize + ' B');
    addStat(dl, 'Max fragment payload', result.maxFragmentPayload + ' B');
    addStat(dl, 'DF flag', p.df);
    addStat(dl, 'Identification', result.identification);
    addStat(dl, 'Packets forwarded', result.packets.length);
    if (result.stats) {
      addStat(dl, 'Fragments', result.stats.fragmentCount);
      addStat(dl, 'Extra header bytes', result.stats.extraHeaderBytes + ' B');
      addStat(dl, 'Overhead', result.stats.overheadPercent.toFixed(1) + '%');
    }
    addStat(dl, 'Reassembly status', '', 'res-reassembly');

    var tbody = document.querySelector('#results-table tbody');
    tbody.textContent = '';
    if (result.packets.length === 0) {
      var row = el('tr');
      var cell = el('td', { text: 'No packet was forwarded: the router dropped it (DF = 1).' });
      cell.setAttribute('colspan', '8');
      row.appendChild(cell);
      tbody.appendChild(row);
    }
    result.packets.forEach(function (pk) {
      var tr = el('tr', { className: colorClass(pk.index) });
      var label = (result.status === 'fragmented') ? 'Fragment ' + pk.index : 'Datagram';
      [label, pk.payloadLength, pk.totalLength, pk.payloadStart + ' to ' + pk.payloadEnd,
        pk.fragmentOffset, pk.mf, pk.df, Checksum.toHex16(pk.headerChecksum)
      ].forEach(function (v) { tr.appendChild(el('td', { text: String(v) })); });
      tbody.appendChild(tr);
    });

    var verify = $('results-verify');
    verify.textContent = '';
    if (result.status === 'fragmented') {
      Frag.verifyFragmentation(result).checks.forEach(function (c) {
        verify.appendChild(el('li', { text: c.name + (c.detail ? ' (' + c.detail + ')' : ''), className: c.pass ? '' : 'fail' }));
      });
    } else if (result.status === 'no-fragmentation') {
      verify.appendChild(el('li', { text: 'Datagram size is not larger than the MTU, so it was forwarded unchanged.' }));
      verify.appendChild(el('li', { text: 'Forwarded header checksum verifies after the TTL decrement.' }));
    } else {
      verify.appendChild(el('li', { text: 'ICMP Type 3, Code 4 returned with Next-Hop MTU ' + result.icmp.nextHopMtu + '.' }));
    }

    $('results-conclusion').textContent = buildConclusion(result);
    $('results-empty').hidden = true;
    $('results-body').hidden = false;
    updateResultsReassembly(null);
  }

  function buildConclusion(r) {
    var p = r.params;
    if (r.status === 'no-fragmentation') {
      return 'The ' + p.datagramSize + '-byte datagram is not larger than the ' + p.mtu + '-byte MTU, so the router forwarded it unchanged and no reassembly was needed.';
    }
    if (r.status === 'dropped-df') {
      return 'The ' + p.datagramSize + '-byte datagram exceeds the ' + p.mtu + '-byte MTU and DF = 1, so the router dropped it and returned ICMP Type 3, Code 4 with Next-Hop MTU ' + p.mtu +
        '. The sender must resend with a size of at most ' + p.mtu + ' bytes, or clear DF.';
    }
    var n = r.fragments.length;
    var last = r.fragments[n - 1];
    return 'The ' + p.datagramSize + '-byte datagram exceeded the ' + p.mtu + '-byte MTU, so the router split its ' + r.originalPayloadSize +
      '-byte payload into ' + n + ' fragments. Each non-final fragment carries ' + r.maxFragmentPayload + ' bytes, a multiple of 8, and the final fragment carries ' +
      last.payloadLength + ' bytes with MF = 0. All fragments share Identification ' + r.identification + '. The destination can rebuild the original datagram only when every byte range from 0 to ' +
      (r.originalPayloadSize - 1) + ' has arrived before the reassembly timer expires.';
  }

  function updateResultsReassembly(snap) {
    var dd = $('res-reassembly');
    if (!dd || !state.result) return;
    var st = state.result.status;
    var text;
    if (st === 'no-fragmentation') text = 'Not required';
    else if (st === 'dropped-df') text = 'Not applicable (dropped)';
    else if (!snap) text = 'Not attempted yet';
    else if (snap.status === Reasm.STATUS.COMPLETE) text = 'Successful';
    else if (snap.status === Reasm.STATUS.TIMED_OUT) text = 'Failed (timeout)';
    else text = 'Incomplete';
    dd.textContent = text;
  }

  // ---------------------------------------------------------------------
  // Reassembly laboratory
  // ---------------------------------------------------------------------
  function stopSequence() {
    if (state.re && state.re.sequenceTimer) {
      window.clearInterval(state.re.sequenceTimer);
      state.re.sequenceTimer = null;
    }
  }

  function buildQueue(mode) {
    var idx = state.re.packets.map(function (p) { return p.index; });
    if (mode === 'reverse') return idx.slice().reverse();
    if (mode === 'shuffle') {
      return Reasm.shuffledOrder(idx.length, state.result.identification).map(function (pos) { return idx[pos - 1]; });
    }
    return idx;
  }

  function initReassemblyLab(result, preset) {
    stopSequence();
    var packets = result.packets.slice();
    state.re = {
      reassembler: new Reasm.Reassembler(),
      packets: packets,
      lost: {}, delivered: {}, accepted: [], dup: {},
      queue: [], clock: 0, last: null, message: '', token: 0, sequenceTimer: null
    };
    $('re-order').value = (preset === 'shuffle') ? 'shuffle' : 'in-order';
    if (preset === 'lose-middle' && packets.length > 1) {
      state.re.lost[Reasm.middleFragmentIndex(packets.length)] = true;
    }
    state.re.queue = buildQueue($('re-order').value);
    if (result.status === 'dropped-df') state.re.message = 'The router dropped the packet (DF = 1), so nothing reaches the destination and there is nothing to reassemble.';
    else if (result.status === 'no-fragmentation') state.re.message = 'The datagram was not fragmented. It is delivered as a single packet and needs no reassembly.';
    else if (preset === 'lose-middle') state.re.message = 'Scenario 5: fragment ' + Reasm.middleFragmentIndex(packets.length) + ' is marked lost. Deliver the others and watch the gap.';
    else if (preset === 'shuffle') state.re.message = 'Scenario 6: arrival order is shuffled. Press Receive all.';
    else state.re.message = 'Deliver fragments one at a time, or use Receive all.';
    renderReassembly(null);
  }

  function snapshotOf(re) {
    var snaps = re.reassembler.getSnapshots();
    return snaps.length ? snaps[snaps.length - 1] : null;
  }

  function nextQueued() {
    var re = state.re;
    for (var i = 0; i < re.queue.length; i++) {
      var idx = re.queue[i];
      if (!re.delivered[idx] && !re.lost[idx]) return idx;
    }
    return null;
  }

  function deliverFragment(idx) {
    var re = state.re;
    if (!re || !state.result) return;
    var pkt = re.packets.filter(function (p) { return p.index === idx; })[0];
    if (!pkt) return;
    if (re.lost[idx]) {
      re.message = 'Fragment ' + idx + ' is marked as lost: it never arrives. Untick "lose" or press Retry missing.';
      renderReassembly(null);
      return;
    }
    var before = snapshotOf(re);
    if (before && before.status === Reasm.STATUS.TIMED_OUT) { re.accepted = []; }   // a fresh buffer starts

    re.clock += 500;
    var ev = re.reassembler.receive(pkt, re.clock);
    var wasDelivered = !!re.delivered[idx];
    re.delivered[idx] = true;
    re.last = idx;
    if ((ev.type === 'accepted' || ev.type === 'overlap') && re.accepted.indexOf(idx) === -1) re.accepted.push(idx);
    re.dup = {};
    if (ev.type === 'duplicate' || wasDelivered) re.dup[idx] = true;
    var timeouts = re.reassembler.tick(re.clock);
    re.message = ev.reason;
    if (timeouts.length) re.message += ' ' + timeouts[0].reason;
    renderReassembly(ev);

    var snap = snapshotOf(re);
    if (ev.completed && ev.type !== 'duplicate') {
      narrate('reassembly-complete', { bytes: snap ? snap.totalPayloadLength : null, size: snap && snap.datagram ? snap.datagram.totalLength : null });
    } else if (ev.type === 'accepted' || ev.type === 'overlap') {
      narrate('fragment-received', { index: idx, offset: pkt.fragmentOffset, mf: pkt.mf });
    }
    if (snap && snap.status === Reasm.STATUS.PARTIAL && !nextQueued() && snap.missingRanges.length) {
      narrate('reassembly-missing', { range: snap.missingRanges[0].label });
    }
  }

  function receiveNext() {
    var idx = nextQueued();
    if (idx === null) {
      state.re.message = 'No more fragments are waiting to be delivered. Use Retry missing, Reset, or click a card.';
      renderReassembly(null);
      return false;
    }
    deliverFragment(idx);
    return true;
  }

  function receiveAll() {
    stopSequence();
    var re = state.re;
    if (nextQueued() === null) { receiveNext(); return; }
    re.sequenceTimer = window.setInterval(function () {
      if (!receiveNext() || nextQueued() === null) stopSequence();
    }, 650);
  }

  function retryMissing() {
    var re = state.re;
    stopSequence();
    var snap = snapshotOf(re);
    if (snap && snap.status === Reasm.STATUS.TIMED_OUT) {
      // The partial datagram was discarded: the whole datagram has to be sent again.
      re.delivered = {}; re.accepted = []; re.dup = {}; re.lost = {};
      re.queue = buildQueue($('re-order').value);
      re.message = 'The partial datagram was discarded, so the sender must transmit the whole datagram again. All fragments are ready to deliver.';
    } else {
      var count = Object.keys(re.lost).length;
      re.lost = {};
      re.queue = buildQueue($('re-order').value);
      re.message = count ? 'The missing fragment(s) were sent again. Deliver them now.' : 'No fragments are marked as lost.';
    }
    renderReassembly(null);
  }

  function advanceToTimeout() {
    var re = state.re;
    var snap = snapshotOf(re);
    if (!snap || snap.status !== Reasm.STATUS.PARTIAL) {
      re.message = 'The reassembly timer only runs while a datagram is partly received.';
      renderReassembly(null);
      return;
    }
    stopSequence();
    re.clock += snap.timeRemainingMs;
    var events = re.reassembler.tick(re.clock);
    re.message = events.length ? events[0].reason + (events[0].icmp ? ' The destination sends ICMP Time Exceeded (Type 11, Code 1).' : ' Fragment 0 never arrived, so no ICMP message is sent.') : 'Timer still running.';
    renderReassembly(null);
    narrate('reassembly-timeout');
  }

  function makeCard(pk) {
    var re = state.re;
    var cls = 're-card ' + colorClass(pk.index);
    if (re.delivered[pk.index]) cls += ' delivered';
    if (re.lost[pk.index]) cls += ' lost';
    if (re.dup[pk.index]) cls += ' dup';
    var card = el('div', { className: cls, attrs: { 'data-frag': pk.index, tabindex: '0', role: 'button' } });
    var title = (state.result.status === 'fragmented') ? 'Fragment ' + pk.index : 'Datagram';
    card.appendChild(el('strong', { text: title }));
    card.appendChild(el('span', { className: 'mono', text: 'Offset ' + pk.fragmentOffset + ', MF ' + pk.mf }));
    card.appendChild(el('span', { className: 'mono', text: 'Bytes ' + pk.payloadStart + ' to ' + pk.payloadEnd }));
    card.appendChild(el('span', { className: 'mono', text: 'Total length ' + pk.totalLength }));
    var box = el('input', { attrs: { type: 'checkbox', 'data-lose': pk.index } });
    box.checked = !!re.lost[pk.index];
    if (state.result.status !== 'fragmented') box.disabled = true;
    var label = el('label', {}, [box, document.createTextNode('lose')]);
    card.appendChild(label);
    return card;
  }

  function renderReassembly(ev) {
    var re = state.re;
    var result = state.result;
    if (!re || !result) return;
    var snap = snapshotOf(re);

    // Fragment cards
    var cards = $('re-packets');
    cards.textContent = '';
    re.packets.forEach(function (pk) { cards.appendChild(makeCard(pk)); });
    if (re.packets.length === 0) cards.appendChild(el('p', { className: 'hint', text: 'No packets reached the destination.' }));

    renderByteBar(snap, ev);
    renderMerge(snap, ev);

    // Statistics
    var stats = $('re-stats');
    stats.textContent = '';
    addStat(stats, 'Original datagram size', result.original.totalLength + ' B');
    addStat(stats, 'Fragments received', (snap ? snap.fragmentsReceived : 0) + ' of ' + re.packets.length);
    addStat(stats, 'Payload bytes received', (snap ? snap.bytesReceived : 0) + ' of ' + result.originalPayloadSize);
    addStat(stats, 'Duplicates ignored', snap ? snap.duplicatesIgnored : 0);
    addStat(stats, 'Arrival order', snap ? snap.arrivalOrder.join(', ') : 'none yet');
    addStat(stats, 'Arrived out of order', snap ? (snap.arrivedOutOfOrder ? 'Yes (not a loss)' : 'No') : 'No');

    // Status, missing ranges and timer
    var badge = $('re-status');
    badge.className = 'status-badge';
    var statusText;
    if (result.status === 'dropped-df') { badge.classList.add('is-dropped'); statusText = 'Nothing received: packet dropped by the router.'; }
    else if (result.status === 'no-fragmentation' && snap === null && !re.delivered[1]) { statusText = 'Waiting for the single unfragmented packet.'; }
    else if (result.status === 'no-fragmentation') { badge.classList.add('is-complete'); statusText = 'Delivered directly: no reassembly needed.'; }
    else if (!snap) { badge.classList.add('is-waiting'); statusText = 'Waiting for fragments.'; }
    else {
      badge.classList.add({ partial: 'is-partial', complete: 'is-complete', 'timed-out': 'is-timeout' }[snap.status] || 'is-waiting');
      statusText = snap.statusText;
    }
    badge.textContent = statusText;

    var missing = $('re-missing');
    missing.textContent = '';
    if (re.message) missing.appendChild(el('span', { text: re.message + ' ' }));
    if (snap && snap.status !== Reasm.STATUS.COMPLETE && snap.status !== Reasm.STATUS.TIMED_OUT) {
      missing.appendChild(el('strong', { text: 'Missing: ' + snap.missingRanges.map(function (g) { return g.label; }).join('; ') + '.' }));
    } else if (snap && snap.status === Reasm.STATUS.TIMED_OUT) {
      missing.appendChild(el('strong', { text: 'Discarded with missing: ' + snap.missingRanges.map(function (g) { return g.label; }).join('; ') + '.' }));
    } else if (snap && snap.status === Reasm.STATUS.COMPLETE) {
      missing.appendChild(el('strong', { text: 'No missing byte ranges.' }));
    }

    var timer = $('re-timer');
    if (snap && snap.status === Reasm.STATUS.PARTIAL) {
      timer.textContent = 'Reassembly timer: ' + (snap.timeRemainingMs / 1000).toFixed(1) + ' s left of ' + (re.reassembler.timeoutMs / 1000) + ' s.';
    } else if (snap && snap.status === Reasm.STATUS.TIMED_OUT) {
      timer.textContent = 'Reassembly timer expired: the incomplete datagram was discarded.';
    } else if (snap && snap.status === Reasm.STATUS.COMPLETE) {
      timer.textContent = 'Reassembly timer stopped: datagram complete.';
    } else {
      timer.textContent = '';
    }

    updateResultsReassembly(snap);
  }

  function renderByteBar(snap, ev) {
    var re = state.re;
    var total = state.result.originalPayloadSize;
    var bar = $('re-bar');
    bar.textContent = '';
    bar.style.opacity = (snap && snap.status === Reasm.STATUS.TIMED_OUT) ? '0.4' : '1';
    var maxEnd = 0;
    re.accepted.forEach(function (idx) {
      var pk = re.packets.filter(function (p) { return p.index === idx; })[0];
      var width = (pk.payloadLength / total) * 100;
      var seg = el('div', { className: 'byte-seg ' + colorClass(idx) + ((ev && re.last === idx && ev.type === 'accepted') ? ' new' : '') });
      seg.style.left = ((pk.payloadStart / total) * 100) + '%';
      seg.style.width = width + '%';
      seg.textContent = width > 14 ? 'F' + idx + ' (' + pk.payloadStart + ' to ' + pk.payloadEnd + ')' : (width > 3 ? 'F' + idx : '');
      bar.appendChild(seg);
      maxEnd = Math.max(maxEnd, pk.payloadStart + pk.payloadLength);
    });
    if (snap && !snap.endKnown && re.accepted.length) {
      var unknown = el('div', { className: 'byte-unknown', attrs: { title: 'End of datagram not yet known' } });
      unknown.style.left = ((maxEnd / total) * 100) + '%';
      bar.appendChild(unknown);
    }
    var scale = $('re-scale');
    if (!scale) {
      scale = el('div', { className: 'byte-scale', attrs: { id: 're-scale' } });
      bar.parentNode.insertBefore(scale, bar.nextSibling);
    }
    scale.textContent = '';
    scale.appendChild(el('span', { text: 'byte 0' }));
    scale.appendChild(el('span', { text: 'byte ' + total + ' (original payload size)' }));
  }

  function renderMerge(snap, ev) {
    var re = state.re;
    var box = $('re-merge');
    box.textContent = '';
    re.token++;
    var myToken = re.token;
    var pieces = re.accepted.slice().sort(function (a, b) {
      var pa = re.packets.filter(function (p) { return p.index === a; })[0];
      var pb = re.packets.filter(function (p) { return p.index === b; })[0];
      return pa.payloadStart - pb.payloadStart;
    });
    var complete = snap && snap.status === Reasm.STATUS.COMPLETE;
    pieces.forEach(function (idx) {
      box.appendChild(el('span', { className: 'merge-piece ' + colorClass(idx) + (complete ? ' merged' : ''), text: 'F' + idx }));
    });
    if (complete && ev && ev.completed && ev.type !== 'duplicate') {
      window.setTimeout(function () {
        if (!state.re || state.re.token !== myToken) return;
        box.textContent = '';
        var ok = Reasm.payloadsEqual(snap.datagram.payload, state.result.original.payload);
        box.appendChild(el('span', { className: 'merged-datagram',
          text: 'Original datagram rebuilt: ' + snap.datagram.totalLength + ' bytes' + (ok ? ' (payload identical to the sender\'s)' : '') }));
      }, 700);
    } else if (complete) {
      box.textContent = '';
      box.appendChild(el('span', { className: 'merged-datagram', text: 'Original datagram rebuilt: ' + snap.datagram.totalLength + ' bytes' }));
    }
  }

  function initReassemblyControls() {
    $('btn-re-next').addEventListener('click', function () { if (state.re) { stopSequence(); receiveNext(); } });
    $('btn-re-all').addEventListener('click', function () { if (state.re) receiveAll(); });
    $('btn-re-retry').addEventListener('click', function () { if (state.re) retryMissing(); });
    $('btn-re-timeout').addEventListener('click', function () { if (state.re) advanceToTimeout(); });
    $('btn-re-reset').addEventListener('click', function () { if (state.result) initReassemblyLab(state.result, null); });
    $('btn-re-duplicate').addEventListener('click', function () {
      if (!state.re || state.re.last === null) { if (state.re) { state.re.message = 'Deliver a fragment first, then duplicate it.'; renderReassembly(null); } return; }
      stopSequence();
      deliverFragment(state.re.last);
    });
    $('re-order').addEventListener('change', function () {
      if (!state.re) return;
      state.re.queue = buildQueue($('re-order').value);
      state.re.message = 'Delivery order changed. Fragments not yet delivered will arrive in this order.';
      renderReassembly(null);
    });
    var cards = $('re-packets');
    cards.addEventListener('change', function (e) {
      var idx = e.target && e.target.getAttribute && e.target.getAttribute('data-lose');
      if (!idx || !state.re) return;
      idx = Number(idx);
      if (state.re.delivered[idx]) { e.target.checked = false; return; }   // already arrived: cannot be lost now
      if (e.target.checked) state.re.lost[idx] = true; else delete state.re.lost[idx];
      state.re.message = e.target.checked ? 'Fragment ' + idx + ' will be lost in the network.' : 'Fragment ' + idx + ' will arrive normally.';
      renderReassembly(null);
    });
    cards.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && (e.target.getAttribute('data-lose') || e.target.tagName === 'LABEL')) return;
      var card = e.target.closest ? e.target.closest('[data-frag]') : null;
      if (!card || !state.re) return;
      stopSequence();
      deliverFragment(Number(card.getAttribute('data-frag')));
    });
    cards.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('[data-frag]') : null;
      if (!card || e.target !== card || !state.re) return;
      e.preventDefault();
      stopSequence();
      deliverFragment(Number(card.getAttribute('data-frag')));
    });
    $('btn-results-repeat').addEventListener('click', function () {
      if (has('Animation', 'reset')) VLab.Animation.reset();
      clearScenarioHighlight();
      showSection('setup');
    });
  }

  // ---------------------------------------------------------------------
  // Demo video (local MP4 or hosted URL, set in VLAB_CONFIG)
  // ---------------------------------------------------------------------
  function parseVideoUrl(rawUrl) {
    var value = String(rawUrl || '').trim();
    if (!value || !/^https:\/\//i.test(value)) return null;

    // Accept YouTube short, watch, Shorts, live and embed links. Convert all
    // recognised YouTube formats to the embeddable /embed/VIDEO_ID endpoint.
    var patterns = [
      /https?:\/\/(?:www\.|m\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i,
      /https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})/i
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = value.match(patterns[i]);
      if (match) {
        return {
          embedUrl: 'https://www.youtube.com/embed/' + match[1],
          watchUrl: 'https://www.youtube.com/watch?v=' + match[1],
          isYouTube: true
        };
      }
    }

    // Also permit a university-approved non-YouTube HTTPS embed URL.
    return { embedUrl: value, watchUrl: value, isYouTube: false };
  }

  function initVideo() {
    var cfg = window.VLAB_CONFIG || {};
    var wrap = $('video-wrap');
    var placeholder = $('video-placeholder');
    var actions = $('video-actions');
    var helpText = $('video-help-text');
    var watchLink = $('video-watch-link');
    if (!wrap || !placeholder) return;

    if (cfg.videoSrc) {
      var video = el('video', { attrs: { controls: '', preload: 'metadata', src: cfg.videoSrc } });
      video.addEventListener('error', function () {
        if (video.parentNode) video.parentNode.removeChild(video);
        placeholder.hidden = false;
      });
      wrap.appendChild(video);
      placeholder.hidden = true;
      if (actions) actions.hidden = true;
      return;
    }

    var videoInfo = parseVideoUrl(cfg.videoUrl);
    if (!videoInfo) return;

    var frame = el('iframe', { attrs: {
      src: videoInfo.embedUrl,
      title: 'DCN Virtual Lab demonstration video: IP Fragmentation and Reassembly',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
      allowfullscreen: '',
      loading: 'lazy',
      referrerpolicy: 'strict-origin-when-cross-origin'
    } });
    wrap.appendChild(frame);
    placeholder.hidden = true;

    // Cross-origin iframe errors cannot be inspected by this page. Keep a
    // reliable direct-watch link visible instead of leaving users stranded.
    if (actions && watchLink) {
      watchLink.href = videoInfo.watchUrl;
      watchLink.textContent = videoInfo.isYouTube ? 'Watch on YouTube' : 'Open video in a new tab';
      if (helpText) {
        helpText.textContent = window.location.protocol === 'file:'
          ? 'Testing from a local file? YouTube may block embedded playback because file:// pages do not provide a normal HTTP Referer. Run this lab on localhost or test it after HTTPS hosting. You can still open the video directly.'
          : 'Having trouble with the embedded player? Open the demonstration directly. For hosted deployment, allow YouTube embedding and do not suppress the HTTP Referer.';
      }
      actions.hidden = false;
    }
  }

  // ---------------------------------------------------------------------
  // Team members (saved in this browser)
  // ---------------------------------------------------------------------
  function initTeam() {
    var saved = storageGet('vlab.team') || {};
    Array.prototype.forEach.call(document.querySelectorAll('#team-grid input'), function (input) {
      if (saved[input.id]) input.value = saved[input.id];
      input.addEventListener('input', function () {
        var data = {};
        Array.prototype.forEach.call(document.querySelectorAll('#team-grid input'), function (i) { data[i.id] = i.value; });
        storageSet('vlab.team', data);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Start-up
  // ---------------------------------------------------------------------
  function init() {
    initNavigation();
    initSetup();
    initSimulation();
    initReassemblyControls();
    initVideo();
    initTeam();
    if (has('IPv6', 'init')) VLab.IPv6.init();
    if (has('Inspector', 'init')) VLab.Inspector.init();
    if (has('Voice', 'init')) VLab.Voice.init();
    if (has('Quiz', 'init')) VLab.Quiz.init($('quiz-root'));
    else $('quiz-root').textContent = 'The quiz module did not load.';

    var start = window.location.hash.replace('#', '');
    if (SECTIONS.indexOf(start) !== -1) showSection(start);
  }

  VLab.App = {
    showSection: showSection,
    runSimulation: runSimulation,
    startSimulation: function () { return runSimulation({ target: 'simulation' }); },
    loadScenario: loadScenario,
    getState: function () { return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
