# Theory reading notes (2026-11-19, updated 2026-11-21)

What was read, what it says that matters for the engine, and what is still open. Written to be checked, so
coverage is stated exactly.

## Coverage

Read in full:
- `docs/ROADMAP.md`, `docs/spec/SUBIT-CHESS-SPEC.md` (v1.0), `docs/theory/33-64/47_…CANONICAL_IMPLEMENTATION_ROADMAP`
- `docs/theory/01-32/26_…TEMPORAL_VALUE_THEORY`, §25–37 (extension of the value function, temporal move ordering, budget, quiescence)
- subit-subit: `README.md`, the SUBIT-CHESS module in `spec/SUBIT_ECOSYSTEM/01_…` (§9.3, module 41), `paper/article_SUBIT_CPU.md` §6 (chess case)
- SCMF-001 (earlier in this work, in full)

Headings only (outline of every `##` section, 47 documents) plus the section lists of 24, 25, 26, 38:
- `docs/theory/01-32/01…32`, `docs/theory/33-64/33…47`

Not read: the bodies of theory documents 01–23, 27–46 (about 2.7 MB), `docs/papers`, `docs/DECISIONS.md` beyond its
title list, and in subit-subit everything else (the SUBIT-∞ v6 specification, Lean/Rust archives, WARP, ALT,
TETRAKSIS, monographs, apps; 37 MB in 483 files). There is no document numbered above 47 in `docs/theory`; the
folder is called `33-64` but ends at 47.

## What the sources say that bears on the engine

1. **Order of work (doc 47 §10).** Correctness, then base strength, then efficiency, and only then structural and
   strategic intelligence. Phase 3 requires ablation per structural component, and says a component that adds
   complexity without measurable benefit must be reconsidered. ROADMAP Gate 3 is stricter: a layer without a
   positive interval over 200 games is deleted. The structural layers measured in v3.0.9 (SVF-9 evaluation,
   ΔΩ weights, root re-selection, structural extension) are all at or below zero and are already switched off;
   by the ROADMAP's own kill criterion they are candidates for removal, not for tuning.
2. **Temporal value (doc 26).** Θ = (availability, urgency, time cost, durability, risk, flexibility) is a vector
   and the document says not to reduce it to one number yet. §34: it may drive move ordering, but "temporal
   priority" is explicitly not "search value". Nothing of this is in the engine. A plan-based ordering was tried
   (`planord`): fewer nodes, no strength gain.
3. **Quiescence (doc 26 §37, doc 47 §5.5).** (Measured on 2026-11-21, see the update below.) The documents forbid stand-pat in check and require all legal
   replies. The engine searches all evasions in check (`generateMoves(false)`), but `quiescence()` still takes the
   static evaluation as a lower bound at a node in check (`search.mjs`, the `inCheck` branch), which is a deviation
   from the text. The main search never enters quiescence while in check (it extends instead), so the case arises
   only for checks given inside quiescence. Whether removing the bound changes strength is untested.
4. **Autonomy (doc 47 §3.4, ecosystem module 41).** External engines and imported games are not a source of
   learning guidance. Stockfish is used in this repository only as a measuring scale (`bench/anchor.py`) and a
   filter for openings, never inside `src/`; `evolve.mjs` is tested to import only engine modules.
5. **Belnap layer and Ω (SUBIT-∞ §1.4/§7, SPEC §7–8, CPU paper §6.3).** Independent evidence is combined with ⊕; a
   conflict is B and calls for more search, not for discarding one source. This existed in the v1.9 line and
   was lost in the v3.0.0 rewrite. Restored in `belnap.mjs` (see `SCMF_MAPPING.md`).
6. **The theory documents sampled are frameworks, not formulas.** The ones read specify objects, statuses,
   invariants and test names; they give no numeric evaluation weights that could be imported. This is what the
   sampled documents show; the 40-odd unread bodies might contain exceptions.

## Update 2026-11-21: all 55 documents of `docs` read

All files under `docs/theory` (01–47), `docs/papers`, `docs/spec`, `DECISIONS.md` and `USER-MANUAL.md` were read in full by
sub-agents (each file in chunks, no grep-only passes); the per-document digests, with section references, are in
`docs/spec/digests/`. subit-subit (37 MB) was not read beyond the parts listed above.

Result across the documents:
- **No numeric constants for evaluation, ordering, pruning, extensions or time.** The documents specify objects, statuses,
  invariants, tests and constraints. Where a formula appears (`Priority`, `Budget`, `VoC`, `RP`) its function is left
  undefined and marked for calibration. Every number in `budget.mjs` is the engine's own choice.
- **Constraints repeated in many documents:** heuristics may reorder moves or extend effort but must not remove legal moves
  (doc 12 §10.7, 16 §14.6, 18, 22, 31, 36 §4.1, 46); uncertainty never lowers the score, it triggers more search
  (17, 37 §21, 39 §11); an incomplete iteration never replaces the last completed one (45 §15.2, 43 §16.2); TT keys must
  carry castling, en passant and history (12, 33, 43, 44, 45); no stand-pat in check inside quiescence (12 §10.5,
  16 §14.5 FV-020, 27 §24, 31, 38 §15).
