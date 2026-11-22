/**
 * SUBIT-CHESS v3.0.7 — FEN validator (Position Validator v1.0)
 *
 * Spec basis:
 *   docs/theory/32 §FEN            the position is evidence, not an assumption
 *   UCT-INV-011                    evidence provenance
 *   audit v3.0.6 §3.1              a malformed FEN must not half-change the board
 *
 * Hard constraints:
 *   VALIDATE-001  validation is pure: no position object, no mutation, no throw
 *   VALIDATE-002  every failure carries a machine-readable status and a reason
 *   VALIDATE-003  the checks run before the board is touched, so a rejected FEN
 *                 leaves the current position exactly as it was
 *   VALIDATE-004  the side that is NOT to move may not be in check: such a
 *                 position is illegal and every search result from it is noise
 *
 * The module deliberately does not import `core.mjs`: the validator must be able
 * to reject a FEN before any Position exists. Attack detection is therefore
 * implemented here on a plain 64-entry board (index = rank * 8 + file, rank 0 =
 * the 8th rank).
 */

export const FEN_STATUS = {
  VALID: 'VALID',
  INVALID_SYNTAX: 'INVALID_SYNTAX',
  INVALID_BOARD: 'INVALID_BOARD',
  INVALID_KINGS: 'INVALID_KINGS',
  INVALID_CASTLING: 'INVALID_CASTLING',
  INVALID_EN_PASSANT: 'INVALID_EN_PASSANT',
  INVALID_COUNTERS: 'INVALID_COUNTERS',
  INVALID_POSITION: 'INVALID_POSITION'
};

const PIECE_CHARS = 'pnbrqk';
const FILES = 'abcdefgh';
const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const FEN_BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const FEN_ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inside = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;

const fail = (status, reason) => ({ ok: false, status, reason });
const ok = () => ({ ok: true, status: FEN_STATUS.VALID, reason: '' });

/**
 * FEN counters must be exact integers: a decimal string longer than
 * Number.MAX_SAFE_INTEGER would be rounded by Number(), which can change the
 * 75-move clock or the move number after a round trip (AUD-309-06).
 */
function parseCounter(raw, name, min) {
  if (!/^\d+$/.test(raw)) return { error: fail(FEN_STATUS.INVALID_COUNTERS, `${name} '${raw}'`) };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) {
    return { error: fail(FEN_STATUS.INVALID_COUNTERS, `${name} '${raw}' is out of range`) };
  }
  return { value };
}

