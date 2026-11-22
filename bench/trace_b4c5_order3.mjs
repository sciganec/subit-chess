import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';
const fen = 'rnb1k2r/pp1pqppp/2P2n2/4N3/1b1QP3/2N5/PPP2PPP/R1B1KB1R b KQkq - 0 8';
const e = new Engine();
e.setFEN(fen);
const pos = e.pos;
const moves = pos.generateMoves();
const n = e.searcher.order.scoreMoves(pos, moves, 1, 0, 0, {});
const arr = moves.slice(0,n);
for (let i=0;i<arr.length;i++) {
  let best=i; for(let j=i+1;j<arr.length;j++) if(arr[j].score>arr[best].score) best=j;
  [arr[i],arr[best]]=[arr[best],arr[i]];
}
for (let i=0;i<Math.min(10,arr.length);i++) console.log(i, moveToUci(arr[i]), arr[i].score);
const idx = arr.findIndex(m=>moveToUci(m)==='b4c5');
console.log('b4c5 index', idx, 'score', arr[idx].score);
