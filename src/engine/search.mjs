/**
 * SUBIT-CHESS v3.0.0 — Search Engine
 *
 * Spec basis:
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §4-§24
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART XIV §51-56
 *   docs/theory/33_COMPUTATIONAL_COMPLEXITY  (budgets, determinism)
 *
 * Policy (doc 05 §15.4 — incremental introduction, each step independently verifiable):
 *   minimax → alpha-beta → iterative deepening → PV ordering → TT → quiescence
 *   → killer/history → SUBIT structural ordering → controlled LMR / null / futility
 *
 * Hard constraints:
 *   UCA-INV-003  the legal move set at a full node is never reduced
 *   UCA-INV-005  search owns the decision; heuristics only order and reduce
 *   UCA-INV-013  reproducible decisions in deterministic mode
 */

import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  MATERIAL, pieceType, moveToUci, MOVE_FROM, MOVE_TO, MOVE_FLAGS,
  MOVE_PROMO, FLAG_CAPTURE, FLAG_PROMO, FLAG_EP, FLAG_CASTLE,
  KNIGHT_DELTAS, BISHOP_DIRS, ROOK_DIRS
} from './core.mjs';

export const MATE = 100000;
export const INF = 1000000;
export const MATE_THRESHOLD = MATE - 1000;

export const TT_EXACT = 0;
export const TT_LOWER = 1;
export const TT_UPPER = 2;

const EMPTY_KILLER = [0, 0];
const SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];

function smallestAttacker(pos, to, side, occ) {
  // pawns
  const pawnFromDir = side === WHITE ? 16 : -16; // attackers are behind target from side's perspective
  for (let i = 0; i < 2; i++) {
    const from = to + pawnFromDir + (i === 0 ? -1 : 1);
    if (from & 0x88) continue;
    const p = pos.board[from];
    if (occ[from] && p && (p >> 3) === side && (p & 7) === PAWN) { SEE_ATT.from = from; SEE_ATT.piece = PAWN; return SEE_ATT; }
  }
  for (let i = 0; i < 8; i++) {
    const from = to + KNIGHT_DELTAS[i];
    if (from & 0x88) continue;
    const p = pos.board[from];
    if (occ[from] && p && (p >> 3) === side && (p & 7) === KNIGHT) { SEE_ATT.from = from; SEE_ATT.piece = KNIGHT; return SEE_ATT; }
  }
  for (let i = 0; i < 4; i++) {
    const d = BISHOP_DIRS[i];
    let from = to + d;
    while ((from & 0x88) === 0) {
      if (occ[from]) {
        const p = pos.board[from];
        if (p && (p >> 3) === side) {
          const pt = p & 7;
          if (pt === BISHOP || pt === QUEEN) { SEE_ATT.from = from; SEE_ATT.piece = pt; return SEE_ATT; }
        }
        break;
      }
      from += d;
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = ROOK_DIRS[i];
    let from = to + d;
    while ((from & 0x88) === 0) {
      if (occ[from]) {
        const p = pos.board[from];
        if (p && (p >> 3) === side) {
          const pt = p & 7;
          if (pt === ROOK || pt === QUEEN) { SEE_ATT.from = from; SEE_ATT.piece = pt; return SEE_ATT; }
        }
        break;
      }
      from += d;
    }
  }
  for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
    if (!dr && !df) continue;
    const from = to + dr * 16 + df;
    if (from & 0x88) continue;
    const p = pos.board[from];
    if (occ[from] && p && (p >> 3) === side && (p & 7) === KING) { SEE_ATT.from = from; SEE_ATT.piece = KING; return SEE_ATT; }
  }
  return null;
}

/** Max material value of enemy piece attacked by `piece` on `to` (quiet-move threat heuristic). */
function maxAttackedVictim(pos, to, piece, us) {
  const board = pos.board;
  const them = us ^ 1;
  let best = 0;
  if (piece === PAWN) {
    const dir = us === WHITE ? -16 : 16;
    for (let i = 0; i < 2; i++) {
      const t = to + dir + (i === 0 ? -1 : 1);
      if (t & 0x88) continue;
      const p = board[t];
      if (p && (p >> 3) === them) { const v = SEE_VAL[p & 7]; if (v > best) best = v; }
    }
    return best;
  }
  if (piece === KNIGHT) {
    for (let i = 0; i < 8; i++) {
      const t = to + KNIGHT_DELTAS[i];
      if (t & 0x88) continue;
      const p = board[t];
      if (p && (p >> 3) === them) { const v = SEE_VAL[p & 7]; if (v > best) best = v; }
    }
    return best;
  }
  if (piece === KING) {
    for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
      if (!dr && !df) continue;
      const t = to + dr * 16 + df;
      if (t & 0x88) continue;
      const p = board[t];
      if (p && (p >> 3) === them) { const v = SEE_VAL[p & 7]; if (v > best) best = v; }
    }
    return best;
  }
  if (piece === BISHOP || piece === QUEEN) {
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i];
      let t = to + d;
      while ((t & 0x88) === 0) {
        const p = board[t];
        if (p) {
          if ((p >> 3) === them) { const v = SEE_VAL[p & 7]; if (v > best) best = v; }
          break;
        }
        t += d;
      }
    }
  }
  if (piece === ROOK || piece === QUEEN) {
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i];
      let t = to + d;
      while ((t & 0x88) === 0) {
        const p = board[t];
        if (p) {
          if ((p >> 3) === them) { const v = SEE_VAL[p & 7]; if (v > best) best = v; }
          break;
        }
        t += d;
      }
    }
  }
  return best;
}

const SEE_GAIN = new Int32Array(34);
const SEE_OCC = new Uint8Array(128);
const SEE_ATT = { from: 0, piece: 0 };

export function see(pos, move) {
  const from = MOVE_FROM(move);
  const to = MOVE_TO(move);
  const flags = MOVE_FLAGS(move);
  let victimPiece = (flags & FLAG_EP) ? PAWN : (pos.board[to] ? (pos.board[to] & 7) : 0);
  let gain0 = SEE_VAL[victimPiece];
  if (flags & FLAG_PROMO) gain0 += SEE_VAL[MOVE_PROMO(move)] - SEE_VAL[PAWN];
  let attacker = (flags & FLAG_PROMO) ? MOVE_PROMO(move) : (pos.board[from] & 7);
  SEE_GAIN[0] = gain0;
  for (let i = 0; i < 128; i++) SEE_OCC[i] = pos.board[i] ? 1 : 0;
  SEE_OCC[from] = 0;
  if (flags & FLAG_EP) {
    const capSq = to + (pos.turn === WHITE ? 16 : -16);
    SEE_OCC[capSq] = 0;
  }
  let side = pos.turn ^ 1;
  let depth = 0;
  let cur = attacker;
  while (true) {
    depth++;
    SEE_GAIN[depth] = SEE_VAL[cur] - SEE_GAIN[depth - 1];
    if (Math.max(-SEE_GAIN[depth - 1], SEE_GAIN[depth]) < 0) break;
    const att = smallestAttacker(pos, to, side, SEE_OCC);
    if (!att) break;
    SEE_OCC[att.from] = 0;
    cur = att.piece;
    side ^= 1;
    if (depth > 31) break;
  }
  while (--depth > 0) SEE_GAIN[depth - 1] = -Math.max(-SEE_GAIN[depth - 1], SEE_GAIN[depth]);
  return SEE_GAIN[0];
}

