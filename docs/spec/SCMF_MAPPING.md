# SCMF-001 → code mapping (status as of v3.0.9, 2026-11-18)

Statuses follow SCMF §19. Only what was checked in this repository is marked TESTED; everything else is
left UNVERIFIED rather than guessed. "TESTED" never means PROVEN.

| SCMF | Statement | Module | Status | Evidence |
|---|---|---|---|---|
| INV-001/003 | legal transitions, own king never left in check | `core.mjs` | TESTED | `tests/core.perft.mjs` |
| INV-004 | make/unmake restores state | `core.mjs` | TESTED | `tests/scmf.invariants.mjs` (fen + hash, 5 positions, all pseudo-legal moves) |
| INV-005 | determinism | `search.mjs` | TESTED | same file, fixed-depth search repeated; **not** under a clock (wall time is an input) |
| INV-009 | colour symmetry | `evaluate.mjs`, `search.mjs` | TESTED | `tests/engine.eval.mjs` (static, fast + structural), `scmf.invariants.mjs` (search score, 5 positions, depth 4) |
| INV-011 | optimised search keeps the minimax result | `search.mjs` | PARTIAL | alpha-beta + move ordering == plain minimax at depth 3 (4 positions). Null move, LMR, futility, check extension and TT are *selective* and deliberately not equal to minimax; their effect is measured by play (see CHANGELOG), not proved |
| INV-013 | terminal priority, shortest mate | `search.mjs` | TESTED | back-rank mate-in-1 scores MATE-1 |
| INV-014 | draw rules from full state/history | `core.mjs`, `search.mjs` | PARTIAL | repetition and 50/75-move handled in search; not covered by a dedicated SCMF test |
| INV-006/007 | structural completeness, context | `structure.mjs`, `context.mjs` | UNVERIFIED | measured: the context layer has zero effect on play (noctx bit-identical to base), so INV-007 is *implemented but inert* |
| INV-008 | no double counting | `evaluate.mjs` | PARTIAL (screen only) | `tests/scmf.redundancy.mjs`: on 597 random positions the largest pairwise |r| between the nine components is below 0.9 (strongest: A-Q 0.70, D-T 0.68, M-A 0.65). Linear screen, not proof of independence |
| INV-010 | metric correctness | `structure.mjs` | TESTED (empirical) | `tests/scmf.metric.mjs`: each component Dv Dr Da Dq Dt Dh has identity, symmetry, non-negativity and the triangle inequality on 4 seeds x 28 positions x 21952 triples, 0 violations. Dc was not exercised (no context vectors passed, so it is 0). Evidence from random positions, not a proof; Dq is normalised by a pair-dependent count, so a proof is still needed. OPEN-002 (is Euclidean enough) is untouched |
| INV-012 | opponent reply considered | `search.mjs` | TESTED (implicitly) | negamax |
| INV-015/018 | provenance, reproducibility | `learn.mjs` | PARTIAL | seeded RNG; no full Prov(P) tuple |
| INV-016 | no external teacher | `learn.mjs`, `bench/` | PARTIAL | learning module is self-play; Stockfish is used in `bench/anchor.py` only to *measure* and to filter openings, never as a training label |
| INV-017/019 | independent check, rollback | `bench/match.mjs`, git | PARTIAL | A/B matches with control; no automatic rollback in the engine |
| §3 Ω (9 dims) | structural vector | `evaluate.mjs` (`SVF_COMPONENTS`) | IMPLEMENTED | the engine's SVF vector already has nine components M,K,A,D,C,T,Q,R,X (the 7-dim Ω₇ lives in docs 01-32; code and SCMF agree on nine). OPEN-001 is therefore about the docs, not the code. Earlier version of this row wrongly said 7 |
| §5 Ctx (4×4×4) | contextual profile | `context.mjs` | IMPLEMENTED | I,Z,Φ present; effect on play not shown |
| §10 D(P) | decision structure | `index.mjs` (`analyze`, `uncertainty.mjs`) | PARTIAL | |
| §13 Conf | calibrated confidence | `uncertainty.mjs` | IMPLEMENTED, UNCALIBRATED | no calibration experiment yet (OPEN-006) |

Measured value of search-side theory (equal time, vs base): adaptive budget SEARCH-15 +76 Elo [+20,+137] at
100 ms (120 games), +80 [-15,+187] at 300 ms (40 games), no difference vs Stockfish anchor (48 games);
structural extension SEARCH-14 -83 Elo [-178,+2] (60 games), left OFF.
