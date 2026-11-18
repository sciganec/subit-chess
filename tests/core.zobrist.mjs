/**
 * Zobrist key quality (regression for the v3.0.8 defect) and evaluation-cache exactness.
 * v3.0.8 built hi and lo from consecutive xorshift32 outputs; xorshift is GF(2)-linear, so the 64 bits of every
 * key had rank 32 and the "53-bit" key behaved as a 32-bit one.
 */
import { ZOBRIST } from '../src/engine/core.mjs';
import { Engine } from '../src/engine/index.mjs';
import { evaluateFast } from '../src/engine/evaluate.mjs';

let fails = 0;
const check = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

// rank over GF(2) of the (lo,hi) 64-bit vectors of 600 table entries
const rows = [];
for (let i = 0; i < 600; i++) rows.push([ZOBRIST.flatLo[i * 3 % 2048] >>> 0, ZOBRIST.flatHi[i * 3 % 2048] >>> 0]);
function rank(vs) {                       // vs: array of [lo, hi] as 64-bit via BigInt
  const basis = new Map(); let r = 0;
  for (const [lo, hi] of vs) {
    let v = (BigInt(hi) << 32n) | BigInt(lo);
    while (v) {
      const top = v.toString(2).length;
      if (basis.has(top)) v ^= basis.get(top); else { basis.set(top, v); r++; break; }
    }
  }
  return r;
}
const rk = rank(rows);
check('lo and hi are independent: GF(2) rank of 600 key entries is 64 (was 32)', rk === 64, `rank=${rk}`);

// no two distinct positions share a key in a depth-6 search (>200k distinct positions)
{
  const e = new Engine(undefined, { ttBits: 18, evalCacheBits: 0, adaptiveTime: false, usePlans: false });
  const m = new Map(); let conf = 0;
  const orig = e.evaluation.evaluate.bind(e.evaluation);
  e.evaluation.evaluate = (pos, d) => {
    const f = pos.fen().split(' ').slice(0, 4).join(' ');
    const o = m.get(pos.key);
    if (o === undefined) m.set(pos.key, f); else if (o !== f) conf++;
    return orig(pos, d);
  };
  e.setFEN('2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16');
  e.search({ depth: 6 });
  check('no key collision between distinct positions in a depth-6 search', conf === 0, `${m.size} keys, ${conf} conflicts`);
}

// evaluation cache is exact and does not change the search
{
  const run = (bits) => {
    const e = new Engine(undefined, { ttBits: 18, evalCacheBits: bits, adaptiveTime: false, usePlans: false });
    e.setFEN('r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 8');
    const r = e.search({ depth: 6 });
    return { s: [r.uci, Math.round(r.score), r.nodes].join('/'), e };
  };
  const a = run(0), b = run(17);
  check('eval cache on/off: identical move, score and node count', a.s === b.s, `${a.s} vs ${b.s}`);
  check('eval cache gets hits', b.e.evaluation.evalHits > 0, `hit rate ${(100 * b.e.evaluation.evalHits / b.e.evaluation.evalProbes).toFixed(1)}%`);
}
console.log(fails === 0 ? '\nZOBRIST OK' : `\nZOBRIST FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
