#!/usr/bin/env node
'use strict';
/* SUBIT-WARP boundary checks (SUBIT-∞ v6.14.0 §11): T-005 (dimension) and T-007 (2-Lipschitz boundary map), sampled. */
const assert = require('assert');
const T = require('../src/subit/tree.js');
const W = require('../src/warp/boundary.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

console.log('[T-005] boundary dimension');
test('box-counting dimension of Σ_3 with d_Σ = 2^{-ℓ} equals ln3/ln2 = ln b/α (α = ln 2)', () => {
  for (const n of [5, 10, 20]) assert.ok(Math.abs(W.sigmaBoxDim(3, n) - Math.log(3) / Math.log(2)) < 1e-12);
});

console.log('[validity of test trees]');
test('test trees satisfy TC-01..TC-05 (partial mode, depth 6)', () => {
  for (const seed of [1, 2, 3]) assert.deepStrictEqual(T.checkTC(W.validTree(seed, 0.6), 6, 'partial'), []);
});
test('test trees have nonempty boundary (always-0 spine) at every depth', () => {
  for (const seed of [1, 2, 3]) for (const M of [4, 6, 8]) assert.ok(W.boundaryAt(W.validTree(seed, 0.6), M).length >= 1);
});

console.log('[T-007] boundary map 2-Lipschitz (sampled)');
test('d_H(∂f, ∂g) ≤ 2·d_F(f, g) + 2^{-M} on 160 sampled pairs (M = D = 8)', () => {
  const M = 8, D = 8;
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) for (const k of [2, 3, 4, 5]) {
    const p1 = 0.65;
    const f = W.validTree(seed, p1);
    const g = W.validTree(seed, (len) => (len <= k ? p1 : 0.4));
    const dh = W.dHausdorff(W.boundaryAt(f, M), W.boundaryAt(g, M));
    const df = W.dF(f, g, D);
    assert.ok(dh <= 2 * df + Math.pow(2, -M) + 1e-12, `seed=${seed} k=${k}: dH=${dh} dF=${df}`);
    checked++;
  }
  assert.strictEqual(checked, 160);
});
test('ratio d_H/d_F reaches 2 in the sample (the constant in T-007 is attained)', () => {
  const M = 8, D = 8; let best = 0;
  for (let seed = 1; seed <= 40; seed++) for (const k of [2, 3, 4, 5]) {
    const p1 = 0.65; const f = W.validTree(seed, p1); const g = W.validTree(seed, (len) => (len <= k ? p1 : 0.4));
    const dh = W.dHausdorff(W.boundaryAt(f, M), W.boundaryAt(g, M)); const df = W.dF(f, g, D);
    if (df > 0) best = Math.max(best, dh / df);
  }
  assert.ok(best > 1.9 && best <= 2 + 1e-9, 'ratio ' + best);
});

console.log('');
console.log(`boundary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
