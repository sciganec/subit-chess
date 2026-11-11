#!/usr/bin/env node
'use strict';
/* Unordered reconstruction (WARP v0.4 §12, T-020′): round trip, axioms FP-02..FP-05, injectivity on a sample. */
const assert = require('assert');
const F = require('../src/warp/fingerprint.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
/* random tree without unary nodes; root is internal; leaves carry no labels (ids come from DFS order) */
function randTree(depth, root = true) {
  if (!root && (depth === 0 || rnd() < 0.35)) return { leaf: 'x' };
  if (depth === 0) return { leaf: 'x' };
  const k = 2 + Math.floor(rnd() * 2);
  return { children: Array.from({ length: k }, () => randTree(depth - 1, false)) };
}
const sample = []; for (let i = 0; i < 300; i++) sample.push(randTree(3));

console.log('[T-020′] unordered reconstruction');
test('reconstruct(F(T)) equals T up to unordered, leaf-preserving isomorphism (300 trees)', () => {
  for (const T of sample) assert.strictEqual(F.reconstruct(F.fingerprint(T)), F.canonicalOf(T));
});
test('fingerprint axioms FP-02 (symmetry), FP-03, FP-04, FP-05 (ultrametric LCA) hold', () => {
  for (const T of sample.slice(0, 80)) {
    const fp = F.fingerprint(T), n = fp.L.length;
    for (let x = 0; x < n; x++) {
      assert.strictEqual(fp.a[x][x], fp.h[x], 'FP-04');
      for (let y = 0; y < n; y++) {
        assert.strictEqual(fp.a[x][y], fp.a[y][x], 'FP-02');
        if (x !== y) assert.ok(fp.a[x][y] < Math.min(fp.h[x], fp.h[y]), 'FP-03');
        for (let z = 0; z < n; z++) assert.ok(fp.a[x][z] >= Math.min(fp.a[x][y], fp.a[y][z]), 'FP-05');
      }
    }
  }
});
test('injectivity on the sample: equal fingerprints ⇔ equal unordered trees', () => {
  const fps = sample.map((T) => JSON.stringify(F.fingerprint(T)));
  const canons = sample.map((T) => F.canonicalOf(T));
  for (let i = 0; i < sample.length; i++) for (let j = i + 1; j < sample.length; j++) {
    assert.strictEqual(fps[i] === fps[j], canons[i] === canons[j], `pair ${i},${j}`);
  }
});

console.log('');
console.log(`fingerprint: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
