/**
 * SUBIT-CHESS v3.0.0 — Evaluation Engine (SVF) and parameter set θ
 *
 * Spec basis:
 *   docs/theory/04_SUBIT_STRUCTURAL_VALUE_FUNCTION §3-§9
 *   docs/theory/09_SUBIT_CHESS_STRUCTURAL_VALUE_FUNCTION §4-§7
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART X §35-39
 *
 * Invariants:
 *   SVF-INV-001 Perspective Consistency   SVF(P,W) = -SVF(P,B)
 *   SVF-INV-002 Colour Symmetry           mirror(P) flips the sign, keeps |E|
 *   SVF-INV-003 Rule Priority             terminals are decided before evaluation
 *   SVF-INV-004 Structural Separation     Ω(P) never mixes with the value
 *   SVF-INV-007 No Double Counting        audited by ablation (verify.mjs)
 *   SVF-INV-009 Uncertainty Separation    E is never reported without U
 *   SVF-INV-010 Bounded Output            |E| <= E_MAX
 */

import {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  MATERIAL, PHASE_TOTAL, pieceType, rankOf, fileOf, opposite, squareName, moveToUci,
  KNIGHT_DELTAS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS
} from './core.mjs';
import { Percept } from './percept.mjs';
import { Structure } from './structure.mjs';
import { computeContext } from './context.mjs';

/* ------------------------------------------------------------------ *
 * Parameter set θ  (all values are centipawn-scaled and tunable)
 * ------------------------------------------------------------------ */

export const DEFAULT_PARAMS = {
  version: 'subit-3.0.0',
  material: { P: 100, N: 320, B: 330, R: 500, Q: 900 },
  bishopPair: 30,
  tempo: 8,

  // component weights (w_M ... w_X)
  w: { M: 1.0, K: 1.0, A: 1.0, D: 1.0, C: 1.0, T: 1.0, Q: 1.0, R: 1.0, X: 1.0 },

  // saturation scales s_i for h_i(x) = x / (1 + |x| / s_i)
  s: { M: 900, K: 120, A: 90, D: 60, C: 50, T: 140, Q: 70, R: 80, X: 80 },

  // pairwise interaction coefficients β_ij (only a controlled subset)
  interaction: {
    'M:K': 0.00022,   // material matters more when the king is safe
    'A:Q': 0.00035,   // activity is worth more with space
    'T:K': 0.00040,   // tactical potential is worth more when the enemy king is exposed
    'D:K': 0.00025
  },

  // context aggregation α_c (applied to the context-conditioned re-weighting)
  context: { enabled: true, strength: 0.35, floor: 0.65 },

  // evaluation bounds
  E_MAX: 30000,

  // fast-tier terms (doc 09 §6). Every term can be switched off so the
  // ablation harness can attribute strength to it.
  eval: {
    taper: true,             // blend mid/endgame instead of a hard switch
    mobility: { N: 4, B: 3, R: 2, Q: 1 },   // per reachable square
    bishopPair: 30,
    doubled: 14,
    isolated: 16,
    passed: [0, 8, 12, 22, 40, 70, 110, 0],   // by rank of the pawn (0..7)
    rookOpen: 14,
    rookSemiOpen: 7,
    kingShield: 10,
    kingShieldEndgame: 0.25,                   // shield matters less in the endgame
    kingOpenFile: 12,                          // open/semi-open file near king; A/B smoke +0.33 SE0.15 n=24 d4 seed1
    kingZone: 0,                               // attack-unit king pressure weight (0 = off)
    kingAttack: 0                              // penalty per attacker weight on king zone; A/B before enabling
  },

  // search policy parameters (doc 05 §15, doc 08)
  search: {
    ttMaxAge: 0, // ADR 0022: keep 0 by default; A/B only
    nullMove: { enabled: true, minDepth: 3, reduction: 2, maxReduction: 3 },
    lmr: { enabled: true, minDepth: 3, minMoveIndex: 3, reduction: 1, extraMoveIndex: 6, extraReduction: 0, maxReduction: 1, threatExemptMinVictim: 0 },
    // Futility is only sound at the frontier: a pruned quiet move can be a mate
    // in one, so pruning at depth 1..3 hides forced mates (measured on the
    // SmallFish game: a mate in 2 was reported as -471 cp at depth 8 with
    // maxDepth 3, and as -99996 with maxDepth <= 1).
    futility: { enabled: true, margin: 120, maxDepth: 1 },
    checkExtension: 1,
    rfp: { enabled: true, margin: 120, maxDepth: 3 },      // reverse futility (v3.0.9: +64 Elo [+8,+125], 120 games)
    qSee: { enabled: false, slack: 50 },
    seePrune: { enabled: false, maxDepth: 4, margin: 100 },
    budgetOpts: null,   // overrides of BUDGET_DEFAULTS for the stop rule (e.g. { omegaGate: true })
    lmrLog: { enabled: false, base: 0.75, div: 2.25 },     // log(depth)*log(move index) reduction table (v3.0.12 experiment)
    lmp: { enabled: false, maxDepth: 3, base: 3 },         // late move pruning of quiet moves (v3.0.12 experiment)
    iir: { enabled: false, minDepth: 4 },                  // internal iterative reduction when there is no TT move
    historyMalus: { enabled: false },                      // penalise quiet moves tried before a quiet cutoff move                   // SEE-lite capture pruning in quiescence
    structExtension: { enabled: false, maxPly: 8 },   // SEARCH-14: pawn to 7th extends one ply
    extensionBudget: 6,
    quietThreatExtension: { enabled: false, maxPly: 2, minVictim: 900 },
    aspiration: { window: 25, widen: 40, maxWiden: 8 },
    maxDepth: 64,
    nodeLimit: 0,          // 0 = unlimited
    timeLimitMs: 0,        // 0 = unlimited
    structuralEvalDepth: 2, // full SVF used at remaining depth <= this
    evalMode: 'fast',      // 'fast' | 'structural' | 'hybrid' — search hot path
    // Quiet checking moves at the first qsearch level. A sacrifice that starts
    // with a silent check is invisible to a captures-only horizon (audit A1).
    qsearch: { checks: true, maxChecks: 4 },
    see: { enabled: true, qsearchPrune: true, exactLva: false },
    // Gate 3 kill: structural ordering deleted (200-game A/B had no positive CI).
    // The keys stay at 0 so older configs remain loadable, but no bonus is
    // ever supplied to them — search ordering is now pv > tt > tactic > history.
    ordering: { pv: 1000000, tt: 900000, tactic: 800000, struct: 0, context: 0, history: 100000 }
  },

  // plans (doc 11)
  plan: { enabled: true, maxPlans: 6, rootBonus: 400 }
};

