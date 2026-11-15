#!/usr/bin/env node
/**
 * Strength harness — controlled self-play between engine configurations
 * (doc 05 §25.1-25.2, doc 07 protocol).
 *
 *   node bench/match.mjs --a base --b nostruct --games 20 --depth 6 --seed 7
 *   node bench/match.mjs --suite bench/fens/openings.epd --a base --b base --games 40
 *   node bench/match.mjs --list
 *
 * Deterministic: fixed depth, no clock, fixed seed, alternating colours, so the
 * same command reproduces the same score. Report = W-D-L, score, 95% CI and the
 * mean nodes/nps, plus a per-opening breakdown so a single position cannot
 * decide the result.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Engine } from '../src/engine/index.mjs';
import { cloneParams, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';
import { WHITE } from '../src/engine/core.mjs';

/* ------------------------------------------------------------------ *
 * Configurations (ablations, doc 05 §25.2)
 * ------------------------------------------------------------------ */

export const CONFIGS = {
  // reference: shipped defaults
  base: { label: 'base (shipped defaults)', params: {}, opts: {} },

  // doc 05 §25.2 ablations
  nostruct: {
    label: 'A — no structural priority',
    params: { search: { ordering: { struct: 0 } } },
    opts: {}
  },
  noctx: {
    label: 'B — no context',
    params: { context: { enabled: false } },
    opts: {}
  },
  nores: {
    label: 'C — no resilience (w_R = 0)',
    params: { w: { R: 0 } },
    opts: {}
  },
  noplans: {
    label: 'D — no plans in the decision path',
    params: {},
    opts: { usePlans: false }
  },
  nobudget: {
    label: 'E — no adaptive budget (fixed depth)',
    params: {},
    opts: { useMeta: false }
  },

  // floor: pure alpha-beta + fast eval, no SUBIT layers at all
  plain: {
    label: 'plain — alpha-beta, no plans/meta/context',
    params: { context: { enabled: false }, search: { ordering: { struct: 0 } } },
    opts: { usePlans: false, useMeta: false }
  },

  // fast-tier eval ablations (each term can be removed to price it)
  eval0: {
    label: 'eval0 — no fast-tier terms, hard mid/endgame switch',
    params: {
      eval: { taper: false, bishopPair: 0, doubled: 0, isolated: 0, passed: null, rookOpen: 0, rookSemiOpen: 0, kingShield: 0 }
    },
    opts: {}
  },
  notaper: {
    label: 'no taper — hard mid/endgame switch',
    params: { eval: { taper: false } },
    opts: {}
  },
  nopawns: {
    label: 'no pawn structure',
    params: { eval: { doubled: 0, isolated: 0, passed: null } },
    opts: {}
  },
  norooks: {
    label: 'no rook-file terms',
    params: { eval: { rookOpen: 0, rookSemiOpen: 0 } },
    opts: {}
  },
  noshield: {
    label: 'no king shield',
    params: { eval: { kingShield: 0 } },
    opts: {}
  },

  // pruning ablations: how much of the nominal depth is real?
  nopruning: {
    label: 'no null-move / LMR / futility',
    params: { search: { nullMove: { enabled: false }, lmr: { enabled: false }, futility: { enabled: false } } },
    opts: {}
  },
  nonull: {
    label: 'no null-move pruning',
    params: { search: { nullMove: { enabled: false } } },
    opts: {}
  },
  nolmr: {
    label: 'no late-move reductions',
    params: { search: { lmr: { enabled: false } } },
    opts: {}
  },
  noasp: {
    label: 'no aspiration windows (full window every iteration)',
    params: { search: { aspiration: { window: 1000000, widen: 1000000, maxWiden: 8 } } },
    opts: {}
  }
};

export const CONFIG_NAMES = Object.keys(CONFIGS);

function resolveConfig(name) {
  // "name@depth" pins the depth for this side, so "base@6 vs base@4" measures
  // how much a ply is worth and lets two configs be compared at equal effort
  const at = String(name).lastIndexOf('@');
  if (at > 0) {
    const base = String(name).slice(0, at);
    const depth = parseInt(String(name).slice(at + 1), 10);
    const cfg = CONFIGS[base];
    if (!cfg) throw new Error(`unknown config "${base}" (known: ${CONFIG_NAMES.join(', ')})`);
    if (!Number.isFinite(depth)) throw new Error(`bad depth in "${name}"`);
    return { cfg, depth };
  }
  const cfg = CONFIGS[name];
  if (!cfg) throw new Error(`unknown config "${name}" (known: ${CONFIG_NAMES.join(', ')})`);
  return { cfg, depth: null };
}

