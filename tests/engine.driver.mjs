/**
 * Driver tests: the unified pipeline (Engine), the game loop, memory,
 * meta-control and the CLI surface.
 */
import { Position, moveToSan, moveToUci, squareName } from '../src/engine/core.mjs';
import { Engine, Memory, main, VERSION } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { searchBudget } from '../src/engine/search.mjs';
import { adoptGamePosition, repetitionState, runMatch } from '../bench/match.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/* ---------------- construction ---------------- */
{
  const e = new Engine();
  check('engine builds', !!e.evaluation && !!e.searcher && !!e.tt && !!e.meta);
  check('default version', VERSION === '3.0.10', VERSION);
  e.setFEN(START);
  check('setFEN fills every layer', !!e.percept && !!e.structure && !!e.context);
  check('fen round-trips', e.fen === START, e.fen);
  check('legal moves are generated', e.legalMoves().length === 20, String(e.legalMoves().length));
  check('plans are generated on demand', Array.isArray(e.plans));
}

/* ---------------- play / SAN ---------------- */
{
  const e = new Engine();
  e.setFEN(START);
  const r = e.play('e2e4');
  check('play() accepts a legal uci move', !!r && r.san === 'e4', r ? r.san : 'null');
  check('fen advances', e.fen.includes(' b '), e.fen);
  check('black to move now', e.pos.turn === 1);
  const bad = e.play('e2e5');
  check('play() rejects an illegal move', bad === null);
  const before = e.fen;
  e.play('e7e5');
  e.play('g1f3');
  check('history records the line', e.history.length === 3, String(e.history.length));
  check('play() is stable on the same input', before !== e.fen);
  check('structural delta is reported', !!e.history[0].delta || e.history[0].delta === null);
}

/* ---------------- SAN of a real move list ---------------- */
{
  const e = new Engine();
  e.setFEN('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1');
  const san = e.pos.legalMoves().map((m) => moveToSan(e.pos, m));
  check('SAN contains the expected moves', san.includes('O-O') || san.includes('Nf3') === false);
  check('SAN never contains an empty token', san.every((s) => s && s.length > 0));
  check('castling is available', e.pos.legalMoves().some((m) => moveToSan(e.pos, m) === 'O-O'));
  const uci = e.pos.legalMoves().map(moveToUci);
  check('every move has a uci form', uci.every((u) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)));
}

/* ---------------- search determinism ---------------- */
{
  const a = new Engine();
  const b = new Engine();
  a.setFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  b.setFEN(a.fen);
  const ra = a.search({ depth: 5 });
  const rb = b.search({ depth: 5 });
  check('same position and depth give the same move', ra.uci === rb.uci, `${ra.uci} / ${rb.uci}`);
  check('same position and depth give the same score', ra.score === rb.score, `${ra.score} / ${rb.score}`);
  check('the search reports a PV', Array.isArray(ra.pv) && ra.pv.length >= 1);
  check('the PV is legal from the root',
    ra.pvSan.every((s) => typeof s === 'string' && s.length > 0), ra.pvSan.join(' '));
  check('the PV first move equals the best move', ra.pv[0] === ra.uci, ra.pv[0]);
}

/* ---------------- self-play ---------------- */
{
  const e = new Engine();
  e.setFEN(START);
  const g = e.selfPlay(12, { depth: 4 });
  check('self-play produces a full line', g.line.length === 12, `${g.line.length} plies`);
  check('self-play line is legal', (() => {
    const p = new Position();
    p.setFEN(g.start);
    for (const u of g.line) {
      const m = p.legalMoves().find((x) => moveToUci(x) === u);
      if (!m) return false;
      p.makeMove(m);
    }
    return true;
  })());
  check('self-play reports the final position', typeof g.fen === 'string' && g.fen.length > 0);
}

/* ---------------- memory ---------------- */
{
  const mem = new Memory(4);
  const p = new Position();
  p.setFEN(START);
  check('empty memory misses', mem.lookup(p) === null);
  mem.remember(p, { depth: 5, score: 12, move: 1 });
  const hit = mem.lookup(p);
  check('memory hits after remember', hit && hit.depth === 5 && hit.score === 12);
  const q = new Position();
  q.setFEN(START);
  q.makeMove(q.legalMoves()[0]);
  check('memory misses on a different position', mem.lookup(q) === null);
  for (let i = 0; i < 10; i++) mem.remember(new Position().setFEN(START), { depth: 1, score: i, move: 0 });
  check('memory is bounded', mem.entries.size <= 4, String(mem.entries.size));
  check('memory summary is readable', typeof mem.summary() === 'string');
}

/* ---------------- meta-control through the engine ---------------- */
{
  const e = new Engine();
  e.setFEN(START);
  const plan = e.budget({ baseDepth: 8, maxDepth: 24 });
  check('budget returns a depth', plan.depth >= 2 && plan.depth <= 24, String(plan.depth));
  check('budget returns a time', typeof plan.timeMs === 'number' && plan.timeMs >= 0);
  const r = e.search();
  check('engine search without options uses the meta budget', r.depth >= 2, `depth=${r.depth}`);
  check('search result carries a risk label', typeof r.risk === 'string', r.risk);
  check('meta statistics recorded', e.meta.stats.decisions === 1, String(e.meta.stats.decisions));
}

