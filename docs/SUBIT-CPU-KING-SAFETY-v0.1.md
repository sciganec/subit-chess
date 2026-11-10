# SUBIT-CPU King Safety Probe v0.1

## Purpose

The King Safety Probe is the next CPU-native primitive after the five-family Attack Map. It answers a narrow question for an already prepared position:

> Is exactly one king of the selected side present, and is its square marked as attacked?

It is deliberately not described as a complete legal-move filter.

## Input memory

- `boardAddress`: 16 packed 16-bit words, four piece nibbles per word.
- `flagsAddress`: bit 0 identifies the side whose king is being checked (0 white, 1 black).
- `attackMapAddress`: 64 words; non-zero means the square is attacked.
- `resultAddress`: two output words.

Square numbering is a1=0 through h8=63. Piece codes follow the Chess Unit ABI: white king=6, black king=14.

## Output ABI

| Word | Meaning |
|---|---|
| resultAddress + 0 | Status |
| resultAddress + 1 | King square, or 0xFFFF when absent/invalid |

Statuses:

- `0`NO_KING`: no selected-side king found.
- `1`SAFE`: exactly one king found; attack-map value is zero.
- `2`CHECK`: exactly one king found; attack-map value is non-zero.
- `3`MULTIPLE_KINGS`: more than one selected-side king found.
- `4`WRONG_SIDE`: runtime side flag does not match the program's selected side.

## Execution model

The assembler emits a bounded straight-line scan of all 64 squares. At runtime the SUBIT-CPU:

1. Reads the packed board word for each square.
2. Extracts the corresponding nibble with UEXTRACT4.
3. Compares it with the selected king code.
4. Detects missing or duplicate kings.
5. Reads the attack-map entry for the unique king square.
6. Publishes SAFE or CHECK.

JavaScript only assembles the instruction stream. The board scan, piece comparisons, control flow, attack-map lookup, and result writes are performed by the VM.

## Composition with Attack Map

For a legal-move pipeline, the caller must first apply a candidate move to a post-move board image, build the *opponent's* attack map for that image, and then execute this probe for the moving side's king.

The attack-map generator's side guard and this probe's side guard can use separate flag words. This matters because the attack-map pass is configured for the opponent, while the probe validates the moving side's king. A caller must not silently reuse one contradictory side flag.

## Limits

This component does not itself:
- apply or undo a candidate move;
- build the opponent attack map;
- validate castling, en passant, or promotion effects;
- generate legal moves;
- resolve pinned-piece legality beyond what is represented by the supplied geometric attack map.

The attack-map semantics and the post-move board are therefore part of the caller's correctness contract. A later integration stage must test discovered checks, captured blockers, king captures, and special moves against an independent chess-rule oracle.
