import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { Position } from '../src/engine/core.mjs';

function spawnUci(cmd, args = [], opts = {}) {
  const p = spawn(cmd, args, { stdio: ['pipe','pipe','pipe'], windowsHide: true });
  const rl = readline.createInterface({ input: p.stdout });
  const waiters = [];
  rl.on('line', (line) => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(line)) { const w = waiters.splice(i,1)[0]; w.resolve(line); }
    }
    if (opts.log) fs.appendFileSync(opts.log, `[${opts.name}>] ${line}\n`);
  });
  p.stderr.on('data', d => { if (opts.log) fs.appendFileSync(opts.log, `[${opts.name}! ] ${d}`); });
  const send = (s) => { if (opts.log) fs.appendFileSync(opts.log, `[${opts.name}<] ${s}\n`); p.stdin.write(s + '\n'); };
  const waitFor = (pred, timeout=15000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting from ${opts.name}`)), timeout);
    waiters.push({ pred: (l)=>{ if(pred(l)){ clearTimeout(t); return true;} return false; }, resolve });
  });
  const waitBestmove = async (timeout=60000) => {
    let info = '';
    const line = await waitFor(l => { if (l.startsWith('info ')) info = l; return l.startsWith('bestmove '); }, timeout);
    const m = line.split(/\s+/)[1];
    return { move: m, info, line };
  };
  return { p, send, waitFor, waitBestmove, close: () => { try{send('quit');}catch{} try{p.kill();}catch{} } };
}

async function initEngine(e, uciOpts = []) {
  e.send('uci');
  await e.waitFor(l => l === 'uciok', 20000);
  for (const [k,v] of uciOpts) e.send(`setoption name ${k} value ${v}`);
  e.send('isready');
  await e.waitFor(l => l === 'readyok', 20000);
}

async function playGame(white, black, { movetime=200, whiteMovetime, blackMovetime, maxPlies=200 } = {}) {
  white.send('ucinewgame'); black.send('ucinewgame');
  white.send('isready'); await white.waitFor(l=>l==='readyok');
  black.send('isready'); await black.waitFor(l=>l==='readyok');
  const moves = [];
  for (let ply=0; ply<maxPlies; ply++) {
    const side = ply % 2 === 0 ? white : black;
    const mt = ply % 2 === 0 ? (whiteMovetime ?? movetime) : (blackMovetime ?? movetime);
    const posCmd = `position startpos${moves.length? ' moves '+moves.join(' '):''}`;
    side.send(posCmd);
    side.send(`go movetime ${mt}`);
    const { move } = await side.waitBestmove(Math.max(60000, mt+20000));
    if (!move || move === '0000' || move === '(none)') {
      const pos = new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      for (const u of moves) {
        const m = pos.legalMoves().find(x => {
          const f=x&127,t=(x>>7)&127,pr=(x>>14)&7;
          const s=String.fromCharCode(97+(f&7))+(8-(f>>4))+String.fromCharCode(97+(t&7))+(8-(t>>4))+(pr?' pnbrqk'[pr]:'');
          return s===u;
        });
        if (!m) break;
        pos.makeMove(m);
      }
      const st = pos.status();
      if (st && st.over) {
        if (st.result === 'draw') return { result:'1/2-1/2', reason:st.reason||'draw', moves };
        return { result: st.result === 'white' ? '1-0' : '0-1', reason:st.reason||'mate', moves };
      }
      return { result: ply%2===0 ? '0-1' : '1-0', reason:'nomove', moves };
    }
    moves.push(move);
    // simple 50-move draw guard / repetition not fully tracked; rely on maxPlies
  }
  return { result: '1/2-1/2', reason: 'maxplies', moves };
}

function score(res, subitIsWhite) {
  if (res.result === '1/2-1/2') return 0.5;
  const whiteWin = res.result === '1-0';
  return (whiteWin === subitIsWhite) ? 1 : 0;
}

async function main() {
  const sf = process.argv[2] || String.raw`C:\Users\sciga\AppData\Local\Temp\opencode\stockfish\stockfish\stockfish-windows-x86-64-universal.exe`;
  const games = Number(process.argv[3] || 10);
  const movetime = Number(process.argv[4] || 200);
  const sfElo = Number(process.argv[5] || 1320);
  const subitMovetime = Number(process.argv[6] || movetime);
  const subitOpts = process.argv[7] ? JSON.parse(process.argv[7]) : [];
  const logDir = path.join(process.cwd(), 'bench', 'matchlogs', `sf${sfElo}_mt${movetime}_sub${subitMovetime}_${Date.now()}`);
  fs.mkdirSync(logDir, { recursive: true });
  const subitCmd = process.execPath;
  const subitArgs = ['src/engine/index.mjs','uci'];
  let w=0,d=0,l=0; const rows=[];
  for (let i=0; i<games; i++) {
    const subitWhite = i % 2 === 0;
    const log = path.join(logDir, `game_${i+1}.log`);
    const a = spawnUci(subitCmd, subitArgs, { name:'subit', log });
    const b = spawnUci(sf, [], { name:'sf', log });
    try {
      await initEngine(a, subitOpts);
      await initEngine(b, [['UCI_LimitStrength','true'],['UCI_Elo',String(sfElo)],['Threads','1']]);
      const white = subitWhite ? a : b;
      const black = subitWhite ? b : a;
      const res = await playGame(white, black, { movetime, whiteMovetime: subitWhite ? subitMovetime : movetime, blackMovetime: subitWhite ? movetime : subitMovetime, maxPlies: 160 });
      const s = score(res, subitWhite);
      if (s===1) w++; else if (s===0.5) d++; else l++;
      rows.push({ game:i+1, subitWhite, result:res.result, reason:res.reason, score:s, plies:res.moves.length });
      console.log(`game ${i+1}/${games}: subit=${subitWhite?'W':'B'} result=${res.result} reason=${res.reason} plies=${res.moves.length} score=${s}`);
    } catch (e) {
      rows.push({ game:i+1, subitWhite, result:'ERR', reason:String(e.message||e), score:null, plies:0 });
      console.log(`game ${i+1}/${games}: ERROR ${String(e.message||e)}`);
    } finally {
      a.close(); b.close();
    }
  }
  const valid = rows.filter(r => r.score !== null);
  const n=valid.length; const mean=n?valid.reduce((a,r)=>a+r.score,0)/n:0;
  const variance=n?valid.reduce((acc,r)=>acc+(r.score-mean)**2,0)/n:0;
  const se=n?Math.sqrt(variance/n):0;
  const errors = rows.length - n;
  const summary = { games:n,w,d,l,errors,mean,se,movetime,sfElo,subitMovetime };
  console.log(JSON.stringify(summary));
}

main().catch(e=>{ console.error(e); process.exit(1); });
