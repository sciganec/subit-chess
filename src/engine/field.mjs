/**
 * SUBIT-CHESS — Field Dynamics Subsystem (FD-01 through FD-14)
 *
 * Spec basis:
 *   docs/theory/81-100/100_SUBIT_CHESS_FIELD_DYNAMICS_Consolidated_Specification.md
 *   docs/theory/81-100/85_SUBIT_CHESS_FIELD_DYNAMICS_01_FUNDAMENTAL_TRANSPOSITION.md
 *   docs/theory/81-100/86_SUBIT_CHESS_FIELD_DYNAMICS_02_CHESS_STRUCTURAL_FIELD_ONTOLOGY.md
 *   docs/theory/81-100/87_SUBIT_CHESS_FIELD_DYNAMICS_03_VECTOR_REPRESENTATION_OF_CHESS_INFLUENCE.md
 *   docs/theory/81-100/88_SUBIT_CHESS_FIELD_DYNAMICS_04_DIRECTIONAL_INFLUENCE_OPERATORS.md
 *   docs/theory/81-100/89_SUBIT_CHESS_FIELD_DYNAMICS_05_CHESS_GRADIENT_OPERATOR.md
 *   docs/theory/81-100/90_SUBIT_CHESS_CANONICAL_BOARD_COORDINATE_SYSTEM.md
 *   docs/theory/81-100/91_SUBIT_CHESS_FIELD_DYNAMICS_06_DIVERGENCE_OPERATOR.md
 *   docs/theory/81-100/92_SUBIT_CHESS_FIELD_DYNAMICS_07_CURL_CIRCULATION_OPERATOR.md
 *   docs/theory/81-100/93_SUBIT_CHESS_FIELD_DYNAMICS_08_FIELD_INTERACTION_AND_SUPERPOSITION.md
 *   docs/theory/81-100/94_SUBIT_CHESS_FIELD_DYNAMICS_09_INTEGRATION_INTO_POSITION_EVALUATION.md
 *   docs/theory/81-100/98_SUBIT_CHESS_FIELD_DYNAMICS_13_ENGINE_INTEGRATION_SPECIFICATION.md
 *
 * DO NOT COLLAPSE — CONTEXTUALIZE:
 * - White and Black influence channels are computed independently and never
 *   silently merged without explicit semantic labeling.
 * - Geometric attack/influence is distinct from legal move ability: a pinned piece
 *   still exerts geometric influence along its attack vectors (FD-03 §171).
 * - Discrete Stokes Theorem: sum of curls on a 2D region equals boundary circulation.
 * - Discrete Gauss Theorem: sum of divergences on a vertex subset equals boundary flux.
 * - Gradient Potential Theorem: Curl(Grad phi) is identically zero on all 49 internal faces.
 * - This module is purely analytical: it does not bypass the legal move generator,
 *   nor does it prune moves in search (FD-10 §360).
 */

import {
  WHITE, BLACK, EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  pieceType, pieceColor, opposite, squareName,
  KNIGHT_DELTAS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS, KING_DELTAS
} from './core.mjs';

/* ===================================================================== *
 * 1. CANONICAL COORDINATE SYSTEM (SC-CORE-COORD-001 & FD-01/02)
 * ===================================================================== */

export const BOARD_FILES = 8;
export const BOARD_RANKS = 8;
export const BOARD_SQUARES = 64;
export const ORTHOGONAL_EDGES = 112; // 56 horizontal + 56 vertical
export const INTERNAL_FACES = 49;    // 7x7 elementary square faces

/** Convert 0x88 square (0x00 .. 0x77) to canonical coords x, y in [0, 7].
 * In 0x88 mailbox, row 0 is 8th rank and row 7 is 1st rank.
 * Canonical y: 0 is 1st rank (a1..h1) and 7 is 8th rank (a8..h8) per SC-CORE-COORD-001.
 */
export function sqToCoords(sq) {
  return { x: sq & 7, y: 7 - (sq >> 4) };
}

/** Convert canonical coords (x, y) in [0, 7] to 0x88 square index. */
export function coordsToSq(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
  return ((7 - y) << 4) | x;
}

/** Convert 0x88 square to canonical linear 0..63 index (y * 8 + x). */
export function sqToIdx(sq) {
  return ((7 - (sq >> 4)) * 8) + (sq & 7);
}

