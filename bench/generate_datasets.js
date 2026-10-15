#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

function sha256(content){
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function seedRandom(window, seed){
  let s = (seed >>> 0) || 1;
  window.Math.random = function(){
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function collectUniqueFens(E, window, cfg, excludeSet){
  seedRandom(window, cfg.seed);
  E.setPolicyEnabled(false); // baseline reference policy

  const chess = E.chess;
  const weights = { material:1, positional:1, mobility:1, king:1, pawns:1, bishop:1 };

  const fens = new Set();
  const list = [];
  let games = 0;
  const t0 = Date.now();

  console.log('[dataset] Target: ' + cfg.target + ' FENs (seed=' + cfg.seed + ', depth=' + cfg.depth + ', eps=' + cfg.epsilon + ')');

  while (list.length < cfg.target){
    games++;
    let pos = chess.initPosition();
    const posCounts = new Map();
    posCounts.set(pos.hash, 1);
    let ply = 0;

    while (ply < cfg.maxPlies){
      const st = chess.gameStatus(pos, posCounts);
      if (st.over) break;

      const fen = chess.toFEN(pos);
      if (!fens.has(fen) && (!excludeSet || !excludeSet.has(fen))){
        fens.add(fen);
        list.push(fen);
        if (list.length >= cfg.target) break;
      }

      const r = await E.searchAsync(pos, cfg.depth, weights, {
        extBudget: 4, lmrThreshold: 4, earlyStop: false, positionHistory: posCounts
      });
      if (!r || !r.best) break;

      let m;
      if (cfg.epsilon > 0 && r.all && r.all.length > 1 && Math.random() < cfg.epsilon){
        const k = Math.min(cfg.topK, r.all.length);
        m = r.all[Math.floor(Math.random() * k)].move;
      } else {
        m = r.best.move;
      }

      pos = chess.makeMovePure(pos, m);
      posCounts.set(pos.hash, (posCounts.get(pos.hash)||0) + 1);
      ply++;
    }

    if (games % 20 === 0 || list.length >= cfg.target){
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      console.log('   games: ' + games + ' -> unique FENs: ' + list.length + '/' + cfg.target + ' [' + el + 's]');
    }
  }

  return list;
}

async function main(){
  console.log('=== SUBIT Section 4 Dataset Generation ===');
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

  const outDir = path.join(__dirname, 'fens');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Generate T_train (5000 FENs, seed A = 101)
  console.log('\n1. Generating T_train (5000 FENs)...');
  const tTrain = await collectUniqueFens(E, dom.window, {
    target: 5000,
    seed: 101,
    depth: 2,
    maxPlies: 100,
    epsilon: 0.2,
    topK: 3
  }, null);

  const trainFile = path.join(outDir, 'T_train.epd');
  fs.writeFileSync(trainFile, tTrain.join('\n') + '\n');
  const trainHash = sha256(fs.readFileSync(trainFile, 'utf8'));
  console.log('   Saved ' + tTrain.length + ' FENs to ' + trainFile);
  console.log('   SHA256: ' + trainHash);

  // 2. Generate V_val (1000 FENs, seed B = 202, disjoint from T_train)
  console.log('\n2. Generating V_val (1000 FENs, disjoint)...');
  const trainSet = new Set(tTrain);
  const vVal = await collectUniqueFens(E, dom.window, {
    target: 1000,
    seed: 202,
    depth: 2,
    maxPlies: 100,
    epsilon: 0.2,
    topK: 3
  }, trainSet);

  // Verify strict separation
  const overlap = vVal.filter(f => trainSet.has(f));
  if (overlap.length > 0){
    throw new Error('Separation violation! Found ' + overlap.length + ' overlapping FENs.');
  }
  console.log('   Strict separation verified: T_train ∩ V_val = ∅ (overlap = 0)');

  const valFile = path.join(outDir, 'V_val.epd');
  fs.writeFileSync(valFile, vVal.join('\n') + '\n');
  const valHash = sha256(fs.readFileSync(valFile, 'utf8'));
  console.log('   Saved ' + vVal.length + ' FENs to ' + valFile);
  console.log('   SHA256: ' + valHash);

  // 3. Write CHECKSUMS
  const checksumsFile = path.join(outDir, 'CHECKSUMS');
  const checksumContent = [
    '# SUBIT Dataset Checksums (Section 4)',
    '# Generated at: ' + new Date().toISOString(),
    '# Engine version: ' + E.engineVersion,
    '',
    trainHash + '  T_train.epd',
    valHash + '  V_val.epd',
    ''
  ].join('\n');
  fs.writeFileSync(checksumsFile, checksumContent);
  console.log('\nSaved checksums to ' + checksumsFile);
  console.log('\n=== Section 4 Dataset Generation Complete ===');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
