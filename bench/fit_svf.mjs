#!/usr/bin/env node
/**
 * Fit the nine SVF weights w_i to the engine's OWN depth-2 search score (SCMF §15: internal teacher only,
 * no external engine). Features are the saturated components h_i(Ω_i). Ridge least squares, 80/20 split.
 *   node bench/fit_svf.mjs [--n 1500] [--seed 3] [--out results/svf_weights.json]
 */
import fs from 'node:fs';
import { Engine } from '../src/engine/index.mjs';
import { Position } from '../src/engine/core.mjs';
import { SVF_COMPONENTS, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 1500)); let seed = Number(arg('seed', 3)); const out = arg('out', 'results/svf_weights.json');
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const sat = (x, s) => x / (1 + Math.abs(x) / s);
const names = SVF_COMPONENTS, k = names.length;

const X = [], y = [];
const eng = new Engine(undefined, { ttBits: 14, usePlans: false, adaptiveTime: false });
while (X.length < N) {
  const p = Position.start();
  for (let ply = 0; ply < 100 && X.length < N; ply++) {
    const ms = p.legalMoves(); if (!ms.length) break;
    p.makeMove(ms[(rnd() * ms.length) | 0]);
    if (ply % 7 === 6 && !p.inCheck()) {
      eng.setFEN(p.fen());
      const r = eng.search({ depth: 2 });
      if (Math.abs(r.score) > 2000) continue;                 // skip decided positions
      const ev = eng.evaluation.structural(eng.pos);
      X.push(Array.from(ev.vector, (v, i) => sat(v, DEFAULT_PARAMS.s[names[i]])));
      y.push(r.score);
    }
  }
}
const nTr = Math.floor(N * 0.8);
function solve(A, b) {                                         // Gauss-Jordan
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const lambda = 1.0;
const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
for (let i = 0; i < nTr; i++) for (let a = 0; a < k; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c]; }
for (let a = 0; a < k; a++) A[a][a] += lambda * nTr * 1e-3;
const w = solve(A, b);
const r2 = (wv) => {
  let ssr = 0, sst = 0, m = 0; for (let i = nTr; i < N; i++) m += y[i]; m /= (N - nTr);
  for (let i = nTr; i < N; i++) { const p = X[i].reduce((s, v, j) => s + v * wv[j], 0); ssr += (y[i] - p) ** 2; sst += (y[i] - m) ** 2; }
  return 1 - ssr / sst;
};
const w1 = new Array(k).fill(1);
console.log('held-out R2  default w=1:', r2(w1).toFixed(3), ' fitted:', r2(w).toFixed(3));
console.log(names.map((n, i) => `${n}=${w[i].toFixed(2)}`).join(' '));
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(out, JSON.stringify({ n: N, seed: arg('seed', 3), teacher: 'own depth-2 fast search', w: Object.fromEntries(names.map((n, i) => [n, w[i]])), r2_default: r2(w1), r2_fit: r2(w) }, null, 1));
