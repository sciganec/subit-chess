#!/usr/bin/env node
'use strict';
/* Tree∞ encoding checks (SUBIT-∞ v6.14.0 §8): TC-01..TC-05 and Enc/Dec (T-ENCDEC). */
const assert = require('assert');
const T = require('../src/subit/tree.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

const wordsUpTo = (n) => { const out = ['']; let frontier = ['']; for (let k = 0; k < n; k++) { const next = []; for (const u of frontier) for (const d of T.DIGITS) next.push(u + d); out.push(...next); frontier = next; } return out; };
const sameCode = (a, b, depth) => wordsUpTo(depth).every((u) => a(u) === b(u));
const objs = T.enumerate(1).filter((o) => o !== null);   // non-empty roots (TC-01), depth ≤ 1

console.log('[T-ENCDEC]');
test('Dec(Enc(T)) = T for all depth≤1 objects', () => {
  for (const o of objs) assert.deepStrictEqual(T.decode(T.encode(o), 4), o);
});
test('Enc(Dec(t)) = t for all depth≤1 codes (on words ≤ 4)', () => {
  for (const o of objs) {
    const t = T.encode(o);
    const back = T.encode(T.decode(t, 4));
    assert.ok(sameCode(t, back, 4));
  }
});
test('Enc of a depth-2 object round-trips', () => {
  const o = { children: [{ children: [{ leaf: '00' }, null, { leaf: '11' }] }, null, { leaf: '01' }] };
  assert.deepStrictEqual(T.decode(T.encode(o), 4), o);
});

console.log('[TC-01..TC-05]');
test('every encoded finite object passes partial checks (depth 4)', () => {
  for (const o of objs) assert.deepStrictEqual(T.checkTC(T.encode(o), 4, 'partial'), []);
});
test('TC-01: absent root is reported and cannot be encoded', () => {
  const t = () => T.ABSENT;
  assert.ok(T.checkTC(t, 2, 'partial').some((v) => v.rule === 'TC-01'));
  assert.throws(() => T.encode(null), /TC-01/);
});
test('TC-02: child of ABSENT must be ABSENT', () => {
  const t = (u) => (u === '' ? T.INTERNAL : u === '0' ? T.ABSENT : u === '00' ? T.leafState('01') : T.ABSENT);
  assert.ok(T.checkTC(t, 3, 'partial').some((v) => v.rule === 'TC-02' && v.word === '00'));
});
test('TC-03: child of LEAF must be ABSENT', () => {
  const t = (u) => (u === '' ? T.leafState('10') : u === '1' ? T.leafState('11') : T.ABSENT);
  assert.ok(T.checkTC(t, 2, 'partial').some((v) => v.rule === 'TC-03' && v.word === '1'));
});
test('TC-04: full mode rejects an absent child of INTERNAL; partial mode allows it', () => {
  const t = (u) => (u === '' ? T.INTERNAL : u === '0' ? T.ABSENT : T.INTERNAL);
  assert.ok(T.checkTC(t, 1, 'full').some((v) => v.rule === 'TC-04'));
  assert.deepStrictEqual(T.checkTC(t, 1, 'partial'), []);
});
test('full tree (INTERNAL to level k, leaves at k) passes full checks', () => {
  const t = T.fullTreeTo(2, (u) => (u.charCodeAt(0) % 2 ? '01' : '10'));
  assert.deepStrictEqual(T.checkTC(t, 4, 'full'), []);
});
test('full tree decodes to the expected top levels', () => {
  const t = T.fullTreeTo(2, () => '11');
  const d = T.decode(t, 3);
  assert.ok(d.children && d.children.length === 3);
  assert.deepStrictEqual(d.children[2].children[0], { leaf: '11' });
});
test('invalid state symbol is reported', () => {
  const t = (u) => (u === '' ? 'BOGUS' : T.ABSENT);
  assert.ok(T.checkTC(t, 1, 'partial').some((v) => v.rule === 'STATE'));
});

console.log('');
console.log(`tree: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
