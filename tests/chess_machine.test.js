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
const {buildNativeAttackMapProgram}=require('../examples/cpu_native_attack_map.js');
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
  const diagonal=buildNativeSlidingMovesProgram(SubitCPU,{side,family:'diagonal',start:0x1000});
  cpu2.loadProgram(diagonal.words,diagonal.start);
  const first=cpu2.run({maxSteps:300000});
  assert.equal(first.status,'HALTED');
  const orthogonal=buildNativeSlidingMovesProgram(SubitCPU,{side,family:'orthogonal',resetCount:false,start:0x1000});
  cpu2.loadProgram(orthogonal.words,orthogonal.start);
  const result=cpu2.run({maxSteps:300000});
  assert.equal(result.status,'HALTED');
  assert.ok(diagonal.words.length<0xf000);
  assert.ok(orthogonal.words.length<0xf000);
  const count=cpu2.memory[ABI.LEGAL_COUNT];
  const actual=Array.from(cpu2.memory.slice(ABI.MOVE_BUFFER,ABI.MOVE_BUFFER+count)).sort((a,b)=>a-b);
  expected.sort((a,b)=>a-b);
  assert.deepEqual(actual,expected);
  return {count,programWords:program.words.length,steps:result.steps};
}
const whiteSliding=verifySliding('w');
const blackSliding=verifySliding('b');
assert.ok(whiteSliding.count>0&&blackSliding.count>0);



// CPU-native Attack Map: five bounded passes accumulate attacked squares.
// Pawn diagonals are attacks even when empty; sliding rays include the first
// occupied square and stop there. Compare against an independent oracle.
function verifyAttackMap(side){
  cpu2.reset();
  cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
  const pieces=side==='w'
    ? [[8,1],[18,2],[27,3],[28,4],[29,5],[36,6],[35,9],[19,12],[30,1],[44,12],[20,9],[52,14]]
    : [[48,9],[45,10],[27,11],[28,12],[29,13],[36,14],[35,1],[19,4],[30,9],[44,4],[20,1],[12,6]];
  for(const [sq,code] of pieces)setKingTestPiece(cpu2.memory,sq,code);
  cpu2.memory[ABI.FLAGS]=side==='w'?0:1;
  const expected=new Set();
  const own=side==='w'?code=>code>=1&&code<=6:code=>code>=9&&code<=14;
  const enemyOffset=side==='w'?0:8;
  const add=(sq)=>expected.add(sq);
  const dirsDiag=[[1,1],[-1,1],[1,-1],[-1,-1]];
  const dirsOrth=[[0,1],[0,-1],[1,0],[-1,0]];
  for(const [from,code] of pieces){
    if(!own(code))continue;
    const type=code-enemyOffset, file=from&7,rank=from>>>3;
    if(type===1){
      const dr=side==='w'?1:-1;
      for(const df of [-1,1]){const f=file+df,r=rank+dr;if(f>=0&&f<8&&r>=0&&r<8)add(r*8+f);}
    } else if(type===2||type===6){
      const offsets=type===2?[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]
        :[[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]];
      for(const [df,dr] of offsets){const f=file+df,r=rank+dr;if(f>=0&&f<8&&r>=0&&r<8)add(r*8+f);}
    } else {
      const rays=[];
      if(type===3||type===5)rays.push(...dirsDiag);
      if(type===4||type===5)rays.push(...dirsOrth);
      for(const [df,dr] of rays){
        let f=file+df,r=rank+dr;
        while(f>=0&&f<8&&r>=0&&r<8){
          const to=r*8+f;add(to);
          const blocker=pieces.find(x=>x[0]===to);
          if(blocker)break;
          f+=df;r+=dr;
        }
      }
    }
  }
  const families=['pawn','knight','king','diagonal','orthogonal'];
  for(let i=0;i<families.length;i++){
    const p=buildNativeAttackMapProgram(SubitCPU,{side,family:families[i],clearMap:i===0,start:0x5000});
    assert.ok(p.words.length<0xb000);
    cpu2.reset();cpu2.loadProgram(p.words,p.start);
    const result=cpu2.run({maxSteps:350000});
    assert.equal(result.status,'HALTED',families[i]+' attack pass');
  }
  const actual=new Set();
  for(let sq=0;sq<64;sq++)if(cpu2.memory[0x400+sq]===1)actual.add(sq);
  assert.deepEqual([...actual].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b));
  return actual.size;
}
assert.ok(verifyAttackMap('w')>0);
assert.ok(verifyAttackMap('b')>0);

