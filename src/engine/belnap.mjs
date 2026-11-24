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
 * Representation (SUBIT-CPU v0.1 §2.2, normative): a value is a pair (t, f) of "there is evidence for" /
 * "there is evidence against", packed as two bits with t as the HIGH bit:
 *   N = 00 = (0,0) no information, F = 01 = (0,1), T = 10 = (1,0), B = 11 = (1,1) contradiction.
 * Until v3.0.15 this file had T = 1 and F = 2 (the other way round); the operations are unchanged, only the numeric
 * codes moved, so that a serialised value means the same here and in a conforming SUBIT-CPU implementation.
 */

export const N = 0, F = 1, T = 2, B = 3;
export const NAMES = ['N', 'F', 'T', 'B'];

const tOf = (v) => (v >> 1) & 1;
const fOf = (v) => v & 1;
const make = (t, f) => (t ? 2 : 0) | (f ? 1 : 0);

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

/** Bitwise exclusive-or of the two components (SUBIT-CPU §2.6). Not a knowledge operation. */
export const bxor = (a, b) => a ^ b;
/** NAND / NOR in the truth order (SUBIT-CPU §2.6). */
export const nand = (a, b) => not(and(a, b));
export const nor = (a, b) => not(or(a, b));

/**
 * FOUR_WORD (SUBIT-CPU §3.1, §2.4): eight FOUR cells in 16 bits, stored as two 8-bit planes.
 * Cell i occupies bits 2i+1 (t) and 2i (f) of the word; `planes(word)` gives { t, f } with bit i = cell i.
 * All operations work on every cell at once.
 */
export const wordGet = (word, i) => (word >> (2 * i)) & 3;
export const wordSet = (word, i, v) => (word & ~(3 << (2 * i))) | ((v & 3) << (2 * i));
export function planes(word) {
  let t = 0, f = 0;
  for (let i = 0; i < 8; i++) { t |= ((word >> (2 * i + 1)) & 1) << i; f |= ((word >> (2 * i)) & 1) << i; }
  return { t, f };
}
export function fromPlanes(t, f) {
  let w = 0;
  for (let i = 0; i < 8; i++) w |= ((((t >> i) & 1) << 1) | ((f >> i) & 1)) << (2 * i);
  return w;
}
const P = (word) => planes(word & 0xffff);
export const wordNot = (a) => { const p = P(a); return fromPlanes(p.f, p.t); };
export const wordJoin = (a, b) => (a | b) & 0xffff;        // SJOIN: both planes OR
export const wordMeet = (a, b) => (a & b) & 0xffff;        // SMEET: both planes AND
export const wordAnd = (a, b) => { const x = P(a), y = P(b); return fromPlanes(x.t & y.t, x.f | y.f); };
export const wordOr = (a, b) => { const x = P(a), y = P(b); return fromPlanes(x.t | y.t, x.f & y.f); };
export const wordBxor = (a, b) => (a ^ b) & 0xffff;

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