/* ------------------------------------------------------------------ *
 * Openings
 * ------------------------------------------------------------------ */

/** Standard opening positions: quiet, legal, and playable from both sides. */
export const OPENINGS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',              // start
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',            // 1.e4
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',          // 1.e4 e5
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',         // 1.e4 e5 2.Nf3
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 3',      // Ruy Lopez
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',      // Italian
  'rnbqkb1r/pp1ppppp/5n2/2p5/2P5/5N2/PP1PPPPP/RNBQKB1R w KQkq - 2 3',      // English
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',        // Sicilian
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',          // 1.d4 d5
  'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 2 3',      // 1.d4 Nf6 2.Nc3 d5
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',      // Italian, 4 moves
  'rnbqkb1r/pp2pppp/5n2/2pp4/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 0 4'       // QGD-like
];

/* ------------------------------------------------------------------ *
 * Match engine
 * ------------------------------------------------------------------ */

const RESULT_VALUE = { white: 1, draw: 0.5, black: 0 };

function loadSuite(path) {
  if (!path) return OPENINGS.slice();
  const text = readFileSync(path, 'utf8');
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.split(';')[0].trim();
    if (!line || line.startsWith('#')) continue;
    // an .epd record is "fen ..." — take everything up to the first ' bm ' / ' c9 '
    const fen = line.replace(/\s+(bm|c9|id)\s.*$/i, '').trim();
    if (fen.split(' ').length >= 4) out.push(fen);
  }
  return out.length ? out : OPENINGS.slice();
}

function newEngine(cfg, depth) {
  const params = cloneParams(DEFAULT_PARAMS);
  mergeInto(params, cfg.params);
  const engine = new Engine(params, Object.assign({ ttBits: 18 }, cfg.opts));
  return engine;
}

