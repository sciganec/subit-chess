/**
 * SUBIT-CHESS v3.0.9 — second audit regression suite
 *
 * Spec basis:
 *   ver/subit_chess_v3.0.8/subit_chess_v3.0.8_audit_2.md §2-§6
 *   docs/DECISIONS.md ADR 0011 / ADR 0020 / ADR 0022
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §12, §futility, §quiescence
 *
 * One check per P0 defect fixed in v3.0.9. The P1 items of the same audit
 * (AUD-07…AUD-09) are deliberately out of scope here.
 */

import { Position, WHITE, BLACK } from '../src/engine/core.mjs';
import { Evaluation, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable, MATE } from '../src/engine/search.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CHECK_FEN = '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1';   // black in check from Re2
const STALE_FEN = 'k7/2K5/1Q6/8/8/8/8/8 b - - 0 1';    // black stalemated

function realSearcher() {
  return new Searcher(
    new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode }),
    DEFAULT_PARAMS,
    { tt: new TranspositionTable(4) }
  );
}

/* ================================================================== *
 * AUD-01 — no stand-pat in check
 * ================================================================== */

{
  // A stub evaluator makes the faulty stand-pat unmistakable: 900 in check,
  // -100 once the check is resolved. The old code returned 900 >= beta; the
  // fixed code searches evasions and returns the negated -100.
  const p = new Position().setFEN(CHECK_FEN);
  const stub = { evaluate(pos) { return pos.turn === BLACK ? 900 : -100; } };
  const s = new Searcher(stub, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
  const score = s.quiescence(p, -1000, 500, 0, 0);
  check('AUD-01 quiescence has no stand-pat in check',
    p.inCheck() && score !== 900 && score < 500, `score=${score}`);
}

/* ================================================================== *
 * AUD-02 — qdepth cap while in check resolves a real evasion
 * ================================================================== */

{
  const p = new Position().setFEN(CHECK_FEN);
  const stub = { evaluate(pos) { return pos.turn === BLACK ? 900 : -100; } };
  const s = new Searcher(stub, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
  const score = s.quiescence(p, -1000, 1000, 0, 9);   // qdepth > 8
  check('AUD-02 cap in check resolves one evasion, no static check score',
    score !== 900 && Math.abs(score) < 1000, `score=${score}`);
  check('AUD-02 board restored after horizon evasion scan', p.fen() === CHECK_FEN);
}

/* ================================================================== *
 * AUD-03 — stalemate at any qsearch depth
 * ================================================================== */

{
  const p = new Position().setFEN(STALE_FEN);
  const s = realSearcher();
  const deep = s.quiescence(p, -1e9, 1e9, 1, 3);
  check('AUD-03 stalemate is 0 at qdepth > 0',
    p.legalMoves().length === 0 && deep === 0, `deep=${deep}`);
  check('AUD-03 board restored after horizon stalemate probe', p.fen() === STALE_FEN);
}

/* ================================================================== *
 * AUD-04 — claimable draws are normal positions in the search
 * ================================================================== */

{
  const stub = { evaluate() { return 777; } };
  const run = (fen, push) => {
    const p = new Position().setFEN(fen);
    for (let i = 0; i < push; i++) p.pushRep();
    const s = new Searcher(stub, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
    return s.negamax(p, 1, -Infinity, Infinity, 1);
  };
  const fifty = run('4k3/8/8/8/8/8/8/R3K2R w KQ - 100 1', 0);
  check('AUD-04 50-move claim is not a terminal 0',
    fifty !== 0 && Math.abs(fifty) > 100, `score=${fifty}`);
  const threefold = run('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 2);
  check('AUD-04 threefold claim is not a terminal 0',
    threefold !== 0 && Math.abs(threefold) > 100, `score=${threefold}`);
}

/* ================================================================== *
 * AUD-05 — root honours the automatic draws
 * ================================================================== */

{
  const search = (fen, push = 0) => {
    const p = new Position().setFEN(fen);
    for (let i = 0; i < push; i++) p.pushRep();
    return realSearcher().search(p);
  };
  const r75 = search('4k3/8/8/8/8/8/8/R3K2R w KQ - 150 1');
  check('AUD-05 root 75-move rule is terminal',
    r75.score === 0 && r75.reason === 'seventy-five-move rule', `reason=${r75.reason}`);
  const r5 = search('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 4);
  check('AUD-05 root fivefold repetition is terminal',
    r5.score === 0 && r5.reason === 'fivefold repetition', `reason=${r5.reason}`);
  const rDead = search('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  check('AUD-05 root dead material is terminal',
    rDead.score === 0 && rDead.reason === 'insufficient material', `reason=${rDead.reason}`);
  // the claimable counterparts must remain playable
  const r50 = search('4k3/8/8/8/8/8/8/R3K2R w KQ - 100 1');
  check('AUD-05 root 50-move claim stays playable', r50.reason === undefined);
}

/* ================================================================== *
 * AUD-06 — futility pruning compares scores in the mover's perspective
 * ================================================================== */

{
  // The stub returns -1000 when the opponent is to move (i.e. +1000 for the
  // mover). With the old sign, -1000 + margin <= alpha pruned every quiet
  // move after the first (1 node); with the fixed sign none is pruned (20).
  const stub = { evaluate(pos) { return pos.turn === BLACK ? -1000 : 1000; } };
  const p = new Position().setFEN(START);
  const s = new Searcher(stub, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
  s.useTT = false;
  s.useNull = false;
  s.useLMR = false;
  s.pos = p;
  s.nodes = 0;
  s.pvLength.fill(0);
  s.negamax(p, 1, 1000, 1001, 1);
  check('AUD-06 futility keeps good quiet moves', s.nodes === 20, `nodes=${s.nodes}`);
}

console.log(`\nAUDIT2: ${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
