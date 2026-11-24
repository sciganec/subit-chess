/**
 * SUBIT-CHESS v3.0.9 — Decision structure, causal explanation, counterfactuals
 *
 * Spec basis (docs/theory SCMF-001):
 *   §10  D(P) = (a*, V, C, Evidence, Alternatives, Confidence)
 *   §12  evidence statuses, never mixed (a test is not a proof, confidence is not truth)
 *   §13  Conf in [0,1], explicitly NOT a probability (no calibration yet, OPEN-006)
 *   §14  Explanation(a) = f(P, a, P', ΔΩ, Responses); causal claims are typed (§14.1)
 *   §14.2 CF(a,b) = V(P_a) - V(P_b), with the best reply of the opponent after each (SCMF-INV-012)
 *   INV-011 multi-criteria evaluation must not replace minimax: this layer NEVER changes the move.
 *
 * It runs on request, after the search; it costs extra searches (one per alternative) and is not used in play.
 */
import { WHITE, MOVE_FLAGS, FLAG_CAPTURE, FLAG_PROMO, FLAG_EP, FLAG_CASTLE, pieceType, KING, moveToUci } from './core.mjs';
import { moveToSan } from './core.mjs';
import { SVF_COMPONENTS } from './evaluate.mjs';
import { structuralDelta } from './structure.mjs';
import { Percept } from './percept.mjs';
import { evidenceFor, classifyTrace } from './belnap.mjs';

const EXPLAIN_MATE_LIMIT = 100000 - 1000;

/** SCMF §12 evidence statuses. */
export const EVIDENCE = {
  EXACT: 'EXACT',                    // fixed by the rules (legality, capture, check, mate on board)
  EXHAUSTIVELY_VERIFIED: 'EXHAUSTIVELY_VERIFIED', // complete enumeration in a finite scope (forced mate found by search)
  TEST_VERIFIED: 'TEST_VERIFIED',    // not produced at run time; reserved for results carried in from tests
  HEURISTIC: 'HEURISTIC',            // structural interpretation, evaluation terms
  ESTIMATED: 'ESTIMATED',            // value from a depth-limited search
  HYPOTHETICAL: 'HYPOTHETICAL',      // strategic reading, not searched
  UNKNOWN: 'UNKNOWN'
};
/** SCMF §14.1 claim types. */
export const CLAIM = {
  IMMEDIATE: 'immediate_cause', STRUCTURAL: 'structural_consequence', TACTICAL: 'tactical_consequence',
  STRATEGIC: 'strategic_consequence', ASSUMPTION: 'assumption', COUNTERFACTUAL: 'counterfactual'
};

const pawns = (cp) => (cp / 100).toFixed(2);

/** Conf in [0,1] from the gap to the runner-up and the search depth. Not a probability (SCMF §13, OPEN-006). */
export function confidence(gapCp, depth, completed) {
  if (!completed) return 0;
  const g = 1 - Math.exp(-Math.max(0, gapCp) / 60);
  const d = Math.min(1, depth / 8);
  return Number((g * (0.5 + 0.5 * d)).toFixed(3));
}

function sideValue(engine, pos, depth) {
  const r = engine.searcher.search(pos, { depth: Math.max(1, depth), timeMs: 0, nodes: 0 });
  return r;
}

/** Facts that the rules alone decide about a move (status EXACT). */
function ruleFacts(pos, m, childPos) {
  const flags = MOVE_FLAGS(m);
  const facts = [];
  if (flags & FLAG_CAPTURE) facts.push('captures a piece');
  if (flags & FLAG_EP) facts.push('captures en passant');
  if (flags & FLAG_PROMO) facts.push('promotes');
  if (flags & FLAG_CASTLE) facts.push('castles');
  if (childPos.inCheck()) {
    facts.push(childPos.legalMoves().length === 0 ? 'delivers checkmate' : 'gives check');
  } else if (childPos.legalMoves().length === 0) facts.push('stalemates');
  return facts;
}

/**
 * ΔΩ(a) from the mover's point of view: positive = the structural component improved for the side that moved.
 * Values are heuristic (SVF-9), reported next to the search value, never folded into it.
 */
function structuralChange(engine, pos, m) {
  const before = engine.evaluation.structural(pos);
  pos.pushRep();
  const undo = pos.makeMove(m);
  const after = engine.evaluation.structural(pos);
  const delta = structuralDelta(before.structure, after.structure);
  pos.unmakeMove(undo);
  pos.popRep();
  const omega = SVF_COMPONENTS.map((k, i) => ({ k, d: -after.vector[i] - before.vector[i] }))   // child vector is from the opponent's view
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return {
    omega: Object.fromEntries(SVF_COMPONENTS.map((k, i) => [k, Number((-after.vector[i] - before.vector[i]).toFixed(2))])),
    leading: omega.slice(0, 3).filter((x) => Math.abs(x.d) >= 1).map((x) => `${x.k} ${x.d > 0 ? '+' : ''}${x.d.toFixed(1)}`),
    relationsAdded: delta.added.length, relationsRemoved: delta.removed.length
  };
}


