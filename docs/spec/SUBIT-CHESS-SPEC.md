# SUBIT-CHESS — Formal Specification

**Version 1.0** · derived from **SUBIT-∞ Specification v5.2**

Status: engineering specification · not an empirical theory.

---

## Annotation

This document instantiates the SUBIT-∞ notational system (v5.2) as a formal
specification of the **SUBIT-CHESS** chess engine, currently at **v1.9.1**.

SUBIT-∞ describes self-referential dynamic systems in which the evolution
rule is part of the state, not an external parameter. SUBIT-CHESS is a
concrete instantiation of that pattern for a bounded, tactical domain:
the legal-move structure of Western chess.

The mapping is:

```
SUBIT-∞ level         SUBIT-CHESS implementation
─────────────────────────────────────────────
S₀ (64 cells)         S₀ = I × Z × Φ = 48 cells (chess-coarsened)
ℛ (rule space)        {ρ_s | s ∈ S₀}, per-cell search policy vector
F, g                  evolution of grammar weights + ρ_s updates
Ω                     STABLE / METASTABLE / CYCLIC / CHAOTIC search regimes
d_Ω                   divergence horizon between search trajectories
ℛ*, U                 universal teacher telemetry + interpreter
ℒ (internal language) __subit console API
P(τ)                  teacher run → ρ_s (canonical construction)
```

The specification distinguishes three epistemic layers explicitly, per
SUBIT-∞ §19:

- **(a) Formal** — what is mathematically true in the notation.
- **(b) Empirical** — what is observed in engine runs (A/B, teacher reports).
- **(c) Interpretive** — what the researcher claims the observation means.

Claims are labelled by layer. No claim crosses layers silently.

---

## Table of Contents

**Part I. Alphabet and State Space**
1. The four primitive markers
2. S₀ for chess — 48-cell morphological space
3. Hexagram notation for SUBIT-64 (for reference)

**Part II. Evolution**
4. Rule space ℛ for chess
5. Evolution operator F and meta-evolution g
6. Trajectories in finite S₀ × ℛ

**Part III. Classifier and Structure**
7. Ω classifier for search dynamics
8. Belnap four-valued evaluation layer
9. Category of morphisms between cells

**Part IV. Infinite Extension**
10. The 64-cell reference space S_64 and its projection to S₀
11. Semantic ultrametric on search trajectories

**Part V. Application**
12. Teacher telemetry as P(τ)
13. Search policy ρ_s — canonical construction
14. A/B protocol — empirical status
15. Implementation mapping — theory ↔ code

Glossary.
Appendix A — parameter tables.
Appendix B — code anchor index.

---

# Part I. Alphabet and State Space

## 1. The four primitive markers

SUBIT-∞ §1 fixes a base alphabet of cardinality 4. Chess instantiates it
twice, on different axes:

### 1.1 Initiative axis (WHO)

```
A_I = { ATTACK, PRESSURE, DEFENCE, QUIET }
```

Encoding (bigram, semantics: 10 = strongest, 00 = weakest):

| Bigram | Value | Chess reading |
|---|---|---|
| 10 | ATTACK | legal checks + hanging material for side to move |
| 11 | PRESSURE | sustained king-zone attack without immediate tactic |
| 01 | DEFENCE | side to move is under threat |
| 00 | QUIET | no imminent tactic |

### 1.2 Zone axis (WHERE)

```
A_Z = { KING, CENTER, GLOBAL }
```

Chess-coarsened from the SUBIT-∞ 4-value axis (see §2, §10). The fourth value
`QUEENSIDE` is removed by the coarsening argument in §10.

### 1.3 Phase axis (WHEN)

```
A_Φ = { OPENING, MIDDLEGAME, TACTICAL, ENDGAME }
```

Directly the SUBIT-∞ `WHEN` alphabet.

### 1.4 Logical realization (Belnap)

```
𝔸 = { T, F, B, N }
```

Carries the SUBIT-∞ bilattice structure (§7). Chess maps evaluation
components to this alphabet in §8.

## 2. S₀ for chess — 48-cell morphological space

**Definition 2.1.** The chess morphological space is

```
S₀_chess = A_I × A_Z × A_Φ
|S₀_chess| = 4 × 3 × 4 = 48
```

Each state `s = (i, z, φ)` is the **morphological signature** of a position
relative to the side to move. Encoding: 6-bit word `b₁b₂ b₃b₄ b₅b₆`, but with
`WHERE` allocated 2 bits of which one value is unused (coarsened).

