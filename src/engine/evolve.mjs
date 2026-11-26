/**
 * SUBIT-CHESS v3.0.9 — controlled autonomous evolution (SCMF-001 §15, Part VIII)
 *
 * hillClimb() in learn.mjs accepts a change after ONE self-play comparison, the same comparison that
 * selected it. That is exactly the self-confirmation SCMF §15.4 forbids (winner's curse: among many
 * perturbations some look significant by chance). evolve() separates the five roles §15.4 names:
 *
 *   hypothesis   a bounded perturbation of one knob                          (generate)
 *   evaluation   screening match on seed set S                               (get an estimate)
 *   verification regression suite: params load, search legal, mate found     (check)
 *   confirmation a DISJOINT seed set C, more games, stricter sign test       (independent confirmation)
 *   acceptance   only when screening AND confirmation are positive          (accept)
 *
 * SCMF §15.3: bounded change (per step and cumulative drift from the baseline), a journal of every
 * hypothesis with provenance Prov(P) = (generator, parameters, seed, version), reproducibility
 * (the journal is a pure function of the seed), regression control, and rollback (SCMF-INV-019).
 * INV-016: the only data source is the engine's own play. No external engine, no imported games.
 *
 * Provenance carries no wall-clock time (it would make the journal non-reproducible, INV-018); callers
 * who want a timestamp can pass opts.stamp.
 */
import { Engine } from './index.mjs';
import { Position } from './core.mjs';
import { cloneParams, DEFAULT_PARAMS } from './evaluate.mjs';
import { makeRng, compare, paramsAreUsable } from './learn.mjs';

export const EVOLVE_VERSION = '1';

const DEFAULT_KNOBS = ['tempo', 'bishopPair', 'eval.doubled', 'eval.isolated', 'eval.rookOpen', 'eval.kingShield',
  'search.futility.margin', 'search.rfp.margin'];

export function getKnob(params, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), params);
}
export function setKnobValue(params, path, value) {
  const parts = path.split('.');
  let o = params;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

/** Stable, order-independent fingerprint of a parameter set (FNV-1a over the JSON). */
export function paramsFingerprint(params) {
  const flat = flatten(params), s = Object.keys(flat).sort().map((k) => k + "=" + JSON.stringify(flat[k])).join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function flatten(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, pre + k + '.', out); else out[pre + k] = v;
  }
  return out;
}

