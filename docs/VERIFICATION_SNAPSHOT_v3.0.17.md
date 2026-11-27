# SUBIT-CHESS v3.0.17 — Verification Snapshot (Not Certified)

**Status:** development candidate verification snapshot. **Not a release certification.**  
**Snapshot date:** 2026-11-27  
**HEAD commit:** `882a0cb65af7f2e53b2d7b4d9d4276eeadda9b33` (`v3.0.16 dev: Eval.PassedKing 96g confirmatory A/B note`, 2026-11-27T14:37:01-05:00)  
**Branch:** `main` (synced with `origin/main` at snapshot time)

## Identity

| Item | Value |
|---|---|
| `package.json` version | `3.0.17` |
| README candidate | `v3.0.17 development candidate` |
| Candidate HTML | `src/subit_chess_v3.0.17.html` |
| Candidate HTML SHA-256 | `49BF9DFA8A77E0ACFA358B1152A8D60B870A0B2810660FDAA24CBC7F8EC3D299` |
| Last release snapshot | `ver/SUBIT_CHESS_v3.0.16/subit_chess_v3.0.16.html` |
| v3.0.16.0 snapshot SHA-256 | `BAD962E44EA413FCBE0473644318451C50DE0EB3F01DBCFFF1079F83BDE53FCC` |

## Executed checks (this snapshot)

| Check | Result | Notes |
|---|---:|---|
| `node tests/core.perft.mjs` | PASS | Core perft suite reported `CORE OK`. |
| `node tests/engine.conformance.mjs` | PASS | `832100 passed, 0 failed (5934 positions, 759552 isAttacked, 23346 SEE)`. |
| `node tests/engine.movegen_oracle.mjs` | PASS | Independent pseudo-legal generation oracle (not using `Position.generateMoves`); `21200 position checks + 185934 perft nodes cross-checked` (edge-case FENs + 3 deterministic seeds x 60 playouts + small-depth perft cross-checks). Wired into `test:engine`/`test`. Progress on R-02/R-15; not exhaustive proof. |
| `node tests/engine.field.mjs` | PASS | `All Field Dynamics checks passed.` |
| `node tests/engine.smp.mjs` | PASS | `smp: 18 passed, 0 failed`. |
| `node tests/engine.audit311.mjs` | PASS | `AUDIT311: ALL CHECKS PASSED (20 checks)`. |
| `npm run test:engine` | PASS | Verified on current HEAD during v3.0.16.x dev cycle. |
| `node src/engine/index.mjs bench` | PASS/recorded | Current HEAD baseline: `d6=9565/8/b1c3, d7=19319/28/d2d4, d8=81246/17/d2d4, total 110130`. |
| `node bench/gauntlet_strength.mjs` | **11/12 PASS, 1 FAIL** | Known pre-existing fail on HEAD: `horizon c3c2 blunder (SF19 g8, d4 guard): got=a8c8 expect=!c3c2 score=192.75 d=4`. Not caused by recent default-off UCI exposure commits; verify before any strength claim. |

## Open audit gates / risks (not closed)

- **Release integrity:** no reproducible build manifest/proof beyond recorded hashes; no CI status checks attached by this snapshot.
- **Independent move oracle:** `tests/engine.movegen_oracle.mjs` adds an independent pseudo-legal completeness oracle (8x8/from-scratch, independent king-safety), now wired into `test:engine`/`test`, and passed on 21200 position checks + 185934 perft nodes cross-checked. This reduces R-02/R-15 risk but is **not exhaustive proof**; broader seeded/FEN-corpus and deeper/exhaustive cross-checks still needed.
- **Search correctness under selective pruning:** futility/NMP/LMR/qsearch need targeted tactical regression coverage on current HEAD before behavior changes.
- **SMP concurrency:** basic SMP tests pass; long-run shared TT stress/cancellation/race audit remains open.
- **Field Dynamics:** mathematical/invariant tests pass; **no proven chess-strength contribution by default**. Default-off FD eval weights remain 0 unless CI-cleared evidence supports change.
- **SUBIT decision impact:** unproven. Structural ordering remains removed per ADR 0023; no reintroduction without new ADR + fresh pre-registered A/B.
- **Elo claims:** no accepted external anchor. A/B results are evidence only; CI spanning 0 = inconclusive/no claim. Do not aggregate historical Elo deltas.

## Recent evidence-first A/B outcomes (default unchanged)

- `see.qsearchPruneMinDepth=1` 96g confirmatory: 25W/46D/25L, Elo 0.00, CI [-50.78,+50.78] — inconclusive/neutral.
- `eval.kingAttack=2` 48g smoke: 7W/30D/11L, Elo -29.02, CI [-91.26,+31.39] — inconclusive/negative lean.
- `eval.kingZone=2` 48g smoke: 12W/24D/12L, Elo 0.00, CI [-71.22,+71.22] — inconclusive/neutral.
- `eval.passedKing=6` 48g smoke: 15W/23D/10L, Elo +36.32, CI [-34.86,+110.73] — inconclusive/positive lean.
- `eval.passedKing=6` 96g confirmatory: 27W/50D/19L, Elo +29.02, CI [-19.08,+78.26] — inconclusive/positive lean. **Default remains `eval.passedKing=0`.**

## Constraints

- No Elo gain claim without accepted external anchor.
- No default behavior change without CI-cleared confirmatory evidence.
- Do not cite `docs/theory/81-99+` as strength proof.
- Preserve ADR 0022 (`TT_MAX_AGE=0`), ADR 0019 (no scalar `U(P)` blend), ADR 0023 (no structural/context ordering reintroduction without new ADR + fresh A/B).
- User-owned dirty/untracked files must not be touched/reverted/committed: `docs/theory/*` deletions, `docs/theory/old/`, `docs/theory/scl/`, `ver/SUBIT_CHESS_v3.0.17/`.
