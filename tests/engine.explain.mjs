/** SCMF §10/§12/§13/§14: decision structure, typed claims, counterfactuals; INV-011 (explaining never changes the move). */
import { Engine } from '../src/engine/index.mjs';
import { EVIDENCE, CLAIM, confidence } from '../src/engine/explain.mjs';

let fails = 0;
const check = (n, c, x = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const mk = (fen) => { const e = new Engine(undefined, { ttBits: 16, adaptiveTime: false, usePlans: false }); e.setFEN(fen); return e; };
const FENS = [
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 8',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
];

for (const fen of FENS) {
  const e = mk(fen), before = e.pos.fen();
  const d = e.explain({ depth: 4 });
  const plain = mk(fen).search({ depth: 4, fixedTime: true });
  const tag = fen.split(' ')[0].slice(0, 16);
  check(`INV-011: explain() picks the move a plain depth-4 search picks (${tag})`, d.move === plain.uci, `${d.move} vs ${plain.uci}`);
  check(`explain() leaves the position untouched (${tag})`, e.pos.fen() === before);
  check(`chosen move is legal (${tag})`, !!e.findMoveByUci(d.move));
  check(`alternatives carry counterfactual cf = V(a*) - V(b) (${tag})`, d.alternatives.length > 0 && d.alternatives.every((a) => Math.abs(a.counterfactual.cf - (d.value - a.value)) < 1e-9));
  check(`every claim has a type and an evidence status from the SCMF vocabulary (${tag})`,
    d.evidence.every((c) => Object.values(CLAIM).includes(c.type) && Object.values(EVIDENCE).includes(c.status)));
  check(`heuristic structure is never labelled EXACT, search values never labelled EXACT (${tag})`,
    d.evidence.filter((c) => c.type === CLAIM.STRUCTURAL || c.type === CLAIM.TACTICAL || c.type === CLAIM.COUNTERFACTUAL).every((c) => c.status !== EVIDENCE.EXACT));
  check(`confidence is in [0,1] and flagged uncalibrated (${tag})`, d.confidence.conf >= 0 && d.confidence.conf <= 1 && d.confidence.calibrated === false);
  check(`a horizon limit is declared as unresolved (${tag})`, d.unresolved.some((u) => u.includes('horizon')) || Math.abs(d.value) > 99000);
}

{ // forced mate: rule facts are EXACT, the mate claim is exhaustively verified
  const e = mk('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const d = e.explain({ depth: 4 });
  check('mate in 1: a1a8 with a checkmate fact', d.move === 'a1a8' && d.evidence.some((c) => c.text.includes('checkmate') && c.status === EVIDENCE.EXACT));
  check('mate in 1: tactical claim is EXHAUSTIVELY_VERIFIED', d.evidence.some((c) => c.type === CLAIM.TACTICAL && c.status === EVIDENCE.EXHAUSTIVELY_VERIFIED));
}
{ // terminal: no legal move
  const e = mk('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const d = e.explain({ depth: 3 });
  check('stalemate position: no move, status reported', d.move === null && d.status === 'stalemate');
}
{ // determinism
  const a = JSON.stringify(mk(FENS[0]).explain({ depth: 4 }).alternatives.map((x) => [x.move, x.value]));
  const b = JSON.stringify(mk(FENS[0]).explain({ depth: 4 }).alternatives.map((x) => [x.move, x.value]));
  check('explanation is deterministic (SCMF-INV-005)', a === b);
}
check('confidence: unfinished search -> 0; wider gap -> higher', confidence(100, 8, false) === 0 && confidence(200, 8, true) > confidence(20, 8, true));

console.log(fails === 0 ? '\nEXPLAIN OK' : `\nEXPLAIN FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
