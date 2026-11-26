# group0 digest (SUBIT-CHESS theory docs)

## 01_SUBIT_POSITION_VALUE_THEORY_v1.1 (2031 lines, fully read)
(1) Purpose: SPVT = structural position-value theory; position = elements+relations+available transformations, evaluated as typed graph, 64 contexts, multi-criteria vector. Explicitly a conceptual spec; claims of strength "not proven" (§20.3).
(2) Definitions/invariants:
- §3.1 P=(B,s,C,E,h,n), P*=(P,H) history; §3.3 legality/mate/stalemate have priority over any structural eval.
- §4.3 relation types R={ATTACK,DEFEND,SUPPORT,BLOCK,PIN,DISCOVER,RESTRICT,CONTROL,CONNECT,THREATEN,PROTECT}; ATTACK != LEGAL_CAPTURE (pinned piece); CONTROL kept as 4 separate things (geometric/legal/safe-occupy/occupied). §4.5 5 layers Ga,Gd,Gm,Gs,Gt.
- §5.2 ΔG=(ΔV,ΔE+,ΔE-,ΔA); §5.3 move profile ST(P,m)=(ΔA,ΔD,ΔM,ΔC,ΔK,ΔT) must NOT be collapsed to a number.
- §6 contexts C=I×Z×Φ, |C|=64: I={QUIET,DEFENCE,ATTACK,PRESSURE}, Z={GLOBAL,QUEENSIDE,KING,CENTER}, Φ={OPENING,MIDDLEGAME,ENDGAME,TRANSITION}; w(c,P)∈[0,1], sum NOT required =1 (not a probability); tactics τ(P) independent of phase (§6.7). Phase must not be just piece count (§6.4).
- §7.1 M(P)=Σv(fW)−Σv(fB); §7.2 σ(f,P)=(A,D,M,C,K,R); Mob(f,P)=|L(f,P)|; §7.3 SV(f,P)=F(σ,G,C) -- no universal formula given.
- §8.2/§14.2 κ(v,P)=DΩ(G(P),G(P)\v) (criticality, "removal as analytic test"); §14.3 κ(S,P) for subsets; §8.5 Worst_k(P)=sup{DΩ(P,Q)|Q∈R_k(P)}; §15.2 Syn(S,P)=V_joint−V_ind.
- §9.2 DΩ=(Dv,De,Da,Dc,Dk) vector; metric axioms §9.3 else call it "difference function".
- §10.1 E(P)=w1x1+...+wnxn criticised; §10.2 E⃗=(M,A,D,Mob,C,K,Rob,τ,Φ); §10.3 Pareto dominance P1≽P2; §10.4 priority: legality > exact result > forced tactics > material > structure > context/transformation; §10.5 lexicographic El=(T,M,S,C).
- §11.2 sign(WHITE)=+1, sign(BLACK)=-1; §11.3 V_d != V*.
- §12.2 negamax V(P,d)=max_m[−V(T(P,m),d−1)], V(P,0)=E_SUBIT(P); terminal uses exact result.
- §13.2 E_C(P)=Σ w(c,P)·E(c,P) (only valid after common scale).
- Tests: §18.1 perft(1..4)=20,400,8902,197281 from start; §18.3 invariant G(T(P,m))=Update(G(P),m) (incremental == rebuild); §18.4 all 64 contexts exist, no forced single context, tactical profile independent of phase; §18.5 symmetry: E(R(P),WHITE)=−E(P,WHITE) (colour+mirror).
- §19.2 ablation ladder A Material / B Structural / C Contextual / D Transformation search / E Full SUBIT; §19.5 stats: draws, colour, CI.
(3) Concrete strength items (formulas/constants): NONE numeric. Only qualitative:
- §12.3 order moves by tactical, material, structural-delta, critical-dependency change, context change; ordering must never prune legal moves.
- §12.4 anti double counting: structural delta may be used EITHER for ordering OR as transition bonus if not already in leaf eval; both needs separate justification.
- §12.5 combine exact tactical search + structural eval + long-term; structure never replaces tactical search.
- §8.5 worst-case structural loss over k opponent replies as a robustness/pruning-risk signal (qualitative, depth-dependent).
(4) Explanation/verification only: criticality κ (remove-vertex test), synergy Syn, Pareto-dominance/incomparability explanation (§10.3), context profile w(c,P) display, ST profile per move, symmetry/perft/incremental-graph tests, ablation configs A-E, self-play bias warnings (§17.2, §19.4).
(5) Contradictions/notes: states 64 contexts = I×Z×Φ with Z={GLOBAL,QUEENSIDE,KING,CENTER} (QUEENSIDE but no KINGSIDE; asymmetric) -- check vs engine context.mjs. §10.5 lexicographic eval vs §10.1 vector vs §13.2 weighted sum: three incompatible scalarisations left open. "Autonomy" §17 forbids external engines/books. No numeric constants anywhere -> cannot change play without other docs.

