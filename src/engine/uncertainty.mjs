/**
 * SUBIT-CHESS v3.0.6 — Uncertainty profile U(P) and Decision Certificate
 *
 * Spec basis:
 *   docs/theory/37_UNCERTAINTY_&_CONFIDENCE_THEORY §5-§6  (eight types, the vector)
 *   docs/theory/37 §14.3, doc 46 §14.3                  (no Confidence = 1 - Uncertainty)
 *   docs/theory/37 §14.4                                (uncertainty is not rule randomness)
 *   docs/theory/45 §16                                  (the vector steers verification)
 *   docs/theory/45 §20.2                                (Decision Certificate fields)
 *   docs/theory/46 §14.1                                (evaluation / probability / confidence)
 *
 * Hard constraints:
 *   UCT-INV-001  the evaluation is not a win probability
 *   UCT-INV-006  every component keeps the context that produced it
 *   UCT-INV-009  model limits are part of the profile, not a footnote
 *   UCT-INV-011  evidence provenance
 *   UCT-INV-016  tactical uncertainty is never hidden behind a strategic score
 *   UCT-INV-018  reproducible: same inputs -> same profile
 *   UCT-INV-019  no automatic uncertainty penalty on the evaluation
 *   doc 45 §16   the eight indicators are NOT collapsed into one number
 *
 * The last line is why this module has no weighted sum: `scalar()` is deliberately
 * absent. A caller that needs one number already has one (the doc 05 §17 estimate,
 * `meta.uncertaintyOf`), and presenting a blend of eight incommensurable quantities
 * as *the* uncertainty is exactly what doc 37 §14.3 forbids.
 */

import { MOVE_FLAGS, FLAG_CAPTURE, FLAG_PROMO, FLAG_EP } from './core.mjs';
import { clamp01 } from './context.mjs';
import { REL_KEY_FROM, REL_KEY_TO } from './structure.mjs';

/** The eight canonical types (doc 37 §5, doc 45 §16, doc 46 §14.2). */
export const U_TYPES = ['search', 'tactical', 'evaluation', 'structural',
  'strategic', 'temporal', 'model', 'contextual'];

export const U_SYM = {
  search: 'Us', tactical: 'Ut', evaluation: 'Ue', structural: 'Ur',
  strategic: 'Up', temporal: 'Uh', model: 'Um', contextual: 'Uc'
};

export const U_LABEL = {
  search: 'search', tactical: 'tactical', evaluation: 'evaluation',
  structural: 'structural', strategic: 'strategic', temporal: 'temporal',
  model: 'model', contextual: 'contextual'
};

/** Evidence statuses (doc 37 §8). */
export const STATUS = {
  UNVERIFIED: 'UNVERIFIED',
  OBSERVED: 'OBSERVED',
  COMPUTATION_DERIVED: 'COMPUTATION_DERIVED',
  TEST_SUPPORTED: 'TEST_SUPPORTED',
  SEARCH_SUPPORTED: 'SEARCH_SUPPORTED',
  FORCED_WITHIN_SCOPE: 'FORCED_WITHIN_SCOPE',
  FORMALLY_PROVED: 'FORMALLY_PROVED',
  REFUTED: 'REFUTED',
  UNKNOWN: 'UNKNOWN',
  CONTEXT_DEPENDENT: 'CONTEXT_DEPENDENT'
};

/**
 * Documented model limits per evaluation tier (UCT-INV-009).
 * These are not measured confidences: they record *what the tier cannot see*,
 * so the profile says "the model is thinner here" instead of pretending otherwise.
 */
export const MODEL_BASE = { fast: 0.30, structural: 0.22, hybrid: 0.18 };

const MATE_LIMIT = 90000 - 1000;

/**
 * Depth below which a completed search is still reported as shallow (doc 37 §5.1:
 * "insufficient depth"). It is the meta-controller's base depth, so "the search
 * answered" and "the search answered deeply enough" are two different claims.
 */
export const REFERENCE_DEPTH = 8;

/**
 * Build the eight-component uncertainty profile for a decision.
 *
 * Every component is in [0,1] and every component carries a `why` string that
 * names the evidence it was computed from (UCT-INV-006/011). Nothing here reads
 * the evaluation *value*: uncertainty describes the limits of the knowledge, not
 * the size of the score (UCT-INV-019).
 *
 * `input` fields are all optional; a missing input means "not measured here" and
 * is recorded as such instead of silently becoming 0.
 */
