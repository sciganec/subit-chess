/**
 * SCMF-001 canonical invariants that are checkable at search level.
 *   SCMF-INV-005 determinism          SCMF-INV-009 colour symmetry (search score)
 *   SCMF-INV-011 alpha-beta == minimax SCMF-INV-013 terminal priority
 *   SCMF-INV-004 make/unmake restores the full state
 * Colour symmetry of the static evaluator and perft are covered by engine.eval / core.perft.
 */
import { Engine } from '../src/engine/index.mjs';
import { Position, mirrorFEN } from '../src/engine/core.mjs';
import { cloneParams, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { MATE, INF } from '../src/engine/search.mjs';

let fails = 0;
const check = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 8'
];
const exactParams = () => {
  const p = cloneParams(DEFAULT_PARAMS);
  p.search.nullMove.enabled = false; p.search.lmr.enabled = false;
  p.search.futility.enabled = false; p.search.checkExtension = 0;
  return p;
};
function plainEngine(fen) {
  const e = new Engine(exactParams(), { ttBits: 12, adaptiveTime: false, usePlans: false });
  const s = e.searcher;
  s.useTT = false; s.useNull = false; s.useLMR = false; s.useFutility = false;
  e.setFEN(fen);
  return e;
}

/* INV-011: pruning-free alpha-beta returns the plain-minimax value */
function minimax(s, pos, depth, ply) {
  const inCheck = pos.inCheck();
  if (depth <= 0 && !inCheck) return s.quiescence(pos, -INF, INF, ply, 0);
  let best = -INF, legal = 0;
  for (const m of pos.generateMoves(false)) {
    pos.pushRep();
    const u = pos.makeMove(m);
    if (pos.isAttacked(pos.kingSq[u.us ?? (pos.turn ^ 1)], pos.turn)) { pos.unmakeMove(u); pos.popRep(); continue; }
    legal++;
    const v = -minimax(s, pos, depth - 1, ply + 1);
    pos.unmakeMove(u); pos.popRep();
    if (v > best) best = v;
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  return best;
}
for (const fen of FENS.slice(0, 4)) {
  const e = plainEngine(fen);
  const ab = e.search({ depth: 3, timeMs: 0 });
  const e2 = plainEngine(fen);
  const mm = minimax(e2.searcher, e2.pos, 3, 0);
  check(`alpha-beta == minimax @3  ${fen.split(' ')[0].slice(0, 22)}`, Math.round(ab.score) === Math.round(mm), `ab=${Math.round(ab.score)} mm=${Math.round(mm)}`);
}

/* INV-005: same state + params + version -> identical result */
{
  const run = () => { const e = new Engine(undefined, { ttBits: 16, adaptiveTime: false }); e.setFEN(FENS[1]); const r = e.search({ depth: 5 }); return [r.uci, Math.round(r.score), r.nodes].join('/'); };
  const a = run(), b = run();
  check('deterministic fixed-depth search', a === b, `${a} vs ${b}`);
}

/* INV-009: the search score is colour-antisymmetric under mirroring */
{
  let bad = '';
  for (const fen of FENS) {
    const mk = (f) => { const e = new Engine(undefined, { ttBits: 16, adaptiveTime: false }); e.setFEN(f); return e.search({ depth: 4 }); };
    const a = mk(fen), b = mk(mirrorFEN(fen));
    if (Math.round(a.score) !== Math.round(b.score)) bad += ` ${Math.round(a.score)}/${Math.round(b.score)}`;
  }
  check('search score of a position equals that of its colour mirror (side-to-move view)', !bad, bad);
}

/* INV-013: a mate is reported as a mate score, not a heuristic value */
{
  const e = new Engine(undefined, { ttBits: 16, adaptiveTime: false });
  e.setFEN('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const r = e.search({ depth: 4 });
  check('back-rank mate in 1 -> terminal score, shortest mate preferred', r.uci === 'a1a8' && r.score > MATE - 10, `${r.uci} ${r.score}`);
}

/* INV-004: make/unmake restores the complete state */
{
  let bad = '';
  for (const fen of FENS) {
    const p = Position.fromFEN(fen);
    const f0 = p.fen(), k0 = p.ttKey;
    for (const m of p.generateMoves(false)) {
      const u = p.makeMove(m);
      p.unmakeMove(u);
      if (p.fen() !== f0 || p.ttKey !== k0) { bad = `${fen} ${m}`; break; }
    }
  }
  check('make/unmake round-trips fen and hash for every pseudo-legal move', !bad, bad);
}

console.log(fails === 0 ? '\nSCMF INVARIANTS OK' : `\nSCMF FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