/** History counters saturate at this value (see MoveOrder.addHistory). */
const HISTORY_MAX = 1 << 20;

/**
 * For each king square, the squares from which a piece could check it.
 *
 * A direct check lands on one of these squares (a knight jump or a ray from
 * the king; pawns and sliders are on rays). A *discovered* check instead has
 * its vacated origin on one of them. Testing `origin || destination` before
 * making the move avoids a make/unmake for every quiet move at the horizon
 * while keeping every legal checking move. The table is geometry only — no
 * evaluation, no legality claim; `isAttacked()` after makeMove still decides.
 */
function buildCheckTargets() {
  const table = new Array(128);
  for (let king = 0; king < 128; king++) {
    if (king & 0x88) { table[king] = null; continue; }
    const hit = new Uint8Array(128);
    for (let i = 0; i < 8; i++) {
      const to = king + KNIGHT_DELTAS[i];
      if ((to & 0x88) === 0) hit[to] = 1;
    }
    for (let di = 0; di < 2; di++) {
      const dirs = di === 0 ? BISHOP_DIRS : ROOK_DIRS;
      for (let i = 0; i < 4; i++) {
        const d = dirs[i];
        let to = king + d;
        while ((to & 0x88) === 0) {
          hit[to] = 1;
          to += d;
        }
      }
    }
    table[king] = hit;
  }
  return table;
}
const CHECK_TARGETS = buildCheckTargets();

/**
 * How many search generations a TT entry stays usable.
 *
 * An entry written by an older search was produced under a different move
 * order, so its bound flags can flip the root choice: on the position after
 * 11...O-O a fresh d12 search reported Kxf1 +81.0, while the same search after
 * d6/d8/d10 reported Nf5 +113.2. v3.0.4 kept entries one generation old; with
 * the v3.0.9 quiescence fix (no stand-pat in check) that is no longer enough —
 * a one-generation-old *move hint* from ttMoveFor() reorders the tree and
 * changes the published score even though the entry's score is still rejected.
 * An entry is now usable only inside the search that wrote it. Iterative
 * deepening is unaffected (one generation per root search); Memory still
 * carries the move and score across moves of a game.
 */
const TT_MAX_AGE_DEFAULT = 0; // ADR 0022

/* ------------------------------------------------------------------ *
 * Transposition table
 * ------------------------------------------------------------------ */

export class TranspositionTable {
  constructor(bits = 18, maxAge = TT_MAX_AGE_DEFAULT) {
    this.size = 1 << bits;
    this.mask = this.size - 1;
    this.maxAge = maxAge;
    this.keys = new Float64Array(this.size);
    this.scores = new Int32Array(this.size);
    this.depths = new Int8Array(this.size);
    this.flags = new Int8Array(this.size);
    this.moves = new Int32Array(this.size);
    this.age = new Int32Array(this.size);
    this.generation = 0;
    this.hits = 0;
    this.cutoffs = 0;
  }

  clear() {
    this.keys.fill(0);
    this.depths.fill(0);
    this.flags.fill(0);
    this.moves.fill(0);
    this.generation++;
  }

  resizeBits(bits) {
    bits = Math.max(10, Math.min(28, bits | 0));
    const size = 2 ** bits;
    if (size === this.size) return;
    this.size = size;
    this.mask = size - 1;
    this.keys = new Float64Array(size);
    this.scores = new Int32Array(size);
    this.depths = new Int8Array(size);
    this.flags = new Int8Array(size);
    this.moves = new Int32Array(size);
    this.age = new Int32Array(size);
    this.generation = 0;
    this.hits = 0;
    this.cutoffs = 0;
  }

  resizeMB(mb) {
    const bytesPerEntry = 22; // key8+score4+depth1+flag1+move4+age4
    const entries = Math.max(1024, Math.floor((Math.max(1, mb) * 1024 * 1024) / bytesPerEntry));
    let bits = 10;
    while ((2 ** (bits + 1)) <= entries && bits < 28) bits++;
    this.resizeBits(bits);
  }

  newGeneration() { this.generation++; }

  /**
   * Mate scores carry the absolute ply at which the mate occurs, so an entry
   * reused at another ply must be shifted. `ply` is the distance from the root.
   */
  static toTT(score, ply) {
    if (score > MATE_THRESHOLD) return score + ply;
    if (score < -MATE_THRESHOLD) return score - ply;
    return score;
  }

  static fromTT(score, ply) {
    if (score > MATE_THRESHOLD) return score - ply;
    if (score < -MATE_THRESHOLD) return score + ply;
    return score;
  }

  probe(key, depth, alpha, beta, ply = 0) {
    const idx = (key % this.size) | 0;
    if (this.keys[idx] !== key) return null;
    // stale entries came from a different move order: their bounds can change
    // the root choice, so age them out instead of trusting them (TT_MAX_AGE)
    if (this.generation - this.age[idx] > this.maxAge) return null;
    if (this.depths[idx] < depth) return null;
    const score = TranspositionTable.fromTT(this.scores[idx], ply);
    const flag = this.flags[idx];
    if (flag === TT_EXACT) return { score, move: this.moves[idx], flag };
    if (flag === TT_LOWER && score >= beta) return { score, move: this.moves[idx], flag };
    if (flag === TT_UPPER && score <= alpha) return { score, move: this.moves[idx], flag };
    return { score, move: this.moves[idx], flag, partial: true };
  }

