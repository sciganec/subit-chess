# SUBIT-CHESS-QI v0.1.1 — integration milestone

This branch adds an experimental quantum-inspired root move-ordering layer to the existing classical search.

## Integration
- QI is applied only to the root legal-move list in `searchRoot()`.
- Existing classical `scoreMove()` ordering is applied first.
- A normalized candidate distribution is constructed from those classical move-order scores.
- Complex amplitudes receive deterministic phases from coarse move features (capture/promotion, destination centrality, pawn advance, king move).
- Pairwise SU(2)-style rotations mix candidate amplitudes.
- The resulting weights provide a small blended reordering signal.
- All legal root candidates remain present.
- Alpha-Beta, Negamax, quiescence, TT, LMR, null-move and futility logic are not directly modified.
- QI is passed through both Web Worker and synchronous fallback search paths.
- The main interactive search path enables QI with conservative defaults; other search callers remain classical unless they pass qiEnabled.

## Important limitations
This is a classical simulation of a small complex-amplitude ranking model, not execution on quantum hardware and not evidence of quantum advantage. The current feature vector is intentionally coarse. It does not yet use the full SUBIT 64-state context, learned phases, a full strategic interaction graph, or teacher telemetry.

The change is restricted to root ordering. It does not reorder internal alpha-beta nodes. Search behavior can still change because root order affects aspiration windows and subsequent bounds.

## Validation still required
- Browser regression: worker and synchronous fallback parity.
- Chess correctness: legal move set and final best move consistency.
- Fixed-FEN A/B testing with QI off/on.
- Tactical suite and paired self-play Elo.
- Performance profiling on mobile and desktop.

QI is experimental and should be disabled for any strength claim until these tests are complete.