export function cloneParams(p) {
  return JSON.parse(JSON.stringify(p));
}

export function paramsFromJSON(obj) {
  const base = cloneParams(DEFAULT_PARAMS);
  return deepMerge(base, obj || {});
}

function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) &&
        target[k] && typeof target[k] === 'object') {
      deepMerge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Piece-square tables (used only by the fast evaluation tier)
 * ------------------------------------------------------------------ */

const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20
  ]
};

const KING_ENDGAME = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50
];

const PHASE_PIECE_COUNT = [0, 1, 1, 1, 2, 4, 0];

/* ------------------------------------------------------------------ *
 * Fast evaluation tier — used at the leaves of deep search
 * ------------------------------------------------------------------ *
 * Material and piece-square terms are fused into one lookup table per
 * piece-square, so the leaf loop is a single indexed add.
 */

const PST_CHARS = ' PNBRQK';

function buildPieceSquareTables(params) {
  const tables = [null];   // index 0 unused
  const pd = params.pstDelta || null;
  // flat copies: `mid[t * 128 + sq]` avoids the double indirection of
  // `tables[t].mid[sq]` in the leaf loop (measured: 42% of search time there)
  const mid = new Int32Array(7 * 128);
  const end = new Int32Array(7 * 128);
  for (let t = 1; t <= 6; t++) {
    const ch = PST_CHARS[t];
    const mat = params.material[ch] || 0;
    const m = new Int32Array(128);
    const e = new Int32Array(128);
    const pst = PST[ch];
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const r = sq >> 4, f = sq & 7;
      const idx = r * 8 + f;
      const v = t === KING ? 0 : mat;
      // pstDelta: optional learned correction (bench/texel); { mid: {P:[64],...}, end: {...} } in the same
      // rank-major order as PST. Absent in the shipped defaults, so nothing changes unless it is set.
      const dm = pd && pd.mid && pd.mid[ch] ? pd.mid[ch][idx] || 0 : 0;
      const de = pd && pd.end && pd.end[ch] ? pd.end[ch][idx] || 0 : 0;
      m[sq] = v + pst[idx] + dm;
      e[sq] = v + (t === KING ? KING_ENDGAME[idx] : pst[idx]) + de;
      mid[t * 128 + sq] = m[sq];
      end[t * 128 + sq] = e[sq];
    }
    tables[t] = { mid: m, end: e };
  }
  tables.flatMid = mid;
  tables.flatEnd = end;
  return tables;
}

let TABLES = null;
let TABLES_PARAMS = null;
let TABLES_SIG = '';

function tablesSig(params) {
  const m = params && params.material ? params.material : DEFAULT_PARAMS.material;
  return `${m.P}|${m.N}|${m.B}|${m.R}|${m.Q}|${params && params.pstRev ? params.pstRev : 0}`;
}

