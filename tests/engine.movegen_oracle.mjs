// Independent move-generation completeness oracle (audit R-02/R-15).
// Generates pseudo-legal moves from scratch (8x8 coordinates, no Position.generateMoves),
// filters by independent king-safety check, and compares legal move sets to the engine.
// This is a test oracle, not production code.
import { Engine } from '../src/engine/index.mjs';
import { moveToUci, MOVE_FROM, MOVE_TO, MOVE_PROMO, MOVE_FLAGS, FLAG_CAPTURE, FLAG_EP, FLAG_CASTLE, FLAG_DOUBLE, FLAG_PROMO,
  PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK } from '../src/engine/core.mjs';

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; if (failures <= 20) console.error('FAIL', msg); } };

const inb = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
const idx = (r, f) => r * 16 + f; // 0x88
const R = sq => sq >> 4;
const F = sq => sq & 7;
const pieceAt = (board, r, f) => board[idx(r, f)];
const typeOf = p => p & 7;
const colorOf = p => p >> 3;
const isEmpty = p => !p;

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

function attacksSquare(board, r, f, byColor) {
  // pawn attacks
  const dir = byColor === WHITE ? -1 : 1; // white pawns attack toward lower row indices (rank increases)
  for (const df of [-1,1]) {
    const rr = r - dir, ff = f + df;
    if (!inb(rr,ff)) continue;
    const p = pieceAt(board, rr, ff);
    if (p && colorOf(p) === byColor && typeOf(p) === PAWN) return true;
  }
  for (const [dr,df] of KN) {
    const rr=r+dr, ff=f+df; if(!inb(rr,ff)) continue;
    const p=pieceAt(board,rr,ff); if(p && colorOf(p)===byColor && typeOf(p)===KNIGHT) return true;
  }
  for (const [dr,df] of DIAG) {
    for (let k=1;k<8;k++) {
      const rr=r+dr*k, ff=f+df*k; if(!inb(rr,ff)) break;
      const p=pieceAt(board,rr,ff); if(!p) continue;
      if (colorOf(p)===byColor && (typeOf(p)===BISHOP||typeOf(p)===QUEEN)) return true;
      break;
    }
  }
  for (const [dr,df] of ORTH) {
    for (let k=1;k<8;k++) {
      const rr=r+dr*k, ff=f+df*k; if(!inb(rr,ff)) break;
      const p=pieceAt(board,rr,ff); if(!p) continue;
      if (colorOf(p)===byColor && (typeOf(p)===ROOK||typeOf(p)===QUEEN)) return true;
      break;
    }
  }
  for (let dr=-1;dr<=1;dr++) for (let df=-1;df<=1;df++) {
    if (dr===0 && df===0) continue;
    const rr=r+dr, ff=f+df; if(!inb(rr,ff)) continue;
    const p=pieceAt(board,rr,ff); if(p && colorOf(p)===byColor && typeOf(p)===KING) return true;
  }
  return false;
}

function findKing(board, color) {
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p=pieceAt(board,r,f);
    if (p && colorOf(p)===color && typeOf(p)===KING) return idx(r,f);
  }
  return -1;
}

function makeBoard(pos) {
  const b = new Array(128).fill(0);
  for (let i=0;i<128;i++) { if (i&0x88) continue; b[i]=pos.board[i]||0; }
  return b;
}

