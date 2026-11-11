'use strict';
/* ============================================================================
   Unordered structural fingerprint (WARP v0.4 §12; SUBIT-∞ v6.14.0 T-020′)
   F(T) = (L, h, a): leaves L (ids), depth h(x), a(x,y) = depth of lca(x,y).
   Reconstruction (T-020′): level k, classes of {x : h(x) ≥ k} under
   x ~_k y ⇔ a(x,y) ≥ k; a class is a vertex at depth k; a singleton with h = k
   is a leaf; a class is a child of the class at level k-1 containing it.
   Trees here have no unary nodes (every internal node has ≥ 2 children).
   ============================================================================ */

/* Leaves as {id, path} with path = child indices from the root (object form, subit/tree.js). */
function leavesOf(obj) {
  const out = [];
  const walk = (node, path) => {
    if (node === null) return;
    if ('leaf' in node) { out.push({ id: out.length, path }); return; }
    node.children.forEach((c, i) => walk(c, path.concat([i])));
  };
  walk(obj, []);
  return out;
}

function fingerprint(obj) {
  const leaves = leavesOf(obj);
  const L = leaves.map((x) => x.id);
  const h = leaves.map((x) => x.path.length);
  const a = leaves.map((x) => leaves.map((y) => {
    let k = 0; while (k < x.path.length && k < y.path.length && x.path[k] === y.path[k]) k++;
    return k;
  }));
  return { L, h, a };
}

/* Reconstruct a canonical unordered tree (leaf-labelled) from (L, h, a). */
function reconstruct(fp) {
  const { L, h, a } = fp;
  const K = Math.max(...h);
  // node = { level, members (leaf ids), parent } ; leaf nodes have a leaf id
  let nodes = [];
  let prevClassOf = new Map();   // leaf id -> index of its class at level k-1
  const rootId = 0;
  nodes.push({ level: 0, members: L.slice(), children: [], leaf: null });
  for (const x of L) prevClassOf.set(x, 0);
  for (let k = 1; k <= K; k++) {
    const members = L.filter((x) => h[x] >= k);
    const classes = [];
    for (const x of members) {
      let placed = false;
      for (const c of classes) if (a[x][c[0]] >= k) { c.push(x); placed = true; break; }
      if (!placed) classes.push([x]);
    }
    const newClassOf = new Map();
    for (const c of classes) {
      const parentIdx = prevClassOf.get(c[0]);
      const isLeaf = c.length === 1 && h[c[0]] === k;
      const idx = nodes.length;
      nodes.push({ level: k, members: c, children: [], leaf: isLeaf ? c[0] : null });
      nodes[parentIdx].children.push(idx);
      for (const x of c) newClassOf.set(x, idx);
    }
    prevClassOf = newClassOf;
  }
  const canon = (i) => {
    const n = nodes[i];
    if (n.leaf !== null) return 'L' + n.leaf;
    return '(' + n.children.map(canon).sort().join(',') + ')';
  };
  return canon(rootId);
}

/* Canonical form of the original object tree (same leaf ids as fingerprint). */
function canonicalOf(obj) {
  let id = 0;
  const rec = (node) => {
    if ('leaf' in node) return 'L' + (id++);
    return '(' + node.children.map(rec).sort().join(',') + ')';
  };
  return rec(obj);
}

module.exports = { leavesOf, fingerprint, reconstruct, canonicalOf };
