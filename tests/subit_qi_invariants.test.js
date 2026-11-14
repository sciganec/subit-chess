'use strict';
const assert = require('assert');
function norm(A){return A.reduce((s,a)=>s+a.re*a.re+a.im*a.im,0);}
function mul(a,b){return {re:a.re*b.re-a.im*b.im,im:a.re*b.im+a.im*b.re};}
function add(a,b){return {re:a.re+b.re,im:a.im+b.im};}
function scale(a,k){return {re:a.re*k,im:a.im*k};}
function expi(x){return {re:Math.cos(x),im:Math.sin(x)};}
function gate(A,i,j,t,d){
 const c=Math.cos(t),s=Math.sin(t),a=A[i],b=A[j];
 A[i]=add(scale(a,c),scale(mul(expi(-d),b),-s));
 A[j]=add(scale(mul(expi(d),a),s),scale(b,c));
}
for(let n=2;n<=64;n++){
 const A=Array.from({length:n},(_,i)=>{const p=1/n,ph=i*.173;return {re:Math.sqrt(p)*Math.cos(ph),im:Math.sqrt(p)*Math.sin(ph)};});
 const before=norm(A);
 for(let i=0;i<n-1;i++) gate(A,i,i+1,.04*(i%3-1),.11*i);
 assert(Math.abs(norm(A)-before)<1e-10,'norm drift at n='+n);
}
const A=[{re:Math.SQRT1_2,im:0},{re:Math.SQRT1_2,im:0}];
gate(A,0,1,Math.PI/4,0);
assert(Math.abs(norm(A)-1)<1e-12);
console.log('SUBIT-QI unitary invariants: PASS (63 register sizes + pair gate)');
