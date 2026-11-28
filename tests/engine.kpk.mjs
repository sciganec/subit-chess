// KPK bitbase (src/engine/kpk.mjs): file-mirror symmetry, agreement with the core's own legal-move rules
// on a deterministic sample (the full 331k-position check lives in the A/B notes), known theory, eval hook.
import { Position, QUEEN, FLAG_CAPTURE, MOVE_FLAGS, MOVE_PROMO } from '../src/engine/core.mjs';
import { kpkWins } from '../src/engine/kpk.mjs';
import { evaluateFast, DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const mir = (s) => (s & 56) | (7 - (s & 7));

let asym = 0;
for (let stm = 0; stm < 2; stm++) for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk += 3) for (let p = 8; p < 56; p++)
  if (kpkWins(wk, bk, p, stm) !== kpkWins(mir(wk), mir(bk), mir(p), stm)) asym++;
ok(asym === 0, 'bitbase is symmetric under the file mirror');

const sq = (n) => (n.charCodeAt(0) - 97) + 8 * (n.charCodeAt(1) - 49);
for (const [wk, bk, p, stm, exp, why] of [
  ['e6', 'e8', 'e5', 0, true, 'Ke6 Pe5 vs Ke8 wins'],
  ['d5', 'd7', 'd4', 0, false, 'opposition: Kd5 Pd4 vs Kd7, white to move, draws'],
  ['d5', 'd7', 'd4', 1, true, 'same, black to move, wins'],
  ['b6', 'b8', 'a5', 1, false, 'rook pawn with the defender on b8 draws'],
]) ok(kpkWins(sq(wk), sq(bk), sq(p), stm) === exp, why);

// agreement with the core's rules on a deterministic sample of legal placements
const fenOf = (wk, bk, p, stm) => {
  const b = Array(64).fill('1'); b[wk] = 'K'; b[bk] = 'k'; b[p] = 'P'; let f = '';
  for (let r = 7; r >= 0; r--) { let row = '', e = 0; for (let x = 0; x < 8; x++) { const c = b[r * 8 + x]; if (c === '1') e++; else { if (e) row += e; e = 0; row += c; } } if (e) row += e; f += row + (r ? '/' : ''); }
  return f + (stm === 0 ? ' w' : ' b') + ' - - 0 1';
};
const fromPos = (pos) => { let wk, bk, p; for (let s = 0; s < 64; s++) { const x = pos.board[((7 - (s >> 3)) << 4) | (s & 7)]; if (!x) continue; const t = x & 7, c = x >> 3; if (t === 6) { if (c === 0) wk = s; else bk = s; } else p = s; } return kpkWins(wk, bk, p, pos.turn); };
let seed = 99; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
let checked = 0, bad = 0;
for (let n = 0; n < 4000; n++) {
  const wk = (rnd() * 64) | 0, bk = (rnd() * 64) | 0, p = 8 + ((rnd() * 48) | 0), stm = rnd() < 0.5 ? 0 : 1;
  if (wk === bk || wk === p || bk === p) continue;
  const pos = new Position(); try { pos.setFEN(fenOf(wk, bk, p, stm)); } catch { continue; }
  if (pos.inCheck(stm ^ 1)) continue;
  const ms = pos.legalMoves(); let exp;
  if (stm === 0) {
    exp = false;
    for (const m of ms) {
      const u = pos.makeMove(m);
      if (MOVE_PROMO(m)) { if (MOVE_PROMO(m) === QUEEN) { const bm = pos.legalMoves(); if (bm.length === 0 ? pos.inCheck() : !bm.some((x) => MOVE_FLAGS(x) & FLAG_CAPTURE)) exp = true; } }
      else if (fromPos(pos)) exp = true;
      pos.unmakeMove(u); if (exp) break;
    }
  } else if (ms.length === 0) exp = pos.inCheck();
  else {
    exp = true;
    for (const m of ms) { if (MOVE_FLAGS(m) & FLAG_CAPTURE) { exp = false; break; } const u = pos.makeMove(m); if (!fromPos(pos)) exp = false; pos.unmakeMove(u); if (!exp) break; }
  }
  checked++; if (kpkWins(wk, bk, p, stm) !== exp) bad++;
}
ok(checked > 1500 && bad === 0, `table agrees with the core's legal moves on ${checked} placements (${bad} mismatches)`);

// eval hook: off by default, exact when on, side-to-move relative, colour-symmetric
const on = cloneParams(DEFAULT_PARAMS); on.eval.kpk = true;
const ev = (fen, params) => { const pp = new Position(); pp.setFEN(fen); return evaluateFast(pp, params); };
ok(DEFAULT_PARAMS.eval.kpk === false, 'kpk is off by default');
ok(ev('3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', on) > 400, 'won KPK is scored as a win');
ok(ev('8/3k4/8/3K4/3P4/8/8/8 w - - 0 1', on) === 0, 'drawn KPK is scored 0');
ok(ev('3k4/8/3K4/3P4/8/8/8/8 b - - 0 1', on) < -400, 'win is seen from the side to move');
ok(ev('8/8/8/8/3p4/3k4/8/3K4 b - - 0 1', on) === ev('3k4/8/3K4/3P4/8/8/8/8 w - - 0 1', on), 'colour-flipped position scores the same for the side to move');
ok(ev('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', DEFAULT_PARAMS) === ev('4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', DEFAULT_PARAMS), 'default eval unchanged');

console.log(`kpk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
