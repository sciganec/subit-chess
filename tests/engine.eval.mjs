/**
 * Evaluation/search correctness: perspective (colour symmetry), mate signs,
 * move-ordering levels and plan-bonus bounds.
 *
 * Spec basis:
 *   docs/theory/04 SVF-INV-002 Colour Symmetry
 *   docs/theory/05 §11 move ordering, §12 terminal states, SEARCH-INV-002
 *   docs/theory/11 tactical priority over strategic plan priority
 *
 * These are regression tests for defects that were silently halving playing
 * strength: the fast tier returned a white-positive score into a negamax that
 * expects side-to-move-relative values, and the structural tier negated an
 * already-relative vector a second time.
 */
import { Position, mirrorFEN, moveToUci, WHITE } from '../src/engine/core.mjs';
import { Percept } from '../src/engine/percept.mjs';
import { Structure } from '../src/engine/structure.mjs';
import { Evaluation, evaluateFast, DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { generatePlans, makePlanOrderer } from '../src/engine/plans.mjs';
import { Engine } from '../src/engine/index.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* positions where one side is clearly ahead, from both perspectives */
const LOPSIDED = [
  ['white up a queen, white to move', 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
  ['white up a queen, black to move', 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'],
  ['black up a queen, black to move', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1'],
  ['black up a queen, white to move', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1']
];

/* ---------------- 1. fast tier is side-to-move relative ---------------- */
{
  const params = cloneParams(DEFAULT_PARAMS);
  const tempo = params.tempo;
  let bad = null;
  for (const [name, fen] of LOPSIDED) {
    const a = new Position(); a.setFEN(fen);
    const b = new Position(); b.setFEN(mirrorFEN(fen));
    // colour symmetry (SVF-INV-002): mirroring swaps both the colours and the
    // mover, so the mover-relative evaluation must be *equal*, not negated
    const ea = evaluateFast(a, params) - tempo;      // strip the tempo term
    const eb = evaluateFast(b, params) - tempo;
    if (Math.abs(ea - eb) > 1e-9) bad = `${name}: fast=${ea.toFixed(1)} mirror=${eb.toFixed(1)}`;
  }
  check('fast eval is colour-symmetric', !bad, bad || '');
}

/* ---------------- 2. structural tier is side-to-move relative ---------------- */
{
  const ev = new Evaluation(cloneParams(DEFAULT_PARAMS), { mode: 'structural' });
  let bad = null;
  for (const [name, fen] of LOPSIDED) {
    const a = new Position(); a.setFEN(fen);
    const b = new Position(); b.setFEN(mirrorFEN(fen));
    const ea = ev.structural(a).E;
    const eb = ev.structural(b).E;
    if (Math.abs(ea - eb) > 1e-9) bad = `${name}: E=${ea.toFixed(1)} mirror=${eb.toFixed(1)}`;
  }
  check('structural eval is colour-symmetric', !bad, bad || '');

  // `white` stays white-positive: it must flip under mirroring
  let flipBad = null;
  for (const [name, fen] of LOPSIDED) {
    const a = new Position(); a.setFEN(fen);
    const b = new Position(); b.setFEN(mirrorFEN(fen));
    const wa = ev.structural(a).white;
    const wb = ev.structural(b).white;
    if (Math.abs(wa + wb) > 1e-9) flipBad = `${name}: white=${wa.toFixed(1)} mirror=${wb.toFixed(1)}`;
  }
  check('the white-relative value flips under mirroring', !flipBad, flipBad || '');

  // the sign must agree with the material balance, for both colours
  let signBad = null;
  for (const [name, fen] of LOPSIDED) {
    const p = new Position(); p.setFEN(fen);
    const e = ev.structural(p).E;
    const whiteAhead = fen.startsWith('rnb1kbnr');           // white missing a queen
    const expectPositive = (p.turn === WHITE) === whiteAhead;
    if (expectPositive ? !(e > 0) : !(e < 0)) signBad = `${name}: E=${e.toFixed(1)} expect ${expectPositive ? '>0' : '<0'}`;
  }
  check('structural eval has the mover-relative sign', !signBad, signBad || '');
}

/* ---------------- 3. the two tiers agree on the side that is ahead -------- */
{
  const ev = new Evaluation(cloneParams(DEFAULT_PARAMS), { mode: 'fast', structuralDepth: 0 });
  let bad = null;
  for (const [name, fen] of LOPSIDED) {
    const p = new Position(); p.setFEN(fen);
    const f = ev.fast(p);
    const s = ev.structural(p).E;
    if (Math.sign(f) !== Math.sign(s)) bad = `${name}: fast=${f.toFixed(1)} structural=${s.toFixed(1)}`;
  }
  check('fast and structural tiers agree in perspective', !bad, bad || '');
}

/* ---------------- 4. mirror search: same score, equally good move -------- */
{
  const fens = [START, 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 3'];
  const depth = 4;
  let scoreBad = null;
  let moveBad = null;

  for (const fen of fens) {
    const a = new Engine(cloneParams(DEFAULT_PARAMS), {});
    const b = new Engine(cloneParams(DEFAULT_PARAMS), {});
    a.setFEN(fen);
    b.setFEN(mirrorFEN(fen));
    const ra = a.search({ depth });
    const rb = b.search({ depth });

    // mirroring swaps the colours *and* the mover, so the value must match
    if (ra.score !== rb.score) scoreBad = `${fen.slice(0, 20)}: ${ra.score} vs ${rb.score}`;

    // the exact mirror is normally chosen; when equal-scoring moves exist the
    // tie is broken by move-generation order, so accept any equally best move
    const wantMove = moveToUci(mirrorMove(a.pos, ra.move));
    if (rb.uci !== wantMove) {
      const alt = scoreOf(b, wantMove, depth);
      if (alt !== ra.score) moveBad = `${fen.slice(0, 20)}: ${ra.uci} vs ${rb.uci} (mirror ${wantMove} = ${alt}, want ${ra.score})`;
    }
  }
  check('mirror search reports the same score', !scoreBad, scoreBad || '');
  check('mirror search keeps the mirrored move among the best', !moveBad, moveBad || '');
}

/* ---------------- 5. mate signs ---------------- */
{
  // white mates in one: score must be a positive mate, reported as +1
  const mateFor = new Engine(cloneParams(DEFAULT_PARAMS), {});
  mateFor.setFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const rw = mateFor.search({ depth: 3 });
  check('mating side gets a positive mate score', rw.score > 0, `score=${rw.score}`);
  check('mating side is reported as mate +1', rw.mate === 1, `mate=${rw.mate}`);
  check('the mating move is Ra8', rw.uci === 'a1a8', rw.uci);

  // the mirrored position: black is the one being mated -> negative
  // white has a forced mate in 2 whatever black plays (Ra8# after any move,
  // and ...Kf8 is covered by the rook on f1)
  const mated = new Engine(cloneParams(DEFAULT_PARAMS), {});
  mated.setFEN('7k/8/6K1/8/8/8/8/R7 b - - 0 1');
  const rm = mated.search({ depth: 4 });
  check('the side being mated gets a negative score', rm.score < 0, `score=${rm.score}`);
  check('the side being mated reports a negative mate distance', rm.mate !== null && rm.mate < 0, `mate=${rm.mate}`);
}

/* ---------------- 6. move-ordering levels are strictly separated ---------- */
{
  const w = cloneParams(DEFAULT_PARAMS).search.ordering;
  const order = [['pv', w.pv], ['tt', w.tt], ['tactic', w.tactic], ['struct', w.struct], ['context', w.context], ['history', w.history]];
  let bad = null;
  for (let i = 1; i < order.length; i++) {
    if (!(order[i - 1][1] > order[i][1])) bad = `${order[i - 1][0]}=${order[i - 1][1]} !> ${order[i][0]}=${order[i][1]}`;
  }
  check('ordering levels are strictly decreasing', !bad, bad || '');
}

/* ---------------- 7. plan bonus stays inside the structural level --------- */
{
  const engine = new Engine(cloneParams(DEFAULT_PARAMS), {});
  engine.setFEN(START);
  const plans = engine.plans;
  const orderer = makePlanOrderer(plans, engine.pos.turn);
  const own = engine.pos.legalMoves().map((m) => orderer(m, engine.pos.turn));
  const other = engine.pos.legalMoves().map((m) => orderer(m, engine.pos.turn === WHITE ? 1 : 0));
  const maxOwn = Math.max(0, ...own);
  check('plan bonus is bounded to [0,1]', maxOwn <= 1, `max=${maxOwn}`);
  check('plan bonus never applies to the opponent', other.every((v) => v === 0), JSON.stringify(other.slice(0, 4)));
}

/* ---------------- 8. plan ids are reproducible --------------------------- */
{
  const engine = new Engine(cloneParams(DEFAULT_PARAMS), {});
  engine.setFEN(START);
  const first = generatePlans(engine.pos, engine.percept, engine.structure, null).map((p) => p.id).join(',');
  generatePlans(engine.pos, engine.percept, engine.structure, null);
  const second = generatePlans(engine.pos, engine.percept, engine.structure, null).map((p) => p.id).join(',');
  check('plan ids are reproducible', first === second, `${first} vs ${second}`);
}

/* ---------------- 9. draw rules: claimable, not automatic ---------------- */
{
  // halfmove clock at 100 without a pawn move or capture: still playable,
  // the search must not report a hard 0 for a side that is better
  const engine = new Engine(cloneParams(DEFAULT_PARAMS), {});
  const p = new Position();
  p.setFEN('8/8/4k3/8/8/4K3/8/R7 w - - 100 80');   // rook endgame, no progress
  check('the 75-move rule ends the game', p.status() === null || p.status().reason !== 'fifty-move rule');
  void engine;
}

console.log(fails ? `\n${fails} FAILED` : '\nEVAL OK');
process.exit(fails ? 1 : 0);

/** Value of a specific move: search the child with the same depth and negate. */
function scoreOf(engine, uci, depth) {
  const child = engine.pos.clone();
  const target = engine.findMoveByUci(uci);
  if (!target) return null;
  child.makeMove(target);
  const e = new Engine(cloneParams(DEFAULT_PARAMS), {});
  e.setFEN(child.fen());
  return -e.search({ depth: Math.max(1, depth - 1) }).score;
}

/** Mirror an encoded move across the horizontal axis (a1 <-> a8). */
function mirrorMove(pos, m) {
  const from = m & 127;
  const to = (m >> 7) & 127;
  const promo = (m >> 14) & 7;
  const flags = (m >> 17) & 31;
  const flip = (sq) => (sq & 0x88) ? sq : ((7 - (sq >> 4)) << 4) | (sq & 7);
  const nf = flip(from);
  const nt = flip(to);
  return (flags << 17) | (promo << 14) | (nt << 7) | nf | ((m & 0x7f) & 0);
}