**The classification function** `computeS(pos) → S₀_chess` is defined
operationally by the trio of scoring rules in §2.1–2.3. All thresholds are
part of the specification, not tunable parameters.

### 2.1 Initiative score

```
I_score(pos) = 3·legalChecks(pos)
             + (hanging_opp(pos) − hanging_me(pos)) / 120
             + (kingPressure_opp(pos) − kingPressure_me(pos)) / 6
             − 5·[side to move is in check]
```

Classification:

```
I_score ≥  8  →  ATTACK
I_score ≥  3  →  PRESSURE
I_score ≤ −4  →  DEFENCE
otherwise     →  QUIET
```

### 2.2 Zone score

```
ΔkingZone   = kingPressure_opp − kingPressure_me
Δflank      = pawnDiff(files 0,1,2) − pawnDiff(files 5,6,7)
centreTension = #files f∈{2,3,4,5} with both sides having pawns
```

Classification:

```
|ΔkingZone| ≥ 8 ∧ |ΔkingZone| > 3·|Δflank|  →  KING
centreTension ≥ 2                            →  CENTER
otherwise                                    →  GLOBAL
```

### 2.3 Phase score

```
nonKingMaterial = total material excluding kings
majors          = number of Q and R on board
volatility      = tacticalVolatility(pos)  (see §2.4)
```

Classification:

```
volatility ≥ 4                 →  TACTICAL
nonKingMaterial ≥ 5500 ∧ majors ≥ 6 →  OPENING
nonKingMaterial ≤ 2000 ∨ majors ≤ 1 →  ENDGAME
otherwise                      →  MIDDLEGAME
```

### 2.4 Tactical volatility

```
volatility(pos) = 4·[side to move in check]
                + min(legalChecks(pos), 3)
                + [myHanging ≥ 300] + [100 ≤ myHanging < 300]
                + [oppHanging ≥ 300]
```

Bound: `volatility ∈ [0, 9]`. Threshold 4 corresponds to "at least one
tactical motif active".

## 3. Hexagram notation (reference)

Per SUBIT-∞ Appendix A, each of the 64 states of the un-coarsened S₀ = 4×4×4
maps bijectively to a hexagram. The SUBIT-CHESS implementation **does not**
use this notation for its 48-cell chess grid — the mapping is not surjective.
Hexagrams remain available for two uses:

- reference in cross-domain research (SUBIT-∞ applications outside chess),
- external documentation of the SUBIT-64 pre-coarsening grid (v1.8.3 lineage).

---

# Part II. Evolution

## 4. Rule space ℛ for chess

**Definition 4.1.** The chess rule space is

```
ℛ = { ρ_s | s ∈ S₀_chess }
```

where each `ρ_s` is a **search policy vector**

```
ρ_s = (d_base, r_LMR, r_null, b_futility)
```

with component ranges:

| Component | Range | Effect |
|---|---|---|
| `d_base` | `[−1, +2]` (integers) | root depth shift |
| `r_LMR` | `[1, 3]` | LMR threshold multiplier |
| `r_null` | `[1, 3]` | null-move R |
| `b_futility` | `[80, 250]` cp | futility margin |

The **effective search parameters** used by `alphaBeta` are derived via the
mapping in §13.3.

**Remark 4.1.** This is the SUBIT-∞ `ℛ` for the specific case where the
evolution rule is a search-resource policy, rather than a state transition
on the chessboard. The chessboard itself is not modified by ρ_s; only the
*allocation of computational effort* is.

**Remark 4.2.** `ℛ` has cardinality at most `|S₀_chess| = 48`, but is realized
with only **8 active cells** in v1.9.1 (§13.1). The other 40 cells use the
baseline policy:

```
ρ_baseline = (0, 2, 2, 150)
```

## 5. Evolution operator F and meta-evolution g

**Definition 5.1.** The evolution operator on the extended state

```
ŝ = (pos, ρ_s) ∈ Positions × ℛ
```

is

```
F(ŝ) = (makeMove(pos, m*), g(ρ_s, pos))
```

where:
- `m*` is the move selected by the search under policy `ρ_s`,
- `g : ℛ × Positions → ℛ` is the meta-evolution defined in §5.2.

### 5.1 The move selection `f_ρ`