  store(key, depth, score, flag, move, ply = 0) {
    const idx = (key % this.size) | 0;
    const stale = this.keys[idx] === key && (this.generation - this.age[idx] > this.maxAge);
    // AUD-311-06: stale same-key entries must not block replacement.
    // Prefer exact entries at equal depth: do not overwrite an exact bound with a
    // non-exact one from the same ply/depth generation.
    const replace = this.keys[idx] !== key || stale || this.depths[idx] < depth ||
      (this.depths[idx] === depth && !(this.flags[idx] === TT_EXACT && flag !== TT_EXACT));
    if (replace) {
      this.keys[idx] = key;
      this.scores[idx] = TranspositionTable.toTT(score, ply);
      this.depths[idx] = depth;
      this.flags[idx] = flag;
      this.moves[idx] = move;
      this.age[idx] = this.generation;
    }
  }

  moveFor(key) {
    const idx = (key % this.size) | 0;
    return this.keys[idx] === key ? this.moves[idx] : 0;
  }
}

/* ------------------------------------------------------------------ *
 * Move ordering
 * ------------------------------------------------------------------ */

export class MoveOrder {
  constructor(params) {
    this.params = params;
    this.killers = [];                       // [ply][2]
    this.history = new Int32Array(2 * 128 * 128);
    this.counter = new Map();
    for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
    // reusable per-ply ordering buffers: no per-node allocation, and each ply
    // keeps its own buffer because the recursion re-enters scoreMoves deeper.
    // 256 covers the maximum legal move count in standard chess with margin,
    // but the buffers grow instead of silently truncating the legal set.
    this.capacity = 256;
    this.buffers = [];
    this.packs = [];
    for (let p = 0; p < 128; p++) {
      this.buffers.push(new Int32Array(this.capacity));
      this.packs.push(new Float64Array(this.capacity)); // score * 256 + (255 - slot)
    }
    this.packed = this.packs[0]; // compatibility alias; prefer this.packs[ply]
    this.scratch = new Int32Array(this.capacity);
    this.count = 0;
  }

  clear() {
    this.history.fill(0);
    this.killers = [];
    for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
  }

  /** Grow the per-ply scratch arrays instead of dropping legal moves. */
  ensureCapacity(need) {
    if (need <= this.capacity) return;
    let cap = this.capacity;
    while (cap < need) cap *= 2;
    this.capacity = cap;
    for (let p = 0; p < this.buffers.length; p++) {
      const grown = new Int32Array(cap);
      grown.set(this.buffers[p]);
      this.buffers[p] = grown;
      const pack = new Float64Array(cap);
      pack.set(this.packs[p]);
      this.packs[p] = pack;
    }
    this.packed = this.packs[0];
    const scratch = new Int32Array(cap);
    scratch.set(this.scratch);
    this.scratch = scratch;
  }

  /**
   * Fill `buf` with the moves in descending priority order and return the count.
   * Priority = heuristic score; legality is never decided here.
   */
  scoreMoves(pos, moves, ply, ttMove, pvMove) {
    return this.scoreMovesAt(pos, moves, moves.length, ply, ttMove, pvMove, 0);
  }

  /**
   * Score `count` moves from `moves` into ply buffers starting at `offset`.
   * Used by staged move generation to score tactical and quiet batches separately.
   */
  scoreMovesAt(pos, moves, count, ply, ttMove, pvMove, offset) {
    this.ensureCapacity(offset + count);
    const packed = this.packs[ply];
    const buf = this.buffers[ply];
    const board = pos.board;
    const us = pos.turn;
    const us128 = us * 128;
    const w = this.params.search.ordering;
    const wPv = w.pv, wTt = w.tt, wTac = w.tactic, wHis = w.history;
    const killers = this.killers[ply] || EMPTY_KILLER;
    const k0 = killers[0], k1 = killers[1];
    const history = this.history;
    const seeOn = this.params.search.see ? this.params.search.see.enabled !== false : true;

    for (let i = 0; i < count; i++) {
      const m = moves[i];
      let s = 0;
      if (pvMove && m === pvMove) s += wPv;
      if (ttMove && m === ttMove) s += wTt;

      const flags = MOVE_FLAGS(m);
      const from = MOVE_FROM(m);
      const to = MOVE_TO(m);
      if (flags & (FLAG_CAPTURE | FLAG_EP)) {
        const victim = (flags & FLAG_EP) ? PAWN : (board[to] & 7);
        const attacker = board[from] & 7;
        const seeScore = seeOn ? see(pos, m) : 0;
        if (seeOn && seeScore < 0) s += wTac * 0.2 + seeScore * 0.01; // bad capture: below quiet killers/history
        else s += wTac + MATERIAL[victim] * 10 - MATERIAL[attacker];
      } else if (flags & FLAG_PROMO) {
        s += wTac + MATERIAL[MOVE_PROMO(m)] * 8;
      } else {
        if (m === k0) s += wHis * 0.9;
        else if (m === k1) s += wHis * 0.7;
        else s += (history[(us128 + from) * 128 + to] / HISTORY_MAX) * wHis * 0.6;
        // Quiet threat: direct attack on enemy piece. Tactical signal (not Gate 3 structural/context).
        // Keeps b4c5-like quiet refutations visible to shallow search/LMR.
        const movedPiece = board[from] & 7;
        const threat = maxAttackedVictim(pos, to, movedPiece, us);
        if (threat >= 500) s += wHis * 0.8 + threat * 30;       // rook/queen
        else if (threat >= 300) s += wHis * 0.6 + threat * 20;  // minor
      }

      // Gate 3 kill: structural/context ordering removed. Ordering is now
      // pv > tt > tactic > history; legality is never decided here.

      const idx = offset + i;
      const slot = (count - 1 - i) & 255;          // keeps the sort stable on ties
      buf[idx] = m;
      packed[idx] = Math.round(s) * 256 + slot;
    }

    this.count = offset + count;
    return this.count;
  }

  /**
   * Incremental selection: place the best remaining move at `i` in buf/packed.
   * Behavior-preserving vs full sort because packed keys include a deterministic
   * tie-break slot; alpha-beta consumes moves in descending order and often cuts
   * off early, so this avoids sorting the full tail.
   */
  pick(ply, i, n) {
    const packed = this.packs[ply];
    const buf = this.buffers[ply];
    let best = i;
    let bestScore = packed[i];
    for (let j = i + 1; j < n; j++) {
      const s = packed[j];
      if (s > bestScore) { bestScore = s; best = j; }
    }
    if (best !== i) {
      const pm = packed[i]; packed[i] = packed[best]; packed[best] = pm;
      const bm = buf[i]; buf[i] = buf[best]; buf[best] = bm;
    }
  }

  addKiller(ply, m) {
    if (ply < 0 || ply >= this.killers.length) return;
    const k = this.killers[ply];
    if (k[0] === m) return;
    k[1] = k[0];
    k[0] = m;
  }

