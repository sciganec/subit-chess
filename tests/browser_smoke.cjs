'use strict';
const assert=require('assert');
const {chromium}=require('playwright');

(async()=>{
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:4173/src/subit_chess_v2.2.0.html',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>window.__subit&&document.querySelectorAll('#board .sq').length===64,{timeout:15000});

  const board=await page.evaluate(()=>{
   const q=s=>document.querySelector(s);
   const light=q('#board .sq.light'),dark=q('#board .sq.dark');
   return{
    squares:document.querySelectorAll('#board .sq').length,
    light:document.querySelectorAll('#board .sq.light').length,
    dark:document.querySelectorAll('#board .sq.dark').length,
    pieces:document.querySelectorAll('#board .piece-img').length,
    lightColor:light?getComputedStyle(light).backgroundColor:null,
    darkColor:dark?getComputedStyle(dark).backgroundColor:null,
    worker:q('#worker-status')?q('#worker-status').textContent.trim():'',
    graphDefault:q('#qi-graph-select')?q('#qi-graph-select').value:null
   };
  });
  assert.strictEqual(board.squares,64,'browser board must contain 64 squares');
  assert.strictEqual(board.light,32,'browser board must contain 32 light squares');
  assert.strictEqual(board.dark,32,'browser board must contain 32 dark squares');
  assert.strictEqual(board.pieces,32,'browser board must contain 32 piece images');
  assert(board.lightColor&&board.darkColor&&board.lightColor!==board.darkColor,'light and dark squares must render distinct colors');
  assert.strictEqual(board.graphDefault,'off','graph mode must default OFF');
  assert(board.worker.includes('WORKER'),'real browser must initialize the Web Worker');

  const result=await page.evaluate(async()=>{
   const E=window.__subit,pos=E.chess.initPosition(),weights=E.subitState.weightsFor(pos);
   const legal=E.chess.legalMoves(pos).length;
   const r=await E.searchAsync(pos,2,weights,{qiGraphEnabled:true,qiGraphStrength:.08,timeLimit:8000});
   return{best:r&&r.best?E.chess.moveToUci(r.best.move):null,depth:r&&r.depth,nodes:r&&r.nodes,
    qi:r&&r.qi,legal:legal,worker:document.querySelector('#worker-status').textContent.trim()};
  });
  assert(result.best,'browser Worker graph search must return a best move');
  assert.strictEqual(result.worker.includes('WORKER'),true,'graph search must run with Worker available');
  assert.strictEqual(result.qi.mode,'GRAPH-ON','Worker must execute graph mode');
  assert.strictEqual(result.qi.candidates,result.legal,'Worker graph mode must retain all legal root candidates');
  assert(Number.isFinite(result.qi.normDrift)&&result.qi.normDrift<1e-8,'Worker graph mode must conserve amplitude norm');

  await page.locator('#board .sq[data-r="6"][data-c="4"]').click();
  await page.locator('#board .sq[data-r="4"][data-c="4"]').click();
  await page.waitForFunction(()=>window.__subit.state.moveHistory.length>=1,{timeout:5000});
  const move=await page.evaluate(()=>window.__subit.state.moveHistory[0].san);
  assert(move&&move.startsWith('e4'),'board click interaction must execute e2-e4');

  assert.deepStrictEqual(pageErrors,[],'browser must not emit uncaught page errors');
  console.log('SUBIT-CHESS Chromium smoke: PASS (visible 8x8 board structure, distinct square colors, 32 piece images, Web Worker initialized, graph-on Worker search, candidate/norm invariants, e2-e4 interaction)');
 }finally{if(browser)await browser.close();}
})().catch(e=>{console.error('SUBIT-CHESS Chromium smoke: FAIL',e);process.exit(1);});
