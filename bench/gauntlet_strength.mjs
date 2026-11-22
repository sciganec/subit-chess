import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';

const CASES = [
  { name:'mate1 scholar', fen:'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', expect:['h5f7'], depth:4 },
  { name:'mate1 backrank', fen:'6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', expect:['a1a8'], depth:4 },
  { name:'mate1 smothered', fen:'6rk/6pp/7N/8/8/8/8/7K w - - 0 1', expect:['h6f7'], depth:4 },
  { name:'take hanging queen', fen:'4k3/8/8/8/8/8/4q3/4K2R w - - 0 1', expect:['e1e2'], depth:4 },
  { name:'take hanging rook', fen:'4k3/8/8/3r4/8/8/8/4K2Q w - - 0 1', expect:['h1d5'], depth:4 },
  { name:'promote to queen', fen:'8/P6k/8/8/8/8/8/4K3 w - - 0 1', expect:['a7a8q'], depth:6 },
  { name:'avoid stalemate trap', fen:'k7/8/1K6/8/8/8/8/7R w - - 0 1', expect:null, depth:4 },
  { name:'horizon Qxh7 trap (SF2400 g7)', fen:'1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20', reject:['h3h7'], depth:6 },
  { name:'horizon g3g4 knight trap (SF2200 g5)', fen:'2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40', reject:['g3g4'], depth:6 },
  { name:'horizon b4c5 refutation (SF19 g9)', fen:'rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8', scoreBelow:50, depth:6 },
];
let pass=0, fail=0;
for (const c of CASES) {
  const e = new Engine(); e.setFEN(c.fen);
  const r = e.search({ depth: c.depth, timeMs: 3000 });
  const uci = r.move ? moveToUci(r.move) : 'none';
  const okExpect = !c.expect || c.expect.includes(uci);
  const okReject = !c.reject || !c.reject.includes(uci);
  const okScoreBelow = c.scoreBelow == null || r.score < c.scoreBelow;
  const okScoreAbove = c.scoreAbove == null || r.score > c.scoreAbove;
  const ok = okExpect && okReject && okScoreBelow && okScoreAbove;
  if (ok) pass++; else fail++;
  const expectStr = c.expect ? c.expect.join('|') : c.reject ? `!${c.reject.join('|')}` : c.scoreBelow != null ? `score<${c.scoreBelow}` : c.scoreAbove != null ? `score>${c.scoreAbove}` : '-';
  console.log(`${ok?'ok':'MISS'} ${c.name}: got=${uci} expect=${expectStr} score=${r.score} d=${r.depth}`);
}
console.log(`GAUNTLET ${pass}/${pass+fail} pass, ${fail} fail`);
if (fail) process.exitCode = 1;
