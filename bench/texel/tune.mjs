/**
 * Texel-style tuning on the engine's OWN self-play data (SUBIT autonomy, INV-016).
 *   node bench/texel/tune.mjs --data a.jsonl,b.jsonl --sweeps 6 --out tuned.json
 * Minimises the mean squared error between the game result and sigmoid(K * static eval) over a training split,
 * accepting a coordinate step only when it lowers the training error; reports the held-out split every sweep and
 * keeps the parameters of the best held-out error (early stopping against over-fitting).
 */
import fs from 'node:fs';
import { Position } from '../../src/engine/core.mjs';
import { evaluateFast, cloneParams, DEFAULT_PARAMS } from '../../src/engine/evaluate.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const files = arg('data', '').split(',').filter(Boolean);
const sweeps = +arg('sweeps', 6), out = arg('out', 'tuned.json'), maxPos = +arg('max', 90000);
const pstMax = +arg('pstmax', 40);

// ---- data: the last 20% of each file is held out (blocks of consecutive games, never split a game's positions)
const train = [], valid = [];
for (const f of files) {
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const cut = Math.floor(rows.length * 0.8);
  rows.forEach((r, i) => (i < cut ? train : valid).push(r));
}
const mk = (rows) => rows.slice(0, maxPos).map((r) => { const p = new Position().setFEN(r.fen); return { p, r: r.r, s: p.turn === 0 ? 1 : -1 }; });
const T = mk(train), V = mk(valid);
console.error(`train ${T.length}  valid ${V.length}`);

const params = cloneParams(DEFAULT_PARAMS);
const PIECES = ['P', 'N', 'B', 'R', 'Q', 'K'];
params.pstDelta = { mid: {}, end: {} };
for (const c of PIECES) { params.pstDelta.mid[c] = new Array(64).fill(0); params.pstDelta.end[c] = new Array(64).fill(0); }
params.pstRev = 1;

let K = 0.0045;
const sig = (x) => 1 / (1 + Math.exp(-K * x));
function loss(set) {
  let e = 0;
  for (let i = 0; i < set.length; i++) {
    const d = set[i];
    const v = evaluateFast(d.p, params) * d.s;     // white-positive; clamp is irrelevant on quiet positions
    const x = d.r - sig(v);
    e += x * x;
  }
  return e / set.length;
}

// fit K on the untouched parameters
{
  let lo = 0.001, hi = 0.012;
  for (let it = 0; it < 18; it++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    K = a; const la = loss(T); K = b; const lb = loss(T);
    if (la < lb) hi = b; else lo = a;
  }
  K = (lo + hi) / 2;
  console.error(`K = ${K.toFixed(5)}  train ${loss(T).toFixed(5)}  valid ${loss(V).toFixed(5)}`);
}

// ---- parameter list
const P = [];
const addScalar = (name, get, set, step, min, max) => P.push({ name, get, set, step, min, max, rev: false });
const ev = params.eval;
for (const c of ['N', 'B', 'R', 'Q']) P.push({ name: 'material.' + c, get: () => params.material[c], set: (v) => { params.material[c] = v; }, step: 5, min: -80, max: 80, base: params.material[c], rev: true });
for (const k of ['bishopPair', 'doubled', 'isolated', 'rookOpen', 'rookSemiOpen', 'kingShield', 'kingOpenFile', 'connected', 'rook7'])
  addScalar('eval.' + k, () => ev[k] || 0, (v) => { ev[k] = v; }, 2, 0, 80);
for (let r = 1; r <= 6; r++) addScalar('eval.passed.' + r, () => ev.passed[r], (v) => { ev.passed[r] = v; }, 3, 0, 250);
for (const c of ['N', 'B', 'R', 'Q']) addScalar('eval.mobility.' + c, () => ev.mobility[c], (v) => { ev.mobility[c] = v; }, 0.25, 0, 12);
addScalar('tempo', () => params.tempo, (v) => { params.tempo = v; }, 2, 0, 40);
for (const c of PIECES) for (const ph of ['mid', 'end']) for (let idx = 0; idx < 64; idx++) {
  if (c === 'P' && (idx < 8 || idx >= 56)) continue;
  P.push({ name: `pst.${ph}.${c}.${idx}`, get: () => params.pstDelta[ph][c][idx], set: (v) => { params.pstDelta[ph][c][idx] = v; }, step: 1, min: -pstMax, max: pstMax, rev: true });
}
// material tuning is relative to the starting value
for (const p of P) if (p.name.startsWith('material.')) { const c = p.name.slice(9); const b0 = params.material[c]; p.get = () => params.material[c]; p.min = b0 - 80; p.max = b0 + 80; }
console.error(`${P.length} parameters`);

let best = loss(T), bestV = loss(V), bestSnap = null;
const snap = () => JSON.stringify({ material: params.material, eval: params.eval, tempo: params.tempo, pstDelta: params.pstDelta });
bestSnap = snap();
const t0 = Date.now();
for (let sw = 1; sw <= sweeps; sw++) {
  let changed = 0;
  for (const p of P) {
    const v0 = p.get();
    for (const dir of [1, -1]) {
      const v1 = Math.min(p.max, Math.max(p.min, v0 + dir * p.step));
      if (v1 === v0) continue;
      p.set(v1); if (p.rev) params.pstRev++;
      const l = loss(T);
      if (l < best - 1e-9) { best = l; changed++; break; }
      p.set(v0); if (p.rev) params.pstRev++;
    }
  }
  const lv = loss(V);
  console.error(`sweep ${sw}: train ${best.toFixed(5)}  valid ${lv.toFixed(5)}  changed ${changed}  ${Math.round((Date.now() - t0) / 1000)}s`);
  if (lv < bestV) { bestV = lv; bestSnap = snap(); } else if (sw > 2) { console.error('validation no longer improves; stopping'); break; }
  fs.writeFileSync(out, bestSnap);
  if (!changed) break;
}
fs.writeFileSync(out, bestSnap);
console.error(`best valid ${bestV.toFixed(5)} written to ${out}`);
