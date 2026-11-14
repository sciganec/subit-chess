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
const calls=[];
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
assert.deepStrictEqual(moves[0].from,[6,4]);
console.log('SUBIT-QI engine adapter tests: PASS (engine coordinates, UCI identity, score callback, context key, tactical feature, immutability)');
