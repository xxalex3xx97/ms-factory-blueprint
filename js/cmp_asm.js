// CMP C3 assembler (composer): strips of blocks [SRC][FB1][POOL][FB2]...[OZ], template + hub items at block origins, wall UG swap, tile result. Spec: vault main-sequence/tasks/2026-11-13-composer-spec.md 2.4-2.6.
// cmpAssemble(c) c={P,item,mk,spMk,bx,bk (name of the Blocks select class),sz (cmpSize result),stages (cmpTree stages)} -> {ok:true,T} | {ok:false,why}. Linear chain of 1-input stages (k=1); K strips stacked vertically.
const CMP_BLOCKS=['1x1','1x2','2x2','2x2c'];
function cmpAssemble(c){
  const {mk,spMk,bx,bk,sz,stages}=c,no=why=>({ok:false,why}),cls=plcCls(bk),d=dim({cls,rot:0}),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h,TW=d.w*FC,L=stages.length,K=sz.K;
  const block=CMP_BLOCKS[PL_ALL.indexOf(bk)],ugc=PLC_UG[mk],ncol=2*L+1,ms=[],blocks=[];let nug=0;
  for(let j=0;j<K;j++){
    const fbs=[],y0=j*d.h*FC;
    for(let s=0;s<L;s++){
      const g=stages[s],z=sz.stages[s],st=z.strips[j],pk=tplPick(g.cls,g.k,block);
      if(!pk.ok)return no(pk.why);
      if(g.k!==1)return no('composer builds 1-input stages only ('+z.item+' has '+g.k+')');
      const main=s?g.node.rec.i.findIndex(([it])=>it===stages[s-1].item):0;
      const b=pk.t.build({block,cls:g.cls,rec:g.rec,recObj:g.node.rec,recd:g.node.rec,mk,spMk,S:st.S,n:st.n,main,growth:g.growth,raw:g.k-(s?1:0)});
      if(!b.ok)return no(b.why);
      if(!b.iface||b.iface.v!==1)return no('template not on Edge Interface v1');
      if(b.w!==W||b.h!==H)return no('template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H);
      if(b.items.some(q=>{const e=dim(q);return q.x<0||q.y<0||q.x+e.w>W||q.y+e.h>H}))return no('template items outside the block floor ('+z.item+', '+block+')');
      const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M;
      fbs.push({items:b.items,inRows:used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+main*M+i)),outRows:used.map(q=>q.o)});
    }
    const hub=(inRows,outRows,raw,item)=>cmpPool({W,H,mk,bx,item,raw,inRows,outRows});
    const seq=[hub([],fbs[0].inRows,true,stages[0].node.rec.i[0][0])];
    for(let s=0;s<L;s++){seq.push({items:fbs[s].items});seq.push(hub(fbs[s].outRows,s<L-1?fbs[s+1].inRows:[],false,0))}
    for(const h of seq)if(h.ok===false)return no(h.why);
    const strip=[];
    seq.forEach((h,i)=>{h.items.forEach(b=>strip.push({...b,x:b.x+i*TW,y:b.y+y0}));blocks.push({cls,x:i*d.w,y:j*d.h})});
    // wall swap: belts on both sides of a block boundary (A at x=W-1, B at x=0), same row -> UG pair (entrance, exit), same rot
    const at=new Map();strip.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});
    for(let i=0;i+1<ncol;i++)for(let y=y0;y<y0+H;y++){
      const A=at.get((i*TW+W-1)+','+y),B=at.get(((i+1)*TW)+','+y);
      if(A&&B){A.cls=B.cls=ugc;nug+=2}
    }
    ms.push(...strip);
  }
  const max=def(ugc).maxApart,pairs=ugPairs(ms.filter(b=>PLC_UG.includes(b.cls)));
  return{ok:true,T:{ok:true,blocks,ms,ug:nug,cols:ncol,rows:K,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1}};
}
