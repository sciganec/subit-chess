'use strict';
const assert=require('assert');const QI=require('../subit-qi-graph.js');
const sample=[
{id:'e2e4',score:12,features:[1,.2,0],context:[1,0,0],from:'e2',to:'e4',tactical:.1},
{id:'d2d4',score:10,features:[.8,.1,.2],context:[1,0,0],from:'d2',to:'d4',tactical:.1},
{id:'g1f3',score:8,features:[.2,.8,.1],context:[0,1,0],from:'g1',to:'f3',tactical:0},
{id:'e4d5',score:7,features:[.1,.2,1],context:[0,0,1],from:'e4',to:'d5',tactical:1}];
function ids(x){return x.moves.map(m=>m.id);}
const a=QI.rank(sample,{strength:.08,blend:.12});
assert.deepStrictEqual(ids(a).slice().sort(),sample.map(x=>x.id).sort());
assert.deepStrictEqual(ids(a),ids(QI.rank(sample,{strength:.08,blend:.12})));
const perm=QI.rank([sample[2],sample[0],sample[3],sample[1]],{strength:.08,blend:.12});
assert.deepStrictEqual(ids(a),ids(perm));
const sum=a.moves.reduce((s,m)=>s+m.qiProbability,0);
assert(Math.abs(sum-1)<1e-12);assert(a.diagnostics.normDrift<1e-10);
const ties=QI.rank([{id:'b',score:1,features:[]},{id:'a',score:1,features:[]}],{strength:0});
assert.deepStrictEqual(ids(ties),['a','b']);
assert.throws(()=>QI.rank([{id:'x'},{id:'x'}]),/duplicate/);
const g=QI.buildGraph(QI.rank(sample).moves.map(m=>({id:m.id,features:m.features||[],context:m.context||[],to:m.to,tactical:m.tactical||0})),{});
assert(g.edges.every(e=>Math.abs(e.weight)<=1));
console.log('SUBIT-QI graph tests: PASS (candidate conservation, determinism, permutation equivariance, normalization, unitary norm, bounds, stable ties)');
