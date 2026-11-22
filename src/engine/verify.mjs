/**
 * SUBIT-CHESS v3.0.0 — invariant verification
 *
 * Spec basis:
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH §11 (invariant register)
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §24 (search invariants)
 *   docs/theory/04_SUBIT_STRUCTURAL_VALUE_FUNCTION §12 (SVF-INV-*)
 *   docs/theory/11_PLAN_GENERATION SPG-INV-001 .. SPG-INV-006
 *
 * Every check here is *executable*: it returns a list of failures, never a
 * boolean dressed up as a proof. The test suite runs these on the standard
 * perft positions and on self-play lines.
 */

import {
  Position, moveToUci, pieceType, pieceColor, opposite, WHITE, BLACK, PAWN, KING,
  FLAG_CAPTURE, FLAG_EP, MOVE_FLAGS
} from './core.mjs';
import { structuralVector, SVF_COMPONENTS } from './evaluate.mjs';

export const INVARIANT = {
  UCA_003: 'UCA-INV-003  the legal move set at a full node is never reduced',
  UCA_005: 'UCA-INV-005  search owns the decision; heuristics only order',
  UCA_013: 'UCA-INV-013  reproducible decisions in deterministic mode',
  UCA_019: 'UCA-INV-019  full canonical-state identity after make/unmake',
  SVF_007: 'SVF-INV-007  a structural feature is owned by one SVF component',
  SM_003: 'SM-INV-003  relations stay typed',
  SPG_005: 'SPG-INV-005  a plan never contains an illegal move'
};

function fail(list, id, detail) {
  list.push({ id, detail });
}

/** State identity: make/unmake must restore the position bit for bit. */
export function verifyMakeUnmake(pos, { moves = null } = {}) {
  const failures = [];
  const fen0 = pos.fen();
  const key0 = pos.key;
  const perms0 = `${pos.castling}|${pos.ep}|${pos.halfmove}|${pos.fullmove}|${pos.ply}`;
  // UCA-INV-019 says *full* canonical-state identity. Since v3.0.10 the game
  // history is part of rule state (fivefold, ADR 0020), so the repetition stack
  // and its irreversible-move limit belong in this check too. The search pushes
  // before makeMove and pops after unmakeMove, so verify the pair as search uses it.
  const rep0 = pos.rep.slice();
  const repHi0 = pos.repHi.slice();
  const repLimit0 = pos.repLimit;
  const list = moves || pos.legalMoves();
  for (const m of list) {
    pos.pushRep();
    const undo = pos.makeMove(m);
    pos.unmakeMove(undo);
    pos.popRep();
    if (pos.fen() !== fen0) { fail(failures, INVARIANT.UCA_019, `fen changed after ${moveToUci(m)}`); break; }
    if (pos.key !== key0) { fail(failures, INVARIANT.UCA_019, `hash changed after ${moveToUci(m)}`); break; }
    const perms = `${pos.castling}|${pos.ep}|${pos.halfmove}|${pos.fullmove}|${pos.ply}`;
    if (perms !== perms0) { fail(failures, INVARIANT.UCA_019, `state fields changed after ${moveToUci(m)}`); break; }
    if (pos.repLimit !== repLimit0
      || pos.rep.length !== rep0.length
      || pos.repHi.length !== repHi0.length
      || pos.rep.some((v, i) => v !== rep0[i])
      || pos.repHi.some((v, i) => v !== repHi0[i])) {
      fail(failures, INVARIANT.UCA_019, `repetition history changed after ${moveToUci(m)}`);
      break;
    }
  }
  return failures;
}

/** Piece lists must agree with the board (they are derived state). */
export function verifyPieceLists(pos) {
  const failures = [];
  pos.refreshPieces();
  for (let color = 0; color < 2; color++) {
    const seen = new Set();
    for (let i = 0; i < pos.listCnt[color]; i++) {
      const sq = pos.listSq[color][i];
      const p = pos.board[sq];
      if (!p) { fail(failures, INVARIANT.UCA_019, `empty square ${sq} in list of colour ${color}`); continue; }
      if (pieceColor(p) !== color) fail(failures, INVARIANT.UCA_019, `square ${sq} has the wrong colour in the list`);
      if (seen.has(sq)) fail(failures, INVARIANT.UCA_019, `square ${sq} appears twice in the list`);
      seen.add(sq);
    }
    let onBoard = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = pos.board[sq];
      if (p && pieceColor(p) === color) onBoard++;
    }
    if (onBoard !== pos.listCnt[color]) {
      fail(failures, INVARIANT.UCA_019, `list has ${pos.listCnt[color]} of ${onBoard} pieces for colour ${color}`);
    }
  }
  // phase material must match the lists
  let pm = 0;
  for (let color = 0; color < 2; color++) {
    for (let i = 0; i < pos.listCnt[color]; i++) {
      const t = pieceType(pos.board[pos.listSq[color][i]]);
      pm += [0, 1, 1, 1, 2, 4, 0][t];
    }
  }
  if (pm !== pos.phaseMaterial) fail(failures, INVARIANT.UCA_019, `phaseMaterial ${pos.phaseMaterial} != ${pm}`);
  return failures;
}

