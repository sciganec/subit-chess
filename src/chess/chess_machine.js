'use strict';

/**
 * SUBIT-CHESS machine bridge v0.1.
 * A CPU STORE to the command register is the peripheral doorbell.
 * The bridge dispatches the Chess Unit only after the STORE instruction commits.
 */
const {ABI}=require('./chess_unit.js');
const DEFAULT_CODE_START=0x0800, DEFAULT_DATA=0x0200;

class SubitChessMachine {
  constructor(cpu,chessUnit,options={}){
    if(!cpu||typeof cpu.step!=='function') throw new TypeError('SUBIT-CPU instance required');
    if(!chessUnit||!chessUnit.dispatch) throw new TypeError('Chess Unit required');
    this.cpu=cpu; this.unit=chessUnit;
    this.codeStart=options.codeStart??DEFAULT_CODE_START;
    this.dataAddress=options.dataAddress??DEFAULT_DATA;
    this.peripheralLog=[];
  }
  loadCommandProgram(command,options={}){
    const start=options.start??this.codeStart, data=options.dataAddress??this.dataAddress;
    const CPU=this.cpu.constructor, enc=CPU.encode, OP=CPU.OPCODE;
    if(typeof enc!=='function'||!OP) throw new Error('SUBIT-CPU encoding API unavailable');
    this.cpu.memory[data]=command&0xFFFF;
    const words=[
      enc(OP.SETAR),data,
      enc(OP.LOAD,0,0,0,0),
      enc(OP.SETAR),ABI.COMMAND,
      enc(OP.STORE,0,0,0,0),
      enc(OP.HALT)
    ];
    this.cpu.loadProgram(words,start);
    return {start,end:start+words.length,dataAddress:data,command:command&0xFFFF,words};
  }
  loadNativeCommandProgram(command,options={}){
    const start=options.start??this.codeStart;
    const CPU=this.cpu.constructor, enc=CPU.encode, OP=CPU.OPCODE;
    if(typeof enc!=='function'||!OP||!CPU.MEM_PREFIX||!CPU.MOP) throw new Error('SUBIT-CPU memory page unavailable');
    const words=[
      enc(OP.LOADI,0),command&0xFFFF,
      enc(OP.LOADI,1),ABI.COMMAND,
      CPU.MEM_PREFIX,...CPU.encodeExtended(CPU.MOP.USTORE,0,1,0),
      enc(OP.HALT)
    ];
    this.cpu.loadProgram(words,start);
    return {start,end:start+words.length,command:command&0xFFFF,words};
  }
  step(){
    const result=this.cpu.step();
    let peripheral=null;
    if(result.status==='COMMITTED'&&Array.isArray(result.writes)&&
      result.writes.some(w=>w.address===ABI.COMMAND)){
      peripheral=this.unit.dispatch(this.cpu.memory[ABI.COMMAND]);
      this.peripheralLog.push({clock:this.cpu.clock,command:this.cpu.memory[ABI.COMMAND],result:peripheral});
    }
    return {cpu:result,peripheral};
  }
  run(options={}){
    const maxSteps=Number.isInteger(options.maxSteps)?options.maxSteps:1000;
    let steps=0,last=null;
    while(!this.cpu.halted&&steps<maxSteps){last=this.step();steps++;}
    return {status:this.cpu.trap?'TRAP':this.cpu.halted?'HALTED':'STEP_LIMIT',
      steps,clock:this.cpu.clock,pc:this.cpu.PC,trap:this.cpu.trap,last,
      peripheralEvents:this.peripheralLog.length};
  }
}
const exported={SubitChessMachine,DEFAULT_CODE_START,DEFAULT_DATA};
if(typeof module!=='undefined'&&module.exports) module.exports=exported;
if(typeof globalThis!=='undefined') globalThis.SubitChessMachine=exported;
