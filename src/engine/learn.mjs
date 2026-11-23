/**
 * SUBIT-CHESS v3.0.0 — self-play evaluation and parameter search
 *
 * Spec basis:
 *   docs/theory/07_SELF_PLAY_AND_EVALUATION  (champion / challenger, ΔS = S(N) − S(C))
 *   docs/theory/08_EVALUATION_UNCERTAINTY
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §17 (the searcher must be able to
 *   answer "which of two evaluations is better", not only "how good is this")
 *
 * The protocol is deliberately minimal and honest:
 *   - every game is played by the *same* engine code with different parameters;
 *   - the seed selects a legal start position and is reported with each game,
 *     so games are distinct observations and a result is reproducible;
 *   - colours alternate, so the challenger is tested as White and as Black;
 *   - acceptance uses only the tuning games; an optional validation sample is
 *     drawn from a disjoint seed range and is reported, never fed back;
 *   - the mean score is reported with its standard error and full W/D/L, so a
 *     "win" cannot be claimed on noise.
 */

import { Position } from './core.mjs';
import { Engine } from './index.mjs';
import { cloneParams, DEFAULT_PARAMS } from './evaluate.mjs';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const TUNING_SEED_STEP = 7919;
const VALIDATION_SEED_STEP = 104729;
const VALIDATION_SEED_SALT = 0x9e3779b9;
const HILLCLIMB_VALIDATION_SALT = 0x85ebca6b;

/** Deterministic PRNG (mulberry32) — results must not depend on Math.random. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RESULT = { WHITE: 1, DRAW: 0, BLACK: -1 };

/**
 * A legal, reproducible start position for one seeded observation. A few
 * random plies from the standard start keep material balanced while breaking
 * the "all games are the same trajectory" problem (AUD-309-04). The bootstrap
 * history is not part of the game — `setFEN()` resets it when play starts.
 */
export function makeStartFEN(seed, plies = 4) {
  const rng = makeRng(seed);
  const pos = new Position().setFEN(START_FEN);
  const n = Math.max(0, Math.floor(plies));
  for (let i = 0; i < n; i++) {
    const moves = pos.legalMoves();
    if (!moves.length) break;
    const m = moves[Math.floor(rng() * moves.length) % moves.length];
    pos.makeMove(m);
  }
  return pos.fen();
}

/**
 * Colour pairing for game `gameIndex`: the challenger is White in even games
 * and Black in odd games (AUD-309-03). Both branches are explicit so the
 * assignment cannot silently collapse to champion vs champion.
 */
export function pairColors(championParams, challengerParams, gameIndex) {
  const challengerIsWhite = gameIndex % 2 === 0;
  return {
    white: challengerIsWhite ? challengerParams : championParams,
    black: challengerIsWhite ? championParams : challengerParams,
    challengerIsWhite
  };
}

/**
 * Play one game. `white` and `black` are parameter sets (the same engine code).
 * Returns { result, plies, line, termination, score }.
 * `score` is from White's point of view in centipawns-ish units:
 * win = +1, draw = 0, loss = −1 (the sign test works on this).
 */
export function playGame(whiteParams, blackParams, opts = {}) {
  const maxPlies = opts.maxPlies || 120;
  const depth = opts.depth || 3;
  const startFen = opts.startFen ||
    (opts.seed === undefined ? START_FEN : makeStartFEN(opts.seed, opts.startPlies ?? 4));

  const white = new Engine(whiteParams, { ttBits: 16, usePlans: false, useMeta: false });
  const black = new Engine(blackParams, { ttBits: 16, usePlans: false, useMeta: false });

  white.setFEN(startFen);
  black.setFEN(startFen);

  const line = [];
  let termination = 'max plies';
  let result = RESULT.DRAW;

  for (let ply = 0; ply < maxPlies; ply++) {
    const mover = (ply % 2 === 0) ? white : black;
    const r = mover.search({ depth });
    if (!r.move) {
      const st = mover.pos.status();
      if (st && st.over) {
        termination = st.reason || 'no legal move';
        result = st.result === 'white' ? RESULT.WHITE : st.result === 'black' ? RESULT.BLACK : RESULT.DRAW;
      } else {
        termination = 'no legal move';
      }
      break;
    }
    line.push(r.uci);
    mover.play(r.uci);
    // keep both engines on the same position and game history (ADR 0016):
    // bare setFEN() wipes rep, breaking repetition detection in self-play.
    const fen = mover.fen;
    const rep = { rep: mover.pos.rep.slice(), repHi: mover.pos.repHi.slice(), repLimit: mover.pos.repLimit };
    const other = (ply % 2 === 0) ? black : white;
    other.setFEN(fen);
    other.pos.rep = rep.rep.slice();
    other.pos.repHi = rep.repHi.slice();
    other.pos.repLimit = rep.repLimit;

    const st = mover.pos.status();
    if (st && st.over) {
      termination = st.reason || st.result;
      result = st.result === 'white' ? RESULT.WHITE : st.result === 'black' ? RESULT.BLACK : RESULT.DRAW;
      break;
    }
  }

  return {
    result, plies: line.length, line, termination, fen: white.fen,
    seed: opts.seed ?? null, startFen
  };
}

/** Mean score and standard error over a set of games. */
export function summarize(games) {
  const n = games.length;
  if (n === 0) return { n: 0, mean: 0, se: 0, wins: 0, draws: 0, losses: 0 };
  let sum = 0, wins = 0, draws = 0, losses = 0;
  let sq = 0;
  for (const g of games) {
    sum += g.result;
    sq += g.result * g.result;
    if (g.result > 0) wins++; else if (g.result < 0) losses++; else draws++;
  }
  const mean = sum / n;
  const variance = Math.max(0, sq / n - mean * mean);
  return { n, mean, se: Math.sqrt(variance / n), wins, draws, losses };
}

