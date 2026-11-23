import { compare } from '../src/engine/learn.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const base = cloneParams(DEFAULT_PARAMS);
const chal = cloneParams(DEFAULT_PARAMS);
chal.search.lmr.minDepth = 4; // disable LMR at depth<4
const r = compare(base, chal, { games: 24, depth: 5, seed: 11, maxPlies: 120, startPlies: 4 });
console.log(JSON.stringify({dS:r.dS,se:r.se,verdict:r.verdict,summary:r.summary,balance:r.colorBalance}));
