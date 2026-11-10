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
## [Unreleased]

### Notes
- Search configuration decision: pruned search (LMR, LMP, futility, null-move, extensions on) stays the default. Chosen for speed: at equal depth it uses about 3x fewer nodes at depth 4 and about 8x fewer at depth 5. Self-play strength is not established: depth 5 pruned vs depth 4 unpruned scored 64% in one run (32 games) and 48% in a replication (32 games); pooled 57% over 64 games, not significant.
- Test hooks `useTT`, `noPrune`, `benchTT`, `playMatch` stay opt-in and do not change default behaviour.

## [3.0.0-alpha.8] — 2026-11-10

### Added
- Ported SUBIT-CHESS v2.10.0 search primitives into the v3 engine: STTGET/STTPUT (TT, 512 entries at 0x3000), SORDER (TT move → promotions → captures → rest), SPV (PV buffer at 0x4000 + length 0x4100), SCHECKSTOP (node/time budget). Search ISA sub-ops 0x2B–0x2F; the CPU hook now receives MEM.
- Six v2.10 conformance checks (SCH_7–SCH_12): TT roundtrip, TT miss, SORDER, SPV, SCHECKSTOP, TT age invalidation. Search ISA suite is now 12 checks.
- Three CPU demos from v2.10: tt_demo, order_demo, pv_demo.

### Fixed
- PGN export works inside the artifact viewer via the `downloads` capability (saved as `.txt`, since `.pgn` is not on the allowlist); plain browsers keep the blob download.
- Search ISA log line now reports the real check count instead of a hard-coded 6.

### Notes
- TT and SORDER are primitives only; alpha-beta does not yet probe the TT (same as v2.10).
- v2.10 `SCH_3` expected SEVAL = 0 at the start position, but white to move adds the +10 tempo term; v3 keeps the corrected expectation (10).

## [3.0.0-alpha.7] — 2026-11-10

Spec basis: SUBIT-∞ v6.14.0 §2.1.

### Added

- `src/subit/splus.js`: S⁺ = S₀ × R_fin with the literal dynamics (s, ρ) ↦ (ρ(s), ρ)
  and classification via the §3.1 classifier. The spec gives no further structure
  for S⁺; nothing beyond this reading is implemented. `tests/splus.test.js` (4 checks).

---
## [3.0.0-alpha.6] — 2026-11-10

Spec basis: SUBIT-∞ v6.14.0 §3.1.

### Added

- `src/subit/trajectory.js`: trajectory classes FIXED (μ=0, λ=1), PERIODIC
  (μ=0, λ>1), TRANSIENT (μ>0) for a deterministic map on a finite state space,
  via Brent's cycle detection. Checked against brute-force simulation on 2000
  random 64-state maps and an invariant f^(μ+λ)(x) = f^μ(x) (6 checks).

### Not implemented

- §10.1 classes MIN_ZERO, MIN_POS, NONMIN_ZERO, NONMIN_POS: the spec does not
  state the entropy h_top or minimality tests formally. Left open until defined.

---
## [3.0.0-alpha.5] — 2026-11-10

Spec basis: SUBIT-∞ v6.14.0 (draft). Implements §1 and §0.1 only.

### Added

- `src/subit/s0.js`: S₀ = A₀³ ≅ {0,1}⁶ ≅ Z₄³ encoding (spec §1): T→0, B→1,
  F→2, N→3, bijection onto 64 states, Gray adjacency. `tests/s0.test.js`
  checks all 64 states exhaustively (7 checks).

### Changed

- Header badge `∞ v6.14.0-DRAFT` tooltip lists the §0.1 flag statuses as
  reported by the spec. Conformance (IMPLEMENTED) and reproducible build are
  marked not claimed: there is no Lean/Rust proof or conformant reference here.

### Not implemented (spec v6.14.0)

- §3/§10 trajectory classes beyond the v2.9 classifier, S⁺ = S₀ × R_fin rules,
  §8 Tree∞ and WARP geometry, §9 grafting, §11–§12 boundary spectral theory,
  §13 reconstruction. Each is a separate milestone.

