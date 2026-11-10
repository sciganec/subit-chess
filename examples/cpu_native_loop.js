'use strict';
const CPU=require('../src/cpu/subit_cpu.js');
const O=CPU.OPCODE,X=CPU.XOP;

// CPU-native loop: URF[0] increments until it equals URF[1] (3).
const program=[
  CPU.encode(O.LOADI,0),0,
  CPU.encode(O.LOADI,1),3,
  ...CPU.encodeExtended(X.UADDI,0,0,0,1),
  ...CPU.encodeExtended(X.UCMP,0,0,1),
  ...CPU.encodeExtended(X.XBR,1,0,0,-6),
  CPU.encode(O.HALT)
];
const cpu=new CPU();
cpu.loadProgram(program,0x0400);
const result=cpu.run({maxSteps:100});
if(result.status!=='HALTED'||cpu.URF[0]!==3) {
  throw new Error('CPU-native loop failed: '+JSON.stringify(result));
}
console.log(JSON.stringify({status:result.status,steps:result.steps,counter:cpu.URF[0],flags:cpu.FLAGS}));
