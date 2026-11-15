# Architecture Decisions & Methodology

Consolidated ADR log + methodology notes for **subit-chess v3.0.1**.

Format: `ADR NNNN — Title`. Statuses: `Accepted` / `Superseded` / `Informational`.
Methodology sections are non-decision references (data flow, gates, glossary).

Scope note: ADR 0001-0008 describe the v1.9.x subsystem (S₀ grammar, ρ_s policy vector,
teacher pipeline, diffusion generation). That subsystem was removed in v3 — see ADR 0013.
ADR 0009+ describe v3.0.1 and are the binding decisions for the current engine.

---

## ADR 0001 — S₀ = I × Z × Φ, coarsened from 64 to 48 cells

**Status:** Accepted (v1.9.0)

### Context
The original S₀ grid was **4 × 4 × 4 = 64** cells. The `WHERE` axis had four
values: `KING`, `CENTER`, `QUEENSIDE`, `GLOBAL`. Empirical analysis of the
48-cell run (and predecessor 64-cell runs) showed:

- `QUEENSIDE` and `GLOBAL` overlapped heavily with `CENTER` in practice.
- Signal rate did not improve when the grid was richer.
- 64-cell telemetry was noisier per cell (fewer samples per cell).

### Decision
Drop `QUEENSIDE`. Keep three `WHERE` values: `KING`, `CENTER`, `GLOBAL`.
S₀ = 4 × 3 × 4 = **48 cells**.

### Consequences
- Fewer cells, more samples per cell, simpler grammar.
- Same signal rate (~18–22%) as 64-cell — coarsening did not raise rate.
- Reported `visitedShare` switched from `/64` to `/48` (see ADR 0004).

---

## ADR 0002 — ρ_s on 8 signal cells

**Status:** Superseded by ADR 0013 (v3.0.0) — accepted for v1.9.0/v1.9.1

### Context
From the 48-cell teacher run (6548 unique FENs), exactly **8 cells** reached
`n ≥ 20 && |t| ≥ 2`:

| Cell | n |
|---|---:|
| `QUIET\|CENTER\|OPENING` | 1370 |
| `QUIET\|CENTER\|MIDDLEGAME` | 871 |
| `QUIET\|GLOBAL\|MIDDLEGAME` | 727 |
| `PRESSURE\|CENTER\|OPENING` | 510 |
| `DEFENCE\|CENTER\|TACTICAL` | 194 |
| `QUIET\|CENTER\|TACTICAL` | 128 |
| `QUIET\|GLOBAL\|OPENING` | 86 |
| `QUIET\|CENTER\|ENDGAME` | 43 |

Sum n = **3929**; total transitions = **6548**; coverage = **3929 / 6548 = 60.0%**.

Alternative paths considered:
- **32-cell coarsening.** Extrapolation: ~30 visited cells, ~6 signal. Gate 15
  requires 50% rate — 2.5× above the observed 22% maximum. **Rejected.**
- **KING → CENTER merge.** Math shows t drops from 2.61 → 1.92 because KING
  features have high variance and opposite-signed means. **Rejected.**
- **22-cell mode.** 22 × 4 = 88 params → 6548/88 = 74.4 samples/param. Worse
  regime than 8-cell.

### Decision
Ship ρ_s on **8 active cells**. All other 40 cells use `BASELINE_POLICY`:

```
BASELINE_POLICY = { d_base: 0, lmr_mult: 0, null_enabled: true, futility_mult: 0 }
```

### Consequences
- 32 declared params (8 × 4 dims). Samples/param = **6548 / 32 = 204.6**.
- 48 effective params in search (see ADR 0005). Samples/param = **6548 / 48 = 136.4**.
- Still better than 22-cell (74.4) and 4× better than 64-cell per cell.
- ρ_s is the first mechanism in this project where **search rule** (not just
  eval weights) depends on morphological context.

---

## ADR 0003 — KING→CENTER collapse: do not merge

**Status:** Informational (v1.9.1)

### Observation
Two KING cells crossed the `n ≥ 20` threshold:

- `QUIET|KING|TACTICAL`:    n=36, mean≈−26, std≈246, t≈0.6
- `DEFENCE|KING|TACTICAL`:  n=33, mean≈+56, std≈290, t≈1.1

CENTER cells have std ≈ 100–120.

### Merge math
Take `DEFENCE|CENTER|TACTICAL` (n=194, mean=−51.4, var=74999, std≈274) and
merge with `DEFENCE|KING|TACTICAL` (n=33, mean=+56, std=290):

