# Roadmap

Direction for **subit-chess** after v1.9.1.

Guiding principles:
- **Evidence over ambition.** Every next step has a pre-registered gate.
- **Honest probabilities.** If a path is unlikely to work, say so.
- **Kill criteria are first-class.** Every item names what would make us stop.
- **No new mechanisms** until the current one (ρ_s) is validated or falsified.

---

## Current state — v1.9.1 (2026-09-26)

**Status:** Infrastructure release. Game strength ≈ v1.8.7 in baseline mode.

**What works:**
- S₀ = 48 cells, signal rate ~18–22% flat across coarsenings.
- Teacher pipeline: selfPlay → batchTeacherEval → snapshot, `droppedRaw = 0`.
- ρ_s installed and frozen from teacher means, explicit policy passing through Worker.
- `searchParamsFor()` → `alphaBeta` reacts to `policyNullR` / `policyFutMargin`.

**What is not yet known:**
- Does ρ_s actually improve play? **Unanswered.**
- The next release depends entirely on the A/B answer.

**Open hazards:**
- Auto-init of ρ_s (ADR 0006) — mitigation documented, not removed.
- 6 effective dims (ADR 0005) vs. 4 declared — pre-registration drift, logged.

**Next action:** Run 400-game A/B (see below). Everything else is blocked on it.

---

## Gate 1 — ρ_s A/B (unlocks v1.9.2 or v1.9.x-rollback)

**Pre-registered metric:** `Δmean reward per transition` on 8 active cells.
**Sample size:** 200 games screening, then 400 games confirm.

### Commands

```bash
# baseline (policy off)
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy off --out results/base.json

# ρ_s (policy on, compared to baseline)
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy on  --out results/rho.json --baseline results/base.json
```

### Decision table

| Result | Verdict | Action |
|---|---|---|
| `Δmean > +15 cp` | PASS screening | Run 400-game confirm; if CI.lo > 0 → **v1.9.2 online learning** |
| `Δmean ∈ [−5, +15] cp` | MARGINAL | Either tune policy values (v1.9.1.x) or kill ρ_s |
| `Δmean < −5 cp` | FAIL | Roll back to baseline; log in DECISIONS as ADR 0009 "ρ_s negative" |
| `Δmean ≈ 0` with `p > 0.5` | NULL | ρ_s is inert; either increase coverage or retire the mechanism |

### Prior probability

**Subjective estimate:**
- PASS (`Δmean > +15`): **25%**
- MARGINAL (`[−5, +15]`): **40%**
- FAIL (`< −5`): **35%**

Justification: 8 cells cover 60% of transitions, but the search deltas
(`d_base ∈ [−1,+2]`, `futility ∈ [80,250]`) are modest. Prior experience with
similar hand-tuned parameter sets suggests weakly positive or neutral.

---

## v1.9.2 — Online ρ_s learning (conditional on Gate 1 PASS)

**Trigger:** `Δmean > +15 cp` AND 400-game CI.lo > 0.

**Idea:** ρ_s is currently static. Update it during self-play using observed
reward per cell, mirroring the existing `nudgeCellWeights` mechanism for eval
weights but applied to policy vector.

**Sketch:**

```
after each game:
  for each active cell c:
    mean_c ← running mean of reward over transitions in c
    norm_c ← clamp(mean_c / 100, −1.5, +1.5)
    ρ_s[c] ← 0.9 · ρ_s[c] + 0.1 · f(norm_c)     # EMA
    clamp ρ_s[c] to bounds
```

**Risks:**
- Non-stationarity: policy drifts into local optima.
- Interference with eval-weight learning (both touch the same games).
- Reintroduces train/eval mixing — must be handled via snapshot-per-run.

**Gate to accept v1.9.2:**
- 400 games A/B vs. frozen v1.9.1 ρ_s → `Δmean > +10 cp` and CI.lo > 0.
- No degradation of signal cell count.

**Kill criteria:**
- Two consecutive runs with `Δmean < 0` → revert, mark as ADR "online learning rejected".

**Prior probability:** **30%** that online learning outperforms frozen.
Non-stationarity in self-play is a known hard problem.

---

## v1.9.3 — Remove auto-init (safety-only release)

**Trigger:** Independent of Gate 1. Low-risk cleanup.

**Change:** Remove the auto-init block in `init()`:

```js
// v1.9.1
if (initTeacherRep.signalCells >= 8){
  subitState.initRhoSFromTeacher(initTeacherRep.allCells);
}

// v1.9.3
if (initTeacherRep.signalCells >= 8){
  console.log('[SUBIT] teacher ready — call __subit.activateRhoS() to install ρ_s');
}
```

**Rationale:** ADR 0006 documented auto-init as a hazard. Removing it makes
"silent A/B contamination" impossible.

**Compatibility:** Minor — users who relied on auto-init call `__subit.activateRhoS()`.
Add a `subit-config.json` flag `autoActivateRhoS: true` for opt-in.

**Gate:** No A/B needed. This is a safety patch. Ship when ready.

**Prior probability of shipping:** **90%**. Low effort, clear win.

---

## v1.10 — Expansion candidates (conditional, blocked)

None of the below is scheduled. Each requires a **positive trigger** from
earlier steps. Without a trigger, they stay closed.

