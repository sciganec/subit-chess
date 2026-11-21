#!/usr/bin/env node
/**
 * Gate 7 — does the uncertainty driver steer verification?
 *
 * ROADMAP.md §Gate 7; docs/theory/45 §16; docs/theory/37 §5-§6.
 *
 * The gate is a *measurement*, not a new search heuristic. Three searches are
 * run from the same position and the same engine version:
 *
 *   base      fixed depth d
 *   uniform   the same extra budget the scalar controller would spend: d+1
 *   targeted  the extra budget is spent on the leading U-component:
 *               Us / Uh -> depth +1                 (search depth)
 *               Ut      -> qsearch checks 4 -> 8    (horizon width)
 *               Ue/Ur/Up/Um/Uc -> hybrid SVF, structural depth 2 -> 3
 *                                               (model/structural check)
 *
 * A record counts as `targetOnly` when the targeted pass changes the best move
 * and the uniform pass does not. The gate passes when at least one targetOnly
 * decision exists and no already-decisive position (proven mate, Us = 0)
 * changes under either extra budget. It is killed when targeted spending never
 * changes a decision while uniform spending does.
 *
 * Deterministic: no clock, fixed depth, fixed suite order, fresh engine per
 * pass so TT/memory state cannot leak between passes.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Engine } from '../src/engine/index.mjs';
import { paramsFromJSON } from '../src/engine/evaluate.mjs';
import { moveToUci } from '../src/engine/core.mjs';
import { U_TYPES, U_SYM } from '../src/engine/uncertainty.mjs';
import { MATE_THRESHOLD } from '../src/engine/search.mjs';

/** Where the extra budget goes for each of the eight components. */
export const DRIVER_TARGET = {
  search: 'depth',
  tactical: 'width',
  evaluation: 'structural',
  structural: 'structural',
  strategic: 'structural',
  temporal: 'depth',
  model: 'structural',
  contextual: 'structural'
};

/** Deterministic wrong-driver control: same budget machinery, wrong component. */
export const MISMATCH_DRIVER = {
  search: 'tactical', tactical: 'search',
  evaluation: 'structural', structural: 'evaluation',
  strategic: 'tactical', temporal: 'structural',
  model: 'contextual', contextual: 'model'
};

/** Known forced mates (tests/engine.tactics.mjs) for the decisive-profile check. */
export const MATE_FENS = [
  '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
  '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
  '6k1/8/6K1/8/8/8/8/7R w - - 0 1',
  '7k/R7/8/8/8/8/8/1R5K w - - 0 1'
];

/** The leading component only; a tie has no driver and is skipped (Gate 7). */
export function uniqueDriver(profile) {
  if (!profile || !Array.isArray(profile.vector)) return null;
  let top = 0;
  for (let i = 1; i < profile.vector.length; i++) {
    if (profile.vector[i] > profile.vector[top]) top = i;
  }
  for (let i = 0; i < profile.vector.length; i++) {
    if (i !== top && profile.vector[i] === profile.vector[top]) return null;
  }
  return U_TYPES[top] || null;
}

/** Patch + label for the targeted pass. Never touches evaluation *values*. */
export function targetedConfig(driver) {
  const target = DRIVER_TARGET[driver];
  if (target === 'depth') {
    return { target, label: 'depth +1', patch: {}, depthBonus: 1, mode: null };
  }
  if (target === 'width') {
    return {
      target, label: 'qsearch checks 4 -> 8',
      patch: { search: { qsearch: { checks: true, maxChecks: 8 } } },
      depthBonus: 0, mode: null
    };
  }
  if (target === 'structural') {
    return {
      target, label: 'hybrid SVF, structuralDepth +1',
      patch: { search: { structuralEvalDepth: 3 } },
      depthBonus: 0, mode: 'hybrid'
    };
  }
  return null;
}

function newEngine(patch, mode) {
  const engine = new Engine(paramsFromJSON(patch), {
    ttBits: 18, usePlans: true, useMeta: false
  });
  if (mode) engine.setEvalMode(mode);
  return engine;
}

/** One clean pass; a fresh engine means no cross-pass TT or memory reuse. */
export function pass(fen, depth, patch = {}, mode = null) {
  const engine = newEngine(patch, mode);
  engine.setFEN(fen);
  const r = engine.search({ depth });
  return {
    uci: moveToUci(r.move),
    score: r.score,
    depth: r.depth,
    nodes: r.nodes,
    completed: r.completed,
    flag: r.flag,
    pv: r.pv.map(moveToUci),
    certificate: r.certificate
  };
}

function loadSuite(path) {
  const text = readFileSync(path, 'utf8');
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.split(';')[0].trim();
    if (!line || line.startsWith('#')) continue;
    const fen = line.replace(/\s+(bm|c9|id)\s.*$/i, '').trim();
    if (fen.split(' ').length >= 4) out.push(fen);
  }
  return out;
}

function parseArgs(argv) {
  const opts = {
    suite: 'bench/fens/openings.epd', depth: 4, limit: 0, mates: false,
    out: 'results/gate7-targeted-vs-uniform.json', quiet: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--suite') opts.suite = argv[++i];
    else if (a === '--depth') opts.depth = Number(argv[++i]);
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--mates') opts.mates = true;
    else if (a === '--help') {
      console.log('usage: node bench/gate7.mjs [--suite FILE] [--depth 4] [--limit 24] [--mates] [--out FILE] [--quiet]');
      process.exit(0);
    }
  }
  return opts;
}