function tables(params) {
  const sig = tablesSig(params);
  // AUD-311-11: invalidate on content change, not only object identity.
  if (!TABLES || TABLES_PARAMS !== params || TABLES_SIG !== sig) {
    TABLES = buildPieceSquareTables(params);
    TABLES_PARAMS = params;
    TABLES_SIG = sig;
  }
  return TABLES;
}

/**
 * Static evaluation, side-to-move relative (the contract the search expects:
 * `negamax` negates child values, so every leaf must be from the mover's view).
 * The piece-square sum is white-positive and is mirrored for black; the tempo
 * bonus always belongs to the side to move.
 *
 * Two tiers of information, both linear and allocation-free:
 *   1. tapered material + piece-square tables (blended by game phase, not a
 *      hard mid/endgame switch that makes the eval jump by ~30cp);
 *   2. cheap structural terms — bishop pair, doubled/isolated/passed pawns,
 *      rook files, king shield. No percept is built here: this runs at every
 *      leaf, so it must stay O(pieces) with no allocation.
 */
export function evaluateFast(pos, params = DEFAULT_PARAMS) {
  const T = tables(params);
  const cfg = params.eval || {};
  const mob = cfg.mobility || null;
  const cfgPassed = cfg.passed || null;
  const cfgDoubled = cfg.doubled || 0;
  const cfgIsolated = cfg.isolated || 0;
  const cfgBishopPair = cfg.bishopPair || 0;
  const cfgRookOpen = cfg.rookOpen || 0;
  const cfgRookSemiOpen = cfg.rookSemiOpen || 0;
  const cfgShield = cfg.kingShield || 0;
  const cfgConnected = cfg.connected || 0;
  const cfgRook7 = cfg.rook7 || 0;
  const cfgShieldEndgame = cfg.kingShieldEndgame || 0;
  const cfgKingOpenFile = cfg.kingOpenFile || 0;
  const cfgKingAttack = cfg.kingAttack || 0;
  const cfgKingZone = cfg.kingZone || 0;
  const flatMid = T.flatMid;
  const flatEnd = T.flatEnd;
  pos.refreshPieces();
  const stmSign = pos.turn === WHITE ? 1 : -1;
  const b = pos.board;

  let mid = 0;
  let end = 0;
  let mobility = 0;
  // scratch buffers: the evaluator runs at every leaf, so nothing is allocated
  const bishops = _bishops;
  const pawnMask = _pawnMask;
  const rookSq = _rookSq;
  const rookCnt = _rookCnt;
  bishops[0] = bishops[1] = 0;
  rookCnt[0] = rookCnt[1] = 0;
  pawnMask[0].fill(0);
  pawnMask[1].fill(0);
  const kingSq = _kingSq;

  for (let color = 0; color < 2; color++) {
    const sign = color === WHITE ? 1 : -1;
    const list = pos.listSq[color];
    const n = pos.listCnt[color];
    const mine = pawnMask[color];
    // the tables are stored white-relative; mirror the square for black
    const black = color === WHITE ? 0 : 1;
    for (let i = 0; i < n; i++) {
      const sq = list[i];
      const t = b[sq] & 7;
      const tsq = black ? (7 - (sq >> 4)) * 16 + (sq & 7) : sq;
      mid += sign * flatMid[t * 128 + tsq];
      end += sign * flatEnd[t * 128 + tsq];
      if (mob && (t === KNIGHT || t === BISHOP || t === ROOK || t === QUEEN)) {
        const w = t === KNIGHT ? mob.N : t === BISHOP ? mob.B : t === ROOK ? mob.R : mob.Q;
        mobility += sign * w * (t === KNIGHT ? knightMobility(b, sq, color) : sliderMobility(b, sq, t, color));
      }
      if (t === PAWN) mine[sq & 7] |= 1 << (7 - (sq >> 4));
      else if (t === BISHOP) bishops[color]++;
      else if (t === ROOK) { if (rookCnt[color] < 10) rookSq[color][rookCnt[color]++] = sq; }
      else if (t === KING) kingSq[color] = sq;
    }
  }

  // phase from the *non-pawn* material: pos.phaseMaterial counts pawns too
  // (40 at the start) while PHASE_TOTAL is the piece total, so using it
  // directly kept the taper switched off through the whole middlegame
  let pawns = 0;
  for (let f = 0; f < 8; f++) pawns += POP8[pawnMask[0][f]] + POP8[pawnMask[1][f]];
  const nonPawn = pos.phaseMaterial - pawns;
  const phase = 1 - Math.min(1, nonPawn / PHASE_TOTAL);   // 0 opening .. 1 endgame

  let score = cfg.taper === false ? (phase < 0.5 ? mid : end) : mid + (end - mid) * phase;

  // ---- structural terms, white-positive ----
  const passed = cfgPassed;
  const shieldW = cfgShield;
  if (mobility) score += mobility * (1 - 0.5 * phase);   // mobility matters less in the endgame

  for (let color = 0; color < 2; color++) {
    const sign = color === WHITE ? 1 : -1;
    const mine = pawnMask[color];
    const theirs = pawnMask[color ^ 1];

    if (cfgBishopPair && bishops[color] >= 2) score += sign * cfgBishopPair;

    for (let f = 0; f < 8; f++) {
      const mask = mine[f];
      if (!mask) continue;
      const n = POP8[mask];
      if (cfgDoubled && n > 1) score -= sign * cfgDoubled * (n - 1);
      const left = f > 0 ? mine[f - 1] : 0;
      const right = f < 7 ? mine[f + 1] : 0;
      if (cfgIsolated && !left && !right) score -= sign * cfgIsolated * n;
      if (cfgConnected) {
        // phalanx (neighbour on the same rank) or chain (neighbour one rank behind)
        let m2 = mask;
        while (m2) {
          const r = CTZ8[m2 & 255];
          m2 &= m2 - 1;
          const behind = color === WHITE ? r - 1 : r + 1;
          const nb = left | right;
          if ((nb & (1 << r)) || (behind >= 0 && behind <= 7 && (nb & (1 << behind)))) {
            const rel = color === WHITE ? r : 7 - r;
            score += sign * cfgConnected * (1 + rel) / 4;
          }
        }
      }
      if (passed) {
        // a pawn is passed when no enemy pawn stands on its file or the adjacent
        // files *in front of it*. Ranks are white-relative, so white looks at
        // higher ranks and black at lower ones.
        const enemy = theirs[f] | (f > 0 ? theirs[f - 1] : 0) | (f < 7 ? theirs[f + 1] : 0);
        let m = mask;
        while (m) {
          const r = CTZ8[m & 255];
          m &= m - 1;
          const blocked = color === WHITE
            ? (enemy & ~((1 << (r + 1)) - 1))
            : (enemy & ((1 << r) - 1));
          if (!blocked) score += sign * passed[color === WHITE ? r : 7 - r];
        }
      }
    }

    for (let ri = 0; ri < rookCnt[color]; ri++) {
      const sq = rookSq[color][ri];
      const f = sq & 7;
      if (!mine[f]) {
        // semi-open = enemy pawn still on the file, open = no pawn at all
        score += sign * (theirs[f] ? cfgRookSemiOpen : cfgRookOpen);
      }
      if (cfgRook7 && (sq >> 4) === (color === WHITE ? 1 : 6)) score += sign * cfgRook7;
    }

    // king shield: own pawns on the three files around the king, on the two
    // ranks in front (white looks up, black looks down the rank bit), weighted
    // down in the endgame
    if (shieldW || cfgKingOpenFile) {
      const kf = kingSq[color] & 7;
      const kr = 7 - (kingSq[color] >> 4);
      const dir = color === WHITE ? 1 : -1;
      const shieldWeight = shieldW * (1 - (1 - cfgShieldEndgame) * phase);
      const openWeight = cfgKingOpenFile * (1 - 0.5 * phase);
      const lo = Math.min(kr + dir, kr + 2 * dir);
      const hi = Math.max(kr + dir, kr + 2 * dir);
      let missing = 0;
      let openFiles = 0;
      for (let f = Math.max(0, kf - 1); f <= Math.min(7, kf + 1); f++) {
        const bits = (lo >= 0 && lo <= 7 ? (1 << lo) : 0) | (hi >= 0 && hi <= 7 ? (1 << hi) : 0);
        if (shieldW && !(mine[f] & bits)) missing++;
        if (cfgKingOpenFile) {
          const own = mine[f];
          const opp = theirs[f];
          if (!own && !opp) openFiles += 1;
          else if (!own) openFiles += 0.5;
        }
      }
      if (missing) score -= sign * shieldWeight * missing;
      if (openFiles) score -= sign * openWeight * openFiles;
    }

    if (cfgKingAttack) {
      const ksq = kingSq[color];
      const kr = ksq >> 4, kf = ksq & 7;
      const enemy = color ^ 1;
      let atk = 0;
      for (let dr = -1; dr <= 1; dr++) for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const r = kr + dr, f = kf + df;
        if (r < 0 || r > 7 || f < 0 || f > 7) continue;
        if (pos.isAttacked((r << 4) | f, enemy)) atk++;
      }
      if (atk) score -= sign * cfgKingAttack * atk * (1 - 0.4 * phase);
    }
  }

  // King-zone pressure (attack units, quadratic, middlegame only). Each attacking N/B/R/Q whose attack set
  // reaches the squares around the enemy king and the three in front of them adds a weight (2/2/3/5) plus one per
  // extra zone square; with two or more attackers (or the queen) the penalty grows with the square of the units.
  if (cfgKingZone && phase < 0.85) {
    for (let color = 0; color < 2; color++) {
      const sign = color === WHITE ? 1 : -1;       // the attacker's colour, white-positive
      const eks = pos.kingSq[color ^ 1];
      zoneMark(b, eks, color, 1);
      let units = 0, attackers = 0, queen = false;
      const list = pos.listSq[color];
      const n = pos.listCnt[color];
      for (let i = 0; i < n; i++) {
        const sq = list[i];
        const t = b[sq] & 7;
        if (t < KNIGHT || t > QUEEN) continue;
        const hits = zoneHits(b, sq, t);
        if (hits) { attackers++; units += ZONE_W[t] + hits - 1; if (t === QUEEN) queen = true; }
      }
      zoneMark(b, eks, color, 0);
      if (attackers >= 2 || (attackers === 1 && queen)) {
        const pen = Math.min(400, cfgKingZone * units * units / 2);
        score += sign * pen * (1 - phase);
      }
    }
  }

  return clampScore(score * stmSign + params.tempo, params);
}

