/**
 * SUBIT-CHESS W07 — independent tactical regression suite.
 *
 * Spec basis:
 *   ver/subit_chess_v3.0.9/subit_chess_v3.0.9_audit.md §20 (W07),
 *   AUD-07…AUD-09 closure (null-move lifecycle, dead material, state identity).
 *
 * This suite does not import the smoke-test fixtures. It exercises the same
 * search from several pruning/TT configurations so that a mate or a forcing
 * capture cannot disappear behind an optimisation. No strength claim is made.
 */

import { Position, moveToUci } from '../src/engine/core.mjs';
import { validateFEN } from '../src/engine/fen.mjs';
import { Evaluation, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable, MATE } from '../src/engine/search.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const MATES = {
  'back rank': '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
  smothered: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
  'quiet mate': '6k1/8/6K1/8/8/8/8/7R w - - 0 1',
  ladder: '7k/R7/8/8/8/8/8/1R5K w - - 0 1'
};

// A boxed-in king makes Qxd8 forced after Rxd8+; Qxd8# then follows. The
// horizon must see the whole capture chain, not just the first rook capture.
const CAPTURE_CHAIN = '3r2k1/5ppp/8/Q7/7q/8/8/3R2K1 w - - 0 1';
const PAWN_ONLY = '8/8/8/8/8/8/4P3/4K2k w - - 0 1';

const CONFIGS = [
  ['default', {}],
  ['no-null', { useNull: false }],
  ['no-tt', { useTT: false }],
  ['no-pruning', { useNull: false, useLMR: false, useFutility: false }]
];

function makeSearcher(overrides = {}) {
  const evaluator = new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode });
  const searcher = new Searcher(evaluator, DEFAULT_PARAMS, {
    tt: new TranspositionTable(16)
  });
  Object.assign(searcher, overrides);
  searcher.setLimits({ depth: 4, nodes: 300000 });
  return searcher;
}

/* ---------------- mate suite across pruning configurations ---------------- */
for (const [name, fen] of Object.entries(MATES)) {
  check(`W07 fixture is legal: ${name}`, validateFEN(fen).ok, validateFEN(fen).reason);
  for (const [config, overrides] of CONFIGS) {
    const searcher = makeSearcher(overrides);
    const result = searcher.search(Position.fromFEN(fen), { depth: 4, nodes: 300000 });
    check(`W07 mate ${name} (${config})`,
      result.completed && Math.abs(result.score) > MATE - 1000,
      `score=${result.score} move=${moveToUci(result.move)} d=${result.depth}`);
  }
}

/* ---------------- forcing horizon: capture chain ---------------- */
check('W07 capture-chain fixture is legal',
  validateFEN(CAPTURE_CHAIN).ok, validateFEN(CAPTURE_CHAIN).reason);
{
  const chainMoves = [];
  for (const [config, overrides] of CONFIGS) {
    const searcher = makeSearcher(overrides);
    const result = searcher.search(Position.fromFEN(CAPTURE_CHAIN), { depth: 1, nodes: 300000 });
    const best = moveToUci(result.move);
    chainMoves.push(best);
    check(`W07 capture chain at the horizon (${config})`,
      result.completed && best === 'd1d8' && Math.abs(result.score) > MATE - 1000,
      `score=${result.score} move=${best} pv=${result.pv.map(moveToUci).join(' ')}`);
    check(`W07 forced recapture is in the PV (${config})`,
      result.pv.length >= 2 && moveToUci(result.pv[1]) === 'h4d8',
      result.pv.map(moveToUci).join(' '));
  }
  check('W07 pruning configurations agree on the forcing move',
    new Set(chainMoves).size === 1 && chainMoves[0] === 'd1d8',
    chainMoves.join(','));
}

/* ---------------- low-material / zugzwang guards ---------------- */
check('W07 pawn-only fixture is legal', validateFEN(PAWN_ONLY).ok, validateFEN(PAWN_ONLY).reason);
{
  const withNull = makeSearcher();
  const withoutNull = makeSearcher({ useNull: false });
  const on = withNull.search(Position.fromFEN(PAWN_ONLY), { depth: 4 });
  const off = withoutNull.search(Position.fromFEN(PAWN_ONLY), { depth: 4 });
  check('W07 null pruning does not change a pawn-only position',
    on.score === off.score && on.move === off.move && on.depth === off.depth,
    `${on.score}/${moveToUci(on.move)} vs ${off.score}/${moveToUci(off.move)}`);

  const p = Position.fromFEN(PAWN_ONLY);
  let nullCalls = 0;
  const originalMakeNull = p.makeNullMove;
  p.makeNullMove = function countedNull() {
    nullCalls++;
    return originalMakeNull.call(this);
  };
  try {
    withNull.search(p, { depth: 4 });
  } finally {
    p.makeNullMove = originalMakeNull;
  }
  check('W07 the zugzwang guard prevents null moves in search',
    nullCalls === 0, `nullCalls=${nullCalls}`);
}

/* ---------------- TT reuse does not hide a mate ---------------- */
{
  const searcher = makeSearcher();
  const fen = MATES['back rank'];
  const first = searcher.search(Position.fromFEN(fen), { depth: 4 });
  const second = searcher.search(Position.fromFEN(fen), { depth: 4 });
  check('W07 repeated search keeps the same mate score and move',
    first.score === second.score && first.move === second.move &&
    Math.abs(second.score) > MATE - 1000,
    `${first.score}/${moveToUci(first.move)} vs ${second.score}/${moveToUci(second.move)}`);
}

console.log(`\nTACTICS: ${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
