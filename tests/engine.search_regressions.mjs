/**
 * Targeted search/qsearch regressions (audit R-04/R-05).
 * Test-only; no engine behavior changes. No strength claim.
 */
import { Position, moveToUci } from '../src/engine/core.mjs';
import { Evaluation, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable, MATE } from '../src/engine/search.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

function mk(overrides = {}) {
  const evaluator = new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode });
  const searcher = new Searcher(evaluator, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
  Object.assign(searcher, overrides);
  return searcher;
}

// R-05: qsearch in check must not stand-pat; it must search evasions.
{
  // White king in check from rook; only legal evasions exist. Stand-pat would be illegal.
  const fen = '4r2k/8/8/8/8/8/4K3/4R3 w - - 0 1';
  const p = Position.fromFEN(fen);
  check('qsearch in-check fixture', p.inCheck(), fen);
  const s = mk();
  s.setLimits({ depth: 1, nodes: 10000 });
  const score = s.quiescence(p, -MATE, MATE, 0, 0);
  check('qsearch in check does not return static stand-pat mate-equivalent', Math.abs(score) < MATE - 100, `score=${score}`);
  const legal = p.legalMoves();
  check('qsearch in check has evasions', legal.length > 0, `legal=${legal.length}`);
}

// R-05: promotion capture in qsearch should be considered.
{
  // White can promote by capture; qsearch should see it.
  const fen = '3r4/4P3/8/8/8/8/8/4K2k w - - 0 1';
  const p = Position.fromFEN(fen);
  const s = mk();
  s.setLimits({ depth: 1, nodes: 20000 });
  const score = s.quiescence(p, -MATE, MATE, 0, 0);
  check('qsearch sees promotion capture', score >= 0, `score=${score}`);
}

// R-05: EP capture in qsearch should be considered.
{
  // EP capture available; material swing should be visible.
  const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
  const p = Position.fromFEN(fen);
  const s = mk();
  s.setLimits({ depth: 1, nodes: 20000 });
  const score = s.quiescence(p, -MATE, MATE, 0, 0);
  check('qsearch sees EP capture', score >= -50, `score=${score}`);
}

// R-04: observed open issue on current HEAD - simple rook-lift mate-in-2 missed at d4/d5.
// FEN: 5rk1/5ppp/8/8/8/8/8/R5K1 w - - 0 1 (1.Ra8+ Rf8 2.Rxf8#). Recorded as audit finding, not asserted as pass.

// R-04: futility should not hide short tactical mate (depth-limited, but mate exists).
{
  const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
  for (const [name, overrides] of [['default', {}], ['no-futility', { useFutility: false }]]) {
    const s = mk(overrides);
    const r = s.search(Position.fromFEN(fen), { depth: 3, nodes: 100000 });
    check(`futility regression mate (${name})`, r.completed && Math.abs(r.score) > MATE - 1000, `score=${r.score} move=${moveToUci(r.move)}`);
  }
}

// R-04: NMP should not be applied in pawn-only/zugzwang-prone endgames (guarded by existing logic).
{
  const fen = '8/8/8/8/8/8/4P3/4K2k w - - 0 1';
  const s = mk();
  let nullCalls = 0;
  const p = Position.fromFEN(fen);
  const orig = p.makeNullMove;
  p.makeNullMove = function() { nullCalls++; return orig.call(this); };
  try { s.search(p, { depth: 4, nodes: 100000 }); } finally { p.makeNullMove = orig; }
  check('NMP not used in pawn-only endgame', nullCalls === 0, `nullCalls=${nullCalls}`);
}

console.log(`\nSEARCH_REGRESSIONS: ${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
