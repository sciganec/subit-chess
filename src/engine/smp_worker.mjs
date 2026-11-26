/** Helper thread of the Lazy SMP pool (see smp.mjs): searches into the shared table until told to stop. */
import { parentPort, workerData } from 'node:worker_threads';
import { Engine } from './index.mjs';
import { TranspositionTable } from './search.mjs';
import { cloneParams } from './evaluate.mjs';

const { ttBits, ttBuffers, stopBuffer, params, index } = workerData;
const engine = new Engine(cloneParams(params), { ttBits, adaptiveTime: false, usePlans: false, useMeta: false });
engine.tt = new TranspositionTable(ttBits, params.search?.ttMaxAge ?? 0, true, ttBuffers);
engine.searcher.tt = engine.tt;
engine.searcher.stopFlag = new Int32Array(stopBuffer);

parentPort.on('message', (m) => {
  engine.setFEN(m.fen);
  engine.searcher.stopId = m.id;
  // helpers differ only in the depth they begin at, so that they do not all fill the table with the same entries
  engine.searcher.helperIndex = index;
  try {
    engine.searcher.search(engine.pos, { depth: m.depth || 64, timeMs: m.timeMs ? m.timeMs + 200 : 0, nodes: 0, helper: true });
  } catch (e) { /* a helper may never take the main thread down; its work is only a hint */ }
});
