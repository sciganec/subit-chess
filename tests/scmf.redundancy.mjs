/**
 * SCMF-INV-008 (no double counting), heuristic screen: no pair of the nine SVF components may be
 * (almost) collinear on seeded random positions, |r| < 0.9. Passing does NOT prove absence of
 * double counting (nonlinear overlap); failing means two components carry the same signal.
 * Also reports the 9x9 matrix. Random playouts are confounded by material, so r is an upper-ish bound.
 */
import { Engine } from '../src/engine/index.mjs';
import { Position } from '../src/engine/core.mjs';
import { SVF_COMPONENTS } from '../src/engine/evaluate.mjs';
let seed=5; const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const rows=[];
for(let g=0;g<40;g++){const p=Position.start();
 for(let ply=0;ply<90;ply++){const ms=p.legalMoves();if(!ms.length)break;p.makeMove(ms[(rnd()*ms.length)|0]);
  if(ply%6===5){const e=new Engine(undefined,{ttBits:10,usePlans:false});e.setFEN(p.fen());const ev=e.evaluation.structural(e.pos);rows.push(Array.from(ev.vector));}}}
const n=rows.length,k=rows[0].length;
const col=i=>rows.map(r=>r[i]);const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const corr=(a,b)=>{const ma=mean(a),mb=mean(b);let s=0,x=0,y=0;for(let i=0;i<a.length;i++){s+=(a[i]-ma)*(b[i]-mb);x+=(a[i]-ma)**2;y+=(b[i]-mb)**2}return x&&y?s/Math.sqrt(x*y):NaN};
let worst={r:0,a:'',b:''},fails=0;
console.log('n',n,SVF_COMPONENTS.join(' '));
for(let i=0;i<k;i++){const sd=Math.sqrt(mean(col(i).map(v=>(v-mean(col(i)))**2)));console.log(SVF_COMPONENTS[i].padEnd(3),'sd',sd.toFixed(3),SVF_COMPONENTS.map((_,j)=>{const r=corr(col(i),col(j));if(i<j&&Math.abs(r)>Math.abs(worst.r))worst={r,a:SVF_COMPONENTS[i],b:SVF_COMPONENTS[j]};return r.toFixed(2)}).join(' '));}

const ok = Math.abs(worst.r) < 0.9;
console.log(`max |r| = ${worst.r.toFixed(2)} (${worst.a}-${worst.b})`);
console.log(ok ? '\nREDUNDANCY OK' : '\nREDUNDANCY FAIL: components nearly collinear');
process.exit(ok ? 0 : 1);
