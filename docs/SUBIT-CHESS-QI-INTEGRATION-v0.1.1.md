# SUBIT-CHESS-QI v0.1.2 — contextual integration and A/B harness

## Status

Experimental implementation committed to branch `feat/subit-qi-v0.1.1`, proposed through Draft PR #2. This is a classical software implementation of a quantum-inspired ranking model. It is not a quantum computer implementation and does not establish quantum advantage.

## Search integration

- QI is applied to the root legal-move list inside `searchRoot()`, after the engine's classical `scoreMove()` ordering.
- The QI layer never removes candidates and does not change move legality.
- The layer constructs a normalized probability distribution from classical move-order scores.
- Complex amplitudes are initialized with deterministic phases.
- Pairwise SU(2)-style rotations mix the amplitudes; the resulting probabilities are blended with the classical distribution.
- Existing Alpha-Beta/Negamax, quiescence, TT, LMR, null-move and futility mechanisms remain the search foundation.
- The QI parameters are transferred through both the Web Worker request and synchronous fallback.

## SUBIT context integration

Each root ordering call obtains the position context using the engine's existing `subit.computeS(pos)` function. The three contextual dimensions are:

- WHO: ATTACK, PRESSURE, DEFENCE, QUIET.
- WHERE: KING, CENTER, QUEENSIDE, GLOBAL.
- WHEN: OPENING, MIDDLEGAME, TACTICAL, ENDGAME.

The move feature vector combines tactical character, destination centrality, pawn advance, king movement, move distance, proximity to the opposing king, and a context-fit term. The context-fit term is dimension-specific: WHO, WHERE and WHEN each contribute to the candidate phase and pairwise coupling.

This is an operational mapping for this engine's existing chess vocabulary. It is not the user's separate canonical SUBIT ISA coordinate vocabulary (ME/WE/YOU/THEY × EAST/SOUTH/WEST/NORTH × SPRING/SUMMER/AUTUMN/WINTER). The two systems must not be conflated.

## Controls and diagnostics

The settings modal includes:
- SUBIT-QI ON/OFF selector. OFF preserves the classical root ordering.
- A/B button comparing a fixed depth-3 classical search with a fixed depth-3 QI search on the current position.
- Diagnostics reporting the number of root candidates, whether the top move changed, the pre/post top move, and the computed SUBIT chess context.

The A/B harness is a single-position diagnostic, not a strength benchmark. It reports score, depth, node count and elapsed time; a single run is not statistically meaningful. It uses a time limit for each search, so a result may be aborted before reaching the requested depth.

## Mathematical invariants

The amplitude mixing uses pairwise unitary rotations. The standalone invariant test checks norm preservation for register sizes 2 through 64 and a dedicated two-amplitude rotation.

## Limitations and required validation

Not yet verified:
- browser execution of the modified full HTML;
- Worker/fallback parity in a browser;
- perft equivalence and legal-move set equivalence;
- fixed-FEN suite and tactical regression;
- repeated paired A/B samples;
- self-play Elo and confidence intervals;
- CPU/memory profiling on mobile and desktop.

The QI layer changes root ordering only, but root ordering can influence Alpha-Beta bounds, aspiration behavior, node counts and practical playing strength. Do not claim improvement until the validation suite is run. Keep this pull request in Draft status until then.
