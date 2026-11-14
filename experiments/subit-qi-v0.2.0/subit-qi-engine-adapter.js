(function(root,factory){
 if(typeof module==='object'&&module.exports) module.exports=factory();
 else root.SubitQIEngineAdapter=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function manhattan(a,b){return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);}
function deriveContextFit(ctx,x){
 let whoFit;
 if(ctx.who==='ATTACK') whoFit=.7*x.tactical+.3*x.enemyNear;
 else if(ctx.who==='PRESSURE') whoFit=.55*x.center+.45*x.travel;
 else if(ctx.who==='DEFENCE') whoFit=.55*x.king+.45*(x.tactical?.5:1);
 else whoFit=.7*(1-x.tactical)+.3*x.center;
 let whereFit;
 if(ctx.where==='KING') whereFit=x.enemyNear;
 else if(ctx.where==='CENTER') whereFit=x.center;
 else if(ctx.where==='QUEENSIDE') whereFit=x.file<=2?1:(x.file<=4?.35:0);
 else whereFit=x.travel;
 let whenFit;
 if(ctx.when==='TACTICAL') whenFit=x.tactical;
 else if(ctx.when==='OPENING') whenFit=((x.pieceType==='N'||x.pieceType==='B')?.65:0)+.35*x.center;
 else if(ctx.when==='ENDGAME') whenFit=.55*x.advance+.45*x.king;
 else whenFit=.5*x.tactical+.5*x.center;
 return{who:whoFit,where:whereFit,when:whenFit};
}
function adapt(moves,pos,engine,ttMove){
 if(!Array.isArray(moves)||!pos||!Array.isArray(pos.board)||pos.board.length!==8||
    !engine||!engine.chess||typeof engine.chess.moveToUci!=='function'||
    !engine.subit||typeof engine.subit.computeS!=='function'||
    typeof engine.scoreMove!=='function') throw new TypeError('valid moves, 8x8 position, chess.moveToUci, subit.computeS and scoreMove are required');
 const ctx=engine.subit.computeS(pos);
 const contextKey=typeof engine.subit.keyOfS==='function'?engine.subit.keyOfS(ctx):[ctx.who,ctx.where,ctx.when].join('|');
 const enemyKing=pos.kingPos&&pos.kingPos[pos.turn==='w'?'b':'w'];
 const candidates=moves.map(m=>{
  if(!m||!Array.isArray(m.from)||m.from.length!==2||!Array.isArray(m.to)||m.to.length!==2)
   throw new TypeError('engine move must have from/to coordinate pairs');
  const piece=pos.board[m.from[0]]&&pos.board[m.from[0]][m.from[1]];
  const target=pos.board[m.to[0]]&&pos.board[m.to[0]][m.to[1]];
  const tactical=(target!=='.'||m.ep||m.promo)?1:0;
  const center=Math.max(0,1-(Math.abs(3.5-m.to[0])+Math.abs(3.5-m.to[1]))/7);
  const advance=clamp(pos.turn==='w'?(6-m.to[0])/6:(m.to[0]-1)/6,-1,1);
  const king=piece&&piece.toUpperCase()==='K'?1:0;
  const travel=manhattan(m.from,m.to)/7;
  const enemyNear=enemyKing?Math.max(0,1-manhattan(enemyKing,m.to)/7):0;
  const fits=deriveContextFit(ctx,{tactical,center,advance,king,travel,enemyNear,file:m.to[1],pieceType:piece?piece.toUpperCase():null});
  return{
   id:engine.chess.moveToUci(m),
   score:engine.scoreMove(m,pos,0,ttMove),
   features:[tactical,center,advance,king,travel,enemyNear,fits.who,fits.where,fits.when],
   context:[fits.who,fits.where,fits.when],
   from:m.from.join(','),to:m.to.join(','),
   tactical,contextKey,engineMove:m
  };
 });
 return{candidates,context:ctx,contextKey};
}
return{adapt,deriveContextFit,version:'0.2.1-adapter'};
});