function playSeries(championParams, challengerParams, {
  games, seed, step, series, depth, maxPlies, startPlies
}) {
  const out = [];
  for (let i = 0; i < games; i++) {
    const pair = pairColors(championParams, challengerParams, i);
    const g = playGame(pair.white, pair.black, {
      depth, seed: (seed + i * step) >>> 0, maxPlies, startPlies
    });
    // normalise to the challenger's point of view
    out.push({
      ...g,
      challengerColor: pair.challengerIsWhite ? 'w' : 'b',
      series,
      result: pair.challengerIsWhite ? g.result : -g.result
    });
  }
  return out;
}

/**
 * ΔS = S(N) − S(C): play `games` independent, colour-balanced observations and
 * return the challenger's mean score with its standard error and full W/D/L.
 * With `validationGames > 0` a second sample is drawn from a disjoint seed
 * range; it is reported but never used for `significant` or `verdict`, so a
 * tuning decision cannot leak into the validation estimate.
 */
export function compare(championParams, challengerParams, opts = {}) {
  const games = opts.games || 10;
  const validationGames = Math.max(0, opts.validationGames || 0);
  const baseSeed = opts.seed || 1;
  const depth = opts.depth || 3;
  const tuningSeed = baseSeed >>> 0;
  const validationSeed = (baseSeed + VALIDATION_SEED_SALT) >>> 0;
  const common = { depth, maxPlies: opts.maxPlies, startPlies: opts.startPlies };

  const out = playSeries(championParams, challengerParams, {
    ...common, games, seed: tuningSeed, step: TUNING_SEED_STEP, series: 'tuning'
  });
  const s = summarize(out);
  const dS = s.mean;
  const significant = Math.abs(dS) > 2 * (s.se || 1e-9);

  let validation = null;
  let split = null;
  if (validationGames > 0) {
    const valGames = playSeries(championParams, challengerParams, {
      ...common, games: validationGames, seed: validationSeed,
      step: VALIDATION_SEED_STEP, series: 'validation'
    });
    validation = summarize(valGames);
    const tuningStarts = new Set(out.map((g) => g.startFen));
    const overlap = valGames.filter((g) => tuningStarts.has(g.startFen)).length;
    split = {
      tuningSeed, validationSeed,
      tuningStarts: tuningStarts.size,
      validationStarts: new Set(valGames.map((g) => g.startFen)).size,
      overlap,
      leaked: overlap > 0
    };
  }

  return {
    dS,
    se: s.se,
    games: out,
    summary: s,
    validation,
    split,
    colorBalance: {
      challengerWhite: out.filter((g) => g.challengerColor === 'w').length,
      challengerBlack: out.filter((g) => g.challengerColor === 'b').length
    },
    significant,
    verdict: dS > 0 ? (significant ? 'accept' : 'inconclusive')
      : (significant ? 'reject' : 'inconclusive')
  };
}

/**
 * Hill climbing over a small parameter subset.
 * Each step perturbs one knob, accepts only a *significant* improvement, and
 * keeps the best parameters. Deterministic given the seed. When requested, a
 * final comparison against the original parameters is reported as
 * `validation`; it is never used to accept a step.
 */
export function hillClimb(baseParams, opts = {}) {
  const steps = opts.steps || 6;
  const games = opts.games || 8;
  const depth = opts.depth || 3;
  const seed = opts.seed || 1;
  const rng = makeRng(seed);
  const knobs = opts.knobs || ['material:P', 'material:N', 'material:B', 'material:R', 'material:Q',
    'tempo', 'bishopPair', 'w:T', 's:T', 'search.futility.margin'];

  let best = cloneParams(baseParams);
  let bestScore = 0;
  const log = [];

  for (let s = 0; s < steps; s++) {
    const candidate = cloneParams(best);
    const knob = knobs[Math.floor(rng() * knobs.length) % knobs.length];
    const dir = rng() < 0.5 ? -1 : 1;
    const scale = 0.04 + rng() * 0.08;
    setKnob(candidate, knob, scale * dir);

    const r = compare(best, candidate, { games, depth, seed: seed + s * 104729 });
    log.push({ step: s, knob, dS: r.dS, se: r.se, verdict: r.verdict });
    if (r.dS > 0 && r.significant) {
      best = candidate;
      bestScore = r.dS;
    }
  }
  const validation = opts.validationGames
    ? compare(baseParams, best, {
      games: opts.validationGames, depth, seed: (seed + HILLCLIMB_VALIDATION_SALT) >>> 0,
      maxPlies: opts.maxPlies, startPlies: opts.startPlies
    })
    : null;
  return { params: best, score: bestScore, log, validation };
}

function setKnob(params, path, delta) {
  const parts = path.split('.');
  let obj = params;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  const key = parts[parts.length - 1];
  const cur = obj[key];
  if (typeof cur === 'number') {
    obj[key] = Math.round(cur * (1 + delta) * 100) / 100;
    if (obj[key] === cur) obj[key] = Math.round((cur + (delta > 0 ? 1 : -1)) * 100) / 100;
  }
}

/** Round-trip check that a parameter set is still loadable by the engine. */
export function paramsAreUsable(params) {
  try {
    const e = new Engine(params);
    e.setFEN(Position.start().fen());
    const r = e.search({ depth: 2 });
    return !!r.move;
  } catch {
    return false;
  }
}

export { DEFAULT_PARAMS };