/**
 * SUBIT-CHESS — Field Dynamics Test Suite (FD-01 through FD-14)
 *
 * Spec basis:
 *   docs/theory/81-100/100_SUBIT_CHESS_FIELD_DYNAMICS_Consolidated_Specification.md
 *   docs/theory/81-100/85_SUBIT_CHESS_FIELD_DYNAMICS_01_FUNDAMENTAL_TRANSPOSITION.md
 *   docs/theory/81-100/89_SUBIT_CHESS_FIELD_DYNAMICS_05_CHESS_GRADIENT_OPERATOR.md
 *   docs/theory/81-100/90_SUBIT_CHESS_CANONICAL_BOARD_COORDINATE_SYSTEM.md
 *   docs/theory/81-100/91_SUBIT_CHESS_FIELD_DYNAMICS_06_DIVERGENCE_OPERATOR.md
 *   docs/theory/81-100/92_SUBIT_CHESS_FIELD_DYNAMICS_07_CURL_CIRCULATION_OPERATOR.md
 *
 * Tests:
 * 1. Canonical coordinate isomorphism & topology invariants (V=64, E=112, F=49, beta1=49, chi=2)
 * 2. Exact zero curl for discrete gradient fields (Curl(Grad phi) == 0 everywhere)
 * 3. Discrete Stokes Theorem on single faces, 2x2, 3x3, and 7x7 face regions
 * 4. Discrete Gauss/Divergence Theorem on arbitrary subregions of squares
 * 5. Pinned piece test: pinned rook retains geometric attack influence (FD-03 §171)
 * 6. Non-mutation: building fields leaves Position, key, and repetition stack untouched
 * 7. Channel independence and determinism
 * 8. Formal verifyFieldInvariants checks on benchmark positions
 */

import { Position, WHITE, squareIndex, moveToUci } from '../src/engine/core.mjs';
import {
  sqToCoords, coordsToSq, sqToIdx, idxToSq, idxToCoords, coordsToIdx,
  TOPOLOGY, BOARD_SQUARES, ORTHOGONAL_EDGES, INTERNAL_FACES,
  discreteGradient, discreteDivergence, discreteCurl, cycleCirculation,
  buildFieldDynamics, verifyFieldInvariants, FD_INVARIANTS
} from '../src/engine/field.mjs';
import { verifyMakeUnmake, report } from '../src/engine/verify.mjs';

let fails = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PIN_FEN   = '4q2k/8/8/8/4R3/8/8/4K3 w - - 0 1'; // White Rook on e4 pinned to King on e1 by Black Queen on e8
const ROOK_FEN  = '7k/8/8/8/8/8/8/R6K w - - 0 1';

/* ---------------- 1. Canonical coordinates and isomorphism ---------------- */
{
  let coordOk = true;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const { x, y } = sqToCoords(sq);
    const roundSq = coordsToSq(x, y);
    const idx = sqToIdx(sq);
    const roundIdx = coordsToIdx(x, y);
    const backSq = idxToSq(idx);
    const backCoords = idxToCoords(idx);

    if (roundSq !== sq || roundIdx !== idx || backSq !== sq || backCoords.x !== x || backCoords.y !== y) {
      coordOk = false;
      break;
    }
  }
  check('canonical coordinate isomorphism holds across all 64 squares', coordOk);

  check('e4 coordinates are (4, 3)',
    sqToCoords(squareIndex('e4')).x === 4 && sqToCoords(squareIndex('e4')).y === 3);
  check('d5 coordinates are (3, 4)',
    sqToCoords(squareIndex('d5')).x === 3 && sqToCoords(squareIndex('d5')).y === 4);
  check('a1 is (0, 0) and h8 is (7, 7)',
    sqToCoords(squareIndex('a1')).x === 0 && sqToCoords(squareIndex('a1')).y === 0 &&
    sqToCoords(squareIndex('h8')).x === 7 && sqToCoords(squareIndex('h8')).y === 7);
}

/* ---------------- 2. Board topology and Euler characteristic ---------------- */
{
  check('G4 has 64 vertices', TOPOLOGY.V === 64);
  check('G4 has 112 orthogonal edges', TOPOLOGY.E === 112);
  check('G4 has 49 internal faces', TOPOLOGY.F === 49);
  check('G4 cycle rank beta1 is 49', TOPOLOGY.E - TOPOLOGY.V + 1 === 49);
  check('Euler characteristic V - E + F_all is 2', TOPOLOGY.V - TOPOLOGY.E + TOPOLOGY.F + 1 === 2);
}

