# SUBIT-CHESS ABI v0.1 — Chess Unit

Status: executable reference adapter; draft integration contract.

## Purpose

The Chess Unit exposes the existing chess rules engine through SUBIT-CPU memory-mapped registers. The adapter is a host-side peripheral: v0.1 does **not** claim that chess move generation or search is already implemented as SUBIT-CPU instructions.

## Address map

- 0x0000–0x000F: BOARD[16], four squares per 16-bit word.
- 0x0010 FLAGS: bit 0 side to move (0 white, 1 black); bits 1–4 castling K,Q,k,q.
- 0x0011 EP: en-passant square index; 0xFFFF means none.
- 0x0012 HALFMOVE; 0x0013 FULLMOVE.
- 0x0014 HASH_LO; 0x0015 HASH_HI: unsigned 32-bit position hash.
- 0x0020 COMMAND; 0x0021 STATUS; 0x0022 LEGAL_COUNT.
- 0x0023 MOVE_INDEX (reserved in v0.1); 0x0024 MOVE_DATA.
- 0x0025 EVAL_LO; 0x0026 EVAL_HI; 0x0027 RESULT; 0x0028 ERROR.
- 0x0030–0x0031 transaction telemetry: undo depth and staged-move flag.
- 0x0100–0x01FF: legal move buffer (up to 256 packed moves).

Square index is a1=0, b1=1, …, h8=63. In BOARD, square 4k occupies bits 15..12, followed by squares 4k+1, 4k+2, 4k+3. Piece nibble: 0 empty; 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K; add 8 for black.

## Commands

INIT=1, GEN_LEGAL=2, TRY_MOVE=3, UNDO=4, EVAL=5, HASH=6, STATUS=7, STAGE_MOVE=8, VALIDATE=9.

The caller writes COMMAND and, where required, MOVE_DATA, then invokes the host adapter's dispatch(). INIT loads the standard initial position. GEN_LEGAL writes packed moves to the move buffer. STAGE_MOVE and VALIDATE are non-mutating. TRY_MOVE validates against legal moves before committing. UNDO restores the last committed move.

## Move word

FROM[15:10], TO[9:4], PROMO[3:1], bit 0 reserved and must be zero. Promotion: 0 none, 1 queen, 2 rook, 3 bishop, 4 knight. The adapter rejects invalid/reserved encodings and resolves moves against the rules engine's legal-move list.

## Status and result

STATUS: IDLE=0, READY=1, OK=2, ILLEGAL=3, GAME_OVER=4, ERROR=0xFFFF.
RESULT: NONE=0, WHITE=1, BLACK=2, DRAW=3.
ERROR: NONE=0, BAD_COMMAND=1, BAD_MOVE=2, NO_UNDO=3, NO_POSITION=4, CAPACITY=5.

## Deliberate limits

- This is an ABI/peripheral adapter, not an instruction-level chess accelerator.
- Search, evaluation beyond material, repetition-history ABI, clocks, draw claims, and CPU-native move generation are not part of v0.1.
- 32-bit hash is exposed as two 16-bit words; the underlying engine may internally use a wider numeric hash.