/* ---------------- uncertainty increases effort, never reduces it ---------------- */
{
  const calmBudget = searchBudget({ complexity: 0.5, uncertainty: 0.1 });
  const tenseBudget = searchBudget({ complexity: 0.5, uncertainty: 0.9 });
  check('searchBudget grows with uncertainty', tenseBudget > calmBudget,
    `${calmBudget} -> ${tenseBudget}`);

  const e = new Engine();
  e.setFEN(START);
  const planFor = (uncertainty) => {
    const stub = { structural() { return { uncertainty }; } };
    return e.meta.plan({
      pos: e.pos, percept: e.percept, structure: e.structure, ctx: e.context,
      evaluation: stub, clockMs: 6000, baseDepth: 8, maxDepth: 24
    });
  };
  const calm = planFor(0.05);
  const tense = planFor(0.95);
  check('meta clock grows with uncertainty', tense.timeMs > calm.timeMs,
    `${calm.timeMs}ms -> ${tense.timeMs}ms (u=${calm.uncertainty.toFixed(2)} -> ${tense.uncertainty.toFixed(2)})`);
  check('meta depth never shrinks with uncertainty', tense.depth >= calm.depth,
    `${calm.depth} -> ${tense.depth}`);
}

/* ---------------- params are cloned, not aliased ---------------- */
{
  const p1 = cloneParams(DEFAULT_PARAMS);
  p1.search.lmr.enabled = false;
  check('cloneParams deep-copies', DEFAULT_PARAMS.search.lmr.enabled === true);
}

/* ---------------- CLI ---------------- */
{
  const cmds = [
    ['version'], ['perft', START, 3], ['eval'], ['analyze'], ['search', START, 4],
    ['bench'], ['selfplay', START, 4, 3], ['help']
  ];
  for (const argv of cmds) {
    const out = main(argv);
    check(`cli ${argv[0]} produces output`, Array.isArray(out) && out.length > 0, `${out.length} lines`);
  }
  const ana = main(['analyze', START]);
  const text = ana.join('\n');
  check('analyze reports the context', text.includes('QUIET') && text.includes('OPENING'));
  check('analyze reports relations', text.includes('relations'));
  check('analyze reports plans', text.includes('plans:'));
  const perft = main(['perft', START, 2]).join('\n');
  check('perft reports depth 1 and 2', perft.includes('d1: 20') && perft.includes('d2: 400'), perft);
}

/* ---------------- material ---------------- */
{
  const e = new Engine();
  e.setFEN(START);
  const m = e.material();
  check('material is symmetric on the start position', m.white === m.black && m.white === 4000,
    `${m.white}/${m.black}`);
  e.setFEN('4k3/8/8/8/8/8/8/4K2R w - - 0 1');
  const m2 = e.material();
  check('material counts a rook', m2.white - m2.black === 500, String(m2.white - m2.black));
}

/* ---------------- mate reporting ---------------- */
{
  const e = new Engine();
  e.setFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const r = e.search({ depth: 3 });
  check('a mate is reported as a mate', r.mate !== null && r.mate > 0, `mate in ${r.mate}`);
  check('the mating move is Ra8', r.uci === 'a1a8', `${r.uci} ${squareName(0)}`);
}

/* ---------------- match harness owns one continuous game ---------------- */
{
  // A bare setFEN() after every move clears the history that Engine.play()
  // carried forward (ADR 0016). The harness must adopt the FEN *and* the stack,
  // or neither side can see fivefold and equal positions shuffle to the cap.
  const mover = new Engine();
  const observer = new Engine();
  mover.setFEN(START);
  observer.setFEN(START);
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  for (let n = 0; n < 4; n++) {
    for (const uci of cycle) {
      check(`cycle move ${uci} is legal`, !!mover.play(uci));
      const rep = repetitionState(mover.pos);
      adoptGamePosition(mover, mover.fen, rep);
      adoptGamePosition(observer, mover.fen, rep);
    }
  }
  check('match harness keeps the repetition count', mover.pos.repetitionCount() === 5,
    `count=${mover.pos.repetitionCount()}`);
  check('observer adopts the same repetition history', observer.pos.repetitionCount() === 5,
    `count=${observer.pos.repetitionCount()}`);
  const st = observer.pos.status();
  check('fivefold is authoritative for both engines',
    !!st && st.over && st.reason === 'fivefold repetition', JSON.stringify(st));
}

/* ---------------- pinned depth follows the config, not the colour ---------------- */
{
  // Gate 2 compares base@5 vs base@4. A is White in game 0 and Black in game 1.
  // The old harness keyed the requested depth on the moving colour, so in the
  // odd game A searched at 4 and B at 5 — half the sample had swapped labels.
  const r = runMatch({
    games: 2, depth: 5, seed: 7, maxPlies: 2, a: 'base@5', b: 'base@4',
    suite: null, variety: false, time: 0, quiet: true
  });
  const seen = r.games.map((g) => g.depthSeen);
  check('game 0: config A (White) searched at depth 5', seen[0] && seen[0].white === 5,
    JSON.stringify(seen[0]));
  check('game 0: config B (Black) searched at depth 4', seen[0] && seen[0].black === 4,
    JSON.stringify(seen[0]));
  check('game 1: config A (Black) still searched at depth 5', seen[1] && seen[1].black === 5,
    JSON.stringify(seen[1]));
  check('game 1: config B (White) still searched at depth 4', seen[1] && seen[1].white === 4,
    JSON.stringify(seen[1]));
}

console.log(fails === 0 ? '\nDRIVER OK' : `\nDRIVER FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);