// 8-bit lookup tables: the pawn masks are one byte per file, so a table beats a
// loop (measured in the leaf loop)
const POP8 = new Int8Array(256);
const CTZ8 = new Int8Array(256);
for (let i = 1; i < 256; i++) {
  POP8[i] = POP8[i >> 1] + (i & 1);
  CTZ8[i] = i & 1 ? 0 : CTZ8[i >> 1] + 1;
}

/* ---------------- mobility (cheap, board-scanned) ---------------- */

/** Number of squares a knight can move to (own pieces block). */
function knightMobility(b, sq, color) {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const to = sq + KNIGHT_DELTAS[i];
    if (to & 0x88) continue;
    const p = b[to];
    if (p && (p >> 3) === color) continue;
    n++;
  }
  return n;
}


/* ---------------- king-zone helpers (scratch-marked 0x88 board) ---------------- */
const _zone = new Uint8Array(128);
const ZONE_W = [0, 0, 2, 2, 3, 5, 0];     // by piece type: N, B, R, Q
/** Mark (or clear) the king ring plus the three squares in front of it (towards the attacker). */
function zoneMark(b, ksq, attackerColor, v) {
  const fwd = attackerColor === WHITE ? 16 : -16;   // from the defending king towards the board centre (0x88 rows: rank 8 is row 0)
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      const t = ksq + dr * 16 + df;
      if (!(t & 0x88)) _zone[t] = v;
    }
  }
  for (let df = -1; df <= 1; df++) {
    const t = ksq + 2 * fwd + df;
    if (!(t & 0x88)) _zone[t] = v;
  }
}
/** Number of zone squares a piece attacks (sliders stop at the first piece, which is counted). */
function zoneHits(b, sq, type) {
  let n = 0;
  if (type === KNIGHT) {
    for (let i = 0; i < 8; i++) { const to = sq + KNIGHT_DELTAS[i]; if (!(to & 0x88) && _zone[to]) n++; }
    return n;
  }
  const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
  for (let d = 0; d < dirs.length; d++) {
    let to = sq + dirs[d];
    while (!(to & 0x88)) {
      if (_zone[to]) n++;
      if (b[to]) break;
      to += dirs[d];
    }
  }
  return n;
}

