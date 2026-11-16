/**
 * SUBIT-CHESS v3.0.0 — Context Engine (SUBIT-64)
 *
 * Spec basis:
 *   docs/theory/01_SUBIT_POSITION_VALUE_THEORY §6
 *   docs/theory/03_SUBIT_STRUCTURAL_METRIC    §7
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART VIII §28-30
 *
 *   C = I × Z × Φ,   |I|=|Z|=|Φ|=4  →  |C| = 64
 *   I = {QUIET, DEFENCE, ATTACK, PRESSURE}
 *   Z = {GLOBAL, QUEENSIDE, KING, CENTER}
 *   Φ = {OPENING, MIDDLEGAME, ENDGAME, TRANSITION}
 *
 * The context is a *profile of intensities* w(c,P) ∈ [0,1], not a single label:
 * membership is not exclusive and the coordinates are not required to sum to 1
 * (doc 01 §6.6). Marginal intensities (4+4+4) are what the evaluator consumes;
 * the full 64-vector is materialised on demand.
 */

import { WHITE, BLACK, PAWN, KING, pieceType, opposite } from './core.mjs';

export const I = ['QUIET', 'DEFENCE', 'ATTACK', 'PRESSURE'];
export const Z = ['GLOBAL', 'QUEENSIDE', 'KING', 'CENTER'];
export const PH = ['OPENING', 'MIDDLEGAME', 'ENDGAME', 'TRANSITION'];
export const I_QUIET = 0, I_DEFENCE = 1, I_ATTACK = 2, I_PRESSURE = 3;
export const Z_GLOBAL = 0, Z_QUEENSIDE = 1, Z_KING = 2, Z_CENTER = 3;
export const PH_OPENING = 0, PH_MIDDLEGAME = 1, PH_ENDGAME = 2, PH_TRANSITION = 3;

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class ContextProfile {
  constructor() {
    this.w = new Float32Array(4);   // interaction
    this.z = new Float32Array(4);   // zone
    this.p = new Float32Array(4);   // phase
    this.tactical = 0;              // τ(P) — independent of Φ (doc 01 §6.7)
  }

  /** Full 64-vector: w(c) = wI(i) * wZ(z) * wΦ(φ). */
  to64() {
    const out = new Float32Array(64);
    let n = 0;
    for (let i = 0; i < 4; i++)
      for (let z = 0; z < 4; z++)
        for (let p = 0; p < 4; p++)
          out[n++] = this.w[i] * this.z[z] * this.p[p];
    return out;
  }

  key() {
    const top = (arr) => {
      let best = 0;
      for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
      return best;
    };
    return `${I[top(this.w)]}|${Z[top(this.z)]}|${PH[top(this.p)]}`;
  }

  cell() { return this.key().split('|').join('|'); }
}

/**
 * Compute the context profile for a position from its percept and structure.
 */
