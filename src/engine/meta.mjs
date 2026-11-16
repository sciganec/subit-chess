/**
 * SUBIT-CHESS v3.0.0 — Meta-control / resource allocation
 *
 * Spec basis:
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §17 (adaptive depth, budget)
 *   docs/theory/08_EVALUATION_UNCERTAINTY
 *   docs/theory/33_COMPUTATIONAL_COMPLEXITY (complexity → effort)
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART XV §57-60 (meta-control loop)
 *
 * Meta-control never picks a move. It decides *how much thinking* the position
 * deserves and *which tier* of evaluation to use, and it reports the risk of
 * the chosen move so that the caller can widen the window instead of trusting
 * a single score.
 */

import { searchBudget } from './search.mjs';
import { clamp01 } from './context.mjs';

export const RISK = { NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };

export const RISK_NAME = ['NONE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

/** Structural complexity of a position in [0,1]. */
export function complexityOf(pos, percept, structure, ctx) {
  if (!structure) return 0.5;
  const rel = structure.keys.length;
  const hyper = structure.hyper.length;
  const mob = Math.abs(percept.mobility[0] - percept.mobility[1]);
  const tactical = ctx ? ctx.tactical : 0;
  const pieces = pos.listCnt[0] + pos.listCnt[1];
  return clamp01(
    rel / 260 * 0.45 +
    Math.min(1, hyper / 12) * 0.2 +
    Math.min(1, mob / 24) * 0.15 +
    tactical * 0.2
  );
}

/** Evaluation uncertainty in [0,1] (doc 08). */
export function uncertaintyOf(ev, pos, percept, structure) {
  // a measured 0.0 is a result, not a missing one: `!ev.uncertainty` turned a
  // certain position into the 0.3 default (audit v3.0.6 §6.2)
  if (!ev || typeof ev.uncertainty !== 'number') return 0.3;
  const base = ev.uncertainty;
  const pieces = pos.listCnt[0] + pos.listCnt[1];
  const sparse = pieces < 12 ? 0.15 : 0;
  const quiet = percept.hanging[0].length + percept.hanging[1].length === 0 ? 0.05 : 0;
  return clamp01(base + sparse + quiet);
}

/**
 * Depth the position deserves.
 * Deterministic: same inputs → same depth.
 */
export function adaptiveDepth({ complexity = 0.5, uncertainty = 0.3, baseDepth = 8, maxDepth = 24 } = {}) {
  const c = clamp01(complexity);
  const u = clamp01(uncertainty);
  // complex and uncertain positions get more depth; simple ones get less
  const bonus = Math.round(c * 4 + u * 3);
  return Math.max(2, Math.min(maxDepth, baseDepth + bonus - 2));
}

/**
 * Move-quality risk from the search result (audit v3.0.6 §8.2).
 *
 * The comment on the original implementation promised score spread, PV length
 * and mate distance; the code used score, completed, nodes and seldepth. This
 * is the corrected classifier: every factor the description names is read.
 *
 *   - scoreSpread  the gap between the best and second-best root move. A small
 *                  spread means the choice is not clear and a deeper search
 *                  could flip it.
 *   - pvLength     the length of the principal variation. A PV much shorter
 *                  than the depth means the line was truncated (a bound, not
 *                  an exact score), which is a risk even when `completed`.
 *   - mateDistance how far the mate is. A mate in many moves is less forcing
 *                  than a mate in one, even when the score says MATE.
 */
export function riskOf(searchResult, depth) {
  if (!searchResult) return RISK.CRITICAL;
  const { score, completed, nodes, seldepth, scoreSpread, pv, flag } = searchResult;
  if (!completed) return RISK.HIGH;
  // a proven mate: the score no longer depends on depth. A mate in one is
  // NONE; a mate in many is LOW because the side can still go wrong.
  const isMate = Math.abs(score) > 90000 - 1000;
  if (isMate) {
    const mateIn = Math.round((90000 - Math.abs(score)));
    return mateIn <= 2 ? RISK.NONE : RISK.LOW;
  }
  // a bound, not an exact score: the aspiration window did not contain the
  // true value, so the published score is a ceiling or a floor
  if (flag !== 0 && flag != null) return RISK.MODERATE;
  // the tree exploded: selective depth far beyond nominal depth means the
  // search spent its budget on extensions, and the result is less trustworthy
  if (seldepth > depth + 6) return RISK.MODERATE;
  if (nodes > 40000000) return RISK.MODERATE;
  // a truncated PV: the line is shorter than the depth, so the tail of the
  // search was cut by a bound rather than resolved exactly
  const pvLen = pv ? pv.length : 0;
  if (pvLen > 0 && pvLen < depth) return RISK.MODERATE;
  // a small score spread means the second-best move is close: the choice is
  // not clear and a deeper search could change it
  if (typeof scoreSpread === 'number' && scoreSpread < 30) return RISK.MODERATE;
  // an equal position: any move is fine, low risk
  if (Math.abs(score) < 40) return RISK.LOW;
  return RISK.LOW;
}

export class MetaController {
  constructor(params = {}) {
    this.params = params;
    this.stats = { decisions: 0, depths: [], timeMs: 0 };
  }

  /**
   * Plan the search for one move:
   *   { depth, timeMs, nodes, evalMode, risk }
   */
  plan({ pos, percept, structure, ctx, evaluation, clockMs = 0, baseDepth = 8, maxDepth = 24 } = {}) {
    const complexity = complexityOf(pos, percept, structure, ctx);
    const ev = evaluation ? evaluation.structural(pos) : null;
    const uncertainty = uncertaintyOf(ev, pos, percept, structure);
    const depth = adaptiveDepth({ complexity, uncertainty, baseDepth, maxDepth });
    const budget = searchBudget({ complexity, uncertainty, timeRemaining: 1 });
    const timeMs = clockMs > 0
      ? Math.max(50, Math.min(clockMs, Math.round(clockMs * (0.35 + complexity * 0.4) / budget)))
      : 0;
    const useSVF = uncertainty > 0.55 && depth <= 10;   // full SVF only where it pays
    return {
      complexity, uncertainty, depth, timeMs, budget,
      evalMode: useSVF ? 'hybrid' : 'fast',
      structuralEvalDepth: useSVF ? 2 : 0,
      nodes: 0
    };
  }

  /** Record the outcome so the controller can be tuned from data. */
  record(plan, result) {
    this.stats.decisions++;
    this.stats.depths.push(plan.depth);
    this.stats.timeMs += result.timeMs || 0;
  }

  summary() {
    const d = this.stats.depths;
    const avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
    return `decisions=${this.stats.decisions} avgDepth=${avg.toFixed(2)} time=${this.stats.timeMs}ms`;
  }
}
