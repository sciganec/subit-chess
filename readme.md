# subit-chess

A browser chess engine with **S₀ morphological grammar**, **SUBIT-∞ v6.13 trajectory classification**, and a **controlled diffusion study generator** with Classifier-Free Guidance (CFG).

Single-file HTML — no build, no server, no dependencies.

Current stable version: **v2.2.0**

## Quick start

Open `src/subit_chess_v2.2.0.html` in any modern browser.

```
1. Play a game        → see S₀ / grammar / Ω / Belnap panels live
2. Press "🎨" button  → Diffusion Study Generator (CFG + SUBIT v6.13)
3. Press "ρ"  button  → ρ_s report (needs teacher run first)
4. Press "📊" button  → S₀ telemetry diagnostics
5. Console workflow   → see below
```

## What's inside

| Layer | Description |
|---|---|
| **S₀ = I × Z × Φ** | 4 × 4 × 4 = 64 morphological cells (`who × where × when`) |
| **Grammar G(S)** | per-cell weights `(material, positional, mobility, king, pawns, bishop)` |
| **Ω(search)** | STABLE / METASTABLE / CYCLIC / CHAOTIC from eval history |
| **Belnap {T,F,B,N}** | four-valued evaluation layer (bilattice §1 of SUBIT-∞) |
| **SUBIT v6.13 trajectories** | 6 classes, Classify⁺, d_Ω_traj metric |
| **Diffusion generator** | board tensor 8×8×14, CFG, 8 themes, cook filter, aesthetic scorer |
| **Teacher v3** | offline `V_teacher` per cell via batch minimax search |
| **ρ_s** | policy vector on 8 signal cells, frozen before A/B |

---

## Diffusion Study Generator

Press `🎨` in the header to open the **Controlled Diffusion Study Generator**.

### How it works

```
Forward process:  beautiful study → add noise → chaos (h_top > 0)
Reverse process:  chaos → denoise T=15…0 → p(position | beauty)

CFG:  x_t = x_uncond + w · (x_cond - x_uncond)
         w ∈ [1, 10]  — guidance strength slider
```

Board representation: tensor **8×8×14** (12 piece channels + turn + castling/ep = 896 values).

### Condition vector c

| Parameter | UI control | Values |
|-----------|-----------|--------|
| Genre | dropdown | `study_win`, `study_draw`, `mate_2`, `mate_3` |
| Theme | dropdown | see table below |
| Material | dropdown | `miniature`, `queenless`, `minor_only`, `endgame_rp`, `any` |
| CFG `w` | slider | 1.0 – 10.0 |
| Aesthetic min | slider | 0.50 – 0.95 |
| SUBIT target | dropdown | `FIXED`, `PERIODIC`, `MIN_ZERO` |

### Composition themes

| Theme | Motif |
|-------|-------|
| `queen_sac` | Queen sacrifice → mate or fork |
| `zugzwang` | Reciprocal zugzwang (any move loses) |
| `stalemate_defense` | Miraculous stalemate rescue |
| `domination` | Minor piece traps enemy |
| `reti_maneuver` | King diagonal dual-threat (Réti 1921) |
| `underpromotion` | Saavedra underpromotion to N/B/R |
| `battery` | Discovered attack / unmasking battery |
| `quiet_key` | Counter-intuitive quiet first move |

### Validation pipeline

1. **Minimax solver** (depth 4) — scores all first moves
2. **Cook filter** — rejects if second-best ≥ 80% of best score
3. **Aesthetic scorer** `A ∈ [0.40, 1.00]`:
   - +0.25 quiet key move (no check)
   - +0.15 non-capturing key move
   - +0.10 miniature (≤ 6 pieces)
   - +0.10 sound + no cook

### SUBIT v6.13 — trajectory classification

| Class | ω-size | Minimal | h_top | Chess analogue |
|-------|---------|---------|-------|----------------|
| `FIXED` | 1 | ✓ | 0 | Unique checkmate / final |
| `PERIODIC` | finite >1 | ✓ | 0 | Perpetual check / draw repetition |
| `MIN_ZERO` | ∞ | ✓ | 0 | Aperiodic minimal |
| `MIN_POS` | ∞ | ✓ | >0 | Minimal chaotic |
| `NONMIN_ZERO` | ∞ | ✗ | 0 | Non-minimal zero (W8) |
| `NONMIN_POS` | ∞ | ✗ | >0 | Full chaos / diffusion noise |

