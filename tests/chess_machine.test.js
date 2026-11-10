'use strict';
const assert=require('node:assert/strict');
const SubitCPU=require('../src/cpu/subit_cpu.js');
const {COMMAND,ABI}=require('../src/chess/chess_unit.js');
const {SubitChessUnit}=require('../src/chess/chess_unit.js');
const {SubitChessMachine}=require('../src/chess/chess_machine.js');
const {buildNativePieceDecodeProgram}=require('../examples/cpu_native_piece_decode.js');
const {buildNativePieceHistogramProgram}=require('../examples/cpu_native_piece_histogram.js');
const {buildNativeKnightMovesProgram}=require('../examples/cpu_native_knight_moves.js');
const {buildNativePawnMovesProgram}=require('../examples/cpu_native_pawn_moves.js');
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

// CPU-native piece decoder reads all 64 squares from the ABI board region.
const decodeProgram=buildNativePieceDecodeProgram(SubitCPU,{start:0x0600});
cpu2.reset();
cpu2.loadProgram(decodeProgram.words,decodeProgram.start);
const decodeRun=cpu2.run({maxSteps:500});
assert.equal(decodeRun.status,'HALTED');
assert.equal(cpu2.output.length,64);
const expected=[];
for(let sq=0;sq<64;sq++) expected.push(require('../src/chess/chess_unit.js').encodePiece(unit2.position.board[7-(sq>>>3)][sq&7]));
assert.deepEqual(cpu2.output,expected);
assert.equal(cpu2.output.filter(x=>x!==0).length,32);

// CPU-native histogram counts every exact piece code, not merely occupied words.
cpu2.reset();
const histogramProgram=buildNativePieceHistogramProgram(SubitCPU,{start:0x0800,histogramAddress:0x0300});
cpu2.loadProgram(histogramProgram.words,histogramProgram.start);
const histogramRun=cpu2.run({maxSteps:2000});
assert.equal(histogramRun.status,'HALTED');
assert.equal(cpu2.output.length,15);
assert.deepEqual(cpu2.output,[32,8,2,2,2,1,1,0,0,8,2,2,2,1,1]);

// CPU-native white-knight pseudo-legal generation on the initial board.
cpu2.reset();
const knightProgram=buildNativeKnightMovesProgram(SubitCPU,{side:'w',start:0x1000});
cpu2.loadProgram(knightProgram.words,knightProgram.start);
const knightRun=cpu2.run({maxSteps:50000});
assert.equal(knightRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],4);
const knightMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+4)).sort((a,b)=>a-b);
const expectedKnightMoves=[
  ((1&63)<<10)|((16&63)<<4), ((1&63)<<10)|((18&63)<<4),
  ((6&63)<<10)|((21&63)<<4), ((6&63)<<10)|((23&63)<<4)
].sort((a,b)=>a-b);
assert.deepEqual(knightMoves,expectedKnightMoves);

// Runtime side guard: a white generator must not run when black is to move.
cpu2.reset(); cpu2.memory[ABI.FLAGS]=1;
const wrongSideProgram=buildNativeKnightMovesProgram(SubitCPU,{side:'w',start:0x1000});
cpu2.loadProgram(wrongSideProgram.words,wrongSideProgram.start);
const wrongSideRun=cpu2.run({maxSteps:50000});
assert.equal(wrongSideRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],0);

// Black-side knight generation on the same initial position.
cpu2.reset(); cpu2.memory[ABI.FLAGS]=1;
const blackKnightProgram=buildNativeKnightMovesProgram(SubitCPU,{side:'b',start:0x1000});
cpu2.loadProgram(blackKnightProgram.words,blackKnightProgram.start);
const blackKnightRun=cpu2.run({maxSteps:50000});
assert.equal(blackKnightRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],4);
const blackKnightMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+4)).sort((a,b)=>a-b);
const expectedBlackKnightMoves=[
  ((57&63)<<10)|((40&63)<<4), ((57&63)<<10)|((42&63)<<4),
  ((62&63)<<10)|((45&63)<<4), ((62&63)<<10)|((47&63)<<4)
].sort((a,b)=>a-b);
assert.deepEqual(blackKnightMoves,expectedBlackKnightMoves);

// CPU-native white pawn generation: one-step and initial two-step advances.
cpu2.reset(); cpu2.memory[ABI.FLAGS]=0;
const whitePawnProgram=buildNativePawnMovesProgram(SubitCPU,{side:'w',start:0x2000});
cpu2.loadProgram(whitePawnProgram.words,whitePawnProgram.start);
const whitePawnRun=cpu2.run({maxSteps:100000});
assert.equal(whitePawnRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],16);
const whitePawnMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+16)).sort((a,b)=>a-b);
const expectedWhitePawnMoves=[];
for(let from=8;from<16;from++){
  expectedWhitePawnMoves.push((from<<10)|((from+8)<<4));
  expectedWhitePawnMoves.push((from<<10)|((from+16)<<4));
}
expectedWhitePawnMoves.sort((a,b)=>a-b);
assert.deepEqual(whitePawnMoves,expectedWhitePawnMoves);

// CPU-native black pawn generation on the same initial board.
cpu2.reset(); cpu2.memory[ABI.FLAGS]=1;
const blackPawnProgram=buildNativePawnMovesProgram(SubitCPU,{side:'b',start:0x2000});
cpu2.loadProgram(blackPawnProgram.words,blackPawnProgram.start);
const blackPawnRun=cpu2.run({maxSteps:100000});
assert.equal(blackPawnRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],16);
const blackPawnMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+16)).sort((a,b)=>a-b);
const expectedBlackPawnMoves=[];
for(let from=48;from<56;from++){
  expectedBlackPawnMoves.push((from<<10)|((from-8)<<4));
  expectedBlackPawnMoves.push((from<<10)|((from-16)<<4));
}
expectedBlackPawnMoves.sort((a,b)=>a-b);
assert.deepEqual(blackPawnMoves,expectedBlackPawnMoves);

// Promotion and diagonal capture: a7 pawn can advance to a8 or capture b8.
cpu2.reset(); cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
function putPiece(square,code){
  const address=ABI.BOARD+(square>>>2), shift=(3-(square&3))*4;
  cpu2.memory[address]=(cpu2.memory[address]&~(15<<shift))|((code&15)<<shift);
}
putPiece(48,1); // White pawn a7
putPiece(57,12); // Black rook b8
cpu2.memory[ABI.FLAGS]=0;
const promotionProgram=buildNativePawnMovesProgram(SubitCPU,{side:'w',start:0x2000});
cpu2.loadProgram(promotionProgram.words,promotionProgram.start);
const promotionRun=cpu2.run({maxSteps:100000});
assert.equal(promotionRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],8);
const promotionMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+8)).sort((a,b)=>a-b);
const expectedPromotionMoves=[];
for(const to of [56,57])for(const promo of [1,2,3,4])
  expectedPromotionMoves.push((48<<10)|(to<<4)|(promo<<1));
expectedPromotionMoves.sort((a,b)=>a-b);
assert.deepEqual(promotionMoves,expectedPromotionMoves);

console.log('SUBIT-CHESS machine bridge v0.1 tests: OK');
