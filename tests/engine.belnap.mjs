// Belnap four-valued layer and the Ω trace classifier (SUBIT-∞ §1.4, §7; SPEC §7–8; CPU paper §6.3)
import { N, T, F, B, NAMES, join, consensus, and, or, not, combine, readDiff, evidenceFor, classifyTrace } from '../src/engine/belnap.mjs';
import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const V = [N, T, F, B];

// --- bilattice laws over all 4 and 16 and 64 combinations
for (const a of V) {
  ok(join(a, N) === a, `⊕ identity ${NAMES[a]}`);
  ok(join(a, B) === B, `⊕ absorbing B ${NAMES[a]}`);
  ok(join(a, a) === a, `⊕ idempotent ${NAMES[a]}`);
  ok(not(not(a)) === a, `¬¬ ${NAMES[a]}`);
  ok(and(a, T) === a && or(a, F) === a, `truth order bounds ${NAMES[a]}`);
  ok(consensus(a, B) === a && consensus(a, N) === N, `⊗ bounds ${NAMES[a]}`);
  for (const b of V) {
    ok(join(a, b) === join(b, a), '⊕ commutative');
    ok(and(a, b) === and(b, a) && or(a, b) === or(b, a), 'truth ∧∨ commutative');
    ok(not(and(a, b)) === or(not(a), not(b)), `De Morgan ${NAMES[a]} ${NAMES[b]}`);
    for (const c of V) {
      ok(join(join(a, b), c) === join(a, join(b, c)), '⊕ associative');
      ok(and(a, or(b, c)) === or(and(a, b), and(a, c)), 'distributive');
    }
  }
}
ok(join(T, F) === B, 'T ⊕ F = B (the CPU-paper example E1=T, E3=F)');
ok(not(T) === F && not(B) === B && not(N) === N, 'negation fixes N and B');
ok(combine([]) === N && combine([T, N, T]) === T && combine([T, F]) === B, 'combine');

// --- reading numbers
ok(readDiff(50, 30) === T && readDiff(-50, 30) === F && readDiff(10, 30) === N && readDiff(null, 30) === N, 'readDiff');
ok(readDiff(30, 30) === N && readDiff(-30, 30) === N, 'threshold is inclusive of N');

// --- evidenceFor: conflict is B, agreement is not, silence is N
let ev = evidenceFor({ material: 120, static: -80, shallow: 0, deep: 5 });
ok(ev.value === 'B' && ev.conflicting.join() === 'material,static', 'conflicting sources give B and name them');
ev = evidenceFor({ material: 100, static: 60, shallow: 40, deep: 90 });
ok(ev.value === 'T' && ev.conflicting.length === 0, 'agreeing sources give T');
ev = evidenceFor({ material: 0, static: 0, shallow: 0, deep: 0 });
ok(ev.value === 'N', 'no source decides gives N');
ev = evidenceFor({ deep: -100 });
ok(ev.value === 'F', 'a single source never gives B');

// --- Ω proxy (SPEC §7 thresholds)
ok(classifyTrace([20, 21, 20, 22, 21]).omega === 'STABLE', 'flat trace is STABLE');
ok(classifyTrace([0, 100, -100, 100, -100]).omega !== 'STABLE', 'swinging trace is not STABLE');
ok(classifyTrace([0, 80, 0, 80, 0, 80]).omega === 'CYCLIC', 'alternating trace is CYCLIC');
ok(classifyTrace([0, 300, 310, 700, 710, 1400]).omega === 'CHAOTIC', 'large irregular rises are CHAOTIC (var > 1500)');
ok(classifyTrace([0, 60, 120, 180, 240]).omega === 'METASTABLE', 'steady drift is METASTABLE');
ok(classifyTrace([5, 9]).omega === 'UNKNOWN', 'fewer than 3 scores is UNKNOWN');
const mate = classifyTrace([30, 40, 99999, 99999, 99999]);
ok(mate.variance < 1e6, 'mate scores are clipped before the variance');

// --- integration: explain reports both and still returns the move a plain search returns (INV-011)
const e = new Engine();
const fens = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',     // Qxf7# available
  '2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16'
];
for (const fen of fens) {
  e.setFEN(fen);
  const plain = e.search({ depth: 4, fixedTime: true });
  e.setFEN(fen);
  const d = e.explain({ depth: 4 });
  ok(d.move === moveToUci(plain.move), `explain chooses the plain-search move (${fen.slice(0, 12)})`);
  ok(['T', 'F', 'B', 'N'].includes(d.belnap.value), `belnap value present for ${fen.slice(0, 20)}`);
  ok(['STABLE', 'METASTABLE', 'CYCLIC', 'CHAOTIC', 'UNKNOWN'].includes(d.omega.omega), 'omega class present');
  ok(d.omega.n === 4, 'trace has one score per depth');
  ok(d.evidence.some((c) => /Belnap value/.test(c.text) && c.status === 'HEURISTIC'), 'Belnap claim is typed HEURISTIC, never EXACT');
  e.setFEN(fen);
  const again = e.search({ depth: 4, fixedTime: true });
  ok(again.move === plain.move, `explain does not change the move a plain search returns (${fen.slice(0, 12)})`);
}
// mate in one: the engine must see it and no source may contradict it
e.setFEN(fens[1]);
const m = e.explain({ depth: 3 });
ok(/Qxf7/.test(m.san), 'finds the mate in one');
ok(m.belnap.components.deep === 'T', 'a proven mate is T on the deep source');

console.log(`belnap: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('BELNAP OK');
