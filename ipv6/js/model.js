/* Pure IPv6 fragmentation + reassembly model used by Experiment 05 pages.
 * No DOM access. Loadable in the browser (window.DCNIPv6Model) and in Node (tests).
 *
 * Teaching model (see README):
 *   - packet size P includes the 40-byte IPv6 base header
 *   - fragmentable part F = P - 40 (no other extension headers)
 *   - every fragment = 40 B base header + 8 B Fragment Header + data
 *   - Dmax = floor((PathMTU - 48) / 8) * 8
 *   - the router never fragments; it returns ICMPv6 Packet Too Big (Type 2, Code 0)
 *   - only the destination reassembles; timeout 60 s (RFC 8200 s4.5)
 */
(function (root) {
  'use strict';

  var BASE_HEADER = 40;
  var FRAG_HEADER = 8;
  var MIN_LINK_MTU = 1280;
  var MAX_SIZE = 9000;
  var REASSEMBLY_TIMEOUT_S = 60;

  function calculate(packetSize, pathMtu, identification) {
    var size = Number(packetSize);
    var mtu = Number(pathMtu);
    if (!Number.isInteger(size) || size < BASE_HEADER || size > MAX_SIZE) {
      return { error: 'Packet size must be an integer from 40 to 9000 bytes.' };
    }
    if (!Number.isInteger(mtu) || mtu < MIN_LINK_MTU || mtu > MAX_SIZE) {
      return { error: 'Path MTU must be an integer from 1280 to 9000 bytes.' };
    }
    var fragmentable = size - BASE_HEADER;
    var maxData = Math.floor((mtu - BASE_HEADER - FRAG_HEADER) / 8) * 8;
    if (size <= mtu || fragmentable === 0) {
      return { fragmentable: fragmentable, maxData: maxData, fragments: [], noFragmentation: true };
    }
    if (maxData < 8) {
      return { error: 'The selected Path MTU leaves no room for fragment data.' };
    }
    var remaining = fragmentable;
    var start = 0;
    var id = Number.isInteger(identification) ? identification >>> 0 : 0;
    var fragments = [];
    while (remaining > 0) {
      var data = Math.min(maxData, remaining);
      var more = remaining > data;
      fragments.push({
        number: fragments.length + 1,
        data: data,
        total: BASE_HEADER + FRAG_HEADER + data,
        payloadLength: FRAG_HEADER + data,
        offsetBytes: start,
        offset: start / 8,
        endByte: start + data - 1,
        more: more ? 1 : 0,
        identification: id
      });
      remaining -= data;
      start += data;
    }
    return { fragmentable: fragmentable, maxData: maxData, fragments: fragments, noFragmentation: false };
  }

  /** Merge [start, end) intervals (end exclusive) into a sorted, non-overlapping list. */
  function mergeRanges(ranges) {
    var list = ranges.map(function (r) { return [r[0], r[1]]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var out = [];
    list.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push(r);
    });
    return out;
  }

  /** Byte gaps inside [0, limit) that the received ranges do not cover. */
  function gaps(merged, limit) {
    var out = [];
    var cursor = 0;
    merged.forEach(function (r) {
      if (r[0] > cursor) out.push([cursor, Math.min(r[0], limit)]);
      cursor = Math.max(cursor, r[1]);
    });
    if (cursor < limit) out.push([cursor, limit]);
    return out.filter(function (g) { return g[1] > g[0]; });
  }

  /**
   * Destination reassembly state machine for ONE original packet
   * (fragments are grouped by source, destination and Identification).
   * Placement is by Fragment Offset x 8, never by arrival order.
   */
  function createReassembly(calcResult, options) {
    var TIMEOUT = Math.max(1, Math.round(Number(options && options.timeout) || REASSEMBLY_TIMEOUT_S));
    var frags = calcResult.fragments || [];
    var st = {
      received: [],          // fragment numbers in arrival order (first copy only)
      duplicates: 0,
      arrivals: [],          // every arrival, including duplicates
      clock: 0,              // seconds since the first fragment arrived
      timeout: TIMEOUT,      // reassembly timer length (60 s by default, RFC 8200)
      status: 'waiting',     // waiting | partial | complete | timeout
      icmp: null,
      ranges: [],
      totalKnown: false,
      total: null
    };

    function byNumber(n) { return frags.filter(function (f) { return f.number === n; })[0]; }

    function recompute() {
      st.ranges = mergeRanges(st.received.map(function (n) {
        var f = byNumber(n);
        return [f.offsetBytes, f.offsetBytes + f.data];
      }));
      var last = st.received.map(byNumber).filter(function (f) { return f.more === 0; })[0];
      st.totalKnown = !!last;
      st.total = last ? last.offsetBytes + last.data : null;
      if (st.status === 'timeout') return;
      if (!st.received.length) st.status = 'waiting';
      else if (st.totalKnown && st.ranges.length === 1 && st.ranges[0][0] === 0 && st.ranges[0][1] === st.total) st.status = 'complete';
      else st.status = 'partial';
    }

    function receive(n) {
      var f = byNumber(n);
      if (!f) return { kind: 'unknown' };
      if (st.status === 'timeout') return { kind: 'late', fragment: f };
      st.arrivals.push(n);
      if (st.received.indexOf(n) !== -1) { st.duplicates++; return { kind: 'duplicate', fragment: f }; }
      st.received.push(n);
      recompute();
      return { kind: 'new', fragment: f };
    }

    function gapList() {
      if (!st.received.length) return [];
      var limit = st.totalKnown ? st.total : Math.max.apply(null, st.ranges.map(function (r) { return r[1]; }));
      return gaps(st.ranges, limit);
    }

    /** Move the reassembly clock forward. Discards an incomplete datagram at 60 s. */
    function advance(seconds) {
      if (st.status === 'complete' || st.status === 'timeout' || !st.received.length) return st;
      st.clock = Math.min(TIMEOUT, st.clock + seconds);
      if (st.clock >= TIMEOUT) {
        st.status = 'timeout';
        // RFC 8200 s4.5: ICMPv6 Time Exceeded (Type 3, Code 1) only if fragment with offset 0 arrived.
        st.icmp = st.received.indexOf(1) !== -1
          ? { type: 3, code: 1, sent: true, text: 'ICMPv6 Time Exceeded (Type 3, Code 1) is sent to the source because the first fragment (offset 0) had arrived.' }
          : { type: 3, code: 1, sent: false, text: 'No ICMPv6 Time Exceeded message is sent because the first fragment (offset 0) never arrived.' };
      }
      return st;
    }

    function reset() {
      st.received = []; st.duplicates = 0; st.arrivals = []; st.clock = 0; st.status = 'waiting';
      st.icmp = null; st.ranges = []; st.totalKnown = false; st.total = null;
    }

    return { state: st, receive: receive, advance: advance, reset: reset, gaps: gapList,
      timeout: TIMEOUT, receivedBytes: function () { return st.ranges.reduce(function (s, r) { return s + (r[1] - r[0]); }, 0); } };
  }

  function protocolName(n) { return ({ 6: 'TCP', 17: 'UDP', 58: 'ICMPv6' })[n] || 'Unknown'; }

  /** The IPv4 count for the same inputs, only used for the side-by-side comparison on the results page. */
  function ipv4Comparison(packetSize, mtu) {
    var h = 20;
    if (packetSize <= mtu) return { count: 1, pmax: null };
    var pmax = Math.floor((mtu - h) / 8) * 8;
    return { count: Math.ceil((packetSize - h) / pmax), pmax: pmax };
  }

  root.DCNIPv6Model = {
    calculate: calculate,
    mergeRanges: mergeRanges,
    gaps: gaps,
    createReassembly: createReassembly,
    protocolName: protocolName,
    ipv4Comparison: ipv4Comparison,
    REASSEMBLY_TIMEOUT_S: REASSEMBLY_TIMEOUT_S,
    BASE_HEADER: BASE_HEADER,
    FRAG_HEADER: FRAG_HEADER
  };
}(typeof window !== 'undefined' ? window : globalThis));
