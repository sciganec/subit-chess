#!/usr/bin/env python3
"""Average centipawn loss against Stockfish used as a RULER (never as a teacher).

  python3 bench/acpl.py A.json [B.json] [--depth 12]

For each position of the JSON (from bench/acpl_moves.mjs) Stockfish gives the value of its best move and the value of
the engine's move; loss = best - played (centipawns, mover's view, mate clipped to +-1000). Prints ACPL, the share of
blunders (loss >= 200) and, for two files, the paired difference with a 95% interval.
"""
import sys, json, math, os
import chess, chess.engine
SF = os.environ.get("STOCKFISH", "/usr/games/stockfish")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
depth = int(sys.argv[sys.argv.index("--depth") + 1]) if "--depth" in sys.argv else 12
if "--depth" in sys.argv: args.remove(str(depth))
sf = chess.engine.SimpleEngine.popen_uci(SF)
sf.configure({"Hash": 128})
cache = {}
def val(board):  # mover's view
    k = board.fen()
    if k not in cache:
        cache[k] = sf.analyse(board, chess.engine.Limit(depth=depth))["score"].relative.score(mate_score=1000)
    return max(-1000, min(1000, cache[k]))
def losses(path):
    out = []
    for r in json.load(open(path)):
        b = chess.Board(r["fen"]); best = val(b)
        b.push(chess.Move.from_uci(r["move"]))
        played = -val(b) if not b.is_game_over() else (0 if not b.is_checkmate() else 1000)
        out.append(max(0, best - played))
    return out
L = [losses(p) for p in args]
for p, l in zip(args, L):
    n = len(l); m = sum(l)/n; sd = math.sqrt(sum((x-m)**2 for x in l)/(n-1))
    print(f"{os.path.basename(p)}: n={n} ACPL={m:.1f} ±{1.96*sd/math.sqrt(n):.1f}  blunders(>=200)={sum(x>=200 for x in l)/n*100:.1f}%  zero-loss={sum(x<=10 for x in l)/n*100:.0f}%")
if len(L) == 2 and len(L[0]) == len(L[1]):
    d = [a-b for a, b in zip(*L)]; n = len(d); m = sum(d)/n; sd = math.sqrt(sum((x-m)**2 for x in d)/(n-1))
    print(f"paired A-B ACPL: {m:+.1f} ±{1.96*sd/math.sqrt(n):.1f}  (negative = A loses less)")
sf.quit()
