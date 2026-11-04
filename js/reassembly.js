/**
 * reassembly.js
 * Destination-side IPv4 reassembly engine for the DCN Virtual Lab.
 *
 * Pure logic: no DOM access. Loadable in the browser (window.VLab.Reassembly)
 * and in Node (module.exports) for tests. Requires checksum.js and
 * fragmentation.js to be loaded first.
 *
 * How it works (RFC 791 / RFC 815 idea):
 *   - Fragments are grouped by (source IP, destination IP, protocol, Identification).
 *   - Each fragment's payload is placed at byte position (Fragment Offset x 8).
 *     Arrival order never matters: we never concatenate in arrival order.
 *   - The total datagram payload length is unknown until the fragment with
 *     MF = 0 arrives:  total = (last fragment offset x 8) + its payload length.
 *   - We track received byte ranges as merged half-open intervals [start, end).
 *     The datagram is complete when the end is known AND no gaps remain.
 *   - A reassembly timer starts at the first fragment. If it expires while gaps
 *     remain, the partial datagram is discarded (and ICMP Time Exceeded Code 1
 *     is generated if fragment zero had arrived).
 *
 * Time is SIMULATED: callers pass `now` in milliseconds, so the UI can speed
 * up the clock and tests are deterministic.
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Checksum = isNode ? require('./checksum.js') : root.VLab.Checksum;
  var Fragmentation = isNode ? require('./fragmentation.js') : root.VLab.Fragmentation;

  var DEFAULT_TIMEOUT_MS = 15000; // RFC 791 suggests 15 s as a minimum; real stacks use 30-60 s.

  var STATUS = {
    WAITING: 'waiting',     // nothing received yet
    PARTIAL: 'partial',     // some fragments received, gaps remain or end unknown
    COMPLETE: 'complete',   // every byte present: datagram rebuilt
    TIMED_OUT: 'timed-out'  // timer expired with gaps: partial datagram discarded
  };

  // ---------------------------------------------------------------------
  // Interval helpers (half-open ranges [start, end))
  // ---------------------------------------------------------------------

  /** Insert [start, end) into a sorted list of ranges, merging overlaps/adjacent ranges. */
  function addRange(ranges, start, end) {
    var merged = [];
    var placed = false;
    var newStart = start;
    var newEnd = end;
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      if (r.end < newStart) {
        merged.push(r);                       // entirely before the new range
      } else if (r.start > newEnd) {
        if (!placed) { merged.push({ start: newStart, end: newEnd }); placed = true; }
        merged.push(r);                       // entirely after the new range
      } else {
        newStart = Math.min(newStart, r.start);   // overlapping or touching: absorb
        newEnd = Math.max(newEnd, r.end);
      }
    }
    if (!placed) merged.push({ start: newStart, end: newEnd });
    return merged;
  }

  /**
   * Missing byte ranges.
   * If the total length is known, gaps are within [0, total).
   * If unknown (final fragment not yet seen), an "open" gap is reported after the
   * highest received byte: the end of the datagram is not known yet.
   */
  function computeGaps(ranges, total) {
    var gaps = [];
    var cursor = 0;
    for (var i = 0; i < ranges.length; i++) {
      if (ranges[i].start > cursor) gaps.push({ start: cursor, end: ranges[i].start, open: false });
      cursor = Math.max(cursor, ranges[i].end);
    }
    if (total !== null) {
      if (cursor < total) gaps.push({ start: cursor, end: total, open: false });
    } else {
      gaps.push({ start: cursor, end: null, open: true });
    }
    return gaps.map(function (g) {
      return {
        start: g.start,
        end: g.end,                                          // exclusive (null = unknown)
        endInclusive: g.end === null ? null : g.end - 1,
        length: g.end === null ? null : g.end - g.start,
        open: g.open,
        label: g.open
          ? 'bytes ' + g.start + ' onward (end of datagram not yet known: final fragment missing)'
          : 'bytes ' + g.start + ' to ' + (g.end - 1) + ' (' + (g.end - g.start) + ' bytes)'
      };
    });
  }

  function sumLengths(ranges) {
    return ranges.reduce(function (s, r) { return s + (r.end - r.start); }, 0);
  }

  // ---------------------------------------------------------------------
  // Reassembler
  // ---------------------------------------------------------------------

  /**
   * @param {Object} [options] {timeoutMs}
   */
  function Reassembler(options) {
    var opts = options || {};
    this.timeoutMs = (opts.timeoutMs === undefined) ? DEFAULT_TIMEOUT_MS : opts.timeoutMs;
    this.buffers = {};   // key -> buffer
    this.history = [];   // snapshots of timed-out datagrams that were replaced
    this.now = 0;
  }

  /** Reassembly key: (source, destination, protocol, Identification). */
  Reassembler.makeKey = function (packet) {
    return [packet.sourceIp, packet.destinationIp, packet.protocol, packet.identification].join('|');
  };

  Reassembler.prototype.reset = function () {
    this.buffers = {};
    this.history = [];
    this.now = 0;
  };

  /** Validate a received packet. Returns a reason string or null if acceptable. */
  Reassembler.prototype._rejectReason = function (packet) {
    if (!Checksum.verifyHeaderChecksum(packet.headerBytes)) {
      return 'Header checksum is invalid: packet discarded.';
    }
    if (packet.payloadLength !== packet.totalLength - packet.headerLength) {
      return 'Total Length does not match header length plus payload length.';
    }
    if (packet.mf === 1 && packet.payloadLength % 8 !== 0) {
      return 'A fragment with MF = 1 must carry a multiple of 8 payload bytes.';
    }
    if (packet.payloadLength <= 0) {
      return 'Fragment carries no payload.';
    }
    return null;
  };

  /**
   * Deliver one packet to the destination.
   * @param {Object} packet a packet from Fragmentation.fragmentDatagram()
   * @param {number} [now] simulated time in ms
   * @returns {Object} event {type, reason, key, packetIndex, completed, datagram, snapshot}
   *   type: 'accepted' | 'duplicate' | 'overlap' | 'rejected' | 'unfragmented'
   */
  Reassembler.prototype.receive = function (packet, now) {
    if (now !== undefined) this.now = now;
    var t = this.now;
    var key = Reassembler.makeKey(packet);

    var reason = this._rejectReason(packet);
    if (reason) {
      return { type: 'rejected', reason: reason, key: key, packetIndex: packet.index, completed: false };
    }

    // A packet that is not a fragment (offset 0 and MF 0) needs no reassembly.
    if (packet.fragmentOffset === 0 && packet.mf === 0) {
      return {
        type: 'unfragmented',
        reason: 'Not a fragment (offset 0, MF = 0): delivered directly, no reassembly needed.',
        key: key, packetIndex: packet.index, completed: true, datagram: packet
      };
    }

    var buf = this.buffers[key];
    if (buf && buf.status === STATUS.TIMED_OUT) {
      // Late fragment after a timeout: the old partial datagram is gone, start afresh.
      this.history.push(this._snapshot(buf, t));
      buf = null;
    }
    if (buf && buf.status === STATUS.COMPLETE) {
      buf.duplicates++;
      buf.arrivals.push(packet.index);
      return {
        type: 'duplicate', reason: 'Datagram already reassembled: late fragment ignored.',
        key: key, packetIndex: packet.index, completed: true, snapshot: this._snapshot(buf, t)
      };
    }
    if (!buf) {
      buf = {
        key: key,
        identification: packet.identification,
        sourceIp: packet.sourceIp,
        destinationIp: packet.destinationIp,
        protocol: packet.protocol,
        status: STATUS.PARTIAL,
        firstArrival: t,
        ranges: [],
        data: [],              // data[i] = payload byte i of the original datagram (undefined = missing)
        total: null,           // total payload length, known once MF = 0 fragment arrives
        accepted: [],          // packets that contributed new bytes
        arrivals: [],          // every arrival (packet.index), including duplicates
        duplicates: 0,
        ttlMin: packet.ttl,
        datagram: null
      };
      this.buffers[key] = buf;
    }
    buf.arrivals.push(packet.index);

    var start = packet.fragmentOffset * 8;               // byte position = Fragment Offset x 8
    var end = start + packet.payloadLength;              // exclusive

    // The fragment with MF = 0 reveals the total payload length.
    if (packet.mf === 0) {
      var claimedTotal = end;                            // total = last offset x 8 + last payload
      if (buf.total !== null && buf.total !== claimedTotal) {
        return this._conflict(buf, packet, 'Conflicting final fragment: datagram length already ' + buf.total + '.');
      }
      if (sumLengthsBeyond(buf.ranges, claimedTotal)) {
        return this._conflict(buf, packet, 'Final fragment ends before bytes that were already received.');
      }
      buf.total = claimedTotal;
    } else if (buf.total !== null && end > buf.total) {
      return this._conflict(buf, packet, 'Fragment extends beyond the end of the datagram.');
    }

    // Count bytes that are genuinely new (first-arrival wins for overlapping bytes).
    var newBytes = 0;
    for (var i = start; i < end; i++) {
      if (buf.data[i] === undefined) {
        buf.data[i] = packet.payload[i - start];
        newBytes++;
      }
    }

    var type;
    if (newBytes === 0) {
      type = 'duplicate';
      buf.duplicates++;
      reason = 'Duplicate fragment: every byte of ' + start + '-' + (end - 1) + ' was already received.';
    } else {
      buf.ranges = addRange(buf.ranges, start, end);
      buf.accepted.push(packet);
      if (packet.ttl < buf.ttlMin) buf.ttlMin = packet.ttl;
      if (newBytes < packet.payloadLength) {
        type = 'overlap';
        reason = 'Partially overlapping fragment: only ' + newBytes + ' new bytes stored.';
      } else {
        type = 'accepted';
        reason = 'Fragment stored at bytes ' + start + ' to ' + (end - 1) + '.';
      }
    }

    var completed = this._tryComplete(buf);
    return {
      type: type, reason: reason, key: key, packetIndex: packet.index,
      completed: completed, datagram: completed ? buf.datagram : null,
      snapshot: this._snapshot(buf, t)
    };
  };

  Reassembler.prototype._conflict = function (buf, packet, reason) {
    return {
      type: 'rejected', reason: reason, key: buf.key, packetIndex: packet.index,
      completed: false, snapshot: this._snapshot(buf, this.now)
    };
  };

  /** If the end is known and no gaps remain, rebuild the original datagram. */
  Reassembler.prototype._tryComplete = function (buf) {
    if (buf.total === null) return false;
    if (computeGaps(buf.ranges, buf.total).length > 0) return false;

    // Rebuild the payload strictly by byte position (not arrival order).
    var payload = new Array(buf.total);
    for (var i = 0; i < buf.total; i++) payload[i] = buf.data[i];

    // The offset-0 fragment supplies the header template.
    var first = null;
    for (var j = 0; j < buf.accepted.length; j++) {
      if (buf.accepted[j].fragmentOffset === 0) { first = buf.accepted[j]; break; }
    }
    buf.datagram = Fragmentation.buildPacket({
      index: 0,
      headerLength: first.headerLength,
      tos: first.tos,
      identification: buf.identification,
      df: first.df,
      mf: 0,                          // reassembled datagram is no longer a fragment
      byteOffset: 0,                  // offset reset to 0
      ttl: buf.ttlMin,                // RFC: use the smallest TTL among the fragments
      protocol: buf.protocol,
      sourceIp: buf.sourceIp,
      destinationIp: buf.destinationIp,
      payload: payload
    });
    buf.status = STATUS.COMPLETE;
    return true;
  };

  /**
   * Advance the simulated clock and expire stale partial datagrams.
   * @param {number} now simulated time in ms
   * @returns {Object[]} timeout events (usually empty)
   */
  Reassembler.prototype.tick = function (now) {
    this.now = now;
    var events = [];
    for (var key in this.buffers) {
      if (!Object.prototype.hasOwnProperty.call(this.buffers, key)) continue;
      var buf = this.buffers[key];
      if (buf.status !== STATUS.PARTIAL) continue;
      if (now - buf.firstArrival < this.timeoutMs) continue;

      buf.status = STATUS.TIMED_OUT;
      var hadFirstFragment = buf.accepted.some(function (p) { return p.fragmentOffset === 0; });
      events.push({
        type: 'timeout',
        key: key,
        reason: 'Reassembly timer (' + (this.timeoutMs / 1000) + ' s) expired with missing data: ' +
          'the incomplete datagram is discarded.',
        // RFC 792: Time Exceeded (Type 11, Code 1) is only sent if fragment zero was received.
        icmp: hadFirstFragment ? {
          type: 11, code: 1,
          description: 'Time Exceeded: Fragment Reassembly Time Exceeded',
          fromIp: buf.destinationIp, toIp: buf.sourceIp
        } : null,
        snapshot: this._snapshot(buf, now)
      });
    }
    return events;
  };

  /** Build a read-only description of a buffer for the UI. */
  Reassembler.prototype._snapshot = function (buf, now) {
    var received = buf.ranges.map(function (r) {
      return { start: r.start, end: r.end, endInclusive: r.end - 1, length: r.end - r.start };
    });
    var bytesReceived = sumLengths(buf.ranges);
    var gaps = (buf.status === STATUS.COMPLETE) ? [] : computeGaps(buf.ranges, buf.total);

    // Did the accepted fragments arrive in a different order than their offsets?
    var arrivedOrder = buf.accepted.map(function (p) { return p.fragmentOffset; });
    var sortedOrder = arrivedOrder.slice().sort(function (a, b) { return a - b; });
    var outOfOrder = arrivedOrder.some(function (v, i) { return v !== sortedOrder[i]; });

    var remaining = null;
    if (buf.status === STATUS.PARTIAL) {
      remaining = Math.max(0, this.timeoutMs - (now - buf.firstArrival));
    }

    var statusText;
    if (buf.status === STATUS.COMPLETE) {
      statusText = 'Complete: all ' + buf.total + ' payload bytes received; original datagram reconstructed.';
    } else if (buf.status === STATUS.TIMED_OUT) {
      statusText = 'Discarded: reassembly timeout expired with missing data.';
    } else if (buf.total === null) {
      statusText = 'Partial: the final fragment (MF = 0) has not arrived, so the datagram length is unknown.';
    } else {
      statusText = 'Partial: waiting for ' + gaps.length + ' missing byte range' + (gaps.length === 1 ? '' : 's') + '.';
    }

    return {
      key: buf.key,
      identification: buf.identification,
      sourceIp: buf.sourceIp,
      destinationIp: buf.destinationIp,
      protocol: buf.protocol,
      status: buf.status,
      statusText: statusText,
      endKnown: buf.total !== null,
      totalPayloadLength: buf.total,
      originalDatagramSize: (buf.datagram) ? buf.datagram.totalLength : null,
      bytesReceived: bytesReceived,
      percentComplete: buf.total !== null ? (bytesReceived / buf.total) * 100 : null,
      fragmentsReceived: buf.accepted.length,
      duplicatesIgnored: buf.duplicates,
      arrivalOrder: buf.arrivals.slice(),
      arrivedOutOfOrder: outOfOrder,       // out of order is NOT loss
      receivedRanges: received,
      missingRanges: gaps,
      timeRemainingMs: remaining,
      datagram: buf.datagram
    };
  };

  /** Snapshots of all datagrams currently tracked. */
  Reassembler.prototype.getSnapshots = function () {
    var self = this;
    return Object.keys(this.buffers).map(function (k) { return self._snapshot(self.buffers[k], self.now); });
  };

  /** Snapshot for one datagram key (or null if nothing was received for it yet). */
  Reassembler.prototype.getSnapshot = function (key) {
    return this.buffers[key] ? this._snapshot(this.buffers[key], this.now) : null;
  };

  /** True if a range list already has bytes at or beyond `limit`. */
  function sumLengthsBeyond(ranges, limit) {
    return ranges.length > 0 && ranges[ranges.length - 1].end > limit;
  }

  // ---------------------------------------------------------------------
  // Scenario helpers (used by the Reassembly Lab and tests)
  // ---------------------------------------------------------------------

  /** Small seeded PRNG so "shuffle" is reproducible. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Shuffled list of 1..n that is guaranteed to differ from in-order when n >= 2. */
  function shuffledOrder(n, seed) {
    var inOrder = [];
    for (var i = 1; i <= n; i++) inOrder.push(i);
    if (n < 2) return inOrder;
    for (var attempt = 0; attempt < 25; attempt++) {
      var rnd = mulberry32((seed === undefined ? 12345 : seed) + attempt);
      var arr = inOrder.slice();
      for (var k = n - 1; k > 0; k--) {
        var j = Math.floor(rnd() * (k + 1));
        var tmp = arr[k]; arr[k] = arr[j]; arr[j] = tmp;
      }
      if (arr.some(function (v, idx) { return v !== inOrder[idx]; })) return arr;
    }
    return inOrder.slice().reverse();
  }

  /** The "middle" fragment used by Scenario 5 (never the last one when n >= 2). */
  function middleFragmentIndex(n) {
    return Math.ceil(n / 2);
  }

  /**
   * Deliver a set of fragments to a fresh Reassembler in a chosen way.
   * @param {Object[]} packets fragments (each with .index, 1-based)
   * @param {Object} [opts]
   *   order: 'in-order' | 'reverse' | 'shuffle' | number[] (1-based fragment indices)
   *   seed: number (for 'shuffle')
   *   drop: number[] fragment indices that never arrive
   *   duplicate: number[] fragment indices delivered twice
   *   timeoutMs, intervalMs (gap between arrivals, default 100)
   *   runUntilTimeout: true to advance the clock past the timeout if still incomplete
   * @returns {{reassembler, events, arrivalOrder, snapshot, status, payload}}
   */
  function simulateDelivery(packets, opts) {
    var o = opts || {};
    var n = packets.length;
    var byIndex = {};
    packets.forEach(function (p) { byIndex[p.index] = p; });

    var order;
    if (Array.isArray(o.order)) {
      order = o.order.slice();
      order.forEach(function (idx) {
        if (!byIndex[idx]) throw new Error('Unknown fragment index in order: ' + idx);
      });
    } else if (o.order === 'reverse') {
      order = packets.map(function (p) { return p.index; }).reverse();
    } else if (o.order === 'shuffle') {
      order = shuffledOrder(n, o.seed).map(function (pos) { return packets[pos - 1].index; });
    } else {
      order = packets.map(function (p) { return p.index; });
    }

    var drop = o.drop || [];
    var dup = o.duplicate || [];
    var interval = (o.intervalMs === undefined) ? 100 : o.intervalMs;
    var reassembler = new Reassembler({ timeoutMs: o.timeoutMs });

    var arrivalOrder = [];
    var events = [];
    var t = 0;
    order.forEach(function (idx) {
      if (drop.indexOf(idx) !== -1) return;           // lost in the network
      var times = (dup.indexOf(idx) !== -1) ? 2 : 1;
      for (var c = 0; c < times; c++) {
        arrivalOrder.push(idx);
        events.push(reassembler.receive(byIndex[idx], t));
        t += interval;
      }
    });

    var snaps = reassembler.getSnapshots();
    if (o.runUntilTimeout && snaps.length && snaps[0].status === STATUS.PARTIAL) {
      var firstArrival = reassembler.buffers[snaps[0].key].firstArrival;
      events = events.concat(reassembler.tick(firstArrival + reassembler.timeoutMs));
      snaps = reassembler.getSnapshots();
    }

    var snapshot = snaps.length ? snaps[0] : null;
    return {
      reassembler: reassembler,
      events: events,
      arrivalOrder: arrivalOrder,
      snapshot: snapshot,
      status: snapshot ? snapshot.status : STATUS.WAITING,
      payload: (snapshot && snapshot.datagram) ? snapshot.datagram.payload : null
    };
  }

  /** Byte-for-byte comparison of two payload arrays. */
  function payloadsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  var api = {
    STATUS: STATUS,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    Reassembler: Reassembler,
    addRange: addRange,
    computeGaps: computeGaps,
    shuffledOrder: shuffledOrder,
    middleFragmentIndex: middleFragmentIndex,
    simulateDelivery: simulateDelivery,
    payloadsEqual: payloadsEqual
  };

  if (isNode) {
    module.exports = api;
  }
  root.VLab = root.VLab || {};
  root.VLab.Reassembly = api;
})(typeof window !== 'undefined' ? window : globalThis);