/** Number of squares a slider can reach (stops at the first piece). */
function sliderMobility(b, sq, type, color) {
  const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
  let n = 0;
  for (let d = 0; d < dirs.length; d++) {
    let to = sq + dirs[d];
    while (!(to & 0x88)) {
      const p = b[to];
      if (!p) { n++; to += dirs[d]; continue; }
      if ((p >> 3) !== color) n++;      // an enemy piece is capturable, not enterable
      break;
    }
  }
  return n;
}

// module-level scratch for the fast tier (see evaluateFast)
const _bishops = [0, 0];
const _pawnMask = [new Int32Array(8), new Int32Array(8)];
const _rookSq = [new Int32Array(10), new Int32Array(10)];
const _rookCnt = [0, 0];
const _kingSq = [0, 0];

function clampScore(v, params) {
  const m = params.E_MAX || 30000;
  return v > m ? m : v < -m ? -m : v;
}

/* ------------------------------------------------------------------ *
 * Structural value function
 * ------------------------------------------------------------------ */

const saturate = (x, s) => (s <= 0 ? x : x / (1 + Math.abs(x) / s));

export const SVF_COMPONENTS = ['M', 'K', 'A', 'D', 'C', 'T', 'Q', 'R', 'X'];

/**
 * Compute the structural value vector V(P) = (M,K,A,D,C,T,Q,R,X) from the
 * side-to-move perspective, in centipawns, before weighting.
 */
