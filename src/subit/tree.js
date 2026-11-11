'use strict';
/* ============================================================================
   Tree∞ — total address encoding (SUBIT-∞ v6.14.0, §8)
   ----------------------------------------------------------------------------
   Canonical model: branching b = 3, leaf alphabet A = {00, 01, 10, 11}.
   A tree is coded by a total function t : Pos_3 → S_A over finite words
   u ∈ {0,1,2}*, where
       S_A = {ABSENT, INTERNAL} ⊔ {LEAF(a) : a ∈ A}.
   Conditions (§8.2):
       TC-01 root:            t(ε) ≠ ABSENT
       TC-02 absent closure:  t(u) = ABSENT   ⇒ every child ABSENT
       TC-03 leaf closure:    t(u) = LEAF(a)  ⇒ every child ABSENT
       TC-04 full branching:  t(u) = INTERNAL ⇒ every child ≠ ABSENT
       TC-05 partial:         for PartialTree∞ an INTERNAL node may have ABSENT children
   Decoded objects: null (absent) | {leaf: 'ab'} | {children: [c0, c1, c2]}.
   Enc/Dec are mutually inverse on finite-support codes and finite objects (§8.2,
   T-ENCDEC). Infinite trees are represented by the code function itself; a
   finite prefix is checked with checkTC(t, depth, mode).
   ============================================================================ */

const B = 3;
const DIGITS = ['0', '1', '2'];
const LABELS = ['00', '01', '10', '11'];
const ABSENT = 'ABSENT';
const INTERNAL = 'INTERNAL';
const leafState = (a) => 'LEAF:' + a;
const isLeaf = (s) => typeof s === 'string' && s.startsWith('LEAF:');
const leafLabel = (s) => s.slice(5);

function isValidState(s) {
  return s === ABSENT || s === INTERNAL || (isLeaf(s) && LABELS.includes(leafLabel(s)));
}

/* Check TC-01..TC-04 (TC-05 when mode === 'partial') on all words of length < depth,
   so that every child inspected lies within length ≤ depth. Returns a list of violations. */
function checkTC(t, depth, mode) {
  const partial = mode !== 'full';
  const bad = [];
  const root = t('');
  if (root === ABSENT || !isValidState(root)) bad.push({ rule: 'TC-01', word: '', state: root });
  const words = [''];
  for (let len = 0; len < depth; len++) {
    const next = [];
    for (const u of words) {
      const s = t(u);
      if (!isValidState(s)) { bad.push({ rule: 'STATE', word: u, state: s }); continue; }
      for (const d of DIGITS) {
        const c = t(u + d);
        if (!isValidState(c)) { bad.push({ rule: 'STATE', word: u + d, state: c }); continue; }
        if (s === ABSENT && c !== ABSENT) bad.push({ rule: 'TC-02', word: u + d, state: c });
        if (isLeaf(s) && c !== ABSENT) bad.push({ rule: 'TC-03', word: u + d, state: c });
        if (s === INTERNAL && !partial && c === ABSENT) bad.push({ rule: 'TC-04', word: u + d, state: c });
      }
      if (s === INTERNAL) for (const d of DIGITS) next.push(u + d);
    }
    words.splice(0, words.length, ...next);
  }
  return bad;
}

/* Dec: code function → object tree, truncated at maxDepth (deeper INTERNAL nodes
   are returned as {unknown: true}). For finite-support codes with support depth
   ≤ maxDepth the result is exact. */
function decode(t, maxDepth) {
  const rec = (u, d) => {
    const s = t(u);
    if (s === ABSENT) return null;
    if (isLeaf(s)) return { leaf: leafLabel(s) };
    if (s === INTERNAL) {
      if (d >= maxDepth) return { unknown: true };
      return { children: [rec(u + '0', d + 1), rec(u + '1', d + 1), rec(u + '2', d + 1)] };
    }
    throw new Error('invalid state at ' + JSON.stringify(u) + ': ' + s);
  };
  const root = rec('', 0);
  if (root === null) throw new Error('TC-01 violated: root is ABSENT');
  return root;
}

/* Enc: finite object tree → code function. Words outside the object are ABSENT
   (TC-02 holds by construction). Leaves must have no children (TC-03). */
function encode(obj) {
  if (obj === null || obj === undefined) throw new Error('TC-01: root must not be absent');
  const map = new Map();
  const walk = (node, u) => {
    if (node === null) { map.set(u, ABSENT); return; }
    if (typeof node !== 'object') throw new Error('bad node at ' + JSON.stringify(u));
    if ('leaf' in node) {
      if (!LABELS.includes(node.leaf)) throw new Error('bad leaf label ' + node.leaf);
      map.set(u, leafState(node.leaf));
      return;
    }
    if (!Array.isArray(node.children) || node.children.length !== B) throw new Error('internal node needs 3 children at ' + JSON.stringify(u));
    map.set(u, INTERNAL);
    node.children.forEach((c, i) => walk(c, u + DIGITS[i]));
  };
  walk(obj, '');
  return (u) => (map.has(u) ? map.get(u) : ABSENT);
}

/* Generic full tree: INTERNAL above level k, leaves at level k labelled by rule(u). */
function fullTreeTo(k, rule) {
  return (u) => {
    if (u.length < k) return INTERNAL;
    if (u.length === k) return leafState(rule(u));
    return ABSENT;
  };
}

/* Enumerate all finite objects of depth ≤ d with leaves from LABELS, returns an array. */
function enumerate(d) {
  if (d === 0) return [null, ...LABELS.map((a) => ({ leaf: a }))];
  const sub = enumerate(d - 1);
  const out = [null, ...LABELS.map((a) => ({ leaf: a }))];
  // internal nodes: all triples of subtrees (depth ≤ d-1)
  for (const a of sub) for (const b of sub) for (const c of sub) out.push({ children: [a, b, c] });
  return out;
}

module.exports = { B, DIGITS, LABELS, ABSENT, INTERNAL, leafState, isLeaf, leafLabel, isValidState, checkTC, decode, encode, fullTreeTo, enumerate };
