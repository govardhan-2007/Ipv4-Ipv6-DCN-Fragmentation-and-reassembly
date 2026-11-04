'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../ipv6/js/model.js');
const calc = global.DCNIPv6Model.calculate;

test('Experiment 05: 4000 B packet over 1500 B Path MTU', () => {
  const r = calc(4000, 1500);
  assert.equal(r.fragmentable, 3960);
  assert.equal(r.maxData, 1448);
  assert.deepEqual(r.fragments.map(f => f.data), [1448, 1448, 1064]);
  assert.deepEqual(r.fragments.map(f => f.offset), [0, 181, 362]);
  assert.deepEqual(r.fragments.map(f => f.more), [1, 1, 0]);
  assert.deepEqual(r.fragments.map(f => f.total), [1496, 1496, 1112]);
  assert.ok(r.fragments.every(f => f.total <= 1500));
});

test('Experiment 05: packet fitting Path MTU is not fragmented', () => {
  const r = calc(1280, 1500);
  assert.equal(r.noFragmentation, true);
  assert.equal(r.fragments.length, 0);
});

test('Experiment 05: packet cannot be smaller than IPv6 base header', () => {
  assert.match(calc(39, 1500).error, /40 to 9000/);
});

test('Experiment 05: Path MTU cannot be below IPv6 minimum in this model', () => {
  assert.match(calc(4000, 1279).error, /1280 to 9000/);
});

test('Experiment 05: each non-final fragment data length is 8-byte aligned', () => {
  const r = calc(7891, 1400);
  assert.ok(r.fragments.slice(0, -1).every(f => f.data % 8 === 0));
  assert.equal(r.fragments.at(-1).more, 0);
  assert.equal(r.fragments.reduce((sum, f) => sum + f.data, 0), r.fragmentable);
});
