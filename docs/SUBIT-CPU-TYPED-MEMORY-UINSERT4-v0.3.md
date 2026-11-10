# SUBIT-CPU Typed Memory Page — UINSERT4 v0.3

## Motivation

The chess board ABI stores four 4-bit piece codes in each 16-bit word. UEXTRACT4 reads one square code. UINSERT4 is its complementary packed-word operation: replace one selected nibble while preserving the other three.

## Instruction

UINSERT4 RD, RA, RB, IMM

- RD: destination U16 register (0..3)
- RA: source packed 16-bit word register (0..3)
- RB: replacement value register (0..3); only its low four bits are used
- IMM: nibble index 0..3, most-significant nibble first

For k = IMM, shift = 4·(3−k):

URF[RD] ← (URF[RA] AND NOT(0xF << shift)) OR ((URF[RB] AND 0xF) << shift)

The result is truncated to 16 bits. RA and RB are read before RD is written, so register aliasing is defined by ordinary instruction semantics.

## Example

Source word 0x1234, replacement value 0xA:

- index 0 → 0xA234
- index 1 → 0x1A34
- index 2 → 0x12A4
- index 3 → 0x123A

## Traps and atomicity

IMM greater than 3 raises NIBBLE_INDEX_OUT_OF_RANGE. The instruction is atomic: the destination register, PC, flags, clock, and other architectural state are restored on trap; the trap record is retained.

## Chess relevance

Together, UEXTRACT4 and UINSERT4 provide packed-square read/write primitives for CPU-native board transformations. They do not yet implement a complete chess move application routine: from/to decoding, promotion semantics, side validation, and transaction rollback still belong to a subsequent stage.
