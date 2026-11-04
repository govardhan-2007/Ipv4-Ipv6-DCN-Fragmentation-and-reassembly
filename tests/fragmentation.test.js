/**
 * tests/fragmentation.test.js
 * Plain Node tests (no framework) for the DCN Virtual Lab logic.
 *
 * Run:  node tests/fragmentation.test.js
 * Prints PASS or FAIL for every test and exits with code 1 if anything fails.
 *
 * The expected values below are worked out by hand from the formulas in SPEC.md:
 *   Pmax = floor((MTU - H) / 8) * 8,  payload = D - H,  offset = byteOffset / 8
 * They are used only to CHECK the engine. The engine itself never hardcodes them.
 */
'use strict';

var path = require('path');
var Checksum = require(path.join(__dirname, '..', 'js', 'checksum.js'));
var Frag = require(path.join(__dirname, '..', 'js', 'fragmentation.js'));
var Reasm = require(path.join(__dirname, '..', 'js', 'reassembly.js'));

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS  ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL  ' + name + '\n        ' + err.message);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function eq(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) throw new Error((label ? label + ': ' : '') + 'expected ' + e + ' but got ' + a);
}

/** Run the engine with a fixed Identification so results are repeatable. */
function run(d, mtu, h, df, extra) {
  var p = { datagramSize: d, mtu: mtu, headerLength: h || 20, df: df || 0, identification: 4242 };
  if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
  // skipRangeLimits lets the edge-case tests go outside the UI slider ranges.
  return Frag.fragmentDatagram(p, { skipRangeLimits: true });
}

/** Rules every successful fragmentation must satisfy (used by many tests). */
function checkFragmentRules(r) {
  assert(r.status === 'fragmented', 'status should be fragmented, got ' + r.status);
  var f = r.fragments;
  var sum = f.reduce(function (s, x) { return s + x.payloadLength; }, 0);
  eq(sum, r.originalPayloadSize, 'sum of payloads equals original payload');
  f.slice(0, -1).forEach(function (x, i) {
    assert(x.payloadLength % 8 === 0, 'non-final fragment ' + (i + 1) + ' payload ' + x.payloadLength + ' is not a multiple of 8');
  });
  f.forEach(function (x, i) {
    assert(x.totalLength <= r.params.mtu, 'fragment ' + (i + 1) + ' total length ' + x.totalLength + ' exceeds MTU ' + r.params.mtu);
    eq(x.totalLength, x.payloadLength + r.params.headerLength, 'total length = payload + H (fragment ' + (i + 1) + ')');
  });
  var expected = 0;
  f.forEach(function (x, i) {
    eq(x.byteOffset, expected, 'byte offset of fragment ' + (i + 1));
    eq(x.fragmentOffset, expected / 8, 'fragment offset field of fragment ' + (i + 1));
    expected += x.payloadLength;
  });
  f.forEach(function (x, i) { eq(x.mf, i === f.length - 1 ? 0 : 1, 'MF of fragment ' + (i + 1)); });
  f.forEach(function (x) {
    eq(x.identification, r.identification, 'shared Identification');
    eq(x.sourceIp, r.params.sourceIp, 'shared source IP');
    eq(x.destinationIp, r.params.destinationIp, 'shared destination IP');
    eq(x.protocol, r.params.protocol, 'shared protocol');
    eq(x.ttl, f[0].ttl, 'shared TTL');
    assert(Checksum.verifyHeaderChecksum(x.headerBytes), 'checksum of fragment ' + x.index + ' does not verify');
  });
  assert(Frag.verifyFragmentation(r).ok, 'verifyFragmentation reported a failure');
}

// ---------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------
console.log('--- Checksum ---');

test('Checksum: known IPv4 header vector gives 0xB861', function () {
  // Widely used worked example: 45 00 00 73 00 00 40 00 40 11 [chk] c0 a8 00 01 c0 a8 00 c7
  var header = [0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0x00, 0x00,
    0xc0, 0xa8, 0x00, 0x01, 0xc0, 0xa8, 0x00, 0xc7];
  eq(Checksum.computeHeaderChecksum(header), 0xb861);
  assert(Checksum.verifyHeaderChecksum(Checksum.withChecksum(header, 0xb861)), 'valid header should verify');
});