`f_ρ_s(pos)` = the principal variation move returned by `alphaBeta` under the
effective parameters derived from `ρ_s` (§13.3). This is deterministic
modulo tie-breaking; in the engine, ties break by move ordering order,
which is TT-history fixed.

### 5.2 The meta-evolution `g`

For chess, `g` updates the **grammar weights** in cell `keyOfS(s)`, not the
policy vector directly (see §13.2 for the full ρ_s update path). The
component function is:

```
g_weight(w, omega, outcome) = clamp(w + step(omega) · outcome, 0.40, 1.80)
```

with per-Ω step:

```
step(STABLE)     = 0.03
step(METASTABLE) = 0.08
step(CHAOTIC)    = 0.05
step(CYCLIC)     = 0.03
```

and `outcome ∈ {−1, 0, +1}` = sign of the eval delta seen by the mover.
The specific weight component nudged depends on `omega` (SUBIT-CHESS §G(S)
implementation; see `SubitState.prototype.nudgeCellWeights`).

### 5.3 ρ_s is *not* updated online in v1.9.1

This is deliberate (ADR 0006, ADR 0005). The meta-evolution `g` touches grammar
weights, morphisms, and visited-objects — but **ρ_s is frozen** after
initialization from teacher telemetry (§13.2). The decision to keep `g`
separate from the ρ_s construction is what makes the current A/B test clean.

## 6. Trajectories in finite S₀_chess × ℛ

**Claim 6.1 (finite periodicity, SUBIT-∞ §5.1 analog).** In self-play games
under fixed initialization, the sequence `τ = (ŝ₀, ŝ₁, …)` visits a finite
set of morphological cells. By the pigeonhole principle applied to
`S₀_chess × ℛ`, the induced **cell trajectory**

```
σ(τ) = (keyOfS(computeS(pos₀)), keyOfS(computeS(pos₁)), …)
```

eventually enters a repeating pattern on the cell alphabet, even though the
underlying position sequence does not repeat (chess is not a finite-state
system in the strict sense — halfmove counter and castling rights prevent it).

**Corollary 6.2.** The Ω-classification on cell trajectories (§7) always
terminates. Genuinely non-periodic cell dynamics, if observed, is an
artifact of coarsening (§10) or of search stochasticity (ε-greedy), not of
the cell alphabet.

---

# Part III. Classifier and Structure

## 7. Ω classifier for search dynamics

**Definition 7.1.** For a set `P ⊆ Positions` with cell-mapped image
`π(P) ⊆ S₀_chess`, the stability class is defined by the SUBIT-∞ §6.1 rules
applied to the induced cell-set map:

```
STABLE       ⟺  F(P) = P
METASTABLE   ⟺  F(P) ⊊ P
CYCLIC       ⟺  ∃k>1: Fᵏ(P) = P ∧ F(P) ≠ P
CHAOTIC      ⟺  F(P) ⊄ P ∧ ∀k>1: Fᵏ(P) ≠ P
```

**Implementation note.** In the engine, `Ω` is currently computed on the
**eval-history trace** of a single search, not on the full state map. The
function `classifyOmegaSearch(history)` implements a practical proxy:

```
input:  history = [eval(d=1), eval(d=2), ..., eval(d=K)]
        diffs   = first differences
        mean    = mean(diffs)
        var     = variance(diffs)
        osc     = sign-change rate of diffs

STABLE       if  var < 200  ∧  |mean| < 30
CYCLIC       if  osc > 0.5
CHAOTIC      if  var > 1500
METASTABLE   otherwise
```

**Claim 7.2 (proxy faithfulness).** For eval-history traces of length K ≥ 3,
the proxy `classifyOmegaSearch` agrees with the SUBIT-∞ Ω-definition applied
to the set `P = {pi ∈ Positions | pi ∈ PV(history)}` in ≥ 95% of cases on the
current engine (empirical, from teacher runs at depth 4).

**Proof status:** open (empirical claim, see §14). The threshold constants
(200, 30, 0.5, 1500) are calibration parameters, not derived from Ω.

## 8. Belnap four-valued evaluation layer

**Definition 8.1.** The evaluation function maps a position to a Belnap value
per component:

```
𝔸 = { T, F, B, N }     (SUBIT-∞ §1.4)
```

For each of the 6 base components `{material, positional, mobility, king,
pawns, bishop}` and the 7 extended components `{threats, kingAttack,
rookFiles, outposts, trapped, space, tempo}`, the truth value is assigned by:

