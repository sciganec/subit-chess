
## 51_SUBIT_CHESS_HOMOLOGY_ext.md (913 lines, fully read)
(1) Purpose: Conceptual (Ukrainian) model applying chain complexes/homology to the legal-move graph of chess states (cycles, independent cycles, "holes"). Explicitly an extra descriptive layer, "не претендує на заміну традиційного шахового пошуку" (Abstract).
(2) Definitions/invariants/IDs:
- Full state S=(B,p,c,e,h) (s2.1); Board Identity != State Identity (s2.1, s12). Directed graph G=(S,E), S_j=T_m(S_i) (s2.2).
- Chain complex C0,C1,C2; d1(e)=S_j-S_i; d2(f)=e1+e2-e3-e4 (s4); condition d1∘d2=0 (s5); Z1=Ker d1, B1=Im d2, H1=Z1/B1 (s6-7).
- Cycle rank: beta1=|E|-|V|+beta0 (connected: |E|-|V|+1) (s8.1). "Cycle Basis не є Strategic Basis" (s8.2).
- Undirected structural vs directed strategic homology (s11); Board Homology vs Full State Homology (s12).
- Persistence: Persistence(C)=Death(C)-Birth(C), filtration K0⊆...⊆Kn (s13).
- Profile Q_H(S)=(beta0,beta1,H1,C,P) (s14); dQ_H(S,m)=Q_H(S')-Q_H(S), "символічне" (s16).
- Tests: HOM-01 Cycle Rank, HOM-02 Cycle Independence (spanning tree), HOM-03 Cycle Relations (build d2, check d1∘d2=0), HOM-04 Homological Stability, HOM-05 Strategic Correlation, HOM-06 Search Integration (s18.1-18.6). Hypotheses H-HOM-01..05 (s19).
- Architecture order: Core→State→MoveGen→Transition→Evaluation→Differential→Topological→Homology→Search→Validation (s17).
(3) Concrete implementable items: none found. No formulas with constants. Only vague candidate uses: "додаткового впорядкування ходів" (s17, s18.6) and detecting cyclic positions; doc states homology "не повинен самостійно відсікати легальні ходи" and initially "не повинен змінювати правила відсікання" (s17, s18.6); success = "вимірюване покращення ефективності або якості пошуку без втрати коректності". The only quasi-actionable fact: repetition detection requires history h in state (s2.1).
(4) Explanation/verification only: everything (s1-s16, s20-22). Note s15.1: more cycles != stronger position; s20.1 computational cost -> only local graphs.
(5) Contradictions: state tuple S=(B,p,c,e,h) here (e=en passant) vs doc 52 S=(B,p,c,k,e,h) (k=en passant, e=50-move counter) -> doc 51 omits halfmove clock. Engine: not checked against code (no code claims in doc). Otherwise none found.

## 52_SUBIT_CHESS_Maxwells_theory.md (811 lines, fully read)
(1) Purpose: Conceptual (Ukrainian) transfer of Maxwell/vector-calculus operators (gradient, divergence, curl, integral theorems) to the chess state-transition graph; proposes a "Differential Chess Architecture" layer above core/search, to be validated by ablation.
(2) Definitions/invariants/IDs:
- State S=(B,p,c,k,e,h) with k=en passant, e=50-move counter, h=repetition history (s2); S=(B,C) context.
- Discrete gradient dV(S->S')=V(S')-V(S); m*=argmax dV (s3.1); Q(S,m)=min_r V(T_r(S')) (s3.1, 2-ply).
- Divergence analogue Phi(S)=sum_m w(S,m) (s4.1), explicitly "не дивергенція у строгому сенсі".
- Circulation Gamma(C)=sum a(S_i,S_{i+1}) (s5.1).
- D_SUBIT(S)=(G,D,R) triple (s6). Boundary dA={(S,S') in E: S in A, S' not in A} (s7.1); Gauss-like sum div F = boundary flux (s7.2), noted as exact graph identity but chess meaning of F undefined.
- Minimax V(S)=max_m min_r V(S_{m,r}) "це не backpropagation" (s8.2).
- Five principles I-V (s12). Experimental stages I-V incl. ablation (s13). No test IDs.
(3) Concrete implementable items:
- s10.1 Gradient module delta features: dMaterial, dMobility, dKingSafety, dPawnStructure, dPieceCoordination, dThreats, dSpace, dStructuralStability (no formulas, no constants).
- s10.2 Divergence: new threats, number of quality continuations, new active lines, opponent restriction, "constructive" vs raw mobility (no formulas).
- s10.3 Rotation: repetition with context, repeated checks, cyclic attacks.
- s10.4 only quantified proposal: V_SUBIT(S)=V0(S)+lambda_G*G(S)+lambda_D*D(S)+lambda_R*R(S); lambdas unspecified ("константи, адаптивні параметри або функції контексту"). Author explicitly says: "Я не рекомендував би відразу включати цю формулу в бойовий рушій" until each operator shown to add independent measurable info.
- s13 Stage IV ablation plan: base vs +Gradient vs +Divergence vs +Rotation vs all three; Stage V self-play, tactical suites. Success criterion "вимірювана користь"; remove operator if no independent gain.
- s10 search stack named: "Minimax · Alpha-Beta · Quiescence · TT · Selective Search" (no parameters).
- Net: no exact formulas/constants for evaluation, ordering, pruning, extensions, time management, endgame/opening. => none found beyond the above scaffolding.
(4) Explanation/verification only: s1, s3-s9, s11-s12, s14 (philosophy, analogy table NN vs chess s8.2, "optimal transformation of state" s11).
(5) Contradictions: S tuple differs from doc 51 (51 lacks halfmove clock; 52 has it; en passant letter e vs k swapped). Doc 52 s10.4 (not in battle engine yet) vs doc 51 s17 (homology only diagnostic) are consistent. Engine code not compared (no concrete code claims). Otherwise none found.
## 51_SUBIT_CHESS_HOMOLOGY_ext.md (913 lines, fully read)
(1) Purpose: Conceptual (Ukrainian) research proposal applying simplicial-style homology (chain complex C0/C1/C2, H1=Ker d1/Im d2) to the legal-move transition graph of full chess states. Explicitly a descriptive/diagnostic layer, "does not replace search"; version 0.1, status "theoretical exploration".
(2) Definitions/invariants/IDs:
- s2.1: full state S=(B,p,c,e,h); Board Identity != State Identity (repeated in s12).
- s2.2: directed graph G=(S,E), Sj=Tm(Si).
- s4: d1(e)=Sj-Si; d2(f)=e1+e2-e3-e4; s5: d1 o d2 = 0 (requirement; 2-cells NOT defined, "main open task").
- s6/7/8: Z1=Ker d1, B1=Im d2, H1=Z1/B1; cycle rank b1=|E|-|V|+b0 (connected: |E|-|V|+1).
- s11: undirected structural vs directed strategic homology (two separate levels). s12: Board vs Full State Homology.
- s13: filtration K0 c K1 ... Kn, Persistence(C)=Death-Birth. s14: profile Q_H(S)=(b0,b1,H1,C,P) not to be collapsed to one number. s16: DeltaQ_H(S,m)=Q_H(S')-Q_H(S) "symbolic".
- s18 tests: HOM-01 Cycle Rank, HOM-02 Cycle Independence (spanning tree), HOM-03 Cycle Relations (d1od2=0), HOM-04 Homological Stability, HOM-05 Strategic Correlation, HOM-06 Search Integration. s19 hypotheses H-HOM-01..05 (all research hypotheses).
- Slogans: "Cycle Basis is not Strategic Basis"; "DO NOT COLLAPSE - CONTEXTUALIZE".
(3) Concrete implementable items affecting move choice/search: none found with formulas or constants. Only vague: s17 lists possible uses "additional move ordering", "detection of cyclic positions" (repetition) but no formula; s17/s18.6 state it "must not cut legal moves or change pruning rules"; influence on move choice only after experimental validation. No eval terms, no numbers.
(4) Explanation/verification only: entire document (sections 1-22); b1 formula is textbook; s15 says higher cycle rank is NOT an advantage ("homological complexity is not an advantage"), s20 limits (compute cost, dependence on complex construction, loss of direction).
(5) Contradictions with other docs/engine: none found in this doc itself. Note: no engine hooks implied; HOM-0x tests are unimplemented proposals (not checked against engine code beyond that none was requested).

## 52_SUBIT_CHESS_Maxwells_theory.md (811 lines, fully read)
(1) Purpose: Ukrainian concept paper mapping vector-calculus operators (gradient/divergence/curl + integral theorems) onto the chess transition graph; proposes a structural layer G/D/R over the search core. No test IDs, explicitly "not for the combat engine yet".
(2) Definitions/invariants:
- s2: S=(B,p,c,k,e,h) (k=en passant, e=50-move counter, h=repetition history); S=(B,C) with C context. (Note: differs from doc 51's S=(B,p,c,e,h) where e=en passant.)
- s3.1: dV(S->S')=V(S')-V(S); m*=argmax dV; Q(S,m)=min_r V(T_r(S')).
- s4.1: w(S,m) structural weight of a move (inputs listed: mobility change, threat creation, line opening, piece interaction, king safety change, tactical resources, control of critical zones, count of quality continuations); Phi(S)=sum_m w(S,m) ("not strictly divergence").
- s5.1: cycle circulation Gamma(C)=sum a(S_i,S_i+1).
- s7.1: boundary dA={(S,S') in E: S in A, S' not in A}; s7.2: Gauss-type balance sum_{S in A} div F(S)=sum_{dA} F(S,S') (exact on graphs once flow defined; chess meaning of F not defined).
- s8: minimax V(S)=max_m min_r V(S_m,r); explicit "this is not backpropagation"; analogy table NN vs chess.
- s12: five principles (State not static; Move is structural transformation; Value contextual; Possibility measurable but not mobility; Trajectory matters).
- s13: five stages I-V (mapping, differential metrics, search integration, ablation testing, independent validation).
(3) Concrete implementable items:
- s10.4 only formula: V_SUBIT(S)=V0(S)+lambda_G*G(S)+lambda_D*D(S)+lambda_R*R(S); lambdas unspecified ("constants, adaptive, or context functions"); doc itself says "I would not recommend including this formula in the combat engine right away" until each operator shown to add independent measurable info.
- s10.1 Gradient module feature list (no formulas): dMaterial, dMobility, dKingSafety, dPawnStructure, dPieceCoordination, dThreats, dSpace, dStructuralStability.
- s10.2 Divergence module: new threats, count of quality continuations, new active lines, restricting opponent, loss of freedom; distinguish move count from quality of move space.
- s10.3 Rotation module: repetition, repeated checks, cyclic attacks; "preserve repetition context, not compare only piece placement" (i.e. repetition detection must include side to move/castling/ep).
- s13 stage IV ablation design: base vs +G vs +D vs +R vs all three; success = match results, move stability, fewer strategic errors; "if an operator gives no independent benefit it should not remain".
- No numeric constants, no move-ordering/pruning/extension/time/endgame specifics anywhere.
(4) Explanation/verification only: s1, s6 table, s7 integral theorems, s8 NN analogy, s9 field-of-possibilities, s11, s12 principles, s14 conclusion.
(5) Contradictions: state tuple differs from doc 51 (e = ep in 51, e = 50-move counter and k = ep here; 51 has no halfmove counter in S). s3 notes shallow dV argmax ignores opponent reply (self-acknowledged, not a contradiction). Engine: none checked/found.

## 53_SUBIT_CHESS_Differential_Operators_pre.md (809 lines, fully read)
(1) Purpose: "v0.1" formal discrete-calculus version of doc 52: graph 0-forms (potentials V), 1-forms (edge flows F), d0, incidence-matrix divergence, cycle circulation; states a Stokes-type result and a "Structural Propagation" idea. Self-declared "architecture frame, not finished theory"; third level (does it help move choice) "must pass experimental verification".
(2) Definitions/invariants:
- s1 (I.1): S=(B,p,c,e,h), e=en passant (consistent with 51, differs from 52); T_m:S->S'; graph not symmetric.
- s2: three geometries (board 64 squares, state distance d_S(Si,Sj) with geometric/structural/tactical/contextual variants, transition set T(S)).
- s3: D_mV(S)=V(S_m)-V(S); sigma(S)=+1 White / -1 Black; Delta_SUBIT(S,m)=sigma(S)[V(S_m)-V(S)]; s4 "gradient profile" {Delta_SUBIT(S,m)} with stats max/min/mean/variance/distribution (named "discrete gradient profile", not a true gradient).
- s5: d+(S)=|M(S)| (out-degree, "not divergence"); incidence matrix B_ve (start -1, end +1); div F = B F; D(S)=div F(S) depends on definition of F.
- s6: Circ_F(C)=sum_{e in C}F(e); s6.1 Theorem 1 (exact): if F(u,v)=V(v)-V(u) then circulation on any closed cycle = 0; nonzero circulation only shows the field is not a single potential (does not prove advantage).
- s6/VI: "Bz=0" for cycle vector z; discrete Stokes is stated only in graph terms (no explicit 2-cells; d1 needs a face system).
- s7: d0V(u,v)=V(v)-V(u); curl_C F=sum F(e); chain States -d0-> Transitions -d1-> Cycles.
- s8.1-8.2: V_SUBIT(S)=V_base+lam_G G+lam_D D+lam_R R (same as 52 s10.4); G/D/R bullet definitions without numbers.
- s9: Structural Propagation: dQ_i=(dG_i,dD_i,dR_i) per transition. s10: Q(S)=(G,D,R,K) (K structural stability), four non-exclusive types generative/stable/degradative/cyclic. s12 "structural phase transition" (hypothesis). s13: C(S)=(S,T,grad_d,div_d,curl_d,Omega).
(3) Concrete implementable items: none found as engine-ready. Closest: (a) s3-4 gradient profile statistics (max/min/mean/variance of sigma*[V(child)-V(S)] over legal moves) computable from static eval of children; no threshold or weight given. (b) s8 caveat: structural term must live inside search ("a move can raise mobility, open lines, but allow mate in two"). (c) s8.2 same V_SUBIT combination with unspecified lambdas. No constants, no pruning/ordering/extension/time/endgame/opening items.
(4) Explanation/verification only: Theorem 1 (a true mathematical identity usable as a unit test of an implemented edge-flow code: circulation of d0V over any cycle must be 0), B z = 0 test, s11-s14 conceptual positioning.
(5) Contradictions: state tuple e=en passant here and in 51, but e=50-move counter in 52 (S=(B,p,c,k,e,h)). Terminology: 53 calls d+(S) not divergence; 52 s4.1 Phi(S)=sum w(S,m) similarly not divergence; consistent. s5 formula B_ve typed with v=u / v=v_e (notation typo, intended start/end node). Engine: not compared (no engine reference in doc).
