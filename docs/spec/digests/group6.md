# Digest group6 (SUBIT-CHESS theory/papers)

## DOC 1: papers/paper_subit_chess_ds_v1.8.7.md (205 lines)
(1) Purpose: Popular/academic overview paper (UA) contrasting scalar eval (alpha-beta, NNUE, MCTS) with SUBIT "structural" paradigm (category theory, rho-states, Belnap). Explicitly an "infrastructure release"; strength NOT above classical engines (sec.7). Ends with an appended AI review + glossary (non-normative).
(2) Key defs:
 - S0 = I x Z x Phi = 64 (sec 5.1) [see contradiction below: v1.9.1 says 48].
 - rho-states STABLE/METASTABLE/CYCLIC/CHAOTIC (sec 5.2) with strategies: STABLE "minimize risk, accumulate small advantages"; METASTABLE "search forcing lines to break"; CHAOTIC "max deepening (extBudget -> max), disable LMR"; CYCLIC = repetition/3-fold.
 - Belnap A4={T,F,B,N}; B = contradiction (strong attack + weak queen) -> "search must verify both branches with priority" (sec 6).
 - Jaccard gate: J(run1,run2) >= 0.6 and |A|,|B| >= 30 for "step D" (sec 5.3).
 - Teacher V (v3) collects delta-eval per cell; Snapshot API. Review mentions perft(4)=197281, Zobrist, PST+material+bishop pair.
(3) Implementable search/eval items (qualitative only, no numbers):
 - Per-cell resource budget: per-cell extBudget and lmrThreshold; deep in I x Z epicentre, shallow at periphery (sec 5.1, glossary).
 - CHAOTIC => extBudget max, LMR off (sec 5.2, glossary "Хаотична динаміка": "вимикаються евристики відсікання (LMR) і запускається повний перебір").
 - Belnap B component => search verifies both branches with priority (sec 6) - move-ordering/extension hook, no formula.
 - Grammar G(S) weights with regularisation eta (sec 5.2; no formula).
 No exact constants given.
(4) Explanation/verification only: rho-state classification as XAI labels; Belnap per-component vector (T/F/B/N) display; Jaccard cross-run stability gate; Teacher telemetry/snapshot.
(5) Contradictions: S0=64 (here) vs S0chess=48 = 4x3x4 (v1.9.1 sec 8, explicitly says S0 SUBIT-64 != S0 chess). Here Z = centre/flank/king zone, Phi = opening/middle/endgame (3 phases) vs v1.9.1 Phi 4 values incl. TACTICAL. "CHAOTIC -> disable LMR / full search" is aggressive; v1.9.1 only says "weaker reductions, wider qsearch" for TACTICAL+CHAOTIC. Doc says "Lyapunov exponent >0" as definition of CHAOTIC, but v1.9.1 defines Omega from iterative-deepening root-score traces (not true Lyapunov). Glossary garbled "Epicypher". Doc calls Belnap "quantum-like" - rhetorical.

## DOC 2: papers/paper_subit_chess_ds_v1.9.1_per.md (1140 lines)
(1) Purpose: Rigorous reframing of SUBIT as "morphology-conditioned control of computation": P -> S0(P) -> Omega(P,Search,V,H) -> rho_s -> Search(P,rho_s,V). Declared a falsifiable architecture hypothesis, not a proven paradigm; stresses experimental protocol (ablation, baselines).
(2) Key defs/invariants:
 - SUBIT=(M,D,Pi); M:P->S0; D:S0xH->Omega; Pi:S0xOmega->rho_s (sec 7).
 - S0chess = I x Z x Phi = 4x3x4 = 48 (sec 8): I={ATTACK,PRESSURE,DEFENCE,QUIET}; Z={KING,CENTER,GLOBAL}; Phi={OPENING,MIDDLEGAME,TACTICAL,ENDGAME}. Phase must use non-pawn material, NOT |material balance|<tau (sec 9.3).
 - Omega={STABLE,METASTABLE,CYCLIC,CHAOTIC} from ID root scores e1..ed, delta_i=e_{i+1}-e_i; features: mean drift, variance, amplitude, best-move changes, top-k overlap, PV overlap, root margin, tactical branching, repetition risk (sec 10.1). Omega=Omega(P,Search,V,H), backend-dependent (10.2).
 - Omega<->rho cycle breaks: (a) temporal separation Omega_t=D(S0(P_t),H_{t-1}), rho_t=Pi(S0(P_t),Omega_t); (b) base policy Pi0 (cleanest for ablation); (c) joint fixpoint (10.3). Recommends (a) or (b).
 - Belnap B4 != Omega (sec 11) orthogonal layers.
 - Hypotheses H1a efficiency (same quality fewer nodes), H1b strength (same budget), H1c robustness (sec 15). Null: S0 adds nothing after controlling raw features.
 - Gate (sec 23): |A|>=30,|B|>=30,J>=0.60, droppedRaw=0, 40<=visitedCells<=58, top5Share<=0.60, 3.5<=H<=4.5 (entropy bits; note log2(48)=5.58, ok).
 - Ablation matrix A-I (sec 18): fixed, S0-only, Omega-only, S0+Omega, full, random policy, shuffled labels, raw-feature controller, oracle. Metrics sec 20; compute accounting total=search+controller (27.7).
(3) Implementable items (search/time):
 - rho_s vector (sec 12): (d, q, r_LMR, r_null, b_futility, e_check, e_recapture, e_passed-pawn, c_draw, pi_ordering) - names only, NO numeric values.
 - Manual policy examples (13.1): TACTICAL+CHAOTIC -> more forcing extensions, weaker reductions, wider qsearch; QUIET+STABLE -> aggressive reductions, fewer extensions, early stop allowed.
 - Teacher reward (13.2): r_t = clip(sign(mover)*(V_teacher(P_{t+1})-V_teacher(P_t)), -R_max, R_max); mu_c = E[r|S0=c]; cell policy chosen from mu_c. (R_max unspecified.)
 - Transition graph G=(S0,E), edge stats m = (N, mean dV, Var dV, d Omega, d rho, outcome, provenance) (sec 14).
 - Aspiration width, null-move permission, qsearch depth, root candidate allocation listed as controllable (sec 4.3). MCTS knobs sec 25.
 Only constants: gate thresholds above.
(4) Explanation/verification only: gate checks, ablation harness, Jaccard stability, node allocation by S0 and Omega reports, transition topology, compute accounting, train/val/test split & teacher leakage controls (sec 19), raw-feature baseline (17).
(5) Contradictions/notes: 48 vs 64 cells (v1.8.7); Phi has TACTICAL here vs v1.8.7. Paper warns Omega is search-dependent -> engine's percept/meta.mjs should compute it from ID traces (not static). Gate "40<=visitedCells<=58" exceeds 48 cells - upper bound 58 > 48 impossible if S0=48 (maybe leftover from 64-cell era or includes extra dims) - flag. Zero concrete numbers for search params: engine tuning must be empirical.
