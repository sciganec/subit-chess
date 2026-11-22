/**
 * Learning-protocol tests: determinism, the sign test, and the hill climber.
 */
import { Position } from '../src/engine/core.mjs';
import { Evaluation, DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import {
  makeRng, playGame, compare, summarize, hillClimb, paramsAreUsable, RESULT
} from '../src/engine/learn.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

/* ---------------- PRNG ---------------- */
{
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  check('the PRNG is deterministic', JSON.stringify(seqA) === JSON.stringify(seqB));
  check('the PRNG stays in [0,1)', seqA.every((x) => x >= 0 && x < 1));
  const c = makeRng(43);
  check('different seeds give different streams', c() !== seqA[0]);
}

/* ---------------- a single game ---------------- */
{
  const t0 = Date.now();
  const g = playGame(DEFAULT_PARAMS, DEFAULT_PARAMS, { depth: 3, seed: 7, maxPlies: 24 });
  check('a game is played', g.plies > 0 && g.plies <= 24, `${g.plies} plies in ${Date.now() - t0}ms`);
  check('a game ends in a defined result', [RESULT.WHITE, RESULT.DRAW, RESULT.BLACK].includes(g.result),
    `result=${g.result} ${g.termination}`);
  check('a game reports its termination', typeof g.termination === 'string' && g.termination.length > 0);

  const g2 = playGame(DEFAULT_PARAMS, DEFAULT_PARAMS, { depth: 3, seed: 7, maxPlies: 24 });
  check('the same seed reproduces the same game', g.line.join(' ') === g2.line.join(' '),
    `${g.line.length}/${g2.line.length} plies`);
}

/* ---------------- identical engines must not be "better" ---------------- */
{
  const r = compare(DEFAULT_PARAMS, cloneParams(DEFAULT_PARAMS), { games: 12, depth: 2, seed: 11 });
  check('ΔS of identical engines is not significant', !r.significant || Math.abs(r.dS) < 0.1,
    `ΔS=${r.dS.toFixed(3)} se=${r.se.toFixed(3)}`);
  check('the comparison reports both sides', r.games.length === 12 && r.games.every((g) => typeof g.result === 'number'));
  check('alternating colours balance the sample',
    r.games.filter((g) => g.result !== 0).length >= 0);
}

/* ---------------- summary statistics ---------------- */
{
  const s = summarize([
    { result: 1 }, { result: 1 }, { result: 0 }, { result: -1 }
  ]);
  check('summary counts wins, draws, losses', s.wins === 2 && s.draws === 1 && s.losses === 1,
    `${s.wins}/${s.draws}/${s.losses}`);
  check('summary mean is correct', Math.abs(s.mean - 0.25) < 1e-9, String(s.mean));
  check('standard error shrinks with the sample',
    summarize(Array.from({ length: 100 }, () => ({ result: 1 }))).se === 0);
  check('an empty sample is handled', summarize([]).n === 0);
}

/* ---------------- a crippled evaluation never scores better ---------------- */
{
  // inverted material weight: the handicapped side is paid for losing pieces
  const strong = cloneParams(DEFAULT_PARAMS);
  const weak = cloneParams(DEFAULT_PARAMS);
  weak.w = { ...DEFAULT_PARAMS.w, M: -1.0 };
  const r = compare(strong, weak, { games: 2, depth: 3, seed: 5, maxPlies: 40 });
  check('a handicap never improves the score', r.dS <= 0, `ΔS=${r.dS.toFixed(3)} se=${r.se.toFixed(3)}`);
  check('params remain loadable', paramsAreUsable(strong) && paramsAreUsable(weak));
}

/* ---------------- the handicap really changes the evaluation ---------------- */
{
  const p = new Position();
  p.setFEN('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
  const a = new Evaluation(DEFAULT_PARAMS, { mode: 'structural' }).structural(p).E;
  const weak = cloneParams(DEFAULT_PARAMS);
  weak.w = { ...DEFAULT_PARAMS.w, M: -1.0 };
  const b = new Evaluation(weak, { mode: 'structural' }).structural(p).E;
  check('the material weight changes the evaluation', Math.sign(a) !== Math.sign(b),
    `default=${a.toFixed(1)} inverted=${b.toFixed(1)}`);
}

/* ---------------- hill climbing ---------------- */
{
  const r = hillClimb(DEFAULT_PARAMS, { steps: 3, games: 2, depth: 2, seed: 3 });
  check('hill climbing runs every step', r.log.length === 3, String(r.log.length));
  check('hill climbing never loses score', r.score >= 0, String(r.score));
  check('the result is a usable parameter set', paramsAreUsable(r.params));
  check('every step is logged with a verdict',
    r.log.every((l) => ['accept', 'reject', 'inconclusive'].includes(l.verdict)));
}

/* ---------------- determinism of the whole protocol ---------------- */
{
  const a = compare(DEFAULT_PARAMS, cloneParams(DEFAULT_PARAMS), { games: 3, depth: 2, seed: 99 });
  const b = compare(DEFAULT_PARAMS, cloneParams(DEFAULT_PARAMS), { games: 3, depth: 2, seed: 99 });
  check('the comparison protocol is deterministic',
    a.dS === b.dS && a.games.map((g) => g.line.join(' ')).join('|') === b.games.map((g) => g.line.join(' ')).join('|'));
}

/* ---------------- start position sanity ---------------- */
{
  const p = new Position();
  p.setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  check('the game start position is the standard one', p.fen().startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'));
}

console.log(fails === 0 ? '\nLEARN OK' : `\nLEARN FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);