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

  // futility depth ablation: 3 prunes far more (3x fewer nodes) but can hide a
  // mate behind a pruned quiet move; used to measure speed-vs-safety
  futil3: {
    label: 'futility at depth 3 (pre-3.0.1 speed)',
    params: { search: { futility: { maxDepth: 3 } } },
    opts: {}
  },

  // doc 05 §25.2 ablations
  nostruct: {
    label: 'A — no structural priority (no-op after Gate 3 kill)',
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
    label: 'D — no plans (no-op in search after Gate 3 kill)',
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
    label: 'plain — alpha-beta, no meta (struct/context/plan ordering already removed)',
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

  // horizon breadth: the audit A1 ablation (quiet checks in qsearch)
  noqchecks: {
    label: 'no quiet checks in qsearch (pre-audit horizon)',
    params: { search: { qsearch: { checks: false } } },
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
  structext: {
    label: 'structural extension (SEARCH-14): pawn to 7th extends one ply',
    params: { search: { structExtension: { enabled: true } } }, opts: {}
  },
  structeval: {
    label: 'structural SVF-9 evaluation tier at every leaf (OPEN-001 test: do the nine components beat the fast tier?)',
    params: {}, opts: { evalMode: 'structural' }
  },
  structfit: {
    label: 'structural tier with weights fitted to own depth-2 search (bench/fit_svf.mjs)',
    params: { w: JSON.parse(readFileSync(new URL('../results/svf_weights.json', import.meta.url), 'utf8')).w }, opts: { evalMode: 'structural' }
  },
  rootstruct: {
    label: 'structural SVF re-selection among near-equal root moves (margin 25 cp, lambda 0.25)',
    params: {}, opts: { rootStruct: { margin: 25, lambda: 0.25, maxCand: 4 } }
  },
  rfp: { label: 'reverse futility (depth<=3, 120cp/ply)', params: { search: { rfp: { enabled: true } } }, opts: {} },
  qsee: { label: 'SEE-lite capture pruning in quiescence', params: { search: { qSee: { enabled: true } } }, opts: {} },
  adaptive: {
    label: 'adaptive time budget (SEARCH-15): stable decisions stop early and bank time',
    params: {},
    opts: { adaptiveTime: true }
  },

  planord: {
    label: 'plan-based move ordering ON (pre-3.0.9 default)',
    params: {},
    opts: { planOrdering: true }
  },

  nofut: {
    label: 'no futility pruning (null-move and LMR kept)',
    params: { search: { futility: { enabled: false } } },
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

/** Deterministic Fisher-Yates: the same seed gives the same opening order. */
function shuffle(list, seed) {
  let s = (seed | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}

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

function newEngine(cfg) {
  const params = cloneParams(DEFAULT_PARAMS);
  mergeInto(params, cfg.params);
  const engine = new Engine(params, Object.assign({ ttBits: 18 }, cfg.opts));
  return engine;
}

/**
 * Load a game position without losing its repetition history.
 *
 * `Engine.setFEN()` is right for opening a new position: it clears `rep`,
 * `repHi` and `repLimit`. A match, however, is one continuous game. Calling
 * bare `setFEN()` after every move (as the harness did) throws away the stack
 * that `Engine.play()` just carried forward under ADR 0016, so neither engine
 * can see threefold/fivefold and equal positions shuffle to the ply cap. This
 * helper is the harness-side fix: the FEN updates derived state, the copied
 * stack restores the game identity. The rule authority stays `status()`.
 */
export function adoptGamePosition(engine, fen, rep) {
  engine.setFEN(fen);
  if (rep) {
    engine.pos.rep = rep.rep.slice();
    engine.pos.repHi = rep.repHi.slice();
    engine.pos.repLimit = rep.repLimit;
  }
  return engine;
}

export function repetitionState(pos) {
  return { rep: pos.rep.slice(), repHi: pos.repHi.slice(), repLimit: pos.repLimit };
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
function playGame(cfgA, cfgB, fen, { depthA, depthB, pinA = false, pinB = false, maxPlies, aWhite, timeMs = 0 }) {
  const engines = {
    white: newEngine(aWhite ? cfgA : cfgB),
    black: newEngine(aWhite ? cfgB : cfgA)
  };
  adoptGamePosition(engines.white, fen, null);
  adoptGamePosition(engines.black, fen, null);

  let nodes = 0;
  let maxDepth = 0;
  const plies = [];
  const depthSeen = { white: 0, black: 0 };
  const ms = { white: 0, black: 0 }, mv = { white: 0, black: 0 };

  for (let ply = 0; ply < maxPlies; ply++) {
    const side = engines.white.pos.turn === WHITE ? 'white' : 'black';
    const engine = engines[side];
    const before = engine.fen;
    // The depth belongs to the CONFIG, not to the colour. In odd games A plays
    // Black, so keying this on `side` swapped the two depths and made a depth
    // A/B measure half its games with the labels reversed.
    const sideIsA = aWhite ? side === 'white' : side === 'black';
    const wantDepth = sideIsA ? depthA : depthB;
    // time-limited play: the engine gets a clock instead of a depth, which is how
    // the UI plays and the only fair way to compare two pruning settings
    // "name@N" under --time pins a depth cap next to the clock (measures the cap itself)
    const pinned = ((side === 'white') === aWhite) ? pinA : pinB;
    const want = timeMs ? (pinned ? { timeMs, depth: wantDepth } : { timeMs }) : { depth: wantDepth };

    let res;
    try {
      res = engine.search(want);
    } catch (err) {
      return { error: `${side} search threw: ${err && err.message}`, plies, nodes, maxDepth };
    }
    if (res.depth > depthSeen[side]) depthSeen[side] = res.depth;
    nodes += res.nodes || 0;
    ms[side] += res.timeMs || 0; mv[side]++;
    if (res.depth > maxDepth) maxDepth = res.depth;

    const played = engine.play(res.uci);
    if (!played) {
      return { error: `${side} produced an illegal move ${res.uci} from ${before}`, plies, nodes, maxDepth };
    }
    plies.push(played.san || res.uci);

    // Both instances must see the same position *and the same game history*
    // after every move. `play()` preserves the stack on the mover; carry it to
    // the observer too instead of calling bare setFEN() and losing it.
    const now = engine.fen;
    const rep = repetitionState(engine.pos);
    adoptGamePosition(engines.white, now, rep);
    adoptGamePosition(engines.black, now, rep);

    const st = engines.white.pos.status();
    if (st && st.over) return { over: st, plies, nodes, maxDepth, depthSeen, ms, mv };
  }
  return { over: { over: true, result: 'draw', reason: 'max plies' }, plies, nodes, maxDepth, depthSeen, ms, mv };
}


/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }


function median(xs) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}


/** Statistics shared by the aggregate summary and the per-opening breakdown. */
function statsOf(games) {
  const scores = games.map((g) => g.score);
  const m = mean(scores);
  const se = scores.length > 1 ? stdev(scores) / Math.sqrt(scores.length) : 0;
  const ci95 = 1.96 * se;
  // A score interval is not an Elo interval: at p=0.5 a ±0.1 band is already
  // ±70 Elo. Publishing both stops a ±10 pp result being read as a strength win.
  const p = Math.min(0.99, Math.max(0.01, m));
  const eloCi95 = 400 / Math.LN10 * ci95 / (p * (1 - p));
  const wins = games.filter((g) => g.score === 1).length;
  const draws = games.filter((g) => g.score === 0.5).length;
  const losses = games.filter((g) => g.score === 0).length;
  return {
    n: games.length,
    score: m,
    ci95,
    eloCi95,
    wins, draws, losses,
    errors: games.filter((g) => g.error).length,
    avgNodes: mean(games.map((g) => g.nodes || 0)),
    avgPlies: mean(games.map((g) => g.plies ? g.plies.length : 0)),
    // length distribution: a run whose mean length is unknown cannot be compared
    // with the next one, and a cap-bound game measures repetition, not strength
    medianPlies: median(games.map((g) => (g.plies ? g.plies.length : 0))),
    maxPlies: games.reduce((a, g) => Math.max(a, g.plies ? g.plies.length : 0), 0),
    capped: games.filter((g) => g.over && g.over.reason === "max plies").length,
    reasons: games.reduce((acc, g) => {
      const r = (g.over && g.over.reason) || (g.error ? "error" : "unknown");
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {})
  };
}

export function summarize(games, side) {
  // The harness header promises a per-opening breakdown. With 12 fixed starts
  // and n=20 one opening can decide the score; without this table that risk is
  // invisible in the report (Gate 1).
  const groups = new Map();
  for (const g of games) {
    const key = g.opener == null ? 0 : g.opener;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  const byOpening = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([opener, gs]) => Object.assign({ opener, fen: gs[0].fen }, statsOf(gs)));
  return Object.assign(statsOf(games), { byOpening, side });
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = { games: 20, depth: 5, seed: 1, maxPlies: 300, a: 'base', b: 'plain', suite: null, out: null, quiet: false, variety: false, time: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const key = eq > 0 ? a.slice(0, eq) : a;
    // a boolean flag must not swallow the next argument (--quiet --out x.js broke here)
    const next = argv[i + 1];
    const val = eq > 0 ? a.slice(eq + 1) : (next !== undefined && !next.startsWith("--") ? argv[++i] : true);
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
      case '--variety': out.variety = true; break;
      case '--time': out.time = parseInt(val, 10); break;
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
  if (opts.variety) shuffle(suite, opts.seed);
  const games = [];

  for (let i = 0; i < opts.games; i++) {
    const fen = suite[i % suite.length];
    const aWhite = i % 2 === 0;                 // colour balance
    const r = playGame(cfgA, cfgB, fen, {
      depthA, depthB, pinA: a.depth !== null, pinB: b.depth !== null, maxPlies: opts.maxPlies, aWhite, timeMs: opts.time
    });
    const over = r.over || { result: 'draw' };
    // `over.result` is the winner by name; convert to A's score
    const score = r.error ? 0
      : (over.result === 'draw' || !over.result) ? 0.5
      : ((over.result === 'white') === aWhite ? 1 : 0);
    games.push(Object.assign({}, r, { score, fen, aWhite, opener: i % suite.length }));
  }

  const summaryA = summarize(games, 'A');
  // mean thinking time per move of each side: a time policy is only fairly compared
  // against a fixed budget if both spend the same on average (SEARCH-15)
  let msA = 0, mvA = 0, msB = 0, mvB = 0;
  for (const g of games) {
    if (!g.ms) continue;
    const a = g.aWhite ? 'white' : 'black', b = g.aWhite ? 'black' : 'white';
    msA += g.ms[a]; mvA += g.mv[a]; msB += g.ms[b]; mvB += g.mv[b];
  }
  summaryA.msPerMoveA = mvA ? msA / mvA : 0;
  summaryA.msPerMoveB = mvB ? msB / mvB : 0;
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
  console.log(`  games   ${s.n}  (${opts.time ? `${opts.time}ms/move` : `depth ${opts.depth}`}, seed ${opts.seed}, max ${opts.maxPlies} plies)`);
  console.log(`  score   ${(s.score * 100).toFixed(1)}%  ±${(s.ci95 * 100).toFixed(1)}  (±${Math.round(s.eloCi95)} Elo)  (${s.wins}W ${s.draws}D ${s.losses}L)`);
  console.log(`  errors  ${s.errors}`);
  console.log(`  nodes   ${Math.round(s.avgNodes)} per game`);
  if (s.msPerMoveA) console.log(`  time    A ${s.msPerMoveA.toFixed(1)} ms/move  B ${s.msPerMoveB.toFixed(1)} ms/move  (A/B ${(s.msPerMoveA / s.msPerMoveB).toFixed(3)})`);
  console.log(`  length  mean ${s.avgPlies.toFixed(0)}  median ${s.medianPlies}  max ${s.maxPlies}  capped ${s.capped}/${s.n}  (${Object.entries(s.reasons).map(([k, v]) => `${k}: ${v}`).join(", ")})`);
  if (s.byOpening.length > 1) {
    console.log('  by opening:');
    for (const b of s.byOpening) {
      console.log(`    #${String(b.opener).padStart(2)}  ${(b.score * 100).toFixed(0)}% ±${(b.ci95 * 100).toFixed(0)}  ${b.wins}W ${b.draws}D ${b.losses}L  ${b.avgPlies.toFixed(0)}p  cap ${b.capped}/${b.n}  ${b.fen.split(' ').slice(0, 2).join(' ')}`);
    }
  }

  if (opts.out) {
    mkdirSync(opts.out.includes('/') ? opts.out.slice(0, opts.out.lastIndexOf('/')) : '.', { recursive: true });
    writeFileSync(opts.out, JSON.stringify(result, null, 2));
    console.log(`  saved   ${opts.out}`);
  }
}

const invoked = typeof process !== 'undefined' && Array.isArray(process.argv) &&
  /match\.mjs$/.test(process.argv[1] || '');
if (invoked) main();