### Candidate A — 16-cell mode

**Trigger:** v1.9.2 online learning shows ρ_s stable across runs AND
`signalCells` grows to ≥ 14 in a 400-game teacher run.

**Idea:** extend ρ_s to 16 cells by relaxing gate from `|t| ≥ 2` to `|t| ≥ 1.5`
plus an effect-size floor `|mean| ≥ 20 cp`.

**Risk:** more params, fewer samples/param.

**Kill criterion:** samples/param drops below 100 → not worth it.

**Prior probability:** **15%**. The 8 → 16 jump historically never paid off.

### Candidate B — Trust-region ρ_s

**Trigger:** v1.9.2 online learning shows oscillation.

**Idea:** bound `Δρ_s` per update by `±5%` and require two consecutive games
with same-sign reward before applying.

**Prior probability:** **20%**. Only triggered if online learning ships.

### Candidate C — Morphism-based ρ_s transfer

**Trigger:** Category morphisms (`A → B` with count ≥ 4 and positive avg delta)
cover ≥ 30% of active-cell transitions.

**Idea:** propagate ρ_s along strong morphisms instead of per-cell learning.

**Prior probability:** **10%**. Morphism infrastructure exists but is
underpowered (`buildCompositions` requires count ≥ 2).

### Candidate D — Openings suite for A/B

**Trigger:** Always beneficial; not tied to Gate 1.

**Idea:** add 10 fixed openings to `runners/run.js` via `--openings file.epd`,
cycle through them, colors balanced.

**Rationale:** currently `selfPlay` always starts from the initial position;
opening diversity comes only from ε-greedy. A real A/B needs opening variance.

**Prior probability:** **70%** of shipping. Cheap and improves every future A/B.

**Effort:** ~60 lines in `runners/run.js` + 1 `.epd` file.

---

## Explicitly rejected / parked

Listed here so they do not get re-litigated.

| Path | Reason |
|---|---|
| **32-cell coarsening** | Extrapolated signal ~6 < gate 15 (ADR 0002) |
| **KING → CENTER merge** | t drops 2.61 → 1.92 (ADR 0003) |
| **22-cell ρ_s** | 74.4 samples/param vs. current 136.4 (ADR 0002) |
| **Elo-based gate** | Statistically dishonest at 200 games (ADR 0008) |
| **`window.__rhoSModule` global** | Broken in Worker; replaced by explicit passing (ADR 0007) |
| **NNUE / WASM / GPU backend** | Different research path; 3–6 months; no morphological tie-in |
| **Opening book** | Conflicts with ε-greedy diversity during training |
| **Endgame tablebase probe** | Outside scope; would need external data |
| **MCTS / policy network** | Alpha-beta with ρ_s is the current bet; don't pivot mid-cycle |
| **Re-training the 6-component eval** | Eval is stable; focus is on ρ_s |
| **Removing Belnap panel** | Cheap UI, no performance cost, useful for debugging |

---

## Non-goals (permanent)

These will not be addressed in any release:

- **Browser-only.** No Electron, no Node-CLI engine, no desktop app.
- **Backwards compatibility with v1.8.x localStorage format.** Breaking changes
  in `subit-grammar-v3` are allowed; a migration script is out of scope.
- **Internationalization (i18n).** UI is Ukrainian + English mixed; accept it.
- **Mobile-optimized board.** It works; polish is not on the roadmap.
- **Multi-threaded search.** Web Worker is single-threaded per search.
- **Cloud teacher runs.** Teacher is offline, local, single-user.
- **Multiple games in parallel (browser).** Sequential only.

---

## Timeline (order, not dates)

```
[now]  v1.9.1      — infrastructure, frozen ρ_s
       ↓
       Gate 1 (400-game A/B)  ← blocking
       ↓
       ┌─ PASS ────────→ v1.9.2 (online ρ_s) ─┐
       │                                       ↓
       │                                 Gate 2 (400-game A/B)
       │                                       ↓
       │                                 ┌─ PASS ──→ v1.10-A (16-cell, maybe)
       │                                 └─ FAIL ──→ freeze at v1.9.2
       │
       ├─ MARGINAL ──────→ v1.9.1.x (policy tuning, one more A/B)
       │
       └─ FAIL ──────────→ v1.9.x-rollback (ρ_s off by default)
                           + ADR "ρ_s negative"

[independent] v1.9.3 (remove auto-init)  — safety patch, ships whenever
[independent] v1.10-D (openings suite)   — improves future A/B, ships with next cycle
```

**"Done" state:** either
- ρ_s shows statistically significant improvement (`CI.lo > 5 Elo`), or
- ρ_s is formally retired and the project freezes at the last baseline-strong version.

No infinite iteration. Two more A/B cycles max before a decision.

---

## What would change this plan

- **External contribution** proving ρ_s improves play on independent hardware.
- **A theoretical result** showing why 8 cells is optimal for this eval.
- **Discovery of a bug** in `alphaBeta` policy integration (invalidates current A/B).
- **Unexpected teacher signal growth** (e.g., `signalCells ≥ 20`) → reopens 16-cell path.

Absent these, the roadmap above is stable until Gate 1 resolves.

---

*End of ROADMAP.md — v1.9.1*