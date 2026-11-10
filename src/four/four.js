'use strict';
/* ============================================================================
   FOUR — Belnap–Dunn four-valued logic (SUBIT-CPU spec, §2.3 / §3.2–3.4)
   ----------------------------------------------------------------------------
   A FOUR cell is a 2-bit code  x = (t, f):   code = t<<1 | f
     N = 00  (no positive, no negative evidence)
     F = 01  (negative evidence only)
     T = 10  (positive evidence only)
     B = 11  (both)
   A FOUR_WORD packs 8 cells in 16 bits: C0 at bits 15:14 … C7 at bits 1:0.
   Operations act on the two rails independently (pure bit ops, no Boolean
   collapse). Pure CommonJS, no dependencies.
   ========================================================================= */

const N = 0b00, F = 0b01, T = 0b10, B = 0b11;
const NAMES = ['N', 'F', 'T', 'B'];
const CELLS = 8;
const WORD_MASK = 0xFFFF;

const tOf = x => (x >> 1) & 1;   // positive rail
const fOf = x => x & 1;          // negative rail
const mk = (t, f) => ((t & 1) << 1) | (f & 1);

function encode(name) {
  const i = NAMES.indexOf(String(name).toUpperCase());
  if (i < 0) throw new TypeError('unknown FOUR value: ' + name);
  return i;
}
function decode(x) {
  if (!(x >= 0 && x <= 3)) throw new RangeError('FOUR code out of range: ' + x);
  return NAMES[x];
}

// ---- unary / binary cell operations (spec §3.2, §3.3) ----------------------
const not    = x => mk(fOf(x), tOf(x));                                  // (fx, tx)
const and    = (x, y) => mk(tOf(x) & tOf(y), fOf(x) | fOf(y));            // truth-meet
const or     = (x, y) => mk(tOf(x) | tOf(y), fOf(x) & fOf(y));            // truth-join
const sjoin  = (x, y) => mk(tOf(x) | tOf(y), fOf(x) | fOf(y));            // knowledge-join
const smeet  = (x, y) => mk(tOf(x) & tOf(y), fOf(x) & fOf(y));            // knowledge-meet
const bxor   = (x, y) => mk(tOf(x) ^ tOf(y), fOf(x) ^ fOf(y));            // rail-wise XOR
const nand   = (x, y) => not(and(x, y));
const nor    = (x, y) => not(or(x, y));

// ---- orders (spec §3.3) ----------------------------------------------------
// Knowledge order: componentwise on rails  (N ≤k F,T ≤k B)
const leqK = (x, y) => tOf(x) <= tOf(y) && fOf(x) <= fOf(y);
// Truth order: t goes up, f goes down      (F ≤t N,B ≤t T)
const leqT = (x, y) => tOf(x) <= tOf(y) && fOf(x) >= fOf(y);

// ---- FOUR_WORD (16-bit, 8 cells) -------------------------------------------
function wordPack(cells) {
  if (cells.length !== CELLS) throw new RangeError('FOUR_WORD needs 8 cells');
  let w = 0;
  for (let i = 0; i < CELLS; i++) {
    if (!(cells[i] >= 0 && cells[i] <= 3)) throw new RangeError('bad cell at ' + i);
    w |= cells[i] << (14 - 2 * i);
  }
  return w >>> 0;
}
function wordUnpack(w) {
  const out = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) out[i] = (w >>> (14 - 2 * i)) & 3;
  return out;
}
// Bit-parallel versions: operate on the 16-bit word directly.
// Rails are the even/odd bits; t-rail = high bit of each pair.
const TMASK = 0xAAAA, FMASK = 0x5555;   // t-rail bits (bit 1 of each cell) / f-rail bits (bit 0)
const wNot   = w => (((w & FMASK) << 1) | ((w & TMASK) >>> 1)) & WORD_MASK;
const wSJoin = (a, b) => (a | b) & WORD_MASK;   // knowledge join: OR on both rails
const wSMeet = (a, b) => (a & b) & WORD_MASK;   // knowledge meet: AND on both rails
const wBXor  = (a, b) => (a ^ b) & WORD_MASK;   // rail-wise XOR
const wAnd   = (a, b) => (((a & b & TMASK)) | ((a | b) & FMASK)) & WORD_MASK;
const wOr    = (a, b) => (((a | b) & TMASK) | ((a & b) & FMASK)) & WORD_MASK;
const wNand  = (a, b) => wNot(wAnd(a, b));
const wNor   = (a, b) => wNot(wOr(a, b));
// FILL(x): every cell = x.  T → 0xAAAA, F → 0x5555 (spec §7.3)
function wFill(x) {
  if (!(x >= 0 && x <= 3)) throw new RangeError('bad FILL value');
  const cell = x, w = (cell << 14) | (cell << 12) | (cell << 10) | (cell << 8) |
                       (cell << 6) | (cell << 4) | (cell << 2) | cell;
  return w & WORD_MASK;
}
// EQ (spec §7.3): exact bitwise equality → T (0xAAAA) or F (0x5555).
// Deliberately NOT the same as CMP (which is policy-defined, not specified here).
const wEq = (a, b) => (a === b ? wFill(T) : wFill(F));

// ---- gate masks (spec §15.4 / §13.3) ---------------------------------------
// Five gates packed into 10 bits. The spec's example masks imply gate i sits at
// bits 2i+1:2i (gate 0 = least significant pair). Verified in tests against
// T,T,T,T,T = 0x02AA and T,T,T,B,T = 0x02EA.
function gatesMask(values) {
  if (values.length !== 5) throw new RangeError('5 gates required');
  let m = 0;
  for (let i = 0; i < 5; i++) m |= values[i] << (2 * i);
  return m;
}
// Commit rule: all five must be T. N, F and B all block.
const gatesAllTrue = values => values.every(v => v === T);

module.exports = {
  N, F, T, B, NAMES, CELLS, WORD_MASK,
  tOf, fOf, mk, encode, decode,
  not, and, or, sjoin, smeet, bxor, nand, nor,
  leqK, leqT,
  wordPack, wordUnpack,
  wNot, wAnd, wOr, wSJoin, wSMeet, wBXor, wNand, wNor, wFill, wEq,
  gatesMask, gatesAllTrue,
};
