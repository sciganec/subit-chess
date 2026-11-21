/**
 * SUBIT-CHESS v3.0.10 — audit regression suite
 *
 * Spec basis:
 *   ver/subit_chess_v3.0.9/subit_chess_v3.0.9_audit.md §17 (authoritative registry),
 *   §20 fix roadmap W01-W05.
 *
 * The audit was static-only. Every check here either reproduces the reported
 * defect against the pre-fix logic or locks the semantics that were derived
 * independently where the audit text contradicted itself (AUD-309-03).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Position } from '../src/engine/core.mjs';
import { validateFEN, FEN_STATUS } from '../src/engine/fen.mjs';
import { Evaluation, DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable } from '../src/engine/search.mjs';
import { VERSION } from '../src/engine/index.mjs';
import {
  makeStartFEN, playGame, compare, pairColors, summarize
} from '../src/engine/learn.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEAR_75 = '4k3/8/8/8/8/8/8/R3K2R w KQ - 149 1';

function snapshot(p) {
  return {
    board: Array.from(p.board), turn: p.turn, castling: p.castling, ep: p.ep,
    halfmove: p.halfmove, fullmove: p.fullmove,
    hashLo: p.hashLo, hashHi: p.hashHi,
    kingW: p.kingSq[0], kingB: p.kingSq[1], phaseMaterial: p.phaseMaterial,
    ply: p.ply, repLimit: p.repLimit, rep: p.rep.slice(), repHi: p.repHi.slice(),
    fen: p.fen()
  };
}

/* ================================================================== *
 * AUD-309-02 / W01 — null move must not create a terminal draw
 * ================================================================== */
{
  const p = new Position().setFEN(NEAR_75);
  p.pushRep();
  const before = snapshot(p);
  const undo = p.makeNullMove();

  check('AUD-309-02 null move leaves the halfmove clock alone',
    p.halfmove === 149, `halfmove=${p.halfmove}`);
  const st = p.status();
  check('AUD-309-02 null move does not create an automatic draw',
    st === null || !st.over, st ? st.reason : 'playable');
  // The hash changes (side to move flips), so the *count* may change; the
  // history itself must not gain an entry for a move that was never played.
  check('AUD-309-02 null move does not enter repetition history',
    p.rep.length === before.rep.length &&
    JSON.stringify(p.rep) === JSON.stringify(before.rep) &&
    JSON.stringify(p.repHi) === JSON.stringify(before.repHi));

  p.unmakeNullMove(undo);
  check('AUD-309-02 null move state is fully restored',
    JSON.stringify(snapshot(p)) === JSON.stringify(before));

  // The old code produced halfmove = 150 here, so quiescence returned 0.
  const stub = { evaluate() { return 777; } };
  const s = new Searcher(stub, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
  const q = new Position().setFEN(NEAR_75);
  const qUndo = q.makeNullMove();
  const score = s.negamax(q, 0, -1000, 1000, 1);
  q.unmakeNullMove(qUndo);
  check('AUD-309-02 recursive search after null move is not a terminal 0',
    score !== 0 && Math.abs(score) > 100, `score=${score}`);
  check('AUD-309-02 position restored after recursive probe', q.fen() === NEAR_75);
}

/* ================================================================== *
 * AUD-309-03 / W02 — the challenger is tested as both colours
 * ================================================================== */
{
  const even = pairColors('C', 'N', 0);
  const odd = pairColors('C', 'N', 1);
  check('AUD-309-03 even game: challenger White, champion Black',
    even.white === 'N' && even.black === 'C' && even.challengerIsWhite);
  check('AUD-309-03 odd game: champion White, challenger Black',
    odd.white === 'C' && odd.black === 'N' && !odd.challengerIsWhite);

  const r = compare(DEFAULT_PARAMS, cloneParams(DEFAULT_PARAMS), {
    games: 4, depth: 1, maxPlies: 4, seed: 17
  });
  check('AUD-309-03 compare records both challenger colours',
    r.games.map((g) => g.challengerColor).join('') === 'wbwb',
    r.games.map((g) => g.challengerColor).join(''));
  check('AUD-309-03 colour balance is reported',
    r.colorBalance.challengerWhite === 2 && r.colorBalance.challengerBlack === 2,
    JSON.stringify(r.colorBalance));
}

/* ================================================================== *
 * AUD-309-04 / W03 — independence, seeds, W/D/L and validation split
 * ================================================================== */
{
  const a = makeStartFEN(1, 4);
  const b = makeStartFEN(2, 4);
  check('AUD-309-04 a seed defines a legal start position',
    typeof a === 'string' && a.split(' ').length === 6 && validateFEN(a).ok,
    validateFEN(a).reason);
  check('AUD-309-04 starts are reproducible', makeStartFEN(1, 4) === a);
  check('AUD-309-04 different seeds give different starts', a !== b, `${a} / ${b}`);

  const g1 = playGame(DEFAULT_PARAMS, DEFAULT_PARAMS, { depth: 1, seed: 11, maxPlies: 6 });
  const g2 = playGame(DEFAULT_PARAMS, DEFAULT_PARAMS, { depth: 1, seed: 12, maxPlies: 6 });
  check('AUD-309-04 seeded games use distinct starts', g1.startFen !== g2.startFen);
  check('AUD-309-04 games report their seed and start',
    g1.seed === 11 && typeof g1.startFen === 'string' && g2.seed === 12);

  const r = compare(DEFAULT_PARAMS, cloneParams(DEFAULT_PARAMS), {
    games: 4, validationGames: 2, depth: 1, maxPlies: 6, seed: 3
  });
  check('AUD-309-04 tuning games are distinct observations',
    new Set(r.games.map((g) => g.startFen)).size === 4);
  check('AUD-309-04 validation uses a disjoint seed range',
    r.split && r.split.validationSeed !== r.split.tuningSeed && r.split.validationStarts === 2,
    JSON.stringify(r.split));
  check('AUD-309-04 no start-position leakage into validation',
    r.split && r.split.overlap === 0 && r.split.leaked === false);
  check('AUD-309-04 W/D/L are fully accounted for',
    r.summary.wins + r.summary.draws + r.summary.losses === r.summary.n &&
    r.validation.n === 2 &&
    r.validation.wins + r.validation.draws + r.validation.losses === 2);
  check('AUD-309-04 validation never affects the tuning verdict',
    r.significant === (Math.abs(r.dS) > 2 * (r.se || 1e-9)) &&
    r.validation.mean !== undefined);
  check('AUD-309-04 summary handles an empty sample', summarize([]).n === 0);
}

/* ================================================================== *
 * AUD-309-01 / W04 — package and release artifact identity
 * ================================================================== */
{
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const expected = `src/subit_chess_v${pkg.version}.html`;
  check('AUD-309-01 main matches the package version',
    pkg.main === expected, `main=${pkg.main} expected=${expected}`);
  check('AUD-309-01 browser matches the package version',
    pkg.browser === expected, `browser=${pkg.browser}`);
  check('AUD-309-01 the declared entry point exists',
    fs.existsSync(path.join(ROOT, expected)));
  check('AUD-309-01 the engine reports the same version',
    VERSION === pkg.version, `engine=${VERSION} package=${pkg.version}`);
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  check('AUD-309-01 CI resolves the artifact instead of hardcoding it',
    !/ENGINE_HTML:\s*src\/subit_chess_v/.test(ci) &&
    ci.includes('ENGINE_HTML=src/subit_chess_v${VERSION}.html'));
}

/* ================================================================== *
 * AUD-309-05 / W05 — en passant history is possible
 * ================================================================== */
{
  const legalW = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const legalB = 'rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1';
  check('AUD-309-05 legal white-push en passant FEN is accepted',
    validateFEN(legalW).ok, validateFEN(legalW).reason);
  check('AUD-309-05 legal black-push en passant FEN is accepted',
    validateFEN(legalB).ok, validateFEN(legalB).reason);

  const blockedW = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPNPP/RNBQKB1R b KQkq e3 0 1';
  const blockedB = 'rnbqkbnr/ppppnppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1';
  const cw = validateFEN(blockedW);
  const cb = validateFEN(blockedB);
  check('AUD-309-05 occupied origin after a white push is rejected',
    !cw.ok && cw.status === FEN_STATUS.INVALID_EN_PASSANT, cw.reason);
  check('AUD-309-05 occupied origin after a black push is rejected',
    !cb.ok && cb.status === FEN_STATUS.INVALID_EN_PASSANT, cb.reason);
}

/* ================================================================== *
 * AUD-309-06 / W05 — FEN counters are exact integers
 * ================================================================== */
{
  const hugeHalf = '4k3/8/8/8/8/8/8/4K3 w - - 999999999999999999999999 1';
  const hugeFull = `4k3/8/8/8/8/8/8/4K3 w - - 0 ${Number.MAX_SAFE_INTEGER + 1}`;
  const safeHalf = `4k3/8/8/8/8/8/8/4K3 w - - ${Number.MAX_SAFE_INTEGER} 1`;
  check('AUD-309-06 oversized halfmove is rejected',
    validateFEN(hugeHalf).status === FEN_STATUS.INVALID_COUNTERS,
    validateFEN(hugeHalf).reason);
  check('AUD-309-06 oversized fullmove is rejected',
    validateFEN(hugeFull).status === FEN_STATUS.INVALID_COUNTERS,
    validateFEN(hugeFull).reason);
  check('AUD-309-06 a safe integer counter is accepted',
    validateFEN(safeHalf).ok, validateFEN(safeHalf).reason);
  check('AUD-309-06 fullmove still starts at 1',
    !validateFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 0').ok);
}

console.log(`\nAUDIT309: ${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails === 0 ? 0 : 1);