```
n_new     = 227
mean_new  = (194·(−51.4) + 33·56) / 227 = −35.8
var_new  ≈ (194·77641 + 33·87236) / 227 ≈ 78800   →  std ≈ 281
t_old     = |−51.4|·√194 / 274 = 2.61
t_new     = 35.8·√227 / 281   = 1.92
```

t drops from **2.61 → 1.92**. Signal is lost.

### Conclusion
`KING` 0% is not "sparse" — it is a **feature without directional information
but with real variance**. Merging it into `CENTER` poisons the t-statistic.
**Do not merge.**

---

## ADR 0004 — visitedShare = cells.length / 48

**Status:** Accepted (v1.9.1)

### Bug
`makeTelemetryModule` referenced `WHO_LIST` from a scope where it was
`undefined`:

```js
visitedShare: cells.length / (typeof WHO_LIST !== 'undefined'
              ? WHO_LIST.length * WHERE_LIST.length * WHEN_LIST.length
              : 48)
```

For 48 cells this accidentally produced the right denominator. For any other
grid size it would silently report `41/48` instead of `41/32`, etc.

### Fix
Use the subit module's actual lists:

```js
var cellCount = subit.WHO_LIST.length * subit.WHERE_LIST.length * subit.WHEN_LIST.length;
visitedShare = cells.length / cellCount;
signalShare  = signalCells.length / cellCount;
```

Both `makeTelemetryModule` and `makeTeacherTelemetryModule` now use `cellCount`.

### Consequences
- All telemetry reports carry `cellCount: 48`.
- `signalShare` and `visitedShare` are grid-size independent.

---

## ADR 0005 — ρ_s: 6 effective dims, not 4 (pre-registration drift, documented)

**Status:** Superseded by ADR 0013 (v3.0.0) — accepted for v1.9.1

### Context
The original pre-registration (`.txt` v1.9 plan) declared ρ_s as **4 dims**:

```
ρ_s = (d_base, lmr_mult, null_enabled, futility_mult)
       int       int       bool          int
```

In v1.9.1 the search integration uses **6 effective dims** per active cell:

```
ρ_s = (d_base, lmr_mult, null_enabled, nullR, futility_mult, futMargin)
       int       int       bool          int    int            int
```

Reason: `null_enabled` alone cannot express "disable null move" vs "enable
with R=3". Similarly `futility_mult ∈ [−1,+1]` loses the absolute cp scale.
To use the full teacher-derived range, the search receives:

- `policyNullR` — integer 1..3 (from `r_null = 2 − 0.2·norm`, then rounded)
- `policyFutMargin` — integer 80..250 cp (from `b_futility = 150 + 30·norm`)

and `alphaBeta` uses these directly, replacing its hardcoded `R = 2|3` and
`FUTILITY_MARGIN = 200|300`.

### Decision
Keep 6 effective dims. Document the drift explicitly. Do **not** revert to 4
dims mid-flight — that would invalidate teacher-derived values already computed
for v1.9.1.

### Consequences
- 48 effective params → 6548/48 = **136.4 samples/param** (vs. planned 204.6).
- Still better than 22-cell (74.4).
- Pre-registration gate stays the same: `Δmean reward > +15 cp` on 8 active cells.
- Future v1.9.2 may or may not collapse dims — decision deferred until A/B.

---

## ADR 0006 — ρ_s is frozen before A/B; auto-init is a known hazard

**Status:** Superseded by ADR 0013 (v3.0.0) — accepted for v1.9.1

### Context
During early testing, `initRhoSFromTeacher()` was called automatically in
`init()` whenever stored teacher telemetry had ≥8 signal cells:

```js
if (initTeacherRep.signalCells >= 8){
  subitState.initRhoSFromTeacher(initTeacherRep.allCells);
}
```

This produced a real hazard: **A/B contamination**. If a user ran
`__subit.setPolicyEnabled(false)` thinking they were in baseline, ρ_s was
still installed but suppressed. Subsequent runs could silently include
residual ρ_s state (morphisms, visited objects) or, if policy was re-enabled,
resurrect an old ρ_s from a noisy run.

### Decision
Keep auto-init, but make the hazard explicit:

