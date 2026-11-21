/**
 * SUBIT-CHESS — SUBIT gradient profile (DOP-01 / DOP-H1)
 *
 * Spec basis:
 *   docs/theory/48-64/48_SUBIT_CHESS_Differential_Operators_v0.1.md
 *     §3.2 fixed-orientation V; §3.3 D_m V = V(T_m S) - V(S) and
 *     Delta_SUBIT = sigma(S) * D_m V; §3.4 gradient profile and summary
 *     statistics; §5.4 zero circulation of a potential field; §9.3 ordering
 *     and diagnostics only; §10 DOP-01; §13 DOP-H1; §15 status.
 *
 * ANALYSIS ONLY. No pruning, no move filtering, no search or evaluation change.
 * The module returns a profile beside the scalar value; it never replaces V
 * (doc 48 §7.5 "V(S1) = V(S2) does not imply equal differential profiles").
 *
 * Orientation — the one place where a sign error silently halves strength:
 *   Evaluation.structural(pos).white is ALREADY white-positive, and
 *   evaluateFast(pos) is side-to-move relative. whiteValue() normalises both
 *   to a single fixed (white-positive) field. sigma is applied exactly once,
 *   to the raw forward difference, to produce the mover-relative Delta_SUBIT.
 */

import { WHITE, moveToUci } from './core.mjs';
import { Evaluation, DEFAULT_PARAMS } from './evaluate.mjs';

export const GRADIENT_TIERS = Object.freeze(['structural', 'fast']);

/**
 * Fixed-orientation scalar field V(S), white-positive in centipawns.
 * `evaluator` must be an Evaluation instance (or anything exposing fast()
 * and structural() with the same contract).
 */
export function whiteValue(pos, evaluator, tier = 'structural') {
  if (!GRADIENT_TIERS.includes(tier)) throw new Error(`unknown gradient tier: ${tier}`);
  if (tier === 'fast') {
    // evaluateFast() returns the side-to-move perspective; undo it once.
    return evaluator.fast(pos) * (pos.turn === WHITE ? 1 : -1);
  }
  return evaluator.structural(pos).white;
}

function resolveValue(opts) {
  const tier = opts.tier || 'structural';
  if (!GRADIENT_TIERS.includes(tier)) throw new Error(`unknown gradient tier: ${tier}`);
  if (typeof opts.value === 'function') return { tier, value: opts.value };
  const evaluator = opts.evaluation || new Evaluation(opts.params || DEFAULT_PARAMS);
  return { tier, value: (p) => whiteValue(p, evaluator, tier) };
}

function summarize(deltas) {
  const n = deltas.length;
  if (n === 0) return { G_max: 0, G_min: 0, G_mean: 0, G_var: 0, G_dist: [] };
  const mean = deltas.reduce((a, b) => a + b, 0) / n;
  const variance = deltas.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return {
    G_max: Math.max(...deltas),
    G_min: Math.min(...deltas),
    G_mean: mean,
    G_var: variance,
    // Exact empirical distribution: sorted deltas. No arbitrary bin width.
    G_dist: [...deltas].sort((a, b) => a - b)
  };
}

/**
 * Discrete gradient of V over all legal moves from a Position (DOP-01).
 *
 * Returns { V, sigma, moves, G_max, G_min, G_mean, G_var, G_dist }. Each move
 * record has { uci, move, dV, delta } where dV is the raw white-positive
 * difference and delta = sigma * dV is the mover-relative Delta_SUBIT.
 *
 * The input Position is cloned; pushRep/popRep are balanced. `opts.value`
 * allows a custom white-positive field (used by the theory's theorem tests);
 * `opts.tier` selects 'structural' (default) or 'fast'.
 */
export function gradientProfile(input, opts = {}) {
  if (!input || typeof input.clone !== 'function' || typeof input.legalMoves !== 'function') {
    throw new Error('gradientProfile requires a Position');
  }
  const { tier, value } = resolveValue(opts);
  const pos = input.clone();
  const V = value(pos);
  const sigma = pos.turn === WHITE ? 1 : -1;
  const moves = [];
  const deltas = [];

  for (const m of pos.legalMoves()) {
    pos.pushRep();
    const undo = pos.makeMove(m);
    const childV = value(pos);
    pos.unmakeMove(undo);
    pos.popRep();
    const dV = childV - V;
    const delta = sigma * dV;
    moves.push({ uci: moveToUci(m), move: m, dV, delta });
    deltas.push(delta);
  }

  return {
    tier,
    turn: pos.turn === WHITE ? 'white' : 'black',
    V, sigma, moves,
    ...summarize(deltas)
  };
}

/**
 * Circulation of the RAW forward field along a move sequence (doc 48 §5.4).
 * For a closed cycle in the state space on which V is defined, the sum is zero
 * by telescoping. Passing a history-independent value function therefore tests
 * the theorem on positional cycles; with the engine's full evaluator, a
 * halfmove-dependent field need not telescope on a board-level return.
 */
export function circulation(input, ucis, opts = {}) {
  if (!input || typeof input.clone !== 'function') throw new Error('circulation requires a Position');
  const { value } = resolveValue(opts);
  const pos = input.clone();
  let previous = value(pos);
  let sum = 0;
  for (const uci of ucis) {
    const m = pos.legalMoves().find((x) => moveToUci(x) === uci);
    if (!m) throw new Error(`illegal move in circulation line: ${uci}`);
    pos.pushRep();
    pos.makeMove(m);
    const current = value(pos);
    sum += current - previous;
    previous = current;
  }
  return sum;
}
