import { Position } from '../src/engine/core.mjs';
import { Engine } from '../src/engine/index.mjs';
import { Evaluation } from '../src/engine/evaluate.mjs';

function hdr(title) { console.log(`\n=== ${title} ===`); }

function nmpOnOff() {
  hdr('AUD-311-08 NMP on/off verification (smoke corpus)');
  const cases = [
    { name: 'zugzwang pawn endgame', fen: '8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1', depth: 5 },
    { name: 'KP vs K zugzwang-prone', fen: '8/8/8/8/8/1k6/7P/7K w - - 0 1', depth: 6 },
    { name: 'tactical opening', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', depth: 5 },
    { name: 'middlegame', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', depth: 4 },
  ];
  let disagreements = 0;
  for (const c of cases) {
    const a = new Engine(); a.setFEN(c.fen); a.searcher.useNull = true;
    const on = a.search({ depth: c.depth, timeMs: 3000 });
    const b = new Engine(); b.setFEN(c.fen); b.searcher.useNull = false;
    const off = b.search({ depth: c.depth, timeMs: 3000 });
    const sameMove = on.move === off.move;
    const dScore = Math.abs((on.score || 0) - (off.score || 0));
    if (!sameMove || dScore > 50) disagreements++;
    console.log(`${c.name}: on=${on.move}@${on.score} d${on.depth} n=${on.nodes} off=${off.move}@${off.score} d${off.depth} n=${off.nodes} sameMove=${sameMove} dScore=${dScore}`);
  }
  console.log(`disagreements(>50cp or move): ${disagreements}/${cases.length}`);
  return disagreements;
}

function qsearchTactical() {
  hdr('AUD-311-10 qsearch/tactical smoke corpus');
  const cases = [
    { name: 'capture sequence', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', depth: 4 },
    { name: 'promotion pressure', fen: '8/P7/7k/8/8/8/6K1/8 w - - 0 1', depth: 5 },
    { name: 'checking sequence', fen: '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1', depth: 5 },
    { name: 'quiet check horizon A1', fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', depth: 4 },
    { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', depth: 4 },
  ];
  let bad = 0;
  for (const c of cases) {
    const e = new Engine(); e.setFEN(c.fen);
    const r = e.search({ depth: c.depth, timeMs: 3000 });
    const ok = r && Number.isFinite(r.score) && r.move !== 0;
    if (!ok) bad++;
    console.log(`${c.name}: ok=${ok} move=${r.move} score=${r.score} d=${r.depth} n=${r.nodes} reason=${r.reason || ''}`);
  }
  console.log(`bad: ${bad}/${cases.length}`);
  return bad;
}

function evalScale() {
  hdr('AUD-311-17 eval scale report');
  const fens = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/8/8/8/8/5k2/5p2/5K2 w - - 0 1',
    '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  ];
  const modes = ['fast', 'structural', 'hybrid'];
  for (const mode of modes) {
    const ev = new Evaluation(undefined, { mode });
    const vals = [];
    for (const fen of fens) {
      const p = Position.fromFEN(fen);
      const s = ev.evaluate(p, 0);
      vals.push(s);
      if (!Number.isFinite(s)) console.log(`NONFINITE ${mode} ${fen}`);
    }
    const abs = vals.map(Math.abs);
    console.log(`${mode}: min=${Math.min(...vals).toFixed(2)} max=${Math.max(...vals).toFixed(2)} mean=${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)} absMax=${Math.max(...abs).toFixed(2)}`);
  }
}

const d = nmpOnOff();
const b = qsearchTactical();
evalScale();
if (b > 0) process.exitCode = 1;
console.log(`\nAUDIT311_VERIFY: badTactical=${b} nmpDisagreements=${d}`);
