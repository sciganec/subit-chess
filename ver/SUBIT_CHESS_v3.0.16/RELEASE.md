# SUBIT-CHESS v3.0.16.0 — release snapshot

Date: 2026-11-26

| File | Size | SHA-256 |
|---|---:|---|
| `subit_chess_v3.0.16.html` | 608,777 B | `BAD962E44EA413FCBE0473644318451C50DE0EB3F01DBCFFF1079F83BDE53FCC` |

Artifact corresponds to `src/subit_chess_v3.0.16.html` / `index.html` from `npm run build`.

## Status

Formalized release snapshot. **No Elo gain has been established; no external strength claim.** No accepted external anchor. `UCI_Elo` (if exposed by UCI clients) is Stockfish limited-strength mode, not human Elo.

## Included

- **Behavior-preserving perf micro-opts.** Lazy incremental move selection, incremental piece lists/phaseMaterial, hot-path micro-opts in core/eval/search. Bench baseline: `d6=20922/8/b1c3, d7=47396/28/b1c3, d8=139252/19/b1c3, total 207570`. Perft CORE OK, `npm run test:engine` PASS, gauntlet 12/12. No strength/Elo claim.
- **Default-off/default-preserving UCI/infra exposures.** NMP/LMR/RFP/LMP/SEE qsearch prune controls, aspiration/futility/qsearch/history-malus/lmr-history controls; defaults unchanged unless explicitly noted. No strength claim.
- **Strict no-cycle A/B evidence (all CI span 0, no claim).** FD hooks, staged movegen (negative, kept off), SEE/qsearch/NMP/LMR/futility/aspiration/TT/RFP/LMP/history-malus/lmr-history sweeps are recorded in `CHANGELOG.md`. Strongest observed signal: `see.qsearchPruneMinDepth=1` (48g +65.92, CI [-1.04,+138.19]; 96g +32.67, CI [-15.88,+82.54]) and combined minDepth1+margin100 (96g +21.74, CI [-25.43,+69.73]) — **inconclusive, defaults unchanged**.

## Verification

```
npm run build
npm run test:engine
node bench/gauntlet_strength.mjs
npm run bench:engine
```

## Notes

- `subit_chess_v3.0.16_pre_audit.md` — pre-release audit snapshot (present in this folder).
- Theory/spec materials under `docs/theory`, `docs/spec`, `docs/experiment` are research-only/non-binding; no canonical SUBIT-∞ conformance claim.
