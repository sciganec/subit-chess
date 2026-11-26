## 59_SUBIT_CHESS _INFORMATION_THEORY.md (670 lines, fully read)
1. Purpose: Ukrainian research concept v0.1 treating a chess state S=(B,p,c,e,h) as an information object; defines move-set entropy, mutual information, information loss under state reduction, informational complexity. Explicitly diagnostic-only at first stage; no numbers calibrated.
2. Definitions/invariants/tests:
 - S2: S=(B,p,c,e,h); M(S) legal moves; graph G=(S,E).
 - S4: b(S)=|M(S)|; H(M|S)=-sum p_i log2 p_i; H_uniform=log2 b(S) (max entropy).
 - S5: H_pi(S) over policy pi(m|S). S6: dH(S,m)=H_{pi-p}(S')-H_pi(S) (only comparable with same policy model).
 - S7: I(X;Y|S)=H(X|S)-H(X|Y,S). S8: I(Q;Z)=H(Z)-H(Z|Q); incremental test I(Q2;Z|Q1)>0.
 - S9: reduction R=phi(S); loss H(S|R); board-only R insufficient for movegen (castling rights differ).
 - S10: Q_INFO(S)=(H_L,H_pi,H_D,C_R,L_I) research vector, not to be summed.
 - S14 hypotheses H-INFO-01..06; S15 experiments INFO-01..07 (INFO-06 = node count/time with info-based move ordering vs baseline minimax; INFO-07 ablation).
 - S16 implementation principles: full-state, separated from search core, deterministic, explicit distribution, no external engines/game histories as training source.
3. Concrete implementable items: none found with formulas/constants. Only S12: J(S,m)=V(T_m(S))+lambda*I(S,m) (lambda unspecified, I(S,m) undefined) - explicitly NOT to replace minimax; safe path = compute profile separately, use for move ORDERING only (S12 steps 1-5, INFO-06), measure nodes/time/stability. Candidate idea only: entropy/branching-based ordering; no formula given.
4. Explanation/verification only: S1,3,9,11,13 (links to topology/homology/sheaves/category), S14, S15, S17 (entropy != complexity != strength), S18 ontological conclusion; slogan "DO NOT COLLAPSE - CONTEXTUALIZE".
5. Contradictions: none found. (Consistent with the 'no external learning material' policy; S12 says info terms must not alter minimax value.)

## 60_SUBIT_CHESS_COMPUTATIONAL_COMPLEXITY_THEORY.md (712 lines, fully read)
1. Purpose: Ukrainian v0.1 concept formalizing search cost (tree vs graph, minimax, alpha-beta, TT, caching, tiered computation) and rules for when SUBIT structural modules may enter search. Generic textbook content; no calibrated numbers.
2. Definitions/invariants/tests:
 - S1/S5: N(d)=(b^(d+1)-1)/(b-1)=O(b^d); example b=30 -> x30 per ply.
 - S2: three complexity levels (game / position / algorithm cost).
 - S6: V_d(S)=Minimax_d(S,V^). S7: alpha>=beta cutoff; O(b^d) worst, O(b^(d/2)) with perfect ordering.
 - S8: TT entry fields: key, depth, score, bound type (EXACT/LOWERBOUND/UPPERBOUND), best move; 8.1 hash collision policy; 8.2 key must include castling, ep, side to move, relevant history.
 - S9: C_total ~ sum C_node(S_i); quality/cost ratio of eval.
 - S10: 5 compute tiers (rules; fast eval; structural analysis; search; verification/learning).
 - S11: Q_COMP(S)=(N,D,B,E,T,M).
 - S14: H-COMP-01..06; S15: COMP-01..08 (COMP-06 structural ordering must reduce nodes for same depth; COMP-07 ablation).
 - S16 invariants: movegen unchanged by optimization; make/unmake restores all state; terminal conditions (mate, stalemate, auto/claimed draw); TT must not merge states differing in relevant history; alpha-beta preserves minimax value; time abort must leave last completed correct result; reproducibility.
3. Concrete implementable items: only generic, no constants: S13.1 ordering criteria list "взяття; шахи; загрози; форсовані відповіді; попередній найкращий хід; результати таблиці транспозицій; перевірені структурні характеристики" (captures, checks, threats, forced replies, previous best move, TT move, verified structural features); S13.2 iterative deepening d=1,2,3..., prior depth orders next; S13.3 separate caches (movegen, eval, structural, search); S13.4 incremental structural updates only with equivalence test vs full recompute; S13.5 selective structural analysis but "must not discard legal moves" - structural features may reorder, not prune, initially; S17 adaptive time/resource R(S)=f(U(S),C(S),I(S)) - f unspecified, to be calibrated on internal experiments (time-management idea: allocate by uncertainty/importance, not branching). No exact formulas.
4. Explanation/verification only: S1-S5, S11, S12 (per-module cost remarks: topology/homology/sheaf too costly per node), S14, S15, S18 ontological. S16 serves as checklist (TT contexts, abort safety).
5. Contradictions: none found. Note: S12/13.5 say structural terms reorder only (no pruning), consistent with doc 59 S12.

