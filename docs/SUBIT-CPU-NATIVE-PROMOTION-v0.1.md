# SUBIT-CPU Native Promotion v0.1

**Status:** CPU-executed promotion replacement on the staged packed board.

## Purpose

Promotion is separated from raw move application. The move-apply stage relocates the source piece to the destination on a scratch board. The promotion stage then validates the promotion field and replaces the pawn nibble with the selected promoted piece.

## ABI

Move word: `from[15:10] | to[9:4] | promotion[3:1] | reserved[0]`.

Promotion codes:
- 0 — no promotion;
- 1 — queen;
- 2 — rook;
- 3 — bishop;
- 4 — knight;
- 5–7 — invalid.

The side-to-move bit is `FLAGS[0]`: 0 white, 1 black. The promotion program reads and writes the packed staged board, by default at 0x0500.

## CPU-executed checks and transformation

1. Decode the promotion field.
2. Accept code 0 as a no-op.
3. Reject codes outside 1–4.
4. Require the destination to be rank 8 for white or rank 1 for black.
5. Read the destination nibble and require the moving pawn code (white 1, black 9).
6. Replace the nibble with the selected piece code; black promoted pieces add 8 to the type code.

The CPU performs destination decoding, rank checking, packed-board reads, nibble extraction, piece-code construction, nibble insertion, and memory write.

## Status

| Code | Meaning |
|---:|---|
| 0 | Not run |
| 1 | OK / no promotion or replacement completed |
| 2 | Invalid promotion code |
| 3 | Wrong destination rank |
| 4 | Destination does not contain the moving pawn |

## Pipeline

The staged king-safety pipeline now runs:

`MOVE_PREFLIGHT → MOVE_GEOMETRY → MOVE_APPLY → PROMOTION → ATTACK_MAP × 5 → KING_SAFETY`

A failed promotion stage prevents attack-map construction and king-safety acceptance. The original board remains unchanged; promotion affects only the staged board.

## Tests

Regressions cover white queen and knight promotion, black rook promotion, wrong rank, invalid promotion code, non-pawn destination, and an end-to-end a7–a8=Q staged move followed by opponent attack-map construction and king-safety validation.

## Limits

This module does not yet implement en passant or castling. It assumes the move geometry and preflight stages have already checked source ownership and displacement. The promotion stage validates the destination rank and staged pawn identity, but full chess legality still depends on the complete pipeline and independent move-oracle comparison.
