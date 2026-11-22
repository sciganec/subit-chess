/**
 * SUBIT-CHESS v3.0.0 — Structural Plan Generation (SPG)
 *
 * Spec basis:
 *   docs/theory/11_PLAN_GENERATION  SPG-01 .. SPG-14, SPG-INV-001 .. SPG-INV-006
 *   docs/theory/03_SUBIT_STRUCTURAL_METRIC §9 (plan = structural hypothesis)
 *   docs/theory/31_UNIFIED_COMPUTATIONAL_ARCH PART XII §42-46 (potentiality → plans)
 *
 * A plan is a *hypothesis about the future structure*, not a move sequence:
 *   Π = (type, side, goal, moves, evidence, feasibility, score)
 *
 * SPG-INV-001  every plan goal is expressed in structural terms (squares / relations)
 * SPG-INV-002  every plan carries a rule-legal candidate move list
 * SPG-INV-003  feasibility is checked on four independent axes before ranking
 * SPG-INV-004  ranking is deterministic for a fixed position
 * SPG-INV-005  a plan never contains an illegal move (verified, never assumed)
 * SPG-INV-006  plans are hypotheses: search, not the planner, makes the decision
 */

import {
  WHITE, PAWN, KNIGHT, KING, MATERIAL, pieceType, pieceColor, rankOf, fileOf, opposite,
  MOVE_FROM, MOVE_TO, MOVE_FLAGS, FLAG_CAPTURE, FLAG_PROMO, FLAG_EP
} from './core.mjs';
import { REL, REL_KEY, REL_KEY_TYPE, REL_KEY_FROM } from './structure.mjs';

export const PLAN = {
  PROMOTE: 1,     // push a passed pawn toward promotion
  RESTRICT: 2,    // take away squares from the strongest enemy piece
  TRADE: 3,       // force a favourable exchange
  KING: 4,        // build pressure on the enemy king
  ACTIVATE: 5,    // improve the worst-placed own piece
  OUTPOST: 6,     // occupy a protected advanced square
  SHIELD: 7       // repair / preserve the king shelter
};

export const PLAN_NAME = ['', 'PROMOTE', 'RESTRICT', 'TRADE', 'KING', 'ACTIVATE', 'OUTPOST', 'SHIELD'];

const FEAS = ['rule', 'structural', 'tactical', 'temporal', 'strategic'];

let planSeq = 0;

export class Plan {
  constructor(spec) {
    this.id = spec.id || `P${++planSeq}`;
    this.type = spec.type;
    this.side = spec.side;
    this.title = spec.title || PLAN_NAME[spec.type] || 'PLAN';
    this.goal = spec.goal || null;         // { squares:[], relations:[], text }
    this.moves = spec.moves || [];         // ordered candidate moves (encoded)
    this.evidence = spec.evidence || [];   // structural facts that motivate the plan
    this.feasible = spec.feasible || { rule: false, structural: false, tactical: false, temporal: false, strategic: false };
    this.score = spec.score || 0;
    this.features = spec.features || {};
    this.legal = spec.legal !== false;
  }

  get ok() { return FEAS.every((k) => this.feasible[k]); }

  feasibilitySummary() {
    return FEAS.map((k) => `${k}:${this.feasible[k] ? '+' : '-'}`).join(' ');
  }

