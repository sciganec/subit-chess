'use strict';
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for (const line of rl) {
  if (line === 'uci') {
    process.stdout.write('id name SUBIT Fake UCI\nuciok\n');
  } else if (line === 'isready') {
    process.stdout.write('readyok\n');
  } else if (line.startsWith('go ')) {
    process.stdout.write('info depth 8 seldepth 12 multipv 1 score cp 25 nodes 1200 nps 60000 time 20 pv e2e4 e7e5 g1f3\n');
    process.stdout.write('info depth 8 seldepth 11 multipv 2 score cp 12 nodes 1200 nps 60000 time 20 pv d2d4 d7d5 c2c4\n');
    process.stdout.write('bestmove e2e4 ponder e7e5\n');
  } else if (line === 'quit') {
    process.exit(0);
  }
}
