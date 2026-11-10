'use strict';

/**
 * CPU-native pseudo-legal knight move generator for the SUBIT-CHESS ABI.
 *
 * Generates moves for one explicitly selected side ('w' or 'b'), but checks
 * ABI.FLAGS at runtime and halts without publishing a move count if the side
 * does not match. The CPU performs all board reads, piece tests, occupancy
 * tests, and move-buffer writes. JavaScript only assembles unrolled code.
 *
 * This stage intentionally covers knights only. It does not test whether a
 * move leaves the moving side's king in check.
 */
function buildNativeKnightMovesProgram(CPU, options = {}) {
  if (!CPU || !CPU.encode || !CPU.encodeExtended || !CPU.OPCODE || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const side = options.side ?? 'w';
  if (side !== 'w' && side !== 'b') throw new RangeError("side must be 'w' or 'b'");
  const start = options.start ?? 0x1000;
  const boardAddress = options.boardAddress ?? 0x0000;
  const flagsAddress = options.flagsAddress ?? 0x0010;
  const countAddress = options.countAddress ?? 0x0022;
  const moveBufferAddress = options.moveBufferAddress ?? 0x0100;
  if (!Number.isInteger(start) || start < 0 || start > 0xFFFF) throw new RangeError('invalid program start');
  if (!Number.isInteger(boardAddress) || boardAddress < 0 || boardAddress + 16 > 65536) throw new RangeError('invalid board address');
  if (![flagsAddress,countAddress,moveBufferAddress].every(Number.isInteger) ||
      flagsAddress < 0 || flagsAddress > 0xFFFF || countAddress < 0 || countAddress > 0xFFFF ||
      moveBufferAddress < 0 || moveBufferAddress + 256 > 65536) throw new RangeError('invalid ABI address');

  const O = CPU.OPCODE, M = CPU.MOP, X = CPU.XOP;
  const words = [], labels = new Map(), fixups = [];
  const label = name => {
    if (labels.has(name)) throw new Error('duplicate label: '+name);
    labels.set(name, words.length);
  };
  const emit = (...xs) => words.push(...xs);
  const load = (reg, value) => emit(CPU.encode(O.LOADI,reg), value & 0xFFFF);
  const mem = (op, rd=0, ra=0, rb=0, imm=0) =>
    emit(CPU.MEM_PREFIX, CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext = (op, rd=0, ra=0, rb=0, imm=0) =>
    emit(CPU.EXT_PREFIX, CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const cmp = (a,b) => ext(X.UCMP,0,a,b,0);
  const jump = target => {
    emit(CPU.encode(O.JMP),0);
    fixups.push({at:words.length-1,target});
  };
  // Conditional far branch. If the condition is true, execute JMP target.
  // XBR with the inverse condition skips the two-word absolute JMP.
  const branch = (condition,target) => {
    if(condition!==0 && condition!==1) throw new RangeError('branch helper supports only Z/NZ complements');
    const inverse = condition===0 ? 1 : 0;
    ext(X.XBR,inverse,0,0,2);
    jump(target);
  };
  // Execute the absolute jump only when the selected flag is false.
  // Useful for carry tests: XBR C skips JMP when C=1, otherwise JMP executes.
  const branchWhenFalse = (condition,target) => {
    ext(X.XBR,condition,0,0,2);
    jump(target);
  };

  // Clear published count first, including on a side-mismatch early exit.
  load(1,countAddress); load(2,0); mem(M.USTORE,0,1,2);

  // Guard: ABI.FLAGS bit 0 is 0 for White and 1 for Black.
  label('entry');
  load(1,flagsAddress); mem(M.ULOAD,0,1);
  load(2,1); ext(X.UAND,0,0,2);
  load(1,0); cmp(0,1);
  branch(side==='w' ? 1 : 0,'wrong_side');
  load(3,0); // move count

  const offsets = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  const knightCode = side==='w' ? 2 : 10;
  const friendlyThreshold = side==='w' ? 9 : 8;

  for (let from=0; from<64; from++) {
    const file=from&7, rank=from>>>3;
    for (let k=0;k<offsets.length;k++) {
      const [df,dr]=offsets[k], tf=file+df, tr=rank+dr;
      if(tf<0||tf>7||tr<0||tr>7) continue;
      const to=tr*8+tf;
      const stem='m'+from+'_'+k;
      const skip=stem+'_skip', accept=stem+'_accept';

      // Source must contain the moving side's knight.
      load(1,boardAddress+(from>>>2));
      mem(M.ULOAD,0,1);
      mem(M.UEXTRACT4,0,0,0,from&3);
      load(2,knightCode); cmp(0,2);
      branch(1,skip); // NZ => not our knight

      // Read target square code.
      load(1,boardAddress+(to>>>2));
      mem(M.ULOAD,2,1);
      mem(M.UEXTRACT4,2,2,0,to&3);
      load(1,0); cmp(2,1);
      branch(0,accept); // empty target

      // Non-empty target: accept only an opponent piece.
      load(1,0x10000-friendlyThreshold);
      ext(X.UADD,1,2,1); // C=1 iff target >= friendlyThreshold
      if(side==='w') {
        branchWhenFalse(3,skip); // C=0 => target < 9 => friendly
      } else {
        branchWhenFalse(3,accept); // C=0 => target < 8 => opponent
        jump(skip);                // >= 8 => friendly
      }

      label(accept);
      load(1,moveBufferAddress);
      ext(X.UADD,1,1,3); // moveBuffer + count
      load(2,((from&63)<<10)|((to&63)<<4));
      mem(M.USTORE,0,1,2);
      ext(X.UADDI,3,3,0,1);
      label(skip);
    }
  }

  // Publish count only after successful generation.
  load(1,countAddress); mem(M.USTORE,0,1,3);
  emit(CPU.encode(O.HALT));
  label('wrong_side');
  emit(CPU.encode(O.HALT));

  for(const f of fixups) {
    if(!labels.has(f.target)) throw new Error('unresolved label: '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(start+words.length>65536) throw new RangeError('generated program exceeds CPU address space');
  return Object.freeze({start,end:start+words.length,words,side,moveCapacity:256,
    moveCountAddress:countAddress,moveBufferAddress,scope:'KNIGHT_PSEUDO_LEGAL'});
}

if(require.main===module) {
  const CPU=require('../src/cpu/subit_cpu.js');
  const cpu=new CPU();
  // Minimal synthetic position: white knights on b1 and g1, otherwise empty.
  cpu.memory[0]=0x0200; // a1=0, b1=2, c1=0, d1=0
  cpu.memory[1]=0x0000;
  cpu.memory[2]=0x0000;
  cpu.memory[3]=0x0000;
  cpu.memory[4]=0x0000;
  cpu.memory[5]=0x0000;
  cpu.memory[6]=0x0000;
  cpu.memory[7]=0x0000;
  cpu.memory[8]=0x0000;
  cpu.memory[9]=0x0000;
  cpu.memory[10]=0x0000;
  cpu.memory[11]=0x0000;
  cpu.memory[12]=0x0000;
  cpu.memory[13]=0x0000;
  cpu.memory[14]=0x0000;
  cpu.memory[15]=0x0000;
  cpu.memory[0x10]=0;
  const p=buildNativeKnightMovesProgram(CPU,{side:'w'});
  cpu.loadProgram(p.words,p.start);
  const result=cpu.run({maxSteps:50000});
  console.log(JSON.stringify({status:result.status,steps:result.steps,count:cpu.memory[0x22],
    moves:Array.from(cpu.memory.slice(0x100,0x100+cpu.memory[0x22]))}));
}

module.exports={buildNativeKnightMovesProgram};
