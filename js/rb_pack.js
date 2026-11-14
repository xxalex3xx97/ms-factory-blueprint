// RB one-module packing. COPY of the width search + column-group DP of js/cmp_asm.js 163-221 (cnt, cmpShr, grp DP, place), run on ONE module only:
// three logical columns [IN | FB | POOL] west to east packed into physical blocks (nPhys 1..3). Page globals needed: cmpShr, cmpPool, cmpFeed, tplIfSets.
// rbPack(c) c={W,H,mk,dw?,fb:{b,bi},inF?,poolF,Rout?,outRows?}
//   W,H block floor; mk belt tier; dw block width in units (default 1, DP tie cost); fb.b = built template (floor b.w), fb.bi = its items
//   inF(w)   -> hub result {ok,items,why} of the IN piece at floor width w; omit for a piece-less IN (merge region: caller supplies)
//   poolF(w,outRows) -> cmpPool result for the POOL piece
//   Rout     number of east lanes out of the POOL (consumer port rows). Worst case: outRows packed at the top (1+2k) and at the bottom (H-2-2(R-1-k)); the POOL width = max of the two searches.
//   outRows  explicit east lane rows (one variant, overrides Rout)
// -> {ok:true,nPhys,w,used,pw:[win,wfb,wpool],poolW:{top,bot,max},cols:[{pieces:[i..],x:[offset of each piece in the block],w:[width of each piece],Wb}],colP,colX,colW,items:{in,fb,pool}}
//    w = nPhys*W (the unused tail of a block is given to the piece whose item count grows least, so every block is full), used = sum of piece widths before slack
//    | {ok:false,why} (cmpPool / cmpFeed why when a hub does not fit)
function rbPack(c){
  const {W,H,mk}=c,b=c.fb.b,bi=c.fb.bi,hW=W,dw=c.dw||1,Inf=Infinity;
  const R=c.Rout|0,top=Array.from({length:R},(_,k)=>1+2*k),bot=Array.from({length:R},(_,k)=>H-2-2*(R-1-k));
  const vars=c.outRows?[c.outRows]:R?[top,bot]:[[]];
  const len=r=>r&&r.ok!==false?r.items.length:Inf,memo=new Map(),mw=cmpShr(b,mk);
  const cntV=(i,w,v)=>{
    if(i===0)return c.inF?len(c.inF(w)):0;
    if(i===1){const it=w>=b.w?bi:w>=mw?cmpShr(b,mk,w):null;return it?it.length:Inf}
    return len(c.poolF(w,vars[v]));
  };
  const cnt=(i,w)=>{const key=i+','+w;if(memo.has(key))return memo.get(key);const t=i===2?Math.max(...vars.map((_,v)=>cntV(2,w,v))):cntV(i,w,0);memo.set(key,t);return t};
  const srch=f=>{const ref=f(hW);let w=8;if(ref<Inf){while(w<hW&&f(w)>ref)w++}else{while(w<W&&f(w)===Inf)w++}return w};   // narrowest width whose item count does not exceed the one at the full width
  const ww=[c.inF?srch(w=>cnt(0,w)):0,mw,0],pwv=vars.map((_,v)=>srch(w=>cntV(2,w,v)));
  ww[2]=Math.max(...pwv);
  for(const i of [0,2]){if(i===0&&!c.inF)continue;if(cnt(i,ww[i])===Inf){const r=i===0?c.inF(W):c.poolF(W,vars[0]);return{ok:false,why:r.why||'hub does not fit'}}}
  const qs=[0,1,2].filter(i=>ww[i]>0),n=qs.length,cost=Array(n+1).fill(Inf),prv=Array(n+1).fill(0);cost[0]=0;
  for(let i=1;i<=n;i++){let sum=0;for(let j=i-1;j>=0;j--){sum+=ww[qs[j]];if(sum>W)break;const q=cost[j]+1000+dw;if(q<cost[i]){cost[i]=q;prv[i]=j}}}   // one row: fewest blocks
  const grp=[];for(let i=n;i>0;i=prv[i])grp.unshift(qs.slice(prv[i],i));
  const colP=[],colX=[],colW=[],cols=[];
  grp.forEach((g,idx)=>{
    const sum=g.reduce((a,q)=>a+ww[q],0),sl=W-sum;let r=g.length-1;
    if(sl>0){let bd=Inf;g.forEach((q,k)=>{const dl=cnt(q,ww[q]+sl)-cnt(q,ww[q]);if(dl<bd){bd=dl;r=k}})}
    let off=0;const x=[],w=[];
    g.forEach((q,k)=>{const wq=ww[q]+(k===r?sl:0);colP[q]=idx;colX[q]=idx*FC+off;colW[q]=wq;x.push(off);w.push(wq);off+=wq});
    cols.push({pieces:g,x,w,Wb:W});
  });
  const fw=colW[1],items={in:c.inF?c.inF(colW[0]).items:[],fb:fw===W||fw===b.w?bi:cmpShr(b,mk,fw),pool:c.poolF(colW[2],vars[0]).items};
  if(!items.fb)return{ok:false,why:'shrink failed'};
  return{ok:true,nPhys:grp.length,w:grp.length*W,used:ww.reduce((a,v)=>a+v,0),pw:colW.slice(),pw0:ww.slice(),poolW:{top:pwv[0],bot:pwv.length>1?pwv[1]:pwv[0],max:ww[2]},cols,colP,colX,colW,items};
}
// built template + Edge Interface lane tables of one planner node (copy of cmp_asm.js 144-150). z = cmpTreeSize .by[o.id]. -> {ok,b,bi,inR,outRows,outN,gOut} | {ok:false,why}
function rbNodeNB(o,z,block,W,H){
  const pk=tplPick(o.cls,o.k,block),b=pk.t.build({...z.base,S:z.S,n:o.N});
  if(!b.ok)return{ok:false,why:b.why};
  if(!b.iface||b.iface.v!==1)return{ok:false,why:'template not on Edge Interface v1'};
  if(b.w!==W||b.h>H)return{ok:false,why:'template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H};
  const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M;
  return{ok:true,b,bi:b.items,outRows:used.flatMap(q=>q.outs||[q.o]),outN:used.every(q=>q.outN)?used.flatMap(q=>q.outN):null,gOut:b.iface.gOut,
    inR:o.rec.i.map((_,j)=>o.k>=2?b.ports.in.filter(p=>p.item===j&&b.iface.sets[p.set].n>0).map(p=>p.y):used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+i)))};
}
// pack one src / feed planner node as a module (merge nodes: pass inF yourself via rbPack). x = {block,bx,W,H,mk,Rout,dw}; sz = z.S
function rbPackNode(o,z,NB,x){
  const {block,bx,W,H,mk}=x,bz=NB.b,hs=tplIfSets(block,z.S).hs,sets=bz.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:bz.ports&&bz.ports.in?bz.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0);
  const fS={H,mk,bx,sets,M:bz.iface.M,k:o.k,main:0,pass:[],rawItems:o.rec.i.map(q=>q[0]),allRaw:true,seed:o.growth?o.key:null};
  const inF=o.inKind==='src'?w=>cmpPool({W:w,H,mk,bx,item:o.rec.i[0][0],raw:true,inRows:[],outRows:NB.inR[0]}):o.inKind==='feed'?w=>cmpFeed({...fS,W:w}):null;
  const mm=cmpMerge(NB.outRows,NB.outN,NB.gOut);
  const poolF=(w,outRows)=>cmpPool({W:w,H,mk,bx,item:0,raw:false,inRows:mm.rows,mgIn:mm.mg,outRows});
  return rbPack({W,H,mk,dw:x.dw,fb:{b:NB.b,bi:NB.bi},inF,poolF,Rout:x.Rout,outRows:x.outRows});
}
