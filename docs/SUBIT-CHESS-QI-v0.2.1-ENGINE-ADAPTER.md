# SUBIT–QI v0.2.1 — Engine Adapter Contract

**Status:** isolated adapter and contract tests; not integrated into the search engine.  
**Engine source audited:** `index.html` on the Draft PR branch.  
**Purpose:** translate the existing engine's move and position structures into the v0.2.0 graph module's candidate schema without inventing a second chess representation.

## 1. Audited engine contract

The current engine source establishes the following structures:

- Position: `pos.board[rank][file]`, `pos.turn`, `pos.kingPos.w`, `pos.kingPos.b`.
- Move: `move.from = [rank,file]`, `move.to = [rank,file]`; optional `ep` and `promo`.
- Stable move identity: `chess.moveToUci(move)`.
- Classical root ordering score: `scoreMove(move,pos,0,ttMove)`.
- Position context: `subit.computeS(pos)`, with `subit.keyOfS(ctx)`.
- Context labels: WHO = ATTACK/PRESSURE/DEFENCE/QUIET; WHERE = KING/CENTER/QUEENSIDE/GLOBAL; WHEN = OPENING/MIDDLEGAME/TACTICAL/ENDGAME.

These engine context labels are an engine-specific 4×4×4 policy vocabulary. They are not the canonical SUBIT ISA's ME/WE/YOU/THEY × EAST/SOUTH/WEST/NORTH × SPRING/SUMMER/AUTUMN/WINTER coordinates.

## 2. Adapter API

`SubitQIEngineAdapter.adapt(moves,pos,engine,ttMove)`

The `engine` dependency object contains:
- `chess.moveToUci(move)`;
- `subit.computeS(pos)`;
- optional `subit.keyOfS(ctx)`;
- `scoreMove(move,pos,0,ttMove)`.

The result contains:
- `candidates`: candidate objects for `SubitQIInteractionGraph.rank()`;
- `context`: the exact context returned by `computeS`;
- `contextKey`: the engine's context key.

Each candidate has a stable UCI `id`, the classical ordering score, a nine-element move feature vector, a three-element candidate-specific context-fit vector, source/destination coordinate strings, tactical flag, context key, and a reference to the original engine move. The adapter does not modify the original move objects.

## 3. Feature mapping

For each candidate:
- tactical = capture, en passant, or promotion;
- center = destination centrality, using the existing engine's normalized Manhattan formula;
- advance = side-relative pawn-advance proxy, preserving the current root-QI formula;
- king = moving piece is the king;
- travel = Manhattan move distance / 7;
- enemyNear = destination proximity to the opposing king;
- whoFit, whereFit, whenFit = candidate-specific fit against the exact current SUBIT chess context.

The graph's `context` vector is candidate-specific `[whoFit,whereFit,whenFit]`. It is not a one-hot encoding of the position context: all legal moves in one position share the same context label, and a constant one-hot vector would contribute no candidate discrimination to pairwise cosine similarity. The exact position context remains available as `contextKey` for diagnostics and later stratified evaluation.

## 4. Scope and safety

This adapter is standalone. It does not call `searchRoot()`, reorder live engine moves, alter legality, or change pruning. The integration boundary is deliberately explicit:
1. obtain the complete legal root-move list from the engine;
2. adapt candidates using the engine's own scoring and context functions;
3. rank with the standalone graph module;
4. map returned candidate IDs back to original move objects;
5. preserve candidate count and verify exact ID-set equality before any search call.

A future integration must be feature-flagged, root-only, and default OFF until browser, Worker/fallback, perft, tactical, and paired-search checks pass.

## 5. Contract tests

The adapter test covers:
- actual coordinate-pair move shape;
- UCI identity callback;
- classical `scoreMove` callback;
- position context key propagation;
- tactical detection;
- nine- and three-dimensional feature schemas;
- opening/queenside/endgame context-fit branches;
- input immutability;
- invalid position rejection.

The graph and adapter tests are run by the new GitHub Actions workflow. These tests validate the adapter contract against a controlled mock position, not full gameplay or chess strength.

## 6. Current validation boundary

Passing Node.js unit tests do not establish browser execution, Worker serialization, move-generator correctness, perft equivalence, search parity, Elo improvement, or mobile performance. Those remain explicit integration gates.