1. README "Honest limitations" documents the auto-init.
2. `__subit.rhoSReport()` prints when ρ_s is active.
3. Users running A/B are advised to clear teacher telemetry first:

   ```js
   __subit.teacherClear();
   __subit.telemetryClear();
   __subit.setPolicyEnabled(false);   // for baseline
   ```

### Consequences
- Baseline A/B is achievable, but not "silent" — it requires one explicit call.
- Alternative (remove auto-init) deferred to v1.9.2. Trade-off: fewer footguns
  vs. more clicks for the common case (single user, single run).
- `rhoSFrozen = true` after init; no online update during A/B.

---

## ADR 0007 — Explicit policy passing through Worker boundary

**Status:** Superseded by ADR 0013 (v3.0.0) — accepted for v1.9.1

### Context
Early v1.9 drafts passed ρ_s through `window.__rhoSModule` (a global). This
broke in Web Workers: the worker script is rebuilt from
`makeChessModule.toString()` etc., and has no access to the main thread's
`window`.

### Decision
Pass every ρ_s-derived search parameter **explicitly** through the message
boundary:

```
engineMove()
  → subitState.searchParamsFor(pos)
  → searchAsync({ policyLmrMult, policyNullEnable, policyFutility,
                  policyNullR, policyFutMargin, ... })
  → worker.postMessage({ same fields, ... })
  → __search.createSearch(weights, { same fields, ... })
  → alphaBeta uses policyNullEnable / policyNullR / policyFutMargin
```

No globals. No hidden state.

### Consequences
- Same code path in main-thread fallback and Worker.
- Each search is fully specified by `(weights, opts)` — reproducible.
- `createSearch` returns `getPolicy()` so callers can verify what was used.
- `statusExtra` in `engineMove` prints `ρ(d,L,N,F)` for observability.

---

## ADR 0008 — Honest statistics for A/B

**Status:** Accepted (v1.9.1)

### Context
Early plans used "200 games → Elo → PASS/FAIL" with a +15 Elo gate. That is
**statistically dishonest**:

- 200 games → SE ≈ **27 Elo** on the score→Elo transform.
- A `+15` observed difference is `< 1σ`. Noise.
- Elo is a derived quantity; the primary observable is **reward per transition**.

### Decision
Use **pre-registered reward-based gate**, from the original v1.9 plan:

**Metric:** `Δmean reward per transition` on the 8 active cells.

| Condition | Action |
|---|---|
| `Δmean > +15 cp` | PASS — extend to 400+ games with 95% CI |
| `Δmean ∈ [−5, +15] cp` | MARGINAL — more games needed |
| `Δmean < −5 cp` | FAIL — ρ_s harmful, tune or roll back |

For the follow-up 400-game run, apply **95% CI on score** or **SPRT**
(H0: Elo=0, H1: Elo=15, α=0.05, β=0.10).

### Consequences
- `runners/run.js --mode match --baseline <file>` computes `Δmean` and prints
  the verdict directly.
- 200 games is *screening only*. README says so.
- 400 games is the minimum for a confident decision.

---

# Methodology

## Three data levels

| Level | What it stores | Writer | Storage |
|---|---|---|---|
| `grammarCells` | 48 cells × weights + ρ + visits | `recordMove` (online) | `subit-grammar-v4` |
| `telemetry v2` | Δeval per cell | `recordTelemetryForMove` | `subit-telemetry-v2` |
| `teacher v3` | `V_teacher` per cell + raw trajectory | `batchTeacherEval` | `subit-telemetry-teacher-v1` |
| `rhoSMap` | ρ_s per active cell (frozen) | `initRhoSFromTeacher` | in-memory only |

`MAX_RAW = 15000` on teacher telemetry. `droppedRaw` counts evictions.

## Teacher run workflow

```
Phase 0 — rehearsal (20 games)
    __subit.teacherClear(); __subit.telemetryClear();
    __subit.resetGrammarToBaseline();
    await __subit.selfPlay(20, { depth: 2, maxPlies: 100, epsilon: 0.2, topK: 3 });
    await __subit.batchTeacherEval({ depth: 4, R_max: 300, concurrency: 2 });
    __subit.teacherReport();
    // Check: droppedRaw === 0, uniqueRatio in [0.30, 0.70]

Phase 1 — run1 (100 games)
    Same as Phase 0 with games=100, then:
    __subit.saveTeacherSnapshot('run1');

Phase 2 — run2 (independent)
    __subit.resetGrammarToBaseline();  // <- key
    ... repeat, saveTeacherSnapshot('run2');

Phase 3 — cross-run stability
    __subit.compareTeacherSnapshots('run1', 'run2');
```