/** Convert canonical linear 0..63 index to 0x88 square. */
export function idxToSq(idx) {
  const x = idx % 8;
  const y = Math.floor(idx / 8);
  return ((7 - y) << 4) | x;
}

/** Convert linear 0..63 index to canonical coords (x, y). */
export function idxToCoords(idx) {
  return { x: idx % 8, y: Math.floor(idx / 8) };
}

/** Convert canonical coords (x, y) to linear 0..63 index. */
export function coordsToIdx(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
  return (y * 8) + x;
}

/** Canonical Direction Vectors D4 & D8 */
export const D4 = Object.freeze([
  { name: 'EAST',  dx:  1, dy:  0 },
  { name: 'WEST',  dx: -1, dy:  0 },
  { name: 'NORTH', dx:  0, dy:  1 },
  { name: 'SOUTH', dx:  0, dy: -1 }
]);

export const D8 = Object.freeze([
  { name: 'EAST',       dx:  1, dy:  0 },
  { name: 'WEST',       dx: -1, dy:  0 },
  { name: 'NORTH',      dx:  0, dy:  1 },
  { name: 'SOUTH',      dx:  0, dy: -1 },
  { name: 'NORTH_EAST', dx:  1, dy:  1 },
  { name: 'NORTH_WEST', dx: -1, dy:  1 },
  { name: 'SOUTH_EAST', dx:  1, dy: -1 },
  { name: 'SOUTH_WEST', dx: -1, dy: -1 }
]);

/* ===================================================================== *
 * 2. DISCRETE 2-COMPLEX GEOMETRY (G4 Orthogonal Board Graph & 49 Faces)
 * ===================================================================== */

/**
 * Precomputed graph topology of the 8x8 chessboard:
 * - 64 vertices: 0..63
 * - 112 undirected edges (each represented as a pair of directed half-edges)
 * - 49 internal square faces f_{x,y} for x in 0..6, y in 0..6
 */
class BoardTopology {
  constructor() {
    this.V = BOARD_SQUARES; // 64
    this.E = ORTHOGONAL_EDGES; // 112
    this.F = INTERNAL_FACES; // 49

    // List of undirected edges: [{ id, u, v, dir: 'H'|'V' }]
    this.edges = [];
    this.edgeIndexByPair = new Map(); // "u,v" -> edgeId

    // Directed adjacency lists per vertex
    this.outEdges = Array.from({ length: 64 }, () => []);
    this.inEdges = Array.from({ length: 64 }, () => []);

    let edgeId = 0;
    // 56 horizontal edges: (x,y) <-> (x+1,y)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 7; x++) {
        const u = coordsToIdx(x, y);
        const v = coordsToIdx(x + 1, y);
        const e = { id: edgeId++, u, v, type: 'HORIZONTAL', x, y };
        this.edges.push(e);
        this.edgeIndexByPair.set(`${u},${v}`, e.id);
        this.edgeIndexByPair.set(`${v},${u}`, e.id);
        this.outEdges[u].push({ id: e.id, target: v, sign: +1 }); // EAST is +1
        this.outEdges[v].push({ id: e.id, target: u, sign: -1 }); // WEST is -1
        this.inEdges[v].push({ id: e.id, source: u, sign: +1 });
        this.inEdges[u].push({ id: e.id, source: v, sign: -1 });
      }
    }

    // 56 vertical edges: (x,y) <-> (x,y+1)
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 7; y++) {
        const u = coordsToIdx(x, y);
        const v = coordsToIdx(x, y + 1);
        const e = { id: edgeId++, u, v, type: 'VERTICAL', x, y };
        this.edges.push(e);
        this.edgeIndexByPair.set(`${u},${v}`, e.id);
        this.edgeIndexByPair.set(`${v},${u}`, e.id);
        this.outEdges[u].push({ id: e.id, target: v, sign: +1 }); // NORTH is +1
        this.outEdges[v].push({ id: e.id, target: u, sign: -1 }); // SOUTH is -1
        this.inEdges[v].push({ id: e.id, source: u, sign: +1 });
        this.inEdges[u].push({ id: e.id, source: v, sign: -1 });
      }
    }

    // 49 elementary square faces f_{x,y}:
    // Boundary oriented counter-clockwise:
    // (x,y) -> (x+1,y) [EAST] -> (x+1,y+1) [NORTH] -> (x,y+1) [WEST] -> (x,y) [SOUTH]
    this.faces = [];
    let faceId = 0;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const v00 = coordsToIdx(x, y);
        const v10 = coordsToIdx(x + 1, y);
        const v11 = coordsToIdx(x + 1, y + 1);
        const v01 = coordsToIdx(x, y + 1);

        const eBottom = this.edgeIndexByPair.get(`${v00},${v10}`); // (x,y)->(x+1,y), EAST (+1)
        const eRight  = this.edgeIndexByPair.get(`${v10},${v11}`); // (x+1,y)->(x+1,y+1), NORTH (+1)
        const eTop    = this.edgeIndexByPair.get(`${v01},${v11}`); // (x+1,y+1)->(x,y+1), WEST (-1)
        const eLeft   = this.edgeIndexByPair.get(`${v00},${v01}`); // (x,y+1)->(x,y), SOUTH (-1)

        this.faces.push({
          id: faceId++,
          x, y,
          vertices: [v00, v10, v11, v01],
          // Directed boundary edges with orientation (+1 forward, -1 reverse):
          boundary: [
            { edgeId: eBottom, u: v00, v: v10, sign: +1, dir: 'EAST' },
            { edgeId: eRight,  u: v10, v: v11, sign: +1, dir: 'NORTH' },
            { edgeId: eTop,    u: v11, v: v01, sign: -1, dir: 'WEST' },
            { edgeId: eLeft,   u: v01, v: v00, sign: -1, dir: 'SOUTH' }
          ]
        });
      }
    }
  }

  getEdgeId(u, v) {
    return this.edgeIndexByPair.get(`${u},${v}`);
  }
}

