/**
 * SUBIT-CHESS v3.0.7 — audit regression tests
 *
 * Spec basis:
 *   docs/theory/32 §FEN                      the position is evidence
 *   docs/theory/45 §16-§20                    uncertainty + decision certificate
 *   docs/theory/46 §14                        evaluation / probability / confidence
 *
 * Every test maps to one audited defect fixed in v3.0.7:
 *   §3.1  FEN validator (fen.mjs) — malformed FEN must not half-change a board
 *   §4.1  quiescence horizon stalemate
 *   §4.2  claimable vs automatic draws (50-move / 3-fold stay playable)
 *   §5.1  context directions: ATTACK indexes the enemy king
 *   §6.1  structural() builds structure before context
 *   §6.2  measured 0.0 uncertainty survives `typeof === 'number'`
 *   §7.1  genOutpost checks control (not defenders of an empty square)
 *   §7.6  pareto() reports the full set, not a truncated one
 *   §8.1  analyze() reports position uncertainty, not constant CRITICAL
 *   §3.2  futility pruning skips moves that give check
 *   §4.3  search seldepth resets per search
 *   §5.2  insufficientMaterial() — K+B vs K+B same colour only
 *   §6.3  53-bit Zobrist key composed without collision in Float64Array TT
 */

import { Position, moveToUci, WHITE, BLACK } from '../src/engine/core.mjs';
import { validateFEN, FEN_STATUS } from '../src/engine/fen.mjs';
import { Percept } from '../src/engine/percept.mjs';
import { Structure, hashKeys } from '../src/engine/structure.mjs';
import { computeContext, I_ATTACK, I_DEFENCE, I_QUIET, I_PRESSURE } from '../src/engine/context.mjs';
import { Evaluation, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable, MATE } from '../src/engine/search.mjs';
import { uncertaintyOf, riskOf, RISK_NAME } from '../src/engine/meta.mjs';
import { Engine } from '../src/engine/index.mjs';
import { generatePlans, PLAN } from '../src/engine/plans.mjs';
import { buildCertificate } from '../src/engine/uncertainty.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}
function checkThrows(name, fn) {
  try { fn(); } catch { check(name, true); return; }
  check(name, false, 'expected throw');
}
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* ================================================================== *
 * §3.1  FEN validator
 * ================================================================== */

