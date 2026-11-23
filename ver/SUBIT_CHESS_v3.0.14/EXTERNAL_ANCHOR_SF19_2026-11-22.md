# External Anchor — Stockfish 19 (2026-11-22)

**Coverage:** historical external baseline for v3.0.11 and v3.0.12 only. No new Stockfish match was run for v3.0.14. The tables in `docs/EXTERNAL_ANCHOR_SF19_2026-11-22.md` are not v3.0.14 results and must not be presented as a v3.0.14 strength claim.

## v3.0.14 disposition

- v3.0.14 includes correctness/measurement/search-safety changes (self-play adjudication/repetition sync fixes, root check extension, qsearch mate-delta guard). No `learn.compare` >=2 seeds d4/64g was run for 67dfd2c before formalization.
- **No accepted external anchor. No Elo gain claim.**
- Before any v3.0.14 strength claim: run `learn.compare` >=2 seeds d4/64g against pre-fix baseline and/or an accepted external anchor with the same SF19 protocol.
