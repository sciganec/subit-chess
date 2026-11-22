/**
 * SUBIT-CHESS — bounded local transition graph (TOP-01 / HOM-01 / HOM-02)
 *
 * Spec basis:
 *   docs/theory/48-64/49_SUBIT_CHESS_TOPOLOGY_v0.1.md
 *     §2.1 full state S = (B, p, c, e, h); §3 reachability; §4.1 connectivity;
 *     §7.3 cycle rank; §XVI TOP-01 "State Connectivity".
 *   docs/theory/48-64/50_SUBIT_CHESS_HOMOLOGY_v0.1.md
 *     §2 trajectory; §8.1 beta_1 = |E| - |V| + beta_0; §8.2 cycle basis;
 *     §12.1 board vs full state; §18 HOM-01 / HOM-02.
 *
 * ANALYSIS ONLY. This module never touches legal-move generation, evaluation,
 * pruning or the search decision. Both source documents explicitly forbid
 * autonomous pruning until the structural features are experimentally confirmed
 * (doc 49 §10.2, doc 50 §18/HOM-06, doc 48 §9.3). It also reports raw graph
 * topology, NOT H_1: there are no 2-cells yet, so beta_1 is a cycle rank and
 * nothing more (doc 50 §8.2 "Cycle Basis != Strategic Basis").
 *
 * Node identity and the history component `h`:
 *   The documents define S = (B, p, c, e, h). Position.key already covers
 *   (B, p, c, e). The literal move history is not stored there, and using it
 *   verbatim would make every vertex unique — which destroys every cycle and
 *   makes TOP-01/HOM-01 impossible. Rather than hide that modelling choice,
 *   three deterministic policies are exposed:
 *
 *     'position' (default) — pos.key = (B, p, c, e), the FIDE position identity.
 *       Transpositions merge and positional cycles are detectable.
 *     'state' — pos.key plus rule-relevant coarse history: a halfmove bucket
 *       (the same thresholds as Position.ttKey) and a repetition-count class
 *       capped at 5. This is the closest executable reading of the documents'
 *       `h`; it can split one positional cycle into distinct rule states.
 *     'board' — piece placement only (doc 50 §12.1 Board Homology mode).
 *
 * All three are documented, deterministic and side-effect free. The caller
 * chooses; the graph never chooses silently.
 */

import { moveToUci } from './core.mjs';

export const NODE_MODES = Object.freeze(['position', 'state', 'board']);

/** Deterministic vertex identity for a Position at its current state. */
export function nodeKey(pos, mode = 'position') {
  if (!NODE_MODES.includes(mode)) throw new Error(`unknown node identity mode: ${mode}`);
  if (mode === 'board') return `B:${pos.fen().split(' ')[0]}`;
  const base = pos.key; // exact (B, p, c, e) Zobrist identity
  if (mode === 'position') return `P:${base}`;
  const halfmoveBucket = pos.halfmove < 80 ? 0 : pos.halfmove < 100 ? 1 : pos.halfmove < 150 ? 2 : 3;
  const repetitionClass = Math.min(5, pos.repetitionCount());
  return `S:${base}:${halfmoveBucket}:${repetitionClass}`;
}

/**
 * Fill V, E, beta_0, beta_1 and the weak components of a node/edge graph.
 * Exported so verifiers and synthetic fixtures use the exact same definition
 * as the real graph builder.
 */
