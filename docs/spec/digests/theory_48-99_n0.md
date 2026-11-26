## 48_SUBIT_CHESS_Differential_Operators.md (811 lines, fully read)
1. Purpose: conceptual v0.1 research spec defining discrete gradient/divergence/curl on the chess legal-transition graph as an extra analytic layer (not replacing search/eval). Language Ukrainian; principle "DO NOT COLLAPSE - CONTEXTUALIZE".
2. Definitions/IDs: full state S=(B,p,c,e,h) (s2.1); graph G=(S,E) (s2.2); Delta_SUBIT(S,m)=sigma(S)*[V(T_m(S))-V(S)] (s3.3); gradient profile {G_max,G_min,G_mean,G_var,G_dist} (s3.4); div F = B.F, div F(S)=sum F_in - sum F_out (s4.3); Circ_F(C)=sum F(e) (s5.3), zero for potential flows F(u->v)=V(v)-V(u) (s5.4); boundary ops d1.d2=0 (s6.1); Q_diff(S)=(G,D,R,K) (s7); Critical(S,m) <=> Dist(Q_diff(S),Q_diff(T_m S))>theta (s8.1). Experiments DOP-01..DOP-05 (s10); hypotheses DOP-H1..H3 (s13).
3. Concrete implementable items: essentially none with numbers. Only: use gradient/structural profile for move ordering (s9.2) and diagnostics; s9.3 explicitly forbids selective pruning/changing search result until experimentally validated. Possible "critical transition" detection as ordering signal, but Dist and theta undefined (s8.1, s12).
4. Explanation/verification only: everything else (Stokes analogue needs a cell complex, s6.3; K "structural stability" not numerically defined, s7.4; flows F not defined, s4.5; architecture layout s11; status checklist s15 all unimplemented).
5. Contradictions with engine/other docs: none found in doc itself; it states "CONCEPTUALLY SPECIFIED - NOT YET IMPLEMENTED OR VALIDATED" (s15). Note: Delta_SUBIT needs V after the move (static eval diff), equivalent to a 1-ply eval ordering - not new vs. standard SEE/qsearch ordering.

## 49_SUBIT_CHESS_TOPOLOGY.md (1046 lines, fully read)
1. Purpose: conceptual continuation of doc 48; frames chess as graph with connectivity, structural regions/boundaries, critical moves, game-theoretic attractors, and a "similarity space"; no code-level spec.
2. Definitions/IDs: S=(B,p,c,e,h) (s2.1); N(S) neighbourhood (s2.2); Reach(S0), geometric vs strategic reachability (s3); weak/strong connectivity (s4.1); regions Omega1..5 (s5.1); Boundary Move (s6.1) with deltas dC,dM,dK,dA,dP,dR,dT (s6.2); cyclic rank beta1=|E|-|V|+beta0 (s7.3); Criticality(S), Critical Move (s8); SUBIT-Attractor(A) via W0=A recursion = backward induction/retrograde analysis (s11.2-11.3); Q(S)=(Omega,A,C,R,B) (s12); STAH hypothesis + 5 predictions (s13); d_struct metric axioms and filtration K0..K3 (s14); Dual Space Transition vs Similarity (s15); TOP-01..TOP-05 (s16) with success criteria 1-6 (s16 end).
3. Concrete implementable items: none with formulas/constants. Only qualitative: (s10.1) flag search nodes at "structural boundary"/high criticality for extra attention (i.e. a possible extension/ordering hook, undefined metric); (s10.2) safe first step = feed boundary/critical-move info into move ordering only, "pruning не змінюється"; (s11.2) attractor recursion = standard retrograde/mate-search idea (could inspire mate/forced-line solver, but nothing specified).
4. Explanation/verification only: ontology (s1,s17,s19), Maxwell analogy (s18), persistent homology link (s14.3), experiment list TOP-01..05 (s16), success criteria (s16: must show measurable benefit in self-play, otherwise stays "аналітичним інструментом, а не компонентом шахового двигуна").
5. Contradictions: none found. Note s7.3 beta1 formula is for undirected graphs only (doc says so); doc ends pointing to HOMOLOGY (doc 50) as next level.

