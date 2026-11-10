'use strict';
const assert=require('node:assert/strict');
const {SubitCPU}=require('../src/cpu/subit_cpu.js');
const {ABI,COMMAND,STATUS,ERROR,encodeMove,decodeMove,SubitChessUnit}=require('../src/chess/chess_unit.js');

function pos0(){
 const board=Array.from({length:8},()=>Array(8).fill('.'));
 board[7]=['R','N','B','Q','K','B','N','R']; board[6]=Array(8).fill('P');
 board[0]=['r','n','b','q','k','b','n','r']; board[1]=Array(8).fill('p');
 return {board,turn:'w',castling:{K:true,Q:true,k:true,q:true},ep:null,halfmove:0,fullmove:1,hash:0x12345678};
}
function m(from,to){return {from,to};}
const e2e4=m([6,4],[4,4]), e7e5=m([1,4],[3,4]);
const api={
 initPosition:pos0,
 legalMoves(p){return p.turn==='w'?[e2e4]:[e7e5];},
 makeMove(p,mv){
  const u={from:mv.from,to:mv.to,piece:p.board[mv.from[0]][mv.from[1]],turn:p.turn,hash:p.hash};
  p.board[mv.to[0]][mv.to[1]]=u.piece;p.board[mv.from[0]][mv.from[1]]='.';
  p.turn=p.turn==='w'?'b':'w';p.hash=(p.hash+1)>>>0;return u;
 },
 unmakeMove(p,u){p.board[u.from[0]][u.from[1]]=u.piece;p.board[u.to[0]][u.to[1]]='.';p.turn=u.turn;p.hash=u.hash;},
 gameStatus(){return {over:false};},
 evalMaterial(){return 125;},
 toFEN(p){return p.turn+':'+p.hash;},
 fullHash(p){return p.hash;},
 moveToUci(mv){return 'e2e4';}
};
function command(unit,c){unit.cpu.memory[ABI.COMMAND]=c;return unit.dispatch();}
const cpu=new SubitCPU(), unit=new SubitChessUnit(cpu,api);
assert.equal(command(unit,COMMAND.INIT).ok,true);
assert.equal(cpu.memory[ABI.BOARD],0x4823); // a1..d1: R,N,B,Q
assert.equal(cpu.memory[ABI.FLAGS],30);
assert.equal(cpu.memory[ABI.EP],0xFFFF);
assert.equal(command(unit,COMMAND.GEN_LEGAL).moves,1);
assert.equal(cpu.memory[ABI.LEGAL_COUNT],1);
const packed=cpu.memory[ABI.MOVE_BUFFER];
assert.deepEqual(decodeMove(packed),{from:[6,4],to:[4,4],promo:null});
assert.equal(encodeMove(e2e4),0x31C0);
cpu.memory[ABI.MOVE_DATA]=packed;
assert.equal(command(unit,COMMAND.STAGE_MOVE).ok,true);
assert.equal(cpu.memory[ABI.STATUS],STATUS.OK);
assert.equal(unit.position.board[6][4],'P'); // staging is non-mutating
assert.equal(command(unit,COMMAND.TRY_MOVE).ok,true);
assert.equal(unit.position.board[4][4],'P');
assert.equal(unit.position.turn,'b');
assert.equal(cpu.memory[ABI.TX],1);
assert.equal(command(unit,COMMAND.EVAL).score,125);
assert.equal(cpu.memory[ABI.EVAL_LO],125);
assert.equal(command(unit,COMMAND.HASH).hash,0x12345679);
assert.equal(command(unit,COMMAND.UNDO).ok,true);
assert.equal(unit.position.board[6][4],'P');
assert.equal(unit.position.turn,'w');
assert.equal(cpu.memory[ABI.TX],0);
cpu.memory[ABI.MOVE_DATA]=0x0001;
assert.equal(command(unit,COMMAND.VALIDATE).ok,false);
assert.equal(cpu.memory[ABI.ERROR],ERROR.BAD_MOVE);
assert.equal(cpu.memory[ABI.STATUS],STATUS.ILLEGAL);
console.log('SUBIT-CHESS ABI v0.1 tests: OK');
