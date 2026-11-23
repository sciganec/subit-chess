/**
 * SUBIT-CHESS v3.0.0 — Canonical Position Core + Rule Engine
 *
 * Spec basis:
 *   docs/theory/31_SUBIT_CHESS_UNIFIED_COMPUTATIONAL_ARCHITECTURE_v1.0.md  PART IV (Canonical Position Core), PART V (Rule Engine)
 *   docs/theory/01_SUBIT_POSITION_VALUE_THEORY_v1.1.md                     §3 (formal model of a position)
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE_v1.0.md                       §2, §3 (legal move completeness)
 *
 * Invariants implemented here:
 *   UCA-INV-001 Single Position Semantics
 *   UCA-INV-002 Rule Authority          (rules decide legality/terminal state, not heuristics)
 *   UCA-INV-003 Complete Legal Move Availability (M_search == M_legal at every full node)
 *   UCA-INV-019 Incremental/Full Equivalence (state is exactly restorable)
 *
 * Representation: 0x88 mailbox (128 squares), incremental Zobrist (two 32-bit halves).
 * Encoding: sq = rank * 16 + file, rank 0 = 8th rank, file 0 = a..h.
 */

import { validateFEN } from './fen.mjs';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const WHITE = 0;
export const BLACK = 1;

export const PIECE_TYPE = [0, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING];
export const PIECE_CHAR = ['.', 'P', 'N', 'B', 'R', 'Q', 'K'];

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/** Material values in centipawns (doc 04 §5 — "initial parameters, not universal constants"). */
export const MATERIAL = [0, 100, 320, 330, 500, 900, 0];

/** Phase weights (doc 26 / doc 31 §36): how much each piece counts toward game phase. */
export const PHASE_WEIGHT = [0, 1, 1, 1, 2, 4, 0];
export const PHASE_TOTAL = 24;

export const FLAG_CAPTURE = 1;
export const FLAG_EP = 2;
export const FLAG_CASTLE = 4;
export const FLAG_DOUBLE = 8;
export const FLAG_PROMO = 16;

export const PROMO_QUEEN = QUEEN;
export const PROMO_ROOK = ROOK;
export const PROMO_BISHOP = BISHOP;
export const PROMO_KNIGHT = KNIGHT;

export const pieceType = (p) => p & 7;
export const pieceColor = (p) => p >> 3;
export const makePiece = (t, c) => t | (c << 3);
export const opposite = (c) => c ^ 1;

export const rankOf = (sq) => sq >> 4;
export const fileOf = (sq) => sq & 7;
export const onBoard = (sq) => (sq & 0x88) === 0 && sq >= 0 && sq < 128;
export const squareName = (sq) => 'abcdefgh'[sq & 7] + String(8 - (sq >> 4));
export const squareIndex = (name) => {
  const f = name.charCodeAt(0) - 97;
  const r = 8 - Number(name[1]);
  return r * 16 + f;
};

/* ------------------------------------------------------------------ *
 * Move encoding
 *   bits  0..6  from
 *   bits  7..13 to
 *   bits 14..16 promotion type (0 = none)
 *   bits 17..21 flags
 * ------------------------------------------------------------------ */

export const MOVE_FROM = (m) => m & 127;
export const MOVE_TO = (m) => (m >> 7) & 127;
export const MOVE_PROMO = (m) => (m >> 14) & 7;
export const MOVE_FLAGS = (m) => (m >> 17) & 31;

export function encodeMove(from, to, promo = 0, flags = 0) {
  return from | (to << 7) | (promo << 14) | (flags << 17);
}

export function moveToUci(m) {
  if (!m) return '0000';
  const promo = MOVE_PROMO(m);
  return squareName(MOVE_FROM(m)) + squareName(MOVE_TO(m)) + (promo ? ' pnbrq'[promo] : '');
}

export function moveToSan(pos, m) {
  if (!m) return '(none)';
  const from = MOVE_FROM(m);
  const to = MOVE_TO(m);
  const flags = MOVE_FLAGS(m);
  const piece = pos.pieceAt(from);
  const type = pieceType(piece);
  const isCapture = (flags & FLAG_CAPTURE) !== 0;
  const target = pos.pieceAt(to);
  let san = '';

  if (flags & FLAG_CASTLE) {
    san = fileOf(to) === 6 ? 'O-O' : 'O-O-O';
  } else if (type === PAWN) {
    if (isCapture) san += 'abcdefgh'[fileOf(from)] + 'x';
    san += squareName(to);
    if (flags & FLAG_PROMO) san += '=' + ' PNBRQ'[MOVE_PROMO(m)];
  } else {
    san += ' PNBRQK'[type];
    // disambiguation against other identical pieces reaching the same square
    let ambiguous = false, sameFile = false, sameRank = false;
    for (const other of pos.legalMoves()) {
      if (other === m) continue;
      if (MOVE_TO(other) !== to) continue;
      if (pos.pieceAt(MOVE_FROM(other)) !== piece) continue;
      ambiguous = true;
      if (fileOf(MOVE_FROM(other)) === fileOf(from)) sameFile = true;
      if (rankOf(MOVE_FROM(other)) === rankOf(from)) sameRank = true;
    }
    if (ambiguous) {
      if (!sameFile) san += 'abcdefgh'[fileOf(from)];
      else if (!sameRank) san += String(8 - rankOf(from));
      else san += squareName(from);
    }
    if (isCapture || target !== EMPTY) san += 'x';
    san += squareName(to);
  }

  const undo = pos.makeMove(m);
  const givesCheck = pos.inCheck();
  const noMoves = pos.legalMoves().length === 0;
  pos.unmakeMove(undo);
  if (givesCheck) san += noMoves ? '#' : '+';
  return san;
}

