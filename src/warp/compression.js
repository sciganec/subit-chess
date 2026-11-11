'use strict';
/* ============================================================================
   Finite compressions and reconstruction (SUBIT-∞ v6.14.0 §13)
   T13.1: in the cylinder basis of depth n, off-diagonal b^{-n} q^ℓ, diagonal
          b^{-n} q^n c_q (c_q = (b-1)/(b-q)); trace q^n c_q; error of
          P_n-compression = |λ_{n+1}| = (1-q)q^n / (b^n (b-q)).
   T21′:  an ordered tree is recovered from a prefix-free address set (the trie).
   ============================================================================ */
const { cq, lam, kernelMatrix, symEigenvalues } = require('./spectrum.js');

function compressionMatrix(b, q, n) { return kernelMatrix(b, q, n); }

/* Conditional expectation onto cell-constant functions of depth n, inside the depth-N model. */
function projector(b, n, N) {
  const size = Math.pow(b, N), block = Math.pow(b, N - n);
  const P = new Float64Array(size * size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++)
    if (Math.floor(i / block) === Math.floor(j / block)) P[i * size + j] = 1 / block;
  return P;
}

function matmul(n, X, Y) {
  const Z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const x = X[i * n + k]; if (x === 0) continue; for (let j = 0; j < n; j++) Z[i * n + j] += x * Y[k * n + j]; }
  return Z;
}

/* Spectral norm of a symmetric matrix. */
function symNorm(n, M) { const ev = symEigenvalues(n, M); return Math.max(Math.abs(ev[0]), Math.abs(ev[n - 1])); }

/* Error of P_n-compression on the depth-N model: ‖A − P_n A P_n‖. */
function compressionError(b, q, n, N) {
  const { n: size, A } = kernelMatrix(b, q, N);
  const P = projector(b, n, N);
  const PAP = matmul(size, matmul(size, P, A), P);
  const D = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) D[i] = A[i] - PAP[i];
  return symNorm(size, D);
}
const compressionErrorPredicted = (b, q, n) => Math.abs(lam(b, q, n + 1));   // (1-q)q^n/(b^n(b-q))

/* T21′: build an ordered tree (object form) from a prefix-free set of addresses (digit strings). */
function treeFromAddresses(addrs) {
  const set = new Set(addrs);
  for (const a of addrs) for (const c of addrs) if (a !== c && c.startsWith(a)) throw new Error('not prefix-free: ' + a + ' ⊑ ' + c);
  const build = (prefix) => {
    if (set.has(prefix)) return { leaf: '00' };   // leaf label carried separately; here only the shape matters
    const kids = ['0', '1', '2'].map((d) => {
      const p = prefix + d;
      const exists = [...set].some((a) => a.startsWith(p));
      return exists ? build(p) : null;
    });
    return { children: kids };
  };
  return build('');
}
function addressesOf(obj, prefix = '') {
  if (obj === null) return [];
  if ('leaf' in obj) return [prefix];
  return obj.children.flatMap((c, i) => addressesOf(c, prefix + String(i)));
}

module.exports = { compressionMatrix, projector, compressionError, compressionErrorPredicted, treeFromAddresses, addressesOf, cq };
