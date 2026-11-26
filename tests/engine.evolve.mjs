/** SCMF §15 / INV-015..019: controlled autonomous evolution (evolve.mjs). Match function is injected, so the protocol is tested fast. */
import fs from 'node:fs';
import { DEFAULT_PARAMS, cloneParams } from '../src/engine/evaluate.mjs';
import { evolve, rollbackTo, regressionSuite, paramsFingerprint } from '../src/engine/evolve.mjs';

let fails = 0;
const check = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const base = cloneParams(DEFAULT_PARAMS);
const S = 1000003;
const stage = (seed, opts) => (seed - opts.seed) % S === 500000 ? 'confirm' : (seed - opts.seed) === 9 * S ? 'audit' : 'screen';

/* 1. determinism / reproducibility (INV-005, INV-018): same seed -> identical journal and parameters */
{
  const mk = (seed) => {
    const seen = [];
    const cmp = (c, n, o) => { seen.push(o.seed); const dS = ((o.seed * 2654435761) % 1000) / 1000 - 0.3; return { dS, se: 0.2 }; };
    return { r: evolve(base, { steps: 5, seed, compare: cmp, finalAudit: false }), seen };
  };
  const a = mk(11), b = mk(11), c = mk(12);
  check('same seed -> identical journal and final parameters', JSON.stringify(a.r.journal) === JSON.stringify(b.r.journal) && a.r.finalFingerprint === b.r.finalFingerprint);
  check('different seed -> different hypotheses', JSON.stringify(a.r.journal.map((j) => j.knob + j.relativeChange)) !== JSON.stringify(c.r.journal.map((j) => j.knob + j.relativeChange)));
}

/* 2. independent confirmation uses seeds DISJOINT from screening (SCMF §15.4) */
{
  const used = { screen: new Set(), confirm: new Set() };
  const cmp = (c, n, o) => { const st = stage(o.seed, { seed: 3 }); if (used[st]) used[st].add(o.seed); return { dS: 0.5, se: 0.1 }; };
  evolve(base, { steps: 6, seed: 3, compare: cmp, finalAudit: false });
  const overlap = [...used.screen].filter((s) => used.confirm.has(s));
  check('screening and confirmation seed sets are disjoint and both used', used.screen.size > 0 && used.confirm.size > 0 && overlap.length === 0, `screen ${used.screen.size}, confirm ${used.confirm.size}`);
}

/* 3. winner's curse: a change that wins screening by luck but not confirmation is rejected */
{
  const cmp = (c, n, o) => (stage(o.seed, { seed: 5 }) === 'confirm' ? { dS: 0.0, se: 0.2 } : { dS: 0.6, se: 0.2 });
  const r = evolve(base, { steps: 6, seed: 5, compare: cmp, finalAudit: false });
  check('screening-only wins are not accepted (confirmation required)', r.accepted === 0 && r.finalFingerprint === r.baseFingerprint);
  check('rejections are journaled with the reason', r.journal.filter((j) => j.decision === 'reject').every((j) => /confirmation|drift|screening|regression/.test(j.reason)));
}

/* 4. both stages positive -> accepted, versions recorded, provenance present (INV-015) */
{
  const cmp = () => ({ dS: 0.8, se: 0.2 });
  const r = evolve(base, { steps: 4, seed: 7, compare: cmp, finalAudit: false });
  check('screening and confirmation positive -> accepted', r.accepted > 0 && r.versions.length === r.accepted + 1);
  check('every journal entry has provenance (generator, parameters, seed, version) and no external source',
    r.journal.every((j) => j.provenance && j.provenance.generator && j.provenance.parameters && typeof j.provenance.seed === 'number' && j.provenance.version && j.provenance.source === 'self-play only'));
}

/* 5. bounded change: cumulative drift from baseline is capped (SCMF §15.3) */
{
  const cmp = () => ({ dS: 0.9, se: 0.1 });
  const r = evolve(base, { steps: 40, seed: 9, compare: cmp, finalAudit: false, maxDrift: 0.10, knobs: ['tempo'] });
  const t0 = base.tempo, t1 = r.params.tempo;
  check('cumulative drift stays within the bound', Math.abs(t1 - t0) <= Math.abs(t0) * 0.10 + 1e-9, `tempo ${t0} -> ${t1}`);
}

/* 6. regression control (SCMF §15.3) */
{
  const broken = cloneParams(base); broken.search = null;
  check('regression suite passes for the defaults', regressionSuite(base).length === 0);
  check('regression suite fails for unusable parameters', regressionSuite(broken).length > 0);
}

/* 7. rollback (INV-019): the final audit against the baseline vetoes a net-negative evolution */
{
  const cmp = (c, n, o) => (stage(o.seed, { seed: 13 }) === 'audit' ? { dS: -0.3, se: 0.1 } : { dS: 0.8, se: 0.2 });
  const r = evolve(base, { steps: 4, seed: 13, compare: cmp });
  check('negative final audit -> rolled back to the baseline', r.rolledBack && r.finalFingerprint === r.baseFingerprint && r.journal.at(-1).decision === 'rollback');
  const ok = evolve(base, { steps: 4, seed: 7, compare: () => ({ dS: 0.8, se: 0.2 }) });
  const v1 = rollbackTo(ok, 1), v0 = rollbackTo(ok, 0);
  check('rollbackTo returns the stored stable version', paramsFingerprint(v0) === ok.baseFingerprint && paramsFingerprint(v1) === ok.versions[1].fingerprint);
}

/* 8. INV-016: no external chess engine as a data source */
{
  const src = fs.readFileSync(new URL('../src/engine/evolve.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  check('evolve.mjs imports only engine modules (no child_process, no bench, no network)', imports.every((i) => i.startsWith('./')), imports.join(', '));
}

/* 9. end to end with the real self-play (tiny) */
{
  const r = evolve(base, { steps: 1, seed: 21, screenGames: 2, confirmGames: 2, depth: 1, knobs: ['tempo'] });
  check('real self-play evolution runs end to end and journals a decision', r.journal.length >= 1 && r.journal[0].decision);
}

console.log(fails === 0 ? '\nEVOLVE OK' : `\nEVOLVE FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
