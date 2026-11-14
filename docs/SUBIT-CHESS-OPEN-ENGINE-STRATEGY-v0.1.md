# SUBIT-CHESS — Open Engine Research & Integration Strategy v0.1

**Status:** Research and architecture proposal. No third-party engine source or binary is vendored by this document.

## 1. Purpose

SUBIT-CHESS should remain an independently identifiable engine. Open engines are introduced as external references, evaluators, teachers and opponents—not as silent replacements for the SUBIT search architecture.

The immediate research question is not whether SUBIT can copy the strongest engine. It is whether SUBIT's contextual policy and interaction-graph move ordering can produce measurable gains when compared under controlled conditions with strong, reproducible baselines.

## 2. Recommended reference engines

### 2.1 Stockfish — primary strength baseline and analysis teacher

Repository: https://github.com/official-stockfish/Stockfish

Use for:
- independent best-move and MultiPV references;
- centipawn / mate-score labels at controlled node or time budgets;
- tactical and positional test-position analysis;
- baseline opponent in paired match testing;
- reference for modern search and NNUE concepts.

Stockfish is a UCI engine using alpha-beta search and NNUE evaluation. Its repository is GPL-3.0. Do not copy Stockfish source into the MIT-licensed SUBIT-CHESS codebase unless the project deliberately changes its licensing and satisfies all applicable GPL obligations.

### 2.2 Ethereal — readable alpha-beta research reference

Repository: https://github.com/AndyGrant/Ethereal

Use for:
- studying a second independent alpha-beta implementation;
- comparing search heuristics and evaluation design;
- understanding engine tuning and OpenBench-style testing;
- cross-checking whether a proposed SUBIT optimization is Stockfish-specific.

The repository identifies Ethereal as GPL-3.0 and documents its UCI interface and OpenBench development workflow. Its current README also describes the commercial status of NNUE releases; verify the exact version and terms before using any binary or network.

### 2.3 Fairy-Stockfish — later variant research only

Repository: https://github.com/fairy-stockfish/Fairy-Stockfish

Not needed for orthodox chess v0.2.x. Keep it as a future reference if SUBIT-CHESS expands into Chess960 or other variants. It is GPL-3.0 and supports multiple protocols and WebAssembly ports.

## 3. Integration boundary: UCI adapter, not source transplant

Preferred architecture:

`SUBIT-CHESS` ⇄ `UCI adapter` ⇄ `external engine process / WASM worker`

The adapter should:
- send `uci`, `isready`, `ucinewgame`, `position fen ...`, `go depth N` or `go nodes N`;
- parse `info` lines, MultiPV, depth, nodes, score cp/mate, principal variation, and `bestmove`;
- support cancellation with `stop` and orderly shutdown with `quit`;
- record engine identity, version, binary hash, options, time/node budget, FEN, side to move and result;
- never allow an external engine to alter SUBIT's legal move list or board state;
- keep all external results tagged as external provenance.

The adapter must be replaceable. A missing external binary must not prevent the native SUBIT engine from starting.

For the browser build, use a separate Worker boundary and a supported WASM build. Do not assume a native executable can run in the browser. For Node/CLI experiments, a local UCI subprocess is simpler and should be implemented first.

## 4. Three useful research modes

### Mode A — Reference analysis

For each FEN, ask Stockfish and optionally Ethereal for:
- bestmove;
- MultiPV top-k;
- score;
- depth and nodes;
- principal variations.

Compare SUBIT's move and score against these references. Treat engine scores as engine-specific estimates, not ground-truth game-theoretic values except in solved/tablebase positions.

### Mode B — Teacher dataset

Generate a versioned corpus of positions with:
- FEN and source game / position provenance;
- side to move and position phase;
- legal move list from SUBIT;
- teacher engine/version/options;
- teacher MultiPV and score;
- SUBIT classical score, legacy QI rank and graph-QI rank;
- chosen move, outcome and search diagnostics.

Use the teacher data to tune SUBIT's own evaluation features and context policy. Do not train on one teacher's top move as if it were infallible. Preserve disagreements and teacher uncertainty; use multiple teachers and deeper analysis for critical positions.

