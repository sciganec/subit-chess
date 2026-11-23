import fs from 'node:fs';
import path from 'node:path';
import { Position } from '../src/engine/core.mjs';

const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.log')).sort()) {
  const text = fs.readFileSync(path.join(dir,f),'utf8');
  const lines = text.split(/\r?\n/);
  let moves = [];
  let subitWhite = null;
  for (const line of lines) {
    const m = line.match(/^\[(subit|sf)<\] position startpos(?: moves (.*))?$/);
    if (m) {
      moves = m[2] ? m[2].trim().split(/\s+/) : [];
      if (subitWhite === null) {
        // first position command tells us who is moving after these moves
        const ply = moves.length;
        const sideToMoveIsWhite = ply % 2 === 0;
        subitWhite = (m[1] === 'subit') ? sideToMoveIsWhite : !sideToMoveIsWhite;
      }
    }
  }
  const pos = new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  let ok = true;
  for (const u of moves) {
    const mv = pos.legalMoves().find(x=>{const f=x&127,t=(x>>7)&127,pr=(x>>14)&7; const s=String.fromCharCode(97+(f&7))+(8-(f>>4))+String.fromCharCode(97+(t&7))+(8-(t>>4))+(pr?' pnbrqk'[pr]:''); return s===u;});
    if (!mv) { ok=false; break; }
    pos.makeMove(mv);
  }
  const st = ok ? pos.status() : null;
  let result='*', reason='unfinished';
  if (st && st.over) { result = st.result==='white'?'1-0':st.result==='black'?'0-1':'1/2-1/2'; reason=st.reason||'over'; }
  else if (moves.length>=160) { result='1/2-1/2'; reason='maxplies'; }
  const subitScore = result==='1/2-1/2'?0.5: result==='*'?null : ((result==='1-0')===subitWhite?1:0);
  console.log(JSON.stringify({file:f,subitWhite,plies:moves.length,result,reason,subitScore,ok}));
}