  toJSON() {
    return {
      id: this.id, type: this.type, title: this.title, side: this.side,
      goal: this.goal, moves: this.moves, evidence: this.evidence,
      feasible: this.feasible, score: this.score, features: this.features
    };
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function relCount(structure, type, color) {
  const b = structure.pos.board;
  let n = 0;
  for (const k of structure.keys) {
    if (REL_KEY_TYPE(k) !== type) continue;
    const from = REL_KEY_FROM(k);
    if (b[from] !== 0 && pieceColor(b[from]) === color) n++;
  }
  return n;
}

/**
 * The least active own piece that still has a legal move.
 * Mobility comes from the percept; "least active" prefers back-rank, off-centre
 * pieces with few attacked squares.
 */
function worstPlaced(pos, percept, color, legalMoves) {
  let worst = -1;
  let worstScore = Infinity;
  const list = pos.listSq[color];
  for (let i = 0; i < pos.listCnt[color]; i++) {
    const sq = list[i];
    const t = pieceType(pos.board[sq]);
    if (t === PAWN || t === KING) continue;
    let has = false;
    for (const m of legalMoves) if (MOVE_FROM(m) === sq) { has = true; break; }
    if (!has) continue;
    const back = color === WHITE ? rankOf(sq) >= 6 : rankOf(sq) <= 1;
    const central = fileOf(sq) >= 2 && fileOf(sq) <= 5;
    const s = percept.atk.mob[color][sq] - (back ? 3 : 0) - (central ? 1 : 0) + t * 0.1;
    if (s < worstScore) { worstScore = s; worst = sq; }
  }
  return worst;
}

function advanceDir(color) { return color === WHITE ? -1 : 1; }

/* ------------------------------------------------------------------ *
 * Candidate generators (one per structural motive)
 * ------------------------------------------------------------------ */

function genPromote(pos, percept, structure, legalMoves) {
  const plans = [];
  const side = pos.turn;
  for (const sq of percept.passed[side]) {
    const t = pieceType(pos.board[sq]);
    if (t !== PAWN) continue;
    const dir = advanceDir(side);
    let rank = rankOf(sq);
    const file = fileOf(sq);
    const path = [];
    let blocked = false;
    for (let step = 1; step <= 6; step++) {
      const r = rank + dir * step;
      if (r < 0 || r > 7) break;
      path.push(r * 16 + file);
      if (pos.board[r * 16 + file] !== 0) { blocked = true; break; }
    }
    const moves = legalMoves.filter((m) => MOVE_FROM(m) === sq);
    const support = relCount(structure, REL.SUPPORT, side);
    plans.push(new Plan({
      type: PLAN.PROMOTE,
      side,
      title: `advance the passed ${'abcdefgh'[file]}-pawn`,
      goal: { squares: [sq].concat(path), text: 'passed pawn to the promotion square' },
      moves,
      evidence: [
        `passed pawn on ${'abcdefgh'[file]}${8 - rank}`,
        `path ${blocked ? 'blocked' : 'clear'}`,
        `own supporting relations: ${support}`
      ],
      features: { pathClear: blocked ? 0 : 1, steps: path.length, support }
    }));
  }
  return plans;
}

function genRestrict(pos, percept, structure, legalMoves) {
  const plans = [];
  const side = pos.turn;
  const enemy = opposite(side);
  // strongest enemy piece = highest value with the most attacked squares
  let target = -1;
  let bestVal = -1;
  for (let i = 0; i < pos.listCnt[enemy]; i++) {
    const sq = pos.listSq[enemy][i];
    const t = pieceType(pos.board[sq]);
    if (t === PAWN || t === KING) continue;
    const v = MATERIAL[t] + percept.atk.mob[enemy][sq];
    if (v > bestVal) { bestVal = v; target = sq; }
  }
  if (target < 0) return plans;

  const moves = [];
  for (const m of legalMoves) {
    const to = MOVE_TO(m);
    // a move is useful for restriction when it adds control over a square the
    // enemy piece can reach
    if (percept.atk.cnt[side][to] > 0) moves.push(m);
  }
  plans.push(new Plan({
    type: PLAN.RESTRICT,
    side,
    title: `take squares away from the enemy ${' PNBRQK'[pieceType(pos.board[target])]}`,
    goal: { squares: [target], text: 'reduce the mobility of the strongest enemy piece' },
    moves: moves.slice(0, 12),
    evidence: [
      `enemy piece on ${'abcdefgh'[fileOf(target)]}${8 - rankOf(target)} controls ${percept.atk.mob[enemy][target]} squares`,
      `own RESTRICT relations: ${relCount(structure, REL.RESTRICT, side)}`
    ],
    features: { enemyMobility: percept.atk.mob[enemy][target] }
  }));
  return plans;
}

function genTrade(pos, percept, structure, legalMoves) {
  const plans = [];
  const side = pos.turn;
  const enemy = opposite(side);
  const wins = [];
  for (const m of legalMoves) {
    const flags = MOVE_FLAGS(m);
    if (!(flags & (FLAG_CAPTURE | FLAG_PROMO))) continue;
    const to = MOVE_TO(m);
    // en passant removes a pawn from a different square than the destination,
    // so reading pos.board[to] skipped every en passant capture
    // (audit v3.0.6 §7.2)
    const isEp = !!(flags & FLAG_EP);
    const victim = isEp ? pos.board[to + (side === WHITE ? 16 : -16)] : pos.board[to];
    if (!victim) continue;
    const attacker = pos.board[MOVE_FROM(m)];
    const gain = MATERIAL[pieceType(victim)] - MATERIAL[pieceType(attacker)];
    const defended = isEp
      ? percept.atk.cnt[enemy][to]
      : percept.atk.defenders(to, enemy);
    if (defended === 0 || gain > 0) wins.push({ m, gain, defended });
  }
  if (wins.length === 0) return plans;
  wins.sort((a, b) => (b.gain - a.gain) || (a.defended - b.defended));
  plans.push(new Plan({
    type: PLAN.TRADE,
    side,
    title: 'force a favourable exchange',
    goal: { squares: wins.slice(0, 3).map((w) => MOVE_TO(w.m)), text: 'win material or trade up' },
    moves: wins.slice(0, 8).map((w) => w.m),
    evidence: wins.slice(0, 3).map((w) =>
      `capture ${'abcdefgh'[fileOf(MOVE_TO(w.m))]} defended ${w.defended}x`),
    features: { best: wins[0].gain }
  }));
  return plans;
}

function genKing(pos, percept, structure, legalMoves) {
  const side = pos.turn;
  const enemy = opposite(side);
  // kingZoneAttacks[c] is the pressure on king c, so the pressure on the enemy
  // king is indexed by `enemy`. Indexing by `side` produced an attack plan
  // whenever my OWN king was under pressure (audit v3.0.6 §5.1/§7.3).
  const kz = percept.kingZoneAttacks[enemy];
  const kingSq = percept.kingSq[enemy];
  const enemyPawns = percept.pawns[enemy].filter((n) => n > 0).length;
  // a KING plan needs something to attack with: either existing pressure on
  // the king zone, or pawns near the enemy king whose shelter can be torn.
  // A bare K vs K has neither, and "increase pressure" with no pressure and
  // no target is noise, not a plan (audit v3.0.6 §7.3).
  if (kz === 0 && enemyPawns === 0) return [];
  const files = [];
  for (let f = 0; f < 8; f++) {
    if (Math.abs(f - fileOf(kingSq)) <= 1) files.push(f);
  }
  const moves = legalMoves.filter((m) => {
    const to = MOVE_TO(m);
    const f = fileOf(to);
    return files.includes(f) && percept.atk.cnt[side][to] > 0;
  });
  return [new Plan({
    type: PLAN.KING,
    side,
    title: 'increase pressure on the enemy king',
    goal: { squares: [kingSq], text: 'open lines and occupy squares near the enemy king' },
    moves: moves.slice(0, 10),
    evidence: [
      `enemy king on ${'abcdefgh'[fileOf(kingSq)]}${8 - rankOf(kingSq)}`,
      `squares attacked next to it: ${kz}`,
      `enemy pawn shelter files: ${enemyPawns}`
    ],
    features: { zone: kz, shelter: enemyPawns }
  })];
}

function genActivate(pos, percept, structure, legalMoves) {
  const side = pos.turn;
  const sq = worstPlaced(pos, percept, side, legalMoves);
  if (sq < 0) return [];
  const moves = legalMoves.filter((m) => MOVE_FROM(m) === sq);
  if (moves.length === 0) return [];
  return [new Plan({
    type: PLAN.ACTIVATE,
    side,
    title: `activate the piece on ${'abcdefgh'[fileOf(sq)]}${8 - rankOf(sq)}`,
    goal: { squares: [sq], text: 'raise the mobility of the worst-placed piece' },
    moves,
    evidence: [
      `piece on ${'abcdefgh'[fileOf(sq)]}${8 - rankOf(sq)} is the least active`,
      `mobility ${percept.atk.mob[side][sq]}`
    ],
    features: { mobility: percept.atk.mob[side][sq] }
  })];
}

function genOutpost(pos, percept, structure, legalMoves) {
  const side = pos.turn;
  const plans = [];
  for (const m of legalMoves) {
    if (MOVE_FLAGS(m) & (FLAG_CAPTURE | FLAG_PROMO)) continue;
    const from = MOVE_FROM(m);
    const to = MOVE_TO(m);
    if (pieceType(pos.board[from]) !== KNIGHT) continue;
    const r = rankOf(to);
    const advanced = side === WHITE ? r <= 3 : r >= 4;
    if (!advanced) continue;
    if (fileOf(to) < 1 || fileOf(to) > 6) continue;
    // The square must be protected *after* the knight lands on it. `defenders()`
    // counts defenders of a piece already standing on the square, so on an empty
    // destination it is always 0 and no outpost was ever generated
    // (audit v3.0.6 §7.1). Control is what matters here.
    const guarded = percept.atk.cnt[side][to];
    if (guarded === 0) continue;
    // no enemy pawn can ever attack this square again: a black pawn on psq
    // attacks (psq + 1, file +- 1), a white pawn attacks (psq - 1, file +- 1)
    let safe = true;
    const enemy = opposite(side);
    for (const psq of percept.pawnSquares[enemy]) {
      const pr = rankOf(psq);
      const df = Math.abs(fileOf(psq) - fileOf(to));
      const attacks = side === WHITE ? (pr === r - 1 && df === 1) : (pr === r + 1 && df === 1);
      if (attacks) { safe = false; break; }
    }
    if (!safe) continue;
    plans.push(new Plan({
      type: PLAN.OUTPOST,
      side,
      title: `plant a knight on ${'abcdefgh'[fileOf(to)]}${8 - r}`,
      goal: { squares: [to], text: 'occupy a protected square no enemy pawn can attack' },
      moves: [m],
      evidence: [`guarded by ${guarded} own piece(s)`, 'immune to pawn attacks'],
      features: { rank: r, guarded }
    }));
  }
  return plans;
}

function genShield(pos, percept, structure, legalMoves) {
  const side = pos.turn;
  const k = percept.kingSq[side];
  const kf = fileOf(k);
  const kr = rankOf(k);
  const dir = side === WHITE ? -1 : 1;
  const shieldSq = [];
  for (let df = -1; df <= 1; df++) {
    const f = kf + df;
    if (f < 0 || f > 7) continue;
    const r = kr + dir;
    if (r < 0 || r > 7) continue;
    shieldSq.push(r * 16 + f);
  }
  const present = shieldSq.filter((sq) => {
    const p = pos.board[sq];
    return p !== 0 && pieceColor(p) === side && pieceType(p) === PAWN;
  }).length;
  const moves = legalMoves.filter((m) => shieldSq.includes(MOVE_TO(m)) && !(MOVE_FLAGS(m) & FLAG_CAPTURE));
  if (moves.length === 0 && present >= 2) return [];
  return [new Plan({
    type: PLAN.SHIELD,
    side,
    title: 'keep the king shelter intact',
    goal: { squares: shieldSq, text: 'hold the pawn shield in front of the king' },
    moves: moves.slice(0, 6),
    evidence: [`shield pawns present: ${present}/3`, `enemy attacks in the king zone: ${percept.kingZoneAttacks[opposite(side)]}`],
    features: { shield: present }
  })];
}

const GENERATORS = [
  ['promote', genPromote],
  ['restrict', genRestrict],
  ['trade', genTrade],
  ['king', genKing],
  ['activate', genActivate],
  ['outpost', genOutpost],
  ['shield', genShield]
];

/** Exposed for tests and for the analysis CLI (each generator is independently checkable). */
export const PLAN_GENERATORS = GENERATORS;

/* ------------------------------------------------------------------ *
 * Feasibility — four independent axes (SPG-INV-003)
 * ------------------------------------------------------------------ */

/**
 * rule      — does the position permit the plan's own moves at all
 * structural— is the motivating structure actually present
 * tactical  — is there a concrete sequence (checked by a shallow search by the caller)
 * temporal  — is there time (opponent threats / move budget)
 * strategic — is the goal worth more than the best alternative
 */
export function checkFeasibility(pos, percept, structure, plan, opts = {}) {
  const side = pos.turn;
  const f = { rule: false, structural: false, tactical: false, temporal: true, strategic: false };

  f.rule = plan.moves.some((m) => pos.legalMoves().includes(m));

  switch (plan.type) {
    case PLAN.PROMOTE: {
      const pawn = percept.passed[side].length > 0;
      const clear = plan.features.pathClear === 1;
      f.structural = pawn && clear;
      f.tactical = f.structural;   // an open passer path is a concrete threat
      f.temporal = percept.passed[side].length > 0 && !pos.inCheck(side);
      // a passer is strategically justified only if it is actually passed and
      // the path is not fully blocked by an enemy pawn on the same file
      f.strategic = f.structural;
      break;
    }
    case PLAN.RESTRICT:
      f.structural = relCount(structure, REL.RESTRICT, side) > 0 || plan.features.enemyMobility > 4;
      f.tactical = plan.moves.length >= 2;
      // restricting the strongest enemy piece is worth it only if that piece
      // actually has mobility to take away
      f.strategic = plan.features.enemyMobility > 0;
      break;
    case PLAN.TRADE:
      f.structural = plan.features.best >= 0;
      f.tactical = plan.moves.length > 0;
      // a trade plan is justified when the best exchange is favourable or
      // equal (best >= 0); a losing trade is tactically refuted, not strategic
      f.strategic = plan.features.best >= 0;
      break;
    case PLAN.KING:
      f.structural = plan.features.zone > 0 || plan.features.shelter <= 2;
      f.tactical = plan.moves.length > 0;
      // attacking the king is justified only when there is actual pressure on
      // it or the enemy shelter is damaged; a KING plan with no zone and a
      // full shelter is noise
      f.strategic = plan.features.zone > 0 || plan.features.shelter <= 2;
      break;
    case PLAN.ACTIVATE:
      f.structural = plan.moves.length > 0;
      f.tactical = plan.moves.length > 0;
      // activation is justified when the worst-placed piece can improve
      f.strategic = plan.moves.length > 0;
      break;
    case PLAN.OUTPOST:
      f.structural = true;
      f.tactical = plan.moves.length === 1;
      // an outpost is justified only if the square is genuinely guarded
      // (control >= 1) and immune to pawn attacks; the generator already
      // enforces this, so a plan that reaches here is strategic
      f.strategic = plan.features.guarded > 0;
      break;
    case PLAN.SHIELD:
      f.structural = true;
      f.temporal = !pos.inCheck(side);
      // keeping the shield is justified when it is damaged (< 3 pawns) or
      // when the king is under pressure; a full shield with no pressure is
      // not a plan worth spending moves on
      f.strategic = plan.features.shield < 3 || percept.kingZoneAttacks[side] > 0;
      break;
  }

  // opponent's immediate threats shrink the time budget (doc 11 §7)
  if (percept.hanging[side].length > 0) f.temporal = f.temporal && plan.type !== PLAN.SHIELD;
  if (opts.maxPlans && plan.moves.length === 0) f.tactical = false;
  return f;
}

function scorePlan(plan, percept, structure, pos) {
  const w = {
    [PLAN.PROMOTE]: { base: 40, per: 12 },
    [PLAN.RESTRICT]: { base: 22, per: 4 },
    [PLAN.TRADE]: { base: 30, per: 8 },
    [PLAN.KING]: { base: 26, per: 6 },
    [PLAN.ACTIVATE]: { base: 12, per: 3 },
    [PLAN.OUTPOST]: { base: 20, per: 10 },
    [PLAN.SHIELD]: { base: 10, per: 4 }
  }[plan.type];
  let s = w.base;
  const f = plan.features;
  if (plan.type === PLAN.PROMOTE) s += (f.steps || 0) * w.per;
  if (plan.type === PLAN.TRADE) s += Math.max(0, f.best || 0);
  if (plan.type === PLAN.KING) s += (f.zone || 0) * w.per;
  if (plan.type === PLAN.OUTPOST) s += w.per;
  if (plan.type === PLAN.ACTIVATE) s += Math.max(0, 10 - (f.mobility || 0)) * w.per;
  s += Math.min(20, plan.moves.length * 2);
  void percept; void structure; void pos;
  return s;
}

/* ------------------------------------------------------------------ *
 * Public entry points
 * ------------------------------------------------------------------ */

/**
 * Generate and rank the plan set for the side to move.
 * The caller is expected to pass the already computed legal move list.
 *
 * SPG-INV-003/005: a plan whose moves are not all rule-legal, or whose motivating
 * structure is absent, is *rejected* — it is returned on `.rejected` with its
 * feasibility vector, so that analysis can explain why it was dropped.
 */
export function generatePlans(pos, percept, structure, legalMoves, opts = {}) {
  // plan ids must be reproducible for a given position: a module-global counter
  // leaked ids across searches and broke determinism of the plan layer
  planSeq = 0;
  const moves = legalMoves || pos.legalMoves();
  const accepted = [];
  const rejected = [];
  for (const [, gen] of GENERATORS) {
    const produced = gen(pos, percept, structure, moves);
    for (const p of produced) {
      p.feasible = checkFeasibility(pos, percept, structure, p, opts);
      p.score = scorePlan(p, percept, structure, pos);
      // SPG-INV-005: verify, never assume
      p.legal = p.moves.length > 0 && p.moves.every((m) => moves.includes(m));
      // Two tiers (audit v3.0.6 §7.5, SPG-INV-003):
      //   admitted — legal + rule-feasible + structurally supported. The plan
      //              is a real hypothesis about the position.
      //   accepted — admitted AND tactically verified, temporally feasible and
      //              strategically justified. The plan survives all five axes.
      // A plan that is admitted but not accepted is reported on `.rejected`
      // with its full feasibility vector, so analysis can explain *which* axis
      // failed instead of silently dropping it.
      p.admitted = p.legal && p.feasible.rule && p.feasible.structural;
      p.accepted = p.admitted && p.feasible.tactical && p.feasible.temporal && p.feasible.strategic;
      if (p.accepted) accepted.push(p);
      else rejected.push(p);
    }
  }
  // deterministic tiebreak: numeric type, then title — ids are only a label
  accepted.sort((a, b) => (b.score - a.score) || (a.type - b.type) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const max = opts.maxPlans || 6;
  const out = accepted.slice(0, max);
  out.rejected = rejected;
  out.total = accepted.length;
  return out;
}

/** Pareto filter: drop plans dominated on (score, rule, structural). */
export function pareto(plans) {
  const keep = [];
  for (const p of plans) {
    let dominated = false;
    for (const q of plans) {
      if (q === p) continue;
      const qBetter = q.score >= p.score &&
        (!p.feasible.rule || q.feasible.rule) &&
        (!p.feasible.structural || q.feasible.structural);
      const pBetter = p.score > q.score || (p.feasible.rule && !q.feasible.rule);
      if (qBetter && !pBetter) { dominated = true; break; }
    }
    if (!dominated) keep.push(p);
  }
  return keep;
}

/** Human-readable plan report. */
export function describePlans(plans) {
  return plans.map((p) =>
    `  [${p.id}] ${p.title}  score=${p.score.toFixed(1)}  ${p.feasibilitySummary()}  moves=${p.moves.length}` +
    (p.evidence.length ? `\n        evidence: ${p.evidence.join('; ')}` : '')
  ).join('\n');
}