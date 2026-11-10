'use strict';

/**
 * Composed SUBIT-CPU king-safety pipeline v0.1.
 *
 * The move application, five attack-map passes, and king-safety probe are
 * executed by SUBIT-CPU. JavaScript currently sequences these bounded programs;
 * this module is therefore a CPU-native primitive pipeline, not yet a
 * single self-orchestrating CPU program and not a complete chess legality
 * validator.
 */
const {buildNativeMoveApplyProgram}=require('./cpu_native_move_apply.js');
const {buildNativeAttackMapProgram}=require('./cpu_native_attack_map.js');
const {buildNativeKingSafetyProbeProgram}=require('./cpu_native_king_safety.js');

const ATTACK_FAMILIES=Object.freeze(['pawn','knight','king','diagonal','orthogonal']);
const PIPELINE_STATUS=Object.freeze({
  LEGAL:1, ILLEGAL_CHECK:2, INVALID_KING_STATE:3, EXECUTION_ERROR:4
});

function runProgram(cpu,program,maxSteps){
  cpu.loadProgram(program.words,program.start);
  const run=cpu.run({maxSteps});
  return {run,programWords:program.words.length};
}

function runNativeKingSafetyPipeline(cpu,options={}){
  if(!cpu||!cpu.memory||typeof cpu.loadProgram!=='function'||typeof cpu.run!=='function')
    throw new TypeError('SUBIT-CPU instance required');
  const side=options.side;
  if(side!=='w'&&side!=='b')throw new RangeError("side must be 'w' or 'b'");
  const boardAddress=options.boardAddress??0x0000;
  const scratchBoardAddress=options.scratchBoardAddress??0x0500;
  const moveAddress=options.moveAddress??0x0024;
  const attackMapAddress=options.attackMapAddress??0x0400;
  const attackFlagsAddress=options.attackFlagsAddress??0x0350;
  const resultAddress=options.resultAddress??0x0340;
  const maxSteps=options.maxSteps??400000;
  const starts={apply:options.applyStart??0x8000,attack:options.attackStart??0x5000,
    probe:options.probeStart??0x7000};
  if(!Number.isInteger(maxSteps)||maxSteps<1)throw new RangeError('maxSteps must be positive');
  const movingBit=side==='w'?0:1, opponentBit=movingBit^1;
  const originalFlags=cpu.memory[options.flagsAddress??0x0010];
  if((originalFlags&1)!==movingBit){
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,legal:false,
      reason:'WRONG_SIDE_TO_MOVE',side,stages:[]});
  }

  const stages=[];
  const apply=buildNativeMoveApplyProgram(cpu.constructor,{
    boardAddress,scratchBoardAddress,moveAddress,start:starts.apply,
    stateAddress:options.applyStateAddress??0x0342,
    pieceSlot:options.pieceSlot??0x0343,fromSlot:options.fromSlot??0x0344,
    toSlot:options.toSlot??0x0345
  });
  let stage=runProgram(cpu,apply,maxSteps); stages.push({name:'MOVE_APPLY',...stage});
  if(stage.run.status!=='HALTED'||cpu.memory[apply.stateAddress]!==1){
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,legal:false,
      reason:stage.run.trap?.code||'MOVE_APPLY_FAILED',side,stages});
  }

  // The attack-map generator and king probe intentionally use different
  // flags words: opponent side for attacks, moving side for king validation.
  cpu.memory[attackFlagsAddress]=opponentBit;
  for(let i=0;i<ATTACK_FAMILIES.length;i++){
    const family=ATTACK_FAMILIES[i];
    const program=buildNativeAttackMapProgram(cpu.constructor,{
      side:side==='w'?'b':'w',family,clearMap:i===0,
      boardAddress:scratchBoardAddress,flagsAddress:attackFlagsAddress,
      attackMapAddress,start:starts.attack
    });
    stage=runProgram(cpu,program,maxSteps);
    stages.push({name:'ATTACK_'+family.toUpperCase(),...stage});
    if(stage.run.status!=='HALTED'){
      return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,legal:false,
        reason:stage.run.trap?.code||'ATTACK_MAP_FAILED',side,stages});
    }
  }

  const probe=buildNativeKingSafetyProbeProgram(cpu.constructor,{
    side,boardAddress:scratchBoardAddress,
    flagsAddress:options.flagsAddress??0x0010,
    attackMapAddress,resultAddress,start:starts.probe
  });
  stage=runProgram(cpu,probe,maxSteps);
  stages.push({name:'KING_SAFETY',...stage});
  if(stage.run.status!=='HALTED'){
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,legal:false,
      reason:stage.run.trap?.code||'KING_PROBE_FAILED',side,stages});
  }
  const kingStatus=cpu.memory[resultAddress],kingSquare=cpu.memory[resultAddress+1];
  if(kingStatus===1){
    return Object.freeze({status:PIPELINE_STATUS.LEGAL,legal:true,reason:'KING_SAFE',
      side,kingSquare,stagedBoardAddress:scratchBoardAddress,attackMapAddress,
      stages});
  }
  if(kingStatus===2){
    return Object.freeze({status:PIPELINE_STATUS.ILLEGAL_CHECK,legal:false,
      reason:'KING_IN_CHECK',side,kingSquare,stagedBoardAddress:scratchBoardAddress,
      attackMapAddress,stages});
  }
  return Object.freeze({status:PIPELINE_STATUS.INVALID_KING_STATE,legal:false,
    reason:({0:'NO_KING',3:'MULTIPLE_KINGS',4:'WRONG_SIDE_TO_MOVE'})[kingStatus]||'INVALID_PROBE_STATUS',
    side,kingStatus,kingSquare,stagedBoardAddress:scratchBoardAddress,attackMapAddress,
    stages});
}

module.exports={runNativeKingSafetyPipeline,ATTACK_FAMILIES,PIPELINE_STATUS};
