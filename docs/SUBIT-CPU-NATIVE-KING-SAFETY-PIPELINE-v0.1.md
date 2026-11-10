# SUBIT-CPU Native King-Safety Pipeline v0.1

**Status:** executable composition of CPU-native primitives; JavaScript orchestration; not a complete legal-move validator.

## Purpose

This pipeline composes three previously independent machine stages to test whether a candidate move leaves the moving side's king safe:

1. staged packed-board move application;
2. opponent attack-map construction on the staged board;
3. moving-side king-safety probe against that map.

The key invariant is temporal: attack detection must use the **post-move board**, not the original position.

## Execution contract

Entry point: `examples/cpu_native_king_safety_pipeline.js`

`runNativeKingSafetyPipeline(cpu, options)` accepts:
- `side`: moving side, `'w'` or `'b'`;
- optional `boardAddress`, `scratchBoardAddress`, and `moveAddress`;
- optional `attackMapAddress`, `attackFlagsAddress`, and `resultAddress`;
- optional program starts and per-stage `maxSteps`.

The caller must place the ABI move word at `moveAddress`, and the low bit of the moving-side flags word must match `side`.

## Stage sequence

1. **MOVE_APPLY** — copies the source board and applies the from/to relocation to a scratch board. The source board remains unchanged.
2. **ATTACK_PAWN** — marks the opponent's pawn diagonals.
3. **ATTACK_KNIGHT** — marks opponent knight attacks.
4. **ATTACK_KING** — marks opponent king adjacency.
5. **ATTACK_DIAGONAL** — marks bishop/queen rays.
6. **ATTACK_ORTHOGONAL** — marks rook/queen rays.
7. **KING_SAFETY** — scans the staged board for exactly one moving-side king and checks its square in the accumulated opponent map.

The opponent attack generator and moving-side king probe use separate flag words. This prevents a side-guard contradiction while preserving the original side-to-move ABI value.

Each stage is loaded and executed by the SUBIT-CPU interpreter. JavaScript currently sequences the programs and reads the final status. This is a composed CPU-native primitive pipeline, **not yet a single self-orchestrating CPU program**.

## Result

- `1 LEGAL`: exactly one moving-side king is present and not attacked.
- `2 ILLEGAL_CHECK`: exactly one king is present but attacked.
- `3 INVALID_KING_STATE`: missing, duplicate, or side-mismatched king state.
- `4 EXECUTION_ERROR`: a stage traps, reaches its step limit, or the requested side does not match the runtime side-to-move flag.

The returned object includes each stage's execution result, allowing a caller to retain provenance and diagnose a failed stage.

## Validation

The machine tests include a discovered-check case: moving a rook off the e-file exposes the king to an opposing rook and is rejected. A second move that keeps the rook on the e-file is accepted. A separate ray oracle checks the staged board's expected attack condition. The tests also verify the runtime side guard and the exact seven-stage sequence.

## Limits

This pipeline currently validates only the king-safety consequence of a candidate relocation. It does not prove that the candidate is a valid pseudo-legal move. The raw move-apply stage does not enforce piece ownership, friendly destination occupancy, movement geometry, or promotion. It does not implement en passant or castling transformations, nor update castling rights, clocks, hashes, repetition state, or undo data.

The attack map is geometric. Pinned-piece attack semantics and all special-move edge cases still require dedicated differential tests. The authoritative Chess Unit continues to use the existing JavaScript chess engine for full legal-move validation.

## Next engineering milestone

Move the stage sequencing into a CPU-resident control program (CALL/RET or a dedicated pipeline opcode), add precondition checks to raw move application, and then extend the staged transformation for promotion, en passant, and castling before claiming full legal-move generation.