test('Checksum: computing does not modify the input array', function () {
  var header = [0x45, 0, 0, 0x73, 0, 0, 0x40, 0, 0x40, 0x11, 0xAA, 0xBB, 192, 168, 0, 1, 192, 168, 0, 199];
  var copy = header.slice();
  Checksum.computeHeaderChecksum(header);
  eq(header, copy);
});

test('Checksum: tampering with any header byte makes verification fail', function () {
  var r = run(4000, 1500);
  r.fragments.forEach(function (f) {
    assert(Checksum.verifyHeaderChecksum(f.headerBytes), 'untouched header should verify');
    for (var i = 0; i < f.headerBytes.length; i++) {
      var bad = f.headerBytes.slice();
      bad[i] = (bad[i] ^ 0x01) & 0xff;               // flip one bit
      assert(!Checksum.verifyHeaderChecksum(bad), 'bit flip in byte ' + i + ' was not detected');
    }
  });
});

test('Checksum: each fragment has its own checksum (headers differ)', function () {
  var r = run(4000, 1500);
  var sums = r.fragments.map(function (f) { return f.headerChecksum; });
  assert(sums[0] !== sums[1] && sums[1] !== sums[2] && sums[0] !== sums[2], 'checksums should all differ: ' + sums.join(', '));
});

test('Checksum: TTL decrement by the router is reflected and checksum is recomputed', function () {
  var r = run(1000, 1500, 20, 0, { ttl: 64 });
  eq(r.original.ttl, 64);
  eq(r.packets[0].ttl, 63);
  assert(Checksum.verifyHeaderChecksum(r.packets[0].headerBytes), 'forwarded header must verify');
  assert(r.original.headerChecksum !== r.packets[0].headerChecksum, 'checksum must change when TTL changes');
});

// ---------------------------------------------------------------------
// Scenario 1: normal fragmentation
// ---------------------------------------------------------------------
console.log('--- Scenario 1: normal fragmentation (D=4000, MTU=1500, H=20, DF=0) ---');

test('S1: Pmax = 1480 and original payload = 3980', function () {
  var r = run(4000, 1500);
  eq(r.maxFragmentPayload, 1480);
  eq(r.originalPayloadSize, 3980);
});

test('S1: three fragments with payloads 1480 / 1480 / 1020', function () {
  var r = run(4000, 1500);
  eq(r.fragments.map(function (f) { return f.payloadLength; }), [1480, 1480, 1020]);
});

test('S1: offsets 0 / 185 / 370, MF 1 / 1 / 0, total lengths 1500 / 1500 / 1040', function () {
  var r = run(4000, 1500);
  eq(r.fragments.map(function (f) { return f.fragmentOffset; }), [0, 185, 370]);
  eq(r.fragments.map(function (f) { return f.mf; }), [1, 1, 0]);
  eq(r.fragments.map(function (f) { return f.totalLength; }), [1500, 1500, 1040]);
});

test('S1: all general fragmentation rules hold', function () { checkFragmentRules(run(4000, 1500)); });

test('S1: random Identification is a 16-bit value, shared by all fragments', function () {
  for (var i = 0; i < 50; i++) {
    var r = Frag.fragmentDatagram({ datagramSize: 4000, mtu: 1500, headerLength: 20, df: 0 });
    assert(r.identification >= 1 && r.identification <= 0xffff, 'Identification out of range: ' + r.identification);
    r.fragments.forEach(function (f) { eq(f.identification, r.identification); });
  }
});

test('S1: destination payload length = last offset x 8 + last payload', function () {
  var r = run(4000, 1500);
  var last = r.fragments[r.fragments.length - 1];
  eq(last.fragmentOffset * 8 + last.payloadLength, r.originalPayloadSize);
});

// ---------------------------------------------------------------------
// Scenario 2: no fragmentation
// ---------------------------------------------------------------------
console.log('--- Scenario 2: no fragmentation required (D=1000, MTU=1500) ---');

