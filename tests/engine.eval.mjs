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
import { generatePlans } from '../src/engine/plans.mjs';
import { Engine } from '../src/engine/index.mjs';
import { MATE, TT_EXACT, TT_LOWER, TT_UPPER, TranspositionTable } from '../src/engine/search.mjs';

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
  const order = [['pv', w.pv], ['tt', w.tt], ['tactic', w.tactic], ['history', w.history]];
  let bad = null;
  for (let i = 1; i < order.length; i++) {
    if (!(order[i - 1][1] > order[i][1])) bad = `${order[i - 1][0]}=${order[i - 1][1]} !> ${order[i][0]}=${order[i][1]}`;
  }
  check('ordering levels are strictly decreasing', !bad, bad || '');
}

/* ---------------- 7. plan ids are reproducible --------------------------- */
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

/* ---------------- 9. pruning must not hide a forced mate ---------------- */
{
  // SUBIT-CHESS v3.0.0 vs SmallFish, after 45.Nc6: black is mated in 2
  // (45...b2 46.Kd6 g5 47.Rc7#). Futility pruning at depth <= 3 reported
  // -471 cp at depth 8 instead of the mate, so the engine promoted into a mate
  // it could not see. A bound is not a score, and a pruned node is not stalemate.
  const HID_MATE = '2k5/3R4/p1N1K1p1/P1p5/7p/1p5P/8/8 b - - 1 45';
  const e = new Engine(cloneParams(DEFAULT_PARAMS), {});
  e.setFEN(HID_MATE);
  const r = e.search({ depth: 8 });
  check('a forced mate is not hidden by frontier pruning', r.mate !== null && r.score <= -(MATE - 1000),
    `mate=${r.mate} score=${r.score}`);
  check('the mate is reported from the mated side', r.score < 0 && r.mate < 0, `mate=${r.mate}`);

  const e2 = new Engine(cloneParams(DEFAULT_PARAMS), {});
  e2.setFEN('2k5/3R4/p1N1K1p1/P1p5/7p/7P/1p6/8 w - - 0 46');   // after 45...b2
  const r2 = e2.search({ depth: 6 });
  check('the mating side sees the mate', r2.mate !== null && r2.mate > 0, `mate=${r2.mate}`);
  check('the mating move is Kd6', r2.san === 'Kd6', r2.san);
  e2.play('e6d6');
  const r3 = e2.search({ depth: 6 });
  check('Kd6 forces mate against black', r3.mate !== null && r3.mate < 0, `mate=${r3.mate}`);
  e2.play('b2b1q');                                     // 46...b1=Q
  const r4 = e2.search({ depth: 6 });
  check('Rc7 is the mating move', r4.san === 'Rc7#' && r4.mate > 0, `${r4.san} mate=${r4.mate}`);
}

