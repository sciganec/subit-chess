import { Engine } from '../src/engine/index.mjs';
import { Position, moveToUci } from '../src/engine/core.mjs';

const CASES = [
  { name:'mate1 scholar', fen:'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', expect:'h5f7', depth:4 },
  { name:'mate1 backrank', fen:'6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', expect:'a1a8', depth:4 },
  { name:'win queen', fen:'4k3/8/8/8/8/8/4q3/4K2R w - - 0 1', expect:'h1e1', depth:4 },
  { name:'capture free rook', fen:'4k3/8/8/3r4/8/8/8/4K2Q w - - 0 1', expect:'h1d5', depth:4 },
  { name:'avoid mate in 1', fen:'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', expect:null, depth:1 },
  { name:'simple fork knight', fen:'4k3/8/8/3N4/8/8/8/4K3 w - - 0 1', expect:null, depth:4 },
  { name:'promotion', fen:'8/P6k/8/8/8/8/8/4K3 w - - 0 1', expect:'a7a8q', depth:6 },
];
for (const c of CASES) {
  const e = new Engine();
  try {
    e.setFEN(c.fen);
    const r = e.search({ depth: c.depth, timeMs: 3000 });
    const uci = r.move ? (function(){const m=r.move; const from=m&127; const to=(m>>7)&127; const p=(m>>14)&7; const promo=p?(' pnbrqk'[p]):''; return String.fromCharCode(97+(from&7))+(8-(from>>4))+String.fromCharCode(97+(to&7))+(8-(to>>4))+promo;})() : 'none';
    const ok = c.expect ? uci===c.expect : true;
    console.log(`${ok?'ok':'MISS'} ${c.name}: got=${uci} expect=${c.expect||'-'} score=${r.score} d=${r.depth} n=${r.nodes}`);
  } catch (err) {
    console.log(`ERR ${c.name}: ${err.message}`);
  }
}
