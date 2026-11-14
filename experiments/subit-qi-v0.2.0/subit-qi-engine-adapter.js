(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SubitQIEngineAdapter=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const WHO=['ATTACK','PRESSURE','DEFENCE','QUIET'];
const WHERE=['KING','CENTER','QUEENSIDE','GLOBAL'];
const WHEN=['OPENING','MIDDLEGAME','TACTICAL','ENDGAME'];
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function distance(a,b){return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);}
function contextFit(ctx,tactical,center,advance,king,travel,enemyNear){
const who=ctx.who==='ATTACK'?.7*tactical+.3*enemyNear:ctx.who==='PRESSURE'?.55*center+.45*travel:ctx.who==='DEFENCE'?.55*king+.45*(tactical?.5:1):.7*(1-tactical)+.3*center;
const where=ctx.where==='KING'?enemyNear:ctx.where==='CENTER'?center:ctx.where==='QUEENSIDE'?null:travel;
const whereFit=where===null?null:where;
const flank=arguments[7];
const actualWhere=ctx.where==='QUEENSIDE'?(flank<=2?1:(flank<=4?.35:0)):whereFit;
const when=ctx.when==='TACTICAL'?tactical:ctx.when==='OPENING'?((arguments[8]=== 'N'||arguments[8]==='B'?.65:0)+.35*center):ctx.when==='ENDGAME'?.55*advance+.45*king:.5*tactical+.5*center;
return{who,where:actualWhere,when};
}
function adapt(moves,pos,engine,ttMove){
if(!Array.isArray(moves)||!pos||!Array.isArray(pos.board)||!engine||!engine.chess||!engine.subit||typeof engine.scoreMove!=='function')throw new TypeError('moves, position, chess, subit and scoreMove are required');
const chess=engine.chess,subit=engine.subit;
const ctx=subit.computeS(pos),contextKey=typeof subit.keyOfS==='function'?subit.keyOfS(ctx):[ctx.who,ctx.where,ctx.when].join('|');
const enemyKing=pos.kingPos&&pos.kingPos[pos.turn==='w'?'b':'w'];
const result=moves.map(m=>{
if(!m||!Array.isArray(m.from)||!Array.isArray(m.to))throw new TypeError('engine move must have from/to coordinate pairs');
const piece=pos.board[m.from[0]]&&pos.board[m.from[0]][m.from[1]];
const target=pos.board[m.to[0]]&&pos.board[m.to[0]][m.to[1]];
const tactical=(target!=='.'||m.ep||m.promo)?1:0;
const center=Math.max(0,1-(Math.abs(3.5-m.to[0])+Math.abs(3.5-m.to[1]))/7);
const advance=clamp(pos.turn==='w'?(6-m.to[0])/6:(m.to[0]-1)/6,-1,1);
const king=piece&&piece.toUpperCase()==='K'?1:0;
const travel=distance(m.from,m.to)/7;
const enemyNear=enemyKing?Math.max(0,1-distance(enemyKing,m.to)/7):0;
const fits=contextFit(ctx,tactical,center,advance,king,travel,enemyNear,m.to[1],piece?piece.toUpperCase():null);
const id=chess.moveToUci(m);
return{id,score:engine.scoreMove(m,pos,0,ttMove),features:[tactical,center,advance,king,travel,enemyNear,fits.who,fits.where,fits.when],context:[fits.who,fits.where,fits.when],from:m.from.join(','),to:m.to.join(','),tactical,contextKey,engineMove:m};
});
return{candidates:result,context:ctx,contextKey};
}
return{adapt,WHO,WHERE,WHEN,version:'0.2.1-adapter'};
});
