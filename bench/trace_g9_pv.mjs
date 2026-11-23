import { Engine } from '../src/engine/index.mjs';
const fen = 'rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8';
for (const d of [4,6,8]) {
  const e = new Engine();
  e.setFEN(fen);
  const r = e.search({depth:d});
  console.log(JSON.stringify({d,score:r.score,best:r.uci,pv:r.pv,nodes:r.nodes}));
}
