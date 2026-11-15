/**
 * Uncertainty profile U(P) and the decision certificate.
 *
 * Spec basis:
 *   docs/theory/37 §5-§6   eight uncertainty types, the vector, Uᵢ ∈ [0,1]
 *   docs/theory/37 §8      evidence statuses
 *   docs/theory/37 §14.3   no Confidence = 1 - Uncertainty
 *   docs/theory/37 §14.4   uncertainty is not rule randomness
 *   docs/theory/37 §23     UCT-INV-001..019
 *   docs/theory/45 §16     the vector steers verification, never the score
 *   docs/theory/45 §20.2   Decision Certificate fields
 *   docs/theory/46 §14     evaluation / probability / confidence are distinct
 *
 * The point of these tests is the part that is easy to get wrong: an uncertainty
 * module that quietly becomes a scalar penalty on the evaluation would still
 * "work" and would silently violate UCT-INV-019 and doc 45 §16.
 */
import { Engine } from '../src/engine/index.mjs';
import {
  computeProfile, buildCertificate, certificateLine,
  U_TYPES, U_SYM, MODEL_BASE, STATUS
} from '../src/engine/uncertainty.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const TACTIC = '2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16';
const MATE1 = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
const PAWN_END = '5k2/5P2/1p3K2/p7/P2p4/1PP5/8/8 w - - 0 48';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function profileOf(fen, opts = {}) {
  const e = new Engine();
  e.setFEN(fen);
  // a fixed depth, never a clock: a wall-clock limit stops on a different node
  // count on every run, which would make the determinism checks meaningless
  const r = e.search(opts.timeMs ? { depth: opts.depth || 6, timeMs: opts.timeMs }
    : { depth: opts.depth || 6 });
  return { e, r, p: e.uncertaintyProfile(r, { depth: opts.depth || 6 }) };
}

/* ---------------- 1. eight components, all in [0,1] ---------------- */
{
  const { p } = profileOf(TACTIC);
  check('the profile has exactly the eight canonical types',
    U_TYPES.length === 8 && U_TYPES.join(',') === 'search,tactical,evaluation,structural,strategic,temporal,model,contextual');
  check('every component is a number in [0,1]',
    p.vector.length === 8 && p.vector.every((x) => typeof x === 'number' && x >= 0 && x <= 1),
    p.vector.join(','));
  check('every component keeps its context (UCT-INV-006)',
    U_TYPES.every((k) => typeof p.why[k] === 'string' && p.why[k].length > 0));
}

/* ---------------- 2. the indicators are not collapsed (doc 45 §16) ---------------- */
{
  const { p } = profileOf(TACTIC);
  check('no weighted sum is exposed (doc 45 §16)',
    p.scalar === undefined && p.value === undefined && p.total === undefined);
  check('the driver names one component, it does not rank the rest',
    U_TYPES.includes(p.driver) && p.driverValue === Math.max(...p.vector));
  const distinct = new Set(p.vector.map((x) => x.toFixed(3)));
  check('the components are not a constant vector', distinct.size >= 4,
    `${distinct.size} distinct values`);
}

/* ---------------- 3. reproducible (UCT-INV-018) ---------------- */
{
  const a = profileOf(TACTIC);
  const b = profileOf(TACTIC);
  check('same position and budget give the same profile',
    JSON.stringify(a.p.vector) === JSON.stringify(b.p.vector));
  check('same position and budget give the same decision',
    a.r.move === b.r.move && a.r.score === b.r.score && a.r.nodes === b.r.nodes);
  check('the evidence strings are reproducible too',
    JSON.stringify(a.p.why) === JSON.stringify(b.p.why));
}

/* ---------------- 4. tactical uncertainty survives a good score (UCT-INV-016) ---------------- */
{
  const { p } = profileOf(TACTIC);
  check('a large static advantage does not hide the tactical component',
    p.vector[1] > 0.3, `Ut=${p.vector[1]}`);
  const deep = profileOf(START, { depth: 10 });
  const shallow = profileOf(START, { depth: 2 });
  check('a completed but shallow search reports search uncertainty',
    shallow.p.vector[0] > deep.p.vector[0],
    `d2=${shallow.p.vector[0]} d10=${deep.p.vector[0]}`);
}

/* ---------------- 5. a proven mate closes the search question ---------------- */
{
  const { p, r } = profileOf(MATE1, { depth: 4 });
  check('the mate is found', Math.abs(r.score) > 90000 - 1000, `${r.san} ${r.score}`);
  check('search uncertainty is zero once the mate is proven', p.vector[0] === 0,
    p.why.search);
  check('the certificate is FORCED_WITHIN_SCOPE', r.certificate.validation_status === STATUS.FORCED_WITHIN_SCOPE);
}

