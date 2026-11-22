/**
 * SUBIT-CHESS v3.0.0 — Structural Analysis Engine (SRA + Structural Metric)
 *
 * Spec basis:
 *   docs/theory/02_SUBIT_RELATION_ALGEBRA          §3-§9   typed relations & hyperrelations
 *   docs/theory/03_SUBIT_STRUCTURAL_METRIC         §4-§15  component-wise structural distance
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH      PART VII §23-27
 *
 * Relations stay typed (SM-INV-003: ATTACK, DEFEND, CONTROL and SUPPORT are never
 * merged). The distance between two positions is kept as a VECTOR; collapsing it
 * into one number is an explicit, separately-justified step (metric.mjs).
 */

import {
  WHITE, BLACK, EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  MATERIAL, pieceType, pieceColor, rankOf, fileOf, opposite,
  BISHOP_DIRS, ROOK_DIRS
} from './core.mjs';
import { attacksOf, REL_TYPE_ID } from './percept.mjs';

export const REL = REL_TYPE_ID;
export const REL_COUNT = 12;

export const REL_KEY = (type, from, to) => type * 16384 + from * 128 + to;
export const REL_KEY_TYPE = (k) => (k / 16384) | 0;
export const REL_KEY_FROM = (k) => ((k / 128) | 0) & 127;
export const REL_KEY_TO = (k) => k & 127;

export const HYPER = {
  PIN: 1, FORK: 2, DISCOVER: 3, DOUBLE_ATTACK: 4,
  OVERLOAD: 5, DEFLECTION: 6, INTERFERENCE: 7, MATE_NET: 8
};
export const HYPER_NAME = ['', 'PIN', 'FORK', 'DISCOVER', 'DOUBLE_ATTACK',
  'OVERLOAD', 'DEFLECTION', 'INTERFERENCE', 'MATE_NET'];

/**
 * Structural representation of one position.
 *   Ω(P) = (V, R, A, C, T, Q, H)
 */
export class Structure {
  constructor(pos, percept) {
    this.pos = pos;
    this.percept = percept;
    this.keys = [];           // encoded typed relations
    this.keySet = new Set();
    this.counts = new Int32Array(REL_COUNT);
    this.hyper = [];          // {type, pieces:[..]}
    this.hyperCounts = new Int32Array(HYPER_NAME.length);
    this.attrs = null;        // filled by fillAttributes()
    this.fingerprint = 0;
    this.build();
  }

  add(type, from, to) {
    const k = REL_KEY(type, from, to);
    if (this.keySet.has(k)) return;
    this.keySet.add(k);
    this.keys.push(k);
    this.counts[type]++;
  }

  build() {
    const pos = this.pos;
    const pc = this.percept;
    const b = pos.board;
    const scratch = [];

    // ---- per-piece relations -------------------------------------------------
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const list = pos.listSq[color];
      for (let i = 0; i < pos.listCnt[color]; i++) {
        const from = list[i];
        const p = b[from];
        const t = pieceType(p);
        attacksOf(pos, from, scratch);
        for (let k = 0; k < scratch.length; k++) {
          const to = scratch[k];
          const occ = b[to];
          if (occ === EMPTY) {
            this.add(REL.CONTROL, from, to);
            continue;
          }
          const oc = pieceColor(occ);
          if (oc === enemy) {
            this.add(REL.ATTACK, from, to);
            const vt = pieceType(occ);
            const defenders = pc.atk.defenders(to, enemy);
            const cheapest = pc.atk.leastAttacker(to, color);
            if (defenders === 0 || cheapest < ((MATERIAL[vt] / 100) | 0)) {
              this.add(REL.THREATEN, from, to);
            }
          } else {
            this.add(REL.DEFEND, from, to);
          }
        }

        // BLOCK: own piece standing on the only ray square between this slider and a target
        if (t === BISHOP || t === ROOK || t === QUEEN) {
          const dirs = t === BISHOP ? BISHOP_DIRS : t === ROOK ? ROOK_DIRS
            : [...BISHOP_DIRS, ...ROOK_DIRS];
          for (const d of dirs) {
            let to = from + d;
            let first = -1;
            while (to < 128 && (to & 0x88) === 0) {
              const q = b[to];
              if (q !== EMPTY) { first = to; break; }
              to += d;
            }
            if (first >= 0 && pieceColor(b[first]) === color) {
              this.add(REL.BLOCK, first, from);   // `first` blocks `from`'s line
            }
          }
        }

        // RESTRICT: enemy piece whose mobility is reduced by this piece's control
        for (let j = 0; j < pos.listCnt[enemy]; j++) {
          const target = pos.listSq[enemy][j];
          const tt = pieceType(b[target]);
          if (tt === PAWN) continue;
          attacksOf(pos, target, scratch);
          let free = 0;
          let controlled = 0;
          for (let k = 0; k < scratch.length; k++) {
            const to = scratch[k];
            if (b[to] !== EMPTY) continue;
            free++;
            if (pc.atk.cnt[color][to]) controlled++;
          }
          // restriction is only real when this piece takes away squares the
          // target could actually use
          if (free === 0 || controlled === 0) continue;
          if (free - controlled < Math.ceil(free * 0.25)) continue;
          this.add(REL.RESTRICT, from, target);
        }
      }
    }