  addHistory(pos, m, depth) {
    const us = pos.turn;
    const idx = (us * 128 + MOVE_FROM(m)) * 128 + MOVE_TO(m);
    this.history[idx] = Math.min(HISTORY_MAX, this.history[idx] + depth * depth);
  }

  subHistory(pos, m, depth) {
    const us = pos.turn;
    const idx = (us * 128 + MOVE_FROM(m)) * 128 + MOVE_TO(m);
    this.history[idx] = Math.max(-HISTORY_MAX, this.history[idx] - depth * depth);
  }

  ageHistory() {
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 1;
  }
}

/* ------------------------------------------------------------------ *
 * Searcher
 * ------------------------------------------------------------------ */

export class Searcher {
  constructor(evaluator, params, opts = {}) {
    this.ev = evaluator;
    this.params = params;
    this.tt = opts.tt || new TranspositionTable(18);
    this.tt.maxAge = this.params.search?.ttMaxAge ?? 0; // ADR 0022
    this.order = opts.order || new MoveOrder(params);
    this.pos = null;
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
    this.nodeLimit = 0;
    this.pvTable = new Int32Array(128 * 64);   // triangular PV: pvTable[ply*64 + i]
    this.pvLength = new Int32Array(128);
    this.genBuf = Array.from({ length: 128 }, () => []);
    this.probeBuf = [];
    this.checkGenBuf = [];
    this.undoBuf = Array.from({ length: 128 }, () => ({}));
    this.qsBuf = Array.from({ length: 128 }, () => []);
    this.probeUndo = {};
    this.seldepth = 0;
    this.qStalemate = true;   // horizon stalemate check (audit v3.0.6 §4.1)
    this.useTT = true;
    this.useNull = true;
    this.useLMR = true;
    this.useFutility = true;
    this.lastIteration = null;
  }

  setLimits({ timeMs = 0, nodes = 0, depth = 64 } = {}) {
    this.nodeLimit = nodes;
    this.maxDepth = Math.min(64, depth);
  }

  checkStop() {
    if (this.stop) return true;
    if (this.nodeLimit && this.nodes >= this.nodeLimit) { this.stop = true; return true; }
    if (this.deadline && Date.now() >= this.deadline) { this.stop = true; return true; }
    return false;
  }