/** Regression suite (SCMF §15.3 "regression control"): a candidate that fails any item is never accepted. */
export function regressionSuite(params) {
  const failures = [];
  if (!paramsAreUsable(params)) failures.push('parameters do not load or search');
  try {
    const e = new Engine(params, { ttBits: 14, adaptiveTime: false, usePlans: false });
    e.setFEN('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
    const r = e.search({ depth: 3 });
    if (r.uci !== 'a1a8') failures.push('missed mate in 1');
    e.setFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    if (e.pos.legalMoves().length !== 0) failures.push('stalemate fixture invalid');
    // colour symmetry of the static evaluation (INV-009) must survive any parameter change
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const a = new Engine(params, { ttBits: 12, usePlans: false }); a.setFEN(fen);
    const parts = fen.split(' ');
    const mirror = parts[0].split('/').reverse().map((r) => r.split('').map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('')).join('/');
    const b = new Engine(params, { ttBits: 12, usePlans: false });
    b.setFEN(`${mirror} ${parts[1] === 'w' ? 'b' : 'w'} ${parts[2] === '-' ? '-' : parts[2].split('').map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('')} - 4 4`);
    if (Math.abs(a.evaluation.fast(a.pos) - b.evaluation.fast(b.pos)) > 1e-6) failures.push('colour symmetry broken');
  } catch (err) { failures.push('exception: ' + err.message); }
  return failures;
}

/**
 * Run a controlled evolution. Returns { params, accepted, journal, versions, rolledBack }.
 *   opts.steps          number of hypotheses (default 6)
 *   opts.knobs          list of dotted parameter paths
 *   opts.maxStep        max relative change per hypothesis (default 0.12)
 *   opts.maxDrift       max cumulative relative drift from the baseline per knob (default 0.30)
 *   opts.screenGames / opts.confirmGames / opts.depth / opts.seed
 *   opts.zConfirm       confirmation threshold on mean/se (default 1.64, one-sided ~5%)
 *   opts.compare        injectable match function (tests); same signature as learn.compare
 *   opts.finalAudit     re-run baseline vs final on a third seed set and roll back if not positive (default true)
 */
export function evolve(baseParams, opts = {}) {
  const steps = opts.steps ?? 6;
  const knobs = opts.knobs || DEFAULT_KNOBS;
  const maxStep = opts.maxStep ?? 0.12, maxDrift = opts.maxDrift ?? 0.30;
  const screenGames = opts.screenGames ?? 8, confirmGames = opts.confirmGames ?? 16;
  const depth = opts.depth ?? 2, seed = opts.seed ?? 1;
  const zConfirm = opts.zConfirm ?? 1.64;
  const cmp = opts.compare || compare;
  const rng = makeRng(seed);
  const SEED_STRIDE = 1000003;     // screening, confirmation and audit seed sets never overlap

  const baseline = cloneParams(baseParams);
  let champion = cloneParams(baseline);
  const versions = [{ id: 0, fingerprint: paramsFingerprint(champion), params: cloneParams(champion), reason: 'baseline' }];
  const journal = [];
  let accepted = 0;

  for (let step = 0; step < steps; step++) {
    const knob = knobs[Math.floor(rng() * knobs.length) % knobs.length];
    const dir = rng() < 0.5 ? -1 : 1;
    const rel = (0.03 + rng() * (maxStep - 0.03)) * dir;
    const entry = {
      step, knob, relativeChange: Number(rel.toFixed(4)),
      provenance: { generator: 'evolve.perturb', parameters: { knob, rel: Number(rel.toFixed(4)) }, seed: seed + step, version: EVOLVE_VERSION, source: 'self-play only' },
      decision: null, reason: null
    };
    journal.push(entry);

    const cur = getKnob(champion, knob), base0 = getKnob(baseline, knob);
    if (typeof cur !== 'number') { entry.decision = 'skip'; entry.reason = 'knob is not numeric'; continue; }
    let next = Math.round(cur * (1 + rel) * 1000) / 1000;
    if (next === cur) next = cur + (rel > 0 ? 1 : -1);
    // bounded change: cumulative drift from the baseline (SCMF §15.3)
    const lo = base0 - Math.abs(base0) * maxDrift, hi = base0 + Math.abs(base0) * maxDrift;
    if (base0 !== 0 && (next < Math.min(lo, hi) || next > Math.max(lo, hi))) { entry.decision = 'reject'; entry.reason = 'exceeds cumulative drift bound'; continue; }
    const candidate = cloneParams(champion);
    setKnobValue(candidate, knob, next);
    entry.from = cur; entry.to = next;

    // verification: regression suite
    const reg = regressionSuite(candidate);
    if (reg.length) { entry.decision = 'reject'; entry.reason = 'regression: ' + reg.join('; '); continue; }

    // evaluation: screening match
    const scr = cmp(champion, candidate, { games: screenGames, depth, seed: seed + step * SEED_STRIDE });
    entry.screen = { dS: scr.dS, se: scr.se, n: screenGames };
    if (!(scr.dS > 0)) { entry.decision = 'reject'; entry.reason = 'screening not positive'; continue; }

    // confirmation: DISJOINT seeds, more games (SCMF §15.4: the evidence that selected it cannot accept it)
    const conf = cmp(champion, candidate, { games: confirmGames, depth, seed: seed + step * SEED_STRIDE + 500000 });
    const z = conf.se > 0 ? conf.dS / conf.se : (conf.dS > 0 ? Infinity : 0);
    entry.confirm = { dS: conf.dS, se: conf.se, z: Number.isFinite(z) ? Number(z.toFixed(3)) : 'inf', n: confirmGames };
    if (!(conf.dS > 0 && z >= zConfirm)) { entry.decision = 'reject'; entry.reason = 'confirmation not significant'; continue; }

    champion = candidate; accepted++;
    entry.decision = 'accept'; entry.reason = 'screening and independent confirmation positive';
    versions.push({ id: versions.length, fingerprint: paramsFingerprint(champion), params: cloneParams(champion), reason: `${knob}: ${cur} -> ${next}`, journalStep: step });
  }

  // final independent audit of the whole evolution against the original baseline (rollback if it is not better)
  let rolledBack = false, audit = null;
  if (accepted > 0 && opts.finalAudit !== false) {
    const a = cmp(baseline, champion, { games: confirmGames, depth, seed: seed + 9 * SEED_STRIDE });
    audit = { dS: a.dS, se: a.se, n: confirmGames };
    if (!(a.dS > 0)) {
      champion = cloneParams(baseline); rolledBack = true;
      journal.push({ step: steps, decision: 'rollback', reason: 'final audit against the baseline was not positive (SCMF-INV-019)', audit });
    }
  }
  return { params: champion, accepted, rolledBack, audit, journal, versions, baseFingerprint: versions[0].fingerprint, finalFingerprint: paramsFingerprint(champion) };
}

/** Return to a previous stable version (SCMF-INV-019). */
export function rollbackTo(result, versionId) {
  const v = result.versions[versionId];
  if (!v) throw new Error('unknown version ' + versionId);
  return cloneParams(v.params);
}