/* ---------------- 3. Potential Field Theorem: Curl(Grad phi) == 0 ---------------- */
{
  // Test with several arbitrary scalar fields
  const syntheticPotentials = [
    new Float64Array(64).fill(42), // constant field
    Float64Array.from({ length: 64 }, (_, i) => i * 1.5 + 3), // linear index field
    Float64Array.from({ length: 64 }, (_, i) => {
      const { x, y } = idxToCoords(i);
      return x * x - 2 * y * y + 3 * x * y; // non-linear field
    })
  ];

  let allGradCurlZero = true;
  for (const phi of syntheticPotentials) {
    const grad = discreteGradient(phi);
    const curl = discreteCurl(grad);
    for (let f = 0; f < 49; f++) {
      if (Math.abs(curl[f]) > 1e-12) allGradCurlZero = false;
    }
  }
  check('Curl(Grad phi) is identically zero on all 49 faces for arbitrary potentials', allGradCurlZero);
}

/* ---------------- 4. Discrete Stokes Theorem ---------------- */
{
  // Synthetic non-conservative edge flux with non-zero curl
  const testFlux = new Float64Array(112);
  for (let i = 0; i < 112; i++) {
    const e = TOPOLOGY.edges[i];
    testFlux[i] = Math.sin(e.x * 1.3) + Math.cos(e.y * 1.7) * (e.type === 'HORIZONTAL' ? 2.5 : -1.8);
  }

  const curlMap = discreteCurl(testFlux);

  // Region 1: single face (fx=3, fy=3)
  {
    const face = TOPOLOGY.faces[3 * 7 + 3];
    const boundaryPath = [face.vertices[0], face.vertices[1], face.vertices[2], face.vertices[3], face.vertices[0]];
    const circ = cycleCirculation(testFlux, boundaryPath);
    check('Stokes theorem holds for a single elementary face',
      Math.abs(curlMap[face.id] - circ) < 1e-10,
      `curl=${curlMap[face.id].toFixed(6)} circ=${circ.toFixed(6)}`);
  }

  // Region 2: 2x2 face region [fx: 2..3, fy: 2..3]
  {
    let sumCurl = 0;
    for (let fy = 2; fy <= 3; fy++) {
      for (let fx = 2; fx <= 3; fx++) {
        sumCurl += curlMap[fy * 7 + fx];
      }
    }
    const boundaryPath = [
      coordsToIdx(2, 2), coordsToIdx(3, 2), coordsToIdx(4, 2),
      coordsToIdx(4, 3), coordsToIdx(4, 4),
      coordsToIdx(3, 4), coordsToIdx(2, 4),
      coordsToIdx(2, 3), coordsToIdx(2, 2)
    ];
    const circ = cycleCirculation(testFlux, boundaryPath);
    check('Stokes theorem holds for a 2x2 face region',
      Math.abs(sumCurl - circ) < 1e-10,
      `sumCurl=${sumCurl.toFixed(6)} circ=${circ.toFixed(6)}`);
  }

  // Region 3: full 7x7 internal board (49 faces)
  {
    let sumAllCurl = 0;
    for (let f = 0; f < 49; f++) sumAllCurl += curlMap[f];

    const fullBoundary = [];
    // Bottom: (0,0) -> (7,0)
    for (let x = 0; x <= 7; x++) fullBoundary.push(coordsToIdx(x, 0));
    // Right: (7,1) -> (7,7)
    for (let y = 1; y <= 7; y++) fullBoundary.push(coordsToIdx(7, y));
    // Top: (6,7) -> (0,7)
    for (let x = 6; x >= 0; x--) fullBoundary.push(coordsToIdx(x, 7));
    // Left: (0,6) -> (0,0)
    for (let y = 6; y >= 0; y--) fullBoundary.push(coordsToIdx(0, y));

    const boundaryCirc = cycleCirculation(testFlux, fullBoundary);
    check('Stokes theorem holds across the entire 7x7 board boundary',
      Math.abs(sumAllCurl - boundaryCirc) < 1e-10,
      `sumCurl=${sumAllCurl.toFixed(6)} circ=${boundaryCirc.toFixed(6)}`);
  }
}