**Classify⁺** `(OrbitType, InclusionType, ChaosStatus, Min)` — §4.5  
**d_Ω_traj** — normalized Hamming on 12-code representation — §11.3

> `ChaosStatus: NOT_APPLICABLE ≠ NON_CHAOTIC` (§4, Remark 4.3.2)

### Diffusion console API

```js
// Generate a study with theme and conditions
const res = await __subit.diffusion.generateStudy({
  theme: 'reti_maneuver',
  genre: 'study_draw',
  guidance: 5.5,
  aestheticMin: 0.80,
  subitTarget: 'FIXED'
});
// → { fen, verification: { sound, cook, aestheticScore, bestMove, subit } }

// Board ↔ tensor round-trip
const t = __subit.diffusion.boardToTensor(pos)  // → Float32Array(896)
const p = __subit.diffusion.tensorToBoard(t, 'w') // → pos

// Verify any FEN
const v = __subit.diffusion.verifyStudy(
  __subit.chess.fromFEN('7K/8/k1P5/7p/8/8/8/8 w - - 0 1'),
  { genre: 'study_draw' }
);
// → { sound, cook, bestMove, aestheticScore, subit: { trajClass, dOmegaTraj, s0 } }

// SUBIT v6.13 trajectory API
__subit.v6_13.classifyTrajectory([h1, h2, h1])  // → 'PERIODIC'
const sp = __subit.v6_13.classifySetPlus('INVARIANT_FIXED', 'ATTAINED', 'NOT_APPLICABLE', true)
__subit.v6_13.dOmegaTraj('FIXED', sp, 'NONMIN_POS', spChaotic)  // → 0.58
```

---

## ρ_s policy

`ρ_s` is a **search policy** (not eval weights). For each of 8 signal cells it controls:

```
ρ_s = (d_base, r_LMR, r_null, b_futility)
       depth    LMR      null-R   futility margin
       shift    mult     (1..3)   (80..250 cp)
```

- **8 active cells** out of 64 (from teacher run, 6548 FENs)
- **32 declared params** (8 × 4 dims)
- **Coverage: 60.0%** of transitions — 8/64 = 12.5% of cells cover 60% of positions
- **Frozen** — initialized once from teacher means, not updated during A/B

### Active cells

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

---

## Console workflow (browser)

```js
// 0. Sanity checks
__subit.perft(4)     // → 197281
__subit.eval()       // → ≈ +10 (start, white POV)
__subit.computeS()   // → { who: 'QUIET', where: 'CENTER', when: 'OPENING' }

// 1. Teacher run — 100 games
__subit.teacherClear(); __subit.telemetryClear();
__subit.resetGrammarToBaseline();
await __subit.selfPlay(100, {depth:2, maxPlies:100, epsilon:0.2, topK:3});
await __subit.batchTeacherEval({depth:4, R_max:300, concurrency:2});
__subit.saveTeacherSnapshot('run1');

// 2. Activate ρ_s
__subit.activateRhoS();
__subit.rhoSReport();
// → 8 cells with n, mean, t, d_base, r_LMR, r_null, b_futility

// 3. Policy introspection
__subit.policyFor()       // → {d_base, lmr_mult, null_enabled, futility_mult}
__subit.searchParamsFor() // → {policy, extBudget, lmrThreshold, nullReduction, futilityMargin}

// 4. A/B — disable ρ_s for baseline run
__subit.setPolicyEnabled(false)
```

---

## A/B testing

### Browser screening (200 games each)

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

**Gate (pre-registered):**
- `Δmean > +15 cp` → PASS screening → extend to 400+ games with CI
- `Δmean ∈ [−5, +15]` → weak signal → more games
- `Δmean < −5 cp` → ρ_s harmful → policy tuning or rollback

### Node runner (400 games + SPRT)

```bash
npm install
node runners/run.js --mode match --games 400 --depth 2 --seed 42
node runners/run.js --mode match --games 400 --policy off --out results/base.json
```

**Honest statistics:** 200 games → SE ≈ 27 Elo. 400 games → SE ≈ 19 Elo.  
Gate: 95% CI on score, or SPRT (H0: 0, H1: 15, α=0.05, β=0.10).

---

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
| `__subit.searchParamsFor(fen?)` | full search params |
| `__subit.teacherReport()` | teacher telemetry summary |
| `__subit.telemetryReport()` | raw Δeval telemetry |
| `__subit.getSignalCells()` | array of signal cell keys |

