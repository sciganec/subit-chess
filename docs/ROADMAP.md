# Roadmap

Direction for **subit-chess** after v3.0.9.

Guiding principles (unchanged):
- **Evidence over ambition.** Every next step has a pre-registered gate.
- **Honest probabilities.** If a path is unlikely to work, say so.
- **Kill criteria are first-class.** Every item names what would make us stop.
- **No new mechanisms** until the current one is measured.

Superseded: the v1.9.x roadmap (ρ_s A/B gates, online ρ_s learning) is dead. ρ_s, the
teacher pipeline and the diffusion generator were removed in v3 — see
`CHANGELOG.md` [3.0.0] § Removed and `docs/DECISIONS.md` ADR 0013.

---

## Current state — v3.0.9 (2026-11-19)

**Status:** Engine core rewrite + correctness pass. Strength demonstrated so far is a
single large fix (evaluation perspective); everything else is still inside the noise band.

**What is measurably true:**

| Claim | Evidence |
|---|---|
| The perspective fix is worth a lot | 12-0 vs pre-fix modules at depth 3/4 |
| The fast eval tier is not yet a win | 52.5% ± 13.3 over 20 games, depth 3 |
| Depth is not yet paying | depth 5 vs 4: 45.8% ± 22.4 over 12 games |
| Structural layers do not yet pay | `base` vs `plain`: 56.3% ± 34.3 over 8 games |
| The root move is a true argmax | brute-force comparison on 3 positions: 8/109/82 |
| A forced mate is no longer hidden by futility pruning | regression in `tests/engine.eval.mjs`, v3.0.1 |
| Repetition survives `Engine.play`, and both hash halves are compared | `tests/engine.eval.mjs`, ADR 0016, v3.0.3 |
| A node budget and the fast/structural switch are honoured | `tests/engine.eval.mjs`, v3.0.3 |
| The same position and depth give the same move | `tests/engine.eval.mjs` §12, ADR 0017, v3.0.4 |
| The leaf tier is faster without changing its value | ADR 0018, v3.0.5: 472k → 589k eval/s, +7.4% nodes/s, identical values on 10 positions, identical tree (503402 nodes) |
| Uncertainty is a vector with evidence, not a penalty | ADR 0019, v3.0.6: 36 checks, no scalar blend, certificate on every search result, deterministic profile |
| The engine validates its input before touching the board | ADR 0020, v3.0.7: 66 checks in `tests/engine.audit.mjs`, atomic FEN validation, claimable draws stay playable |
| A rule-50 draw cannot be scored by a cached pre-boundary entry | ADR 0021, v3.0.8: `Position.ttKey` buckets the halfmove clock, TT and the structural cache key on it |
| A plan needs all five feasibility axes to be accepted | v3.0.8: `admitted` (rule + structure) vs `accepted` (all five), rejected plans carry the full vector |
| The engine searches off the main thread and reads its own Memory | ADR 0021, v3.0.8: `tests/engine.worker.mjs`, one `Engine` per worker, `prevBest`/`prevScore` seeding |
| The shipped UI survives a custom start position | v3.0.8: PGN `SetUp`/`FEN`/result, undo to the base FEN, captures counted against it, keyboard play |
| Horizon scores come from searched, legal positions | ADR 0022, v3.0.9: no stand-pat in check, qdepth cap resolves an evasion, stalemate at any qdepth, claimable draws searched, root honours automatic draws; 12 checks in `tests/engine.audit2.mjs` |

**What is not yet known:**
- Does a ply of depth convert into strength? (the `--a base@5 --b base@4` regression)
- Do the structural layers (plans, context, structure) earn their cost?
- Where is the real playing strength of v3? No external sparring partner, no EPD set with
  `bm` — every number above is self-play.

**Open hazards:**
- **Opening breadth.** The suite is 12 fixed positions, colour-alternated; per-opening
  variance dominates the interval and there is no knob to widen the set. Games do end on
  fivefold repetition / the 75-move rule (`status()` is checked after every move), so the
  300-ply cap is not what contaminates the numbers — but it is also not reported, so the
  mean game length of a run is currently unknown.
