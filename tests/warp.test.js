#!/usr/bin/env node
'use strict';
/* SUBIT-WARP spectral checks (SUBIT-∞ v6.14.0 §12): T-009 (spectrum) and T-011 (invariants). */
const assert = require('assert');
const S = require('../src/warp/spectrum.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); } }

const grid = [];
for (const [b, Nmax] of [[2, 4], [3, 4], [4, 3]]) for (const q of [0.2, 0.5, 0.9]) for (let N = 1; N <= Nmax; N++) grid.push({ b, q, N });

console.log('[T-009] spectrum of T_q (exact on the depth-N model)');
test('multiplicities of W_0..W_N add up to b^N', () => {
  for (const { b, N } of grid) {
    let m = 1; for (let j = 1; j <= N; j++) m += S.mult(b, j);
    assert.strictEqual(m, Math.pow(b, N));
  }
});
test('eigenvalues equal {c_q} ∪ {λ_j with multiplicity m_j} (tol 1e-11)', () => {
  for (const { b, q, N } of grid) {
    const { n, A } = S.kernelMatrix(b, q, N);
    const ev = S.symEigenvalues(n, A), pr = S.predictedSpectrum(b, q, N);
    for (let i = 0; i < n; i++) assert.ok(Math.abs(ev[i] - pr[i]) < 1e-11, `b=${b} q=${q} N=${N} i=${i}: ${ev[i]} vs ${pr[i]}`);
  }
});
test('λ_0 = c_q has multiplicity 1 (largest eigenvalue)', () => {
  for (const { b, q, N } of grid) {
    const { n, A } = S.kernelMatrix(b, q, N);
    const ev = S.symEigenvalues(n, A);
    assert.ok(Math.abs(ev[n - 1] - S.cq(b, q)) < 1e-11);
    assert.ok(ev[n - 2] < S.cq(b, q) - 1e-6, 'c_q must be simple');
  }
});

console.log('[T-011] invariants');
test('trace identity on the finite model: tr A = g_N, and c_q + Σ m_j λ_j = g_N (tol 1e-12)', () => {
  for (const { b, q, N } of grid) {
    const { n, A } = S.kernelMatrix(b, q, N);
    let tr = 0; for (let i = 0; i < n; i++) tr += A[i * n + i];
    let s = S.cq(b, q); for (let j = 1; j <= N; j++) s += S.mult(b, j) * S.lam(b, q, j);
    assert.ok(Math.abs(tr - S.gN(b, q, N)) < 1e-12, 'tr');
    assert.ok(Math.abs(s - S.gN(b, q, N)) < 1e-12, 'sum');
  }
});
test('trace of T_q in the limit is 0 (c_q + Σ m_j λ_j → 0 as the depth grows)', () => {
  for (const b of [2, 3, 4]) for (const q of [0.2, 0.5, 0.9]) {
    let s = S.cq(b, q); for (let j = 1; j <= 400; j++) s += S.mult(b, j) * S.lam(b, q, j);
    assert.ok(Math.abs(s) < 1e-12, `b=${b} q=${q}: ${s}`);
  }
});
test('‖T_q‖ = c_q (max |λ| attained at λ_0)', () => {
  for (const b of [2, 3, 4]) for (const q of [0.2, 0.5, 0.9]) {
    let mx = S.cq(b, q); for (let j = 1; j <= 400; j++) mx = Math.max(mx, Math.abs(S.lam(b, q, j)));
    assert.ok(Math.abs(mx - S.cq(b, q)) < 1e-12);
  }
});
test('‖T_q‖²_HS = (b-1)/(b-q²) (series over j, tol 1e-12)', () => {
  for (const b of [2, 3, 4]) for (const q of [0.2, 0.5, 0.9]) {
    let hs = S.cq(b, q) ** 2; for (let j = 1; j <= 400; j++) hs += S.mult(b, j) * S.lam(b, q, j) ** 2;
    assert.ok(Math.abs(hs - (b - 1) / (b - q * q)) < 1e-12, `b=${b} q=${q}`);
  }
});
test('nuclear norm ‖T_q‖₁ = 2c_q (tol 1e-10)', () => {
  for (const b of [2, 3, 4]) for (const q of [0.2, 0.5, 0.9]) {
    let nu = S.cq(b, q); for (let j = 1; j <= 400; j++) nu += S.mult(b, j) * Math.abs(S.lam(b, q, j));
    assert.ok(Math.abs(nu - 2 * S.cq(b, q)) < 1e-10, `b=${b} q=${q}`);
  }
});

console.log('[T-012] growing kernel K_+ = t^ℓ, t > 1');
test('finite model for t < b: eigenvalues match the predicted formulas (tol 1e-11)', () => {
  for (const t of [1.3, 1.7, 2.5]) for (let N = 1; N <= 3; N++) {
    const { n, A } = S.kernelMatrix(3, t, N);
    const ev = S.symEigenvalues(n, A), pr = S.predictedSpectrum(3, t, N);
    for (let i = 0; i < n; i++) assert.ok(Math.abs(ev[i] - pr[i]) < 1e-11, `t=${t} N=${N}`);
  }
});
test('∫K dμ = Σ_m t^m (b-1)/b^{m+1} converges to (b-1)/(b-t) iff t < b', () => {
  const partial = (t, M) => { let s = 0; for (let m = 0; m < M; m++) s += (2 / 3) * Math.pow(t / 3, m); return s; };
  for (const t of [1.7, 2.5]) assert.ok(Math.abs(partial(t, 400) - (2) / (3 - t)) < 1e-9, `t=${t}`);
  assert.ok(Math.abs(partial(2.9, 4000) - 2 / (3 - 2.9)) < 1e-6, 't=2.9');
  const s100 = partial(3.2, 100), s200 = partial(3.2, 200), s400 = partial(3.2, 400);
  assert.ok(s200 > 10 * s100 && s400 > 1e10, 'divergence for t ≥ b');
});
test('trace is not trace-class for any t > 1 (partial sums of m_j λ_j(t) grow)', () => {
  for (const t of [1.2, 1.7, 2.5]) {
    const part = (J) => { let p = 0; for (let j = 1; j <= J; j++) p += S.mult(3, j) * S.lam(3, t, j); return p; };
    assert.ok(part(60) > part(30) && part(30) > part(10), `t=${t} not growing`);
    assert.ok(part(60) > 1e3, `t=${t} partial sum too small`);
  }
});
test('‖T_+‖²_HS = (b-1)/(b-t²) iff t² < b (series in closed-form terms, tol 1e-10)', () => {
  const b = 3;
  const hs = (t, J) => { let h = S.cq(b, t) ** 2; const c = (b - 1) * (t - 1) ** 2 / (b - t) ** 2; for (let j = 1; j <= J; j++) h += c * Math.pow(t * t / b, j - 1); return h; };
  assert.ok(Math.abs(hs(1.7, 1500) - (b - 1) / (b - 1.7 * 1.7)) < 1e-10, 't=1.7');
  assert.ok(hs(1.8, 400) > hs(1.8, 200) && hs(1.8, 400) > 1e10, 't=1.8 must diverge');
});

console.log('[T-010] L_q = T_q − c_q I ≤ 0');
test('finite model: L_q has a simple zero (constants) and all other eigenvalues are negative', () => {
  for (const b of [2, 3]) for (const q of [0.2, 0.5, 0.9]) for (let N = 1; N <= 4; N++) {
    if (Math.pow(b, N) > 27) continue;
    const { n, A } = S.kernelMatrix(b, q, N);
    for (let i = 0; i < n; i++) A[i * n + i] -= S.cq(b, q);
    const ev = S.symEigenvalues(n, A);
    assert.ok(Math.abs(ev[n - 1]) < 1e-11, `b=${b} q=${q} N=${N}: top ${ev[n - 1]}`);
    assert.ok(ev[n - 2] < -1e-9, `b=${b} q=${q} N=${N}: zero not simple`);
  }
});
test('essential spectrum of L_q is {−c_q}: λ_j − c_q → −c_q as j grows', () => {
  for (const b of [2, 3]) for (const q of [0.2, 0.5, 0.9]) {
    const j = 80;
    assert.ok(Math.abs((S.lam(b, q, j) - S.cq(b, q)) + S.cq(b, q)) < 1e-12, `b=${b} q=${q}`);
  }
});

console.log('');
console.log(`warp: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
