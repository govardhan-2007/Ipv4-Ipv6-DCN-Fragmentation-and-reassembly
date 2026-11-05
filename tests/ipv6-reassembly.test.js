'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
global.window = global;
require('../ipv6/js/model.js');
const M = global.DCNIPv6Model;

test('out-of-order arrival still completes', () => {
  const e = M.createReassembly(M.calculate(4000, 1500, 7));
  [3, 1, 2].forEach(n => e.receive(n));
  assert.equal(e.state.status, 'complete');
  assert.equal(e.receivedBytes(), 3960);
});
test('missing middle fragment stays incomplete and reports the gap', () => {
  const e = M.createReassembly(M.calculate(4000, 1500, 7));
  e.receive(1); e.receive(3);
  assert.equal(e.state.status, 'partial');
  assert.deepEqual(e.gaps(), [[1448, 2896]]);
});
test('duplicates are ignored', () => {
  const e = M.createReassembly(M.calculate(4000, 1500, 7));
  e.receive(1); const r = e.receive(1);
  assert.equal(r.kind, 'duplicate'); assert.equal(e.state.duplicates, 1); assert.equal(e.receivedBytes(), 1448);
});
test('60 s timeout discards; ICMPv6 Time Exceeded only if fragment 0 arrived', () => {
  let e = M.createReassembly(M.calculate(4000, 1500, 7));
  e.receive(1); e.advance(60);
  assert.equal(e.state.status, 'timeout'); assert.equal(e.state.icmp.sent, true);
  e = M.createReassembly(M.calculate(4000, 1500, 7));
  e.receive(3); e.advance(60);
  assert.equal(e.state.icmp.sent, false);
  assert.equal(e.receive(2).kind, 'late');
});
test('complete packet is not discarded by the clock', () => {
  const e = M.createReassembly(M.calculate(4000, 1500, 7));
  [1, 2, 3].forEach(n => e.receive(n)); e.advance(60);
  assert.equal(e.state.status, 'complete');
});
test('fragment invariants across many sizes', () => {
  for (let mtu = 1280; mtu <= 9000; mtu += 331) for (let size = mtu + 1; size <= 9000; size += 977) {
    const r = M.calculate(size, mtu, 1);
    assert.equal(r.fragments.reduce((s, f) => s + f.data, 0), size - 40);
    assert.ok(r.fragments.every(f => f.total <= mtu));
    assert.ok(r.fragments.slice(0, -1).every(f => f.data % 8 === 0));
  }
});
test('all IPv6 pages exist, have unique ids and valid local links', () => {
  const dir = path.join(__dirname, '..', 'ipv6');
  ['index', 'theory', 'setup', 'simulation', 'headers', 'reassembly', 'results', 'quiz', 'settings'].forEach(p => {
    const html = fs.readFileSync(path.join(dir, p + '.html'), 'utf8');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, p + ' has duplicate ids');
    [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].forEach(m => assert.ok(fs.existsSync(path.join(dir, m[1])), p + ' broken link ' + m[1]));
  });
});

test('reassembly timeout is configurable', () => {
  const e = M.createReassembly(M.calculate(4000, 1500, 7), { timeout: 20 });
  e.receive(1); e.advance(19); assert.equal(e.state.status, 'partial');
  e.advance(1); assert.equal(e.state.status, 'timeout'); assert.equal(e.timeout, 20);
});
test('every page shares the same navigation and links the settings page', () => {
  const dir = path.join(__dirname, '..', 'ipv6');
  const navOf = p => [...fs.readFileSync(path.join(dir, p + '.html'), 'utf8').matchAll(/class="nav-btn[^"]*" data-index="(\w+)" href="([^"]+)"/g)].map(m => m[1] + m[2]).join('|');
  const pages = ['index', 'theory', 'setup', 'simulation', 'headers', 'reassembly', 'results', 'quiz', 'settings'];
  const first = navOf(pages[0]);
  pages.forEach(p => assert.equal(navOf(p), first, p + ' nav differs'));
  assert.ok(first.includes('09settings.html'));
});
