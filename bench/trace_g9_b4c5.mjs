import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
// after 1.d5c6 b4c5
const fen = 'rnb1k2r/pp1pqppp/5n2/2bPN3/3QP3/2N5/PPP2PPP/R1B1KB1R w KQkq - 1 9';
for (const d of [1,2,3,4,5]) {
  const e=new Engine(); e.setFEN(fen);
  const r=e.search({depth:d});
  console.log(JSON.stringify({d,score:r.score,best:r.uci,pv:r.pv}));
}
// search from root but see if b4c5 is in top moves at d4
const e2=new Engine();
e2.setFEN('rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8');
const r2=e2.search({depth:4});
console.log('root d4', r2.score, r2.uci, r2.pv);
