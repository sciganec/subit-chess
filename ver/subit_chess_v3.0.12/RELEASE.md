# SUBIT-CHESS v3.0.12 — release snapshot

Дата: 2026-11-22  
Тип: **measured search-safety/plumbing increment**. Це **не** external Elo-gain claim і **не** canonical SUBIT-∞ conformance claim.

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.12.html` | 493,910 B | `449CD4389C163B982452B4EDD9B15563B315C5C168BAD4EBC2526D48C23F2742` |

Артефакти: `src/subit_chess_v3.0.12.html` та `index.html` (той самий bundle, `node build/bundle.mjs`: 11 engine modules, 482.3 kB). Попередній: `ver/subit_chess_v3.0.11/`. Tag: `v3.0.12` на commit `3b61a04`.

## Зміни

- **LMR conservative default.** `search.lmr.extraReduction 1 -> 0`, `search.lmr.maxReduction 1` (keeps `minDepth 3`, `minMoveIndex 3`, `reduction 1`). Self-play: d4 32g seed13 `+0.156 SE0.090` (7W/23D/2L); d5 24g seed17 `+0.250 SE0.121` accept (8W/14D/2L). SF2200@200ms 10g smoke noisy (`0.60 SE0.138`). Node cost startpos d6 ~14562 -> 19605 (~+35%), expected.
- **Quiet-move ordering threat bonus.** Direct attacks by a moved quiet piece on enemy rook/queen/minor get a bounded ordering bonus (tactical signal only; not Gate 3 structural/context ordering). Queen-threat LMR exemption tested and **parked/not enabled by default**.
- **UCI/engine plumbing.** `Engine.reset()` for clean `ucinewgame`; UCI adapter/time management improvements; `bestmove 0000` fix; SEE/qsearch pruning knobs exposed with SEE enabled by default.
- **Eval hooks.** `kingOpenFile` penalty hook (default 12, inconclusive small A/B) and `kingAttack` hook (default 0, candidate 8 inconclusive smoke).
- **Correctness/tests.** Audit311 fixes and `tests/engine.audit311.mjs` (20 checks) in `npm test`. FEN validation hardened (adjacent digit spans, per-side piece count). `contextAdjust` moved from no-op to minimal bounded deterministic scaling (AUD-311-16). Gauntlet/smoke/tactics regressions green.
- **External anchor.** SF19 N=20 @200ms (new default): 2000 `8W/4D/8L mean 0.50 SE0.10`; 2200 `5W/6D/9L mean 0.40 SE0.091`; 2400 `3W/9D/8L mean 0.375 SE0.078`. Mixed/noisy, within noise of prior N=10 baseline; **not an Elo-gain/regression claim**. `UCI_Elo` is Stockfish limited-strength mode, not human Elo.

## ADR / обмеження

- No scalar blend `U(P)` (ADR 0019).
- No structural/context move ordering (ADR 0023 / Gate 3 kill).
- `TT_MAX_AGE = 0` preserved (ADR 0022).
- Theory docs 81-99+ research-only/non-binding.