## 50_SUBIT_CHESS_HOMOLOGY.md (1069 lines, fully read)
1. Purpose: conceptual v0.1 spec applying chain-complex homology (H1=Ker d1/Im d2), cycle rank, structural holes and persistence to the local chess transition graph; depends on doc 48.
2. Definitions/IDs: d1(e)=Sj-Si (s4.1); d1.d2=0 (s5); Z1=Ker d1, B1=Im d2, H1=Z1/B1 (s6-7); beta1=|E|-|V|+beta0 (s8.1, undirected only); Cycle Basis != Strategic Basis (s8.2); undirected structural vs directed strategic homology (s11); Board vs Full State homology, "Board Identity != State Identity" (s12); filtration K0<=...<=Kn, Persistence(C)=Death(C)-Birth(C) (s13.2); Q_H(S)=(beta0,beta1,H1,C,P) (s14); Homological Critical Move (s16); experiments HOM-01..HOM-06 (s18); hypotheses H-HOM-01..05 (s19); limitations (s20); status checklist (s23).
3. Concrete implementable items: none with formulas/constants affecting move choice. Only generic: HOM-06 (s18) lists possible uses (move ordering, node characterisation, detection of cyclic positions, diagnostics) with the explicit rule "Гомологічні характеристики не повинні самостійно відсікати ходи". HOM-02 gives algorithm (spanning tree -> fundamental cycles -> cycle rank) for local graphs; marginal relevance to repetition/draw detection only.
4. Explanation/verification only: everything (ontology, chain complex, holes, signature, hypotheses, limitations s20.1-20.5: space size, model dependence, direction loss, no strength implication).
5. Contradictions: none found. s23: C2 (2-cell construction rules) not formalised, nothing implemented; "CONCEPTUALLY SPECIFIED". s15.1/s20.4 explicitly say high beta1 does not imply advantage (consistent with 48/49).
## 48_SUBIT_CHESS_Differential_Operators.md (811 lines, fully read)
(1) Purpose: v0.1 conceptual spec (Ukrainian) of discrete gradient/divergence/curl on the chess legal-transition graph as an auxiliary analytic layer (not replacing search/eval). Status line (sec.15): "CONCEPTUALLY SPECIFIED - NOT YET IMPLEMENTED OR VALIDATED".
(2) Definitions/IDs:
- S=(B,p,c,e,h) full state (sec.2.1); transition graph G=(S,E) (2.2).
- Gradient: Delta_SUBIT(S,m)=sigma(S)*[V(T_m(S))-V(S)] (3.3); profile G_max,G_min,G_mean,G_var,G_dist (3.4).
- Divergence: div F = B*F, div F(S)=sum F_in - sum F_out (4.3); "Mobility(S) != div F(S)" (4.4).
- Curl: Circ_F(C)=sum F(e) (5.3); potential flow F(u->v)=V(v)-V(u) has zero circulation (5.4).
- Stokes analog needs cell complex C0,C1,C2 with d1*d2=0 (6.1); ordinary graph has no 2-cells (6.3).
- Q_diff(S)=(G,D,R,K) (7); K structural stability "conceptual, not numerically formalized" (7.4). Critical(S,m) iff Dist(Q_diff(S),Q_diff(T_m(S)))>theta (8.1), Dist and theta undefined.
- Experiments DOP-01..05 (sec.10); hypotheses DOP-H1..H3 (sec.13). Architecture: Differential module separate from Core (sec.11); determinism 11.2.
(3) Concrete implementable items: effectively none with formulas/constants. Only qualitative: gradient/structural profile "for move pre-ordering" (9.2); sec.9.3: results may be used only for ordering, diagnostics, prioritizing; "must not on their own prune legal moves or change search result"; selective pruning needs separate experimental validation. Gradient-based ordering would be 1-ply static-eval delta per move (Delta_SUBIT) = essentially a make-move+eval ordering (costly; no constants given).
(4) Explanation/verification only: sections 1-2, 4.5, 5, 6, 7.5 (do-not-collapse principle), 8, 11-14; DOP-01..05 experiment plans (DOP-05 = A/B search integration without changed pruning, criterion "measurable improvement in search quality or efficiency without correctness regression").
(5) Contradictions with other docs/engine: none found within doc. Note: doc itself says V must be oriented (positive=White) and sigma(S) flips; no engine-specific references (no mention of .mjs files).

