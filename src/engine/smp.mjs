/**
 * SUBIT-CHESS — Lazy SMP helper threads (Node only; not part of the browser bundle).
 *
 * The main thread keeps its ordinary synchronous search and remains the only decision maker: the helpers search the
 * same root into a shared transposition table and publish nothing except TT entries, so with `threads = 1` nothing
 * changes and with `threads > 1` the move is still chosen by the main search (UCA-INV-005; heuristics and extra
 * effort may reorder and speed up, never replace the decision). Helpers get no repetition history: they only warm the
 * table, and a wrong draw judgement there costs at most a poorer hint.
 *
 *   const pool = createPool(engine, 3);   // engine + 3 helpers
 *   engine.attachPool(pool);               // done by createPool
 *   ... engine.search(...) ...             // helpers run while the main thread searches
 *   pool.close();
 */
import { Worker } from 'node:worker_threads';
import { TranspositionTable } from './search.mjs';

export function createPool(engine, helpers, opts = {}) {
  const bits = opts.ttBits ?? engine.opts.ttBits ?? 18;
  const tt = new TranspositionTable(bits, engine.params.search?.ttMaxAge ?? 0, true);
  const stopFlag = new Int32Array(new SharedArrayBuffer(4));
  const url = new URL('./smp_worker.mjs', import.meta.url);
  const workers = [];
  for (let i = 0; i < helpers; i++) {
    const w = new Worker(url, { workerData: { ttBits: bits, ttBuffers: tt.buffers(), stopBuffer: stopFlag.buffer, params: engine.params, index: i } });
    w.unref();
    workers.push(w);
  }
  let id = 0;
  const pool = {
    tt, workers, helpers,
    /** Start every helper on `fen` for at most `timeMs` (0 = until stop) or `depth`. */
    start(fen, timeMs, depth) {
      id++;
      for (const w of workers) w.postMessage({ id, fen, timeMs: timeMs || 0, depth: depth || 64 });
    },
    /** Tell the helpers of the current search to stop. */
    stop() { if (id) Atomics.store(stopFlag, 0, id); },
    close() { pool.stop(); for (const w of workers) w.terminate(); workers.length = 0; }
  };
  engine.attachPool(pool);
  return pool;
}