export function computeGraphMetrics(graph) {
  const { nodes, edges } = graph;
  const V = nodes.length;
  const E = edges.length;

  const parent = nodes.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (const e of edges) union(e.from, e.to);

  const groups = new Map();
  for (let i = 0; i < V; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const weakComponents = [...groups.values()].map((ids, id) => ({ id, size: ids.length, nodes: ids }));
  const beta0 = weakComponents.length;

  graph.V = V;
  graph.E = E;
  graph.beta0 = beta0;
  graph.beta1 = E - V + beta0;
  graph.weakComponents = weakComponents;
  return graph;
}

/** Convenience constructor for synthetic fixtures and verifiers. */
export function createGraph(nodes = [], edges = []) {
  return computeGraphMetrics({ nodes, edges });
}

/**
 * Build the directed transition graph reachable from a Position within `maxDepth`.
 *
 * The input Position is cloned; make/unmake and pushRep/popRep are balanced, so
 * the caller's position (including its repetition stack) is left bit-for-bit
 * unchanged. Every recorded edge is a legal move in its source node.
 *
 * @param {Position} input
 * @param {number} maxDepth non-negative ply bound
 * @param {{mode?: string, maxNodes?: number, stopAtTerminal?: boolean}} opts
 */
export function buildTransitionGraph(input, maxDepth = 2, opts = {}) {
  if (!input || typeof input.clone !== 'function' || typeof input.legalMoves !== 'function') {
    throw new Error('buildTransitionGraph requires a Position');
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error('maxDepth must be a non-negative integer');
  }
  const mode = opts.mode || 'position';
  if (!NODE_MODES.includes(mode)) throw new Error(`unknown node identity mode: ${mode}`);
  const maxNodes = Number.isInteger(opts.maxNodes) && opts.maxNodes > 0 ? opts.maxNodes : 10000;
  const stopAtTerminal = !!opts.stopAtTerminal;

  const pos = input.clone();
  const nodes = [];
  const edges = [];
  const byKey = new Map();
  let truncated = false;

  const graph = {
    root: -1, mode, maxDepth, maxNodes, stopAtTerminal,
    nodes, edges, truncated,
    V: 0, E: 0, beta0: 0, beta1: 0, weakComponents: []
  };

  function addNode(key, ply) {
    const known = byKey.get(key);
    if (known !== undefined) return known;
    if (nodes.length >= maxNodes) { truncated = true; graph.truncated = true; return -1; }
    const id = nodes.length;
    byKey.set(key, id);
    nodes.push({ id, key, ply, fen: pos.fen(), turn: pos.turn, out: [], in: [] });
    return id;
  }

  const root = addNode(nodeKey(pos, mode), 0);
  graph.root = root;

  // Depth-first expansion: the position is at `current` on entry and on exit.
  // A node is expanded once, at its first discovery, so the recorded out-degree
  // equals the legal-move count of that discovery context.
  function expand(current, ply) {
    if (ply >= maxDepth || truncated) return;
    if (stopAtTerminal && pos.status()) return;
    const moves = pos.legalMoves();
    for (const m of moves) {
      pos.pushRep();
      const undo = pos.makeMove(m);
      const childKey = nodeKey(pos, mode);
      let child = byKey.get(childKey);
      const isNew = child === undefined;
      if (isNew) child = addNode(childKey, ply + 1);
      if (child >= 0) {
        const id = edges.length;
        edges.push({ id, from: current, to: child, move: m, uci: moveToUci(m), ply });
        nodes[current].out.push(id);
        nodes[child].in.push(id);
        if (isNew) expand(child, ply + 1);
      }
      pos.unmakeMove(undo);
      pos.popRep();
      if (truncated) break;
    }
  }

  expand(root, 0);
  return computeGraphMetrics(graph);
}

/** Breadth-first spanning forest of the undirected projection. */
export function spanningForest(graph) {
  const und = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    und[e.from].push(e.id);
    und[e.to].push(e.id);
  }
  const parentEdge = new Array(graph.nodes.length).fill(-1);
  const parentNode = new Array(graph.nodes.length).fill(-1);
  const seen = new Array(graph.nodes.length).fill(false);
  const treeEdges = new Set();
  for (let s = 0; s < graph.nodes.length; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      for (const eid of und[u]) {
        const e = graph.edges[eid];
        const v = e.from === u ? e.to : e.from;
        if (seen[v]) continue;
        seen[v] = true;
        parentEdge[v] = eid;
        parentNode[v] = u;
        treeEdges.add(eid);
        queue.push(v);
      }
    }
  }
  return { parentEdge, parentNode, treeEdges };
}

/**
 * Fundamental cycle basis (doc 50 §8.2). Each non-tree edge closes a unique
 * tree path. `nodes` is a closed walk (last id equals first); `steps` records
 * the exact edge and traversal direction, including reversed tree edges.
 */
export function fundamentalCycles(graph, forest = spanningForest(graph)) {
  const { parentEdge, parentNode, treeEdges } = forest;
  const cycles = [];
  const depth = new Array(graph.nodes.length).fill(0);
  // A parent is discovered before its child, so ascending id order is topological.
  for (let i = 0; i < graph.nodes.length; i++) {
    if (parentNode[i] >= 0) depth[i] = depth[parentNode[i]] + 1;
  }

  // Tree edges on the walk from `start` up to `ancestor`, nearest first.
  function climb(start, ancestor) {
    const ids = [];
    let u = start;
    while (u !== ancestor && parentNode[u] >= 0) {
      ids.push(parentEdge[u]);
      u = parentNode[u];
    }
    return ids;
  }

  for (const e of graph.edges) {
    if (treeEdges.has(e.id)) continue;
    let a = e.from, b = e.to;
    while (depth[a] > depth[b] && a >= 0) a = parentNode[a];
    while (depth[b] > depth[a] && b >= 0) b = parentNode[b];
    while (a !== b && a >= 0 && b >= 0) { a = parentNode[a]; b = parentNode[b]; }
    const lca = a;

    const nodeIds = [e.from];
    const steps = [];
    function walk(ids) {
      let cur = nodeIds[nodeIds.length - 1];
      for (const id of ids) {
        const t = graph.edges[id];
        const next = t.from === cur ? t.to : t.from;
        steps.push({ edge: t.id, from: cur, to: next, uci: t.uci, reversed: t.to === cur });
        cur = next;
        nodeIds.push(next);
      }
    }
    walk(climb(e.from, lca));
    walk(climb(e.to, lca).reverse());

    // Close the walk with the non-tree edge, back to the starting vertex.
    const cur = nodeIds[nodeIds.length - 1];
    steps.push({ edge: e.id, from: cur, to: e.from, uci: e.uci, reversed: e.from !== cur });
    nodeIds.push(e.from);

    cycles.push({
      id: cycles.length,
      nodes: nodeIds,
      edges: steps.map((s) => s.edge),
      steps,
      length: steps.length
    });
  }
  return cycles;
}

