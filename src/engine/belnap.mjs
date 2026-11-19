/**
 * SUBIT-CHESS v3.0.9 — Belnap four-valued evidence layer and the Ω trace classifier.
 *
 * Spec basis:
 *   SUBIT-∞ §1.4, §7  alphabet 𝔸 = {T, F, B, N}, the Belnap bilattice (truth order and knowledge order)
 *   docs/spec/SUBIT-CHESS-SPEC.md §7 (Ω classifier proxy for search dynamics) and §8 (Belnap evaluation layer)
 *   subit-subit paper/article_SUBIT_CPU.md §6.3: evidence from independent components is combined with ⊕, a conflict is
 *   B (not a forced choice), the next step is more search, not discarding one of the pieces of evidence.
 *
 * Both items existed in the v1.9 line and disappeared with the v3.0.0 rewrite (ADR 0013). They are restored here as
 * pure functions that READ numbers produced elsewhere. Nothing in this file touches the search or the evaluation, so
 * it cannot change a move (SCMF-INV-011).
 *
 * Representation: a value is a pair (t, f) of "there is evidence for" / "there is evidence against":
 *   N = (0,0) no information, T = (1,0), F = (0,1), B = (1,1) contradiction.
 */

export const N = 0, T = 1, F = 2, B = 3;
export const NAMES = ['N', 'T', 'F', 'B'];

const tOf = (v) => v & 1;
const fOf = (v) => (v >> 1) & 1;
const make = (t, f) => (t ? 1 : 0) | (f ? 2 : 0);

/** Knowledge order join ⊕: accumulates evidence. N is the identity, B absorbs. */
export const join = (a, b) => a | b;
/** Knowledge order meet ⊗: what both sources agree on. */
export const consensus = (a, b) => a & b;
/** Truth order conjunction ∧ (T is top, F is bottom). */
export const and = (a, b) => make(tOf(a) & tOf(b), fOf(a) | fOf(b));
/** Truth order disjunction ∨. */
export const or = (a, b) => make(tOf(a) | tOf(b), fOf(a) & fOf(b));
/** Negation swaps evidence for and against; N and B are fixed. */
export const not = (a) => make(fOf(a), tOf(a));

/** Fold a list of values with ⊕. The empty list is N. */
export function combine(values) {
  let v = N;
  for (const x of values) v = join(v, x);
  return v;
}

/**
 * Read one numeric difference as a Belnap value for the hypothesis "the chosen move is at least as good".
 *   diff > +thr  → T,  diff < −thr → F,  |diff| ≤ thr → N (the component does not decide).
 * A single scalar can never give B: B appears only when several components disagree.
 */
export function readDiff(diff, thr) {
  if (diff == null || Number.isNaN(diff)) return N;
  if (diff > thr) return T;
  if (diff < -thr) return F;
  return N;
}

/** Component thresholds in centipawns (SPEC Appendix A.1 spirit: fixed constants of the specification). */
export const THRESHOLDS = { material: 30, static: 25, shallow: 30, deep: 30 };

/**
 * Evidence record for a pair (chosen, alternative).
 * `diffs` holds chosen − alternative in centipawns from the mover's view for each independent source.
 * Returns { components: {name: 'T'|'F'|'N'}, value: 'T'|'F'|'B'|'N', conflicting: [names...] }.
 */
export function evidenceFor(diffs, thresholds = THRESHOLDS) {
  const components = {};
  let acc = N;
  for (const name of Object.keys(diffs)) {
    const v = readDiff(diffs[name], thresholds[name] ?? 30);
    components[name] = NAMES[v];
    acc = join(acc, v);
  }
  const conflicting = acc === B
    ? Object.keys(components).filter((k) => components[k] !== 'N')
    : [];
  return { components, value: NAMES[acc], conflicting };
}

/**
 * Ω proxy for a search trace (SPEC §7): the class of the sequence of iteration scores.
 *   STABLE      var < 200 and |mean| < 30          the score has settled
 *   CYCLIC      sign-change rate > 0.5             the score keeps flipping direction
 *   CHAOTIC     var > 1500                         large unstructured swings
 *   METASTABLE  otherwise                          drifting or settling slowly
 * Needs at least 3 scores; with fewer the class is UNKNOWN. The constants are calibration parameters of the
 * specification, not derived from Ω; a claim that this agrees with the formal Ω is empirical (SPEC §14.2, layer b).
 * Mate scores are clipped so that one forced mate does not read as CHAOTIC.
 */
export function classifyTrace(scores, opts = {}) {
  const clip = opts.clip ?? 2000;
  const xs = scores.map((s) => Math.max(-clip, Math.min(clip, s)));
  if (xs.length < 3) return { omega: 'UNKNOWN', n: xs.length, mean: 0, variance: 0, oscillation: 0 };
  const diffs = [];
  for (let i = 1; i < xs.length; i++) diffs.push(xs[i] - xs[i - 1]);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / diffs.length;
  let flips = 0, pairs = 0;
  for (let i = 1; i < diffs.length; i++) {
    if (diffs[i] === 0 || diffs[i - 1] === 0) continue;
    pairs++;
    if ((diffs[i] > 0) !== (diffs[i - 1] > 0)) flips++;
  }
  const oscillation = pairs ? flips / pairs : 0;
  let omega;
  if (variance < 200 && Math.abs(mean) < 30) omega = 'STABLE';
  else if (oscillation > 0.5) omega = 'CYCLIC';
  else if (variance > 1500) omega = 'CHAOTIC';
  else omega = 'METASTABLE';
  return { omega, n: xs.length, mean: Number(mean.toFixed(1)), variance: Number(variance.toFixed(1)), oscillation: Number(oscillation.toFixed(2)) };
}
