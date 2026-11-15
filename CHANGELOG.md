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

## [Unreleased]

Strength and measurement items for the v3 engine (measured, not cosmetic):

- **Scale the ablation harness.** At 8-20 games the 95% CI is ±13-34 pp, which
  cannot resolve effects below ~100 Elo. Target n >= 100 games per configuration
  at depth 4-5 before accepting or rejecting `plain`, `eval0`, `noasp`.
- **Spec compliance debt:** plan feasibility and `pareto()` (doc 11), no-op
  `contextAdjust` (doc 05 §context), `structure` gaps, `verify` coverage,
  `meta` thresholds (docs 31/32/33/36).
- **Search hygiene:** TT aging (entries are never evicted), dead `contextBonus`
  in `index.mjs` (always returns 0), `Score.diff` never set.

### Added

- `bench/match.mjs`: length distribution in the summary (mean / median / max /
  `capped` / termination reasons) and a `--variety` knob that shuffles the
  opening order deterministically from `--seed`, so two runs do not share the
  same opening sequence.
- Measured baseline for Gate 1: `base` vs `plain`, 6 games, depth 3, seed 5,
  `--variety` -> mean 190 plies, median 212.5, 1/6 games at the 300-ply cap,
  reasons `checkmate: 5, max plies: 1`.

### Changed

- `docs/ROADMAP.md`: the hazard list and Gate 1 now describe what the harness
  actually does (12 fixed openings, colour-alternated, `status()` checked after
  every move, so the cap is not what contaminates the numbers). Gate 1 is
  re-scoped to breadth plus a reported length distribution. The debt list no
  longer claims `unmakeNullMove` increments `stm` — it restores `turn` from the
  undo record.

---
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