function applyPseudo(board, m, pos) {
  // returns undo info; applies move on plain board array for king-safety check
  const from=MOVE_FROM(m), to=MOVE_TO(m), promo=MOVE_PROMO(m), flags=MOVE_FLAGS(m);
  const u = { from,to,flags,promo, moved:board[from], captured:board[to], epCap:-1, epCapPiece:0, rookFrom:-1, rookTo:-1, rookPiece:0 };
  board[to] = board[from];
  board[from] = 0;
  if (flags & FLAG_EP) {
    const capSq = to + ((colorOf(u.moved)===WHITE) ? 16 : -16);
    u.epCap = capSq; u.epCapPiece = board[capSq]; board[capSq] = 0;
  }
  if (flags & FLAG_PROMO) {
    board[to] = (promo) | (colorOf(u.moved) << 3);
  }
  if (flags & FLAG_CASTLE) {
    if (to === idx(7,6)) { u.rookFrom=idx(7,7); u.rookTo=idx(7,5); }
    else if (to === idx(7,2)) { u.rookFrom=idx(7,0); u.rookTo=idx(7,3); }
    else if (to === idx(0,6)) { u.rookFrom=idx(0,7); u.rookTo=idx(0,5); }
    else if (to === idx(0,2)) { u.rookFrom=idx(0,0); u.rookTo=idx(0,3); }
    if (u.rookFrom !== -1) { u.rookPiece=board[u.rookFrom]; board[u.rookTo]=u.rookPiece; board[u.rookFrom]=0; }
  }
  return u;
}
function undoPseudo(board, u) {
  board[u.from] = u.moved;
  board[u.to] = u.captured;
  if (u.epCap !== -1) board[u.epCap] = u.epCapPiece;
  if (u.rookFrom !== -1) { board[u.rookFrom]=u.rookPiece; board[u.rookTo]=0; }
}

function genPseudo(board, pos) {
  const us = pos.turn;
  const them = us ^ 1;
  const out = [];
  const push = (from,to,promo,flags) => out.push({from,to,promo,flags});
  for (let r=0;r<8;r++) for (let f=0;f<8;f++) {
    const p = pieceAt(board,r,f);
    if (!p || colorOf(p)!==us) continue;
    const t = typeOf(p);
    const from = idx(r,f);
    if (t===PAWN) {
      const dir = us===WHITE ? -1 : 1;
      const startRank = us===WHITE ? 6 : 1;
      const promoRank = us===WHITE ? 0 : 7;
      const oneR = r+dir;
      if (inb(oneR,f) && isEmpty(pieceAt(board,oneR,f))) {
        if (oneR===promoRank) for (const pr of [QUEEN,ROOK,BISHOP,KNIGHT]) push(from,idx(oneR,f),pr,FLAG_PROMO);
        else {
          push(from,idx(oneR,f),0,0);
          const twoR=r+dir*2;
          if (r===startRank && isEmpty(pieceAt(board,twoR,f))) push(from,idx(twoR,f),0,FLAG_DOUBLE);
        }
      }
      for (const df of [-1,1]) {
        const rr=r+dir, ff=f+df;
        if (!inb(rr,ff)) continue;
        const target = pieceAt(board,rr,ff);
        const to = idx(rr,ff);
        if (target && colorOf(target)===them) {
          if (rr===promoRank) for (const pr of [QUEEN,ROOK,BISHOP,KNIGHT]) push(from,to,pr,FLAG_PROMO|FLAG_CAPTURE);
          else push(from,to,0,FLAG_CAPTURE);
        } else if (pos.ep !== -1 && to === pos.ep) {
          push(from,to,0,FLAG_CAPTURE|FLAG_EP);
        }
      }
    } else if (t===KNIGHT) {
      for (const [dr,df] of KN) { const rr=r+dr,ff=f+df; if(!inb(rr,ff)) continue; const target=pieceAt(board,rr,ff); if(target && colorOf(target)===us) continue; push(from,idx(rr,ff),0,target?FLAG_CAPTURE:0); }
    } else if (t===KING) {
      for (let dr=-1;dr<=1;dr++) for (let df=-1;df<=1;df++) {
        if (dr===0&&df===0) continue; const rr=r+dr,ff=f+df; if(!inb(rr,ff)) continue; const target=pieceAt(board,rr,ff); if(target && colorOf(target)===us) continue; push(from,idx(rr,ff),0,target?FLAG_CAPTURE:0);
      }
      // castling
      const homeR = us===WHITE?7:0;
      if (r===homeR && f===4 && !attacksSquare(board,r,f,them)) {
        const canK = us===WHITE ? (pos.castling&1) : (pos.castling&4);
        const canQ = us===WHITE ? (pos.castling&2) : (pos.castling&8);
        if (canK && isEmpty(pieceAt(board,homeR,5)) && isEmpty(pieceAt(board,homeR,6)) && !attacksSquare(board,homeR,5,them) && !attacksSquare(board,homeR,6,them)) {
          const rook=pieceAt(board,homeR,7); if (rook && colorOf(rook)===us && typeOf(rook)===ROOK) push(from,idx(homeR,6),0,FLAG_CASTLE);
        }
        if (canQ && isEmpty(pieceAt(board,homeR,1)) && isEmpty(pieceAt(board,homeR,2)) && isEmpty(pieceAt(board,homeR,3)) && !attacksSquare(board,homeR,3,them) && !attacksSquare(board,homeR,2,them)) {
          const rook=pieceAt(board,homeR,0); if (rook && colorOf(rook)===us && typeOf(rook)===ROOK) push(from,idx(homeR,2),0,FLAG_CASTLE);
        }
      }
    } else {
      const dirs = (t===BISHOP)?DIAG:(t===ROOK)?ORTH:[...DIAG,...ORTH];
      for (const [dr,df] of dirs) for (let k=1;k<8;k++) {
        const rr=r+dr*k, ff=f+df*k; if(!inb(rr,ff)) break;
        const target=pieceAt(board,rr,ff);
        if (target && colorOf(target)===us) break;
        push(from,idx(rr,ff),0,target?FLAG_CAPTURE:0);
        if (target) break;
      }
    }
  }
  return out;
}

