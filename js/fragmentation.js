/**
 * fragmentation.js
 * Core IPv4 fragmentation engine for the DCN Virtual Lab.
 *
 * Pure logic: no DOM access. Loadable in the browser (window.VLab.Fragmentation)
 * and in Node (module.exports) for tests.
 *
 * Nothing here is hardcoded: every fragment, offset, flag, length and
 * checksum is calculated from the input parameters.
 *
 * Assumption (shown to students in the UI and README):
 *   When the header length is 24 or 28 bytes, IP options are present.
 *   We assume every option is "copied", so every fragment keeps the same
 *   header length. (Real IPv4 copies only options whose copied-flag is set.)
 */
(function (root) {
  'use strict';

  var Checksum = (typeof module !== 'undefined' && module.exports)
    ? require('./checksum.js')
    : root.VLab.Checksum;

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------

  /** Limits taken from the lab specification (used by the UI sliders). */
  var LIMITS = {
    datagramSize: { min: 500, max: 6000 },
    mtu: { min: 128, max: 2000 },
    headerLengths: [20, 24, 28],
    ttl: { min: 2, max: 255 }
  };

  var DEFAULTS = {
    datagramSize: 4000,
    mtu: 1500,
    headerLength: 20,
    df: 0,
    ttl: 64,
    protocol: 17, // UDP
    tos: 0,
    sourceIp: '192.168.1.10',
    routerIp: '192.168.1.1',
    destinationIp: '10.0.0.20'
  };

  var PROTOCOL_NAMES = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' };

  var FRAGMENT_UNIT = 8; // Fragment Offset is counted in 8-byte units.

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function isInt(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  /** Random 16-bit Identification value (1 .. 65535). */
  function randomIdentification() {
    return 1 + Math.floor(Math.random() * 0xffff);
  }

  /**
   * Deterministic demo payload so reassembly can prove the rebuilt bytes
   * are identical to the original ones.
   * @param {number} length
   * @returns {number[]}
   */
  function generatePayload(length) {
    var payload = new Array(length);
    for (var i = 0; i < length; i++) {
      payload[i] = (i * 31 + 7) & 0xff;
    }
    return payload;
  }

  // ---------------------------------------------------------------------
  // Core formulas
  // ---------------------------------------------------------------------

  /**
   * Maximum payload a fragment can carry.
   *   Pmax = floor((MTU - H) / 8) * 8
   * Rounded DOWN to a multiple of 8 because the Fragment Offset field
   * counts in 8-byte units, so every non-final fragment must carry a
   * multiple of 8 bytes.
   * @param {number} mtu
   * @param {number} headerLength H in bytes
   * @returns {number}
   */
  function computeMaxFragmentPayload(mtu, headerLength) {
    return Math.floor((mtu - headerLength) / FRAGMENT_UNIT) * FRAGMENT_UNIT;
  }

  /**
   * Validate simulator inputs.
   * @param {Object} params {datagramSize, mtu, headerLength, df, [ttl]}
   * @param {Object} [options] {skipRangeLimits: true} ignores the UI slider ranges
   *                           (used by tests for edge cases); logical rules still apply.
   * @returns {{valid: boolean, errors: string[]}}
   */
  function validateInputs(params, options) {
    var errors = [];
    var opts = options || {};
    var p = params || {};
    var ttl = (p.ttl === undefined) ? DEFAULTS.ttl : p.ttl;

    if (!isInt(p.datagramSize)) errors.push('Datagram size must be a whole number of bytes.');
    if (!isInt(p.mtu)) errors.push('MTU must be a whole number of bytes.');
    if (LIMITS.headerLengths.indexOf(p.headerLength) === -1) {
      errors.push('IPv4 header length must be 20, 24 or 28 bytes.');
    }
    if (p.df !== 0 && p.df !== 1) errors.push('DF flag must be 0 or 1.');
    if (!isInt(ttl) || ttl < LIMITS.ttl.min || ttl > LIMITS.ttl.max) {
      errors.push('TTL must be between ' + LIMITS.ttl.min + ' and ' + LIMITS.ttl.max +
        ' (a TTL of 1 would expire at the router).');
    }
    if (errors.length) return { valid: false, errors: errors };

    if (!opts.skipRangeLimits) {
      if (p.datagramSize < LIMITS.datagramSize.min || p.datagramSize > LIMITS.datagramSize.max) {
        errors.push('Datagram size must be between ' + LIMITS.datagramSize.min + ' and ' +
          LIMITS.datagramSize.max + ' bytes.');
      }
      if (p.mtu < LIMITS.mtu.min || p.mtu > LIMITS.mtu.max) {
        errors.push('MTU must be between ' + LIMITS.mtu.min + ' and ' + LIMITS.mtu.max + ' bytes.');
      }
    }

    // Logical rules (always enforced)
    if (p.datagramSize <= p.headerLength) {
      errors.push('Datagram size must be larger than the header length (it needs a payload).');
    }
    if (p.datagramSize > 65535) {
      errors.push('IPv4 Total Length is a 16-bit field: the datagram cannot exceed 65535 bytes.');
    }
    if (p.mtu <= p.headerLength) {
      errors.push('MTU (' + p.mtu + ') must be larger than the IPv4 header length (' +
        p.headerLength + ').');
    } else if (p.datagramSize > p.mtu && computeMaxFragmentPayload(p.mtu, p.headerLength) < FRAGMENT_UNIT) {
      errors.push('MTU too small: a fragment must carry at least 8 bytes of payload.');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  // ---------------------------------------------------------------------
  // Packet / header construction
  // ---------------------------------------------------------------------

  /**
   * Build the raw IPv4 header bytes (without checksum applied) and return
   * them with the correctly computed checksum written in.
   * Field layout follows RFC 791.
   */
  function buildHeaderBytes(f) {
    var bytes = new Array(f.headerLength).fill(0);
    var ihlWords = f.headerLength / 4;

    bytes[0] = (4 << 4) | ihlWords;                 // Version (4) | IHL
    bytes[1] = f.tos & 0xff;                        // Type of Service
    bytes[2] = (f.totalLength >>> 8) & 0xff;        // Total Length (high)
    bytes[3] = f.totalLength & 0xff;                // Total Length (low)
    bytes[4] = (f.identification >>> 8) & 0xff;     // Identification (high)
    bytes[5] = f.identification & 0xff;             // Identification (low)

    // Flags (3 bits: reserved=0, DF, MF) followed by Fragment Offset (13 bits)
    var flagsAndOffset = (f.df << 14) | (f.mf << 13) | (f.fragmentOffset & 0x1fff);
    bytes[6] = (flagsAndOffset >>> 8) & 0xff;
    bytes[7] = flagsAndOffset & 0xff;

    bytes[8] = f.ttl & 0xff;                        // Time To Live
    bytes[9] = f.protocol & 0xff;                   // Protocol
    // bytes[10..11] = checksum, filled in below

    var src = Checksum.ipToBytes(f.sourceIp);
    var dst = Checksum.ipToBytes(f.destinationIp);
    for (var i = 0; i < 4; i++) {
      bytes[12 + i] = src[i];
      bytes[16 + i] = dst[i];
    }

    // Options area (only when header > 20 bytes): NOP padding ended by EOL.
    for (var j = 20; j < f.headerLength; j++) bytes[j] = 0x01; // NOP
    if (f.headerLength > 20) bytes[f.headerLength - 1] = 0x00; // End of Option List

    var checksum = Checksum.computeHeaderChecksum(bytes);
    return { bytes: Checksum.withChecksum(bytes, checksum), checksum: checksum };
  }

  /**
   * Build one complete IPv4 packet (header + payload slice).
   * @param {Object} f header field values plus byteOffset and payload array
   * @returns {Object} flattened packet record used by every other module
   */
  function buildPacket(f) {
    var payloadLength = f.payload.length;
    var totalLength = f.headerLength + payloadLength;
    var fragmentOffset = f.byteOffset / FRAGMENT_UNIT;

    var built = buildHeaderBytes({
      headerLength: f.headerLength,
      tos: f.tos,
      totalLength: totalLength,
      identification: f.identification,
      df: f.df,
      mf: f.mf,
      fragmentOffset: fragmentOffset,
      ttl: f.ttl,
      protocol: f.protocol,
      sourceIp: f.sourceIp,
      destinationIp: f.destinationIp
    });

    return {
      index: f.index,
      version: 4,
      headerLength: f.headerLength,          // bytes
      ihl: f.headerLength / 4,               // 32-bit words (what the IHL field stores)
      tos: f.tos,
      totalLength: totalLength,
      identification: f.identification,
      reserved: 0,
      df: f.df,
      mf: f.mf,
      fragmentOffset: fragmentOffset,        // 8-byte units (what the header stores)
      byteOffset: f.byteOffset,              // bytes (internal / display)
      payloadLength: payloadLength,
      payloadStart: f.byteOffset,            // first payload byte (original datagram index)
      payloadEnd: f.byteOffset + payloadLength - 1, // last payload byte (inclusive)
      ttl: f.ttl,
      protocol: f.protocol,
      protocolName: PROTOCOL_NAMES[f.protocol] || String(f.protocol),
      headerChecksum: built.checksum,
      sourceIp: f.sourceIp,
      destinationIp: f.destinationIp,
      headerBytes: built.bytes,
      payload: f.payload
    };
  }

  // ---------------------------------------------------------------------
  // ICMP "Fragmentation Needed and DF set" (RFC 792, Type 3 Code 4)
  // ---------------------------------------------------------------------

  /**
   * Build the ICMP message a router returns when it must drop a packet
   * because DF = 1 and the packet exceeds the next-hop MTU.
   * Layout: Type(1) Code(1) Checksum(2) Unused(2) NextHopMTU(2)
   *         + original IP header + first 8 bytes of the original payload.
   */
  function buildIcmpFragNeeded(original, nextHopMtu, routerIp) {
    var quoted = original.headerBytes.concat(original.payload.slice(0, 8));
    var bytes = [3, 4, 0, 0, 0, 0, (nextHopMtu >>> 8) & 0xff, nextHopMtu & 0xff].concat(quoted);
    var checksum = (~Checksum.onesComplementSum(bytes)) & 0xffff;
    bytes[2] = (checksum >>> 8) & 0xff;
    bytes[3] = checksum & 0xff;
    return {
      type: 3,
      code: 4,
      description: 'Destination Unreachable: Fragmentation Needed and DF set',
      nextHopMtu: nextHopMtu,
      checksum: checksum,
      fromIp: routerIp,
      toIp: original.sourceIp,
      quotedBytes: quoted.length,
      bytes: bytes
    };
  }

  // ---------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------

  /**
   * Run the full router-side process for one datagram.
   *
   * Result status:
   *   'invalid'            inputs rejected (see errors)
   *   'no-fragmentation'   datagram fits in the MTU, forwarded unchanged
   *   'dropped-df'         too big, DF = 1: dropped, ICMP Type 3 Code 4 returned
   *   'fragmented'         too big, DF = 0: split into fragments
   *
   * @param {Object} params {datagramSize, mtu, headerLength, df, [ttl, identification,
   *                         protocol, tos, sourceIp, routerIp, destinationIp]}
   * @param {Object} [options] passed to validateInputs
   * @returns {Object} full result (original datagram, packets leaving the router, workings)
   */
  function fragmentDatagram(params, options) {
    var p = params || {};
    var validation = validateInputs(p, options);
    if (!validation.valid) {
      return { status: 'invalid', errors: validation.errors, params: p, packets: [], fragments: [] };
    }

    var cfg = {
      datagramSize: p.datagramSize,
      mtu: p.mtu,
      headerLength: p.headerLength,
      df: p.df,
      ttl: (p.ttl === undefined) ? DEFAULTS.ttl : p.ttl,
      protocol: (p.protocol === undefined) ? DEFAULTS.protocol : p.protocol,
      tos: (p.tos === undefined) ? DEFAULTS.tos : p.tos,
      sourceIp: p.sourceIp || DEFAULTS.sourceIp,
      routerIp: p.routerIp || DEFAULTS.routerIp,
      destinationIp: p.destinationIp || DEFAULTS.destinationIp,
      identification: (p.identification === undefined) ? randomIdentification() : p.identification
    };

    var H = cfg.headerLength;
    var originalPayloadSize = cfg.datagramSize - H;          // Original Payload = D - H
    var pmax = computeMaxFragmentPayload(cfg.mtu, H);        // Pmax = floor((MTU-H)/8)*8
    var payload = generatePayload(originalPayloadSize);
    var needsFragmentation = cfg.datagramSize > cfg.mtu;

    // The datagram exactly as the source host sent it.
    var original = buildPacket({
      index: 0, headerLength: H, tos: cfg.tos, identification: cfg.identification,
      df: cfg.df, mf: 0, byteOffset: 0, ttl: cfg.ttl, protocol: cfg.protocol,
      sourceIp: cfg.sourceIp, destinationIp: cfg.destinationIp, payload: payload
    });

    var result = {
      status: null,
      errors: [],
      params: cfg,
      identification: cfg.identification,
      original: original,
      originalPayloadSize: originalPayloadSize,
      maxFragmentPayload: pmax,
      needsFragmentation: needsFragmentation,
      packets: [],      // packets that leave the router towards the destination
      fragments: [],    // same as packets when fragmented, otherwise empty
      icmp: null,
      workings: []
    };

    result.workings.push('Original payload = D - H = ' + cfg.datagramSize + ' - ' + H +
      ' = ' + originalPayloadSize + ' bytes');
    result.workings.push('Datagram size ' + cfg.datagramSize + ' vs MTU ' + cfg.mtu + ': ' +
      (needsFragmentation ? 'datagram is larger than the MTU' : 'datagram fits within the MTU'));

    // The router decrements TTL by 1 for anything it forwards. This changes the
    // header, so the header checksum is recomputed (done inside buildPacket).
    var forwardedTtl = cfg.ttl - 1;

    if (!needsFragmentation) {
      result.status = 'no-fragmentation';
      var forwarded = buildPacket({
        index: 1, headerLength: H, tos: cfg.tos, identification: cfg.identification,
        df: cfg.df, mf: 0, byteOffset: 0, ttl: forwardedTtl, protocol: cfg.protocol,
        sourceIp: cfg.sourceIp, destinationIp: cfg.destinationIp, payload: payload
      });
      result.packets = [forwarded];
      result.workings.push('No fragmentation required: packet forwarded unchanged (TTL ' +
        cfg.ttl + ' -> ' + forwardedTtl + ', checksum recomputed).');
      return result;
    }

    if (cfg.df === 1) {
      result.status = 'dropped-df';
      result.icmp = buildIcmpFragNeeded(original, cfg.mtu, cfg.routerIp);
      result.workings.push('DF = 1 and datagram > MTU: router must drop the packet.');
      result.workings.push('Router returns ICMP Type 3, Code 4 with Next-Hop MTU = ' + cfg.mtu + '.');
      return result;
    }

    // ---- Fragmentation (DF = 0) ----
    result.status = 'fragmented';
    result.workings.push('Pmax = floor((' + cfg.mtu + ' - ' + H + ') / 8) x 8 = ' + pmax + ' bytes');

    var byteOffset = 0;
    var index = 1;
    while (byteOffset < originalPayloadSize) {
      var remaining = originalPayloadSize - byteOffset;
      var fragmentPayloadSize = Math.min(pmax, remaining);          // min(Pmax, remaining)
      var isLast = (byteOffset + fragmentPayloadSize) === originalPayloadSize;

      var fragment = buildPacket({
        index: index,
        headerLength: H,
        tos: cfg.tos,
        identification: cfg.identification,      // same Identification for all fragments
        df: cfg.df,                              // DF = 0 here
        mf: isLast ? 0 : 1,                      // MF = 1 except on the final fragment
        byteOffset: byteOffset,                  // internal bytes -> header stores byteOffset / 8
        ttl: forwardedTtl,
        protocol: cfg.protocol,
        sourceIp: cfg.sourceIp,
        destinationIp: cfg.destinationIp,
        payload: payload.slice(byteOffset, byteOffset + fragmentPayloadSize)
      });

      result.fragments.push(fragment);
      result.workings.push('Fragment ' + index + ': payload = min(' + pmax + ', ' + remaining +
        ') = ' + fragmentPayloadSize + ', total length = ' + fragment.totalLength +
        ', offset = ' + byteOffset + ' / 8 = ' + fragment.fragmentOffset + ', MF = ' + fragment.mf);

      byteOffset += fragmentPayloadSize;
      index++;
    }
    result.packets = result.fragments.slice();

    // Statistics for the Results page
    var wireBytes = result.fragments.reduce(function (sum, fr) { return sum + fr.totalLength; }, 0);
    result.stats = {
      fragmentCount: result.fragments.length,
      totalBytesOnWire: wireBytes,
      extraHeaderBytes: wireBytes - cfg.datagramSize,   // (count - 1) x H
      overheadPercent: ((wireBytes - cfg.datagramSize) / cfg.datagramSize) * 100
    };
    return result;
  }

  // ---------------------------------------------------------------------
  // Self-verification
  // ---------------------------------------------------------------------

  /**
   * Check a fragmentation result against the IPv4 rules.
   * Used by the Results page ("verification" panel) and by the tests.
   * @param {Object} result value returned by fragmentDatagram()
   * @returns {{ok: boolean, checks: {name: string, pass: boolean, detail: string}[]}}
   */
  function verifyFragmentation(result) {
    var checks = [];
    function add(name, pass, detail) { checks.push({ name: name, pass: !!pass, detail: detail || '' }); }

    if (!result || result.status !== 'fragmented') {
      return { ok: false, checks: [{ name: 'Result is a fragmentation result', pass: false,
        detail: 'status = ' + (result && result.status) }] };
    }

    var frags = result.fragments;
    var H = result.params.headerLength;
    var mtu = result.params.mtu;

    var sum = frags.reduce(function (s, f) { return s + f.payloadLength; }, 0);
    add('Sum of fragment payloads equals original payload', sum === result.originalPayloadSize,
      sum + ' vs ' + result.originalPayloadSize);

    add('Every fragment Total Length <= MTU',
      frags.every(function (f) { return f.totalLength <= mtu; }), 'MTU = ' + mtu);

    add('Every non-final payload is a multiple of 8',
      frags.slice(0, -1).every(function (f) { return f.payloadLength % 8 === 0; }));

    var contiguous = true;
    var expected = 0;
    frags.forEach(function (f) {
      if (f.byteOffset !== expected || f.fragmentOffset * 8 !== f.byteOffset) contiguous = false;
      expected += f.payloadLength;
    });
    add('Offsets are contiguous and equal byte offset / 8', contiguous);

    add('MF = 1 on all fragments except the last (MF = 0)',
      frags.every(function (f, i) { return f.mf === (i === frags.length - 1 ? 0 : 1); }));

    add('All fragments share the same Identification',
      frags.every(function (f) { return f.identification === result.identification; }));

    add('All fragments use the same header length',
      frags.every(function (f) { return f.headerLength === H; }));

    add('Every fragment header checksum verifies',
      frags.every(function (f) { return Checksum.verifyHeaderChecksum(f.headerBytes); }));

    add('Every fragment has DF = 0 (fragmentation permitted)',
      frags.every(function (f) { return f.df === 0; }));

    return { ok: checks.every(function (c) { return c.pass; }), checks: checks };
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  var api = {
    LIMITS: LIMITS,
    DEFAULTS: DEFAULTS,
    FRAGMENT_UNIT: FRAGMENT_UNIT,
    computeMaxFragmentPayload: computeMaxFragmentPayload,
    validateInputs: validateInputs,
    generatePayload: generatePayload,
    buildPacket: buildPacket,
    fragmentDatagram: fragmentDatagram,
    verifyFragmentation: verifyFragmentation
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.VLab = root.VLab || {};
  root.VLab.Fragmentation = api;
})(typeof window !== 'undefined' ? window : globalThis);