    // ---- CONNECT: own pieces sharing a common controlled square or a file/diagonal
    for (let color = 0; color < 2; color++) {
      const list = pos.listSq[color];
      for (let i = 0; i < pos.listCnt[color]; i++) {
        for (let j = i + 1; j < pos.listCnt[color]; j++) {
          const a = list[i], c = list[j];
          if (pieceType(b[a]) === PAWN || pieceType(b[c]) === PAWN) continue;
          const shared = pc.atk.defenders(a, color) > 0 && pc.atk.defenders(c, color) > 0;
          const sameFile = fileOf(a) === fileOf(c);
          const dr = rankOf(a) - rankOf(c), df = fileOf(a) - fileOf(c);
          const sameDiag = Math.abs(dr) === Math.abs(df);
          if (shared || sameFile || sameDiag) this.add(REL.CONNECT, a, c);
        }
      }
    }

    // ---- SUPPORT: piece controlling the advance square of an own passed pawn
    for (let color = 0; color < 2; color++) {
      for (const sq of pc.passed[color]) {
        const dir = color === WHITE ? -16 : 16;
        const ahead = sq + dir;
        if (ahead < 0 || ahead > 127 || (ahead & 0x88)) continue;
        for (let j = 0; j < pos.listCnt[color]; j++) {
          const s = pos.listSq[color][j];
          if (s === sq) continue;
          if (pc.atk.cnt[color][ahead] && attacksOf(pos, s, []).includes(ahead)) {
            this.add(REL.SUPPORT, s, sq);
            break;
          }
        }
      }
    }

    // ---- PIN (hyperrelation) -------------------------------------------------
    for (const pin of pc.pins) {
      this.add(REL.PIN, pin.pinner, pin.pinned);
      this.addHyper(HYPER.PIN, [pin.pinner, pin.pinned, pin.king]);
    }

    // ---- DISCOVER / FORK / DOUBLE ATTACK -------------------------------------
    for (let color = 0; color < 2; color++) {
      const enemy = opposite(color);
      const list = pos.listSq[color];
      for (let i = 0; i < pos.listCnt[color]; i++) {
        const from = list[i];
        const t = pieceType(b[from]);
        const attacked = [];
        attacksOf(pos, from, scratch);
        for (let k = 0; k < scratch.length; k++) {
          const to = scratch[k];
          const occ = b[to];
          if (occ !== EMPTY && pieceColor(occ) === enemy && pieceType(occ) !== PAWN) attacked.push(to);
        }
        if (attacked.length >= 2) {
          // AUD-311-14: record one canonical fork hyperrelation per attacker.
          this.addHyper(HYPER.FORK, [from, ...attacked]);
        }
        // discovered attack potential: an own piece standing on a ray from a slider
        if (t === BISHOP || t === ROOK || t === QUEEN) {
          const dirs = t === BISHOP ? BISHOP_DIRS : t === ROOK ? ROOK_DIRS
            : [...BISHOP_DIRS, ...ROOK_DIRS];
          for (const d of dirs) {
            let to = from + d;
            while (to < 128 && (to & 0x88) === 0 && b[to] === EMPTY) to += d;
            if (to >= 128 || (to & 0x88)) continue;
            if (pieceColor(b[to]) !== color) continue;
            // AUD-311-13: continue ray past blocker to find discovered target.
            let beyond = to + d;
            while (beyond < 128 && (beyond & 0x88) === 0 && b[beyond] === EMPTY) beyond += d;
            if (beyond >= 128 || (beyond & 0x88)) continue;
            const q = b[beyond];
            if (q !== EMPTY && pieceColor(q) === enemy) {
              this.add(REL.DISCOVER, from, to);
              this.addHyper(HYPER.DISCOVER, [from, to, beyond]);
            }
          }
        }
      }
    }

