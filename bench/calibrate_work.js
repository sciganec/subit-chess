#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

async function main(){
  console.log('=== SUBIT Section 7.2 Total Work Calibration ===');
  const htmlPath = path.resolve(__dirname, '..', 'src', 'subit_chess_v1.9.1.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'file://' + htmlPath
  });

  await new Promise(r => setTimeout(r, 400));
  const E = dom.window.__subit;
  if (!E) throw new Error('__subit not found');

  const chess = E.chess;
  const subit = E.subit;
  const subitState = E.subitState;

  // Test positions
  const POSITIONS = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
    'r1bq1rk1/pp2bppp/2n2n2/3p4/3P4/2NBB3/PP3PPP/R2QK2R w KQ - 0 1',
    '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1'
  ].map(f => chess.fromFEN(f));

  // 1. Measure one_search_node
  console.log('1. Measuring search node time...');
  let totalNodes = 0;
  let totalSearchTimeMs = 0;
  const weights = { material:1, positional:1, mobility:1, king:1, pawns:1, bishop:1 };
  
  for (const pos of POSITIONS){
    const s = E.searchMod.createSearch(weights, { maxNodes: 50000 });
    const t0 = performance.now();
    s.searchRoot(pos, 4, null, 4);
    const dt = performance.now() - t0;
    totalSearchTimeMs += dt;
    totalNodes += s.getNodes();
  }
  const avgNodeUs = (totalSearchTimeMs / totalNodes) * 1000;
  console.log('   Nodes: ' + totalNodes + ', Time: ' + totalSearchTimeMs.toFixed(2) + 'ms -> ' + avgNodeUs.toFixed(3) + ' us/node');

  // 2. Measure compute_S0
  console.log('2. Measuring compute_S0 time (20,000 calls)...');
  const N_S0 = 20000;
  const t0_S0 = performance.now();
  for (let i = 0; i < N_S0; i++){
    subit.computeS(POSITIONS[i % POSITIONS.length]);
  }
  const dt_S0 = performance.now() - t0_S0;
  const avgS0Us = (dt_S0 / N_S0) * 1000;
  console.log('   Time: ' + dt_S0.toFixed(2) + 'ms -> ' + avgS0Us.toFixed(3) + ' us/call');

  // 3. Measure update_omega
  console.log('3. Measuring update_omega time (50,000 calls)...');
  const N_OMEGA = 50000;
  const sampleHistories = [
    [10, 15, 12, 14],
    [-20, 40, -10, 60],
    [5, 5, 5, 5],
    [10, 30, 50, 70]
  ];
  const t0_O = performance.now();
  for (let i = 0; i < N_OMEGA; i++){
    subit.classifyOmegaSearch(sampleHistories[i % sampleHistories.length]);
  }
  const dt_O = performance.now() - t0_O;
  const avgOmegaUs = (dt_O / N_OMEGA) * 1000;
  console.log('   Time: ' + dt_O.toFixed(2) + 'ms -> ' + avgOmegaUs.toFixed(3) + ' us/call');

  // 4. Measure lookup_pi
  console.log('4. Measuring lookup_pi time (50,000 calls)...');
  const N_PI = 50000;
  const t0_PI = performance.now();
  for (let i = 0; i < N_PI; i++){
    subitState.policyFor(POSITIONS[i % POSITIONS.length]);
  }
  const dt_PI = performance.now() - t0_PI;
  const avgPiUs = (dt_PI / N_PI) * 1000;
  console.log('   Time: ' + dt_PI.toFixed(2) + 'ms -> ' + avgPiUs.toFixed(3) + ' us/call');

  // Compute relative constants
  const c_S = avgS0Us / avgNodeUs;
  const c_Omega = avgOmegaUs / avgNodeUs;
  const c_Pi = avgPiUs / avgNodeUs;

  console.log('');
  console.log('=== Section 7.2 CALIBRATED CONSTANTS ===');
  console.log('c_S     = ' + c_S.toFixed(4) + ' (equiv nodes / S0 call)');
  console.log('c_Omega = ' + c_Omega.toFixed(4) + ' (equiv nodes / Omega call)');
  console.log('c_pi    = ' + c_Pi.toFixed(4) + ' (equiv nodes / pi lookup)');

  const report = {
    hardware: {
      cpuModel: os.cpus()[0].model,
      cpuCores: os.cpus().length,
      totalRamGb: +(os.totalmem() / (1024**3)).toFixed(1),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      jsdomVersion: require('jsdom/package.json').version
    },
    engineVersion: E.engineVersion,
    calibratedAt: new Date().toISOString(),
    rawTimingsUs: {
      searchNode: +avgNodeUs.toFixed(4),
      computeS0: +avgS0Us.toFixed(4),
      updateOmega: +avgOmegaUs.toFixed(4),
      lookupPi: +avgPiUs.toFixed(4)
    },
    constants: {
      c_S: +c_S.toFixed(4),
      c_Omega: +c_Omega.toFixed(4),
      c_Pi: +c_Pi.toFixed(4)
    }
  };

  const outFile = path.join(__dirname, 'WORK_CONSTANTS.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log('Wrote calibrated constants to ' + outFile);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
