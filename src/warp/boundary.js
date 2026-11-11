'use strict';
/* ============================================================================
   SUBIT-WARP boundary geometry (SUBIT-∞ v6.14.0 §11; WARP v0.4 §4, §6)
   ----------------------------------------------------------------------------
   Metrics (WARP v0.4):
     d_Σ(ξ,η)  = 2^{-ℓ(ξ,η)}  (ξ ≠ η), 0 otherwise           (§4.1)
     r_F(f,g)  = min{|u| : t_f(u) ≠ t_g(u)},  d_F = 2^{-r_F}   (§4.2)
     d_H       = Hausdorff distance induced by d_Σ              (§4.4)
   Boundary ∂t = infinite paths of INTERNAL nodes (§11.1). Finite verification
   works on depth-M truncations: ∂_M t = {u : |u| = M, all prefixes INTERNAL}.
   Test trees (ValidTree): a prefix-closed set S with an always-0 spine, so every
   node of S extends infinitely (no dead ends). Children outside S are LEAF or ABSENT
   by a hash, which satisfies TC-01..TC-05 (partial trees).
   T-005 (dim_H = ln b / α with α = ln 2 for d_Σ) is checked as box-counting on Σ_b.
   ============================================================================ */

const { ABSENT, INTERNAL, leafState, LABELS } = require('../subit/tree.js');

/* Deterministic 32-bit hash of a string with a seed; uniform on [0,1). */
function h01(seed, s) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/* S-membership: u ∈ S iff every nonempty prefix v of u has last digit 0 or h(v) < p. */
function inS(seed, p, u) {
  for (let k = 1; k <= u.length; k++) {
    const v = u.slice(0, k);
    if (v[k - 1] === '0') continue;
    const pk = typeof p === 'function' ? p(k) : p;
    if (!(h01(seed, v) < pk)) return false;
  }
  return true;
}

/* Code function of the test tree (total, partial branching). p: number or function of level. */
function validTree(seed, p) {
  return (u) => {
    if (u === '') return INTERNAL;
    const parent = u.slice(0, -1);
    if (!inS(seed, p, parent)) return ABSENT;   // TC-02 / TC-03 closure
    if (inS(seed, p, u)) return INTERNAL;
    return leafState(LABELS[Math.floor(h01(seed + 7, u) * 4)]);
  };
}

/* Words of length M reachable through INTERNAL nodes (= truncated boundary). */
function boundaryAt(t, M) {
  let level = [''];
  for (let k = 0; k < M; k++) {
    const next = [];
    for (const u of level) for (const d of ['0', '1', '2']) if (t(u + d) === INTERNAL) next.push(u + d);
    level = next;
  }
  return level;
}

/* d_Σ on truncations: 2^{-ℓ}, equal words give 0 (points inside one cylinder are not resolved). */
function dSigma(u, v) {
  if (u === v) return 0;
  let l = 0;
  while (l < u.length && u[l] === v[l]) l++;
  return Math.pow(2, -l);
}

/* Hausdorff distance between finite sets of truncated addresses. */
function dHausdorff(A, B) {
  if (A.length === 0 || B.length === 0) return A.length === B.length ? 0 : 2;
  const sup = (X, Y) => { let m = 0; for (const x of X) { let inf = Infinity; for (const y of Y) inf = Math.min(inf, dSigma(x, y)); m = Math.max(m, inf); } return m; };
  return Math.max(sup(A, B), sup(B, A));
}

/* r_F on the first D levels: smallest depth where the two code functions differ, else null. */
function rF(f, g, D) {
  let level = [''];
  for (let k = 0; k <= D; k++) {
    for (const u of level) if (f(u) !== g(u)) return k;
    if (k === D) break;
    const next = [];
    for (const u of level) for (const d of ['0', '1', '2']) next.push(u + d);
    level = next;
  }
  return null;
}
function dF(f, g, D) { const r = rF(f, g, D); return r === null ? 0 : Math.pow(2, -r); }

/* Box-counting dimension of Σ_b at scale 2^{-n} with d_Σ: log(N_n)/log(2^n), N_n = b^n. */
function sigmaBoxDim(b, n) { return Math.log(Math.pow(b, n)) / (n * Math.log(2)); }

module.exports = { h01, inS, validTree, boundaryAt, dSigma, dHausdorff, rF, dF, sigmaBoxDim };
