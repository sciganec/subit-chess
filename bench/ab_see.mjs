import { compare } from '../src/engine/learn.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
const base = cloneParams(DEFAULT_PARAMS);
base.search.see = { enabled: false, qsearchPrune: false };
const chal = cloneParams(DEFAULT_PARAMS); // SEE on
const r = compare(base, chal, { games: 16, depth: 4, seed: 2, maxPlies: 120, startPlies: 4 });
console.log(JSON.stringify({dS:r.dS,se:r.se,verdict:r.verdict,summary:r.summary,balance:r.colorBalance}));
