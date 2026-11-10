'use strict';

/**
 * CPU-native King Safety Probe.
 *
 * Input:
 *   packed board at boardAddress (16 words, four piece nibbles per word)
 *   ABI side-to-move bit at flagsAddress (bit 0: 0 white, 1 black)
 *   attack map at attackMapAddress (64 words; non-zero means attacked)
 *
 * Output at resultAddress:
 *   [0] status: 0 NO_KING, 1 SAFE, 2 CHECK, 3 MULTIPLE_KINGS, 4 WRONG_SIDE
 *   [1] king square (a1=0 .. h8=63), or 0xFFFF when absent/invalid
 *
 * This is a probe, not a complete legal-move filter. The caller must build
 * the opponent attack map for the post-move board before running this program.
 */
function buildNativeKingSafetyProbeProgram(CPU, options = {}) {
  if (!CPU || !CPU.encode || !CPU.encodeExtended || !CPU.OPCODE || !CPU.MOP || !CPU.XOP) {
    throw new TypeError('SUBIT-CPU encoding API required');
  }
  const side=options.side??'w';
  if(side!=='w'&&side!=='b')throw new RangeError("side must be 'w' or 'b'");
  const start=options.start??0x7000;
  const board=options.boardAddress??0x0000;
  const flags=options.flagsAddress??0x0010;
  const attackMap=options.attackMapAddress??0x0400;
  const result=options.resultAddress??0x0340;
  if(!Number.isInteger(start)||start<0||start>0xffff||
     !Number.isInteger(board)||board<0||board+16>65536||
     !Number.isInteger(flags)||flags<0||flags>0xffff||
     !Number.isInteger(attackMap)||attackMap<0||attackMap+64>65536||
     !Number.isInteger(result)||result<0||result+2>65536)throw new RangeError('invalid address');

  const O=CPU.OPCODE,M=CPU.MOP,X=CPU.XOP,words=[],labels=new Map(),fixups=[];
  const label=n=>{if(labels.has(n))throw Error('duplicate label '+n);labels.set(n,words.length);};
  const emit=(...v)=>words.push(...v);
  const load=(r,v)=>emit(CPU.encode(O.LOADI,r),v&0xffff);
  const mem=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.MEM_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const ext=(op,rd=0,ra=0,rb=0,imm=0)=>emit(CPU.EXT_PREFIX,CPU.encodeExtended(op,rd,ra,rb,imm)[1]);
  const cmp=(a,b)=>ext(X.UCMP,0,a,b,0);
  const jump=target=>{emit(CPU.encode(O.JMP),0);fixups.push({at:words.length-1,target});};
  const branch=(condition,target)=>{
    if(condition!==0&&condition!==1)throw new RangeError('branch supports Z/NZ');
    ext(X.XBR,condition===0?1:0,0,0,2);
    jump(target);
  };
  const store=(address,value)=>{
    load(1,address);load(2,value);mem(M.USTORE,0,1,2);
  };

  // Deterministic output initialization: invalid/absent king uses square 0xFFFF.
  store(result,0);
  store(result+1,0xffff);

  // Runtime side guard.
  load(1,flags);mem(M.ULOAD,0,1);
  load(1,1);ext(X.UAND,0,0,1);
  load(1,side==='w'?0:1);cmp(0,1);
  branch(1,'wrong_side');

  // URF[3] is the number of kings found (saturated at two).
  load(3,0);
  const kingCode=side==='w'?6:14;
  for(let square=0;square<64;square++){
    const next='square_'+square+'_next';
    const multiple='multiple_kings';
    load(1,board+(square>>>2));mem(M.ULOAD,0,1);
    mem(M.UEXTRACT4,0,0,0,square&3);
    load(1,kingCode);cmp(0,1);
    branch(1,next); // Not this side's king.
    load(1,0);cmp(3,1);
    branch(1,multiple); // A second king is an invalid position.
    load(3,1);
    store(result+1,square);
    load(1,attackMap+square);mem(M.ULOAD,0,1);
    load(1,0);cmp(0,1);
    branch(1,'attacked_'+square);
    store(result,1); // SAFE
    jump(next+'_done');
    label('attacked_'+square);
    store(result,2); // CHECK
    label(next+'_done');
    label(next);
  }

  // If no king was found, status remains NO_KING.
  emit(CPU.encode(O.HALT));
  label('multiple_kings');
  store(result,3);
  store(result+1,0xffff);
  emit(CPU.encode(O.HALT));
  label('wrong_side');
  store(result,4);
  store(result+1,0xffff);
  emit(CPU.encode(O.HALT));

  for(const f of fixups){
    if(!labels.has(f.target))throw Error('unresolved label '+f.target);
    words[f.at]=start+labels.get(f.target);
  }
  if(start+words.length>65536)throw new RangeError('king-safety program exceeds CPU address space');
  return Object.freeze({start,end:start+words.length,words,side,boardAddress:board,
    attackMapAddress:attackMap,resultAddress:result,scope:'KING_SAFETY_PROBE'});
}

module.exports={buildNativeKingSafetyProbeProgram};