/* ---------------- 6. no automatic uncertainty penalty (UCT-INV-019) ---------------- */
{
  const a = new Engine();
  a.setFEN(TACTIC);
  const before = a.fen;
  const r1 = a.search({ depth: 7 });
  const profile = a.uncertaintyProfile(r1, { depth: 7 });
  const after = a.fen;
  check('computing the profile does not change the position', before === after);

  const b = new Engine();
  b.setFEN(TACTIC);
  const r2 = b.search({ depth: 7 });
  check('the profile does not change the decision',
    r1.move === r2.move && r1.score === r2.score && r1.nodes === r2.nodes,
    `${r1.score} vs ${r2.score}, ${r1.nodes} vs ${r2.nodes}`);
  check('the profile is reported next to the score, not inside it',
    r1.score === r2.score && profile.vector.length === 8);
  check('the score is not a probability', typeof r1.score === 'number' && Math.abs(r1.score) < 90000,
    `${r1.score}`);
}

/* ---------------- 7. model limits are part of the profile (UCT-INV-009) ---------------- */
{
  const e = new Engine();
  e.setFEN(TACTIC);
  const fast = e.uncertaintyProfile(null, {}).vector[6];
  e.setEvalMode('hybrid');
  const hybrid = e.uncertaintyProfile(null, {}).vector[6];
  check('the model component depends on the tier',
    fast > hybrid && fast === MODEL_BASE.fast && hybrid === MODEL_BASE.hybrid,
    `fast=${fast} hybrid=${hybrid}`);
  const end = profileOf(PAWN_END);
  check('a pawn ending raises the model component (no tablebase behind the eval)',
    end.p.vector[6] > MODEL_BASE.fast, `Um=${end.p.vector[6]}`);
}

/* ---------------- 8. certificate fields and status (doc 45 §20.2) ---------------- */
{
  const { r, e } = profileOf(TACTIC, { depth: 5 });
  const c = r.certificate;
  const fields = ['position_identity', 'position_version', 'selected_move', 'legal_validation',
    'search_depth', 'completed_iteration', 'node_count', 'principal_variation',
    'evaluation', 'uncertainty_profile', 'parameter_version', 'algorithm_version',
    'validation_status', 'provenance'];
  check('every certificate field from doc 45 §20.2 is present',
    fields.every((k) => c[k] !== undefined), fields.filter((k) => c[k] === undefined).join(',') || 'all present');
  check('the certificate describes the position it was built from',
    c.position_identity === e.fen);
  check('legal_validation matches the real legal move count',
    c.legal_validation.legal === true && c.legal_validation.legal_moves === e.legalMoves().length);
  check('depth and node count are copied from the search, not guessed',
    c.search_depth === r.depth && c.node_count === r.nodes);
  check('the principal variation is the searched one', c.principal_variation.join(' ') === r.pvSan.join(' '));
  check('provenance is recorded', typeof c.provenance === 'string' && c.provenance.length > 0, c.provenance);
  check('a one-line rendering exists for the trace', certificateLine(c).includes('[' + c.validation_status + ']'));
}

/* ---------------- 9. status mapping (UCT-INV-004, UCT-INV-017) ---------------- */
{
  check('an illegal move is REFUTED', buildCertificate({ legal: false }).validation_status === STATUS.REFUTED);
  check('an unfinished search is UNVERIFIED', buildCertificate({ completed: false }).validation_status === STATUS.UNVERIFIED);
  check('a finished search is SEARCH_SUPPORTED', buildCertificate({ completed: true }).validation_status === STATUS.SEARCH_SUPPORTED);
  check('a proven mate is FORCED_WITHIN_SCOPE',
    buildCertificate({ completed: true, score: 99991 }).validation_status === STATUS.FORCED_WITHIN_SCOPE);
  check('an unknown position is not silently UNVERIFIED',
    buildCertificate({ completed: true }).validation_status === STATUS.SEARCH_SUPPORTED);
}

/* ---------------- 10. position version (UCT-INV-015) ---------------- */
{
  const e = new Engine();
  e.setFEN(START);
  const v0 = e.version;
  e.play('e2e4');
  const v1 = e.version;
  e.setFEN(START);
  const v2 = e.version;
  check('every position change bumps the version', v1 > v0 && v2 > v1, `${v0} -> ${v1} -> ${v2}`);
  const cert = buildCertificate({ fen: e.fen, version: e.version, completed: true });
  check('the certificate carries the version', cert.position_version === v2);
}

/* ---------------- 11. no probability is derived from uncertainty (UCT-INV-001, doc 46 §14.1) ---------------- */
{
  const { p } = profileOf(TACTIC);
  check('no component is a win probability',
    p.vector.every((x) => x >= 0 && x <= 1) && !('probability' in p) && !('confidence' in p));
  check('the symbols are the eight canonical ones',
    U_TYPES.map((k) => U_SYM[k]).join(',') === 'Us,Ut,Ue,Ur,Up,Uh,Um,Uc');
}

console.log(fails === 0 ? '\nUNCERTAINTY OK' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);