## 08_SUBIT_CHESS_PARAMETER_OPTIMIZATION_v1.0 (977 lines, fully read)
(1) Purpose: spec of how the engine tunes its own parameter vector θ (local search, evolution, gradient, adaptive budget) with multi-objective acceptance and anti-overfit/rollback. Conceptual; no concrete values.
(2) Definitions/invariants:
- §2 θ*=argmax J(θ) s.t. θ∈Θ_valid, Rules(θ)=TRUE, Regression(θ)=PASS, Stability(θ)≥τ_s. Eval params must not influence legal-move generation.
- §3.1 θ=(θ_M,θ_A,θ_R,θ_T,θ_C,θ_D,θ_S): θ_M=(v_P,v_N,v_B,v_R,v_Q) (may be phase-dependent v_P(Φ)); θ_A=(a_m,a_c,a_k,a_d); θ_R=(r_s,r_p,r_l,r_f,r_c); θ_T=(t_k,t_p,t_f,t_m,t_o); θ_C=W(I,Z,Φ); θ_D=(d_Δ,d_u,d_h,d_q); θ_S=(s_d,s_q,s_l,s_r,s_b) (depth alloc, quiescence, move ordering, selective search, budget).
- §4.1 E(P,s;θ)=Σ wᵢ(P;θ)·fᵢ(P,s); §4.2 wᵢ=gᵢ(C(P),Ω(P);θ); §4.3 E(P,s)=sign(s)·E_abs(P); negamax V(P,d)=max_m[−V(T(P,m),d−1)]; perspective mismatch = critical bug.
- §5 normalisation: bounded f_norm∈[0,1], symmetric f_norm∈[−1,1]; §6.1 θᵢ_min≤θᵢ≤θᵢ_max; §6.3 E(P,WHITE)=−E(ColorReverse(P),BLACK); §6.4 no NaN/inf.
- §7.1 J=(J_game,J_tactical,J_structural,J_efficiency,J_stability); §7.2 J_game=(W+0.5D)/N; §7.3 J_tactical=N_pass/N_tests; §7.5 J_stability=1/(1+Var(Score)).
- §8.2 hierarchy L1 rules/legality/no critical regression (not compensable) > L2 results/tactics > L3 efficiency > L4 structural quality; §8.3 Pareto frontier.
- §16 Accept(θ)∈{ACCEPT,REJECT,INCONCLUSIVE}. §17 invariants OPT-INV-001..012 (Parameter Separation eval/search; Legal Independence; Bounded; Color Symmetry; Context Preservation; Objective Separation; Validation Separation; Reproducibility; No Uncontrolled Update; Rollback; No External Teacher; Multiobjective Integrity). §18 plan OPT-01..OPT-13. §19 hypotheses H-OPT-001..006.
(3) Concrete strength items:
- §12 adaptive time/node budget: Budget(P)=B0+λ·U(P)+μ·T(P), clamped B_min≤Budget(P)≤B_max; λ,μ unspecified (U=uncertainty, T=tactical complexity); must be compared at equal total budget.
- §4.2 context-dependent eval weights wᵢ=gᵢ(C(P),Ω(P);θ), examples only (mobility in closed positions, king safety under attack, king activity in endgame, pawn structure in long-term) "to be tested, not assumed".
- §3.2 phase-dependent material values v_X(Φ). No numeric constants given for any of them.
- §9 local search: θ'=θ+Δθ one parameter at a time; §10 evolution Mutate(θ,ε), Combine(θa,θb), keep diversity; §13 interaction test via 4-cell design (base / change i / change j / both).
(4) Explanation/verification only: acceptance protocol, Pareto frontier, overfit sign (J_train↑ while J_validation↓, §14.3), rollback/versioning, parameter registry, symmetry/NaN checks, OPT-INV list as test IDs.
(5) Contradictions/notes: θ_S "parameters of search" are tuned by the same optimiser but OPT-INV-001 demands separation. §7.1 J vector vs §8.1 warns against weighted-sum J, yet §7.2-7.5 define scalar components. Z set again has QUEENSIDE with no KINGSIDE (consistent with doc 01). No engine fact conflicts verifiable from the doc alone.

