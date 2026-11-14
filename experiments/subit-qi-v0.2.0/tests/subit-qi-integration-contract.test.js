'use strict';
const assert=require('assert');
const fs=require('fs');
function verifyHtml(file){
 const html=fs.readFileSync(file,'utf8');
 const scripts=[];
 html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi,(_,body)=>{if(body.trim())scripts.push(body);return _;});
 assert(scripts.length>0,file+' must contain an inline application script');
 const js=scripts.join('\n');
 assert.doesNotThrow(()=>new Function(js),file+' application JavaScript must parse');
 assert(js.includes('function qiGraphOrderRootMoves(moves,pos,ttMove)'),file+' must contain graph ordering inside makeSearchModule');
 assert(js.includes('moves = orderRootMoves(moves,pos,ttPrevMove);'),file+' searchRoot must invoke the ordering dispatcher');
 assert(js.includes('if(qiGraphEnabled)return qiGraphOrderRootMoves(moves,pos,ttMove);'),file+' graph and legacy modes must be mutually exclusive');
 assert(js.includes("qiGraph:'off'"),file+' graph mode must default OFF');
 assert(js.includes("qiGraphEnabled: state.settings.qiGraph === 'on'"),file+' live search must pass the graph toggle');
 assert(js.includes('qiGraphEnabled: !!data.qiGraphEnabled'),file+' Worker must pass the graph toggle');
 assert(js.includes('qiGraphEnabled: !!opts.qiGraphEnabled'),file+' sync fallback and Worker request must pass the graph toggle');
 assert(js.includes('GRAPH v0.2.2'),file+' A/B/C must include graph mode');
 assert(js.includes("edgeSchedule:'canonical-UCI-lexicographic'"),file+' edge schedule must be deterministic');
 assert(js.includes('QI graph changed the legal candidate set'),file+' candidate-set guard must exist');
 assert(js.includes('QI graph unitary norm invariant failed'),file+' norm guard must exist');
}
verifyHtml('index.html');
verifyHtml('src/subit_chess_v2.2.0.html');
console.log('SUBIT-QI v0.2.2 integration contract: PASS (root and packaged HTML parse; root hook, default-OFF flag, Worker/fallback propagation, mode isolation, A/B/C, deterministic schedule, candidate and norm guards)');