/* ------------------------------------------------------------------ *
 * Zobrist keys (two independent 32-bit halves -> 53-bit usable key)
 * ------------------------------------------------------------------ */

export const ZOBRIST = buildZobrist();

function buildZobrist() {
  // lo and hi must come from two independent, NON-linear streams. v3.0.8 took both from consecutive outputs of
  // one xorshift32: that generator is linear over GF(2), so hi = L(lo) held for every table entry and, because
  // keys are XOR sums, for every position; the 53-bit key had only ~32 effective bits (distinct positions with
  // equal keys appeared at ~1 per 60k positions in a depth-7 search, and the TT verifies with this key).
  const mulberry = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
  };
  const rndLo = mulberry(0x1a2b3c4d), rndHi = mulberry(0x9e3779b9);
  const pair = () => ({ lo: rndLo(), hi: rndHi() });

  const piece = [];
  for (let p = 0; p < 16; p++) {
    const rows = [];
    for (let sq = 0; sq < 128; sq++) rows.push(pair());
    piece.push(rows);
  }
  const castle = [];
  for (let i = 0; i < 16; i++) castle.push(pair());
  const ep = [];
  for (let f = 0; f < 8; f++) ep.push(pair());
  const turn = pair();

  // flat, cache-friendly mirrors of `piece`: ZP[p * 128 + sq]
  const flatLo = new Int32Array(16 * 128);
  const flatHi = new Int32Array(16 * 128);
  for (let p = 0; p < 16; p++) {
    for (let sq = 0; sq < 128; sq++) {
      flatLo[p * 128 + sq] = piece[p][sq].lo;
      flatHi[p * 128 + sq] = piece[p][sq].hi;
    }
  }
  return { piece, flatLo, flatHi, castle, ep, turn };
}

/* ------------------------------------------------------------------ *
 * Attack geometry tables
 * ------------------------------------------------------------------ */

export const KNIGHT_DELTAS = [33, 31, 18, 14, -14, -18, -31, -33];
export const KING_DELTAS = [16, -16, 1, -1, 17, 15, -17, -15];
export const BISHOP_DIRS = [17, 15, -17, -15];
export const ROOK_DIRS = [16, -16, 1, -1];
export const QUEEN_DIRS = [17, 15, -17, -15, 16, -16, 1, -1];

