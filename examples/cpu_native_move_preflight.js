'use strict';

/**
 * CPU-native move preflight v0.1.
 *
 * Checks the move ABI reserved bit, distinct from/to squares, non-empty
 * source, source ownership, and friendly destination occupancy. It does not
 * validate piece geometry or special-move semantics.
 */
function buildNativeMovePreflightProgram(CPU,options={}){
  if(!CPU||!CPU.encode||!CPU.encodeExtended||!CPU.OPCODE||!CPU.MOP||!CPU.XOP)
    throw new TypeError('SUBIT-CPU encoding API required');
  const board=options.boardAddress??0x0000,flags=options.flagsAddress??0x0010;
  const move=options.moveAddress??0x0024,start=options.start??0x9000;
  const status=options.statusAddress??0x0346,fromSlot=options.fromSlot??0x0347,toSlot=options.toSlot??0x0348;
  for(const [a,n] of [[board,16],[flags,1],[move,1],[status,1],[fromSlot,1],[toSlot,1]])
    if(!Number.isInteger(a)||a<0||a+n>65536)throw new RangeError('address out of range');
  if(new Set([status,fromSlot,toSlot]).size!==3)throw new RangeError('preflight slots must be distinct');
  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const emit=(...v)=>words.push(...v);
  const label=n=>{if(labels.has(n))throw Error('duplicate label '+n);labels.set(n,words.length);};
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branchZ=target=>{ext(X.XBR,1,0,0,2);jump(target);};
  const branchNZ=target=>{ext(X.XBR,0,0,0,2);jump(target);};
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const finish=code=>{load(0,status);load(1,code);mem(M.USTORE,0,0,1);emit(CPU.encode(O.HALT));};

  // A fresh status prevents stale success after an interrupted caller sequence.
  load(0,status);load(1,0);mem(M.USTORE,0,0,1);
  load(0,move);mem(M.ULOAD,0,0);
  // Reserved bit 0 must remain clear.
  load(1,1);ext(X.UAND,2,0,1);load(1,0);cmp(2,1);branchNZ('bad_reserved');

  // Decode and retain from/to square indices.
  mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,1));
  mem(M.FTOU,0,0);load(1,63);ext(X.UAND,0,0,1);
  load(1,fromSlot);mem(M.USTORE,0,1,0);
  load(0,move);mem(M.ULOAD,0,0);mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3));mem(M.FTOU,0,0);
  load(1,63);ext(X.UAND,0,0,1);
  load(1,toSlot);mem(M.USTORE,0,1,0);

  load(0,fromSlot);mem(M.ULOAD,0,0);
  load(1,toSlot);mem(M.ULOAD,1,1);cmp(0,1);branchZ('same_square');

  // Extract source piece nibble.
  load(0,fromSlot);mem(M.ULOAD,0,0);
  load(1,4);ext(X.UDIV,2,0,1);
  load(1,board);ext(X.UADD,2,2,1);mem(M.ULOAD,3,2);
  load(2,3);ext(X.UAND,2,0,2);mem(M.UEXTRACT4,0,3,0,0);
  // Select the nibble using four static branches.
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);branchZ('src_nib_'+i);}
  jump('bad_source');
  for(let i=0;i<4;i++){
    label('src_nib_'+i);mem(M.UEXTRACT4,0,3,0,i);
    jump('source_ready');
  }
  label('source_ready');
  load(1,0);cmp(0,1);branchZ('empty_source');

  // Validate source ownership by exact piece-code membership.
  load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
  branchNZ('source_black');
  for(let p=1;p<=6;p++){load(1,p);cmp(0,1);branchZ('source_owned');}
  jump('wrong_source_side');
  label('source_black');
  for(let p=9;p<=14;p++){load(1,p);cmp(0,1);branchZ('source_owned');}
  jump('wrong_source_side');
  label('source_owned');

  // Read destination nibble and reject only friendly occupancy.
  load(0,toSlot);mem(M.ULOAD,0,0);
  load(1,4);ext(X.UDIV,2,0,1);load(1,board);ext(X.UADD,2,2,1);
  mem(M.ULOAD,3,2);load(2,3);ext(X.UAND,2,0,2);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);branchZ('dst_nib_'+i);}
  jump('bad_destination');
  for(let i=0;i<4;i++){
    label('dst_nib_'+i);mem(M.UEXTRACT4,0,3,0,i);jump('destination_ready');
  }
  label('destination_ready');
  load(1,0);cmp(0,1);branchZ('valid');
  load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
  branchNZ('destination_black');
  for(let p=1;p<=6;p++){load(1,p);cmp(0,1);branchZ('friendly_destination');}
  jump('valid');
  label('destination_black');
  for(let p=9;p<=14;p++){load(1,p);cmp(0,1);branchZ('friendly_destination');}
  jump('valid');

  label('valid');finish(1);
  label('bad_reserved');finish(2);
  label('same_square');finish(3);
  label('empty_source');finish(4);
  label('wrong_source_side');finish(5);
  label('friendly_destination');finish(6);
  label('bad_source');finish(7);
  label('bad_destination');finish(8);
  for(const f of fixups){
    if(!labels.has(f.target))throw Error('unresolved label '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(!Number.isInteger(start)||start<0||start+words.length>65536)throw new RangeError('preflight program exceeds address space');
  return Object.freeze({start,end:start+words.length,words,boardAddress:board,
    flagsAddress:flags,moveAddress:move,statusAddress:status,fromSlot,toSlot,
    scope:'SOURCE_OWNERSHIP_AND_DESTINATION_PREFLIGHT'});
}
module.exports={buildNativeMovePreflightProgram};
