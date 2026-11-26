#!/usr/bin/env python3
"""Anchored strength measurement (ROADMAP Gate 5): SUBIT v3 vs Stockfish with UCI_Elo.

  python3 bench/anchor.py --levels 1320,1500,1700 --pairs 10 --movetime 100 --workers 2

Both sides get the same wall-clock movetime. Openings are random 6-ply lines from a
seeded RNG, filtered to |eval| <= 100 cp by Stockfish, each played with both colours.
Result: per-level score and an Elo estimate  Elo(SUBIT) = level + elo(score).

CAVEAT: Stockfish's UCI_Elo is calibrated at ~60s+0.6s, not at 100 ms/move, so the
absolute Elo is only indicative; use it to compare SUBIT versions, not to publish a rating.
"""
import argparse, json, math, random, sys, time, os
from concurrent.futures import ProcessPoolExecutor
import chess, chess.engine

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF = os.environ.get("STOCKFISH", "/usr/games/stockfish")
UCI_NODE = ["node", os.path.join(ROOT, "bench", "uci.mjs")]


def elo(p):
    p = min(0.995, max(0.005, p))
    return -400 * math.log10(1 / p - 1)


def make_openings(n, seed, plies=6):
    rng = random.Random(seed)
    sf = chess.engine.SimpleEngine.popen_uci(SF)
    out = []
    while len(out) < n:
        b = chess.Board()
        for _ in range(plies):
            mv = list(b.legal_moves)
            if not mv:
                break
            b.push(rng.choice(mv))
        if b.is_game_over():
            continue
        cp = sf.analyse(b, chess.engine.Limit(depth=8))["score"].white().score(mate_score=10000)
        if abs(cp) <= 100:
            out.append(b.fen())
    sf.quit()
    return out


def play(job):
    fen, subit_white, level, movetime, max_plies, depth, config, clock = job
    sub = chess.engine.SimpleEngine.popen_uci(UCI_NODE, timeout=60)
    sf = chess.engine.SimpleEngine.popen_uci(SF, timeout=60)
    sf.configure({"Threads": 1, "Hash": 16, "UCI_LimitStrength": True, "UCI_Elo": level})
    sub.configure({"Config": config})
    if depth:
        sub.configure({"Depth": depth})
    b = chess.Board(fen)
    if clock:   # clock play (wtime/btime): nominal = clock/30 = movetime, so SUBIT's adaptive budget is active
        c = movetime * 30 / 1000.0
        lim = chess.engine.Limit(white_clock=c, black_clock=c)
    else:
        lim = chess.engine.Limit(time=movetime / 1000.0)
    plies = 0
    try:
        while not b.is_game_over(claim_draw=True) and plies < max_plies:
            eng = sub if (b.turn == chess.WHITE) == subit_white else sf
            r = eng.play(b, lim)
            if r.move is None:
                break
            b.push(r.move)
            plies += 1
        if b.is_game_over(claim_draw=True):
            res = b.result(claim_draw=True)
            w = {"1-0": 1.0, "0-1": 0.0}.get(res, 0.5)
            reason = "game"
        else:
            w, reason = 0.5, "maxplies"
    finally:
        sub.quit(); sf.quit()
    return (level, w if subit_white else 1 - w, plies, reason, fen, subit_white, config)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", default="1320,1500,1700")
    ap.add_argument("--pairs", type=int, default=10)
    ap.add_argument("--movetime", type=int, default=100)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--max-plies", type=int, default=220)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--depth", type=int, default=0, help="fixed SUBIT depth (0 = movetime only)")
    ap.add_argument("--configs", default="base", help="comma list: base,plain,noctx,nostruct,noplans,nopruning")
    ap.add_argument("--clock", action="store_true", help="give clocks instead of movetime (enables adaptive time)")
    ap.add_argument("--out", default="results/anchor.json")
    a = ap.parse_args()
    levels = [int(x) for x in a.levels.split(",")]
    fens = make_openings(a.pairs, a.seed)
    cfgs = a.configs.split(",")
    jobs = [(f, sw, L, a.movetime, a.max_plies, a.depth, c, a.clock) for c in cfgs for L in levels for f in fens for sw in (True, False)]
    t0 = time.time(); rows = []
    with ProcessPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(play, jobs), 1):
            rows.append(r)
            if i % 10 == 0 or i == len(jobs):
                print(f"[anchor] {i}/{len(jobs)} games  {time.time()-t0:.0f}s", flush=True)
    summary = {}
    for c in cfgs:
      for L in levels:
        rows_c = [r for r in rows if r[0] == L and r[6] == c]
        sc = [r[1] for r in rows_c]
        n = len(sc); m = sum(sc) / n
        v = sum((x - m) ** 2 for x in sc) / max(1, n - 1); se = math.sqrt(v / n)
        mp = sum(r[2] for r in rows_c) / n
        cap = sum(1 for r in rows_c if r[3] == "maxplies")
        summary[f"{c}@{L}"] = dict(n=n, score=m, w=sc.count(1.0), d=sc.count(0.5), l=sc.count(0.0),
                          elo=L + elo(m), lo=L + elo(m - 1.96 * se), hi=L + elo(m + 1.96 * se),
                          mean_plies=mp, capped=cap)
        s = summary[f"{c}@{L}"]
        print(f"{c} vs SF@{L}: {s['n']} games W/D/L={s['w']}/{s['d']}/{s['l']}  score={m*100:.1f}%  "
              f"=> SUBIT ~{s['elo']:.0f} [{s['lo']:.0f},{s['hi']:.0f}]  mean_plies={mp:.0f} capped={cap}")
    os.makedirs(os.path.dirname(os.path.join(ROOT, a.out)), exist_ok=True)
    json.dump(dict(args=vars(a), summary=summary, games=rows), open(os.path.join(ROOT, a.out), "w"), indent=1)


if __name__ == "__main__":
    main()
