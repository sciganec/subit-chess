import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const args = [
  'bench/uci_match.mjs',
  'C:\\Users\\sciga\\AppData\\Local\\Temp\\opencode\\stockfish\\stockfish\\stockfish-windows-x86-64-universal.exe',
  '10','200','2200','200',
  JSON.stringify([["LMR.MaxReduction","1"],["LMR.ExtraReduction","0"]])
];
const p = spawn(process.execPath, args, { stdio:'inherit', cwd: process.cwd() });
p.on('close', c=>process.exit(c));
