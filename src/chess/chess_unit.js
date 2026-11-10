'use strict';

/**
 * SUBIT-CHESS ABI v0.1 — memory-mapped Chess Unit.
 * Board square index: a1=0 .. h8=63. Board nibble order: square 4k
 * occupies bits 15..12, then 4k+1, 4k+2, 4k+3.
 * Piece nibble: 0 empty; 1..6 = P,N,B,R,Q,K; add 8 for black.
 */
const ABI = Object.freeze({
  BOARD:0x0000, BOARD_WORDS:16,
  FLAGS:0x0010, EP:0x0011, HALFMOVE:0x0012, FULLMOVE:0x0013,
  HASH_LO:0x0014, HASH_HI:0x0015,
  COMMAND:0x0020, STATUS:0x0021, LEGAL_COUNT:0x0022,
  MOVE_INDEX:0x0023, MOVE_DATA:0x0024, EVAL_LO:0x0025,
  EVAL_HI:0x0026, RESULT:0x0027, ERROR:0x0028,
  TX:0x0030, MOVE_BUFFER:0x0100, MOVE_BUFFER_WORDS:0x0100
});
const COMMAND = Object.freeze({ INIT:1, GEN_LEGAL:2, TRY_MOVE:3, UNDO:4,
  EVAL:5, HASH:6, STATUS:7, STAGE_MOVE:8, VALIDATE:9 });
const STATUS = Object.freeze({ IDLE:0, READY:1, OK:2, ILLEGAL:3, GAME_OVER:4, ERROR:0xFFFF });
const ERROR = Object.freeze({ NONE:0, BAD_COMMAND:1, BAD_MOVE:2, NO_UNDO:3, NO_POSITION:4, CAPACITY:5 });
const RESULT = Object.freeze({ NONE:0, WHITE:1, BLACK:2, DRAW:3 });
const PROMO = Object.freeze({ NONE:0,Q:1,R:2,B:3,N:4 });
const PROMO_CHAR = Object.freeze({1:'Q',2:'R',3:'B',4:'N'});
const PIECE = Object.freeze({P:1,N:2,B:3,R:4,Q:5,K:6});

function squareIndex(r,c){ return (7-r)*8+c; }
function encodePiece(p){
  if(!p || p==='.') return 0;
  const t=PIECE[p.toUpperCase()];
  if(!t) throw new Error('UNKNOWN_PIECE:'+p);
  return t+(p===p.toLowerCase()?8:0);
}
function encodeMove(m){
  const from=squareIndex(m.from[0],m.from[1]), to=squareIndex(m.to[0],m.to[1]);
  const promo=m.promo ? PROMO[m.promo.toUpperCase()] : 0;
  if(promo===undefined) throw new Error('BAD_PROMOTION');
  return ((from&63)<<10)|((to&63)<<4)|((promo&7)<<1);
}
function decodeMove(word){
  word=Number(word)&0xFFFF;
  if(word&1) throw new Error('MOVE_RESERVED_BIT');
  const from=(word>>>10)&63,to=(word>>>4)&63,promo=(word>>>1)&7;
  if(promo>4) throw new Error('BAD_PROMOTION');
  return {from:[7-(from>>>3),from&7],to:[7-(to>>>3),to&7],
    promo:PROMO_CHAR[promo]||null};
}
function write32(mem,lo,hi,n){
  const x=Number(n)>>>0; mem[lo]=x&0xFFFF; mem[hi]=(x>>>16)&0xFFFF;
}
function read32(mem,lo,hi){ return ((mem[hi]<<16)|mem[lo])>>>0; }