/** Legal moves must be exactly the pseudo-legal set minus the moves that leave the king in check. */
export function verifyLegalMoves(pos) {
  const failures = [];
  const legal = pos.legalMoves();
  const pseudo = pos.generateMoves(false);
  const us = pos.turn;
  const them = opposite(us);
  const expected = [];
  for (const m of pseudo) {
    const to = (m >> 7) & 127;
    const target = pos.board[to];
    if (target && pieceType(target) === KING) continue;   // a king is never capturable
    const undo = pos.makeMove(m);
    if (!pos.isAttacked(pos.kingSq[us], them)) expected.push(m);
    pos.unmakeMove(undo);
  }
  if (legal.length !== expected.length) {
    fail(failures, INVARIANT.UCA_003, `legal set has ${legal.length} moves, expected ${expected.length}`);
  }
  const a = new Set(legal);
  const b = new Set(expected);
  for (const m of legal) if (!b.has(m)) fail(failures, INVARIANT.UCA_003, `illegal move ${moveToUci(m)} in the legal set`);
  for (const m of expected) if (!a.has(m)) fail(failures, INVARIANT.UCA_003, `missing legal move ${moveToUci(m)}`);
  return failures;
}

/** Position sanity: one king per side, no pawns on the back ranks, no side not to move in check. */
export function verifyPosition(pos) {
  const failures = [];
  const kings = [0, 0];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = pos.board[sq];
    if (!p) continue;
    const t = pieceType(p);
    if (t === KING) kings[pieceColor(p)]++;
    if (t === PAWN) {
      const r = sq >> 4;
      if (r === 0 || r === 7) fail(failures, INVARIANT.UCA_019, `pawn on the back rank at ${sq}`);
    }
  }
  if (kings[0] !== 1) fail(failures, INVARIANT.UCA_019, `white has ${kings[0]} kings`);
  if (kings[1] !== 1) fail(failures, INVARIANT.UCA_019, `black has ${kings[1]} kings`);
  // the side that is NOT to move must not be in check
  if (pos.inCheck(opposite(pos.turn))) {
    fail(failures, INVARIANT.UCA_019, 'the side not to move is in check');
  }
  return failures;
}

/** Captures must be flagged and must remove exactly one enemy piece. */
export function verifyCaptures(pos) {
  const failures = [];
  for (const m of pos.generateMoves(true)) {
    const to = (m >> 7) & 127;
    const flags = MOVE_FLAGS(m);
    const target = pos.board[to];
    const isCapture = !!(flags & FLAG_CAPTURE);
    const isEp = !!(flags & FLAG_EP);
    if (isCapture && !isEp && !target) fail(failures, INVARIANT.UCA_003, `capture flag without a victim on ${to}`);
    if (isEp) {
      const capSq = pos.turn === 0 ? to + 16 : to - 16;
      if (!pos.board[capSq] || pieceType(pos.board[capSq]) !== PAWN) {
        fail(failures, INVARIANT.UCA_003, `en passant without a pawn on ${capSq}`);
      }
    }
    if (!isCapture && target && pieceColor(target) === opposite(pos.turn)) {
      fail(failures, INVARIANT.UCA_003, `capture of ${target} on ${to} is not flagged`);
    }
  }
  return failures;
}

/**
 * SVF-INV-007 — No Double Counting.
 *
 * Perturb one perceptual feature at a time and compare the nine raw SVF axes.
 * A feature that changes two axes is being paid for twice. The audit found
 * exactly that for `centerControl` (A+Q), `openFiles` (A+X) and `hanging`
 * (T+D); each is now owned by one axis. The optional `vectorOf` argument lets
 * the suite inject a deliberately broken vector to prove the check can fail.
 */
