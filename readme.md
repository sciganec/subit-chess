# subit-chess

A browser chess engine with a **positional value theory** at its core: a structural
value function (SVF), a structural-plan generator, a budgeted alpha-beta search, and a
UI that shows what the engine is actually thinking.

Single-file HTML — no build step for the end user, no server, no CDN, no network access.

**Development candidate: v3.0.17** — consolidation of the v3.0.16.0 release line (field dynamics, search micro-optimisations, default-off hooks) with the strength branch (+49 Elo at 400 ms/move against 8bdc3f4: futility depth 2, null move 2/3/4, aspiration 15, knight outposts; conformance suite; optional Lazy SMP).
Release notes: [`CHANGELOG.md`](CHANGELOG.md) — [3.0.17] and [3.0.16].

## Quick start

Open `src/subit_chess_v3.0.17.html` in any modern browser (double-click works; the file is
fully self-contained).

```
1. Pick a level       → 1 Поч / 2 Лег / 3 Сер / 4 Скл / 5 Експ (depth 1 / 2 / 4 / 6 / 10,
                         6 s safety clock on level 5)
2. Play               → click or drag a piece; legal moves show as dots, captures as rings
                          (keyboard: Tab to the board, arrows move, Enter selects/plays)
3. Watch the panels   → S₀ state, SVF vector, structural plans, relations, search stats
4. ⚙ Налаштування     → theme, coordinates, move hints, last-move arrow, eval tier
5. Ƒ / ↓ / ⇅          → FEN load & copy, PGN export, flip board
```

The search runs in a Web Worker built from the same bundled engine (embedded in the page,
no second file), so the board, the clock and the animations stay live while it thinks.
`localStorage` keeps the theme, level and board settings between visits.

Console handle: `window.__subit` (`engine`, `fen`, `history`, `move(uci)`, `analyze()`,
`newGame(fen)`, `setLevel(n)`, `render()`).

## What's inside

The engine is a set of plain ES modules under `src/engine/`. `build/bundle.mjs` walks the
import graph and inlines it into the shipped single file, so the source stays readable and
the artifact stays a single HTML file.

| Module | Responsibility |
|---|---|
| `core.mjs` | board representation, legal move generation, make/unmake, Zobrist, perft |
| `fen.mjs` | strict FEN parsing/serialisation, en passant and counter validation |
| `percept.mjs` | S₀ = (I, Z, Φ) — 4×4×4 = 64-state interaction/zone/phase perception |
| `structure.mjs` | pawn structure, piece activity, king safety, space, critical squares |
| `context.mjs` | marginal intensities for `I = QUIET/DEFENCE/ATTACK/PRESSURE`, `Z = GLOBAL/QUEENSIDE/KING/CENTER`, `Φ = OPENING/MIDDLEGAME/ENDGAME/TRANSITION` |
| `evaluate.mjs` | fast tier (tapered material + PST, mobility, bishop pair, pawn structure, rook files, king shield) and structural tier `E(SVF)` |
| `plans.mjs` | structural plan generation, feasibility/Pareto ranking (descriptive only since ADR 0023 — no search move ordering) |
| `search.mjs` | iterative deepening, alpha-beta + quiescence, TT, killers/history, null move, LMR, aspiration, draw rules |
| `meta.mjs` | search metadata: risk, stability, confidence, budget accounting |
| `uncertainty.mjs` | eight-component `U(P)` and search decision certificate |
| `learn.mjs` | offline self-play harness with independent observations, colour balance and validation split |
| `topology.mjs` | bounded local transition graph and cycle detection prototype |
| `differential.mjs` | bounded SUBIT gradient-profile prototype |
| `field.mjs` | geometric influence channels and discrete board gradient, divergence and curl |
| `verify.mjs` | invariant checks over the pipeline (`SVF-INV-*`, `SEARCH-INV-*`) |
| `index.mjs` | `Engine` facade and in-process `Memory`: `setFEN / legalMoves / analyze / budget / search / play / perft / selfPlay` |