test('S2: status is no-fragmentation and packet is forwarded unchanged', function () {
  var r = run(1000, 1500);
  eq(r.status, 'no-fragmentation');
  eq(r.fragments.length, 0);
  eq(r.packets.length, 1);
  eq(r.packets[0].totalLength, 1000);
  eq(r.packets[0].mf, 0);
  eq(r.packets[0].fragmentOffset, 0);
  assert(Reasm.payloadsEqual(r.packets[0].payload, r.original.payload), 'payload must be identical');
});

// ---------------------------------------------------------------------
// Scenario 3: small MTU
// ---------------------------------------------------------------------
console.log('--- Scenario 3: small MTU (D=4000, MTU=600) ---');

test('S3: Pmax = 576, 7 fragments, last payload 524', function () {
  var r = run(4000, 600);
  eq(r.maxFragmentPayload, 576);
  eq(r.fragments.length, 7);
  eq(r.fragments[6].payloadLength, 524);
  eq(r.fragments[6].totalLength, 544);
});

test('S3: all general fragmentation rules hold', function () { checkFragmentRules(run(4000, 600)); });

// ---------------------------------------------------------------------
// Scenario 4: DF = 1
// ---------------------------------------------------------------------
console.log('--- Scenario 4: fragmentation prohibited (DF=1) ---');

test('S4: packet is dropped and ICMP Type 3 Code 4 is returned with Next-Hop MTU', function () {
  var r = run(4000, 1500, 20, 1);
  eq(r.status, 'dropped-df');
  eq(r.packets.length, 0);
  eq(r.fragments.length, 0);
  eq(r.icmp.type, 3);
  eq(r.icmp.code, 4);
  eq(r.icmp.nextHopMtu, 1500);
  eq(r.icmp.bytes[6] * 256 + r.icmp.bytes[7], 1500, 'Next-Hop MTU field in the ICMP bytes');
  assert(Checksum.onesComplementSum(r.icmp.bytes) === 0xffff, 'ICMP checksum must verify');
});

test('S4: DF = 1 with a datagram that fits is NOT dropped', function () {
  var r = run(1000, 1500, 20, 1);
  eq(r.status, 'no-fragmentation');
});

// ---------------------------------------------------------------------
// Scenario 5 and 6: reassembly
// ---------------------------------------------------------------------
console.log('--- Scenario 5 and 6, reassembly ---');

test('S5: missing middle fragment gives Partial status and the correct missing range', function () {
  var r = run(4000, 1500);
  var mid = Reasm.middleFragmentIndex(r.fragments.length);
  eq(mid, 2);
  var d = Reasm.simulateDelivery(r.fragments, { drop: [mid] });
  eq(d.status, Reasm.STATUS.PARTIAL);
  eq(d.snapshot.missingRanges.length, 1);
  eq(d.snapshot.missingRanges[0].start, 1480);
  eq(d.snapshot.missingRanges[0].endInclusive, 2959);
  eq(d.snapshot.missingRanges[0].length, 1480);
  eq(d.payload, null);
});

test('S5: after the timeout the partial datagram is discarded, ICMP Time Exceeded Code 1 sent', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { drop: [2], runUntilTimeout: true });
  eq(d.status, Reasm.STATUS.TIMED_OUT);
  var ev = d.events[d.events.length - 1];
  eq(ev.type, 'timeout');
  eq(ev.icmp.type, 11);
  eq(ev.icmp.code, 1);
});

test('S5: if fragment zero never arrived, no ICMP Time Exceeded is generated', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { drop: [1], runUntilTimeout: true });
  eq(d.status, Reasm.STATUS.TIMED_OUT);
  eq(d.events[d.events.length - 1].icmp, null);
});

test('S5: timer does not expire before the timeout (default 15 s)', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { drop: [2] });
  var events = d.reassembler.tick(14999);
  eq(events.length, 0);
  eq(d.reassembler.getSnapshots()[0].status, Reasm.STATUS.PARTIAL);
  events = d.reassembler.tick(15000);
  eq(events.length, 1);
});

