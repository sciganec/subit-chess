'use strict';
const CPU=require('../src/cpu/subit_cpu.js');
const O=CPU.OPCODE,X=CPU.XOP,M=CPU.MOP;
const words=[
  CPU.encode(O.LOADI,0),0,       // URF0 = board-word pointer
  CPU.encode(O.LOADI,1),0,       // URF1 = non-zero word count
  CPU.encode(O.LOADI,2),16,      // URF2 = words remaining
  CPU.MEM_PREFIX,CPU.encodeExtended(M.ULOAD,3,0,0)[1], // URF3 = memory[URF0]
  ...CPU.encodeExtended(X.UADDI,3,3,0,0),              // set Z if loaded word is zero
  ...CPU.encodeExtended(X.XBR,0,0,0,2),                // if zero, skip count increment
  ...CPU.encodeExtended(X.UADDI,1,1,0,1),              // count++
  ...CPU.encodeExtended(X.UADDI,0,0,0,1),              // pointer++
  ...CPU.encodeExtended(X.UADDI,2,2,0,-1),             // remaining--, updates Z
  ...CPU.encodeExtended(X.XBR,1,0,0,-14),              // loop while remaining != 0
  CPU.encode(O.HALT)
];
const cpu=new CPU();
const board=[0x4235,0x0000,0x6789,0x0000,0x1234,0x0000,0xABCD,0x0000,
  0x1111,0x0000,0x2222,0x0000,0x3333,0x0000,0x4444,0x0000];
board.forEach((v,i)=>cpu.memory[i]=v);
cpu.loadProgram(words,0x0500);
const result=cpu.run({maxSteps:200});
const nonZeroWords=cpu.URF[1];
if(result.status!=='HALTED'||nonZeroWords!==8) throw new Error('board scan failed: '+JSON.stringify({result,nonZeroWords}));
console.log(JSON.stringify({status:result.status,steps:result.steps,scanned:16,nonZeroWords}));
