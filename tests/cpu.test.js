'use strict';
const assert = require('node:assert/strict');
const CPU = require('../src/cpu/subit_cpu');

const {FOUR,OPCODE:O,encode,decode,cell,fillCell,logic}=CPU;
function run(words, opts){ const c=new CPU(opts); c.loadProgram(words); return {c,result:c.run()}; }

// Encoding / decoding is a bijection over the documented fields.
for(let op=0;op<32;op++) for(let rd=0;rd<8;rd+=3) {
  const w=encode(op,rd,5,2,3), d=decode(w);
  assert.equal(d.op,op); assert.equal(d.rd,rd);
  assert.equal(d.ra,5); assert.equal(d.rb,2); assert.equal(d.aux,3);
}

// Belnap FOUR truth and knowledge operations, checked cell-by-cell.
for(let x=0;x<4;x++) {
  assert.equal(cell(logic.not(fillCell(x)),0), ((x&1)<<1)|((x&2)>>1));
  for(let y=0;y<4;y++) {
    const a=fillCell(x), b=fillCell(y);
    assert.equal(cell(logic.join(a,b),0),x|y);
    assert.equal(cell(logic.meet(a,b),0),x&y);
    const expectedAnd=(((x&2)&&(y&2))?2:0)|(((x&1)||(y&1))?1:0);
    const expectedOr=(((x&2)||(y&2))?2:0)|(((x&1)&&(y&1))?1:0);
    assert.equal(cell(logic.and(a,b),0),expectedAnd);
    assert.equal(cell(logic.or(a,b),0),expectedOr);
  }
}
assert.equal(fillCell(FOUR.N),0x0000);
assert.equal(fillCell(FOUR.F),0x5555);
assert.equal(fillCell(FOUR.T),0xAAAA);
assert.equal(fillCell(FOUR.B),0xFFFF);

// Arithmetic-free execution, immediate words, memory I/O, equality, output.
{
  const p=[
    encode(O.LOADI,0),0x1234,
    encode(O.SETAR),0x0100,
    encode(O.FILL,1,0,0,FOUR.T),
    encode(O.STORE,0,1),
    encode(O.LOAD,2),
    encode(O.EQ,3,1,2),
    encode(O.EMIT,0,3),
    encode(O.HALT)
  ];
  const {c,result}=run(p);
  assert.equal(result.status,'HALTED');
  assert.equal(c.URF[0],0x1234);
  assert.equal(c.memory[0x0100],0xAAAA);
  assert.equal(c.RF[2],0xAAAA);
  assert.equal(c.RF[3],0xAAAA);
  assert.deepEqual(c.output,[0xAAAA]);
  assert.equal(result.steps,8);
}

// Conditional branch tests existential matching across eight FOUR cells.
{
  const p=[
    encode(O.FILL,0,0,0,FOUR.B),
    encode(O.JB,0,0,0,0), 5,
    encode(O.FILL,1,0,0,FOUR.F), // skipped
    encode(O.HALT),
    encode(O.FILL,1,0,0,FOUR.T),
    encode(O.HALT)
  ];
  const {c,result}=run(p);
  assert.equal(result.status,'HALTED');
  assert.equal(c.RF[1],0xAAAA);
}

// POP underflow is an atomic trap and leaves the stack pointer unchanged.
{
  const c=new CPU();
  c.loadProgram([encode(O.POP,0)]);
  const r=c.step();
  assert.equal(r.status,'TRAP');
  assert.equal(c.clock,0);
  assert.equal(c.SP,0xFFFF);
  assert.equal(c.trap.code,'STACK_UNDERFLOW');
  assert.equal(c.journal.at(-1).status,'ABORTED');
}

// CALL/RET and PUSH/POP share a descending, transactional memory stack.
{
  const p=[
    encode(O.FILL,0,0,0,FOUR.B),
    encode(O.PUSH,0,0),
    encode(O.FILL,0,0,0,FOUR.F),
    encode(O.POP,1),
    encode(O.CALL),7,
    encode(O.HALT),
    encode(O.FILL,2,0,0,FOUR.T),
    encode(O.RET)
  ];
  const {c,result}=run(p);
  assert.equal(result.status,'HALTED');
  assert.equal(c.RF[1],0xFFFF);
  assert.equal(c.RF[2],0xAAAA);
  assert.equal(c.memory[0xFFFF],6);
  assert.equal(c.SP,0xFFFF);
  assert.equal(result.steps,8);
}

// A failed stack write rolls back both the memory cell and SP.
{
  const c=new CPU();
  c.SP=-1;
  c.memory[0xFFFF]=0xBEEF;
  c.loadProgram([encode(O.PUSH,0,0)]);
  c.SP=-1;
  const r=c.step();
  assert.equal(r.status,'TRAP');
  assert.equal(c.trap.code,'STACK_OVERFLOW');
  assert.equal(c.SP,-1);
  assert.equal(c.memory[0xFFFF],0xBEEF);
}

// An immediate instruction at the final address must not wrap and read address zero.
{
  const c=new CPU();
  c.memory[65535]=encode(O.LOADI,0);
  c.PC=65535;
  const r=c.step();
  assert.equal(r.status,'TRAP');
  assert.equal(c.trap.code,'MISSING_EXTENSION');
  assert.equal(c.trap.pc,65535);
}

// Explicit TRAP is recorded; no instruction is committed.
{
  const c=new CPU();
  c.loadProgram([encode(O.TRAP,0,0,0,3)]);
  const r=c.step();
  assert.equal(r.status,'TRAP');
  assert.equal(c.clock,0);
  assert.equal(c.trap.code,'TRAP_3');
}

// Extended integer page: U16 arithmetic, compare flags, and relative conditional branch.
{
  const p=[
    encode(O.LOADI,0),7,
    encode(O.LOADI,1),5,
    ...CPU.encodeExtended(CPU.XOP.UADD,2,0,1),
    ...CPU.encodeExtended(CPU.XOP.UCMP,0,2,2),
    ...CPU.encodeExtended(CPU.XOP.XBR,0,0,0,2),
    encode(O.LOADI,3),99,
    encode(O.HALT)
  ];
  const {c,result}=run(p);
  assert.equal(result.status,'HALTED');
  assert.equal(c.URF[2],12);
  assert.equal(c.URF[3],0);
  assert.ok(c.FLAGS&CPU.FLAG.Z);
  assert.equal(result.steps,6);
}

// Extended signed ALU operates on the 32-bit SRF bank.
{
  const c=new CPU();
  c.SRF[0]=-7;c.SRF[1]=3;
  c.loadProgram([...CPU.encodeExtended(CPU.XOP.SDIV,2,0,1),encode(O.HALT)]);
  const result=c.run();
  assert.equal(result.status,'HALTED');
  assert.equal(c.SRF[2],-2);
  assert.ok(c.FLAGS&CPU.FLAG.N);
}

// Division by zero aborts atomically and preserves destination register.
{
  const c=new CPU();
  c.URF[0]=42;c.URF[1]=0;c.URF[2]=0xBEEF;
  c.loadProgram([...CPU.encodeExtended(CPU.XOP.UDIV,2,0,1)]);
  const result=c.step();
  assert.equal(result.status,'TRAP');
  assert.equal(c.trap.code,'DIVIDE_BY_ZERO');
  assert.equal(c.URF[2],0xBEEF);
  assert.equal(c.clock,0);
}

console.log('SUBIT-CPU Core v0.2 extension tests: all tests passed');
