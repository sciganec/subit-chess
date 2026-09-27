# SUBIT-CHESS — User Manual

**Version 1.0** · for engine v1.9.1

This manual explains every panel, button, and console command in the
SUBIT-CHESS browser engine. It assumes no prior knowledge of the engine's
formal specification (see `SUBIT-CHESS-SPEC.md` for that).

**Who this is for:**
- Players who want to play chess against SUBIT.
- Researchers who want to inspect the morphological state of a position.
- Developers running A/B experiments on the ρ_s policy.

**Quick start:** open `src/subit_chess_v1.9.1.html` in any modern browser
(Chrome, Edge, Firefox, Safari). No installation needed.

---

## Table of contents

1. [Getting oriented](#1-getting-oriented)
2. [The chessboard](#2-the-chessboard)
3. [The right panel — top to bottom](#3-the-right-panel--top-to-bottom)
4. [Header buttons](#4-header-buttons)
5. [Play workflow](#5-play-workflow)
6. [The ρ_s policy — what it is and how to activate it](#6-the-ρ_s-policy--what-it-is-and-how-to-activate-it)
7. [Teacher run workflow — full pipeline](#7-teacher-run-workflow--full-pipeline)
8. [A/B testing workflow](#8-ab-testing-workflow)
9. [Console API reference](#9-console-api-reference)
10. [Keyboard shortcuts](#10-keyboard-shortcuts)
11. [Troubleshooting](#11-troubleshooting)
12. [Glossary of visible symbols](#12-glossary-of-visible-symbols)

---

## 1. Getting oriented

When you open the engine, you see:

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: logo · worker status · ρ_s badge · icon buttons           │
├──────────────────────────────────┬──────────────────────────────────┤
│                                  │  RIGHT PANEL (9 cards):          │
│                                  │   - Status                       │
│   CHESSBOARD                     │   - Morphological state S₀       │
│   + player bars                  │   - Grammar G(S)                 │
│   + captured pieces              │   - Natural transformations      │
│   + clock                        │   - Category of morphisms        │
│                                  │   - Ω(search)                    │
│                                  │   - Evaluation f vs f_S          │
│                                  │   - Belnap evaluation            │
│                                  │   - Move history                 │
│                                  │   - Controls                     │
├──────────────────────────────────┴──────────────────────────────────┤
│  (hidden by default) Modals: settings, diagnostics, FEN, help,       │
│  ρ report, comparison                                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Two roles in one UI:**
- **Player role:** play chess. Ignore the right panel.
- **Researcher role:** inspect morphology, run teacher pipelines, A/B tests.

The engine works as a player right away. Everything else is optional
and additive.

---

## 2. The chessboard

### 2.1 Layout

The board is a standard 8×8 grid. Files `a–h` run left to right; ranks
`1–8` run bottom to top (from White's perspective). Coordinates appear in
the corners of edge squares and can be toggled off in Settings.

### 2.2 Piece interaction

| Gesture | Effect |
|---|---|
| **Click a piece** | Highlights legal moves (dots). |
| **Click a destination** | Plays the move. |
| **Click the same piece** | Deselects. |
| **Click another own piece** | Switches selection. |
| **Click an enemy piece** | If legal as a capture target — plays the move. Otherwise — deselects. |
| **Drag a piece** | Alternative to click-click. Drop on a legal destination. |
| **Click a promotion piece** | Appears when a pawn reaches the last rank. |

### 2.3 Visual cues

| Highlight | Meaning |
|---|---|
| **Yellow overlay** | Selected square. |
| **Faint yellow overlay** | Last move (from + to squares). |
| **Small dark dot** | Legal move to empty square. |
| **Dark ring** | Legal capture target. |
| **Red glow** | King in check. |
| **Green pulsing ring** | Hint move (after pressing Hint). |
| **Green arrow** | Last move direction (can be toggled off in Settings). |

You play as **White**. The engine plays as **Black**. To swap sides,
flip the board with **⇅** in the header — this only changes the
perspective, not who plays which color.

---

## 3. The right panel — top to bottom

### 3.1 Status card

**What it shows:**
- Main line: current state — "Your turn", "Engine is thinking...", "Check!",
  "Checkmate!", "Draw", "Resigned", "Time out".
- Sub line: move number and side to move, or engine performance stats
  after each engine move (elapsed ms, nodes searched, active policy).

**After an engine move**, the sub line contains a compact diagnostic:

```
147ms · worker · n=23502 · ext-3 · lmr-4 · ρ(d+1,L0,N1,F0)
```

Which reads:
- `147ms` — time spent
- `worker` — search ran in a Web Worker (or `main` if fallback)
- `n=23502` — nodes visited
- `ext-3` — extension budget for this position's cell
- `lmr-4` — LMR threshold used
- `ρ(d+1,L0,N1,F0)` — active ρ_s values: `d_base=+1`, `lmr_mult=0`,
  `null_enabled=1`, `futility_mult=0`

**The thinking dots** appear under the status when the engine is
searching.

### 3.2 Morphological state S₀

**Title:** `S₀ = I × Z × Φ = 48`.

This card shows the current **morphological signature** of the position —
the S₀ cell the engine is operating in.

**Three big labels:**

| Label | Reads | Meaning |
|---|---|---|
| `I (initiative)` | ATTACK / PRESSURE / DEFENCE / QUIET | Who has tactical momentum |
| `Z (zone)` | KING / CENTER / GLOBAL | Where the tension is |
| `Φ (phase)` | OPENING / MIDDLEGAME / TACTICAL / ENDGAME | Game stage |

**Key line:** `S = (QUIET, CENTER, OPENING)` — full signature.

**Budget grid** (four cells):

| Cell | Meaning |
|---|---|
| **extBudget** | Extension budget for in-check extensions |
| **lmrThreshold** | Late-move-reduction start threshold |
| **r_null** | Null-move reduction depth (only when ρ_s active) |
| **b_futility** | Futility margin in centipawns (only when ρ_s active) |

Values are `—` when the corresponding feature is disabled in Settings.

**S₀ Field** — a 4-layer grid showing **all 48 cells**:

```
OPEN    [●●●●●●●●●●●●]   ← 12 cells: 3 WHERE × 4 WHO
MIDDL   [●●●●●●●●●●●●]
TACT    [●●●●●●●●●●●●]
ENDG    [●●●●●●●●●●●●]
        KING  CENTER  GLOBAL
```

- **Color** = ρ-state of the cell (see legend below).
- **Brightness** = number of visits to that cell so far.
- **Gold dot in corner** = cell has an active ρ_s policy (one of the 8).
- **Pulsing gold ring** = cell is **currently active** (the current position
  lives in this cell).

**Hover any cell** to see a tooltip:
```
QUIET|CENTER|MIDDLEGAME
ρ = STABLE
visits = 47
streak = 3
ρ_s ACTIVE
```

**Click any cell** for a brief pulse animation (visual feedback only).

**Legend under the field:**

| Dot color | Meaning |
|---|---|
| Green | STABLE — attractor dynamics |
| Amber | METASTABLE — drifting |
| Blue | CYCLIC — periodic |
| Red | CHAOTIC — non-repeating |
| Gold ring | Cell has active ρ_s |

### 3.3 Grammar G(S)

**Title:** `Grammar G(S) · f_S weights · η`.

This card shows the **per-cell evaluation weights**.

**Row 1 — the ρ badge:**
- Badge text = the ρ-state of the current cell (STABLE / METASTABLE / CYCLIC / CHAOTIC).
- `visits: N, streak: M` — how often this cell has been seen, and how many
  consecutive visits had the same ρ-state.
- `η = 0.123` — **naturality defect**: how far this cell's weights are from
  the consensus of all cells sharing its WHO/WHERE/WHEN value. Small η means
  the cell behaves like its projections; large η means it's an outlier.

**Grammar table (6 rows):**

| Row | Weight |
|---|---|
| матеріал | material weight |
| позиція | positional weight |
| мобільність | mobility weight |
| король | king safety weight |
| пішаки | pawn structure weight |
| слони | bishop weight |

Each is multiplied into the corresponding eval component. Values are
clamped to `[0.40, 1.80]`.

- `×1.00` — neutral (baseline).
- `> ×1.15` — **hot** (green) — this component is emphasized in this cell.
- `< ×0.85` — **cold** (red) — this component is suppressed.

The engine learns these weights during self-play; the current cell's
values reflect accumulated experience.

### 3.4 Natural transformations

**Title:** `Natural transformations · Π_I · Π_Z · Π_Φ`.

This card shows the **projection consensus** — what the "average" cell
looks like along each axis.

**Row 1 — global coherence badge:**
- **COHERENT** (green) — cells agree with their projections (η small).
- **DRIFT** (amber) — cells diverge moderately.
- **BROKEN** (red) — cells are inconsistent (η large).

**Coherence value:** `coherence: 0.94` — a global 0..1 score.

**Three projection cells:**

| Cell | Shows |
|---|---|
| `Π_I[QUIET]` | The consensus for all cells whose WHO = QUIET |
| `Π_Z[CENTER]` | Consensus for all cells whose WHERE = CENTER |
| `Π_Φ[OPENING]` | Consensus for all cells whose WHEN = OPENING |

Each cell shows the **dominant weight** (which eval component dominates
that projection) and its numeric value.

**Log below** — top-4 cells with the highest naturality defect. These
are the outlier cells — the ones you'd want to inspect first.

### 3.5 Category of morphisms

**Title:** `Category of morphisms · Obj → Obj'`.

This card tracks **transitions between cells**. Every time the position
moves from one S₀ cell to another, that transition is counted.

**Four counters:**

| Counter | Meaning |
|---|---|
| **Об'єктів** (Objects) | How many distinct cells have been visited |
| **Прямих** (Direct) | Direct transitions recorded |
| **Композицій** (Composed) | Chains `A→B` ∘ `B→C` = `A→C` inferred |
| **Записано** (Recorded) | Total morphisms recorded this session |

**Log below** — top-4 most frequent morphisms, e.g.:
```
23×  QUI/MID→QUI/OPE  +0.42
```

Reads: transition `QUIET|MIDDLEGAME|...` → `QUIET|OPENING|...` happened
23 times, with average eval delta +0.42 pawns (from the mover's
perspective).

### 3.6 Ω(search)

**Title:** `Ω(search) · policy active`.

This card shows the **search-stability regime** of the last engine
search.

**The badge** shows one of:

| Ω | Meaning |
|---|---|
| **STABLE** | Eval agreed between depths — search converged cleanly |
| **METASTABLE** | Slow drift — search still improving |
| **CYCLIC** | Periodic oscillations — deepening doesn't help |
| **CHAOTIC** | High variance — search is unstable |

**Policy line** shows the effective search parameters used, e.g.:
```
D=5 · ext-4 · lmr-3 · t-1400ms · ρ(d+1,L0,N1,F0)
```

**Description line** explains the regime:
- "stabilizовано на глибині 5" — converged at depth 5
- "m(ŝ₀) @ глибина 4" — stopped early at depth 4 (STABLE)
- "[обірвано]" — search was cut off by time limit

The Ω regime **influences** the next search:
- STABLE → normal
- METASTABLE → depth +1
- CYCLIC → +50cp repeat penalty (avoid repetition draws)
- CHAOTIC → depth −1, wider quiescence (guard against horizon effects)

### 3.7 Evaluation f vs f_S

**Title:** `Evaluation f vs f_S`.

**Progress bar at top** — visualizes the eval on a −1000..+1000 cp scale.
White = good for White, dark = good for Black.

**Two values:**
- **f** — objective evaluation (all weights = 1.0)
- **f_S** — grammar-weighted evaluation (weights from the current cell)

The difference `f_S − f` shows **how much the morphology-specific
weights shift the evaluation** away from the neutral baseline.

### 3.8 Belnap evaluation

**Title:** `Belnap evaluation · 𝔸 = {T, F, B, N}`.

This card shows a **four-valued logic reading** of the position, one row
per eval component.

| Row | Reads |
|---|---|
| **Матеріал** (Material) | T / F / N |
| **Позиція** (Position) | T / F / N |
| **Король** (King) | T / F / N |
| **Пішаки** (Pawns) | T / F / N |
| **Слони** (Bishops) | T / F / N |
| **Контекст** (Context) | T / F / N |
| **Інтеграл** (Total) | combined |

**Value meanings:**

| Value | Condition |
|---|---|
| **T** (True) | Advantage above threshold |
| **F** (False) | Disadvantage below threshold |
| **B** (Both) | Both an advantage *and* a disadvantage present (rare) |
| **N** (Neither) | Neutral / below threshold either way |

The **Integral** row applies the Belnap bilattice `∧ = min`, `∨ = max` to
combine all component readings into a single classification.

This is unusual for a chess UI — most engines show a single number. Belnap
preserves **logical structure** of the position rather than collapsing it
to a scalar.

### 3.9 Move history

**Title:** `Move history`.

Two-column list of moves in algebraic notation. The last move is
highlighted in gold.

Scrolls automatically as the list grows.

### 3.10 Controls

**Title:** `Controls`.

| Button | Effect |
|---|---|
| **Нова гра** (New game) | Restart from the initial position |
| **Скасувати** (Undo) | Undo your move and the engine's reply |
| **Підказка** (Hint) | Engine suggests a move (highlighted on board) |
| **Здатися** (Resign) | Concede the game |

**Level selector** — engine strength, roughly:

| Level | Approximate strength |
|---|---|
| 1 — Beginner | Very weak, frequent mistakes |
| 2 — Easy | Occasional mistakes |
| 3 — Medium | Default, solid play |
| 4 — Hard | Deeper search |
| 5 — Expert | Deepest search, longest thinking |

Level affects search depth and time budget. At level 1, the engine
searches shallowly; at level 5, it uses maximum depth + time.

---

## 4. Header buttons

The header contains nine interactive elements:

### 4.1 Worker status badge

Small text showing `⚡ WORKER` (green) or `⚠ MAIN` (red).

- **WORKER** — search runs in a Web Worker thread (fast, non-blocking).
- **MAIN** — worker creation failed, search runs on the main thread (slower).

If you see `MAIN`, the engine still works but may freeze the UI briefly
during long searches. Common cause: opening the HTML from `file://`
in some browsers.

### 4.2 ρ_s policy badge

Shows `ρ_s ON (8)` or `ρ_s OFF`.

- **ON** — the ρ_s policy is active. Search parameters vary by cell.
- **OFF** — baseline mode. All cells use the default policy.

Click on the badge to open the **ρ report modal** (see §6.4).

### 4.3 📊 — Diagnostics

Opens the **S₀ Diagnostics** modal. Two tabs:

**Raw Δeval (v2)** — statistics from self-play telemetry:
- visited cells
- top-5 share
- entropy H
- effective cells count
- signal cells (`n ≥ 20 ∧ |t| ≥ 2`)
- total moves

**Teacher V (v3)** — statistics from teacher evaluations:
- raw trajectory entries
- dropped entries (if buffer overflowed)
- same metrics as raw, but for teacher data
- top-10 cells table with n / mean / variance / |t|

Use this to check whether the teacher pipeline is producing usable
signal.

### 4.4 ⚡ — Comparison

Opens the **Comparison** modal. Pick a position and depth, then click
**Run**. Three engines run in parallel:

| Engine | What it uses |
|---|---|
| **Classical** | Plain material + PST, no S₀ |
| **Belnap-only** | Belnap classification + f_S |
| **SUBIT v1.9.1** | Full: S₀ + Ω + ρ_s |

Each reports:
- **Move** (UCI notation)
- **Score** (cp)
- **Ω regime**
- **Depth** reached
- **Budget** (ext / lmr)

Below the table, the summary shows whether all three picked the same
move, or whether SUBIT diverged.

Useful for **demos** — shows concretely how SUBIT differs from a plain
engine on a specific position.

### 4.5 ? — Help

Opens the **Help** modal — the inline version of this manual, plus the
current version's changelog.

### 4.6 Ƒ — FEN

Opens the **FEN** modal:
- **Current position FEN** — copy this to save or share.
- **Load FEN** — paste any valid FEN to set up a custom position.

Useful for:
- Recreating positions from books.
- Testing specific scenarios.
- Sharing exact positions with collaborators.

### 4.7 ⇅ — Flip board

Rotates the board 180°. Your pieces appear at the top instead of the
bottom. Does **not** change who plays White/Black — just perspective.

### 4.8 ↓ — Export PGN

Downloads the current game as a `.pgn` file. Standard format, loadable in
any chess software (lichess study, chess.com analysis, Scid, etc.).

### 4.9 ⚙ — Settings

Opens the **Settings** modal. Each setting explained in §4.9.1–4.9.8.

#### 4.9.1 Theme

Board color scheme:
- **Classic** — green + cream
- **Wood** — warm brown + cream
- **Ocean** — grey-blue + light
- **Midnight** — dark grey + light

#### 4.9.2 Coordinates

Toggle file/rank labels on the board.

#### 4.9.3 Legal move highlight

Toggle the dots showing legal moves. Turn off for a cleaner look.

#### 4.9.4 η regularization

When ON, cells are pulled toward the projection consensus during
learning. This prevents overfitting to individual positions.

When OFF, cells evolve freely — faster learning, more erratic.

#### 4.9.5 Last-move arrow

Toggle the green arrow showing the last move direction.

#### 4.9.6 Per-cell resource budget

When ON, `extBudget` and `lmrThreshold` vary by cell. When OFF, all
cells use the same defaults.

#### 4.9.7 ρ_s policy

**This is the most important setting.**

- **ON** — active ρ_s policy. Search behaviour varies by cell.
- **OFF** — baseline. All cells behave identically.

Set to OFF when running A/B tests where you want to compare against
baseline.

#### 4.9.8 Expanded evaluation

- **ON** — 13 eval components (material + 7 extended).
- **OFF** — 6 components only (faster but less accurate).

**Storage info box** at the bottom shows:
- When grammar was last saved.
- How many cells have been visited.
- How many morphisms recorded.
- Storage size in KB.

**Buttons:**
- **Reset grammar** — wipes all learned weights. Asks for confirmation.
  Cannot be undone.
- **Done** — save settings and close.

---

## 5. Play workflow

### 5.1 A normal game

1. Open the HTML file.
2. Play a move by clicking a piece, then clicking a destination.
3. Wait for the engine to reply (dots appear in the status card).
4. Repeat until checkmate, draw, or resignation.

That's it. Everything else is optional.

### 5.2 Getting a hint

Click **Hint** in the Controls card. The engine searches briefly, then
highlights a suggested move with a green pulsing ring.

Hints don't end your turn — you can still choose a different move.

### 5.3 Undoing

Click **Undo**. Two moves are undone: your move and the engine's reply
(so the position returns to your turn).

If the engine is thinking, undo waits until it finishes.

### 5.4 Loading a position

1. Click **Ƒ** in the header.
2. Paste a FEN into the lower text box.
3. Click **Load**.

The board resets to that position. Move history and telemetry reset.

### 5.5 Exporting a game

Click **↓** in the header. A `.pgn` file downloads. It includes all moves,
the result, and standard PGN headers.

---

## 6. The ρ_s policy — what it is and how to activate it

This section is for **researchers**. If you just want to play chess, skip
it — the engine works fine with ρ_s off.

### 6.1 What ρ_s is

ρ_s is a **policy vector** that lives in each of the 8 active cells.
It controls four search parameters:

```
ρ_s = (d_base, r_LMR, r_null, b_futility)
```

- **d_base** — depth offset at the root (how much deeper/shallower to search)
- **r_LMR** — late-move reduction threshold multiplier
- **r_null** — null-move reduction depth
- **b_futility** — futility pruning margin in centipawns

**Default (baseline):** `(0, 2, 2, 150)` — identical for all 40
non-active cells.

**Active cells (8):** values derived from teacher telemetry. See §7 for
how to produce them.

### 6.2 How ρ_s is constructed

Given a teacher report with per-cell means, for each active cell:

```
norm        = clamp(mean / 100, −1.5, +1.5)
d_base      = clamp(2 + 0.5·norm,  1,   4)
r_LMR       = clamp(2 − 0.4·norm,  1,   3)
r_null      = clamp(2 − 0.2·norm,  1,   3)
b_futility  = clamp(150 + 30·norm, 80, 250)
```

Cells with positive mean (position favors side to move) get **more**
depth and **less** reduction — the engine searches harder where it's
already winning.

### 6.3 Activating ρ_s — three ways

**Way 1: Console (browser)**
```js
__subit.activateRhoS()
```
Reads the current teacher telemetry and constructs ρ_s from it. Requires
teacher data (see §7).

**Way 2: Via the ρ report modal** (if implemented)

Click the ρ badge in the header, then click "Activate ρ_s from teacher".

**Way 3: Set manually**
```js
__subit.subitState.rhoSMap = {
  'QUIET|CENTER|OPENING': { d_base: 3, r_LMR: 1, r_null: 3, b_futility: 200, n: 100, mean: 50, t: 5 }
};
__subit.subitState.rhoSFrozen = true;
__subit.setPolicyEnabled(true);
```

### 6.4 Inspecting ρ_s

**Console:**
```js
__subit.rhoSReport()
```

Prints all 8 active cells with their parameters, teacher stats, and the
mapping to effective search parameters.

**In the UI:**
- The ρ badge in the header shows `ρ_s ON (8)` when active.
- The **budget grid** in the S₀ card shows `r_null` and `b_futility`.
- The **status sub-line** after each move shows `ρ(d+1,L0,N1,F0)`.

### 6.5 Disabling ρ_s

**Settings modal:** Set "ρ_s policy" to OFF.

**Console:**
```js
__subit.setPolicyEnabled(false)
```

This immediately switches to baseline behaviour. Existing learned grammar
weights remain untouched.

---

## 7. Teacher run workflow — full pipeline

This is the **most involved workflow** in the engine. Follow it step by
step the first time.

### 7.1 Overview

The teacher pipeline:

1. Self-play a batch of games (fast, low-quality).
2. Collect the FENs visited.
3. Re-evaluate each unique FEN at deeper depth (slow, high-quality).
4. Compute per-cell reward statistics.
5. Filter to signal cells (`n ≥ 20`, `|t| ≥ 2`).
6. Use those cells to construct ρ_s (§6.2).

Takes ~20 minutes for 100 games at the current script settings.

### 7.2 Step-by-step (browser console)

**Reset state:**
```js
__subit.teacherClear();
__subit.telemetryClear();
__subit.resetGrammarToBaseline();
```

**Run self-play:**
```js
await __subit.selfPlay(100, { depth: 2, maxPlies: 100, epsilon: 0.2, topK: 3 });
```

Wait 10–15 minutes. Progress logs appear every 500 moves.

**Run teacher evaluation:**
```js
await __subit.batchTeacherEval({ depth: 4, R_max: 300, concurrency: 2 });
```

Wait 5–10 minutes. Progress logs every 500 FENs with ETA.

**Inspect the report:**
```js
__subit.teacherReport()
```

Look for:
- `signalCells ≥ 8` — enough data to build ρ_s.
- `droppedRaw = 0` — no buffer overflow.
- `entropy H ∈ [3.5, 4.5]` — good cell spread.

**Save a snapshot:**
```js
__subit.saveTeacherSnapshot('run1');
```

Persists to `localStorage` so you can compare runs later.

**Activate ρ_s:**
```js
__subit.activateRhoS();
```

**Verify:**
```js
__subit.rhoSReport();
```

### 7.3 Step-by-step (Node runner)

Same pipeline, from the command line:

```bash
node runners/run.js --mode teacher --games 100 --depth 2 --out results/run1.json
```

The output JSON contains the full report. See `results/run1.json` after
the run.

### 7.4 Cross-run stability check

To verify the teacher pipeline is stable, run teacher twice and compare:

```js
await __subit.selfPlay(100, {...});
await __subit.batchTeacherEval({...});
__subit.saveTeacherSnapshot('run1');

__subit.teacherClear();
__subit.telemetryClear();
__subit.resetGrammarToBaseline();

await __subit.selfPlay(100, {...});
await __subit.batchTeacherEval({...});
__subit.saveTeacherSnapshot('run2');

__subit.compareTeacherSnapshots('run1', 'run2');
```

**Gate:** Jaccard similarity of signal-cell sets ≥ 0.6. If below, the
teacher pipeline is not stable — you have a bug or insufficient sample.

---

## 8. A/B testing workflow

Compare ρ_s against baseline.

### 8.1 Pre-registered gate

**Metric:** Δmean reward per transition on the 8 active cells.

**Decision table:**

| Δmean | Verdict |
|---|---|
| `> +15 cp` | PASS → extend to 400 games |
| `[−5, +15] cp` | MARGINAL → more games needed |
| `< −5 cp` | FAIL → rollback ρ_s |

### 8.2 Running (Node)

**Baseline (policy off):**
```bash
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy off --out results/base-final.json
```

**ρ_s (policy on):**
```bash
node runners/run.js --mode match --games 400 --depth 2 --seed 42 \
  --policy on --out results/rho-final.json --baseline results/base-final.json
```

The second command prints the comparison at the end:

```
=== A/B COMPARISON ===
baseline : results/base-final.json (policy=off, games=400)
baseline mean = +12.34 cp
current  mean = +28.56 cp
Δmean        = +16.22 cp
verdict      = PASS (Δmean > +15 cp)
```

### 8.3 Interpreting the result

- **PASS** — ρ_s helps. Update `docs/DECISIONS.md`, consider v1.9.2.
- **MARGINAL** — inconclusive. Run 800 games or tune ρ_s construction.
- **FAIL** — ρ_s hurts. Roll back, document in ADR.

### 8.4 Honest limitations

- **SE ≈ 27 Elo at 200 games.** A `+15` result is `< 1σ` — noise.
- **400 games is the minimum** for a confident decision.
- **Self-play, not cross-play.** Both sides use the same policy.
- **One starting position.** No opening book variance.

For a truly rigorous test, see `docs/ROADMAP.md` — the benchmark harness
(v1.10) will address all four limitations.

---

## 9. Console API reference

Every command available through `window.__subit` in the browser console
(F12 → Console tab).

### 9.1 Verification

| Command | Expected output |
|---|---|
| `__subit.perft(4)` | `197281` (move generator correct) |
| `__subit.eval()` | `≈ +10` cp at start |
| `__subit.computeS()` | `{who: 'QUIET', where: 'CENTER', when: 'OPENING'}` |
| `__subit.policyFor()` | `{d_base, lmr_mult, null_enabled, futility_mult}` |
| `__subit.searchParamsFor()` | full search param object |

### 9.2 Playing

| Command | Effect |
|---|---|
| `__subit.state.pos` | Current position object |
| `__subit.state.moveHistory` | Array of {move, san} |
| `__subit.chess.toFEN(state.pos)` | Current FEN |

### 9.3 Self-play

| Command | Effect |
|---|---|
| `await __subit.selfPlay(N, opts)` | N self-play games |
| `opts.depth` | Search depth (default 2) |
| `opts.maxPlies` | Max plies per game (default 160) |
| `opts.epsilon` | ε-greedy randomness (default 0.2) |
| `opts.topK` | Top-K moves for ε-greedy (default 3) |

### 9.4 Teacher

| Command | Effect |
|---|---|
| `await __subit.batchTeacherEval(opts)` | Offline FEN evaluation |
| `__subit.teacherReport()` | Full statistics |
| `__subit.teacherClear()` | Wipe teacher data |
| `__subit.teacherSave()` | Persist to localStorage |

### 9.5 ρ_s

| Command | Effect |
|---|---|
| `__subit.activateRhoS()` | Build ρ_s from teacher |
| `__subit.rhoSReport()` | Print active cells |
| `__subit.policyFor(fen?)` | Get policy for position |
| `__subit.searchParamsFor(fen?)` | Get full search params |
| `__subit.setPolicyEnabled(true\|false)` | Toggle ρ_s |

### 9.6 Telemetry

| Command | Effect |
|---|---|
| `__subit.telemetryReport()` | Raw Δeval stats |
| `__subit.telemetryClear()` | Wipe raw data |
| `__subit.getSignalCells()` | Array of signal cell keys |

### 9.7 Snapshots

| Command | Effect |
|---|---|
| `__subit.saveTeacherSnapshot('name')` | Save teacher run |
| `__subit.listTeacherSnapshots()` | List saved runs |
| `__subit.compareTeacherSnapshots('a','b')` | Jaccard similarity |
| `__subit.deleteTeacherSnapshot('name')` | Delete a snapshot |

### 9.8 Grammar

| Command | Effect |
|---|---|
| `__subit.resetGrammarToBaseline()` | Wipe all learned weights |
| `__subit.subitState.grammarCells` | Access raw cell data |

---

## 10. Keyboard shortcuts

All shortcuts work when focus is not in a text input.

| Key | Action |
|---|---|
| `N` | New game |
| `U` | Undo |
| `H` | Hint |
| `F` | Flip board |
| `Esc` | Close any open modal |

**Browser conflict note:** the shortcuts don't use Ctrl/Cmd modifiers, so
they won't conflict with browser shortcuts. But if a modal is open,
`Esc` takes priority.

---

## 11. Troubleshooting

### 11.1 "Engine doesn't respond to my moves"

- Check the status card — it should say "Your turn".
- If it says "Engine is thinking...", wait.
- If the engine never replies, check the browser console for errors.

### 11.2 "Worker creation failed"

The engine falls back to main-thread search. Slower but works.
Common cause: opening the file via `file://` protocol in some browsers.

**Fix:** serve the file over HTTP:
```bash
# Python 3
python -m http.server 8000

# Then open http://localhost:8000/src/subit_chess_v1.9.1.html
```

### 11.3 "All cells are grey in S₀ Field"

No cells visited yet. Play some moves — cells will color in as the
engine explores.

### 11.4 "ρ_s badge is OFF but I want it ON"

ρ_s requires teacher data first. Either:
1. Run the pipeline in §7, or
2. Set `subitState.rhoSMap` manually (§6.3 way 3).

### 11.5 "Teacher report shows 0 signal cells"

The self-play run didn't produce enough data. Try:
- More games: `await __subit.selfPlay(200, {...})`
- Deeper self-play: `depth: 3` instead of `2`
- Higher ε: `epsilon: 0.3` for more exploration

### 11.6 "Reset grammar but I lost everything"

Yes — Reset grammar is irreversible. The confirmation dialog exists for
this reason. Take a snapshot before resetting if you want to keep data.

### 11.7 "PGN doesn't open in lichess"

Check that the FEN or moves are valid. Some unusual positions (custom
FENs from the Ƒ modal) may not round-trip cleanly.

### 11.8 "Board freezes during engine move"

Your browser doesn't support Web Workers, or the worker crashed. The
engine falls back to main-thread search, which blocks the UI briefly.
Reduce the level to 1–2 for shorter searches.

---

## 12. Glossary of visible symbols

Every symbol that appears in the UI, in one list.

| Symbol | Where | Meaning |
|---|---|---|
| `Σ` | Logo | SUBIT mark (Greek sigma) |
| `⚡ WORKER` | Header | Search running in Worker thread |
| `⚠ MAIN` | Header | Search running on main thread |
| `ρ_s ON/OFF` | Header | Policy active state |
| `📊` | Header | Diagnostics |
| `⚡` | Header | Comparison |
| `?` | Header | Help |
| `Ƒ` | Header | FEN load/copy |
| `⇅` | Header | Flip board |
| `↓` | Header | Export PGN |
| `⚙` | Header | Settings |
| `S₀ = I × Z × Φ = 48` | Panel | Morphological space definition |
| `I, Z, Φ` | Panel | Initiative, Zone, Phase |
| `ATTACK / PRESSURE / DEFENCE / QUIET` | Panel | WHO classification |
| `KING / CENTER / GLOBAL` | Panel | WHERE classification |
| `OPENING / MIDDLEGAME / TACTICAL / ENDGAME` | Panel | WHEN classification |
| `extBudget` | Panel | Extension budget |
| `lmrThreshold` | Panel | LMR threshold |
| `r_null` | Panel | Null-move R value |
| `b_futility` | Panel | Futility margin (cp) |
| `ρ = STABLE / METASTABLE / CYCLIC / CHAOTIC` | Panel | Cell stability class |
| `η` | Panel | Naturality defect |
| `Π_I, Π_Z, Π_Φ` | Panel | Projections |
| `Ω` | Panel | Search stability regime |
| `f`, `f_S` | Panel | Objective vs grammar-weighted eval |
| `T / F / B / N` | Panel | Belnap truth values |
| `ρ(d+1,L0,N1,F0)` | Status | Active ρ_s: d_base, lmr_mult, null_enabled, futility_mult |

---

## Appendix — Related documents

| Document | Purpose |
|---|---|
| `README.md` | Project overview, quick start, changelog |
| `docs/SUBIT-CHESS-SPEC.md` | Formal specification (research-grade) |
| `docs/DECISIONS.md` | Architecture Decision Records |
| `docs/ROADMAP.md` | Release plan and gates |
| `docs/USER-MANUAL.md` | This file |
| `CHANGELOG.md` | Version history |

---

*End of User Manual v1.0 — for engine v1.9.1.*