### Gate to close Step C (teacher stable)

| Metric | Threshold |
|---|---|
| `droppedRaw` on both runs | 0 |
| `signalCells` per run | ≥ 8 |
| `Jaccard(signalCells_run1, signalCells_run2)` | ≥ 0.6 |
| `visitedCells` | 30–44 / 48 |
| `top5Share` | ≤ 0.60 |
| `entropy H` | 3.5–4.5 bits |

## ρ_s init formula

From teacher report per active cell with `mean` in cp:

```
norm        = clamp(mean / 100, −1.5, +1.5)
d_base      = clamp(2 + 0.5 · norm,  1,   4)
r_LMR       = clamp(2 − 0.4 · norm,  1,   3)
r_null      = clamp(2 − 0.2 · norm,  1,   3)
b_futility  = clamp(150 + 30 · norm, 80, 250)
```

Mapping to search (`policyFor`):

```
d_base_shift   = round(d_base) − 2
lmr_mult       = round(2 − r_LMR)
null_enabled   = r_null >= 1.5
nullR          = round(r_null)
futility_mult  = round((b_futility − 150) / 50)
futMargin      = round(b_futility)
```

`d_base_shift` is added to the base depth at root. `lmr_mult` shifts the LMR
threshold. `null_enabled` gates null-move search. `nullR` sets the R value.
`futMargin` sets `FUTILITY_MARGIN_D1` (D2 = 1.5 × D1). `futility_mult` adds
a secondary shift of ±100 cp on top.

## A/B command reference

```bash
# Baseline (400 games, policy off)
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy off --out results/base.json

# ρ_s (400 games, policy on, A/B against baseline)
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy on --out results/rho.json --baseline results/base.json
```

Output includes `activeCellsStats.weightedMean`, `activeCellsStats.signalCells`,
and (with `--baseline`) a `comparison.verdict` line.

## Glossary

| Term | Meaning |
|---|---|
| **S₀** | Morphological state = `(I, Z, Φ)` = `(who, where, when)`. 48 cells. |
| **Ω(search)** | Search stability class: STABLE / METASTABLE / CYCLIC / CHAOTIC. |
| **ρ_s** | Policy vector per active cell: `(d_base, r_LMR, r_null, b_futility)`. |
| **G(S)** | Grammar: per-cell weights over 6 eval components. |
| **f_S** | Grammar-weighted eval: `Σ w_k · c_k` over 6 original components. |
| **Belnap** | Four-valued evaluation: `{T, F, B, N}`. |
| **signal cell** | Cell with `n ≥ 20 && |t| ≥ 2` in teacher telemetry. |
| **frozen** | ρ_s set once from teacher means, never updated during A/B. |
| **sham mode** | `omegaMode: 'sham'` — disables Ω→search coupling. |
| **residual ρ** | Per-cell metastability label driven by game dynamics. |

## Non-goals (explicitly out of scope)

- **NNUE / WASM / GPU.** Different research path.
- **Online learning of ρ_s.** Deferred to v1.9.2+.
- **32-cell coarsening.** Rejected by data (ADR 0002).
- **KING → CENTER merge.** Rejected by math (ADR 0003).
- **Elo-based gate.** Replaced by reward-based gate (ADR 0008).
- **Global state for ρ_s.** Forbidden by ADR 0007.

---

## ADR 0009 — Evaluation perspective is mover-relative in both tiers

**Status:** Accepted (v3.0.0)

### Context

v3.0.0 shipped two evaluation tiers that disagreed on a basic contract:

- `evaluateFast()` returned a **white-positive** score, while the negamax consumes
  **side-to-move-relative** values.
- `Evaluation.structural()` negated an already mover-relative vector a second time.

Consequence: every node where Black was to move was scored with the wrong sign, so the
search maximised the opponent's advantage on odd plies. This is not a tuning issue; it is
a sign error that makes the search's own output meaningless on half the tree.

### Decision

1. Both tiers return **mover-relative** centipawns. `evaluateFast()` multiplies by
   `stm = (pos.turn === WHITE ? 1 : -1)` before clamping; `structural()` returns the vector
   from the side to move and exposes the white-positive value separately as `white`.
2. The documented invariant is `SVF-INV-001`: for a mover-relative evaluation, mirroring the
   position (colours swapped) must give **equality**, not negation. White-relative values
   negate. This is now a test, not a comment.
