import fs from 'node:fs';
import { Position, moveToUci } from '../src/engine/core.mjs';
const log = process.argv[2];
const text = fs.readFileSync(log,'utf8');
const moves = [...text.matchAll(/\[(?:subit|sf)<\] position startpos(?: moves (.*))?$/gm)].pop()[1].trim().split(/\s+/);
const pos = new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
for (let i=0;i<moves.length;i++) {
  if (i>=36 && i<=44) console.log(i, moves[i], pos.fen());
  const mv = pos.legalMoves().find(x=>moveToUci(x)===moves[i]);
  if (!mv) { console.log('bad',i,moves[i]); break; }
  pos.makeMove(mv);
}
