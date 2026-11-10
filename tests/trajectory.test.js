#!/usr/bin/env node
'use strict';
/* Trajectory classification (SUBIT-∞ v6.14.0 §3.1) on the 64-state S₀. */
const assert = require('assert');
const { classifyOrbit, tableMap } = require('../src/subit/trajectory.js');
let passed = 0, failed = 0; const fails = [];
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ✗ ' + name + ' — ' + e.message); } }

const id = Array.from({ length: 64 }, (_, i) => i);
test('identity: every point is FIXED (μ=0, λ=1)', () => {
  for (let x = 0; x < 64; x++) { const r = classifyOrbit(tableMap(id), x); assert.deepStrictEqual([r.class, r.mu, r.lambda], ['FIXED', 0, 1]); }
});
test('4-cycle on 0..3: PERIODIC with λ=4', () => {
  const t = id.slice(); t[0] = 1; t[1] = 2; t[2] = 3; t[3] = 0;
  const r = classifyOrbit(tableMap(t), 0);
  assert.deepStrictEqual([r.class, r.mu, r.lambda], ['PERIODIC', 0, 4]);
});
test('chain 0→1→2→2: TRANSIENT with μ=2, λ=1', () => {
  const t = id.slice(); t[0] = 1; t[1] = 2; t[2] = 2;
  const r = classifyOrbit(tableMap(t), 0);
  assert.deepStrictEqual([r.class, r.mu, r.lambda], ['TRANSIENT', 2, 1]);
});
test('random maps on 64 states: (μ, λ) agrees with brute-force orbit simulation', () => {
  let s = 99991;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  for (let k = 0; k < 2000; k++) {
    const t = Array.from({ length: 64 }, () => rnd() % 64);
    const f = tableMap(t);
    const x = rnd() % 64;
    const r = classifyOrbit(f, x);
    // brute force: record first visit times; cycle closes at first repeat
    const first = new Map(); let y = x, i = 0;
    while (!first.has(y)) { first.set(y, i); y = f(y); i++; }
    const bmu = first.get(y), blam = i - bmu;
    assert.strictEqual(r.mu, bmu, 'mu mismatch at k=' + k);
    assert.strictEqual(r.lambda, blam, 'lambda mismatch at k=' + k);
    const cls = bmu > 0 ? 'TRANSIENT' : (blam === 1 ? 'FIXED' : 'PERIODIC');
    assert.strictEqual(r.class, cls);
  }
});
test('invariant: f^(μ+λ)(x) = f^μ(x) and the orbit is inside its cycle', () => {
  let s = 4242;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  for (let k = 0; k < 500; k++) {
    const t = Array.from({ length: 64 }, () => rnd() % 64);
    const f = tableMap(t), x = rnd() % 64;
    const { mu, lambda } = classifyOrbit(f, x);
    const iter = (y, n) => { for (let j = 0; j < n; j++) y = f(y); return y; };
    assert.strictEqual(iter(x, mu + lambda), iter(x, mu));
  }
});
test('step limit returns UNRESOLVED instead of guessing', () => {
  const r = classifyOrbit(tableMap(id.map((v, i) => (i + 1) % 64)), 0, 3);
  assert.strictEqual(r.class, 'UNRESOLVED');
});

console.log('\n' + '='.repeat(60));
console.log(`trajectory: ${passed} passed, ${failed} failed`);
for (const f of fails) console.log('  • ' + f);
process.exit(failed ? 1 : 0);