- **Tension with the engine:** futility, reverse futility, null move and LMR remove moves from the search. Documents 12, 38
  and 46 allow this only as a switchable, ablated and reported approximation (SELECTIVELY_SEARCHED); the engine has the
  switches and the measurements, but not the per-result reporting.
- **Gaps in `budget.mjs` against doc 40:** no protected tactical reserve (§9.1), no coverage of critical replies in the stop
  rule (§11), no check that `T_move ≤ T_remaining − T_reserve` (§19).
- **Document 14 on `evolve.mjs`:** four disjoint position sets (train, development, final validation, regression) are
  required (§10.2); `evolve.mjs` uses screening, regression and confirmation on disjoint seeds, but that mapping to four
  sets has not been checked. Doc 14 gives no acceptance statistic, so z ≥ 1.64 is the engine's own choice.

Measured: no stand-pat in check inside quiescence (option `qCheckNoStandPat`, config `qcheck`). The code previously used the
static value as a lower bound there; the documents forbid it. Match against the base, 100 ms per move, 60 games with
paired openings (V_val.epd): base scores 53.3% ± 12.7 (32–0–28), time per move equal (A/B 0.999), no distinguishable
difference. The option stays off by default; the deviation is recorded here and is correct per the documents but not
measurably useful at this sample size.

## Documents that no longer match the code

- `SUBIT-CHESS-SPEC.md` v1.0 and the CPU paper §6.2 describe the v1.9/v2.2 engine: 48 cells, per-cell ρ_s, teacher
  telemetry on 6548 FENs, frozen policy. ADR 0013 removed all of this in v3.0.0. The CPU paper also notes its own
  64-versus-48 cell inconsistency.
- `docs/ROADMAP.md` stops at v3.0.8 and lists gates (1, 2, 3, 5, 6, 7) whose status has moved since: adaptive
  budget, RFP, eval cache, an external anchor and a controlled-evolution protocol now exist.

## Not implemented, from the sources read

- Six-type trajectory classification FIXED / PERIODIC / MIN_ZERO / MIN_POS / NONMIN_ZERO / NONMIN_POS (SUBIT-∞
  v6.13, CPU paper §6.5). Only the four-class proxy STABLE / METASTABLE / CYCLIC / CHAOTIC is implemented.
- The semantic ultrametric d_Ω (SPEC §11; SPEC §15 itself says "not implemented").
- Temporal vector Θ and temporal move ordering (doc 26 §26, §34).
- Strategic phase regimes DEVELOPMENT … TERMINAL with hysteresis (doc 25 §3, §10) and the opponent-response
  model (doc 38). Whether `plans.mjs` / `meta.mjs` cover part of this was not re-checked against these two documents.

## Next reading, in order of expected value

1. Docs 36, 37, 39, 45 (decision, uncertainty, execution): the uncertainty driver steering verification (ROADMAP Gate 7).
2. Doc 42 (incremental structural update): the equivalence IncrementalBuild ≡ FullBuild, relevant to the throughput work.
3. Docs 24, 25, 38 bodies, for anything that translates into ordering or pruning that can be measured by play.

## Update 2026-11-23: documents 48–83 and the articles on main read

Read in full by sub-agents (digests in `docs/spec/digests/theory_48-99_n0…n18.md`): theory documents 48–80 and 82–83 under `docs/theory/48-80`, the articles under `docs/theory`, and the files at 81+ that exist on main. Document 81 is byte-identical to 80 (checked with `cmp`), so the 81–99 folder adds nothing at that position. Documents numbered 84–99 do not exist in the tree I have; the changelog's "81-99+" refers to the folder name.

Result, consistent with the first 55 documents:
- **No numeric constants** for evaluation, ordering, pruning, extensions or time in any of them. They are conceptual (information theory, complexity, learning, proof-carrying engine, explainability, robustness protocols ROB-01..10). Nothing can be imported as a weight.
- **Constraints repeated:** move generation returns all and only legal moves; a terminal result outranks any heuristic; the TT key must include castling, side to move, en passant and repetition context (doc 78 RQ-01 admits the minimal key set is undefined); an interrupted search must not return an invalid move; no structural module may prune legal moves without a correctness proof; external engines and imported game histories are not sources.
- **Gaps:** quiescence and in-check stand-pat are not mentioned in 77–79 and article 05; doc 77 names the 75-move rule as automatic and the 50-move rule as a claim but does not mention fivefold repetition.
- **Hypotheses measurable by play (no values given):** extra search or time when the best move flips between iterations or the top two scores are close (docs 77 §7.5, 79 §4.4, 80 §9) — the adaptive budget in this branch already does the first part and measured +73 Elo [+28; +121] over 192 games against v3.0.12 without it; depth allocation by position class (article 05 §7.2, §9.1, §11.3); ablation of each eval feature (done for the fast-tier terms: +97 Elo for the set, see CHANGELOG).
- **Contradictions are notational:** state tuple S=(B,p,c,e,h) versus S=(B,C,H,T) in article 05; the number of reflection levels and stages differ between documents.

The "Not read" list in the Coverage section above is now obsolete for `docs/theory`; subit-subit beyond the parts named there is still unread.
