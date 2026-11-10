#!/usr/bin/env node
'use strict';
/* SUBIT-CHESS v3.0.0-alpha engine checks (jsdom boot of the single-file HTML). */
const fs = require('fs'), path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.resolve(__dirname, '..', 'src', 'subit_chess_v3.0.0-alpha.html');
const FULL = process.argv.includes('--full');
let passed = 0, failed = 0; const fails = [];
function ok(name, cond, detail) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; fails.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); } }

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdom: ' + (e.message || e)));
  vc.on('error', m => errors.push('console.error: ' + m));
  const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'file://' + FILE });
  await new Promise(r => { if (dom.window.document.readyState === 'complete') r(); else dom.window.addEventListener('load', r, { once: true }); });
  await new Promise(r => setTimeout(r, 300));
  const E = dom.window.__subit, C = E.chess;

  console.log('[boot]');
  ok('engine exposes window.__subit', !!E && !!C);
  ok('no console errors during boot (Search ISA self-test included)', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log('[search]');
  const sc = E.searchConformance();
  ok('searchConformance: all checks pass', sc.ok === true, JSON.stringify((sc.results || []).filter(r => !r.ok).map(r => r.name)));
  {
    /* TT must not change the result when ordering-dependent pruning is off (noPrune) */
    const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'];
    const rows = E.benchTT(fens, 3, true);
    let same = 0; for (let i = 0; i < rows.length; i += 2){ const on = rows[i], off = rows[i+1]; if (on.score === off.score && JSON.stringify(on.move) === JSON.stringify(off.move)) same++; }
    ok('TT on/off equal score+move (noPrune, depth 3, 3 positions)', same === fens.length, same + '/' + fens.length);
  }

  console.log('[perft]');
  ok('perft(1) = 20', C.perft(C.initPosition(), 1) === 20);
  ok('perft(2) = 400', C.perft(C.initPosition(), 2) === 400);
  ok('perft(3) = 8902', C.perft(C.initPosition(), 3) === 8902);
  if (FULL) ok('perft(4) = 197281', C.perft(C.initPosition(), 4) === 197281);

  console.log('[hash53]');
  const sameWords = (a, b) => a.hash === b.hash && a.hashLo === b.hashLo && a.hashHi === b.hashHi;
  const fens = [
    ['castling-rich', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'],
    ['en passant', 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'],
    ['promotion', '8/P6k/8/8/8/8/8/K7 w - - 0 1'],
  ];
  for (const [label, fen] of fens) {
    const root = C.fromFEN(fen); C.setHash(root);
    let bad = 0, nodes = 0;
    const walk = (p, d) => { if (!d) return; for (const m of C.legalMoves(p)) { const nx = C.makeMovePure(p, m); const pr = C.clonePos(nx); C.setHash(pr); nodes++; if (!sameWords(pr, nx)) bad++; walk(nx, d - 1); } };
    walk(root, 3);
    ok(`incremental == recompute, depth-3 walk: ${label} (${nodes} nodes)`, bad === 0);
  }
  {
    const p = C.fromFEN(fens[0][1]); C.setHash(p); const before = C.clonePos(p); let restored = true;
    for (const m of C.legalMoves(p)) { const u = C.makeMove(p, m); C.unmakeMove(p, u); if (!sameWords(p, before)) { restored = false; break; } }
    ok('make/unmake restores hash words on all root moves', restored);
  }
  {
    let s = 2024, bad = 0, checks = 0;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let g = 0; g < 40; g++) {
      let p = C.initPosition(); C.setHash(p);
      for (let ply = 0; ply < 120; ply++) {
        const ms = C.legalMoves(p); if (!ms.length) break;
        p = C.makeMovePure(p, ms[Math.floor(rnd() * ms.length)]);
        const pr = C.clonePos(p); C.setHash(pr); checks++; if (!sameWords(pr, p)) bad++;
      }
    }
    ok(`random playouts: incremental == recompute (${checks} plies)`, bad === 0);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`engine-v3: ${passed} passed, ${failed} failed`);
  for (const f of fails) console.log('  • ' + f);
  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
