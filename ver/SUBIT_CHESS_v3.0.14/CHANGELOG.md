# Changelog — SUBIT-CHESS v3.0.14

## [3.0.14] — 2026-11-22

Formalized release snapshot. Correctness/measurement/search-safety increment. No Elo gain established; no external strength claim.

- **Version bump.** Prepared v3.0.14 development candidate after v3.0.13 candidate commits.
- **Quiet-threat extension candidate (parked, default off).** `search.quietThreatExtension` (`enabled:false`, `maxPly:2`, `minVictim:900`). g9 catches `...b4c5` at d5 (vs d6 baseline) but misses at d4; node cost +61% at d6 on that case. A/B self-play 64g d4 seed24: `dS 0.000 SE 0.077`, 12W/40D/12L, inconclusive. Default remains off.
- **Self-play adjudication fix (measurement correctness).** `src/engine/learn.mjs` `playGame`: no-legal-move uses `pos.status()` for checkmate/stalemate; terminal mapping reads `status().result` (`white`/`black`/`draw`). `core.moveToUci/moveToSan` handle move 0 safely (`0000`/`(none)`). Regression in `tests/engine.learn.mjs`. Prior checkmate-misadjudicated A/B runs invalidated.
- **Self-play repetition sync fix (measurement correctness).** `learn.playGame` syncs both engines with FEN + repetition stack (`rep/repHi/repLimit`) after each move; black initialized via `Engine.setFEN`. Regression in `tests/engine.learn.mjs`. Prior repetition-sensitive A/B runs may have missed repetition adjudications.
- **LMR threat-exempt candidate (parked, default off).** `search.lmr.threatExemptMinVictim` default `0`. Corrected reruns d4 64g: seed25 `dS -0.156 SE 0.077` (reject); seed26 `dS -0.109 SE 0.086` (inconclusive); seed27 `dS -0.016 SE 0.075` (inconclusive). Negative/neutral across 192g; default remains off.
- **Root check extension + qsearch mate-delta guard.** `negamaxRoot` applies check extension on root check-giving moves; qsearch delta prune guarded by `alpha < MATE_THRESHOLD`. Gauntlet guard SF19 g8 `c3c2` reject at d4. Regression in `tests/engine.audit2.mjs`. `npm test` PASS, gauntlet 11/11 PASS.
- **External anchor.** No new Stockfish match run; no accepted external anchor. No Elo claim.
