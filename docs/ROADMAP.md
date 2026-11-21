# Roadmap

Direction for **subit-chess** after v3.0.10.

Guiding principles (unchanged):
- **Evidence over ambition.** Every next step has a pre-registered gate.
- **Honest probabilities.** If a path is unlikely to work, say so.
- **Kill criteria are first-class.** Every item names what would make us stop.
- **No new mechanisms** until the current one is measured.

Superseded: the v1.9.x roadmap (ρ_s A/B gates, online ρ_s learning) is dead. ρ_s, the
teacher pipeline and the diffusion generator were removed in v3 — see
`CHANGELOG.md` [3.0.0] § Removed and `docs/DECISIONS.md` ADR 0013.

---

## Current state — v3.0.10 (2026-11-21)

**Status:** correctness release. The v3.0.9 audit register §17 is closed 9/9 in
`e98d359` + `be27fe4`; release artifacts are in `ver/subit_chess_v3.0.10/`. This is
**not** a strength release: evaluation weights, pruning parameters, legality rules and
UI behaviour were not changed to seek strength. Full canonical SUBIT conformance is
not claimed — the canonical theory repo still documents v2.2.0 as the latest chess
version, and SUBIT-∞ v6.14.x is DRAFT / NOT STABLE.

Strength demonstrated so far is still a single large fix (evaluation perspective);
everything else remains inside the noise band.

**Post-v3.0.10 development (unreleased worktree, no version bump or tag):** the Gate 1
harness now prints per-opening W/D/L and an Elo-scaled CI, and `bench/fens/openings.epd`
has 24 quiet legal positions with a SHA-256 in `bench/fens/CHECKSUMS`. The dead
`contextBonus` is removed; bounded quiet checks are implemented behind
`params.search.qsearch` with a `noqchecks` ablation; the uncertainty budget now grows
with uncertainty and `plan.structuralEvalDepth` is applied; the early-exit stalemate probe,
unified mate scale and single-owner SVF (`SVF-INV-007` executable check) are in place.
The match harness now preserves the game repetition stack across moves, so Gate 1 passes
its length gate (9/100 caps at depth 4). None of this is in tag `v3.0.10`; no item has
passed a 100-game *strength* gate yet.

**What is measurably true:**

| Claim | Evidence |
|---|---|
| The perspective fix is worth a lot | 12-0 vs pre-fix modules at depth 3/4 |
| The fast eval tier is not yet a win | 52.5% ± 13.3 over 20 games, depth 3 |
| Depth pays | depth 5 vs 4: 68.0% ± 8.1 over 100 games, CI 59.9-76.1% (corrected harness) |
| A1 quiet checks at the horizon pay | base 63.0% ± 9.3 vs noqchecks over 100 games, CI 53.7-72.3%, 0/100 caps |
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
| The v3.0.9 audit register is closed | v3.0.10: 9/9 §17 findings closed or verified non-reproducible; 51 checks in `tests/engine.audit309.mjs`, 34 in `tests/engine.tactics.mjs`, deterministic build |
| Self-play observations are independent | v3.0.10: seed selects a legal start FEN, colours are balanced, W/D/L are complete, validation seeds are disjoint and reported but never used for acceptance |

**What is not yet known:**
- Do the structural layers (plans, context, structure) earn their cost? The A1 horizon gate
  passed, but the `base` vs `plain`/`nostruct`/`noplans`/`noctx` 100-game runs have not.
- Where is the real playing strength of v3? No external sparring partner, no EPD set with
  `bm` — every number above is self-play.

**Open hazards:**
- **Opening breadth.** The suite is still small and colour-alternated; per-opening variance
  dominates the interval. `bench/match.mjs` reports mean/median plies, capped games,
  termination reasons and a per-opening table, supports `--variety`, and now has a curated
  24-position `bench/fens/openings.epd` (SHA-256 in `CHECKSUMS`). The 100-game Gate 1
  calibration is done: 9/100 caps at depth 4, gate passed (see Gate 1 below).
- **Sample size.** 8-20 games gives a ±13-34 pp interval. Anything below ~100 Elo is
  unmeasurable at that size.