export const TOPOLOGY = new BoardTopology();

/* ===================================================================== *
 * 3. DISCRETE DIFFERENTIAL OPERATORS (FD-05, FD-06, FD-07)
 * ===================================================================== */

/**
 * FD-05 Discrete Chess Gradient Operator:
 * For a scalar potential field phi: V -> R (64 elements), computes the discrete
 * gradient on the 112 orthogonal edges of G4.
 *
 * For edge e = (u -> v):
 *   grad[e.id] = phi[v] - phi[u] (positive in the direction of increasing index).
 *
 * Anti-symmetry property:
 *   Grad phi(v -> u) = - Grad phi(u -> v)
 */
export function discreteGradient(scalarMap) {
  if (scalarMap.length !== BOARD_SQUARES) {
    throw new Error(`scalarMap must have length ${BOARD_SQUARES}`);
  }
  const grad = new Float64Array(ORTHOGONAL_EDGES);
  for (let i = 0; i < ORTHOGONAL_EDGES; i++) {
    const e = TOPOLOGY.edges[i];
    grad[i] = scalarMap[e.v] - scalarMap[e.u];
  }
  return grad;
}

/**
 * FD-06 Discrete Divergence Operator:
 * For an edge flux J: E -> R (112 elements defined along edge canonical directions u -> v),
 * computes Div J(v) at each vertex v in 0..63.
 *
 * Div J(v) = sum_{e out} J(e) - sum_{e in} J(e).
 */
export function discreteDivergence(edgeFlux) {
  if (edgeFlux.length !== ORTHOGONAL_EDGES) {
    throw new Error(`edgeFlux must have length ${ORTHOGONAL_EDGES}`);
  }
  const div = new Float64Array(BOARD_SQUARES);
  for (let v = 0; v < BOARD_SQUARES; v++) {
    let sum = 0;
    const outs = TOPOLOGY.outEdges[v];
    for (let i = 0; i < outs.length; i++) {
      const e = outs[i];
      sum += e.sign * edgeFlux[e.id];
    }
    div[v] = sum;
  }
  return div;
}

/**
 * FD-07 Discrete Circulation and Curl Operator:
 * Computes the circulation along a closed cycle C of directed edges,
 * and the discrete curl on each of the 49 elementary faces f in F.
 *
 * Curl J(f) = sum_{e in boundary(f)} sign(e, f) * J(e)
 */
