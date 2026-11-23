import fs from 'node:fs';
const log = process.argv[2];
const text = fs.readFileSync(log,'utf8');
const lines = text.split(/\r?\n/);
let moves = [];
const subitScores = [];
for (const line of lines) {
  const pm = line.match(/^\[(subit|sf)<\] position startpos(?: moves (.*))?$/);
  if (pm) moves = pm[2] ? pm[2].trim().split(/\s+/) : [];
  const sm = line.match(/^\[subit>\] info .*score cp (-?\d+).*pv (.*)$/);
  if (sm) subitScores.push({ ply: moves.length, score: +sm[1], pv: sm[2] });
  const bm = line.match(/^\[subit>\] bestmove (\S+)/);
  if (bm) subitScores.push({ ply: moves.length, best: bm[1] });
}
console.log('total plies', moves.length);
console.log('last 20 moves', moves.slice(-20).join(' '));
console.log('subit score samples (last 30):');
for (const s of subitScores.filter(x=>x.score!==undefined).slice(-30)) console.log(s);
