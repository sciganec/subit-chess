# SUBIT–CHESS–QI v0.2.0 — Interaction Graph Prototype

**Status:** experimental standalone prototype; not integrated into the chess engine.  
**Branch target:** `feat/subit-qi-v0.1.1` (Draft PR #2).  
**Purpose:** model relations among legal root-move candidates while preserving the classical search as the authority for legality and evaluation.

## 1. Design objective

Version 0.1.x ranks candidates using a candidate-wise score distribution followed by deterministic complex-amplitude mixing. Version 0.2.0 introduces an explicit interaction graph. The graph represents relations between candidate moves, not relations between pieces on the board and not a replacement representation of the chess position.

The prototype is deliberately isolated. It does not modify `index.html`, `searchRoot()`, Alpha-Beta, Negamax, pruning, quiescence, transposition-table logic, or move legality.

## 2. Input contract

The input is the complete list of legal root candidates produced by the existing engine. Each candidate has:
- `id`: unique, stable string identifier (prefer UCI move notation);
- `score`: existing classical move-order score;
- `features`: finite numeric feature vector;
- `context`: finite numeric contextual vector derived from the current engine context;
- optional `from`, `to`, and `tactical` values.

The engine remains responsible for generating and validating the candidate list. Missing/non-finite numeric values are treated as zero by this prototype. Duplicate or missing IDs are rejected because permutation-equivariant ordering requires stable candidate identity.

## 3. Graph definition

Let M(P) = {m₁,…,mₖ} be the legal root moves for position P. The graph is G(P)=(V,E), where V=M(P). Every unordered candidate pair is considered once.

For candidate features fᵢ and fⱼ, define cosine similarity:
`sim(i,j) = ⟨fᵢ,fⱼ⟩ / (||fᵢ||·||fⱼ||)`
with value 0 when either vector has zero norm. Context similarity `ctx(i,j)` is defined analogously.

The prototype also defines:
- `conflict(i,j)=1` when both candidates have the same known destination square; otherwise 0;
- `contrast(i,j)=|tacticalᵢ−tacticalⱼ|`, where tactical values are clamped to [0,1].

The signed edge weight is:
`wᵢⱼ = clamp(0.50·sim(i,j) + 0.25·ctx(i,j) + 0.15·contrast(i,j) − 0.35·conflict(i,j), −1, 1)`

An edge is retained when `|wᵢⱼ| ≥ ε`, with ε configurable and defaulting to 0.02. This is a provisional heuristic, not a chess-theoretic law. Its coefficients must be tuned only against held-out positions and measured outcomes.

## 4. Amplitude register and interaction

The classical scores anchor the initial distribution:
`pᵢ = exp(sᵢ/T) / Σⱼ exp(sⱼ/T)`
using numerically stable softmax and temperature T>0.

Each candidate receives a deterministic phase φᵢ derived from its stable ID and tactical feature:
`αᵢ = √pᵢ · exp(iφᵢ)`

Thus Σᵢ|αᵢ|²=1. The register dimension is k, the number of legal candidates; it is not fixed at 64 and must not be confused with SUBIT-64's semantic state count.

For each retained edge (i,j), apply the SU(2)-type pair rotation:
`[αᵢ′]   [ cos θᵢⱼ   −e^(−iδᵢⱼ) sin θᵢⱼ ] [αᵢ]`
`[αⱼ′] = [ e^(iδᵢⱼ) sin θᵢⱼ    cos θᵢⱼ ] [αⱼ]`

where `θᵢⱼ = clamp(λ·wᵢⱼ, −0.25, 0.25)` and δᵢⱼ is a deterministic pair phase. Each pair operator is unitary, so it preserves the total squared norm. Their product is also unitary.

The graph edges are processed in a canonical order: candidates are sorted by stable ID, and edges are traversed lexicographically by their endpoint IDs. This makes the output invariant to the order in which the same candidate set was supplied. The resulting operation is deterministic but generally order-dependent with respect to a *different edge schedule*; therefore the canonical schedule is part of the algorithm's definition.

## 5. Probability readout and classical anchor

After interaction:
`qᵢ = |αᵢ′|² / Σⱼ|αⱼ′|²`

The final ranking probability is blended with the original classical distribution:
`rᵢ = (1−β)·pᵢ + β·qᵢ`, where 0≤β≤1.

The prototype returns candidates sorted by descending rᵢ, with stable ID as a deterministic tie-break. It returns every input candidate exactly once. It does not prune, declare a move illegal, or alter the score used by the search evaluation. The output is a move-ordering proposal only.

## 6. Required invariants

- **QI-GR-001 Candidate conservation:** output IDs equal input IDs as a set and multiplicity.
- **QI-GR-002 Determinism:** identical input and options yield identical output.
- **QI-GR-003 Permutation equivariance:** permuting input candidates does not change the ordered output.
- **QI-GR-004 Normalization:** Σᵢpᵢ=Σᵢqᵢ=Σᵢrᵢ=1 within floating-point tolerance.
- **QI-GR-005 Unitary norm:** amplitude norm is preserved within numerical tolerance.
- **QI-GR-006 Bounded coupling:** −1≤wᵢⱼ≤1.
- **QI-GR-007 Stable ties:** equal final probabilities are ordered by stable ID.
- **QI-GR-008 No input mutation:** the original move objects are not modified.
- **QI-GR-009 Context separation:** chess-engine WHO/WHERE/WHEN context remains distinct from canonical SUBIT ISA coordinate labels.
- **QI-GR-010 Classical fallback:** strength=0 or blend=0 reproduces classical score ordering, modulo deterministic tie-breaking.

## 7. Diagnostics

The prototype reports candidate count, retained edge count, possible edge count, graph density, mean absolute edge weight, mean degree, norm before/after, norm drift, parameters, and per-edge weights/similarities/conflict flags.

For engine integration, diagnostics should be sampled or disabled in production search to avoid unnecessary allocation and logging overhead.

## 8. Validation completed for this prototype

The standalone Node.js test suite checks candidate conservation, deterministic output, permutation equivariance, probability normalization, unitary norm preservation, bounded edge weights, stable tie-breaking, and duplicate-ID rejection.

The test is a unit test of this standalone prototype. It does **not** establish browser compatibility, correctness of the engine's feature extraction, Worker/fallback parity, chess strength improvement, perft equivalence, or Elo gain.

## 9. Integration gates

Do not integrate into `searchRoot()` until all of the following are satisfied:
1. Define and review the feature vector from actual engine data; do not infer unavailable board features.
2. Run browser tests with Worker enabled and disabled.
3. Verify board rendering and piece interaction remain unchanged.
4. Verify legal root-move sets and perft results are unchanged.
5. Run fixed-FEN tactical and quiet-position suites.
6. Compare v0.1.2 and v0.2.0 under paired, repeated positions with identical time/depth budgets.
7. Measure nodes, wall time, allocation pressure, and mobile CPU impact.
8. Run sufficiently large self-play and external-opponent samples before any Elo claim.

## 10. Interpretation limits

The use of complex amplitudes and unitary pair rotations is a mathematical design analogy implemented on classical hardware. This prototype is not a quantum circuit, does not run on quantum hardware, and does not imply quantum speedup or advantage. Any benefit must come from a better move-ordering heuristic and must be established empirically.

The graph is a model of candidate interaction under a selected feature representation. It is not a complete model of chess strategy, does not encode the whole board, and does not replace the engine's position representation.
