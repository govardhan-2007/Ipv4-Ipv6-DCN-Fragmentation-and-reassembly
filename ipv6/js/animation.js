/* animation.js · Experiment 05 (IPv6): animated Source -> Router -> Destination topology (SVG).
 *
 * Animation only. Every number drawn comes from the calculation result (model.js), nothing is
 * calculated or hardcoded here. Each stage is drawn as a pure function of its progress t (0..1),
 * so pause, resume, step and reset cannot leave the scene in an inconsistent state.
 *
 * Fragmented run : create, to-router, check (router drops), ptb (Packet Too Big returns to the source),
 *                  fragment (the SOURCE builds the fragments), travel (Link B), arrive (reassembly)
 * Fits run       : create, to-router, check (forward), travel, arrive
 *
 * Public API (window.V6Anim): init({onEvent,onState,onProgress}), load(cfg, calc), start(), pause(),
 *   resume(), step(), reset(), setSpeed(x), getState(), getStages().
 * States: 'idle' | 'running' | 'paused' | 'stepping' | 'finished'
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var GEO = { y: 150, stackX: 224, routerStop: 338, destX: 738, bufX: 750, bufW: 120, bufY: 214, bufH: 14 };
  var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var LABELS = {
    'create': 'Create packet', 'to-router': 'Cross Link A', 'check': 'Router checks MTU',
    'ptb': 'Packet Too Big', 'fragment': 'Source fragments', 'travel': 'Cross Link B', 'arrive': 'Destination'
  };

  var cb = { onEvent: function () {}, onState: function () {}, onProgress: function () {} };
  var cfg = null, calc = null, fragmented = false, stages = [], ctx = null;
  var state = 'idle', speed = 1, stageIndex = 0, elapsed = 0, stageActive = false, raf = null, last = null;
  var lastFocus = -1, fstate = [];

  function $(id) { return document.getElementById(id); }
  function el(name, attrs) { var n = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function colorClass(i) { return 'fc-' + (i % 8); }

  function stageList() {
    var n = fragmented ? calc.fragments.length : 0;
    if (fragmented) {
      return [
        { name: 'create', dur: 900 }, { name: 'to-router', dur: 1500 }, { name: 'check', dur: 2000 },
        { name: 'ptb', dur: 1900 }, { name: 'fragment', dur: 2600 + 500 * Math.min(n, 8) },
        { name: 'travel', dur: 2800 + 260 * Math.min(n, 8) }, { name: 'arrive', dur: 1900 }
      ];
    }
    return [{ name: 'create', dur: 900 }, { name: 'to-router', dur: 1500 }, { name: 'check', dur: 1600 }, { name: 'travel', dur: 2800 }, { name: 'arrive', dur: 1500 }];
  }

  /* ───────── scene construction ───────── */
  function glyph(layer, cls, w, h, label) {
    var g = el('g', { 'class': 'pkt ' + cls, opacity: 0 });
    g.appendChild(el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 5 }));
    var t = el('text', { x: 0, y: 4 }); t.textContent = label || ''; g.appendChild(t);
    layer.appendChild(g);
    return g;
  }
  function place(g, x, y, o, s) {
    if (!g) return;
    g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' + (s && s !== 1 ? ' scale(' + s.toFixed(3) + ')' : ''));
    g.setAttribute('opacity', o.toFixed(3));
  }
  function hide(g) { if (g) g.setAttribute('opacity', 0); }

  function buildScene() {
    var packets = $('packet-layer'), icmp = $('icmp-layer'), buf = $('buffer-layer');
    [packets, icmp, buf].forEach(function (l) { if (l) l.textContent = ''; });
    ctx = { frags: [], segs: [] };
    ctx.big = glyph(packets, 'original', 100, 28, cfg.packetSize + ' B');
    ctx.ptb = glyph(icmp, 'icmp', 92, 24, 'PTB · MTU ' + cfg.mtu);
    ctx.rebuilt = glyph(packets, 'rebuilt', 150, 28, cfg.packetSize + ' B rebuilt');
    ctx.callout = el('text', { x: 270, y: 70, 'class': 'router-check', 'text-anchor': 'middle' });
    packets.appendChild(ctx.callout);
    if (fragmented) {
      var n = calc.fragments.length, dense = n > 4;
      ctx.w = n <= 4 ? 80 : (n <= 6 ? 62 : 50);
      ctx.h = n <= 4 ? 24 : (n <= 6 ? 20 : 16);
      ctx.spacing = n > 1 ? Math.min(30, 130 / (n - 1)) : 0;
      calc.fragments.forEach(function (f, i) {
        var g = glyph(packets, colorClass(i), ctx.w, ctx.h, dense ? 'F' + f.number : 'F' + f.number + ' ' + f.data);
        var tip = el('title'); tip.textContent = 'Fragment ' + f.number + ': ' + f.data + ' B data, offset ' + f.offset + ', M = ' + f.more; g.insertBefore(tip, g.firstChild);
        ctx.frags.push(g);
        ctx.segs.push(null);
      });
      var bg = el('rect', { 'class': 'buf-bg', x: GEO.bufX, y: GEO.bufY, width: GEO.bufW, height: GEO.bufH, rx: 4 });
      buf.appendChild(bg);
      calc.fragments.forEach(function (f, i) {
        var s = el('rect', { 'class': 'buf-seg ' + colorClass(i), x: GEO.bufX + GEO.bufW * f.offsetBytes / calc.fragmentable, y: GEO.bufY, width: GEO.bufW * f.data / calc.fragmentable, height: GEO.bufH, opacity: 0 });
        buf.appendChild(s); ctx.segs[i] = s;
      });
      ctx.bufLabel = el('text', { x: GEO.bufX + GEO.bufW / 2, y: GEO.bufY + GEO.bufH + 17, 'class': 'buf-label' });
      ctx.bufLabel.textContent = 'Buffer: 0 of ' + calc.fragmentable + ' B';
      buf.appendChild(ctx.bufLabel);
    }
  }

  function dy(i) { return (i - (calc.fragments.length - 1) / 2) * ctx.spacing; }

  /* ───────── frame drawing ───────── */
  function setNodes(src, rtr, dst) {
    [['node-source', src], ['node-router', rtr], ['node-dest', dst]].forEach(function (p) {
      var n = $(p[0]); if (!n) return;
      n.classList.remove('active', 'alert', 'done'); if (p[1]) n.classList.add(p[1]);
    });
  }
  function routerText(s) { var t = $('router-check'); if (t) t.textContent = s || ''; }
  function setBuffer(count) {
    if (!fragmented) return;
    var bytes = 0;
    ctx.segs.forEach(function (s, i) { var on = i < count; s.setAttribute('opacity', on ? 1 : 0); if (on) bytes += calc.fragments[i].data; });
    ctx.bufLabel.textContent = 'Buffer: ' + bytes + ' of ' + calc.fragmentable + ' B';
  }

  function draw(name, t) {
    // reset everything, then let the stage draw what it needs
    hide(ctx.big); hide(ctx.ptb); hide(ctx.rebuilt); ctx.callout.textContent = '';
    ctx.big.setAttribute('class', 'pkt original');
    ctx.frags.forEach(function (g) { hide(g); g.setAttribute('class', 'pkt ' + g.getAttribute('class').split(' ').filter(function (c) { return /^fc-/.test(c); }).join(' ')); });
    routerText(''); setBuffer(0);
    var Y = GEO.y, n = fragmented ? calc.fragments.length : 0;

    if (name === 'create') {
      var a = ease(clamp01(t * 1.6));
      place(ctx.big, GEO.stackX, Y, a, 0.55 + 0.45 * a);
      setNodes('active', '', '');
    } else if (name === 'to-router') {
      place(ctx.big, lerp(GEO.stackX, GEO.routerStop, ease(t)), Y, 1, 1);
      setNodes(t < 0.25 ? 'active' : '', t > 0.7 ? 'active' : '', '');
    } else if (name === 'check') {
      if (fragmented) {
        var drop = clamp01((t - 0.45) / 0.45);
        ctx.big.setAttribute('class', 'pkt original' + (t >= 0.45 ? ' dropped' : ''));
        place(ctx.big, GEO.routerStop, Y, 1 - 0.8 * ease(drop), 1 - 0.25 * ease(drop));
        routerText(t < 0.45 ? 'Checking: ' + cfg.packetSize + ' B vs MTU ' + cfg.mtu + ' B' : cfg.packetSize + ' B > Path MTU ' + cfg.mtu + ' B: drop');
        setNodes('', t < 0.45 ? 'active' : 'alert', '');
        if (t > 0.8) { var u = ease(clamp01((t - 0.8) / 0.2)); place(ctx.ptb, 372, 118 - 8 * u, u, 0.8 + 0.2 * u); }
      } else {
        place(ctx.big, GEO.routerStop, Y, 1, 1);
        routerText(t < 0.5 ? 'Checking: ' + cfg.packetSize + ' B vs MTU ' + cfg.mtu + ' B' : cfg.packetSize + ' B ≤ Path MTU ' + cfg.mtu + ' B: forward');
        setNodes('', 'active', '');
      }
    } else if (name === 'ptb') {
      place(ctx.ptb, lerp(372, 196, ease(t)), 110, 1, 1);
      routerText('ICMPv6 Packet Too Big');
      setNodes(t > 0.8 ? 'active' : '', t > 0.8 ? '' : 'alert', '');
    } else if (name === 'fragment') {
      var p1 = clamp01(t / 0.25), p2 = clamp01((t - 0.25) / 0.25), p3 = clamp01((t - 0.5) / 0.5);
      var focus = t >= 0.5 ? Math.min(n - 1, Math.floor(p3 * n)) : -1;
      place(ctx.big, GEO.stackX, Y, 1 - ease(p1), 1);
      ctx.frags.forEach(function (g, i) {
        var f = calc.fragments[i], y = Y + dy(i) * ease(p2), o = ease(p1), isF = i === focus;
        g.setAttribute('class', g.getAttribute('class') + (isF ? ' focus' : ''));
        place(g, GEO.stackX, y, o, isF ? 1.12 : 1);
        if (isF) ctx.callout.textContent = 'F' + f.number + ' · Fragment Header: offset ' + f.offset + ' · M = ' + f.more + ' · Payload Length ' + f.payloadLength;
      });
      if (t < 0.5) ctx.callout.textContent = t < 0.25 ? 'Source splits ' + calc.fragmentable + ' B into ' + n + ' fragments' : 'Each fragment gets its own headers';
      setNodes('active', '', '');
      if (focus !== lastFocus) { lastFocus = focus; cb.onEvent({ type: 'focus', index: focus }); }
    } else if (name === 'travel') {
      if (fragmented) {
        var arrived = 0, inRouter = false, anyMoving = false;
        ctx.frags.forEach(function (g, i) {
          var s = i * 0.45 / n, len = 1 - 0.45 * (n - 1) / n, p = clamp01((t - s) / len);
          var x = lerp(GEO.stackX, GEO.destX, ease(p)), y = lerp(Y + dy(i), Y, ease(clamp01(p * 2.5)));
          var o = p <= 0 ? 1 : (p >= 1 ? 0 : (p > 0.94 ? (1 - p) / 0.06 : 1));
          place(g, x, y, p >= 1 ? 0 : o, 1);
          if (p >= 1) arrived++;
          if (p > 0 && p < 1) { anyMoving = true; if (x > 340 && x < 560) inRouter = true; }
          syncFrag(i, p >= 1 ? 'arrived' : (p > 0 ? 'transit' : 'created'));
        });
        setBuffer(arrived);
        routerText(inRouter ? 'Forwarding, not fragmenting' : '');
        setNodes('', inRouter ? 'active' : '', arrived > 0 || t > 0.9 ? 'active' : '');
      } else {
        var x2 = lerp(GEO.routerStop, GEO.destX, ease(t));
        place(ctx.big, x2, Y, t > 0.95 ? 0.5 : 1, 1);
        routerText(x2 > 340 && x2 < 560 ? 'Forwarded unchanged' : '');
        setNodes('', x2 > 340 && x2 < 560 ? 'active' : '', t > 0.9 ? 'active' : '');
      }
    } else if (name === 'arrive') {
      if (fragmented) {
        var placed = Math.min(n, Math.ceil(clamp01(t / 0.6) * n));
        setBuffer(n);
        ctx.segs.forEach(function (s, i) { s.setAttribute('class', 'buf-seg ' + colorClass(i) + (i < placed && t < 0.9 ? ' placed' : '')); });
        var r = ease(clamp01((t - 0.5) / 0.4));
        place(ctx.rebuilt, GEO.destX + 72, 72, r, 0.7 + 0.3 * r);
        setNodes('', '', t > 0.5 ? 'done' : 'active');
      } else {
        place(ctx.big, GEO.destX, Y, 1 - 0.2 * t, 1 - 0.25 * ease(t));
        place(ctx.rebuilt, GEO.destX + 72, 72, ease(clamp01((t - 0.4) / 0.4)), 1);
        ctx.rebuilt.querySelector('text').textContent = cfg.packetSize + ' B received';
        setNodes('', '', 'done');
      }
    }
  }

  function syncFrag(i, st) {
    if (fstate[i] !== st) { fstate[i] = st; cb.onEvent({ type: 'fragState', index: i, state: st }); }
  }

  function render(t) {
    var s = stages[stageIndex];
    draw(s.name, t);
    cb.onProgress(Math.round(((stageIndex + t) / stages.length) * 100));
  }

  /* ───────── engine ───────── */
  function setState(next) { state = next; cb.onState(state); }
  function stageInfo() { return { index: stageIndex, name: stages[stageIndex].name, label: LABELS[stages[stageIndex].name], count: stages.length }; }
  function dur(s) { return reduceMotion ? Math.min(220, s.dur * 0.1) : s.dur; }

  function schedule() { if (raf === null) raf = root.requestAnimationFrame(tick); }
  function cancel() { if (raf !== null) { root.cancelAnimationFrame(raf); raf = null; } }

  function tick(ts) {
    raf = null;
    if (!stageActive || (state !== 'running' && state !== 'stepping')) return;
    if (last === null) last = ts;
    elapsed += Math.min(90, ts - last) * speed; last = ts;
    var d = dur(stages[stageIndex]), t = clamp01(elapsed / d);
    render(t);
    if (t >= 1) endStage(); else schedule();
  }

  function beginStage(i) {
    stageIndex = i; elapsed = 0; stageActive = true; last = null; lastFocus = -1;
    if (stages[i].name === 'fragment') { for (var k = 0; k < fstate.length; k++) syncFrag(k, 'created'); }
    cb.onEvent({ type: 'stageStart', stage: stageInfo() });
    render(0); schedule();
  }

  function endStage() {
    stageActive = false;
    if (stages[stageIndex].name === 'travel' && fragmented) { for (var k = 0; k < calc.fragments.length; k++) syncFrag(k, 'arrived'); }
    cb.onEvent({ type: 'stageDone', stage: stageInfo() });
    if (stageIndex >= stages.length - 1) { setState('finished'); cb.onEvent({ type: 'finish' }); return; }
    if (state === 'running') beginStage(stageIndex + 1);
  }

  function showIdle() {
    cancel(); stageActive = false; stageIndex = 0; elapsed = 0;
    hide(ctx.big); hide(ctx.ptb); hide(ctx.rebuilt); ctx.callout.textContent = '';
    ctx.frags.forEach(hide); setBuffer(0); routerText('');
    ctx.big.setAttribute('class', 'pkt original');
    place(ctx.big, GEO.stackX, GEO.y, 1, 1);
    setNodes('', '', '');
    cb.onProgress(0);
  }

  var api = {
    init: function (callbacks) { Object.keys(callbacks || {}).forEach(function (k) { cb[k] = callbacks[k]; }); },
    load: function (config, result) {
      cancel(); cfg = config; calc = result; fragmented = !!(result && !result.noFragmentation && result.fragments && result.fragments.length);
      stages = stageList(); fstate = []; buildScene(); showIdle();
      if (fragmented) calc.fragments.forEach(function (f, i) { fstate[i] = 'pending'; });
      setState('idle');
      cb.onEvent({ type: 'load', stages: api.getStages(), fragmented: fragmented });
    },
    start: function () {
      cancel(); showIdle(); fstate = fstate.map(function () { return 'pending'; });
      cb.onEvent({ type: 'restart' });
      setState('running'); beginStage(0);
    },
    pause: function () { if (state !== 'running') return; cancel(); setState('paused'); },
    resume: function () {
      if (state !== 'paused' && state !== 'stepping') return;
      setState('running'); last = null;
      if (stageActive) schedule(); else if (stageIndex < stages.length - 1) beginStage(stageIndex + 1);
    },
    step: function () {
      if (state === 'finished') { cancel(); showIdle(); fstate = fstate.map(function () { return 'pending'; }); cb.onEvent({ type: 'restart' }); setState('stepping'); beginStage(0); return; }
      if (state === 'idle') { setState('stepping'); beginStage(0); return; }
      cancel();
      if (stageActive) { // finish the stage that is playing
        setState('stepping'); elapsed = stages[stageIndex].dur; render(1); endStage();
      } else { setState('stepping'); beginStage(stageIndex + 1); }
    },
    reset: function () {
      if (!cfg) return; cancel(); fstate = fstate.map(function () { return 'pending'; });
      showIdle(); setState('idle'); cb.onEvent({ type: 'reset' });
    },
    setSpeed: function (x) { speed = Math.max(0.25, Math.min(3, Number(x) || 1)); },
    getState: function () { return state; },
    getStages: function () { return stages.map(function (s) { return { name: s.name, label: LABELS[s.name] }; }); },
    getStageIndex: function () { return stageIndex; }
  };

  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'running') api.pause(); });
  root.V6Anim = api;
}(window));