  /**
   * Horizon stalemate probe with early exit. `legalMoves()` builds the full
   * legal array (and scans make/unmake for every pseudo-move) just to answer
   * "is there at least one?". The AUD-03 rule is unchanged; only the work is
   * reduced on quiet leaves, where the answer is almost always yes.
   */
  hasLegalMove(pos) {
    pos.refreshPieces();
    const us = pos.turn;
    const them = us ^ 1;
    const moves = pos.generateMoves(false, this.probeBuf);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const victim = pos.board[MOVE_TO(m)];
      if (victim && pieceType(victim) === KING) continue;
      const undo = pos.makeMove(m, this.probeUndo);
      const legal = !pos.isAttacked(pos.kingSq[us], them);
      pos.unmakeMove(undo);
      if (legal) return true;
    }
    return false;
  }

  /**
   * The three automatic draws shared by the root and the rule authority
   * (`Position.status()`, ADR 0020). A claimable 50-move or threefold draw is
   * deliberately absent: it is an available claim, not a terminal position.
   */
  automaticDrawReason(pos) {
    if (pos.halfmove >= 150) return 'seventy-five-move rule';
    if (pos.repetitionCount() >= 5) return 'fivefold repetition';
    if (pos.insufficientMaterial()) return 'insufficient material';
    return null;
  }

  /** Root search with iterative deepening. */
  search(pos, opts = {}) {
    const t0 = Date.now();
    this.pos = pos;
    this.nodes = 0;
    // the selective depth belongs to one search: carrying the previous maximum
    // into the next result corrupts the risk estimate and the Us component
    this.seldepth = 0;
    this.stop = false;
    this.maxDepth = Math.min(64, opts.depth || this.maxDepth || 8);
    this.deadline = opts.timeMs ? t0 + opts.timeMs : 0;
    this.nodeLimit = opts.nodes || 0;
    this.pvLength.fill(0);
    this.order.clear();
    this.tt.newGeneration();

    const rootMoves = pos.legalMoves();
    if (rootMoves.length === 0) {
      return { move: 0, score: pos.inCheck() ? -MATE : 0, depth: 0, nodes: 0, pv: [], completed: false, reason: 'no legal moves' };
    }
    // AUD-05: automatic draws are terminal at the root too. The 75-move rule,
    // fivefold repetition and dead material end the game whatever the search
    // would otherwise find; claimable draws (50-move, threefold) stay playable
    // per ADR 0020 and are searched as normal positions.
    const autoDraw = this.automaticDrawReason(pos);
    if (autoDraw) {
      return {
        move: 0, score: 0, scoreSpread: 0, secondScore: 0, depth: 0, nodes: 0,
        pv: [], completed: false, reason: autoDraw, seldepth: 0,
        timeMs: Date.now() - t0, nps: 0, flag: null, ttHits: 0, ttCutoffs: 0
      };
    }
    // a single legal move is not special-cased: it still has a real value
    // (it may be a mate-in-1), which the normal loop below reports exactly

    let best = (opts.prevBest && rootMoves.includes(opts.prevBest)) ? opts.prevBest : rootMoves[0];
    let bestScore = -INF;
    let lastCompleted = null;
    // a remembered score from an earlier search of this position seeds the
    // aspiration window and the first move ordering (doc 05 §21, P3.1)
    let prevScore = typeof opts.prevScore === 'number' && Number.isFinite(opts.prevScore) ? opts.prevScore : 0;

    for (let depth = 1; depth <= this.maxDepth; depth++) {
      const window = this.params.search.aspiration;
      let alpha = depth >= 4 ? prevScore - window.window : -INF;
      let beta = depth >= 4 ? prevScore + window.window : INF;

      let result = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        result = this.negamaxRoot(rootMoves, depth, alpha, beta, prevScore, best);
        if (this.stop && !result.completed) break;
        if (result.flag === TT_EXACT) break;
        // A bound is not a score: re-search with an open window instead of
        // publishing the bound, which hides a mate outside the aspiration
        // window (doc 05 §aspiration, SEARCH-INV-002).
        alpha = -INF;
        beta = INF;
      }
      if (result && result.completed) {
        prevScore = result.score;
        best = result.move;
        bestScore = result.score;
        lastCompleted = {
          depth, move: best, score: bestScore, nodes: this.nodes, flag: result.flag,
          pv: this.extractPv(),
          seldepth: this.seldepth,
          secondScore: result.secondScore
        };
      } else if (result && !lastCompleted && result.move) {
        best = result.move;
        bestScore = result.score;
      }
      if (this.checkStop()) break;
      if (Math.abs(bestScore) >= MATE_THRESHOLD) break;
      if (Date.now() - t0 > (opts.softTimeMs || 0) && opts.softTimeMs) break;
    }

    const elapsed = Date.now() - t0;
    const pv = lastCompleted ? lastCompleted.pv : [best];
    // score, depth and completion must come from the same (completed) iteration:
    // publishing a partial score under an older depth broke score/depth provenance
    const info = lastCompleted;
    // the gap between the best and the second-best root move: a large gap means
    // the decision is clear, a small gap means the position is hard and the
    // choice could flip with a deeper search (audit v3.0.6 §8.2)
    const secondScore = info ? (info.secondScore === -INF ? info.score : info.secondScore) : bestScore;
    const scoreSpread = info ? Math.abs(info.score - secondScore) : 0;
    return {
      move: best,
      score: info ? info.score : bestScore,
      scoreSpread,
      secondScore,
      depth: info ? info.depth : 0,
      nodes: this.nodes,
      seldepth: this.seldepth,
      pv,
      timeMs: elapsed,
      nps: elapsed > 0 ? Math.round((this.nodes * 1000) / elapsed) : 0,
      completed: !!lastCompleted,
      // the bound flag of the iteration that produced score/depth: a published
      // score must be exact (SEARCH-INV-002), never a fail-low/fail-high bound
      flag: info ? info.flag : null,
      ttHits: this.tt.hits,
      ttCutoffs: this.tt.cutoffs
    };
  }

  extractPv() {
    const pv = [];
    const maxLen = Math.min(this.pvLength[0], 64);
    for (let i = 0; i < maxLen; i++) pv.push(this.pvTable[i]);
    return pv;
  }

  negamaxRoot(rootMoves, depth, alpha, beta, prevScore, prevBest) {
    const pos = this.pos;
    let bestScore = -INF;
    let secondScore = -INF;
    let bestMove = 0;
    let completed = true;

    const ttEntry = this.useTT ? this.tt.probe(pos.ttKey, depth, alpha, beta, 0) : null;
    const ttMove = ttEntry ? ttEntry.move : 0;
    const staged = this.params.search.stagedMoveGen === true;
    let alphaOrig = alpha;
    let moveIndex = 0;

    const searchRootMove = (m) => {
      pos.pushRep();
      const undo = pos.makeMove(m, this.undoBuf[0]);
      this.nodes++;
      const givesCheck = pos.inCheck();
      const ext = (givesCheck && this.params.search.checkExtension > 0) ? 1 : 0;
      const nextDepth = Math.max(0, depth - 1 + ext);
      let score;
      if (moveIndex === 0) {
        score = -this.negamax(pos, nextDepth, -beta, -alpha, 1);
      } else {
        score = -this.negamax(pos, nextDepth, -alpha - 1, -alpha, 1);
        if (score > alpha && !this.stop) {
          score = -this.negamax(pos, nextDepth, -beta, -alpha, 1);
        }
      }
      pos.unmakeMove(undo);
      pos.popRep();
      if (this.stop) { completed = false; return true; }
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestMove = m;
        this.pvTable[0] = m;
        this.pvLength[0] = 1 + this.pvLength[1];
        this.copyPvLine(0);
      } else if (score > secondScore) {
        secondScore = score;
      }
      if (score > alpha) alpha = score;
      moveIndex++;
      return alpha >= beta;
    };

    if (!staged) {
      const orderedCount = this.order.scoreMoves(pos, rootMoves, 0, ttMove, prevBest || 0);
      for (let i = 0; i < orderedCount; i++) {
        this.order.pick(0, i, orderedCount);
        const m = this.order.buffers[0][i];
        if (searchRootMove(m)) break;
      }
    } else {
      const tacts = [];
      const quiets = [];
      for (let i = 0; i < rootMoves.length; i++) {
        const m = rootMoves[i];
        const f = MOVE_FLAGS(m);
        if ((f & (FLAG_CAPTURE | FLAG_PROMO | FLAG_EP)) !== 0) tacts.push(m);
        else quiets.push(m);
      }
      let orderedCount = this.order.scoreMoves(pos, tacts, 0, ttMove, prevBest || 0);
      let cut = false;
      for (let i = 0; i < orderedCount; i++) {
        this.order.pick(0, i, orderedCount);
        const m = this.order.buffers[0][i];
        if (searchRootMove(m)) { cut = true; break; }
      }
      if (!cut && !this.stop) {
        orderedCount = this.order.scoreMoves(pos, quiets, 0, ttMove, prevBest || 0);
        for (let i = 0; i < orderedCount; i++) {
          this.order.pick(0, i, orderedCount);
          const m = this.order.buffers[0][i];
          if (searchRootMove(m)) break;
        }
      }
    }

    let flag = TT_EXACT;
    if (completed && bestMove) {
      flag = bestScore <= alphaOrig ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
      if (this.useTT) this.tt.store(pos.ttKey, depth, bestScore, flag, bestMove, 0);
    }
    return { move: bestMove, score: bestScore, secondScore, completed, flag };
  }

  copyPvLine(ply) {
    const len = Math.min(this.pvLength[ply + 1], 63);
    const src = (ply + 1) * 64;
    const dst = ply * 64 + 1;
    for (let i = 0; i < len; i++) this.pvTable[dst + i] = this.pvTable[src + i];
  }

  negamax(pos, depth, alpha, beta, ply) {
    if (this.checkStop()) return 0;
    this.pvLength[ply] = 0;
    if (ply > this.seldepth) this.seldepth = ply;
    const qsBuf = this.qsBuf[ply]; if (qsBuf) qsBuf.length = 0;

    const inCheck = pos.inCheck();

    // horizon: hand over to quiescence. Terminal states are resolved inside
    // quiescence for the side to move (it always generates check evasions).
    if (depth <= 0 && !inCheck) return this.quiescence(pos, alpha, beta, ply, 0);

    // Draw rules inside the search (AUD-04, AUD-08). Only the automatic draws
    // are terminal: the 75-move rule (FIDE 9.6.2), fivefold repetition (9.6.1)
    // and dead material (FIDE 5.2.2). The 50-move rule (9.3) and threefold
    // repetition (9.2) are claimable, not automatic: the position stays
    // playable and is searched normally. ADR 0020 already made that
    // distinction for Position.status() and the horizon; the search now
    // agrees instead of scoring a claimable draw as a terminal 0 and hiding a
    // still-winnable continuation. The piece cache is lazy, so refresh it
    // before asking a derived question right after makeMove() (AUD-08).
    pos.refreshPieces();
    if (pos.halfmove >= 150) return 0;
    if (ply > 0 && pos.repetitionCount() >= 5) return 0;
    // `phaseMaterial <= 2` covers every position where insufficientMaterial()
    // can be true (K vs K, K+minor vs K, K+B vs K+B on one colour complex),
    // while keeping the full piece-list scan off normal nodes (AUD-08).
    if (pos.phaseMaterial <= 2 && pos.insufficientMaterial()) return 0;

    const pvNode = beta - alpha > 1;
    const alphaOrig = alpha;

    let ttMove = 0;
    if (this.useTT && ply > 0) {
      const entry = this.tt.probe(pos.ttKey, depth, alpha, beta, ply);
      if (entry) {
        this.tt.hits++;
        ttMove = entry.move;
        // AUD-311-07: count only actual TT cutoffs as cutoffs; partial entries are hits/hints.
        if (!entry.partial) {
          this.tt.cutoffs++;
          return entry.score;
        }
      }
    }

    // null move pruning (never a legal chess move — search-only)
    if (this.useNull && this.canNull(pos, depth, inCheck, pvNode)) {
      const R = Math.min(this.params.search.nullMove.maxReduction,
        this.params.search.nullMove.reduction + Math.floor(depth / 6));
      const undo = pos.makeNullMove(this.undoBuf[ply]);
      const score = -this.negamax(pos, depth - R, -beta, -beta + 1, ply + 1);
      pos.unmakeNullMove(undo);
      if (this.stop) return 0;
      if (score >= beta) return beta;
    }

    // Reverse futility pruning: if static eval is far above beta at shallow
    // depth, the node is unlikely to fall below beta. Default off; A/B only.
    const rfp = this.params.search.rfp;
    if (rfp && rfp.enabled && !pvNode && !inCheck && depth <= (rfp.maxDepth || 3) && Math.abs(beta) < MATE_THRESHOLD) {
      const staticEval = this.ev.evaluate(pos, depth);
      if (staticEval - (rfp.margin || 80) * depth >= beta) return staticEval;
    }

    const us = pos.turn;
    const them = us ^ 1;
    const staged = this.params.search.stagedMoveGen === true;
    const buf = this.order.buffers[ply];
    let orderedCount;
    if (!staged) {
      const moves = pos.generateMoves(false, this.genBuf[ply]);
      orderedCount = this.order.scoreMoves(pos, moves, ply, ttMove, 0);
    } else {
      const tactMoves = pos.generateMoves(true, this.genBuf[ply], false, true);
      orderedCount = this.order.scoreMovesAt(pos, tactMoves, tactMoves.length, ply, ttMove, 0, 0);
    }
    let stagedQuietsDone = !staged;
    if (staged && !stagedQuietsDone && orderedCount === 0) {
      const quietMoves = pos.generateMoves(false, this.genBuf[ply], true, true);
      const nQuiet = quietMoves.length;
      if (nQuiet > 0) {
        this.order.scoreMovesAt(pos, quietMoves, nQuiet, ply, ttMove, 0, 0);
        orderedCount = nQuiet;
      }
      stagedQuietsDone = true;
    }

    let bestScore = -INF;
    let bestMove = 0;
    let legal = 0;
    let pruned = 0;
    let quietsSearched = 0;
    const lmr = this.params.search.lmr;
    const futility = this.params.search.futility;
    const lmp = this.params.search.lmp;

    for (let i = 0; i < orderedCount; i++) {
      this.order.pick(ply, i, orderedCount);
      const m = buf[i];
      const flags = MOVE_FLAGS(m);
      const to = MOVE_TO(m);
      const isQuiet = !(flags & (FLAG_CAPTURE | FLAG_PROMO)) && pos.board[to] === 0;

      pos.pushRep();
      const undo = pos.makeMove(m, this.undoBuf[ply]);

      // UCA-INV-003: legality is decided by the rules here, not by the ordering
      if (pos.isAttacked(pos.kingSq[us], them)) {
        pos.unmakeMove(undo);
        pos.popRep();
        continue;
      }

      const givesCheck = pos.inCheck();

      // Late move pruning: at shallow depth, skip late quiet moves.
      if (lmp && lmp.enabled && !pvNode && !inCheck && !givesCheck && isQuiet &&
          depth <= (lmp.maxDepth || 3) && quietsSearched >= ((lmp.base || 4) + depth * (lmp.multiplier || 2))) {
        pruned++;
        pos.unmakeMove(undo);
        pos.popRep();
        continue;
      }

      // Futility pruning at the frontier (controlled, never at the PV). It runs
      // after the move is made, because a quiet move that gives check must
      // survive the frontier: a quiet mate in one is exactly the move that
      // `isQuiet` cannot rule out (audit v3.0.6 §4.4).
      if (this.useFutility && futility.enabled && depth <= futility.maxDepth &&
          !pvNode && isQuiet && !inCheck && !givesCheck && bestScore > -INF) {
        // pos is the position *after* the move, i.e. the opponent's turn, so the
        // static score is from their perspective and must be negated before it
        // is compared with alpha (which is the mover's window). Without the
        // negation a good position for the opponent prunes the mover's move.
        const staticScore = -this.ev.evaluate(pos, depth);
        if (staticScore + futility.margin <= alpha) {
          pruned++;
          pos.unmakeMove(undo);
          pos.popRep();
          continue;
        }
      }

      legal++;
      this.nodes++;
      if (isQuiet && !givesCheck) {
        quietsSearched++;
        if (this.params.search.historyMalus) qsBuf.push(m);
      }

      let score;
      let reduction = 0;
      if (this.useLMR && lmr.enabled && depth >= lmr.minDepth && i >= lmr.minMoveIndex &&
          isQuiet && !inCheck && !givesCheck) {
        let threatExempt = false;
        const threatMin = lmr.threatExemptMinVictim || 0;
        if (threatMin > 0) {
          const threat = maxAttackedVictim(pos, to, pos.board[to] & 7, us);
          threatExempt = threat >= threatMin;
        }
        if (!threatExempt) {
          reduction = lmr.reduction || 1;
          if (i >= (lmr.extraMoveIndex || 6)) reduction += (lmr.extraReduction ?? 1);
          if (this.params.search.lmrHistory) {
            const h = this.order.history[(us * 128 + MOVE_FROM(m)) * 128 + to];
            if (h > HISTORY_MAX / 4) reduction = Math.max(0, reduction - 1);
            else if (h < -HISTORY_MAX / 8) reduction += 1;
          }
          if (reduction > (lmr.maxReduction || 3)) reduction = lmr.maxReduction || 3;
          if (depth - reduction < 1) reduction = depth - 1;
        }
      }

      let ext = (givesCheck && this.params.search.checkExtension > 0 && ply < 8) ? 1 : 0;
      if (!ext && isQuiet && !inCheck) {
        const qte = this.params.search.quietThreatExtension;
        if (qte?.enabled && ply <= (qte.maxPly ?? 2)) {
          const threat = maxAttackedVictim(pos, to, pos.board[to] & 7, us);
          if (threat >= (qte.minVictim ?? 900)) ext = 1;
        }
      }
      const nextDepth = Math.max(0, depth - 1 - reduction + ext);

      if (legal === 1) {
        score = -this.negamax(pos, nextDepth, -beta, -alpha, ply + 1);
      } else {
        score = -this.negamax(pos, nextDepth, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && !this.stop) {
          // the null-window (and possibly reduced) search failed high: verify
          // at full depth with the full window. Searching `depth - 1` here
          // would replace a deeper, extended result with a shallower one.
          const fullDepth = depth - 1 + ext;
          score = -this.negamax(pos, Math.max(nextDepth, fullDepth), -beta, -alpha, ply + 1);
        }
      }
      pos.unmakeMove(undo);
      pos.popRep();

      if (this.stop) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          this.pvTable[ply * 64] = m;
          this.pvLength[ply] = 1 + this.pvLength[ply + 1];
          this.copyPvLine(ply);
        }
      }
      if (alpha >= beta) {
        if (isQuiet) {
          this.order.addKiller(ply, m);
          this.order.addHistory(pos, m, depth);
          if (this.params.search.historyMalus) {
            for (let qi = 0, qn = qsBuf.length - 1; qi < qn; qi++) this.order.subHistory(pos, qsBuf[qi], depth);
          }
        }
        if (this.useTT) this.tt.store(pos.ttKey, depth, bestScore, TT_LOWER, m, ply);
        return bestScore;
      }

      if (staged && !stagedQuietsDone && i + 1 === orderedCount) {
        const nTact = orderedCount;
        const quietMoves = pos.generateMoves(false, this.genBuf[ply], true, true);
        const nQuiet = quietMoves.length;
        if (nQuiet > 0) {
          this.order.scoreMovesAt(pos, quietMoves, nQuiet, ply, ttMove, 0, nTact);
          orderedCount = nTact + nQuiet;
        }
        stagedQuietsDone = true;
      }
    }

    if (legal === 0) {
      // A node where every quiet move was futility-pruned was never searched:
      // it is not stalemate, and reporting 0 here hides mates and wins. Fall
      // back to the static evaluation (doc 05 §futility).
      if (pruned > 0) return this.ev.evaluate(pos, depth);
      return inCheck ? -MATE + ply : 0;
    }

    if (this.useTT) {
      const flag = bestScore <= alphaOrig ? TT_UPPER : TT_EXACT;
      this.tt.store(pos.ttKey, depth, bestScore, flag, bestMove, ply);
    }
    return bestScore;
  }

  /** Transposition-table move for the current node (ordering hint only). */
  ttMoveFor(pos, depth) {
    if (!this.useTT) return 0;
    const idx = (pos.ttKey % this.tt.size) | 0;
    if (this.tt.keys[idx] !== pos.ttKey) return 0;
    // the same age rule as probe(): a stale hint would reorder the tree and
    // change the score even when the entry's bound is rejected (AUD-01)
    if (this.tt.generation - this.tt.age[idx] > this.tt.maxAge) return 0;
    return this.tt.depths[idx] >= depth ? this.tt.moves[idx] : 0;
  }

  canNull(pos, depth, inCheck, pvNode) {
    const cfg = this.params.search.nullMove;
    if (!cfg.enabled) return false;
    if (pvNode) return false;
    if (inCheck) return false;
    if (depth < cfg.minDepth) return false;
    // no null move in a position with only pawns and a king (zugzwang risk)
    let hasPiece = false;
    for (let color = 0; color < 2; color++) {
      for (let i = 0; i < pos.listCnt[color]; i++) {
        const t = pieceType(pos.board[pos.listSq[color][i]]);
        if (t !== PAWN && t !== KING) { hasPiece = true; break; }
      }
      if (hasPiece) break;
    }
    return hasPiece;
  }

  /**
   * Horizon fallback for a node still in check at the qsearch cap (AUD-02).
   * A static score of the checked position is not a legal outcome, and -INF
   * would fabricate a loss (the v3.0.0 defect). Resolve the check by one legal
   * evasion and score the resulting position statically; no evasion is mate.
   * No recursion: the cap stays a cap.
   */
  staticCheckEvasion(pos, moves, ply) {
    const us = pos.turn;
    const them = us ^ 1;
    let best = -INF;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      pos.pushRep();
      const undo = pos.makeMove(m, this.undoBuf[ply]);
      if (pos.isAttacked(pos.kingSq[us], them)) {
        pos.unmakeMove(undo);
        pos.popRep();
        continue;
      }
      legal++;
      const score = -this.ev.evaluate(pos, 0);
      pos.unmakeMove(undo);
      pos.popRep();
      if (score > best) best = score;
    }
    return legal === 0 ? -MATE + ply : best;
  }

  quiescence(pos, alpha, beta, ply, qdepth) {
    if (this.checkStop()) return 0;
    if (ply > this.seldepth) this.seldepth = ply;

    // Automatic draws are terminal whatever the depth: the 75-move rule and
    // fivefold repetition (FIDE 9.6) end the game, and dead material (FIDE
    // 5.2.2) ends it as well. The horizon must score 0 instead of evaluating
    // a position that the rule authority already declares finished (AUD-08).
    // Refresh the lazy piece cache before the derived material query.
    pos.refreshPieces();
    if (pos.halfmove >= 150) return 0;
    if (ply > 0 && pos.repetitionCount() >= 5) return 0;
    if (pos.phaseMaterial <= 2 && pos.insufficientMaterial()) return 0;

    const inCheck = pos.inCheck();
    let best;
    let moves;

    if (inCheck) {
      moves = pos.generateMoves(false, this.genBuf[ply]);
      // No stand-pat in check (AUD-01): a static score is not a legal move, so
      // it cannot produce a beta cutoff. -INF lets the first *searched*
      // evasion set the real bound; a node where every evasion is bad cannot
      // be declared good just because the checked position scores well.
      best = -INF;
    } else {
      const stand = this.ev.evaluate(pos, 0);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
      moves = pos.generateMoves(true, this.genBuf[ply]);
      // Stalemate at the horizon, at any qdepth (AUD-03). A quiet position
      // without captures is not evidence of a legal move, and a static score
      // would report a won game as drawn (or the reverse). The probe runs only
      // when no capture was generated, so the common tactical path pays nothing.
      if (moves.length === 0 && this.qStalemate &&
          !this.hasLegalMove(pos)) return 0;
    }

    // The cap. Not in check, `best` already carries the stand-pat value. In
    // check it is -INF: returning it fabricates a loss, and returning a static
    // score of an unresolved check is the AUD-02 defect. Resolve one legal
    // evasion statically instead.
    if (qdepth > 8) return inCheck ? this.staticCheckEvasion(pos, moves, ply) : best;

    const us = pos.turn;
    const them = us ^ 1;
    const orderedCount = this.order.scoreMoves(pos, moves, ply, 0, 0);
    const buf = this.order.buffers[ply];
    const seePrune = this.params.search.see ? this.params.search.see.qsearchPrune !== false : true;
    const seePruneMargin = (this.params.search.see && this.params.search.see.qsearchPruneMargin) || 0;
    const seePruneMinDepth = (this.params.search.see && this.params.search.see.qsearchPruneMinDepth) || 0;
    const deltaMargin = (this.params.search.qsearch && this.params.search.qsearch.deltaMargin) || 200;
    let legal = 0;

    for (let i = 0; i < orderedCount; i++) {
      this.order.pick(ply, i, orderedCount);
      const m = buf[i];
      const flags = MOVE_FLAGS(m);
      const to = MOVE_TO(m);
      if (!inCheck) {
        if (!(flags & FLAG_CAPTURE) && !(flags & FLAG_PROMO)) continue;
        // bad captures are skipped in qsearch; promos still searched
        if (seePrune && qdepth >= seePruneMinDepth && (flags & (FLAG_CAPTURE | FLAG_EP)) && !(flags & FLAG_PROMO) && see(pos, m) < -seePruneMargin) continue;
        // delta pruning: even winning the victim cannot lift alpha. Skip near
        // mate windows: a capture that delivers mate must not be pruned because
        // its material delta understates the true score (A.6/qsearch safety).
        const victim = pos.board[to];
        const victimValue = (flags & FLAG_EP) ? MATERIAL[PAWN] : (victim ? MATERIAL[pieceType(victim)] : 0);
        if (alpha < MATE_THRESHOLD && best + victimValue + deltaMargin < alpha && !(flags & FLAG_PROMO)) continue;
      }
      pos.pushRep();
      const undo = pos.makeMove(m, this.undoBuf[ply]);
      if (pos.isAttacked(pos.kingSq[us], them)) {
        pos.unmakeMove(undo);
        pos.popRep();
        continue;
      }
      legal++;
      this.nodes++;
      const score = -this.quiescence(pos, -beta, -alpha, ply + 1, qdepth + 1);
      pos.unmakeMove(undo);
      pos.popRep();
      if (this.stop) return best;
      if (score > best) {
        best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
    }

    // Quiet checks at the first horizon level (audit A1). A captures-only
    // qsearch cannot see a sacrifice whose first move is a silent check, i.e.
    // the classic attacking horizon blind spot. Bounded on purpose: one qply,
    // at most maxChecks moves, never while already in check, and still subject
    // to legality, alpha/beta and the qdepth cap. `noqchecks` restores the old
    // behaviour so the change can be A/B'd instead of believed.
    const qc = this.params.search.qsearch;
    if (qc && qc.checks && !inCheck && qdepth === 0 && alpha < beta) {
      const checks = [];
      // Cheap geometric prefilter: only moves touching a ray or a knight jump
      // from the enemy king can be a direct check, and only moves that vacate
      // one of those squares can be a discovered check. Everything else is
      // skipped before make/unmake. The full legality test remains below.
      const kingSqThem = pos.kingSq[them];
      const targets = CHECK_TARGETS[kingSqThem];
      const checkMoves = pos.generateMoves(false, this.checkGenBuf);
      const cn = checkMoves.length;
      for (let i = 0; i < cn; i++) {
        const m = checkMoves[i];
        const flags = MOVE_FLAGS(m);
        if (flags & (FLAG_CAPTURE | FLAG_EP | FLAG_PROMO)) continue;
        const from = MOVE_FROM(m), to = MOVE_TO(m);
        // AUD-311-09: castling moves the rook; a discovered rook check can occur
        // even when the king's from/to squares are not in CHECK_TARGETS.
        if (!targets[from] && !targets[to] && !(flags & FLAG_CASTLE)) continue;
        const undo = pos.makeMove(m, this.undoBuf[ply]);
        const givesCheck = pos.isAttacked(kingSqThem, us);
        pos.unmakeMove(undo);
        if (givesCheck) checks.push(m);
      }
      const scoredN = checks.length ? this.order.scoreMoves(pos, checks, ply, 0, 0) : 0;
      const checkCount = Math.min(qc.maxChecks, scoredN);
      const checkBuf = this.order.buffers[ply];
      for (let i = 0; i < checkCount; i++) {
        this.order.pick(ply, i, scoredN);
        const m = checkBuf[i];
        pos.pushRep();
        const undo = pos.makeMove(m, this.undoBuf[ply]);
        if (pos.isAttacked(pos.kingSq[us], them)) {
          pos.unmakeMove(undo);
          pos.popRep();
          continue;
        }
        legal++;
        this.nodes++;
        const score = -this.quiescence(pos, -beta, -alpha, ply + 1, qdepth + 1);
        pos.unmakeMove(undo);
        pos.popRep();
        if (this.stop) return best;
        if (score > best) {
          best = score;
          if (score > alpha) alpha = score;
          if (alpha >= beta) break;
        }
      }
    }
    if (legal === 0 && inCheck) return -MATE + ply;
    return best;
  }
}

/** Search budget from complexity and uncertainty (doc 05 §17.1). */
export function searchBudget({ complexity = 0.5, uncertainty = 0.3, timeRemaining = 1 }) {
  // Both inputs must *increase* effort. The old formula put uncertainty in a
  // divisor (`clock / budget`), so an uncertain position received less time.
  const c = Math.min(1, Math.max(0, complexity));
  const u = Math.min(1, Math.max(0, uncertainty));
  return Math.max(1, Math.round(1 + c * 2 + u * 3)) * Math.max(1, timeRemaining);
}
