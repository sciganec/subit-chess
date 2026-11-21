/**
 * Gate 7 harness checks (ROADMAP §Gate 7; docs/theory/45 §16; docs/theory/72).
 *
 * These are not strength tests. They check that the measurement is deterministic,
 * that a tie is not silently reported as a driver, that each component maps to
 * a real budget, and that an already-proven mate is not disturbed by the extra
 * verification budget.
 */
import {
  runGate, uniqueDriver, targetedConfig, pass,
  MATE_FENS, DRIVER_TARGET, MISMATCH_DRIVER
} from '../bench/gate7.mjs';
import { U_TYPES } from '../src/engine/uncertainty.mjs';
import { MATE_THRESHOLD } from '../src/engine/search.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

/* ---------------- a driver must be unique ---------------- */
{
  const unique = { vector: [0.2, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] };
  check('uniqueDriver picks the strict maximum', uniqueDriver(unique) === 'tactical');
  const tied = { vector: [0.2, 0.8, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1] };
  check('uniqueDriver rejects a tie', uniqueDriver(tied) === null);
  check('uniqueDriver rejects a missing profile', uniqueDriver(null) === null);
}

/* ---------------- every component has a budget and a wrong control ---------------- */
{
  for (const k of U_TYPES) {
    const cfg = targetedConfig(k);
    check(`targetedConfig(${k}) exists`, !!cfg && ['depth', 'width', 'structural'].includes(cfg.target));
    check(`mismatch control differs for ${k}`, MISMATCH_DRIVER[k] !== k);
  }
  check('depth target adds a ply', targetedConfig('search').depthBonus === 1);
  check('width target widens qsearch', targetedConfig('tactical').patch.search.qsearch.maxChecks > 4);
  check('structural target never changes material weights',
    targetedConfig('model').patch.w === undefined);
  check('driver map covers exactly eight components',
    Object.keys(DRIVER_TARGET).length === U_TYPES.length);
}

/* ---------------- deterministic measurement ---------------- */
{
  const opts = { suite: 'bench/fens/openings.epd', depth: 3, limit: 2, quiet: true };
  const a = runGate(opts);
  const b = runGate(opts);
  const shape = (r) => JSON.stringify({
    summary: r.summary,
    records: r.records.map((x) => ({
      base: x.base, driver: x.driver, uniform: x.uniform.uci,
      targeted: x.targeted && x.targeted.uci, wrong: x.wrong && x.wrong.uci
    }))
  });
  check('Gate 7 repeat run is byte-identical', shape(a) === shape(b));
  check('Gate 7 records carry the driver and all three passes',
    a.records.every((r) => r.driver && r.uniform && r.targeted && r.wrong));
}

/* ---------------- proven mate is decisive: no extra pass may change it ---------------- */
{
  const struct = targetedConfig('strategic');
  for (const fen of MATE_FENS) {
    const base = pass(fen, 4);
    const uniform = pass(fen, 5);
    const targeted = pass(fen, 4, struct.patch, struct.mode);
    check('mate is proven at the base depth', Math.abs(base.score) > MATE_THRESHOLD);
    check('uniform extra budget keeps the mate move', uniform.uci === base.uci,
      `${base.uci} -> ${uniform.uci}`);
    check('targeted extra budget keeps the mate move', targeted.uci === base.uci,
      `${base.uci} -> ${targeted.uci}`);
  }
}

console.log(fails ? `\nFAIL ${fails}` : '\nOK');
if (fails) process.exitCode = 1;
