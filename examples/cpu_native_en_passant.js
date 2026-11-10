'use strict';

/**
 * CPU-native en-passant transformation on a staged packed board.
 * No-op unless the move is a diagonal pawn move to the ABI en-passant square.
 */
const STATUS=Object.freeze({NOT_RUN:0,NO_OP:1,APPLIED:2,BAD_CAPTURE_SQUARE:3,NOT_PAWN:4});
function buildNativeEnPassantProgram(CPU,options={}){
  if(!CPU||!CPU.encode||!CPU.encodeExtended||!CPU.OPCODE||!CPU.MOP||!CPU.XOP)
    throw new TypeError('SUBIT-CPU encoding API required');
  const board=options.boardAddress??0x0500,move=options.moveAddress??0x0024;
  const flags=options.flagsAddress??0x0010,ep=options.epAddress??0x0011;
  const status=options.statusAddress??0x0351,fromSlot=options.fromSlot??0x0352;
  const toSlot=options.toSlot??0x0353,capSlot=options.captureSlot??0x0354;
  const start=options.start??0xA000;
  for(const [a,n] of [[board,16],[move,1],[flags,1],[ep,1],[status,1],[fromSlot,1],[toSlot,1],[capSlot,1]])
    if(!Number.isInteger(a)||a<0||a+n>65536)throw new RangeError('en-passant address out of range');
  if(new Set([status,fromSlot,toSlot,capSlot]).size!==4)throw new RangeError('en-passant scratch slots must be distinct');
  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const emit=(...v)=>words.push(...v);
  const label=n=>{if(labels.has(n))throw Error('duplicate label '+n);labels.set(n,words.length);};
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const jump=t=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target:t});};
  const bz=t=>{ext(X.XBR,1,0,0,2);jump(t);};
  const bnz=t=>{ext(X.XBR,0,0,0,2);jump(t);};
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const finish=c=>{load(0,status);load(1,c);mem(M.USTORE,0,0,1);emit(CPU.encode(O.HALT));};

  load(0,status);load(1,STATUS.NOT_RUN);mem(M.USTORE,0,0,1);
  // Decode from/to from the ABI move word.
  load(0,move);mem(M.ULOAD,0,0);mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,3),CPU.encode(O.SHR,0,0,0,1));
  mem(M.FTOU,0,0);load(1,63);ext(X.UAND,0,0,1);
  load(1,fromSlot);mem(M.USTORE,0,1,0);
  load(0,move);mem(M.ULOAD,0,0);mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3));mem(M.FTOU,0,0);
  load(1,63);ext(X.UAND,0,0,1);load(1,toSlot);mem(M.USTORE,0,1,0);

  // The candidate destination must equal the current EP target.
  load(0,ep);mem(M.ULOAD,0,0);load(1,0xFFFF);cmp(0,1);bz('no_op');
  load(1,toSlot);mem(M.ULOAD,1,1);cmp(0,1);bnz('no_op');

  // En passant is diagonal: compare file(from) and file(to).
  load(0,fromSlot);mem(M.ULOAD,0,0);load(1,7);ext(X.UAND,0,0,1);
  load(1,toSlot);mem(M.ULOAD,1,1);load(2,7);ext(X.UAND,1,1,2);
  cmp(0,1);bz('no_op');

  // Destination after raw apply must contain the moving side's pawn.
  load(0,toSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,2,0,1);
  load(1,board);ext(X.UADD,2,2,1);mem(M.ULOAD,3,2);
  load(2,toSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);bz('dest_nib_'+i);}
  jump('no_op');
  for(let i=0;i<4;i++){
    label('dest_nib_'+i);mem(M.UEXTRACT4,0,3,0,i);
    load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
    load(2,0);cmp(1,2);bnz('moving_black_'+i);
    load(1,1);cmp(0,1);bnz('no_op');jump('compute_capture');
    label('moving_black_'+i);
    load(1,9);cmp(0,1);bnz('no_op');jump('compute_capture');
  }

  label('compute_capture');
  // Captured pawn is one rank behind the EP target.
  load(0,toSlot);mem(M.ULOAD,0,0);
  load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
  load(2,0);cmp(1,2);bnz('black_capture');
  load(2,8);ext(X.USUB,0,0,2);jump('capture_square_ready');
  label('black_capture');
  load(2,8);ext(X.UADD,0,0,2);
  label('capture_square_ready');
  load(1,capSlot);mem(M.USTORE,0,1,0);

  // Read captured square nibble and require an opposing pawn.
  load(0,capSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,2,0,1);
  load(1,board);ext(X.UADD,2,2,1);mem(M.ULOAD,3,2);
  load(2,capSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);bz('cap_nib_'+i);}
  jump('bad_capture');
  for(let i=0;i<4;i++){
    label('cap_nib_'+i);mem(M.UEXTRACT4,0,3,0,i);
    load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
    load(2,0);cmp(1,2);bnz('expect_white_pawn_'+i);
    load(1,9);cmp(0,1);bnz('bad_capture');jump('clear_capture');
    label('expect_white_pawn_'+i);
    load(1,1);cmp(0,1);bnz('bad_capture');jump('clear_capture');
  }

  label('clear_capture');
  // Reload packed word; UINSERT4 writes zero into the captured nibble.
  load(0,capSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,2,0,1);
  load(1,board);ext(X.UADD,2,2,1);mem(M.ULOAD,3,2);
  load(2,capSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);bz('clear_nib_'+i);}
  jump('bad_capture');
  for(let i=0;i<4;i++){
    label('clear_nib_'+i);load(0,0);mem(M.UINSERT4,3,3,0,i);
    load(0,capSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,0,0,1);
    load(1,board);ext(X.UADD,0,0,1);mem(M.USTORE,0,0,3);
    finish(STATUS.APPLIED);
  }
  label('no_op');finish(STATUS.NO_OP);
  label('not_pawn');finish(STATUS.NOT_PAWN);
  label('bad_capture');finish(STATUS.BAD_CAPTURE_SQUARE);
  for(const f of fixups){if(!labels.has(f.target))throw Error('unresolved label '+f.target);words[f.at]=start+labels.get(f.target);}
  if(start+words.length>65536)throw new RangeError('en-passant program exceeds address space');
  return Object.freeze({start,end:start+words.length,words,statusAddress:status,
    boardAddress:board,epAddress:ep,scope:'EN_PASSANT_CAPTURE_REMOVAL_ON_STAGED_BOARD'});
}
module.exports={buildNativeEnPassantProgram,EN_PASSANT_STATUS:STATUS};