3. Any new evaluation term must be written mover-relative at the point of use, never
   "fixed later" by a negation at the call site.

### Consequences

- Measured: **12-0** against the pre-fix modules at depth 3/4 (before the fix the second
  player won every game).
- The single largest playing-strength change in v3, and it is a correctness fix.
- `tests/engine.eval.mjs` locks the contract (both tiers, both colours, both directions).

---

## ADR 0010 — Plan bonus is bounded to the structural level

**Status:** Accepted (v3.0.0)

### Context

`makePlanOrderer()` added `100 + score` to the structural ordering level, where
`w.struct = 200000` and `pv = 1e6`. The resulting bonus (~2.2e7) exceeded the PV level, so
a quiet plan move outranked a capture at every node. The same root-side map was also
applied to the opponent's replies, so the opponent's moves were ordered from the wrong side.

### Decision

- The plan bonus is normalised into `[0, 1]` and added **only** to the structural level,
  below tactics (doc 05 §11.2, doc 11).
- The orderer is constructed per search with `rootTurn` and orders non-root nodes from the
  opponent's perspective; root nodes from `rootTurn`.
- The documented level order `pv > tt > tactic > struct > context > history` is enforced by
  test: a capture must outrank any plan move at every level.

### Consequences

- Plan hints still surface in move ordering and in the UI, but can never hijack the search.
- History is normalised into `[0, 0.6·w.history]` for the same reason (raw counters were
  exceeding `tactic`).

---

## ADR 0011 — Draw semantics: claimable inside search, automatic in the game

**Status:** Accepted (v3.0.0)

### Context

Two different rules were conflated. Inside the search, a draw claim is a *choice*: a side
that is worse can claim, a side that is better would not. Scoring a claimable draw as 0 for
both sides let a better side shuffle into a threefold repetition and hand back half a point.
In the game, 75 moves and fivefold repetition are automatic and end the game.

### Decision

- Inside `Searcher`: 50-move rule (FIDE 9.3) and threefold repetition (9.2) score **0 for
  both sides** — the opponent can claim, so the position is not a win for the side to move.
- 75-move rule (9.6.2) and fivefold repetition (9.6.1) are automatic draws and end the
  search line.
- `Position.status()` keeps the distinction for the game: claimable draws are reported as
  claimable, automatic draws as final.

### Consequences

- A winning side can no longer "give back" half a point by repeating.
- The UI status distinguishes claimable from automatic draws (user manual §5).

---

## ADR 0012 — Single-file artifact is produced by a bundler from ES modules

**Status:** Accepted (v3.0.0)

### Context

v1/v2 kept the whole engine inline in one HTML file, which made the code unreadable and
untestable. v3 needs modules, tests and a bundler, but the shipped artifact must stay a
single offline HTML file (no server, no CDN, no network).

### Decision

- Source of truth: `src/engine/*.mjs` (12 modules) + `build/shell.html` (UI).
- `build/bundle.mjs` walks the import graph from `src/engine/index.mjs`, inlines every
  module into the shell's `<script>` block, and writes both
  `src/subit_chess_v3.0.1.html` and `index.html`.
- The build is deterministic: same input → byte-identical output, and the two artifacts
  always match.
- No user-facing build step: the repository ships the built file.

### Consequences

- Tests run against the modules (`npm run test:engine`), the UI is tested against the
  bundled file with jsdom (`npm run test:app`).
- A stale artifact is possible in principle; CI runs `npm run build` and fails on a diff.

---

## ADR 0013 — v3 removes ρ_s, teacher pipeline, diffusion generator, telemetry

**Status:** Accepted (v3.0.0) — supersedes ADR 0002, 0005, 0006, 0007

### Context

The v1.9.x-2.2.0 research line (S₀ grammar weights, ρ_s policy vector, teacher snapshots,
diffusion study generator, telemetry panels) was never validated for playing strength, and
the ρ_s A/B gate from the v1.9.1 roadmap was never answered. Carrying those subsystems into
v3 would mean maintaining code whose purpose (strength) was unproven, while the engine core
had correctness defects that mattered far more.

### Decision

- v3 ships the engine core: percept, structure, context, evaluation (fast + SVF),
  plans, search, meta, memory, verification.
- Removed: ρ_s policy vector and its auto-init, grammar weight mutation, teacher run and
  snapshots, telemetry, diffusion study generator, Belnap/morphism panels, engine-vs-engine
  comparison panel.