export function discreteCurl(edgeFlux) {
  if (edgeFlux.length !== ORTHOGONAL_EDGES) {
    throw new Error(`edgeFlux must have length ${ORTHOGONAL_EDGES}`);
  }
  const curl = new Float64Array(INTERNAL_FACES);
  for (let f = 0; f < INTERNAL_FACES; f++) {
    const face = TOPOLOGY.faces[f];
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const b = face.boundary[k];
      sum += b.sign * edgeFlux[b.edgeId];
    }
    curl[f] = sum;
  }
  return curl;
}

/**
 * Circulation of edgeFlux along an arbitrary sequence of vertices forming a cycle.
 */
export function cycleCirculation(edgeFlux, vertexPath) {
  if (vertexPath.length < 2) return 0;
  let circ = 0;
  for (let i = 0; i < vertexPath.length - 1; i++) {
    const u = vertexPath[i];
    const v = vertexPath[i + 1];
    const edgeId = TOPOLOGY.getEdgeId(u, v);
    if (edgeId === undefined) {
      throw new Error(`non-adjacent vertices in cycle: ${u} -> ${v}`);
    }
    const e = TOPOLOGY.edges[edgeId];
    // Edge is defined canonically from e.u to e.v
    const sign = (u === e.u && v === e.v) ? 1 : -1;
    circ += sign * edgeFlux[edgeId];
  }
  return circ;
}

/* ===================================================================== *
 * 4. FIELD DYNAMICS BUILDER (FD-01, FD-02, FD-03, FD-04, FD-08)
 * ===================================================================== */

export const FIELD_TYPES = Object.freeze([
  'ATTACK',
  'DEFENSE',
  'MOBILITY',
  'CONTROL',
  'POTENTIAL'
]);

/**
 * Builds the complete Field Dynamics model of a chess Position:
 * - Geometric attack fields for White and Black
 * - Support/defense fields for White and Black
 * - Net control potential scalar field Phi_C
 * - Influence flux vector field J_infl on the orthogonal grid
 * - Discrete gradient, divergence, and curl
 *
 * DO NOT COLLAPSE:
 * - White and Black are stored in independent buffers.
 * - Pinned pieces still exert geometric attack influence (FD-03 §171).
 */
