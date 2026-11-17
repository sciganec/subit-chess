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


## [Unreleased] — 3.0.9 (measured at 100-300 ms/move; 60 games each, harness noise ~ +-6.5 pp)

### Added
- **Adaptive search budget, SEARCH-15 (`src/engine/budget.mjs`; docs/theory 40 §11-13, 05 §17.1).** After each
  completed iteration the engine checks root-move change, bound type, score drift and the gap to the
  runner-up; a stable, clear decision stops early and banks the time, an unstable one may spend up to a
  hard cap (<=3x nominal). Mean time per move stays nominal. Default ON for clock/`timeMs` search; UCI
  `movetime` and `fixedTime` stay exact. Measured vs base at equal 100 ms/move, 120 games: 63-20-37,
  +76 Elo [+20,+137], z=2.67, time ratio 1.02. Tests: `tests/engine.budget.mjs` (29 checks).

### Fixed
- **Futility pruning sign (search.mjs).** The frontier test ran after `makeMove` but compared the
  opponent-relative static score with `alpha`, pruning the best quiet moves (since v3.0.6 §4.4).
  `nofut` beat `base` 51-3-6 (+338 Elo); with the fix `base` vs Stockfish@1500 rose 60.0% -> 77.5%
  (paired +17.5 pp, z=2.36). Predicate extracted as `Searcher.futile()`; regression test eval §13.
- **Hidden depth-8 cap under a clock/node limit (index.mjs).** `search({timeMs})` defaulted to depth 8.
  Uncapped vs capped at 300 ms: 41-11-8, +215 Elo [+134,+325].

### Changed
- `planOrdering` option (default **false**): plans are still generated for display, but no longer order
  moves. Same move at depth 6 with 1.3-6.4x fewer nodes; in play +29 Elo [-51,+113] (not significant).
- Removed the dead `contextBonus` closure (always 0).

### Added
- `bench/uci.mjs` (UCI front-end, `Config` option) and `bench/anchor.py` (Stockfish UCI_Elo ladder).
- `match.mjs`: `nofut`, `planord` configs; `name@N` now also pins a depth cap next to `--time`.

### Notes
- `noctx` is bit-identical to `base` in search (same moves and nodes): the context layer has no effect on play.
  A 60-game `base` vs `noctx` match gave 38.3% and `base` vs `base` gave 47.5%: that spread is pure noise.
- Gate 3 after the futility fix (base score): vs plain 38.3%, noctx 38.3%, noplans 42.5%, nostruct 48.3%.
  Not evidence that the layers help; the plan-ordering node cost is the only deterministic effect found.
- Stockfish UCI_Elo is calibrated at ~60 s/game, so absolute Elo at 100 ms is indicative only.

## [Unreleased]

Strength and measurement items for the v3 engine (measured, not cosmetic):

- **Scale the ablation harness.** At 8-20 games the 95% CI is ±13-34 pp, which
  cannot resolve effects below ~100 Elo. Target n >= 100 games per configuration
  at depth 4-5 before accepting or rejecting `plain`, `eval0`, `noasp`.
- **Spec compliance debt:** `contextAdjust` no-op (doc 05 §context), `structure`
  gaps, `verify` coverage, `meta` thresholds (docs 31/32/33/36).
- **Search hygiene:** dead `contextBonus` in `index.mjs` (always returns 0),
  `Score.diff` never set.

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

