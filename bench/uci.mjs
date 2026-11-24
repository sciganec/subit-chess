#!/usr/bin/env node
/**
 * UCI front-end for the SUBIT-CHESS v3 engine (ROADMAP Gate 5: external validation).
 *
 *   node bench/uci.mjs            # speaks UCI on stdin/stdout
 *
 * Supported: uci, isready, ucinewgame, position [startpos|fen ...] [moves ...],
 *            go [depth N | movetime MS | nodes N | wtime/btime/winc/binc/movestogo | infinite],
 *            stop (no-op: search is synchronous), quit, setoption name Depth|Hash|Mode.
 *
 * Search is synchronous and not interruptible, so `go` always runs to its own
 * limit; the harness must therefore give a bounded limit (depth, nodes or time).
 * Time controls are converted to a per-move budget: remaining/30 + increment/2.
 */

import { createInterface } from 'node:readline';
import { Engine, VERSION } from '../src/engine/index.mjs';
import { Position } from '../src/engine/core.mjs';
import { createPool } from '../src/engine/smp.mjs';
import { cloneParams, DEFAULT_PARAMS } from '../src/engine/evaluate.mjs';

/* Ablation configs, mirrored from bench/match.mjs CONFIGS (importing it would run its CLI). */
const CONFIGS = {
  base:      { params: {}, opts: {} },
  plain:     { params: { context: { enabled: false }, search: { ordering: { struct: 0 } } }, opts: { usePlans: false, useMeta: false } },
  noctx:     { params: { context: { enabled: false } }, opts: {} },
  nostruct:  { params: { search: { ordering: { struct: 0 } } }, opts: {} },
  noplans:   { params: {}, opts: { usePlans: false } },
  structext: { params: { search: { structExtension: { enabled: true } } }, opts: {} },
  noadapt:   { params: {}, opts: { adaptiveTime: false } },
  adaptive:  { params: {}, opts: { adaptiveTime: true } },
  planord:   { params: {}, opts: { planOrdering: true } },
  nofut:     { params: { search: { futility: { enabled: false } } }, opts: {} },
  nopruning: { params: { search: { nullMove: { enabled: false }, lmr: { enabled: false }, futility: { enabled: false } } }, opts: {} }
};
function mergeInto(t, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') mergeInto(t[k], v);
    else t[k] = v;
  }
  return t;
}
let config = 'base';
function newEngine() {
  const c = CONFIGS[config] || CONFIGS.base;
  const params = cloneParams(DEFAULT_PARAMS);
  mergeInto(params, c.params);
  return new Engine(params, Object.assign({ ttBits: 18 }, c.opts));
}

const START = Position.start().fen();
let threads = Math.max(1, Number(process.env.SUBIT_THREADS) | 0 || 1);
let engine = newEngine();
if (threads > 1) createPool(engine, threads - 1);
let defaultDepth = 0;          // 0 = unlimited (use go limits)
let mode = 'fast';

const send = (s) => process.stdout.write(s + '\n');

function setPosition(tokens) {
  let i = 0;
  let fen = START;
  if (tokens[i] === 'startpos') { i++; }
  else if (tokens[i] === 'fen') {
    const parts = [];
    i++;
    while (i < tokens.length && tokens[i] !== 'moves') parts.push(tokens[i++]);
    fen = parts.join(' ');
  }
  engine.setFEN(fen);
  if (tokens[i] === 'moves') {
    for (i++; i < tokens.length; i++) {
      const r = engine.play(tokens[i]);
      if (!r) { send(`info string illegal move ${tokens[i]}`); break; }
    }
  }
}

function budgetFromClock(g, white) {
  const t = Number(white ? g.wtime : g.btime);
  const inc = Number(white ? g.winc : g.binc) || 0;
  if (!Number.isFinite(t)) return 0;
  const left = Number(g.movestogo) > 0 ? Number(g.movestogo) : 30;
  return Math.max(10, Math.floor(t / left + inc / 2));
}

function go(tokens) {
  const g = {};
  for (let i = 0; i < tokens.length; i++) {
    const k = tokens[i];
    if (['depth', 'movetime', 'nodes', 'wtime', 'btime', 'winc', 'binc', 'movestogo'].includes(k)) g[k] = tokens[++i];
    else if (k === 'infinite') g.infinite = true;
  }
  const opts = {};
  if (g.depth) opts.depth = Number(g.depth);
  else if (defaultDepth) opts.depth = defaultDepth;
  if (g.nodes) opts.nodes = Number(g.nodes);
  const white = engine.fen.split(' ')[1] === 'w';
  const ms = g.movetime ? Number(g.movetime) : budgetFromClock(g, white);
  if (g.movetime) opts.fixedTime = true;      // UCI movetime is exact; only clock play is adaptive
  if (ms) opts.timeMs = ms;
  if (!opts.depth && !opts.nodes && !opts.timeMs) opts.depth = 5;   // never run unbounded

  const r = engine.search(opts);
  if (!r || !r.uci) { send('bestmove 0000'); return; }
  const cp = Math.round(r.score);
  send(`info depth ${r.depth} seldepth ${r.seldepth} score cp ${cp} nodes ${r.nodes} nps ${r.nps} time ${r.timeMs} pv ${(r.pv || [r.uci]).map((m) => (typeof m === 'string' ? m : m.uci || '')).filter(Boolean).join(' ') || r.uci}`);
  send(`bestmove ${r.uci}`);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return;
  switch (t[0]) {
    case 'uci':
      send(`id name SUBIT-CHESS ${VERSION}`);
      send('id author SUBIT');
      send('option name Depth type spin default 0 min 0 max 24');
      send('option name Threads type spin default 1 min 1 max 64');
      send(`option name Config type combo default base ${Object.keys(CONFIGS).map((k) => 'var ' + k).join(' ')}`);
      send('option name Mode type combo default fast var fast var structural');
      send('uciok');
      break;
    case 'isready': send('readyok'); break;
    case 'ucinewgame': engine.pool?.close(); engine = newEngine(); engine.setEvalMode?.(mode); if (threads > 1) createPool(engine, threads - 1); break;
    case 'position': setPosition(t.slice(1)); break;
    case 'go': go(t.slice(1)); break;
    case 'stop': break;
    case 'setoption': {
      const n = t.indexOf('name'), v = t.indexOf('value');
      const name = t.slice(n + 1, v > -1 ? v : undefined).join(' ').toLowerCase();
      const val = v > -1 ? t.slice(v + 1).join(' ') : '';
      if (name === 'depth') defaultDepth = Number(val) || 0;
      if (name === 'threads') { threads = Math.max(1, Math.min(64, Number(val) | 0 || 1)); engine.pool?.close(); engine.pool = null; engine = newEngine(); engine.setEvalMode?.(mode); if (threads > 1) createPool(engine, threads - 1); }
      if (name === 'config') { config = val; engine = newEngine(); }
      if (name === 'mode') { mode = val; engine.setEvalMode?.(mode); }
      break;
    }
    case 'quit': process.exit(0);
  }
});
