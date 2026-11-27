// SMP stress smoke (audit R-07/R-08). Bounded, no strength claim.
import { Engine } from '../src/engine/index.mjs';
import { createPool } from '../src/engine/smp.mjs';
import { moveToUci } from '../src/engine/core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const fens = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
];

for (const helpers of [1, 2]) {
  const e = new Engine();
  const pool = createPool(e, helpers, { ttBits: 16 });
  try {
    for (let i = 0; i < 12; i++) {
      const fen = fens[i % fens.length];
      e.setFEN(fen);
      const legal = new Set(e.pos.legalMoves().map(moveToUci));
      const r = e.search({ timeMs: 60, fixedTime: true });
      const mv = moveToUci(r.move);
      ok(legal.has(mv), `helpers=${helpers} i=${i}: legal move ${mv}`);
      ok(r.depth >= 1, `helpers=${helpers} i=${i}: depth>=1`);
    }
    // repeated stop/start pressure
    for (let i = 0; i < 10; i++) {
      e.setFEN(fens[0]);
      pool.start(fens[0], 10, 6);
      pool.stop();
      const r = e.search({ timeMs: 40, fixedTime: true });
      ok(r.depth >= 1, `helpers=${helpers} stop/start ${i}: depth>=1`);
    }
  } finally {
    pool.close();
  }
}

console.log(`smp_stress: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log('SMP_STRESS OK');
