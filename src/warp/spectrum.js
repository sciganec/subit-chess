'use strict';
/* ============================================================================
   SUBIT-WARP spectral theory on the boundary (SUBIT-∞ v6.14.0, §12)
   ----------------------------------------------------------------------------
   Boundary Σ_b with Bernoulli measure μ_b([u]) = b^{-|u|}; kernel
   K_q(ξ,η) = q^{ℓ(ξ,η)} (ξ ≠ η), K_q(ξ,ξ) = 0, ℓ = length of common prefix.
   T-009 (predicted eigenvalues):
       λ_0 = c_q = (b-1)/(b-q)                 multiplicity 1
       λ_j = -(1-q) q^{j-1} / (b^{j-1}(b-q))   multiplicity (b-1) b^{j-1}, j ≥ 1
   Finite exact model. T_q maps functions constant on depth-N cells into
   themselves; in the indicator basis it is the b^N × b^N matrix
       A_ij = b^{-N} q^{ℓ(i,j)}  (i ≠ j),     A_ii = b^{-N} g_N,
       g_N  = ((b-1)/b) q^N / (1 - q/b)       (average of K over own cell).
   Its spectrum is exactly {λ_0} ∪ {λ_j, j = 1..N} with the multiplicities
   above, and tr A = g_N. Hence c_q + Σ_{j=1}^N m_j λ_j = g_N exactly.
   ============================================================================ */

function cq(b, q) { return (b - 1) / (b - q); }
function lam(b, q, j) { return -((1 - q) * Math.pow(q, j - 1)) / (Math.pow(b, j - 1) * (b - q)); }
function mult(b, j) { return (b - 1) * Math.pow(b, j - 1); }
function gN(b, q, N) { return ((b - 1) / b) * Math.pow(q, N) / (1 - q / b); }

/* Length of common prefix of two cell indices written with N base-b digits. */
function commonPrefix(i, j, b, N) {
  let l = 0;
  for (let k = N - 1; k >= 0; k--) {
    const di = Math.floor(i / Math.pow(b, k)) % b;
    const dj = Math.floor(j / Math.pow(b, k)) % b;
    if (di !== dj) break;
    l++;
  }
  return l;
}

/* The exact b^N × b^N matrix A (row-major Float64Array of size n²). */
function kernelMatrix(b, q, N) {
  const n = Math.pow(b, N);
  const A = new Float64Array(n * n);
  const inv = Math.pow(b, -N);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      A[i * n + j] = inv * (i === j ? gN(b, q, N) : Math.pow(q, commonPrefix(i, j, b, N)));
    }
  }
  return { n, A };
}

/* Cyclic Jacobi eigenvalue method for a real symmetric matrix (row-major). Returns sorted eigenvalues. */
function symEigenvalues(n, M) {
  const a = Float64Array.from(M);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
      }
    }
  }
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(a[i * n + i]);
  return ev.sort((x, y) => x - y);
}

/* Predicted spectrum of the depth-N restriction: λ_0 once, λ_j with multiplicity m_j, j ≤ N. */
function predictedSpectrum(b, q, N) {
  const ev = [cq(b, q)];
  for (let j = 1; j <= N; j++) for (let k = 0; k < mult(b, j); k++) ev.push(lam(b, q, j));
  return ev.sort((x, y) => x - y);
}

module.exports = { cq, lam, mult, gN, commonPrefix, kernelMatrix, symEigenvalues, predictedSpectrum };
