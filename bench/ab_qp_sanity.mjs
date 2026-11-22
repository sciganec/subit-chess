import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const cases = [
  ['g7','1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20'],
  ['g5','2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40'],
  ['g9','rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8'],
];
for (const [name,fen] of cases) {
  for (const qp of [true,false]) {
    const p = cloneParams(DEFAULT_PARAMS);
    p.search.see = { ...p.search.see, enabled:true, qsearchPrune: qp };
    const e = new Engine(p);
    e.setFEN(fen);
    const r = e.search({depth:4});
    console.log(JSON.stringify({name, qp, score:r.score, best:r.uci, pv:r.pv?.slice(0,5)}));
  }
}