- `runners/run.js` (jsdom, v1.9.1 protocol) is kept only so `npm run test:legacy` still
  runs; it is not part of the v3 pipeline.
- Strength claims are made only through `bench/match.mjs` (ADR 0014).

### Consequences

- ADR 0002/0005/0006/0007 are marked Superseded; their context is preserved for provenance.
- The UI loses panels; the manual and README describe only what exists.
- The v1.9.x roadmap gates are void; `docs/ROADMAP.md` was rewritten around v3 gates.

---

## ADR 0014 — Strength is measured by a native ablation harness, not by vibes

**Status:** Accepted (v3.0.0)

### Context

v1/v2 measured strength with browser self-play telemetry (reward per transition, jsdom
runner). Those numbers were not comparable across configurations, and the engine's own
evaluation was both player and referee.

### Decision

- `bench/match.mjs` is the only accepted instrument: deterministic self-play from a fixed
  opening set, named configurations, per-side depth (`base@6` vs `base@4`), W-D-L, score
  with a 95% confidence interval, JSON export.
- Every strength claim in `readme.md` / `CHANGELOG.md` cites a configuration pair and a
  sample size.
- Configurations are ablations of one switch each (`nostruct`, `noplans`, `noctx`, `eval0`,
  `nopruning`, `nolmr`, `nonull`, `noasp`, …) so a result is attributable.
- A result is not accepted until the 95% CI excludes 0.5 (or the sample size is declared
  insufficient, as with the depth-5-vs-4 measurement at n=12).

### Consequences

- Honest but slow: 100+ games per configuration is the entry price for any claim.
- Self-play remains the only oracle; external validation (EPD with `bm`, a sparring engine)
  is Gate 5 in `docs/ROADMAP.md`, not yet done.
- The known blind spot: the engine cannot be shown to be *strong*, only to be *not worse*
  than its own ablations.

---

## ADR 0015 — Futility belongs to the frontier, not to the last ply

**Status:** Accepted (v3.0.1)

### Context

Futility pruning discarded quiet moves that could not raise alpha even at `depth <= 3`. Two
defects followed from running it inside the tree rather than only at the frontier:

1. **A pruned node looked like a draw.** `negamax` computed `legal === 0` after futility
   had already skipped every quiet move, so a node where all moves were pruned returned `0`
   (stalemate). A forced mate hidden behind such a node was scored as a draw-ish `0` in the
   node and propagated as an ordinary evaluation. In the SUBIT-CHESS v3.0.0 vs SmallFish
   game (after 45.Nc6, `2k5/3R4/p1N1K1p1/P1p5/7p/1p5P/8/8 b - - 1 45`) black is mated in 2
   (`45...b2 46.Kd6 g5 47.Rc7#`), yet the depth-8 root search published `-471.75 cp`.
2. **A fail-low was published as a score.** The root aspiration loop widened by a fixed
   step and accepted the fail-low bound as the iteration's value, so a mate that lay outside
   the aspiration window reached the UI as a normal evaluation.

### Decision

- Futility pruning is restricted to the frontier: `futility.maxDepth: 1` in
  `src/engine/evaluate.mjs`. Nodes above the frontier search all moves, so mate and stalemate
  detection can never be hidden by a heuristic cut.
- A node where every move was pruned returns `evaluate(pos, depth)` — a static evaluation of
  a position that is *not* known to be terminal — never `0`.
- `negamaxRoot` returns its bound flag (`TT_EXACT` / `TT_LOWER` / `TT_UPPER`) together with
  the store flag. The aspiration loop widens once and then re-searches with an open window;
  a bound is never published as a score (SEARCH-INV-002, `docs/theory/05`).
- The regression lives in `tests/engine.eval.mjs`: mate not hidden, negative mate from the
  mated side, `Kd6` forces mate, `Rc7#` is the mating move.

### Consequences

- Tactical middlegames cost more nodes: Kiwipete depth 7 goes from 965k / 5.5 s to 2.1M /
  10.5 s. Depth is therefore capped by the clock on UI level 5, not by the horizon.
- Silent-mate detection is restored; the engine can no longer "miss" a forced mate because a
  heuristic pruned the mating side's replies.
- LMR and null-move pruning are unchanged: they are depth-dependent reductions, not cutoffs,
  and they re-search on a rise in alpha.

---

*End of DECISIONS.md — v3.0.1*
