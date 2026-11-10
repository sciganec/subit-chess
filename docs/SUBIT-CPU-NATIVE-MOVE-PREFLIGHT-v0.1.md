# SUBIT-CPU Native Move Preflight v0.1

**Status:** CPU-executed validation of basic move ABI and occupancy preconditions.

## Purpose

The preflight program gates the raw staged move-application primitive. It rejects malformed or structurally impossible candidates before the candidate is applied to a scratch board.

## Input ABI

- Packed board: 16 words, four piece nibbles per word, most-significant nibble first.
- Move word: `from[15:10] | to[9:4] | promotion[3:1] | reserved[0]`.
- Flags word: bit 0 is side to move (0 white, 1 black).

## Checks

The CPU-native program performs:
1. Reserved bit 0 must be zero.
2. Source and destination squares must differ.
3. Source square must contain a piece.
4. Source piece code must belong to the side to move (white 1–6; black 9–14).
5. Destination must not contain a friendly piece.

It uses packed-board address arithmetic, ULOAD, UEXTRACT4, integer comparisons, XBR control flow, and a status write. The caller does not need to decode the board in JavaScript.

## Status codes

| Code | Meaning |
|---:|---|
| 0 | Not yet completed / no result |
| 1 | Preflight passed |
| 2 | Reserved move bit set |
| 3 | Source equals destination |
| 4 | Empty source |
| 5 | Source belongs to the other side |
| 6 | Friendly piece occupies destination |
| 7 | Invalid source nibble selection |
| 8 | Invalid destination nibble selection |

## Pipeline integration

The king-safety pipeline now runs `MOVE_PREFLIGHT` before `MOVE_APPLY`. A failed preflight prevents scratch-board mutation and stops the pipeline. On success, the existing staged apply → opponent attack map → king safety sequence proceeds.

## Explicit limits

This is **not** complete chess move validation. It does not check piece movement geometry, path obstruction for non-sliding moves, check evasion, promotion eligibility, en passant, castling, or king safety. The promotion field is preserved in the move word but is not interpreted by this preflight stage. Those checks remain later milestones.

The raw move-apply primitive is still intentionally narrow: it relocates the source nibble and overwrites the destination nibble on a scratch board. The preflight's occupancy guard prevents friendly overwrites in the composed pipeline, but does not make the primitive safe as a standalone public API.