function legalByOracle(pos) {
  const board = makeBoard(pos);
  const pseudo = genPseudo(board, pos);
  const us = pos.turn;
  const them = us ^ 1;
  const legal = [];
  for (const m of pseudo) {
    // encode to engine move for apply/uci comparison
    const enc = (m.from & 127) | ((m.to & 127) << 7) | ((m.promo & 7) << 14) | ((m.flags & 31) << 17);
    const u = applyPseudo(board, enc, pos);
    const ksq = findKing(board, us);
    const kr = R(ksq), kf = F(ksq);
    if (ksq !== -1 && !attacksSquare(board, kr, kf, them)) legal.push(enc);
    undoPseudo(board, u);
  }
  return legal;
}

function keySet(moves) { return new Set(moves.map(m => moveToUci(m))); }

const e = new Engine();

const positions = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
  'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
  'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
  // EP pin / legality edge cases
  '8/8/8/2k5/3Pp3/8/8/4K3 b - d3 0 1',
  '8/8/3p4/1Pp4r/1K5k/8/4P1P1/8 w - c6 0 2',
  '4k3/8/8/8/5pP1/8/8/4K3 b - g3 0 1',
  // castling/check-through cases
  'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
  'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
  'r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1',
  'r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1',
  // promotions/check evasions
  '8/P7/8/8/8/8/k6p/7K w - - 0 1',
  'n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1',
  'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
];

let total = 0;
for (const fen of positions) {
  e.setFEN(fen);
  const pos = e.pos;
  const eng = keySet(pos.legalMoves());
  const ref = keySet(legalByOracle(pos));
  for (const m of ref) check(eng.has(m), `missing in engine: ${m} fen=${fen}`);
  for (const m of eng) check(ref.has(m), `extra in engine: ${m} fen=${fen}`);
  check(eng.size===ref.size, `size mismatch ${eng.size} vs ${ref.size} fen=${fen}`);
  total++;
}

for (const seed0 of [20261127, 20261128, 20261129]) {
  let seed = seed0;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let g=0; g<60; g++) {
    e.setFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const pos = e.pos;
    for (let ply=0; ply<120; ply++) {
      const engMoves = pos.legalMoves();
      if (!engMoves.length) break;
      const eng = keySet(engMoves);
      const ref = keySet(legalByOracle(pos));
      for (const m of ref) check(eng.has(m), `missing in engine: ${m} seed=${seed0} ply=${ply} fen=${pos.fen()}`);
      for (const m of eng) check(ref.has(m), `extra in engine: ${m} seed=${seed0} ply=${ply} fen=${pos.fen()}`);
      check(eng.size===ref.size, `size mismatch ${eng.size} vs ${ref.size} seed=${seed0} ply=${ply} fen=${pos.fen()}`);
      total++;
      const m = engMoves[rnd(engMoves.length)];
      pos.pushRep(); pos.makeMove(m);
    }
  }
}

if (failures) {
  console.error(`MOVEGEN_ORACLE FAIL: ${failures} failures, ${total} positions`);
  process.exit(1);
}
console.log(`MOVEGEN_ORACLE OK: ${total} positions checked`);
