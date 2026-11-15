# subit-chess

A browser chess engine with a **positional value theory** at its core: a structural
value function (SVF), a structural-plan generator, a budgeted alpha-beta search, and a
UI that shows what the engine is actually thinking.

Single-file HTML — no build step for the end user, no server, no CDN, no network access.

**Current release: v3.0.4**

## Quick start

Open `src/subit_chess_v3.0.4.html` in any modern browser (double-click works; the file is
fully self-contained).

```
1. Pick a level       → 1 Поч / 2 Лег / 3 Сер / 4 Скл / 5 Експ (depth 1 / 2 / 4 / 6 / 10,
                         6 s safety clock on level 5)
2. Play               → click or drag a piece; legal moves show as dots, captures as rings
3. Watch the panels   → S₀ state, SVF vector, structural plans, relations, search stats
4. ⚙ Налаштування     → theme, coordinates, move hints, last-move arrow, eval tier
5. Ƒ / ↓ / ⇅          → FEN load & copy, PGN export, flip board
```

Console handle: `window.__subit` (`engine`, `fen`, `history`, `move(uci)`, `analyze()`,
`newGame(fen)`, `setLevel(n)`, `render()`).

## What's inside

The engine is a set of plain ES modules under `src/engine/`. `build/bundle.mjs` walks the
import graph and inlines it into the shipped single file, so the source stays readable and
the artifact stays a single HTML file.

| Module | Responsibility |
|---|---|
| `core.mjs` | board representation, move generation, make/unmake, FEN, Zobrist, perft |
| `percept.mjs` | S₀ = (I, Z, Φ) — initiative / zone / phase perception from the raw position |
| `structure.mjs` | pawn structure, piece activity, king safety, space, critical squares |
| `context.mjs` | game-phase context, opening/middlegame/endgame classification, tempo |
| `evaluate.mjs` | fast tier (tapered material + PST, mobility, bishop pair, pawn structure, rook files, king shield) and structural tier `E(SVF)` |
| `plans.mjs` | structural plan generation, cost/ranking, plan-aware move ordering (bounded to the structural level) |
| `search.mjs` | iterative deepening, alpha-beta + quiescence, TT, killers/history, null move, LMR, aspiration, draw rules |
| `meta.mjs` | search metadata: risk, stability, confidence, budget accounting |
| `index.mjs` | `Engine` facade: `setFEN / legalMoves / analyze / budget / search / play / perft / selfPlay` |
| `verify.mjs` | invariant checks over the pipeline (`SVF-INV-*`, `SEARCH-INV-*`) |

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
- Move ordering follows the documented level order `pv > tt > tactic > struct > context > history`;
  the structural (plan) bonus is bounded to `[0, 1]` so it can never outrank a capture.
- Draw handling mirrors FIDE: 50-move and threefold are claimable inside the search (scored 0
  for both sides), 75-move and fivefold are automatic.

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

## Repository layout

```
src/engine/     ES-module engine core (12 modules)
build/          shell.html (UI) + bundle.mjs (inlines src/engine into one HTML)
src/            subit_chess_v3.0.4.html ← shipped single-file engine (built)
                subit_chess_v2.2.0.html ← legacy v2 engine (diffusion/ρ_s, kept for reference)
index.html      copy of the shipped v3 file (convenience)
tests/          core.perft, engine.smoke/plans/eval/verify/driver/learn, app.dom (jsdom UI)
bench/          match.mjs ablation harness, fens/
docs/           USER-MANUAL.md, ROADMAP.md, DECISIONS.md, theory/ (36 specs), spec/, papers/
ver/            release snapshots per version
runners/        legacy v1.9.1 Node CLI (not used by v3 — see "Honest limitations")
```

## Build and test

```bash
npm install                # only devDependency: jsdom (UI smoke test)
npm run build              # node build/bundle.mjs → src/subit_chess_v3.0.4.html + index.html
npm test                   # v3 suite: engine perft/smoke/plans/eval/verify/driver/learn + UI
npm run test:engine        # engine only
npm run test:app           # jsdom UI smoke test
npm run test:legacy        # v2.2.0 single-file suite (128 assertions, kept for reference)
```

`npm run build` is deterministic: the bundled HTML is byte-identical across runs, and
`src/subit_chess_v3.0.4.html` and `index.html` always match.

## Measured status (honest)

- **The evaluation-perspective fix is real.** Before it, every black-to-move node was scored
  with the wrong sign. Against the pre-fix modules the fixed engine scores **12-0** at depth
  3/4. That is the largest single strength change in v3.
- **The fast evaluation tier is not yet a measured win.** Against the previous eval
  (material + PST + hard switch): 52.5% ± 13.3 over 20 games at depth 3 — inside the noise.
- **Depth is not yet paying.** Depth 5 vs depth 4: 45.8% ± 22.4 over 12 games. An engine must
  gain from depth; `npm run match:depth` is the regression test for that, and it is currently
  unresolved rather than failing.
- **No opening book, no move variety.** Self-play from the start position reaches the 300-ply
  cap in equal positions. This blocks every larger ablation run and is the next strength item.
- **Sample size is the binding constraint.** 8-20 games gives a ±13-34 pp interval, which
  cannot resolve effects below ~100 Elo. Target n ≥ 100 per configuration before accepting or
  rejecting an ablation.

See [`CHANGELOG.md`](CHANGELOG.md) § Unreleased for the full list of open items.

## Documentation

### For users
- [`docs/USER-MANUAL.md`](docs/USER-MANUAL.md) — start here: panels, levels, FEN/PGN, console API, troubleshooting.

### For developers and researchers
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — current state, measured results, next steps.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (ADRs).
- [`docs/theory/`](docs/theory) — the 36 specifications the implementation targets
  (`05` search architecture, `11` strategic plan generation, `25` ablations, `31`/`32`/`33`/`36`
  computational architecture, verification, complexity, decision theory).
- [`docs/spec/`](docs/spec) and [`docs/papers/`](docs/papers) — historical specs and papers
  (v1.8.x-v1.9.1 era: S₀ grammar, ρ_s policy, diffusion generator). Kept for provenance; they
  describe subsystems that v3 does not ship.
- [`CHANGELOG.md`](CHANGELOG.md) — version history.

## Honest limitations

- **Game strength is not yet demonstrated.** The perspective fix is a large correctness win;
  beyond that, every measured difference is inside the confidence interval at the sample sizes
  used so far.
- **No opening book, no variety.** Equal middlegames shuffle to the move cap.
- **Legacy subsystems are gone, not ported.** The v2.2.0 diffusion study generator, ρ_s policy
  vector, teacher snapshots and telemetry do not exist in v3; `runners/run.js` targets v1.9.1
  and is kept only for the v2 legacy suite.
- **Search hygiene debt:** TT entries are never aged out, `contextBonus` in `index.mjs` is
  dead code, `unmakeNullMove` increments `stm`, `Score.diff` is never written.
- **Spec compliance is partial:** plan feasibility/`pareto()` (doc 11), no-op `contextAdjust`
  (doc 05), `structure` gaps, `verify` coverage and `meta` thresholds are not complete.

## License

MIT — see `LICENSE`.