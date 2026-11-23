# SUBIT-CHESS v3.0.13 — release snapshot

Дата: 2026-11-22  
Тип: **Field Dynamics / analysis instrumentation increment**. Це **не** Elo-gain release, **не** external strength claim і **не** canonical SUBIT-∞ conformance claim.

| Файл | Розмір | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.13.html` | 553,312 B | `2E2284E36FB5FAAD89976B79BB39ABE5DEB664F4A2132553A7ACFA69CEDE2F09` |

Артефакти: `src/subit_chess_v3.0.13.html` (code commit `191014d`) та відповідний `index.html` у стані v3.0.13; snapshot збережено тут як `ver/SUBIT_CHESS_v3.0.13/subit_chess_v3.0.13.html`. Попередній: `ver/SUBIT_CHESS_v3.0.12/`. Git tag: `v3.0.13` на commit `191014d`.

## Зміни

- **Field Dynamics Module (`src/engine/field.mjs`).** Операціоналізовано FD-01..FD-14: канонічні координати 0x88/$(x,y)$/idx, G4 ортогональний комплекс ($|V|=64, |E|=112, |F_{int}|=49, \chi=2, \beta_1=49$), дискретні Grad/Div/Curl, Gauss/Stokes тотожності, tracing впливу та pinned-piece geometric reach. Канали White/Black attack/defense/flux розділені (DO NOT COLLAPSE).
- **Engine integration (observational only).** Додано `Engine.fieldDynamics()` та `fields` summary в `Engine.analyze()`. Модуль **не** впливає на legal move generation, evaluation, ordering, search або UCI move selection (FD-10 / ADR 0023).
- **Invariants/tests.** FD-INV-001..010, `tests/engine.field.mjs`, інтеграція `verifyFieldInvariants()` у `verifyPositionAll()`. Повний `npm test` проходив після verifier follow-up на 2026-11-22.
- **TT age diagnostic (ADR 0022).** Додано `search.ttMaxAge` (default `0`) та UCI `TT.MaxAge`; default behavior unchanged. A/B 64g d4 seed23: `ttMaxAge=1` vs `0` => `dS -0.203 SE 0.067`, verdict **reject**.
- **Gauntlet/eval hooks.** g9 horizon guard (`b4c5` after `d5c6`, d6, `score<50`), `scoreBelow/scoreAbove` support. Eval hook A/B: `kingOpenFile 12 vs 0` `dS +0.063 SE 0.079` inconclusive; `kingAttack 8 vs 0` `dS +0.109 SE 0.083` inconclusive; defaults unchanged.

## External anchor / strength

- **No new Elo result.** No accepted external anchor for this release. Historical SF19 tables in `docs/EXTERNAL_ANCHOR_SF19_2026-11-22.md` are v3.0.11/v3.0.12 baseline only and must not be presented as v3.0.13 strength results.
- Since Field Dynamics is observational and does not change playing behavior, no new external-strength claim is made.

## ADR / обмеження

- No scalar blend `U(P)` (ADR 0019).
- No structural/context move ordering (ADR 0023 / Gate 3 kill).
- `TT_MAX_AGE = 0` preserved by default (ADR 0022); `TT.MaxAge` is diagnostic only.
- Automatic draws terminal; claimable draws playable (ADR 0020).
- Repetition owned by game position (ADR 0016).
- Theory docs 81-99+ research-only/non-binding.