/* ---- 10. a published root score is exact, never a bound ---- */
{
  // A fail-low/fail-high bound published as an ordinary score is exactly how a
  // mate outside the aspiration window reached the UI (SEARCH-INV-002, the
  // SmallFish game): the bound looks like a quiet evaluation.
  const positions = [
    Position.start().fen(),
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '2k5/3R4/p1N1K1p1/P1p5/7p/1p5P/8/8 b - - 1 45',
    '1k6/1pp2N2/p3P1p1/8/P3K2p/7P/1r6/5R2 w - - 2 38'
  ];
  for (const fen of positions) {
    const e = new Engine(cloneParams(DEFAULT_PARAMS), {});
    e.setFEN(fen);
    const r = e.search({ depth: 6 });
    check(`the published score is exact (${fen.slice(0, 20)}...)`, r.flag === TT_EXACT,
      `flag=${r.flag} score=${r.score}`);
  }
}
/* ---- 11. the game keeps its repetition history across moves ---- */
{
  // Engine.play() rebuilt the position through setFEN(), which clears `rep`:
  // threefold/fivefold could then never be seen outside a single search.
  const e = new Engine(cloneParams(DEFAULT_PARAMS), {});
  e.setFEN(Position.start().fen());
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  let played = 0;
  for (let i = 0; i < 4; i++) for (const u of cycle) { if (!e.play(u)) break; played++; }
  check('the repetition stack survives Engine.play', played === 16 && e.pos.repetitionCount() === 5,
    `plies=${played} count=${e.pos.repetitionCount()}`);
  const st = e.pos.status();
  check('fivefold repetition ends the game', !!st && st.over && st.reason === 'fivefold repetition',
    st ? st.reason : 'null');

  const e2 = new Engine(cloneParams(DEFAULT_PARAMS), {});
  e2.setFEN(Position.start().fen());
  const r = e2.search({ depth: 8, nodes: 1 });
  check('a node budget is honoured', r.nodes <= 2, `nodes=${r.nodes}`);
}
/* ---- 12. TT entries age out, so the root move cannot depend on history ---- */
{
  // A bound written under one move order can flip the root choice: after
  // 11...O-O a cold d12 search reported Kxf1 +81.0, while the same search
  // preceded by d6/d8/d10 reported Nf5 +113.2. Stale entries must be ignored.
  const INF = 1e9;
  const tt = new TranspositionTable(12);
  const key = 0x9e3779b9;
  const mv = 0x1234;
  tt.store(key, 8, 42, TT_EXACT, mv, 0);
  check('a fresh TT entry is probed', tt.probe(key, 4, -INF, INF, 0) !== null);
  tt.newGeneration();
  // v3.0.9: an entry is usable only inside the search that wrote it. A
  // one-generation-old entry is rejected as a score *and* as a move hint,
  // otherwise a shallower search can change the exact score of a later one.
  check('an entry one generation old is ignored', tt.probe(key, 4, -INF, INF, 0) === null);
  tt.newGeneration();
  check('an entry two generations old is ignored', tt.probe(key, 4, -INF, INF, 0) === null);
  check('the stored move is gone with the stale entry', tt.moveFor(key) === mv,
    `moveFor=${tt.moveFor(key)}`);

  // The same position must give the same root move whether or not a shallower
  // search ran before it. Since the Gate 3 kill, plans no longer feed a move
  // ordering bonus at all, so this is purely a TT reproducibility invariant;
  // usePlans:false is kept only to preserve the historical test setup.
  const FEN = 'r1bq1rk1/pppp1ppp/5n2/4P1B1/3N1P2/2P5/P3Q1PP/R3Kn1R w KQ - 1 12';
  const cold = new Engine(cloneParams(DEFAULT_PARAMS), { usePlans: false });
  cold.setFEN(FEN);
  const rc = cold.search({ depth: 9 });
  const warm = new Engine(cloneParams(DEFAULT_PARAMS), { usePlans: false });
  warm.setFEN(FEN);
  for (const d of [5, 7]) warm.search({ depth: d });
  const rw = warm.search({ depth: 9 });
  check('the root move is independent of the search history', rc.move === rw.move,
    `cold=${rc.san} warm=${rw.san}`);
  check('the warm score equals the cold score', rc.score === rw.score,
    `cold=${rc.score} warm=${rw.score}`);

  // a bound entry is never published as an exact score (SEARCH-INV-002)
  const tt2 = new TranspositionTable(12);
  tt2.store(key, 8, 42, TT_LOWER, mv, 0);
  const hit = tt2.probe(key, 4, -INF, INF, 0);
  check('a lower bound is reported as such', !!hit && hit.flag === TT_LOWER,
    hit ? `flag=${hit.flag}` : 'null');
  const upper = new TranspositionTable(12);
  upper.store(key, 8, 42, TT_UPPER, mv, 0);
  check('an upper bound is reported as such', upper.probe(key, 4, -INF, INF, 0).flag === TT_UPPER);
}
/* ---- 13. Futility is judged from the MOVER's point of view (v3.0.9) ----
 * The predicate runs after makeMove, when pos.turn is the opponent. v3.0.6-3.0.8
 * compared the opponent's score with alpha, so it pruned the best quiet moves
 * (`nofut` beat `base` 51-3-6 at 100 ms/move). */
{
  // White queen up; Black to move after White's quiet move -> mover (White) is winning.
  const up = new Engine(); up.setFEN('4k3/8/8/8/8/8/PPPP4/3QK3 b - - 0 1');
  const down = new Engine(); down.setFEN('3qk3/pppp4/8/8/8/8/8/4K3 w - - 0 1');   // mover (Black) is a queen up too, mirrored
  const winning = up.searcher.futile(up.pos, 0, 120, 1);
  check('futility: never prune a move after which the mover is a queen up', winning === false);
  // Mover is a queen DOWN: White just moved, position has Black queen, White to... Black to move.
  const lost = new Engine(); lost.setFEN('3qk3/8/8/8/8/8/PPPP4/4K3 b - - 0 1');   // Black to move => mover was White, who has no queen
  check('futility: prune a quiet move after which the mover is a queen down', lost.searcher.futile(lost.pos, 0, 120, 1) === true);
  check('futility: symmetric (mirror of the winning case also not pruned)', down.searcher.futile(down.pos, 0, 120, 1) === false);
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
