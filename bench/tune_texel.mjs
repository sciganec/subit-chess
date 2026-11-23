import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Position } from '../src/engine/core.mjs';
import { evaluateFast, DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseEPD(line) {
  const s = line.trim();
  if (!s || s.startsWith('#')) return null;
  // FEN is first 4/6 fields; result may be in c9 or as ; result
  const parts = s.split(/\s+/);
  const fen = parts.slice(0, 6).join(' ');
  let result = null;
  const m = s.match(/\b(1-0|0-1|1\/2-1\/2)\b/);
  if (m) result = m[1] === '1-0' ? 1 : m[1] === '0-1' ? 0 : 0.5;
  const c9 = s.match(/c9\s+"([^"]+)"/);
  if (c9) result = c9[1] === '1-0' ? 1 : c9[1] === '0-1' ? 0 : 0.5;
  const r = s.match(/\bresult\s*[:=]\s*([01](?:\.5)?)/i);
  if (r) result = Number(r[1]);
  return { fen, result };
}

function sigmoid(x, k) { return 1 / (1 + Math.exp(-k * x / 400)); }

function mse(data, params, k) {
  let sum = 0, n = 0;
  for (const row of data) {
    if (row.result == null) continue;
    let p;
    try { p = new Position().setFEN(row.fen); } catch { continue; }
    const s = evaluateFast(p, params);
    const pred = sigmoid(s, k);
    const err = pred - row.result;
    sum += err * err; n++;
  }
  return n ? sum / n : Infinity;
}

function tune(train, val, base, keys, { iters = 60, step = 0.05, k = 1.2 } = {}) {
  let best = cloneParams(base);
  let bestMse = mse(train, best, k);
  const hist = [];
  for (let it = 0; it < iters; it++) {
    let improved = false;
    for (const key of keys) {
      const orig = getPath(best, key);
      if (typeof orig !== 'number') continue;
      for (const dir of [1, -1]) {
        const cand = cloneParams(best);
        setPath(cand, key, orig + dir * Math.max(1, Math.abs(orig) * step));
        const m = mse(train, cand, k);
        if (m < bestMse) { best = cand; bestMse = m; improved = true; }
      }
    }
    const vm = val.length ? mse(val, best, k) : null;
    hist.push({ it, trainMse: bestMse, valMse: vm });
    if (!improved) break;
  }
  return { best, bestMse, valMse: val.length ? mse(val, best, k) : null, hist };
}

function getPath(obj, pathStr) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}
function setPath(obj, pathStr, val) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = val;
}

function loadEPD(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split(/\r?\n/).map(parseEPD).filter(Boolean);
}

const trainFile = process.argv[2] || path.join(here, 'fens', 'T_train.epd');
const valFile = process.argv[3] || path.join(here, 'fens', 'V_val.epd');
const train = loadEPD(trainFile);
const val = fs.existsSync(valFile) ? loadEPD(valFile) : [];
const labeledTrain = train.filter(x => x.result != null);
const labeledVal = val.filter(x => x.result != null);

console.log(`loaded train=${train.length} labeled=${labeledTrain.length} val=${val.length} labeled=${labeledVal.length}`);
if (!labeledTrain.length) {
  console.log('No labeled results found. Provide EPD with 1-0/0-1/1/2-1/2 or c9/result labels.');
  console.log('Pipeline is ready; no tuning run performed.');
  process.exit(0);
}

const keys = ['tempo','eval.mobility.knight','eval.mobility.bishop','eval.mobility.rook','eval.bishopPair','eval.rookOpen','eval.rookSemiOpen','eval.kingShield','eval.kingOpenFile','eval.kingAttack'];
const base = cloneParams(DEFAULT_PARAMS);
const r = tune(labeledTrain, labeledVal, base, keys, { iters: 40, step: 0.08, k: 1.2 });
console.log('baseTrainMse', mse(labeledTrain, base, 1.2));
console.log('bestTrainMse', r.bestMse);
console.log('bestValMse', r.valMse);
console.log('improvedKeys', keys.filter(k => getPath(r.best,k)!==getPath(base,k)).map(k=>`${k}=${getPath(r.best,k)}`));
