'use strict';

/**
 * CPU-native pseudo-legal pawn generator for the SUBIT-CHESS ABI.
 *
 * The generated VM program reads packed board nibbles, validates side-to-move,
 * checks forward/capture occupancy, handles initial double pushes and emits
 * all four promotion choices. JavaScript assembles the unrolled instruction
 * stream only; runtime chess decisions and move-buffer writes are CPU work.
 *
 * King safety, en-passant and castling are deliberately outside this stage.
 */
function buildNativePawnMovesProgram(CPU, options = {}) {
  if (!CPU || !CPU.encode || !CPU.encodeExtended || !CPU.OPCODE || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const side = options.side ?? 'w';
  if (side !== 'w' && side !== 'b') throw new RangeError("side must be 'w' or 'b'");
  const start = options.start ?? 0x1800;
  const boardAddress = options.boardAddress ?? 0x0000;
  const flagsAddress = options.flagsAddress ?? 0x0010;
  const countAddress = options.countAddress ?? 0x0022;
  const moveBufferAddress = options.moveBufferAddress ?? 0x0100;
  if (!Number.isInteger(start) || start < 0 || start > 0xFFFF) throw new RangeError('invalid program start');
  if (!Number.isInteger(boardAddress) || boardAddress < 0 || boardAddress + 16 > 65536) throw new RangeError('invalid board address');
  if (![flagsAddress,countAddress,moveBufferAddress].every(Number.isInteger) ||
      flagsAddress < 0 || flagsAddress > 0xFFFF || countAddress < 0 || countAddress > 0xFFFF ||
      moveBufferAddress < 0 || moveBufferAddress + 256 > 65536) throw new RangeError('invalid ABI address');

  const O=CPU.OPCODE, M=CPU.MOP, X=CPU.XOP;
  const words=[], labels=new Map(), fixups=[];
  const label=name=>{if(labels.has(name))throw new Error('duplicate label: '+name);labels.set(name,words.length);};
  const emit=(...xs)=>words.push(...xs);
  const load=(reg,value)=>emit(CPU.encode(O.LOADI,reg),value&0xFFFF);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branch=(condition,target)=>{
    if(condition!==0&&condition!==1)throw new RangeError('branch helper supports Z/NZ');
    ext(X.XBR,condition===0?1:0,0,0,2); jump(target);
  };
  const branchWhenFalse=(condition,target)=>{ext(X.XBR,condition,0,0,2);jump(target);};
  // Jump to skip only when C=0; with C=1 execution falls through.
  const skipIfNoCarry=target=>{ext(X.XBR,3,0,0,2);jump(target);};
  const branchNoCarry=target=>branchWhenFalse(3,target);

  // Reset the published count before checking the side guard.
  load(1,countAddress);load(2,0);mem(M.USTORE,0,1,2);
  label('entry');
  load(1,flagsAddress);mem(M.ULOAD,0,1);
  load(2,1);ext(X.UAND,0,0,2);
  load(1,0);cmp(0,1);
  branch(side==='w'?1:0,'wrong_side');
  load(3,0);

  const pawnCode=side==='w'?1:9;
  const friendlyThreshold=side==='w'?9:8;
  const forward=side==='w'?8:-8;
  const startRank=side==='w'?1:6;
  const promotionRank=side==='w'?7:0;
  const promotions=[1,2,3,4]; // Q,R,B,N per Chess Unit ABI

  function emitMove(from,to,promo=0){
    load(1,moveBufferAddress);
    ext(X.UADD,1,1,3);
    load(2,((from&63)<<10)|((to&63)<<4)|((promo&7)<<1));
    mem(M.USTORE,0,1,2);
    ext(X.UADDI,3,3,0,1);
  }
  function emitPromotionSet(from,to){
    for(const promo of promotions)emitMove(from,to,promo);
  }
  function readSquare(square,reg=2){
    load(1,boardAddress+(square>>>2));
    mem(M.ULOAD,reg,1);
    mem(M.UEXTRACT4,reg,reg,0,square&3);
  }
  function sourceGuard(from,skip){
    readSquare(from,0);
    load(2,pawnCode);cmp(0,2);
    branch(1,skip);
  }
  function forwardIfEmpty(from,to,skip){
    readSquare(to,2);
    load(1,0);cmp(2,1);
    branch(1,skip); // non-empty target
    if((to>>>3)===promotionRank)emitPromotionSet(from,to);
    else emitMove(from,to,0);
  }
  for(let from=0;from<64;from++){
    const rank=from>>>3,file=from&7;
    if(rank===promotionRank || (side==='w'&&rank===0) || (side==='b'&&rank===7))continue;
    const forwardTo=from+forward;
    const stem='p'+from;
    const skip=stem+'_skip';
    sourceGuard(from,skip);

    // One-square advance.
    forwardIfEmpty(from,forwardTo,skip);

    // Two-square advance is available only from the initial pawn rank and
    // only when both the intermediate and destination squares are empty.
    if(rank===startRank){
      const doubleTo=from+2*forward;
      readSquare(forwardTo,2);load(1,0);cmp(2,1);branch(1,skip);
      readSquare(doubleTo,2);load(1,0);cmp(2,1);branch(1,skip);
      emitMove(from,doubleTo,0);
    }

    // Diagonal captures: target must be non-empty and belong to the opponent.
    for(const df of [-1,1]){
      const targetFile=file+df;
      if(targetFile<0||targetFile>7)continue;
      const to=from+forward+df;
      const capSkip=stem+'_cap_'+df+'_skip';
      readSquare(to,2);
      load(1,0);cmp(2,1);
      branch(0,capSkip); // Z => empty target, so no capture
      load(1,0x10000-friendlyThreshold);
      ext(X.UADD,1,2,1); // C iff target code >= threshold
      if(side==='w'){
        skipIfNoCarry(capSkip);
        jump(capSkip);
      }else{
        branchNoCarry(stem+'_cap_'+df+'_accept');
        jump(capSkip);
      }
      label(stem+'_cap_'+df+'_accept');
      if((to>>>3)===promotionRank)emitPromotionSet(from,to);
      else emitMove(from,to,0);
      label(capSkip);
    }
    label(skip);
  }

  load(1,countAddress);mem(M.USTORE,0,1,3);
  emit(CPU.encode(O.HALT));
  label('wrong_side');emit(CPU.encode(O.HALT));

  for(const f of fixups){
    if(!labels.has(f.target))throw new Error('unresolved label: '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(start+words.length>65536)throw new RangeError('generated program exceeds CPU address space');
  return Object.freeze({start,end:start+words.length,words,side,moveCapacity:256,
    moveCountAddress:countAddress,moveBufferAddress,scope:'PAWN_PSEUDO_LEGAL'});
}

module.exports={buildNativePawnMovesProgram};