```
T  ⟺  value > +thr_c
F  ⟺  value < −thr_c
N  ⟺  |value| ≤ thr_c
B  ⟺  (implied by component interactions, e.g. king attack + king defence
       both positive for both sides in some endgame configurations)
```

The thresholds `thr_c` are fixed constants per component (see Appendix A).
Component aggregation to a total Belnap value uses the SUBIT-∞ §7 lattice:

```
∧ = min,   ∨ = max,   order: CHAOTIC < CYCLIC < METASTABLE < STABLE
```

**The bilattice is not the same as Ω.** Ω classifies *dynamics*, Belnap
classifies *propositional truth per component*. They co-exist: a cell can be
`STABLE` (Ω) while its material component is `B` (Belnap).

## 9. Category of morphisms between cells

**Definition 9.1.** A **morphism** `m : s_b → s_a` between two cells in
`S₀_chess` is recorded when a legal move transitions the position from a
state with signature `s_b` to one with signature `s_a`. The morphism carries:

```
m = (s_b, s_a, count, avgDelta)
```

where `avgDelta` is the running mean of the eval delta seen by the mover.

**Composition.** Per SUBIT-∞ §8.2, composition is:

```
s_b → s_c  :=  s_b → s_a  ∘  s_a → s_c
```

with confidence:

```
conf(s_b → s_c) = min(count(s_b → s_a), count(s_a → s_c)) · 0.5
```

and averaged delta. The engine computes and stores composed morphisms in
`SubitState.composedMorphisms` (Map, keyed by `s_b → s_c`).

**Natural transformations.** Three projections are maintained:

```
Π_I : Π_ATTACK, Π_PRESSURE, Π_DEFENCE, Π_QUIET      (projection on WHO)
Π_Z : Π_KING,   Π_CENTER,   Π_GLOBAL                (projection on WHERE)
Π_Φ : Π_OPENING, Π_MIDDLEGAME, Π_TACTICAL, Π_ENDGAME
```

Each projection is the weighted average of cell weights for cells sharing
the corresponding value. The **naturality defect** `η(s)` per cell is the
L1 distance between the cell's weight vector and its consensus (average of
the three projections):

```
η(s) = (1/6) · Σ_{k=1}^{6} |w_k(s) − consensus_k(s)|
```

Regularization pulls each cell toward consensus with a per-cell step
`1/(1 + 0.7 · visits)`.

---

# Part IV. Infinite Extension

## 10. The 64-cell reference space S₆₄ and its projection to S₀

SUBIT-∞ fixes `|S₀| = 64`. SUBIT-CHESS uses 48. The reduction is documented
in ADR 0001 and formalized here:

**Definition 10.1.** The 64-cell reference space is

```
S₆₄ = A_I × A_Z_ext × A_Φ
A_Z_ext = { KING, CENTER, QUEENSIDE, GLOBAL }
```

**Definition 10.2.** The coarsening map is

```
κ : S₆₄ → S₀_chess
κ(ATTACK, QUEENSIDE, φ)  = (ATTACK, GLOBAL, φ)
κ(x, y, φ)               = (x, y, φ)   for y ≠ QUEENSIDE
```

**Empirical justification for κ (ADR 0001).** `QUEENSIDE` and `GLOBAL`
classes had overlapping signal distributions on the 48-cell teacher run:
the Jaccard of their signal-cell sets was ≥ 0.9. Coarsening did not
reduce signal rate.

**Remark 10.1.** κ is not information-preserving. It is a deliberate lossy
projection that trades grid resolution for per-cell sample density. This is
a **choice under the researcher's control**, not a property of the domain —
see §14.4 for the sensitivity analysis protocol.

## 11. Semantic ultrametric on search trajectories

**Definition 11.1 (SUBIT-∞ §15.1 instantiation).** For two extended states
`ŝ, t̂` (positions with their induced cell signatures), the divergence
horizon is

```
n₀(ŝ, t̂) = min{ n ≥ 0 : Ω(σⁿ(ŝ)) ≠ Ω(σⁿ(t̂)) }
```

where `σⁿ` is the cell trajectory after n plies under fixed policy.

**Definition 11.2.** The semantic ultrametric is

```
d_Ω(ŝ, t̂) = 2^(−n₀(ŝ, t̂))    if n₀ is defined
d_Ω(ŝ, t̂) = 0               if Ω agrees at all horizons
```