export function buildFieldDynamics(pos) {
  if (!pos || typeof pos.fen !== 'function') {
    throw new Error('buildFieldDynamics requires a Position instance');
  }

  // Linear 64-element scalar arrays
  const whiteAttack = new Float64Array(BOARD_SQUARES);
  const blackAttack = new Float64Array(BOARD_SQUARES);
  const whiteDefense = new Float64Array(BOARD_SQUARES);
  const blackDefense = new Float64Array(BOARD_SQUARES);
  const whiteWeight = new Float64Array(BOARD_SQUARES);
  const blackWeight = new Float64Array(BOARD_SQUARES);

  // Directed edge flux buffers (112 edges)
  const whiteFlux = new Float64Array(ORTHOGONAL_EDGES);
  const blackFlux = new Float64Array(ORTHOGONAL_EDGES);
  const netFlux = new Float64Array(ORTHOGONAL_EDGES);

  const b = pos.board;

  // Relative piece influence weights
  const INFL_WEIGHT = [0, 1.0, 3.2, 3.3, 5.0, 9.0, 2.0];

  // 1. Ray-trace geometric influence from all pieces on board
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = b[sq];
    if (p === EMPTY) continue;

    const color = pieceColor(p);
    const type = pieceType(p);
    const weight = INFL_WEIGHT[type] || 1.0;
    const uIdx = sqToIdx(sq);
    const { x: ux, y: uy } = sqToCoords(sq);

    const isWhite = color === WHITE;
    const attackMap = isWhite ? whiteAttack : blackAttack;
    const defenseMap = isWhite ? whiteDefense : blackDefense;
    const weightMap = isWhite ? whiteWeight : blackWeight;
    const fluxMap = isWhite ? whiteFlux : blackFlux;

    if (type === PAWN) {
      // Pawn attacks diagonally
      const dy = isWhite ? 1 : -1;
      const py = uy + dy;
      if (py >= 0 && py <= 7) {
        for (const dx of [-1, 1]) {
          const px = ux + dx;
          if (px >= 0 && px <= 7) {
            const targetSq = coordsToSq(px, py);
            const targetIdx = coordsToIdx(px, py);
            const occ = b[targetSq];
            if (occ !== EMPTY && pieceColor(occ) === color) {
              defenseMap[targetIdx] += 1;
            } else {
              attackMap[targetIdx] += 1;
            }
            weightMap[targetIdx] += weight;

            // Project flux onto orthogonal edge
            const horizEdge = TOPOLOGY.getEdgeId(uIdx, coordsToIdx(px, uy));
            if (horizEdge !== undefined) {
              fluxMap[horizEdge] += (dx > 0 ? 0.5 : -0.5) * weight;
            }
            const vertEdge = TOPOLOGY.getEdgeId(coordsToIdx(px, uy), targetIdx);
            if (vertEdge !== undefined) {
              fluxMap[vertEdge] += (dy > 0 ? 0.5 : -0.5) * weight;
            }
          }
        }
      }
    } else if (type === KNIGHT) {
      // Knight jumps
      for (let i = 0; i < 8; i++) {
        const toSq = sq + KNIGHT_DELTAS[i];
        if (toSq & 0x88) continue;
        const targetIdx = sqToIdx(toSq);
        const occ = b[toSq];
        if (occ !== EMPTY && pieceColor(occ) === color) {
          defenseMap[targetIdx] += 1;
        } else {
          attackMap[targetIdx] += 1;
        }
        weightMap[targetIdx] += weight;
      }
    } else if (type === KING) {
      // King steps
      for (let i = 0; i < 8; i++) {
        const toSq = sq + KING_DELTAS[i];
        if (toSq & 0x88) continue;
        const targetIdx = sqToIdx(toSq);
        const occ = b[toSq];
        if (occ !== EMPTY && pieceColor(occ) === color) {
          defenseMap[targetIdx] += 1;
        } else {
          attackMap[targetIdx] += 1;
        }
        weightMap[targetIdx] += weight;

        const edgeId = TOPOLOGY.getEdgeId(uIdx, targetIdx);
        if (edgeId !== undefined) {
          const e = TOPOLOGY.edges[edgeId];
          const sign = (uIdx === e.u) ? 1 : -1;
          fluxMap[edgeId] += sign * weight;
        }
      }
    } else {
      // Sliding pieces: BISHOP, ROOK, QUEEN
      const dirs = type === BISHOP ? BISHOP_DIRS
                 : type === ROOK ? ROOK_DIRS
                 : QUEEN_DIRS;

      for (let d = 0; d < dirs.length; d++) {
        const step = dirs[d];
        let curr = sq + step;
        let prevIdx = uIdx;

        while (!(curr & 0x88)) {
          const targetIdx = sqToIdx(curr);
          const occ = b[curr];

          if (occ !== EMPTY) {
            if (pieceColor(occ) === color) {
              defenseMap[targetIdx] += 1;
            } else {
              attackMap[targetIdx] += 1;
            }
            weightMap[targetIdx] += weight;

            // Direct orthogonal edge contribution
            const edgeId = TOPOLOGY.getEdgeId(prevIdx, targetIdx);
            if (edgeId !== undefined) {
              const e = TOPOLOGY.edges[edgeId];
              const sign = (prevIdx === e.u) ? 1 : -1;
              fluxMap[edgeId] += sign * weight;
            }
            // Ray stopped at first blocker (FD-03 §164)
            break;
          }

          // Empty square is controlled
          attackMap[targetIdx] += 1;
          weightMap[targetIdx] += weight;

          const edgeId = TOPOLOGY.getEdgeId(prevIdx, targetIdx);
          if (edgeId !== undefined) {
            const e = TOPOLOGY.edges[edgeId];
            const sign = (prevIdx === e.u) ? 1 : -1;
            fluxMap[edgeId] += sign * weight;
          }

          prevIdx = targetIdx;
          curr += step;
        }
      }
    }
  }

  // 2. Net Control Potential Field Phi_C (White - Black)
  const netControl = new Float64Array(BOARD_SQUARES);
  for (let i = 0; i < BOARD_SQUARES; i++) {
    netControl[i] = whiteAttack[i] - blackAttack[i];
  }

  // 3. Net orthogonal influence flux
  for (let i = 0; i < ORTHOGONAL_EDGES; i++) {
    netFlux[i] = whiteFlux[i] - blackFlux[i];
  }

  // 4. Compute differential operators
  const controlGradient = discreteGradient(netControl);
  const controlDivergence = discreteDivergence(controlGradient);
  const controlCurl = discreteCurl(controlGradient); // Identically 0 on all 49 faces

  const whiteDivergence = discreteDivergence(whiteFlux);
  const blackDivergence = discreteDivergence(blackFlux);
  const netDivergence = discreteDivergence(netFlux);

  const whiteCurl = discreteCurl(whiteFlux);
  const blackCurl = discreteCurl(blackFlux);
  const netCurl = discreteCurl(netFlux);

  return {
    version: '1.0.0',
    topology: {
      vertices: BOARD_SQUARES,
      edges: ORTHOGONAL_EDGES,
      faces: INTERNAL_FACES,
      eulerCharacteristic: BOARD_SQUARES - ORTHOGONAL_EDGES + INTERNAL_FACES + 1, // 2
      cycleRank: ORTHOGONAL_EDGES - BOARD_SQUARES + 1 // 49
    },
    channels: {
      white: {
        attack: whiteAttack,
        defense: whiteDefense,
        weight: whiteWeight,
        flux: whiteFlux,
        divergence: whiteDivergence,
        curl: whiteCurl
      },
      black: {
        attack: blackAttack,
        defense: blackDefense,
        weight: blackWeight,
        flux: blackFlux,
        divergence: blackDivergence,
        curl: blackCurl
      },
      net: {
        control: netControl,
        flux: netFlux,
        divergence: netDivergence,
        curl: netCurl,
        gradient: controlGradient,
        gradientCurl: controlCurl
      }
    },
    summary: {
      totalWhiteAttack: whiteAttack.reduce((a, b) => a + b, 0),
      totalBlackAttack: blackAttack.reduce((a, b) => a + b, 0),
      totalWhiteWeight: whiteWeight.reduce((a, b) => a + b, 0),
      totalBlackWeight: blackWeight.reduce((a, b) => a + b, 0),
      maxCurlMagnitude: Math.max(...Array.from(netCurl).map(Math.abs)),
      maxDivergenceMagnitude: Math.max(...Array.from(netDivergence).map(Math.abs))
    }
  };
}

