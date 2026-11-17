/**
 * SUBIT-CHESS v3.0.9 — Adaptive search budget (SEARCH-15)
 *
 * Spec basis:
 *   docs/theory/40_COMPUTATIONAL_RESOURCE_ALLOCATION §11 (adaptive deepening),
 *                                                    §11.1 (anytime iterative deepening),
 *                                                    §13 (value of additional computation)
 *   docs/theory/05_SEARCH_ARCHITECTURE §17.1  SearchBudget(P) = f(Complexity, U, TimeRemaining)
 *
 * What the theory asks for, after each COMPLETED iteration:
 *   1. check the change of the principal variation (here: of the root move),
 *   2. check the bound type,
 *   3. recompute the uncertainty (here: score drift and the gap between the two best root moves),
 *   4. decide whether more computation can still change the decision (VOI),
 *   5. keep the best known move available (anytime behaviour).
 *
 * §13.2: a computation whose result cannot change the decision has low value and
 * is skipped; §13.1: one that can change it is worth more time. A stable, clear
 * decision therefore ends early and BANKS the unused time; an unstable one may
 * spend up to a hard cap, drawing on the bank. The mean time per move stays at
 * the nominal budget, so the policy is compared fairly against a fixed budget.
 *
 * Everything here is a pure function of numbers: no engine state, no clock.
 * Meta-control never picks a move; it decides how much thinking the position
 * deserves.
 */

export const BUDGET_DEFAULTS = Object.freeze({
  softFrac: 0.6,        // share of the allowance after which a stable decision may stop
  hardFrac: 2.0,        // hard cap as a multiple of the allowance
  hardCap: 3.0,         // ... and as a multiple of the nominal budget
  minAllow: 0.3,        // floor of the allowance (fraction of nominal) when the bank is overdrawn
  maxBank: 6,           // bank ceiling, in nominal moves
  stableScoreCp: 30,    // drift between iterations that still counts as stable
  clearSpreadCp: 80,    // gap best vs second-best root move that makes the choice clear
  minStableIters: 2,    // the root move must survive this many consecutive iterations
  growth: 2.2           // expected cost ratio of the next iteration over the last one
});

const finite = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/**
 * Allowance and caps for one move.
 *   nominalMs  the per-move budget the caller asked for
 *   bankMs     time saved by earlier moves (negative = overspent)
 * Returns { allowMs, softMs, hardMs }, with softMs <= hardMs.
 */
export function allocateTime({ nominalMs, bankMs = 0 }, params = BUDGET_DEFAULTS) {
  const p = { ...BUDGET_DEFAULTS, ...params };
  const nominal = Math.max(1, finite(nominalMs, 1));
  const allowMs = Math.max(p.minAllow * nominal, nominal + finite(bankMs, 0));
  const hardMs = Math.max(1, Math.min(p.hardCap * nominal, p.hardFrac * allowMs));
  const softMs = Math.min(hardMs, p.softFrac * allowMs);
  return { allowMs, softMs, hardMs };
}

/** The bank after a move that was budgeted `nominalMs` and used `usedMs`. */
export function updateBank(bankMs, nominalMs, usedMs, params = BUDGET_DEFAULTS) {
  const p = { ...BUDGET_DEFAULTS, ...params };
  const next = finite(bankMs, 0) + nominalMs - usedMs;
  return Math.max(-(1 - p.minAllow) * nominalMs, Math.min(p.maxBank * nominalMs, next));
}

/**
 * Is the root decision settled?  `history` holds the completed iterations,
 * oldest first: { depth, move, score, spread, flag }.
 * Returns { stable, instability, reason }, instability in [0,1].
 */
export function decisionStability(history, params = BUDGET_DEFAULTS) {
  const p = { ...BUDGET_DEFAULTS, ...params };
  const n = history.length;
  if (n < p.minStableIters + 1) return { stable: false, instability: 1, reason: 'too few iterations' };
  const last = history[n - 1];
  // 1. the root move survived the last minStableIters iterations
  for (let i = 1; i <= p.minStableIters; i++) {
    if (history[n - 1 - i].move !== last.move) return { stable: false, instability: 1, reason: 'root move changed' };
  }
  // 2. bound type: a bound is not a score (SEARCH-INV-002)
  if (last.flag !== 0 && last.flag != null) return { stable: false, instability: 0.8, reason: 'bound, not exact' };
  // 3. score drift between the last two completed iterations
  const drift = Math.abs(finite(last.score, 0) - finite(history[n - 2].score, 0));
  if (drift > p.stableScoreCp) return { stable: false, instability: Math.min(1, drift / (4 * p.stableScoreCp)), reason: 'score drift' };
  // 4. the choice must be clear: the runner-up is well behind
  const spread = finite(last.spread, 0);
  if (spread < p.clearSpreadCp) return { stable: false, instability: 0.5 * (1 - spread / p.clearSpreadCp), reason: 'runner-up close' };
  return { stable: true, instability: 0, reason: 'stable and clear' };
}

/**
 * Between iterations: continue or stop?  Pure; the caller owns the clock.
 *   elapsedMs  time since the search began
 *   lastIterMs duration of the iteration that just completed
 */
export function shouldStop({ elapsedMs, softMs, hardMs, lastIterMs, history }, params = BUDGET_DEFAULTS) {
  const p = { ...BUDGET_DEFAULTS, ...params };
  if (elapsedMs >= hardMs) return { stop: true, reason: 'hard cap' };
  // an iteration that cannot finish before the cap would be thrown away
  if (finite(lastIterMs, 0) > 0 && elapsedMs + p.growth * lastIterMs > hardMs) return { stop: true, reason: 'next iteration cannot finish' };
  if (elapsedMs >= softMs) {
    const s = decisionStability(history, p);
    if (s.stable) return { stop: true, reason: 'low value of more computation (stable decision)' };
  }
  return { stop: false, reason: 'continue' };
}
