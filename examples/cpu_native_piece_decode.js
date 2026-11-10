'use strict';

/**
 * CPU-native decoder for the SUBIT-CHESS packed BOARD ABI.
 * Each 16-bit word stores four square codes, most-significant nibble first.
 * The CPU performs all reads, nibble extraction and emission; this module
 * only assembles the instruction stream.
 */
function buildNativePieceDecodeProgram(CPU, options = {}) {
  if (!CPU || typeof CPU.encode !== 'function' || typeof CPU.encodeExtended !== 'function' || !CPU.MOP || !CPU.MEM_PREFIX) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const start = options.start ?? 0x0600;
  const boardAddress = options.boardAddress ?? 0x0000;
  if (!Number.isInteger(start) || start < 0 || start > 0xFFFF) throw new RangeError('invalid program start');
  if (!Number.isInteger(boardAddress) || boardAddress < 0 || boardAddress + 16 > 65536) throw new RangeError('invalid board address');
  const O = CPU.OPCODE;
  const M = CPU.MOP;
  const words = [];
  const mem = (op, rd = 0, ra = 0, rb = 0, imm = 0) => {
    words.push(CPU.MEM_PREFIX, CPU.encodeExtended(op, rd, ra, rb, imm)[1]);
  };
  for (let w = 0; w < 16; w++) {
    words.push(CPU.encode(O.LOADI, 1), boardAddress + w);
    mem(M.ULOAD, 0, 1);
    for (let nibble = 0; nibble < 4; nibble++) {
      mem(M.UEXTRACT4, 2, 0, 0, nibble);
      mem(M.UEMIT, 0, 2);
    }
  }
  words.push(CPU.encode(O.HALT));
  return Object.freeze({ start, end: start + words.length, words, squareCount: 64, boardWords: 16 });
}

if (require.main === module) {
  const CPU = require('../src/cpu/subit_cpu.js');
  const cpu = new CPU();
  const board = [0x4235,0x0000,0x6789,0x0000,0x1234,0x0000,0xABCD,0x0000,
    0x1111,0x0000,0x2222,0x0000,0x3333,0x0000,0x4444,0x0000];
  board.forEach((value, index) => { cpu.memory[index] = value; });
  const program = buildNativePieceDecodeProgram(CPU);
  cpu.loadProgram(program.words, program.start);
  const result = cpu.run({ maxSteps: 500 });
  console.log(JSON.stringify({ result: result.status, squares: cpu.output.length, pieceCodes: cpu.output }));
}

module.exports = { buildNativePieceDecodeProgram };
