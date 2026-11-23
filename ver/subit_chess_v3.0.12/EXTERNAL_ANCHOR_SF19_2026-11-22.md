# External Anchor — Stockfish 19 (2026-11-22)

## Scope
- **Purpose**: first external strength signal for SUBIT-CHESS v3.0.11. Not an Elo claim.
- **Engine A**: SUBIT-CHESS v3.0.11, `node src/engine/index.mjs uci`
- **Engine B**: Stockfish 19 Windows x86-64 universal, `UCI_LimitStrength=true`, `Threads=1`
- **Harness**: `bench/uci_match.mjs` (minimal UCI match, alternating colors, fixed movetime, maxPlies 160, 0000/terminal adjudication via `Position.status()`, errors counted separately)
- **Build**: post-fix UCI handler (`bestmove 0000` on no move; fixed `moveToUci(0)==a8a8` illegal-move bug that polluted earlier runs)

## Baseline results (pre-LMR-red1 default)

| SF UCI_Elo | Movetime | Games | W | D | L | Err | Mean | SE | Notes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1320 | 200ms | 10 | 10 | 0 | 0 | 0 | 1.00 | 0.00 | all checkmate |
| 1500 | 200ms | 10 | 8 | 2 | 0 | 0 | 0.90 | 0.06 | 2 maxplies draws |
| 1800 | 200ms | 10 | 5 | 3 | 2 | 0 | 0.65 | 0.12 | clean post-fix |
| 2000 | 200ms | 10 | 5 | 3 | 2 | 0 | 0.65 | 0.12 | includes 1 nomove loss |
| 2200 | 200ms | 10 | 1 | 6 | 3 | 0 | 0.40 | 0.09 | clear drop |
| 2400 | 200ms | 10 | 1 | 2 | 7 | 0 | 0.20 | 0.10 | weak |
| 2000 | 500ms | 10 | 4 | 2 | 4 | 0 | 0.50 | 0.14 | noisy, n=10 |
| 2200 | 500ms | 10 | 4 | 2 | 4 | 0 | 0.50 | 0.14 | better than 200ms, noisy |

## New-default results (LMR red1: `extraReduction=0, maxReduction=1`)

| SF UCI_Elo | Movetime | Games | W | D | L | Err | Mean | SE | Notes |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2000 | 200ms | 20 | 8 | 4 | 8 | 0 | 0.50 | 0.10 | `sf2000_mt200_sub200_1795374189047` |
| 2200 | 200ms | 20 | 5 | 6 | 9 | 0 | 0.40 | 0.091 | `sf2200_mt200_sub200_1795373161984` |
| 2400 | 200ms | 20 | 3 | 9 | 8 | 0 | 0.375 | 0.078 | `sf2400_mt200_sub200_1795373647299` |

## Caveats
- `UCI_Elo` is Stockfish's limited-strength mode, not a human Elo rating.
- Small sample (n=10 per cell), one opponent, one harness, no PGN adjudication suite.
- Maxplies draw guard only; no full repetition/50-move adjudication during game except terminal status at 0000.
- Results are a baseline signal for regression/iteration, not a public strength claim.

## Diagnosed loss pattern (sampled)
Two sampled losses showed tactical horizon/quiet-refutation swings at 200ms:

1. **SF2400 g7, ply 38** FEN `1k1r1r2/1pbn2pp/p1p3p1/4q3/4P3/2NB3Q/PPP2PPP/1R3RK1 w - - 14 20`
   - Depth 4: `h3h7` +280 (blunder)
   - Depth 6+: avoids `h3h7`, best `a2a3` ~+155
   - Added as gauntlet regression: `horizon Qxh7 trap (SF2400 g7)`, depth 6, reject `h3h7`.

2. **SF2200 g5, ply 78** FEN `2Q5/5p1k/4p2q/8/3P1p2/1B3PPn/1PPR2K1/r7 w - - 2 40`
   - Depth 4: `g3g4` -193 (misses deeper loss)
   - Depth 6+: `d2d1`, score worsens to forced-mate assessment by depth 10
   - Added as gauntlet regression: `horizon g3g4 knight trap (SF2200 g5)`, depth 6, reject `g3g4`.

## Update 2026-11-22 (post-anchor engine work)
- **LMR conservative default**: `search.lmr.extraReduction 1 -> 0`, `maxReduction 1` (base reduction stays 1). Evidence: sanity fixed g5/g7 at d4; self-play d4 32g +0.156 SE0.090; d5 24g +0.250 SE0.121 (accept); SF2200@200ms 10g smoke 5W/2D/3L mean 0.60 SE0.138 was noisy. Gauntlet 9/9, smoke/audit311/tactics PASS. Node cost +~35% on startpos d6 (14562->19605), accepted.
- **N=20 external anchor (new default)**: 2200@200ms 5W/6D/9L mean 0.40 SE 0.091 (same mean as N=10 baseline, different distribution); 2400@200ms 3W/9D/8L mean 0.375 SE 0.078 (baseline N=10 was 0.20 SE 0.10, noisy). 2000@200ms 20g running. No Elo claim; SF `UCI_Elo` is limited-strength mode.
- **G9 clarification**: previously labeled eval drift; trace shows horizon/tactical miss. After `1.d5c6` in `rnb1k2r/pp1pqppp/5n2/2pPN3/1b1QP3/2N5/PPP2PPP/R1B1KB1R w KQkq c6 0 8`, depth 3 picks `...b8c6`, depth 4 finds `...b4c5!` (quiet bishop retreat), flipping eval. Root components: fast +276, structural E +137.2, qsearch +276; `qsearchPrune off` unchanged. Candidate for targeted ordering/reduction/extension investigation after component trace.
- **UCI options added**: `LMR.MaxReduction`, `LMR.ExtraReduction`.

## Next measurement steps
- Complete 2000@200ms 20g on new default; add to table.
- Analyze 2200/2400 loss logs for swing patterns and confirm whether g9-like quiet refutations recur.
- Trace `...b4c5` node: move ordering index, LMR reduction, TT cutoffs; test only confirmed, minimal guards behind measurement.
