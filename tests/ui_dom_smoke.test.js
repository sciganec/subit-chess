'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');

async function main(){
 const htmlPath=path.join(__dirname,'..','src','subit_chess_v2.2.0.html');
 const html=fs.readFileSync(htmlPath,'utf8');
 const vc=new VirtualConsole();
 const runtimeErrors=[];
 vc.on('jsdomError',e=>runtimeErrors.push(e.message));
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'http://localhost/'});
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('DOM load timeout')),10000);
   if(dom.window.document.readyState==='complete'){clearTimeout(timeout);resolve();return;}
   dom.window.addEventListener('load',()=>{clearTimeout(timeout);resolve();},{once:true});
  });
  await new Promise(resolve=>setTimeout(resolve,100));
  const doc=dom.window.document;
  const board=doc.querySelector('#board');
  assert(board,'#board must exist');
  const squares=[...board.querySelectorAll('.sq')];
  const pieces=[...board.querySelectorAll('.piece-img')];
  assert.strictEqual(squares.length,64,'board must render 64 squares');
  assert.strictEqual(squares.filter(x=>x.classList.contains('light')).length,32,'board must render 32 light squares');
  assert.strictEqual(squares.filter(x=>x.classList.contains('dark')).length,32,'board must render 32 dark squares');
  assert.strictEqual(pieces.length,32,'starting position must render 32 piece image elements');
  assert(pieces.every(x=>x.getAttribute('src')&&x.getAttribute('src')!=='undefined'),'every piece must have an image source');
  assert.strictEqual(doc.querySelectorAll('.board-wrapper').length,1,'board wrapper must exist');
  assert.strictEqual(doc.querySelectorAll('#settings-modal #qi-graph-select').length,1,'graph setting must be present exactly once');
  assert.strictEqual(doc.querySelector('#qi-graph-select').value,'off','graph setting must default OFF');
  assert.strictEqual(runtimeErrors.length,0,'jsdom runtime must not report uncaught errors: '+runtimeErrors.join(' | '));
  console.log('SUBIT-CHESS UI DOM smoke: PASS (64 squares, 32 light/dark split, 32 piece images, image sources, graph toggle OFF, no jsdom runtime errors)');
 }finally{dom.window.close();}
}
main().catch(e=>{console.error('SUBIT-CHESS UI DOM smoke: FAIL',e);process.exit(1);});
