# subit-chess

A browser chess engine with **S₀ morphological grammar** (I × Z × Φ = 48 cells),
**teacher telemetry v3**, and a frozen **ρ_s policy vector** on 8 signal cells.

Single-file HTML — no build, no server, no dependencies.

## Quick start

Open `src/subit_chess_v1.9.1.html` in any modern browser.

```
1. Play a game       → see S₀ / grammar / Ω / Belnap panels live
2. Press "ρ" button  → ρ_s report (needs teacher run first)
3. Press "📊" button → telemetry diagnostics
4. Console workflow  → see below for teacher run + activation
```

## What's inside

| Layer | What it is |
|---|---|
| **S₀ = I × Z × Φ** | 4 × 3 × 4 = 48 morphological cells (`who × where × when`) |
| **Grammar G(S)** | per-cell weights `(material, positional, mobility, king, pawns, bishop)` |
| **Ω(search)** | STABLE / METASTABLE / CYCLIC / CHAOTIC from eval history |
| **Belnap** | {T, F, B, N} four-valued evaluation layer |
| **Teacher v3** | offline `V_teacher` per cell via batch search |
| **ρ_s** | policy vector on 8 signal cells, frozen before A/B |

## ρ_s — what it is

`ρ_s` is a **search policy** (not eval weights). For each of 8 signal cells it
controls:

```
ρ_s = (d_base, r_LMR, r_null, b_futility)
       depth    LMR       null-R   futility margin
       shift    mult      (1..3)   (80..250 cp)
```

- **8 active cells** out of 48 (from 48-cell teacher run, 6548 FENs)
- **32 declared params** (8 × 4 dims). In search it expands to 6 effective
  dims per cell (`null_enabled` boolean + `nullR` int + `futMargin` int).
- **Coverage: 3929 / 6548 = 60.0%** of transitions — 8/48 = 16.7% of cells
  cover 60% of positions.
- **Frozen** — initialized once from teacher means, then not updated during A/B.

### Active cells

| Cell | n | ρ_s = (d_base, r_LMR, r_null, b_futility) |
|---|---:|---|
| `QUIET\|CENTER\|OPENING` | 1370 | teacher-derived |
| `QUIET\|CENTER\|MIDDLEGAME` | 871 | teacher-derived |
| `QUIET\|GLOBAL\|MIDDLEGAME` | 727 | teacher-derived |
| `PRESSURE\|CENTER\|OPENING` | 510 | teacher-derived |
| `DEFENCE\|CENTER\|TACTICAL` | 194 | teacher-derived |
| `QUIET\|CENTER\|TACTICAL` | 128 | teacher-derived |
| `QUIET\|GLOBAL\|OPENING` | 86 | teacher-derived |
| `QUIET\|CENTER\|ENDGAME` | 43 | teacher-derived |

## Console workflow (in browser)

```js
// 0. (optional) sanity check
__subit.perft(4)     // → 197281
__subit.eval()       // → ≈ +10 (start, white POV)
__subit.computeS()   // → QUIET|CENTER|OPENING

// 1. Rehearsal — verify pipeline
__subit.teacherClear(); __subit.telemetryClear();
__subit.resetGrammarToBaseline();
await __subit.selfPlay(20, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
await __subit.batchTeacherEval({depth:4, R_max:300, concurrency:2});
__subit.teacherReport();
// Check: droppedRaw === 0, uniqueRatio in 0.30–0.70

// 2. Main run — 100 games
__subit.teacherClear(); __subit.telemetryClear();
await __subit.selfPlay(100, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
await __subit.batchTeacherEval({depth:4, R_max:300, concurrency:2});
__subit.saveTeacherSnapshot('run1');

// 3. Activate ρ_s (frozen from teacher means)
__subit.activateRhoS();
__subit.rhoSReport();
// → prints 8 cells with n, mean, t, d_base, r_LMR, r_null, b_futility

// 4. Verify policy mapping
__subit.policyFor()
// → {d_base, lmr_mult, null_enabled, futility_mult}
__subit.searchParamsFor()
// → {policy, extBudget, lmrThreshold, nullReduction, futilityMargin}

// 5. Back to baseline for A/B
__subit.setPolicyEnabled(false)
```

## A/B testing

Two modes: browser self-play (fast, screening) or Node runner (400+ games, CI).

### Browser self-play — screening

```js
// Baseline
__subit.setPolicyEnabled(false);
__subit.telemetryClear();
await __subit.selfPlay(200, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
__subit.telemetryReport();

// ρ_s on
__subit.setPolicyEnabled(true);
__subit.telemetryClear();
await __subit.selfPlay(200, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
__subit.telemetryReport();
```

**Metric:** Δmean reward per transition on the 8 active cells.

**Gate (pre-registered):**
- `Δmean > +15 cp` → PASS screening → extend to 400+ games with CI
- `Δmean ∈ [−5, +15]` → weak signal → more games
- `Δmean < −5 cp` → ρ_s harmful → policy tuning or rollback

### Node runner — 400 games + SPRT

```bash
npm install
node runners/run.js --mode match --games 400 --depth 2 --seed 42
node runners/run.js --mode match --games 400 --policy off  # baseline
```

