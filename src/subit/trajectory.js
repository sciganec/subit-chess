'use strict';
/* ============================================================================
   Trajectory classes on a finite state space (SUBIT-∞ v6.14.0, §3.1)
   ----------------------------------------------------------------------------
   Spec §3.1: since S₀ is finite, every trajectory enters a cycle. For a
   deterministic map f : S → S and start x, the orbit x, f(x), f²(x), … has
     μ = preperiod  (first index that lies on the cycle),
     λ = period     (length of that cycle).
   Classes (names from §3.1):
     FIXED      μ = 0, λ = 1   — the orbit is a fixed point
     PERIODIC   μ = 0, λ > 1   — purely periodic, nontrivial cycle
     TRANSIENT  μ > 0          — enters a cycle after μ steps
   Only these three are defined here. The §10.1 classes (MIN_ZERO, MIN_POS,
   NONMIN_*) need the entropy and minimality definitions, which the spec does
   not state formally; they are not implemented (see CHANGELOG).
   Algorithm: Brent's cycle detection. Pure function of (f, x); no state kept.
   ========================================================================= */

function classifyOrbit(f, x, maxSteps) {
  const limit = maxSteps === undefined ? 1 << 20 : maxSteps;
  // Brent: find period λ, then preperiod μ.
  let power = 1, lam = 1;
  let tortoise = x, hare = f(x);
  let steps = 1;
  while (tortoise !== hare) {
    if (power === lam) { tortoise = hare; power *= 2; lam = 0; }
    hare = f(hare); lam += 1; steps++;
    if (steps > limit) return { class: 'UNRESOLVED', mu: null, lambda: null };
  }
  // preperiod
  tortoise = x; hare = x;
  for (let i = 0; i < lam; i++) hare = f(hare);
  let mu = 0;
  while (tortoise !== hare) { tortoise = f(tortoise); hare = f(hare); mu++; }
  let cls;
  if (mu > 0) cls = 'TRANSIENT';
  else if (lam === 1) cls = 'FIXED';
  else cls = 'PERIODIC';
  return { class: cls, mu, lambda: lam };
}

// Build a map from a table of 64 outputs.
function tableMap(table) { return x => table[x]; }

module.exports = { classifyOrbit, tableMap };