---
## [3.0.0-alpha.2] — 2026-11-10

### Changed

- **Base switched to SUBIT-CHESS v2.9.0** (the user-supplied file). It already
  contains the dual-word 53-bit Zobrist key that alpha.1 implemented, so the
  alpha.1 hash patch is superseded and not carried forward.
- Version labels (`<title>`, header, PGN, `__subit.version`) read `3.0.0-alpha`.
- `tests/test.js` moved to `tests/legacy/test-v1.9-v2.2.js`: it targets the
  pre-v2.9 API and no longer runs. Replaced by `tests/engine-v3.test.js`.

### Fixed

- Console error at boot: `[Search ISA] ✗ FAILED`, shown in the header as
  `SEARCH: FAIL`. Two in-page expectations were wrong, not the engine:
  - `SCH_3`: SEVAL of the start position with White to move is +10 (side-to-move
    tempo term), not 0.
  - `SCH_6`: the test program issues one SEVAL, so the node counter is 1, not ≥2.
- Phone layout at 390 px: the v2.9 base renders the board, controls and bottom
  level selector without clipping (checked by measuring and by screenshot).

### Tests

- `tests/engine-v3.test.js`: 11 checks — boot without console errors,
  `searchConformance()`, perft(1..3) (perft(4) with `--full`), and the 53-bit
  key invariant (incremental == recompute on castling, en passant, promotion and
  random playouts; make/unmake restores).
- `tests/four.test.js`: 22 exhaustive FOUR checks (unchanged).

---
## [3.0.0-alpha.1] — 2026-11-10

First v3.0 milestone: foundation only. Full SUBIT-CHESS v3.0 (CPU-native search,
transaction gates, evidence registry, UI workbench) is **not** implemented yet.

### Added

- **53-bit position key** (`src/subit_chess_v3.0.0-alpha.html`): two independent
  Zobrist word tables. `ZOBRIST` (xorshift32, unchanged) and `ZOBRIST2`
  (murmur3 fmix32 of a counter). `pos.hashLo` / `pos.hashHi` hold the 32-bit
  words; `pos.hash = hashKey(lo, hi)` is the 53-bit key used by TT, repetition
  and component caches. New API: `chess.setHash(pos)`, `chess.hashKey(lo, hi)`.
- **FOUR logic module** `src/four/four.js`: encode/decode, NOT, AND, OR, SJOIN,
  SMEET, BXOR, NAND, NOR; bit-parallel FOUR_WORD ops; FILL; EQ; knowledge and
  truth orders; five-gate masks.
- **Tests**: `tests/four.test.js` (22 checks, exhaustive over 4 values and all
  65 536 words); `hash53` group in `tests/test.js` (incremental == full recompute
  on castling, en passant, promotion and random playouts; make/unmake restore).

### Fixed

- **Hash collisions.** The 32-bit Zobrist key collided in practice: 19 true
  collisions among ~399 000 distinct random positions (birthday bound ≈ 18.6).
  The 53-bit key: 0 true collisions in 400 000 samples (399 090 distinct),
  1 797 965 incremental-vs-recompute checks with 0 failures. The two runs used
  different random generators, so the comparison is at equal scale, not
  identical samples.

### Changed

- `classifyTrajectory([])` and `classifyTrajectory([1,2,3])` now return
  `UNRESOLVED`. This is the v2.3.0 behaviour; the two stale test expectations
  (which assumed the old silent `FIXED`) were updated. Needs owner confirmation.

### Notes

- `SUBIT-CPU` spec gate masks: the example `T,T,T,B,T = 0x02EA` implies gate *i*
  at bits 2i+1:2i (gate 0 least significant). The spec does not state this; it
  is pinned in `tests/four.test.js`.
- `CMP` is not implemented: the spec leaves its comparison policy undefined.

---
## [Unreleased]

Nothing scheduled.

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

