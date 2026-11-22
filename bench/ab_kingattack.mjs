import { compare } from '../src/engine/learn.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const base = cloneParams(DEFAULT_PARAMS); base.eval.kingAttack = 0;
const chal = cloneParams(DEFAULT_PARAMS); chal.eval.kingAttack = 8;
const r = compare(base, chal, { games: 16, depth: 4, seed: 3, maxPlies: 120, startPlies: 4 });
console.log(JSON.stringify({dS:r.dS,se:r.se,verdict:r.verdict,summary:r.summary,balance:r.colorBalance}));
