# Changelog — SUBIT-CHESS v3.0.13

## [3.0.13] — 2026-11-22

Formalized release snapshot. Development candidate operationalized Field Dynamics (`FD-01` through `FD-14`) and mathematical invariants. No Elo gain established; no external strength claim.

- **Field Dynamics Module (`src/engine/field.mjs`).**
  - Canonical Board Coordinates (`SC-CORE-COORD-001`, `FD-01/02`): strict isomorphism between 0x88 square index, canonical coords $(x, y) \in [0, 7]^2$, and linear index $idx \in [0, 63]$ with $y = 7 - (sq \gg 4)$.
  - G4 Orthogonal Complex Topology: $|V|=64$, $|E|=112$, $|F_{int}|=49$, $\chi = V - E + F_{all} = 2$, $\beta_1 = 49$.
  - Discrete Gradient (`FD-05`): $	ext{Grad } \phi(u \to v) = \phi(v) - \phi(u)$ with exact anti-symmetry and zero circulation along closed walks.
  - Discrete Divergence (`FD-06`): $	ext{Div } J(v) = \sum_{e \in out} J(e) - \sum_{e \in in} J(e)$ satisfying discrete Gauss theorem.
  - Discrete Curl/Circulation (`FD-07`): CCW face curl on 49 faces satisfying discrete Stokes theorem; $	ext{Curl}(	ext{Grad } \phi) \equiv 0$.
  - Influence Tracing & Pinned-Piece Reach (`FD-03`): geometric influence separated from legal move generation.
  - Channel Independence: White/Black attack, defense, flux channels strictly separated.
- **Engine Integration (`FD-13`).** `Engine.fieldDynamics()` and `analyze().fields`; observational only, no move-generation/search decision change (FD-10, ADR 0023).
- **Invariant Verification & Testing.** FD-INV-001..010, `tests/engine.field.mjs`, `verifyFieldInvariants()` in `verifyPositionAll()`. Full `npm test` passed after verifier follow-up on 2026-11-22.
- **Verifier completion.** All ten declared checks executed, including boundary-of-boundary closure, pinned-piece geometric influence, repeat-build determinism, and complete position-state preservation.
- **TT age diagnostic param (ADR 0022).** `search.ttMaxAge` default `0`, UCI `TT.MaxAge`; A/B 64g d4 seed23 `ttMaxAge=1` vs `0` => `dS -0.203 SE 0.067` **reject**.
- **Gauntlet guard.** g9 horizon refutation (`b4c5` after `d5c6`, depth 6, `score<50`), `scoreBelow/scoreAbove` support. Gauntlet 10/10 pass.
- **Eval hook A/B (no default change).** `kingOpenFile 12 vs 0` `dS +0.063 SE 0.079` inconclusive; `kingAttack 8 vs 0` `dS +0.109 SE 0.083` inconclusive. Defaults unchanged.
- **External anchor.** No new Stockfish match run; Field Dynamics is observational. Historical SF19 tables are v3.0.11/v3.0.12 only. No Elo claim.
