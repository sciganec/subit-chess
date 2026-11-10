'use strict';

/**
 * SUBIT-CPU Core v0.1
 * Executable reference interpreter for the SUBIT-CHESS v3.0 integration path.
 *
 * FOUR cell encoding: N=00, F=01, T=10, B=11.
 * FOUR_WORD: eight 2-bit cells, most-significant cell first.
 * Instruction: OP[15:11] RD[10:8] RA[7:5] RB[4:2] AUX[1:0].
 * Immediate forms consume the following 16-bit word.
 *
 * This is a deterministic software VM, not a hardware implementation.
 */
const FOUR = Object.freeze({ N: 0, F: 1, T: 2, B: 3 });
const OPCODE = Object.freeze({
  NOP:0x00, MOV:0x01, NOT:0x02, AND:0x03, OR:0x04,
  SJOIN:0x05, SMEET:0x06, BXOR:0x07, NAND:0x08, NOR:0x09,
  SHL:0x0A, SHR:0x0B, ROTATE:0x0C, LOAD:0x0D, STORE:0x0E,
  LOADI:0x0F, SETAR:0x10, JMP:0x11, JN:0x12, JF:0x13,
  JT:0x14, JB:0x15, EMIT:0x16, HALT:0x17, CMP:0x18,
  EQ:0x19, FILL:0x1A, TRAP:0x1F
});
const IMM_OPS = new Set([OPCODE.LOADI, OPCODE.SETAR, OPCODE.JMP,
  OPCODE.JN, OPCODE.JF, OPCODE.JT, OPCODE.JB]);
const MASK16 = 0xFFFF;

function u16(n) { return Number(n) & MASK16; }
function encode(op, rd=0, ra=0, rb=0, aux=0) {
  if (!Number.isInteger(op) || op < 0 || op > 31 ||
      ![rd,ra,rb,aux].every(Number.isInteger) ||
      rd<0 || rd>7 || ra<0 || ra>7 || rb<0 || rb>7 || aux<0 || aux>3) {
    throw new RangeError('instruction field out of range');
  }
  return ((op & 31)<<11)|((rd&7)<<8)|((ra&7)<<5)|((rb&7)<<2)|(aux&3);
}
function decode(word) {
  word = u16(word);
  return { word, op:(word>>>11)&31, rd:(word>>>8)&7,
    ra:(word>>>5)&7, rb:(word>>>2)&7, aux:word&3 };
}
function cell(word, index) {
  if (!Number.isInteger(index) || index<0 || index>7) throw new RangeError('FOUR cell index must be 0..7');
  return (u16(word) >>> (14-2*index)) & 3;
}
function fillCell(value) {
  if (!Number.isInteger(value) || value<0 || value>3) throw new RangeError('FOUR value must be 0..3');
  let out=0;
  for(let i=0;i<8;i++) out=(out<<2)|value;
  return out;
}
function mapCells(a,b,fn) {
  a=u16(a); b=u16(b);
  let out=0;
  for(let i=0;i<8;i++) out=(out<<2)|(fn((a>>>(14-2*i))&3,(b>>>(14-2*i))&3)&3);
  return out;
}
function fourNot(a) { return mapCells(a,0,(x)=>((x&1)<<1)|((x&2)>>1)); }
function fourAnd(a,b) { return mapCells(a,b,(x,y)=>(((x&2)&&(y&2))?2:0)|(((x&1)||(y&1))?1:0)); }
function fourOr(a,b) { return mapCells(a,b,(x,y)=>(((x&2)||(y&2))?2:0)|(((x&1)&&(y&1))?1:0)); }
function fourJoin(a,b) { return mapCells(a,b,(x,y)=>(x|y)); }
function fourMeet(a,b) { return mapCells(a,b,(x,y)=>(x&y)); }
function fourXor(a,b) { return mapCells(a,b,(x,y)=>x^y); }
function fourNand(a,b) { return fourNot(fourAnd(a,b)); }
function fourNor(a,b) { return fourNot(fourOr(a,b)); }

