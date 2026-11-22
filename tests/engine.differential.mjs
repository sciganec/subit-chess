/**
 * SUBIT gradient profile — DOP-01 / DOP-H1 and the potential-field theorem.
 *
 * Spec basis: docs/theory/48-64/48 §3.2-§3.4, §5.4, §9.3, §10, §13.
 *
 * The critical checks are orientation (structural eval is already
 * white-positive, so sigma must be applied exactly once), balance of
 * make/unmake, the zero-circulation identity on a closed positional cycle,
 * and the non-collapse principle V(S1) = V(S2) but Q_diff(S1) != Q_diff(S2).
 */
import { Position, WHITE, pieceColor, mirrorFEN, moveToUci } from '../src/engine/core.mjs';
import { Evaluation } from '../src/engine/evaluate.mjs';
import { verifyMakeUnmake, report } from '../src/engine/verify.mjs';
import {
  GRADIENT_TIERS, whiteValue, gradientProfile, circulation
} from '../src/engine/differential.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const ROOK_FEN = '7k/8/8/8/8/8/8/R6K w - - 0 1';
const CAPTURE_FEN = 'r6k/8/8/8/8/8/8/R6K w - - 0 1';
const BLACK_CAPTURE_FEN = 'k7/8/8/8/8/8/K7/R6q b - - 0 1';
const MATE_FEN = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

/** History-independent, white-positive material count used for theorem tests. */
function materialValue(pos) {
  let sum = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const pc = pos.board[sq];
    if (pc) sum += pieceColor(pc) === WHITE ? 1 : -1;
  }
  return sum;
}

const evaluation = new Evaluation();

/* ---------- formula, determinism, state integrity ---------- */
{
  const pos = new Position();
  pos.setFEN(ROOK_FEN);
  const before = { fen: pos.fen(), key: pos.key, reps: pos.rep.length };
  const p = gradientProfile(pos, { evaluation });
  check('source position is unchanged', pos.fen() === before.fen && pos.key === before.key &&
    pos.rep.length === before.reps);
  const integrity = verifyMakeUnmake(pos);
  check('make/unmake integrity survives the profile traversal', integrity.length === 0, report(integrity));

  const again = gradientProfile(pos, { evaluation });
  check('the profile is deterministic', JSON.stringify(p) === JSON.stringify(again));
  check('sigma is +1 for White and -1 for Black', p.sigma === 1);

  let formulaOk = true;
  for (const rec of p.moves) {
    const child = pos.clone();
    const m = child.legalMoves().find((x) => moveToUci(x) === rec.uci);
    child.pushRep();
    child.makeMove(m);
    const dV = whiteValue(child, evaluation, 'structural') - p.V;
    if (!near(dV, rec.dV) || !near(rec.delta, p.sigma * rec.dV)) formulaOk = false;
  }
  check('every delta equals sigma * (V(child) - V(parent))', formulaOk);
  check('summary statistics are computed from the delta list',
    p.G_max === Math.max(...p.moves.map((m) => m.delta)) &&
    p.G_min === Math.min(...p.moves.map((m) => m.delta)) &&
    near(p.G_mean, p.moves.reduce((a, b) => a + b.delta, 0) / p.moves.length) &&
    p.G_dist.length === p.moves.length &&
    p.G_dist[0] === p.G_min && p.G_dist[p.G_dist.length - 1] === p.G_max);
}

/* ---------- orientation: white-positive field, mover-relative delta ---------- */
{
  const p = gradientProfile(new Position().setFEN(CAPTURE_FEN), { evaluation });
  const capture = p.moves.find((m) => m.uci === 'a1a8');
  check('capturing an undefended rook is the best local gain', !!capture && capture.delta === p.G_max,
    capture ? `dV=${capture.dV.toFixed(1)} delta=${capture.delta.toFixed(1)}` : 'missing a1a8');
  check('a white capture raises the white-positive field', !!capture && capture.dV > 0);

  const b = gradientProfile(new Position().setFEN(BLACK_CAPTURE_FEN), { evaluation });
  const blackCapture = b.moves.find((m) => m.uci === 'h1a1');
  check('sigma is -1 for Black', b.sigma === -1);
  check('a black capture lowers V but gives a positive mover-relative delta',
    !!blackCapture && blackCapture.dV < 0 && blackCapture.delta > 0,
    blackCapture ? `dV=${blackCapture.dV.toFixed(1)} delta=${blackCapture.delta.toFixed(1)}` : 'missing h1a1');
  check('the sign is applied once, not twice', !!blackCapture && near(blackCapture.delta, -blackCapture.dV));
}

/* ---------- colour symmetry of the profile ---------- */
{
  const a = gradientProfile(new Position().setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), { evaluation });
  const m = gradientProfile(new Position().setFEN(mirrorFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')), { evaluation });
  check('mirroring preserves the gradient summary',
    near(a.G_max, m.G_max) && near(a.G_min, m.G_min) && near(a.G_mean, m.G_mean) && near(a.G_var, m.G_var) &&
    a.G_dist.length === m.G_dist.length && a.G_dist.every((v, i) => near(v, m.G_dist[i])),
    `${a.G_max.toFixed(2)} vs ${m.G_max.toFixed(2)}`);
}

/* ---------- both tiers are finite and usable ---------- */
{
  check('the two documented tiers exist', GRADIENT_TIERS.length === 2);
  const pos = new Position().setFEN(CAPTURE_FEN);
  const fast = gradientProfile(pos, { tier: 'fast' });
  const structural = gradientProfile(pos, { tier: 'structural' });
  check('both tiers produce finite profiles',
    [fast, structural].every((p) => Number.isFinite(p.V) && p.moves.length > 0 &&
      p.moves.every((r) => Number.isFinite(r.dV) && Number.isFinite(r.delta))));
}

/* ---------- terminal positions ---------- */
{
  const p = gradientProfile(new Position().setFEN(MATE_FEN), { evaluation });
  check('a terminal position has an empty profile with zero statistics',
    p.moves.length === 0 && p.G_max === 0 && p.G_min === 0 && p.G_mean === 0 && p.G_var === 0 && p.G_dist.length === 0);
}

/* ---------- doc 48 §5.4: zero circulation of a potential field ---------- */
{
  const pos = new Position().setFEN(ROOK_FEN);
  const cycle = ['a1a2', 'h8h7', 'a2a1', 'h7h8'];
  const end = pos.clone();
  for (const uci of cycle) {
    const m = end.legalMoves().find((x) => moveToUci(x) === uci);
    end.pushRep(); end.makeMove(m);
  }
  check('the test line returns to the same board', end.fen().split(' ')[0] === pos.fen().split(' ')[0]);
  const c = circulation(pos, cycle, { value: materialValue });
  check('raw forward deltas telescope to zero on a closed cycle', near(c, 0, 1e-9), `circulation=${c}`);
}

/* ---------- doc 48 §7.5 / DOP-H1: equal V, different profile ---------- */
{
  const a = gradientProfile(new Position().setFEN(CAPTURE_FEN), { value: materialValue });
  const b = gradientProfile(new Position().setFEN('r6k/8/8/8/8/8/8/1R5K w - - 0 1'), { value: materialValue });
  check('the two positions have the same scalar value', a.V === b.V, `${a.V} vs ${b.V}`);
  check('their gradient profiles differ even though V is equal', a.G_max !== b.G_max,
    `G_max ${a.G_max} vs ${b.G_max}`);
}

console.log(fails === 0 ? '\nDIFFERENTIAL OK' : `\nDIFFERENTIAL FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
