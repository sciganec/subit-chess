// Lazy SMP: shared TT validity, helper threads, and that the main search still decides
import { Engine } from '../src/engine/index.mjs';
import { TranspositionTable } from '../src/engine/search.mjs';
import { createPool } from '../src/engine/smp.mjs';
import { moveToUci } from '../src/engine/core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// shared table: a second view over the same buffers sees stores; a torn key is rejected
const a = new TranspositionTable(10, 0, true);
const b = new TranspositionTable(10, 0, true, a.buffers());
a.store(123456, 5, 42, 0, 77, 0);
const hit = b.probe(123456, 5, -1000, 1000, 0);
ok(hit && hit.score === 42 && hit.move === 77, 'shared TT: entry written by one view is read by the other');
a.generation = 3;
ok(b.generation === 3, 'shared TT: generation is shared');
a.keys[(123456 % a.size) | 0] = 0;
ok(b.probe(123456, 5, -1000, 1000, 0) === null, 'shared TT: an entry whose key is cleared (being rewritten) is not trusted');
const plain = new TranspositionTable(10);
ok(!plain.shared, 'default table is not shared');

// engine with helpers
const fens = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',     // Qxf7#
  '2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16'
];
const e = new Engine();
const pool = createPool(e, 2, { ttBits: 16 });
ok(pool.workers.length === 2 && e.pool === pool && e.tt.shared, 'pool attached with two helpers and a shared table');
for (const fen of fens) {
  e.setFEN(fen);
  const legal = e.pos.legalMoves().map(moveToUci);
  const r = e.search({ timeMs: 300, fixedTime: true });
  ok(legal.includes(moveToUci(r.move)), `helpers on: the move is legal (${fen.slice(0, 12)})`);
  ok(r.depth >= 1, 'helpers on: a real depth is reached');
}
e.setFEN(fens[1]);
const m = e.search({ timeMs: 300, fixedTime: true });
ok(/Qxf7|h5f7/.test(String(m.san || moveToUci(m.move))), 'helpers on: still finds the mate in one');
// repeated searches reuse helpers without leaking a stale stop
for (let i = 0; i < 5; i++) { e.setFEN(fens[0]); const r = e.search({ timeMs: 80, fixedTime: true }); ok(r.depth >= 2, `repeat ${i}: search not cut short by a stale stop flag`); }
e.reset();
ok(e.tt === pool.tt, 'reset keeps the shared table');
pool.close();

console.log(`smp: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('SMP OK');
