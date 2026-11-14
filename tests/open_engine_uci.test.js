'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { UciEngine, parseInfo } = require('../experiments/open-engine/uci-adapter');

async function main() {
  const parsed = parseInfo('info depth 14 seldepth 19 multipv 2 score mate -3 nodes 45000 nps 90000 time 500 pv a2a4 a7a5');
  assert.equal(parsed.depth, 14);
  assert.equal(parsed.multipv, 2);
  assert.deepEqual(parsed.score, { type: 'mate', value: -3 });
  assert.deepEqual(parsed.pv, ['a2a4', 'a7a5']);

  const engine = new UciEngine(process.execPath, [path.join(__dirname, 'fixtures', 'fake_uci_engine.js')], { handshakeTimeoutMs: 3000 });
  try {
    await engine.start();
    const result = await engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 8, multiPV: 2 });
    assert.equal(result.bestmove, 'e2e4');
    assert.equal(result.ponder, 'e7e5');
    assert.equal(result.info.length, 2);
    assert.equal(result.info[0].score.value, 25);
    assert.equal(result.info[1].multipv, 2);
    await engine.setOption('Threads', 1);
  } finally {
    await engine.close();
  }
  console.log('Open-engine UCI adapter tests: PASS (info parser, handshake, ready, MultiPV, score/PV parsing, bestmove/ponder, setoption, shutdown)');
}
main().catch(e => { console.error('Open-engine UCI adapter tests: FAIL', e); process.exit(1); });