- **Residual debt:** the dead `contextBonus` has been removed; `Score.diff` is still never
  written. TT aging stays at one search by ADR 0022, and null-move state restoration was
  fixed in v3.0.10, so neither is an open defect.
- **Audit closure.** v3.0.8 closed its P0 set; v3.0.9 closed AUD-01…AUD-06; v3.0.10
  closed the final §17 register 9/9, including AUD-07…AUD-09. AUD-309-03 was locked by
  tests as non-reproducible rather than patched. The remaining P3 items (parameter
  control, independent validation at scale, version comparison, strength measurement)
  are served by `bench/match.mjs`, `engine.learn` and `selfplay` but have never been run
  at the sample size Gate 1 requires.
- **W08.** Browser/Worker stress testing (memory, clock, concurrency, lifecycle) has
  regression tests but no full stress run.
- **SUBIT conformance.** v3 implements a redesigned SUBIT-derived architecture; the
  full canonical layers (FOUR/Belnap, ρ_s, teacher, Ω mapping, provenance/event
  contracts) are not shipped in v3. Do not read v3.0.10 as a conformance release.

---

## Gate 1 — opening breadth and reported game length

**Why first:** with 12 fixed openings the per-opening variance is the whole interval, and a
run whose mean length is unknown cannot be compared with the next one.

**Actions:**
1. Done in v3.0.8+: `bench/match.mjs` reports mean/median plies, capped games and the
   reason (`status()` reason vs cap) in the summary.
2. Widen the opening set — done in the current worktree: `bench/fens/openings.epd` has
   24 quiet, legal FENs and is checksummed. `--variety` randomises the pick so two runs do
   not share the same opening order.
3. Anti-repetition only if the report shows shuffling. The v3.0.10 report did (3/10 capped),
   but the cause was in the harness: after `Engine.play()` preserved the game repetition
   stack under ADR 0016, `bench/match.mjs` called bare `setFEN()` on both engines and wiped
   it. The harness now adopts the FEN *and* the stack, so `status()` can end a game by
   fivefold repetition again. On the same 10-game seed this dropped caps from 3/10 to
   1/10 and nodes/game from 2.31M to 1.70M. No search-level repetition penalty has been
   added; the draw rules remain authoritative. If the 100-game run still exceeds 10%
   caps, the next step is the documented penalty for positions seen twice in the search.

**Gate:** the summary reports length distribution, and no more than 10% of games reach the
cap in a 100-game run at depth 4.

**Result (post-v3.0.10, 2026-11-21) — PASS.** `node bench/match.mjs --suite
bench/fens/openings.epd --a base --b base --games 100 --depth 4 --seed 7 --variety --quiet
--out results/gate1-base-base-final.json`: `base` vs `base` 57.5% ± 8.9 (±63 Elo),
49W/17D/34L, mean 128 plies, median 110.5, **9/100 games at the 300-ply cap (≤10% gate)**.
Terminations: checkmate 83, max plies 9, fivefold repetition 4, insufficient material 4.
All 9 caps sit in openings #2 and #18; the 57.5% is harness calibration, not a strength
result. No search-level repetition penalty was needed.

**Kill criterion:** if variety makes the engine measurably weaker (loss of ≥ 50 Elo vs
`base` over 100 games), the book is wrong — shrink it, don't disable it.

---

## Gate 2 — does depth convert into strength?

**Pre-registered metric:** score of `base@5` vs `base@4` over 100 games at depth 5.

**Harness bug found before accepting the first run.** `playGame()` picked the per-move depth
from the moving *colour* (`side === 'white' ? depthA : depthB`) instead of from the config
playing that colour. In odd games A is Black, so A searched at 4 and B at 5 — half the
sample had the depth labels reversed. The first 100-game run (`results/gate2-depth5-vs-4.json`,
44.0% ±8.7, 34W/20D/46L) is therefore **void**, not a strength result. `wantDepth` is now
keyed on `aWhite ? side === 'white' : side === 'black'`, with a two-colour regression test in
`tests/engine.driver.mjs`. Gate 1 and Gate 3 are unaffected (both sides use the same depth).