/** Is `sq` (r,f) attacked by `by` on a plain 64-entry board? */
function attackedBy(board, r, f, by) {
  const white = by === 'w';
  // pawns: white pawns move toward rank 8 (decreasing r), so they attack from r+1
  const pawnR = white ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    if (!inside(pawnR, f + df)) continue;
    const p = board[pawnR * 8 + f + df];
    if (p === (white ? 'P' : 'p')) return true;
  }
  for (const [dr, df] of KNIGHT_STEPS) {
    if (!inside(r + dr, f + df)) continue;
    if (board[(r + dr) * 8 + f + df] === (white ? 'N' : 'n')) return true;
  }
  for (const [dr, df] of KING_STEPS) {
    if (!inside(r + dr, f + df)) continue;
    if (board[(r + dr) * 8 + f + df] === (white ? 'K' : 'k')) return true;
  }
  for (const [dr, df] of FEN_BISHOP_DIRS) {
    let rr = r + dr, ff = f + df;
    while (inside(rr, ff)) {
      const p = board[rr * 8 + ff];
      if (p !== null) {
        if (white ? (p === 'B' || p === 'Q') : (p === 'b' || p === 'q')) return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  for (const [dr, df] of FEN_ROOK_DIRS) {
    let rr = r + dr, ff = f + df;
    while (inside(rr, ff)) {
      const p = board[rr * 8 + ff];
      if (p !== null) {
        if (white ? (p === 'R' || p === 'Q') : (p === 'r' || p === 'q')) return true;
        break;
      }
      rr += dr; ff += df;
    }
  }
  return false;
}

/**
 * Validate a FEN without touching any position.
 * @returns {{ok: boolean, status: string, reason: string}}
 */
export function validateFEN(fen) {
  if (typeof fen !== 'string' || fen.trim() === '') {
    return fail(FEN_STATUS.INVALID_SYNTAX, 'empty FEN');
  }
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4 || parts.length > 6) {
    return fail(FEN_STATUS.INVALID_SYNTAX, `expected 4-6 fields, got ${parts.length}`);
  }

  /* ---- board: 8 ranks, 8 files each, known pieces, kings, pawn ranks ---- */
  const rows = parts[0].split('/');
  if (rows.length !== 8) {
    return fail(FEN_STATUS.INVALID_BOARD, `expected 8 ranks, got ${rows.length}`);
  }
  const board = new Array(64).fill(null);
  let whiteKing = -1, blackKing = -1;
  let whiteCount = 0, blackCount = 0;
  for (let r = 0; r < 8; r++) {
    const rankName = 8 - r;
    let f = 0;
    let prevDigit = false;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        // AUD-311-02: reject non-canonical adjacent digit spans (e.g. "44").
        if (prevDigit) {
          return fail(FEN_STATUS.INVALID_BOARD, `non-canonical empty span on rank ${rankName}`);
        }
        f += Number(ch);
        prevDigit = true;
        continue;
      }
      prevDigit = false;
      const lower = ch.toLowerCase();
      if (PIECE_CHARS.indexOf(lower) === -1) {
        return fail(FEN_STATUS.INVALID_BOARD, `unknown piece '${ch}' on rank ${rankName}`);
      }
      if (f > 7) {
        return fail(FEN_STATUS.INVALID_BOARD, `rank ${rankName} has more than 8 files`);
      }
      const color = ch === lower ? 'b' : 'w';
      const sq = r * 8 + f;
      if (lower === 'p' && (r === 0 || r === 7)) {
        return fail(FEN_STATUS.INVALID_BOARD, `pawn on rank ${rankName}`);
      }
      if (color === 'w') whiteCount++; else blackCount++;
      if (whiteCount > 16 || blackCount > 16) {
        return fail(FEN_STATUS.INVALID_BOARD, `too many ${color === 'w' ? 'white' : 'black'} pieces`);
      }
      if (lower === 'k') {
        if (color === 'w') {
          if (whiteKing >= 0) return fail(FEN_STATUS.INVALID_KINGS, 'two white kings');
          whiteKing = sq;
        } else {
          if (blackKing >= 0) return fail(FEN_STATUS.INVALID_KINGS, 'two black kings');
          blackKing = sq;
        }
      }
      board[sq] = color === 'w' ? ch : lower;
      f++;
    }
    if (f !== 8) {
      return fail(FEN_STATUS.INVALID_BOARD, `rank ${rankName} has ${f} files`);
    }
  }
  if (whiteKing < 0 || blackKing < 0) {
    return fail(FEN_STATUS.INVALID_KINGS, 'both kings are required');
  }
  const wr = whiteKing >> 3, wf = whiteKing & 7;
  const br = blackKing >> 3, bf = blackKing & 7;
  if (Math.abs(wr - br) <= 1 && Math.abs(wf - bf) <= 1) {
    return fail(FEN_STATUS.INVALID_POSITION, 'the kings are adjacent');
  }

  /* ---- side to move ---- */
  const turn = parts[1];
  if (turn !== 'w' && turn !== 'b') {
    return fail(FEN_STATUS.INVALID_SYNTAX, `side to move '${turn}'`);
  }

  /* ---- castling rights: syntax, no duplicates, rights imply home squares ---- */
  const castling = parts[2];
  if (castling === '-') {
    // no rights
  } else if (!/^[KQkq]+$/.test(castling)) {
    return fail(FEN_STATUS.INVALID_CASTLING, `castling field '${castling}'`);
  } else {
    for (const ch of ['K', 'Q', 'k', 'q']) {
      if (castling.split(ch).length > 2) {
        return fail(FEN_STATUS.INVALID_CASTLING, `duplicate castling right '${ch}'`);
      }
    }
    const home = { K: ['w', 60, 63], Q: ['w', 60, 56], k: ['b', 4, 7], q: ['b', 4, 0] };
    for (const ch of castling) {
      const [color, kingSq, rookSq] = home[ch];
      const king = board[kingSq];
      const rook = board[rookSq];
      if (king !== (color === 'w' ? 'K' : 'k')) {
        return fail(FEN_STATUS.INVALID_CASTLING, `right '${ch}' without the king on its home square`);
      }
      if (rook !== (color === 'w' ? 'R' : 'r')) {
        return fail(FEN_STATUS.INVALID_CASTLING, `right '${ch}' without the rook on its home square`);
      }
    }
  }

  /* ---- en passant: syntax, rank matches the side to move, capture exists ---- */
  const ep = parts[3];
  if (ep !== '-') {
    if (!/^[a-h][36]$/.test(ep)) {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, `en passant square '${ep}'`);
    }
    const ef = FILES.indexOf(ep[0]);
    const er = ep[1] === '6' ? 2 : 5;          // rank 6 -> r=2, rank 3 -> r=5
    if (turn === 'w' && ep[1] !== '6') {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, 'white to move requires the en passant square on rank 6');
    }
    if (turn === 'b' && ep[1] !== '3') {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, 'black to move requires the en passant square on rank 3');
    }
    if (board[er * 8 + ef] !== null) {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, 'the en passant square is occupied');
    }
    // the pawn that just moved two squares stands directly in front of it
    const pushedR = turn === 'w' ? 3 : 4;      // white captures to rank 6 (pawn on rank 5)
    if (board[pushedR * 8 + ef] !== (turn === 'w' ? 'p' : 'P')) {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, 'no enemy pawn stands beside the en passant square');
    }
    // The pawn's origin square must be empty after the double push (AUD-309-05).
    // The target is only recorded for the immediately preceding move, so no
    // later piece can have occupied that square in a reachable position.
    const originR = turn === 'w' ? 1 : 6;
    if (board[originR * 8 + ef] !== null) {
      return fail(FEN_STATUS.INVALID_EN_PASSANT, 'the en passant origin square is occupied');
    }
    // The target square is recorded after every double push, whether or not a
    // capture is available (PGN standard), so a missing capturer is not an
    // error — the move generator decides whether the capture is legal.
  }

  /* ---- counters ---- */
  if (parts.length >= 5) {
    const c = parseCounter(parts[4], 'halfmove clock', 0);
    if (c.error) return c.error;
  }
  if (parts.length >= 6) {
    const c = parseCounter(parts[5], 'fullmove number', 1);
    if (c.error) return c.error;
  }

  /* ---- the side that is not to move may not be in check ---- */
  const mover = turn;
  const other = turn === 'w' ? 'b' : 'w';
  const otherKing = other === 'w' ? whiteKing : blackKing;
  if (attackedBy(board, otherKing >> 3, otherKing & 7, mover)) {
    return fail(FEN_STATUS.INVALID_POSITION, `${other === 'w' ? 'white' : 'black'} is in check but does not move`);
  }

  return ok();
}