/* ---------------- 5. Discrete Gauss / Divergence Theorem ---------------- */
{
  const testFlux = Float64Array.from({ length: 112 }, (_, i) => Math.sin(i * 0.4) * 5.0);
  const divMap = discreteDivergence(testFlux);

  // Region: center 4x4 squares [2..5] x [2..5]
  let sumDiv = 0;
  const regionSquares = new Set();
  for (let y = 2; y <= 5; y++) {
    for (let x = 2; x <= 5; x++) {
      const idx = coordsToIdx(x, y);
      regionSquares.add(idx);
      sumDiv += divMap[idx];
    }
  }

  let boundaryFlux = 0;
  for (const u of regionSquares) {
    for (const outE of TOPOLOGY.outEdges[u]) {
      if (!regionSquares.has(outE.target)) {
        boundaryFlux += outE.sign * testFlux[outE.id];
      }
    }
  }

  check('Gauss divergence theorem holds on an arbitrary vertex subset',
    Math.abs(sumDiv - boundaryFlux) < 1e-10,
    `sumDiv=${sumDiv.toFixed(6)} boundaryFlux=${boundaryFlux.toFixed(6)}`);
}

/* ---------------- 6. Pinned Piece Influence (FD-03 §171) ---------------- */
{
  // PIN_FEN: White Kh1/Re4, Black Qe8. Re4 is pinned on the e-file.
  const pos = new Position();
  pos.setFEN(PIN_FEN);

  const fd = buildFieldDynamics(pos);

  // Square d4 and f4 are rank-adjacent to the White Rook on e4
  const d4Idx = sqToIdx(squareIndex('d4'));
  const f4Idx = sqToIdx(squareIndex('f4'));

  check('pinned White Rook exerts geometric attack on d4', fd.channels.white.attack[d4Idx] > 0);
  check('pinned White Rook exerts geometric attack on f4', fd.channels.white.attack[f4Idx] > 0);

  // Legal moves of pos MUST NOT contain e4-d4 or e4-f4 because the rook is absolutely pinned
  const legalUcis = pos.legalMoves().map(moveToUci);
  check('legal move generator correctly forbids pinned rook from moving to d4', !legalUcis.includes('e4d4'));
  check('legal move generator correctly forbids pinned rook from moving to f4', !legalUcis.includes('e4f4'));
  check('pinned rook CAN legally move along the pin line (e4xe8 or e4e5)',
    legalUcis.includes('e4e8') || legalUcis.includes('e4e5'));
}

/* ---------------- 7. Non-mutation of Position state (FD-INV-010) ---------------- */
{
  const pos = new Position();
  pos.setFEN(START_FEN);
  const beforeFen = pos.fen();
  const beforeKey = pos.key;
  const beforeReps = pos.rep.length;

  const fd = buildFieldDynamics(pos);

  check('buildFieldDynamics does not mutate FEN', pos.fen() === beforeFen);
  check('buildFieldDynamics does not mutate hash key', pos.key === beforeKey);
  check('buildFieldDynamics does not mutate repetition stack', pos.rep.length === beforeReps);

  const integrity = verifyMakeUnmake(pos);
  check('make/unmake integrity survives after field construction', integrity.length === 0, report(integrity));
}

/* ---------------- 8. Channel Independence and Determinism ---------------- */
{
  const pos = new Position();
  pos.setFEN(START_FEN);

  const fd1 = buildFieldDynamics(pos);
  const fd2 = buildFieldDynamics(pos);

  check('field dynamics is deterministic across calls',
    fd1.summary.totalWhiteAttack === fd2.summary.totalWhiteAttack &&
    fd1.summary.totalBlackAttack === fd2.summary.totalBlackAttack);

  check('white and black channels are in separate buffers',
    fd1.channels.white.attack !== fd1.channels.black.attack &&
    fd1.channels.white.flux !== fd1.channels.black.flux);
}

/* ---------------- 9. Invariant Suite Verification on Positions ---------------- */
{
  const testFens = [START_FEN, PIN_FEN, ROOK_FEN];
  let allInvariantsPass = true;
  for (const fen of testFens) {
    const pos = new Position();
    pos.setFEN(fen);
    const failures = verifyFieldInvariants(pos);
    if (failures.length > 0) {
      allInvariantsPass = false;
      console.log(`Failures on FEN ${fen}:`, failures);
    }
  }
  check('verifyFieldInvariants passes on all test FENs', allInvariantsPass);
}

if (fails > 0) {
  console.error(`\nFAILED: ${fails} check(s) failed`);
  process.exit(1);
} else {
  console.log('\nAll Field Dynamics checks passed.');
}
