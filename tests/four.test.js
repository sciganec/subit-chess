#!/usr/bin/env node
'use strict';
/* FOUR logic — exhaustive tests (SUBIT-CPU spec §20.1, §19.1). No dependencies. */
const assert = require('assert');
const F4 = require('../src/four/four.js');
const { N, F, T, B } = F4;

let passed = 0, failed = 0;
const fails = [];
function test(name, fn) {
  try { fn(); passed++; process.stdout.write('.'); }
  catch (e) { failed++; fails.push(name + ': ' + e.message); process.stdout.write('F'); }
}
const CELLS4 = [N, F, T, B];

// ---- F-001 encoding ---------------------------------------------------------
test('F-001 encoding matches spec codes N=00 F=01 T=10 B=11', () => {
  assert.deepStrictEqual([N, F, T, B], [0, 1, 2, 3]);
  assert.strictEqual(F4.mk(1, 0), T);
  assert.strictEqual(F4.mk(0, 1), F);
  assert.strictEqual(F4.mk(1, 1), B);
  assert.strictEqual(F4.mk(0, 0), N);
  for (const x of CELLS4) assert.strictEqual(F4.mk(F4.tOf(x), F4.fOf(x)), x);
});

// ---- F-002..F-008 truth tables against spec formulas -----------------------
const ref = {
  not:   x => [F4.fOf(x), F4.tOf(x)],
  and:   (x, y) => [F4.tOf(x) & F4.tOf(y), F4.fOf(x) | F4.fOf(y)],
  or:    (x, y) => [F4.tOf(x) | F4.tOf(y), F4.fOf(x) & F4.fOf(y)],
  sjoin: (x, y) => [F4.tOf(x) | F4.tOf(y), F4.fOf(x) | F4.fOf(y)],
  smeet: (x, y) => [F4.tOf(x) & F4.tOf(y), F4.fOf(x) & F4.fOf(y)],
  bxor:  (x, y) => [F4.tOf(x) ^ F4.tOf(y), F4.fOf(x) ^ F4.fOf(y)],
};
const toCode = ([t, f]) => F4.mk(t, f);
test('F-002 NOT is rail swap', () => {
  for (const x of CELLS4) assert.strictEqual(F4.not(x), toCode(ref.not(x)));
  assert.strictEqual(F4.not(T), F); assert.strictEqual(F4.not(B), B); assert.strictEqual(F4.not(N), N);
});
test('F-003 AND / OR / SJOIN / SMEET / BXOR follow spec §3.2–3.3 on all 16 pairs', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    assert.strictEqual(F4.and(x, y), toCode(ref.and(x, y)), 'AND');
    assert.strictEqual(F4.or(x, y), toCode(ref.or(x, y)), 'OR');
    assert.strictEqual(F4.sjoin(x, y), toCode(ref.sjoin(x, y)), 'SJOIN');
    assert.strictEqual(F4.smeet(x, y), toCode(ref.smeet(x, y)), 'SMEET');
    assert.strictEqual(F4.bxor(x, y), toCode(ref.bxor(x, y)), 'BXOR');
    assert.strictEqual(F4.nand(x, y), F4.not(F4.and(x, y)), 'NAND');
    assert.strictEqual(F4.nor(x, y), F4.not(F4.or(x, y)), 'NOR');
  }
});
test('spot values: T∧B=B, F∨T=B, SJOIN(F,T)=B, SMEET(F,T)=N', () => {
  assert.strictEqual(F4.and(T, B), B);
  assert.strictEqual(F4.sjoin(F, T), B);
  assert.strictEqual(F4.smeet(F, T), N);
  assert.strictEqual(F4.or(F, T), T);
  assert.strictEqual(F4.and(N, B), F); // truth: N has t=0 -> t-rail 0; f-rail: 0|1 = 1
});