export function structuralVector(pos, percept, structure, ctx, params) {
  const us = pos.turn;
  const them = opposite(us);

  // M — material
  const M = percept.material[us] - percept.material[them] +
    (percept.bishops[us] > 1 ? params.bishopPair : 0) -
    (percept.bishops[them] > 1 ? params.bishopPair : 0);

  // K — king safety (positive = own king safer than the enemy king)
  const K = kingSafety(pos, percept, us) - kingSafety(pos, percept, them);

  // A — activity (mobility, rook files, outposts, bishop activity).
  // SVF-INV-007: open files are owned here; centre control belongs to Q only.
  const A =
    (percept.mobility[us] - percept.mobility[them]) * 2.0 +
    (percept.semiOpenFiles[us].length - percept.semiOpenFiles[them].length) * 6 +
    (percept.openFiles[us].length - percept.openFiles[them].length) * 4 +
    (percept.outposts[us].length - percept.outposts[them].length) * 10;

  // D — defensive organisation
  const D = defenceScore(pos, percept, us) - defenceScore(pos, percept, them);

  // C — coordination
  const C = structure.counts[9] > 0
    ? (countConnect(structure, us) - countConnect(structure, them)) * 4
    : 0;

  // T — tactical potential (only *potential*, never the material result of a
  //     combination already resolved by search — doc 09 §4.5).
  // SVF-INV-007: `hanging` is owned by T; D scores defence coverage only.
  const T =
    (percept.hanging[them].length - percept.hanging[us].length) * 18 +
    (percept.pins.filter((p) => p.color === them).length -
     percept.pins.filter((p) => p.color === us).length) * 12 +
    forkBalance(structure, us, them) * 10;

  // Q — space / spatial control
  const Q =
    (percept.centerControl[us] - percept.centerControl[them]) * 4 +
    (spaceControlled(pos, percept, us) - spaceControlled(pos, percept, them)) * 2 +
    (mostAdvancedPawnRank(percept, us) - mostAdvancedPawnRank(percept, them)) * 4;

  // R — relations
  const R =
    (countRel(structure, 1, us) - countRel(structure, 1, them)) * 1.5 +
    (countRel(structure, 10, us) - countRel(structure, 10, them)) * 4 +
    (countRel(structure, 7, us) - countRel(structure, 7, them)) * 3 +
    (countRel(structure, 2, us) - countRel(structure, 2, them)) * 1.0;

  // X — transformation potential. Open files are an activity feature (A),
  // not a second transformation term (SVF-INV-007).
  const X =
    (percept.passed[us].length - percept.passed[them].length) * 8 +
    (passedAdvancePotential(percept, us) - passedAdvancePotential(percept, them));

  return new Float64Array([M, K, A, D, C, T, Q, R, X]);
}

function countRel(structure, type, color) {
  // relations are undirected in count; use origin colour
  const b = structure.pos.board;
  let n = 0;
  for (const k of structure.keys) {
    if (((k / 16384) | 0) !== type) continue;
    const from = ((k / 128) | 0) & 127;
    if (b[from] && (b[from] >> 3) === color) n++;
  }
  return n;
}

function countConnect(structure, color) {
  const b = structure.pos.board;
  let n = 0;
  for (const k of structure.keys) {
    if (((k / 16384) | 0) !== 9) continue;
    const from = ((k / 128) | 0) & 127;
    if (b[from] && (b[from] >> 3) === color) n++;
  }
  return n;
}

function forkBalance(structure, us, them) {
  let mine = 0, theirs = 0;
  for (const h of structure.hyper) {
    if (h.type !== 2) continue;
    const sq = h.pieces[0];
    if (!sq) continue;
    const c = structure.pos.board[sq] >> 3;
    if (c === us) mine++;
    else if (c === them) theirs++;
  }
  // SVF-INV-002: every axis is relative to the side to move
  return mine - theirs;
}

function kingSafety(pos, percept, color) {
  const shield = pawnShield(pos, percept, color);
  const zone = percept.kingZoneAttacks[color];
  const openness = openFilesNearKing(pos, color);
  // `k` (the king square) is not a score term; the old `+ k * 0` was dead
  // syntax that made the ownership audit noisier than the maths.
  return shield * 2.2 - zone * 12 - openness * 8 - (percept.inCheck[color] ? 25 : 0);
}

function pawnShield(pos, percept, color) {
  const k = percept.kingSq[color];
  const kf = fileOf(k);
  const dir = color === WHITE ? -1 : 1;
  let n = 0;
  for (let df = -1; df <= 1; df++) {
    const f = kf + df;
    if (f < 0 || f > 7) continue;
    for (let step = 1; step <= 2; step++) {
      const r = rankOf(k) + dir * step;
      if (r < 0 || r > 7) break;
      const p = pos.board[r * 16 + f];
      if (p !== 0 && pieceType(p) === PAWN && (p >> 3) === color) { n += step === 1 ? 1 : 0.5; break; }
    }
  }
  return n;
}

