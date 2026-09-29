# SUBIT Experiment Specification v2.0

**Pre-registered protocol for empirical evaluation of the SUBIT hypothesis**

Status: pre-registration · v1.0 · applies to SUBIT-CHESS v1.9.x and successors

Companion documents:
- `docs/SUBIT-CHESS-SPEC.md` — formal specification
- `docs/DECISIONS.md` — architecture decisions
- `docs/ROADMAP.md` — release plan
- `docs/USER-MANUAL.md` — engine usage

---

## 0. Purpose and scope

This document specifies **how to decide, empirically, whether SUBIT
adds value to chess search**. It is written in pre-registration style:
hypotheses, datasets, controllers, metrics, thresholds, and decision
rules are fixed **before** running the experiments.

**Why pre-registration matters here.** SUBIT is a research hypothesis
about a controller layer in a complex system. Without fixed decision
rules, it is trivially easy to find *some* configuration that shows
*apparent* improvement, then rationalise it as evidence. This document
prevents that failure mode by fixing the evaluation protocol in advance.

**What this document is NOT.** This is not a paper, not a promotional
document, not a design spec. It is the operational counterpart to
`SUBIT-CHESS-SPEC.md`: the specification says what SUBIT *is*, this
document says how to *test whether it works*.

**Epistemic status of the claims tested here.** All hypotheses in §3
are claims about *empirical behaviour of computational systems*. None
of them are theorems. Each can be falsified by a well-designed
experiment. If any hypothesis survives the protocol in this document,
it survives *with the specific controllers, datasets, and statistics
used here* — not in any universal sense.

---

## 1. Background summary

SUBIT proposes an explicit intermediate layer between position and
search: a morphology-conditioned control architecture of the form

```
P → S₀(P) → Ω(P, H) → ρ_s → Search(P, ρ_s, V)
```

The formal definition is `SUBIT = (M, D, Π)` (§7 of the article
version 3.0+). The chess operationalisation uses
`S₀ = I × Z × Φ = 48` cells and `Ω ∈ {STABLE, METASTABLE, CYCLIC, CHAOTIC}`.

The empirical question is narrow: **does this specific architectural
organisation of context-conditioned search control outperform (a) a
fixed policy, (b) a shuffled morphologist, (c) a raw-feature controller
of comparable capacity, and (d) a random policy?**

---

## 2. Definitions used throughout this document

| Term | Operational definition |
|---|---|
| **Controller** | Any function `f: Position → ρ_s` (a policy assignment mechanism) |
| **Search backend** | Any algorithm that consumes `(P, ρ_s, V)` and returns a move |
| **Total work** | `nodes + c_S·compute_S₀ + c_Ω·compute_Ω + c_π·lookup_π` in equivalent node units (§7) |
| **Matched strength** | Two engines with 95% CI of Elo difference containing zero |
| **Matched budget** | Two engines with identical `total_work` budget |
| **Test set** | Any FEN set never used in training, tuning, or calibration |
| **Signal cell** | A cell with `n ≥ 20 ∧ \|t\| ≥ 2` in a given teacher report |

---

## 3. Hypotheses

Hypotheses are numbered in **logical order of testing**. H₀' must be
rejected before H₀ is tested; H₀ before H₁ᵃ/ᵇ; H₁ᵃ/ᵇ before H₁ᶜ; H₁ᶜ
before H₂. Skipping a level invalidates the interpretation of all
higher levels.

### H₀' — Foundational hypothesis

**Statement.** Some context-conditioned search policy `f: P → ρ_s`
outperforms the fixed baseline policy `ρ_baseline` on at least one
metric of interest, with p < 0.05.

**Rationale.** Without this, SUBIT is pointless — there is nothing to
organise.

**Note.** This is *not* a SUBIT-specific claim. It is a claim about
context-conditioned search in general. If H₀' fails, SUBIT is not
the right place to invest effort.

### H₀ — SUBIT specificity

**Statement.** The specific morphology-based controller
`Π_SUBIT(S₀, Ω)` outperforms the raw-feature controller
`Π_raw(features)` at equal parameter count, on at least one metric of
interest, with p < 0.05.

**Rationale.** Rules out the trivial explanation "any context
conditioning helps".

**Note.** This is *the* central hypothesis for SUBIT as an
architecture. Everything else is refinement.

