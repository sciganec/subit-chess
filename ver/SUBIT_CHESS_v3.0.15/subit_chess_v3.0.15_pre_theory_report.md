## Ознайомлення (theory/spec) — короткий звіт

### Binding constraints (ADR 0013-0023, `docs/DECISIONS.md`)
- **ADR 0016**: repetition history owned by game position; `rep/repHi/repLimit` must travel/adopt correctly.
- **ADR 0019**: uncertainty is a vector, never a penalty; no scalar blend; profile/certificate beside score. Driver-steered verification is not a shipped strength claim (Gate 7 bench-only).
- **ADR 0020**: claimable draws playable; only automatic draws terminal (75-move, fivefold, dead material); horizon/status must agree.
- **ADR 0021**: search off main thread, one Engine per worker, fallback stays; Memory read/seeded but cold-search semantics preserved.
- **ADR 0022**: terminal correctness; no stand-pat in check; qdepth cap resolves evasion; stalemate probe every qdepth when no capture generated; negamax only automatic draws terminal; futility uses opponent-perspective static; `TT_MAX_AGE=0`, TT not reused across root searches.
- **ADR 0023**: structural/context move ordering deleted (Gate 3 kill). Reintroduction needs **new ADR + fresh pre-registered A/B**, not tuning.
- **Process**: no Elo gain claim without accepted external anchor; no default behavior changes without measurement/A/B; theory 81-99+/articles 4-5 are research-only/non-binding; no canonical SUBIT-∞ conformance claim.

### Theory map (`c:\Users\sciga\subit-chess\docs\theory\`)
| Area | Status | v3.0.15 relevance |
|---|---|---|
| `01-32/`, `33-47/`, `48-80/` | Historical mixed theory corpus; binding only where adopted by ADR/code/tests | Use selectively for verification/audit/measurement ideas; avoid semantic rewrites without evidence. |
| `81-99/`, `81-100/`, `article_04.md`, `article_05.md` | Research-only/non-binding (ROADMAP/ADR notes) | Process inspiration only; no autonomous/self-modifying behavior. |
| `81-100/` Field Dynamics FD-01..FD-14 | DRAFT specs; **partially implemented analytically** in v3.0.13 (`src/engine/field.mjs`, FD-INV-001..010, exposed via `fieldDynamics()/analyze().fields`) with no movegen/eval/ordering/search effect | Safe: analytical hardening/tests/reporting. **Not safe without new ADR+A/B**: FD-09 eval integration, FD-10 search integration, any field-derived ordering/pruning/eval. |
| `101-120/SUBIT_CHESS_UST_ULAM_STRUCTURAL_TRANSPOSITION.md` | Research-only, experimental, non-core; **integration into core forbidden until validation** | Offline/research only. No core search/eval/ordering integration in v3.0.15. |

### Spec map (`c:\Users\sciga\subit-subit\spec\`)
| Spec | Maturity | Use for v3.0.15 |
|---|---|---|
| `subit_spec_v0.1.md` | Foundational SUBIT-64 primitive | Lineage/context only. |
| `subit_infinity_spec_v5.md`, `v5_2.md` | Formal historical v5 line; hypothesis-formulation/cautionary | Research lineage only. |
| `subit_infinity_spec_v6/subit_v6.13.37-39` (per README) | **Stable core line** (v6.13.39 stable) | Canonical stable reference point; still not a chess-engine conformance target unless adopted by ADR. |
| `subit_infinity_spec_v6/subit_v6.14.0/*` | **Integrated draft / RC prep, NOT STABLE**; G-12..G-15 open | Do not couple v3.0.15 to it; research vocabulary only. |
| `SUBIT_ECOSYSTEM/01_..._MASTER_SPECIFICATION_v0.1.0.md` | Initial canonical draft (master architecture) | Descriptive/provenance vocabulary only; no engine behavior change. |

## v3.0.15 started (committed + pushed)

- **Commit pushed:** `9f31c00` on `origin/main` — `v3.0.15: start development candidate`.
- **Bump/build:** `package.json`, `src/engine/index.mjs`, `tests/engine.driver.mjs`, `readme.md`, `docs/USER-MANUAL.md`, `CHANGELOG.md` updated; built `src/subit_chess_v3.0.15.html` + `index.html` (12 modules, 542.6 kB).
- **Tests:** `npm test` PASS (full suite, including app DOM checks).
- **Intentionally untracked:** `docs/theory/101-120/` (left untouched).

## Evidence-first v3.0.15 queue (ADR-compatible)

1. **Measurement gate (required before strength claim):** run `learn.compare` >= 2 seeds, d4/64g, `67dfd2c` vs `09706a9` for root check extension + qsearch mate-delta guard. No claim without measured result.
2. **Gate 4 hardening:** close executable invariant-coverage gaps for shipped modules (map binding INV IDs to tests/code; keep scope gap explicit; no theory-driven behavior invention).
3. **Gate 5 prep:** build licensed/provenanced `bm/am` EPD set + runner metadata/checksums; no Elo claim.
4. **Gate 6 step 1 (profile-driven):** staged move generation experiment only with pre-registered perf/identical-behavior or A/B gate; preserve ADR 0022 terminal/qsearch invariants.
5. **W08/ADR 0021 stress:** worker lifecycle/fallback/reset/TT-memory reuse/clock/abort stress protocol.
6. **FD analytical-only hardening:** golden tests proving no search result change from FD analysis; no FD-09/FD-10 integration.