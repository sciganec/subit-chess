# Changelog

All notable changes to **subit-chess** are documented here.

Statuses:
- **Added** — new features
- **Changed** — changes in existing functionality
- **Deprecated** — soon-to-be removed features
- **Removed** — now removed
- **Fixed** — bug fixes
- **Security** — vulnerability fixes
- **Notes** — non-functional decisions, pre-registration drifts, ADR refs

---

## [3.0.16 candidate] — 2026-11-24

Development candidate in progress. No Elo gain has been established; do not claim release strength.

- **Perf: lazy incremental move selection (behavior-preserving, bench-identical).** `src/engine/search.mjs` `MoveOrder` now uses per-ply packed buffers and incremental `pick()` selection instead of full sort+reorder on every `scoreMoves()` call. Call sites updated in negamaxRoot/negamax/qsearch. Fixed a pick-bound bug in the quiet-check qsearch branch: when `qc.maxChecks` caps checks, selection must consider all scored checks (`scoredN`), not only `checkCount`. Verification: `bench:engine` baseline identical (`d6=20969/8/b1c3, d7=46933/28/b1c3, d8=139085/19/b1c3, total 206987`), `node tests/core.perft.mjs` CORE OK, `npm run test:engine` PASS, gauntlet 12/12 PASS. **No Elo/strength claim.**
- **Perf/correctness: incremental piece lists and phaseMaterial in make/unmake (bench node counts changed, same best moves/scores).** `src/engine/core.mjs` now maintains `listSq`/`listCnt`/`listIdx` and `phaseMaterial` incrementally in `makeMove`/`unmakeMove` (swap-remove with exact restore for captures, rook list update for castling), removing the per-eval 128-square `refreshPieces()` rebuild on dirty state. A defensive `refreshPieces()` guard remains for unexpected dirty state. This also fixes stale `phaseMaterial` reads between move and refresh; search insufficient-material checks (`pos.phaseMaterial <= 2`) now see correct values, so bench node counts differ from the previous baseline while best moves/scores remain the same (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`). Verification: `node tests/core.perft.mjs` CORE OK, `npm run test:engine` PASS, gauntlet 12/12 PASS. **No Elo/strength claim.**
- **Perf: bit-identical micro-opts.** `src/engine/evaluate.mjs`: mirror PST square via `sq ^ 0x70` (0x88 rank flip), cache mobility weights, and count pawns during the piece scan instead of a separate POP8 pass. `src/engine/core.mjs`: indexed loop + cached `them`/board in `legalMoves()`. `src/engine/search.mjs`: cache `from` in `MoveOrder.scoreMoves()` to avoid repeated `MOVE_FROM`/board lookups. Bench identical to current baseline (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), `node tests/core.perft.mjs` CORE OK, `npm run test:engine` PASS, gauntlet 12/12 PASS. **No Elo/strength claim.**
- **Search experiment: staged move generation prototype (default off, behavior-changing, negative A/B).** Added `search.stagedMoveGen` (default `false`) in `src/engine/evaluate.mjs` and split `Position.generateMoves()` into tactical/quiet stages via `quietsOnly`/`clear` params in `src/engine/core.mjs`. `src/engine/search.mjs` negamax/negamaxRoot can search captures+promotions before quiets when enabled; qsearch unchanged. Fixed a staged 0-tactical case during wiring so quiet-only nodes still generate quiets. Default-off path verified: bench identical to current baseline (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), `node tests/core.perft.mjs` CORE OK, `npm run test:engine` PASS. **Strict no-cycle 48-game same-code A/B** (A=`Search.StagedMoveGen=true`, B=`false`, 48 games, d4, max-plies 220, openingSeed null/default order, `--strict-no-cycle`): **0W/3D/45L, score 0.03125, Elo -596.54, CI [-1199.83,-460.74]**. Clear regression; **default remains off, no enable, no strength claim**. Local evidence: `results/v3016-stagedmovegen-vs-default-d4-g48-seed20261129.json` (gitignored).
- **UCI/TT: real Hash resize.** `TranspositionTable` now supports `resizeBits/resizeMB` in `src/engine/search.mjs`; UCI `Hash` option in `src/engine/index.mjs` now actually resizes TT (default remains 6 MB / 2^18 entries, matching current behavior; advertised default changed from misleading 64 to 6). `Search.StagedMoveGen` UCI check option also advertised for A/B. Default bench/perft/test:engine unchanged. **No strength claim.**
- **Perf: scoreMovesAt micro-hoists (behavior-preserving).** Hoisted ordering weights, killer entries, and `us*128` in `MoveOrder.scoreMovesAt` (`src/engine/search.mjs`). Bench identical to current baseline (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS. **No strength claim.**
- **Perf: evaluateFast mobility inline (behavior-preserving).** Inlined knight/slider mobility loops directly in `evaluateFast` (`src/engine/evaluate.mjs`) to avoid per-piece function calls in the leaf eval hot path. Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: legalMoves redundant refresh removed (behavior-preserving).** `Position.legalMoves()` no longer calls `refreshPieces()` before `generateMoves()`, which already refreshes. Bench identical, perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: generateMoves encodeMove inlines (behavior-preserving).** Inlined `encodeMove` bit expressions in hot `generateMoves` pawn/knight/king/slider paths (`src/engine/core.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: isAttacked loop bounds (behavior-preserving).** Replaced `.length` lookups with literal knight/king/bishop/rook delta counts in `Position.isAttacked` (`src/engine/core.mjs`). Bench identical, perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: opposite() inlines in hot core paths (behavior-preserving).** Replaced `opposite(us)` with `us ^ 1` in `generateMoves`/`generateCastles`/`legalMoves` (`src/engine/core.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: null-move undo buffer reuse (behavior-preserving).** `Position.makeNullMove(outUndo)` accepts optional buffer; search reuses `undoBuf[ply]` for null-move pruning, removing per-null-move allocation (`src/engine/core.mjs`, `src/engine/search.mjs`). Bench identical, perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: xorPiece inlined in make/unmake (behavior-preserving).** Inlined Zobrist xor updates in `makeMove`/`unmakeMove` hot paths (`src/engine/core.mjs`) to avoid method-call overhead; hash semantics identical. Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: makeMove capture flag from capSq (behavior-preserving).** `isCapture` in `makeMove` derived from `capSq >= 0` instead of flag bitmask; semantics equivalent for legal moves. Bench identical, perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: qsearch seePrune hoist (behavior-preserving).** Hoisted SEE-prune config read out of quiescence capture loop (`src/engine/search.mjs`). Bench identical, perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: maxAttackedVictim literal loop bounds (behavior-preserving).** Replaced `.length` lookups with literal knight/bishop/rook delta counts in `maxAttackedVictim` (`src/engine/search.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: smallestAttacker/buildCheckTargets literal loop bounds (behavior-preserving).** Replaced `.length` lookups with literal knight/bishop/rook delta counts in SEE `smallestAttacker` and module-init `buildCheckTargets` (`src/engine/search.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: evaluate.mjs literal loop bounds (behavior-preserving).** Replaced dynamic slider/knight delta `.length` lookups with literal bounds in `evaluateFast` mobility, `sliderMobility`, and structural pin-defense loops (`src/engine/evaluate.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: generateMoves promotion unroll (behavior-preserving).** Unrolled 4-piece promotion loops in quiet/capture pawn promotion generation (`src/engine/core.mjs`), removing `PROMO_PIECES` array lookups in that hot path; removed now-unused `PROMO_PIECES` constant and hoisted per-promotion base move encoding. Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: attackWeight/generateMoves literal loop bounds (behavior-preserving).** Replaced `.length` lookups with literal knight/king/bishop/rook delta counts in `Position.attackWeight` and hoisted slider direction count (`dlen`) in `generateMoves` slider loop (`src/engine/core.mjs`). Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **Perf: negamax MOVE_TO hoist (behavior-preserving).** Hoisted `MOVE_TO(m)` once per negamax move loop iteration in `src/engine/search.mjs`, reusing it for quiet-target test and post-move threat checks. Bench identical (`d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`), perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. **No strength claim.**
- **FD experiment hook (default off, no default behavior change).** Added `eval.fdPressure` (default 0) in `src/engine/evaluate.mjs`: when enabled, `Evaluation.structural()` computes `buildFieldDynamics()` and applies an FD-inspired weighted king-zone pressure delta to the structural K axis (geometric influence/weight, FD-03/FD-08 inspired). Default-off path unchanged; `bench:engine` baseline identical (`d6=20969/8/b1c3, d7=46933/28/b1c3, d8=139085/19/b1c3, total 206987`), `test:perft` CORE OK, `npm test` PASS, gauntlet 12/12 PASS. **No Elo/strength claim; A/B required before enabling.**
- **FD fdAttackWeight hook (default off, no default behavior change).** Added `eval.fdAttackWeight` (default 0) and `Position.attackWeight()` in `src/engine/core.mjs`/`evaluate.mjs`: cheap FD-inspired geometric attacker-weight sum on king-zone squares in fast eval (P=1,N=3.2,B=3.3,R=5,Q=9,K=2). Default-off path unchanged; `bench:engine` baseline identical, `test:perft` CORE OK, `npm test` PASS, gauntlet 12/12 PASS. UCI: `Eval.FDAttackWeight`. **No Elo/strength claim; A/B required before enabling.**
- **FD fdPinDiscount hook (default off, no default behavior change).** Added `eval.fdPinDiscount` (default 0) in `evaluate.mjs`: FD-03-inspired discount for off-ray defenses by absolutely pinned pieces in structural eval D axis. Default-off path unchanged; `bench:engine` baseline identical, `test:perft` CORE OK, `npm test` PASS, gauntlet 12/12 PASS. UCI: `Eval.FDPinDiscount`. **No Elo/strength claim; A/B required before enabling.**
- **FD fdPinDiscount A/B (neutral/inconclusive, no claim).** `dab5c0f` same-code A/B via UCI `Eval.FDPinDiscount`, A=`3`, B=`0`, 48 games, d4, max-plies 220, seed 20261128, `--strict-no-cycle` (48 openings). Result: **12W/24D/12L, 0.500, Elo 0, CI [-71.22,+71.22]**. CI spans 0 — **inconclusive/neutral, no Elo gain claim**. Local evidence: `results/v3016-fdpindiscount3-vs-default-d4-g48-seed20261128.json` (gitignored).
- **FD fdAttackWeight A/B (neutral/inconclusive, no claim).** `4cd272f` same-code A/B via UCI `Eval.FDAttackWeight`, A=`1`, B=`0`, 48 games, d4, max-plies 220, seed 20261127, `--strict-no-cycle` (48 openings). Result: **12W/21D/15L, 0.469, Elo -21.74, CI [-98.51,+52.93]**. CI spans 0 — **inconclusive/neutral, no Elo gain claim**. Local evidence: `results/v3016-fdattackweight1-vs-default-d4-g48-seed20261127.json` (gitignored).
- **FD fdPressure A/B (neutral/inconclusive, no claim).** `3f0b9f0` same-code A/B via UCI `Eval.FDPressure`, A=`fdPressure=2`, B=`0`, 48 games, d4, max-plies 220, seed 20261126, `--strict-no-cycle` (48 openings). Result: **13W/22D/13L, 0.500, Elo 0, CI [-74.21,+74.21]**. CI spans 0 — **inconclusive/neutral, no Elo gain claim**. Local evidence: `results/v3016-fdpressure2-vs-default-d4-g48-seed20261126.json` (gitignored).

## [3.0.15] — 2026-11-24

Formalized release snapshot. Measurement/verification hardening and behavior-preserving perf work. No Elo gain has been established; no external strength claim.

- **Version bump / development start.** Bumped to v3.0.15 candidate after formalizing v3.0.13/v3.0.14 release snapshots. No search/eval default changes in this bump.
- **Measurement (67dfd2c vs 09706a9, no claim).** Paired UCI batches (A=current, B=09706a9): batch1 d4/64g 19W/26D/19L 0.500 CI [-66.9,+66.9]; batch2 d4/64g seed 20261122 21W/27D/16L 0.539 CI [-37.9,+94.3]; batch3 d4/58g seed 20261123 18W/27D/13L 0.543 CI [-35.7,+97.9]; batch4 d4/48g seed 20261125 **no-cycle/strict-no-cycle** (48-opening set) **15W/19D/14L 0.510 CI [-70.9,+86.1]**. Combined 234g 73W/99D/62L ~0.524, CI spans 0 — **inconclusive/neutral, no Elo gain claim**. Batches 1-3 cycled the old 24-opening set; batch4 is the clean protocol.
- **Audit-gap tests (no engine behavior change).** Added TT/quiet-check/qsearch edge regressions in `tests/engine.audit2.mjs` (TT_MAX_AGE/ttMoveFor/generation boundaries, qsearch automatic draws, quiet-check qdepth boundary, in-check mate, qdepth==0 stalemate) and FD analytical no-search-effect guard in `tests/engine.field.mjs` (search move/score unchanged after `fieldDynamics()`/`analyze().fields`).
- **Measurement harness.** `bench/version_match.mjs` adds `--opening-seed/--opening-offset/--max-plies`, `--strict-no-cycle`, opening IDs in rows, boolean-flag arg parsing, engine git HEAD metadata, per-game abort capture/partial report, and records settings for cleaner paired comparisons. `bench/fens/openings.epd` expanded from 24 to 48 validated openings (gate1-25..48), enabling clean 48-pair/96-game no-cycle batches.
- **TT exact-preference (behavior change, measured).** `TranspositionTable.store` now keeps an exact entry over a non-exact replacement at equal depth/same key/non-stale. `npm test`/gauntlet green. A/B vs `72eb3b8` (48g, d4, seed 20261124, no opening-pair cycle, A=HEAD/B=72eb3b8): **15W/18D/15L, score 0.500, 95% CI [-79.9,+79.9]** — neutral/inconclusive, **no Elo gain claim**. Result: `results/v3015-tt-exact-vs-72eb3b8-d4-g48-seed20261124.json` (gitignored).
- **Behavior-preserving perf micro-opts (no search/eval/ordering behavior change).** Hot-path cleanups in `src/engine/core.mjs` and `src/engine/search.mjs`: `isAttacked`/`smallestAttacker`/`generateMoves`/`maxAttackedVictim` loop and bit-op tightening, hoisted SEE-enabled check in `scoreMoves`, removed unused `scoreMoves` ctx arg, `opposite()`→`us^1` in hot paths, promotion/castle constant cleanup, indexed loops in `hasLegalMove`/check-prefilter/`staticCheckEvasion`, reusable SEE attacker object, optional `generateMoves` out buffer, per-ply/probe/check move buffers, optional `makeMove` outUndo with per-ply/probe undo reuse, and TT probe move-hint reuse in alphabeta. Each change verified with identical `bench:engine` baseline (`d6=20969/8/b1c3, d7=46933/28/b1c3, d8=139085/19/b1c3, total 206987`), `test:perft` CORE OK, `npm test` PASS, gauntlet 12/12 PASS. NPS is noisy; **no strength/Elo claim**.
- **Theory/spec familiarization.** Reviewed `docs/theory/` (including UST 101-120) and `c:\Users\sciga\subit-subit\spec\` as research context; theory remains research-only/non-binding, no canonical SUBIT-∞ conformance claim.

## [3.0.14] — 2026-11-22

Formalized release snapshot. Correctness/measurement/search-safety increment. No Elo gain has been established; do not claim release strength.

- **Version bump.** Prepared `v3.0.14` development candidate after pushing `v3.0.13` candidate commits.
- **Quiet-threat extension candidate (parked, default off).** Added `search.quietThreatExtension` (`enabled:false`, `maxPly:2`, `minVictim:900`) as a tactical search extension for quiet moves attacking queen/major. g9: catches `...b4c5` at d5 (vs d6 baseline) but still misses at d4; node cost +61% at d6 on that case. A/B self-play 64g d4 seed24: `dS 0.000 SE 0.077`, 12W/40D/12L, inconclusive (unchanged after adjudication fix). Default remains off; no Elo claim.
- **Self-play adjudication fix (measurement correctness).** Fixed `src/engine/learn.mjs` `playGame`: no-legal-move now uses `pos.status()` so checkmate/stalemate are classified correctly; terminal result mapping now reads `status().result` (`white`/`black`/`draw`) instead of the impossible `'win'` value. Fixed `src/engine/core.mjs` `moveToUci/moveToSan` to handle move 0 safely (`0000`/`(none)`), preventing position corruption when search reports no move. Added regression tests in `tests/engine.learn.mjs`. **Impact**: prior `learn.compare()` A/B runs that ended in checkmates were misadjudicated; reruns required before trusting those measurements.
- **Self-play repetition sync fix (measurement correctness).** Fixed `src/engine/learn.mjs` `playGame`: sync both engines with FEN + repetition stack (`rep/repHi/repLimit`) after each move, and initialize black with `setFEN` (not `pos.setFEN`) so analysis state is rebuilt. Previously `other.setFEN(fen)` wiped repetition history, breaking fivefold/repetition detection and rep-aware search in self-play. Added regression in `tests/engine.learn.mjs`. **Impact**: prior `learn.compare()` A/B runs may have missed repetition adjudications; effect size unknown, but measurements should be rerun when repetition-sensitive.
- **LMR threat-exempt candidate (parked, default off).** Added `search.lmr.threatExemptMinVictim` (default `0`, disabled). When set (e.g. 900), quiet moves attacking enemy queen/major are not LMR-reduced. Initial A/B results were invalidated by a checkmate-adjudication bug in `src/engine/learn.mjs` (fixed below). Corrected rerun d4 64g: seed25 `dS -0.156 SE 0.077` 8W/38D/18L (reject); seed26 `dS -0.109 SE 0.086` 12W/33D/19L (inconclusive); seed27 `dS -0.016 SE 0.075` 11W/41D/12L (inconclusive). Corrected signal is negative/neutral across 192g; default remains off.
- **Root check extension + qsearch mate-delta guard (correctness/consistency).** `negamaxRoot` applies `search.checkExtension` on root check-giving moves; qsearch delta pruning is guarded by `alpha < MATE_THRESHOLD` so mating captures are not pruned in near-mate alpha windows. Added gauntlet guard `horizon c3c2 blunder (SF19 g8, d4 guard)` (reject `c3c2`, depth 4) and regression in `tests/engine.audit2.mjs`. `npm test` PASS, gauntlet 11/11 PASS. No Elo gain claim; `learn.compare` >=2 seeds d4/64g still required before any strength claim.

## [3.0.13] — 2026-11-22

Formalized release snapshot. Operationalizes Field Dynamics (`FD-01` through `FD-14`) and mathematical invariants. No Elo gain has been established; no external strength claim.

- **Field Dynamics Module (`src/engine/field.mjs`).**
  - **Canonical Board Coordinates (`SC-CORE-COORD-001` & `FD-01/02`).** Strict isomorphism between 0x88 square index, canonical coords $(x, y) \in [0, 7]^2$, and linear index $idx \in [0, 63]$ with $y = 7 - (sq \gg 4)$ mapping 0x88 mailbox row to rank coordinates.
  - **G4 Orthogonal Complex Topology.** Board graph $|V|=64$ vertices, $|E|=112$ orthogonal edges, $|F_{int}|=49$ elementary square faces. Euler characteristic $\chi = V - E + F_{all} = 2$, cycle space dimension $\beta_1 = 49$.
  - **Discrete Gradient Operator (`FD-05`).** Discrete potential gradient $\text{Grad } \phi(u \to v) = \phi(v) - \phi(u)$ on $G_4$ edges with exact anti-symmetry and zero circulation along arbitrary closed walks.
  - **Discrete Divergence Operator (`FD-06`).** Nodal flux balance $\text{Div } J(v) = \sum_{e \in out} J(e) - \sum_{e \in in} J(e)$ satisfying the discrete Gauss divergence theorem $\sum_{v \in R} \text{Div } J(v) = \text{Flux}(\partial R)$ on arbitrary subsets of squares.
  - **Discrete Curl and Circulation Operator (`FD-07`).** Counter-clockwise face curl on 49 elementary faces satisfying the discrete Stokes theorem $\sum_{f \in Z} \text{Curl } J(f) = \text{Circ}(J, \partial Z)$, and the potential field identity $\text{Curl}(\text{Grad } \phi) \equiv 0$ on all 49 faces.
  - **Influence Vector Tracing & Pinned-Piece Reach (`FD-03` §171).** Geometric influence vectors separated from legal move generation: pinned pieces maintain geometric attack influence across lines while the legal move generator strictly forbids moves off the pin line.
  - **Channel Independence ("DO NOT COLLAPSE").** White and Black attack, defense, and flux channels are strictly separated in independent buffers.
- **Engine Integration (`FD-13`).**
  - Added `Engine.fieldDynamics()` method and integrated `fields` summary into `Engine.analyze()`.
  - Analytical and observational only: does not alter legal move generation or search decisions (complying with `FD-10 §360` and `ADR 0023`).
- **Invariant Verification & Testing.**
  - Added `FD-INV-001` through `FD-INV-010` formal invariants.
  - Added `tests/engine.field.mjs` test suite; all 26 checks passed in the full suite run on 2026-11-22.
  - Integrated `verifyFieldInvariants` into `verifyPositionAll()` in `src/engine/verify.mjs`. All 19 `npm test` scripts passed after the verifier follow-up on 2026-11-22.
- **Verifier completion.** `verifyFieldInvariants()` now executes all ten declared checks, including boundary-of-boundary closure, pinned-piece geometric influence, repeat-build determinism, and complete position-state preservation. The roadmap now states the remaining corpus-wide invariant coverage gap accurately.
- **External anchor report.** `docs/EXTERNAL_ANCHOR_SF19_2026-11-22.md` records candidate status and explicitly marks the v3.0.11/v3.0.12 Stockfish tables as historical, not v3.0.13 results. No new match was run because this candidate does not change move selection; there is no new Elo result and it is not released.
- **User documentation.** The console API manual now documents `engine.fieldDynamics()` and the `analyze().fields` summary, including that the output does not affect search or move choice.
- **TT age diagnostic param (ADR 0022).** Added `search.ttMaxAge` (default `0`) and UCI option `TT.MaxAge`; default behavior unchanged. A/B self-play 64g d4 seed23: `ttMaxAge=1` vs `0` gave `dS -0.203 SE 0.067`, verdict **reject** — confirms ADR 0022.
- **Gauntlet guard.** Added g9 horizon refutation case (`b4c5` after `d5c6`, depth 6, `score<50`) and `scoreBelow/scoreAbove` support in `bench/gauntlet_strength.mjs`. Gauntlet 10/10 pass.
- **Eval hook A/B (no default change).** Self-play 64g d4: `kingOpenFile 12 vs 0` `dS +0.063 SE 0.079` inconclusive; `kingAttack 8 vs 0` `dS +0.109 SE 0.083` inconclusive. Defaults unchanged.

## [3.0.12] — 2026-11-22

Measured post-v3.0.11 search-safety/plumbing increment. No external Elo-gain claim.

- **LMR conservative default.** `search.lmr.extraReduction 1 -> 0`, `search.lmr.maxReduction 1` (keeps `minDepth 3`, `minMoveIndex 3`, `reduction 1`). Self-play evidence: depth 4, 32g, seed13 `+0.156 SE0.090` (7W/23D/2L); depth 5, 24g, seed17 `+0.250 SE0.121` accept (8W/14D/2L). SF2200@200ms 10g smoke noisy (`0.60 SE0.138`). Node cost at startpos depth 6 increased (~14562 -> 19605, ~+35%), expected for less reduction.
- **Quiet-move ordering threat bonus.** Direct attacks by a moved quiet piece on enemy rook/queen/minor get a bounded ordering bonus (tactical signal only; not Gate 3 structural/context ordering). A queen-threat LMR exemption was tested and **parked/not enabled by default** (no confirmed gain in small A/B).
- **UCI/engine plumbing.** `Engine.reset()` for clean `ucinewgame`; UCI adapter/time management improvements; `bestmove 0000` fix; SEE/qsearch pruning knobs exposed with SEE enabled by default.
- **Eval hooks.** `kingOpenFile` penalty hook (default 12, inconclusive small A/B) and `kingAttack` hook (default 0, candidate 8 inconclusive smoke) added as measured parameters, not proven strength gains.
- **Correctness/tests.** Audit311 fixes and `tests/engine.audit311.mjs` (20 checks) added to `npm test`. FEN validation hardened (adjacent digit spans, per-side piece count). `contextAdjust` moved from no-op to minimal bounded deterministic scaling (AUD-311-16). Gauntlet/smoke/tactics regressions green.
- **External anchor.** SF19 N=20 @200ms (new default): 2000 `8W/4D/8L mean 0.50 SE0.10`; 2200 `5W/6D/9L mean 0.40 SE0.091`; 2400 `3W/9D/8L mean 0.375 SE0.078`. Mixed/noisy, within noise of prior N=10 baseline; not an Elo-gain/regression claim. `UCI_Elo` is Stockfish limited-strength mode, not human Elo.
- **Notes.** No scalar blend `U(P)` (ADR 0019). No structural/context move ordering (ADR 0023 / Gate 3 kill). `TT_MAX_AGE = 0` preserved (ADR 0022). Theory docs 81-99+ remain research-only/non-binding.

## [3.0.11] — 2026-11-21

Measured engineering increment after the v3.0.10 correctness tag. It ships the changes
below plus a research-only theory addendum. Every strength number here is self-play on the
v3.0.11 code; none is an external Elo result, a canonical SUBIT-∞ conformance claim, or a
claim about the older v3.0.10 HTML.

- **Measurement harness (Gate 1).** `bench/match.mjs` now reports per-opening W/D/L
  and an Elo-scaled 95% CI; `bench/fens/openings.epd` adds 24 quiet legal positions
  with a SHA-256 in `bench/fens/CHECKSUMS`. The harness no longer clears the game
  repetition stack with bare `setFEN()` after each move: it adopts the FEN and the
  `rep`/`repHi`/`repLimit` state on both engines, so fivefold is visible to `status()`
  again. Same 10-game seed: caps 3/10 -> 1/10, nodes/game 2.31M -> 1.70M. Full Gate 1
  calibration (100 games, depth 4, seed 7): 57.5% ±8.9, 9/100 caps — the ≤10% gate passes.
  After the ADR 0023 ordering deletion the same baseline is 53.5% ±8.9 with 5/100 caps;
  both are harness calibration, not strength results.
- **Horizon (A1).** Quiet checks are searched at `qdepth === 0`, capped by
  `params.search.qsearch.maxChecks`, and remain subject to legality, alpha/beta and
  the qdepth cap. `noqchecks` restores the pre-audit captures-only horizon for A/B.
  A geometry table filters candidate moves before make/unmake: only moves touching
  a king ray or knight jump (by origin or destination, so discovered checks survive)
  are probed. A regression test covers a quiet discovered check. The pre-kill 100-game A/B
  (`results/gate3-a1-base-vs-noqchecks-final.json`) was 63.0% ±9.3, CI 53.7-72.3%,
  61W/4D/35L, 0/100 caps; it is historical. **Post-kill re-baseline**
  (`results/gate3-a1-postkill-final.json`, depth 4, seed 7): `base` **60.0% ±9.4**,
  CI **50.6-69.4%**, 58W/4D/38L, 0/100 caps, mean 116 plies. Clean post-kill throughput
  check (Gate 6 FEN, d7, 3 runs each): `noqchecks` 314,959 nodes at ~173.0k nps vs `base`
  567,647 nodes at ~174.6k nps — no per-node penalty after the ordering deletion; the
  extra wall time comes only from the larger tree. **A1 accepted in v3.0.11.**
- **Search hygiene.** The dead `contextBonus` closure is removed, the horizon
  stalemate probe uses an early-exit `hasLegalMove()` with the same rule result,
  `plan.structuralEvalDepth` is applied, and the uncertainty budget now grows with
  uncertainty instead of dividing by it (tested for monotonicity).
- **Invariants.** Mate distance uses the engine-wide `MATE` scale; `centerControl`,
  `openFiles` and `hanging` each have one SVF owner; `verify.mjs` gains an executable
  `SVF-INV-007` ownership check with a negative-control test. Following the new
  full-state-identity theory (docs 56/76/77), `verifyMakeUnmake()` now also checks the
  repetition stack and `repLimit` after the same `pushRep`/`make`/`unmake`/`popRep`
  cycle the search uses; a non-empty-history regression test was added. No rule or
  search behaviour changed — this only widens what the verifier can detect.
- **Measurement harness (Gate 2).** Fixed a depth-assignment bug: `playGame()` chose the
  per-move depth by the moving colour instead of by the config playing that colour, so in
  odd games (`A` is Black) the two pinned depths were swapped. The first `base@5` vs
  `base@4` run is void; a two-colour regression test now asserts the depth follows the
  config. Gate 1 and Gate 3 used equal depths and are unaffected. The corrected pre-kill
  Gate 2 run (`results/gate2-depth5-vs-4-final.json`, 100 games, depth 5, seed 7) was
  68.0% ±8.1, CI 59.9-76.1%, 58W/20D/22L; it is historical. **Post-kill re-baseline**
  (`results/gate2-depth-postkill-final.json`): `base@5` **79.0% ±7.5**,
  CI **71.5-86.5%**, 75W/8D/17L, 8/100 caps — depth still pays (CI.lo > 0.5).
- **Measurement harness (Gate 7).** New `bench/gate7.mjs` runs three clean passes per
  position: base depth, uniform `depth+1`, and a driver-targeted pass (`Us/Uh` depth,
  `Ut` wider qsearch, `Ue/Ur/Up/Um/Uc` hybrid/structural re-check), plus a deterministic
  wrong-driver control. A tie is not treated as a driver, and the four proven-mate
  fixtures are checked for decision invariance. On 24 opening FENs + 4 mate FENs at
  depth 4: **9 targeted-only changes**, 0 uniform-only, 0 wrong-driver-only, 5 changed
  under both, 10 under neither, 1 wrong-driver change, and **0/4 mates changed**.
  Result: Gate 7 PASS as verification steering. It is bench-only: no shipped search
  path, evaluation value or released HTML was changed, and it is not a strength claim.
  `tests/gate7.mjs` covers the driver map, determinism and mate invariance.
  Full `npm test` passes with the new file registered; a fresh temp-copy build still
  produces the unchanged dev hash `9586ACA1...` and leaves both release HTMLs at the
  shipped `9A08F02F...`.
- **Structural ordering deleted (Gate 3 kill).** The 100-game `base` vs `nostruct`
  result was **46.5% ± 8.7** (36W/21D/43L, 13/100 caps) and `noplans` was identical.
  The pre-registered 200-game run gave `base` **47.5% ± 6.2**, CI ≈ [41.3%, 53.7%],
  74W/42D/84L, 25/200 caps — no positive CI, so the kill criterion applies. On all
  24 suite FENs the three configs pick the same root move and `nostruct` ≡ `noplans`
  node-for-node, so one ordering mechanism was ablated, not two layers. ADR 0023
  removes `makePlanOrderer`, the `structuralBonus` plumbing and the search's
  structural ordering term (`ordering.struct` 0); the dead context ordering path is
  removed too. Plans remain descriptive for UI/uncertainty only. All tests pass;
  the release HTMLs are untouched.
- **`noctx` is a no-op (Gate 3).** 100 games, depth 4, seed 7: `base` **57.5% ± 8.9**,
  CI ≈ [48.6%, 66.4%], 49W/17D/34L, 9/100 caps. A `base` vs `base` control on
  unmodified HEAD reproduced every statistic exactly — W/D/L, 1,520,362 nodes/game,
  lengths and all 24 per-opening rows. The 57.5% is the harness self-play baseline
  already seen in Gate 1, not a context effect; `noctx` needs no deletion because
  `contextBonus` was already removed and ADR 0023 zeroes `ordering.context`. The
  control is saved as `results/gate3-base-vs-base-control-final.json`.
- **`plain` is a no-op after the kill.** On the post-kill code, `base` vs `plain` scored
  `base` **53.5% ± 8.9**, 45W/17D/38L, 1,329,957 nodes/game, 5/100 caps; a fresh
  `base` vs `base` control on the same code reproduced every statistic exactly
  (`results/gate3-plain-final.json`, `results/gate3-base-vs-base-postkill-final.json`).
  The harness passes explicit `depth: 4`, so `useMeta` is inactive; all four structural
  ablations are now empty controls. Gate 1's cap gate still passes at 5/100.
- **Post-kill re-baseline complete.** A1 (**60.0% ±9.4**) and depth (**79.0% ±7.5**)
  were re-measured on the code after ADR 0023 and both have CI.lo > 0.5. The pre-kill
  63.0% / 68.0% are retained only as historical measurements. These are v3.0.11 self-play
  results, not external strength claims.
- **Gate 4 scope audit.** 667 distinct `*-INV-*` IDs exist across the theory corpus; the
  12 binding docs define 194, with only 30 referenced in `src/engine/` or `tests/`.
  Literal "every documented invariant has a test" coverage is not claimed; the gap is
  explicit so it cannot be mistaken for a PASS.
- **Research-only theory addendum.** Added five drafts: `docs/theory/81-99/81_...md`
  (self-reflective intelligence protocol v0.1), `docs/theory/81-99/82_...md`
  (cross-disciplinary intelligence specification v0.1),
  `docs/theory/81-99/83_...md` (autonomous experimentation framework v0.1, DRAFT),
  `docs/theory/article_04.md` and `docs/theory/article_05.md` (conceptual studies). All five
  are research/architecture drafts; their hypotheses and proposed stages are non-normative.
  They do not add ADRs, engine behaviour, tests, strength claims or canonical conformance.
  Most proposed mechanisms (reflective memory, counterfactual audit, autonomous evolution,
  `V_SUBIT`, higher tiers/phases, homology/causal modules) remain absent or analysis-only.
- **Verification.** Full `npm test` passes after the version bump and final artifact copy
  (17 test scripts). A clean temp-copy `npm run build` bundled 11 modules into
  `src/subit_chess_v3.0.11.html` and `index.html` with SHA-256
  `8267AEFA3BFFA9E52843F1D77411963E47A30D5D5753DF92EDBE1E427ED82BE5` (463 277 B). The
  pre-version source hash was `7D9FF08A811C67748C6A5667F8C3489D584620B529AC62A4DE69307A627E1E06`;
  the final hash changed because version constants were bumped to 3.0.11. The v3.0.10
  snapshot and its two HTML files remain at
  `9A08F02F8AF4499813FE3167429A7A27D0A95071BA4A1C62EB60A9BB011C6581`; no v3.0.10 file was
  overwritten. The tag is not created in this preparation step.
- **Still open.** Gate 4 literal invariant coverage, Gate 5 external validation (no
  `bm`/sparring engine available), Gate 6's d9-in-6s target, and the W08 stress run;
  `contextAdjust` no-op (doc 05), `structure` gaps, remaining `verify` coverage,
  `meta` thresholds (docs 31/32/33/36), and `Score.diff` never set.
- **Release artifacts.** `ver/subit_chess_v3.0.11/` holds the release snapshot and dossier.
  The annotated `v3.0.11` tag and push require separate explicit approval; they are not part
  of this preparation step.

---

## [3.0.10] — 2026-11-21

Correctness increment closing the P1/P2 findings of
`ver/subit_chess_v3.0.9/subit_chess_v3.0.9_audit.md`. No strength claim: search
evaluation, pruning parameters, UI and legality rules are unchanged. The audit
is static-only, so each finding was reproduced against the current sources
before a fix was written.

### Fixed

- **AUD-309-02 — null move no longer advances the halfmove clock.** A search-only
  null move at a real `halfmove = 149` used to create a synthetic `150` and a
  terminal draw in the recursive search. `makeNullMove()` now leaves the clock
  and repetition history untouched; `unmakeNullMove()` restores the full state
  snapshot, including `castling`, `fullmove` and `repLimit` (AUD-07/AUD-09).
- **AUD-309-04 — self-play observations are now independent and reported.** The
  seed selects a legal start position instead of being discarded, every game
  reports its seed and start FEN, colours are balanced, W/D/L are accounted for,
  and an optional validation sample uses a disjoint seed range. Validation is
  reported but never influences acceptance, so tuning cannot leak into it.
- **AUD-309-01 — package and CI artifact identity.** `version`, `main`, `browser`
  and the built HTML now agree; CI resolves the artifact name from
  `package.json` instead of a hardcoded v3.0.8 path.
- **AUD-309-05 — en passant origin square.** A FEN is rejected when the pawn's
  double-push origin square is occupied, so the position has no possible
  predecessor.
- **AUD-309-06 — safe integer FEN counters.** Halfmove and fullmove must be
  exact, non-negative (fullmove >= 1) safe integers; rounded oversized values
  can no longer silently change draw detection or move numbering.
- **AUD-08 — dead material is terminal inside the search.** `negamax()` and
  `quiescence()` now return a draw when the rule authority reports insufficient
  material, so a position that becomes dead after a capture is no longer scored
  by a static evaluation. The lazy piece cache is refreshed before the derived
  material query.

### Notes

- **AUD-309-03 (challenger as Black) was not reproducible.** The current
  `compare()` already assigns challenger/White in even games and
  challenger/Black in odd games. The audit's own patch snippets were
  self-contradictory and marked "do not apply"; semantics were derived
  independently and locked with a regression test instead of patching correct
  code.
- New suite `tests/engine.audit309.mjs` covers every finding above and is wired
  into `npm test`.
- **W06 closes AUD-07…AUD-09.** The audit suite now locks null-move
  repetition/history isolation, full canonical state restoration after a search
  that really uses null moves, all `canNull()` guards, and dead material at
  interior and horizon nodes, including a forced capture into K vs K.
- **W07 adds `tests/engine.tactics.mjs`.** An independent tactical suite checks
  four mate positions across default, no-null, no-TT and no-pruning
  configurations, a forced capture chain at the horizon, agreement on the
  forcing move, pawn-only zugzwang guards and TT reuse. No strength claim is
  made: pruning parameters and evaluation weights are unchanged.
- **Release artifacts.** `ver/subit_chess_v3.0.10/` and the annotated tag
  `v3.0.10` publish this correctness increment; the dossier records artifact
  SHA-256, audit closure and explicit SUBIT/strength status caveats.

---

## [3.0.9] — 2026-11-19

Correctness increment: the six P0 defects from
`ver/subit_chess_v3.0.8/subit_chess_v3.0.8_audit_2.md` are closed. No strength
claim — this release makes published scores describe searched, legal positions.
No interface change; the shipped file is still one offline HTML.

### Fixed

- **AUD-01 — no stand-pat in check.** `quiescence` used to return a static score
  of a checked position and could cut it off with beta. A static score is not a
  legal move; the check now starts from `-INF` so the first searched evasion
  sets the bound.
- **AUD-02 — qdepth cap while in check.** At the horizon cap, scoring the
  unresolved check (or returning `-INF` and fabricating a loss) is replaced by
  `staticCheckEvasion()`: resolve one legal evasion and score that position
  statically (mate when none exists). No recursion, so the cap stays a cap.
- **AUD-03 — horizon stalemate at any qdepth.** The stalemate probe no longer
  runs only at `qdepth === 0`; it runs whenever no capture was generated, so a
  deeper quiet horizon cannot publish a material score for a drawn position.
- **AUD-04 — claimable draws are playable inside the search.** `negamax` keeps
  only the automatic draws (75-move, fivefold) as terminal. The 50-move and
  threefold claims stay normal positions, matching ADR 0020. This supersedes
  the search clause of ADR 0011; its game-status clause is intact.
- **AUD-05 — root honours automatic draws.** `search()` detects the 75-move
  rule, fivefold repetition and dead material before searching, returning a
  terminal result with a `reason` that matches `Position.status()`.
- **AUD-06 — futility sign.** The post-move static score is negated before it
  is compared with alpha (the position belongs to the opponent); the previous
  sign pruned exactly the good quiet moves it should keep.

### Notes

- **TT validity narrows to one search.** `TT_MAX_AGE` is `0` and `ttMoveFor()`
  now applies the same age check as `probe()`. After the quiescence fix, a
  one-generation-old move hint reordered the tree and changed the published
  score (cold `-3`, warm `+25` on the ADR 0011 position). Iterative deepening
  is unaffected and `Memory` still carries move and score across game moves.
  See ADR 0022.
- **ADR 0022** records the search terminal-correctness decisions above.
- **AUD-07…AUD-09** (null-move/repetition contamination, dead material in the
  horizon, null-move state equivalence) were open P1 items at this release;
  they were closed in 3.0.10.

### Added

- `tests/engine.audit2.mjs` — 12 checks, one or more per P0 defect, wired into
  `npm test`, `npm run test:engine` and `npm run test:audit2`.

---

## [3.0.8] — 2026-11-16

Audit follow-up: the remaining P1 items and the whole P2 UI block are closed, and
`Memory` finally does something. No interface change; the shipped file is still
one offline HTML.

### Fixed

- **P1.2 — rule-50 draws are hidden from the transposition table.** A 53-bit key
  is reused for positions that differ only in the halfmove clock, so a score
  cached before the 50-move boundary was served after it (and vice versa). TT
  probe/store and the structural-evaluation cache now key on `Position.ttKey`,
  which folds the halfmove bucket (0-79 / 80-99 / 100-149 / 150+) into the key;
  `Position.key` stays the raw Zobrist for `verify.mjs`.
- **P1.6 — a plan now needs all five feasibility axes.** `accepted` used to mean
  "legally generated"; `tactical`, `temporal` and `strategic` were computed but
  never blocked anything, so plans like a king march into an open board were
  offered as accepted. A plan is `admitted` when it is legal, rule- and
  structure-feasible, and `accepted` only when all five axes hold. `strategic` is
  filled per plan type (passed-pawn race, king activity, outpost, shield, trade),
  and `genKing` no longer emits a plan for a bare king with no enemy pawns.
  Rejected plans now carry their full feasibility vector, which is what
  `describePlans()` and the plan panel render.
- **P1.8 — `riskOf()` matches its own description.** The function now uses the
  root score spread and PV length (a short PV or a small spread is a real risk
  signal, not a constant), the bound flag and the mate distance. The decision
  certificate checks `completed` **before** the mate threshold, so an unfinished
  search that happens to see a mate is `UNVERIFIED`, never `FORCED_WITHIN_SCOPE`.
  `search()` returns `scoreSpread` / `secondScore` to make that possible.
- **The clock charged the wrong side.** The tick skipped the whole interval while
  the engine was thinking, i.e. the engine played for free. The clock now runs for
  whoever is to move (including during a search) and starts with the first move of
  the game, not at page load.
- **PGN export produced an unplayable file for custom positions.** A game started
  from a FEN was exported with `[Result "*"]`, no `SetUp`/`FEN`, and move numbers
  counted from move 1 as if the standard array had been played. The exporter now
  emits `SetUp`/`FEN`, numbers the moves from the base FEN (including `1...` for
  a black-to-move start) and reports the real result (`0-1` on resignation,
  mated/flagged side otherwise).
- **Captured pieces ignored the start position.** The panel compared the board
  against the standard piece counts, so a game loaded from a sparse FEN showed
  phantom captures from move zero. Counts are now taken from the game's base FEN,
  per colour.
- **Undo ignored the start position.** "Undo" past the first move jumped back to
  the standard array instead of the FEN the game was loaded from.
- **Settings were lost on reload.** Theme, level, coordinates/legal/arrows and the
  evaluation mode are persisted in `localStorage` and restored on start.

### Added

- **Web Worker search (P2.1).** The engine runs in a dedicated worker built from
  the same bundled source (embedded in the page, no extra file), so the search no
  longer freezes the board, the clock or the animations. One `Engine` per worker,
  so TT and `Memory` survive across moves of a game; a new game resets both. The
  main-thread path stays as a fallback when `Worker` is unavailable, and is what
  the DOM tests exercise.
- **Keyboard play (P2.6).** The board is a roving-tabindex grid: one square is in
  the tab order, arrow keys move the cursor, `Enter`/`Space` select and play.
  Modals take focus on open and give it back on close; `Escape` closes the topmost
  modal.
- `tests/engine.worker.mjs` (npm run `test:worker`): unpacks the embedded engine
  source from the built page, runs it in a fake worker scope and checks that a
  search request is answered with an id, a move, a depth and a node count.

### Changed

- `Memory` is read, not just written (P3.1). `Engine.search()` looks the position
  up before searching and feeds the remembered move and score to the root
  ordering and the aspiration window. The first search of a position is unchanged;
  a repeated one starts from the previous answer.
- `tests/app.dom.mjs` derives the artefact name from `package.json` instead of
  hard-coding the version, and runs jsdom with a real origin so `localStorage`
  behaves as it does in a browser.

### Notes

- `tests/engine.eval.mjs`: the warm/cold search invariant is now checked with
  plans disabled. Plans feed the move-ordering bonus, so a warm search may
  legitimately pick a different move than a cold one — the invariant is about TT
  reuse, not about plan ordering. This is documented at the test.
- Test suite: 11 suites (added `engine.worker`) plus the 128-check legacy suite.
  `tests/engine.audit.mjs` grew from 66 to 87 checks (rule-50 TT key, five-axis
  plan feasibility, `riskOf`/certificate, Memory read).
- The audit item 4.2 (rule-50/75-move and repetition → 0) is still deliberately
  rejected: claimable draws stay playable, as decided in ADR 0011/0020.

---

## [3.0.7] — 2026-11-16

### Added

- `bench/match.mjs`: `--time <ms>` plays a match on a clock instead of a fixed depth
  (the way the UI plays), a `futil3` ablation (futility at depth 3, the pre-3.0.1
  speed setting), and `--quiet` no longer swallows the following argument.
- `bench/match.mjs`: length distribution in the summary (mean / median / max /
  `capped` / termination reasons) and a `--variety` knob that shuffles the opening
  order deterministically from `--seed`, so two runs do not share one sequence.

Measured: `base` vs `futil3` at 150 ms/move, 24 games, seed 11 -> 47.9% ± 16.1
(7W 9D 8L), mean 209 plies; and at a fixed 1 s per move the two reach the same depth
on four middlegame/endgame positions (kiwipete d5, endgame d8, ~150k nodes each). The
3x node cost of the 3.0.1 futility fix therefore shows only at a fixed *depth*: at UI
clock settings the mate fix is free.

Gate 1 baseline: `base` vs `plain`, 6 games, depth 3, seed 5, `--variety` -> mean 190
plies, median 212.5, 1/6 games at the 300-ply cap, reasons `checkmate: 5, max plies: 1`.

### Changed

- `docs/ROADMAP.md`: the hazard list and Gate 1 now describe what the harness
  actually does (12 fixed openings, colour-alternated, `status()` checked after
  every move, so the cap is not what contaminates the numbers). Gate 1 is
  re-scoped to breadth plus a reported length distribution. The debt list no
  longer claims `unmakeNullMove` increments `stm` - it restores `turn` from the
  undo record.

A correctness release driven by the v3.0.6 audit. Eleven defects were fixed across the
FEN layer, the search horizon, the context engine, the plan generators and the meta
layer, each with a regression test in `tests/engine.audit.mjs` (66 checks). The engine
now validates its input before touching the board, scores claimable draws as playable,
and reports a real risk instead of a constant.

### Fixed

- **§3.1 FEN validator (`src/engine/fen.mjs`, new).** A malformed FEN no longer
  half-changes the board: `validateFEN()` runs every check (syntax, board, kings,
  castling home squares, en-passant rank, counters, the side-not-to-move-in-check rule)
  *before* `Position.setFEN` mutates anything, and a rejected FEN leaves the previous
  position byte-identical. `setFEN(fen, { validate: false })` is the escape hatch the
  verifier uses to build impossible positions on purpose.
- **§4.1 horizon stalemate.** Quiescence now detects stalemate at `qdepth === 0` when
  no capture exists, instead of returning a static score for a drawn position.
- **§4.2 claimable vs automatic draws.** The 50-move rule (100 halfmoves) and threefold
  repetition stay playable; only the 75-move rule (150) and fivefold repetition end the
  game (`Position.status()`). The quiescence horizon scores them 0 as well.
- **§5.1 context directions.** `computeContext` now indexes the pressure on *my* king by
  `pos.turn` and the pressure on the *enemy* king by `opposite(pos.turn)`. The old code
  inverted the ATTACK and DEFENCE components whenever the kings were asymmetric.
- **§6.1 structural context.** `Evaluation.structural()` builds the `Structure` before
  calling `computeContext`, so the context is computed from a structure that exists.
- **§6.2 measured uncertainty.** `uncertaintyOf` accepts `0.0` as a measured value
  (`typeof ev.uncertainty === 'number'`) instead of treating it as missing and falling
  back to the 0.3 default.
- **§7.1 outpost control.** `genOutpost` checks `percept.atk.cnt[side][to]` (control of
  the destination) rather than `defenders(to)`, which counts defenders of a piece
  already on the square and was therefore always 0 for a landing square.
- **§7.6 Pareto set.** `Engine.analyze()` reports the full Pareto set with a `total`
  field, and lists the plans rejected by the filter next to the ones rejected earlier.
- **§8.1 analyze() risk.** `analyze()` reports the position's own uncertainty (via
  `RISK_NAME[round(u * 4)]`) when no search has run, instead of the constant
  `CRITICAL` that `riskOf(null, 0)` returned.
- **§3.2 futility + checks.** Futility pruning skips a quiet move that gives check, so a
  quiet mate is no longer pruned by the margin test.
- **§4.3 seldepth reset.** `Searcher.search()` resets `seldepth = 0` at the start of each
  search, so the previous search's maximum no longer corrupts the risk estimate and the
  `Us` component of U(P).
- **§5.2 insufficient material.** `K+B vs K+B` is dead only when both bishops stand on
  the same colour complex; with opposite colours a helpmate exists, so the position stays
  playable. `K+N vs K+N`, `K+B vs K+N` and `K+2N vs K` are not dead either.
- **§6.3 53-bit Zobrist key.** `Position.key` composes the two 32-bit halves into a
  single 53-bit safe integer (`hashLo * 2^21 + (hashHi & 0x1fffff)`), so the
  `Float64Array` transposition table stores the full key without collision.
  `Structure.hashKeys` uses the same composition.

### Added

- `tests/engine.audit.mjs`: 66 regression checks, one per audited defect. Wired into
  `npm test` / `npm run test:engine` and exposed as `npm run test:audit`.
- `docs/DECISIONS.md` ADR 0020: the claimable-draw rationale (50-move / 3-fold stay
  playable) with the search/quiescence split.

### Notes

- The quiescence stalemate check stays enabled. A controlled d7 measurement
  (`2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16`) found 488236 nodes
  with the check on and off, and the wall time inside the noise band (~2.3-2.4 s), so
  the common tactical path pays nothing for the correctness it buys.

---

## [3.0.6] — 2026-11-15

The engine now reports how much it does not know, and on what evidence. Doc 37's eight
uncertainty components are computed from the position and the search, and doc 45 §20.2's
Decision Certificate is attached to every search result. Nothing is collapsed into one
number, and nothing feeds back into the evaluation.

### Added

- `src/engine/uncertainty.mjs`: `computeProfile()` returns U(P) = (Us, Ut, Ue, Ur, Up, Uh,
  Um, Uc), each in [0,1] with the evidence and context that produced it (UCT-INV-006), a
  `driver` naming the leading component, and deliberately **no** `scalar()`: a weighted
  blend of eight incommensurable quantities presented as *the* uncertainty is what
  doc 37 §14.3 and doc 45 §16 forbid.
- `buildCertificate()` / `certificateLine()`: the doc 45 §20.2 fields,
  `validation_status` derived from the evidence (REFUTED on an illegal move, UNVERIFIED on
  an unfinished search, SEARCH_SUPPORTED on a completed one, FORCED_WITHIN_SCOPE on a
  proven mate), `provenance`, `position_version`, `legal_validation`, depth and node count
  copied from the search, and the principal variation that was actually searched.
- `Engine.uncertaintyProfile()` and `Engine.positionVersion` in `src/engine/index.mjs`.
  Every search result now carries `uncertaintyProfile` and `certificate` beside `score`,
  never inside it (UCT-INV-019).
- `build/shell.html`: the search panel prints U(P) with the leading component marked, so
  the player sees *which kind* of doubt the engine has instead of a single risk word.
- `tests/engine.uncertainty.mjs`: 36 checks — the eight canonical types, [0,1] bounds,
  per-component context, determinism (same position and budget give the same profile, the
  same decision and the same evidence strings), that a large static advantage does not hide
  the tactical component, that a proven mate zeroes Us, the certificate fields and
  statuses, and that every position change bumps the version.

### Notes

- No `Confidence = 1 - Uncertainty` (doc 37 §14.3): the profile carries no confidence
  scalar, because the subtraction would imply the two are one quantity measured twice.
- The tactical component stays visible under a large static edge (UCT-INV-016): a position
  that is structurally winning but tactically live reports Ut, and the driver is the
  tactical component — not the score.
- Um rises in a pawn ending because no tablebase stands behind the evaluation; the tier it
  depends on is recorded with the profile instead of being assumed.

---

## [3.0.5] — 2026-11-15

A leaf-evaluation speedup, measured and value-identical: the same search tree, the same
nodes, ~7% more of them per second.

### Changed

- **`evaluateFast` is faster at the leaves** (~472k → ~589k evaluations/s, +25%). The
  piece-square sum now reads flat `Int32Array`s (`mid[t * 128 + sq]`) instead of
  `tables[t].mid[sq]` (two property loads per piece), the per-term config is hoisted out
  of the loop, both colours share one piece loop with the square mirrored once instead of
  a second copy of the loop, and pawn `popcount`/`ctz` are byte lookups.
- The speedup reaches the search as throughput, not as a different decision: a fixed `d7`
  search on `2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16` needs
  503402 nodes in 2860 ms → 2654 ms (+7.4% nodes/s) with the same best move (`Qxf4`) and
  the same score (+4). Evaluation values are unchanged: 10 positions (opening, middlegame,
  endgame, asymmetric, en-passant, both colours to move) return identical values to the
  centipawn against the previous build.

### Notes

- Tried and reverted: a per-node pinned-piece mask, to skip the `isAttacked()` legality
  test for every move that cannot expose its own king. `isAttacked` fell from 8.2% to 7.0%
  of the profile, but the ray scan that builds the mask costs 1.5%, and the wall clock went
  the other way (min of 5 `d7` runs: 2636 ms without, 2662 ms with). Reverted: the mask
  only pays when the attack test dominates, and here it does not — most calls are the
  per-node check detection, which the mask does not touch.
- TT sizing is not the lever: `ttBits` 18 vs 20 changed nothing measurable (164k vs 165k
  nps on the same position, 503402 nodes either way).
- Cost model after this change (self time, 5 × `d7` searches, 2.5M nodes):
  `evaluateFast` 39.7%, `scoreMoves` 16.8%, `generateMoves` 14.8%, `isAttacked` 7.0%,
  `quiescence` 6.1%, `makeMove` 4.5%, `negamax` 3.2%, GC 2.4%. Inside `evaluateFast`:
  mobility 37%, material + piece-square 55%, pawn/rook/king structure 8%.
- The remaining 2x is not in `evaluate.mjs`. It needs staged move generation (captures
  first, quiets after the cutoff) or bitboards: `generateMoves` + `isAttacked` +
  make/unmake are 27% of the profile and only a representation change moves them. Tracked
  in `docs/ROADMAP.md`.

## [3.0.4] — 2026-11-15

Search determinism and a real top difficulty level. Both came from one report: "the
engine got weaker" after a game in which it lost a position it had evaluated as equal.

### Fixed

- **The root move depended on what had been searched before.** The transposition table
  stored a generation counter per entry but `probe()` never read it, so bounds written
  under one move order were reused in later searches and could flip the root choice. On
  the position after 11...O-O a cold `d12` search reported Kxf1 +81.0; the same search
  after `d6/d8/d10` reported Nf5 +113.2 — a 32 cp swing from stale entries, not from
  the position. Entries older than one generation are now ignored (`TT_MAX_AGE`), which
  makes the result independent of history. Regression: `tests/engine.eval.mjs` §12.
- **The top difficulty level searched 8 ply.** Level 5 asked for `depth: 8`. On the
  position after 11...O-O the engine keeps the same move from d8 to d12 (Kxf1) but its
  score moves 0.0 → +12.0 → +135.0 → +81.0, so at playing depth it reported equality
  where it is winning. Level 5 now searches `depth: 10` with a 6 s clock (measured: d10
  in 3.0 s from the initial position; d9 in 4.0 s and d10 in 5.8 s on that middlegame
  position). This raises general depth; it does **not** make the reported game's score
  accurate — that needs d11, ≈13 s, which a browser UI cannot spend.

### Changed

- The level label shows the depth that is actually searched (`Рівень 3 · d4`), not the
  level number; `LEVELS` moved to module scope so `setLevel()` can read it.

### Notes

- Cost of aging: 2.29M nodes vs 2.24M on a 22-ply line at 600 ms/move (+2%), reached
  depth 150 vs 149 (cold) and 159 vs 159 (warm). No strength measurement backs a claim
  either way — the change is about reproducibility, not Elo.
- Not a regression release: v3.0.0 and v3.0.3 return identical moves and scores on the
  critical position (Kxf1 0.0 / 12.0 / 81.0 at d8/d10/d12). What changed between releases
  (futility, aspiration, repetition) never touched this line.
- The move in the reported game was never the problem: the engine's own deeper search
  prefers Kxf1 at every depth, and the human's 12.Nf5 was scored +113 only while stale
  TT entries were in play. With aging the same search reports Kxf1 (+135 at d11).

## [3.0.3] — 2026-11-15

Correctness pass on the game state: repetition, node budget, evaluation-tier switch.
All three were invisible in tests because they only appear in a real game, not in a
single search.

### Fixed

- **The game lost its repetition history after every move.** `Engine.play()` rebuilt the
  position through `setFEN()`, which clears `rep`/`repLimit`, so outside a single search
  no repetition could ever be seen: the engine could not claim or avoid a threefold, and
  equal positions ran to the 300-ply cap. `play()` now carries the stack over (and records
  the position it leaves). Regression: `g1f3 g8f6 f3g1 f6g8` repeated four times reports
  `repetitionCount() === 5` and `status() -> fivefold repetition`.
- **A repetition was matched on 32 bits.** `isRepetition()`/`repetitionCount()` compared
  `hashLo` only; a collision would end a won game as a draw. Both halves are compared now.
- **The node budget was silently dropped.** `Engine.search()` called `setLimits({nodes})`
  and then `searcher.search(pos, {depth, timeMs})`, and the searcher re-reads its limits
  from those options — `search({depth: 8, nodes: 1})` searched 81,619 nodes. The budget
  now travels with the search call (`nodes: 1` -> 1 node).
- **The fast/structural switch did nothing.** `Engine.search()` re-assigned
  `evaluation.opts.mode` from the engine defaults on every call, overwriting the UI
  selection. The tier is now only chosen by the meta-controller, `Engine.setEvalMode()`
  keeps an explicit choice, and the UI uses it.

### Added

- Regression tests for all three (repetition stack, fivefold, node budget) in
  `tests/engine.eval.mjs`.
- ADR 0016 — the game position owns its repetition history (`docs/DECISIONS.md`).

### Notes

- Playing strength: repetition awareness removes blind shuffling, but no measurement yet
  shows a score change; `base` vs `futil3` at 150 ms/move, 24 games, was 47.9% ± 16.1,
  i.e. still inside the noise band. Treat 3.0.3 as a correctness release, not a strength
  claim.
- Known gaps kept from the 3.0.2 audit (not in this release): FEN validation, quiescence
  not detecting stalemate/draws at the horizon, meta-controller skipped for fixed-depth
  searches, no Web Worker.

---
## [3.0.2] — 2026-11-15

Search diagnostics: the root reports whether its published score is exact, and a test
asserts that it always is.

### Added

- `search()` returns the bound flag of the iteration behind `score`/`depth`
  (`0` = exact, `1` = lower bound, `2` = upper bound), so a bound can no longer be
  mistaken for an evaluation by callers or by the ablation harness.
- `tests/engine.eval.mjs` § «the published score is exact»: start position, Kiwipete,
  the SmallFish mate position and the endgame position all report `flag=0` at depth 6
  (SEARCH-INV-002).

### Notes

- Closes the open question about a ~270 cp jump between consecutive plies in the
  SmallFish replay. Re-measured with the same evaluator, only the root aspiration loop
  differing: before `38.Re1` the pre-3.0.1 engine published `546` with `flag=1`
  (a lower bound), the exact value is `593`, and after the move both sides report
  `593 / -593`. There is no discontinuity in the evaluation — the jump was a bound
  published as a score, the defect fixed in 3.0.1.
- No strength claim changes: the artifact differs from 3.0.1 only by the diagnostic
  field and the test.

---
## [3.0.1] — 2026-11-15

Search fix: the engine no longer hides a forced mate behind futility pruning.

### Fixed

- **Futility pruning could mask a mate.** Futility ran at `depth <= 3`, and a node whose
  quiet moves were all pruned returned as if it were stalemate (`legal === 0 -> 0`). In the
  SUBIT-CHESS v3.0.0 vs SmallFish game — after 45.Nc6, FEN
  `2k5/3R4/p1N1K1p1/P1p5/7p/1p5P/8/8 b - - 1 45` — black is mated in 2
  (`45...b2 46.Kd6 g5 47.Rc7#`), but the depth-8 search reported **-471.75 cp** and the
  engine promoted into the mate. Measured on the same position: `-99996` (mate in 2) at
  depth 8 with `futility.maxDepth <= 1`, `-471.75` with `maxDepth 3`. Futility is now
  limited to the frontier (`maxDepth: 1`), and a node where every move was pruned returns
  the static evaluation instead of a false draw.
- **A fail-low is not a score.** The root aspiration loop widened by a fixed step and could
  accept a fail-low bound as the iteration's value, so a mate outside the window was
  published as an ordinary evaluation. `negamaxRoot` now returns its bound flag, and the
  loop widens once and then re-searches with an open window before publishing.

### Added

- Regression tests for the game position: the mate is not hidden, the mated side reports a
  negative mate, `Kd6` forces mate, `Rc7#` is the mating move (`tests/engine.eval.mjs`).
- ADR 0015 — futility belongs to the frontier (`docs/DECISIONS.md`).

### Notes

- Cost: futility at depth 1 instead of 3 raises the node count in tactical middlegames
  (Kiwipete depth 7: 965k → 2.1M nodes, 5.5 s → 10.5 s) and therefore shortens the
  effective depth on UI level 5, where the 2.5 s clock is the binding limit.
- The game itself was already lost before move 45: the depth-8 evaluation of black's
  position stayed between -130 and -250 cp while SmallFish was winning, and every black
  move from move 26 to move 46 was the engine's own best move (zero deviation). The mate
  at move 47 was a consequence, not the cause.

---
## [3.0.0] — 2026-11-15

Modular engine rewrite with the v2.2.0 interface preserved, plus a
playing-strength and correctness pass verified with a native self-play harness.

### Changed

- **Engine** is now a set of plain ES modules under `src/engine/` (`core`, `percept`,
  `structure`, `context`, `evaluate`, `search`, `plans`, `meta`, `index`) instead of one
  inline script. `build/bundle.mjs` walks the import graph and inlines it into the shipped
  single file `src/subit_chess_v3.0.0.html` (203.4 kB) — still no build step, no CDN, no
  network access for the end user.
- **Unified pipeline** exposed on `Engine`: `setFEN / legalMoves / analyze / budget / search /
  play / perft / selfPlay`, with every stage (percept, structure, context, evaluation, plans,
  memory, meta) inspectable from `analyze()`.
- **Interface** taken from v2.2.0: same header, player bars, captured-piece trays, clocks,
  board (SVG pieces, coordinates, legal-move dots, capture rings, check glow, last-move arrow),
  move list, level pills, promotion / FEN / help / settings modals, theme switch, PGN export,
  drag-and-drop plus click-to-move.
- **Panels** now show engine-v3 data: S₀ = (I, Z, Φ) with τ/complexity/uncertainty/risk,
  SVF vector (M,K,A,D,C,T,Q,R,X) with Belnap verdicts, structural plans, relation counts and
  critical squares, and search statistics (score, depth, nodes, nps, risk, PV).
- **UI difficulty** is no longer a 1:1 depth: levels 1-5 map to depth 1 / 2 / 4 / 6 / 8 with a
  2.5 s safety clock on the top level (level 3 previously searched depth 3).
- `package.json` version bumped 1.9.1 → 3.0.0 to match `ENGINE.VERSION` and the artefact name.
  `main`/`browser` point at `src/subit_chess_v3.0.0.html`.

### Fixed

Playing-strength defects, found by reading the search against `docs/theory`:

- **Evaluation perspective (strength-critical).** `evaluateFast()` returned a
  white-positive score while the negamax consumes side-to-move-relative values,
  and `Evaluation.structural()` negated an already side-to-move-relative vector a
  second time. Every black-to-move node was scored with the wrong sign, so the
  search maximised the opponent's advantage on odd plies. Both tiers now return
  mover-relative values (`white` stays white-positive). Measured against the
  pre-fix modules: **12-0 in a depth-3/4 match**.
- **Plan-ordering bonus dominated the move ordering.** `makePlanOrderer()` added
  `100 + score` to the structural level (`w.struct = 200000`), i.e. ≈2.2e7
  against `pv = 1e6`, `tt = 9e5`, `tactic = 8e5`: a quiet plan move outranked a
  capture at every node, and the same root-side map was applied to the
  opponent's replies. The bonus is now bounded to `[0,1]` (structural level only,
  below tactics) and is side-aware (doc 05 §11.2, doc 11).
- **History term could outrank captures.** Raw history counters (capped at
  2^20) were added unscaled, exceeding `tactic`. History is now normalised into
  `[0, 0.6·w.history]`, keeping the documented level order
  `pv > tt > tactic > struct > context > history`.
- **Tapered evaluation was miscalibrated and never engaged.** `pos.phaseMaterial`
  counts pawns (40 at the start) while `PHASE_TOTAL` is the piece total (24), so
  `1 - phaseMaterial/24` clamped to 0 for the whole opening and most of the
  middlegame: the mid/endgame blend was a no-op. Phase is now computed from
  non-pawn material.
- **Late-move reduction could overwrite a deeper result with a shallower one.**
  The fail-high re-search used `depth - 1` unconditionally, so on a checking move
  (which extends by one ply) a full-depth result was replaced by a one-ply
  shallower search. The re-search now targets `max(nextDepth, depth - 1 + ext)`.
- **The root never applied the PV-move bonus.** `negamaxRoot` passed the previous
  iteration's *score* into the `pvMove` slot of `scoreMoves`, so the bonus could
  never match; it now passes the previous iteration's best move.
- **Mate distance sign.** `Engine.search()` multiplied the mate distance by the
  sign of the score twice, reporting `mate: +N` when the side to move was getting
  mated. The sign now follows the score (negative = we get mated).
- **Forced mate on a single legal move.** The root shortcut returned
  `score: 0, completed: true` when only one legal move existed, so a mate-in-1
  reported 0. The shortcut is removed; the normal loop prices the move.
- **Quiescence in check could return `-INF`.** When the quiescence cap was hit
  while in check the node returned `-INF` (a fabricated loss). It now falls back
  to the static evaluation.
- **Score/depth provenance.** A partial iteration's score could be published
  together with an older iteration's depth. Score, depth, PV and `completed` now
  come from the same completed iteration.
- **Transposition table and mate scores.** Mate scores are ply-normalised on
  store and denormalised on probe, so an entry reused at another ply reports the
  correct distance.
- **Claimable vs automatic draws.** Inside the search, the 50-move rule (FIDE 9.3)
  and threefold repetition (9.2) are scored as 0 for both sides (the opponent can
  claim them), while the 75-move rule (9.6.2) and fivefold repetition (9.6.1) are
  automatic; `Position.status()` keeps the claimable/automatic split for the game.
  A better side can no longer shuffle into a repetition and hand back half a point.
- **Move-order buffer truncation.** `MoveOrder` silently dropped legal moves
  beyond `capacity = 256`; the scratch arrays now grow instead.
- **Pawn bit indexing in the fast tier.** The pawn file/rank masks used `sq >> 4`
  while the board stores rank 8 at index 0, so the mask was mirrored: the start
  position scored **+824** instead of the expected symmetry. Indexing is now
  `1 << (7 - (sq >> 4))`.
- **`forkBalance` axis.** It returned white-minus-black inside a side-to-move
  relative vector, corrupting the `T` axis for black (SVF-INV-002). It is now
  mover-relative, and two dead terms (`hyperCounts[2] * 0`,
  `counts[1] - counts[1]`) are gone.
- **`spaceControlled` was dead code.** `rank > 3 && rank < 4` is unsatisfiable,
  so the space axis was always 0; it now counts the opponent's half.
- **Plan ids were not reproducible.** A module-global counter leaked ids across
  searches; `generatePlans()` resets it and the ranking tiebreak no longer
  depends on the id string.

### Added

- **Fast-tier terms** (`params.eval`, each individually switchable): tapered
  material + PST, mobility for N/B/R/Q, bishop pair, doubled/isolated/passed
  pawns, rook on open/semi-open files, king shield (endgame-weighted). The fast
  tier is allocation-free (module-level scratch buffers, board-scanned mobility).
- `bench/match.mjs` — deterministic self-play/ablation harness (W-D-L, score with
  95% CI, per-game log, JSON export) with configs `base`, `nostruct`, `noctx`,
  `nores`, `noplans`, `nobudget`, `plain`, `eval0`, `notaper`, `nopawns`,
  `norooks`, `noshield`, `nopruning`, `nonull`, `nolmr`, `noasp`, plus per-side
  depth via `name@depth` (doc 05 §25.2 ablations, doc 07 protocol).
- `tests/engine.eval.mjs` — regression tests for eval colour symmetry, mover
  sign, tier agreement, mirror search, mate signs, ordering levels and plan-bonus
  bounds, wired into `npm run test:engine`.
- npm scripts `match:engine` and `match:ablate`.

### Removed

- Panels and modals bound to subsystems that no longer exist in v3: Belnap/ρ_s grammar,
  natural-transformations and morphism-category panels, S₀ diagnostics, ρ_s report, engine
  comparison, controlled-diffusion study generator, teacher snapshots, telemetry.

### Notes

- Measured with `bench/match.mjs`: the fast tier against the previous eval
  (material + PST + hard switch) is 52.5% ± 13.3 over 20 games at depth 3, and
  depth 5 against depth 4 is 45.8% ± 22.4 over 12 games — both inside the noise
  band at these sample sizes. The instrument, not the conclusion, is the
  deliverable: an engine must gain from depth, and that regression test now runs
  in one command (`--a base@5 --b base@4`).
- `npm test` now runs the v3 suite (engine perft/smoke/plans/eval/verify/driver/
  learn + the jsdom UI check). The v2.2.0 single-file suite is kept as
  `npm run test:legacy`.
- `TranspositionTable.probe` already checked depth (`search.mjs:67`); an early
  hypothesis that it ignored depth was disproved and is not part of this release.

---

## [2.2.0] — 2026-10-19

Major milestone. Controlled generation of chess studies via discrete latent diffusion (CFG) + SUBIT-∞ v6.13.

### Added

- **Controlled Diffusion Study Generation Engine** (makeStudyDiffusionModule):
  - Board tensor 8×8×14 (12 piece channels + turn + castling/ep = 896 values).
  - Reverse denoising guided by p(position | beauty) with CFG: x = x_uncond + w·(x_cond - x_uncond).
  - Guidance slider w ∈ [1.0, 10.0]. Themes: queen_sac, zugzwang, stalemate_defense, domination, reti_maneuver, underpromotion, battery, quiet_key.
  - Cook filter (minimax depth 4-8), Aesthetic Scorer A ∈ [0.40, 1.00].
  - Live denoising mini-board UI, step progress T=15→0, candidate viewer with FEN output.
- **SUBIT v6.13 Trajectory Classes (§11.1)**: FIXED, PERIODIC, MIN_ZERO, MIN_POS, NONMIN_ZERO, NONMIN_POS.
- **Classify⁺ (§4.5)**: (OrbitType, InclusionType, ChaosStatus, Min). ChaosStatus: NOT_APPLICABLE ≠ NON_CHAOTIC.
- **d_Ω_traj metric (§11.3)**: Normalized Hamming on 12-code representation.
- **Exported**: window.__subit.v6_13, window.__subit.diffusion.
- **Tests**: Groups [v6_13] + [diffusion] added. Total: **128 passed, 0 failed** (v2.2.0); backward-compat **100/100** (v1.9.1).

---
## [1.9.1-docs] — 2026-09-27

Documentation-only addition; no engine code changed.

- **Added** `docs/SUBIT-CHESS-SPEC.md` — formal specification derived from SUBIT-∞ v5.2.
- **Added** `docs/SUBIT-EXPERIMENT-SPEC.md` — pre-registered experimental protocol.
- **Added** `docs/USER-MANUAL.md` — comprehensive user guide.
- **Added** `docs/ROADMAP.md` — release plan and gates.
- **Added** `docs/DECISIONS.md` — 8 architecture decision records.
- **Updated** README with full documentation index.

## [1.9.1] — 2026-09-26

Infrastructure release. Game strength ≈ v1.8.7 in baseline mode. Focus: make
ρ_s correct, observable, and installable from a frozen teacher run.

### Added

- **ρ_s policy vector** on **8 signal cells** (from 48-cell teacher run, 6548 FENs).
  - Coverage: `3929 / 6548 = 60.0%` of transitions.
  - Declared params: `8 × 4 = 32`. Effective params in search: `8 × 6 = 48`.
  - Samples/param: `6548 / 48 ≈ 136.4` (vs. 74.4 for a 22-cell variant).
  - Cells: `QUIET|CENTER|OPENING`, `QUIET|CENTER|MIDDLEGAME`,
    `QUIET|GLOBAL|MIDDLEGAME`, `PRESSURE|CENTER|OPENING`,
    `DEFENCE|CENTER|TACTICAL`, `QUIET|CENTER|TACTICAL`,
    `QUIET|GLOBAL|OPENING`, `QUIET|CENTER|ENDGAME`.
- **`initRhoSFromTeacher(teacherAllCells)`** — derive ρ_s per active cell from
  teacher means:
  ```
  norm        = clamp(mean / 100, −1.5, +1.5)
  d_base      = clamp(2 + 0.5 · norm,  1,   4)
  r_LMR       = clamp(2 − 0.4 · norm,  1,   3)
  r_null      = clamp(2 − 0.2 · norm,  1,   3)
  b_futility  = clamp(150 + 30 · norm, 80, 250)
  ```
  Sets `rhoSFrozen = true`. No online update.
- **`policyFor(pos)`** — returns `{ d_base, lmr_mult, null_enabled, futility_mult }`.
  Falls back to `BASELINE_POLICY` when ρ_s is not installed or `policyEnabled = false`.
- **`searchParamsFor(pos)`** — returns full search params:
  `{ policy, extBudget, lmrThreshold, nullReduction, futilityMargin }`.
- **`policyNullR` / `policyFutMargin` in `alphaBeta`** — null-move R and futility
  margin are now controlled by ρ_s. Previously hardcoded `R = 2|3` and
  `FUTILITY_MARGIN = 200|300`.
- **Explicit policy passing**: `searchAsync → Worker.postMessage → createSearch`
  transmits `policyLmrMult`, `policyNullEnable`, `policyFutility`, `policyNullR`,
  `policyFutMargin` without any global. (ADR 0007.)
- **UI**:
  - `ρ` button → ρ_s report modal (8 active cells with n, mean, t, d, rLMR, rNull, bFut).
  - `ρ_s ON/OFF` badge in header.
  - Policy selector in settings (ON / OFF).
  - Extended budget grid in the S₀ panel: `r_null`, `b_futility` alongside `extBudget`, `lmrThreshold`.
  - Heatmap highlights active cells with a gold inset ring.
- **Console API**: `__subit.activateRhoS()`, `__subit.rhoSReport()`,
  `__subit.policyFor(fen)`, `__subit.searchParamsFor(fen)`,
  `__subit.setPolicyEnabled(v)`.
- **Snapshot config-aware**: `saveTeacherSnapshot(name, config)` stores
  `engineVersion` and `grammarVersion` alongside the payload.

### Changed

- **S₀ panel** shows `S₀ = I × Z × Φ = 48` (was `64`).
- **`visitedShare` / `signalShare`** now use `subit.WHO_LIST.length ×
  WHERE_LIST.length × WHEN_LIST.length` = 48 for all telemetry reports.
- **Grammar storage key** bumped from `subit-grammar-v3` to `subit-grammar-v4`.
  Old grammar in localStorage is ignored (no migration).
- **`state.settings.policy`** defaults to `'off'` — baseline mode is the safe default
  after install.

### Fixed

- **`visitedShare` denominator**: previously `makeTelemetryModule` referenced
  `WHO_LIST` from a scope where it was `undefined` and silently fell back to
  `48`. For 48 cells this happened to be correct; for any other grid size it
  would report `41/48` instead of `41/32`. Now uses `subit` lists. (ADR 0004.)
- **Coverage in reports**: was reported as `55.2%` (used 64-cell total `7116`
  by mistake); corrected to **`60.0%`** (`3929 / 6548`).

### Removed

- **Scaffold `makeRhoSModule` / `runRho8Match`** from the HTML — dead code.
- **`window.__rhoSModule` global** — never worked in Worker context; replaced
  by explicit passing.

### Notes

- **Pre-registration drift (ADR 0005):** ρ_s was pre-registered as 4 dims
  (`d_base, lmr_mult, null_enabled, futility_mult`). In v1.9.1 the search
  integration uses **6 effective dims** (`null_enabled` + `nullR` int,
  `futility_mult` + `futMargin` int) to make use of the full teacher-derived range.
  Documented and accepted. Does not change the A/B gate.
- **Auto-init hazard (ADR 0006):** `initRhoSFromTeacher()` runs automatically in
  `init()` if stored teacher telemetry has ≥8 signal cells. Documented as a
  known hazard for A/B contamination. Mitigation: clear teacher telemetry and
  call `setPolicyEnabled(false)` before baseline runs. Planned removal in v1.9.3.
- **Honest statistics (ADR 0008):** gate is `Δmean reward > +15 cp` on 8 active
  cells, not Elo. 200 games → SE ≈ 27 Elo, `+15` is `< 1σ`. 400 games for a
  real decision.
- No strength change vs. v1.8.7 in baseline mode.

---

## [1.9.0] — 2026-09-20

S₀ coarsening + first ρ_s prototype.

### Added

- **ρ_s** as `ACTIVE_POLICY` map — 8 hardcoded cells with
  `(d_base, lmr_mult, null_enabled, futility_mult)`.
- **`SubitState.prototype.policyFor(pos)`** — returns policy for current position.
- **`SubitState.prototype.searchParamsFor(pos)`** — returns combined search params.
- **`state.lastPolicy`** in UI state — shows active policy in `status-sub`.
- **`effectiveDepth = depth + policy.d_base`** — root depth shift.

### Changed

- **S₀ = 4 × 3 × 4 = 48** (was 4 × 4 × 4 = 64). `QUEENSIDE` dropped from
  `WHERE_LIST`; `KING`, `CENTER`, `GLOBAL` retained. (ADR 0001.)
- Grammar storage key bumped to `subit-grammar-v3`.
- Help modal content updated.
- UI label `S₀ = I × Z × Φ = 48`.

### Removed

- **`QUEENSIDE`** from `WHERE_LIST` — redundant with `CENTER` in practice.

### Notes

- **KING cells remain in the grid** but produce 0% signal — see ADR 0003
  (KING → CENTER merge is *rejected*: t drops 2.61 → 1.92).
- **Coarsening does not raise signal rate.** Observed flat 18–22% across
  64 → 48 → 32 extrapolations. 32-cell path rejected in ADR 0002.
- 8 signal cells from 48-cell run justify the ρ_s design.

---

## [1.8.8] — 2026-09-12

Z-fix iteration. Not released on GitHub; absorbed into v1.9.0.

### Fixed

- **Z-clustering at ≥3 threshold** — `QUEENSIDE` classification rate ×3.2.
  Statistical artifact, not a real signal.

### Notes

- **Dead end.** The QUEENSIDE tuning exhausted at rate ~19%, matching all
  other configurations. Confirmed that coarsening does not raise signal rate.
  Motivated S₀ coarsening to 48 in v1.9.0.

---

## [1.8.7] — 2026-09-10

Telemetry safeguards release.

### Added

- **`MAX_RAW = 15000`** cap on raw teacher trajectory.
- **`droppedRaw` counter** — visible in `teacherReport().droppedRaw`.
- **Dedup pre-flight report** in `batchTeacherEval`:
  `raw transitions / possibleFens / uniqueFens / uniqueRatio / dedup`.
- **ETA / throughput** in batch progress logging.
- **Snapshot API**:
  - `saveTeacherSnapshot(name, config)` — persists teacher run to localStorage.
  - `compareTeacherSnapshots(a, b)` — Jaccard similarity over signal cell sets.
  - `listTeacherSnapshots()` — returns stored runs.
  - `deleteTeacherSnapshot(name)`.
- **Config-aware snapshots** — each snapshot stores `engineVersion`,
  `grammarVersion`, `config` (depth / ply / epsilon / R_max).
- **`resetGrammarToBaseline()`** — clears all 64 cells, morphisms,
  `visitedObjects`, `posCounts`.

### Fixed

- **Batch eval** no longer silently drops raw transitions when trajectory
  exceeds memory. Old entries are counted in `droppedRaw`.

### Notes

- First release with "cross-run stability" gate (Jaccard ≥ 0.6).

---

## [1.8.6] — 2026-09-05

Evaluation fixes.

### Added

- **Endgame detection** via `heavyMaterial < 2000` in `computeComponents`.
- **Color-symmetry self-test** on init:
  `eval(W) + eval(B) = 0` at the starting position.

### Fixed

- **Starting eval drift** — after earlier changes, white-POV start eval was
  off by several cp. Now `≈ +10 cp`.
- **King PST in endgame** — now uses `KING_ENDGAME_PST` when
  `heavyMaterial < 2000`, matching standard chess engine practice.

### Notes

- perft(4) = 197281 still holds.

---

## [1.8.5] — 2026-08-28

Teacher telemetry v3.

### Added

- **`teacherTelemetry`** module — separate storage for offline `V_teacher`
  per cell.
  - `recordRaw(entry)` — raw trajectory capture.
  - `getRawEntries()`.
  - `recordTeacherReward(s, sNext, reward, omega)`.
  - `report()` — with `rawEntries`, `droppedRaw`, `signalCells`.
- **`batchTeacherEval({ depth, R_max, concurrency })`** — offline evaluation
  of raw FENs at fixed depth, records per-cell rewards.
- **Teacher telemetry tab** in diagnostics modal.
- **`__subit.teacherReport()`**, `__subit.teacherClear()`, `__subit.teacherSave()`.

### Changed

- **Three data levels** established:
  `grammarCells` (online weights), `telemetry v2` (raw Δeval),
  `teacher v3` (V_teacher).

---

## [1.8.3] — 2026-08-15

S₀ formalization.

### Added

- **S₀ = I × Z × Φ** classification:
  - `I ∈ {ATTACK, PRESSURE, DEFENCE, QUIET}`
  - `Z ∈ {KING, CENTER, QUEENSIDE, GLOBAL}`
  - `Φ ∈ {OPENING, MIDDLEGAME, TACTICAL, ENDGAME}`
- **`computeS(pos)`** — morphological classification.
- **Grammar cells** `G(S)` with weights over 6 eval components.
- **Morphism tracking** — `recordDirectMorphism`, `buildCompositions`.
- **Natural transformations** — `Π_I`, `Π_Z`, `Π_Φ` projections.
- **Regularization toward consensus** — `regularizeTowardConsensus`.

### Changed

- **`WHO_LIST` / `WHERE_LIST` / `WHEN_LIST`** renamed from `I` / `Z` / `Φ`
  internally for clarity. Public API uses `who`, `where`, `when`.

---

## [1.8.0] — 2026-08-01

Eval upgrade.

### Added

- **13-component evaluation** (was 6):
  - Original 6: `material`, `positional`, `mobility`, `king`, `pawns`, `bishop`.
  - Extended 7: `threats`, `kingAttack`, `rookFiles`, `outposts`, `trapped`,
    `space`, `tempo`.
- **`ORIGINAL_KEYS` / `EXTENDED_KEYS`** exported.
- **`setExpandedEval(on/off)`** toggle — 13 vs 6 components.

### Notes

- Reported +100..150 ELO improvement over v1.7 base. Not formally A/B'd.
- `componentsCache` with LRU eviction at 100k entries.

---

## [1.7.1] — 2026-07-20

Runtime stability.

### Added

- **Worker creation fallback** — if `new Worker()` fails (jsdom, CSP, old browsers),
  search runs on the main thread.
- **EP-guard** — en passant target is only set when a valid capture is possible.

### Fixed

- **Hash mismatch** on rare castling + en-passant sequences.
- **Stale search results** after rapid user interaction — handled via
  `currentSearchId` counter.

---

## [1.7.0] — 2026-07-10

Performance rewrite.

### Added

- **In-place `makeMove` / `unmakeMove`** — no position cloning per move.
- **Zobrist hashing** — 64-bit hash, incremental updates.
- **`kingPos` cache** — `{ w: [r, c], b: [r, c] }`.
- **Transposition table** — `Map<hash, {depth, score, flag, best}>` with 300k cap.
- **Killer moves**, **history heuristic**.
- **SEE-lite** for move ordering in captures.

### Changed

- **perft(4) = 197281** — validated.
- Hash consistency self-test on init.

### Removed

- **`clonePos` per move** — replaced by `makeMove` / `unmakeMove` pair.
  `clonePos` remains for game-tree snapshots (undo, FEN loading).

---

## [1.6.2] — 2026-06-25

Search tuning.

### Added

- **LMP-aware pruning** — late move pruning coordinatd with LMR to avoid
  double-pruning when the same move is both late and quiet.

### Changed

- **`lmrThreshold2 = lmrThreshold + 4`** — second tier of LMR reduction.

### Fixed

- **Double-pruning bug** where LMP would skip quiet moves that LMR would
  also reduce. Now they are mutually exclusive above LMP's `lmpLimit`.

---

## [1.5.0] — 2026-06-10

First ELO-competitive version.

### Added

- **Aspiration windows** at root — `±30 cp` initial window, re-search on fail.
- **Delta pruning** in quiescence — `DELTA_MARGIN = 200`.
- **Futility pruning** at depth 1 and 2 — margins 200 and 300.
- **Null-move pruning** — `R = 2` (or 3 for depth ≥ 6).
- **PST tables** for all piece types.
- **Bishop pair bonus** (`+30 cp`).
- **Center bonus** (`+5 cp` per piece on d4/e4/d5/e5).

### Notes

- Baseline for all subsequent Elo comparisons.

---

## [0.x] — pre-1.5

Development history. Not formally released. Key milestones:

- Move generator + legal move validation.
- Simple alpha-beta with fixed depth.
- Basic material + PST evaluation.
- UCI-like internal move representation.

---

## Legend

| Symbol | Meaning |
|---|---|
| **ADR NNNN** | Architecture Decision Record, see `docs/DECISIONS.md` |
| **PASS / MARGINAL / FAIL** | A/B verdict classes, see `docs/ROADMAP.md` |
| **ρ_s** | policy vector: `(d_base, lmr_mult, null_enabled, futility_mult)` |
| **signal cell** | cell with `n ≥ 20 && |t| ≥ 2` in teacher telemetry |

---

*End of CHANGELOG.md — latest: v1.9.1 (2026-09-26)*

