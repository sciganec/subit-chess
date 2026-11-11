#!/usr/bin/env node
'use strict';
/* Grafting checks (SUBIT-∞ v6.14.0 §9, T-003, T-BANACH). */
const assert = require('assert');
const T = require('../src/subit/tree.js');
const G = require('../src/warp/grafting.js');
const W = require('../src/warp/boundary.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

/* deterministic random FULL finite tree: every internal node has 3 non-empty children */
let seed = 99991;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function randFull(depth) {
  if (depth === 0 || rnd() < 0.35) return { leaf: T.LABELS[Math.floor(rnd() * 4)] };
  return { children: [randFull(depth - 1), randFull(depth - 1), randFull(depth - 1)] };
}
const fulls = []; for (let i = 0; i < 60; i++) fulls.push(randFull(3));

/* first differing address, as r_F on code functions */
const rF = (f, g, D) => W.rF(f, g, D);

console.log('[T-003] exact contraction of grafting');
test('ρ_a(f) is a valid full tree (TC rules hold)', () => {
  for (const f of fulls.slice(0, 20)) assert.deepStrictEqual(T.checkTC(T.encode(G.graft(f, '01')), 6, 'full'), []);
});
test('r_F(ρf, ρg) = r_F(f, g) + 1 for all sampled pairs (so d_F halves)', () => {
  let pairs = 0;
  for (let i = 0; i < fulls.length; i++) for (let j = i + 1; j < fulls.length; j += 3) {
    const f = T.encode(fulls[i]), g = T.encode(fulls[j]);
    const r = rF(f, g, 6);
    const rg = rF(T.encode(G.graft(fulls[i], '10')), T.encode(G.graft(fulls[j], '10')), 7);
    if (r === null) assert.strictEqual(rg, null);
    else assert.strictEqual(rg, r + 1, `pair ${i},${j}`);
    pairs++;
  }
  assert.ok(pairs > 500, 'sample size ' + pairs);
});
test('ρ_a(f) = ρ_a(g) when f = g (distance 0)', () => {
  for (const f of fulls.slice(0, 10)) assert.strictEqual(rF(T.encode(G.graft(f, '11')), T.encode(G.graft(f, '11')), 6), null);
});

console.log('[T-BANACH] fixed point');
test('ρ_a^n(x) converges: d_F(ρ^n x, ρ^{n+1} x) = 2^{-n}', () => {
  const x = { leaf: '00' };
  for (let n = 0; n <= 5; n++) {
    const r = rF(T.encode(G.iterate(x, '01', n)), T.encode(G.iterate(x, '01', n + 1)), n + 3);
    assert.strictEqual(r, n, `n=${n}`);
  }
});
/* Digit convention: spec branches 1,2,3 are digits 0,1,2 in subit/tree.js, so the spec spine (1,1,1,…) is 0^∞ here. */
test('boundary of ρ^n(x) at depth M is {0^M} once n > M (∂p_a = {(1,1,1,…)} in spec digits)', () => {
  for (const M of [3, 5]) {
    const t = T.encode(G.iterate({ leaf: '00' }, '01', M + 2));
    assert.deepStrictEqual(W.boundaryAt(t, M), ['0'.repeat(M)]);
  }
});
test('two different starts share the fixed-point boundary at depth 4 (both {0^4})', () => {
  const n = 6;
  const a = T.encode(G.iterate({ leaf: '00' }, '01', n));
  const b = T.encode(G.iterate(fulls[0], '10', n));
  assert.deepStrictEqual(W.boundaryAt(a, 4), ['0000']);
  assert.deepStrictEqual(W.boundaryAt(b, 4), ['0000']);
});

console.log('');
console.log(`grafting: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
