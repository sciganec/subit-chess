import { Engine } from '../src/engine/index.mjs';
const fen = '1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20';
for (const d of [4,6,8,10]) {
  const e = new Engine();
  e.setFEN(fen);
  const r = e.search({ depth: d });
  console.log(JSON.stringify({d, score:r.score, best:r.uci, pv:r.pv?.slice(0,8), nodes:r.nodes, time:r.timeMs}));
}
