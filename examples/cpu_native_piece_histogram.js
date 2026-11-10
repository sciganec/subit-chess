'use strict';

/**
 * CPU-native piece histogram for the packed SUBIT-CHESS BOARD ABI.
 * Histogram memory [histogramAddress .. histogramAddress+14] counts each
 * exact 4-bit piece code: 0 empty, 1..6 white P/N/B/R/Q/K, 9..14 black.
 * No JavaScript board traversal occurs at execution time.
 */
function buildNativePieceHistogramProgram(CPU, options = {}) {
  if (!CPU || typeof CPU.encode !== 'function' || typeof CPU.encodeExtended !== 'function' || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const start = options.start ?? 0x0800;
  const boardAddress = options.boardAddress ?? 0x0000;
  const histogramAddress = options.histogramAddress ?? 0x0300;
  if (!Number.isInteger(start) || start < 0 || start > 0xFFFF) throw new RangeError('invalid program start');
  if (!Number.isInteger(boardAddress) || boardAddress < 0 || boardAddress + 16 > 65536) throw new RangeError('invalid board address');
  if (!Number.isInteger(histogramAddress) || histogramAddress < 0 || histogramAddress + 15 > 65536) throw new RangeError('invalid histogram address');
  const O = CPU.OPCODE, M = CPU.MOP, X = CPU.XOP;
  const words = [];
  const mem = (op, rd=0, ra=0, rb=0, imm=0) => words.push(CPU.MEM_PREFIX, CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext = (op, rd=0, ra=0, rb=0, imm=0) => words.push(CPU.EXT_PREFIX, CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  // Clear all 15 defined piece-code bins, making repeated runs deterministic.
  for (let code=0; code<=14; code++) {
    words.push(CPU.encode(O.LOADI,2), histogramAddress+code);
    words.push(CPU.encode(O.LOADI,3), 0);
    mem(M.USTORE,0,2,3);
  }
  words.push(CPU.encode(O.LOADI,1), histogramAddress); // persistent histogram base
  // The board is packed four squares per word, high nibble first.
  // Reload each word for each nibble so the four-register ISA needs no hidden temp.
  for (let square=0; square<64; square++) {
    const wordIndex=square>>>2, nibble=square&3;
    words.push(CPU.encode(O.LOADI,2), boardAddress+wordIndex);
    mem(M.ULOAD,0,2);
    mem(M.UEXTRACT4,0,0,0,nibble);
    ext(X.UADD,2,1,0);             // histogramAddress + pieceCode
    mem(M.ULOAD,3,2);              // current bin
    ext(X.UADDI,3,3,0,1);          // increment
    mem(M.USTORE,0,2,3);           // commit bin
  }
  // Emit bins 0..14 in piece-code order for a compact, deterministic result.
  for (let code=0; code<=14; code++) {
    words.push(CPU.encode(O.LOADI,2), histogramAddress+code);
    mem(M.ULOAD,3,2);
    mem(M.UEMIT,0,3);
  }
  words.push(CPU.encode(O.HALT));
  return Object.freeze({start,end:start+words.length,words,squareCount:64,bins:15,histogramAddress});
}

if (require.main === module) {
  const CPU=require('../src/cpu/subit_cpu.js');
  const cpu=new CPU();
  const codes=[4,2,3,5,6,3,2,4,1,1,1,1,1,1,1,1,
    12,10,11,13,14,11,10,12,9,9,9,9,9,9,9,9];
  for(let i=0;i<64;i++){
    const code=codes[i]||0, w=i>>>2, shift=(3-(i&3))*4;
    cpu.memory[w]=(cpu.memory[w]||0)|(code<<shift);
  }
  const p=buildNativePieceHistogramProgram(CPU);
  cpu.loadProgram(p.words,p.start);
  const result=cpu.run({maxSteps:2000});
  console.log(JSON.stringify({status:result.status,squares:64,histogram:cpu.output}));
}

module.exports={buildNativePieceHistogramProgram};
