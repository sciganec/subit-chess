import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const fen = 'rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8';
for (const d of [4,5,6,7,8]) {
  const e = new Engine();
  e.setFEN(fen);
  const r = e.search({depth:d});
  console.log(JSON.stringify({d, score:Math.round(r.score*10)/10, best:r.uci, nodes:r.nodes, time:r.timeMs}));
}
