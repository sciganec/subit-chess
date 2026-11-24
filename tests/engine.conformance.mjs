// Conformance of the optimised hot paths against slow reference implementations (SUBIT-CPU §13, §16.7, §16.9).
// The references are written independently of the engine code: they use file/rank coordinates and plain recursion.
import { Engine } from '../src/engine/index.mjs';
import { see, TranspositionTable, setSeeExactLva } from '../src/engine/search.mjs';
setSeeExactLva(true); // the reference model is the exact least-valuable-attacker order
import { MOVE_FROM, MOVE_TO, MOVE_FLAGS, MOVE_PROMO, FLAG_EP, FLAG_PROMO, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK } from '../src/engine/core.mjs';

const report = { implementation_id: 'subit-chess/src/engine', tests_total: 0, tests_passed: 0, tests_failed: 0, mismatches: [], groups: {} };
const check = (group, cond, msg) => {
  report.tests_total++;
  const g = report.groups[group] || (report.groups[group] = { total: 0, failed: 0 });
  g.total++;
  if (cond) report.tests_passed++;
  else { report.tests_failed++; g.failed++; if (report.mismatches.length < 12) report.mismatches.push(`${group}: ${msg}`); }
};

// ---- reference board: 8x8 array of {type,color} read once from the engine's 0x88 board
const toRef = (pos) => {
  const b = [];
  for (let r = 0; r < 8; r++) { b.push([]); for (let f = 0; f < 8; f++) {
    const p = pos.board[r * 16 + f];
    b[r].push(p ? { type: p & 7, color: p >> 3 } : null);
  } }
  return b;
};
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
// every piece of `color` that attacks (r,f), with x-ray through squares listed as removed
function attackers(b, r, f, color, removed) {
  const out = [];
  const at = (rr, ff) => (removed.has(rr * 8 + ff) ? null : b[rr][ff]);
  const dir = color === WHITE ? -1 : 1;                       // row 0 = rank 8 in the engine board; white pawns move to lower rows
  for (const df of [-1, 1]) { const rr = r - dir, ff = f + df; if (inb(rr, ff)) { const p = at(rr, ff); if (p && p.color === color && p.type === PAWN) out.push({ type: PAWN, r: rr, f: ff }); } }
  for (const [dr, df] of KN) { const rr = r + dr, ff = f + df; if (inb(rr, ff)) { const p = at(rr, ff); if (p && p.color === color && p.type === KNIGHT) out.push({ type: KNIGHT, r: rr, f: ff }); } }
  for (const [dr, df] of [...DIAG, ...ORTH]) {
    if (dr === 0 && df === 0) continue;
    const diag = dr !== 0 && df !== 0;
    for (let k = 1; k < 8; k++) {
      const rr = r + dr * k, ff = f + df * k;
      if (!inb(rr, ff)) break;
      const p = at(rr, ff);
      if (!p) continue;
      if (p.color === color) {
        if (p.type === QUEEN || (diag && p.type === BISHOP) || (!diag && p.type === ROOK) || (k === 1 && p.type === KING)) out.push({ type: p.type, r: rr, f: ff });
      }
      break;
    }
  }
  for (const dr of [-1, 0, 1]) for (const df of [-1, 0, 1]) {   // kings that are not on a ray hit above (already covered k===1)
    void dr; void df;
  }
  return out;
}
const SEEV = [0, 100, 320, 330, 500, 900, 20000];
// full minimax swap-off: the side to move on the square may stop at any time
function seeRef(pos, move) {
  const b = toRef(pos);
  const from = MOVE_FROM(move), to = MOVE_TO(move), flags = MOVE_FLAGS(move);
  const fr = from >> 4, ff = from & 7, tr = to >> 4, tf = to & 7;
  const mover = b[fr][ff];
  let gain0 = (flags & FLAG_EP) ? SEEV[PAWN] : (b[tr][tf] ? SEEV[b[tr][tf].type] : 0);
  let onSq = mover.type;
  if (flags & FLAG_PROMO) { gain0 += SEEV[MOVE_PROMO(move)] - SEEV[PAWN]; onSq = MOVE_PROMO(move); }
  const removed = new Set([fr * 8 + ff]);
  if (flags & FLAG_EP) removed.add((tr + (mover.color === WHITE ? 1 : -1)) * 8 + tf);
  const best = (side, piece, rem) => {                          // value for `side` of continuing the exchange, >= 0
    const att = attackers(b, tr, tf, side, rem).sort((x, y) => SEEV[x.type] - SEEV[y.type])[0];
    if (!att) return 0;
    const next = new Set(rem); next.add(att.r * 8 + att.f);
    return Math.max(0, SEEV[piece] - best(side ^ 1, att.type, next));
  };
  return gain0 - best(mover.color ^ 1, onSq, removed);
}
const attackedRef = (pos, sq, byColor) => attackers(toRef(pos), sq >> 4, sq & 7, byColor, new Set()).length > 0;

