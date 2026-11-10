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
const {buildNativeMovePreflightProgram}=require('./cpu_native_move_preflight.js');
const {buildNativeMoveGeometryProgram,GEOMETRY_STATUS}=require('./cpu_native_move_geometry.js');
const {buildNativeMoveApplyProgram}=require('./cpu_native_move_apply.js');
const {buildNativePromotionProgram,PROMOTION_STATUS}=require('./cpu_native_promotion.js');
const {buildNativeEnPassantProgram,EN_PASSANT_STATUS}=require('./cpu_native_en_passant.js');
const {buildNativeAttackMapProgram}=require('./cpu_native_attack_map.js');
const {buildNativeKingSafetyProbeProgram}=require('./cpu_native_king_safety.js');

const ATTACK_FAMILIES=Object.freeze(['pawn','knight','king','diagonal','orthogonal']);
const PIPELINE_STATUS=Object.freeze({
  SAFE:1, CHECK:2, INVALID_KING_STATE:3, EXECUTION_ERROR:4
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
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:'WRONG_SIDE_TO_MOVE',side,stages:[]});
  }

  const stages=[];
  const preflight=buildNativeMovePreflightProgram(cpu.constructor,{
    boardAddress,flagsAddress:options.flagsAddress??0x0010,moveAddress,
    start:options.preflightStart??0x9000,
    statusAddress:options.preflightStatusAddress??0x0346,
    fromSlot:options.preflightFromSlot??0x0347,
    toSlot:options.preflightToSlot??0x0348
  });
  let stage=runProgram(cpu,preflight,maxSteps); stages.push({name:'MOVE_PREFLIGHT',...stage});
  const preflightStatus=cpu.memory[preflight.statusAddress];
  if(stage.run.status!=='HALTED'||preflightStatus!==1){
    const reasons={2:'RESERVED_MOVE_BIT',3:'SAME_SOURCE_DESTINATION',4:'EMPTY_SOURCE',
      5:'WRONG_SOURCE_SIDE',6:'FRIENDLY_DESTINATION',7:'INVALID_SOURCE_PIECE',8:'INVALID_DESTINATION'};
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:reasons[preflightStatus]||stage.run.trap?.code||'PREFLIGHT_FAILED',
      preflightStatus,side,stages});
  }
  const geometry=buildNativeMoveGeometryProgram(cpu.constructor,{
    side,boardAddress,moveAddress,fromSlot:preflight.fromSlot,toSlot:preflight.toSlot,
    start:options.geometryStart??0xD000,
    statusAddress:options.geometryStatusAddress??0x034C,
    pieceSlot:options.geometryPieceSlot??0x0349,
    routePtrSlot:options.routePtrSlot??0x034A,squareSlot:options.squareSlot??0x034B
  });
  cpu.memory.set(geometry.tableWords,geometry.tableBase);
  cpu.memory.set(geometry.oneHotWords,geometry.oneHotBase);
  stage=runProgram(cpu,geometry,maxSteps); stages.push({name:'MOVE_GEOMETRY',...stage});
  const geometryStatus=cpu.memory[geometry.statusAddress];
  if(stage.run.status!=='HALTED'||geometryStatus!==GEOMETRY_STATUS.VALID){
    const reasons={2:'INVALID_PIECE_GEOMETRY',3:'BLOCKED_SLIDING_OR_PAWN_PATH',4:'UNSUPPORTED_PROMOTION'};
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:reasons[geometryStatus]||stage.run.trap?.code||'GEOMETRY_FAILED',
      geometryStatus,side,stages});
  }
  const apply=buildNativeMoveApplyProgram(cpu.constructor,{
    boardAddress,scratchBoardAddress,moveAddress,start:starts.apply,
    stateAddress:options.applyStateAddress??0x0342,
    pieceSlot:options.pieceSlot??0x0343,fromSlot:options.fromSlot??0x0344,
    toSlot:options.toSlot??0x0345
  });
  stage=runProgram(cpu,apply,maxSteps); stages.push({name:'MOVE_APPLY',...stage});
  if(stage.run.status!=='HALTED'||cpu.memory[apply.stateAddress]!==1){
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:stage.run.trap?.code||'MOVE_APPLY_FAILED',side,stages});
  }

  const enPassant=buildNativeEnPassantProgram(cpu.constructor,{
    boardAddress:scratchBoardAddress,moveAddress,flagsAddress:options.flagsAddress??0x0010,
    epAddress:options.epAddress??0x0011,start:options.enPassantStart??0xA000,
    statusAddress:options.enPassantStatusAddress??0x0351,
    fromSlot:options.enPassantFromSlot??0x0352,toSlot:options.enPassantToSlot??0x0353,
    captureSlot:options.enPassantCaptureSlot??0x0354
  });
  stage=runProgram(cpu,enPassant,maxSteps); stages.push({name:'EN_PASSANT',...stage});
  const enPassantStatus=cpu.memory[enPassant.statusAddress];
  if(stage.run.status!=='HALTED'||![EN_PASSANT_STATUS.NO_OP,EN_PASSANT_STATUS.APPLIED].includes(enPassantStatus)){
    const reasons={3:'BAD_EN_PASSANT_CAPTURE_SQUARE',4:'EN_PASSANT_SOURCE_NOT_PAWN'};
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:reasons[enPassantStatus]||stage.run.trap?.code||'EN_PASSANT_FAILED',
      enPassantStatus,side,stages});
  }

  const promotion=buildNativePromotionProgram(cpu.constructor,{
    boardAddress:scratchBoardAddress,moveAddress,flagsAddress:options.flagsAddress??0x0010,
    start:options.promotionStart??0xB000,
    statusAddress:options.promotionStatusAddress??0x034D,
    toSlot:options.promotionToSlot??0x034E,promoSlot:options.promoSlot??0x034F
  });
  stage=runProgram(cpu,promotion,maxSteps); stages.push({name:'PROMOTION',...stage});
  const promotionStatus=cpu.memory[promotion.statusAddress];
  if(stage.run.status!=='HALTED'||promotionStatus!==PROMOTION_STATUS.OK){
    const reasons={2:'BAD_PROMOTION_CODE',3:'PROMOTION_WRONG_RANK',4:'PROMOTION_SOURCE_NOT_PAWN'};
    return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
      reason:reasons[promotionStatus]||stage.run.trap?.code||'PROMOTION_FAILED',
      promotionStatus,side,stages});
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
      return Object.freeze({status:PIPELINE_STATUS.EXECUTION_ERROR,safe:false,
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
    return Object.freeze({status:PIPELINE_STATUS.SAFE,safe:true,reason:'KING_SAFE',
      side,kingSquare,stagedBoardAddress:scratchBoardAddress,attackMapAddress,
      stages});
  }
  if(kingStatus===2){
    return Object.freeze({status:PIPELINE_STATUS.CHECK,safe:false,
      reason:'KING_IN_CHECK',side,kingSquare,stagedBoardAddress:scratchBoardAddress,
      attackMapAddress,stages});
  }
  return Object.freeze({status:PIPELINE_STATUS.INVALID_KING_STATE,safe:false,
    reason:({0:'NO_KING',3:'MULTIPLE_KINGS',4:'WRONG_SIDE_TO_MOVE'})[kingStatus]||'INVALID_PROBE_STATUS',
    side,kingStatus,kingSquare,stagedBoardAddress:scratchBoardAddress,attackMapAddress,
    stages});
}

module.exports={runNativeKingSafetyPipeline,ATTACK_FAMILIES,PIPELINE_STATUS};
