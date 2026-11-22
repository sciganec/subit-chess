import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';

function diag(fen, label, maxD=6) {
  console.log(`\n=== ${label} ===`);
  console.log(fen);
  for (let d=1; d<=maxD; d++) {
    const e = new Engine();
    e.setFEN(fen);
    const r = e.search({ depth: d, timeMs: 5000 });
    console.log(`d${d}: best=${moveToUci(r.move)} score=${r.score} nodes=${r.nodes} pv=${(r.pv||[]).map(moveToUci).join(' ')}`);
  }
  // root move breakdown at depth 4 by searching each child
  console.log('root breakdown d4 (child search d3):');
  const e = new Engine(); e.setFEN(fen);
  const moves = e.pos.legalMoves();
  const rows = [];
  for (const m of moves) {
    const u = moveToUci(m);
    const child = new Engine(); child.setFEN(fen);
    const rec = child.pos.makeMove(m);
    let r;
    try { r = child.search({ depth: 3, timeMs: 3000 }); } catch(err) { r = { score: NaN, move:0, pv:[] }; }
    child.pos.unmakeMove(rec);
    const score = r ? -r.score : NaN;
    rows.push({ u, score, nodes: r?.nodes||0, pv: (r?.pv||[]).map(moveToUci).join(' ') });
  }
  rows.sort((a,b)=>b.score-a.score);
  for (const row of rows.slice(0,12)) console.log(`  ${row.u.padEnd(5)} ${String(row.score).padStart(10)} n=${row.nodes} pv=${row.pv}`);
}

diag('8/8/4k3/3p4/8/8/3R4/4K3 w - - 0 1', 'MISS Rxd5');
diag('4k3/8/8/3n4/8/8/6B1/4K3 w - - 0 1', 'MISS Bxd5');