**Properties (SUBIT-∞ §15.1).** `d_Ω` is a pseudo-ultrametric on the space
of positions with fixed initial policy; it is a true ultrametric on the
quotient by Ω-agreement.

**Operational use.** `d_Ω` provides a metric for the researcher to quantify
how "far apart" two candidate policies are in their search behaviour. It is
not currently exposed in the `__subit` API, but is computable from stored
teacher trajectory entries (§12).

---

# Part V. Application

## 12. Teacher telemetry as P(τ)

**Definition 12.1 (canonical P(τ) for chess).** Following SUBIT-∞ §18, the
canonical map from a self-play trajectory `τ` to a set `P(τ) ⊆ Positions` is:

```
P(τ) = { pos ∈ τ | computeS(pos) ∈ ω-support(τ) }
```

where `ω-support(τ)` is the set of cells visited infinitely often by the cell
trajectory `σ(τ)` — practically approximated by cells visited with count ≥ 20
and |t-statistic of mean reward| ≥ 2.

**Two implementation tracks (SUBIT-CHESS v1.9.1):**

### 12.1 Raw telemetry (level 2)

`recordTelemetryForMove(posBefore, posAfter, omega)` writes to the raw Δeval
store. Per cell:

```
{ n, mean(reward), variance, tStat, omegaCounts }
```

This is `P_raw(τ)` in the notation of §12.

### 12.2 Teacher telemetry (level 3)

`batchTeacherEval({depth, R_max, concurrency})` re-evaluates each unique FEN
in the raw trajectory at fixed depth, replaces the raw Δeval with
`sign · (V_teacher(after) − V_teacher(before))`, clipped to `[−R_max, +R_max]`.

This is the "canonical" `P(τ)` used to construct ρ_s. It is **deeper but
slower**, and produces the signal set used in §13.

**Remark 12.1 (SUBIT-∞ §18.4 — the ω-limit trap).** The naive construction
`P(τ) := ω-limit(τ)` collapses Ω to a constant (§18.4). The chess
implementation avoids this by construction: `P(τ)` retains the **entire
teacher-evaluated FEN set**, not just its asymptotic limit. The signal set
is a filtering of `P(τ)`, not a limit of it.

## 13. Search policy ρ_s — canonical construction

### 13.1 Active cells (from teacher run)

**Data source:** 48-cell teacher run on 6548 unique FENs, produced by a
100-game self-play trajectory at depth 2, teacher-evaluated at depth 4.

**Signal filtering:** cells with `n ≥ 20 ∧ |tStat| ≥ 2`. Result: **8 cells**.

| Cell | n | coverage of transitions |
|---|---:|---:|
| QUIET\|CENTER\|OPENING | 1370 | 20.9% |
| QUIET\|CENTER\|MIDDLEGAME | 871 | 13.3% |
| QUIET\|GLOBAL\|MIDDLEGAME | 727 | 11.1% |
| PRESSURE\|CENTER\|OPENING | 510 | 7.8% |
| DEFENCE\|CENTER\|TACTICAL | 194 | 3.0% |
| QUIET\|CENTER\|TACTICAL | 128 | 2.0% |
| QUIET\|GLOBAL\|OPENING | 86 | 1.3% |
| QUIET\|CENTER\|ENDGAME | 43 | 0.7% |
| **total** | **3929** | **60.0%** |

Coverage ratio: `3929 / 6548 = 60.0%`. The other 40 cells carry the remaining
40% of transitions and use `ρ_baseline`.

### 13.2 ρ_s construction from teacher means

Given a teacher report `T = { cell → (n, mean, variance, tStat) }`, for each
active cell `c ∈ Active`:

```
norm(c)      = clamp(mean(c) / 100, −1.5, +1.5)
d_base(c)    = clamp(2 + 0.5·norm(c),  1,   4)
r_LMR(c)     = clamp(2 − 0.4·norm(c),  1,   3)
r_null(c)    = clamp(2 − 0.2·norm(c),  1,   3)
b_futility(c)= clamp(150 + 30·norm(c), 80, 250)
```

**This is the SUBIT-∞ P(τ) instantiation.** The mapping from teacher mean to
search parameter is a monotone function of the empirical reward — a design
choice, not a theorem.

**Freeze invariant.** After construction, `rhoSFrozen = true`; no online
update. This is essential for the A/B validity (§14).

