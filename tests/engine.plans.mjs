/**
 * Plan-generation tests (doc 11: SPG-01 .. SPG-14, SPG-INV-001 .. SPG-INV-006).
 */
import { Position, squareName, pieceType, PAWN } from '../src/engine/core.mjs';
import { Percept } from '../src/engine/percept.mjs';
import { Structure } from '../src/engine/structure.mjs';
import { computeContext } from '../src/engine/context.mjs';
import { generatePlans, PLAN_GENERATORS, PLAN_NAME, PLAN, pareto, describePlans } from '../src/engine/plans.mjs';
import { MetaController, complexityOf, adaptiveDepth } from '../src/engine/meta.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

function layers(fen) {
  const pos = new Position();
  pos.setFEN(fen);
  const percept = new Percept(pos);
  const structure = new Structure(pos, percept);
  const ctx = computeContext(pos, percept, structure);
  return { pos, percept, structure, ctx };
}

/* ---------------- generator coverage ---------------- */
const POSITIONS = {
  start: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  passed: '8/8/8/4k3/8/4P3/4K3/8 w - - 0 1',
  attack: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
  outpost: '4k3/8/8/2N5/8/8/8/4K3 w - - 0 1',
  trade: '4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1',
  shield: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
};

for (const [name, fen] of Object.entries(POSITIONS)) {
  const { pos, percept, structure } = layers(fen);
  const moves = pos.legalMoves();
  for (const [gname, gen] of PLAN_GENERATORS) {
    let out = [];
    try {
      out = gen(pos, percept, structure, moves) || [];
    } catch (e) {
      check(`generator ${gname} on ${name} does not throw`, false, e.message);
      continue;
    }
    check(`generator ${gname} on ${name} returns only legal moves`,
      out.every((p) => p.moves.every((m) => moves.includes(m))));
  }
}

/* ---------------- SPG-INV-005: no illegal move survives ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.attack);
  const plans = generatePlans(pos, percept, structure, null);
  const legal = pos.legalMoves();
  check('SPG-INV-005 every plan move is legal', plans.every((p) => p.moves.every((m) => legal.includes(m))),
    `${plans.length} plans`);
}

/* ---------------- deterministic ranking (SPG-INV-004) ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.attack);
  const a = generatePlans(pos, percept, structure, null).map((p) => `${p.type}:${p.score}:${p.moves.join(',')}`);
  const b = generatePlans(pos, percept, structure, null).map((p) => `${p.type}:${p.score}:${p.moves.join(',')}`);
  check('SPG-INV-004 plans are reproducible', JSON.stringify(a) === JSON.stringify(b));
}

/* ---------------- plans exist for a forcing position ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.attack);
  const plans = generatePlans(pos, percept, structure, null);
  check('plan set is non-empty in a forcing position', plans.length > 0, `${plans.length} plans`);
  check('plans are sorted by score', plans.every((p, i) => i === 0 || plans[i - 1].score >= p.score));
  check('every accepted plan is rule- and structure-feasible', plans.every((p) => p.feasible.rule && p.feasible.structural));
  check('rejected plans are reported, not silently dropped',
    Array.isArray(plans.rejected), `accepted=${plans.length} rejected=${plans.rejected.length}`);
  check('rejected plans carry their full feasibility vector',
    plans.rejected.every((p) => p.feasible && typeof p.feasible === 'object'),
    `rejected=${plans.rejected.length}`);
  check('every accepted plan passes all five feasibility axes',
    plans.every((p) => p.feasible.rule && p.feasible.structural && p.feasible.tactical && p.feasible.temporal && p.feasible.strategic));
  check('every plan has evidence', plans.every((p) => p.evidence.length > 0));
}

/* ---------------- promote plan is generated for a passed pawn ---------------- */
{
  const fen = '8/8/8/8/8/8/4P3/4K2k w - - 0 1';
  const { pos, percept, structure } = layers(fen);
  const plans = generatePlans(pos, percept, structure, null);
  const promo = plans.filter((p) => p.type === PLAN.PROMOTE);
  check('a passed pawn produces an accepted PROMOTE plan', promo.length > 0, describePlans(promo));
  if (promo.length) {
    const pawnSq = percept.passed[pos.turn][0];
    check('PROMOTE plan moves the passed pawn',
      promo[0].moves.every((m) => (m & 127) === pawnSq),
      `pawn on ${squareName(pawnSq)}`);
    check('PROMOTE plan path is clear', promo[0].features.pathClear === 1);
  }
}

/* ---------------- a blocked passed pawn is rejected, with a reason ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.passed);
  const plans = generatePlans(pos, percept, structure, null);
  const blocked = plans.rejected.filter((p) => p.type === PLAN.PROMOTE);
  check('a blocked passed pawn is rejected', blocked.length > 0,
    blocked.map((p) => p.feasibilitySummary()).join(' '));
}

/* ---------------- trade plan respects the material balance ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.trade);
  const plans = generatePlans(pos, percept, structure, null);
  const trade = plans.filter((p) => p.type === PLAN.TRADE);
  check('a favourable capture produces a TRADE plan', trade.length > 0, describePlans(trade));
}

/* ---------------- Pareto filter ---------------- */
{
  const { pos, percept, structure } = layers(POSITIONS.attack);
  const plans = generatePlans(pos, percept, structure, null, { maxPlans: 20 });
  const kept = pareto(plans);
  check('Pareto keeps at least the best plan', kept.length >= 1, `${kept.length}/${plans.length}`);
}

/* ---------------- meta-control ---------------- */
{
  const { pos, percept, structure, ctx } = layers(POSITIONS.start);
  const mc = new MetaController();
  const complexity = complexityOf(pos, percept, structure, ctx);
  check('complexity is in [0,1]', complexity >= 0 && complexity <= 1, complexity.toFixed(3));
  const d1 = adaptiveDepth({ complexity: 0.1, uncertainty: 0.1, baseDepth: 8 });
  const d2 = adaptiveDepth({ complexity: 0.9, uncertainty: 0.9, baseDepth: 8 });
  check('complex positions get more depth', d2 > d1, `${d1} vs ${d2}`);
  const p = mc.plan({ pos, percept, structure, ctx, evaluation: null });
  check('meta plan is bounded', p.depth >= 2 && p.depth <= 24 && p.timeMs >= 0,
    `depth=${p.depth} time=${p.timeMs} mode=${p.evalMode}`);
  check('eval mode is a valid tier', ['fast', 'structural', 'hybrid'].includes(p.evalMode));
}

/* ---------------- plan names are stable ---------------- */
check('PLAN_NAME covers all plan types',
  Object.keys(PLAN).filter((k) => isNaN(Number(k))).every((k) => PLAN_NAME[PLAN[k]]));

console.log(fails === 0 ? '\nPLANS OK' : `\nPLANS FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);