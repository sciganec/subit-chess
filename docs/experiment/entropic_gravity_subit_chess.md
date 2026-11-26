# Transposing Verlinde's Entropic Gravity into SUBIT-CHESS Evaluation on Belnap Logic for ELO Gain

## 1. What Verlinde Actually Proposes

In Verlinde's proposal, gravity is not a fundamental force, but an entropic force: a system is pulled toward states where entropy increases. Formally, this is written as:

F = T · (ΔS / Δx)

and the entropy change when a particle shifts is postulated as:

ΔS = 2π · k_B · (m · c / ħ) · Δx

where T is temperature, S is entropy, x is displacement, m is mass, c is the speed of light, ħ is the reduced Planck constant, and k_B is the Boltzmann constant.

Important qualification: this is a heuristic, not a generally accepted derivation. A 2026 paper titled "Gravity is not an entropic force" re-examines Verlinde's proposal through thermodynamic processes in a gravitational field and challenges the idea that gravity is fundamentally of entropic origin. For chess, we therefore take not physics as truth, but information geometry as analogy: force as entropy gradient.

Second qualification: the +44 ELO figure often mentioned with Stockfish 19 is the result of Stockfish 19 against Stockfish 18 with the new SFNNv16 architecture. It is not a measured gain for SUBIT-CHESS. Any SUBIT-CHESS gain still has to be proven by its own test.

## 2. Translation: Position as Holographic Screen

In Verlinde's picture, information lives on a screen, and gravity inside is its projection. In chess, we make this substitution:

- **Screen:** the current position, its boundary: pawn chain, king safety, control of key squares.
- **Bits on the screen:** the number of different reasonable continuations compatible with the position. The more different plans do not contradict the position, the more microstates it has.
- **Entropy of a position:** S = k_B · ln W, where W is the weighted number of continuations. This is not just the number of legal moves, but the number of moves that do not lose immediately and lead to different structures.
- **Mass / energy:** material plus activity. A heavy piece that goes nowhere is mass without entropy.
- **Temperature T:** tactical tension. Many captures, checks, hanging pieces, and pawn tensions mean high T. In a quiet position T is low, and the entropic term almost does not matter. In a sharp position T is high, and the entropy difference decides.

The entropic force in chess is then not a pull on pieces, but a pull of the position toward greater own flexibility and smaller opponent flexibility.

## 3. Where Belnap Logic Fits

Classical evaluation averages contradictions away. Belnap FOUR preserves them. For each predicate, for example "White has an attack", we have four values:

- **T:** there is evidence only for, for example an attack exists, and there is no counterplay.
- **F:** there is evidence only against.
- **B:** there is evidence both for and against, for example an attack exists, but there is also strong counterattack. This is not zero, it is contradiction that has to be calculated deeper.
- **N:** there is no evidence, for example depth was not enough, the position is closed and quiet.

This is the key to the transposition. In opposite-side castling, a classical evaluation of +0.30 is often an average of +1.2 for the attack and -0.6 for the counterattack. Belnap says: this is B, not an average. The engine has no right to prune such a branch as quiet, it has to extend it.

## 4. Concrete Evaluation Terms

Do not use one vague "entropy bonus". Use three measurable quantities that then enter the evaluation.

### 4.1 Mobility entropy

S_mob = - Σ p_i · ln p_i, where p_i is the weight of move i among reasonable moves. If all moves lead to one structure, entropy is low, even if there are many of them. If moves lead to different plans, entropy is high.

### 4.2 Entropy gradient of a move

ΔS = S_after - S_before for the side to move, minus the same quantity for the opponent. A move that opens the position, creates a passed pawn, or opens a file increases your entropy. A move that forces the opponent to answer in only one way decreases opponent entropy.

### 4.3 King screen entropy

The number of different pawn cover configurations and attacking piece configurations compatible with king safety. A king with only one escape square has low entropy, a king with several shelters has high entropy.

The full evaluation then looks like this:

Eval = Eval_material + Eval_NNUE + λ · T · (S_ours - S_opponent) + μ · ΔS_move

Here T is tension temperature, λ and μ are coefficients calibrated on games, not taken from physics. Without λ, the engine will love chaos for the sake of chaos. With correct calibration, it will love flexibility that survives counterplay.

## 5. How to Implement in SUBIT-CHESS

**In NNUE input:** add not only the position, but also entropy features: S_mob for both sides, tension T, ΔS for the last move, and Belnap flags for key predicates as two bits per predicate. The network then learns not only "what wins", but "where the evaluation is contradictory".

**In search:** order moves not only by history and captures, but also by ΔS. Moves with B value, where attack and counterattack are simultaneously true, get extension. Moves with N value, where information is missing, get continuation in quiet positions, not cut-off.

**In training:** add a second head of the network that predicts ΔS after a move. This regularizes the main evaluation: it is forced to preserve information about flexibility, not only about material.

## 6. Where ELO Gain Could Come From

Not from the fact that the universe is truly entropic. But from the fact that entropy features are orthogonal to material and to ordinary NNUE.

NNUE sees tactics and material well, and sees worse the difference between two materially equal positions, where in one you have three plans and a pawn break, and in the other one plan and blocked pieces. That is exactly where entropy gives a signal. Belnap adds a second effect: it does not let the engine average attack and counterattack into a calm +0.20 and move on, it forces it to calculate the contradiction to the end.

## 7. Honest Testing Protocol

Test with ablation, on the same time control, with an SPRT test on tens of thousands of games:

1. Baseline without entropic term.
2. Baseline plus entropic term.
3. Baseline plus entropic term plus Belnap.

If a gain exists, expect it in positions with equal material and high T, not in opening templates. Do not claim a gain from analogy alone.

## Sources

- E. Verlinde, On the Origin of Gravity and the Laws of Newton, arXiv:1001.0785. Core relations: F = T · (ΔS / Δx), ΔS = 2π · k_B · (m · c / ħ) · Δx.
- "Gravity is not an entropic force", Physics Letters B 873 (2026) 140140. Challenges Verlinde's proposal that gravity arises as an entropic force.
- Stockfish 19 release notes, stockfishchess.org. Stockfish 19 versus Stockfish 18: Elo gain up to 44 points, with SFNNv16 architecture.
