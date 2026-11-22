import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
const fen = 'rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8';
const e = new Engine();
e.setFEN(fen);
// fast eval
const fast = e.evaluation.fast(e.pos, 0);
console.log('fast', fast);
// structural eval
const svf = e.evaluation.svf(e.pos, 0);
console.log('E', svf.E, 'conf', svf.confidence, 'unc', svf.uncertainty);
// qsearch from root
e.setFEN(fen);
const qs = e.searcher.qsearch(e.pos, -100000, 100000, 0);
console.log('qsearch', qs);
// search at depths
for (const d of [1,2,3,4,5,6,7,8]) {
  e.setFEN(fen);
  const r = e.search({depth:d});
  console.log(JSON.stringify({d,score:r.score,best:r.uci,nodes:r.nodes}));
}
