'use strict';

/**
 * SUBIT-CPU Move Geometry v0.1.
 *
 * A compact ROM-style relation table provides piece-specific geometry and
 * ordered intermediate squares. The CPU computes the source/destination
 * record address, selects the source piece's relation bit, and scans every
 * intermediate square on the live packed board. JavaScript constructs static
 * ROM contents; move acceptance and path-occupancy decisions run on CPU.
 *
 * This stage rejects nonzero promotion fields until promotion-aware apply is
 * implemented. En-passant and castling are intentionally excluded.
 */
const PIECE_TYPE=Object.freeze({PAWN:0,KNIGHT:1,BISHOP:2,ROOK:3,QUEEN:4,KING:5});
const STATUS=Object.freeze({
  NOT_RUN:0,VALID:1,INVALID_GEOMETRY:2,BLOCKED_PATH:3,
  UNSUPPORTED_PROMOTION:4,EXECUTION_ERROR:5
});
const TABLE_WORDS=8,PAIR_COUNT=4096,DEFAULT_TABLE_BASE=0x4000,DEFAULT_ONEHOT_BASE=0x3F00;

function buildGeometryTable(side){
  if(side!=='w'&&side!=='b')throw new RangeError("side must be 'w' or 'b'");
  const words=new Uint16Array(PAIR_COUNT*TABLE_WORDS);
  const sign=side==='w'?1:-1;
  const pieceTypes=[
    (f,r,tf,tr)=>tf===f&&tr===r+sign || tf===f&&tr===r+2*sign&&r===(side==='w'?1:6) ||
      Math.abs(tf-f)===1&&tr===r+sign,
    (f,r,tf,tr)=>{const df=Math.abs(tf-f),dr=Math.abs(tr-r);return df===1&&dr===2||df===2&&dr===1;},
    (f,r,tf,tr)=>Math.abs(tf-f)>0&&Math.abs(tf-f)===Math.abs(tr-r),
    (f,r,tf,tr)=>(tf===f)!==(tr===r),
    (f,r,tf,tr)=>((tf===f)!==(tr===r))||Math.abs(tf-f)>0&&Math.abs(tf-f)===Math.abs(tr-r),
    (f,r,tf,tr)=>Math.max(Math.abs(tf-f),Math.abs(tr-r))===1
  ];
  for(let from=0;from<64;from++){
    const f=from&7,r=from>>>3;
    for(let to=0;to<64;to++){
      if(from===to)continue;
      const tf=to&7,tr=to>>>3,df=tf-f,dr=tr-r,index=from*64+to,base=index*TABLE_WORDS;
      let mask=0;
      for(let type=0;type<6;type++)if(pieceTypes[type](f,r,tf,tr))mask|=1<<type;
      words[base]=mask;
      let path=[];
      if((mask&(1<<PIECE_TYPE.PAWN))&&df===0&&Math.abs(dr)===2)path.push((r+sign)*8+f);
      if(mask&(1<<PIECE_TYPE.BISHOP|1<<PIECE_TYPE.ROOK|1<<PIECE_TYPE.QUEEN)){
        const diagonal=Math.abs(df)===Math.abs(dr);
        const stepF=Math.sign(df),stepR=Math.sign(dr);
        let x=f+stepF,y=r+stepR;
        while(x!==tf||y!==tr){path.push(y*8+x);x+=stepF;y+=stepR;}
      }
      words[base+1]=path.length;
      for(let i=0;i<6;i++)words[base+2+i]=path[i]??0xFFFF;
    }
  }
  return words;
}