class SubitCPU {
  constructor(options={}) {
    this.memory = new Uint16Array(65536);
    this.RF = new Uint16Array(8);       // eight FOUR_WORD registers
    this.URF = new Uint16Array(4);      // four unsigned 16-bit registers
    this.SRF = new Int32Array(4);       // four signed 32-bit registers
    this.PC = 0; this.AR = 0; this.IR = 0;
    this.halted = false; this.trap = null;
    this.clock = 0; this.output = [];
    this.journal = []; this.provenance = [];
    this.maxJournal = options.maxJournal || 10000;
    this.programStart = 0; this.programEnd = 0;
    this.context = Object.freeze({ profile:'SUBIT-CPU/0.1', four:'Belnap-Dunn' });
  }
  reset() {
    this.RF.fill(0); this.URF.fill(0); this.SRF.fill(0);
    this.PC=0; this.AR=0; this.IR=0; this.halted=false; this.trap=null;
    this.clock=0; this.output=[]; this.journal=[]; this.provenance=[];
    return this;
  }
  loadProgram(words, start=0) {
    if (!Array.isArray(words) && !(words instanceof Uint16Array)) throw new TypeError('program must be an array of 16-bit words');
    if (!Number.isInteger(start) || start<0 || start+words.length>65536) throw new RangeError('program outside address space');
    for(let i=0;i<words.length;i++) this.memory[start+i]=u16(words[i]);
    this.programStart=start; this.programEnd=start+words.length; this.PC=start;
    this.halted=false; this.trap=null;
    return {start,end:this.programEnd,words:words.length};
  }
  snapshot() {
    return {PC:this.PC,AR:this.AR,IR:this.IR,RF:this.RF.slice(),URF:this.URF.slice(),
      SRF:this.SRF.slice(),halted:this.halted,trap:this.trap,clock:this.clock,
      outputLength:this.output.length};
  }
  restore(s) {
    this.PC=s.PC; this.AR=s.AR; this.IR=s.IR;
    this.RF.set(s.RF); this.URF.set(s.URF); this.SRF.set(s.SRF);
    this.halted=s.halted; this.trap=s.trap; this.clock=s.clock;
    this.output.length=s.outputLength;
  }
  _record(entry) {
    this.journal.push(Object.freeze(entry));
    if(this.journal.length>this.maxJournal) this.journal.shift();
  }
  _branchMatches(op, word) {
    // Branch is true when at least one of the eight cells has the requested value.
    const target = ({[OPCODE.JN]:FOUR.N,[OPCODE.JF]:FOUR.F,
      [OPCODE.JT]:FOUR.T,[OPCODE.JB]:FOUR.B})[op];
    for(let i=0;i<8;i++) if(cell(word,i)===target) return true;
    return false;
  }
  step() {
    if(this.halted) return {status:this.trap?'TRAP':'HALTED',pc:this.PC,clock:this.clock};
    const before=this.snapshot(), writes=[];
    const pc0=this.PC;
    try {
      if(this.PC<0 || this.PC>=65536) throw new Error('PC_OUT_OF_RANGE');
      this.IR=this.memory[this.PC];
      const d=decode(this.IR);
      this.PC=this.PC+1;
      let imm=null;
      if(IMM_OPS.has(d.op)) {
        if(this.PC>=65536) throw new Error('MISSING_EXTENSION');
        imm=this.memory[this.PC];
        this.PC=this.PC+1;
      }
      const a=this.RF[d.ra], b=this.RF[d.rb];
      switch(d.op) {
        case OPCODE.NOP: break;
        case OPCODE.MOV: this.RF[d.rd]=a; break;
        case OPCODE.NOT: this.RF[d.rd]=fourNot(a); break;
        case OPCODE.AND: this.RF[d.rd]=fourAnd(a,b); break;
        case OPCODE.OR: this.RF[d.rd]=fourOr(a,b); break;
        case OPCODE.SJOIN: this.RF[d.rd]=fourJoin(a,b); break;
        case OPCODE.SMEET: this.RF[d.rd]=fourMeet(a,b); break;
        case OPCODE.BXOR: this.RF[d.rd]=fourXor(a,b); break;
        case OPCODE.NAND: this.RF[d.rd]=fourNand(a,b); break;
        case OPCODE.NOR: this.RF[d.rd]=fourNor(a,b); break;
        case OPCODE.SHL: this.RF[d.rd]=u16(a << (d.aux+1)); break;
        case OPCODE.SHR: this.RF[d.rd]=a >>> (d.aux+1); break;
        case OPCODE.ROTATE: { const n=d.aux+1; this.RF[d.rd]=u16((a<<n)|(a>>>(16-n))); break; }
        case OPCODE.LOAD: this.RF[d.rd]=this.memory[this.AR]; break;
        case OPCODE.STORE: writes.push([this.AR,this.memory[this.AR]]); this.memory[this.AR]=a; break;
        case OPCODE.LOADI: this.URF[d.rd&3]=imm; break;
        case OPCODE.SETAR: this.AR=imm; break;
        case OPCODE.JMP: this.PC=imm; break;
        case OPCODE.JN: case OPCODE.JF: case OPCODE.JT: case OPCODE.JB:
          if(this._branchMatches(d.op,a)) this.PC=imm;
          break;
        case OPCODE.EMIT: this.output.push(a); break;
        case OPCODE.HALT: this.halted=true; break;
        case OPCODE.CMP: this.RF[d.rd]=fillCell(a===b?FOUR.T:FOUR.F); break;
        case OPCODE.EQ: this.RF[d.rd]=fillCell(a===b?FOUR.T:FOUR.F); break;
        case OPCODE.FILL: this.RF[d.rd]=fillCell(d.aux); break;
        case OPCODE.TRAP: throw new Error('TRAP_'+d.aux);
        default: throw new Error('ILLEGAL_OPCODE_'+d.op.toString(16).padStart(2,'0'));
      }
      this.clock++;
      const record={clock:this.clock,pc:pc0,nextPC:this.PC,ir:this.IR,opcode:d.op,
        status:'COMMITTED',writes:writes.map(w=>({address:w[0],before:w[1],after:this.memory[w[0]]}))};
      this._record(record);
      this.provenance.push({clock:this.clock,pc:pc0,ir:this.IR,contextId:'SUBIT-CPU/0.1'});
      return {status:this.halted?'HALTED':'COMMITTED',...record};
    } catch(err) {
      for(let i=writes.length-1;i>=0;i--) this.memory[writes[i][0]]=writes[i][1];
      const failedIR=this.IR;
      this.restore(before);
      this.halted=true;
      this.trap={code:String(err.message||err),pc:pc0,ir:failedIR};
      // Trap evidence is deliberately retained outside the rolled-back instruction state.
      this._record({clock:this.clock,pc:pc0,ir:this.IR,status:'ABORTED',trap:this.trap.code});
      return {status:'TRAP',pc:pc0,trap:this.trap};
    }
  }
  run(options={}) {
    const maxSteps=Number.isInteger(options.maxSteps)?options.maxSteps:100000;
    let steps=0,last=null;
    while(!this.halted && steps<maxSteps){ last=this.step(); steps++; }
    return {status:this.trap?'TRAP':this.halted?'HALTED':'STEP_LIMIT',
      steps,clock:this.clock,pc:this.PC,trap:this.trap,last,output:this.output.slice()};
  }
  readFOUR(reg) { if(!Number.isInteger(reg)||reg<0||reg>7) throw new RangeError('RF index'); return this.RF[reg]; }
  writeFOUR(reg,value) { if(!Number.isInteger(reg)||reg<0||reg>7) throw new RangeError('RF index'); this.RF[reg]=u16(value); }
  readU16(reg) { if(!Number.isInteger(reg)||reg<0||reg>3) throw new RangeError('URF index'); return this.URF[reg]; }
  writeU16(reg,value) { if(!Number.isInteger(reg)||reg<0||reg>3) throw new RangeError('URF index'); this.URF[reg]=u16(value); }
}
SubitCPU.FOUR=FOUR;
SubitCPU.OPCODE=OPCODE;
SubitCPU.encode=encode;
SubitCPU.decode=decode;
SubitCPU.cell=cell;
SubitCPU.fillCell=fillCell;
SubitCPU.logic=Object.freeze({not:fourNot,and:fourAnd,or:fourOr,join:fourJoin,meet:fourMeet,xor:fourXor,nand:fourNand,nor:fourNor});
if(typeof module!=='undefined' && module.exports) module.exports=SubitCPU;
if(typeof globalThis!=='undefined') globalThis.SubitCPU=SubitCPU;
