import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';

const fen = 'rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8';

function trace(label, params) {
  const e = new Engine(params);
  e.setFEN(fen);
  const fast = e.evaluation.fast(e.pos);
  e.setFEN(fen);
  const s = e.evaluation.structural(e.pos);
  e.setFEN(fen);
  const qs = e.searcher.quiescence(e.pos, -100000, 100000, 0, 0);
  console.log(JSON.stringify({label, fast, structuralE:Math.round(s.E*10)/10, E0:Math.round(s.E0*10)/10, Ei:Math.round(s.Ei*10)/10, Ec:Math.round(s.Ec*10)/10, qsearch:Math.round(qs*10)/10}));
  for (const d of [1,2,3,4,5,6,7,8]) {
    e.setFEN(fen);
    const r = e.search({depth:d});
    console.log(JSON.stringify({label,d,score:Math.round(r.score*10)/10,best:r.uci,nodes:r.nodes,ttHits:e.searcher.tt.hits}));
  }
}

trace('default', cloneParams(DEFAULT_PARAMS));
const noQSPrune = cloneParams(DEFAULT_PARAMS); noQSPrune.search.see.qsearchPrune=false;
trace('no_qs_prune', noQSPrune);