### 13.3 Mapping to effective search parameters

```
d_base_shift      = round(d_base) − 2                ∈ {−1, 0, +1, +2}
lmr_mult          = round(2 − r_LMR)                 ∈ {−1, 0, +1}
null_enabled      = (r_null ≥ 1.5)                   ∈ {true, false}
nullR             = round(r_null)                    ∈ {1, 2, 3}
futility_mult     = round((b_futility − 150) / 50)   ∈ {−1, 0, +1}
futMargin         = round(b_futility)                ∈ [80, 250]
```

Effective LMR threshold at runtime:

```
lmr_threshold = clamp(base_lmr − lmr_mult, 2, 8)
```

Futility margin:

```
FUT_D1 = futMargin
FUT_D2 = round(1.5 · futMargin)
```

Root depth:

```
effective_depth = base_depth + d_base_shift + omega_depth_shift
```

## 14. A/B protocol — empirical status

### 14.1 Pre-registered gate (ADR 0008)

**Metric:** `Δmean reward per transition` on the 8 active cells.

**Gate:**

| Condition | Verdict |
|---|---|
| `Δmean > +15 cp` | PASS (screening) → extend to 400 games with 95% CI |
| `Δmean ∈ [−5, +15] cp` | MARGINAL → policy tuning or more games |
| `Δmean < −5 cp` | FAIL → rollback ρ_s |

**Sample size:** 200 games screening, 400 games confirmation.

**Honest statistics:** SE ≈ 27 Elo at 200 games → `+15` is `< 1σ`. Screening only.

### 14.2 Epistemic layering

| Claim | Layer | Status |
|---|---|---|
| `classifyOmegaSearch` matches SUBIT-∞ Ω on eval traces | (b) empirical | ≥ 95% at depth 4 |
| `ρ_s` construction from teacher means | (a) formal | §13.2 |
| `ρ_s` improves A/B mean reward | (b) empirical | **not yet measured** |
| `ρ_s` improves A/B Elo | (b) empirical | **not measured** |
| `S₀_chess` is a valid morphological reduction | (c) interpretive | ADR 0001 argument |
| `Ω` is a meaningful stability classifier for chess | (c) interpretive | design choice |

**Rule (SUBIT-∞ §19.3 step 6):** no claim crosses layers silently.
Formal claims are marked (a), empirical claims require citation to a run
ID, interpretive claims require ADR reference.

### 14.3 Open empirical questions (v1.10+)

- `ρ_s` effect on A/B mean reward (the gate above).
- `d_Ω` predictive value for policy divergence (SUBIT-∞ §15).
- 64-cell vs 48-cell vs 32-cell signal rate stability (§10).
- Teacher leakage: does ρ_s trained on self-play generalize to held-out
  FENs? (See §14.4.)

### 14.4 Sensitivity analysis protocol (SUBIT-∞ §19.3, step 0)

Before any claim about Ω or ρ_s on a **continuous** domain, the researcher
must:

1. Fix a partition of the continuous space into the alphabet A = {WHO, WHERE,
   WHEN} (§2).
2. Verify that Ω classification is stable under coarsening/refinement of
   that partition.
3. Report partition sensitivity as part of the empirical claim.

For chess this is mitigated because the domain is already discrete (the
board is a finite state space), but the **cell coarsening** κ (§10.2) is a
partition choice subject to the same protocol.

## 15. Implementation mapping — theory ↔ code

Every formal construct in this specification maps to a concrete code anchor.

| Formal (this spec) | Code anchor | File |
|---|---|---|
| `A_I, A_Z, A_Φ` | `subit.WHO_LIST`, `subit.WHERE_LIST`, `subit.WHEN_LIST` | `src/subit_chess_v1.9.1.html` |
| `computeS(pos)` | `computeS` in `makeSubitModule` | same |
| `keyOfS(s)` | `keyOfS` | same |
| `ℛ` (rule space) | `ACTIVE_POLICY_CELLS` (8 active), `BASELINE_POLICY` | same |
| `F`, `f_ρ`, `g` | `SubitState.prototype.recordMove` + `nudgeCellWeights` | same |
| `ρ_s` construction | `SubitState.prototype.initRhoSFromTeacher` | same |
| `Ω` (proxy) | `classifyOmegaSearch` | same |
| Belnap layer | `subitEvaluate` + `belBadge` | same |
| Morphisms | `recordDirectMorphism`, `buildCompositions` | same |
| `η` | `naturalityDefect` | same |
| `d_Ω` | **not implemented in v1.9.1** (future) | — |
| `P(τ)` teacher | `batchTeacherEval` + `teacherReport` | `runners/run.js` |
| A/B gate | `mode match` in `runners/run.js` | same |
| `__subit` API (ℒ) | `window.__subit` | `src/subit_chess_v1.9.1.html` |