    this.attrs = this.fillAttributes();
    this.fingerprint = hashKeys(this.keys);
  }

  addHyper(type, pieces) {
    this.hyper.push({ type, pieces });
    this.hyperCounts[type]++;
  }

  /** Numeric attribute vector A(P) (doc 03 §6). Order is fixed by ATTR_NAMES. */
  fillAttributes() {
    const pc = this.percept;
    return new Float64Array([
      pc.material[WHITE] / 100, pc.material[BLACK] / 100,
      pc.mobility[WHITE], pc.mobility[BLACK],
      pc.centerControl[WHITE], pc.centerControl[BLACK],
      pc.kingZoneAttacks[WHITE], pc.kingZoneAttacks[BLACK],
      pc.passed[WHITE].length, pc.passed[BLACK].length,
      pc.doubled[WHITE], pc.doubled[BLACK],
      pc.isolated[WHITE], pc.isolated[BLACK],
      pc.bishops[WHITE], pc.bishops[BLACK],
      this.counts[REL.ATTACK], this.counts[REL.DEFEND],
      this.counts[REL.CONTROL], this.counts[REL.PIN]
    ]);
  }

  /** Relation counts as a plain object (for reports/tests). */
  countsObject() {
    const out = {};
    for (let t = 1; t < REL_COUNT; t++) {
      if (!this.counts[t]) continue;
      out[REL_TYPE_NAME_SAFE(t)] = this.counts[t];
    }
    return out;
  }
}

function REL_TYPE_NAME_SAFE(t) {
  return ['', 'ATTACK', 'DEFEND', 'SUPPORT', 'BLOCK', 'PIN',
    'DISCOVER', 'RESTRICT', 'CONTROL', 'CONNECT', 'THREATEN', 'PROTECT'][t] || ('T' + t);
}

export const ATTR_NAMES = [
  'matW', 'matB', 'mobW', 'mobB', 'ctrW', 'ctrB', 'kzW', 'kzB',
  'passW', 'passB', 'dblW', 'dblB', 'isoW', 'isoB', 'bipW', 'bipB',
  'nAttack', 'nDefend', 'nControl', 'nPin'
];

/** 53-bit non-cryptographic hash of a set of integer keys (32 low + 21 high bits). */
export function hashKeys(keys) {
  let lo = 0x811c9dc5 >>> 0;
  let hi = 0x1000193 >>> 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    lo = (Math.imul(lo ^ (k & 0xffff), 16777619)) >>> 0;
    hi = (Math.imul(hi ^ ((k >>> 8) & 0xffffff), 2246822519)) >>> 0;
    lo = (lo ^ (lo >>> 13)) >>> 0;
  }
  return lo * 2097152 + (hi & 0x1fffff);
}

