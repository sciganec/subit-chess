'use strict';

/**
 * CPU-native promotion replacement on an already staged packed board.
 * Move word: from[15:10] | to[9:4] | promo[3:1] | reserved[0].
 * Promotion codes: 1=Q, 2=R, 3=B, 4=N. 0 means no promotion.
 */
const STATUS=Object.freeze({NOT_RUN:0,OK:1,BAD_CODE:2,WRONG_RANK:3,NOT_PAWN:4});
function buildNativePromotionProgram(CPU,options={}){
  if(!CPU||!CPU.encode||!CPU.encodeExtended||!CPU.OPCODE||!CPU.MOP||!CPU.XOP)
    throw new TypeError('SUBIT-CPU encoding API required');
  const board=options.boardAddress??0x0500,move=options.moveAddress??0x0024;
  const flags=options.flagsAddress??0x0010,status=options.statusAddress??0x034D;
  const toSlot=options.toSlot??0x034E,promoSlot=options.promoSlot??0x034F;
  const start=options.start??0xB000;
  for(const [a,n] of [[board,16],[move,1],[flags,1],[status,1],[toSlot,1],[promoSlot,1]])
    if(!Number.isInteger(a)||a<0||a+n>65536)throw new RangeError('promotion address out of range');
  if(new Set([status,toSlot,promoSlot]).size!==3)throw new RangeError('promotion scratch slots must be distinct');
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
  load(0,move);mem(M.ULOAD,0,0);
  load(1,0x000E);ext(X.UAND,0,0,1);
  load(1,2);ext(X.UDIV,0,0,1);
  load(1,0);cmp(0,1);bz('no_promotion');
  for(let p=1;p<=4;p++){load(1,p);cmp(0,1);bz('promo_code_valid');}
  jump('bad_code');
  label('promo_code_valid');
  load(1,promoSlot);mem(M.USTORE,0,1,0);

  // Decode and retain destination square.
  load(0,move);mem(M.ULOAD,0,0);mem(M.UTOF,0,0);
  emit(CPU.encode(O.SHR,0,0,0,3));mem(M.FTOU,0,0);
  load(1,63);ext(X.UAND,0,0,1);
  load(1,toSlot);mem(M.USTORE,0,1,0);

  // Side-specific terminal rank: white rank 7, black rank 0.
  load(0,flags);mem(M.ULOAD,0,0);load(1,1);ext(X.UAND,0,0,1);
  load(1,0);cmp(0,1);bnz('black_rank');
  load(0,toSlot);mem(M.ULOAD,0,0);load(1,8);ext(X.UDIV,0,0,1);
  load(1,7);cmp(0,1);bnz('wrong_rank');jump('check_pawn');
  label('black_rank');
  load(0,toSlot);mem(M.ULOAD,0,0);load(1,8);ext(X.UDIV,0,0,1);
  load(1,0);cmp(0,1);bnz('wrong_rank');

  label('check_pawn');
  // Read the destination nibble from the staged board.
  load(0,toSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,2,0,1);
  load(1,board);ext(X.UADD,2,2,1);mem(M.ULOAD,3,2);
  load(2,toSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);bz('nib_'+i);}
  jump('not_pawn');
  for(let i=0;i<4;i++){
    label('nib_'+i);mem(M.UEXTRACT4,0,3,0,i);
    load(1,1);cmp(0,1);bz('white_pawn');
    load(1,9);cmp(0,1);bnz('not_pawn');
    jump('insert_promotion');
  }
  label('white_pawn');
  load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
  load(2,0);cmp(1,2);bnz('not_pawn');
  label('insert_promotion');
  load(0,promoSlot);mem(M.ULOAD,0,0);
  // ABI promotion code order Q,R,B,N differs from piece type order P,N,B,R,Q.
  for(const [code,name] of [[1,'queen'],[2,'rook'],[3,'bishop'],[4,'knight']]){
    load(1,code);cmp(0,1);bz('map_'+name);
  }
  jump('bad_code');
  label('map_queen');load(0,5);jump('piece_code_ready');
  label('map_rook');load(0,4);jump('piece_code_ready');
  label('map_bishop');load(0,3);jump('piece_code_ready');
  label('map_knight');load(0,2);
  label('piece_code_ready');
  load(1,flags);mem(M.ULOAD,1,1);load(2,1);ext(X.UAND,1,1,2);
  load(2,0);cmp(1,2);bz('white_piece');
  load(2,8);ext(X.UADD,0,0,2);
  label('white_piece');
  load(1,toSlot);mem(M.ULOAD,1,1);load(2,4);ext(X.UDIV,2,1,2);
  load(3,board);ext(X.UADD,2,2,3);mem(M.ULOAD,3,2);
  load(2,toSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);bz('write_nib_'+i);}
  jump('not_pawn');
  for(let i=0;i<4;i++){
    label('write_nib_'+i);mem(M.UINSERT4,3,3,0,i);
    load(0,toSlot);mem(M.ULOAD,0,0);load(1,4);ext(X.UDIV,0,0,1);
    load(1,board);ext(X.UADD,0,0,1);mem(M.USTORE,0,0,3);
    finish(STATUS.OK);
  }
  label('no_promotion');finish(STATUS.OK);
  label('bad_code');finish(STATUS.BAD_CODE);
  label('wrong_rank');finish(STATUS.WRONG_RANK);
  label('not_pawn');finish(STATUS.NOT_PAWN);
  for(const f of fixups){if(!labels.has(f.target))throw Error('unresolved label '+f.target);words[f.at]=start+labels.get(f.target);}
  if(start+words.length>65536)throw new RangeError('promotion program exceeds address space');
  return Object.freeze({start,end:start+words.length,words,statusAddress:status,
    boardAddress:board,moveAddress:move,scope:'PROMOTION_REPLACEMENT_ON_STAGED_BOARD'});
}
module.exports={buildNativePromotionProgram,PROMOTION_STATUS:STATUS};
