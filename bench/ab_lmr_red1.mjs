import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const cases = [
  ['g7','1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20',4],
  ['g5','2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40',4],
  ['g9d6','rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8',6],
];
function mk(name){
  const p=cloneParams(DEFAULT_PARAMS);
  if(name==='lmr_off') p.search.lmr.enabled=false;
  if(name==='red1') { p.search.lmr.extraReduction=0; p.search.lmr.maxReduction=1; }
  if(name==='red1_mmi4') { p.search.lmr.extraReduction=0; p.search.lmr.maxReduction=1; p.search.lmr.minMoveIndex=4; }
  return p;
}
for (const [name,fen,d] of cases) for (const m of ['base','lmr_off','red1','red1_mmi4']) {
  const e=new Engine(mk(m)); e.setFEN(fen); const r=e.search({depth:d});
  console.log(JSON.stringify({case:name,d,m,score:Math.round(r.score*10)/10,best:r.uci,nodes:r.nodes}));
}
