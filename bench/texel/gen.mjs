/**
 * Self-play position generator for Texel-style tuning (SUBIT autonomy: the only data is the engine's own play,
 * INV-016; no external engine, no imported games).
 *   node bench/texel/gen.mjs --games 400 --seed 1 --depth 4 --out data.jsonl
 * One line per sampled quiet position: {"fen": ..., "r": 1|0.5|0} (result from White's point of view).
 */
import fs from 'node:fs';
import { Engine } from '../../src/engine/index.mjs';
import { makeStartFEN, RESULT } from '../../src/engine/learn.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const games = +arg('games', 100), seed0 = +arg('seed', 1), depth = +arg('depth', 4), out = arg('out', 'texel.jsonl');
const maxPlies = +arg('maxPlies', 200);
const fd = fs.openSync(out, 'a');
let nPos = 0;
for (let g = 0; g < games; g++) {
  const startFen = makeStartFEN(seed0 * 100000 + g, 6);
  const e = new Engine(undefined, { ttBits: 16, usePlans: false, useMeta: false, adaptiveTime: false });
  e.setFEN(startFen);
  const samples = [];
  let result = RESULT.DRAW;
  for (let ply = 0; ply < maxPlies; ply++) {
    const st0 = e.pos.status();
    if (st0 && st0.over) { result = st0.result === 'white' ? 1 : st0.result === 'black' ? -1 : 0; break; }
    const fen = e.fen;
    const r = e.search({ depth, fixedTime: true });
    if (!r.move) break;
    const inCheck = e.pos.inCheck();
    const isCap = (r.uci.length === 4) && e.pos.board[(8 - +r.uci[3]) * 16 + (r.uci.charCodeAt(2) - 97)] !== 0;
    if (ply >= 8 && ply % 2 === 0 && !inCheck && !isCap && Math.abs(r.score) < 900) samples.push(fen);
    e.play(r.uci);
    if (ply === maxPlies - 1) result = 0;
  }
  const rr = result === 1 ? 1 : result === -1 ? 0 : 0.5;
  let buf = '';
  for (const f of samples) { buf += JSON.stringify({ fen: f, r: rr }) + '\n'; nPos++; }
  fs.writeSync(fd, buf);
}
console.error('positions', nPos);
