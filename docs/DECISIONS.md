# Architecture Decisions & Methodology

Consolidated ADR log + methodology notes for **subit-chess v3.0.11**.

Format: `ADR NNNN — Title`. Statuses: `Accepted` / `Superseded` / `Informational`.
Methodology sections are non-decision references (data flow, gates, glossary).

Scope note: ADR 0001-0008 describe the v1.9.x subsystem (S₀ grammar, ρ_s policy vector,
teacher pipeline, diffusion generation). That subsystem was removed in v3 — see ADR 0013.
ADR 0009+ describe the v3 engine and are the binding decisions for the current release.
AUD-07…AUD-09 were closed in v3.0.10 (`be27fe4`); see `ver/subit_chess_v3.0.10/RELEASE.md`.
The new theory documents in `docs/theory/81-99/`, `article_04.md` and `article_05.md` are
**research-only and non-binding** in v3.0.11. They do not create ADR obligations, conformance
claims or search/rule changes.

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

- Source of truth: `src/engine/*.mjs` (15 modules) + `build/shell.html` (UI).
- `build/bundle.mjs` walks the import graph from `src/engine/index.mjs`, inlines every
  module into the shell's `<script>` block, and writes both the versioned HTML named
  in `package.json` and `index.html`.
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

## ADR 0016 — the game position owns its repetition history

**Status:** Accepted (v3.0.3)

### Context

`Position.setFEN()` rebuilds a position and clears `rep`/`repLimit`, which is right for
loading a position. `Engine.play()` also went through it — it cloned the position, made the
move, then called `setFEN(this.fen)` to refresh the derived state. The result: after the
first move of every real game the repetition stack was empty. Threefold/fivefold could only
be seen inside one search, never across moves, so the engine shuffled in equal positions and
`status()` could never end a game by repetition.

Two related defects surfaced in the same audit: repetitions were matched on `hashLo` alone
(32 bits, so a collision could end a won game as a draw), and `Engine.search()` handed the
node budget to `setLimits()` and then dropped it when calling `searcher.search()`, which
re-reads its limits from its own options.

### Decision

- `Engine.play()` records the position it leaves (`pushRep()`) and carries `rep`, `repHi`
  and `repLimit` across the `setFEN()` refresh. The stack is part of the game state, not of
  the parser.
- A repetition requires both 32-bit halves of the Zobrist key to match.
- Limits travel with the call: `searcher.search(pos, { depth, timeMs, nodes })`. A budget
  that is not accepted is a budget that does not exist.
- The evaluation tier is chosen once: by the meta-controller when it runs, otherwise by the
  caller (`Engine.setEvalMode()`, the UI selector). A per-search default must not overwrite
  an explicit choice.
- Regression tests in `tests/engine.eval.mjs`: fivefold after four knight cycles, and
  `search({ depth: 8, nodes: 1 })` honouring one node.

### Consequences

- Real games now end correctly by fivefold repetition and the engine can steer towards or
  away from a repetition.
- *(post-v3.0.10 note)* Any observer instance in a match must adopt the same history: copying
  the FEN alone is a new position, not the same game. Gate 1 found `bench/match.mjs` calling
  bare `setFEN()` after each move, which wiped the stack `play()` had preserved; it now
  copies `rep`/`repHi`/`repLimit` too. No rule or search semantics changed — `status()`
  remains the rule authority.
- The stack grows with the game length; it is capped only by the 75-move/fivefold rules,
  which is bounded in practice.
- No measured strength claim: repetition awareness removes shuffling, it does not add tactics.

---

---

## ADR 0017 — transposition entries age out, and the top level searches 10 ply

### Context

A game report ("the engine got weaker") turned into a measurement. Two findings:

1. The TT carried a per-entry `generation` but `probe()` never read it, so a bound
   written under one move order was reused by later searches. Same position, same depth,
   different move: after 11...O-O a cold `d12` search reported Kxf1 +81.0, while a search
   preceded by `d6/d8/d10` reported Nf5 +113.2.