### Position value

The SVF is `V(P) = (M, K, A, D, C, T, Q, R, X)` — material, king safety, activity,
defence, coordination, tactical potential, space, structural relations, transformation
potential (passed pawns) — reported alongside the raw search score so the panel can show
*why* a move was chosen, not just what it scored. Every axis is side-to-move relative,
in centipawns, before weighting (`SVF-INV-001/002`).

`E(SVF)` and `score` are both displayed because they are not the same number: the fast tier
answers "what is this position worth", the search answers "what is the best line worth".

### Search

- Iterative deepening with a per-level budget; `search({depth, timeMs})`.
- Alpha-beta + quiescence, transposition table (depth-checked, ply-normalised mate scores),
  killer moves + history (normalised below tactics), null-move pruning, late-move reductions
  with re-search, aspiration windows.
- Move ordering is `pv > tt > tactic > history` in v3.0.11. The structural and
  context ordering levels were deleted by the Gate 3 kill (ADR 0023); they remain only
  as zero-valued keys so old configs still load.
- Draw handling mirrors FIDE: 50-move and threefold are claimable inside the search (scored 0
  for both sides), 75-move and fivefold are automatic.
- Every search result carries an **uncertainty profile** `U(P)` — eight components
  (search, tactical, evaluation, structural, strategic, temporal, model, contextual), each in
  `[0,1]` with the evidence that produced it — and a **decision certificate** with a
  validation status (`FORCED_WITHIN_SCOPE`, `SEARCH_SUPPORTED`, `UNVERIFIED`, `REFUTED`) and
  the position version it describes. The components are reported, never blended into one
  number and never subtracted from the score (doc 37 §5-§6, doc 45 §16/§20.2, ADR 0019).

### Ablation harness

`bench/match.mjs` is the instrument for every strength claim in this repository. It plays
deterministic self-play matches between named configurations from a fixed opening set and
reports W-D-L, score with a 95% confidence interval, and a per-game log.

```bash
npm run match:engine                 # base vs plain
npm run match:ablate                 # base vs nostruct
npm run match:depth                  # base@5 vs base@4 — "is a ply worth anything?"
node bench/match.mjs --list          # all configurations
node bench/match.mjs --a base --b eval0 --games 100 --depth 5 --seed 7 --out results/eval0.json
```

Configurations: `base`, `nostruct`, `noctx`, `nores`, `noplans`, `nobudget`, `plain`,
`eval0`, `notaper`, `nopawns`, `norooks`, `noshield`, `nopruning`, `nonull`, `nolmr`, `noasp`,
plus per-side depth (`base@6` vs `base@4`).

`bench/gate7.mjs` is the verification-steering instrument (not a strength test). It
compares a uniform extra ply against an equal-purpose budget aimed at the leading
uncertainty component, with a wrong-driver control and proven-mate fixtures:

```bash
node bench/gate7.mjs --depth 4 --mates --out results/gate7-targeted-vs-uniform-final.json
```

## Repository layout

```
src/engine/     ES-module engine core (16 modules)
build/          shell.html (UI) + bundle.mjs (inlines src/engine into one HTML)
src/            subit_chess_v3.0.17.html  — shipped single-file engine (built)
                subit_chess_v2.2.0.html ← legacy v2 engine (diffusion/ρ_s, kept for reference)
index.html      copy of the shipped v3 file (convenience)
tests/          core.perft, engine.smoke/plans/eval/verify/topology/differential/field/audit/
                audit2/audit309/tactics/driver/learn/uncertainty/gate7/worker, app.dom (jsdom UI)
bench/          match.mjs ablation harness, gate7.mjs verification harness, fens/
docs/           USER-MANUAL.md, ROADMAP.md, DECISIONS.md, theory/ (52 specs), spec/, papers/
ver/            release snapshots per version, including v3.0.10/ and v3.0.11/
runners/        legacy v1.9.1 Node CLI (not used by v3 — see "Honest limitations")
```

