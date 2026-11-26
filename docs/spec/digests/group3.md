# Digest group3 (SUBIT-CHESS theory docs)

## 03_SUBIT_STRUCTURAL_METRIC_v1.0.md (1596 lines, read in full)
(1) Purpose: Defines a multi-component (vector, not scalar) structural distance between chess positions, move structural delta, criticality and stability; explicitly NOT an evaluation. Status says "implementation not claimed", hypotheses unverified.
(2) Definitions / invariants / tests:
- §2.1 P=(B,s,C,E,H,N); §2.2 signature Ω(P)=(V,R,A,C,T,Q,H); §3 D(P1,P2)=(Dv,Dr,Da,Dc,Dt,Dq,Dh) (vector is primary).
- §5.2 Dr=|R(P1) △ R(P2)|, typed split (D_attack,D_defend,D_support,D_control,D_block,D_pin,D_dependency); §5.3 Jaccard D_J=1−|A∩B|/|A∪B| (0 if both empty); §5.4 hyper-relations PIN(att,pinned,target), DISCOVER, FORK.
- §6.1 numeric d=|a−b|/(a_max−a_min); §6.2 categorical 0/1.
- §7.1 context space I={QUIET,DEFENCE,ATTACK,PRESSURE} x Z={GLOBAL,QUEENSIDE,KING,CENTER} x Φ={OPENING,MIDDLEGAME,ENDGAME,TRANSITION}, |C|=64; §7.2 C(P)=(c1..c64), ci∈[0,1], NOT a probability distribution; §7.3 Dc1=Σ|ci(P1)−ci(P2)|, Dc=Dc1/64.
- §8 Dt=|T△T|, Jaccard variant; tactic list CHECK, MATE_THREAT, FORK, PIN, DISCOVER, DOUBLE_ATTACK, OVERLOAD, DEFLECTION, INTERFERENCE, BACK_RANK_THREAT, PROMOTION_THREAT (with concrete args).
- §10 ΔΩ(P,m)=(V+,V-,R+,R-,AΔ,CΔ,T+,T-,HΔ); MOVE_EVENT record.
- §11 S(x,P)=d(Ω(P),Ω₋ₓ(P)) counterfactual removal; Q_local, Q_global; Q≠V.
- §12.2 R(P')=min_m D(P',T(P',m)), R_max=max_m ...; not quality.
- §13-14 metric axioms; sym-diff and Jaccard are metrics; weighted sum with w≥0 is metric only if components jointly separate.
- §15 D_total=wv Dv+wr Dr+wa Da+wc Dc+wt Dt+wq Dq+wh Dh; §15.1 first impl should keep the vector, no ad hoc weights.
- §17.4 F(P)=Hash(Canonical(Ω(P))); not a TT key. §18 Build(P')≡Update(Build(P),m).
- Invariants SM-INV-001..012 (§19: determinism, typing, semantics kept apart, symmetry, zero-distance, history kept, numbering-independence, transform correctness, incremental equivalence, no eval substitution, hyperrelations kept, colour symmetry).
- Tests §20.1-20.11 (identity, symmetry, triangle, move, capture, promotion, castling, e.p., colour symmetry, incremental equivalence mandatory, structural independence). Hypotheses H-SM-001..006 (§23). Stages SM-01..SM-10 (§24).
(3) Concrete strength-affecting items: NO numeric constants/weights anywhere. Only qualitative: §17.2 move ordering priority for moves that "create immediate threat; remove a critical dependency; open an important line; destroy opponent's defensive structure; create coordination" — but text says structural distance alone must NOT determine priority (large change not necessarily good). §17.3 structural diversity/dedup of search branches (no formula). §24 SM-09: structure is an "additional analytical channel", must not change legal move set or replace eval. None found with exact formulas/constants.
(4) Explanation/verification only: whole ΔΩ delta (created/destroyed relations, tactics), criticality S(x,P) as "what does this piece hold up", stability R/R_max, incremental-vs-full equivalence test (SM-INV-009/§20.10), colour-symmetry test (SM-INV-012), fingerprint F(P) diagnostics, tests 20.4-20.8 on structure update after move/capture/promo/castle/ep.
(5) Contradictions/notes: §7.1 says 64-context model must not be confused with canonical SUBIT ISA coordinates; check engine context.mjs for whether it uses 4x4x4 and non-normalised intensities (doc requires NOT normalised to sum 1, §SM-04). §17.3 explicitly forbids using the structural fingerprint as TT key (engine must use Zobrist incl. castling/ep/repetition). Doc 03 forbids composite weights initially; other docs (e.g. evaluate) may collapse to scalar — check. Doc claims "own implementation, no external libs" (§21).

## 07_SUBIT_CHESS_SELF_PLAY_&_EVALUATION_PROTOCOL_v1.0.md (859 lines, read in full)
(1) Purpose: Protocol for reproducible self-play Champion/Challenger comparison, regression and acceptance of engine versions without external engines/data. Measures relative, not absolute, strength.
(2) Definitions / IDs:
- §3.1 Match=(C,N,P0,K,R); §3.2 paired match with colour swap from the same start position; §4.2 profiles PROFILE-OPENING/MIDDLEGAME/ENDGAME/TACTICAL/STRUCTURAL; §4.3 ValidatePosition(P) (1 king each, castling/ep coherence, reachability).
- §5 sets D_train, D_val, D_reg (frozen regression), leakage protection + rotation.
- §6.1 recommends fixed NODE budget for first tests, also equal-time tests; §6.4 MatchConfig=(Seed,Position,Budget,Threads,VersionA,VersionB).
- §7.3 Score_N=(W+0.5D)/(W+D+L); Score_C=1−Score_N. §8.2 pair result xi∈{0,0.5,1}, μ=Σxi/n, σ²=Σ(xi−μ)²/(n−1); §8.3 CI on pairs (pairs not independent games); §8.4 sequential test must pre-fix min/max pairs, stopping rule, acceptance criterion (no numeric values given).
- §9.1 context C=I×Z×Φ 64 combos, overlapping, not forced single label; §9.4 report context regressions.
- §10 tactical tests: mate in 1/2, defend vs mate, hanging piece, fork, pin, trap; §10.2 accept ANY mating move.
- §12 ablation ladder A=Material+Mobility+Basic Search; B=A+SRA; C=B+Context Model; D=C+Structural Delta; E=D+Adaptive Search.
- §14 ACCEPT-001..010; §15 report template (incl. Perft, Nodes/s, PV stability); §16 cycle Dt=Generate(θt,Gt), θ'=Optimize, R=Evaluate(θ',θt,D_val), θt+1=Select. Hypotheses H-SP-001..006.
(3) Concrete strength-affecting items: none found (no eval terms, pruning, ordering, time management). Only methodology: equal node budget; pair-level statistics; ablation A..E to prove each component earns its cost ("if a component shows no measurable benefit it must not be considered successful", §12).
(4) Explanation/verification only: whole doc is a test harness spec — paired colour-swap matches, regression set D_reg incl. perft, tactical suites (mate-in-N accepts any mating move), per-context breakdown, evaluation report format, provenance/rollback (ACCEPT-008/009), 11.1 diagnostic labels for moves ("tactically refuted", "structurally risky", ...).
(5) Contradictions/notes: no numeric thresholds for ACCEPT-005 or sequential test (doc leaves "pre-defined"); check engine evolve.mjs/learn.mjs against ACCEPT criteria (e.g. does it use D_val separate from training, pair-level CI). Rule of "no external engines/data" is consistent with doc 03 §21. Context model 4x4x4 same as doc 03.