export function computeProfile(input = {}) {
  const { result = null, requested = {}, pos = null, percept = null, structure = null,
    ctx = null, plans = null, evaluation = null, evalMode = 'fast' } = input;

  const values = new Float64Array(8);
  const why = {};

  /* ---- Uₛ search: how complete is the search that produced this decision ---- */
  {
    let u = 0;
    const parts = [];
    const depth = result ? result.depth : 0;
    const want = requested.depth || 0;
    if (result && result.completed === false) { u += 0.45; parts.push('iteration incomplete'); }
    if (result && result.flag) { u += 0.15; parts.push('bound, not exact'); }
    if (result && result.seldepth > depth + 4) { u += 0.15; parts.push(`seldepth ${result.seldepth} > d${depth}`); }
    if (want > depth) { u += 0.15; parts.push(`stopped at d${depth} of d${want}`); }
    if (result && result.nodes < 200) { u += 0.10; parts.push(`only ${result.nodes} nodes`); }
    // a completed but shallow search is still a weak search: doc 37 §5.1 names
    // "insufficient depth" first, and doc 45 §16 expects a high Uₛ to ask for more
    if (depth > 0 && depth < REFERENCE_DEPTH) {
      u += 0.30 * (REFERENCE_DEPTH - depth) / REFERENCE_DEPTH;
      parts.push(`d${depth} is below the d${REFERENCE_DEPTH} reference`);
    }
    // a proven mate closes the search question: the score no longer depends on depth
    if (result && Math.abs(result.score) > MATE_LIMIT) { u = 0; parts.length = 0; parts.push('mate proven'); }
    values[0] = clamp01(u);
    why.search = parts.join(', ') || `search complete at d${depth}`;
  }

  /* ---- Uₜ tactical: unresolved tactical consequences (UCT-INV-016) ---- */
  {
    let u = ctx ? ctx.tactical : 0.5;
    const parts = [`tau ${u.toFixed(2)}`];
    const hanging = percept ? percept.hanging[0].length + percept.hanging[1].length : 0;
    if (hanging > 0) { u = Math.min(1, u + 0.2); parts.push(`${hanging} hanging`); }
    if (result && result.pvMoves && result.pvMoves.length) {
      const flags = MOVE_FLAGS(result.pvMoves[0]);
      if (flags & (FLAG_CAPTURE | FLAG_PROMO | FLAG_EP)) { u = Math.min(1, u + 0.1); parts.push('PV starts with a capture'); }
    }
    values[1] = clamp01(u);
    why.tactical = parts.join(', ');
  }

  /* ---- Uₑ evaluation: the doc 05 §17 estimate, recomputed for this position ---- */
  {
    let u = 0.3;
    let note = 'not measured';
    if (typeof input.evUncertainty === 'number') {
      u = input.evUncertainty;
      note = `SVF estimate ${u.toFixed(2)}`;
    } else if (evaluation && pos) {
      const ev = evaluation.structural(pos);
      u = ev && ev.uncertainty ? ev.uncertainty : 0.3;
      note = `SVF estimate ${u.toFixed(2)}`;
    }
    values[2] = clamp01(u);
    why.evaluation = note;
  }

  /* ---- Uᵣ structural: content the structural model has to interpret ---- */
  {
    let u = 0.5;
    let note = 'structure not supplied';
    if (structure && pos) {
      const pieces = pos.listCnt[0] + pos.listCnt[1];
      const covered = new Set();
      for (const k of structure.keys) { covered.add(REL_KEY_FROM(k)); covered.add(REL_KEY_TO(k)); }
      const uncovered = pieces ? Math.max(0, pieces - covered.size) / pieces : 0;
      u = 0.45 * Math.min(1, structure.keys.length / 300)
        + 0.35 * Math.min(1, structure.hyper.length / 14)
        + 0.20 * uncovered;
      note = `${structure.keys.length} relations, ${structure.hyper.length} hyper, ${(uncovered * 100) | 0}% pieces unclassified`;
    }
    values[3] = clamp01(u);
    why.structural = note;
  }

  /* ---- Uₚ strategic: alternative plans and their separation ---- */
  {
    let u;
    let note;
    if (!plans || !plans.length) {
      u = 0.70; note = 'no plan generated';
    } else {
      const ok = plans.filter((p) => p.ok).length;
      const scores = plans.map((p) => p.score).sort((a, b) => b - a);
      const spread = scores.length > 1 ? scores[0] - scores[1] : Infinity;
      u = 0.25 + (ok === 0 ? 0.35 : 0) + (scores.length > 1 && spread < 40 ? 0.20 : 0);
      note = `${plans.length} plans, ${ok} feasible, spread ${Number.isFinite(spread) ? spread.toFixed(0) : 'n/a'}`;
    }
    values[4] = clamp01(u);
    why.strategic = note;
  }

  /* ---- Uₕ temporal: how far ahead the consequences reach ---- */
  {
    const ph = ctx ? ctx.key().split('|')[2] : '';
    let u = 0.20;
    const parts = [];
    if (ph === 'OPENING' || ph === 'MIDDLEGAME') { u += 0.20; parts.push(`${ph.toLowerCase()} horizon`); }
    if (ph === 'TRANSITION') { u += 0.30; parts.push('phase change in progress'); }
    if (ph === 'ENDGAME') { u -= 0.10; parts.push('endgame horizon'); }
    const pieces = pos ? pos.listCnt[0] + pos.listCnt[1] : 16;
    if (pieces <= 10) { u -= 0.10; parts.push('sparse material'); }
    values[5] = clamp01(u);
    why.temporal = parts.join(', ') || 'no phase marked';
  }

  /* ---- Uₘ model: what this tier cannot represent (UCT-INV-009) ---- */
  {
    let u = MODEL_BASE[evalMode] !== undefined ? MODEL_BASE[evalMode] : 0.30;
    const parts = [`${evalMode} tier`];
    const pieces = pos ? pos.listCnt[0] + pos.listCnt[1] : 16;
    if (pieces <= 10) { u += 0.15; parts.push('pawn ending without a tablebase'); }
    if (values[2] > 0.55) { u += 0.10; parts.push('eval estimate itself high'); }
    values[6] = clamp01(u);
    why.model = parts.join(', ');
  }

  /* ---- U𝚌 contextual: does the calibrated context apply here ---- */
  {
    const key = ctx ? ctx.key() : '';
    let u = 0.10;                     // documented debt: contextAdjust is a no-op
    const parts = ['contextAdjust is a no-op'];
    if (key.includes('TRANSITION')) { u += 0.30; parts.push('transition cell'); }
    if (ctx && (ctx.tactical < 0.05 || ctx.tactical > 0.95)) { u += 0.15; parts.push('extreme tactical index'); }
    values[7] = clamp01(u);
    why.contextual = parts.join(', ');
  }

  // the driver is reported for the UI only: it names the component that needs the
  // next verification, it does not rank or merge the eight values
  let top = 0;
  for (let i = 1; i < 8; i++) if (values[i] > values[top]) top = i;
  const driver = U_TYPES[top];

  return {
    values,
    vector: Array.from(values, (x) => Number(x.toFixed(3))),
    why,
    driver,
    driverValue: Number(values[top].toFixed(3))
  };
}