// Runtime side guard must not overwrite the accumulated attack map.
cpu2.reset();cpu2.memory[ABI.FLAGS]=1;cpu2.memory[0x400+17]=1;
const wrongAttack=buildNativeAttackMapProgram(SubitCPU,{side:'w',family:'knight',clearMap:false,start:0x5000});
cpu2.loadProgram(wrongAttack.words,wrongAttack.start);
assert.equal(cpu2.run({maxSteps:100000}).status,'HALTED');
assert.equal(cpu2.memory[0x400+17],1);


 
// CPU-native King Safety Probe scans the packed board and checks the king's
// square against a precomputed opponent attack map.
const {buildNativeKingSafetyProbeProgram}=require('../examples/cpu_native_king_safety.js');
const KING_PROBE_RESULT=0x0340;
function runKingProbe(side,kingSquares,attackedSquares=[],runtimeSide=side){
  cpu2.reset();
  cpu2.memory.fill(0,ABI.BOARD,ABI.BOARD+ABI.BOARD_WORDS);
  for(const sq of kingSquares)setKingTestPiece(cpu2.memory,sq,side==='w'?6:14);
  for(const sq of attackedSquares)cpu2.memory[0x0400+sq]=1;
  cpu2.memory[ABI.FLAGS]=runtimeSide==='w'?0:1;
  const probe=buildNativeKingSafetyProbeProgram(SubitCPU,{side,start:0x7000,resultAddress:KING_PROBE_RESULT});
  cpu2.loadProgram(probe.words,probe.start);
  const run=cpu2.run({maxSteps:10000});
  assert.equal(run.status,'HALTED');
  return {status:cpu2.memory[KING_PROBE_RESULT],square:cpu2.memory[KING_PROBE_RESULT+1],steps:run.steps};
}
assert.equal(runKingProbe('w',[4],[]).status,1); // SAFE
assert.deepEqual(
  (({status,square})=>({status,square}))(runKingProbe('w',[4],[4])),
  {status:2,square:4}
); // CHECK
assert.deepEqual(
  (({status,square})=>({status,square}))(runKingProbe('b',[60],[60])),
  {status:2,square:60}
);
assert.deepEqual(
  (({status,square})=>({status,square}))(runKingProbe('w',[],[])),
  {status:0,square:0xffff}
); // NO_KING
assert.deepEqual(
  (({status,square})=>({status,square}))(runKingProbe('w',[4,60],[])),
  {status:3,square:0xffff}
); // MULTIPLE_KINGS
assert.deepEqual(
  (({status,square})=>({status,square}))(runKingProbe('w',[4],[],'b')),
  {status:4,square:0xffff}
); // WRONG_SIDE


 
// CPU-native staged move application copies the source board, decodes the
// 16-bit move ABI, clears the source nibble, and writes the piece at target.
const {buildNativeMoveApplyProgram}=require('../examples/cpu_native_move_apply.js');
function runNativeMoveApply(from,to,piece,targetPiece=0){
  cpu2.reset();
  cpu2.memory.fill(0,0x0000,0x0600);
  setKingTestPiece(cpu2.memory,from,piece);
  if(targetPiece)setKingTestPiece(cpu2.memory,to,targetPiece);
  const moveWord=(from<<10)|(to<<4);
  cpu2.memory[ABI.MOVE_DATA]=moveWord;
  const apply=buildNativeMoveApplyProgram(SubitCPU,{start:0x8000,
    boardAddress:ABI.BOARD,scratchBoardAddress:0x0500,moveAddress:ABI.MOVE_DATA});
  cpu2.loadProgram(apply.words,apply.start);
  const result=cpu2.run({maxSteps:10000});
  assert.equal(result.status,'HALTED');
  assert.equal(cpu2.memory[0x0342],1,JSON.stringify({run,pc:cpu2.PC,trap:cpu2.trap,from:cpu2.memory[0x0344],to:cpu2.memory[0x0345],piece:cpu2.memory[0x0343],scratch:Array.from(cpu2.memory.slice(0x0500,0x0510))}));
  assert.equal(cpu2.memory[ABI.BOARD+(from>>>2)]===0, false,
    'original board must remain intact');
  const staged=cpu2.memory.slice(0x0500,0x0510);
  const pieceAt=(sq)=>((staged[sq>>>2]>>>((3-(sq&3))*4))&15);
  assert.equal(pieceAt(from),0);
  assert.equal(pieceAt(to),piece,JSON.stringify({from,to,piece,fromSlot:cpu2.memory[0x0344],toSlot:cpu2.memory[0x0345],pieceSlot:cpu2.memory[0x0343],destWord:staged[to>>>2],destIndex:to&3,run:result}));
  assert.equal(cpu2.memory[ABI.BOARD+(from>>>2)]!==0,true,
    'source board is not modified');
  return {steps:result.steps,programWords:apply.words.length,staged:Array.from(staged)};
}
const quietApply=runNativeMoveApply(12,28,1);
assert.ok(quietApply.steps>0);
assert.ok(quietApply.programWords<0x1000);
// Captures overwrite the destination nibble in the staged copy only.
const captureApply=runNativeMoveApply(27,36,1,9);
assert.equal(((captureApply.staged[36>>>2]>>>((3-(36&3))*4))&15),1);