- **Sample size.** 8-20 games gives a ±13-34 pp interval. Anything below ~100 Elo is
  unmeasurable at that size.
- **Debt:** `contextBonus` in `index.mjs` always returns 0 (dead ordering term);
  `Score.diff` is never written. (TT aging landed in 3.0.4: entries older than one
  generation are ignored; v3.0.9 narrows this to one search and applies the same
  rule to move hints, `tests/engine.eval.mjs` §12.) (`unmakeNullMove` was
  re-checked: it restores `turn` from the undo record, there is no `stm++` bug.)
- **Audit closure (v3.0.8).** All P1 and all P2 items of the v3.0.6 audit are
  closed, plus P3.1. The six P0 items (AUD-01…AUD-06) of the v3.0.8 second
  audit were closed in v3.0.9; AUD-07…AUD-09 (null-move/repetition, dead
  material in the horizon, null-move state equivalence) remain open P1.
  The remaining P3 items (self-play loop, parameter control,
  independent validation set, version comparison, strength measurement) are
  served by `bench/match.mjs`, `engine.learn` and `selfplay` but have never been
  run at the sample size Gate 1 requires; they stay on this list rather than
  being marked done.

---

## Gate 1 — opening breadth and reported game length

**Why first:** with 12 fixed openings the per-opening variance is the whole interval, and a
run whose mean length is unknown cannot be compared with the next one.

**Actions:**
1. `bench/match.mjs`: report mean/median plies, the number of games that hit the 300-ply cap
   and the reason (`status()` reason vs cap) in the summary.
2. Widen the opening set (`bench/fens/openings.epd` already parses; add 12-24 quiet
   middlegame/opening FENs) and add `--suite`/`--variety` handling for a randomised pick so
   two runs do not share the same opening order.
3. Anti-repetition only if the report shows shuffling: penalise positions seen twice in the
   search (the draw rules stay authoritative).

**Gate:** the summary reports length distribution, and no more than 10% of games reach the
cap in a 100-game run at depth 4.

**Kill criterion:** if variety makes the engine measurably weaker (loss of ≥ 50 Elo vs
`base` over 100 games), the book is wrong — shrink it, don't disable it.

---

## Gate 2 — does depth convert into strength?

**Pre-registered metric:** score of `base@5` vs `base@4` over 100 games at depth 5.
**Decision table:**

| Result | Verdict | Action |
|---|---|---|
| score ≥ 60% (CI.lo > 0.5) | depth works | keep pruning/LMR as is; spend effort on eval |
| 50-60% (CI spans 0.5) | weak signal | 200 games; then investigate pruning aggressiveness |
| < 50% (CI.hi < 0.5) | depth is broken | ablation of `nopruning` / `nolmr` / `nonull` / `noasp`, 100 games each |

**Prior:** depth is the one thing a search must deliver; a negative result here would mean
a search bug, not a tuning problem. Estimate: PASS 70%, MARGINAL 20%, FAIL 10%.

**Kill criterion:** if `nopruning` beats `base` at depth 5 by > 0.5, the pruning is
over-aggressive — remove it rather than tune it.

---

## Gate 3 — do the structural layers earn their cost?

**Pre-registered metric:** `base` vs `plain` (no structure, no plans, no context) over
100 games at depth 4, plus `nostruct`, `noplans`, `noctx` individually.

**Decision table:**

| Result | Verdict | Action |
|---|---|---|
| base wins with CI.lo > 0.5 | layers pay | keep; tune weights per doc 05 |
| CI spans 0.5 | inert | profile the cost; either raise the weights or delete the layer |
| base loses with CI.hi < 0.5 | layers hurt | delete the layer and record an ADR |

**Prior:** the layers are hand-weighted and have never been validated end to end.
Estimate: PASS 35%, MARGINAL 40%, FAIL 25%.

**Kill criterion:** any layer that cannot show a positive CI over 200 games is deleted
outright — no "we'll tune it later".

---

## Gate 4 — spec compliance (docs 05/11/31/32/33/36)

Not strength work, but the implementation should not contradict its own specification:

- `plans.mjs`: feasibility checks, `pareto()` wiring, revision handling (doc 11, `SPG-INV-*`).
- `context.mjs`: make `contextAdjust` real instead of a no-op (doc 05 §context).
- `verify.mjs`: extend coverage so every `SVF-INV-*` / `SEARCH-INV-*` has a test.
- `meta.mjs`: threshold calibration against measured risk (docs 29/35).

**Gate:** `npm run test:engine` covers every documented invariant, and no documented
invariant is violated in the invariant suite.

---

## Gate 5 — external validation

Everything above is self-play. Before claiming strength:

1. **EPD suite with `bm`/`am`.** The repository has `bench/fens/*.epd` without `bm`; the
   first task is to build a set with best-move annotations (public sources only, licensed
   for redistribution).
2. **Sparring partner.** A second engine (any UCI engine) to score against, so results do
   not depend on the engine's own evaluation.

**Gate:** ≥ 70% best-move agreement on a 200-position EPD set at depth 6, and a non-negative
result against the sparring partner over 100 games.

**Kill criterion:** if best-move agreement is below 50%, stop tuning parameters and fix the
search/eval contract first — a low agreement rate means the engine is not choosing moves the
way its own specification says it should.

---

## Gate 6 — search throughput (d9 inside the 6 s clock)

**Why:** the top UI level searches `depth: 10` with a 6 s clock (ADR 0017), and at the
v3.0.4-3.0.5 throughput a middlegame `d9` does not fit. Strength per second is the only
lever that does not change the evaluation, so it is worth its own gate.

**Pre-registered metric:** nodes/s on a fixed position at a fixed depth
(`2kr1b1r/p1p2pp1/1pn2q1p/1QPp4/3PbB2/2P2N2/PR2BPPP/5RK1 b - - 1 16`, `d7`, 503402 nodes),
plus the profile of where the time goes. Baseline: ~190k nodes/s in Node, 2654 ms for that
search after v3.0.5 (2860 ms in v3.0.4).

**Plan, in the order the profile justifies:**

| Step | Attacks | Expected | Gate |
|---|---|---|---|
| Staged move generation (captures first, quiets after the cutoff) | `generateMoves` 14.8%, `scoreMoves` 16.8% | 20-40% | `generateMoves` self time < 8% |
| Bitboards (occupancy + attack bitsets) | `generateMoves` 14.8%, `isAttacked` 7.0%, make/unmake 6.5% | 25-40% | `isAttacked` < 3%, make/unmake < 3% |
| Leaf-tier mobility from precomputed ray tables | mobility = 37% of `evaluateFast` | 5-8% | `evaluateFast` < 25% |

**Kill criterion:** if staged generation does not push `generateMoves` below 8%, the
representation is the problem, not the staging — go straight to bitboards. If bitboards do
not reach 300k nodes/s, stop optimizing the search and spend the remaining effort on
selectivity (better pruning, verified by `base` vs `nopruning` over 100 games).

---

## Gate 7 — the uncertainty driver steers verification (doc 45 §16)

**Why:** v3.0.6 computes the eight components and names a driver, but nothing consumes it.
Doc 45 §16 says the vector decides *where* verification is spent, so the honest next step is
to spend a fixed extra budget on the component that leads and measure whether the decision
changes — not to add another knob to the evaluation.

**Pre-registered metric:** on a fixed set of positions, the share of searches whose best move
changes when the extra budget goes to the driver's component (depth for Us, width for Ut,
tablebase/structural check for Um), against a control that spends the same budget uniformly.

**Gate:** the driver-targeted budget changes at least one decision in a set where the
uniform budget does not, and does not change any decision where the profile is already
decisive (Us = 0 on a proven mate).

**Kill criterion:** if targeted spending never changes a decision while uniform spending
does, the driver is not informative and the profile stays descriptive — report it, do not
act on it.

---

## Non-goals for the next release

- Online learning / self-improvement loops (docs 06, 14, 28) — blocked until Gates 1-3 close.
- Multi-PV analysis UI, opening explorer, engine-vs-engine match UI.
- Web Worker search: the UI runs the search on the main thread today; move it only after
  strength work is stable, because it changes nothing about strength.