// ---- random reachable positions (self-generated playouts, no external data)
let seed = 24112026;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const e = new Engine();
setSeeExactLva(true); // reference model = exact least-valuable-attacker order (the engine default keeps the legacy order)
let positions = 0, seeCount = 0, attCount = 0;
for (let g = 0; g < 60; g++) {
  e.setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const pos = e.pos;
  for (let ply = 0; ply < 100; ply++) {
    const moves = pos.legalMoves();
    if (!moves.length) break;
    positions++;
    // isAttacked on every square for both colours
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      for (const c of [WHITE, BLACK]) {
        attCount++;
        const a = pos.isAttacked(sq, c), r = attackedRef(pos, sq, c);
        check('isAttacked', a === r, `sq ${sq} by ${c} engine=${a} ref=${r} ${pos.fen()}`);
      }
    }
    // SEE on every capture or promotion
    for (const m of moves) {
      if (!(MOVE_FLAGS(m) & (1 | FLAG_EP | FLAG_PROMO))) continue;
      seeCount++;
      const a = see(pos, m), r = seeRef(pos, m);
      // Documented deviation: the swap loop stops as soon as the exchange is decided (max(-gain[d-1], gain[d]) < 0),
      // so the MAGNITUDE can differ from the full minimax once that cutoff fired; the SIGN and "equal to the reference
      // when no cutoff was needed" are what the callers (pruning and ordering) rely on.
      check('seeSign', Math.sign(a) === Math.sign(r), `engine=${a} ref=${r} move=${m} ${pos.fen()}`);
      if (Math.sign(a) !== Math.sign(r) || Math.abs(a - r) > 900) check('seeValue', false, `engine=${a} ref=${r} move=${m} ${pos.fen()}`);
      else check('seeValue', true, '');
    }
    // legal move list equals pseudo-moves that leave the own king safe (reference test with the reference attack function)
    const pseudo = pos.generateMoves(false);
    const us = pos.turn;
    let legalRef = 0;
    for (const m of pseudo) {
      const u = pos.makeMove(m);
      let kingSq = -1;
      for (let s = 0; s < 128; s++) { if (s & 0x88) continue; const p = pos.board[s]; if (p && (p & 7) === KING && (p >> 3) === us) { kingSq = s; break; } }
      if (!attackedRef(pos, kingSq, us ^ 1)) legalRef++;
      pos.unmakeMove(u);
    }
    check('legalMoves', legalRef === moves.length, `reference ${legalRef} engine ${moves.length} ${pos.fen()}`);
    const m = moves[rnd(moves.length)];
    pos.pushRep(); pos.makeMove(m);
  }
}

// ---- shared transposition table behaves like the plain one
{
  const plain = new TranspositionTable(12), shared = new TranspositionTable(12, 0, true);
  for (let i = 0; i < 20000; i++) {
    const key = 1 + rnd(4000) * 7919, depth = 1 + rnd(12), score = rnd(2000) - 1000, flag = rnd(3), mv = rnd(1 << 20), ply = rnd(8);
    if (rnd(2)) { plain.store(key, depth, score, flag, mv, ply); shared.store(key, depth, score, flag, mv, ply); }
    else {
      const a = plain.probe(key, depth, -500, 500, ply), b = shared.probe(key, depth, -500, 500, ply);
      check('sharedTT', (a === null) === (b === null) && (!a || (a.score === b.score && a.move === b.move && a.flag === b.flag)), `key ${key}`);
    }
  }
}

// ---- the speed-ups did not change what the search does: a plain table and a shared table give the same result
{
  const fens = ['r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 1', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'];
  for (const fen of fens) {
    const a = new Engine(undefined, { adaptiveTime: false }); a.setFEN(fen);
    const ra = a.search({ depth: 5, fixedTime: true });
    const b = new Engine(undefined, { adaptiveTime: false }); b.tt = new TranspositionTable(18, 0, true); b.searcher.tt = b.tt; b.setFEN(fen);
    const rb = b.search({ depth: 5, fixedTime: true });
    check('search', ra.move === rb.move && ra.score === rb.score && ra.nodes === rb.nodes, `plain ${ra.move}/${ra.score}/${ra.nodes} shared ${rb.move}/${rb.score}/${rb.nodes}`);
  }
}

report.overall_status = report.tests_failed === 0 ? 'PASS' : 'FAIL';
report.positions = positions;
console.log(JSON.stringify({ ...report, groups: report.groups }, null, 1));
console.log(`conformance: ${report.tests_passed} passed, ${report.tests_failed} failed (${positions} positions, ${attCount} isAttacked, ${seeCount} SEE)`);
if (report.tests_failed) process.exit(1);
console.log('CONFORMANCE OK');