// ---- algebraic laws, exhaustive on 4 values (LEAN-001..LEAN-006 style) -----
test('LEAN-002 NOT involution (exhaustive)', () => {
  for (const x of CELLS4) assert.strictEqual(F4.not(F4.not(x)), x);
});
test('LEAN-003/004 SJOIN, SMEET commutative (exhaustive)', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    assert.strictEqual(F4.sjoin(x, y), F4.sjoin(y, x));
    assert.strictEqual(F4.smeet(x, y), F4.smeet(y, x));
  }
});
test('LEAN-005/006 SJOIN, SMEET idempotent (exhaustive)', () => {
  for (const x of CELLS4) { assert.strictEqual(F4.sjoin(x, x), x); assert.strictEqual(F4.smeet(x, x), x); }
});
test('absorption laws (exhaustive)', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    assert.strictEqual(F4.sjoin(x, F4.smeet(x, y)), x);
    assert.strictEqual(F4.smeet(x, F4.sjoin(x, y)), x);
    assert.strictEqual(F4.or(x, F4.and(x, y)), x);
    assert.strictEqual(F4.and(x, F4.or(x, y)), x);
  }
});
test('De Morgan under NOT (exhaustive)', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    assert.strictEqual(F4.not(F4.and(x, y)), F4.or(F4.not(x), F4.not(y)));
    assert.strictEqual(F4.not(F4.or(x, y)), F4.and(F4.not(x), F4.not(y)));
  }
});

// ---- knowledge / truth order (spec §3.3) -----------------------------------
test('SJOIN is least upper bound and SMEET greatest lower bound in knowledge order', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    const j = F4.sjoin(x, y), m = F4.smeet(x, y);
    assert.ok(F4.leqK(x, j) && F4.leqK(y, j), 'join is upper bound');
    assert.ok(F4.leqK(m, x) && F4.leqK(m, y), 'meet is lower bound');
    for (const z of CELLS4) {
      if (F4.leqK(x, z) && F4.leqK(y, z)) assert.ok(F4.leqK(j, z), 'join least');
      if (F4.leqK(z, x) && F4.leqK(z, y)) assert.ok(F4.leqK(z, m), 'meet greatest');
    }
  }
});
test('spec §3.3 knowledge order: F and T incomparable; N least; B greatest', () => {
  assert.ok(!F4.leqK(F, T) && !F4.leqK(T, F));
  for (const x of CELLS4) { assert.ok(F4.leqK(N, x)); assert.ok(F4.leqK(x, B)); }
});
test('spec §3.3 truth order: F ≤t N,B ≤t T; N and B incomparable', () => {
  for (const x of CELLS4) { assert.ok(F4.leqT(F, x)); assert.ok(F4.leqT(x, T)); }
  assert.ok(!F4.leqT(N, B) && !F4.leqT(B, N));
});
test('AND is truth-meet and OR is truth-join (exhaustive)', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    const a = F4.and(x, y), o = F4.or(x, y);
    assert.ok(F4.leqT(a, x) && F4.leqT(a, y), 'AND lower bound (truth)');
    assert.ok(F4.leqT(x, o) && F4.leqT(y, o), 'OR upper bound (truth)');
    for (const z of CELLS4) {
      if (F4.leqT(z, x) && F4.leqT(z, y)) assert.ok(F4.leqT(z, a), 'AND greatest');
      if (F4.leqT(x, z) && F4.leqT(y, z)) assert.ok(F4.leqT(o, z), 'OR least');
    }
  }
});
test('NOT reverses truth order (exhaustive)', () => {
  for (const x of CELLS4) for (const y of CELLS4) {
    if (F4.leqT(x, y)) assert.ok(F4.leqT(F4.not(y), F4.not(x)));
  }
});

