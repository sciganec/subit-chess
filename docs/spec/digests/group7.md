# Digest group7 (SUBIT-CHESS theory docs)

## DOC 1: paper_subit_chess_v.1.9.1_concept_plus_atlas.md (474 lines, UK)
(1) Purpose: Concept paper: context-dependent search control via 48-state morphology S0=I x Z x Phi, dynamic layer Omega, policy vector rho_s. Explicitly an empirical hypothesis needing independent validation (self-play only, no Elo proof).
(2) Definitions:
- S0 = I x Z x Phi, |S0|=4*3*4=48 (sec 3). I={ATTACK,PRESSURE,DEFENCE,QUIET}; Z={KING,CENTER,GLOBAL}; Phi={OPENING,MIDDLEGAME,TACTICAL,ENDGAME}.
- Atlas ID = 12i + 4z + phi (A.2), zero-based indices; S00..S47 (e.g. S40 = QUIET|CENTER|OPENING).
- Omega in {STABLE,METASTABLE,CYCLIC,CHAOTIC} (sec 4); E=(e1..e4) evals at depth i; V(E)=sum(e_i-mean)^2/(n-1). Paper itself says variance alone insufficient; also need best-move stability, PV change, depth sensitivity, tactical instability.
- rho_s=(d_base, lmr_mult, null_enabled, futility_mult) (sec 5).
- C(P)->S0, or C(P)->Delta(S0) (distribution) (A.3).
- TACTICAL is a functional mode not a chronological phase (sec 3, A.1, A.4); proposal to split it out into Omega.
(3) Implementable items (search-affecting):
- rho_s knobs: d_base = extra depth budget; lmr_mult = LMR aggressiveness; null_enabled = null-move on/off; futility_mult = futility threshold scale (sec 5). NO numeric values given; "atlas does not define optimal values, must be set experimentally" (A.3).
- Qualitative: QUIET|CENTER|ENDGAME -> extra depth + restrict null-move/mobility-assumption heuristics (zugzwang/opposition/tempo) (sec 5). DEFENCE|CENTER|TACTICAL -> more careful pruning of critical defensive moves. QUIET|CENTER|OPENING -> extra depth for manoeuvring alternatives.
- rho8 policy: 8 cells, 32 params (=8x4), ~60% of trajectories (sec 7); cells named: QUIET|CENTER|OPENING, PRESSURE|CENTER|OPENING, DEFENCE|CENTER|TACTICAL, QUIET|CENTER|ENDGAME (4 of 8 named; no values).
- Telemetry: 100 self-play games, search depth 2, teacher depth 4, 7116 transitions; 55 of 64 cells (old 64-cell model) visited; entropy 4.476 bits; eff. cells 22.26; top-5 cells 50.39% (sec 6). QUIET|CENTER|OPENING: n=1370, mean -85.55 cp, var 29489, SE 4.639, t=-18.44.
(4) Explanation/verification only: validation protocol (sec 9): reproducibility of classification, info value of Omega (S0-only vs Omega-only vs both), ablation of rho_s components, match tests with Elo CI, held-out positions; random-switching control; cluster bootstrap by game; multiple-testing correction (sec 6, 7). Ensemble (Stockfish/Berserk/Ethereal/Lc0/ShashChess experts, 3 layers: classify/select/aggregate; compare to best single expert at equal budget) (sec 8) - hypothesis only.
(5) Contradictions/notes: (a) Paper says "64-cell model" visited 55 cells yet atlas is 48 states (older 64 vs 48 inconsistency, sec 6 vs sec 3). (b) QUIET|CENTER|OPENING labelled STABLE but variance 29489 violates stated criterion V<200 (sec 6) - paper flags it. (c) Mean -85.55cp for QUIET opening is likely side/sample bias, paper warns against causal reading. (d) Paper refers to Stockfish-based search (Stockfish baseline) whereas engine is own JS (src/engine/*.mjs) - rho_s knobs map to search.mjs/budget.mjs, needs check. (e) Section on "Omega in ." and "I = ..." have set literals stripped (formatting loss only).
