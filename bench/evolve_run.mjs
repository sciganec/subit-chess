#!/usr/bin/env node
/** Long controlled evolution (SCMF §15) of the fast-tier evaluation knobs by self-play only.
 *  node bench/evolve_run.mjs [--steps 40] [--screen 24] [--confirm 60] [--depth 3] [--seed 1] [--out results/evolve.json] */
import fs from 'node:fs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { evolve } from '../src/engine/evolve.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const knobs = (arg('knobs', '') ? arg('knobs', '').split(',') : ['eval.mobility.N', 'eval.mobility.B', 'eval.mobility.R', 'eval.mobility.Q', 'eval.doubled', 'eval.isolated',
  'eval.rookOpen', 'eval.rookSemiOpen', 'eval.kingShield', 'tempo', 'eval.bishopPair']);
const t0 = Date.now();
const r = evolve(cloneParams(DEFAULT_PARAMS), {
  steps: Number(arg('steps', 40)), screenGames: Number(arg('screen', 24)), confirmGames: Number(arg('confirm', 60)),
  depth: Number(arg('depth', 3)), seed: Number(arg('seed', 1)), knobs
});
const out = arg('out', 'results/evolve.json');
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(out, JSON.stringify({ args: process.argv.slice(2), seconds: Math.round((Date.now() - t0) / 1000), accepted: r.accepted, rolledBack: r.rolledBack, audit: r.audit,
  evolved: Object.fromEntries(knobs.map((k) => [k, k.split('.').reduce((o, x) => o[x], r.params)])), baseline: Object.fromEntries(knobs.map((k) => [k, k.split('.').reduce((o, x) => o[x], DEFAULT_PARAMS)])), journal: r.journal }, null, 1));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s: accepted ${r.accepted}, rolledBack ${r.rolledBack}`, r.audit || '');
