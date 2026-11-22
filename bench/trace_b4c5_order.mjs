import { Engine } from '../src/engine/index.mjs';
import { moveToUci } from '../src/engine/core.mjs';
const fen = 'rnb1k2r/pp1pqppp/2P2n2/4N3/1b1QP3/2N5/PPP2PPP/R1B1KB1R b KQkq - 0 8';
const e = new Engine();
e.setFEN(fen);
const pos = e.pos;
const moves = pos.generateMoves();
for (const m of moves) {
  const uci = moveToUci(m);
  if (uci === 'b4c5' || uci === 'b8c6') console.log('found', uci, 'flags', m.flags, 'score', m.score);
}
console.log('total moves', moves.length);
for (const d of [3,4]) {
  e.setFEN(fen);
  const r = e.search({depth:d});
  console.log(d, r.score, r.uci, r.pv);
}
