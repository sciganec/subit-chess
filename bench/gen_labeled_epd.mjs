import fs from 'node:fs';
import path from 'node:path';
import { playGame } from '../src/engine/learn.mjs';
import { DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Position } from '../src/engine/core.mjs';

const out = process.argv[2] || 'bench/fens/bootstrap_labeled.epd';
const games = Number(process.argv[3] || 30);
const depth = Number(process.argv[4] || 2);
const rows = [];
for (let i = 0; i < games; i++) {
  const g = playGame(DEFAULT_PARAMS, DEFAULT_PARAMS, { depth, seed: 1000 + i, maxPlies: 80, startPlies: 4 });
  // sample a few positions from the game line; label from white POV: 1/0.5/0
  const res = g.result === 1 ? 1 : g.result === -1 ? 0 : 0.5;
  const p = new Position().setFEN(g.startFen);
  const fens = [g.startFen];
  for (const uci of g.line) {
    try { const m = p.legalMoves().find(x => { const f=x&127,t=(x>>7)&127,pr=(x>>14)&7; const s=String.fromCharCode(97+(f&7))+(8-(f>>4))+String.fromCharCode(97+(t&7))+(8-(t>>4))+(pr?' pnbrqk'[pr]:''); return s===uci; }); if(!m) break; p.makeMove(m); fens.push(p.fen()); } catch { break; }
  }
  for (let k = 4; k < fens.length; k += 8) rows.push(`${fens[k]} c9 "${res===1?'1-0':res===0?'0-1':'1/2-1/2'}";`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, rows.join('\n') + '\n');
console.log(`wrote ${rows.length} labeled positions to ${out} from ${games} self-play games`);