## Build and test

```bash
npm install                # only devDependency: jsdom (UI smoke test)
npm run build              # node build/bundle.mjs → versioned src HTML + index.html
npm test                   # v3 suite: 19 files incl. field, audit311, tactics, gate7, worker + UI
npm run test:engine        # engine only
npm run test:app           # worker embedding + jsdom UI smoke test
npm run test:worker        # the embedded worker source runs and answers
npm run test:legacy        # v2.2.0 single-file suite (128 assertions, kept for reference)
```

`npm run build` is deterministic: the bundled HTML is byte-identical across runs, and
The current versioned `src` HTML and `index.html` always match.

## Measured status (honest)

- **The evaluation-perspective fix is real.** Before it, every black-to-move node was scored
  with the wrong sign. Against the pre-fix modules the fixed engine scores **12-0** at depth
  3/4. That is the largest single strength change in v3.
- **The fast evaluation tier is not yet a measured win.** Against the previous eval
  (material + PST + hard switch): 52.5% ± 13.3 over 20 games at depth 3 — inside the noise.
- **Depth pays (v3.0.11 self-play).** After the ADR 0023 re-baseline, depth 5 vs depth 4 scores
  **79.0% ± 7.5** over 100 games (CI 71.5-86.5%, 75W/8D/17L). The pre-kill 68.0% ±8.1,
  the old 12-game 45.8% ±22.4 reading and the void harness run are historical; a depth-label
  bug in odd games was found and fixed before any of these results was accepted.
- **A1 quiet checks pay (v3.0.11 self-play).** Post-kill re-baseline: **60.0% ± 9.4** vs `noqchecks`
  over 100 games (CI 50.6-69.4%, 58W/4D/38L), 0/100 capped games. After the ordering
  deletion there is no per-node penalty (~174.6k nps for `base` vs ~173.0k for `noqchecks`);
  the old 63.0% and ~6-7% throughput cost are historical.
- **Structural ordering was deleted in v3.0.11 (Gate 3).** `base` vs `nostruct`
  scored 46.5% ± 8.7 at n=100 and 47.5% ± 6.2 at n=200 (CI ≈ [41.3%, 53.7%]);
  `noplans` was identical. No positive CI over 200 games triggered the pre-registered
  kill criterion, so ADR 0023 removed the structural ordering path. Plans still feed
  the UI and uncertainty, not move choice. `noctx` was a no-op (57.5% ±8.9, identical
  to a pre-kill `base` vs `base` control), and after the kill `plain` is also a no-op:
  53.5% ±8.9, identical to a post-kill `base` vs `base` control. Those percentages are
  harness self-play baselines, not strength results.
- **Opening suite is calibrated.** `bench/fens/openings.epd` has 24 checksummed legal FENs;
  `bench/match.mjs` reports per-opening W/D/L, length distribution, capped games, termination
  reasons and an Elo-scaled CI. Gate 1 passes with 9/100 caps pre-kill and 5/100 post-kill.
- **The uncertainty driver steers verification (bench-only).** Gate 7: 9 target-only
  decision changes vs 0 uniform-only and 0 wrong-driver-only; 0/4 proven mates changed.
  The driver is computed after the base search and no shipped move choice was changed, so
  this is not a strength result.
- **Sample size is still the binding constraint for the remaining layers.** 8-20 games gives a
  ±13-34 pp interval; the three gates above now use n=100, and any further ablation should too.

See [`CHANGELOG.md`](CHANGELOG.md) § [3.0.11] for the full list of changes and open items.

## Documentation

### For users
- [`docs/USER-MANUAL.md`](docs/USER-MANUAL.md) — start here: panels, levels, FEN/PGN, console API, troubleshooting.