### Mode C — Match and ablation testing

Compare at least:
1. SUBIT classical;
2. SUBIT legacy QI v0.1.2;
3. SUBIT graph QI v0.2.2;
4. SUBIT with any later teacher-informed tuning;
5. external Stockfish baseline.

Use paired openings/positions, color reversal, fixed hardware, equal time or node budgets, randomized engine order, and repeated games. Report wins/draws/losses, score percentage, Elo estimate with confidence interval, nodes, time, depth, tactical misses and crashes. Never compare unequal budgets without labelling the experiment.

## 5. How open-engine knowledge can improve SUBIT

Prioritize ideas as hypotheses to test, not as guaranteed upgrades:

- Move ordering: TT move, winning captures, promotions, killers, history/countermove features, and root-specific policy ordering.
- Search stability: aspiration windows, PVS, singular extensions, reduction/re-search calibration, pruning safeguards.
- Evaluation: king safety, pawn structure, mobility, passed pawns, piece activity, phase-aware terms.
- NNUE: learnable efficient evaluation as a later independent module; do not rush it before a reliable dataset and match harness exist.
- Testing: SPRT / sequential testing, paired openings, reproducible seeds and large-scale self-play.

SUBIT's distinct contribution should remain the explicit context model and its policy over legal candidate moves. A useful research design is to let classical engine signals define a strong prior, while SUBIT context and graph interactions make a controlled, measurable adjustment.

## 6. License and provenance policy

The current SUBIT-CHESS repository declares MIT. Stockfish, Ethereal and Fairy-Stockfish repositories declare GPL-3.0.

Policy:
- Do not paste GPL implementation code into the MIT engine.
- Do not vendor or bundle a GPL engine binary in a release without an explicit GPL compliance plan.
- If distributing an external GPL binary, provide the required license notices and corresponding source (or a valid source offer/pointer as required by the applicable GPL terms), including modifications.
- Prefer a separately installed/user-supplied engine for local experiments; record exact version and binary hash.
- Keep UCI adapter code authored independently and keep protocol communication/data exchange documented. This is an engineering separation, not a legal guarantee; distribution models and linking details can affect obligations. Obtain legal review before commercial distribution of a combined product.
- Ideas and published algorithm descriptions can be studied independently; copied code, assets and network files have their own licenses and attribution requirements.

## 7. Proposed implementation sequence

### OEG-01 — UCI reference runner (Node first)
Create a small adapter that launches a user-configured engine path, sends UCI commands, enforces timeouts, parses output and emits normalized JSON. No engine binary is committed.

### OEG-02 — FEN benchmark corpus
Create a curated, versioned corpus of tactical, quiet, endgame and opening positions. Validate every FEN and legal move list with SUBIT's own chess module.

### OEG-03 — Teacher labels
Run Stockfish at fixed node budgets and MultiPV settings; store engine/version/options and complete provenance with every record.

### OEG-04 — SUBIT ablation report
Run classical / legacy QI / graph QI / teacher-informed variants on identical FENs and budgets. Measure both move agreement and independent match outcomes.

### OEG-05 — Optional browser UCI worker
Only after Node runner is stable, evaluate a separately licensed/attributed WASM distribution in a dedicated Worker. Do not block the standalone browser app if unavailable.

## 8. Acceptance criteria

The UCI integration is accepted only when:
- adapter handles UCI handshake, readiness, bestmove, MultiPV, stop and timeout;
- a missing or crashing external engine does not crash SUBIT;
- FEN and move encoding round-trip correctly;
- all external records include provenance;
- benchmark runs are reproducible from committed configuration and documented engine hashes;
- no external engine code or binary is silently mixed into the MIT source tree.

## 9. Current recommendation

Start with Stockfish as the primary external teacher and opponent, and Ethereal as a second independent search reference. Do not integrate their source into SUBIT. First build OEG-01, then OEG-02 and OEG-03. Only after baseline data exists should teacher-informed SUBIT changes be proposed.

The success criterion is not that SUBIT imitates Stockfish. It is that SUBIT's own methods demonstrate measurable, reproducible value against it.
