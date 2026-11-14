'use strict';
const assert=require('assert');
const Adapter=require('../subit-qi-engine-adapter.js');
const pos={turn:'w',board:Array.from({length:8},()=>Array(8).fill('.')),kingPos:{w:[7,4],b:[0,4]}};
pos.board[7][4]='K';pos.board[0][4]='k';pos.board[6][4]='P';pos.board[0][3]='q';
const moves=[
 {from:[6,4],to:[4,4]},
 {from:[7,4],to:[7,5]},
 {from:[6,4],to:[0,3],promo:null}
];
const original=JSON.stringify(moves),calls=[];
const chess={moveToUci:m=>String(m.from[0])+','+m.from[1]+'-'+m.to[0]+','+m.to[1]};
const subit={computeS:()=>({who:'ATTACK',where:'KING',when:'TACTICAL'}),keyOfS:s=>s.who+'|'+s.where+'|'+s.when};
const adapted=Adapter.adapt(moves,pos,{chess,subit,scoreMove:(m,p,d,tt)=>{calls.push([m,d,tt]);return 10-m.to[0];}},null);
assert.strictEqual(adapted.candidates.length,moves.length);
assert.strictEqual(adapted.contextKey,'ATTACK|KING|TACTICAL');
assert.strictEqual(adapted.candidates[0].contextKey,adapted.contextKey);
assert.strictEqual(adapted.candidates[2].tactical,1);
assert.strictEqual(adapted.candidates[0].features.length,9);
assert.strictEqual(adapted.candidates[0].context.length,3);
assert.strictEqual(calls.length,moves.length);
assert.strictEqual(calls[0][1],0);
assert.strictEqual(adapted.candidates[0].id,chess.moveToUci(moves[0]));
assert.strictEqual(JSON.stringify(moves),original,'engine moves must not be mutated');
const opening=Adapter.deriveContextFit({who:'QUIET',where:'QUEENSIDE',when:'OPENING'},{tactical:0,center:.5,advance:.2,king:0,travel:.3,enemyNear:.1,file:1,pieceType:'N'});
assert(opening.who>=0&&opening.where===1&&opening.when>.65);
const endgame=Adapter.deriveContextFit({who:'DEFENCE',where:'CENTER',when:'ENDGAME'},{tactical:0,center:.4,advance:.6,king:1,travel:.2,enemyNear:.3,file:4,pieceType:'K'});
assert.strictEqual(endgame.where,.4);assert(Math.abs(endgame.when-.78)<1e-12);
assert.throws(()=>Adapter.adapt(moves,{board:[]},{chess,subit,scoreMove:()=>0}),/8x8/);
console.log('SUBIT-QI engine adapter tests: PASS (engine coordinates, UCI identity, score callback, context mapping, features, immutability, input validation)');