### For developers and researchers
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — current state, measured results, next steps.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (ADRs).
- [`docs/theory/`](docs/theory) — 88 theory documents; the implementation targets only the
  subset named in the ADRs (`05` search architecture, `11` strategic plan generation, `25`
  ablations, `31`/`32`/`33`/`36` computational architecture, verification, complexity and
  decision theory). `48`–`80` are research drafts. The five new documents (`81-99/` plus
  `article_04.md`/`article_05.md`) are **research-only and non-binding** in v3.0.11.
- [`docs/spec/`](docs/spec) and [`docs/papers/`](docs/papers) — historical specs and papers
  (v1.8.x-v1.9.1 era: S₀ grammar, ρ_s policy, diffusion generator). Kept for provenance; they
  describe subsystems that v3 does not ship.
- [`CHANGELOG.md`](CHANGELOG.md) — version history.

## Honest limitations

- **v3.0.11 is a measured engineering increment, not an external strength claim.** It ships the
  post-v3.0.10 search/harness/verification work: bounded quiet checks at the horizon (A1),
  deletion of structural/context move ordering (ADR 0023), better match reporting and
  repetition handling, and a wider make/unmake verifier. Full SUBIT conformance is not
  claimed: the canonical theory repo still documents v2.2.0 as the latest chess version and
  marks v6.14.x as DRAFT / NOT STABLE.
- **Strength evidence is self-play only.** On the v3.0.11 code, A1 quiet checks scored
  `base` 60.0% ±9.4 vs `noqchecks` (CI 50.6–69.4%, 0/100 caps) and depth scored
  `base@5` 79.0% ±7.5 vs `base@4` (CI 71.5–86.5%). Structural ordering was killed after
  200 games at 47.5% ±6.2 (CI 41.3–53.7%). Gate 7 is bench-only verification steering. There
  is no external sparring result, no independent oracle, and no canonical conformance test.
  Gate 4 literal coverage, Gate 5 external validation, Gate 6's d9-in-6s target and the W08
  stress run remain open.
- **The new theory is research-only.** `docs/theory/81-99/` (including the autonomous
  experimentation framework draft) and `docs/theory/article_04.md`/`article_05.md` are
  included for research and roadmap input. They are not binding for v3.0.11, do not add
  conformance claims, and do not override ADR 0019, 0022 or 0023.
- **Opening suite is curated and Gate 1-calibrated.** Game-length reporting, `--variety` and a
  24-position `bench/fens/openings.epd` with a SHA-256 in `bench/fens/CHECKSUMS` now exist;
  `bench/match.mjs` prints per-opening W/D/L and an Elo-scaled CI. The harness keeps the
  repetition stack across moves, so capped games fell from 3/10 to 1/10 on the same
  calibration seed. The 100-game Gate 1 calibration is complete: 57.5% ±8.9 pre-kill
  (49W/17D/34L, 9/100 caps) and 53.5% ±8.9 post-kill (45W/17D/38L, 5/100 caps); both pass
  the ≤10% cap gate.
- **Legacy subsystems are gone, not ported.** The v2.2.0 diffusion study generator, ρ_s policy
  vector, teacher snapshots and telemetry do not exist in v3; `runners/run.js` targets v1.9.1
  and is kept only for the v2 legacy suite.
- **Residual debt:** `Score.diff` is still never written. TT aging stays at one search
  (`TT_MAX_AGE = 0`) by ADR 0022, uncertainty remains a vector with no scalar blend by ADR
  0019, structural/context ordering stays deleted by ADR 0023, and automatic draw rules remain
  authoritative.
- **Spec compliance is partial:** full plan revision lifecycle (doc 11), no-op `contextAdjust`
  (doc 05), `structure` gaps and `meta` thresholds remain open; `verify.mjs` now has an
  executable SVF-INV-007 ownership check, but literal invariant coverage is not complete.

## License

MIT — see `LICENSE`.
