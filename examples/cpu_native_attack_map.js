'use strict';

/**
 * CPU-native attack-map builder.
 *
 * Each program marks attacked squares in a 64-word map:
 *   memory[attackMapAddress + square] = 1
 *
 * Families are separate bounded passes:
 * pawn, knight, king, diagonal (bishop/queen), orthogonal (rook/queen).
 * Run all five passes for the same side. The first pass clears the map;
 * subsequent passes set clearMap:false and accumulate into it.
 *
 * Unlike move generation, pawn diagonals are marked regardless of target
 * occupancy. Sliding rays mark the first occupied square and then stop.
 * This is an attack map, not a legal-move map.
 */
function buildNativeAttackMapProgram(CPU, options = {}) {
  if (!CPU || !CPU.encode || !CPU.encodeExtended || !CPU.OPCODE || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const side=options.side??'w', family=options.family??'pawn';
  if(side!=='w'&&side!=='b') throw new RangeError("side must be 'w' or 'b'");
  const families=['pawn','knight','king','diagonal','orthogonal'];
  if(!families.includes(family)) throw new RangeError('unknown attack family');
  const start=options.start??0x5000, board=options.boardAddress??0;
  const flags=options.flagsAddress??0x10, map=options.attackMapAddress??0x400;
  const clearMap=options.clearMap!==false;
  if(!Number.isInteger(start)||start<0||start>0xffff||
     !Number.isInteger(board)||board<0||board+16>65536||
     !Number.isInteger(flags)||flags<0||flags>0xffff||
     !Number.isInteger(map)||map<0||map+64>65536) throw new RangeError('invalid address');
  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const label=n=>{if(labels.has(n))throw Error('duplicate label '+n);labels.set(n,words.length);};
  const emit=(...v)=>words.push(...v);
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branch=(condition,target)=>{
    const inverse=condition===0?1:0;
    ext(X.XBR,inverse,0,0,2);jump(target);
  };
  const mark=sq=>{load(1,map+sq);load(2,1);mem(M.USTORE,0,1,2);};
  const readPiece=sq=>{
    load(1,board+(sq>>>2));mem(M.ULOAD,0,1);mem(M.UEXTRACT4,0,0,0,sq&3);
  };
  const ownCodes=side==='w'?[1,2,3,4,5,6]:[9,10,11,12,13,14];
  const codeFor={pawn:side==='w'?1:9,knight:side==='w'?2:10,king:side==='w'?6:14};
  if(clearMap){for(let sq=0;sq<64;sq++){load(1,map+sq);load(2,0);mem(M.USTORE,0,1,2);}}
  load(1,flags);mem(M.ULOAD,0,1);load(2,1);ext(X.UAND,0,0,2);
  load(1,side==='w'?0:1);cmp(0,1);
  const wrong='wrong_side';branch(1,wrong);

  if(family==='pawn'||family==='knight'||family==='king'){
    const offsets=family==='pawn'
      ? (side==='w'?[[1,1],[-1,1]]:[[1,-1],[-1,-1]])
      : family==='knight'?[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]
      : [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]];
    const piece=codeFor[family];
    for(let from=0;from<64;from++){
      const f=from&7,r=from>>>3,valid=offsets.map(([df,dr])=>[f+df,r+dr])
        .filter(([tf,tr])=>tf>=0&&tf<8&&tr>=0&&tr<8).map(([tf,tr])=>tr*8+tf);
      if(!valid.length)continue;
      const skip='src_'+from+'_skip';
      readPiece(from);load(2,piece);cmp(0,2);branch(1,skip);
      for(const to of valid)mark(to);
      label(skip);
    }
  } else {
    const diagonal=family==='diagonal';
    const dirs=diagonal?[[1,1],[-1,1],[1,-1],[-1,-1]]:[[0,1],[0,-1],[1,0],[-1,0]];
    const bishop=side==='w'?3:11,rook=side==='w'?4:12,queen=side==='w'?5:13;
    for(let from=0;from<64;from++){
      const f0=from&7,r0=from>>>3;
      for(let d=0;d<dirs.length;d++){
        const [df,dr]=dirs[d],ray='ray_'+from+'_'+d,skip=ray+'_skip';
        const targets=[];let f=f0+df,r=r0+dr;
        while(f>=0&&f<8&&r>=0&&r<8){targets.push(r*8+f);f+=df;r+=dr;}
        if(!targets.length)continue;
        readPiece(from);load(2,diagonal?bishop:rook);cmp(0,2);
        branch(0,ray+'_active');
        load(2,queen);cmp(0,2);branch(1,skip);
        label(ray+'_active');
        for(const to of targets){
          mark(to);
          readPiece(to);load(2,0);cmp(0,2);
          // Empty continues; any occupied square terminates this ray.
          branch(1,ray+'_continue_'+to);
          jump(skip);
          label('ray_'+from+'_'+d+'_continue_'+to);
        }
        label(skip);
      }
    }
  }
  emit(CPU.encode(O.HALT));
  label(wrong);emit(CPU.encode(O.HALT));
  for(const f of fixups){if(!labels.has(f.target))throw Error('unresolved label '+f.target);words[f.at]=start+labels.get(f.target);}
  if(start+words.length>65536)throw new RangeError('attack-map program exceeds CPU address space');
  return Object.freeze({start,end:start+words.length,words,side,family,clearMap,attackMapAddress:map,
    attackMapWords:64,scope:'CPU_NATIVE_ATTACK_MAP'});
}
module.exports={buildNativeAttackMapProgram};
