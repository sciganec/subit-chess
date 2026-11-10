'use strict';
/* ============================================================================
   S₀ = A₀³ ≅ {0,1}⁶ ≅ Z₄³   (SUBIT-∞ v6.14.0, §1)
   ----------------------------------------------------------------------------
   Alphabet A₀ = {T, B, F, N}. Each axis (WHO, WHERE, WHEN) carries a two-bit
   code (SUBIT-CHESS v3.0 §2.1):   code = b1·2 + b2
   Spec §1 Z₄ encoding (Gray cycle, v0.1):
        T (10) ↦ 0,   B (11) ↦ 1,   F (01) ↦ 2,   N (00) ↦ 3
   Adjacent Z₄ values (cyclic, mod 4) differ in exactly one bit of the code.
   The state is an element of A₀³ = 64 states, packed as 6 bits:
        bits 5:4 = axis 0, bits 3:2 = axis 1, bits 1:0 = axis 2.
   This module only defines the encoding and checks it. It asserts no
   dynamics and no equivalence between states (§0.3: do not identify).
   ========================================================================= */

const AXIS_NAMES = ['WHO', 'WHERE', 'WHEN'];
const A0 = ['T', 'B', 'F', 'N'];                 // index = Z4 value
const CODE_OF = { T: 0b10, B: 0b11, F: 0b01, N: 0b00 };
const Z4_TO_CODE = [CODE_OF.T, CODE_OF.B, CODE_OF.F, CODE_OF.N];
const CODE_TO_Z4 = [];
for (let z = 0; z < 4; z++) CODE_TO_Z4[Z4_TO_CODE[z]] = z;

// φ : S₀ → Z₄³ ; state = 6-bit integer, returns [z0, z1, z2]
function toZ4(state) {
  if (!Number.isInteger(state) || state < 0 || state > 63) throw new RangeError('S0 state out of range: ' + state);
  return [
    CODE_TO_Z4[(state >> 4) & 3],
    CODE_TO_Z4[(state >> 2) & 3],
    CODE_TO_Z4[state & 3],
  ];
}
// φ⁻¹ : Z₄³ → S₀
function fromZ4(z) {
  for (const v of z) if (!Number.isInteger(v) || v < 0 || v > 3) throw new RangeError('Z4 component out of range: ' + v);
  return (Z4_TO_CODE[z[0]] << 4) | (Z4_TO_CODE[z[1]] << 2) | Z4_TO_CODE[z[2]];
}
function toLetters(state) {
  return toZ4(state).map(v => A0[v]).join('');
}
function fromLetters(s) {
  if (typeof s !== 'string' || s.length !== 3) throw new RangeError('expected three letters from TBFN');
  return fromZ4([...s].map(ch => {
    const z = A0.indexOf(ch);
    if (z < 0) throw new RangeError('bad letter: ' + ch);
    return z;
  }));
}

module.exports = { AXIS_NAMES, A0, CODE_OF, Z4_TO_CODE, CODE_TO_Z4, toZ4, fromZ4, toLetters, fromLetters };
