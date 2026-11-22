import fs from 'node:fs';
import path from 'node:path';
import { Position, moveToUci } from '../src/engine/core.mjs';

function analyzeLog(file) {
  const text = fs.readFileSync(file,'utf8');
  const lines = text.split(/\r?\n/);
  let moves = [];
  let subitWhite = null;
  const scores = []; // {ply, score, pv, best}
  for (const line of lines) {
    const pm = line.match(/^\[(subit|sf)<\] position startpos(?: moves (.*))?$/);
    if (pm) {
      moves = pm[2] ? pm[2].trim().split(/\s+/) : [];
      if (subitWhite === null) {
        const sideToMoveIsWhite = moves.length % 2 === 0;
        subitWhite = (pm[1] === 'subit') ? sideToMoveIsWhite : !sideToMoveIsWhite;
      }
    }
    const sm = line.match(/^\[subit>\] info .*score cp (-?\d+).*pv (.*)$/);
    if (sm) scores.push({ ply: moves.length, score: +sm[1], pv: sm[2] });
  }
  // final status
  const pos = new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  let ok=true;
  for (const u of moves) { const mv = pos.legalMoves().find(x=>moveToUci(x)===u); if(!mv){ok=false;break;} pos.makeMove(mv); }
  const st = ok ? pos.status() : null;
  let result='*', reason='unfinished';
  if (st && st.over) { result = st.result==='white'?'1-0':st.result==='black'?'0-1':'1/2-1/2'; reason=st.reason||'over'; }
  else if (moves.length>=160) { result='1/2-1/2'; reason='maxplies'; }
  const subitScore = result==='1/2-1/2'?0.5: result==='*'?null : ((result==='1-0')===subitWhite?1:0);

  // find swings
  let swings=[];
  for (let i=1;i<scores.length;i++) {
    const prev=scores[i-1], cur=scores[i];
    const delta=cur.score-prev.score;
    if (delta <= -150) swings.push({from:prev,to:cur,delta});
  }
  const firstBig = swings[0] || null;
  const mateDrop = scores.find(s=>s.score<=-90000);
  let cls='unknown';
  if (subitScore!==0) cls = subitScore===1?'win':subitScore===0.5?'draw':'unfinished';
  else if (reason==='nomove') cls='nomove/terminal';
  else if (firstBig && firstBig.to.score <= -90000) cls='tactical->mate';
  else if (firstBig) cls='tactical/swing';
  else if (mateDrop) cls='mate-late';
  else cls='gradual/endgame';
  return { file:path.basename(file), subitWhite, plies:moves.length, result, reason, subitScore, cls, firstBig, matePly: mateDrop?.ply };
}

for (const dir of process.argv.slice(2)) {
  console.log(`\n## ${path.basename(dir)}`);
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.log')).sort()) {
    const r = analyzeLog(path.join(dir,f));
    if (r.subitScore !== 0) continue;
    console.log(JSON.stringify(r));
  }
}
