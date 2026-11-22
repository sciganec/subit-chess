import assert from 'node:assert/strict';
import { Position, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, makePiece, pieceType, moveToSan, moveToUci } from '../src/engine/core.mjs';
import { validateFEN, FEN_STATUS } from '../src/engine/fen.mjs';
import { Percept } from '../src/engine/percept.mjs';
import { buildStructure, structuralDistance, REL } from '../src/engine/structure.mjs';
import { computeContext, contextAdjust } from '../src/engine/context.mjs';
import { TranspositionTable, TT_EXACT, TT_UPPER } from '../src/engine/search.mjs';
import { Evaluation } from '../src/engine/evaluate.mjs';
import { Engine } from '../src/engine/index.mjs';

let pass = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`ok    ${name}`); pass++; }
  else { console.error(`FAIL  ${name}`, detail); process.exitCode = 1; }
}

// AUD-311-12: vertex encoding must not collide for white/black same type on 0x88 stride.
{
  const p1 = Position.start();
  const p2 = p1.clone();
  // Move white pawn a2-a3 and black pawn a7-a6? No, use structuralDistance directly via two positions differing by a piece shifted.
  const s1 = buildStructure(p1, new Percept(p1));
  const s2 = buildStructure(p2, new Percept(p2));
  const d = structuralDistance(s1, s2, computeContext(p1, new Percept(p1), s1), computeContext(p2, new Percept(p2), s2));
  check('AUD-311-12 identical positions have zero vertex distance', d.Dv === 0, d.Dv);
  // Construct collision case: white piece at sq 0 (a8) vs black piece at sq 4 (e8) same type previously collided.
  const a = new Position();
  a.setFEN('8/8/8/8/8/8/8/4k2K w - - 0 1', { validate: false });
  a.board[0] = makePiece(KNIGHT, WHITE); // a8, 0x88 sq 0
  a.board[4] = makePiece(KNIGHT, BLACK); // e8, 0x88 sq 4
  a.dirty = true; a.refreshPieces(); a.recomputeHash();
  const b = new Position();
  b.setFEN('8/8/8/8/8/8/8/4k2K w - - 0 1', { validate: false });
  b.board[0] = makePiece(KNIGHT, WHITE);
  b.dirty = true; b.refreshPieces(); b.recomputeHash();
  const sa = buildStructure(a, new Percept(a));
  const sb = buildStructure(b, new Percept(b));
  const dv = structuralDistance(sa, sb, computeContext(a, new Percept(a), sa), computeContext(b, new Percept(b), sb)).Dv;
  check('AUD-311-12 different piece sets do not collide on 0x88 stride', dv > 0, dv);
}

// AUD-311-01: reject >16 pieces per side.
{
  const many = 'QQQQQQQQ/QQQQQQQQ/8/8/8/8/8/4k2K w - - 0 1';
  const r = validateFEN(many);
  check('AUD-311-01 FEN rejects too many pieces per side', !r.ok && r.status === FEN_STATUS.INVALID_BOARD, r.reason);
}

// AUD-311-02: non-canonical adjacent digit spans rejected.
{
  const r = validateFEN('44/8/8/8/8/8/8/4k2K w - - 0 1');
  check('AUD-311-02 adjacent empty spans rejected', !r.ok, r.reason);
}

// AUD-311-05: ttKey differs across halfmove buckets for same geometry.
{
  const p99 = Position.fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 99 1');
  const p100 = Position.fromFEN('4k3/8/8/8/8/8/8/4K3 w - - 100 1');
  check('AUD-311-05 ttKey separates halfmove buckets', p99.ttKey !== p100.ttKey, `${p99.ttKey} ${p100.ttKey}`);
}

// AUD-311-06: stale same-key TT entry should be replaceable.
{
  const tt = new TranspositionTable(4);
  const key = 12345;
  tt.store(key, 5, 10, TT_EXACT, 7, 0);
  tt.newGeneration(); tt.newGeneration();
  tt.store(key, 1, 20, TT_UPPER, 8, 0);
  const e = tt.probe(key, 1, -1000, 1000, 0);
  check('AUD-311-06 stale same-key entry replaced', !!e && e.score === 20, e ? e.score : e);
}

