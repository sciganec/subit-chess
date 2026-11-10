# SUBIT-CPU Native Move Apply v0.1

## Purpose

This module performs a CPU-native transformation of a packed chess board for one encoded move. It is a staged operation: the input board is copied to a separate scratch region and only the scratch copy is changed. The original board remains intact.

## Input

- boardAddress: 16 words, four 4-bit square codes per word.
- moveAddress: one 16-bit move word using the SUBIT-CHESS ABI:
  - from = (move >>> 10) AND 63
  - to = (move >>> 4) AND 63
  - promotion = (move >>> 1) AND 7 (not yet applied by this primitive).
- scratchBoardAddress: 16-word destination board, non-overlapping with source.

Default addresses are source board 0x0000, move 0x0024, scratch board 0x0500, and program start 0x8000.

## Execution

The assembler emits a program containing:

1. Sixteen CPU-native ULOAD/USTORE pairs to copy the packed board.
2. Move decoding using UTOF, fixed FOUR-register shifts, FTOU and UAND.
3. Source-square packed-word read and four-way nibble-index dispatch.
4. UINSERT4 to clear the source nibble after saving its piece code.
5. Destination-square packed-word read and four-way nibble-index dispatch.
6. UINSERT4 to write the saved piece code into the destination nibble.
7. A success status word at stateAddress.

The VM executes all board copying, move-field extraction, nibble selection, and packed-board writes. JavaScript only assembles the instruction stream.

## Transaction boundary

The source board is never modified. A caller can inspect the staged board and then either commit it by copying the 16 words back or discard it. If the program traps, the source board remains unchanged; scratch memory may contain a partial staged image and must be treated as invalid unless the success status is set.

## Contract and limitations

This is a raw packed-board application primitive, not a legal move validator. Its preconditions are: the move word is well-formed, the source square contains a piece, and the move is otherwise authorized by the caller.

Current behavior overwrites the destination nibble with the source piece. It does not yet validate side ownership or friendly destination occupancy. It does not apply promotion, en-passant capture, castling rook movement, clocks, castling rights, hashes, repetition state, or king safety. Those are separate stages.

The next integration step is to add precondition checks and special-move semantics, then compose staged application with opponent attack-map generation and the King Safety Probe.
