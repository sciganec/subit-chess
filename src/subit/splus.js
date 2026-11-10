'use strict';
/* ============================================================================
   S⁺ = S₀ × R_fin   (SUBIT-∞ v6.14.0, §2.1)
   ----------------------------------------------------------------------------
   Spec: a second-level state carries both the spatial value and the transition
   rule itself, R_fin = { ρ : S₀ → S₀ }.
   Literal dynamics used here:  (s, ρ) ↦ (ρ(s), ρ).
   The rule is stored as a 64-entry table (a finite map), so R_fin is exactly
   the set of such tables. The spec does not give further structure for S⁺;
   this module implements only that reading and nothing beyond it.
   ========================================================================= */

const { classifyOrbit } = require('./trajectory.js');

function makeRule(table) {
  if (!Array.isArray(table) || table.length !== 64) throw new RangeError('rule must be a table of 64 entries');
  for (const v of table) if (!Number.isInteger(v) || v < 0 || v > 63) throw new RangeError('rule value out of S0: ' + v);
  return Object.freeze(table.slice());
}
function makeState(s, rho) {
  if (!Number.isInteger(s) || s < 0 || s > 63) throw new RangeError('S0 value out of range');
  return Object.freeze({ s, rho: makeRule(rho) });
}
// One step of S⁺: (s, ρ) ↦ (ρ(s), ρ). The rule is unchanged.
function step(state) {
  return makeState(state.rho[state.s], state.rho);
}
// Trajectory class of the S⁺ orbit, using the §3.1 classifier on the value
// component: the orbit of s under ρ.
function classify(state) {
  return classifyOrbit(x => state.rho[x], state.s);
}

module.exports = { makeRule, makeState, step, classify };
