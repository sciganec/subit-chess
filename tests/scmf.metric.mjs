/**
 * SCMF-INV-010 / OPEN-002: metric properties of the structural distance components
 * (docs/theory/03 §15). Checked on seeded random positions: identity d(x,x)=0,
 * symmetry, non-negativity, triangle inequality, per component Dv Dr Da Dc Dt Dq Dh.
 */
import { Engine } from '../src/engine/index.mjs';
import { Position } from '../src/engine/core.mjs';
import { structuralDistance } from '../src/engine/structure.mjs';

let seed = Number(process.env.SEED || 7);
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const structs = [];
for (let g = 0; g < 8; g++) {
  const p = Position.start();
  for (let ply = 0; ply < 70 && structs.length < 28; ply++) {
    const ms = p.legalMoves();
    if (!ms.length) break;
    p.makeMove(ms[(rnd() * ms.length) | 0]);
    if (ply % 9 === 8) {
      const e = new Engine(undefined, { ttBits: 12, usePlans: false });
      e.setFEN(p.fen());
      structs.push(e.structure);
    }
  }
}
const N = structs.length;
const D = (a, b) => structuralDistance(structs[a], structs[b]);
const comps = ['Dv', 'Dr', 'Da', 'Dc', 'Dt', 'Dq', 'Dh'];
const worst = Object.fromEntries(comps.map((c) => [c, { id: 0, sym: 0, neg: 0, tri: 0, triN: 0, tot: 0 }]));
for (let i = 0; i < N; i++) {
  for (const c of comps) worst[c].id = Math.max(worst[c].id, Math.abs(D(i, i)[c]));
  for (let j = 0; j < N; j++) {
    const dij = D(i, j), dji = D(j, i);
    for (const c of comps) {
      worst[c].sym = Math.max(worst[c].sym, Math.abs(dij[c] - dji[c]));
      worst[c].neg = Math.min(worst[c].neg, dij[c]);
      for (let k = 0; k < N; k++) {
        const v = dij[c] - (D(i, k)[c] + D(k, j)[c]);
        worst[c].tot++;
        if (v > 1e-9) { worst[c].triN++; worst[c].tri = Math.max(worst[c].tri, v); }
      }
    }
  }
}
let fails = 0;
console.log(`positions: ${N}, triples: ${N * N * N}`);
for (const c of comps) {
  const w = worst[c];
  const ok = w.id < 1e-12 && w.sym < 1e-12 && w.neg >= 0 && w.triN === 0;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c}: identity ${w.id.toExponential(1)}  symmetry ${w.sym.toExponential(1)}  min ${w.neg.toFixed(3)}  triangle violations ${w.triN}/${w.tot}${w.triN ? ` (max excess ${w.tri.toFixed(3)})` : ''}`);
}
console.log(fails ? `\nMETRIC FAILURES: ${fails} component(s) are not metrics` : '\nMETRIC OK');
process.exit(fails ? 1 : 0);