/* ===================================================================== *
 * 5. FORMAL INVARIANTS (FD-INV-001 through FD-INV-010)
 * ===================================================================== */

export const FD_INVARIANTS = Object.freeze({
  FD_INV_001: 'FD-INV-001  canonical coordinate isomorphism between 0x88, coords and linear index',
  FD_INV_002: 'FD-INV-002  G4 Euler characteristic V - E + F = 2 and beta1 = 49',
  FD_INV_003: 'FD-INV-003  channel independence between white and black fields',
  FD_INV_004: 'FD-INV-004  gradient anti-symmetry and zero circulation of potential fields',
  FD_INV_005: 'FD-INV-005  discrete Stokes theorem on board face regions',
  FD_INV_006: 'FD-INV-006  discrete Gauss/divergence theorem on vertex subregions',
  FD_INV_007: 'FD-INV-007  boundary of boundary is empty (d1 * b_T == 0)',
  FD_INV_008: 'FD-INV-008  pinned pieces retain geometric attack influence',
  FD_INV_009: 'FD-INV-009  reproducibility and determinism of field computations',
  FD_INV_010: 'FD-INV-010  non-mutation: building field dynamics preserves position state bit-for-bit'
});

/**
 * Executes invariant checks on a Position's FieldDynamics model.
 * Returns array of failures ({ id, detail }).
 */