// ---- FOUR_WORD: exhaustive over all 65 536 words ---------------------------
test('F-010/011/012 word pack/unpack round-trip, exhaustive 4^8 = 65536', () => {
  let count = 0;
  for (let w = 0; w <= 0xFFFF; w++) {
    const cells = F4.wordUnpack(w);
    assert.strictEqual(F4.wordPack(cells), w);
    count++;
  }
  assert.strictEqual(count, 65536);
});
test('C0 is bits 15:14 and C7 is bits 1:0', () => {
  assert.strictEqual(F4.wordPack([T, N, N, N, N, N, N, N]), 0x8000);
  assert.strictEqual(F4.wordPack([N, N, N, N, N, N, N, B]), 0x0003);
});
test('word ops equal per-cell reference on all 65536 words (unary) and random pairs (binary)', () => {
  const cellwise = (w1, w2, op) => {
    const a = F4.wordUnpack(w1), b = w2 === undefined ? null : F4.wordUnpack(w2);
    const out = a.map((x, i) => op(x, b ? b[i] : undefined));
    return F4.wordPack(out);
  };
  for (let w = 0; w <= 0xFFFF; w++) {
    assert.strictEqual(F4.wNot(w), cellwise(w, undefined, F4.not), 'wNot ' + w);
  }
  let s = 12345;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  for (let k = 0; k < 200000; k++) {
    const a = rnd() & 0xFFFF, b = rnd() & 0xFFFF;
    assert.strictEqual(F4.wAnd(a, b), cellwise(a, b, F4.and), 'wAnd');
    assert.strictEqual(F4.wOr(a, b), cellwise(a, b, F4.or), 'wOr');
    assert.strictEqual(F4.wSJoin(a, b), cellwise(a, b, F4.sjoin), 'wSJoin');
    assert.strictEqual(F4.wSMeet(a, b), cellwise(a, b, F4.smeet), 'wSMeet');
    assert.strictEqual(F4.wBXor(a, b), cellwise(a, b, F4.bxor), 'wBXor');
    assert.strictEqual(F4.wNand(a, b), cellwise(a, b, F4.nand), 'wNand');
    assert.strictEqual(F4.wNor(a, b), cellwise(a, b, F4.nor), 'wNor');
  }
});
test('word involution and idempotence exhaustive', () => {
  for (let w = 0; w <= 0xFFFF; w++) {
    assert.strictEqual(F4.wNot(F4.wNot(w)), w);
    assert.strictEqual(F4.wSJoin(w, w), w);
    assert.strictEqual(F4.wSMeet(w, w), w);
  }
});

// ---- FILL / EQ (spec §7.3) -------------------------------------------------
test('FILL: T=0xAAAA, F=0x5555, every cell identical (spec F-009)', () => {
  assert.strictEqual(F4.wFill(T), 0xAAAA);
  assert.strictEqual(F4.wFill(F), 0x5555);
  assert.strictEqual(F4.wFill(N), 0x0000);
  assert.strictEqual(F4.wFill(B), 0xFFFF);
  for (const x of CELLS4) {
    const cells = F4.wordUnpack(F4.wFill(x));
    assert.ok(cells.every(c => c === x));
  }
});
test('EQ is exact word equality, not CMP: EQ(T-word, B-word) = F', () => {
  assert.strictEqual(F4.wEq(0xAAAA, 0xAAAA), 0xAAAA);
  assert.strictEqual(F4.wEq(0xAAAA, 0xFFFF), 0x5555);
});

// ---- gate masks (spec §13.3 / §15.4) ---------------------------------------
test('gate masks: T,T,T,T,T = 0x02AA and T,T,T,B,T = 0x02EA', () => {
  assert.strictEqual(F4.gatesMask([T, T, T, T, T]), 0x02AA);
  assert.strictEqual(F4.gatesMask([T, T, T, B, T]), 0x02EA);
});
test('commit rule: only all-T passes; N, F, B each block', () => {
  assert.strictEqual(F4.gatesAllTrue([T, T, T, T, T]), true);
  for (const bad of [N, F, B]) {
    assert.strictEqual(F4.gatesAllTrue([T, T, T, bad, T]), false, 'blocked by ' + F4.decode(bad));
  }
});

console.log('\n');
console.log('='.repeat(60));
console.log(`FOUR: ${passed} passed, ${failed} failed`);
if (fails.length) for (const f of fails) console.log('  • ' + f);
console.log('='.repeat(60));
process.exit(failed === 0 ? 0 : 1);
