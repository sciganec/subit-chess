/**
 * SUBIT-CHESS v3.0.0 — Position Perception Engine (PPE)
 *
 * Spec basis:
 *   docs/theory/31_...UNIFIED_COMPUTATIONAL_ARCHITECTURE  PART VI  §19-22
 *   docs/theory/01_...POSITION_VALUE_THEORY               §7   (structural profile of a piece)
 *   docs/theory/02_...RELATION_ALGEBRA                    §17  (levels of computation)
 *
 * Produces exact facts first (material, geometry, mobility, attacks, defenders),
 * then derived heuristics. Exact facts never depend on the evaluation parameters.
 */

import {
  WHITE, BLACK, EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  MATERIAL, pieceType, pieceColor, rankOf, fileOf, opposite,
  KNIGHT_DELTAS, KING_DELTAS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS
} from './core.mjs';

/** The 4x4 extended centre: files c-f, ranks 3-6 (0x88 indices). */
export const CENTER = new Set([
  34, 35, 36, 37,            // rank 6
  50, 51, 52, 53,            // rank 5
  66, 67, 68, 69,            // rank 4
  82, 83, 84, 85             // rank 3
]);

/** The eight squares around a king, for the given colour (colour-relative). */
export function kingZone(color) {
  const base = color === WHITE ? 112 : 0;   // e1 = 116 / e8 = 4
  const out = new Set();
  for (const d of KING_DELTAS) {
    const sq = base + 4 + d;
    if ((sq & 0x88) === 0 && sq >= 0 && sq < 128) out.add(sq);
  }
  return out;
}

export const REL_TYPE_ID = {
  ATTACK: 1, DEFEND: 2, SUPPORT: 3, BLOCK: 4, PIN: 5,
  DISCOVER: 6, RESTRICT: 7, CONTROL: 8, CONNECT: 9, THREATEN: 10, PROTECT: 11
};
export const REL_TYPE_NAME = ['', 'ATTACK', 'DEFEND', 'SUPPORT', 'BLOCK', 'PIN',
  'DISCOVER', 'RESTRICT', 'CONTROL', 'CONNECT', 'THREATEN', 'PROTECT'];

/** Squares attacked by the piece on `sq` (geometry only; includes own-occupied squares). */
export function attacksOf(pos, sq, out) {
  out.length = 0;
  const b = pos.board;
  const p = b[sq];
  if (p === EMPTY) return out;
  const t = pieceType(p);
  if (t === PAWN) {
    if (pieceColor(p) === WHITE) {
      const a = sq - 17, c = sq - 15;
      if (a >= 0 && (a & 0x88) === 0) out.push(a);
      if (c >= 0 && (c & 0x88) === 0) out.push(c);
    } else {
      const a = sq + 17, c = sq + 15;
      if (a < 128 && (a & 0x88) === 0) out.push(a);
      if (c < 128 && (c & 0x88) === 0) out.push(c);
    }
    return out;
  }
  if (t === KNIGHT) {
    for (const d of KNIGHT_DELTAS) {
      const to = sq + d;
      if (to >= 0 && to < 128 && (to & 0x88) === 0) out.push(to);
    }
    return out;
  }
  if (t === KING) {
    for (const d of KING_DELTAS) {
      const to = sq + d;
      if (to >= 0 && to < 128 && (to & 0x88) === 0) out.push(to);
    }
    return out;
  }
  const dirs = t === BISHOP ? BISHOP_DIRS : t === ROOK ? ROOK_DIRS : QUEEN_DIRS;
  for (const d of dirs) {
    let to = sq + d;
    while (to < 128 && (to & 0x88) === 0) {
      out.push(to);
      if (b[to] !== EMPTY) break;
      to += d;
    }
  }
  return out;
}

const scratch = [];

/**
 * Exact per-side attack/defence geometry for one position.
 * All arrays are indexed by square (0..127).
 */
