import { Engine } from '../src/engine/index.mjs';
const cases = [
  ['g7','1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20',4],
  ['g5','2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40',4],
  ['g9d6','rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8',6],
];
for (const [name,fen,d] of cases) { const e=new Engine(); e.setFEN(fen); const r=e.search({depth:d}); console.log(JSON.stringify({name,d,score:Math.round(r.score*10)/10,best:r.uci})); }
