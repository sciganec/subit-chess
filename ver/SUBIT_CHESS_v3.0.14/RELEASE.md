# SUBIT-CHESS v3.0.14 — release snapshot

Дата: 2026-11-22  
Тип: **correctness / measurement / search-safety increment**. Це **не** Elo-gain release, **не** external strength claim і **не** canonical SUBIT-∞ conformance claim.

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.14.html` | 553,312 B | `38349F4DC1B8DB5895225C8AE2031F40D915026F7FA521BAE107B9F1CF02FD93` |

Артефакти: `src/subit_chess_v3.0.14.html` та `index.html` (той самий bundle). Попередній: `ver/SUBIT_CHESS_v3.0.13/`. Git tag: `v3.0.14` на release-formalization commit.

## Зміни

- **Self-play adjudication fix (measurement correctness).** `src/engine/learn.mjs` `playGame`: no-legal-move класифікується через `pos.status()` (checkmate/stalemate), terminal mapping читає `status().result` (`white`/`black`/`draw`). `core.moveToUci/moveToSan` безпечно обробляють move 0 (`0000`/`(none)`). Regression tests у `tests/engine.learn.mjs`. Попередні checkmate-misadjudicated A/B виміри вважаються недійсними.
- **Self-play repetition sync fix (measurement correctness).** `learn.playGame` синхронізує обидва engines з FEN + repetition stack (`rep/repHi/repLimit`) після кожного ходу; black ініціалізується через `Engine.setFEN`. Regression у `tests/engine.learn.mjs`. Попередні repetition-sensitive A/B можуть бути неповними.
- **Root check extension + qsearch mate-delta guard (correctness/consistency).** `negamaxRoot` застосовує check extension на root check-giving moves; qsearch delta pruning guarded by `alpha < MATE_THRESHOLD`, щоб не відсікати mating captures у near-mate alpha windows. Gauntlet guard: SF19 g8 `horizon c3c2 blunder (SF19 g8, d4 guard)`, reject `c3c2`, depth 4. Regression у `tests/engine.audit2.mjs`. Повний `npm test` PASS, gauntlet 11/11 PASS.
- **Parked/default-off candidates.** `search.quietThreatExtension` (`enabled:false,maxPly:2,minVictim:900`) — inconclusive A/B 64g d4 seed24 `dS 0.000 SE 0.077`. `search.lmr.threatExemptMinVictim` (default 0) — corrected reruns negative/neutral across 192g; default remains off.

## External anchor / strength

- **No new Elo result / no accepted external anchor.** `learn.compare` >=2 seeds d4/64g для поведінкових змін 67dfd2c не запускалось до формалізації релізу; перед будь-яким strength claim потрібен контрольований rerun.
- Historical SF19 tables in `docs/EXTERNAL_ANCHOR_SF19_2026-11-22.md` are v3.0.11/v3.0.12 baseline only and must not be presented as v3.0.14 strength results.

## ADR / обмеження

- No scalar blend `U(P)` (ADR 0019).
- No structural/context move ordering (ADR 0023 / Gate 3 kill).
- `TT_MAX_AGE = 0` preserved by default (ADR 0022).
- Automatic draws terminal; claimable draws playable (ADR 0020).
- Repetition owned by game position (ADR 0016).
- Theory docs 81-99+ research-only/non-binding.