export class AttackMap {
  constructor() {
    this.cnt = [new Int8Array(128), new Int8Array(128)];      // number of attackers
    this.minVal = [new Int8Array(128), new Int8Array(128)];   // least valuable attacker (material/100)
    this.def = [new Int8Array(128), new Int8Array(128)];      // number of defenders of own piece on square
    this.mob = [new Int8Array(128), new Int8Array(128)];      // pseudo-legal mobility of the piece on square
  }

  static build(pos) {
    const m = new AttackMap();
    pos.refreshPieces();
    const b = pos.board;
    for (let color = 0; color < 2; color++) {
      const list = pos.listSq[color];
      const n = pos.listCnt[color];
      for (let i = 0; i < n; i++) {
        const sq = list[i];
        const p = b[sq];
        const t = pieceType(p);
        attacksOf(pos, sq, scratch);
        m.mob[color][sq] = t === PAWN ? 0 : scratch.length;
        for (let k = 0; k < scratch.length; k++) {
          const to = scratch[k];
          const v = (MATERIAL[t] / 100) | 0;
          m.cnt[color][to]++;
          const cur = m.minVal[color][to];
          if (cur === 0 || v < cur) m.minVal[color][to] = v;
          const occ = b[to];
          if (occ !== EMPTY && pieceColor(occ) === color) m.def[color][to]++;
        }
      }
    }
    return m;
  }

  /** Is `sq` attacked by `color`? */
  attacked(sq, color) { return this.cnt[color][sq] > 0; }

  /** Number of attackers of `sq` by `color`. */
  attackers(sq, color) { return this.cnt[color][sq]; }

  /** Number of defenders of the piece standing on `sq`, belonging to `color`. */
  defenders(sq, color) { return this.def[color][sq]; }

  /** Least valuable attacker of `sq` by `color`, in pawn units (0 = none). */
  leastAttacker(sq, color) { return this.minVal[color][sq]; }
}

/**
 * Full Position Perception record. Built once per position that needs evaluation.
 */
export class Percept {
  constructor(pos) {
    this.pos = pos;
    this.turn = pos.turn;
    this.atk = AttackMap.build(pos);
    this.material = [0, 0];
    this.count = [0, 0, 0, 0, 0, 0, 0]; // per piece type, both colours
    this.bishops = [0, 0];
    this.phaseMaterial = 0;
    this.pawns = [new Int8Array(8), new Int8Array(8)];
    this.pawnSquares = [[], []];
    this.kingSq = [pos.kingSq[0], pos.kingSq[1]];
    this.mobility = [0, 0];
    this.centerControl = [0, 0];
    this.kingZoneAttacks = [0, 0];   // attacks on squares around the enemy king
    this.pins = [];
    this.hanging = [[], []];
    this.passed = [[], []];
    this.doubled = [0, 0];
    this.isolated = [0, 0];
    this.openFiles = [[], []];
    this.semiOpenFiles = [[], []];
    this.outposts = [[], []];
    this.trapped = [[], []];
    this.checkers = [];
    this.inCheck = [false, false];
    this.build();
  }

  build() {
    const pos = this.pos;
    const b = pos.board;

    for (let color = 0; color < 2; color++) {
      const list = pos.listSq[color];
      const n = pos.listCnt[color];
      for (let i = 0; i < n; i++) {
        const sq = list[i];
        const p = b[sq];
        const t = pieceType(p);
        this.count[t]++;
        this.material[color] += MATERIAL[t];
        this.mobility[color] += this.atk.mob[color][sq];
        if (t === BISHOP) this.bishops[color]++;
        if (t === PAWN) {
          this.pawns[color][fileOf(sq)]++;
          this.pawnSquares[color].push(sq);
        }
      }
    }

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      if (CENTER.has(sq)) {
        if (this.atk.cnt[WHITE][sq]) this.centerControl[WHITE]++;
        if (this.atk.cnt[BLACK][sq]) this.centerControl[BLACK]++;
      }
    }