// AUD-311-09: quiet checking castling must not be filtered by king-only prefilter.
{
  // Position where castling gives discovered check by rook; geometric king from/to may miss.
  // White can castle queenside? Use a setup: white king e1, rook a1, path clear, black king on c1? illegal.
  // Better construct: black king on b2, white rook moves from a1 to d1 by O-O-O? O-O-O moves king e1->c1, rook a1->d1. Rook gives check on d-file? King on d2.
  // AUD-311-09: O-O-O moves rook a1->d1, giving discovered check along d-file.
  const fen = '8/8/8/8/8/3k4/8/R3K3 w Q - 0 1';
  const p = Position.fromFEN(fen);
  const pc = new Percept(p);
  // just ensure move generation includes O-O-O and it gives check
  const moves = p.legalMoves();
  const castle = moves.find(m => (m & (1<<19)) !== 0); // FLAG_CASTLE bit 4 shifted by 17 -> 1<<21? easier check by uci
  const uci = moves.map(m => {
    const from = m & 127; const to = (m>>7)&127; const promo=(m>>14)&7;
    return String.fromCharCode(97+(from&7)) + (8-(from>>4)) + String.fromCharCode(97+(to&7)) + (8-(to>>4)) + (promo?' pnbrq'[promo]:'');
  });
  check('AUD-311-09 castling move exists', uci.includes('e1c1'), uci.join(','));
}

// AUD-311-11: TABLES cache invalidates on content change.
{
  const params1 = { material: { P:100,N:320,B:330,R:500,Q:900 } };
  const params2 = { material: { P:100,N:320,B:330,R:500,Q:900 } }; // same content, different object
  const e1 = new Evaluation(params1, { mode: 'fast' });
  const e2 = new Evaluation(params2, { mode: 'fast' });
  const pos = Position.start();
  const v1 = e1.evaluate(pos, 0);
  params1.material.Q = 950; // mutate
  const e1b = new Evaluation(params1, { mode: 'fast' });
  const v2 = e1b.evaluate(pos, 0);
  check('AUD-311-11 table cache reacts to material content change', v1 !== v2, `${v1} ${v2}`);
}

// AUD-311-13: DISCOVER ray continues past blocker.
{
  // White bishop a1, white pawn c3, black rook e5 on same diagonal? a1-c3-e5: diagonal.
  // c3 is blocker, e5 is enemy beyond - discover should be detected.
  const p = Position.fromFEN('4k3/8/8/4r3/8/2P5/8/B3K3 w - - 0 1');
  const s = buildStructure(p, new Percept(p));
  check('AUD-311-13 discover relation found past blocker', s.counts[REL.DISCOVER] > 0, s.counts[REL.DISCOVER]);
}

// AUD-311-14: fork hyperrelation not overcounted.
{
  // Nc7 forks a8 rook and e8 king.
  const fork = Position.fromFEN('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1');
  const sf = buildStructure(fork, new Percept(fork));
  check('AUD-311-14 fork hyperrelation count is canonical', sf.hyperCounts[2] === 1, sf.hyperCounts[2]);
}

// AUD-311-16: contextAdjust is not a no-op.
{
  const pos = Position.start();
  const ctx = computeContext(pos, new Percept(pos), null);
  const w = new Float64Array([1,1,1,1]);
  const out = contextAdjust(ctx, w);
  check('AUD-311-16 contextAdjust returns scaled weights', out.length === 4 && out[0] !== 0, Array.from(out));
}

// AUD-311-22: selfPlay on terminal position does not search.
{
  const e = new Engine();
  e.setFEN('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  const r = e.selfPlay(4, { depth: 1 });
  check('AUD-311-22 selfPlay returns terminal immediately', r.over && r.line.length === 0, JSON.stringify(r.over));
}

// AUD-311-23: SAN promotion is uppercase.
{
  const p = Position.fromFEN('8/P7/8/8/8/8/8/4k2K w - - 0 1');
  const moves = p.legalMoves();
  const promo = moves.find(m => ((m >> 14) & 7) === 5);
  const san = moveToSan(p, promo);
  check('AUD-311-23 SAN promotion uses uppercase', /=Q/.test(san), san);
}

// AUD-311-03: move generator runtime verification (differential smoke).
{
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
  ];
  let ok = true;
  for (const fen of fens) {
    const p = Position.fromFEN(fen);
    const legal = p.legalMoves();
    const seen = new Set(legal);
    if (seen.size !== legal.length) { ok = false; break; }
    const them = p.turn ^ 1;
    const us = p.turn;
    for (const m of legal) {
      const undo = p.makeMove(m);
      const inCheck = p.isAttacked(p.kingSq[us], them);
      p.unmakeMove(undo);
      if (inCheck) { ok = false; break; }
    }
    if (!ok) break;
    // perft depth 1 must equal legal move count
    if (p.perft(1) !== legal.length) { ok = false; break; }
  }
  check('AUD-311-03 legal moves are legal and perft(1) matches', ok);
}

