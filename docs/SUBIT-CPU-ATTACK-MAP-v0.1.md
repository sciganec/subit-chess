# SUBIT-CPU Native Attack Map v0.1

**Status:** executable reference-interpreter prototype; not yet a complete legal-move filter.

## Representation

The attack map is a 64-word memory region. For square index s (a1=0 through h8=63):

`memory[attackMapAddress + s] = 1` means the selected side attacks s; zero means no attack was marked.

Default address: `0x0400`. The map is deliberately separate from the move buffer and board ABI.

## Five bounded passes

Entry point: `examples/cpu_native_attack_map.js`

`buildNativeAttackMapProgram(CPU, options)` accepts:
- `side`: `'w'` or `'b'`;
- `family`: `'pawn'`, `'knight'`, `'king'`, `'diagonal'`, or `'orthogonal'`;
- `clearMap`: defaults to true; false accumulates into an existing map;
- optional program, board, flags and attack-map addresses.

Run the five families sequentially for the same side. Use `clearMap:true` for the first pass and `clearMap:false` for the remaining four. Re-load each generated program at its start address and preserve the board/map memory between passes.

- Pawn: marks both forward diagonals irrespective of target occupancy.
- Knight: marks all in-bounds L destinations.
- King: marks all in-bounds adjacent squares.
- Diagonal: bishop and queen rays.
- Orthogonal: rook and queen rays.

Sliding rays mark every empty square and the first occupied square, then stop. Thus a defended friendly blocker is still represented as attacked, as required by attack-map semantics. The CPU performs source-piece checks, board reads, packed-nibble extraction, ray continuation/termination and map writes.

## Validation

The machine regression suite compares the union of all five CPU-generated passes against an independent attack-set oracle for both colors on synthetic positions containing all piece families and blockers. It separately checks the runtime side guard and map accumulation behavior.

## Limits

This is not yet the legal-move filter. In particular, pinned-piece attack semantics, king-safety adjudication, castling transit-square validation, en-passant discovered checks, and the distinction between pseudo-attacks and legally executable moves need explicit tests and integration. The current map records geometric attacks according to piece movement, not a full game-state legality relation.