## 49_SUBIT_CHESS_TOPOLOGY.md (1046 lines, fully read)
(1) Purpose: Conceptual (Ukrainian) continuation of doc 48: connectivity, structural regions/boundaries, critical moves, two-player attractors, similarity-space filtration; research framing only. No implementation status/validation.
(2) Definitions/IDs:
- Sec.II S=(B,p,c,e,h); N(S) neighbours. Sec.III geometric vs strategic reachability; four distinct notions: possibility, reachability, control over reachability, forcedness.
- Sec.IV weak vs strong connectivity. Sec.V structural regions Omega1..Omega5 (active attack, stable defence, material advantage, limited mobility, high tension), may overlap (5.1).
- Sec.VI Boundary Move (6.1); structural differences dC,dM,dK,dA,dP,dR,dT (6.2); no weights/thresholds.
- Sec.VII invariants (legal / structural / topological); cyclomatic rank beta1=|E|-|V|+beta0 (7.3); full-space computation "practically impossible".
- Sec.VIII Criticality(S), Critical Move (8.1-8.2; critical != best).
- Sec.XI.2-3 SUBIT-Attractor: W0=A; White nodes need one move into W_n, Black nodes need all replies into W_n (this is standard game-theoretic retrograde attractor / forced-win recursion; mate/material attractors).
- Sec.XII Q(S)=(Omega,A,C,R,B). Sec.XIII STAH hypothesis with 5 predictions. Sec.XIV d_struct (must check non-negativity, symmetry, identity, triangle inequality), filtration K0..K3, persistent homology link. Sec.XV Dual Space (Transition vs Similarity). Sec.XVI experiments TOP-01..TOP-05, success criteria 1-6.
(3) Concrete implementable items: none with formulas/constants. Qualitative only: sec.10.1 nodes at a "structural boundary"/high criticality "may deserve extra search attention" (i.e. extension/ordering idea, unquantified); sec.10.2 safe approach: topology module analyses all legal moves, passes info to move ordering only, "pruning is not changed until a new heuristic is experimentally confirmed". Sec.XI attractor = forced-mate/forced-material search, already what alpha-beta/mate search does.
(4) Explanation/verification only: essentially everything (sections I-IX, XII, XV, XVII-XIX); TOP-01..05 are experiment plans (XVI): "if nothing shown, topology remains an analytic tool, not an engine component".
(5) Contradictions: none found. Consistent with doc 48 (ordering only, no pruning). Doc closes by announcing next doc = HOMOLOGY (doc 50).

## 50_SUBIT_CHESS_HOMOLOGY.md (1069 lines, fully read)
(1) Purpose: v0.1 conceptual spec (Ukrainian/English headings) of chain-complex homology (C0,C1,C2; H1=Ker d1/Im d2) on the local chess transition graph; cycles, cycle basis, persistence. Status (sec.23): "CONCEPTUALLY SPECIFIED - MATHEMATICAL FORMALIZATION AND IMPLEMENTATION PENDING"; 2-cell construction rules not yet formalized.
(2) Definitions/IDs:
- d1(e)=S_j - S_i (4.1); d1 o d2 = 0 (sec.5); Z1=Ker d1, B1=Im d2, H1=Z1/B1 (6-7).
- beta1=|E|-|V|+beta0 (8.1); "Cycle Basis != Strategic Basis" (8.2).
- Directed vs undirected homology (sec.11); Board vs Full-State homology: "Board Identity != State Identity" (12.2).
- Persistence(C)=Death(C)-Birth(C) (13.2); Q_H(S)=(beta0,beta1,H1,C,P) (sec.14); DeltaQ_H(S,m) (sec.16).
- Experiments HOM-01..HOM-06 (sec.18): HOM-01 cycle rank (inputs: full state, local graph depth H); HOM-02 spanning-tree fundamental cycles; HOM-03 build C2 and verify d1 o d2=0; HOM-04 persistence; HOM-05 strategic correlation; HOM-06 search integration. Hypotheses H-HOM-01..05 (sec.19). Limitations sec.20.
(3) Concrete implementable items: none with formulas/constants. Only sec.18 HOM-06 / 17: homology may be used for move ordering, node characterization, "identification of cyclic positions" (repetition detection), search diagnostics; "must not on its own prune moves" (HOM-06). Repetition/cycle detection is already covered by engine's draw rules (not checked against .mjs here).
(4) Explanation/verification only: all sections; HOM-01..06 are measurement experiments; sec.15.1 says high beta1 does not imply advantage; sec.20.2 model-dependent.
(5) Contradictions: none found. Consistent with docs 48/49 (ordering/diagnostics only, no pruning). Note: beta1 formula is for undirected graph; doc itself flags (11, 20.3) directed information loss. No mention of engine .mjs files; no numeric evaluation constants anywhere in docs 48-50.
