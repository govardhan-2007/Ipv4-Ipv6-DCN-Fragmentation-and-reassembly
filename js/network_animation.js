/**
 * network_animation.js
 * Animates the Source -> Router -> Destination topology (SVG) for the result of
 * Fragmentation.fragmentDatagram(). Animation only: all numbers shown come from
 * the result object, nothing is calculated or hardcoded here.
 *
 * Public API (window.VLab.Animation):
 *   init({onEvent, onState})   register callbacks (called once by app.js)
 *   load(result)               prepare a new simulation and clear the drawing
 *   start()                    run all stages automatically (restarts if finished)
 *   pause() / resume()         freeze / continue automatic mode
 *   step()                     step-by-step mode: each call plays one stage
 *   reset()                    clear the drawing, back to 'idle'
 *   setSpeed(x)                playback speed multiplier (0.25 to 3)
 *   getState()                 'idle' | 'running' | 'paused' | 'stepping' | 'finished'
 *   getStageList()             [{name, label}] for the loaded result (drives the timeline UI)
 *   resume() also works from 'stepping': it switches step mode back to automatic playback.
 *
 * Callbacks:
 *   onEvent({text, type, progress, narrate:{name, data}, stage:{index, name, label, count},
 *            stageDone:index, fragmentState:{index|all, state}, focusFragment:index|null})
 *       type: 'info' | 'ok' | 'warn' | 'bad'. progress: 0..100.
 *       narrate names used: needs-fragmentation, no-fragmentation, fragments-generated,
 *       fragment-detail, final-fragment, fragments-arrived, df-dropped, icmp-returned
 *   onState(state)
 *
 * Needs these elements from index.html: #node-source, #node-router, #node-dest,
 * #packet-layer, #icmp-layer, #router-check, #topology-caption.
 */
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Topology geometry (matches the SVG viewBox 0 40 900 215 in index.html)
  var GEO = {
    y: 150,
    sourceX: 90, sourceEdge: 150,
    routerX: 450, routerLeft: 390, routerRight: 510,
    destX: 810, destLeft: 750
  };

  var DURATION = { create: 800, toRouter: 1500, check: 1600, split: 1800, headers: 1600,
    travel: 3000, arrive: 900, forward: 2400, drop: 1200, icmp: 2000, icmpArrive: 900 };

  var STAGE_LABELS = {
    'create': 'Create datagram', 'to-router': 'Cross Link A', 'check': 'Router checks MTU',
    'split': 'Split payload', 'headers': 'Build headers', 'travel': 'Cross Link B',
    'arrive': 'Delivered', 'forward': 'Forward unchanged', 'drop': 'Drop packet',
    'icmp': 'ICMP reply', 'icmp-arrive': 'Source notified'
  };

  function stageNames(status) {
    var base = ['create', 'to-router', 'check'];
    if (status === 'fragmented') return base.concat(['split', 'headers', 'travel', 'arrive']);
    if (status === 'no-fragmentation') return base.concat(['forward', 'arrive']);
    return base.concat(['drop', 'icmp', 'icmp-arrive']);
  }

  var callbacks = { onEvent: function () {}, onState: function () {} };
  var result = null;
  var state = 'idle';
  var speed = 1;
  var stages = [];
  var stageIndex = 0;
  var stageElapsed = 0;
  var stageRunning = false;
  var rafId = null;
  var lastTs = null;
  var ctx = {};       // per-run drawing objects (packet elements, fan layout, ...)

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function colorClass(index) { return 'fc-' + (((index - 1) % 8) + 8) % 8; }

  function emit(evt) { callbacks.onEvent(evt); }

  function setState(next) {
    state = next;
    callbacks.onState(state);
  }

  function setNode(id, cls) {
    var node = $(id);
    if (!node) return;
    node.classList.remove('active', 'alert', 'done');
    if (cls) node.classList.add(cls);
  }

  function setCaption(text) {
    var c = $('topology-caption');
    if (c) c.textContent = text;
  }

  function setRouterText(text) {
    var t = $('router-check');
    if (t) t.textContent = text;
  }

  /** Create a packet glyph (rounded rectangle with an optional label) centred on (0,0). */
  function makePacket(layerId, cls, w, h, label, tip) {
    var g = svgEl('g', { 'class': 'pkt ' + cls });
    if (tip) { var title = svgEl('title', {}); title.textContent = tip; g.appendChild(title); }
    g.appendChild(svgEl('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4 }));
    if (label) {
      var t = svgEl('text', { x: 0, y: 4 });
      t.textContent = label;
      g.appendChild(t);
    }
    $(layerId).appendChild(g);
    return g;
  }

  function place(g, x, y, opacity, scale) {
    g.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + (scale === undefined ? 1 : scale) + ')');
    g.style.opacity = (opacity === undefined) ? 1 : opacity;
  }

  function clearDrawing() {
    ['packet-layer', 'icmp-layer'].forEach(function (id) {
      var layer = $(id);
      if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild);
    });
    setNode('node-source', null);
    setNode('node-router', null);
    setNode('node-dest', null);
    setRouterText('');
    setCaption('Packets appear here during the simulation.');
    ctx = {};
  }

  // ---------------------------------------------------------------------
  // Fan layout: where the fragments sit just after leaving the router
  // ---------------------------------------------------------------------
  function buildFragmentLayout(frags, mtu) {
    var n = frags.length;
    var rows = Math.min(n, 4);
    var cols = Math.ceil(n / rows);
    var cellW = Math.min(64, Math.floor(150 / cols));
    var rowGap = 22;
    return frags.map(function (pk, i) {
      var row = i % rows;
      var col = Math.floor(i / rows);
      var scaled = Math.round(52 * pk.totalLength / mtu);
      var w = Math.max(10, Math.min(cellW - 3, Math.max(22, scaled)));   // 22 keeps the short last fragment labelled
      return {
        pk: pk,
        w: w,
        x: GEO.routerRight + 28 + col * cellW + cellW / 2,
        y: GEO.y + (row - (rows - 1) / 2) * rowGap,
        label: (w >= 22) ? 'F' + pk.index : '',
        arrived: false,
        g: null
      };
    });
  }

  // ---------------------------------------------------------------------
  // Stage builders. A stage = {name, duration, enter(), update(p), exit()}
  // ---------------------------------------------------------------------
  function stageCreate() {
    var p = result.params;
    var o = result.original;
    return {
      name: 'create', duration: DURATION.create,
      enter: function () {
        ctx.ow = 76;
        ctx.original = makePacket('packet-layer', 'original', ctx.ow, 30, p.datagramSize + ' B');
        place(ctx.original, GEO.sourceX, GEO.y, 0, 0.6);
        setNode('node-source', 'active');
        setCaption('The source host builds the original IPv4 datagram.');
        emit({
          text: 'Source creates a ' + p.datagramSize + '-byte IPv4 datagram: ' + p.headerLength + '-byte header + ' +
            result.originalPayloadSize + '-byte payload. Identification ' + (window.VLab && VLab.Settings ? VLab.Settings.fmtId(result.identification) : result.identification) + ', DF = ' + p.df +
            ', TTL ' + o.ttl + '.',
          type: 'info', progress: 0
        });
      },
      update: function (t) {
        var e = ease(t);
        place(ctx.original, lerp(GEO.sourceX, GEO.sourceEdge + 30, e), GEO.y, e, lerp(0.6, 1, e));
      },
      exit: function () { place(ctx.original, GEO.sourceEdge + 30, GEO.y, 1, 1); }
    };
  }

  function stageToRouter() {
    var endX = GEO.routerLeft - ctx.ow / 2 - 8;
    return {
      name: 'to-router', duration: DURATION.toRouter,
      enter: function () {
        setCaption('The datagram crosses Link A towards the router.');
        emit({ text: 'The datagram travels across Link A to the router.', type: 'info' });
      },
      update: function (t) { place(ctx.original, lerp(GEO.sourceEdge + 30, endX, ease(t)), GEO.y, 1, 1); },
      exit: function () { place(ctx.original, endX, GEO.y, 1, 1); setNode('node-source', null); }
    };
  }

  function stageCheck() {
    var p = result.params;
    var st = result.status;
    return {
      name: 'check', duration: DURATION.check,
      enter: function () {
        var text, type, narrateName, nodeClass, router;
        if (st === 'no-fragmentation') {
          router = p.datagramSize + ' B ≤ MTU ' + p.mtu + ': forward';
          text = 'Router checks the size: ' + p.datagramSize + ' bytes does not exceed the MTU of ' + p.mtu + ' bytes. No fragmentation is needed.';
          type = 'ok'; narrateName = 'no-fragmentation'; nodeClass = 'active';
        } else if (st === 'dropped-df') {
          router = p.datagramSize + ' B > MTU ' + p.mtu + ' and DF = 1: drop';
          text = 'Router checks the size: ' + p.datagramSize + ' bytes exceeds the MTU of ' + p.mtu + ' bytes, but DF = 1 forbids fragmentation.';
          type = 'bad'; narrateName = null; nodeClass = 'alert';
        } else {
          router = p.datagramSize + ' B > MTU ' + p.mtu + ': fragment';
          text = 'Router checks the size: ' + p.datagramSize + ' bytes exceeds the MTU of ' + p.mtu + ' bytes. Fragmentation is required.';
          type = 'warn'; narrateName = 'needs-fragmentation'; nodeClass = 'active';
        }
        setNode('node-router', nodeClass);
        setRouterText(router);
        setCaption('The router compares the datagram size with the MTU of the next link.');
        emit({ text: text, type: type,
          narrate: narrateName ? { name: narrateName, data: { size: p.datagramSize, mtu: p.mtu } } : undefined });
      },
      update: function (t) {
        // gentle pulse on the packet while the router examines it
        var s = 1 + 0.06 * Math.sin(t * Math.PI * 4);
        place(ctx.original, GEO.routerLeft - ctx.ow / 2 - 8, GEO.y, 1, s);
      },
      exit: function () { place(ctx.original, GEO.routerLeft - ctx.ow / 2 - 8, GEO.y, 1, 1); }
    };
  }

  // ----- fragmented path -----
  function stageSplit() {
    var p = result.params;
    var frags = result.fragments;
    var fromX = GEO.routerLeft - ctx.ow / 2 - 8;
    return {
      name: 'split', duration: DURATION.split,
      enter: function () {
        ctx.frags = buildFragmentLayout(frags, p.mtu);
        ctx.frags.forEach(function (f) {
          f.g = makePacket('packet-layer', colorClass(f.pk.index), f.w, 18, f.label,
            'Fragment ' + f.pk.index + ': payload ' + f.pk.payloadLength + ' B, total length ' + f.pk.totalLength + ' B, offset ' + f.pk.fragmentOffset + ', MF ' + f.pk.mf);
          place(f.g, GEO.routerX, GEO.y, 0, 0.3);
        });
        setRouterText('Pmax = ' + result.maxFragmentPayload + ' B, ' + frags.length + ' fragments');
        setCaption('The router splits the payload into fragments, each with its own IPv4 header and a distinct colour.');
        emit({
          text: 'Router splits the ' + result.originalPayloadSize + '-byte payload into ' + frags.length + ' fragments. Pmax = floor((' +
            p.mtu + ' - ' + p.headerLength + ') / 8) x 8 = ' + result.maxFragmentPayload + ' bytes.',
          type: 'warn',
          narrate: { name: 'fragments-generated', data: { count: frags.length, pmax: result.maxFragmentPayload } }
        });
        emit({ fragmentState: { all: true, state: 'created' } });
      },
      update: function (t) {
        var e = ease(t);
        // original packet is absorbed by the router
        place(ctx.original, lerp(fromX, GEO.routerX, e), GEO.y, 1 - e, lerp(1, 0.5, e));
        // fragments emerge from the router and fan out
        ctx.frags.forEach(function (f) {
          place(f.g, lerp(GEO.routerX, f.x, e), lerp(GEO.y, f.y, e), clamp01(e * 1.4), lerp(0.3, 1, e));
        });
      },
      exit: function () {
        place(ctx.original, GEO.routerX, GEO.y, 0, 0.5);
        ctx.frags.forEach(function (f) { place(f.g, f.x, f.y, 1, 1); });
      }
    };
  }

  function stageHeaders() {
    var frags = result.fragments;
    var n = frags.length;
    var pmaxUnits = result.maxFragmentPayload / 8;
    return {
      name: 'headers', duration: DURATION.headers,
      enter: function () {
        setCaption('Each fragment header carries the same Identification, its own fragment offset, and the MF flag.');
        var show = [];
        if (n <= 10) { for (var i = 0; i < n; i++) show.push(i); }
        else show = [0, 1, n - 1];
        show.forEach(function (i, k) {
          var pk = frags[i];
          if (n > 10 && k === 2) {
            emit({ text: 'Fragments 3 to ' + (n - 1) + ' follow the same pattern: each offset increases by ' + pmaxUnits + ' (= Pmax / 8).', type: 'info' });
          }
          var evt = {
            text: 'Fragment ' + pk.index + ': payload ' + pk.payloadLength + ' B, total length ' + pk.totalLength +
              ', offset ' + pk.fragmentOffset + ', MF = ' + pk.mf + '.',
            type: 'info'
          };
          if (i === 0) evt.narrate = { name: 'fragment-detail', data: { index: pk.index, offset: pk.fragmentOffset, mf: pk.mf, payload: pk.payloadLength } };
          if (i === n - 1) { evt.narrate = { name: 'final-fragment', data: { index: pk.index, mf: pk.mf } }; evt.type = 'ok'; }
          emit(evt);
        });
      },
      update: function (t) {
        // pulse each fragment in turn so the viewer can follow the list
        var active = Math.min(n - 1, Math.floor(t * n));
        ctx.frags.forEach(function (f, i) { place(f.g, f.x, f.y, 1, i === active ? 1.3 : 1); });
        if (ctx.focusIndex !== active) { ctx.focusIndex = active; emit({ focusFragment: frags[active].index }); }
      },
      exit: function () {
        ctx.frags.forEach(function (f) { place(f.g, f.x, f.y, 1, 1); });
        ctx.focusIndex = null;
        emit({ focusFragment: null });
      }
    };
  }

  function stageTravel() {
    var n = result.fragments.length;
    var stagger = Math.min(0.6, 0.02 * n + 0.1);        // share of the stage used to stagger departures
    var verbose = n <= 10;                                // log each arrival only for small counts
    return {
      name: 'travel', duration: DURATION.travel,
      enter: function () {
        setNode('node-router', null);
        setRouterText('');
        ctx.destText = svgEl('text', { x: GEO.destX, y: 80, style: 'fill: #34d399; font-size: 14px' });
        ctx.destText.textContent = 'Received 0 of ' + n;
        $('packet-layer').appendChild(ctx.destText);
        ctx.arrivedCount = 0;
        ctx.buffer = buildBuffer();
        setCaption('Fragments travel across Link B (MTU ' + result.params.mtu + ') to the destination.');
        emit({ text: 'The ' + n + ' fragments travel across Link B towards the destination.', type: 'info' });
      },
      update: function (t) {
        var span = 1 + stagger;
        ctx.frags.forEach(function (f, i) {
          var offset = (n > 1) ? stagger * i / (n - 1) : 0;
          var local = clamp01((t * span - offset));
          var e = ease(local);
          var targetX = GEO.destLeft - 14 - f.w / 2;
          var fade = local > 0.88 ? 1 - (local - 0.88) / 0.12 : 1;
          place(f.g, lerp(f.x, targetX, e), f.y, fade, 1);
          if (!f.departed && local > 0) { f.departed = true; emit({ fragmentState: { index: f.pk.index, state: 'transit' } }); }
          // 0.9999 (not 1) because t * span - offset can land a hair below 1 in floating point
          if (local >= 0.9999) registerArrival(f);
        });
      },
      exit: function () {
        ctx.frags.forEach(function (f) { place(f.g, GEO.destLeft - 14 - f.w / 2, f.y, 0, 1); registerArrival(f); });
      }
    };

    /** Count a fragment as received exactly once, update the counter, log it for small runs. */
    function registerArrival(f) {
      if (f.arrived) return;
      f.arrived = true;
      ctx.arrivedCount++;
      addToBuffer(f);
      emit({ fragmentState: { index: f.pk.index, state: 'arrived' } });
      ctx.destText.textContent = 'Received ' + ctx.arrivedCount + ' of ' + n;
      setNode('node-dest', 'active');
      if (verbose) {
        emit({ text: 'Fragment ' + f.pk.index + ' received at the destination (offset ' + f.pk.fragmentOffset + ').', type: 'ok' });
      }
    }
  }

  /** Small byte-position bar under the destination: fragments land at offset x 8, not in arrival order. */
  function buildBuffer() {
    var total = result.originalPayloadSize;
    var b = { x0: GEO.destX - 60, w: 120, y: 214, h: 12, total: total, bytes: 0 };
    b.g = svgEl('g', { 'class': 'buffer' });
    b.g.appendChild(svgEl('rect', { x: b.x0, y: b.y, width: b.w, height: b.h, rx: 4, 'class': 'buf-bg' }));
    b.label = svgEl('text', { x: GEO.destX, y: b.y + b.h + 15, 'class': 'buf-label' });
    b.label.textContent = 'Buffer: 0 of ' + total + ' B';
    b.g.appendChild(b.label);
    $('packet-layer').appendChild(b.g);
    return b;
  }

  function addToBuffer(f) {
    var b = ctx.buffer;
    if (!b) return;
    var seg = svgEl('rect', {
      x: b.x0 + (f.pk.payloadStart / b.total) * b.w,
      width: Math.max(1.5, (f.pk.payloadLength / b.total) * b.w),
      y: b.y, height: b.h, 'class': 'buf-seg ' + colorClass(f.pk.index)
    });
    b.g.appendChild(seg);
    b.bytes += f.pk.payloadLength;
    b.label.textContent = 'Buffer: ' + b.bytes + ' of ' + b.total + ' B';
  }

  function stageArriveFragments() {
    var n = result.fragments.length;
    return {
      name: 'arrive', duration: DURATION.arrive,
      enter: function () {
        setNode('node-dest', 'done');
        setCaption('All fragments have reached the destination. Reassembly happens there, not at the router.');
        emit({
          text: 'All ' + n + ' fragments arrived at the destination. Open the Reassembly laboratory to rebuild the datagram.',
          type: 'ok', progress: 100, narrate: { name: 'fragments-arrived', data: { count: n } }
        });
      },
      update: function () {},
      exit: function () {}
    };
  }

  // ----- unfragmented path -----
  function stageForward() {
    var p = result.params;
    var startX = GEO.routerLeft - ctx.ow / 2 - 8;
    var endX = GEO.destLeft - 14 - ctx.ow / 2;
    var fwd = result.packets[0];
    return {
      name: 'forward', duration: DURATION.forward,
      enter: function () {
        setCaption('The router forwards the datagram unchanged across Link B.');
        emit({
          text: 'Router decrements TTL (' + result.original.ttl + ' to ' + fwd.ttl + '), recomputes the header checksum (' +
            '0x' + ('0000' + fwd.headerChecksum.toString(16).toUpperCase()).slice(-4) + ') and forwards the ' + p.datagramSize + '-byte packet.',
          type: 'info'
        });
      },
      update: function (t) {
        var e = ease(t);
        var inside = (t > 0.15 && t < 0.35);   // brief dip in opacity while passing through the router
        place(ctx.original, lerp(startX, endX, e), GEO.y, inside ? 0.55 : 1, 1);
      },
      exit: function () {
        place(ctx.original, endX, GEO.y, 0.9, 1);
        setNode('node-router', null);
        setRouterText('');
        setNode('node-dest', 'done');
      }
    };
  }

  function stageArriveWhole() {
    return {
      name: 'arrive', duration: DURATION.arrive,
      enter: function () {
        setCaption('The destination received the whole datagram. No reassembly is needed.');
        emit({ text: 'The destination received the complete ' + result.params.datagramSize + '-byte datagram. No reassembly was needed.',
          type: 'ok', progress: 100 });
      },
      update: function () {},
      exit: function () {}
    };
  }

  // ----- DF = 1 drop path -----
  function stageDrop() {
    var p = result.params;
    return {
      name: 'drop', duration: DURATION.drop,
      enter: function () {
        ctx.original.classList.add('dropped');
        setCaption('The router discards the packet because DF = 1.');
        emit({ text: 'Router drops the ' + p.datagramSize + '-byte packet: it is larger than the MTU and DF = 1.', type: 'bad',
          narrate: { name: 'df-dropped', data: { mtu: p.mtu } } });
      },
      update: function (t) {
        var x = GEO.routerLeft - ctx.ow / 2 - 8;
        place(ctx.original, x, lerp(GEO.y, GEO.y + 55, ease(t)), 1 - t, lerp(1, 0.6, t));
      },
      exit: function () { place(ctx.original, GEO.routerLeft - ctx.ow / 2 - 8, GEO.y + 55, 0, 0.6); }
    };
  }

  function stageIcmp() {
    var icmp = result.icmp;
    var w = 74;
    return {
      name: 'icmp', duration: DURATION.icmp,
      enter: function () {
        ctx.icmpPkt = makePacket('icmp-layer', 'icmp', w, 26, 'ICMP 3/4');
        place(ctx.icmpPkt, GEO.routerLeft - 40, GEO.y, 0, 0.6);
        setCaption('The router sends ICMP Type 3, Code 4 (Fragmentation Needed) back to the source.');
        emit({ text: 'Router returns ICMP Type 3, Code 4 (Destination Unreachable: Fragmentation Needed and DF set) with Next-Hop MTU = ' +
            icmp.nextHopMtu + '.', type: 'warn',
          narrate: { name: 'icmp-returned', data: { mtu: icmp.nextHopMtu } } });
      },
      update: function (t) {
        var e = ease(t);
        place(ctx.icmpPkt, lerp(GEO.routerLeft - 40, GEO.sourceEdge + 50, e), GEO.y, clamp01(t * 3), 1);
      },
      exit: function () { place(ctx.icmpPkt, GEO.sourceEdge + 50, GEO.y, 1, 1); setNode('node-router', null); setRouterText(''); }
    };
  }

  function stageIcmpArrive() {
    var p = result.params;
    return {
      name: 'icmp-arrive', duration: DURATION.icmpArrive,
      enter: function () {
        setNode('node-source', 'alert');
        setCaption('The sender learns the next-hop MTU and must send smaller packets or clear DF.');
        emit({ text: 'Source receives the ICMP message. It must resend with a datagram size of at most ' + p.mtu +
            ' bytes (path MTU discovery), or clear DF.', type: 'warn', progress: 100 });
      },
      update: function () {},
      exit: function () {}
    };
  }

  /** Wrap a stage factory so it is built when the stage starts (it may need drawing objects made by earlier stages). */
  function lazy(name, duration, factory) {
    return {
      name: name, duration: duration,
      enter: function () { this.inner = factory(); this.inner.enter(); },
      update: function (t) { this.inner.update(t); },
      exit: function () { this.inner.exit(); }
    };
  }

  function buildStages() {
    var list = [stageCreate(), lazy('to-router', DURATION.toRouter, stageToRouter), stageCheck()];
    if (result.status === 'fragmented') {
      list.push(lazy('split', DURATION.split, stageSplit));
      list.push(lazy('headers', DURATION.headers, stageHeaders));
      list.push(lazy('travel', DURATION.travel, stageTravel));
      list.push(lazy('arrive', DURATION.arrive, stageArriveFragments));
    } else if (result.status === 'no-fragmentation') {
      list.push(lazy('forward', DURATION.forward, stageForward));
      list.push(lazy('arrive', DURATION.arrive, stageArriveWhole));
    } else {
      list.push(lazy('drop', DURATION.drop, stageDrop));
      list.push(lazy('icmp', DURATION.icmp, stageIcmp));
      list.push(lazy('icmp-arrive', DURATION.icmpArrive, stageIcmpArrive));
    }
    return list;
  }

  // ---------------------------------------------------------------------
  // Stage runner
  // ---------------------------------------------------------------------
  function beginStage(i) {
    stageIndex = i;
    stageElapsed = 0;
    stageRunning = true;
    stages[i].enter();
    stages[i].update(0);
    emit({
      progress: (i / stages.length) * 100,
      stage: { index: i, name: stages[i].name, label: stageLabelFor(stages[i].name), count: stages.length }
    });
  }

  function stageLabelFor(name) {
    if (name === 'arrive' && result && result.status === 'no-fragmentation') return 'Delivered whole';
    if (name === 'arrive') return 'Destination receives';
    return STAGE_LABELS[name] || name;
  }

  function endStage() {
    stages[stageIndex].update(1);
    stages[stageIndex].exit();
    emit({ stageDone: stageIndex });
    stageRunning = false;
    stageIndex++;
    if (stageIndex >= stages.length) {
      finish();
    } else if (state === 'running') {
      beginStage(stageIndex);
    }
    // in 'stepping' mode we now wait for the next step() call
  }

  function finish() {
    stopLoop();
    emit({ progress: 100 });
    setState('finished');
  }

  function advance(dt) {
    if (!stageRunning) return;
    stageElapsed += dt;
    var stage = stages[stageIndex];
    var t = clamp01(stageElapsed / stage.duration);
    stage.update(t);
    emit({ progress: ((stageIndex + t) / stages.length) * 100 });
    if (t >= 1) endStage();
  }

  function frame(ts) {
    if (rafId === null) return;
    var dt = (lastTs === null) ? 0 : Math.min(100, ts - lastTs) * speed;   // clamp: avoids jumps after a background tab
    lastTs = ts;
    if (state === 'running' || state === 'stepping') advance(dt);
    if (rafId !== null) rafId = window.requestAnimationFrame(frame);
  }

  function startLoop() {
    if (rafId !== null) return;
    lastTs = null;
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    rafId = null;
    lastTs = null;
  }

  function prepareRun() {
    stopLoop();
    clearDrawing();
    stages = buildStages();
    stageIndex = 0;
    stageElapsed = 0;
    stageRunning = false;
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------
  var api = {
    init: function (cb) {
      callbacks.onEvent = (cb && cb.onEvent) || callbacks.onEvent;
      callbacks.onState = (cb && cb.onState) || callbacks.onState;
    },

    load: function (res) {
      stopLoop();
      result = res;
      clearDrawing();
      stages = [];
      stageRunning = false;
      setState('idle');
    },

    start: function () {
      if (!result || result.status === 'invalid') return;
      prepareRun();
      setState('running');
      beginStage(0);
      startLoop();
    },

    pause: function () {
      if (state === 'running') setState('paused');
    },

    resume: function () {
      if (state === 'paused' || state === 'stepping') {
        setState('running');
        if (!stageRunning && stageIndex < stages.length) beginStage(stageIndex);
        startLoop();
      }
    },

    step: function () {
      if (!result || result.status === 'invalid') return;
      if (state === 'idle' || state === 'finished') {
        prepareRun();
        setState('stepping');
        beginStage(0);
        startLoop();
        return;
      }
      if (state === 'paused') {          // switch from automatic to step mode
        setState('stepping');
        startLoop();
        return;
      }
      if (state === 'stepping') {
        if (stageRunning) {              // skip to the end of the current stage
          endStage();
        } else if (stageIndex < stages.length) {
          beginStage(stageIndex);
          startLoop();
        }
      }
    },

    reset: function () {
      stopLoop();
      clearDrawing();
      stages = [];
      stageRunning = false;
      stageIndex = 0;
      setState(result ? 'idle' : 'idle');
    },

    setSpeed: function (x) {
      var v = Number(x);
      if (isFinite(v) && v > 0) speed = Math.max(0.25, Math.min(3, v));
    },

    getState: function () { return state; },

    getStageList: function () {
      if (!result || result.status === 'invalid') return [];
      return stageNames(result.status).map(function (n) { return { name: n, label: stageLabelFor(n) }; });
    }
  };

  root.VLab = root.VLab || {};
  root.VLab.Animation = api;
})(typeof window !== 'undefined' ? window : globalThis);
