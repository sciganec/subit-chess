# SUBIT-CPU Native Move Generation v0.1

**Status:** executable prototype; pseudo-legal generation only.

## Scope

The current CPU-native generators cover:
- pawns: single/double advances, captures, Q/R/B/N promotions;
- knights: eight jump offsets;
- kings: adjacent destinations;
- sliding pieces: bishops, rooks and queens along diagonal/orthogonal rays.

The CPU performs board reads, packed-nibble extraction, piece-code comparisons, occupancy classification, ray termination and move-buffer writes. JavaScript constructs the unrolled instruction stream; it does not enumerate runtime board contents.

## Sliding generator

Entry point: `examples/cpu_native_sliding_moves.js`

`buildNativeSlidingMovesProgram(CPU, options)` accepts:
- `side`: `'w'` or `'b'`;
- `family`: `'diagonal'` or `'orthogonal'`;
- `resetCount`: defaults to true; false resumes appending at the ABI legal-count value;
- optional ABI/program addresses.

The generator is intentionally split into two passes to keep each unrolled program within the 16-bit CPU address space:
1. diagonal pass: bishop + queen;
2. orthogonal pass: rook + queen.

Load and run both programs sequentially at the same program address. Run the first with `resetCount: true`, then the second with `resetCount: false`. Both passes must use the same side and ABI addresses. The second pass resumes writing at MOVE_BUFFER + LEGAL_COUNT and publishes the cumulative count.

For each ray, an empty square is emitted and traversal continues. A friendly occupied square terminates the ray without a move. An enemy occupied square is emitted as a capture and terminates the ray. Board coordinates use a1=0 through h8=63; packed board words store the most-significant nibble first.

## Move word

The common non-promotion move encoding is:

`((from & 63) << 10) | ((to & 63) << 4)`

Promotion codes occupy bits 3..1 and are zero for these piece types.

## Explicit limitations

These generators are **pseudo-legal**. They do not yet filter moves that expose the moving king, generate attack maps, implement castling or en passant, or perform native make/unmake. The Chess Unit still delegates authoritative legal-move validation and game rules to the existing JavaScript chess engine. No playing-strength claim follows from move generation alone.

## Regression coverage

`tests/chess_machine.test.js` compares both sliding passes, for both colors, against an independent ray-walk oracle on a synthetic position containing bishops, rooks, queens, friendly blockers and enemy capture targets. CI also runs CPU, Chess Unit, machine bridge and full regression suites.