test('S5: missing final fragment reports an open gap (end of datagram unknown)', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { drop: [3] });
  eq(d.status, Reasm.STATUS.PARTIAL);
  eq(d.snapshot.endKnown, false);
  var gap = d.snapshot.missingRanges[d.snapshot.missingRanges.length - 1];
  eq(gap.open, true);
  eq(gap.start, 2960);
});

test('S6: shuffled arrival order succeeds and rebuilds the identical payload', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { order: 'shuffle', seed: 7 });
  assert(d.arrivalOrder.join() !== '1,2,3', 'shuffle should differ from in-order, got ' + d.arrivalOrder.join());
  eq(d.status, Reasm.STATUS.COMPLETE);
  assert(Reasm.payloadsEqual(d.payload, r.original.payload), 'rebuilt payload differs');
  eq(d.snapshot.arrivedOutOfOrder, true);
});

test('Reassembly: in-order, reversed and shuffled all succeed (several sizes)', function () {
  [[4000, 1500, 20], [4000, 600, 20], [6000, 500, 28], [2000, 600, 24], [1501, 1500, 20]].forEach(function (c) {
    var r = run(c[0], c[1], c[2]);
    ['in-order', 'reverse', 'shuffle'].forEach(function (order) {
      var d = Reasm.simulateDelivery(r.fragments, { order: order, seed: 99 });
      eq(d.status, Reasm.STATUS.COMPLETE, 'status for ' + c.join('/') + ' ' + order);
      assert(Reasm.payloadsEqual(d.payload, r.original.payload), 'payload differs for ' + c.join('/') + ' ' + order);
    });
  });
});

test('Reassembly: every permutation of 4 fragments succeeds (arrival order never matters)', function () {
  var r = run(2500, 1000);                                   // payload 2480, Pmax 976 => 3 fragments
  r = run(3000, 1000);                                       // 4 fragments
  eq(r.fragments.length, 4);
  var perms = [];
  (function permute(arr, cur) {
    if (!arr.length) { perms.push(cur); return; }
    arr.forEach(function (v, i) { permute(arr.slice(0, i).concat(arr.slice(i + 1)), cur.concat(v)); });
  })([1, 2, 3, 4], []);
  eq(perms.length, 24);
  perms.forEach(function (order) {
    var d = Reasm.simulateDelivery(r.fragments, { order: order });
    eq(d.status, Reasm.STATUS.COMPLETE, 'order ' + order.join());
    assert(Reasm.payloadsEqual(d.payload, r.original.payload), 'payload differs for order ' + order.join());
  });
});

test('Reassembly: the rebuilt datagram has offset 0, MF 0, original total length, valid checksum', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { order: 'reverse' });
  var dg = d.snapshot.datagram;
  eq(dg.totalLength, 4000 - 0, 'total length');
  eq(dg.mf, 0);
  eq(dg.fragmentOffset, 0);
  eq(dg.identification, r.identification);
  assert(Checksum.verifyHeaderChecksum(dg.headerBytes), 'rebuilt header must verify');
});

test('Reassembly: duplicate fragment is ignored with a notice and still completes', function () {
  var r = run(4000, 1500);
  var d = Reasm.simulateDelivery(r.fragments, { duplicate: [1, 2] });
  eq(d.status, Reasm.STATUS.COMPLETE);
  assert(d.snapshot.duplicatesIgnored >= 1, 'duplicates should be counted');
  assert(Reasm.payloadsEqual(d.payload, r.original.payload), 'payload differs after duplicates');
  var dupEvents = d.events.filter(function (e) { return e.type === 'duplicate'; });
  assert(dupEvents.length >= 1, 'a duplicate event should be reported');
  assert(/uplicate|already/.test(dupEvents[0].reason), 'duplicate notice text missing');
});