/**
 * Independent sources for "move a is at least as good as move b", each chosen − alternative in cp from the mover's view
 * (SUBIT-∞ §7 Belnap layer): material on the board, the static fast evaluation, a depth-2 search, the full reply search.
 * Child positions that end the game have no static value and are left out.
 */
function evidenceDiffs(engine, pos, a, b, deepA, deepB) {
  const side = pos.turn;
  const probe = (m) => {
    pos.pushRep();
    const undo = pos.makeMove(m);
    let out = null;
    if (pos.legalMoves().length > 0) {
      const pc = new Percept(pos);
      out = { material: pc.material[side] - pc.material[1 - side],
              static: -engine.evaluation.fast(pos),
              shallow: -sideValue(engine, pos, 2).score };
    }
    pos.unmakeMove(undo);
    pos.popRep();
    return out;
  };
  const pa = probe(a), pb = probe(b);
  const diffs = { deep: deepA - deepB };
  if (pa && pb) {
    diffs.material = pa.material - pb.material;
    diffs.static = pa.static - pb.static;
    diffs.shallow = pa.shallow - pb.shallow;
  }
  return diffs;
}

/**
 * Build D(P) for the engine's current position.
 *   opts.depth        search depth for the decision (default 6)
 *   opts.alternatives number of alternatives to report (default 3)
 * Returns the decision record. The chosen move is exactly the one a plain search of that depth returns.
 */