### H₁ᵃ — Efficiency

**Statement.** For matched strength (Elo difference ∈ [−5, +5] with
95% CI containing zero), `Π_SUBIT` requires statistically less total
work than baseline `ρ_baseline`, with p < 0.05.

**Rationale.** Tests whether morphology is a *compute-saving*
mechanism.

### H₁ᵇ — Strength

**Statement.** For matched total_work budget, `Π_SUBIT` achieves
Elo improvement > +15 with 95% CI lower bound > 0.

**Rationale.** Tests whether morphology is a *strength-increasing*
mechanism. This is the harder claim.

### H₁ᶜ — Robustness

**Statement.** Any effect found in H₁ᵃ or H₁ᵇ persists across
(a) independent test datasets, (b) at least two random seeds,
(c) at least two opening families, and (d) at least two search backends
when available.

**Rationale.** Rules out overfitting, seed dependence, and single-engine
artifacts.

### H₂ — Classifier specificity

**Statement.** The specific morphological classifier `S₀_chess = I × Z × Φ`
outperforms alternative 48-cell classifiers `S₀'`, `S₀''`, `S₀'''` (§6.3)
with p < 0.05.

**Rationale.** Distinguishes "SUBIT's specific I/Z/Φ axes matter" from
"any 48-cell classifier works". This is the hardest and most
interesting hypothesis.

### Null hypothesis hierarchy

For each Hi, the corresponding null is the negation. Decision rules
are pre-registered in §10.

---

## 4. Datasets

### 4.1 Sources

| Dataset | Size (FENs) | Source | Purpose |
|---|---:|---|---|
| **T_train** | 5000 | self-play, depth 2, ε = 0.2, seed A | Controller fitting |
| **V_val** | 1000 | self-play, depth 2, ε = 0.2, seed B | Hyperparameter selection |
| **Test_tactical** | 1000 | external tactical suite (e.g. Bratko-Kopec, WAC, ERET) | H₁ᵃ/ᵇ, decision quality |
| **Test_endgame** | 1000 | tablebase-derived positions | H₁ᵃ/ᵇ, tablebase agreement |
| **Test_opening** | 500 | external opening book | H₁ᶜ, opening robustness |
| **Test_random** | 2000 | random legal positions at ply 20–40 | H₀ specificity |
| **Test_human** | 1000 | human games, moderate level | H₁ᶜ, distribution shift |

### 4.2 Strict separation rules

1. **T_train ∩ V_val = ∅.** Different seeds. No overlapping FENs.
2. **V_val ∩ (Test_*) = ∅.** No FEN in any Test set may appear in
   teacher-generated or self-play trajectories.
3. **No label leakage.** Any information used to fit `Π` must come
   only from T_train. Any information used to select
   hyperparameters must come only from V_val.
4. **Test sets are touched once.** Final evaluation runs once on each
   Test set; no iteration allowed.

### 4.3 Sampling protocol

For self-play datasets (T_train, V_val):

```
for game in 1..N:
    pos ← initial
    while not terminal and ply < maxPlies:
        move ← engine.search(pos, ρ_baseline, V_baseline)
        move ← ε-greedy over top-k with probability ε
        pos ← apply(pos, move)
        record(pos, eval_after, mover)
    deduplicate FENs
    sample uniformly from unique FENs to reach target size
```

**Explicit sampling parameters:**

| Parameter | Value |
|---|---|
| `depth` (search) | 2 |
| `maxPlies` | 100 |
| `ε` (exploration) | 0.2 |
| `top-k` (ε-greedy) | 3 |
| `N_games` (self-play) | 200 |
| `deduplication` | full FEN match |
| `RNG seed` | fixed per dataset |

For external datasets (Test_*): use as-is, verify FEN validity and
side-to-move balance.

### 4.4 Release of datasets

All datasets are released with the experiment as EPD files under
`bench/fens/`. SHA256 checksums of each file are recorded in
`bench/fens/CHECKSUMS`. Any modification invalidates the protocol.

---

## 5. Controllers (baselines A–L)

Every experiment compares a set of controllers using the same search
backend, evaluation function, and time/node budget. Controllers differ
only in how `ρ_s` is assigned.

### 5.1 Required controllers