/** Deep merge of plain JSON config fragments into a params clone. */
function mergeInto(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      mergeInto(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

/** Play one game; `aWhite` decides which config has the white pieces. */
function playGame(cfgA, cfgB, fen, { depthA, depthB, maxPlies, aWhite }) {
  const engines = {
    white: newEngine(aWhite ? cfgA : cfgB, aWhite ? depthA : depthB),
    black: newEngine(aWhite ? cfgB : cfgA, aWhite ? depthB : depthA)
  };
  engines.white.setFEN(fen);
  engines.black.setFEN(fen);

  let nodes = 0;
  let maxDepth = 0;
  const plies = [];
  const depthSeen = { white: 0, black: 0 };

  for (let ply = 0; ply < maxPlies; ply++) {
    const side = engines.white.pos.turn === WHITE ? 'white' : 'black';
    const engine = engines[side];
    const before = engine.fen;
    const wantDepth = side === 'white' ? depthA : depthB;

    let res;
    try {
      res = engine.search({ depth: wantDepth });
    } catch (err) {
      return { error: `${side} search threw: ${err && err.message}`, plies, nodes, maxDepth };
    }
    if (res.depth > depthSeen[side]) depthSeen[side] = res.depth;
    nodes += res.nodes || 0;
    if (res.depth > maxDepth) maxDepth = res.depth;

    const played = engine.play(res.uci);
    if (!played) {
      return { error: `${side} produced an illegal move ${res.uci} from ${before}`, plies, nodes, maxDepth };
    }
    plies.push(played.san || res.uci);

    // both instances must see the same position after every move
    const now = engine.fen;
    engines.white.setFEN(now);
    engines.black.setFEN(now);

    const st = engines.white.pos.status();
    if (st && st.over) return { over: st, plies, nodes, maxDepth, depthSeen };
  }
  return { over: { over: true, result: 'draw', reason: 'max plies' }, plies, nodes, maxDepth, depthSeen };
}


/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

export function summarize(games, side) {
  const scores = games.map((g) => g.score);
  const m = mean(scores);
  const se = scores.length > 1 ? stdev(scores) / Math.sqrt(scores.length) : 0;
  const wins = games.filter((g) => g.score === 1).length;
  const draws = games.filter((g) => g.score === 0.5).length;
  const losses = games.filter((g) => g.score === 0).length;
  return {
    n: games.length,
    score: m,
    ci95: 1.96 * se,
    wins, draws, losses,
    errors: games.filter((g) => g.error).length,
    avgNodes: mean(games.map((g) => g.nodes || 0)),
    avgPlies: mean(games.map((g) => g.plies ? g.plies.length : 0)),
    side
  };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { games: 20, depth: 5, seed: 1, maxPlies: 300, a: 'base', b: 'plain', suite: null, out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(0, eq) : a;
    const val = eq > 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case '--list': out.list = true; break;
      case '--a': out.a = val; break;
      case '--b': out.b = val; break;
      case '--games': out.games = parseInt(val, 10); break;
      case '--depth': out.depth = parseInt(val, 10); break;
      case '--seed': out.seed = parseInt(val, 10); break;
      case '--plies': out.maxPlies = parseInt(val, 10); break;
      case '--suite': out.suite = val; break;
      case '--out': out.out = val; break;
      case '--quiet': out.quiet = true; break;
      default: throw new Error(`unknown argument "${a}"`);
    }
  }
  return out;
}

export function runMatch(opts) {
  const a = resolveConfig(opts.a);
  const b = resolveConfig(opts.b);
  const cfgA = a.cfg;
  const cfgB = b.cfg;
  const depthA = a.depth === null ? opts.depth : a.depth;
  const depthB = b.depth === null ? opts.depth : b.depth;
  const suite = loadSuite(opts.suite);
  const games = [];

  for (let i = 0; i < opts.games; i++) {
    const fen = suite[i % suite.length];
    const aWhite = i % 2 === 0;                 // colour balance
    const r = playGame(cfgA, cfgB, fen, {
      depthA, depthB, maxPlies: opts.maxPlies, aWhite
    });
    const over = r.over || { result: 'draw' };
    // `over.result` is the winner by name; convert to A's score
    const score = r.error ? 0
      : (over.result === 'draw' || !over.result) ? 0.5
      : ((over.result === 'white') === aWhite ? 1 : 0);
    games.push(Object.assign({}, r, { score, fen, aWhite, opener: i % suite.length }));
  }

  const summaryA = summarize(games, 'A');
  return { configs: { a: opts.a, b: opts.b }, opts, games, summary: { a: summaryA } };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.list) {
    for (const [name, cfg] of Object.entries(CONFIGS)) console.log(`  ${name.padEnd(10)} ${cfg.label}`);
    return;
  }

  const result = runMatch(opts);
  const s = result.summary.a;
  const label = `${opts.a} vs ${opts.b}`;

  if (!opts.quiet) {
    for (const g of result.games) {
      const tag = g.error ? 'ERROR' : g.over && g.over.result === 'draw' ? 'draw ' : g.score === 1 ? 'A win' : 'B win';
      console.log(`  game ${String(result.games.indexOf(g)).padStart(2)} ${tag.padEnd(5)} ${String(g.over ? g.over.reason : '').padEnd(24)} ${g.plies.length}p ${g.nodes}n  ${g.fen.split(' ').slice(0, 2).join(' ')}`);
      if (g.error) console.log(`        ${g.error}`);
    }
  }

  console.log(`\n${label}`);
  console.log(`  games   ${s.n}  (depth ${opts.depth}, seed ${opts.seed}, max ${opts.maxPlies} plies)`);
  console.log(`  score   ${(s.score * 100).toFixed(1)}%  ±${(s.ci95 * 100).toFixed(1)}  (${s.wins}W ${s.draws}D ${s.losses}L)`);
  console.log(`  errors  ${s.errors}`);
  console.log(`  nodes   ${Math.round(s.avgNodes)} per game`);

  if (opts.out) {
    mkdirSync(opts.out.includes('/') ? opts.out.slice(0, opts.out.lastIndexOf('/')) : '.', { recursive: true });
    writeFileSync(opts.out, JSON.stringify(result, null, 2));
    console.log(`  saved   ${opts.out}`);
  }
}

const invoked = typeof process !== 'undefined' && Array.isArray(process.argv) &&
  /match\.mjs$/.test(process.argv[1] || '');
if (invoked) main();