export function verifyFieldInvariants(pos, fd = null) {
  const failures = [];
  const model = fd || buildFieldDynamics(pos);

  // FD-INV-001: Coordinate mapping bijection
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const { x, y } = sqToCoords(sq);
    const roundSq = coordsToSq(x, y);
    const idx = sqToIdx(sq);
    const roundIdx = coordsToIdx(x, y);
    const backSq = idxToSq(idx);
    if (roundSq !== sq || roundIdx !== idx || backSq !== sq) {
      failures.push({
        id: FD_INVARIANTS.FD_INV_001,
        detail: `coordinate mismatch at sq=${sq}: x=${x}, y=${y}, idx=${idx}`
      });
      break;
    }
  }

  // FD-INV-002: Euler characteristic and cycle rank
  const { eulerCharacteristic, cycleRank } = model.topology;
  if (eulerCharacteristic !== 2) {
    failures.push({
      id: FD_INVARIANTS.FD_INV_002,
      detail: `Euler characteristic is ${eulerCharacteristic}, expected 2`
    });
  }
  if (cycleRank !== 49) {
    failures.push({
      id: FD_INVARIANTS.FD_INV_002,
      detail: `cycle rank is ${cycleRank}, expected 49`
    });
  }

  // FD-INV-003: Channel independence (buffers are distinct instances)
  const { white, black, net } = model.channels;
  if (white.attack === black.attack || white.flux === black.flux || net.control === white.attack) {
    failures.push({
      id: FD_INVARIANTS.FD_INV_003,
      detail: 'shared buffer between white and black channels'
    });
  }

  // FD-INV-004: Gradient anti-symmetry and exact zero curl
  const grad = model.channels.net.gradient;
  const gradCurl = model.channels.net.gradientCurl;
  for (let f = 0; f < INTERNAL_FACES; f++) {
    if (Math.abs(gradCurl[f]) > 1e-9) {
      failures.push({
        id: FD_INVARIANTS.FD_INV_004,
        detail: `non-zero gradient curl on face ${f}: ${gradCurl[f]}`
      });
      break;
    }
  }

  // FD-INV-005: Discrete Stokes Theorem on the center 3x3 face region
  // Region Z: faces with x in [2, 4], y in [2, 4] (9 faces)
  let sumRegionCurl = 0;
  for (let fy = 2; fy <= 4; fy++) {
    for (let fx = 2; fx <= 4; fx++) {
      const faceId = fy * 7 + fx;
      sumRegionCurl += model.channels.net.curl[faceId];
    }
  }

  // Boundary of 3x3 square [x: 2..5, y: 2..5]
  // Bottom: (2,2)->(5,2); Right: (5,2)->(5,5); Top: (5,5)->(2,5); Left: (2,5)->(2,2)
  const boundaryPath = [];
  // Bottom
  for (let x = 2; x <= 5; x++) boundaryPath.push(coordsToIdx(x, 2));
  // Right
  for (let y = 3; y <= 5; y++) boundaryPath.push(coordsToIdx(5, y));
  // Top
  for (let x = 4; x >= 2; x--) boundaryPath.push(coordsToIdx(x, 5));
  // Left
  for (let y = 4; y >= 2; y--) boundaryPath.push(coordsToIdx(2, y));

  const boundaryCirc = cycleCirculation(model.channels.net.flux, boundaryPath);
  if (Math.abs(sumRegionCurl - boundaryCirc) > 1e-7) {
    failures.push({
      id: FD_INVARIANTS.FD_INV_005,
      detail: `Stokes theorem discrepancy: sumCurl=${sumRegionCurl.toFixed(5)}, boundaryCirc=${boundaryCirc.toFixed(5)}`
    });
  }

  // FD-INV-006: Discrete Gauss / Divergence Theorem on center 4x4 squares [2..5]x[2..5]
  let sumRegionDiv = 0;
  const regionSquares = new Set();
  for (let y = 2; y <= 5; y++) {
    for (let x = 2; x <= 5; x++) {
      const idx = coordsToIdx(x, y);
      regionSquares.add(idx);
      sumRegionDiv += model.channels.net.divergence[idx];
    }
  }

  // Boundary flux across region boundary:
  // sum_{u in R, v not in R} J(u -> v)
  let boundaryFlux = 0;
  for (const u of regionSquares) {
    for (const outE of TOPOLOGY.outEdges[u]) {
      if (!regionSquares.has(outE.target)) {
        boundaryFlux += outE.sign * model.channels.net.flux[outE.id];
      }
    }
  }

  if (Math.abs(sumRegionDiv - boundaryFlux) > 1e-7) {
    failures.push({
      id: FD_INVARIANTS.FD_INV_006,
      detail: `Gauss theorem discrepancy: sumDiv=${sumRegionDiv.toFixed(5)}, boundaryFlux=${boundaryFlux.toFixed(5)}`
    });
  }

  return failures;
}
