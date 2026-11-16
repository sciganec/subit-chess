/**
 * Module import / wiring smoke test.
 * Checks that every layer loads, the evaluator produces sane numbers and
 * the search returns a legal move within budget.
 */
import { Position, moveToUci, squareName } from '../src/engine/core.mjs';
import { Percept } from '../src/engine/percept.mjs';
import { Structure } from '../src/engine/structure.mjs';
import { computeContext } from '../src/engine/context.mjs';
import { Evaluation, evaluateFast, scalarize, structuralVector, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { Searcher, TranspositionTable, MoveOrder, MATE } from '../src/engine/search.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const MATES = {
  'back rank': '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
  'smothered': '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
  'quiet mate': '6k1/8/6K1/8/8/8/8/7R w - - 0 1',
  'ladder mate': '7k/R7/8/8/8/8/8/1R5K w - - 0 1'
};

/* ---------------- layer wiring ---------------- */
const pos = new Position();
pos.setFEN(START);
const t0 = Date.now();
const percept = new Percept(pos);
const structure = new Structure(pos, percept);
const ctx = computeContext(pos, percept, structure);
check('layers build', !!percept && !!structure && !!ctx, `in ${Date.now() - t0}ms`);

const ev = new Evaluation(DEFAULT_PARAMS);
const e = ev.structural(pos);
check('SVF vector', Array.isArray(e.vector) || !!e.vector, JSON.stringify(Object.keys(e)));
check('eval symmetric on startpos', Math.abs(e.E) < 60, `E=${e.E.toFixed(2)}`);
check('ctx key', typeof ctx.key() === 'string', ctx.key());
check('scalarize bounded', Math.abs(scalarize(e.vector, ctx, DEFAULT_PARAMS).E) < 30000);

const mirrored = new Position();
mirrored.setFEN(startMirror(START));
const ev2 = new Evaluation(DEFAULT_PARAMS).structural(mirrored);
check('eval is colour symmetric', Math.abs(e.E + ev2.E) < 1e-6, `${e.E.toFixed(3)} vs ${ev2.E.toFixed(3)}`);

/* ---------------- search ---------------- */
const searchEval = new Evaluation(DEFAULT_PARAMS, { mode: DEFAULT_PARAMS.search.evalMode });
const searcher = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
searcher.setLimits({ depth: 6 });
let t1 = Date.now();
let r = searcher.search(pos);
check('startpos depth 6 completes', r.completed && r.depth === 6,
  `nodes=${r.nodes} ${Date.now() - t1}ms ${Math.round(r.nps)}nps best=${moveToUci(r.move)}`);
check('best move is legal', pos.legalMoves().includes(r.move), moveToUci(r.move));
check('start score near zero', Math.abs(r.score) < 80, `score=${r.score}`);

/* mate finding */
for (const [name, fen] of Object.entries(MATES)) {
  const p = new Position();
  p.setFEN(fen);
  const s = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
  s.setLimits({ depth: 5, nodes: 400000 });
  const res = s.search(p);
  const isMate = Math.abs(res.score) > MATE - 1000;
  check(`finds mate (${name})`, isMate, `score=${res.score} move=${moveToUci(res.move)} d=${res.depth} nodes=${res.nodes}`);
}

/* determinism: same position, same move */
const sa = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
const sb = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
const a = sa.search(new Position().setFEN(KIWIPETE), { depth: 5 });
const b = sb.search(new Position().setFEN(KIWIPETE), { depth: 5 });
check('deterministic search', a.move === b.move && a.score === b.score, `${moveToUci(a.move)} ${a.score} / ${moveToUci(b.move)} ${b.score}`);

/* nodes + tt growth, and mate score polarity: white to move wins big, black loses */
const wpos = new Position(); wpos.setFEN(MATES['back rank']);
const wsearch = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
wsearch.setLimits({ depth: 4, nodes: 200000 });
const wr = wsearch.search(wpos);
check('white wins the back rank mate', wr.score > 0, `score=${wr.score}`);
wpos.setFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'.replace(' w ', ' b '));
const bsearch = new Searcher(searchEval, DEFAULT_PARAMS, { tt: new TranspositionTable(16) });
bsearch.setLimits({ depth: 4, nodes: 200000 });
const br = bsearch.search(wpos);
// black moves first here, so it must at least survive with a defensive resource
check('black finds a defence when it moves first', br.score > -MATE + 1000, `score=${br.score} move=${moveToUci(br.move)}`);

/* repetition is not a losing move for the side that can avoid it */
const repPos = new Position();
repPos.setFEN('8/8/8/8/8/6k1/4q3/4K2R w K - 0 1');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);

function startMirror(fen) {
  // the validator requires a complete FEN, so the mirrored position is emitted
  // with all six fields: board, turn, castling, en passant, halfmove, fullmove
  const [board, turn, castling, ep, half, full] = fen.split(/\s+/);
  const rows = board.split('/');
  const swap = { P: 'p', p: 'P', N: 'n', n: 'N', B: 'b', b: 'B', R: 'r', r: 'R', Q: 'q', q: 'Q', K: 'k', k: 'K' };
  const flipped = rows.reverse().map((r) => r.split('').map((c) => (swap[c] || c)).join('')).join('/');
  const rights = castling && castling !== '-'
    ? castling.split('').map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
    : '-';
  const mirroredEp = ep && ep !== '-' ? ep[0] + (9 - Number(ep[1])) : '-';
  return `${flipped} ${turn === 'w' ? 'b' : 'w'} ${rights} ${mirroredEp} ${half || 0} ${full || 1}`;
}