/**
 * Decision Certificate (doc 45 §20.2, roadmap §8.7).
 *
 * A structured record of *how* the decision was produced and checked. It is not a
 * proof that the move is best (doc 45 §20.2 says so explicitly), and it must not
 * claim work the engine did not do: `search_depth` and `node_count` are copied
 * from the search that actually ran.
 */
export function buildCertificate(input = {}) {
  const {
    fen = '', version = 0, move = null, san = null, legal = true, legalCount = 0,
    depth = 0, completed = false, nodes = 0, pv = [], score = 0,
    profile = null, paramVersion = '3.0.6', algorithmVersion = '3.0.6'
  } = input;

  let status;
  if (!legal) status = STATUS.REFUTED;
  else if (Math.abs(score) > MATE_LIMIT) status = STATUS.FORCED_WITHIN_SCOPE;
  else if (!completed) status = STATUS.UNVERIFIED;
  else status = STATUS.SEARCH_SUPPORTED;

  return {
    position_identity: fen,
    position_version: version,
    selected_move: san || move || null,
    legal_validation: { legal: !!legal, legal_moves: legalCount },
    search_depth: depth,
    completed_iteration: !!completed,
    node_count: nodes,
    principal_variation: pv.slice(),
    evaluation: score,
    uncertainty_profile: profile ? { ...profile } : null,
    parameter_version: paramVersion,
    algorithm_version: algorithmVersion,
    validation_status: status,
    provenance: Math.abs(score) > MATE_LIMIT ? 'search (forced mate)' : 'search'
  };
}

/** One-line rendering for traces and the UI (never a substitute for the profile). */
export function certificateLine(cert) {
  if (!cert) return '';
  const u = cert.uncertainty_profile;
  const unc = u ? U_TYPES.map((k) => `${U_SYM[k]}=${(u.vector[U_TYPES.indexOf(k)] ?? 0).toFixed(2)}`).join(' ') : 'U=—';
  return `[${cert.validation_status}] ${cert.selected_move || '—'} d${cert.search_depth} ${cert.node_count}n ${unc} (driver ${u ? U_SYM[u.driver] : '—'})`;
}