2. The strongest UI level asked for `depth: 8`. On the position after 11...O-O the move is
   stable (Kxf1 at every depth) but the score is not: 0.0 at d8, +12.0 at d10, +135.0 at
   d11, +81.0 at d12. At playing depth the engine reported equality where it is winning.

The version was not the cause: v3.0.0 and v3.0.3 return identical moves and scores
(Kxf1 0.0 / 12.0 / 81.0) on that position.

### Decision

- `TT_MAX_AGE = 1`: an entry older than one search generation is not probed. The cost is
  2% more nodes on a 22-ply line at 600 ms/move (2.29M vs 2.24M) and no loss of reached
  depth (150 vs 149 cold, 159 vs 159 warm); the benefit is that the same position no
  longer depends on what was searched before it.
- Level 5 searches `depth: 10` with a 6 s clock. Depth is the hard limit, the clock is the
  safety net; measured d10 in 3.0 s (initial), d9 in 4.0 s and d10 in 5.8 s (critical).
- The level label reports the searched depth, not the level number.

### Consequences

- Reproducible play: identical position and depth now give the identical move, which also
  makes regression tests meaningful.
- The top level can block the main thread for up to 6 s in the fallback path; the Web
  Worker shipped in v3.0.8 (ADR 0021), so the normal browser path keeps the UI live.
- No Elo claim: this release changes reproducibility and depth, not the evaluation.

## ADR 0018 — the leaf tier is optimized by measurement, and the remaining 2x is a representation change

### Context

Goal: fit `d9` into the 6 s the top UI level may spend. At the v3.0.4 throughput
(~150-180k nodes/s in the browser build) that is out of reach, so the question was where
the time actually goes.

Measured on `2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16`, `d7`,
503402 nodes, `node --cpu-prof` over 5 runs, self time over 2.5M nodes:

| where | self time |
| --- | --- |
| `evaluateFast` | 42.5% |
| `scoreMoves` | 16.7% |
| `generateMoves` | 14.2% |
| `isAttacked` | 7.2% |
| `quiescence` | 3.2% |
| `makeMove` | 3.0% |

Inside the leaf evaluation, ablated: mobility 37%, material + piece-square 55%,
pawn/rook/king structure 8%.

### Decision

- Optimize the leaf tier without changing its value: flat piece-square tables, one loop
  for both colours, hoisted config, byte `popcount`/`ctz`. 472k → 589k evaluations/s
  (+25%), +7.4% nodes/s at the search level, identical values on 10 positions and an
  identical search tree (503402 nodes, same move, same score).
- Reject the pinned-piece legality mask: it moved `isAttacked` from 8.2% to 7.0% but cost
  1.5% to build and lost 1% of wall clock (min of 5 `d7` runs: 2636 ms without, 2662 ms
  with). The mask only pays when the attack test dominates, and here most of its calls are
  the per-node check detection, which the mask does not touch.
- Record that the next 2x is a representation change, not another local optimization:
  staged move generation and bitboards attack `generateMoves` + `isAttacked` + make/unmake
  (27% of the profile) and the per-move loops in `scoreMoves` (17%).

### Consequences

- The engine is ~7% faster at the same strength, with the same tree, so any regression test
  written against node counts stays valid.
- The next step is stated with the profile numbers and is therefore falsifiable: if staged
  generation does not push `generateMoves` below 8%, the representation is the problem,
  not the staging.

---

## ADR 0019 — uncertainty is reported as a vector, never as a penalty

**Status:** Accepted (v3.0.6)

### Context

Doc 37 §5-§6 defines eight uncertainty types; doc 45 §16 says the eight indicators steer
verification; doc 37 §14.3 forbids `Confidence = 1 - Uncertainty`; UCT-INV-019 forbids an
automatic uncertainty penalty on the evaluation. Until 3.0.5 the engine had one scalar
(`meta.uncertaintyOf`, doc 05 §17) and the UI showed a single risk word. The gap was not a
missing number but a missing distinction: a position can be strategically clear and
tactically lost, and one scalar cannot say which.

### Decision

