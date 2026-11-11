'use strict';
/* ============================================================================
   Grafting operator (SUBIT-∞ v6.14.0 §9; WARP v0.4 §5)
   ρ_a(f) = Node(f, Leaf(a), Leaf(a)) on full trees (object form, see subit/tree.js).
   T-003: d_F(ρ_a f, ρ_a g) = ½ d_F(f, g), so Lip(ρ_a) = ½ and the Banach fixed
   point p_a = ρ_a(p_a) is unique; its boundary is {(1,1,1,…)}.
   ============================================================================ */
const { encode, decode, checkTC } = require('../subit/tree.js');

/* Object-level grafting: children = [f, Leaf(a), Leaf(a)]. */
function graft(obj, a) {
  if (obj === null) throw new Error('grafting needs a non-empty tree');
  return { children: [obj, { leaf: a }, { leaf: a }] };
}

/* Fixed-point iterate ρ_a^n(x0) as an object (x0 is an object). */
function iterate(x0, a, n) {
  let x = x0;
  for (let k = 0; k < n; k++) x = graft(x, a);
  return x;
}

module.exports = { graft, iterate, encode, decode, checkTC };