| ID | Name | Description | Tests |
|---|---|---|---|
| **A** | Fixed baseline | `ρ_s = ρ_baseline` for all positions | Reference |
| **B** | S₀-only | `ρ_s = π(S₀(P))`, Ω fixed | H₀' partial |
| **C** | Ω-only | `ρ_s = π(Ω(P, H))`, S₀ fixed | H₀' partial |
| **D** | S₀ + Ω (manual) | `ρ_s = π(S₀, Ω)`, hand-coded rules | H₀ |
| **E** | S₀ + Ω + teacher | `ρ_s = π(S₀, Ω, V_teacher)`, teacher-derived | H₀, H₁ |
| **F** | S₀ + Ω + learned | `ρ_s = πθ(S₀, Ω)`, θ from self-play | H₀, H₁ |
| **G** | Random | Random `ρ_s` from empirical distribution over E | Baseline for "any noise" |
| **H** | Shuffled S₀ | Same as D, but S₀ labels permuted across positions | Morphology dependence |
| **I** | Raw-feature controller | `ρ_s = π_raw(features)`, no S₀/Ω structure | H₀ specifically |
| **J** | Raw-feature + S₀ | Same as I, plus S₀ as extra inputs | H₀, H₂ |
| **K** | Raw-feature × 3 capacity | Same as I, 3× parameters | Capacity control |
| **L** | Oracle | Post-hoc optimal `ρ_s` from independent validation | Upper bound |

### 5.2 Matching rules

- **Parameter count.** I and D must have the same number of learnable
  parameters. K has 3× parameters to control for capacity.
- **Feature access.** I, J, K receive raw features only (no explicit
  S₀/Ω labels). This is critical for H₀.
- **Training data.** All learned controllers (F, K, and learned I/J)
  are trained on T_train, tuned on V_val, evaluated on Test_*.
- **Random seed.** All controllers use the same RNG seed for any
  sampling step.

### 5.3 Controller parameterisation

All controllers parameterise a common `ρ_s` structure (§12 of the
article). The full parameter vector is:

```
ρ_s = (d_base, q_depth, r_LMR, r_null, b_futility,
       e_check, e_recapture, e_passed,
       c_draw, π_ordering)
```

Manual controllers (A–D, H) fix values by hand. Learned controllers
(E, F, I, J, K) fit by:
- E: regression from teacher rewards (per-cell mean, then normalised).
- F, I, J, K: gradient-based optimisation over match outcomes on
  T_train.

---

## 6. Alternative morphological classifiers for H₂

### 6.1 S₀_chess (reference)

```
S₀ = I × Z × Φ
I ∈ {ATTACK, PRESSURE, DEFENCE, QUIET}
Z ∈ {KING, CENTER, GLOBAL}
Φ ∈ {OPENING, MIDDLEGAME, TACTICAL, ENDGAME}
```

### 6.2 Alternative classifiers (all 48 cells)

**S₀' — material/phase/pawn:** 4 material bins × 3 phase bins × 4 pawn
structure bins.

**S₀'' — k-means on shallow features:** 48 clusters from k-means over
normalised (material, mobility, king safety, pawn count, center
control) on T_train.

