# Invariant Coverage Snapshot (v3.0.16 dev)

**Status:** evidence-first traceability snapshot. **Not a claim of full theory-corpus coverage.**  
**Date:** 2026-11-23

## Scope

This file maps *shipped, executable* invariants to tests/code. It does **not** cover every invariant in `docs/theory/**`. Roadmap Gate 4 remains: coverage gap must stay explicit.

## A.6-A.11 eval invariants

No `A.6-A.11` / `A.6..A.11` eval-invariant source was found in `docs/`, `tests/`, or git grep. **No coverage claim** until a concrete source/path is identified.

## Verify engine invariants (`src/engine/verify.mjs`, `INVARIANT`)

| ID | Test/code coverage | Notes |
|---|---|---|
| `UCA-INV-003` | `src/engine/verify.mjs` (`verifyLegalMoves`), `tests/engine.verify.mjs`, `tests/engine.core.mjs` | Legal move set not reduced by heuristics. |
| `UCA-INV-005` | `src/engine/verify.mjs` / search ownership by design; `tests/engine.search.mjs` smoke | Heuristics order only; search decides. |
| `UCA-INV-013` | `tests/engine.verify.mjs` (`verifyDeterminism`), `tests/engine.determinism.mjs` | Deterministic mode reproducibility. |
| `UCA-INV-019` | `tests/engine.verify.mjs` (`verifyMakeUnmake`), `tests/engine.audit311.mjs` hash/make-unmake checks | Full canonical-state identity after make/unmake. |
| `SVF-INV-007` | `tests/engine.verify.mjs` (`verifySVFOwnership`) | Structural feature owned by one SVF component. |
| `SM-INV-003` | `src/engine/verify.mjs` (`verifyRelationsTyped`, included in `verifyPositionAll`), `tests/engine.verify.mjs` | Relations stay typed; keys decode to known REL types, 0x88-valid squares, and counts match keys. |
| `SPG-INV-005` | `src/engine/verify.mjs` (`verifyPlansLegal`, included in `verifyPositionAll`), `tests/engine.plans.mjs` | Plans contain only legal moves. |
| `FD-INV-001..008` | `src/engine/verify.mjs` includes `verifyFieldInvariants`; `tests/engine.field.mjs`, `tests/engine.verify.mjs` via `verifyPositionAll` | See Field Dynamics section. |

## Field Dynamics invariants (`src/engine/field.mjs`, `FD_INVARIANTS`)

`verifyFieldInvariants()` is integrated into `verifyPositionAll()` (`src/engine/verify.mjs`).

| ID | Coverage | Notes |
|---|---|---|
| `FD-INV-001` | `tests/engine.field.mjs` | Coordinate isomorphism 0x88/coords/index. |
| `FD-INV-002` | `tests/engine.field.mjs` | G4 topology/Euler/beta1. |
| `FD-INV-003` | `tests/engine.field.mjs` | Channel independence. |
| `FD-INV-004` | `tests/engine.field.mjs` | Curl(Grad phi)=0 / anti-symmetry. |
| `FD-INV-005` | `tests/engine.field.mjs` | Discrete Stokes theorem. |
| `FD-INV-006` | `tests/engine.field.mjs` | Discrete Gauss/divergence theorem. |
| `FD-INV-007` | `tests/engine.field.mjs`, `src/engine/field.mjs` (`verifyFieldInvariants`) | Boundary of boundary = 0 on every oriented face. |
| `FD-INV-008` | `tests/engine.field.mjs` | Pinned pieces retain geometric attack influence. |
| `FD-INV-009` | `tests/engine.field.mjs` | Determinism of field computations. |
| `FD-INV-010` | `tests/engine.field.mjs` | Non-mutation of position state. |

**Analytical-only guard:** `tests/engine.field.mjs` also checks search `move/score` unchanged after `fieldDynamics()` / `analyze().fields` (no FD-09/FD-10 integration).

## Search / TT / qsearch audit gaps (ADR 0022, 0020)

| Area | Coverage | Notes |
|---|---|---|
| TT age/generation, no cross-root reuse | `tests/engine.audit2.mjs`, `tests/engine.audit311.mjs` | `TT_MAX_AGE=0` default, `ttMoveFor` age-checked, `search()` bumps generation. |
| Qsearch automatic draws terminal | `tests/engine.audit2.mjs` | 75-move/dead material/fivefold at ply>0. |
| Quiet checks boundary | `tests/engine.audit2.mjs`, `tests/engine.audit311.mjs` | qdepth==0, not in check, maxChecks/castling/prefilter cases. |
| Qsearch edge cases | `tests/engine.audit2.mjs` | in-check mate `-MATE+ply`, qdepth==0 stalemate -> 0, near-mate delta prune safety. |

## Explicit gaps

- Full theory-corpus invariant mapping (194 binding IDs referenced by ROADMAP) is **not complete**.
- A.6-A.11 eval invariants: **source not found**.
- External EPD/strength validation (Gate 5) and throughput gate (Gate 6) remain open.
- FD-09/FD-10 remain research/default-off; no eval/search integration claim.