export function computeContext(pos, percept, structure) {
  const ctx = new ContextProfile();
  const pc = percept;

  /* ---- interaction coordinate I ---- */
  const myMoves = pc.mobility[pos.turn];
  const oppMoves = pc.mobility[opposite(pos.turn)];
  // `kingZoneAttacks[c]` counts enemy attacks on the squares around king c, so
  // the pressure ON my king is [pos.turn] and the pressure on the enemy king is
  // [opposite(pos.turn)]. Mixing the two inverted the ATTACK and DEFENCE
  // components (audit v3.0.6 §5.1).
  const pressureOnMyKing = pc.kingZoneAttacks[pos.turn];
  const pressureOnEnemyKing = pc.kingZoneAttacks[opposite(pos.turn)];
  const myHanging = pc.hanging[pos.turn].length;
  const enemyHanging = pc.hanging[opposite(pos.turn)].length;
  const myInCheck = pc.inCheck[pos.turn] ? 1 : 0;
  const enemyInCheck = pc.inCheck[opposite(pos.turn)] ? 1 : 0;
  const mobRatio = myMoves / Math.max(1, myMoves + oppMoves);

  const quiet = clamp01(1 - (myHanging * 0.35 + pressureOnMyKing * 0.12 + myInCheck * 0.5));
  const defence = clamp01(myHanging * 0.3 + myInCheck * 0.6 + pressureOnMyKing * 0.1);
  const attack = clamp01(pressureOnEnemyKing * 0.18 + enemyHanging * 0.25 + enemyInCheck * 0.4 +
    (mobRatio > 0.55 ? (mobRatio - 0.55) * 1.2 : 0));
  const pressure = clamp01((1 - Math.abs(mobRatio - 0.5) * 2) * 0.4 +
    myHanging * 0.1 + (pc.centerControl[pos.turn] - pc.centerControl[opposite(pos.turn)]) * 0.04);

  ctx.w[I_QUIET] = quiet;
  ctx.w[I_DEFENCE] = defence;
  ctx.w[I_ATTACK] = attack;
  ctx.w[I_PRESSURE] = pressure;

  /* ---- spatial coordinate Z ---- */
  const kingZone = (color) => {
    const k = pc.kingSq[color];
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        const r = (k >> 4) + dr, f = (k & 7) + df;
        if (r < 0 || r > 7 || f < 0 || f > 7) continue;
        if (pc.atk.cnt[opposite(color)][r * 16 + f]) n++;
      }
    }
    return n;
  };
  const kingPressure = kingZone(pos.turn) + kingZone(opposite(pos.turn));
  const centreDelta = pc.centerControl[pos.turn] - pc.centerControl[opposite(pos.turn)];
  const queenFiles = pc.openFiles[pos.turn].filter((f) => f < 3 || f > 4).length;

  ctx.z[Z_GLOBAL] = clamp01(0.45 + 0.1 * Math.min(4, pc.passed[WHITE].length + pc.passed[BLACK].length));
  ctx.z[Z_KING] = clamp01(kingPressure * 0.16);
  ctx.z[Z_CENTER] = clamp01(0.25 + Math.abs(centreDelta) * 0.08);
  ctx.z[Z_QUEENSIDE] = clamp01(queenFiles * 0.15);

  /* ---- phase coordinate Φ ---- */
  const pm = pos.phaseMaterial;
  const endgame = clamp01(1 - pm / 24);
  const totalPieces = pos.listCnt[0] + pos.listCnt[1];
  const developed = countDeveloped(pos);

  ctx.p[PH_OPENING] = clamp01((1 - endgame) * (1 - developed / 8) * (totalPieces > 24 ? 1 : 0.3));
  ctx.p[PH_MIDDLEGAME] = clamp01((1 - endgame) * developed / 6);
  ctx.p[PH_ENDGAME] = clamp01(endgame * 0.95);
  ctx.p[PH_TRANSITION] = clamp01(1 - Math.abs(ctx.p[PH_MIDDLEGAME] - ctx.p[PH_ENDGAME]) * 1.4) * 0.6;

  /* ---- tactical profile τ(P): independent of Φ ---- */
  let t = 0;
  t += pc.inCheck[WHITE] || pc.inCheck[BLACK] ? 0.3 : 0;
  t += pc.hanging[WHITE].length * 0.12 + pc.hanging[BLACK].length * 0.12;
  t += pc.pins.length * 0.1;
  t += structure ? Math.min(0.3, structure.hyperCounts[2] * 0.05) : 0; // forks
  ctx.tactical = clamp01(t);

  return ctx;
}

function countDeveloped(pos) {
  // pieces off their starting squares (excluding pawns and kings)
  let n = 0;
  for (let color = 0; color < 2; color++) {
    const backRank = color === WHITE ? 112 : 0;
    for (let i = 0; i < pos.listCnt[color]; i++) {
      const sq = pos.listSq[color][i];
      const p = pos.board[sq];
      const t = pieceType(p);
      if (t === PAWN || t === KING) continue;
      if (sq < backRank || sq >= backRank + 8) n++;
    }
  }
  return n;
}

/** Tactical priority τ ordering (doc 01 §10.4): terminal > forced > material > structure > context. */
export function contextAdjust(ctx, weights) {
  // multiplicative modification of feature weights by context intensity
  const out = new Float64Array(weights.length);
  for (let i = 0; i < weights.length; i++) out[i] = weights[i];
  return out;
}