console.log('SUBIT-CHESS machine bridge v0.1 tests: OK');


// Composed CPU-native king-safety pipeline: moving a shielding rook exposes
// the white king to a black rook; a move that preserves the blocker is safe.
// The expected result is independently checked by a simple file-ray oracle.
const {runNativeKingSafetyPipeline,PIPELINE_STATUS}=require('../examples/cpu_native_king_safety_pipeline.js');
function setPipelinePosition(){
  cpu2.reset();
  cpu2.memory.fill(0,0x0000,0x0600);
  setKingTestPiece(cpu2.memory,4,6);   // White king e1.
  setKingTestPiece(cpu2.memory,12,4);  // White rook e2, shielding the king.
  setKingTestPiece(cpu2.memory,60,12); // Black rook e8.
  setKingTestPiece(cpu2.memory,56,14); // Black king a8.
  cpu2.memory[ABI.FLAGS]=0;
}
function independentWhiteKingInCheck(boardWords){
  const pieceAt=sq=>(boardWords[sq>>>2]>>>((3-(sq&3))*4))&15;
  // Black rook e8 attacks e1 iff every intervening square e2..e7 is empty.
  for(let sq=12;sq<60;sq+=8)if(pieceAt(sq)!==0)return false;
  return true;
}
setPipelinePosition();
cpu2.memory[ABI.MOVE_DATA]=(12<<10)|(13<<4); // Re2-f2 uncovers the e-file.
const exposed=runNativeKingSafetyPipeline(cpu2,{side:'w'});
assert.equal(exposed.status,PIPELINE_STATUS.CHECK);
assert.equal(exposed.safe,false);
assert.equal(exposed.reason,'KING_IN_CHECK');
assert.equal(exposed.kingSquare,4);
const exposedBoard=cpu2.memory.slice(0x0500,0x0510);
assert.equal(independentWhiteKingInCheck(exposedBoard),true);
assert.equal(cpu2.memory[ABI.BOARD+3]!==exposedBoard[3],true,
  'staged move must not mutate the original board');

setPipelinePosition();
cpu2.memory[ABI.MOVE_DATA]=(12<<10)|(20<<4); // Re2-e3 keeps the e-file blocked.
const shielded=runNativeKingSafetyPipeline(cpu2,{side:'w'});
assert.equal(shielded.status,PIPELINE_STATUS.SAFE);
assert.equal(shielded.safe,true);
assert.equal(shielded.reason,'KING_SAFE');
assert.equal(shielded.kingSquare,4);
const shieldedBoard=cpu2.memory.slice(0x0500,0x0510);
assert.equal(independentWhiteKingInCheck(shieldedBoard),false);
assert.deepEqual(shielded.stages.map(x=>x.name),[
  'MOVE_PREFLIGHT','MOVE_GEOMETRY','MOVE_APPLY','ATTACK_PAWN','ATTACK_KNIGHT','ATTACK_KING',
  'ATTACK_DIAGONAL','ATTACK_ORTHOGONAL','KING_SAFETY'
]);

// The pipeline refuses to interpret a move for the wrong side to move.
setPipelinePosition();
cpu2.memory[ABI.FLAGS]=1;
const wrongPipelineSide=runNativeKingSafetyPipeline(cpu2,{side:'w'});
assert.equal(wrongPipelineSide.safe,false);
assert.equal(wrongPipelineSide.reason,'WRONG_SIDE_TO_MOVE');


