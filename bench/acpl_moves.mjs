#!/usr/bin/env node
/**
 * Choose a move for each position of a FEN list under a given config and time, write JSON.
 * Used by bench/acpl.py (Stockfish is only the ruler there: it scores the chosen move, nothing flows back).
 *   node bench/acpl_moves.mjs --params '{"search":{"lmrLog":{"enabled":true}}}' --opts '{}' --n 150 --stride 6 --time 100 --out m.json
 */
import fs from 'node:fs';
import { Engine } from '../src/engine/index.mjs';
import { cloneParams, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const params = JSON.parse(arg('params', '{}')), opts = JSON.parse(arg('opts', '{}'));
const n = +arg('n', 150), stride = +arg('stride', 6), time = +arg('time', 100), out = arg('out', 'moves.json');
const file = arg('fens', 'bench/fens/V_val.epd'), offset = +arg('offset', 0);
const merge = (t, s) => { for (const k of Object.keys(s)) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) merge(t[k] ??= {}, s[k]); else t[k] = s[k]; } };
const p = cloneParams(DEFAULT_PARAMS); merge(p, params);
const fens = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const res = [];
for (let i = offset; i < fens.length && res.length < n; i += stride) {
  const fen = fens[i].split(';')[0].trim();
  const e = new Engine(p, Object.assign({ ttBits: 18 }, opts));
  e.setFEN(fen);
  const r = e.search({ timeMs: time });
  if (!r.uci) continue;
  res.push({ fen, move: r.uci, depth: r.depth });
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(`${res.length} positions, mean depth ${(res.reduce((a, x) => a + x.depth, 0) / res.length).toFixed(2)}`);