test('Reassembly: duplicate does not double count received bytes', function () {
  var r = run(4000, 1500);
  var re = new Reasm.Reassembler();
  re.receive(r.fragments[0], 0);
  re.receive(r.fragments[0], 10);
  var snap = re.getSnapshots()[0];
  eq(snap.bytesReceived, 1480);
  eq(snap.duplicatesIgnored, 1);
  eq(snap.fragmentsReceived, 1);
});

test('Reassembly: a corrupted header (bad checksum) is rejected', function () {
  var r = run(4000, 1500);
  var bad = JSON.parse(JSON.stringify(r.fragments[0]));
  bad.headerBytes[8] = (bad.headerBytes[8] + 1) & 0xff;      // change TTL without fixing the checksum
  var ev = new Reasm.Reassembler().receive(bad, 0);
  eq(ev.type, 'rejected');
});

test('Reassembly: fragments of different datagrams (different Identification) are kept apart', function () {
  var a = run(4000, 1500, 20, 0, { identification: 111 });
  var b = run(4000, 1500, 20, 0, { identification: 222 });
  var re = new Reasm.Reassembler();
  re.receive(a.fragments[0], 0); re.receive(b.fragments[1], 1);
  re.receive(a.fragments[1], 2); re.receive(b.fragments[0], 3);
  re.receive(a.fragments[2], 4);
  var snaps = re.getSnapshots();
  eq(snaps.length, 2);
  var sa = snaps.filter(function (s) { return s.identification === 111; })[0];
  var sb = snaps.filter(function (s) { return s.identification === 222; })[0];
  eq(sa.status, Reasm.STATUS.COMPLETE);
  eq(sb.status, Reasm.STATUS.PARTIAL);
});