export function runGate(opts = {}) {
  const suite = loadSuite(opts.suite || 'bench/fens/openings.epd');
  const chosen = opts.limit > 0 ? suite.slice(0, opts.limit) : suite.slice();
  const fens = opts.mates ? chosen.concat(MATE_FENS) : chosen;
  const depth = opts.depth || 4;
  const records = [];

  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i];
    const group = i < chosen.length ? 'suite' : 'mate';
    const baseEngine = newEngine({}, null);
    baseEngine.setFEN(fen);
    const baseResult = baseEngine.search({ depth });
    const profile = baseEngine.uncertaintyProfile(baseResult, { depth });
    const driver = uniqueDriver(profile);
    const cfg = driver ? targetedConfig(driver) : null;

    const uniform = pass(fen, depth + 1);
    const targeted = cfg ? pass(fen, depth + cfg.depthBonus, cfg.patch, cfg.mode) : null;
    const wrongCfg = driver ? targetedConfig(MISMATCH_DRIVER[driver]) : null;
    const wrong = wrongCfg ? pass(fen, depth + wrongCfg.depthBonus, wrongCfg.patch, wrongCfg.mode) : null;

    const decisive = !!baseResult && Math.abs(baseResult.score) > MATE_THRESHOLD
      && profile.vector[0] === 0;
    const baseUci = moveToUci(baseResult.move);
    const chgU = uniform.uci !== baseUci;
    const chgT = !!targeted && targeted.uci !== baseUci;
    const chgW = !!wrong && wrong.uci !== baseUci;

    records.push({
      id: i + 1,
      group,
      fen,
      baseScore: baseResult.score,
      base: baseUci,
      baseNodes: baseResult.nodes,
      baseDepth: baseResult.depth,
      driver,
      driverSymbol: driver ? U_SYM[driver] : null,
      driverValue: driver ? profile.vector[U_TYPES.indexOf(driver)] : null,
      target: cfg ? cfg.label : null,
      wrongDriver: driver ? MISMATCH_DRIVER[driver] : null,
      wrongTarget: wrongCfg ? wrongCfg.label : null,
      decisive,
      uniform,
      targeted,
      wrong,
      chgU,
      chgT,
      chgW,
      targetOnly: chgT && !chgU,
      uniformOnly: chgU && !chgT,
      wrongOnly: chgW && !chgU && !chgT,
      profile
    });
  }

  const scored = records.filter((r) => r.driver);
  const summary = {
    positions: records.length,
    skippedNoUniqueDriver: records.length - scored.length,
    targetOnly: scored.filter((r) => r.targetOnly).length,
    uniformOnly: scored.filter((r) => r.uniformOnly).length,
    wrongOnly: scored.filter((r) => r.wrongOnly).length,
    wrongChanged: scored.filter((r) => r.chgW).length,
    bothChanged: scored.filter((r) => r.chgU && r.chgT).length,
    neitherChanged: scored.filter((r) => !r.chgU && !r.chgT).length,
    decisivePositions: records.filter((r) => r.decisive).length,
    decisiveChanged: records.filter((r) => r.decisive && (r.chgU || r.chgT)).length,
    driverHistogram: U_TYPES.reduce((acc, k) => {
      acc[k] = scored.filter((r) => r.driver === k).length;
      return acc;
    }, {}),
    meanNodes: {
      base: Math.round(records.reduce((a, r) => a + r.baseNodes, 0) / Math.max(1, records.length)),
      uniform: Math.round(records.reduce((a, r) => a + r.uniform.nodes, 0) / Math.max(1, records.length)),
      targeted: Math.round(scored.reduce((a, r) => a + (r.targeted ? r.targeted.nodes : 0), 0) / Math.max(1, scored.length)),
      wrong: Math.round(scored.reduce((a, r) => a + (r.wrong ? r.wrong.nodes : 0), 0) / Math.max(1, scored.length))
    }
  };
  summary.gate = summary.targetOnly >= 1 && summary.decisiveChanged === 0 ? 'PASS'
    : summary.targetOnly === 0 && summary.uniformOnly > 0 ? 'KILL' : 'INCONCLUSIVE';

  return { opts: { ...opts, depth }, summary, records };
}

const invoked = typeof process !== 'undefined' && Array.isArray(process.argv)
  && /[\\/]bench[\\/]gate7\.mjs$/.test(process.argv[1] || '');
if (invoked) {
  const opts = parseArgs(process.argv.slice(2));
  const result = runGate(opts);
  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify(result, null, 2));
  }
  const s = result.summary;
  console.log(`Gate 7: ${s.gate}  targetOnly=${s.targetOnly} uniformOnly=${s.uniformOnly} wrongOnly=${s.wrongOnly} wrongChanged=${s.wrongChanged} both=${s.bothChanged} neither=${s.neitherChanged}`);
  console.log(`positions=${s.positions} skipped=${s.skippedNoUniqueDriver} decisive=${s.decisivePositions} decisiveChanged=${s.decisiveChanged}`);
  console.log(`drivers=${JSON.stringify(s.driverHistogram)}`);
  console.log(`mean nodes: base=${s.meanNodes.base} uniform=${s.meanNodes.uniform} targeted=${s.meanNodes.targeted} wrong=${s.meanNodes.wrong}`);
  if (!opts.quiet) {
    for (const r of result.records) {
      if (r.chgU || r.chgT || r.chgW) {
        console.log(`  #${r.id} ${r.driverSymbol || '—'} ${r.base} -> uniform ${r.uniform.uci} targeted ${r.targeted ? r.targeted.uci : '—'} wrong ${r.wrong ? r.wrong.uci : '—'}`);
      }
    }
  }
  if (opts.out) console.log(`saved ${opts.out}`);
}