function openFilesNearKing(pos, color) {
  // King exposure, not the raw open-file count owned by A (SVF-INV-007):
  // only the three files around this king can enter K.
  const k = color === 0 ? pos.kingSq[0] : pos.kingSq[1];
  const kf = fileOf(k);
  let open = 0;
  for (let df = -1; df <= 1; df++) {
    const f = kf + df;
    if (f < 0 || f > 7) continue;
    let hasPawn = false;
    for (let r = 0; r < 8; r++) {
      const p = pos.board[r * 16 + f];
      if (p !== 0 && pieceType(p) === PAWN) { hasPawn = true; break; }
    }
    if (!hasPawn) open++;
  }
  return open;
}

function defenceScore(pos, percept, color) {
  // SVF-INV-007: hung pieces are scored once, in T. D measures how well the
  // remaining pieces are defended, not the material loss from hanging them.
  let defended = 0, overprotected = 0;
  const list = pos.listSq[color];
  for (let i = 0; i < pos.listCnt[color]; i++) {
    const sq = list[i];
    const d = percept.atk.defenders(sq, color);
    if (d > 0) defended++;
    if (d > 1) overprotected += d - 1;
  }
  return defended * 3 + overprotected * 1.5;
}

function spaceControlled(pos, percept, color) {
  // squares of the opponent's half controlled by `color` (the old test
  // `rank > 3 && rank < 4` was unsatisfiable, so this axis was always 0)
  const lo = color === WHITE ? 0 : 4;
  const hi = color === WHITE ? 3 : 7;
  let n = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const r = rankOf(sq);
    if (r < lo || r > hi) continue;
    if (percept.atk.cnt[color][sq]) n++;
  }
  return n;
}

function mostAdvancedPawnRank(percept, color) {
  const pawns = percept.pawnSquares[color];
  if (!pawns.length) return 0;
  let best = 0;
  for (const sq of pawns) {
    const r = rankOf(sq);
    const advanced = color === WHITE ? 6 - r : r - 1;
    if (advanced > best) best = advanced;
  }
  return best;
}

function passedAdvancePotential(percept, color) {
  let s = 0;
  for (const sq of percept.passed[color]) {
    const r = rankOf(sq);
    const advanced = color === WHITE ? 6 - r : r - 1;
    s += Math.max(0, advanced) * 3;
  }
  return s;
}

/* ------------------------------------------------------------------ *
 * Scalarisation
 * ------------------------------------------------------------------ */

/**
 * E(P;θ) = E0 + E_interaction + E_context, then bounded to ±E_MAX.
 */
export function scalarize(vec, ctx, params) {
  const w = params.w, s = params.s;
  const names = SVF_COMPONENTS;
  let E0 = 0;
  for (let i = 0; i < names.length; i++) {
    E0 += w[names[i]] * saturate(vec[i], s[names[i]]);
  }

  let Ei = 0;
  const inter = params.interaction || {};
  for (const key of Object.keys(inter)) {
    const [a, b] = key.split(':');
    const ia = names.indexOf(a), ib = names.indexOf(b);
    if (ia < 0 || ib < 0) continue;
    Ei += inter[key] * vec[ia] * vec[ib];
  }

  let Ec = 0;
  if (params.context && params.context.enabled && ctx) {
    const strength = params.context.strength;
    // context-conditioned re-weighting of each component (doc 09 §5.3)
    const cw = ctx.w, cz = ctx.z, cp = ctx.p;
    let acc = 0;
    for (let i = 0; i < names.length; i++) {
      const base = w[names[i]];
      let mod = 0;
      switch (names[i]) {
        case 'A': mod = cw[2] * 0.25 + cz[2] * 0.15 + cz[3] * 0.15; break;
        case 'K': mod = cw[1] * 0.35 + cw[2] * 0.25; break;
        case 'Q': mod = cz[3] * 0.3 + cz[0] * 0.1; break;
        case 'X': mod = cp[2] * 0.35 + cp[3] * 0.15; break;
        case 'T': mod = cw[2] * 0.2; break;
        case 'M': mod = cp[2] * 0.15; break;
        default: mod = 0.08;
      }
      acc += base * mod * saturate(vec[i], s[names[i]]);
    }
    Ec = strength * acc;
  }

  const E = E0 + Ei + Ec;
  return { E, E0, Ei, Ec };
}

export function clampEval(E, params) {
  const m = params.E_MAX;
  return E > m ? m : E < -m ? -m : E;
}

