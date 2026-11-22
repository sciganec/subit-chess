#!/usr/bin/env node
/** Paired UCI match between two local engine versions. */
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { Position, moveToUci } from '../src/engine/core.mjs';

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1];
    i++;
  }
  return out;
}

function startEngine(name, entry) {
  const child = spawn(process.execPath, [path.resolve(entry), 'uci'], {
    stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true
  });
  const lines = readline.createInterface({ input: child.stdout });
  const waiters = [];
  lines.on('line', (line) => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (!waiters[i].test(line)) continue;
      const [w] = waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(line);
    }
  });
  const send = (line) => child.stdin.write(`${line}\n`);
  const waitFor = (test, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const waiter = { test, resolve, timer: null };
    waiter.timer = setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) waiters.splice(i, 1);
      reject(new Error(`${name} timed out waiting for UCI response`));
    }, timeoutMs);
    waiters.push(waiter);
  });
  return { name, child, send, waitFor };
}

async function ready(engine) {
  engine.send('isready');
  await engine.waitFor((line) => line === 'readyok');
}

async function init(engine) {
  engine.send('uci');
  await engine.waitFor((line) => line === 'uciok');
  await ready(engine);
}

function readOpenings(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const fen = line.split(/\s+id\s+/)[0].replace(/;$/, '').trim();
      Position.fromFEN(fen);
      return fen;
    });
}

async function oneGame(a, b, startFen, aWhite, depth, maxPlies = 240) {
  const pos = Position.fromFEN(startFen);
  pos.pushRep();
  const moves = [];
  for (let ply = 0; ply < maxPlies; ply++) {
    const engine = pos.turn === 0 ? (aWhite ? a : b) : (aWhite ? b : a);
    engine.send(`position fen ${startFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
    engine.send(`go depth ${depth}`);
    const line = await engine.waitFor((text) => text.startsWith('bestmove '), 120000);
    const uci = line.split(/\s+/)[1];
    if (!uci || uci === '0000' || uci === '(none)') {
      const state = pos.status();
      if (!state?.over) throw new Error(`unexpected no-move from ${engine.name} at ply ${ply}`);
      return { result: state.result, reason: state.reason || 'terminal', plies: moves.length };
    }
    const move = pos.legalMoves().find((candidate) => moveToUci(candidate) === uci);
    if (move === undefined) throw new Error(`illegal ${uci} from ${engine.name} at ply ${ply}`);
    const undo = pos.makeMove(move);
    pos.pushRep();
    moves.push(uci);
    const state = pos.status();
    if (state?.over) return { result: state.result, reason: state.reason || 'terminal', plies: moves.length };
    if (ply + 1 === maxPlies) return { result: 'draw', reason: 'maxplies', plies: moves.length };
    void undo;
  }
  return { result: 'draw', reason: 'maxplies', plies: moves.length };
}

function score(result, aWhite) {
  if (result === 'draw') return 0.5;
  return (result === 'white') === aWhite ? 1 : 0;
}

function summarize(rows) {
  const scores = rows.map((row) => row.score);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.length > 1
    ? scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (scores.length - 1)
    : 0;
  const se = Math.sqrt(variance / scores.length);
  const hasOutcomeVariance = scores.some((value) => value !== scores[0]);
  const lo = Math.max(0.001, mean - 1.96 * se);
  const hi = Math.min(0.999, mean + 1.96 * se);
  const elo = (p) => 400 * Math.log10(p / (1 - p));
  return {
    games: rows.length,
    wins: rows.filter((row) => row.score === 1).length,
    draws: rows.filter((row) => row.score === 0.5).length,
    losses: rows.filter((row) => row.score === 0).length,
    score: mean,
    scoreCi95: hasOutcomeVariance ? [mean - 1.96 * se, mean + 1.96 * se] : null,
    eloDifference: elo(Math.min(0.999, Math.max(0.001, mean))),
    eloCi95: hasOutcomeVariance ? [elo(lo), elo(hi)] : null,
    uncertainty: hasOutcomeVariance ? 'estimated from game-score variance' : 'not estimable: every game had the same score'
  };
}

async function main() {
  const opts = argsOf(process.argv.slice(2));
  const aEntry = opts.a;
  const bEntry = opts.b;
  if (!aEntry || !bEntry) throw new Error('usage: node bench/version_match.mjs --a <engine-index.mjs> --b <engine-index.mjs> [--games 100] [--depth 4] [--out results/file.json]');
  const games = Number(opts.games || 100);
  if (!Number.isInteger(games) || games < 2 || games % 2 !== 0) throw new Error('--games must be an even integer >= 2 to balance colours');
  const depth = Number(opts.depth || 4);
  const openingsPath = path.resolve(opts.openings || 'bench/fens/openings.epd');
  const openings = readOpenings(openingsPath);
  const a = startEngine('A', aEntry);
  const b = startEngine('B', bEntry);
  const rows = [];
  try {
    await Promise.all([init(a), init(b)]);
    for (let i = 0; i < games; i++) {
      await Promise.all([ready(a), ready(b)]);
      a.send('ucinewgame');
      b.send('ucinewgame');
      const pair = Math.floor(i / 2);
      const opening = openings[pair % openings.length];
      const aWhite = i % 2 === 0;
      const game = await oneGame(a, b, opening, aWhite, depth);
      const value = score(game.result, aWhite);
      rows.push({ game: i + 1, opening: pair % openings.length, aWhite, ...game, score: value });
      console.log(`game ${i + 1}/${games}: A=${aWhite ? 'W' : 'B'} ${game.result} ${game.reason}, ${game.plies} plies`);
    }
  } finally {
    for (const engine of [a, b]) {
      try { engine.send('quit'); } catch {}
      try { engine.child.kill(); } catch {}
    }
  }
  const report = {
    method: 'paired version match, alternating colours, curated EPD openings, fixed depth',
    engines: { a: path.resolve(aEntry), b: path.resolve(bEntry) },
    settings: { games, depth, maxPlies: 240, openings: openingsPath, openingCount: openings.length },
    summary: summarize(rows),
    rows
  };
  if (opts.out) {
    const out = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${out}`);
  }
  console.log(JSON.stringify(report.summary));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
