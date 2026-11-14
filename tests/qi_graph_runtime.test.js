'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');

async function load(){
 const file=path.join(__dirname,'..','src','subit_chess_v2.2.0.html');
 const vc=new VirtualConsole();
 const dom=new JSDOM(fs.readFileSync(file,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/'});
 await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>reject(new Error('engine load timeout')),10000);
  if(dom.window.document.readyState==='complete'){clearTimeout(t);resolve();return;}
  dom.window.addEventListener('load',()=>{clearTimeout(t);resolve();},{once:true});
 });
 await new Promise(r=>setTimeout(r,50));
 if(!dom.window.__subit){dom.window.close();throw new Error('engine did not expose __subit');}
 return dom;
}
async function main(){
 const dom=await load();
 try{
  const E=dom.window.__subit;
  const pos=E.chess.initPosition();
  const legal=E.chess.legalMoves(pos);
  assert(legal.length>1,'start position must have multiple legal moves');
  const weights=E.subitState.weightsFor(pos);
  const graph=E.searchMod.createSearch(weights,{qiGraphEnabled:true,qiGraphStrength:.08,maxNodes:250000});
  const result=graph.searchRoot(E.chess.clonePos(pos),2,null,4,null);
  assert(result&&result.best,'graph search must return a root best move');
  const d=graph.getQiDiagnostics();
  assert.strictEqual(d.mode,'GRAPH-ON','graph mode must be active');
  assert.strictEqual(d.candidates,legal.length,'graph must retain every legal root candidate');
  assert(d.edgeCount>0,'starting position should produce interaction edges');
  assert(Number.isFinite(d.normDrift)&&d.normDrift<1e-8,'graph amplitude norm must be conserved');
  assert(d.topBefore&&d.topAfter,'graph diagnostics must include pre/post top UCI moves');

  const legacy=E.searchMod.createSearch(weights,{qiEnabled:true,qiGraphEnabled:false,maxNodes:250000});
  const legacyResult=legacy.searchRoot(E.chess.clonePos(pos),2,null,4,null);
  assert(legacyResult&&legacyResult.best,'legacy QI search must remain available');
  assert.strictEqual(legacy.getQiDiagnostics().mode,'QI-INTERFERENCE','legacy QI must remain independently selectable');

  const classical=E.searchMod.createSearch(weights,{qiEnabled:false,qiGraphEnabled:false,maxNodes:250000});
  const classicalResult=classical.searchRoot(E.chess.clonePos(pos),2,null,4,null);
  assert(classicalResult&&classicalResult.best,'classical search must remain available');
  assert.strictEqual(classical.getQiDiagnostics().mode,'CLASSICAL','classical mode must remain available');

  const precedence=E.searchMod.createSearch(weights,{qiEnabled:true,qiGraphEnabled:true,maxNodes:250000});
  const precedenceResult=precedence.searchRoot(E.chess.clonePos(pos),2,null,4,null);
  assert(precedenceResult&&precedenceResult.best);
  assert.strictEqual(precedence.getQiDiagnostics().mode,'GRAPH-ON','graph mode must take precedence when explicitly enabled');
  console.log('SUBIT-QI v0.2.2 runtime: PASS (real start-position search, candidate preservation, graph edges, unitary norm, classical/legacy/graph mode separation and precedence)');
 }finally{dom.window.close();}
}
main().catch(e=>{console.error('SUBIT-QI v0.2.2 runtime: FAIL',e);process.exit(1);});
