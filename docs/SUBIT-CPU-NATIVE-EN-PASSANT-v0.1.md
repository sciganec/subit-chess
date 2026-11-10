# SUBIT-CPU Native En Passant v0.1

**Status:** CPU-executed removal of the captured pawn from a staged board.

## ABI

- Move word: `from[15:10] | to[9:4] | promotion[3:1] | reserved[0]`.
- EP target: Chess Unit memory word `0x0011`; `0xFFFF` means no target.
- Side to move: `FLAGS[0]` (0 white, 1 black).
- Staged board defaults to 0x0500–0x050F.

## Runtime behavior

The CPU program decodes source and destination squares, compares the destination with the EP target, and verifies that the move is diagonal. If the target does not match, or the move is not diagonal, the stage is a no-op.

For a matching diagonal move, it verifies that the staged destination contains the moving side's pawn. Non-pawn moves to the EP target remain ordinary moves and are a no-op in this stage. It computes the captured-pawn square (destination − 8 for white, destination + 8 for black), checks for the opposing pawn, and clears that packed-board nibble with UINSERT4.

## Status

| Code | Meaning |
|---:|---|
| 0 | Not run |
| 1 | No en-passant transformation required |
| 2 | Captured pawn removed |
| 3 | Expected opposing pawn absent from capture square |
| 4 | Reserved for malformed source/destination pawn state |

## Pipeline

The king-safety pipeline now executes:

`MOVE_PREFLIGHT → MOVE_GEOMETRY → MOVE_APPLY → EN_PASSANT → PROMOTION → ATTACK_MAP × 5 → KING_SAFETY`

The EP transformation occurs before promotion, attack-map generation, and king-safety testing. It only mutates the scratch board; the original board remains intact.

## Tests

Tests cover white and black en-passant captures, absent/mismatched EP targets, invalid captured-pawn occupancy, non-pawn moves to an EP target, and an end-to-end white en-passant move followed by attack-map and king-safety stages.

## Limits

This stage assumes the move preflight and geometry stages have already validated source ownership and pawn displacement. It does not itself validate the complete FEN en-passant history or update the EP target, halfmove clock, hash, repetition history, or move counters. Those belong to the state-transition layer.