export function verifySVFOwnership(pos, percept, structure, ctx, params, vectorOf = structuralVector) {
  const failures = [];
  const base = vectorOf(pos, percept, structure, ctx, params);

  const probes = [];
  for (const color of [WHITE, BLACK]) {
    probes.push([
      'centerControl', color, 'Q',
      (p) => {
        const c = p.centerControl.slice();
        c[color]++;
        p.centerControl = c;
      }
    ], [
      'openFiles', color, 'A',
      (p) => {
        const f = p.openFiles.map((files) => files.slice());
        f[color] = f[color].concat(999);
        p.openFiles = f;
      }
    ], [
      'hanging', color, 'T',
      (p) => {
        const h = p.hanging.map((pieces) => pieces.slice());
        h[color] = h[color].concat({ sq: 0, piece: 0, attackers: 1, defenders: 0 });
        p.hanging = h;
      }
    ]);
  }

  for (const [name, color, owner, mutate] of probes) {
    const p = clonePercept(percept);
    mutate(p);
    const after = vectorOf(pos, p, structure, ctx, params);
    const changed = [];
    for (let i = 0; i < SVF_COMPONENTS.length; i++) {
      if (after[i] !== base[i]) changed.push(SVF_COMPONENTS[i]);
    }
    if (changed.length !== 1 || changed[0] !== owner) {
      fail(failures, INVARIANT.SVF_007,
        `${name}[${color}] changed ${changed.join(',') || 'nothing'}, expected only ${owner}`);
    }
  }
  return failures;
}

function clonePercept(percept) {
  const copy = Object.create(Object.getPrototypeOf(percept));
  for (const key of Object.keys(percept)) copy[key] = percept[key];
  return copy;
}

/** Search invariants: the returned move is legal, the PV replays from the root. */
export function verifySearch(engine, opts = {}) {
  const failures = [];
  const r = engine.search(opts);
  if (!r.move) {
    fail(failures, INVARIANT.UCA_005, 'search returned no move in a non-terminal position');
    return { failures, result: r };
  }
  if (!engine.pos.legalMoves().includes(r.move)) {
    fail(failures, INVARIANT.UCA_005, `search returned an illegal move ${r.uci}`);
  }
  // the PV must be playable from the root
  const pvMoves = r.pvMoves || [];
  const p = engine.pos.clone();
  for (let i = 0; i < pvMoves.length; i++) {
    const m = pvMoves[i];
    if (!p.legalMoves().includes(m)) {
      fail(failures, INVARIANT.UCA_013, `PV move ${i} (${moveToUci(m)}) is illegal in the line`);
      break;
    }
    p.makeMove(m);
  }
  // a mate score must have the sign of the side that mates
  if (r.mate !== null && r.mate !== undefined && Math.sign(r.mate) !== Math.sign(r.score)) {
    fail(failures, INVARIANT.UCA_013, `mate distance ${r.mate} disagrees with score ${r.score}`);
  }
  return { failures, result: r };
}

/** Determinism: the same position and depth must give the same decision. */
export function verifyDeterminism(engine, fen, depth) {
  const failures = [];
  const a = new engine.constructor(engine.params).setFEN(fen).search({ depth });
  const b = new engine.constructor(engine.params).setFEN(fen).search({ depth });
  if (a.uci !== b.uci) fail(failures, INVARIANT.UCA_013, `move differs: ${a.uci} vs ${b.uci}`);
  if (a.score !== b.score) fail(failures, INVARIANT.UCA_013, `score differs: ${a.score} vs ${b.score}`);
  return failures;
}

/** Self-play legality: every move of the line must be legal in sequence. */
export function verifySelfPlay(fen, plies, engine, depth = 4) {
  const failures = [];
  const e = engine || null;
  if (!e) return [{ id: INVARIANT.UCA_005, detail: 'no engine supplied' }];
  e.setFEN(fen);
  const p = new Position();
  p.setFEN(fen);
  for (let i = 0; i < plies; i++) {
    const r = e.search({ depth });
    if (!p.legalMoves().includes(r.move)) {
      fail(failures, INVARIANT.UCA_003, `ply ${i}: ${r.uci} is not legal`);
      break;
    }
    p.makeMove(r.move);
    e.play(r.uci);
    const st = p.status();
    if (st && st.over) break;
  }
  return failures;
}

/** Aggregate everything that can be checked without an engine. */
export function verifyPositionAll(pos) {
  return [
    ...verifyPosition(pos),
    ...verifyPieceLists(pos),
    ...verifyLegalMoves(pos),
    ...verifyCaptures(pos),
    ...verifyMakeUnmake(pos)
  ];
}

/** Human-readable report. */
export function report(failures) {
  if (failures.length === 0) return 'no invariant violations';
  return failures.map((f) => `  ${f.id}: ${f.detail}`).join('\n');
}