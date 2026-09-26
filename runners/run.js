#!/usr/bin/env node
'use strict';

/* ============================================================================
   subit-chess — unified CLI runner
   ----------------------------------------------------------------------------
   Modes:
     --mode selfplay   N games self-play, no teacher eval
     --mode teacher    self-play + batchTeacherEval + snapshot
     --mode match      self-play with policy on/off, writes telemetry report;
                       optional --baseline <json> to compute Δmean reward

   Usage:
     node runners/run.js --mode selfplay --games 100 --depth 2
     node runners/run.js --mode teacher  --games 100 --depth 2 --out results/run1.json
     node runners/run.js --mode match    --games 400 --depth 2 --seed 42 --policy on
     node runners/run.js --mode match    --games 400 --depth 2 --seed 42 --policy off \
                                           --out results/base.json
     node runners/run.js --mode match    --games 400 --depth 2 --seed 42 --policy on  \
                                           --out results/rho.json --baseline results/base.json

   Requires: jsdom (npm install)
   Engine:   src/subit_chess_v1.9.1.html (single file, exposes window.__subit)
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// ---------- CLI parsing ------------------------------------------------------

function parseArgs(argv){
  const args = {};
  for (let i = 0; i < argv.length; i++){
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')){
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function cfgFromArgs(args){
  const projectRoot = path.resolve(__dirname, '..');
  return {
    mode:        args.mode || 'match',
    games:       +args.games || 400,
    depth:       +args.depth || 2,
    seed:        +args.seed || 42,
    maxPlies:    +args['max-plies'] || 100,
    epsilon:     args.epsilon !== undefined ? +args.epsilon : 0.2,
    topK:        +args['top-k'] || 3,
    chunk:       +args.chunk || 50,
    policy:      args.policy || 'on',
    html:        args.html || path.join(projectRoot, 'src', 'subit_chess_v1.9.1.html'),
    out:         args.out || 'results/report.json',
    baseline:    args.baseline || null,
    rhoSnapshot: args['rho-snapshot'] || null,
    quiet:       !!args.quiet,
    verbose:     !!args.verbose
  };
}

// ---------- Utilities --------------------------------------------------------

function writeJson(outPath, obj){
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2));
}

function seedRandom(window, seed){
  // LCG — same seed → same game sequence (only affects selfPlay's epsilon-greedy)
  let s = (seed >>> 0) || 1;
  window.Math.random = function(){
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function verdictFromDelta(deltaCp){
  if (deltaCp > 15) return 'PASS (Δmean > +15 cp)';
  if (deltaCp < -5) return 'FAIL (Δmean < -5 cp)';
  return 'MARGINAL (Δmean in [-5, +15] cp)';
}

function summarizeActiveCells(teleReport, activeCells){
  const byKey = {};
  for (const c of (teleReport.allCells || [])) byKey[c.key] = c;

  const cells = [];
  let sumMean = 0;
  let sumN = 0;
  let minT = Infinity;
  let maxT = -Infinity;
  let signalCount = 0;

  for (const key of activeCells){
    const c = byKey[key] || { n: 0, mean: 0, variance: 0, tStat: 0 };
    cells.push({ key, n: c.n, mean: c.mean, variance: c.variance, t: c.tStat });
    sumMean += c.mean * c.n;
    sumN += c.n;
    if (c.n >= 20){
      if (c.tStat < minT) minT = c.tStat;
      if (c.tStat > maxT) maxT = c.tStat;
      if (c.n >= 20 && Math.abs(c.tStat) >= 2) signalCount++;
    }
  }

  return {
    cells,
    weightedMean: sumN > 0 ? sumMean / sumN : 0,
    totalN: sumN,
    cellCount: activeCells.length,
    signalCells: signalCount,
    tMin: Number.isFinite(minT) ? minT : 0,
    tMax: Number.isFinite(maxT) ? maxT : 0
  };
}

async function runSelfPlayChunked(E, total, opts, chunkSize, logPrefix){
  const agg = { w: 0, b: 0, d: 0, total: 0 };
  let done = 0;
  const t0 = Date.now();
  while (done < total){
    const n = Math.min(chunkSize, total - done);
    const r = await E.selfPlay(n, opts);
    agg.w += r.results.w;
    agg.b += r.results.b;
    agg.d += r.results.d;
    agg.total += r.results.total;
    done += n;
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = done > 0 ? (done / Math.max(1, (Date.now() - t0) / 1000)).toFixed(2) : '—';
    console.log(`${logPrefix} ${done}/${total}  W=${agg.w} B=${agg.b} D=${agg.d}  [${el}s, ${rate} game/s]`);
  }
  return agg;
}

// ---------- Engine loader ----------------------------------------------------

async function loadEngine(htmlPath, opts){
  if (!fs.existsSync(htmlPath)){
    throw new Error(`engine not found: ${htmlPath}`);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');

  const vc = new VirtualConsole();
  if (!opts.quiet){
    vc.on('log',   (...a) => console.log('[engine]', ...a));
    vc.on('info',  (...a) => console.log('[engine]', ...a));
    vc.on('warn',  (...a) => console.warn('[engine]', ...a));
    vc.on('error', (...a) => console.error('[engine]', ...a));
  }
  vc.on('jsdomError', (e) => {
    if (opts.verbose) console.error('[jsdom]', e.message);
  });

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'file://' + htmlPath
  });

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('engine load timeout (30s)')), 30000);
    if (dom.window.document.readyState === 'complete'){
      clearTimeout(to);
      resolve();
      return;
    }
    dom.window.addEventListener('load', () => { clearTimeout(to); resolve(); }, { once: true });
  });

  // init() runs synchronously after DOMContentLoaded; give it a tick to settle
  await new Promise(r => setTimeout(r, 200));

  const E = dom.window.__subit;
  if (!E) throw new Error('window.__subit was not exposed — engine failed to init');

  return { dom, window: dom.window, E };
}

// ---------- Modes ------------------------------------------------------------

async function modeSelfplay(ctx, cfg){
  const { E } = ctx;
  E.telemetryClear();

  console.log(`[run] mode=selfplay games=${cfg.games} depth=${cfg.depth} maxPlies=${cfg.maxPlies} seed=${cfg.seed} epsilon=${cfg.epsilon} topK=${cfg.topK}`);

  const t0 = Date.now();
  const agg = await runSelfPlayChunked(E, cfg.games, {
    depth: cfg.depth,
    maxPlies: cfg.maxPlies,
    epsilon: cfg.epsilon,
    topK: cfg.topK
  }, cfg.chunk, '[run] selfplay');

  const dt = Date.now() - t0;
  const tele = E.telemetryReport();

  console.log(`[run] telemetry: visited=${tele.visitedCells}/${tele.cellCount} H=${tele.entropy.toFixed(2)} top5=${(tele.top5Share * 100).toFixed(0)}% signal=${tele.signalCells}`);

  const out = {
    config: {
      mode: 'selfplay',
      games: cfg.games,
      depth: cfg.depth,
      maxPlies: cfg.maxPlies,
      seed: cfg.seed,
      epsilon: cfg.epsilon,
      topK: cfg.topK,
      engineVersion: E.engineVersion
    },
    results: agg,
    telemetry: {
      totalMoves: tele.totalMoves,
      visitedCells: tele.visitedCells,
      cellCount: tele.cellCount,
      visitedShare: tele.visitedShare,
      entropy: tele.entropy,
      effectiveCells: tele.effectiveCells,
      top5Share: tele.top5Share,
      signalCells: tele.signalCells,
      signalShare: tele.signalShare,
      topCells: tele.topCells,
      allCells: tele.allCells
    },
    elapsedMs: dt
  };

  writeJson(cfg.out, out);
  console.log(`[run] wrote ${cfg.out}`);
  return out;
}

async function modeTeacher(ctx, cfg){
  const { E } = ctx;

  E.teacherClear();
  E.telemetryClear();
  E.resetGrammarToBaseline();

  console.log(`[run] mode=teacher games=${cfg.games} depth=${cfg.depth} selfPlayDepth=${cfg.depth} teacherDepth=${cfg.depth + 2} maxPlies=${cfg.maxPlies} seed=${cfg.seed}`);

  const t0 = Date.now();
  const sp = await runSelfPlayChunked(E, cfg.games, {
    depth: cfg.depth,
    maxPlies: cfg.maxPlies,
    epsilon: cfg.epsilon,
    topK: cfg.topK
  }, cfg.chunk, '[run] selfplay');
  const tSelf = Date.now();

  const teacherDepth = cfg.depth + 2;
  console.log(`[run] batchTeacherEval depth=${teacherDepth} R_max=300 concurrency=2`);

  const bt = await E.batchTeacherEval({
    depth: teacherDepth,
    R_max: 300,
    concurrency: 2,
    onProgress: (frac, done, total) => {
      if (done % 500 !== 0 && done !== total) return;
      const el = ((Date.now() - tSelf) / 1000).toFixed(0);
      const rate = done > 0 ? (done / Math.max(1, (Date.now() - tSelf) / 1000)).toFixed(1) : '—';
      const eta = total > done && rate !== '—' ? ((total - done) / Math.max(0.001, +rate)).toFixed(0) : '—';
      console.log(`[run] batchEval ${done}/${total} (${Math.round(frac * 100)}%)  ${rate} FEN/s  ETA ${eta}s  [${el}s]`);
    }
  });
  const tEnd = Date.now();

  const rep = E.teacherReport();

  console.log(`[run] teacher: signal=${rep.signalCells}/${rep.cellCount} visited=${rep.visitedCells} H=${rep.entropy.toFixed(2)} droppedRaw=${rep.droppedRaw}`);

  const out = {
    config: {
      mode: 'teacher',
      games: cfg.games,
      selfPlayDepth: cfg.depth,
      teacherDepth,
      maxPlies: cfg.maxPlies,
      seed: cfg.seed,
      epsilon: cfg.epsilon,
      topK: cfg.topK,
      engineVersion: E.engineVersion
    },
    selfPlay: sp,
    batchEval: bt,
    teacher: {
      totalMoves: rep.totalMoves,
      rawEntries: rep.rawEntries,
      droppedRaw: rep.droppedRaw,
      visitedCells: rep.visitedCells,
      cellCount: rep.cellCount,
      visitedShare: rep.visitedShare,
      top5Share: rep.top5Share,
      entropy: rep.entropy,
      effectiveCells: rep.effectiveCells,
      signalCells: rep.signalCells,
      signalShare: rep.signalShare,
      topCells: rep.topCells,
      allCells: rep.allCells
    },
    elapsedMs: tEnd - t0
  };

  writeJson(cfg.out, out);
  console.log(`[run] wrote ${cfg.out}`);
  return out;
}

async function modeMatch(ctx, cfg){
  const { E } = ctx;

  // ---- policy state
  let policyActive = false;
  if (cfg.policy === 'off'){
    E.setPolicyEnabled(false);
    console.log('[run] policy = OFF (baseline)');
  } else {
    E.setPolicyEnabled(true);
    let map = null;
    if (cfg.rhoSnapshot){
      if (!fs.existsSync(cfg.rhoSnapshot)){
        throw new Error(`--rho-snapshot not found: ${cfg.rhoSnapshot}`);
      }
      map = JSON.parse(fs.readFileSync(cfg.rhoSnapshot, 'utf8'));
      E.subitState.rhoSMap = map;
      E.subitState.rhoSFrozen = true;
      console.log(`[run] ρ_s installed from ${cfg.rhoSnapshot} (${Object.keys(map).length} cells)`);
      policyActive = true;
    } else {
      map = E.rhoSReport();
      if (!map){
        console.warn('[run] WARNING: ρ_s not initialized (no teacher data) — falling back to baseline');
        E.setPolicyEnabled(false);
      } else {
        console.log(`[run] ρ_s active (${Object.keys(map).length} cells)`);
        policyActive = true;
      }
    }
  }

  // ---- run self-play
  E.telemetryClear();

  console.log(`[run] mode=match games=${cfg.games} depth=${cfg.depth} maxPlies=${cfg.maxPlies} seed=${cfg.seed} epsilon=${cfg.epsilon} topK=${cfg.topK} policy=${cfg.policy} active=${policyActive}`);

  const t0 = Date.now();
  const agg = await runSelfPlayChunked(E, cfg.games, {
    depth: cfg.depth,
    maxPlies: cfg.maxPlies,
    epsilon: cfg.epsilon,
    topK: cfg.topK
  }, cfg.chunk, '[run] match');
  const dt = Date.now() - t0;

  // ---- extract telemetry
  const tele = E.telemetryReport();
  const activeCells = (E.subit && E.subit.ACTIVE_POLICY_CELLS) || [];
  const summary = summarizeActiveCells(tele, activeCells);

  console.log(`[run] telemetry: visited=${tele.visitedCells}/${tele.cellCount} H=${tele.entropy.toFixed(2)} top5=${(tele.top5Share * 100).toFixed(0)}% signal=${tele.signalCells}`);
  console.log(`[run] active cells: n_total=${summary.totalN} weighted_mean=${summary.weightedMean.toFixed(2)} cp  signal=${summary.signalCells}/${summary.cellCount}`);

  // ---- output object
  const out = {
    config: {
      mode: 'match',
      games: cfg.games,
      depth: cfg.depth,
      maxPlies: cfg.maxPlies,
      seed: cfg.seed,
      epsilon: cfg.epsilon,
      topK: cfg.topK,
      policy: cfg.policy,
      policyActive,
      engineVersion: E.engineVersion,
      activeCells
    },
    results: agg,
    telemetry: {
      totalMoves: tele.totalMoves,
      visitedCells: tele.visitedCells,
      cellCount: tele.cellCount,
      visitedShare: tele.visitedShare,
      entropy: tele.entropy,
      effectiveCells: tele.effectiveCells,
      top5Share: tele.top5Share,
      signalCells: tele.signalCells,
      signalShare: tele.signalShare,
      topCells: tele.topCells,
      allCells: tele.allCells
    },
    activeCellsStats: summary,
    elapsedMs: dt
  };

  // ---- optional A/B comparison
  if (cfg.baseline){
    if (!fs.existsSync(cfg.baseline)){
      console.warn(`[run] --baseline not found: ${cfg.baseline} — skipping comparison`);
    } else {
      const base = JSON.parse(fs.readFileSync(cfg.baseline, 'utf8'));
      const baseMean = base.activeCellsStats ? base.activeCellsStats.weightedMean : 0;
      const rhoMean = summary.weightedMean;
      const delta = rhoMean - baseMean;
      const verdict = verdictFromDelta(delta);

      out.comparison = {
        baselineFile: cfg.baseline,
        baselinePolicy: base.config ? base.config.policy : null,
        baselineGames: base.config ? base.config.games : null,
        baselineMean: baseMean,
        rhoMean,
        delta,
        verdict
      };

      console.log('');
      console.log('=== A/B COMPARISON ===');
      console.log(`baseline : ${cfg.baseline} (policy=${base.config ? base.config.policy : '?'}, games=${base.config ? base.config.games : '?'})`);
      console.log(`baseline mean = ${baseMean.toFixed(2)} cp`);
      console.log(`current  mean = ${rhoMean.toFixed(2)} cp`);
      console.log(`Δmean        = ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} cp`);
      console.log(`verdict      = ${verdict}`);
      console.log('');
    }
  }

  writeJson(cfg.out, out);
  console.log(`[run] wrote ${cfg.out}`);
  return out;
}

// ---------- Main -------------------------------------------------------------

async function main(){
  const args = parseArgs(process.argv.slice(2));
  const cfg = cfgFromArgs(args);

  console.log(`[run] subit-chess runner v1.9.1`);
  console.log(`[run] mode=${cfg.mode} policy=${cfg.policy} games=${cfg.games} depth=${cfg.depth} seed=${cfg.seed}`);
  console.log(`[run] engine: ${cfg.html}`);

  if (!fs.existsSync(cfg.html)){
    throw new Error(`engine HTML not found: ${cfg.html}\n  hint: expected src/subit_chess_v1.9.1.html`);
  }

  const ctx = await loadEngine(cfg.html, { quiet: cfg.quiet, verbose: cfg.verbose });

  // deterministic RNG shared by both A and B with same seed
  seedRandom(ctx.window, cfg.seed);

  console.log(`[run] engine loaded: v${ctx.E.engineVersion}`);

  try {
    let out;
    if (cfg.mode === 'selfplay')      out = await modeSelfplay(ctx, cfg);
    else if (cfg.mode === 'teacher')  out = await modeTeacher(ctx, cfg);
    else if (cfg.mode === 'match')    out = await modeMatch(ctx, cfg);
    else throw new Error(`unknown mode: ${cfg.mode} (expected: selfplay | teacher | match)`);

    if (cfg.verbose && out){
      console.log('[run] result summary:');
      console.log(JSON.stringify({
        mode: cfg.mode,
        results: out.results,
        elapsedMs: out.elapsedMs,
        activeCellsMean: out.activeCellsStats ? out.activeCellsStats.weightedMean : undefined,
        signalCells: out.telemetry ? out.telemetry.signalCells : undefined
      }, null, 2));
    }
  } finally {
    try { ctx.window.close(); } catch (_){}
  }
}

// ---------- Entry ------------------------------------------------------------

let interrupted = false;
process.on('SIGINT', () => {
  if (interrupted){
    console.error('\n[run] forced exit');
    process.exit(130);
  }
  interrupted = true;
  console.error('\n[run] SIGINT — finishing current chunk and exiting...');
});

main()
  .then(() => { process.exit(0); })
  .catch((e) => {
    console.error('[run] ERROR:', e.message);
    if (process.env.DEBUG || process.env.VERBOSE) console.error(e);
    process.exit(1);
  });