**Honest statistics:**
- 200 games → SE ≈ 27 Elo. `+15` is `< 1σ` — screening only.
- 400 games → SE ≈ 19 Elo.
- Gate: 95% CI on score, or SPRT (H0: 0, H1: 15, α=0.05, β=0.10).

## Console API reference

### Lifecycle

| Command | Purpose |
|---|---|
| `__subit.selfPlay(n, opts)` | N games, writes raw trajectory |
| `__subit.batchTeacherEval(opts)` | Offline V_teacher per cell |
| `__subit.saveTeacherSnapshot('run1')` | Persist teacher run to localStorage |
| `__subit.compareTeacherSnapshots('run1','run2')` | Jaccard stability |
| `__subit.activateRhoS()` | Init ρ_s from teacher, freeze |
| `__subit.rhoSReport()` | Print 8 active cells |
| `__subit.setPolicyEnabled(false)` | Baseline mode for A/B |

### Introspection

| Command | Returns |
|---|---|
| `__subit.computeS(fen?)` | `{who, where, when}` |
| `__subit.policyFor(fen?)` | `{d_base, lmr_mult, null_enabled, futility_mult}` |
| `__subit.searchParamsFor(fen?)` | full search params incl. `nullReduction`, `futilityMargin` |
| `__subit.teacherReport()` | teacher telemetry summary + top cells |
| `__subit.telemetryReport()` | raw Δeval telemetry summary |
| `__subit.getSignalCells()` | array of signal cell keys |

### Self-tests

| Command | Expected |
|---|---|
| `__subit.perft(4)` | `197281` |
| `__subit.eval()` | `≈ +10` (start, white POV) |
| `__subit.computeS()` | `QUIET\|CENTER\|OPENING` |

## Repository layout

```
src/       single-file HTML engine (no build)
runners/   Node CLI: selfplay / teacher / match
tests/     perft + hash + symmetry + policy + S₀
docs/      DECISIONS.md — ADRs + methodology
.github/   CI: tests + release artifact
ver/       historical snapshots
```

## Repository workflow

```bash
# 1. Install
npm install

# 2. Tests (perft, hash consistency, color symmetry, policy mapping)
npm test

# 3. Self-play + teacher run (Node, 100 games)
node runners/run.js --mode teacher --games 100 --out results/run1.json

# 4. A/B match (400 games, SPRT + 95% CI)
node runners/run.js --mode match --games 400 --depth 2 --seed 42

# 5. Release (bump version, tag, GitHub Release)
git tag v1.9.1 && git push origin v1.9.1
```

## Changelog

### [1.9.1] — 2026-09-26

**Added**
- `ρ_s` policy vector on 8 signal cells (frozen, teacher-derived)
- `initRhoSFromTeacher()` — auto-init from teacher means
- `policyFor()`, `searchParamsFor()` — central search param resolution
- `policyNullR` / `policyFutMargin` in `alphaBeta` — null-move R and futility
  margin are now controlled by ρ_s (previously hardcoded 2/3 and 200/300)
- Explicit policy passing: `searchAsync → Worker → createSearch` — no globals
- UI: ρ modal, policy selector, extended budget grid (`r_null`, `b_futility`)

**Fixed**
- `visitedShare = cells.length / (WHO · WHERE · WHEN)` = 48 (previously fallback 64)
- Coverage in reports: 60.0% (was 55.2% — used 64-cell total 7116 by mistake)

**Notes**
- ρ_s dims expanded from 4 (pre-registered) to 6 effective in search
  (`null_enabled` + `nullR`, `futility_mult` + `futMargin`). 6548 / 48 = 136
  samples per effective param, still above 22-cell baseline of 74.4.
- No online learning. ρ_s is frozen after init. See ADR 0005.

### [1.9.0] — 2026-09-20

- S₀ coarsened 64 → 48 cells (dropped `QUEENSIDE`, kept `KING`/`CENTER`/`GLOBAL`)
- Hardcoded `ACTIVE_POLICY` map for 8 cells

### [1.8.7] — 2026-09-10

- Teacher telemetry v3, snapshot API, `MAX_RAW=15000`, `droppedRaw` counter

### [1.8.6] — 2026-09-05

- Endgame detection via `heavyMaterial < 2000`
- Color-symmetry self-test, perft(4) = 197281

## Honest limitations

- **Strength** same as v1.8.7 in baseline mode. v1.9.1 is an infrastructure
  release for ρ_s, not a strength release.
- **ρ_s frozen.** No online learning. `initRhoSFromTeacher()` sets params once
  from teacher means, then `rhoSFrozen = true`.
- **Sample size.** 200 games → SE ≈ 27 Elo. A `+15` gate is `< 1σ` — screening.
  Use 400+ games or SPRT for a real decision.
- **Teacher signal.** ρ_s requires ≥8 signal cells (`n ≥ 20 && |t| ≥ 2`) in the
  teacher report. If fewer, ρ_s stays inactive and search runs baseline.
- **Auto-init warning.** On startup, if stored teacher telemetry already has
  ≥8 signal cells, `initRhoSFromTeacher()` runs automatically. Clear teacher
  telemetry (`__subit.teacherClear()`) before a fresh A/B to avoid cross-run
  contamination.

## License

MIT — see `LICENSE`.
