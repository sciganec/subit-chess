#!/usr/bin/env node
'use strict';
/* S₀ encoding checks (SUBIT-∞ v6.14.0 §1): exhaustive over all 64 states. */
const assert = require('assert');
const S0 = require('../src/subit/s0.js');
let passed = 0, failed = 0; const fails = [];
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ✗ ' + name + ' — ' + e.message); } }

test('|S₀| = 64 and φ is a bijection onto Z₄³ (exhaustive)', () => {
  const seen = new Set();
  for (let s = 0; s < 64; s++) {
    const z = S0.toZ4(s);
    assert.ok(z.every(v => v >= 0 && v <= 3));
    seen.add(z.join(','));
    assert.strictEqual(S0.fromZ4(z), s, 'round-trip at ' + s);
  }
  assert.strictEqual(seen.size, 64);
});
test('Z₄ encoding table matches spec §1: T→0, B→1, F→2, N→3', () => {
  assert.deepStrictEqual(S0.A0, ['T', 'B', 'F', 'N']);
  assert.deepStrictEqual(S0.Z4_TO_CODE, [0b10, 0b11, 0b01, 0b00]);
});
test('Gray property: cyclically adjacent Z₄ values differ in exactly one code bit', () => {
  for (let z = 0; z < 4; z++) {
    const diff = S0.Z4_TO_CODE[z] ^ S0.Z4_TO_CODE[(z + 1) % 4];
    assert.ok(diff === 1 || diff === 2, `z=${z}`);
  }
});
test('letters round-trip: all 64 three-letter words over {T,B,F,N}', () => {
  let count = 0;
  for (const a of S0.A0) for (const b of S0.A0) for (const c of S0.A0) {
    const w = a + b + c;
    assert.strictEqual(S0.toLetters(S0.fromLetters(w)), w);
    count++;
  }
  assert.strictEqual(count, 64);
});
test('bit packing: axis 0 = bits 5:4, axis 2 = bits 1:0 (TTT = 0b101010 = 42, NNN = 0)', () => {
  assert.strictEqual(S0.fromLetters('TTT'), 0b101010);
  assert.strictEqual(S0.fromLetters('NNN'), 0);
});
test('rejects out-of-range input instead of guessing', () => {
  assert.throws(() => S0.toZ4(64), RangeError);
  assert.throws(() => S0.toZ4(-1), RangeError);
  assert.throws(() => S0.fromLetters('TBX'), RangeError);
  assert.throws(() => S0.fromZ4([0, 1, 4]), RangeError);
});
test('no identification: 64 distinct states map to 64 distinct Z₄³ points', () => {
  const images = new Set();
  for (let s = 0; s < 64; s++) images.add(S0.toZ4(s).join(','));
  assert.strictEqual(images.size, 64);
});

console.log('\n' + '='.repeat(60));
console.log(`S0: ${passed} passed, ${failed} failed`);
for (const f of fails) console.log('  • ' + f);
process.exit(failed ? 1 : 0);
