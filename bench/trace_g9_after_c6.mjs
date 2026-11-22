import { Engine } from '../src/engine/index.mjs';
const fen = 'rnb1k2r/pp1pqppp/2P2n2/4N3/1b1QP3/2N5/PPP2PPP/R1B1KB1R b KQkq - 0 8'; // after d5c6
for (const d of [1,2,3,4,5]) {
  const e=new Engine(); e.setFEN(fen);
  const r=e.search({depth:d});
  console.log(JSON.stringify({d,score:r.score,best:r.uci,pv:r.pv}));
}