    // king safety geometry
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const k = this.kingSq[color];
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          if (!dr && !df) continue;
          const r = rankOf(k) + dr, f = fileOf(k) + df;
          if (r < 0 || r > 7 || f < 0 || f > 7) continue;
          const sq = r * 16 + f;
          if (this.atk.cnt[enemy][sq]) n++;
        }
      }
      this.kingZoneAttacks[color] = n;
      this.inCheck[color] = this.atk.attacked(k, enemy);
    }

    // pins: absolute pins only (cheap, exact)
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const k = this.kingSq[color];
      for (const d of [...BISHOP_DIRS, ...ROOK_DIRS]) {
        let to = k + d;
        let blocker = -1;
        while (to < 128 && (to & 0x88) === 0) {
          const p = b[to];
          if (p !== EMPTY) {
            if (pieceColor(p) === color) { blocker = to; }
            break;
          }
          to += d;
        }
        if (blocker < 0) continue;
        const bt = pieceType(b[blocker]);
        if (bt === KNIGHT) continue;
        let beyond = blocker + d;
        while (beyond < 128 && (beyond & 0x88) === 0 && b[beyond] === EMPTY) beyond += d;
        if (beyond >= 128 || (beyond & 0x88)) continue;
        const target = b[beyond];
        if (target !== EMPTY && pieceColor(target) === enemy) {
          const tt = pieceType(target);
          const sliding = (tt === BISHOP && (d === 15 || d === 17 || d === -15 || d === -17)) ||
                          (tt === ROOK && (d === 16 || d === -16 || d === 1 || d === -1)) || tt === QUEEN;
          if (sliding) this.pins.push({ pinned: blocker, pinner: beyond, king: k, color });
        }
      }
    }

    // hanging pieces: attacked by a strictly cheaper piece and not defended enough
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const list = pos.listSq[color];
      for (let i = 0; i < pos.listCnt[color]; i++) {
        const sq = list[i];
        const p = b[sq];
        const t = pieceType(p);
        if (t === KING) continue;
        const attackers = this.atk.attackers(sq, enemy);
        if (!attackers) continue;
        const defenders = this.atk.defenders(sq, color);
        const cheapest = this.atk.leastAttacker(sq, enemy);
        const value = (MATERIAL[t] / 100) | 0;
        if (defenders === 0 || cheapest < value) {
          this.hanging[color].push({ sq, piece: t, attackers, defenders });
        }
      }
    }

    // passed pawns, doubled / isolated pawns
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const enemyPawnFiles = this.pawns[enemy];
      for (const sq of this.pawnSquares[color]) {
        const f = fileOf(sq);
        const r = rankOf(sq);
        let passed = true;
        for (let df = -1; df <= 1 && passed; df++) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const ep = this.pawnSquares[enemy];
          for (const other of ep) {
            if (fileOf(other) !== ff) continue;
            if (color === WHITE ? rankOf(other) < r : rankOf(other) > r) { passed = false; break; }
          }
        }
        if (passed) this.passed[color].push(sq);
      }
      for (let f = 0; f < 8; f++) {
        if (this.pawns[color][f] > 1) this.doubled[color]++;
        if (this.pawns[color][f] > 0) {
          const left = f > 0 ? this.pawns[color][f - 1] : 0;
          const right = f < 7 ? this.pawns[color][f + 1] : 0;
          if (!left && !right) this.isolated[color]++;
        }
      }
      void enemyPawnFiles;
    }

    // files
    for (let f = 0; f < 8; f++) {
      const w = this.pawns[WHITE][f];
      const bl = this.pawns[BLACK][f];
      if (!w && !bl) { this.openFiles[WHITE].push(f); this.openFiles[BLACK].push(f); }
      else if (!w) this.semiOpenFiles[WHITE].push(f);
      else if (!bl) this.semiOpenFiles[BLACK].push(f);
    }

    this.phaseMaterial = pos.phaseMaterial;
  }

  defenders(sq, color) { return this.atk.defenders(sq, color); }
}