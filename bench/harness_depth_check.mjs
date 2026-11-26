import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import { Engine } from '/home/claude/subit-chess/src/engine/index.mjs';
const fens = fs.readFileSync('/home/claude/subit-chess/bench/fens/openings.epd','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).slice(0,12).map(l=>l.split(/\s+id\s+/)[0].replace(/;$/,'').trim());
const inproc=[]; for (const f of fens){ const e=new Engine(); e.setFEN(f); e.search({timeMs:100}); const t=Date.now(); const r=e.search({timeMs:100}); inproc.push({d:r.depth,n:r.nodes,t:Date.now()-t}); }
const ch=spawn(process.execPath,['/home/claude/subit-chess/src/engine/index.mjs','uci'],{stdio:['pipe','pipe','inherit']});
const rl=readline.createInterface({input:ch.stdout}); const q=[]; rl.on('line',l=>{ if(q.length&&q[0].test(l)) q.shift().res(l); else if (l.startsWith('info')) last=l; }); let last='';
const wait=(re)=>new Promise(res=>q.push({test:x=>re.test(x),res}));
const send=s=>ch.stdin.write(s+'\n');
const uci=[];
for (const f of fens){ send('ucinewgame'); send('isready'); await wait(/readyok/); send('position fen '+f); send('go movetime 100'); await wait(/^bestmove/); const t0=Date.now(); send('position fen '+f); send('go movetime 100'); await wait(/^bestmove/); const m=last.match(/depth (\d+).*nodes (\d+)/); uci.push({d:+m[1],n:+m[2],t:Date.now()-t0}); }
send('quit');
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
for (const [k,a] of [['inproc',inproc],['uci',uci]]) console.log(k,'depth',avg(a.map(x=>x.d)).toFixed(2),'nodes',Math.round(avg(a.map(x=>x.n))),'ms',avg(a.map(x=>x.t)).toFixed(0));
process.exit(0);
