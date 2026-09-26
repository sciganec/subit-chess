#!/usr/bin/env node
'use strict';

/* ============================================================================
   subit-chess — single-file test suite
   ----------------------------------------------------------------------------
   No test framework. Pure asserts. Exit code 0 on pass, 1 on fail.

   Usage:
     node tests/test.js                  # fast tests (skips perft(4))
     node tests/test.js --full           # include perft(4)  (~20-40s)
     node tests/test.js --only-perft     # only perft tests
     node tests/test.js --only-policy    # only ρ_s tests
     node tests/test.js --only-s0        # only S₀ tests
     node tests/test.js --only-engine    # only engine invariants
     node tests/test.js --verbose        # print extra on pass

   Requires: jsdom
   Engine:   src/subit_chess_v1.9.1.html  (single file, exposes window.__subit)
   ========================================================================= */

const fs   = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// ---------- CLI --------------------------------------------------------------

function parseArgs(argv){
  const a = {};
  for (let i = 0; i < argv.length; i++){
    const s = argv[i];
    if (!s.startsWith('--')) continue;
    const k = s.slice(2);
    const n = argv[i + 1];
    if (n !== undefined && !n.startsWith('--')){ a[k] = n; i++; }
    else a[k] = true;
  }
  return a;
}

const ARGS = parseArgs(process.argv.slice(2));
const ONLY = {
  perft:  !!ARGS['only-perft'],
  policy: !!ARGS['only-policy'],
  s0:     !!ARGS['only-s0'],
  engine: !!ARGS['only-engine']
};
const ANY_ONLY = ONLY.perft || ONLY.policy || ONLY.s0 || ONLY.engine;
const FULL     = !!ARGS.full;
const VERBOSE  = !!ARGS.verbose;

// ---------- Mini test harness -------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];
let currentGroup = '';

function group(name){ currentGroup = name; console.log(`\n[${name}]`); }

function skipGroup(name){
  if (!ANY_ONLY) return false;
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const have = Object.keys(ONLY).filter(k => ONLY[k]).map(k => k.toLowerCase());
  return !have.some(h => want.includes(h) || h.includes(want));
}

function ok(name, cond, extra){
  if (cond){
    passed++;
    if (VERBOSE) console.log(`  ok    ${name}${extra ? '  ' + extra : ''}`);
    else process.stdout.write('.');
  } else {
    failed++;
    failures.push(`[${currentGroup}] ${name}${extra ? '  ' + extra : ''}`);
    process.stdout.write('F');
    if (!VERBOSE) console.log(`\n  FAIL  ${name}${extra ? '  ' + extra : ''}`);
  }
}

function eq(name, a, b){
  ok(name, a === b, `expected=${b} got=${a}`);
}

function eqApprox(name, a, b, eps = 1e-6){
  ok(name, Math.abs(a - b) <= eps, `expected≈${b} got=${a} (±${eps})`);
}

function okType(name, val, type){
  ok(name, typeof val === type, `typeof=${typeof val} expected=${type}`);
}

function hasKeys(name, obj, keys){
  if (!obj){ ok(name, false, 'obj is null/undefined'); return; }
  const missing = keys.filter(k => !(k in obj));
  ok(name, missing.length === 0, missing.length ? `missing=${missing.join(',')}` : '');
}

function summary(){
  console.log('\n');
  console.log('='.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length){
    console.log('\nFailures:');
    for (const f of failures) console.log(`  • ${f}`);
  }
  console.log('='.repeat(60));
  return failed === 0;
}

// ---------- Engine loader ----------------------------------------------------

