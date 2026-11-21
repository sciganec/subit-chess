/**
 * Local transition graph — TOP-01 (State Connectivity) and HOM-01/HOM-02.
 *
 * Spec basis:
 *   docs/theory/48-64/49 §XVI TOP-01, §7.3 cycle rank
 *   docs/theory/48-64/50 §8.1 beta_1, §8.2 cycle basis, §18 HOM-01/02
 *
 * The graph is an analysis layer: these tests also assert that building it
 * leaves the source Position (including its repetition stack) untouched and
 * that every recorded edge is a legal move.
 */
import { Position, mirrorFEN, moveToUci } from '../src/engine/core.mjs';
import {
  NODE_MODES, nodeKey, createGraph, buildTransitionGraph,
  fundamentalCycles, verifyTransitionGraph
} from '../src/engine/topology.mjs';
import { report } from '../src/engine/verify.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const FEN = '7k/8/8/8/8/8/8/R6K w - - 0 1';

/* ---------- synthetic graph with a known answer: two disjoint triangles ---------- */
{
  const nodes = Array.from({ length: 6 }, (_, id) => ({
    id, key: `n${id}`, ply: 0, turn: 0, fen: '', out: [], in: []
  }));
  const pairs = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]];
  const edges = pairs.map(([from, to], id) => ({ id, from, to, uci: `${from}-${to}`, ply: 0 }));
  for (const e of edges) { nodes[e.from].out.push(e.id); nodes[e.to].in.push(e.id); }
  const g = createGraph(nodes, edges);
  g.maxDepth = 0;
  const cycles = fundamentalCycles(g);
  check('synthetic: V=6 E=6 beta0=2 beta1=2',
    g.V === 6 && g.E === 6 && g.beta0 === 2 && g.beta1 === 2,
    `V=${g.V} E=${g.E} b0=${g.beta0} b1=${g.beta1}`);
  check('synthetic: exactly two fundamental cycles', cycles.length === 2, String(cycles.length));
  const f = verifyTransitionGraph(g, cycles);
  check('synthetic: graph invariants hold', f.length === 0, report(f));
  check('synthetic: each cycle is a closed walk',
    cycles.every((c) => c.nodes[0] === c.nodes[c.nodes.length - 1] && c.length === c.edges.length));
}

/* ---------- real position: bounded graph from a rook endgame ---------- */
{
  const pos = new Position();
  pos.setFEN(FEN);
  const before = {
    fen: pos.fen(), key: pos.key,
    rep: pos.rep.length, repHi: pos.repHi.length, repLimit: pos.repLimit
  };
  const g = buildTransitionGraph(pos, 4, { maxNodes: 50000 });
  check('building the graph does not mutate the source position',
    pos.fen() === before.fen && pos.key === before.key &&
    pos.rep.length === before.rep && pos.repHi.length === before.repHi &&
    pos.repLimit === before.repLimit,
    `fen ${pos.fen() === before.fen} key ${pos.key === before.key} ` +
    `rep ${pos.rep.length}/${before.rep} repHi ${pos.repHi.length}/${before.repHi} ` +
    `repLimit ${pos.repLimit}/${before.repLimit}`);
  check('root is vertex 0', g.root === 0 && g.nodes[0].ply === 0);
  check('cycle rank is E - V + beta0', !g.truncated && g.beta1 === g.E - g.V + g.beta0,
    `V=${g.V} E=${g.E} b0=${g.beta0} b1=${g.beta1}`);

  let legalOk = true;
  let degreeOk = true;
  for (const n of g.nodes) {
    const p = new Position();
    p.setFEN(n.fen);
    const legal = p.legalMoves();
    if (n.ply < g.maxDepth && n.out.length !== legal.length) degreeOk = false;
    for (const id of n.out) if (!legal.includes(g.edges[id].move)) legalOk = false;
  }
  check('every recorded edge is a legal move in its source', legalOk);
  check('out-degree equals the legal-move count at every expanded node', degreeOk);

  const cycles = fundamentalCycles(g);
  const f = verifyTransitionGraph(g, cycles);
  check('real graph invariants hold', f.length === 0, report(f));
  check('a reversible rook/king line produces a cycle at the root',
    !g.truncated && g.beta1 >= 1 && cycles.some((c) => c.nodes.includes(g.root)),
    `beta1=${g.beta1}`);

  const again = buildTransitionGraph(pos, 4, { maxNodes: 50000 });
  check('the graph is deterministic for a fixed FEN and depth',
    JSON.stringify(g) === JSON.stringify(again));
}

/* ---------- node identity policies ---------- */
{
  const pos = new Position();
  pos.setFEN(FEN);
  const black = new Position();
  black.setFEN('7k/8/8/8/8/8/8/R6K b - - 0 1');
  check('all three documented identity modes are available',
    NODE_MODES.length === 3 && NODE_MODES.every((m) => typeof nodeKey(pos, m) === 'string'));
  check('position mode distinguishes the side to move',
    nodeKey(pos, 'position') !== nodeKey(black, 'position'));
  check('board mode merges the side to move',
    nodeKey(pos, 'board') === nodeKey(black, 'board'));

  const startPos = nodeKey(pos, 'position');
  const startState = nodeKey(pos, 'state');
  const line = ['a1a2', 'h8h7', 'a2a1', 'h7h8'];
  for (const uci of line) {
    const m = pos.legalMoves().find((x) => moveToUci(x) === uci);
    if (!m) { check(`test line move ${uci} exists`, false); break; }
    pos.pushRep();
    pos.makeMove(m);
  }
  check('a four-ply shuffle returns to the same positional vertex',
    nodeKey(pos, 'position') === startPos);
  check('state mode keeps the rule-relevant repetition distinction',
    nodeKey(pos, 'state') !== startState,
    `${startState} -> ${nodeKey(pos, 'state')}`);
}

/* ---------- terminal and truncation edge cases ---------- */
{
  const mate = new Position();
  mate.setFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  check('fixture is a real checkmate', mate.legalMoves().length === 0);
  const g = buildTransitionGraph(mate, 3);
  check('a terminal root has one vertex and no cycles',
    g.V === 1 && g.E === 0 && g.beta0 === 1 && g.beta1 === 0);
}

{
  const pos = new Position();
  pos.setFEN(FEN);
  const g = buildTransitionGraph(pos, 4, { maxNodes: 5 });
  check('the node cap is enforced and reported', g.truncated === true && g.V <= 5,
    `V=${g.V} truncated=${g.truncated}`);
  const f = verifyTransitionGraph(g);
  check('a truncated graph still satisfies the structural invariants', f.length === 0, report(f));
}

/* ---------- colour symmetry (SVF-INV-002 analogue for graph counts) ---------- */
{
  const a = buildTransitionGraph(new Position().setFEN(FEN), 3, { maxNodes: 50000 });
  const b = buildTransitionGraph(new Position().setFEN(mirrorFEN(FEN)), 3, { maxNodes: 50000 });
  check('mirroring preserves V, E and cycle rank',
    a.V === b.V && a.E === b.E && a.beta0 === b.beta0 && a.beta1 === b.beta1,
    `${a.V}/${a.E}/${a.beta1} vs ${b.V}/${b.E}/${b.beta1}`);
}

console.log(fails === 0 ? '\nTOPOLOGY OK' : `\nTOPOLOGY FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