Full parameter tables: Appendix A.
Full code anchors: Appendix B.

---

# Glossary

| Symbol | Definition | Level |
|---|---|---|
| A_I, A_Z, A_Φ | Base alphabets for initiative, zone, phase | I |
| S₀_chess | 4 × 3 × 4 = 48 morphological cells | I |
| ŝ = (pos, ρ_s) | Extended state: position + active policy | II |
| ℛ | Rule space `{ρ_s \| s ∈ S₀_chess}` | II |
| ρ_s | Policy vector `(d_base, r_LMR, r_null, b_futility)` | II |
| F, f_ρ, g | Evolution, local rule, meta-evolution | II |
| Ω | Search-regime classifier | III |
| 𝔸 | Belnap alphabet {T, F, B, N} | III |
| η(s) | Naturality defect of cell s | III |
| S₆₄ | 4 × 4 × 4 reference space | IV |
| κ | Coarsening map S₆₄ → S₀_chess | IV |
| d_Ω | Semantic (pseudo)ultrametric | IV |
| P(τ) | Canonical trajectory → set map | V |
| ρ_baseline | `(0, 2, 2, 150)` — used by non-active cells | II |

---

# Appendix A — Parameter tables

## A.1 Belnap thresholds per component

| Component | thr_c (cp) |
|---|---:|
| material | 30 |
| positional + mobility | 20 |
| king | 5 |
| pawns | 5 |
| bishop | 10 |
| context (extended sum) | 40 |

## A.2 ρ_s bounds

| Parameter | min | max | step |
|---|---:|---:|---:|
| `d_base` | 1 | 4 | 0.5 · norm |
| `r_LMR` | 1 | 3 | 0.4 · norm |
| `r_null` | 1 | 3 | 0.2 · norm |
| `b_futility` | 80 | 250 | 30 · norm |

`norm ∈ [−1.5, +1.5]` from `clamp(mean/100, −1.5, +1.5)`.

## A.3 Signal-cell filter

```
signal cell  ⟺  n ≥ 20  ∧  |tStat| ≥ 2
```

## A.4 Coverage metrics

```
visitedShare = visitedCells / 48
signalShare  = signalCells  / 48
```

(ADR 0004 fixed the denominator; the pre-1.9.1 bug used 64 as fallback.)

---

# Appendix B — Code anchor index

## B.1 `src/subit_chess_v1.9.1.html`

| Function / symbol | Line region | Purpose |
|---|---|---|
| `makeChessModule` | ~600–1300 | board, moves, hash, perft |
| `computeComponents` | ~1050 | 13-component eval |
| `makeSubitModule` | ~1400–1900 | S₀, Ω, ρ_s, Belnap |
| `computeS` | ~1650 | morphological classification |
| `classifyOmegaSearch` | ~1800 | Ω proxy |
| `SubitState.prototype.initRhoSFromTeacher` | ~1950 | ρ_s canonical construction |
| `SubitState.prototype.policyFor` | ~2000 | ρ_s → policy |
| `SubitState.prototype.searchParamsFor` | ~2050 | ρ_s → effective search params |
| `makeSearchModule` | ~2200–2800 | alphaBeta, quiescence, LMR, null-move |
| `makeTeacherTelemetryModule` | ~3100 | teacher v3 store |
| `batchTeacherEval` | ~3700 | offline teacher evaluation |
| `window.__subit` | ~4300 | internal language ℒ |

## B.2 `runners/run.js`

| Mode | Purpose |
|---|---|
| `selfplay` | run N games, populate telemetry |
| `teacher` | selfplay + batch teacher eval + snapshot |
| `match` | A/B: policy on/off, output Δmean reward |

## B.3 `tests/test.js`

Groups: `perft`, `engine`, `S0`, `policy`. 100 assertions at v1.9.1.

---

*End of SUBIT-CHESS Specification v1.0 — derived from SUBIT-∞ v5.2.*
