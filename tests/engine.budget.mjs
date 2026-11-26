/**
 * Adaptive search budget (SEARCH-15, docs/theory/40 §11-13, 05 §17.1).
 * Pure-function checks plus one engine integration check.
 */
import { Engine } from '../src/engine/index.mjs';
import {
  BUDGET_DEFAULTS as P, allocateTime, updateBank, decisionStability, shouldStop
} from '../src/engine/budget.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

/* ---- allocateTime ---- */
{
  const a = allocateTime({ nominalMs: 100, bankMs: 0 });
  check('allowance = nominal with an empty bank', a.allowMs === 100);
  check('soft = 0.6 allowance, hard = 2.0 allowance', a.softMs === 60 && a.hardMs === 200, `soft=${a.softMs} hard=${a.hardMs}`);
  const rich = allocateTime({ nominalMs: 100, bankMs: 1000 });
  check('hard cap never exceeds 3x nominal, however large the bank', rich.hardMs === 300, `hard=${rich.hardMs}`);
  const poor = allocateTime({ nominalMs: 100, bankMs: -500 });
  check('an overdrawn bank still leaves the 0.3 allowance floor', poor.allowMs === 30 && poor.hardMs === 60, `allow=${poor.allowMs} hard=${poor.hardMs}`);
  check('soft <= hard in every case', [-500, -50, 0, 50, 1000].every((b) => { const x = allocateTime({ nominalMs: 100, bankMs: b }); return x.softMs <= x.hardMs; }));
  check('garbage input does not produce NaN', Number.isFinite(allocateTime({ nominalMs: NaN, bankMs: undefined }).hardMs));
}

/* ---- updateBank ---- */
{
  check('a move that used less than nominal grows the bank', updateBank(0, 100, 40) === 60);
  check('a move that used more shrinks it', updateBank(0, 100, 150) === -50);
  check('bank is capped at maxBank nominals', updateBank(590, 100, 0) === P.maxBank * 100);
  check('bank cannot fall below the overdraft floor', updateBank(-70, 100, 300) === -(1 - P.minAllow) * 100);
}

/* ---- decisionStability ---- */
const it = (move, score, spread, flag = 0, depth = 1) => ({ depth, move, score, spread, flag });
{
  const stable = [it(1, 20, 120), it(1, 22, 130), it(1, 25, 140)];
  check('same move, small drift, clear gap -> stable', decisionStability(stable).stable === true);
  check('too few iterations -> unstable', decisionStability([it(1, 0, 200), it(1, 0, 200)]).stable === false);
  check('root move changed within the window -> unstable',
    decisionStability([it(2, 20, 120), it(1, 22, 130), it(1, 25, 140)]).stable === false);
  check('score drift above the threshold -> unstable',
    decisionStability([it(1, 20, 120), it(1, 22, 130), it(1, 90, 140)]).stable === false);
  check('runner-up close -> unstable even if the move never changed',
    decisionStability([it(1, 20, 20), it(1, 22, 25), it(1, 25, 30)]).stable === false);
  check('a bound is not a score -> unstable',
    decisionStability([it(1, 20, 120), it(1, 22, 130), it(1, 25, 140, 1)]).stable === false);
  const u = decisionStability([it(2, 20, 120), it(1, 22, 130), it(1, 25, 140)]);
  check('instability stays in [0,1]', u.instability >= 0 && u.instability <= 1);
}

/* ---- shouldStop ---- */
{
  const stable = [it(1, 20, 120), it(1, 22, 130), it(1, 25, 140)];
  const unstable = [it(2, 20, 120), it(1, 22, 130), it(3, 25, 140)];
  const base = { softMs: 60, hardMs: 200, lastIterMs: 10 };
  check('before soft: always continue', shouldStop({ ...base, elapsedMs: 30, history: stable }).stop === false);
  check('after soft + stable: stop (low value of more computation)',
    shouldStop({ ...base, elapsedMs: 70, history: stable }).stop === true);
  check('after soft + unstable: keep thinking',
    shouldStop({ ...base, elapsedMs: 70, history: unstable }).stop === false);
  check('at the hard cap: stop regardless', shouldStop({ ...base, elapsedMs: 200, history: unstable }).stop === true);
  check('an iteration that cannot finish is not started',
    shouldStop({ softMs: 60, hardMs: 200, lastIterMs: 80, elapsedMs: 150, history: unstable }).stop === true);
}

/* ---- bank neutrality: a policy that banks must not drift the mean away from nominal ---- */
{
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const nominal = 100;
  let bank = 0, total = 0, minBank = 0, maxBankSeen = 0, n = 5000;
  for (let i = 0; i < n; i++) {
    const a = allocateTime({ nominalMs: nominal, bankMs: bank });
    // half the positions are easy (stop at soft), half are hard (use up to hard)
    const used = rnd() < 0.5 ? a.softMs * (0.8 + 0.4 * rnd()) : a.hardMs * (0.6 + 0.4 * rnd());
    total += used;
    bank = updateBank(bank, nominal, used);
    minBank = Math.min(minBank, bank); maxBankSeen = Math.max(maxBankSeen, bank);
  }
  const mean = total / n;
  check('bank stays within [-(1-minAllow) nominal, maxBank nominal]',
    minBank >= -(1 - P.minAllow) * nominal - 1e-9 && maxBankSeen <= P.maxBank * nominal + 1e-9,
    `[${minBank.toFixed(0)}, ${maxBankSeen.toFixed(0)}]`);
  check('mean time per move stays within 10% of nominal over 5000 moves', Math.abs(mean - nominal) / nominal < 0.10, `mean=${mean.toFixed(1)}`);
}

/* ---- integration: a forced move does not burn the clock; fixedTime opts out ---- */
{
  // quiet middlegame, Black in check from Qe7 with exactly one legal reply and no forced mate in sight
  const FEN = '2r1k1r1/3nQppp/p2p4/2p4P/1q2b3/N1P1P1P1/RP1KBP2/2B3NR b - - 0 26';
  const fixed = new Engine(undefined, { adaptiveTime: true, ttBits: 16 });
  fixed.setFEN(FEN);
  check('fixture has exactly one legal move', fixed.pos.legalMoves().length === 1);
  const a = new Engine(undefined, { adaptiveTime: true, ttBits: 16 });
  a.setFEN(FEN);
  const ra = a.search({ timeMs: 400 });
  check('adaptive: a forced move uses far less than the nominal budget', ra.timeMs < 200, `used=${ra.timeMs} ms`);
  check('adaptive: the unused time is banked', a.timeBank > 100, `bank=${a.timeBank.toFixed(0)}`);
  const rf = fixed.search({ timeMs: 400, fixedTime: true });
  check('fixedTime: UCI movetime is exact (bank untouched)', fixed.timeBank === 0 && rf.timeMs >= 350, `used=${rf.timeMs} ms`);
  const off = new Engine(undefined, { ttBits: 16, adaptiveTime: false });
  off.setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  off.search({ timeMs: 60 });
  check('engine with adaptiveTime off never touches the bank', off.timeBank === 0);
}

console.log(fails === 0 ? '\nBUDGET OK' : `\nBUDGET FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
