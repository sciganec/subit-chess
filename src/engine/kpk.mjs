/**
 * KPK bitbase (K+P vs K), computed at first use by a monotone fix-point over all
 * 2*64*64*48 placements; no external data. White is the pawn side; for a black
 * pawn the caller mirrors ranks and swaps colours.
 *
 * Squares are 0..63 (rank*8+file, rank 0 = rank 1). Result: win for the pawn
 * side (true) or not (draw). Promotion counts as a win unless the new queen is
 * lost at once or the position is stalemate (underpromotion cannot do better).
 */
const idx = (stm, wk, bk, p) => (((stm * 64 + wk) * 64 + bk) * 64 + p);
const adj = (a, b) => Math.abs((a >> 3) - (b >> 3)) <= 1 && Math.abs((a & 7) - (b & 7)) <= 1 && a !== b;
const KDIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
let TABLE = null;
let DIST = null;

function kingMoves(sq) {
  const r = sq >> 3, f = sq & 7, out = [];
  for (const [dr, df] of KDIRS) { const nr = r + dr, nf = f + df; if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) out.push(nr * 8 + nf); }
  return out;
}
const KM = Array.from({ length: 64 }, (_, s) => kingMoves(s));
const pawnAttacks = (p, sq) => { // does a white pawn on p attack sq
  const r = p >> 3, f = p & 7;
  return (sq >> 3) === r + 1 && Math.abs((sq & 7) - f) === 1;
};

function valid(stm, wk, bk, p) {
  const pr = p >> 3;
  if (pr < 1 || pr > 6) return false;
  if (wk === bk || wk === p || bk === p || adj(wk, bk)) return false;
  if (stm === 0 && pawnAttacks(p, bk)) return false; // black in check with white to move
  return true;
}

function build() {
  const win = new Uint8Array(2 * 64 * 64 * 64);
  const dist = new Uint8Array(win.length);   // BFS level at which a position became won (1 = mate / promotion next)
  const blackMoves = (wk, bk, p) => {
    const res = [];
    for (const t of KM[bk]) {
      if (adj(t, wk) || pawnAttacks(p, t)) continue;
      res.push(t); // t === p is a capture (legal only if the pawn is unprotected, covered by adj(t,wk))
    }
    return res;
  };
  // mates: black to move, in check, no moves
  for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
    if (!valid(1, wk, bk, p)) continue;
    if (pawnAttacks(p, bk) && blackMoves(wk, bk, p).length === 0) { win[idx(1, wk, bk, p)] = 1; dist[idx(1, wk, bk, p)] = 1; }
  }
  let level = 1, changed = true;
  while (changed) {
    changed = false; level++;
    const fresh = [];
    for (let wk = 0; wk < 64; wk++) for (let bk = 0; bk < 64; bk++) for (let p = 8; p < 56; p++) {
      // white to move
      if (valid(0, wk, bk, p) && !win[idx(0, wk, bk, p)]) {
        let w = false;
        for (const t of KM[wk]) { if (t === p || adj(t, bk)) continue; if (win[idx(1, t, bk, p)]) { w = true; break; } }
        if (!w) {
          const np = p + 8;
          if (np !== wk && np !== bk) {
            if (np >> 3 === 7) {
              // promotion: queen on np, black to move; wins unless captured (bk adjacent, wk not) or stalemate
              const capt = adj(bk, np) && !adj(wk, np);
              let stale = false;
              if (!capt) { // black has no move and is not in check -> stalemate (queen attack approximated by line test)
                stale = promoStalemate(wk, bk, np);
              }
              w = !capt && !stale;
            } else if (win[idx(1, wk, bk, np)]) w = true;
            if (!w && (p >> 3) === 1 && (np + 8) !== wk && (np + 8) !== bk && win[idx(1, wk, bk, np + 8)]) w = true;
          }
        }
        if (w) { fresh.push(idx(0, wk, bk, p)); changed = true; }
      }
      // black to move
      if (valid(1, wk, bk, p) && !win[idx(1, wk, bk, p)]) {
        const mv = blackMoves(wk, bk, p);
        if (mv.length === 0) continue; // mate handled above, stalemate = draw
        let all = true;
        for (const t of mv) { if (t === p || !win[idx(0, wk, t, p)]) { all = false; break; } }
        if (all) { fresh.push(idx(1, wk, bk, p)); changed = true; }
      }
    }
    for (const i of fresh) { win[i] = 1; dist[i] = level; }
  }
  DIST = dist;
  return win;
}

// stalemate after promotion to a queen on q (black to move, bk not capturing): every king move attacked by Q or K
function promoStalemate(wk, bk, q) {
  const attacked = (sq) => {
    if (adj(sq, wk)) return true;
    if (sq === q) return false;
    const dr = (sq >> 3) - (q >> 3), df = (sq & 7) - (q & 7);
    if (!(dr === 0 || df === 0 || Math.abs(dr) === Math.abs(df))) return false;
    const sr = Math.sign(dr), sf = Math.sign(df);
    let r = (q >> 3) + sr, f = (q & 7) + sf;
    while (r * 8 + f !== sq) { const s = r * 8 + f; if (s === wk) return false; r += sr; f += sf; }
    return true;
  };
  const inCheck = attacked(bk) && !adj(bk, wk);
  // note: attacked() counts wk adjacency; for the check test use queen lines only
  const qCheck = (() => { if (bk === q) return false; const dr = (bk >> 3) - (q >> 3), df = (bk & 7) - (q & 7); if (!(dr === 0 || df === 0 || Math.abs(dr) === Math.abs(df))) return false; const sr = Math.sign(dr), sf = Math.sign(df); let r = (q >> 3) + sr, f = (q & 7) + sf; while (r * 8 + f !== bk) { if (r * 8 + f === wk) return false; r += sr; f += sf; } return true; })();
  if (qCheck) return false;
  for (const t of KM[bk]) if (!attacked(t) && t !== q) return false;
  void inCheck;
  return true;
}

export function kpkTable() { return TABLE || (TABLE = build()); }

/** @param wk white king, bk black king, p white pawn (0..63), stm 0 = pawn side to move. true = pawn side wins. */
export function kpkWins(wk, bk, p, stm) {
  const t = kpkTable();
  return t[idx(stm, wk, bk, p)] === 1;
}

/** Plies-ish distance to the win (BFS level, 0 when the position is not won). Smaller = closer. */
export function kpkDist(wk, bk, p, stm) {
  kpkTable();
  return DIST[idx(stm, wk, bk, p)];
}
