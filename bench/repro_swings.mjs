import fs from 'node:fs';
import path from 'node:path';
import { Position, moveToUci } from '../src/engine/core.mjs';
import { Engine } from '../src/engine/index.mjs';

const targets = [
  ['sf2200_mt200_1795320114199','game_2.log',59],
  ['sf2400_mt200_1795357539551','game_1.log',14],
  ['sf2400_mt200_1795357539551','game_3.log',30],
  ['sf2400_mt200_1795357539551','game_6.log',43],
  ['sf2400_mt200_1795357539551','game_9.log',14],
  ['sf2400_mt200_1795357539551','game_10.log',11],
];
for (const [dir,file,ply] of targets) {
  const text = fs.readFileSync(path.join('c:/Users/sciga/subit-chess/bench/matchlogs',dir,file),'utf8');
  const moves = [...text.matchAll(/\[(?:subit|sf)<\] position startpos(?: moves (.*))?$/gm)].pop()[1].trim().split(/\s+/);
  const pos = new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  for (let i=0;i<ply;i++) { const mv=pos.legalMoves().find(x=>moveToUci(x)===moves[i]); if(!mv) break; pos.makeMove(mv); }
  const fen = pos.fen();
  const res = [];
  for (const d of [4,6,8]) {
    const e = new Engine(); e.setFEN(fen);
    const r = e.search({ depth:d });
    res.push({d, score:r.score, best:r.uci, pv:r.pv?.slice(0,6)});
  }
  console.log(JSON.stringify({id:`${dir.includes('2200')?'2200':'2400'}/${file}@ply${ply}`, fen, res}));
}
