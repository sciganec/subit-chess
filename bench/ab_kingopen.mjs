import { compare } from '../src/engine/learn.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const base = cloneParams(DEFAULT_PARAMS);
const chal = cloneParams(DEFAULT_PARAMS);
chal.eval.kingOpenFile = 12;
const r = compare(base, chal, { games: 32, depth: 4, seed: 1, maxPlies: 120, startPlies: 4 });
console.log(JSON.stringify({ dS: r.dS, se: r.se, verdict: r.verdict, summary: r.summary, balance: r.colorBalance }, null, 2));