**S₀''' — random partition:** 48 cells assigned by random hash of the
position's FEN, uniform distribution.

**S₀⁗ — learned projection:** 48 clusters from a small autoencoder
trained on positions from T_train.

### 6.3 Comparison protocol

All classifiers use the same policy-fitting pipeline (E, teacher-based)
and are evaluated on the same Test sets. H₂ compares:

```
Π(S₀_chess, Ω) vs Π(S₀', Ω) vs Π(S₀'', Ω) vs Π(S₀⁗, Ω)
```

Against the null that all classifiers perform equally. S₀''' is the
falsification baseline: if SUBIT ≠ S₀''', the classifier carries signal.

---

## 7. Compute accounting

### 7.1 Total work definition

For each engine decision, define total work as:

```
W(P) = N_search(P)
     + c_S · N_S₀(P)
     + c_Ω · N_Ω(P)
     + c_π · N_π(P)
```

where:
- `N_search(P)` = alpha-beta/PVS/MCTS nodes expanded
- `N_S₀(P)` = number of primitive operations to compute S₀
- `N_Ω(P)` = number of operations to maintain and classify Ω
- `N_π(P)` = number of operations for ρ_s lookup
- `c_S, c_Ω, c_π` = relative cost constants (measured, not assumed)

### 7.2 Calibration of cost constants

Measure on the reference hardware:

```
c_S = avg_time(compute_S₀) / avg_time(one_search_node)
c_Ω = avg_time(update_Ω)   / avg_time(one_search_node)
c_π = avg_time(lookup_π)   / avg_time(one_search_node)
```

Report measured constants with each experiment. Published results
must state hardware: CPU model, RAM, thread count, Node.js version,
browser version (if applicable), jsdom version.

### 7.3 Matched-budget protocol

Two engines are compared at matched budget when their `W(P)` are equal
to within 1% averaged over the test set. **Node-only matching is not
sufficient** and invalidates H₁ᵃ by construction.

### 7.4 Reporting convention

All metrics reporting nodes must be annotated as either:
- **raw nodes** (search-only), or
- **total work** (including controller overhead).

H₁ᵃ is evaluated only on total work. H₁ᵇ is evaluated only on raw nodes
(since strength at fixed raw nodes isolates the search algorithm).

---

## 8. Metrics

### 8.1 Primary metrics

**For H₁ᵇ (strength):**

| Metric | Definition | Target |
|---|---|---|
| Elo difference | Paired, colour-balanced, SPRT-terminated | ΔElo with 95% CI |
| Match score | (wins + 0.5·draws) / games | Score fraction |
| SPRT LLR | Sequential log-likelihood ratio | Thresholds in §10 |

**For H₁ᵃ (efficiency):**

| Metric | Definition | Target |
|---|---|---|
| Total work at matched Elo | See §7.1 | Ratio `W_SUBIT / W_baseline` |
| Nodes at matched strength | Raw search nodes | Ratio |

### 8.2 Secondary metrics

**Search-efficiency secondary:**

- depth achieved at fixed nodes
- selective depth
- quiescence nodes
- TT hit rate
- LMR reduction count
- null-move cutoffs
- futility cutoffs
- extension count
- mean branch factor at root
- root move stability

**Decision-quality secondary:**

- best-move agreement with teacher at depth 4+
- tactical accuracy on Test_tactical
- mate-in-N detection rate
- blunder rate (defined as Δeval loss > 300 cp in one move)
- evaluation stability across depths

### 8.3 Reporting format

Every experiment reports:

1. Raw result table (per-controller per-metric).
2. Confidence intervals (Wilson for proportions, bootstrap for means).
3. Effect sizes (Cohen's h for proportions, Cliff's δ for ordinal).
4. Compute cost breakdown (§7).
5. Hardware and software versions.

---

## 9. Statistical tests

### 9.1 Test selection

| Comparison | Test |
|---|---|
| Two proportions (win rate) | Wilson score interval, two-proportion z-test |
| Two Elo means | Paired bootstrap, 10000 resamples |
| Multiple comparisons | Benjamini-Hochberg FDR at α = 0.05 |
| Sequential match | SPRT (§9.2) |
| Distribution shift | Kolmogorov-Smirnov |

### 9.2 SPRT configuration

For match-based H₁ᵇ:

```
H₀: ΔElo ≤ 0
H₁: ΔElo ≥ 15
α = 0.05 (false positive rate)
β = 0.10 (false negative rate)
```

Termination when LLR exceeds either boundary:
- ACCEPT H₁: LLR ≥ log((1−β)/α) ≈ 2.89
- ACCEPT H₀: LLR ≤ log(β/(1−α)) ≈ −2.25

Expected sample size for true ΔElo = 15 is ~1500–2500 games.

### 9.3 Power analysis

Pre-computed for the required experiments:

| Effect size | Games needed (α=0.05, power=0.80) |
|---|---|
| ΔElo = +15 | ~2200 |
| ΔElo = +25 | ~800 |
| ΔElo = +50 | ~200 |
| Work ratio = 0.85 | ~15 datasets × 100 positions each |

For H₁ᵃ (efficiency), sample = **positions**, not games. Sample size
is per-FEN.

### 9.4 Multiple testing policy

All H₀/H₁ decisions are made after **family-wise correction** within
each hypothesis family. Reported p-values are both raw and adjusted.

---

## 10. Pre-registered decision criteria

### 10.1 Hypothesis acceptance

Each hypothesis is accepted if:

**H₀'.** A–F contains at least one controller with significant
difference from A on Elo (p < 0.05 after FDR) **AND** total work
(one-sided p < 0.05).

**H₀.** Π_SUBIT(I) > Π_raw(I) on Elo with p < 0.05 after FDR, **AND**
the effect size is ≥ 10 Elo, **AND** the same effect appears on at
least two test sets.

**H₁ᵃ.** `W_SUBIT / W_baseline ≤ 0.90` at matched strength, with 95%
bootstrap CI upper bound < 1.00.

**H₁ᵇ.** ΔElo ≥ +15 with 95% CI lower bound > 0.

**H₁ᶜ.** The effect from H₁ᵃ or H₁ᵇ survives across all four axes of
§3 (datasets, seeds, openings, backends).

**H₂.** S₀_chess significantly outperforms at least two of the four
alternative classifiers (S₀', S₀'', S₀⁗), with p < 0.05 after FDR.

### 10.2 Rejection criteria

Each hypothesis is rejected if:

**H₀'.** No controller outperforms A on any metric.

**H₀.** Π_SUBIT ≤ Π_raw at p < 0.05 (i.e. raw features win).

**H₁ᵃ.** `W_SUBIT / W_baseline ≥ 1.00` at matched strength.

**H₁ᵇ.** ΔElo ≤ 0 with 95% CI upper bound < +5.

**H₁ᶜ.** Effect disappears on any of the four robustness axes.

**H₂.** S₀_chess loses to any of the alternatives on Elo with p < 0.05.

### 10.3 Inconclusive criteria

If neither acceptance nor rejection is triggered, the experiment is
**inconclusive** and additional samples must be collected per §9.3.
No interpretation is drawn until a decision is reached.

---

## 11. Robustness protocol

### 11.1 Cross-run stability

For teacher-based controllers (E), teacher runs must pass:

| Gate | Threshold |
|---|---|
| `droppedRaw` per run | 0 |
| Signal cells per run | ≥ 8 |
| Jaccard(signal_A, signal_B) | ≥ 0.60 |
| `visitedCells` per run | 30–44 (of 48) |
| `top5Share` per run | ≤ 0.60 |
| Entropy `H` per run | 3.5–4.5 bits |

If a teacher run fails any gate, its controller is not included in
H₀/H₁ evaluation.

### 11.2 Seed sensitivity

Each experiment runs with at least 3 seeds. The reported effect is
the **minimum** across seeds, not the mean. This guards against
seed-favoured results.

### 11.3 Hardware sensitivity

Where possible, run once on a second hardware configuration (different
CPU or different Node version). Report both.

### 11.4 Version sensitivity

Run experiment against at least two engine versions (v1.9.1 and next
release). Effect size must survive as a signed quantity.

---

## 12. Alternative explanations to rule out

Any positive result must be tested against these seven alternative
explanations. For each, the specific test to rule it out is specified.

| # | Alternative | Test |
|---|---|---|
| 1 | Better move ordering, not morphology | Disable move-ordering variation; retest |
| 2 | Hidden extra compute | Total work accounting §7 |
| 3 | Phase encoding, not morphology | Compare S₀ with a phase-only classifier |
| 4 | Teacher leakage | Held-out FEN from different engine family |
| 5 | Self-play overfitting | External human games test set |
| 6 | Single-engine artifact | Repeat on second search backend (MCTS if available) |
| 7 | Random variance | SPRT + multi-seed + bootstrap |

If any alternative is not ruled out, the positive result is
**downgraded** to "consistent with SUBIT but not causally attributed".

---

## 13. Failure modes and invalidations

The following invalidate the experiment and require re-running:

- Test FEN overlap with T_train or V_val.
- Modification of Test_*.epd after the SHA256 was recorded.
- Use of different search backend across compared controllers.
- Failure to include controller overhead in total work.
- Change of decision thresholds (§10) after data collection.
- Change of required controllers (§5) after data collection.

The following *do not* invalidate but must be reported:

- Hardware differences across compared controllers.
- Different RNG seeds (as long as declared).
- Different numbers of games per controller (as long as SPRT or
  equivalent stopping rule was used).

---

## 14. Reproducibility checklist

Before publication, verify:

- [ ] All FEN datasets have published SHA256 checksums.
- [ ] All controllers are implemented in the released codebase.
- [ ] Controller A–L are all present (even if some gave null results).
- [ ] Any learned parameters are released as JSON.
- [ ] Total-work constants `c_S, c_Ω, c_π` are published per hardware.
- [ ] All random seeds used are declared.
- [ ] Any configuration that produced a positive result also produces
      it under re-run.
- [ ] Negative results are reported alongside positive ones.
- [ ] Any pre-registered threshold that was not reached is noted.

---

## 15. Publication commitment

Results of experiments conducted under this specification are
published **regardless of outcome**. In particular:

- If H₀ fails, this is a result: SUBIT's specific morphology does not
  add value beyond raw features. It is published.
- If H₁ᵃ fails but H₀ passes, this is a result: SUBIT reorganises
  context but does not save compute. It is published.
- If H₂ fails, this is a result: the specific I/Z/Φ axes are not
  superior to alternative 48-cell classifiers. It is published.
- If H₀', H₀, H₁ᵃ, H₁ᵇ, H₁ᶜ, H₂ all pass, the strongest version of the
  SUBIT claim is supported. It is published.

Non-publication of negative results invalidates the pre-registration.
This clause is binding.

---

## 16. Revision protocol

This document may be revised only for:

- **Clarification** of an existing clause without changing thresholds.
- **Addition** of new experiments to a later phase.
- **Correction** of an implementation error that invalidates a previous
  run (with full disclosure).

Revisions that change thresholds, add or remove controllers, or alter
decision rules must be published as a **new version** with a changelog
entry and a re-run of affected experiments.

---

## Appendix A — Sample size planning

Assume:
- baseline Elo = 1500 (self-play reference)
- draw rate = 40%
- colour-balanced paired matches

| Target ΔElo | Games for α=0.05, power=0.80 | Time (approx.) |
|---|---:|---|
| +10 | 5000 | ~3 hours |
| +15 | 2200 | ~1.5 hours |
| +25 | 800 | ~30 min |
| +50 | 200 | ~10 min |

Times assume ~2.5 s per game at depth 4 on reference hardware.

## Appendix B — Threshold table

All numeric thresholds used in §10, collected for quick reference:

| Threshold | Value | Source |
|---|---:|---|
| Elo CI significance | p < 0.05, FDR-adjusted | §9.1 |
| Elo effect size (H₀) | ΔElo ≥ 10 | §10.1 |
| Elo effect size (H₁ᵇ) | ΔElo ≥ +15, CI.lo > 0 | §10.1 |
| Work ratio (H₁ᵃ) | W_SUBIT / W_baseline ≤ 0.90 | §10.1 |
| Jaccard gate | ≥ 0.60 | §11.1 |
| Signal cells per run | ≥ 8 | §11.1 |
| Visited cells per run | 30–44 | §11.1 |
| Entropy gate | 3.5–4.5 bits | §11.1 |
| Top5 share | ≤ 0.60 | §11.1 |
| SPRT α | 0.05 | §9.2 |
| SPRT β | 0.10 | §9.2 |
| SPRT ΔElo H₁ | 15 | §9.2 |
| Dropout rate (raw buffer) | 0 | §11.1 |

## Appendix C — Controller implementation notes

- Controllers A–L differ only in `ρ_s` assignment.
- All run against the same `Search()` implementation.
- All use the same `V(P)` unless explicitly noted.
- Hardware, software, seeds, and datasets declared per experiment.

## Appendix D — Declarations

- **Prior probability of H₀**: 0.35 (subjective, before experiments)
- **Prior probability of H₁ᵃ**: 0.25
- **Prior probability of H₁ᵇ**: 0.15
- **Prior probability of H₂**: 0.10

These are recorded to allow calibration analysis after results are
known. If observed outcomes deviate substantially, prior recalibration
is warranted.

# Додатки до `SUBIT-EXPERIMENT-SPEC.md`

Два додатки, які закривають прогалини, виявлені в аналізі. Вставити їх у кінець `docs/SUBIT-EXPERIMENT-SPEC.md` після Appendix D.

---

## Appendix E — Resolution of the Ω ↔ ρ_s fixpoint

### E.1 The problem

The formal definition of SUBIT contains a cyclic dependency:

```
Ω(P, H) → ρ_s → Search(P, ρ_s, V) → H → Ω(P, H)
```

Here `H` is the search history used to compute `Ω`. But `H` is produced by a search running under policy `ρ_s`, and `ρ_s = Π(S₀, Ω)`. The system is therefore a **fixpoint problem**: to compute `Ω` we need `H`; to compute `H` we need `ρ_s`; to compute `ρ_s` we need `Ω`.

Without an explicit resolution, the specification is under-determined. Any implementation implicitly chooses one; the choice must be documented.

### E.2 Three resolutions

Three resolutions are possible. Each corresponds to a different interpretation of what `Ω` *is*.

**Resolution A — Temporal separation.**

```
At time t:
    H_t = history under ρ_s^{(t-1)}
    Ω_t = D(S₀(P), H_t)
    ρ_s^{(t)} = Π(S₀(P), Ω_t)
    Search with ρ_s^{(t)}
```

`Ω` reflects the *previous* policy, not the current one. This is a **delayed feedback** interpretation: Ω classifies how the *last* policy behaved on similar positions.

- Advantage: well-defined, no fixpoint solving needed, online-updatable.
- Disadvantage: Ω lags behind ρ_s by one update cycle. In the limit of fast policy changes, Ω becomes stale.
- Interpretation: Ω is a *diagnostic* of search behaviour, not an intrinsic property.

**Resolution B — Bootstrap policy.**

```
ρ_s^{(0)} = ρ_baseline
For iteration k = 0, 1, 2, ...:
    H^{(k)} = history under ρ_s^{(k)}
    Ω^{(k)} = D(S₀(P), H^{(k)})
    ρ_s^{(k+1)} = Π(S₀(P), Ω^{(k)})
    If ||ρ_s^{(k+1)} − ρ_s^{(k)}|| < ε: stop
```

`Ω` is computed under a *sequence of policies* that converges to a stable `ρ_s`.

- Advantage: Ω is consistent with the final `ρ_s`.
- Disadvantage: iteration cost is `O(k)` × search cost.
- Interpretation: Ω is a *self-consistent* diagnostic under the converged policy.
- Existence: iteration does not always converge. Requires validation.

**Resolution C — Fixed reference policy.**

```
Ω(P) = D(S₀(P), H_under_ρ_ref)
ρ_s = Π(S₀(P), Ω(P))
Search under ρ_s (may differ from ρ_ref)
```

Ω is computed once under a **fixed reference policy** `ρ_ref` (typically `ρ_baseline` or a canonical calibration policy). Then `ρ_s` is assigned and used, even if it differs from `ρ_ref`.

- Advantage: Ω is a well-defined function of P alone (not of the current policy).
- Disadvantage: Ω reflects search behaviour under `ρ_ref`, not under `ρ_s`. If `ρ_s` changes search dynamics significantly, Ω may misclassify.
- Interpretation: Ω is a *policy-invariant* diagnostic of positional difficulty.

### E.3 Pre-registered choice

**For the primary experiment, Resolution C is adopted.**

Justification:
1. It makes Ω a well-defined function of `P` (with fixed `ρ_ref`).
2. It aligns with the operationalisation used in SUBIT-CHESS v1.9.x, where Ω is computed from iterative-deepening traces under a fixed search configuration.
3. It avoids the iteration cost of Resolution B and the temporal lag of Resolution A.

**Reference policy.** `ρ_ref = ρ_baseline` (all cells use the default policy). This is the neutral choice.

**Declared risk.** If `Π(S₀, Ω)` assigns significantly different `ρ_s` from `ρ_ref`, Ω may become stale. This risk is bounded by the **sensitivity test** in §E.5.

### E.4 Sensitivity test

Before adopting Resolution C, run the following control:

```
For each position in V_val:
    Ω_C(P)  = D(S₀(P), H_under_ρ_ref)
    Ω_A(P)  = D(S₀(P), H_under_ρ_s_final)
Compute agreement rate between Ω_C and Ω_A
```

**Acceptance.** Agreement ≥ 0.75 across V_val.

**Rejection.** If agreement < 0.75, Resolution C is unsafe; the experiment is repeated with Resolution B (bootstrap).

**Reporting.** Agreement rate, confusion matrix, and per-cell agreement are reported alongside results.

### E.5 What this does NOT resolve

The choice of resolution does not eliminate the fundamental fact that **Ω depends on the search procedure**, only that it is *deterministic* under a fixed procedure. Any statement like "position P is in mode Ω" must be read as "P is classified as Ω under reference policy ρ_ref and search backend Search." This is consistent with §10.2 of the article.

## Appendix F — Credit assignment for learned ρ_s

### F.1 The problem

When `ρ_s` is learned from self-play games (§13.3 of the article), each game visits many cells. A game outcome is a function of all policy decisions in all visited cells. The learning algorithm must decide **which cells deserve the credit (or blame)** for the outcome.

This is a classical credit assignment problem in contextual bandits with long horizons and delayed rewards.

### F.2 Three approaches

**Approach 1 — Per-cell mean reward (local).**

For each cell `c` and each transition `t` within `c`:

```
r_t = clip(sign(mover_t) · (V_teacher(P_{t+1}) − V_teacher(P_t)), −R_max, R_max)
μ_c = mean(r_t over all t in c)
```

Then `Π(S₀ = c)` fits to `μ_c`.

- Advantage: simple, per-transition, no delayed reward.
- Disadvantage: `μ_c` measures *local* eval change, not *global* game outcome. A cell may get positive `μ_c` even if the game is lost.
- Used in: SUBIT-CHESS v1.9.x.

**Approach 2 — Counterfactual (leave-one-cell-out).**

For each cell `c`, run a game variant where `ρ_s(c)` is set to baseline and all other cells keep their learned values. The performance difference (game outcome or match score) is attributed to `c`.

```
Δ_c = outcome(game | ρ_s) − outcome(game | ρ_s with c reverted)
```

- Advantage: causal, direct.
- Disadvantage: `O(|S₀|)` additional games per training iteration. Infeasible for 48 cells.
- Approximate variant: sample a subset of cells per iteration.

**Approach 3 — Reward shaping (temporal difference).**

Use the full game outcome as terminal reward and propagate backwards through cells:

```
R_final = game_outcome (win = +1, draw = 0, loss = −1)
For each cell c visited in the game:
    μ_c^{(new)} = μ_c^{(old)} + α · (R_final − μ_c^{(old)})
```

- Advantage: uses actual game outcome.
- Disadvantage: crude — every visited cell gets the same update magnitude. Ignores which decisions mattered.
- Variant: weight updates by a heuristic "criticality" score per cell visit.

### F.3 Pre-registered choice

**For the primary experiment, Approach 1 is adopted for controller E
(teacher-based) and Approach 3 is adopted for controller F (learned).**

Justification:

- Controller E is *not* a learned policy in the RL sense. It is a regression from teacher signals. Approach 1 is the natural fitting procedure and matches the SUBIT-CHESS v1.9.x implementation.
- Controller F is a learned policy over game outcomes. Approach 3 is the minimum viable training signal that uses the actual outcome.

**Declared limitation.** Neither approach provides rigorous causal attribution. Any positive result for controller F must be interpreted as *correlational* in the first instance, and confirmed by ablation (controller F_ablated where one cell is reverted to baseline).

### F.4 Ablation confirmation

Before accepting any positive result for controller F, run the **single-cell ablation test**:

```
For a random sample of 8 cells (of 48):
    ρ_s^{ablated} = ρ_s^{learned} with this cell set to baseline
    Match ρ_s^{ablated} vs ρ_s^{learned} on V_val
    Record ΔElo per cell
```

**Interpretation.**

- If the ablation shows no significant Elo difference for any cell: the learned policy is not exploiting per-cell structure. Report as negative for cell-specific learning.
- If ablation shows significant difference for cells with high `|μ_c|`: consistent with credit assignment approach.
- If ablation shows significant difference for cells with low `|μ_c|`: the credit assignment is wrong; the effect is not localised.

**Reporting.** Ablation results are reported per-cell alongside the aggregate H₀/H₁ decision.

### F.5 What this does NOT resolve

The choice of credit assignment does not change the *representational capacity* of Π — it changes which cells receive what policy. Even with perfect credit assignment, some cells may be empty (no signal) and others may be over-represented. A cell-visit histogram is reported for all learned controllers to make this visible.

---

*End of SUBIT Experiment Specification v2.0.*
