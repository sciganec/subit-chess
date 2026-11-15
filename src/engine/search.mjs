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
  MATERIAL, pieceType, opposite, moveToUci, MOVE_FROM, MOVE_TO, MOVE_FLAGS,
  MOVE_PROMO, FLAG_CAPTURE, FLAG_PROMO, FLAG_EP, FLAG_CASTLE
} from './core.mjs';

export const MATE = 100000;
export const INF = 1000000;
export const MATE_THRESHOLD = MATE - 1000;

export const TT_EXACT = 0;
export const TT_LOWER = 1;
export const TT_UPPER = 2;

const EMPTY_KILLER = [0, 0];

/** History counters saturate at this value (see MoveOrder.addHistory). */
const HISTORY_MAX = 1 << 20;

/* ------------------------------------------------------------------ *
 * Transposition table
 * ------------------------------------------------------------------ */

export class TranspositionTable {
  constructor(bits = 18) {
    this.size = 1 << bits;
    this.mask = this.size - 1;
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
    if (this.keys[idx] !== key || this.depths[idx] <= depth) {
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
    for (let p = 0; p < 128; p++) this.buffers.push(new Int32Array(this.capacity));
    this.packed = new Float64Array(this.capacity); // score * 256 + (255 - slot)
    this.scratch = new Int32Array(this.capacity);
    this.count = 0;
  }

  clear() {
    this.history.fill(0);
    this.killers = [];
    for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
  }

  /** Grow the shared scratch arrays instead of dropping legal moves. */
  ensureCapacity(need) {
    if (need <= this.capacity) return;
    let cap = this.capacity;
    while (cap < need) cap *= 2;
    this.capacity = cap;
    for (let p = 0; p < this.buffers.length; p++) {
      const grown = new Int32Array(cap);
      grown.set(this.buffers[p]);
      this.buffers[p] = grown;
    }
    const packed = new Float64Array(cap);
    packed.set(this.packed);
    this.packed = packed;
    const scratch = new Int32Array(cap);
    scratch.set(this.scratch);
    this.scratch = scratch;
  }

  /**
   * Fill `buf` with the moves in descending priority order and return the count.
   * Priority = heuristic score; legality is never decided here.
   */
  scoreMoves(pos, moves, ply, ttMove, pvMove, ctx) {
    this.ensureCapacity(moves.length);
    const n = moves.length;
    const packed = this.packed;
    const buf = this.buffers[ply];
    const board = pos.board;
    const us = pos.turn;
    const w = this.params.search.ordering;
    const killers = this.killers[ply] || EMPTY_KILLER;
    const history = this.history;
    const struct = ctx && ctx.structural ? ctx.structural : null;
    const ctxBonus = ctx && ctx.contextBonus ? ctx.contextBonus : null;

    for (let i = 0; i < n; i++) {
      const m = moves[i];
      let s = 0;
      if (pvMove && m === pvMove) s += w.pv;
      if (ttMove && m === ttMove) s += w.tt;

      const flags = MOVE_FLAGS(m);
      const to = MOVE_TO(m);
      if (flags & (FLAG_CAPTURE | FLAG_EP)) {
        const victim = (flags & FLAG_EP) ? PAWN : (board[to] & 7);
        const attacker = board[MOVE_FROM(m)] & 7;
        s += w.tactic + MATERIAL[victim] * 10 - MATERIAL[attacker];
      } else if (flags & FLAG_PROMO) {
        s += w.tactic + MATERIAL[MOVE_PROMO(m)] * 8;
      } else if (m === killers[0]) {
        s += w.history * 0.9;
      } else if (m === killers[1]) {
        s += w.history * 0.7;
      } else {
        // history is the lowest level (doc 05 §11): normalise to [0,0.6] so a
        // hot quiet move can never outrank a capture or a plan move
        s += (history[(us * 128 + MOVE_FROM(m)) * 128 + to] / HISTORY_MAX) * w.history * 0.6;
      }

      // structural priority (doc 05 §11.4) — order only, never a legality filter.
      // turn is passed so a root-side plan cannot boost the opponent's replies.
      if (struct) { const b = struct(m, us); if (b) s += w.struct * b; }
      if (ctxBonus) { const b = ctxBonus(m); if (b) s += w.context * b; }

      const slot = (n - 1 - i) & 255;          // keeps the sort stable on ties
      buf[i] = m;
      packed[i] = Math.round(s) * 256 + slot;
    }

    const view = packed.subarray(0, n);
    view.sort();
    const scratch = this.scratch;
    for (let i = 0; i < n; i++) scratch[i] = buf[i];
    for (let k = n - 1, o = 0; k >= 0; k--, o++) {
      buf[o] = scratch[n - 1 - (view[k] & 255)];
    }
    this.count = n;
    return n;
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
    this.history[idx] = Math.min(1 << 20, this.history[idx] + depth * depth);
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
    this.order = opts.order || new MoveOrder(params);
    this.pos = null;
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
    this.nodeLimit = 0;
    this.pvTable = new Int32Array(128 * 64);   // triangular PV: pvTable[ply*64 + i]
    this.pvLength = new Int32Array(128);
    this.seldepth = 0;
    this.useTT = true;
    this.useNull = true;
    this.useLMR = true;
    this.useFutility = true;
    this.trace = null;
    this.lastIteration = null;
    this.structuralBonus = null;   // (m) => number, provided by the plan layer
    this.contextBonus = null;
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

  /** Root search with iterative deepening. */
  search(pos, opts = {}) {
    const t0 = Date.now();
    this.pos = pos;
    this.nodes = 0;
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
    // a single legal move is not special-cased: it still has a real value
    // (it may be a mate-in-1), which the normal loop below reports exactly

    let best = rootMoves[0];
    let bestScore = -INF;
    let lastCompleted = null;
    let prevScore = 0;

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
          depth, move: best, score: bestScore, nodes: this.nodes,
          pv: this.extractPv(),
          seldepth: this.seldepth
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
    return {
      move: best,
      score: info ? info.score : bestScore,
      depth: info ? info.depth : 0,
      nodes: this.nodes,
      seldepth: this.seldepth,
      pv,
      timeMs: elapsed,
      nps: elapsed > 0 ? Math.round((this.nodes * 1000) / elapsed) : 0,
      completed: !!lastCompleted,
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
    let bestMove = 0;
    let completed = true;

    const ttEntry = this.useTT ? this.tt.probe(pos.key, depth, alpha, beta, 0) : null;
    const ttMove = ttEntry ? ttEntry.move : 0;
    const orderedCount = this.order.scoreMoves(pos, rootMoves, 0, ttMove, prevBest || 0, {
      structural: this.structuralBonus,
      contextBonus: this.contextBonus
    });

    let alphaOrig = alpha;
    for (let i = 0; i < orderedCount; i++) {
      const m = this.order.buffers[0][i];
      pos.pushRep();
      const undo = pos.makeMove(m);
      this.nodes++;
      let score;
      if (i === 0) {
        score = -this.negamax(pos, depth - 1, -beta, -alpha, 1);
      } else {
        score = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, 1);
        if (score > alpha && !this.stop) {
          score = -this.negamax(pos, depth - 1, -beta, -alpha, 1);
        }
      }
      pos.unmakeMove(undo);
      pos.popRep();

      if (this.stop) { completed = false; break; }
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        this.pvTable[0] = m;
        this.pvLength[0] = 1 + this.pvLength[1];
        this.copyPvLine(0);
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    let flag = TT_EXACT;
    if (completed && bestMove) {
      flag = bestScore <= alphaOrig ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
      if (this.useTT) this.tt.store(pos.key, depth, bestScore, flag, bestMove, 0);
    }
    return { move: bestMove, score: bestScore, completed, flag };
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

    const inCheck = pos.inCheck();

    // horizon: hand over to quiescence. Terminal states are resolved inside
    // quiescence for the side to move (it always generates check evasions).
    if (depth <= 0 && !inCheck) return this.quiescence(pos, alpha, beta, ply, 0);

    // Draw rules inside the search. The 75-move rule (FIDE 9.6.2) and fivefold
    // repetition (9.6.1) are automatic; the 50-move rule (9.3) and threefold
    // repetition (9.2) are claimable, which in practice means the opponent will
    // claim them. Both are therefore scored as 0: a side that is better must
    // avoid the repetition instead of shuffling into a draw.
    if (pos.halfmove >= 150) return 0;
    if (ply > 0) {
      if (pos.repetitionCount() >= 5) return 0;
      if (pos.repetitionCount() >= 3) return 0;
      if (pos.halfmove >= 100) return 0;
    }

    const pvNode = beta - alpha > 1;
    const alphaOrig = alpha;

    if (this.useTT && ply > 0) {
      const entry = this.tt.probe(pos.key, depth, alpha, beta, ply);
      if (entry && !entry.partial) {
        this.tt.hits++;
        return entry.score;
      }
      if (entry && entry.move) this.tt.cutoffs++;
    }

    // null move pruning (never a legal chess move — search-only)
    if (this.useNull && this.canNull(pos, depth, inCheck, pvNode)) {
      const R = Math.min(this.params.search.nullMove.maxReduction,
        this.params.search.nullMove.reduction + Math.floor(depth / 6));
      const undo = pos.makeNullMove();
      const score = -this.negamax(pos, depth - R, -beta, -beta + 1, ply + 1);
      pos.unmakeNullMove(undo);
      if (this.stop) return 0;
      if (score >= beta) return beta;
    }

    const us = pos.turn;
    const them = opposite(us);
    const moves = pos.generateMoves(false);
    const orderedCount = this.order.scoreMoves(pos, moves, ply, this.ttMoveFor(pos, depth), 0, {
      structural: this.structuralBonus,
      contextBonus: this.contextBonus
    });
    const buf = this.order.buffers[ply];

    let bestScore = -INF;
    let bestMove = 0;
    let legal = 0;
    let pruned = 0;
    const lmr = this.params.search.lmr;
    const futility = this.params.search.futility;

    for (let i = 0; i < orderedCount; i++) {
      const m = buf[i];
      const flags = MOVE_FLAGS(m);
      const isQuiet = !(flags & (FLAG_CAPTURE | FLAG_PROMO)) && pos.board[MOVE_TO(m)] === 0;

      // futility pruning at the frontier (controlled, never at the PV)
      if (this.useFutility && futility.enabled && depth <= futility.maxDepth &&
          !pvNode && isQuiet && !inCheck && bestScore > -INF) {
        const staticScore = this.ev.evaluate(pos, depth);
        if (staticScore + futility.margin <= alpha) { pruned++; continue; }
      }

      pos.pushRep();
      const undo = pos.makeMove(m);

      // UCA-INV-003: legality is decided by the rules here, not by the ordering
      if (pos.isAttacked(pos.kingSq[us], them)) {
        pos.unmakeMove(undo);
        pos.popRep();
        continue;
      }
      legal++;
      this.nodes++;

      let score;
      const givesCheck = pos.inCheck();
      let reduction = 0;
      if (this.useLMR && lmr.enabled && depth >= lmr.minDepth && i >= lmr.minMoveIndex &&
          isQuiet && !inCheck && !givesCheck) {
        reduction = 1 + (i >= 6 ? 1 : 0);
        if (depth - reduction < 1) reduction = depth - 1;
      }

      const ext = (givesCheck && this.params.search.checkExtension > 0 && ply < 8) ? 1 : 0;
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
        }
        if (this.useTT) this.tt.store(pos.key, depth, bestScore, TT_LOWER, m, ply);
        return bestScore;
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
      this.tt.store(pos.key, depth, bestScore, flag, bestMove, ply);
    }
    return bestScore;
  }

  /** Transposition-table move for the current node (ordering hint only). */
  ttMoveFor(pos, depth) {
    if (!this.useTT) return 0;
    const idx = (pos.key % this.tt.size) | 0;
    if (this.tt.keys[idx] !== pos.key) return 0;
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

  quiescence(pos, alpha, beta, ply, qdepth) {
    if (this.checkStop()) return 0;
    if (ply > this.seldepth) this.seldepth = ply;

    const inCheck = pos.inCheck();
    let best;
    let moves;

    if (inCheck) {
      moves = pos.generateMoves(false);
      // when the quiescence cap is reached while in check, fall back to the
      // static evaluation — returning -INF reported a false loss from the
      // side that is merely unable to resolve the check within the cap
      best = this.ev.evaluate(pos, 0);
      if (best >= beta) return best;
      if (best > alpha) alpha = best;
    } else {
      const stand = this.ev.evaluate(pos, 0);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      best = stand;
      moves = pos.generateMoves(true);
    }
    if (qdepth > 8) return best;

    const us = pos.turn;
    const them = opposite(us);
    const orderedCount = this.order.scoreMoves(pos, moves, ply, 0, 0, {
      structural: this.structuralBonus,
      contextBonus: this.contextBonus
    });
    const buf = this.order.buffers[ply];
    let legal = 0;

    for (let i = 0; i < orderedCount; i++) {
      const m = buf[i];
      const flags = MOVE_FLAGS(m);
      if (!inCheck) {
        if (!(flags & FLAG_CAPTURE) && !(flags & FLAG_PROMO)) continue;
        // delta pruning: even winning the victim cannot lift alpha
        const victim = pos.board[MOVE_TO(m)];
        const victimValue = (flags & FLAG_EP) ? MATERIAL[PAWN] : (victim ? MATERIAL[pieceType(victim)] : 0);
        if (best + victimValue + 200 < alpha && !(flags & FLAG_PROMO)) continue;
      }
      pos.pushRep();
      const undo = pos.makeMove(m);
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
    if (legal === 0 && inCheck) return -MATE + ply;
    return best;
  }
}

/** Search budget from complexity and uncertainty (doc 05 §17.1). */
export function searchBudget({ complexity = 0.5, uncertainty = 0.3, timeRemaining = 1 }) {
  return Math.max(1, Math.round(1 + complexity * 2 + uncertainty * 3)) * Math.max(1, timeRemaining);
}