/* ------------------------------------------------------------------ *
 * Public entry points
 * ------------------------------------------------------------------ */

export class Evaluation {
  constructor(params = DEFAULT_PARAMS, opts = {}) {
    this.params = params;
    this.opts = Object.assign({
      mode: 'hybrid',          // 'fast' | 'structural' | 'hybrid'
      structuralDepth: 2,      // hybrid: use SVF when remaining depth <= this
      cache: false
    }, opts);
    this.cache = this.opts.cache ? new Map() : null;
    // fast-tier evaluation cache (v3.0.9, ROADMAP Gate 6): speed only. evaluateFast is a pure function of
    // the position (placement, turn, castling, ep; not the clocks) and of `params`, so a hit is exact.
    // Direct-mapped, verified against the full 53-bit key. Call clearEvalCache() after mutating params.
    this.evalBits = this.opts.evalCacheBits === undefined ? 17 : this.opts.evalCacheBits;
    this.evalKeys = this.evalBits ? new Float64Array(1 << this.evalBits).fill(-1) : null;
    this.evalVals = this.evalBits ? new Float64Array(1 << this.evalBits) : null;
    this.evalHits = 0; this.evalProbes = 0;
  }

  clearEvalCache() { if (this.evalKeys) this.evalKeys.fill(-1); }

  /** Fast tier. Side-to-move perspective, centipawns. */
  fast(pos) {
    return evaluateFast(pos, this.params);
  }

  /** Full structural tier. Returns { E, vector, context, confidence, structure }. */
  structural(pos) {
    // the cache key includes the halfmove bucket: the same geometry with a
    // different clock is a different position for the 50-move rule (audit §3.2)
    const key = pos.ttKey;
    if (this.cache) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const percept = new Percept(pos);
    const structure = buildStructureSafe(pos, percept);
    // the temporal axis of the context reads the structural hyper-counts
    // (forks), so the structural tier must build the context from the same
    // structure the engine uses; passing null made the two disagree
    // (audit v3.0.6 §6.1)
    const ctx = computeContext(pos, percept, structure);
    const vec = structuralVector(pos, percept, structure, ctx, this.params);
    const { E, E0, Ei, Ec } = scalarize(vec, ctx, this.params);
    const uncertainty = estimateUncertainty(pos, percept, structure, vec);
    const result = {
      // structuralVector() is built from the side-to-move perspective
      // (us = pos.turn), so E is already relative to the mover: negating it
      // again made every black-to-move node report the opposite of the truth
      E: clampEval(E, this.params),
      E0, Ei, Ec,
      white: clampEval(pos.turn === WHITE ? E : -E, this.params),
      vector: vec,
      context: ctx,
      confidence: confidenceVector(percept, structure),
      uncertainty,
      structure,
      percept
    };
    if (this.cache) {
      if (this.cache.size > 4096) this.cache.clear();
      this.cache.set(key, result);
    }
    return result;
  }

  /** Hybrid tier used by the search. */
  evaluate(pos, remainingDepth) {
    if (this.opts.mode === 'fast') return this.fastCached(pos);
    if (this.opts.mode === 'structural') return this.structural(pos).E;
    if (remainingDepth <= this.opts.structuralDepth) return this.structural(pos).E;
    return this.fastCached(pos);
  }

  fastCached(pos) {
    const keys = this.evalKeys;
    if (!keys) return evaluateFast(pos, this.params);
    const k = pos.key;
    const i = pos.hashLo & ((1 << this.evalBits) - 1);
    this.evalProbes++;
    if (keys[i] === k) { this.evalHits++; return this.evalVals[i]; }
    const v = evaluateFast(pos, this.params);
    keys[i] = k; this.evalVals[i] = v;
    return v;
  }
}

function buildStructureSafe(pos, percept) {
  return new Structure(pos, percept);
}

function confidenceVector(percept, structure) {
  return {
    M: 1.0,                                  // exact
    A: 0.95,                                 // exact move counts
    R: 0.75,                                 // typed relations, exact but model-dependent
    K: 0.7,
    T: 0.6,
    Q: 0.8,
    X: 0.5
  };
}

/**
 * U(P) — search/evaluation uncertainty (doc 05 §17). Not a probability.
 * Higher = more value in extra search.
 */
function estimateUncertainty(pos, percept, structure, vec) {
  let u = 0;
  u += Math.min(1, percept.hanging[0].length + percept.hanging[1].length) * 0.25;
  u += Math.min(1, percept.pins.length * 0.2) * 0.2;
  const legal = pos.generateMoves(false).length;
  u += Math.min(1, legal / 40) * 0.2;
  u += Math.abs(vec[1]) > 80 ? 0.2 : 0;         // king safety swing
  u += structure.hyper.length > 6 ? 0.15 : 0;
  return Math.max(0, Math.min(1, u));
}