- `uncertainty.mjs` computes U(P) as eight components, each in [0,1], each carrying the
  evidence and context that produced it (UCT-INV-006). No weighted sum is exported;
  `scalar()` is deliberately absent, and a test asserts its absence so a later
  "convenience" blend cannot slip in.
- A `driver` names the leading component. It does not rank the rest: a ranking would need
  the commensurability that doc 45 §16 denies.
- The certificate (doc 45 §20.2) is attached to every search result, and its
  `validation_status` is derived from the evidence rather than asserted: an illegal
  position is REFUTED, an unfinished search UNVERIFIED, a completed one SEARCH_SUPPORTED, a
  proven mate FORCED_WITHIN_SCOPE. Depth, node count and the PV are copied from the search,
  so a certificate cannot drift from the search it describes.
- The profile and the certificate sit beside `score`, never inside it: `Engine.search()`
  returns them as separate fields, and no evaluation path imports them
  (`evaluate.mjs` keeps its own doc 05 §17 scalar).

### Consequences

- The engine can say *what kind* of doubt it has, and the UI shows it: the search panel
  prints U(P) with the leading component marked.
- Determinism is testable. The same position and budget produce the same profile, the same
  decision and the same evidence strings, so a regression in the profile fails a test
  instead of becoming a judgement call.
- The magnitude of U(P) now feeds a scalar search-effort budget and increases, never
  inverts, the clock and depth (doc 05 §17). This shipped in v3.0.11. It still does **not**
  implement doc 45 §16: the leading component
  (`driver`) does not decide where a deeper or wider search is spent, and Gate 7 remains
  open. No ADR claims that the vector steers verification yet.

---

## ADR 0020 — claimable draws stay playable; only automatic draws end the game

**Status:** Accepted (v3.0.7)

### Context

Doc 32 §FEN treats the position as evidence, and the rule authority (`Position.status()`)
must not contradict the search's own terminal detection. The pre-3.0.7 code returned
`{ over: true, result: 'draw' }` for the 50-move rule (halfmove >= 100) and for threefold
repetition, and the quiescence horizon scored those positions 0. That is wrong under
FIDE: the 50-move rule (9.3) and threefold repetition (9.2) are *claimable* — the game
continues until a player claims, and a position where a player can still win is not a
dead draw. Treating them as automatic both mis-scores the horizon and lets the engine
accept a draw it does not have to.

### Decision

- `Position.status()` ends the game only for the *automatic* draws: checkmate, stalemate,
  the 75-move rule (halfmove >= 150, FIDE 9.6.2), fivefold repetition (9.6.1), and dead
  material. The 50-move rule and threefold repetition return `null` — the position stays
  playable, and the search/quiescence treats it as a normal position.
- The quiescence horizon returns 0 for the 75-move rule and fivefold repetition, the same
  two automatic draws `status()` honours, so a search can never claim a 0 it cannot reach.
- `insufficientMaterial()` is tightened to FIDE 5.2.2: `K+B vs K+B` is dead only when both
  bishops stand on the same colour complex. With opposite colours, or with any knight
  present, a helpmate exists and the position is not dead.

### Consequences

- The engine no longer accepts a 50-move or threefold draw it is entitled to claim, so its
  search scores reflect positions that are actually still winnable or losable.
- The search and the rule authority share one definition of "automatic draw", so the
  horizon and `status()` cannot disagree.