// CPU-native Move Preflight checks source presence/ownership and rejects a
// friendly occupied destination before the staged move-apply stage can run.
const {buildNativeMovePreflightProgram}=require('../examples/cpu_native_move_preflight.js');
function runPreflight(from,to,pieces,side='w',reserved=0){
  cpu2.reset();cpu2.memory.fill(0,0x0000,0x0600);
  for(const [sq,code] of pieces)setKingTestPiece(cpu2.memory,sq,code);
  cpu2.memory[ABI.FLAGS]=side==='w'?0:1;
  cpu2.memory[ABI.MOVE_DATA]=((from&63)<<10)|((to&63)<<4)|(reserved&1);
  const program=buildNativeMovePreflightProgram(SubitCPU,{start:0x9000});
  cpu2.loadProgram(program.words,program.start);
  const run=cpu2.run({maxSteps:10000});
  assert.equal(run.status,'HALTED',JSON.stringify({run,trap:cpu2.trap}));
  return {status:cpu2.memory[program.statusAddress],steps:run.steps,programWords:program.words.length};
}
assert.equal(runPreflight(12,13,[[12,4]]).status,1); // valid white source, empty target
assert.equal(runPreflight(12,13,[]).status,4); // empty source
assert.equal(runPreflight(12,13,[[12,12]],'w').status,5); // black piece, white to move
assert.equal(runPreflight(12,13,[[12,4],[13,1]],'w').status,6); // friendly target
assert.equal(runPreflight(12,12,[[12,4]]).status,3); // same square
assert.equal(runPreflight(12,13,[[12,4]],'w',1).status,2); // reserved bit
assert.equal(runPreflight(12,13,[[12,12]],'b').status,1); // black source


// CPU-native Move Geometry: ROM lookup chooses a piece-specific geometric
// relation; the CPU itself reads every intermediate square for sliders and
// pawn double advances. The table builder is static assembly/data generation.
const {buildNativeMoveGeometryProgram,GEOMETRY_STATUS}=require('../examples/cpu_native_move_geometry.js');
function runGeometry(from,to,pieces,side='w',promotion=0){
  cpu2.reset();cpu2.memory.fill(0,0x0000,0x0600);
  for(const [sq,code] of pieces)setKingTestPiece(cpu2.memory,sq,code);
  cpu2.memory[ABI.FLAGS]=side==='w'?0:1;
  cpu2.memory[ABI.MOVE_DATA]=((from&63)<<10)|((to&63)<<4)|((promotion&7)<<1);
  cpu2.memory[0x0347]=from;cpu2.memory[0x0348]=to;
  const geometry=buildNativeMoveGeometryProgram(SubitCPU,{side,start:0xD000});
  cpu2.memory.set(geometry.tableWords,geometry.tableBase);
  cpu2.memory.set(geometry.oneHotWords,geometry.oneHotBase);
  cpu2.loadProgram(geometry.words,geometry.start);
  const result=cpu2.run({maxSteps:10000});
  assert.equal(result.status,'HALTED',JSON.stringify({result,trap:cpu2.trap}));
  const ptr=cpu2.memory[0x034A],piece=cpu2.memory[0x0349];
  return {status:cpu2.memory[geometry.statusAddress],steps:result.steps,words:geometry.words.length,piece,ptr,mask:cpu2.memory[ptr-2],onehot:cpu2.memory[geometry.oneHotBase+piece]};
}
const knightGeometry=runGeometry(1,18,[[1,2]]);
assert.equal(knightGeometry.status,GEOMETRY_STATUS.VALID,JSON.stringify(knightGeometry)); // Nb1-c3
assert.equal(runGeometry(1,17,[[1,2]]).status,GEOMETRY_STATUS.INVALID_GEOMETRY); // Nb1-b3
assert.equal(runGeometry(12,28,[[12,4]]).status,GEOMETRY_STATUS.VALID); // Re2-e4
assert.equal(runGeometry(12,28,[[12,4],[20,1]]).status,GEOMETRY_STATUS.BLOCKED_PATH); // pawn blocks rook
assert.equal(runGeometry(2,38,[[2,3]]).status,GEOMETRY_STATUS.VALID); // Bc1-g5
assert.equal(runGeometry(2,38,[[2,3],[20,1]]).status,GEOMETRY_STATUS.BLOCKED_PATH);
assert.equal(runGeometry(12,28,[[12,1]]).status,GEOMETRY_STATUS.VALID); // e2-e4, clear middle
assert.equal(runGeometry(12,28,[[12,1],[20,9]]).status,GEOMETRY_STATUS.BLOCKED_PATH); // blocked double push
assert.equal(runGeometry(52,36,[[52,9]],'b').status,GEOMETRY_STATUS.VALID); // black e7-e5
assert.equal(runGeometry(12,36,[[12,1]]).status,GEOMETRY_STATUS.INVALID_GEOMETRY); // pawn cannot e2-e5
assert.equal(runGeometry(8,16,[[8,1]],'w',1).status,GEOMETRY_STATUS.UNSUPPORTED_PROMOTION);