## 09_SUBIT_CHESS_STRUCTURAL_VALUE_FUNCTION_v1.0 (923 lines, fully read)
(1) Purpose: defines SVF = Scalarize(Ω(P),C(P),D(P),s;θ), a 7-dimension structural eval (M,A,R,K,T,Q,X) kept vector-valued internally and scalarised for search. Conceptual; formulas are templates with unspecified g().
(2) Definitions/invariants:
- §1 SVF(P,s;θ)=Scalarize(Ω(P),C(P),D(P),s;θ); §2.1 P=(B,s,C,E,H,N,𝓗); §2.2 Ω(P)=(F,R,A,M,K,T,Q,X); Ω != SVF (§2.3).
- §3.2 ΔV=(ΔM,ΔA,ΔR,ΔK,ΔT,ΔQ,ΔX); §3.3 SVF(P,WHITE)=E(P), SVF(P,BLACK)=−E(P).
- §4 dimensions: M=Σv(f); A(f,P)=g(mobility,activity,coordination,access); R=Σ_r w_r φ_r; K=g(check_status,attack_exposure,escape_squares,defenders,king_zone); T=g(tactical_patterns,forcing_moves,vulnerabilities); Q=g(center,zones,files,diagonals,outposts,restrictions); X=g(reachable_structures,transformation_cost,future_options).
- §6 E0=w_M·M+w_A·A+w_R·R+w_K·K+w_T·T+w_Q·Q+w_X·X; extended E=E0+E_interaction+E_context; E_interaction=ΣiΣj βij·fi·fj (keep few, overfit risk).
- §5.3 E_c=Σ wi(c,P)fi(P); E_context=Σ_c α_c(P)E_c(P), need normalisation to avoid multi-counting of overlapping contexts.
- §7 nonlinear E_nl=Σ wi·hi(fi); saturating h(x)=x/(1+|x|); forms: linear/saturating/threshold/piecewise/monotone.
- §8 SVF(P,0;θ)=E(P;θ); negamax V(P,d)=max_m[−V(T(P,m),d−1)].
- §10 ΔΩ=(ΔF,ΔR,ΔA,ΔM,ΔK,ΔT,ΔQ,ΔX); ΔΩ != ΔValue; MoveValue(P,m)=SVF(T(P,m))−SVF(P) (diagnostic, not a minimax replacement).
- §11 counterfactual ΔF(x,P)=F(P)−F(P\x); §12 Confidence(P)=(c_M,c_A,c_R,c_K,c_T,c_Q,c_X).
- §13 terminal priority: mate > stalemate > other rule terminals > legal moves > heuristic; Terminal(P)→TerminalValue, else SVF(P); history rules (repetition, 50-move) count.
- §14.2 optimiser must not change legal moves, rules, SRA semantics, terminal conditions.
- IDs: SVF-INV-001..012 (Perspective Consistency, Color Symmetry, Rule Priority, Structural Separation, Typed Relations, Contextual Integrity, No Double Counting, Transformation Awareness, Uncertainty Separation, Bounded Output, Reproducibility, History Awareness); SVF-01..SVF-15 implementation plan (Feature Extraction..Independent Validation); H-SVF-001..006.
(3) Concrete strength items:
- §7 saturating transform h(x)=x/(1+|x|) to cap a feature's contribution (only concrete formula; no scale/constants).
- §6 pairwise interaction term βij fi fj, e.g. material advantage x king safety (examples only; no β values).
- §4.4 king safety inputs list (check, attack exposure on king zone, escape squares, defenders, open lines, mating-net potential); §4.2 mobility must not be raw move count; §4.5 tactical term must discount what search already sees (horizon-aware, confirmation degree).
- §9.2 double-counting audit via Corr(fi,fj) + ablation (process, not constants).
- §12.1 uncertainty-driven search budget (to be tested).
(4) Explanation/verification only: Confidence vector, MoveValue diagnostics, counterfactual P\x, ΔΩ decomposition, SVF-INV tests, SVF-12 double-counting audit, SVF-11 symmetry tests.
(5) Contradictions/notes: P tuple uses H for half-move clock and 𝓗 for history; doc 01 uses h and H (naming clash). Dimensions here (M,A,R,K,T,Q,X) differ from doc 01 vector (M,A,D,Mob,C,K,Rob,τ,Φ) and from ST (ΔA,ΔD,ΔM,ΔC,ΔK,ΔT): three different decompositions of eval; mapping to evaluate.mjs terms must be decided by implementer. §4.1 "M" = Σ v(f) here vs signed difference in doc 01. Z has QUEENSIDE only again. No numeric constants.