async function loadEngine(htmlPath){
  if (!fs.existsSync(htmlPath)) throw new Error(`engine not found: ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, 'utf8');

  const vc = new VirtualConsole();
  // Silence engine logging during tests unless --verbose
  if (VERBOSE){
    vc.on('log',   (...a) => console.log('[engine]', ...a));
    vc.on('warn',  (...a) => console.warn('[engine]', ...a));
    vc.on('error', (...a) => console.error('[engine]', ...a));
  }

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'file://' + htmlPath
  });

  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('engine load timeout (30s)')), 30000);
    if (dom.window.document.readyState === 'complete'){
      clearTimeout(to); res(); return;
    }
    dom.window.addEventListener('load', () => { clearTimeout(to); res(); }, { once: true });
  });

  await new Promise(r => setTimeout(r, 200));

  const E = dom.window.__subit;
  if (!E) throw new Error('window.__subit not exposed — engine failed to init');
  return { dom, window: dom.window, E };
}

// ---------- Test groups ------------------------------------------------------

function testEngineInvariants(E){
  group('engine');
  if (skipGroup('engine')) { console.log('  (skipped)'); return; }

  // 1. perft shallow
  eq('perft(1) = 20',     E.perft(1), 20);
  eq('perft(2) = 400',    E.perft(2), 400);
  eq('perft(3) = 8902',   E.perft(3), 8902);

  // 2. hash consistency — make/unmake restores hash on all legal moves
  {
    const chess = E.chess;
    const p = chess.initPosition();
    const h0 = p.hash;
    const moves = chess.legalMoves(p);
    let bad = null;
    for (const m of moves){
      const u = chess.makeMove(p, m);
      chess.unmakeMove(p, u);
      if (p.hash !== h0){ bad = m; break; }
    }
    ok('hash restored after make/unmake (all root moves)', bad === null, bad ? `at move ${chess.moveToUci(bad)}` : '');
  }

  // 3. hash consistency — deeper (perft-like walk, depth 2)
  {
    const chess = E.chess;
    const p = chess.initPosition();
    const h0 = p.hash;
    const moves1 = chess.legalMoves(p);
    let bad = null;
    outer:
    for (const m1 of moves1){
      const u1 = chess.makeMove(p, m1);
      const moves2 = chess.legalMoves(p);
      for (const m2 of moves2){
        const u2 = chess.makeMove(p, m2);
        chess.unmakeMove(p, u2);
        if (p.hash !== (h0 ^ chess.fullHash(p) ^ chess.fullHash(p))){ /* no-op sanity */ }
      }
      chess.unmakeMove(p, u1);
      if (p.hash !== h0){ bad = m1; break outer; }
    }
    ok('hash restored after depth-2 walk', bad === null, bad ? `at move ${chess.moveToUci(bad)}` : '');
  }

  // 4. color symmetry — eval(W) + eval(B) = 0 at start
  {
    const chess = E.chess;
    const w = chess.initPosition();
    const b = chess.clonePos(w);
    b.turn = 'b';
    b.hash = chess.fullHash(b);
    const delta = chess.evalWhiteObjective(w) + chess.evalWhiteObjective(b);
    eq('color-symmetry delta = 0', delta, 0);
  }

  // 5. starting eval ≈ +10 cp (white POV)
  {
    const ev = E.eval();
    ok('starting eval ∈ [0, 20] cp', ev >= 0 && ev <= 20, `eval=${ev}`);
  }

  // 6. FEN roundtrip
  {
    const chess = E.chess;
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const p = chess.fromFEN(startFen);
    ok('fromFEN(start) parses', p !== null);
    if (p){
      eq('toFEN(fromFEN(start)) === start', chess.toFEN(p), startFen);
    }
  }

  // 7. gameStatus: start position is not over
  {
    const st = E.chess.gameStatus(E.chess.initPosition(), null);
    eq('gameStatus(start).over = false', st.over, false);
  }
}

function testS0(E){
  group('S0');
  if (skipGroup('S0')) { console.log('  (skipped)'); return; }

  // 1. shape 4 × 3 × 4
  eq('WHO_LIST.length = 4',   E.subit.WHO_LIST.length,   4);
  eq('WHERE_LIST.length = 3', E.subit.WHERE_LIST.length, 3);
  eq('WHEN_LIST.length = 4',  E.subit.WHEN_LIST.length,  4);
  eq('cellCount = 48',        E.subit.WHO_LIST.length * E.subit.WHERE_LIST.length * E.subit.WHEN_LIST.length, 48);

  // 2. starting classification
  {
    const s = E.computeS();
    hasKeys('computeS() returns who/where/when', s, ['who', 'where', 'when']);
    eq('who   = QUIET',   s.who,   'QUIET');
    eq('where = CENTER',  s.where, 'CENTER');
    eq('when  = OPENING', s.when,  'OPENING');
  }

  // 3. visitedShare uses 48, not 64
  {
    const r = E.telemetryReport();
    eq('cellCount = 48', r.cellCount, 48);
    ok('visitedShare <= 1', r.visitedShare <= 1, `visitedShare=${r.visitedShare}`);
    ok('visitedShare >= 0', r.visitedShare >= 0, `visitedShare=${r.visitedShare}`);
  }

  // 4. grammar has exactly 48 cells
  {
    const keys = Object.keys(E.subitState.grammarCells);
    eq('grammarCells has 48 keys', keys.length, 48);
  }
}

function testPolicy(E){
  group('policy');
  if (skipGroup('policy')) { console.log('  (skipped)'); return; }

  // 1. ACTIVE_POLICY_CELLS
  const active = E.subit.ACTIVE_POLICY_CELLS;
  ok('ACTIVE_POLICY_CELLS defined', Array.isArray(active));
  eq('8 active cells', active.length, 8);
  ok('all keys look like WHO|WHERE|WHEN', active.every(k => /^[A-Z]+\|[A-Z]+\|[A-Z]+$/.test(k)));

  // 2. policyFor shape
  {
    const p = E.policyFor();
    okType('policyFor returns object',   p, 'object');
    okType('policy.d_base is number',    p.d_base, 'number');
    okType('policy.lmr_mult is number',  p.lmr_mult, 'number');
    okType('policy.null_enabled is bool',p.null_enabled, 'boolean');
    okType('policy.futility_mult is num',p.futility_mult, 'number');
    hasKeys('policy has all 4 fields', p, ['d_base', 'lmr_mult', 'null_enabled', 'futility_mult']);
  }

  // 3. searchParamsFor shape
  {
    const sp = E.searchParamsFor();
    hasKeys('searchParamsFor has expected keys', sp,
      ['policy', 'extBudget', 'lmrThreshold', 'nullReduction', 'futilityMargin']);
    okType('searchParams.nullReduction is number', sp.nullReduction, 'number');
    okType('searchParams.futilityMargin is number', sp.futilityMargin, 'number');
    okType('searchParams.extBudget is number', sp.extBudget, 'number');
    okType('searchParams.lmrThreshold is number', sp.lmrThreshold, 'number');
  }

  // 4. policy defaults — without rhoSMap, policyFor = baseline
  {
    // force baseline
    const savedMap = E.subitState.rhoSMap;
    const savedEnabled = E.subitState.policyEnabled;
    E.subitState.rhoSMap = null;
    E.subitState.policyEnabled = true;
    const p = E.policyFor();
    eq('baseline d_base = 0',        p.d_base, 0);
    eq('baseline lmr_mult = 0',      p.lmr_mult, 0);
    eq('baseline null_enabled = true', p.null_enabled, true);
    eq('baseline futility_mult = 0', p.futility_mult, 0);
    // restore
    E.subitState.rhoSMap = savedMap;
    E.subitState.policyEnabled = savedEnabled;
  }

  // 5. setPolicyEnabled(false) → policyFor returns baseline
  {
    const saved = E.subitState.policyEnabled;
    E.setPolicyEnabled(false);
    const p = E.policyFor();
    eq('policy disabled → d_base = 0', p.d_base, 0);
    eq('policy disabled → null_enabled = true', p.null_enabled, true);
    E.setPolicyEnabled(saved);
  }

  // 6. initRhoSFromTeacher — fake teacher report
  {
    const savedMap = E.subitState.rhoSMap;
    const savedFrozen = E.subitState.rhoSFrozen;

    const fake = [
      { key: 'QUIET|CENTER|OPENING',    n: 100, mean: +50, variance: 10000, tStat: 5.0 },
      { key: 'QUIET|CENTER|MIDDLEGAME', n: 100, mean:   0, variance: 10000, tStat: 0.0 },
      { key: 'QUIET|GLOBAL|MIDDLEGAME', n:  50, mean: +20, variance: 10000, tStat: 2.0 },
      { key: 'PRESSURE|CENTER|OPENING', n:  50, mean: +40, variance: 10000, tStat: 2.0 },
      { key: 'DEFENCE|CENTER|TACTICAL', n:  30, mean: -60, variance: 15000, tStat: 2.5 },
      { key: 'QUIET|CENTER|TACTICAL',   n:  30, mean: -30, variance: 10000, tStat: 2.0 },
      { key: 'QUIET|GLOBAL|OPENING',    n:  20, mean: +10, variance: 10000, tStat: 2.0 },
      { key: 'QUIET|CENTER|ENDGAME',    n:  20, mean: -20, variance: 10000, tStat: 2.0 }
    ];

    const map = E.subitState.initRhoSFromTeacher(fake);
    ok('initRhoSFromTeacher returns map', map && typeof map === 'object');
    eq('map has 8 cells', Object.keys(map).length, 8);
    eq('rhoSFrozen = true after init', E.subitState.rhoSFrozen, true);

    // check monotonicity: positive mean → higher d_base
    const posOpening = map['QUIET|CENTER|OPENING'];
    const neuMiddlegame = map['QUIET|CENTER|MIDDLEGAME'];
    ok('positive mean → higher d_base than neutral',
       posOpening.d_base > neuMiddlegame.d_base,
       `pos=${posOpening.d_base.toFixed(2)} neu=${neuMiddlegame.d_base.toFixed(2)}`);

    // bounds
    for (const k of Object.keys(map)){
      const p = map[k];
      ok(`${k} d_base ∈ [1,4]`,  p.d_base >= 1 && p.d_base <= 4);
      ok(`${k} r_LMR ∈ [1,3]`,   p.r_LMR >= 1 && p.r_LMR <= 3);
      ok(`${k} r_null ∈ [1,3]`,  p.r_null >= 1 && p.r_null <= 3);
      ok(`${k} b_fut ∈ [80,250]`,p.b_futility >= 80 && p.b_futility <= 250);
    }

    // restore
    E.subitState.rhoSMap = savedMap;
    E.subitState.rhoSFrozen = savedFrozen;
  }

  // 7. policyFor with active cell returns something meaningful
  {
    const savedMap = E.subitState.rhoSMap;
    const savedFrozen = E.subitState.rhoSFrozen;
    const savedEnabled = E.subitState.policyEnabled;

    // install a strong positive cell for start position
    E.subitState.rhoSMap = {
      'QUIET|CENTER|OPENING': {
        d_base: 3, r_LMR: 1, r_null: 3, b_futility: 200,
        n: 100, mean: +50, t: 5.0
      }
    };
    E.subitState.rhoSFrozen = true;
    E.subitState.policyEnabled = true;

    const p = E.policyFor();
    // d_base: 3-2=+1
    eq('active cell → d_base = +1', p.d_base, +1);
    // lmr_mult: round(2 - 1) = +1
    eq('active cell → lmr_mult = +1', p.lmr_mult, +1);
    // null: r_null = 3 >= 1.5 → true
    eq('active cell → null_enabled = true', p.null_enabled, true);
    // futility_mult: round((200-150)/50) = +1
    eq('active cell → futility_mult = +1', p.futility_mult, +1);

    const sp = E.searchParamsFor();
    eq('searchParams nullReduction = 3', sp.nullReduction, 3);
    eq('searchParams futilityMargin = 200', sp.futilityMargin, 200);

    // restore
    E.subitState.rhoSMap = savedMap;
    E.subitState.rhoSFrozen = savedFrozen;
    E.subitState.policyEnabled = savedEnabled;
  }

  // 8. console API existence
  {
    const api = [
      'perft', 'computeS', 'policyFor', 'searchParamsFor',
      'setPolicyEnabled', 'activateRhoS', 'rhoSReport',
      'selfPlay', 'batchTeacherEval', 'teacherClear', 'telemetryClear',
      'teacherReport', 'telemetryReport'
    ];
    for (const name of api){
      ok(`window.__subit.${name} exists`, typeof E[name] === 'function',
         `typeof=${typeof E[name]}`);
    }
  }
}

function testPerft(E){
  group('perft');
  if (skipGroup('perft')) { console.log('  (skipped)'); return; }

  // Already covered shallow in engine group, but keep for --only-perft
  eq('perft(1) = 20',   E.perft(1), 20);
  eq('perft(2) = 400',  E.perft(2), 400);
  eq('perft(3) = 8902', E.perft(3), 8902);

  if (FULL){
    const t0 = Date.now();
    const n4 = E.perft(4);
    const dt = Date.now() - t0;
    eq('perft(4) = 197281', n4, 197281);
    console.log(`\n  perft(4) took ${dt}ms`);
  } else {
    console.log('\n  (skipped perft(4) — use --full to include)');
  }
}

// ---------- Main -------------------------------------------------------------

async function main(){
  console.log('subit-chess test suite');
  console.log(`mode: ${ANY_ONLY ? Object.keys(ONLY).filter(k => ONLY[k]).join(',') : 'all'}` +
              `${FULL ? ' + full' : ''}`);

  const projectRoot = path.resolve(__dirname, '..');
  const html = path.join(projectRoot, 'src', 'subit_chess_v1.9.1.html');
  console.log(`engine: ${html}`);

  const ctx = await loadEngine(html);
  const E = ctx.E;

  console.log(`engine loaded: v${E.engineVersion}\n`);

  try {
    testPerft(E);
    testEngineInvariants(E);
    testS0(E);
    testPolicy(E);
  } finally {
    try { ctx.window.close(); } catch (_){}
  }

  const okAll = summary();
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error('\n[test] FATAL:', e.message);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});