# SUBIT-CHESS v3.0.15 — release snapshot

Дата: 2026-11-24

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.15.html` | 560,231 B | `6AB51C412716DB20175247BBA74424881DCE921D9563C1457AEDDA32FF368DD5` |

Артефакт відповідає `src/subit_chess_v3.0.15.html` / `index.html` після `npm run build` (commit `f795dd3`, tag `v3.0.15`).

## Статус

Формалізований release snapshot. **No Elo gain has been established; no external strength claim.** `UCI_Elo` (якщо використовується в майбутніх зовнішніх тестах) — режим обмеження сили Stockfish, не людський Elo.

## Що включено

- **Behavior-preserving perf micro-opts (no search/eval/ordering behavior change).** Hot-path cleanups у `src/engine/core.mjs` та `src/engine/search.mjs`: `isAttacked`/`smallestAttacker`/`generateMoves`/`maxAttackedVictim` loop/bit-op tightening, hoisted SEE-enabled check у `scoreMoves`, видалено unused `scoreMoves` ctx arg, `opposite()`→`us^1` у hot paths, promotion/castle constant cleanup, indexed loops у `hasLegalMove`/check-prefilter/`staticCheckEvasion`, reusable SEE attacker object, optional `generateMoves` out buffer, per-ply/probe/check move buffers, optional `makeMove` outUndo з per-ply/probe undo reuse, TT probe move-hint reuse в alphabeta. Верифікація: identical `bench:engine` baseline (`d6=20969/8/b1c3, d7=46933/28/b1c3, d8=139085/19/b1c3, total 206987`), `test:perft` CORE OK, `npm test` PASS, gauntlet 12/12 PASS. NPS шумить; no strength/Elo claim.
- **TT exact-preference (behavior change, measured neutral/inconclusive).** `TranspositionTable.store` зберігає exact над non-exact при equal depth/same key/non-stale. A/B vs `72eb3b8` (48g, d4, seed 20261124, no-cycle): 15W/18D/15L, 0.500, CI [-79.9,+79.9]. No Elo gain claim.
- **67dfd2c vs 09706a9 measurement (neutral/inconclusive).** 234g combined ~0.524, CI spans 0; clean no-cycle batch4 15W/19D/14L 0.510 CI [-70.9,+86.1]. No Elo gain claim.
- **Measurement/verification hardening.** `bench/version_match.mjs` strict no-cycle/opening IDs/git HEAD/abort capture; `bench/fens/openings.epd` 24→48; audit/FD no-search-effect guards; Gate 4 traceability `docs/INVARIANT-COVERAGE.md`; executable `SM-INV-003`/`SPG-INV-005`.

## Перевірка

```
npm run build
npm test
node bench/gauntlet_strength.mjs
npm run bench:engine
```

Очікуваний `bench:engine` baseline: `d6=20969/8/b1c3, d7=46933/28/b1c3, d8=139085/19/b1c3, total 206987`.

## Супутні файли в цій папці

- `subit_chess_v3.0.15_audit.md` — audit notes (pre-existing in folder).
- `subit_chess_v3.0.15_pre_theory_report.md` — pre-theory report (pre-existing in folder).
