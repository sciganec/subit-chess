import { Engine } from '../src/engine/index.mjs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { Searcher } from '../src/engine/search.mjs';
const orig = Searcher.prototype.negamax;
const cases = [
  ['g7','1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20',4],
  ['g5','2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40',4],
  ['g9d6','rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8',6],
];
// monkeypatch: cap reduction to 1
// hard to patch mid-function; instead test by setting minMoveIndex very high? no. Easier to just modify param behavior by subclassing not easy.
// Alternative: patch the source string? no. I'll just temporarily edit search.mjs logic via a simple replace in memory? Not possible.
// I'll do it by creating a custom searcher class copying logic is heavy. Skip - easier to just edit code with a param.
console.log('skip')
