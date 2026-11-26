#!/usr/bin/env python3
"""Head-to-head of two SUBIT UCI builds at equal movetime (A/B of a code change that is not a config switch).
  python3 bench/uci_vs_uci.py --a /path/new/bench/uci.mjs --b /path/old/bench/uci.mjs --pairs 20 --movetime 100 --workers 2
Openings: seeded random 6-ply lines, each played with both colours. Prints score and Elo of A over B with 95% CI."""
import argparse, json, math, random, os
from concurrent.futures import ProcessPoolExecutor
import chess, chess.engine

def elo(p):
    p = min(0.995, max(0.005, p)); return -400 * math.log10(1 / p - 1)

def play(job):
    fen, a_white, a_path, b_path, mt = job
    a = chess.engine.SimpleEngine.popen_uci(["node", a_path], timeout=60)
    b = chess.engine.SimpleEngine.popen_uci(["node", b_path], timeout=60)
    bd = chess.Board(fen); lim = chess.engine.Limit(time=mt / 1000.0); n = 0
    try:
        while not bd.is_game_over(claim_draw=True) and n < 240:
            e = a if (bd.turn == chess.WHITE) == a_white else b
            r = e.play(bd, lim)
            if r.move is None: break
            bd.push(r.move); n += 1
        res = bd.result(claim_draw=True) if bd.is_game_over(claim_draw=True) else "*"
    finally:
        a.quit(); b.quit()
    w = {"1-0": 1.0, "0-1": 0.0}.get(res, 0.5)
    return w if a_white else 1 - w

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True); ap.add_argument("--b", required=True)
    ap.add_argument("--pairs", type=int, default=20); ap.add_argument("--movetime", type=int, default=100)
    ap.add_argument("--workers", type=int, default=2); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="")
    x = ap.parse_args(); rng = random.Random(x.seed); fens = []
    while len(fens) < x.pairs:
        b = chess.Board()
        for _ in range(6):
            m = list(b.legal_moves)
            if not m: break
            b.push(rng.choice(m))
        if not b.is_game_over(): fens.append(b.fen())
    jobs = [(f, w, x.a, x.b, x.movetime) for f in fens for w in (True, False)]
    with ProcessPoolExecutor(x.workers) as ex: sc = list(ex.map(play, jobs))
    n = len(sc); m = sum(sc) / n; v = sum((s - m) ** 2 for s in sc) / max(1, n - 1); se = math.sqrt(v / n)
    w, d, l = sc.count(1.0), sc.count(0.5), sc.count(0.0)
    print(f"A vs B: {n} games W/D/L={w}/{d}/{l} score={m*100:.1f}% Elo {elo(m):+.0f} [{elo(m-1.96*se):+.0f},{elo(m+1.96*se):+.0f}] z={(m-.5)/se if se else 0:.2f}")
    if x.out: json.dump(dict(args=vars(x), scores=sc), open(x.out, "w"))
main()