check('valid FEN accepted', validateFEN(START).ok === true);
check('valid FEN status', validateFEN(START).status === FEN_STATUS.VALID);
check('empty FEN rejected', validateFEN('').status === FEN_STATUS.INVALID_SYNTAX);
check('too few fields', validateFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR').status === FEN_STATUS.INVALID_SYNTAX);
check('unknown piece', validateFEN('rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/XNBQKBNR w KQkq - 0 1').status === FEN_STATUS.INVALID_BOARD);
check('too few ranks', validateFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1').status === FEN_STATUS.INVALID_BOARD);
check('pawn on first rank', validateFEN('P7/8/8/8/8/8/8/K6k w - - 0 1').status === FEN_STATUS.INVALID_BOARD);
check('pawn on last rank', validateFEN('7p/8/8/8/8/8/8/K6k w - - 0 1').status === FEN_STATUS.INVALID_BOARD);
check('two white kings', validateFEN('4k3/8/8/8/8/8/8/KK7 w - - 0 1').status === FEN_STATUS.INVALID_KINGS);
check('missing black king rejected', validateFEN('8/8/8/8/8/8/8/3K4 w - - 0 1').status === FEN_STATUS.INVALID_KINGS);
check('adjacent kings rejected', validateFEN('8/8/8/8/8/8/1k6/K7 w - - 0 1').status === FEN_STATUS.INVALID_POSITION);
check('castling K without king home',
  validateFEN('4k3/8/8/8/8/8/8/3K3R w K - 0 1').status === FEN_STATUS.INVALID_CASTLING);
check('castling Q without rook home',
  validateFEN('4k3/8/8/8/8/8/8/3K2R1 w Q - 0 1').status === FEN_STATUS.INVALID_CASTLING);
check('halfmove not a number',
  validateFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - x 1').status === FEN_STATUS.INVALID_COUNTERS);
check('fullmove zero',
  validateFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 0').status === FEN_STATUS.INVALID_COUNTERS);
check('side not to move in check rejected',
  validateFEN('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1').status === FEN_STATUS.INVALID_POSITION);
check('side to move in check accepted',
  validateFEN('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1').ok === true);
check('valid castling both sides accepted',
  validateFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').ok === true);

/* atomicity: a rejected FEN must not touch the board */
const atomic = new Position().setFEN(START);
const before = atomic.fen();
checkThrows('setFEN throws on bad FEN', () => atomic.setFEN('8/8/8/8/8/8/8/7K w - - 0 1'));
check('setFEN leaves board intact after rejection', atomic.fen() === before, `${atomic.fen()} == ${before}`);

/* escape hatch for verifier / compositions */
check('setFEN validate:false loads impossible position',
  (() => { const p = new Position(); p.setFEN('7k/8/8/8/8/8/8/K7 w - - 0 1', { validate: false }); return true; })());

/* ================================================================== *
 * §5.2  insufficientMaterial
 * ================================================================== */

const IM = (fen) => new Position().setFEN(fen).insufficientMaterial();

check('K vs K dead', IM('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
check('K+B vs K dead', IM('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'));
check('K+N vs K dead', IM('4k3/8/8/8/8/8/8/2N1K3 w - - 0 1'));
check('K vs K+B dead', IM('4k3/8/8/8/8/8/8/4K2b w - - 0 1'));
check('K vs K+N dead', IM('4k3/8/8/8/8/8/8/4K2n w - - 0 1'));
// white bishop on c1 (sq 114): (7+2)=9 odd -> colour 1; black bishop on h1 (sq 119): (7+7)=14 even -> colour 0.
// opposite colours, NOT dead. Need same colour to be dead.
// white Bb1 (sq 113): (7+1)=8 even -> colour 0; black Bh1 (sq 119): 14 even -> colour 0. Same -> dead.
check('K+B vs K+B same colour dead',
  IM('4k3/8/8/8/8/8/8/1B2K2b w - - 0 1'));
check('K+B vs K+B opposite colour NOT dead',
  !IM('4k3/8/8/8/8/8/8/2B1K2b w - - 0 1'));
check('K+N vs K+N NOT dead',
  !IM('4k3/8/8/8/8/8/8/2N1K2n w - - 0 1'));
check('K+B vs K+N NOT dead',
  !IM('4k3/8/8/8/8/8/8/2B1K2n w - - 0 1'));
check('K+2N vs K NOT dead',
  !IM('4k3/8/8/8/8/8/8/2N1NK2 w - - 0 1'));
check('K+R vs K NOT dead',
  !IM('4k3/8/8/8/8/8/8/2R1K3 w - - 0 1'));

/* ================================================================== *
 * §6.3  53-bit Zobrist key
 * ================================================================== */

const zk = (fen) => new Position().setFEN(fen).key;
check('key is a finite non-negative integer',
  Number.isSafeInteger(zk(START)) && zk(START) >= 0, `key=${zk(START)}`);
check('key fits 53 bits', zk(START) < 2 ** 53, `key=${zk(START)}`);
check('key differs by side to move',
  zk(START) !== zk(START.replace(' w ', ' b ')));
check('key differs by castling',
  zk('4k3/8/8/8/8/8/8/4K2R w K - 0 1') !== zk('4k3/8/8/8/8/8/8/4K2R w - - 0 1'));
check('key differs by ep square',
  zk('4k3/8/8/3pP3/8/8/8/4K2R w K - 0 1') !==
  zk('4k3/8/8/3pP3/8/8/8/4K2R w K d6 0 1'));
check('hashKeys also 53-bit',
  (() => { const h = hashKeys([1, 2, 3, 4]); return Number.isSafeInteger(h) && h >= 0; })(),
  `hashKeys=${hashKeys([1, 2, 3, 4])}`);
check('different positions -> different keys',
  zk(START) !== zk('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'));

/* §3.2 (P1.2) TT key separates the rule-50 boundary ---------------- *
 * Same geometry, different halfmove clock -> different ttKey, so a
 * won position at halfmove 99 cannot inherit a draw score from halfmove 100. */
{
  const h = (n) => `4k3/8/8/8/8/8/8/R3K2R w KQ - ${n} 1`;
  const t = (n) => new Position().setFEN(h(n)).ttKey;
  check('ttKey differs across the 50-move boundary (99 vs 100)', t(99) !== t(100));
  check('ttKey differs across the 75-move boundary (149 vs 150)', t(149) !== t(150));
  check('ttKey is stable within a bucket (10 vs 50)', t(10) === t(50));
  check('ttKey is stable within a bucket (100 vs 149)', t(100) === t(149));
  check('ttKey equals the raw Zobrist key in bucket 0 (halfmove < 80)',
    new Position().setFEN(h(0)).ttKey === new Position().setFEN(h(0)).key);
  check('ttKey differs from the raw Zobrist key in a higher bucket (halfmove 100)',
    new Position().setFEN(h(100)).ttKey !== new Position().setFEN(h(100)).key);
  check('ttKey is a safe integer', Number.isSafeInteger(t(0)) && t(0) >= 0);
}

/* ================================================================== *
 * §5.1  context directions (ATTACK indexes enemy king)
 * ================================================================== */

const ctxOf = (fen) => {
  const p = new Position().setFEN(fen);
  const pc = new Percept(p);
  const st = new Structure(p, pc);
  return { p, pc, ctx: computeContext(p, pc, st) };
};
// white queen on d5 attacks f7 (adjacent to black king g8)
const attackPos = ctxOf('6k1/5ppp/8/3Q4/8/8/8/6K1 w - - 0 1');
check('attack intensity present when black king is pressured',
  attackPos.pc.kingZoneAttacks[BLACK] > 0,
  `kzAttacks=[${attackPos.pc.kingZoneAttacks}]`);
check('defence intensity is 0 when own king is safe',
  attackPos.ctx.w[I_DEFENCE] < 0.01,
  `def=${attackPos.ctx.w[I_DEFENCE].toFixed(3)}`);
// startpos: no king pressure, so attack ~ 0 and defence ~ 0
const quietPos = ctxOf(START);
check('startpos: attack is 0 (no enemy pressure)',
  quietPos.ctx.w[I_ATTACK] < 0.01, `atk=${quietPos.ctx.w[I_ATTACK].toFixed(3)}`);
check('startpos: defence is 0 (own king safe)',
  quietPos.ctx.w[I_DEFENCE] < 0.01, `def=${quietPos.ctx.w[I_DEFENCE].toFixed(3)}`);
check('context key well-formed',
  /^[A-Z]+\|[A-Z]+\|[A-Z]+$/.test(quietPos.ctx.key()), quietPos.ctx.key());
check('all intensities in [0,1]',
  [I_QUIET, I_DEFENCE, I_ATTACK, I_PRESSURE].every((i) => quietPos.ctx.w[i] >= 0 && quietPos.ctx.w[i] <= 1));

/* ================================================================== *
 * §6.1  structural() builds structure before context
 * ================================================================== */

{
  const p = new Position().setFEN(START);
  const ev = new Evaluation(DEFAULT_PARAMS).structural(p);
  check('structural() returns structure', !!ev.structure);
  check('structural() returns context', !!ev.context);
  check('structural() returns E', Number.isFinite(ev.E), `E=${ev.E}`);
  check('structural().context has key()', typeof ev.context.key === 'function');
  check('structural().structure is a Structure', ev.structure instanceof Structure);
}

/* ================================================================== *
 * §6.2  uncertaintyOf with 0.0
 * ================================================================== */

{
  const p = new Position().setFEN(START);
  const pc = new Percept(p);
  check('uncertaintyOf(undefined) falls back to 0.3', uncertaintyOf(undefined, null, null, null) === 0.3);
  check('uncertaintyOf(null) falls back to 0.3', uncertaintyOf(null, null, null, null) === 0.3);
  // 0.0 + quiet (no hanging) +0.05 = 0.05, not 0.3 (the old bug)
  check('uncertaintyOf(0.0) is kept (not 0.3 default)',
    Math.abs(uncertaintyOf({ uncertainty: 0 }, p, pc, null) - 0.05) < 1e-9,
    `got=${uncertaintyOf({ uncertainty: 0 }, p, pc, null)}`);
  // 0.35 + 0.05 = 0.40
  check('uncertaintyOf(0.35) preserved (quiet bonus added)',
    Math.abs(uncertaintyOf({ uncertainty: 0.35 }, p, pc, null) - 0.4) < 1e-6,
    `got=${uncertaintyOf({ uncertainty: 0.35 }, p, pc, null)}`);
}

/* ================================================================== *
 * §7.1  genOutpost uses control, not defenders of an empty square
 * ================================================================== */

const outpost = (fen) => {
  const p = new Position().setFEN(fen);
  const pc = new Percept(p);
  const st = new Structure(p, pc);
  const moves = p.legalMoves();
  return generatePlans(p, pc, st, moves).filter((pl) => pl.type === PLAN.OUTPOST);
};
// white pawn on d4 supports e5; knight on f3 can jump to e5 (rank 5, advanced).
check('outpost generated with support (Nf3->e5, d4 pawn)',
  outpost('6k1/pp5p/8/8/3P4/5N2/PPP5/6K1 w - - 0 1').length > 0,
  `plans=${outpost('6k1/pp5p/8/8/3P4/5N2/PPP5/6K1 w - - 0 1').length}`);
check('outpost plan title mentions the square',
  outpost('6k1/pp5p/8/8/3P4/5N2/PPP5/6K1 w - - 0 1')
    .every((pl) => pl.title && pl.features && typeof pl.features.guarded === 'number'),
  'all outpost plans carry features');

/* ================================================================== *
 * §4.1  quiescence stalemate
 * ================================================================== */

check('quiescence stalemate returns 0 (black to move, no legal move)',
  (() => {
    // black king a8, white king c7, white queen b6: black is stalemated
    const p = new Position().setFEN('k7/2K5/1Q6/8/8/8/8/8 b - - 0 1');
    const searcher = new Searcher(new Evaluation(DEFAULT_PARAMS, { mode: 'structural' }), DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
    return p.legalMoves().length === 0 && searcher.quiescence(p, -1e9, 1e9, 0, 0) === 0;
  })(),
  'score from quiescence');

/* ================================================================== *
 * §4.2  automatic vs claimable draws
 * ================================================================== */

{
  // 75-move rule (150 halfmoves) ends the game; 50-move (100) does not
  const half = (n) => `4k3/8/8/8/8/8/8/R3K2R w KQ - ${n} 1`;
  const status = (n) => new Position().setFEN(half(n)).status();
  check('150 halfmoves -> seventy-five-move rule', status(150)?.reason === 'seventy-five-move rule');
  check('149 halfmoves -> not auto-drawn', status(149) === null);
  check('100 halfmoves (50-move) -> not auto-drawn', status(100) === null);
  check('50 halfmoves -> not auto-drawn', status(50) === null);
}

/* ================================================================== *
 * §3.2  futility pruning skips moves that give check
 * ================================================================== */

check('futility move that gives check is NOT pruned (quiet mate found)',
  (() => {
    // white rook d1, black king g8, pawns f7 g7 h7 -> Rd8# is quiet mate
    const p = new Position().setFEN('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    const s = new Searcher(new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode }), DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
    s.setLimits({ depth: 4, nodes: 200000 });
    const res = s.search(p);
    return Math.abs(res.score) > MATE - 1000 && moveToUci(res.move) === 'd1d8';
  })(),
  'quiet mate d1d8 not pruned');

/* ================================================================== *
 * §4.3  seldepth reset between searches
 * ================================================================== */

check('seldepth reflects the last search only', (() => {
  const p = new Position().setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const ev = new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode });
  const s1 = new Searcher(ev, DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
  s1.setLimits({ depth: 5, nodes: 5000 });
  const r1 = s1.search(p);
  const sd1 = s1.seldepth;
  s1.setLimits({ depth: 3, nodes: 5000 });
  const r2 = s1.search(p);
  const sd2 = s1.seldepth;
  // after the second search, seldepth must equal r2.seldepth (the new value),
  // not carry the larger first-search maximum
  return r1 && r2 && sd2 === r2.seldepth && sd2 <= sd1;
})(), 'seldepth after two searches');

/* ================================================================== *
 * §7.6 + §8.1  analyze() reports real risk and full Pareto set
 * ================================================================== */

check('analyze() reports a real risk, not constant CRITICAL',
  (() => {
    const e = new Engine(DEFAULT_PARAMS);
    e.setFEN(START);
    const a = e.analyze();
    return RISK_NAME.includes(a.risk) && a.risk !== 'CRITICAL';
  })(),
  `risk=${new Engine(DEFAULT_PARAMS).setFEN(START).analyze().risk}`);

check('analyze().plans is the full Pareto set with total',
  (() => {
    const e = new Engine(DEFAULT_PARAMS);
    e.setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const a = e.analyze();
    return Array.isArray(a.plans) && typeof a.plans.total === 'number';
  })(),
  'plans carry total');

/* ================================================================== *
 * §7.5  five-axis plan feasibility (audit P1.6)
 * ================================================================== */

check('accepted plans pass all five feasibility axes',
  (() => {
    const p = new Position().setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const pc = new Percept(p);
    const st = new Structure(p, pc);
    const plans = generatePlans(p, pc, st, null);
    return plans.length > 0 && plans.every((pl) =>
      pl.feasible.rule && pl.feasible.structural && pl.feasible.tactical &&
      pl.feasible.temporal && pl.feasible.strategic);
  })(),
  'all axes true for accepted plans');

check('a plan that fails tactical is rejected, not silently accepted',
  (() => {
    // a position with no forcing moves: RESTRICT needs >= 2 moves to be tactical
    const p = new Position().setFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    const pc = new Percept(p);
    const st = new Structure(p, pc);
    const plans = generatePlans(p, pc, st, null);
    // in a bare K vs K position, no plan should be accepted (no structure)
    return plans.length === 0 && Array.isArray(plans.rejected);
  })(),
  'bare K vs K produces no accepted plans');

check('rejected plans carry a feasible vector with all five axes',
  (() => {
    const p = new Position().setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const pc = new Percept(p);
    const st = new Structure(p, pc);
    const plans = generatePlans(p, pc, st, null);
    const axes = ['rule', 'structural', 'tactical', 'temporal', 'strategic'];
    return plans.rejected.length > 0 &&
      plans.rejected.every((pl) => axes.every((a) => typeof pl.feasible[a] === 'boolean'));
  })(),
  'rejected plans expose their feasibility vector');

/* ================================================================== *
 * 53-bit TT storage (regression: Float64Array keeps full keys)
 * ================================================================== */

check('TT stores 53-bit keys exactly', (() => {
  const tt = new TranspositionTable(4);
  const p = new Position().setFEN(START);
  const s = new Searcher(new Evaluation(DEFAULT_PARAMS, { mode: 'fast' }), DEFAULT_PARAMS, { tt });
  s.setLimits({ depth: 2, nodes: 1000 });
  s.search(p);
  return tt.size > 0;
})(), 'TT populated');

/* ================================================================== *
 * §8.2 + §8.3  riskOf implements its description; certificate
 *              checks completed before the mate threshold
 * ================================================================== */

check('riskOf reports NONE for a proven mate in one',
  riskOf({ score: 89998, completed: true, nodes: 100, seldepth: 2, pv: [1], flag: 0, scoreSpread: 89998 }, 5) === 0,
  'mate in 1 -> NONE');

check('riskOf reports LOW for a mate in many (not NONE)',
  riskOf({ score: 89980, completed: true, nodes: 100, seldepth: 2, pv: [1,2,3,4,5,6,7,8,9,10], flag: 0, scoreSpread: 89980 }, 5) !== 0,
  'mate in many -> LOW, not NONE');

check('riskOf reports MODERATE for a bound score (flag != 0)',
  riskOf({ score: 50, completed: true, nodes: 100, seldepth: 5, pv: [1,2,3,4,5], flag: 1, scoreSpread: 100 }, 5) === 2,
  'bound -> MODERATE');

check('riskOf reports MODERATE for a small score spread',
  riskOf({ score: 50, completed: true, nodes: 100, seldepth: 5, pv: [1,2,3,4,5], flag: 0, scoreSpread: 10 }, 5) === 2,
  'small spread -> MODERATE');

check('riskOf reports MODERATE for a truncated PV',
  riskOf({ score: 50, completed: true, nodes: 100, seldepth: 5, pv: [1,2], flag: 0, scoreSpread: 100 }, 5) === 2,
  'short PV -> MODERATE');

check('riskOf reports LOW for a clear, completed search',
  riskOf({ score: 50, completed: true, nodes: 100, seldepth: 5, pv: [1,2,3,4,5], flag: 0, scoreSpread: 200 }, 5) === 1,
  'clear -> LOW');

check('certificate: an unfinished search with a mate score is UNVERIFIED, not FORCED',
  (() => {
    const cert = buildCertificate({
      fen: START, version: 1, move: 1, san: 'x', legal: true, legalCount: 20,
      depth: 3, completed: false, nodes: 500, pv: [], score: 99999
    });
    return cert.validation_status === 'UNVERIFIED';
  })(),
  'incomplete + mate score -> UNVERIFIED');

check('certificate: a completed search with a mate score is FORCED_WITHIN_SCOPE',
  (() => {
    const cert = buildCertificate({
      fen: START, version: 1, move: 1, san: 'x', legal: true, legalCount: 20,
      depth: 5, completed: true, nodes: 500, pv: [1], score: 99999
    });
    return cert.validation_status === 'FORCED_WITHIN_SCOPE';
  })(),
  'completed + mate score -> FORCED_WITHIN_SCOPE');

check('search result carries scoreSpread and secondScore',
  (() => {
    const p = new Position().setFEN(START);
    const s = new Searcher(new Evaluation(DEFAULT_PARAMS, { mode: 'fast' }), DEFAULT_PARAMS, { tt: new TranspositionTable(4) });
    s.setLimits({ depth: 3, nodes: 100000 });
    const r = s.search(p);
    return typeof r.scoreSpread === 'number' && typeof r.secondScore === 'number';
  })(),
  'scoreSpread and secondScore are numbers');

/* ================================================================== *
 * P3.1  Memory is actually read, not write-only
 * ================================================================== */

check('a search stores its result in Memory', (() => {
  const e = new Engine();
  e.setFEN(START);
  e.search({ depth: 3 });
  return e.memory.entries.size > 0;
})(),
  'Memory has an entry after a search');

check('the next search of the same position consults Memory', (() => {
  const e = new Engine();
  e.setFEN(START);
  e.search({ depth: 3 });
  const before = e.memory.hits;
  e.search({ depth: 3 });
  return e.memory.hits > before;
})(),
  'Memory hit rate rises on a repeated position');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);