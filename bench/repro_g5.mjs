import { Engine } from '../src/engine/index.mjs';
const fen = '2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40';
for (const d of [4,6,8,10]) {
  const e = new Engine();
  e.setFEN(fen);
  const r = e.search({ depth: d });
  console.log(JSON.stringify({d, score:r.score, best:r.uci, pv:r.pv?.slice(0,8), nodes:r.nodes, time:r.timeMs}));
}
