import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';
const fen = 'rnb1k2r/pp1pqppp/2P2n2/4N3/1b1QP3/2N5/PPP2PPP/R1B1KB1R b KQkq - 0 8';
const e = new Engine();
e.setFEN(fen);
const pos = e.pos;
const moves = pos.generateMoves();
const order = e.searcher.order;
const n = order.scoreMoves(pos, moves, 1, 0, 0, {});
// moves are scored in-place? scoreMoves returns count; ordering usually by pick best
// simulate pick order
const scored = [];
const arr = moves.slice(0,n);
for (let i=0;i<arr.length;i++) {
  let best=i; for(let j=i+1;j<arr.length;j++) if(arr[j].score>arr[best].score) best=j;
  [arr[i],arr[best]]=[arr[best],arr[i]];
  const m=arr[i];
  scored.push({i, uci:moveToUci(m), score:m.score, flags:m.flags, capture:!!(m.flags&0x4||m.captured), promo:m.promo});
}
console.log(scored.filter(x=>x.uci==='b4c5'||x.uci==='b8c6'||x.i<12));
