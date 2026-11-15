import { Position } from '../src/engine/core.mjs';

const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  // Steven Edwards' alternative perft position (CPW position 6)
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
  // en-passant pins / discovered checks (JVMerlino set)
  ['8/7p/p5pb/4k3/P1pPn3/8/P5PP/1rB2RK1 b - d3 0 28', [5, 117, 3293, 67197]],
  ['8/3K4/2p5/p2b2r1/5k2/8/8/1q6 b - - 1 67', [50, 279, 13310, 54703]],
  ['rnbqkb1r/ppppp1pp/7n/4Pp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', [31, 570, 17546]],
  ['r3k2r/8/8/8/3pPp2/8/8/R3K1RR b KQkq e3 0 1', [29, 829, 20501]],
];

let fail = 0;
for (const [fen, expected] of cases) {
  const pos = Position.fromFEN(fen);
  const line = [fen];
  for (let d = 1; d <= expected.length; d++) {
    const t0 = Date.now();
    const n = pos.perft(d);
    const dt = Date.now() - t0;
    const ok = n === expected[d - 1];
    if (!ok) fail++;
    line.push(`d${d}=${n}${ok ? ' OK' : ` FAIL(exp ${expected[d - 1]})`} [${dt}ms]`);
  }
  console.log(line.join('  '));
}

// incremental/full equivalence of state restoration
const p = Position.start();
const moves = p.legalMoves();
const fen0 = p.fen();
for (const m of moves) {
  const u = p.makeMove(m);
  p.unmakeMove(u);
  if (p.fen() !== fen0) { console.log('FAIL unmake', m); fail++; break; }
}

// hash consistency
const h0 = p.key;
for (const m of moves) { const u = p.makeMove(m); p.unmakeMove(u); }
if (p.key !== h0) { console.log('FAIL hash restore'); fail++; }

console.log(fail === 0 ? 'CORE OK' : `CORE FAILURES: ${fail}`);
process.exit(fail === 0 ? 0 : 1);