'use strict';

/**
 * CPU-native pseudo-legal sliding move generator (bishop, rook, queen).
 *
 * The assembler unrolls all rays. At runtime the CPU reads piece codes,
 * follows each ray until its first blocker, emits empty-square moves and
 * at most one enemy capture. King safety is deliberately out of scope.
 */
function buildNativeSlidingMovesProgram(CPU, options = {}) {
  if (!CPU || !CPU.encode || !CPU.encodeExtended || !CPU.OPCODE || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const side = options.side ?? 'w';
  if (side !== 'w' && side !== 'b') throw new RangeError("side must be 'w' or 'b'");
  const start = options.start ?? 0x1000;
  const boardAddress = options.boardAddress ?? 0;
  const flagsAddress = options.flagsAddress ?? 0x10;
  const countAddress = options.countAddress ?? 0x22;
  const moveBufferAddress = options.moveBufferAddress ?? 0x100;
  if (!Number.isInteger(start) || start < 0 || start > 0xffff ||
      !Number.isInteger(boardAddress) || boardAddress < 0 || boardAddress + 16 > 65536 ||
      ![flagsAddress,countAddress,moveBufferAddress].every(Number.isInteger) ||
      flagsAddress < 0 || flagsAddress > 0xffff || countAddress < 0 || countAddress > 0xffff ||
      moveBufferAddress < 0 || moveBufferAddress + 256 > 65536) throw new RangeError('invalid address');

  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const label=n=>{if(labels.has(n))throw Error('duplicate label: '+n);labels.set(n,words.length);};
  const emit=(...xs)=>words.push(...xs);
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branch=(condition,target)=>{
    const inverse=condition===0?1:0;
    ext(X.XBR,inverse,0,0,2);jump(target);
  };
  const branchWhenFalse=(condition,target)=>{ext(X.XBR,condition,0,0,2);jump(target);};
  const emitMove=(from,to)=>{
    load(1,moveBufferAddress);ext(X.UADD,1,1,3);
    load(2,((from&63)<<10)|((to&63)<<4));mem(M.USTORE,0,1,2);
    ext(X.UADDI,3,3,0,1);
  };

  // Clear result before checking the runtime side.
  load(1,countAddress);load(2,0);mem(M.USTORE,0,1,2);
  load(1,flagsAddress);mem(M.ULOAD,0,1);
  load(2,1);ext(X.UAND,0,0,2);
  load(1,side==='w'?0:1);cmp(0,1);
  branch(1,'wrong_side');
  load(3,0);

  const dirs=[
    {name:'NE',df:1,dr:1,kind:'B'},{name:'NW',df:-1,dr:1,kind:'B'},
    {name:'SE',df:1,dr:-1,kind:'B'},{name:'SW',df:-1,dr:-1,kind:'B'},
    {name:'N',df:0,dr:1,kind:'R'},{name:'S',df:0,dr:-1,kind:'R'},
    {name:'E',df:1,dr:0,kind:'R'},{name:'W',df:-1,dr:0,kind:'R'}
  ];
  const bishop=side==='w'?3:11, rook=side==='w'?4:12, queen=side==='w'?5:13;
  const threshold=side==='w'?9:8;

  for(let from=0;from<64;from++){
    const file=from&7,rank=from>>>3;
    for(const dir of dirs){
      const ray=from+'_'+dir.name, end=ray+'_end';
      let targets=[],f=file+dir.df,r=rank+dir.dr;
      while(f>=0&&f<8&&r>=0&&r<8){targets.push(r*8+f);f+=dir.df;r+=dir.dr;}
      if(!targets.length)continue;

      // A diagonal ray belongs to bishop or queen; orthogonal to rook or queen.
      load(1,boardAddress+(from>>>2));mem(M.ULOAD,0,1);mem(M.UEXTRACT4,0,0,0,from&3);
      load(2,dir.kind==='B'?bishop:rook);cmp(0,2);
      branch(0,ray+'_active');
      load(2,queen);cmp(0,2);
      branch(1,end);
      label(ray+'_active');

      for(let i=0;i<targets.length;i++){
        const to=targets[i],stem=ray+'_t'+i,empty=stem+'_empty',enemy=stem+'_enemy';
        load(1,boardAddress+(to>>>2));mem(M.ULOAD,2,1);mem(M.UEXTRACT4,2,2,0,to&3);
        load(1,0);cmp(2,1);
        branch(0,empty);
        // Non-empty square: C marks codes >= threshold.
        load(1,0x10000-threshold);ext(X.UADD,1,2,1);
        if(side==='w'){
          branchWhenFalse(3,end); // C=0: own piece blocks the ray.
          emitMove(from,to);jump(end); // enemy capture terminates the ray.
        } else {
          branchWhenFalse(3,enemy); // C=0: white piece is capturable.
          jump(end); // C=1: own black piece blocks the ray.
          label(enemy);emitMove(from,to);jump(end);
        }
        label(empty);emitMove(from,to);
      }
      label(end);
    }
  }
  load(1,countAddress);mem(M.USTORE,0,1,3);
  emit(CPU.encode(O.HALT));
  label('wrong_side');emit(CPU.encode(O.HALT));
  for(const f of fixups){
    if(!labels.has(f.target))throw Error('unresolved label: '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(start+words.length>65536)throw new RangeError('generated program exceeds CPU address space');
  return Object.freeze({start,end:start+words.length,words,side,moveCapacity:256,
    moveCountAddress:countAddress,moveBufferAddress,scope:'SLIDING_PSEUDO_LEGAL'});
}

module.exports={buildNativeSlidingMovesProgram};