function buildNativeMoveGeometryProgram(CPU,options={}){
  if(!CPU||!CPU.encode||!CPU.encodeExtended||!CPU.OPCODE||!CPU.MOP||!CPU.XOP)
    throw new TypeError('SUBIT-CPU encoding API required');
  const side=options.side??'w';
  if(side!=='w'&&side!=='b')throw new RangeError("side must be 'w' or 'b'");
  const board=options.boardAddress??0x0000,fromSlot=options.fromSlot??0x0347;
  const toSlot=options.toSlot??0x0348,pieceSlot=options.pieceSlot??0x0349;
  const routePtrSlot=options.routePtrSlot??0x034A,squareSlot=options.squareSlot??0x034B;
  const status=options.statusAddress??0x034C,move=options.moveAddress??0x0024;
  const tableBase=options.tableBase??DEFAULT_TABLE_BASE,oneHotBase=options.oneHotBase??DEFAULT_ONEHOT_BASE;
  const start=options.start??0xD000;
  for(const [a,n] of [[board,16],[fromSlot,1],[toSlot,1],[pieceSlot,1],[routePtrSlot,1],[squareSlot,1],[status,1],[move,1],[tableBase,PAIR_COUNT*TABLE_WORDS],[oneHotBase,16]])
    if(!Number.isInteger(a)||a<0||a+n>65536)throw new RangeError('geometry address out of range');
  const scratch=[pieceSlot,routePtrSlot,squareSlot,status];
  if(new Set(scratch).size!==scratch.length)throw new RangeError('geometry scratch slots must be distinct');
  if(start<tableBase+PAIR_COUNT*TABLE_WORDS&&start+4096>tableBase)
    throw new RangeError('geometry program overlaps lookup table');

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

  // Reset status; source piece nibble is extracted by four static branches.
  load(0,status);load(1,STATUS.NOT_RUN);mem(M.USTORE,0,0,1);
  load(0,fromSlot);mem(M.ULOAD,0,0);
  load(1,4);ext(X.UDIV,2,0,1);load(1,board);ext(X.UADD,2,2,1);
  mem(M.ULOAD,3,2);load(1,3);ext(X.UAND,2,0,1);
  for(let i=0;i<4;i++){load(1,i);cmp(2,1);branchZ('source_nibble_'+i);}
  jump('invalid_geometry');
  for(let i=0;i<4;i++){label('source_nibble_'+i);mem(M.UEXTRACT4,0,3,0,i);jump('source_ready');}
  label('source_ready');
  load(1,pieceSlot);mem(M.USTORE,0,1,0);

  // Record address = tableBase + ((from * 64 + to) * 8).
  load(0,fromSlot);mem(M.ULOAD,0,0);load(1,64);ext(X.UMUL,2,0,1);
  load(0,toSlot);mem(M.ULOAD,0,0);ext(X.UADD,2,2,0);
  load(0,8);ext(X.UMUL,2,2,0);load(0,tableBase);ext(X.UADD,2,2,0);
  load(0,routePtrSlot);mem(M.USTORE,0,0,2);

  // Read geometric type mask and test the exact source piece's one-hot bit.
  mem(M.ULOAD,1,2);
  load(0,pieceSlot);mem(M.ULOAD,0,0);load(2,oneHotBase);ext(X.UADD,2,2,0);
  mem(M.ULOAD,0,2);ext(X.UAND,0,0,1);load(1,0);cmp(0,1);branchZ('invalid_geometry');

  // Promotion is deliberately rejected until a promotion-aware apply exists.
  load(0,move);mem(M.ULOAD,0,0);load(1,0x000E);ext(X.UAND,0,0,1);
  load(1,0);cmp(0,1);branchNZ('unsupported_promotion');

  // routePtr currently points at record word 0; advance to path count + first square.
  load(0,routePtrSlot);mem(M.ULOAD,0,0);load(1,2);ext(X.UADD,0,0,1);
  load(1,routePtrSlot);mem(M.USTORE,0,1,0);

  for(let i=0;i<6;i++){
    const next='path_next_'+i;
    load(0,routePtrSlot);mem(M.ULOAD,0,0);mem(M.ULOAD,1,0);
    load(2,0xFFFF);cmp(1,2);branchZ(next);
    load(2,squareSlot);mem(M.USTORE,0,2,1);
    // Resolve packed-board word and nibble for this intermediate square.
    load(0,squareSlot);mem(M.ULOAD,0,0);load(2,4);ext(X.UDIV,2,0,2);
    load(3,board);ext(X.UADD,2,2,3);mem(M.ULOAD,3,2);
    load(2,3);ext(X.UAND,2,0,2);
    // The nibble index is dispatched without changing the saved packed word.
    load(2,squareSlot);mem(M.ULOAD,2,2);load(1,3);ext(X.UAND,2,2,1);
    for(let n=0;n<4;n++){load(1,n);cmp(2,1);branchZ('path_'+i+'_nib_'+n);}
    jump('invalid_geometry');
    for(let n=0;n<4;n++){
      label('path_'+i+'_nib_'+n);mem(M.UEXTRACT4,0,3,0,n);
      jump('path_'+i+'_piece');
    }
    label('path_'+i+'_piece');
    load(1,0);cmp(0,1);branchNZ('blocked_path');
    load(0,routePtrSlot);mem(M.ULOAD,0,0);ext(X.UADDI,0,0,0,1);
    load(1,routePtrSlot);mem(M.USTORE,0,1,0);
    label(next);
  }
  jump('valid');
  label('valid');finish(STATUS.VALID);
  label('invalid_geometry');finish(STATUS.INVALID_GEOMETRY);
  label('blocked_path');finish(STATUS.BLOCKED_PATH);
  label('unsupported_promotion');finish(STATUS.UNSUPPORTED_PROMOTION);

  for(const f of fixups){if(!labels.has(f.target))throw Error('unresolved label '+f.target);words[f.at]=start+labels.get(f.target);}
  if(start+words.length>65536)throw new RangeError('geometry program exceeds CPU address space');
  const oneHotWords=new Uint16Array(16);
  for(let code=1;code<=6;code++)oneHotWords[code]=1<<(code-1);
  for(let code=9;code<=14;code++)oneHotWords[code]=1<<(code-9);
  return Object.freeze({start,end:start+words.length,words,tableBase,tableWords:buildGeometryTable(side),
    oneHotBase,oneHotWords,statusAddress:status,side,scope:'PIECE_GEOMETRY_AND_SLIDING_PATH'});
}
module.exports={buildNativeMoveGeometryProgram,buildGeometryTable,PIECE_TYPE,GEOMETRY_STATUS:STATUS};