test('Reassembly: interval merging (adjacent, overlapping, and gaps)', function () {
  var r = Reasm.addRange([], 0, 10);
  r = Reasm.addRange(r, 20, 30);
  eq(r, [{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  r = Reasm.addRange(r, 10, 20);                              // touches both
  eq(r, [{ start: 0, end: 30 }]);
  r = Reasm.addRange(r, 5, 12);                               // fully inside
  eq(r, [{ start: 0, end: 30 }]);
  eq(Reasm.computeGaps([{ start: 0, end: 10 }, { start: 20, end: 30 }], 40).map(function (g) { return [g.start, g.end]; }),
    [[10, 20], [30, 40]]);
});

// ---------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------
console.log('--- Edge cases ---');

test('Edge: D = MTU needs no fragmentation', function () {
  var r = run(1500, 1500);
  eq(r.status, 'no-fragmentation');
});

test('Edge: D = MTU + 1 fragments into 1480 + 1 payload bytes', function () {
  var r = run(1501, 1500);
  checkFragmentRules(r);
  eq(r.fragments.map(function (f) { return f.payloadLength; }), [1480, 1]);
  eq(r.fragments[1].totalLength, 21);
  eq(r.fragments[1].fragmentOffset, 185);
});

test('Edge: MTU just above H (MTU = H + 8) gives 8-byte fragments', function () {
  var r = run(100, 28);
  eq(r.maxFragmentPayload, 8);
  eq(r.fragments.length, 10);
  checkFragmentRules(r);
  var d = Reasm.simulateDelivery(r.fragments, { order: 'reverse' });
  eq(d.status, Reasm.STATUS.COMPLETE);
});

test('Edge: MTU = H + 7 is rejected (Pmax < 8)', function () {
  var r = run(100, 27);
  eq(r.status, 'invalid');
  assert(r.errors.join(' ').indexOf('at least 8') !== -1, 'error should explain the 8-byte minimum: ' + r.errors.join(' | '));
});

test('Edge: MTU <= H is rejected', function () {
  eq(run(1000, 20).status, 'invalid');
  eq(run(1000, 10).status, 'invalid');
  eq(run(1000, 24, 24).status, 'invalid');
});

test('Edge: Pmax rounds DOWN to a multiple of 8 (MTU 1503, H 20 gives 1480)', function () {
  eq(Frag.computeMaxFragmentPayload(1503, 20), 1480);
  eq(Frag.computeMaxFragmentPayload(1499, 20), 1472);
});

test('Edge: H = 24 keeps header length in every fragment and passes all rules', function () {
  var r = run(4000, 1500, 24);
  eq(r.originalPayloadSize, 3976);
  eq(r.maxFragmentPayload, 1472);
  eq(r.fragments.map(function (f) { return f.payloadLength; }), [1472, 1472, 1032]);
  r.fragments.forEach(function (f) { eq(f.headerLength, 24); eq(f.headerBytes.length, 24); eq(f.ihl, 6); });
  checkFragmentRules(r);
});

test('Edge: H = 28 keeps header length in every fragment and passes all rules', function () {
  var r = run(4000, 1500, 28);
  eq(r.originalPayloadSize, 3972);
  eq(r.maxFragmentPayload, 1472);
  eq(r.fragments.map(function (f) { return f.payloadLength; }), [1472, 1472, 1028]);
  r.fragments.forEach(function (f) { eq(f.headerBytes.length, 28); eq(f.ihl, 7); });
  checkFragmentRules(r);
});

test('Edge: slider extremes in the UI ranges all work (D 500..6000, MTU 128..2000)', function () {
  [[500, 128], [6000, 128], [6000, 2000], [500, 2000], [6000, 1500]].forEach(function (c) {
    var r = Frag.fragmentDatagram({ datagramSize: c[0], mtu: c[1], headerLength: 20, df: 0, identification: 9 });
    if (c[0] > c[1]) {
      checkFragmentRules(r);
      var d = Reasm.simulateDelivery(r.fragments, { order: 'shuffle', seed: 3 });
      eq(d.status, Reasm.STATUS.COMPLETE, 'reassembly for ' + c.join('/'));
    } else {
      eq(r.status, 'no-fragmentation');
    }
  });
});

test('Edge: wide sweep of D, MTU and H keeps every rule true (property test)', function () {
  var count = 0;
  [20, 24, 28].forEach(function (h) {
    for (var mtu = 128; mtu <= 2000; mtu += 97) {
      for (var d = 500; d <= 6000; d += 331) {
        var r = run(d, mtu, h);
        if (d <= mtu) { eq(r.status, 'no-fragmentation'); continue; }
        checkFragmentRules(r);
        var dl = Reasm.simulateDelivery(r.fragments, { order: 'shuffle', seed: d + mtu });
        eq(dl.status, Reasm.STATUS.COMPLETE, 'reassembly D=' + d + ' MTU=' + mtu + ' H=' + h);
        assert(Reasm.payloadsEqual(dl.payload, r.original.payload), 'payload mismatch D=' + d + ' MTU=' + mtu + ' H=' + h);
        count++;
      }
    }
  });
  assert(count > 100, 'sweep should cover many cases, covered ' + count);
});

// ---------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------
console.log('--- Input validation ---');

test('Validation: UI ranges are enforced by default', function () {
  eq(Frag.fragmentDatagram({ datagramSize: 499, mtu: 1500, headerLength: 20, df: 0 }).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: 6001, mtu: 1500, headerLength: 20, df: 0 }).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: 4000, mtu: 127, headerLength: 20, df: 0 }).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: 4000, mtu: 2001, headerLength: 20, df: 0 }).status, 'invalid');
});

test('Validation: bad header length, bad DF and non-integers are rejected', function () {
  eq(run(4000, 1500, 21).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: 4000, mtu: 1500, headerLength: 20, df: 2 }).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: 4000.5, mtu: 1500, headerLength: 20, df: 0 }).status, 'invalid');
  eq(Frag.fragmentDatagram({ datagramSize: NaN, mtu: 1500, headerLength: 20, df: 0 }).status, 'invalid');
});

test('Validation: invalid input returns clear error messages', function () {
  var r = Frag.fragmentDatagram({ datagramSize: 4000, mtu: 20, headerLength: 20, df: 0 }, { skipRangeLimits: true });
  eq(r.status, 'invalid');
  assert(r.errors.length > 0 && /MTU/.test(r.errors[0]), 'error should mention MTU');
});

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------
console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
process.exit(failed === 0 ? 0 : 1);