class SubitChessUnit {
  constructor(cpu,chessApi,options={}){
    if(!cpu || !cpu.memory || cpu.memory.length!==65536) throw new TypeError('SUBIT-CPU instance required');
    for(const k of ['initPosition','legalMoves','makeMove','unmakeMove','gameStatus','evalMaterial','toFEN'])
      if(!chessApi || typeof chessApi[k]!=='function') throw new TypeError('chessApi.'+k+' required');
    this.cpu=cpu; this.mem=cpu.memory; this.chess=chessApi;
    this.position=null; this.undoStack=[]; this.staged=null;
    this.maxMoves=Math.min(options.maxMoves||256,ABI.MOVE_BUFFER_WORDS);
    this.syncStatus(STATUS.IDLE,ERROR.NONE);
  }
  syncBoard(){
    const p=this.position, m=this.mem;
    if(!p) return;
    for(let w=0;w<16;w++){
      let v=0;
      for(let j=0;j<4;j++){
        const sq=w*4+j, r=7-(sq>>>3), c=sq&7;
        v=(v<<4)|encodePiece(p.board[r][c]);
      }
      m[ABI.BOARD+w]=v;
    }
    let f=p.turn==='b'?1:0;
    if(p.castling.K)f|=2; if(p.castling.Q)f|=4;
    if(p.castling.k)f|=8; if(p.castling.q)f|=16;
    m[ABI.FLAGS]=f;
    m[ABI.EP]=p.ep ? squareIndex(p.ep[0],p.ep[1]) : 0xFFFF;
    m[ABI.HALFMOVE]=p.halfmove&0xFFFF; m[ABI.FULLMOVE]=p.fullmove&0xFFFF;
    write32(m,ABI.HASH_LO,ABI.HASH_HI,p.hash||this.chess.fullHash?.(p)||0);
    m[ABI.TX+0]=this.undoStack.length&0xFFFF;
    m[ABI.TX+1]=this.staged===null?0:1;
  }
  syncStatus(status,error=ERROR.NONE,result=RESULT.NONE){
    this.mem[ABI.STATUS]=status; this.mem[ABI.ERROR]=error; this.mem[ABI.RESULT]=result;
  }
  writeMoves(moves){
    if(moves.length>this.maxMoves){ this.mem[ABI.LEGAL_COUNT]=0; this.syncStatus(STATUS.ERROR,ERROR.CAPACITY); return false; }
    this.mem[ABI.LEGAL_COUNT]=moves.length;
    for(let i=0;i<moves.length;i++) this.mem[ABI.MOVE_BUFFER+i]=encodeMove(moves[i]);
    for(let i=moves.length;i<this.maxMoves;i++) this.mem[ABI.MOVE_BUFFER+i]=0;
    return true;
  }
  currentLegal(){ return this.chess.legalMoves(this.position); }
  resolveMove(word){
    const d=decodeMove(word);
    return this.currentLegal().find(m=>m.from[0]===d.from[0]&&m.from[1]===d.from[1]&&
      m.to[0]===d.to[0]&&m.to[1]===d.to[1]&&
      (d.promo ? m.promo===d.promo : !m.promo))||null;
  }
  statusCommand(){
    const s=this.chess.gameStatus(this.position);
    if(!s.over){ this.syncStatus(STATUS.READY); return s; }
    const result=s.result==='white'?RESULT.WHITE:s.result==='black'?RESULT.BLACK:RESULT.DRAW;
    this.syncStatus(STATUS.GAME_OVER,ERROR.NONE,result); return s;
  }
  dispatch(command=this.mem[ABI.COMMAND]){
    try {
      if(command===COMMAND.INIT){
        this.position=this.chess.initPosition(); this.undoStack=[]; this.staged=null;
        this.syncBoard(); this.mem[ABI.LEGAL_COUNT]=0; this.syncStatus(STATUS.READY);
        return {ok:true,command,fen:this.chess.toFEN(this.position)};
      }
      if(!this.position){ this.syncStatus(STATUS.ERROR,ERROR.NO_POSITION); return {ok:false,error:ERROR.NO_POSITION}; }
      if(command===COMMAND.GEN_LEGAL){
        const moves=this.currentLegal(); const ok=this.writeMoves(moves);
        if(ok) this.syncStatus(STATUS.OK);
        return {ok,moves:moves.length};
      }
      if(command===COMMAND.STAGE_MOVE || command===COMMAND.VALIDATE){
        const move=this.resolveMove(this.mem[ABI.MOVE_DATA]);
        this.staged=move;
        this.mem[ABI.TX+1]=move?1:0;
        this.syncStatus(move?STATUS.OK:STATUS.ILLEGAL,move?ERROR.NONE:ERROR.BAD_MOVE);
        return {ok:!!move,move:move?this.chess.moveToUci?.(move)||move:null};
      }
      if(command===COMMAND.TRY_MOVE){
        const move=this.resolveMove(this.mem[ABI.MOVE_DATA]);
        if(!move){ this.syncStatus(STATUS.ILLEGAL,ERROR.BAD_MOVE); return {ok:false,error:ERROR.BAD_MOVE}; }
        const undo=this.chess.makeMove(this.position,move);
        this.undoStack.push(undo); this.staged=null;
        this.syncBoard(); this.statusCommand();
        return {ok:true,fen:this.chess.toFEN(this.position)};
      }
      if(command===COMMAND.UNDO){
        const undo=this.undoStack.pop();
        if(!undo){ this.syncStatus(STATUS.ERROR,ERROR.NO_UNDO); return {ok:false,error:ERROR.NO_UNDO}; }
        this.chess.unmakeMove(this.position,undo); this.staged=null;
        this.syncBoard(); this.syncStatus(STATUS.READY);
        return {ok:true,fen:this.chess.toFEN(this.position)};
      }
      if(command===COMMAND.EVAL){
        const score=this.chess.evalMaterial(this.position)|0;
        write32(this.mem,ABI.EVAL_LO,ABI.EVAL_HI,score>>>0);
        this.syncStatus(STATUS.OK); return {ok:true,score};
      }
      if(command===COMMAND.HASH){
        const h=this.chess.fullHash?this.chess.fullHash(this.position):this.position.hash;
        write32(this.mem,ABI.HASH_LO,ABI.HASH_HI,h>>>0);
        this.syncStatus(STATUS.OK); return {ok:true,hash:h>>>0};
      }
      if(command===COMMAND.STATUS){ const s=this.statusCommand(); return {ok:true,status:s}; }
      this.syncStatus(STATUS.ERROR,ERROR.BAD_COMMAND);
      return {ok:false,error:ERROR.BAD_COMMAND};
    } catch(e){
      this.syncStatus(STATUS.ERROR,ERROR.BAD_MOVE);
      return {ok:false,error:ERROR.BAD_MOVE,message:String(e&&e.message||e)};
    }
  }
}
const exported={ABI,COMMAND,STATUS,ERROR,RESULT,PROMO,encodeMove,decodeMove,encodePiece,SubitChessUnit};
if(typeof module!=='undefined'&&module.exports) module.exports=exported;
if(typeof globalThis!=='undefined') globalThis.SubitChessUnit=exported;