**Result (corrected, 2026-11-21) — PASS.** `results/gate2-depth5-vs-4-final.json`: `base@5`
**68.0% ± 8.1**, CI **[59.9%, 76.1%]**, ±64 Elo, 58W/20D/22L, 0 errors. Length mean 148,
median 112, 8/100 caps (checkmate 80, insufficient material 8, max plies 8, fivefold 4).
CI.lo > 0.5 falls in the "depth works" row: keep pruning/LMR as is and spend effort on the
evaluation. The prior (PASS 70%) is confirmed; the earlier 12-game 45.8% ±22.4 reading and the
void harness run are both superseded.

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
100 games at depth 4, plus `nostruct`, `noplans`, `noctx` individually. The A1 horizon
change is measured separately as `base` vs `noqchecks` over 100 games at depth 4; it is
accepted only if the CI excludes 0.5 and Gate 6 still meets the throughput budget.

**Decision table:**

| Result | Verdict | Action |
|---|---|---|
| base wins with CI.lo > 0.5 | layers pay | keep; tune weights per doc 05 |
| CI spans 0.5 | inert | profile the cost; either raise the weights or delete the layer |
| base loses with CI.hi < 0.5 | layers hurt | delete the layer and record an ADR |

**A1 result (post-v3.0.10, 2026-11-21).** `node bench/match.mjs --suite
bench/fens/openings.epd --a base --b noqchecks --games 100 --depth 4 --seed 7 --variety
--quiet --out results/gate3-a1-base-vs-noqchecks-final.json`: `base` (bounded quiet checks)
**63.0% ± 9.3**, CI **[53.7%, 72.3%]**, ±69 Elo, 61W/4D/35L, 0 errors. Length mean 99,
median 84.5, **0/100 caps**, terminations checkmate 96 / fivefold 4. The CI excludes 0.5,
so the strength half of the A1 acceptance rule passes.

**A1 throughput half — measured and accepted.** Clean, uncontended controlled run on the
Gate 6 position (`2kr1b1r/.../5RK1 b - - 1 16`, d7), three repetitions each, fresh engine
per run: `noqchecks` 383,605 nodes at 157,409 / 161,314 / 169,213 nps (~2.3 s); `base`
703,206 nodes at 146,930 / 153,673 / 155,130 nps (~4.6 s). The prefilter cut A1's per-node
penalty from ~24% (112-115k nps before it) to **~6-7%**, and the extra wall time comes from
the 83% larger tree — which is the intended strength mechanism, not overhead. The historical
~190k nps baseline in Gate 6 was measured on a different tree (503,402 nodes) before the
stalemate/eval fixes, so it is not a valid A1 control. **Verdict: A1 accepted** (CI excludes
0.5, no material per-node regression). Gate 6's own d9-in-6s goal remains open independently
of A1. Full structural-layer A/Bs (`base` vs `plain`/`nostruct`/`noplans`/`noctx`) have not
been run at n=100 yet.

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
  `SVF-INV-007` now has an executable single-owner check; the rest remain open.
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

The post-release A1 quiet-check extension adds bounded horizon nodes, so the nps number
must be remeasured before accepting it; `noqchecks` is the A/B control. **Remeasured
(2026-11-21):** `base` 703,206 nodes at ~152k nps, `noqchecks` 383,605 nodes at ~162k nps —
a ~6-7% per-node cost after the geometric prefilter, with the extra time coming from the
intended larger tree. The old ~190k/503,402-node baseline predates the stalemate/eval fixes
and is not comparable. A1 is accepted; the d9-in-6s target itself is still unmet.

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

**Why:** v3.0.6 computes the eight components and names a driver. The current worktree
spends a scalar effort budget on the uncertainty *magnitude* (and no longer inverts it),
but the leading component still does not steer verification. Doc 45 §16 says the vector
decides *where* verification is spent, so the honest next step is to spend a fixed extra
budget on the component that leads and measure whether the decision changes — not to add
another knob to the evaluation.

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
- Moving search back to the main thread: Web Worker search has shipped since v3.0.8
  (ADR 0021); W08 stress coverage is the remaining item, not the migration itself.
