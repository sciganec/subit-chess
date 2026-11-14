# SUBIT–CHESS–QI v0.2.2 — Root Interaction Graph Integration

**Status:** integrated on the Draft PR branch behind an OFF-by-default feature flag. This is a software integration milestone, not evidence of stronger play or quantum speedup.

## 1. Search boundary

The graph ranker is defined inside \`makeSearchModule()\`. The application serializes this function into its Web Worker source, so the graph implementation does not depend on an external module global or an import unavailable to the generated worker.

At the root of each iterative-deepening search:

1. the engine generates the complete legal move list;
2. the existing classical \`scoreMove()\` ordering is applied;
3. if graph mode is enabled, the graph ranker reorders that same list;
4. otherwise the legacy SUBIT-QI v0.1.2 ordering is used when enabled, or classical ordering remains in effect.

Graph mode is mutually exclusive with legacy QI ordering for a given root search. No move is removed, created, or revalidated by the ranker. Alpha-Beta/Negamax, evaluation, transposition-table semantics, pruning, and legality are not changed.

## 2. Candidate representation

Each root move is identified by the engine's \`chess.moveToUci(move)\` stable identity. The feature vector contains tactical status, destination centrality, side-relative advance proxy, king-move indicator, Manhattan travel, enemy-king proximity, and candidate-specific WHO/WHERE/WHEN fit values derived from the current \`subit.computeS(pos)\` context.

The graph uses variable candidate count k. It does not force the legal move list into 64 slots. Candidate-specific context-fit vectors are used in edge similarity; a constant position-level one-hot vector would not distinguish candidates in the same position.

## 3. Interaction graph

Candidates are sorted by UCI ID before pair construction. Every pair is visited in lexicographic order. The edge weight is:

\`wᵢⱼ = clamp(0.50·sim(fᵢ,fⱼ) + 0.25·sim(cᵢ,cⱼ) + 0.15·|tᵢ−tⱼ| − 0.35·conflict(i,j), −1, 1)\`

Edges with \`|wᵢⱼ| < 0.02\` are omitted. A destination collision is a simple same-destination conflict proxy, not a full chess tactical-conflict oracle.

Initial amplitudes are derived from a rank-softmax of the classical ordering (πᵢ = exp(−rankᵢ/3) / Σⱼ exp(−rankⱼ/3)) and deterministic UCI-based phases. Rank-softmax avoids letting the engine's large sentinel score for a transposition-table move numerically saturate the entire distribution, while preserving the classical order as its anchor. Pair interactions use the SU(2)-type rotation:

\`aᵢ′ = cos(θ)aᵢ − sin(θ)e^(−iδ)aⱼ\`

\`aⱼ′ = sin(θ)e^(iδ)aᵢ + cos(θ)aⱼ\`

with \`θ = clamp(strength·wᵢⱼ, −0.25, 0.25)\`. The final graph probability is blended with the classical base probability using a fixed blend of 0.12. The pair schedule is part of the algorithm definition: changing its order can change the result even though each pair gate is unitary.

## 4. Feature flag and diagnostics

The separate \`SUBIT-QI interaction graph v0.2.2\` setting defaults to OFF. It is independent of the existing \`SUBIT-QI move ordering\` switch. When enabled, graph mode takes precedence over legacy QI ordering; when disabled, the previous mode-selection behavior remains.

Diagnostics include candidate count, edge count, graph density, mean degree, norm before/after and norm drift, top move before/after, position context, and fallback reason. A candidate-set equality guard rejects any result that does not contain exactly the original UCI move IDs. A norm-invariant guard rejects non-finite or materially drifting output and falls back to the pre-graph move order.

The settings A/B/C run compares classical, legacy QI v0.1.2, and graph v0.2.2 at a fixed shallow depth. It is a smoke comparison only; one position and one run are not statistically meaningful.

## 5. Worker and synchronous fallback

The graph toggle and strength are passed through both:
- generated Web Worker request → worker \`createSearch()\` options;
- synchronous fallback → local \`createSearch()\` options.

The implementation is contained inside the serialized search-module closure to avoid missing-function errors in Worker execution.

## 6. Validation boundary

The integration-contract test parses the inline application JavaScript and checks the root hook, feature-flag default, mode isolation, Worker/fallback option propagation, A/B/C presence, deterministic edge schedule, candidate-set guard, and norm guard.

Passing this static contract test does **not** establish:
- browser runtime correctness;
- Worker/synchronous result parity;
- board rendering or piece visibility;
- perft equivalence or move-generator correctness;
- tactical-suite performance;
- Elo improvement or statistically significant strength change;
- mobile latency or memory suitability.

Keep the PR in Draft until these runtime and chess-strength gates are completed. No quantum hardware or quantum computational advantage is claimed.