/** squares attacked by a white pawn standing on sq */
export function whitePawnAttacks(sq) {
  const out = [];
  const a = sq - 17, b = sq - 15;
  if ((a & 0x88) === 0 && a >= 0) out.push(a);
  if ((b & 0x88) === 0 && b >= 0) out.push(b);
  return out;
}
export function blackPawnAttacks(sq) {
  const out = [];
  const a = sq + 17, b = sq + 15;
  if ((a & 0x88) === 0 && a < 128) out.push(a);
  if ((b & 0x88) === 0 && b < 128) out.push(b);
  return out;
}
export function knightAttacks(sq) {
  const out = [];
  for (const d of KNIGHT_DELTAS) {
    const t = sq + d;
    if (t >= 0 && t < 128 && (t & 0x88) === 0) out.push(t);
  }
  return out;
}
export function kingAttacks(sq) {
  const out = [];
  for (const d of KING_DELTAS) {
    const t = sq + d;
    if (t >= 0 && t < 128 && (t & 0x88) === 0) out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Position
 * ------------------------------------------------------------------ */

export class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kingSq = new Int16Array(2);
    this.kingSq[WHITE] = 116; // e1
    this.kingSq[BLACK] = 4;   // e8
    // 16 pieces per side is the chess maximum; 64 keeps a defensive margin
    // against malformed FEN/input without risking typed-array overflow (AUD-311-01).
    this.listSq = [new Int16Array(64), new Int16Array(64)];
    this.listCnt = new Int16Array(2);
    this.listIdx = new Int8Array(128).fill(-1);
    this.hashLo = 0;
    this.hashHi = 0;
    this.phaseMaterial = 0;
    this.ply = 0;
    this.rep = []; // 32-bit halves of the hashes of positions seen earlier in the game
    this.repHi = []; // the other halves: a repetition needs both (32 bits alone can collide)
    this.repLimit = 0; // index of the oldest entry still relevant after an irreversible move
    this.dirty = true;
  }

  /* ---------------- setup ---------------- */

  static fromFEN(fen) {
    const pos = new Position();
    pos.setFEN(fen);
    return pos;
  }

  static start() {
    return Position.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  /**
   * Load a position from FEN. The string is validated first (src/engine/fen.mjs),
   * so a rejected FEN leaves this position untouched — a caller that catches the
   * error can keep using the old position instead of a half-parsed board.
   *
   * `validate: false` loads the FEN as given. It exists for the verifier itself,
   * which must be able to build an impossible position in order to prove that it
   * detects one; no engine path uses it.
   *
   * @throws {Error} when the FEN is not a legal position
   */
  setFEN(fen, opts = {}) {
    if (opts.validate !== false) {
      const check = validateFEN(fen);
      if (!check.ok) throw new Error(`invalid FEN (${check.status}): ${check.reason}`);
    }
    this.board.fill(0);
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { c += Number(ch); continue; }
        const lower = ch.toLowerCase();
        const type = ' pnbrqk'.indexOf(lower);
        const color = ch === lower ? BLACK : WHITE;
        const sq = r * 16 + c;
        this.board[sq] = makePiece(type, color);
        if (type === KING) this.kingSq[color] = sq;
        c++;
      }
    }
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    this.castling = 0;
    if (parts[2] && parts[2] !== '-') {
      if (parts[2].includes('K')) this.castling |= CASTLE_WK;
      if (parts[2].includes('Q')) this.castling |= CASTLE_WQ;
      if (parts[2].includes('k')) this.castling |= CASTLE_BK;
      if (parts[2].includes('q')) this.castling |= CASTLE_BQ;
    }
    this.ep = parts[3] && parts[3] !== '-' ? squareIndex(parts[3]) : -1;
    this.halfmove = parts[4] ? Number(parts[4]) : 0;
    this.fullmove = parts[5] ? Number(parts[5]) : 1;
    this.dirty = true;
    this.recomputeHash();
    this.refreshPieces();
    this.ply = 0;
    this.rep = [];
    this.repHi = [];
    this.repLimit = 0;
    return this;
  }

  clone() {
    const p = new Position();
    p.board.set(this.board);
    p.turn = this.turn;
    p.castling = this.castling;
    p.ep = this.ep;
    p.halfmove = this.halfmove;
    p.fullmove = this.fullmove;
    p.kingSq[0] = this.kingSq[0]; p.kingSq[1] = this.kingSq[1];
    p.listSq[0].set(this.listSq[0]); p.listSq[1].set(this.listSq[1]);
    p.listCnt[0] = this.listCnt[0]; p.listCnt[1] = this.listCnt[1];
    p.listIdx.set(this.listIdx);
    p.hashLo = this.hashLo; p.hashHi = this.hashHi;
    p.phaseMaterial = this.phaseMaterial;
    p.ply = this.ply;
    p.dirty = this.dirty;
    p.repHi = this.repHi.slice();
    p.rep = this.rep.slice();
    p.repLimit = this.repLimit;
    return p;
  }

  fen() {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = this.board[r * 16 + c];
        if (p === EMPTY) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        const ch = PIECE_CHAR[pieceType(p)];
        out += pieceColor(p) === WHITE ? ch : ch.toLowerCase();
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    let rights = '';
    if (this.castling & CASTLE_WK) rights += 'K';
    if (this.castling & CASTLE_WQ) rights += 'Q';
    if (this.castling & CASTLE_BK) rights += 'k';
    if (this.castling & CASTLE_BQ) rights += 'q';
    return `${out} ${this.turn === WHITE ? 'w' : 'b'} ${rights || '-'} ` +
           `${this.ep >= 0 ? squareName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  /* ---------------- piece lists ----------------
   *
   * The board is the single source of truth (UCA-INV-001). Piece lists are a
   * derived cache, rebuilt lazily from the board whenever the position changed.
   * This is deliberately not incremental: the incremental version was a source
   * of subtle list corruption, and UCA-INV-019 (Incremental/Full Equivalence)
   * requires the derived state to be *exactly* what a full rebuild yields.
   */

  refreshPieces() {
    if (!this.dirty) return;
    const cnt0 = this.listCnt;
    cnt0[0] = 0; cnt0[1] = 0;
    const l0 = this.listSq[0], l1 = this.listSq[1];
    const idx = this.listIdx;
    for (let sq = 0; sq < 128; sq++) {
      idx[sq] = -1;
      const p = this.board[sq];
      if (p === EMPTY || (sq & 0x88)) continue;
      const c = p >> 3;
      const i = cnt0[c];
      if (i < l0.length) {
        cnt0[c] = i + 1;
        if (c === 0) l0[i] = sq; else l1[i] = sq;
        idx[sq] = i;
      }
      // AUD-311-01: ignore extra pieces beyond fixed capacity; FEN validation
      // should reject such positions before they reach the engine.
    }
    let pm = 0;
    for (let c = 0; c < 2; c++) {
      const list = c === 0 ? l0 : l1;
      for (let i = 0; i < cnt0[c]; i++) pm += PHASE_WEIGHT[pieceType(this.board[list[i]])];
    }
    this.phaseMaterial = pm;
    this.dirty = false;
  }

  markDirty() { this.dirty = true; }

  pieceAt(sq) {
    if (sq < 0 || sq > 127) return EMPTY;
    return this.board[sq];
  }

  isEmpty(sq) { return this.board[sq] === EMPTY; }

  /* ---------------- hashing ---------------- */

  recomputeHash() {
    let lo = 0, hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      const p = this.board[sq];
      if (p === EMPTY) continue;
      const i = p * 128 + sq;
      lo ^= ZOBRIST.flatLo[i]; hi ^= ZOBRIST.flatHi[i];
    }
    for (let b = 0; b < 4; b++) {
      if (this.castling & (1 << b)) { lo ^= ZOBRIST.castle[b].lo; hi ^= ZOBRIST.castle[b].hi; }
    }
    if (this.ep >= 0) {
      const k = ZOBRIST.ep[fileOf(this.ep)];
      lo ^= k.lo; hi ^= k.hi;
    }
    if (this.turn === BLACK) { lo ^= ZOBRIST.turn.lo; hi ^= ZOBRIST.turn.hi; }
    this.hashLo = lo >>> 0;
    this.hashHi = hi >>> 0;
  }

  /** 53-bit exact integer key (safe for JS Number): 32 low bits + 21 high bits. */
  get key() {
    return this.hashLo * 2097152 + (this.hashHi & 0x1fffff);
  }

  /**
   * Transposition-table key: the Zobrist key plus a coarse halfmove-clock bucket.
   *
   * The raw Zobrist key covers only the piece placement, turn, castling and en
   * passant (audit v3.0.6 §3.2). Two positions with the same geometry but a
   * different halfmove clock are *different* positions for the 50-move rule:
   * halfmove 99 is still winnable, halfmove 100 is claimable. Reusing one TT
   * entry for both can return a draw score for a won position or the reverse.
   * The bucket keeps the hit rate high while separating the rule-50 boundary.
   */
  get ttKey() {
    // buckets: 0-79, 80-99, 100-149, 150+ (75-move automatic draw)
    const h = this.halfmove;
    const bucket = h < 80 ? 0 : h < 100 ? 1 : h < 150 ? 2 : 3;
    // AUD-311-05: mix bucket into the 21-bit high part via XOR, not additive
    // low-bit perturbation, to avoid halfmove-bucket collisions in 53-bit key space.
    const hi = (this.hashHi ^ ((bucket * 0x1f123bb) & 0x1fffff)) >>> 0;
    return this.hashLo * 2097152 + (hi & 0x1fffff);
  }

  recomputePhaseMaterial() {
    let s = 0;
    for (const color of [WHITE, BLACK]) {
      for (let i = 0; i < this.listCnt[color]; i++) {
        s += PHASE_WEIGHT[pieceType(this.board[this.listSq[color][i]])];
      }
    }
    this.phaseMaterial = s;
  }

  /** 0 = opening, 1 = endgame (1 - phaseMaterial/PHASE_TOTAL). */
  get endgameFactor() {
    return 1 - Math.min(1, this.phaseMaterial / PHASE_TOTAL);
  }

  /* ---------------- attacks ---------------- */

  isAttacked(sq, byColor) {
    const b = this.board;
    // pawns
    if (byColor === WHITE) {
      let t = sq + 17; if (t < 128 && (t & 0x88) === 0 && b[t] === makePiece(PAWN, WHITE)) return true;
      t = sq + 15;     if (t < 128 && (t & 0x88) === 0 && b[t] === makePiece(PAWN, WHITE)) return true;
    } else {
      let t = sq - 17; if (t >= 0 && (t & 0x88) === 0 && b[t] === makePiece(PAWN, BLACK)) return true;
      t = sq - 15;     if (t >= 0 && (t & 0x88) === 0 && b[t] === makePiece(PAWN, BLACK)) return true;
    }
    // knights
    const n = makePiece(KNIGHT, byColor);
    for (const d of KNIGHT_DELTAS) {
      const t = sq + d;
      if (t < 0 || t > 127 || (t & 0x88)) continue;
      if (b[t] === n) return true;
    }
    // king
    const k = makePiece(KING, byColor);
    for (const d of KING_DELTAS) {
      const t = sq + d;
      if (t < 0 || t > 127 || (t & 0x88)) continue;
      if (b[t] === k) return true;
    }
    // bishops / queens
    const bo = makePiece(BISHOP, byColor);
    const qu = makePiece(QUEEN, byColor);
    for (const d of BISHOP_DIRS) {
      let t = sq + d;
      while (t < 128 && (t & 0x88) === 0) {
        const p = b[t];
        if (p !== EMPTY) { if (p === bo || p === qu) return true; break; }
        t += d;
      }
    }
    // rooks / queens
    const ro = makePiece(ROOK, byColor);
    for (const d of ROOK_DIRS) {
      let t = sq + d;
      while (t < 128 && (t & 0x88) === 0) {
        const p = b[t];
        if (p !== EMPTY) { if (p === ro || p === qu) return true; break; }
        t += d;
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    return this.isAttacked(this.kingSq[color], opposite(color));
  }

  /** All squares of `sq` reachable by the piece standing there (geometry only, no legality). */
  pieceTargets(sq, out) {
    out.length = 0;
    const p = this.board[sq];
    if (p === EMPTY) return out;
    const t = pieceType(p);
    const c = pieceColor(p);
    if (t === PAWN) {
      const dir = c === WHITE ? -16 : 16;
      const startRank = c === WHITE ? 6 : 1;
      const promoRank = c === WHITE ? 0 : 7;
      const one = sq + dir;
      if (one >= 0 && one < 128 && (one & 0x88) === 0 && this.board[one] === EMPTY) {
        if ((one >> 4) === promoRank) out.push(one);
        else {
          out.push(one);
          const two = sq + 2 * dir;
          if ((sq >> 4) === startRank && this.board[two] === EMPTY) out.push(two);
        }
      }
      for (const dc of [-1, 1]) {
        const to = one + dc;
        if (to < 0 || to > 127 || (to & 0x88)) continue;
        const target = this.board[to];
        if (target !== EMPTY && pieceColor(target) !== c) out.push(to);
        else if (to === this.ep) out.push(to);
      }
      return out;
    }
    if (t === KNIGHT || t === KING) {
      const deltas = t === KNIGHT ? KNIGHT_DELTAS : KING_DELTAS;
      for (const d of deltas) {
        const to = sq + d;
        if (to < 0 || to > 127 || (to & 0x88)) continue;
        const target = this.board[to];
        if (target === EMPTY || pieceColor(target) !== c) out.push(to);
      }
      return out;
    }
    const dirs = t === BISHOP ? BISHOP_DIRS : t === ROOK ? ROOK_DIRS : QUEEN_DIRS;
    for (const d of dirs) {
      let to = sq + d;
      while (to < 128 && (to & 0x88) === 0) {
        const target = this.board[to];
        if (target === EMPTY) { out.push(to); to += d; continue; }
        if (pieceColor(target) !== c) out.push(to);
        break;
      }
    }
    return out;
  }

  /* ---------------- move generation ---------------- */

  /** Pseudo-legal moves. `capturesOnly` restricts to captures/promotions (quiescence). */
  generateMoves(capturesOnly = false) {
    this.refreshPieces();
    const out = [];
    const us = this.turn;
    const them = opposite(us);
    const b = this.board;

    for (let i = 0; i < this.listCnt[us]; i++) {
      const from = this.listSq[us][i];
      const piece = b[from];
      const type = pieceType(piece);

      if (type === PAWN) {
        const dir = us === WHITE ? -16 : 16;
        const startRank = us === WHITE ? 6 : 1;
        const promoRank = us === WHITE ? 0 : 7;
        const one = from + dir;
        if (one >= 0 && one < 128 && (one & 0x88) === 0 && b[one] === EMPTY) {
          if ((one >> 4) === promoRank) {
            for (const pt of [QUEEN, ROOK, BISHOP, KNIGHT])
              out.push(encodeMove(from, one, pt, FLAG_PROMO));
          } else if (!capturesOnly) {
            out.push(encodeMove(from, one));
            const two = from + 2 * dir;
            if ((from >> 4) === startRank && b[two] === EMPTY)
              out.push(encodeMove(from, two, 0, FLAG_DOUBLE));
          }
        }
        for (const dc of [-1, 1]) {
          const to = one + dc;
          if (to < 0 || to > 127 || (to & 0x88)) continue;
          const target = b[to];
          if (target !== EMPTY && pieceColor(target) === them) {
            if ((to >> 4) === promoRank) {
              for (const pt of [QUEEN, ROOK, BISHOP, KNIGHT])
                out.push(encodeMove(from, to, pt, FLAG_PROMO | FLAG_CAPTURE));
            } else {
              out.push(encodeMove(from, to, 0, FLAG_CAPTURE));
            }
          } else if (to === this.ep && target === EMPTY) {
            out.push(encodeMove(from, to, 0, FLAG_CAPTURE | FLAG_EP));
          }
        }
        continue;
      }

      if (type === KNIGHT || type === KING) {
        const deltas = type === KNIGHT ? KNIGHT_DELTAS : KING_DELTAS;
        for (const d of deltas) {
          const to = from + d;
          if (to < 0 || to > 127 || (to & 0x88)) continue;
          const target = b[to];
          if (target !== EMPTY && pieceColor(target) === us) continue;
          if (capturesOnly && target === EMPTY) continue;
          out.push(encodeMove(from, to, 0, target !== EMPTY ? FLAG_CAPTURE : 0));
        }
        if (type === KING && !capturesOnly) this.generateCastles(out, from, us);
        continue;
      }

      const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
      for (const d of dirs) {
        let to = from + d;
        while (to < 128 && (to & 0x88) === 0) {
          const target = b[to];
          if (target === EMPTY) {
            if (!capturesOnly) out.push(encodeMove(from, to));
          } else {
            if (pieceColor(target) === them)
              out.push(encodeMove(from, to, 0, FLAG_CAPTURE));
            break;
          }
          to += d;
        }
      }
    }
    return out;
  }

  generateCastles(out, from, us) {
    const b = this.board;
    const them = opposite(us);
    if (us === WHITE && from === 116) {
      if ((this.castling & CASTLE_WK) &&
          b[117] === EMPTY && b[118] === EMPTY && b[119] === makePiece(ROOK, WHITE) &&
          !this.isAttacked(116, them) && !this.isAttacked(117, them) && !this.isAttacked(118, them))
        out.push(encodeMove(116, 118, 0, FLAG_CASTLE));
      if ((this.castling & CASTLE_WQ) &&
          b[115] === EMPTY && b[114] === EMPTY && b[113] === EMPTY && b[112] === makePiece(ROOK, WHITE) &&
          !this.isAttacked(116, them) && !this.isAttacked(115, them) && !this.isAttacked(114, them))
        out.push(encodeMove(116, 114, 0, FLAG_CASTLE));
    } else if (us === BLACK && from === 4) {
      if ((this.castling & CASTLE_BK) &&
          b[5] === EMPTY && b[6] === EMPTY && b[7] === makePiece(ROOK, BLACK) &&
          !this.isAttacked(4, them) && !this.isAttacked(5, them) && !this.isAttacked(6, them))
        out.push(encodeMove(4, 6, 0, FLAG_CASTLE));
      if ((this.castling & CASTLE_BQ) &&
          b[3] === EMPTY && b[2] === EMPTY && b[1] === EMPTY && b[0] === makePiece(ROOK, BLACK) &&
          !this.isAttacked(4, them) && !this.isAttacked(3, them) && !this.isAttacked(2, them))
        out.push(encodeMove(4, 2, 0, FLAG_CASTLE));
    }
  }

  /** Full legal move set. M_legal(P) — the search may only ever use this set at a full node. */
  legalMoves(capturesOnly = false) {
    this.refreshPieces();
    const pseudo = this.generateMoves(capturesOnly);
    const out = [];
    const us = this.turn;
    for (const m of pseudo) {
      const to = MOVE_TO(m);
      const tp = this.board[to];
      if (tp !== EMPTY && pieceType(tp) === KING) continue; // king capture can never be legal
      const undo = this.makeMove(m);
      if (!this.isAttacked(this.kingSq[us], opposite(us))) out.push(m);
      this.unmakeMove(undo);
    }
    return out;
  }

  /* ---------------- transitions ---------------- */

  makeMove(m) {
    const from = MOVE_FROM(m);
    const to = MOVE_TO(m);
    const flags = MOVE_FLAGS(m);
    const promo = MOVE_PROMO(m);
    const us = this.turn;
    const them = opposite(us);
    const b = this.board;
    const piece = b[from];
    const type = pieceType(piece);

    const undo = {
      move: m, captured: EMPTY, capSq: -1,
      castling: this.castling, ep: this.ep, halfmove: this.halfmove,
      fullmove: this.fullmove, hashLo: this.hashLo, hashHi: this.hashHi,
      kingW: this.kingSq[WHITE], kingB: this.kingSq[BLACK], phaseMaterial: this.phaseMaterial,
      repLimit: this.repLimit
    };

    // remove captured piece
    let capSq = -1;
    if (flags & FLAG_EP) {
      capSq = us === WHITE ? to + 16 : to - 16;
    } else if (b[to] !== EMPTY) {
      capSq = to;
    }
    if (capSq >= 0) {
      undo.captured = b[capSq];
      undo.capSq = capSq;
      this.xorPiece(capSq, undo.captured);
      b[capSq] = EMPTY;
    }

    // move piece
    this.xorPiece(from, piece);
    b[from] = EMPTY;
    const placed = promo ? makePiece(promo, us) : piece;
    b[to] = placed;
    this.xorPiece(to, placed);
    if (type === KING) this.kingSq[us] = to;

    // castle rook
    if (flags & FLAG_CASTLE) {
      const rank = us === WHITE ? 112 : 0;
      if (fileOf(to) === 6) {
        const rf = rank + 7, rt = rank + 5;
        const rook = b[rf];
        this.xorPiece(rf, rook); b[rf] = EMPTY;
        b[rt] = rook;
        this.xorPiece(rt, rook);
      } else {
        const rf = rank + 0, rt = rank + 3;
        const rook = b[rf];
        this.xorPiece(rf, rook); b[rf] = EMPTY;
        b[rt] = rook;
        this.xorPiece(rt, rook);
      }
    }

    // castling rights
    let rights = this.castling;
    if (type === KING) rights &= us === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
    if (from === 119 || to === 119) rights &= ~CASTLE_WK;
    if (from === 112 || to === 112) rights &= ~CASTLE_WQ;
    if (from === 7 || to === 7) rights &= ~CASTLE_BK;
    if (from === 0 || to === 0) rights &= ~CASTLE_BQ;
    if (rights !== this.castling) {
      for (let bit = 0; bit < 4; bit++) {
        const was = (this.castling >> bit) & 1;
        const now = (rights >> bit) & 1;
        if (was !== now) {
          const k = ZOBRIST.castle[bit];
          this.hashLo = (this.hashLo ^ k.lo) >>> 0;
          this.hashHi = (this.hashHi ^ k.hi) >>> 0;
        }
      }
      this.castling = rights;
    }

    // en passant square
    if (this.ep >= 0) {
      const k = ZOBRIST.ep[fileOf(this.ep)];
      this.hashLo = (this.hashLo ^ k.lo) >>> 0;
      this.hashHi = (this.hashHi ^ k.hi) >>> 0;
    }
    this.ep = (flags & FLAG_DOUBLE) ? (from + to) / 2 : -1;
    if (this.ep >= 0) {
      const k = ZOBRIST.ep[fileOf(this.ep)];
      this.hashLo = (this.hashLo ^ k.lo) >>> 0;
      this.hashHi = (this.hashHi ^ k.hi) >>> 0;
    }

    // clocks
    const isCapture = (flags & (FLAG_CAPTURE | FLAG_EP)) !== 0;
    this.halfmove = (type === PAWN || isCapture) ? 0 : this.halfmove + 1;
    if (type === PAWN || isCapture) this.repLimit = this.rep.length;
    if (us === BLACK) this.fullmove++;

    // turn
    this.turn = them;
    this.hashLo = (this.hashLo ^ ZOBRIST.turn.lo) >>> 0;
    this.hashHi = (this.hashHi ^ ZOBRIST.turn.hi) >>> 0;

    this.dirty = true;
    return undo;
  }

  xorPiece(sq, piece) {
    const i = piece * 128 + sq;
    this.hashLo = (this.hashLo ^ ZOBRIST.flatLo[i]) >>> 0;
    this.hashHi = (this.hashHi ^ ZOBRIST.flatHi[i]) >>> 0;
  }

  unmakeMove(undo) {
    const m = undo.move;
    const from = MOVE_FROM(m);
    const to = MOVE_TO(m);
    const flags = MOVE_FLAGS(m);
    const promo = MOVE_PROMO(m);
    const us = opposite(this.turn);
    const b = this.board;

    this.turn = us;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.fullmove = undo.fullmove;
    this.kingSq[WHITE] = undo.kingW;
    this.kingSq[BLACK] = undo.kingB;

    // undo castle rook
    if (flags & FLAG_CASTLE) {
      const rank = us === WHITE ? 112 : 0;
      if (fileOf(to) === 6) {
        const rt = rank + 5, rf = rank + 7;
        const rook = b[rt];
        this.xorPiece(rt, rook); b[rt] = EMPTY;
        b[rf] = rook;
        this.xorPiece(rf, rook);
      } else {
        const rt = rank + 3, rf = rank + 0;
        const rook = b[rt];
        this.xorPiece(rt, rook); b[rt] = EMPTY;
        b[rf] = rook;
        this.xorPiece(rf, rook);
      }
    }

    // move piece back
    const placed = b[to];
    b[to] = EMPTY;
    this.xorPiece(to, placed);
    const original = makePiece(promo ? PAWN : pieceType(placed), us);
    b[from] = original;
    this.xorPiece(from, original);

    // restore captured piece
    if (undo.capSq >= 0 && undo.captured !== EMPTY) {
      b[undo.capSq] = undo.captured;
      this.xorPiece(undo.capSq, undo.captured);
    }

    // hash is restored last: the operations above legitimately mutate it
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    this.phaseMaterial = undo.phaseMaterial;
    this.repLimit = undo.repLimit;
    this.dirty = true;
  }

  /** null-move (search-only, never a legal chess move) */
  makeNullMove() {
    const undo = {
      castling: this.castling, ep: this.ep, halfmove: this.halfmove,
      fullmove: this.fullmove, hashLo: this.hashLo, hashHi: this.hashHi,
      kingW: this.kingSq[WHITE], kingB: this.kingSq[BLACK],
      phaseMaterial: this.phaseMaterial, turn: this.turn,
      repLimit: this.repLimit
    };
    if (this.ep >= 0) {
      const k = ZOBRIST.ep[fileOf(this.ep)];
      this.hashLo = (this.hashLo ^ k.lo) >>> 0;
      this.hashHi = (this.hashHi ^ k.hi) >>> 0;
      this.ep = -1;
    }
    this.turn = opposite(this.turn);
    this.hashLo = (this.hashLo ^ ZOBRIST.turn.lo) >>> 0;
    this.hashHi = (this.hashHi ^ ZOBRIST.turn.hi) >>> 0;
    // A null move is not a played move. It must not advance the 75-move clock
    // (AUD-309-02) and must not enter the repetition history (AUD-07). `ply`
    // still advances so the search sees the extra node in its depth accounting.
    this.ply++;
    return undo;
  }

  unmakeNullMove(undo) {
    this.turn = undo.turn;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.fullmove = undo.fullmove;
    this.repLimit = undo.repLimit;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    this.kingSq[WHITE] = undo.kingW;
    this.kingSq[BLACK] = undo.kingB;
    this.phaseMaterial = undo.phaseMaterial;
    this.ply--;
  }

  /* ---------------- terminal detection (rule authority) ---------------- */

  /** Returns null when the game continues, otherwise { over, result, reason }. */
  status() {
    const moves = this.legalMoves();
    if (moves.length === 0) {
      if (this.inCheck()) {
        return { over: true, result: this.turn === WHITE ? 'black' : 'white', reason: 'checkmate' };
      }
      return { over: true, result: 'draw', reason: 'stalemate' };
    }
    // Only the automatic draws end the game here: the 75-move rule (FIDE 9.6.2)
    // and fivefold repetition (9.6.1). The 50-move rule (9.3) and threefold
    // repetition (9.2) are claimable, so the position stays playable — the same
    // distinction the search applies (doc 05 §12).
    if (this.halfmove >= 150) return { over: true, result: 'draw', reason: 'seventy-five-move rule' };
    if (this.repetitionCount() >= 5) return { over: true, result: 'draw', reason: 'fivefold repetition' };
    if (this.insufficientMaterial()) return { over: true, result: 'draw', reason: 'insufficient material' };
    return null;
  }

  isRepetition() {
    const start = this.repLimit;
    // both halves: a 32-bit match alone is a collision, not a repetition, and a
    // false one can end a won game as a draw
    for (let i = start; i < this.rep.length; i++) {
      if (this.rep[i] === this.hashLo && this.repHi[i] === this.hashHi) return true;
    }
    return false;
  }

  repetitionCount() {
    let count = 1;
    for (let i = this.repLimit; i < this.rep.length; i++) {
      if (this.rep[i] === this.hashLo && this.repHi[i] === this.hashHi) count++;
    }
    return count;
  }

  pushRep() { this.rep.push(this.hashLo); this.repHi.push(this.hashHi); }
  popRep() { this.rep.pop(); this.repHi.pop(); }

  /**
   * Dead-material check (FIDE 5.2.2): the game is over only when no sequence of
   * legal moves can lead to mate, not when the material is merely small.
   *
   * K+B vs K+B is dead only when both bishops stand on the same colour complex;
   * with opposite colours a helpmate exists, so the position stays playable.
   * K+N vs K+N, K+B vs K+N and K+2N vs K are not dead either: mate is reachable
   * with help, even though it cannot be forced.
   */
  insufficientMaterial() {
    const w = [], b = [];
    for (const color of [WHITE, BLACK]) {
      for (let i = 0; i < this.listCnt[color]; i++) {
        const sq = this.listSq[color][i];
        const t = pieceType(this.board[sq]);
        if (t === KING) continue;
        (color === WHITE ? w : b).push({ t, sq });
      }
    }
    const minorOnly = (list) =>
      list.length === 0 || (list.length === 1 && (list[0].t === KNIGHT || list[0].t === BISHOP));
    if (w.length === 0 && b.length === 0) return true;
    if (minorOnly(w) && b.length === 0) return true;
    if (minorOnly(b) && w.length === 0) return true;
    if (w.length === 1 && b.length === 1 && w[0].t === BISHOP && b[0].t === BISHOP) {
      const cw = ((w[0].sq >> 4) + (w[0].sq & 7)) & 1;
      const cb = ((b[0].sq >> 4) + (b[0].sq & 7)) & 1;
      return cw === cb;
    }
    return false;
  }

  /* ---------------- perft (verification harness) ---------------- */

  perft(depth) {
    if (depth === 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const m of moves) {
      this.pushRep();
      const undo = this.makeMove(m);
      nodes += this.perft(depth - 1);
      this.unmakeMove(undo);
      this.popRep();
    }
    return nodes;
  }

  perftDivide(depth) {
    const moves = this.legalMoves();
    const out = [];
    for (const m of moves) {
      this.pushRep();
      const undo = this.makeMove(m);
      const n = this.perft(depth - 1);
      this.unmakeMove(undo);
      this.popRep();
      out.push({ move: moveToUci(m), nodes: n });
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * Colour mirroring — required by SVF-INV-002 / SM-INV-005
 * ------------------------------------------------------------------ */

export function mirrorFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/').reverse();
  const flipped = rows.map((row) =>
    row.split('').map((ch) => (ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : ch.toLowerCase())).join('')
  ).join('/');
  let rights = '';
  if (parts[2].includes('K')) rights += 'k';
  if (parts[2].includes('Q')) rights += 'q';
  if (parts[2].includes('k')) rights += 'K';
  if (parts[2].includes('q')) rights += 'Q';
  const turn = parts[1] === 'w' ? 'b' : 'w';
  const ep = parts[3] === '-' ? '-' : squareName(squareIndex(parts[3]) ^ 0x70);
  return `${flipped} ${turn} ${rights || '-'} ${ep} ${parts[4] || 0} ${parts[5] || 1}`;
}
