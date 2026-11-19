/**
 * SUBIT-CHESS v3.0.0 — self-play evaluation and parameter search
 *
 * Spec basis:
 *   docs/theory/07_SELF_PLAY_AND_EVALUATION  (champion / challenger, ΔS = S(N) − S(C))
 *   docs/theory/08_EVALUATION_UNCERTAINTY
 *   docs/theory/05_SUBIT_SEARCH_ARCHITECTURE §17 (the searcher must be able to
 *   answer "which of two evaluations is better", not only "how good is this")
 *
 * NOTE (v3.0.9): hillClimb() below accepts a change on the same comparison that selected it (no independent
 * confirmation, no journal, no rollback), which SCMF §15.4 forbids. Use evolve() in evolve.mjs for any
 * parameter change that is meant to be kept.
 *
 * The protocol is deliberately minimal and honest:
 *   - every game is played by the *same* engine code with different parameters;
 *   - the score is a deterministic function of the seed, so a result is
 *     reproducible and a difference can be attributed to the parameters;
 *   - acceptance is a plain sign test on the mean score, with the standard
 *     error reported next to it, so a "win" cannot be claimed on noise.
 */

import { Position } from './core.mjs';
import { Engine } from './index.mjs';
import { cloneParams, DEFAULT_PARAMS } from './evaluate.mjs';

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
 * Play one game. `white` and `black` are parameter sets (the same engine code).
 * Returns { result, plies, line, termination, score }.
 * `score` is from White's point of view in centipawns-ish units:
 * win = +1, draw = 0, loss = −1 (the sign test works on this).
 */
export function playGame(whiteParams, blackParams, opts = {}) {
  const maxPlies = opts.maxPlies || 120;
  const depth = opts.depth || 3;
  void opts.seed;   // kept in the signature: the game is already deterministic

  const white = new Engine(whiteParams, { ttBits: 16, usePlans: false, useMeta: false });
  const black = new Engine(blackParams, { ttBits: 16, usePlans: false, useMeta: false });

  white.setFEN(Position.start().fen());
  black.pos.setFEN(white.fen);

  const line = [];
  let termination = 'max plies';
  let result = RESULT.DRAW;

  for (let ply = 0; ply < maxPlies; ply++) {
    const mover = (ply % 2 === 0) ? white : black;
    const r = mover.search({ depth });
    if (!r.move) { termination = 'no legal move'; break; }
    line.push(r.uci);
    mover.play(r.uci);
    // keep both engines on the same position
    const fen = mover.fen;
    const other = (ply % 2 === 0) ? black : white;
    if (other.fen !== fen) other.setFEN(fen);

    const st = mover.pos.status();
    if (st && st.over) {
      termination = st.reason || st.result;
      result = st.result === 'win' ? (ply % 2 === 0 ? RESULT.WHITE : RESULT.BLACK)
        : st.result === 'draw' ? RESULT.DRAW
          : (ply % 2 === 0 ? RESULT.BLACK : RESULT.WHITE);
      break;
    }
  }

  return { result, plies: line.length, line, termination, fen: white.fen };
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

/**
 * ΔS = S(N) − S(C): play `games` games with alternating colours and return the
 * challenger's mean score with its standard error.
 */
export function compare(championParams, challengerParams, opts = {}) {
  const games = opts.games || 10;
  const baseSeed = opts.seed || 1;
  const depth = opts.depth || 3;
  const out = [];
  for (let i = 0; i < games; i++) {
    const challengerIsWhite = i % 2 === 0;
    const w = challengerIsWhite ? challengerParams : championParams;
    const b = challengerIsWhite ? championParams : challengerParams;
    const g = playGame(w, b, { depth, seed: baseSeed + i * 7919, maxPlies: opts.maxPlies });
    // normalise to the challenger's point of view
    out.push({ ...g, result: challengerIsWhite ? g.result : -g.result });
  }
  const s = summarize(out);
  const dS = s.mean;
  return {
    dS,
    se: s.se,
    games: out,
    summary: s,
    significant: Math.abs(dS) > 2 * (s.se || 1e-9),
    verdict: dS > 0 ? (Math.abs(dS) > 2 * (s.se || 1e-9) ? 'accept' : 'inconclusive')
      : (Math.abs(dS) > 2 * (s.se || 1e-9) ? 'reject' : 'inconclusive')
  };
}

/**
 * Hill climbing over a small parameter subset.
 * Each step perturbs one knob, accepts only a *significant* improvement, and
 * keeps the best parameters. Deterministic given the seed.
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
  return { params: best, score: bestScore, log };
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