export function jaccardDistance(A, B) {
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  for (const k of small) if (large.has(k)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}

/**
 * Component-wise structural distance D(P1,P2) = (Dv, Dr, Da, Dc, Dt, Dq, Dh).
 * Deliberately a vector — no hidden weighting (doc 03 §15.1).
 */
export function structuralDistance(s1, s2, ctx1, ctx2) {
  // vertex distance: pieces compared as (type,color,square) triples.
  // AUD-311-12: encode color in a disjoint bitfield; old `+64` for black
  // collided with white pieces 4 files away on the same 0x88 rank stride.
  const vKey = (color, sq, type) => (color << 11) | (sq << 4) | type;
  const set1 = new Set(), set2 = new Set();
  for (const sq of s1.pos.listSq[WHITE].subarray(0, s1.pos.listCnt[WHITE]))
    set1.add(vKey(WHITE, sq, pieceType(s1.pos.board[sq])));
  for (const sq of s1.pos.listSq[BLACK].subarray(0, s1.pos.listCnt[BLACK]))
    set1.add(vKey(BLACK, sq, pieceType(s1.pos.board[sq])));
  for (const sq of s2.pos.listSq[WHITE].subarray(0, s2.pos.listCnt[WHITE]))
    set2.add(vKey(WHITE, sq, pieceType(s2.pos.board[sq])));
  for (const sq of s2.pos.listSq[BLACK].subarray(0, s2.pos.listCnt[BLACK]))
    set2.add(vKey(BLACK, sq, pieceType(s2.pos.board[sq])));

  const Dv = jaccardDistance(set1, set2);
  const Dr = jaccardDistance(s1.keySet, s2.keySet);

  // attribute distance: normalised L1 over fixed ranges
  let num = 0, den = 0;
  for (let i = 0; i < ATTR_NAMES.length; i++) {
    const scale = ATTR_SCALE[i] || 1;
    num += Math.abs(s1.attrs[i] - s2.attrs[i]) / scale;
    den += 1;
  }
  const Da = den ? num / den : 0;

  let Dc = 0;
  if (ctx1 && ctx2) {
    let l1 = 0;
    for (let i = 0; i < ctx1.length; i++) l1 += Math.abs(ctx1[i] - ctx2[i]);
    Dc = l1 / ctx1.length;
  }

  const Dt = jaccardDistance(hyperSet(s1), hyperSet(s2));
  const Dq = criticalityDistance(s1, s2);

  // rule-state component (castling / ep / clocks)
  const Dh = (s1.pos.castling !== s2.pos.castling ? 0.34 : 0) +
             (s1.pos.ep !== s2.pos.ep ? 0.33 : 0) +
             (Math.min(1, Math.abs(s1.pos.halfmove - s2.pos.halfmove) / 100) * 0.33);

  return { Dv, Dr, Da, Dc, Dt, Dq, Dh };
}

const ATTR_SCALE = [
  40, 40, 40, 40, 12, 12, 8, 8, 4, 4, 2, 2, 2, 2, 2, 2, 40, 40, 30, 6
];

function hyperSet(s) {
  const out = new Set();
  for (const h of s.hyper) {
    const pieces = h.pieces.slice().sort((a, b) => a - b);
    // AUD-311-14: fold all pieces so variable-size hyperrelations remain canonical.
    let key = h.type * 131072;
    for (let i = 0; i < pieces.length; i++) key = key * 131 + pieces[i];
    out.add(key);
  }
  return out;
}

/** Structural criticality Q(x,P): how much of the relation set depends on element x. */
export function criticality(st, sq) {
  let n = 0;
  for (const k of st.keys) {
    if (REL_KEY_FROM(k) === sq || REL_KEY_TO(k) === sq) n++;
  }
  const total = st.keys.length || 1;
  return n / total;
}

export function criticalityVector(st) {
  const out = [];
  const pos = st.pos;
  for (let color = 0; color < 2; color++) {
    for (let i = 0; i < pos.listCnt[color]; i++) {
      const sq = pos.listSq[color][i];
      out.push({ sq, color, q: criticality(st, sq) });
    }
  }
  return out.sort((a, b) => b.q - a.q);
}

function criticalityDistance(s1, s2) {
  const v1 = criticalityVector(s1);
  const v2 = criticalityVector(s2);
  const map2 = new Map(v2.map((x) => [x.sq, x.q]));
  let sum = 0, n = 0;
  for (const x of v1) { sum += Math.abs(x.q - (map2.get(x.sq) || 0)); n++; }
  for (const x of v2) if (!v1.find((y) => y.sq === x.sq)) { sum += x.q; n++; }
  return n ? sum / n : 0;
}

/**
 * Structural delta ΔΩ(P,m) — the typed change caused by a move.
 * Cheap proxies are computed here; the full O(P') − O(P) is obtained by
 * building the child structure and calling structuralDelta().
 */
export function structuralDelta(parent, child) {
  const added = [], removed = [];
  for (const k of child.keys) if (!parent.keySet.has(k)) added.push(k);
  for (const k of parent.keys) if (!child.keySet.has(k)) removed.push(k);
  const attrDelta = new Float64Array(ATTR_NAMES.length);
  for (let i = 0; i < ATTR_NAMES.length; i++) attrDelta[i] = child.attrs[i] - parent.attrs[i];
  return { added, removed, attrDelta };
}

export function buildStructure(pos, percept) {
  return new Structure(pos, percept);
}