/** The boundary operator ∂1 on an oriented walk: ∂1(u->v) = v - u. */
export function boundary1(nodeIds) {
  const coef = new Map();
  for (let i = 0; i + 1 < nodeIds.length; i++) {
    coef.set(nodeIds[i], (coef.get(nodeIds[i]) || 0) - 1);
    coef.set(nodeIds[i + 1], (coef.get(nodeIds[i + 1]) || 0) + 1);
  }
  return coef;
}

export const TOPO_INVARIANT = Object.freeze({
  TG_001: 'TG-INV-001  every edge endpoint is a node in the graph',
  TG_002: 'TG-INV-002  node in/out lists agree with the edge list',
  TG_003: 'TG-INV-003  beta1 = E - V + beta0 and is non-negative',
  TG_004: 'TG-INV-004  each fundamental cycle is closed (boundary1 = 0)',
  TG_005: 'TG-INV-005  the fundamental cycle count equals beta1',
  TG_006: 'TG-INV-006  node keys are unique',
  TG_007: 'TG-INV-007  node plies respect the bounded depth'
});

/** Executable graph invariants, in the failure-list style of verify.mjs. */
export function verifyTransitionGraph(graph, cycles = fundamentalCycles(graph)) {
  const failures = [];
  const fail = (id, detail) => failures.push({ id, detail });
  const count = graph.nodes.length;

  for (const e of graph.edges) {
    if (!Number.isInteger(e.from) || e.from < 0 || e.from >= count ||
        !Number.isInteger(e.to) || e.to < 0 || e.to >= count) {
      fail(TOPO_INVARIANT.TG_001, `edge ${e.id} has an invalid endpoint`);
    }
  }
  const expectedOut = graph.nodes.map(() => []);
  const expectedIn = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    if (Number.isInteger(e.from) && e.from >= 0 && e.from < count) expectedOut[e.from].push(e.id);
    if (Number.isInteger(e.to) && e.to >= 0 && e.to < count) expectedIn[e.to].push(e.id);
  }
  for (const n of graph.nodes) {
    const out = [...n.out].sort((a, b) => a - b).join(',');
    const inn = [...n.in].sort((a, b) => a - b).join(',');
    if (out !== expectedOut[n.id].join(',') || inn !== expectedIn[n.id].join(',')) {
      fail(TOPO_INVARIANT.TG_002, `node ${n.id} incident lists disagree with the edge list`);
    }
  }
  const expectedBeta1 = graph.E - graph.V + graph.beta0;
  if (graph.beta1 !== expectedBeta1 || graph.beta1 < 0) {
    fail(TOPO_INVARIANT.TG_003, `beta1=${graph.beta1}, expected ${expectedBeta1}`);
  }
  for (const c of cycles) {
    const boundary = boundary1(c.nodes);
    if (c.nodes[0] !== c.nodes[c.nodes.length - 1] || [...boundary.values()].some((v) => v !== 0)) {
      fail(TOPO_INVARIANT.TG_004, `cycle ${c.id} is not closed`);
    }
    for (const step of c.steps) {
      const e = graph.edges[step.edge];
      if (!e || step.from !== (step.reversed ? e.to : e.from) || step.to !== (step.reversed ? e.from : e.to)) {
        fail(TOPO_INVARIANT.TG_004, `cycle ${c.id} uses edge ${step.edge} in the wrong direction`);
        break;
      }
    }
  }
  if (cycles.length !== graph.beta1) {
    fail(TOPO_INVARIANT.TG_005, `${cycles.length} fundamental cycles for beta1=${graph.beta1}`);
  }
  const keys = new Set();
  for (const n of graph.nodes) {
    if (keys.has(n.key)) fail(TOPO_INVARIANT.TG_006, `duplicate node key ${n.key}`);
    keys.add(n.key);
    if (!Number.isInteger(n.ply) || n.ply < 0 || n.ply > graph.maxDepth) {
      fail(TOPO_INVARIANT.TG_007, `node ${n.id} has ply ${n.ply}`);
    }
  }
  return failures;
}