export function explainDecision(engine, opts = {}) {
  const depth = opts.depth || 6;
  const nAlt = opts.alternatives === undefined ? 3 : opts.alternatives;
  const pos = engine.pos;
  if (!engine.percept) engine.setFEN(pos.fen());

  const chosen = engine.search({ depth, fixedTime: true });
  const a = chosen.move;
  const legal = pos.legalMoves();
  const ctxKey = engine.context ? engine.context.key() : null;
  if (!a || legal.length === 0) {
    return { move: null, value: chosen.score, context: ctxKey, evidence: [], alternatives: [], confidence: 0,
             note: 'no legal move', status: pos.inCheck() ? 'checkmate' : 'stalemate' };
  }

  // value of every legal move: exact reply search one ply shallower, from the mover's view (SCMF-INV-012)
  const rows = [];
  for (const m of legal) {
    pos.pushRep();
    const undo = pos.makeMove(m);
    const childFacts = ruleFacts(pos, m, pos);
    const mate = pos.legalMoves().length === 0 && pos.inCheck();
    let v, reply = [];
    if (mate) v = 100000 - 1;
    else if (pos.legalMoves().length === 0) v = 0;
    else { const r = sideValue(engine, pos, depth - 1); v = -r.score; reply = (r.pv || []).slice(0, 4); }
    pos.unmakeMove(undo);
    pos.popRep();
    rows.push({ m, v, reply, facts: childFacts });
  }
  rows.sort((x, y) => y.v - x.v);
  const chosenRow = rows.find((r) => r.m === a) || rows[0];

  const san = (m) => moveToSan(pos, m);
  const replySan = (m, line) => {                           // render the reply line from the position after m
    if (!line.length) return [];
    pos.pushRep(); const u = pos.makeMove(m);
    const out = []; const stack = [];
    for (const mv of line) {
      out.push(moveToSan(pos, mv));
      pos.pushRep(); stack.push(pos.makeMove(mv));
    }
    while (stack.length) { pos.unmakeMove(stack.pop()); pos.popRep(); }
    pos.unmakeMove(u); pos.popRep();
    return out;
  };

  const runnerUp = rows.find((r) => r.m !== chosenRow.m);
  const gap = runnerUp ? chosenRow.v - runnerUp.v : Infinity;
  const proven = Math.abs(chosenRow.v) > EXPLAIN_MATE_LIMIT;
  const better = rows.filter((r) => r.v > chosenRow.v);   // a shallower re-search may prefer another move; reported, never acted on

  const alternatives = rows.filter((r) => r.m !== chosenRow.m).slice(0, nAlt).map((r) => {
    const cf = chosenRow.v - r.v;                            // CF(a,b) = V(P_a) - V(P_b)
    return {
      move: moveToUci(r.m), san: san(r.m), value: r.v,
      counterfactual: { cf, status: Math.abs(chosenRow.v) > EXPLAIN_MATE_LIMIT || Math.abs(r.v) > EXPLAIN_MATE_LIMIT ? EVIDENCE.EXHAUSTIVELY_VERIFIED : EVIDENCE.ESTIMATED,
        scope: `search depth ${depth - 1} after the move` },
      best_reply: replySan(r.m, r.reply),
      structural: structuralChange(engine, pos, r.m),
      rejected_because: cf <= 0 ? 'equal value (tie broken by search order)'
        : `searches ${pawns(cf)} pawns worse than the chosen move (reply: ${replySan(r.m, r.reply)[0] || '-'})`
    };
  });

  const sc = structuralChange(engine, pos, a);
  const claims = [];
  const belnap = runnerUp ? evidenceFor(evidenceDiffs(engine, pos, chosenRow.m, runnerUp.m, chosenRow.v, runnerUp.v)) : null;
  const traceScores = [];
  for (let d = 1; d <= depth; d++) traceScores.push(sideValue(engine, pos, d).score);
  const omega = classifyTrace(traceScores);
  for (const f of chosenRow.facts) claims.push({ type: CLAIM.IMMEDIATE, text: `the move ${f}`, status: EVIDENCE.EXACT });
  if (sc.leading.length) claims.push({ type: CLAIM.STRUCTURAL, text: `structural change ΔΩ: ${sc.leading.join(', ')}`, status: EVIDENCE.HEURISTIC });
  claims.push({
    type: CLAIM.TACTICAL,
    text: proven ? `forced mate within the searched tree` : `value ${pawns(chosenRow.v)} pawns after the best reply ${replySan(a, chosenRow.reply).join(' ') || '-'}`,
    status: proven ? EVIDENCE.EXHAUSTIVELY_VERIFIED : EVIDENCE.ESTIMATED
  });
  if (runnerUp) claims.push({ type: CLAIM.COUNTERFACTUAL, text: `best alternative ${san(runnerUp.m)} is ${pawns(gap)} pawns worse`, status: proven ? EVIDENCE.EXHAUSTIVELY_VERIFIED : EVIDENCE.ESTIMATED });
  if (belnap) claims.push({ type: CLAIM.COUNTERFACTUAL, text: `Belnap value of "${san(a)} is at least as good as ${san(runnerUp.m)}": ${belnap.value} (${Object.entries(belnap.components).map(([k, v]) => k + '=' + v).join(', ')})`, status: EVIDENCE.HEURISTIC });
  claims.push({ type: CLAIM.ASSUMPTION, text: `evaluation is the fast tier; the nine-component structural model is not used for the choice and is untuned`, status: EVIDENCE.HEURISTIC });
  claims.push({ type: CLAIM.STRATEGIC, text: 'long-term consequences beyond the horizon are not claimed', status: EVIDENCE.UNKNOWN });

  const unresolved = [];
  if (!chosen.completed) unresolved.push('search did not complete');
  if (runnerUp && gap < 30) unresolved.push(`runner-up within ${gap} cp: choice not clear`);
  if (better.length) unresolved.push(`depth disagreement: the reply search at depth ${depth - 1} values ${san(better[0].m)} ${pawns(better[0].v - chosenRow.v)} pawns higher than the move the depth-${depth} search chose`);
  if (belnap && belnap.value === 'B') unresolved.push(`independent sources disagree (Belnap B): ${belnap.conflicting.join(', ')}; more search, not a forced choice`);
  if (omega.omega === 'CYCLIC' || omega.omega === 'CHAOTIC') unresolved.push(`score trace over depths 1..${depth} is ${omega.omega}: the value is not settled`);
  if (!proven) unresolved.push(`horizon: nothing beyond depth ${depth} was searched`);

  return {
    move: moveToUci(a), san: san(a), value: chosenRow.v,
    context: ctxKey,
    evidence: claims,
    alternatives,
    confidence: { conf: confidence(gap, chosen.depth, chosen.completed), calibrated: false,
                  note: 'Confidence is not probability (SCMF §13); no calibration has been done (OPEN-006)' },
    structural: sc,
    belnap,
    omega,
    unresolved,
    search: { depth: chosen.depth, completed: chosen.completed, nodes: chosen.nodes, boundary: chosen.boundary || null },
    // SUBIT-CPU §10: every claim carries where it came from (claim index -> source record)
    claimSources: claims.map((c, i) => ({ claim: i, type: c.type, status: c.status,
      source: c.status === EVIDENCE.EXACT ? 'rules (move generator)' : c.status === EVIDENCE.HEURISTIC ? 'evaluation / Belnap fusion' : `search depth ${chosen.depth}`,
      committedDepth: chosen.boundary ? chosen.boundary.committedDepth : chosen.depth })),
    provenance: { generator: 'explainDecision', version: engine.version, source: 'own search, no external engine' }
  };
}
