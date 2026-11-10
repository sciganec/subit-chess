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
const {buildNativeKingMovesProgram}=require('../examples/cpu_native_king_moves.js');
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

// Black promotion and capture use the inverse pawn direction and color test.
cpu2.reset(); cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
function putBlackTestPiece(square,code){
  const address=ABI.BOARD+(square>>>2), shift=(3-(square&3))*4;
  cpu2.memory[address]=(cpu2.memory[address]&~(15<<shift))|((code&15)<<shift);
}
putBlackTestPiece(8,9); // Black pawn a2
putBlackTestPiece(1,4); // White rook b1
cpu2.memory[ABI.FLAGS]=1;
const blackPromotionProgram=buildNativePawnMovesProgram(SubitCPU,{side:'b',start:0x2000});
cpu2.loadProgram(blackPromotionProgram.words,blackPromotionProgram.start);
const blackPromotionRun=cpu2.run({maxSteps:100000});
assert.equal(blackPromotionRun.status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],8);
const blackPromotionMoves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+8)).sort((a,b)=>a-b);
const expectedBlackPromotionMoves=[];
for(const to of [0,1])for(const promo of [1,2,3,4])
  expectedBlackPromotionMoves.push((8<<10)|(to<<4)|(promo<<1));
expectedBlackPromotionMoves.sort((a,b)=>a-b);
assert.deepEqual(blackPromotionMoves,expectedBlackPromotionMoves);


 // CPU-native king pseudo-legal generation for both colors.
function setKingTestPiece(memory,square,code){
  const address=ABI.BOARD+(square>>>2), shift=(3-(square&3))*4;
  memory[address]=(memory[address]&~(15<<shift))|((code&15)<<shift);
}
function verifyKingMoves(side,kingSquare,ownSquare,enemySquare){
  cpu2.reset();
  cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
  setKingTestPiece(cpu2.memory,kingSquare,side==='w'?6:14);
  setKingTestPiece(cpu2.memory,ownSquare,side==='w'?1:9);
  setKingTestPiece(cpu2.memory,enemySquare,side==='w'?12:4);
  cpu2.memory[ABI.FLAGS]=side==='w'?0:1;
  const program=buildNativeKingMovesProgram(SubitCPU,{side,start:0x3000});
  cpu2.loadProgram(program.words,program.start);
  const result=cpu2.run({maxSteps:50000});
  assert.equal(result.status,'HALTED');
  const count=cpu2.memory[ABI.LEGAL_COUNT];
  const moves=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+count)).sort((a,b)=>a-b);
  const expected=[];
  const file=kingSquare&7, rank=kingSquare>>>3;
  for(const [df,dr] of [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]]){
    const f=file+df,r=rank+dr;
    if(f<0||f>7||r<0||r>7)continue;
    const to=r*8+f;
    if(to!==ownSquare)expected.push((kingSquare<<10)|(to<<4));
  }
  expected.sort((a,b)=>a-b);
  assert.deepEqual(moves,expected);
  return count;
}
assert.equal(verifyKingMoves('w',28,36,27),7);
assert.equal(verifyKingMoves('b',36,28,43),7);

// In a minimal blocked position both kings have no adjacent destination.
cpu2.reset();
cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
setKingTestPiece(cpu2.memory,4,6);
for(const sq of [3,5,11,12,13])setKingTestPiece(cpu2.memory,sq,1);
setKingTestPiece(cpu2.memory,60,14);
for(const sq of [51,52,53,59,61])setKingTestPiece(cpu2.memory,sq,9);
let kingInitial=buildNativeKingMovesProgram(SubitCPU,{side:'w',start:0x3000});
cpu2.loadProgram(kingInitial.words,kingInitial.start);
assert.equal(cpu2.run({maxSteps:50000}).status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],0);
cpu2.reset();cpu2.memory[ABI.FLAGS]=1;
kingInitial=buildNativeKingMovesProgram(SubitCPU,{side:'b',start:0x3000});
cpu2.loadProgram(kingInitial.words,kingInitial.start);
assert.equal(cpu2.run({maxSteps:50000}).status,'HALTED');
assert.equal(cpu2.memory[ABI.LEGAL_COUNT],0);



// CPU-native bishop/rook/queen rays stop at the first blocker and capture only
// the first enemy piece. Compare both colors against a small independent oracle.
const {buildNativeSlidingMovesProgram}=require('../examples/cpu_native_sliding_moves.js');
function verifySliding(side){
  cpu2.reset();
  cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
  const pieces=side==='w'
    ? [[27,3],[28,4],[29,5],[35,1],[19,9],[30,1],[44,12],[20,9]]
    : [[27,11],[28,12],[29,13],[35,9],[19,1],[30,9],[44,4],[20,1]];
  for(const [sq,code] of pieces)setKingTestPiece(cpu2.memory,sq,code);
  cpu2.memory[ABI.FLAGS]=side==='w'?0:1;
  const expected=[];
  const dirs=[[1,1],[-1,1],[1,-1],[-1,-1],[0,1],[0,-1],[1,0],[-1,0]];
  const own=side==='w'?code=>code>=1&&code<=6:code=>code>=9&&code<=14;
  for(const [from,code] of pieces){
    if(side==='w' ? code<3||code>5 : code<11||code>13)continue;
    for(let d=0;d<dirs.length;d++){
      const [df,dr]=dirs[d],diag=d<4;
      if(diag ? (code!==3+(side==='w'?0:8)&&code!==5+(side==='w'?0:8))
              : (code!==4+(side==='w'?0:8)&&code!==5+(side==='w'?0:8)))continue;
      let f=(from&7)+df,r=(from>>>3)+dr;
      while(f>=0&&f<8&&r>=0&&r<8){
        const to=r*8+f, target=pieces.find(x=>x[0]===to)?.[1]||0;
        if(target===0)expected.push((from<<10)|(to<<4));
        else {if(!own(target))expected.push((from<<10)|(to<<4));break;}
        f+=df;r+=dr;
      }
    }
  }
  const program=buildNativeSlidingMovesProgram(SubitCPU,{side,start:0x1000});
  cpu2.loadProgram(program.words,program.start);
  const result=cpu2.run({maxSteps:500000});
  assert.equal(result.status,'HALTED');
  const count=cpu2.memory[ABI.LEGAL_COUNT];
  const actual=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+count)).sort((a,b)=>a-b);
  expected.sort((a,b)=>a-b);
  assert.deepEqual(actual,expected);
  return {count,programWords:program.words.length,steps:result.steps};
}
const whiteSliding=verifySliding('w');
const blackSliding=verifySliding('b');
assert.ok(whiteSliding.count>0&&blackSliding.count>0);

console.log('SUBIT-CHESS machine bridge v0.1 tests: OK');
