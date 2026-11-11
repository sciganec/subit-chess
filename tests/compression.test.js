#!/usr/bin/env node
'use strict';
/* Finite compressions and reconstruction (SUBIT-∞ v6.14.0 §13): T-013, T-015, compression error, T-021′ (shape). */
const assert = require('assert');
const C = require('../src/warp/compression.js');
const S = require('../src/warp/spectrum.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

console.log('[T-013] matrix elements of T_q^(n)');
test('off-diagonal b^{-n} q^ℓ and diagonal b^{-n} q^n c_q', () => {
  for (const b of [2, 3, 4]) for (const q of [0.3, 0.7]) for (const n of [1, 2]) {
    const { n: size, A } = C.compressionMatrix(b, q, n);
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
      const want = i === j ? Math.pow(b, -n) * Math.pow(q, n) * S.cq(b, q) : Math.pow(b, -n) * Math.pow(q, S.commonPrefix(i, j, b, n));
      assert.ok(Math.abs(A[i * size + j] - want) < 1e-14, `b=${b} q=${q} n=${n} (${i},${j})`);
    }
  }
});

console.log('[T-015] finite trace');
test('Tr(T_q^(n)) = q^n c_q', () => {
  for (const b of [2, 3, 4]) for (const q of [0.3, 0.7, 0.9]) for (const n of [1, 2, 3]) {
    const { n: size, A } = C.compressionMatrix(b, q, n);
    let tr = 0; for (let i = 0; i < size; i++) tr += A[i * size + i];
    assert.ok(Math.abs(tr - Math.pow(q, n) * S.cq(b, q)) < 1e-13, `b=${b} q=${q} n=${n}`);
  }
});

console.log('[§13.1] compression error');
test('‖T_q − P_n T_q P_n‖ = (1−q)q^n/(b^n(b−q)) on the depth-(n+2) model', () => {
  for (const b of [2, 3]) for (const q of [0.3, 0.7]) for (const n of [1, 2]) {
    const e = C.compressionError(b, q, n, n + 2), p = C.compressionErrorPredicted(b, q, n);
    assert.ok(Math.abs(e - p) < 1e-10, `b=${b} q=${q} n=${n}: ${e} vs ${p}`);
  }
});
test('error formula equals (1−q)q^n/(b^n(b−q)) in closed form', () => {
  for (const b of [2, 3]) for (const q of [0.3, 0.7]) for (const n of [1, 2, 5]) {
    assert.ok(Math.abs(C.compressionErrorPredicted(b, q, n) - (1 - q) * Math.pow(q, n) / (Math.pow(b, n) * (b - q))) < 1e-14);
  }
});

console.log('[T-021′] ordered reconstruction from prefix-free addresses');
test('address set → tree → address set is the identity', () => {
  const cases = [['0', '10', '11', '12'], ['00', '01', '02', '1', '20', '21'], ['0', '1', '2']];
  for (const addrs of cases) {
    const tree = C.treeFromAddresses(addrs);
    assert.deepStrictEqual(C.addressesOf(tree).slice().sort(), addrs.slice().sort());
  }
});
test('non-prefix-free address sets are rejected (leaves must not contain each other)', () => {
  assert.throws(() => C.treeFromAddresses(['0', '01']), /not prefix-free/);
});

console.log('');
console.log(`compression: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