- Claiming a draw is now a UI/policy decision (the player or the engine's own claim logic),
  not a hidden terminal condition in the rule authority.

---

## ADR 0021 — the engine searches off the main thread, and Memory is read

**Status:** Accepted (v3.0.8)

### Context

The v3.0.6 audit (P2.1, P3.1) found two things that made the UI dishonest about
its own engine:

- The search ran on the main thread behind `setTimeout(..., 30)`. A depth-10
  search on a middlegame blocks painting, animation and the clock for as long as
  it runs, so "Двигун думає..." was the only feedback and the clock was frozen
  with it.
- `Engine.memory` was written on every search and read by nothing. `Memory`
  documented a game/analysis history that influenced later searches; in practice
  it was a `Map` that grew and was never consulted.

### Decision

- **The worker.** `build/bundle.mjs` embeds the engine source twice: once as the
  live inline module and once as a JSON string literal, `ENGINE_SRC`. The shell
  appends a small message pump (`self.onmessage`) to that string and starts a
  `Worker` from a `Blob` URL with `{ type: 'module' }`. A request carries the FEN,
  the depth, the clock budget and a `reset` flag; a reply carries the request id
  and the `Engine.search()` result. The blob URL is revoked after the worker has
  loaded.
- **One engine per worker.** The worker lazily constructs a single `Engine` and
  reuses it for the whole game, so its TT and `Memory` survive from move to move;
  `reset: true` (sent on the first move of a new game) clears both. A fresh
  `Engine` per request would have thrown away the very structures the audit asked
  to use.
- **The fallback stays.** When `Worker` or `Blob` is missing, or the worker fails
  to start or errors, the shell searches on the main thread with the same options.
  This is not a compatibility nicety: it is the path the DOM test exercises, so
  the UI logic has one implementation regardless of the environment.
- **Memory is consulted.** `Engine.search()` calls `memory.lookup(pos)` first and
  passes the remembered move and score to `Searcher.search({ prevBest, prevScore })`.
  The searcher seeds the first root move with `prevBest` (when it is still legal)
  and the aspiration window with `prevScore`. Nothing else changes: with a cold
  memory the search is identical to before, which is what keeps the existing
  depth/move regression tests meaningful.

### Consequences

- The clock now runs for the side to move *including* while the engine thinks,
  and starts with the first move of the game rather than at page load. A deep
  search costs the engine the time it actually spends.
- A repeated position is searched with a warm root and a warm TT, so it reports
  fewer nodes than a cold search of the same position. That is the intended
  behaviour, and `tests/engine.audit.mjs` now asserts that Memory is written *and*
  read.
- The shipped file stays a single offline HTML: the worker source is embedded in
  it, so there is no second request and no CDN.
- `tests/engine.worker.mjs` unpacks the embedded string, runs it in a fake worker
  scope and asserts a search is answered. A regression in the embedding (escaping
  `<`, the pump, the reuse) fails the suite instead of failing silently in the
  browser.

---

## ADR 0022 — search terminal correctness (v3.0.8 audit, P0)

**Status:** Accepted (v3.0.9)

### Context

`ver/subit_chess_v3.0.8/subit_chess_v3.0.8_audit_2.md` listed nine defects;
six were confirmed P0. Their common theme is that a score was published from
something other than a searched, legal position:

- a **stand-pat** in check (AUD-01) — a static score is not a legal move, yet it
  could produce a beta cutoff in the horizon;
- the **qdepth cap while in check** (AUD-02) — the same static score of an
  unresolved check was returned at the cap (returning `-INF` instead was the
  v3.0.0 false-loss defect);
- **stalemate** checked only at `qdepth === 0` (AUD-03) — a deeper quiet
  horizon could publish a material score for a drawn position;
- **claimable draws** scored as terminal 0 inside `negamax` (AUD-04) — this
  contradicted ADR 0020, which had already made them normal playable positions
  in `Position.status()` and in the horizon;
- the **root** skipped automatic draws (AUD-05) — it could keep searching a
  position the game authority already ends;
- **futility pruning** compared an opponent-perspective static score with the
  mover's alpha (AUD-06), pruning exactly the good quiet moves it should keep.

### Decision

- In check, `quiescence` starts from `-INF` and has **no stand-pat**; the first
  searched evasion sets the bound. At the cap, `staticCheckEvasion()` resolves
  one legal evasion statically (mate when none exists) instead of scoring the
  checked position or fabricating `-INF`.
- The horizon stalemate probe runs at **every** qdepth, still only when no
  capture was generated, so the tactical path pays nothing.
- `negamax` keeps only the **automatic** draws (75-move, fivefold) as terminal.
  The 50-move and threefold claims stay playable, as ADR 0020 decided. This
  supersedes the *search* clause of ADR 0011; its game-status clause is intact.
- The root detects the automatic draws (75-move, fivefold, dead material)
  before searching, with a `reason` on the result.
- Futility negates the post-move static score before comparing it with alpha
  (the patch carried over from the uncommitted v3.0.8 working tree).
- **TT validity is one search.** `TT_MAX_AGE` is 0 and `ttMoveFor()` applies the
  same age check as `probe()`. Without it, a one-generation-old move hint from
  `ttMoveFor()` reorders the tree after the quiescence fix and the published
  score depends on which shallower searches ran before (measured: cold `-3`,
  warm `+25` on the ADR 0011 position). Iterative deepening is unaffected —
  all its entries share one generation — and `Memory` still carries move and
  score across game moves. This narrows ADR 0021's "TT survives across moves"
  to "the table is kept, its entries are not reused across root searches".

### Consequences

- Scores at the horizon now describe positions that were actually reached by a
  legal move; claimable draws are searched instead of scored as half a point.
- Root searches of automatically drawn positions return a terminal result with
  a reason, matching `Position.status()`.
- Warm and cold searches of the same position again return the same score and
  move (`tests/engine.eval.mjs` §12), so v3.0.4's reproducibility guarantee is
  preserved under the corrected quiescence.
- AUD-07…AUD-09 (null-move/repetition contamination, dead material in the
  horizon, null-move state equivalence) were closed in v3.0.10 (`be27fe4`):
  null moves no longer touch the halfmove clock or repetition history, dead
  material is terminal at interior and horizon nodes, and null-move state
  restoration is verified by full canonical snapshots. See the v3.0.10
  release dossier and `tests/engine.tactics.mjs`.
- v3.0.11 adds quiet checking moves only at `qdepth === 0`, at most `maxChecks`
  of them (default 4), never while already in check. This is a controlled extension
  under doc 05 §quiescence, not a change to this ADR: no stand-pat in check, the
  qdepth cap, stalemate detection and automatic draws at the root are unchanged.
  `noqchecks` restores the old horizon for A/B. Gate 3 accepted A1 after the kill;
  Gate 6's d9-in-6s target remains open.

---

## ADR 0023 — delete structural move ordering (Gate 3 kill)

**Status:** Accepted (v3.0.11, 2026-11-21)

### Context
Gate 3 pre-registered that any structural layer unable to show a positive CI over
200 games is deleted outright. `base` vs `nostruct`, depth 4, seed 7, 200 games:
**47.5% ± 6.2** (74W/42D/84L, 25/200 capped games), CI ≈ [41.3%, 53.7%].
The 100-game `noplans` run produced the identical score and per-opening table.
A direct root check on all 24 suite FENs showed `base`, `nostruct` and `noplans`
choose the same move on 24/24, and that `nostruct` and `noplans` are node-identical:
they ablate one ordering mechanism, not two independent layers. The plan-derived
bonus was the only structural ordering term.

### Decision
- Remove structural ordering from the search path: `ordering.struct` is 0,
  `makePlanOrderer` and the `structuralBonus` plumbing are deleted, and
  `scoreMoves` no longer reads a structural bonus.
- Remove the already-dead context ordering path as well: `ordering.context` is
  0 and no `contextBonus` reaches `scoreMoves`. Context still feeds `scalarize()`,
  uncertainty and the UI; only its ordering claim is withdrawn.
- `nostruct` / `noplans` remain as historical no-op controls with updated labels.
  Plans remain a descriptive and uncertainty layer, not a search layer.

### Consequences
- Search ordering is now `pv > tt > tactic > history`. No external strength claim is made
  for the v3.0.11 release artifact; the post-kill 60.0% / 79.0% results are self-play only.
- Full `npm test` passes. The v3.0.11 temp-copy build hash is
  `8267AEFA3BFFA9E52843F1D77411963E47A30D5D5753DF92EDBE1E427ED82BE5`; the two
  v3.0.10 release HTMLs remain at `9A08F02F...` and were not overwritten.
- Reintroducing any structural/context ordering needs a new ADR and a fresh
  pre-registered A/B; it is not a tuning follow-up to this kill.

---

*End of DECISIONS.md — v3.0.11*