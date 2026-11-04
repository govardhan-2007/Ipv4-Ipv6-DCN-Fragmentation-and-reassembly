'use strict';

const assert = require('assert');
const root = require('path').join(__dirname, '..');
require(root + '/js/fragmentation.js');
require(root + '/js/ipv6.js');
require(root + '/js/quiz.js');

const IPv6 = global.VLab.IPv6;
const Quiz = global.VLab.Quiz;
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS  ' + name);
}

test('4000-byte packet over 1500-byte MTU creates 3 fragments', function () {
  const result = IPv6.calculateFragments(4000, 1500, 0x12345678);
  assert.strictEqual(result.error, undefined);
  assert.deepStrictEqual(result.fragments.map(f => f.data), [1448, 1448, 1064]);
  assert.deepStrictEqual(result.fragments.map(f => f.total), [1496, 1496, 1112]);
  assert.deepStrictEqual(result.fragments.map(f => f.offset), [0, 181, 362]);
  assert.deepStrictEqual(result.fragments.map(f => f.more), [1, 1, 0]);
});

test('all fragments fit the MTU and non-final data is 8-byte aligned', function () {
  [1280, 1281, 1500, 2000, 9000].forEach(function (mtu) {
    const packetSize = Math.min(9000, mtu + 2737);
    const result = IPv6.calculateFragments(packetSize, mtu, 7);
    assert.strictEqual(result.error, undefined);
    result.fragments.forEach(function (fragment, index) {
      assert(fragment.total <= mtu, 'fragment exceeds Path MTU');
      if (index < result.fragments.length - 1) assert.strictEqual(fragment.data % 8, 0);
    });
  });
});

test('packet that fits within Path MTU is not fragmented', function () {
  const result = IPv6.calculateFragments(1000, 1500, 9);
  assert.strictEqual(result.noFragmentation, true);
  assert.deepStrictEqual(result.fragments, []);
});

test('40-byte IPv6 base-header-only packet needs no fragmentation', function () {
  const result = IPv6.calculateFragments(40, 1280, 9);
  assert.strictEqual(result.noFragmentation, true);
  assert.strictEqual(result.fragmentableBytes, 0);
});

test('invalid IPv6 packet smaller than base header is rejected', function () {
  const result = IPv6.calculateFragments(39, 1280, 9);
  assert(result.error);
});

test('all fragments share one 32-bit Identification value', function () {
  const id = 0x89abcdef;
  const result = IPv6.calculateFragments(4000, 1500, id);
  result.fragments.forEach(function (fragment) {
    assert.strictEqual(fragment.identification, id);
  });
});

test('quiz bank contains IPv6 questions and enough IPv4 questions for a balanced mixed attempt', function () {
  const counts = Quiz.getQuestionCounts();
  assert.strictEqual(counts.ipv6, 10);
  assert(counts.ipv4 >= 10);
});

console.log('\n' + passed + ' IPv6 tests passed, 0 failed.');
