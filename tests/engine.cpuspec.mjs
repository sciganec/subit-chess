// SUBIT-CPU v0.1 conformance of the FOUR kernel (spec §2, §3.1, §16.1, §16.8): encoding, all 16 pairs, properties
import { N, F, T, B, join, consensus, and, or, not, bxor, nand, nor, wordGet, wordSet, planes, fromPlanes,
  wordNot, wordJoin, wordMeet, wordAnd, wordOr, wordBxor } from '../src/engine/belnap.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// §2.2 normative encoding
ok(N === 0b00 && F === 0b01 && T === 0b10 && B === 0b11, 'normative encoding N=00 F=01 T=10 B=11');

// reference semantics straight from the component formulas of §2.5, written on (t,f) pairs
const pair = (v) => [(v >> 1) & 1, v & 1];
const val = ([t, f]) => (t << 1) | f;
const ref = {
  not: ([t, f]) => [f, t],
  and: ([ta, fa], [tb, fb]) => [ta & tb, fa | fb],
  or: ([ta, fa], [tb, fb]) => [ta | tb, fa & fb],
  join: ([ta, fa], [tb, fb]) => [ta | tb, fa | fb],
  meet: ([ta, fa], [tb, fb]) => [ta & tb, fa & fb],
  bxor: ([ta, fa], [tb, fb]) => [ta ^ tb, fa ^ fb]
};
const V = [N, F, T, B];
for (const a of V) {
  ok(not(a) === val(ref.not(pair(a))), `NOT ${a}`);
  for (const b of V) {
    ok(and(a, b) === val(ref.and(pair(a), pair(b))), `AND ${a} ${b}`);
    ok(or(a, b) === val(ref.or(pair(a), pair(b))), `OR ${a} ${b}`);
    ok(join(a, b) === val(ref.join(pair(a), pair(b))), `SJOIN ${a} ${b}`);
    ok(consensus(a, b) === val(ref.meet(pair(a), pair(b))), `SMEET ${a} ${b}`);
    ok(bxor(a, b) === val(ref.bxor(pair(a), pair(b))), `BXOR ${a} ${b}`);
    ok(nand(a, b) === not(and(a, b)) && nor(a, b) === not(or(a, b)), `NAND/NOR ${a} ${b}`);
  }
}

// §16.1 listed vectors
ok(not(N) === N && not(F) === T && not(T) === F && not(B) === B, '§16.1 NOT');
ok(join(T, F) === B && join(N, T) === T && join(N, F) === F && join(B, N) === B, '§16.1 SJOIN');
ok(consensus(T, F) === N && consensus(B, T) === T && consensus(B, F) === F && consensus(B, N) === N, '§16.1 SMEET');

// §16.8 properties, including associativity and the distributive laws of both lattices
for (const a of V) {
  ok(join(a, a) === a && consensus(a, a) === a, `idempotent ${a}`);
  ok(join(a, N) === a && consensus(a, B) === a, `identity ${a}`);
  ok(not(not(a)) === a, `involution ${a}`);
  for (const b of V) {
    ok(join(a, b) === join(b, a) && consensus(a, b) === consensus(b, a), 'commutative');
    ok(join(a, consensus(a, b)) === a && consensus(a, join(a, b)) === a, 'absorption');
    for (const c of V) {
      ok(join(join(a, b), c) === join(a, join(b, c)) && consensus(consensus(a, b), c) === consensus(a, consensus(b, c)), 'associative');
      ok(join(a, consensus(b, c)) === consensus(join(a, b), join(a, c)), 'knowledge distributive');
      ok(and(a, or(b, c)) === or(and(a, b), and(a, c)), 'truth distributive');
    }
  }
}

// §3.1 FOUR_WORD: eight cells, two planes; every word operation equals the per-cell operation
let seed = 20261124;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
const cellwise = (a, b, op) => { let w = 0; for (let i = 0; i < 8; i++) w = wordSet(w, i, op(wordGet(a, i), wordGet(b, i))); return w; };
for (let k = 0; k < 2000; k++) {
  const a = rnd() & 0xffff, b = rnd() & 0xffff;
  const pa = planes(a);
  ok(fromPlanes(pa.t, pa.f) === a, 'planes round trip');
  ok(wordJoin(a, b) === cellwise(a, b, join) && wordMeet(a, b) === cellwise(a, b, consensus), 'word SJOIN/SMEET = per cell');
  ok(wordAnd(a, b) === cellwise(a, b, and) && wordOr(a, b) === cellwise(a, b, or), 'word AND/OR = per cell');
  ok(wordBxor(a, b) === cellwise(a, b, bxor), 'word BXOR = per cell');
  ok(wordNot(a) === cellwise(a, 0, (x) => not(x)), 'word NOT = per cell');
  ok(wordNot(wordNot(a)) === a, 'word NOT involution');
}
ok(wordGet(wordSet(0, 3, T), 3) === T && wordGet(wordSet(0xffff, 3, N), 3) === N && wordGet(wordSet(0, 3, T), 2) === N, 'wordSet / wordGet');

console.log(`cpuspec: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('CPUSPEC OK');
