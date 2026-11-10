#!/usr/bin/env node
'use strict';
/* S⁺ = S₀ × R_fin (SUBIT-∞ v6.14.0 §2.1): literal reading (s,ρ) ↦ (ρ(s),ρ). */
const assert = require('assert');
const S = require('../src/subit/splus.js');
let passed = 0, failed = 0; const fails = [];
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; fails.push(name + ': ' + e.message); console.log('  ✗ ' + name + ' — ' + e.message); } }
const id = Array.from({ length: 64 }, (_, i) => i);

test('rule is a 64-entry table over S₀; values out of range are rejected', () => {
  assert.throws(() => S.makeRule(id.slice(0, 63)), RangeError);
  assert.throws(() => S.makeRule(id.map((v, i) => (i === 5 ? 64 : v))), RangeError);
  assert.doesNotThrow(() => S.makeRule(id));
});
test('step keeps the rule and moves the value by ρ', () => {
  const t = id.slice(); t[7] = 9;
  const s0 = S.makeState(7, t);
  const s1 = S.step(s0);
  assert.strictEqual(s1.s, 9);
  assert.deepStrictEqual(s1.rho, s0.rho); // same rule content (makeRule copies the table)
});
test('S⁺ trajectory equals the orbit of s under ρ (value component, all 64 starts)', () => {
  let x = 31337;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
  for (let k = 0; k < 200; k++) {
    const rho = S.makeRule(Array.from({ length: 64 }, () => rnd() % 64));
    for (let s = 0; s < 64; s++) {
      let st = S.makeState(s, rho);
      let y = s;
      for (let n = 0; n < 10; n++) {
        assert.strictEqual(st.s, y);
        st = S.step(st); y = rho[y];
      }
    }
  }
});
test('classify(S⁺) agrees with the §3.1 classifier on the value orbit', () => {
  const t = id.slice(); t[0] = 1; t[1] = 0;      // 2-cycle on {0,1}
  assert.deepStrictEqual(S.classify(S.makeState(0, t)).class, 'PERIODIC');
  assert.deepStrictEqual(S.classify(S.makeState(5, t)).class, 'FIXED');
});

console.log('\n' + '='.repeat(60));
console.log(`splus: ${passed} passed, ${failed} failed`);
for (const f of fails) console.log('  • ' + f);
process.exit(failed ? 1 : 0);