### Diffusion & SUBIT v6.13

| Command | Returns |
|---|---|
| `__subit.diffusion.generateStudy(cond)` | `{fen, verification}` |
| `__subit.diffusion.boardToTensor(pos)` | `Float32Array(896)` |
| `__subit.diffusion.tensorToBoard(t)` | `pos` |
| `__subit.diffusion.verifyStudy(pos, cond)` | `{sound, cook, aestheticScore, subit}` |
| `__subit.v6_13.classifyTrajectory(hist)` | `'FIXED' \| 'PERIODIC' \| …` |
| `__subit.v6_13.classifySetPlus(…)` | `{orbitType, inclusionType, chaosStatus, min}` |
| `__subit.v6_13.dOmegaTraj(tcA, spA, tcB, spB)` | `number ∈ [0, 1]` |

### Self-tests

| Command | Expected |
|---|---|
| `__subit.perft(4)` | `197281` |
| `__subit.eval()` | `≈ +10` (start, white POV) |
| `__subit.computeS()` | `QUIET\|CENTER\|OPENING` |

---

## Repository layout

```
src/         single-file HTML engines
               subit_chess_v2.2.0.html  ← current
               subit_chess_v1.9.1.html  ← legacy (test harness target)
ver/         stable release snapshots (v2.0.0, v2.1.x, v2.2.0, …)
docs/        USER-MANUAL.md, SUBIT-CHESS-SPEC.md, SUBIT-EXPERIMENT-SPEC.md,
             DECISIONS.md, ROADMAP.md
runners/     Node CLI: selfplay / teacher / match
tests/       perft + hash + symmetry + S₀ + policy + v6_13 + diffusion (128 assertions)
bench/       benchmark FEN datasets (T_train=5000, V_val=1000) + WORK_CONSTANTS.json
results/     A/B and teacher run reports (JSON)
.github/     CI: tests + perft + smoke + release artifact
```

---

## Repository workflow

```bash
# 1. Install
npm install

# 2. Tests (128 assertions: perft, hash, S₀, policy, v6_13, diffusion)
npm test
# or target a specific engine:
node tests/test.js --html src/subit_chess_v2.2.0.html

# 3. Backward compat
node tests/test.js --html src/subit_chess_v1.9.1.html  # 100/100

# 4. Full perft (includes perft(4) = 197281)
node tests/test.js --only-perft --full

# 5. Self-play + teacher (Node, 100 games)
node runners/run.js --mode teacher --games 100 --out results/run1.json

# 6. A/B match (400 games, SPRT)
node runners/run.js --mode match --games 400 --depth 2 --seed 42

# 7. Release
git tag v2.2.0 && git push origin v2.2.0
```

---

## Documentation

### For users
- [`docs/USER-MANUAL.md`](docs/USER-MANUAL.md) — **start here** — full user guide

### For researchers
- [`docs/SUBIT-CHESS-SPEC.md`](docs/SUBIT-CHESS-SPEC.md) — formal specification (SUBIT-∞ v5.2+)
- [`docs/SUBIT-EXPERIMENT-SPEC.md`](docs/SUBIT-EXPERIMENT-SPEC.md) — pre-registered experimental protocol
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records (8 ADRs)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — release plan and gates

### For contributors
- [`CHANGELOG.md`](CHANGELOG.md) — version history (v1.8.6 → v2.2.0)
- [`tests/test.js`](tests/test.js) — test suite (128 assertions)
- [`runners/run.js`](runners/run.js) — Node CLI

---

## Honest limitations

- **Diffusion generator** is architecturally complete (tensor repr, CFG, verifier, UI) but uses curated seed positions instead of a trained neural denoiser. A real learned model (PyTorch/ONNX, ~2M studies from YACPDB/Die Schwalbe) would slot in at `generateStudy()` via the same interface.
- **Game strength** unchanged from v2.1.x in baseline mode. v2.2.0 is a feature release (diffusion + v6.13), not a strength release.
- **ρ_s frozen.** No online learning. `initRhoSFromTeacher()` sets params once; `rhoSFrozen = true`.
- **Sample size.** 200 games → SE ≈ 27 Elo. Use 400+ games or SPRT for a real A/B decision.
- **Teacher signal.** ρ_s requires ≥ 3 signal cells (`n ≥ 20 && |t| ≥ 2`) to auto-activate. Run `__subit.teacherClear()` before a fresh A/B to avoid cross-run contamination.

---

## License

MIT — see `LICENSE`.