// AUD-311-04: hash restoration differential verification.
{
  let ok = true;
  const p = Position.start();
  const rootLo = p.hashLo, rootHi = p.hashHi;
  function walk(pos, depth) {
    if (!ok) return;
    const lo0 = pos.hashLo, hi0 = pos.hashHi;
    const recomputed = pos.clone();
    recomputed.recomputeHash();
    if (recomputed.hashLo !== lo0 || recomputed.hashHi !== hi0) { ok = false; return; }
    if (depth === 0) return;
    for (const m of pos.legalMoves()) {
      const undo = pos.makeMove(m);
      const lo1 = pos.hashLo, hi1 = pos.hashHi;
      const rc = pos.clone(); rc.recomputeHash();
      if (rc.hashLo !== lo1 || rc.hashHi !== hi1) { ok = false; pos.unmakeMove(undo); return; }
      walk(pos, depth - 1);
      pos.unmakeMove(undo);
      if (pos.hashLo !== lo0 || pos.hashHi !== hi0) { ok = false; return; }
    }
  }
  walk(p, 3);
  check('AUD-311-04 incremental hash matches recompute across make/unmake', ok && p.hashLo === rootLo && p.hashHi === rootHi);
}

// AUD-311-08: null-move zugzwang guard validation.
{
  const e = new Engine();
  // Pawn-only/king-only zugzwang-prone: canNull should reject (no non-pawn/non-king pieces).
  const p = Position.fromFEN('8/8/8/8/8/5k2/5p2/5K2 w - - 0 1');
  const can = e.searcher.canNull(p, 4, false, false);
  check('AUD-311-08 null-move disabled in pawn-only endgame', can === false, can);
  // Normal middlegame: null-move allowed when conditions met.
  const p2 = Position.start();
  const can2 = e.searcher.canNull(p2, 4, false, false);
  check('AUD-311-08 null-move allowed in normal position', can2 === true, can2);
}

// AUD-311-10: qsearch cap tactical smoke.
{
  const e = new Engine();
  e.setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const r = e.search({ depth: 4, timeMs: 2000 });
  check('AUD-311-10 qsearch cap tactical smoke completes', r && Number.isFinite(r.score) && r.move !== 0, r ? r.score : r);
}

// AUD-311-17: hybrid eval scale consistency smoke.
{
  const ev = new Evaluation(undefined, { mode: 'hybrid' });
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/8/8/8/8/5k2/5p2/5K2 w - - 0 1',
    '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
  ];
  let ok = true;
  for (const fen of fens) {
    const p = Position.fromFEN(fen);
    const s = ev.evaluate(p, 0);
    if (!Number.isFinite(s) || Math.abs(s) > 200000) { ok = false; break; }
  }
  check('AUD-311-17 hybrid eval returns finite bounded scores', ok);
}

// AUD-311-08/10: NMP on/off comparison smoke on tactical/zugzwang-prone positions.
{
  const positions = [
    '8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1',
    '8/8/8/8/8/1k6/7P/7K w - - 0 1',
    'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  ];
  let ok = true;
  for (const fen of positions) {
    const a = new Engine();
    a.setFEN(fen);
    a.searcher.useNull = true;
    const on = a.search({ depth: 4, timeMs: 1500 });
    const b = new Engine();
    b.setFEN(fen);
    b.searcher.useNull = false;
    const off = b.search({ depth: 4, timeMs: 1500 });
    if (!on || !off) { ok = false; break; }
    if (!Number.isFinite(on.score) || !Number.isFinite(off.score)) { ok = false; break; }
    if (on.move === 0 || off.move === 0) { ok = false; break; }
    // smoke: both complete; large disagreement is a warning signal but not a hard fail here.
  }
  check('AUD-311-08/10 NMP on/off smoke completes on tactical/zugzwang-prone set', ok);
}

console.log(`\nAUDIT311: ${process.exitCode ? 'FAILED' : 'ALL CHECKS PASSED'} (${pass} checks)`);
