'use strict';
const assert=require('node:assert/strict');
const SubitCPU=require('../src/cpu/subit_cpu.js');
const {COMMAND,ABI}=require('../src/chess/chess_unit.js');
const {SubitChessUnit}=require('../src/chess/chess_unit.js');
const {SubitChessMachine}=require('../src/chess/chess_machine.js');
const board=Array.from({length:8},()=>Array(8).fill('.'));
board[7]=['R','N','B','Q','K','B','N','R'];board[6]=Array(8).fill('P');
board[0]=['r','n','b','q','k','b','n','r'];board[1]=Array(8).fill('p');
const p=()=>({board:board.map(r=>r.slice()),turn:'w',castling:{K:true,Q:true,k:true,q:true},ep:null,halfmove:0,fullmove:1,hash:77});
const api={
 initPosition:p,legalMoves(){return [];},makeMove(){throw Error('unused');},unmakeMove(){},
 gameStatus(){return {over:false};},evalMaterial(){return 0;},toFEN(){return 'initial';},fullHash(x){return x.hash;}
};
const cpu=new SubitCPU(),unit=new SubitChessUnit(cpu,api),machine=new SubitChessMachine(cpu,unit);
const program=machine.loadCommandProgram(COMMAND.INIT);
assert.equal(program.words.length,7);
const run=machine.run();
assert.equal(run.status,'HALTED');
assert.equal(run.steps,5);
assert.ok(unit.position);
assert.equal(cpu.memory[ABI.STATUS],1);
assert.equal(machine.peripheralLog.length,1);
assert.equal(machine.peripheralLog[0].result.ok,true);

const cpu2=new SubitCPU(),unit2=new SubitChessUnit(cpu2,api),machine2=new SubitChessMachine(cpu2,unit2);
const nativeProgram=machine2.loadNativeCommandProgram(COMMAND.INIT);
assert.equal(nativeProgram.words.length,7);
const nativeRun=machine2.run();
assert.equal(nativeRun.status,'HALTED');
assert.equal(nativeRun.steps,4);
assert.ok(unit2.position);
assert.equal(cpu2.memory[ABI.STATUS],1);
assert.equal(machine2.peripheralLog.length,1);
assert.equal(machine2.peripheralLog[0].result.ok,true);

console.log('SUBIT-CHESS machine bridge v0.1 tests: OK');
