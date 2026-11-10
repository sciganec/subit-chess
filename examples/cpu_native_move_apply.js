'use strict';

/**
 * CPU-native packed-board move application (staged copy).
 *
 * Reads the existing 16-bit move ABI:
 *   from = (word >>> 10) & 63
 *   to   = (word >>> 4) & 63
 *
 * Copies 16 packed board words to a separate scratch board, then uses
 * UEXTRACT4/UINSERT4 to clear the source nibble and write its piece code
 * at the destination. The original board is never modified.
 *
 * This is intentionally a RAW APPLY primitive. It assumes a well-formed,
 * prevalidated move and does not yet enforce side ownership, destination
 * ownership, movement geometry, promotion, en-passant, castling, or king safety.
 */
function buildNativeMoveApplyProgram(CPU, options = {}) {
  if(!CPU||!CPU.encode||!CPU.encodeExtended||!CPU.OPCODE||!CPU.MOP||!CPU.XOP)
    throw new TypeError('SUBIT-CPU encoding API required');
  const board=options.boardAddress??0x0000;
  const scratch=options.scratchBoardAddress??0x0500;
  const move=options.moveAddress??0x0024;
  const state=options.stateAddress??0x0342;
  const pieceSlot=options.pieceSlot??0x0343;
  const fromSlot=options.fromSlot??0x0344;
  const toSlot=options.toSlot??0x0345;
  const start=options.start??0x8000;
  const ranges=[[board,board+16],[scratch,scratch+16],[move,move+1],
    [state,state+1],[pieceSlot,pieceSlot+1],[fromSlot,fromSlot+1],[toSlot,toSlot+1]];
  for(const [a,b] of ranges)if(!Number.isInteger(a)||a<0||b>65536)throw new RangeError('address out of range');
  if(board===scratch||Math.max(board,scratch)<Math.min(board+16,scratch+16))
    throw new RangeError('source and scratch boards must not overlap');
  const slots=[state,pieceSlot,fromSlot,toSlot];
  if(new Set(slots).size!==slots.length)throw new RangeError('scratch state slots must be distinct');
  for(const [a,b] of ranges)for(const [c,d] of ranges){
    if(a===c&&b===d)continue;
    if(Math.max(a,c)<Math.min(b,d)&&!(a===board&&c===board)&&!(a===scratch&&c===scratch))
      throw new RangeError('move-apply memory regions overlap');
  }

  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const emit=(...xs)=>words.push(...xs);
  const label=n=>{if(labels.has(n))throw Error('duplicate label '+n);labels.set(n,words.length);};
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branchEq=(a,b,target)=>{
    ext(X.XBR,1,0,0,2); // Skip JMP when compare is non-zero.
    jump(target);
  };
  const compare=(a,b)=>ext(X.UCMP,0,a,b,0);

  // Start with a clean status and copy the complete packed board.
  load(0,state);load(1,0);mem(M.USTORE,0,0,1);
  for(let i=0;i<16;i++){
    load(0,board+i);mem(M.ULOAD,1,0);
    load(0,scratch+i);mem(M.USTORE,0,0,1);
  }

  // Decode from-square: (move >>> 10) & 63.
  load(1,move);mem(M.ULOAD,0,1);
  mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,1));
  mem(M.FTOU,0,0);
  load(1,63);ext(X.UAND,0,0,1);
  load(1,fromSlot);mem(M.USTORE,0,1,0);

  // Decode to-square: (move >>> 4) & 63.
  load(2,move);mem(M.ULOAD,1,2);
  mem(M.UTOF,0,1);
  emit(CPU.encode(O.SHR,0,0,0,3));
  mem(M.FTOU,1,0);
  load(2,63);ext(X.UAND,1,1,2);
  load(2,toSlot);mem(M.USTORE,0,2,1);

  // Load source packed word into URF[3], derive source nibble index in URF[2].
  load(0,fromSlot);mem(M.ULOAD,0,0);
  load(1,4);ext(X.UDIV,2,0,1);
  load(1,scratch);ext(X.UADD,2,2,1);
  mem(M.ULOAD,3,2);
  load(2,3);ext(X.UAND,2,0,2);

  // Four statically selected UEXTRACT4/UINSERT4 operations.
  for(let i=0;i<4;i++){load(0,i);compare(2,0);branchEq(2,0,'source_nibble_'+i);}
  for(let i=0;i<4;i++){
    label('source_nibble_'+i);
    load(0,pieceSlot);mem(M.USTORE,0,0,3);
    load(0,0);mem(M.UINSERT4,3,3,0,i);
    load(0,fromSlot);mem(M.ULOAD,0,0);
    load(1,4);ext(X.UDIV,0,0,1);
    load(1,scratch);ext(X.UADD,0,0,1);
    mem(M.USTORE,0,0,3);
    jump('destination_stage');
  }

  label('destination_stage');
  load(0,toSlot);mem(M.ULOAD,0,0);
  load(1,4);ext(X.UDIV,2,0,1);
  load(1,scratch);ext(X.UADD,2,2,1);
  mem(M.ULOAD,3,2);
  load(2,3);ext(X.UAND,2,0,2);
  for(let i=0;i<4;i++){load(1,i);compare(2,1);branchEq(2,1,'destination_nibble_'+i);}
  for(let i=0;i<4;i++){
    label('destination_nibble_'+i);
    load(1,pieceSlot);mem(M.ULOAD,0,1);
    mem(M.UINSERT4,3,3,0,i);
    load(0,toSlot);mem(M.ULOAD,0,0);
    load(1,4);ext(X.UDIV,0,0,1);
    load(1,scratch);ext(X.UADD,0,0,1);
    mem(M.USTORE,0,0,3);
    load(0,state);load(1,1);mem(M.USTORE,0,0,1);
    emit(CPU.encode(O.HALT));
  }

  for(const f of fixups){
    if(!labels.has(f.target))throw new Error('unresolved label '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(!Number.isInteger(start)||start<0||start+words.length>65536)
    throw new RangeError('move-apply program exceeds address space');
  return Object.freeze({start,end:start+words.length,words,boardAddress:board,
    scratchBoardAddress:scratch,moveAddress:move,stateAddress:state,
    pieceSlot,fromSlot,toSlot,scope:'RAW_STAGED_MOVE_APPLY'});
}
module.exports={buildNativeMoveApplyProgram};
