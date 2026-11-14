// CMP C3 assembler (composer): strips of blocks [SRC][FB1][POOL][FB2]...[OZ], template + hub items at block origins, wall UG swap, tile result. Spec: vault main-sequence/tasks/2026-11-13-composer-spec.md 2.4-2.6.
// cmpAssemble(c) c={P,item,mk,spMk,bx,bk (name of the Blocks select class),sz (cmpSize result),stages (cmpTree stages)} -> {ok:true,T} | {ok:false,why}. Linear chain of 1-input stages (k=1), first stage may have k>=2 all raw (FEED block, allRaw, seed container); K strips stacked vertically.
const CMP_BLOCKS=['1x1','1x2','2x2','2x2c'];
// F2 narrow hubs: a hub column (pool / source / feed / merge) next to a 2x2 factory block is a rotated 1x2 block (floor 14x30), next to a 1x2 block a 1x1 (14x14); shorter lanes, fewer belts. null = no narrower block
const cmpHubBlk=bk=>bk==='BPO_Station_02'||bk==='BPO_Station_03'?{cls:plcCls('BPO_Station_2x1'),rot:1,W:14,H:30,dw:1}:bk==='BPO_Station_2x1'?{cls:plcCls('BPO_Station_01'),rot:0,W:14,H:14,dw:1}:null;
// narrow first (docks keep the full-size hubs); a column whose hub does not fit goes full size and the build is retried (r.col = failing column)
// SHAPE2: with docks narrow hubs only on 2x2 (hubs carry hx/hw/hu tags for cmp_dock.js), no FEED hubs; a narrow build that fails or misses a dock is rebuilt full-size (as before)
const cmpNarrow=(c,f)=>{if(globalThis.CMP_NARROW===false||c.dk&&c.bk!=='BPO_Station_02')return f(c,null);const n0=c.dk&&c.dk.notes.length,go=()=>{const wide=new Set();for(;;){if(c.dk)c.dk.notes.length=n0;const r=f(c,wide);if(r.ok&&c.dk&&r.dock){const dh=r.dock.nar.filter(h=>!wide.has(h));if(dh.length){dh.forEach(h=>wide.add(h));continue}}   // ROT: a dock needs a door; the rot-1 1x2 hub is solid on its long sides, so a hub column carrying dock containers stays full size
      if(r.ok||!(r.col>=0)||wide.has(r.col))return r;wide.add(r.col)}};
  const r=go();if(!c.dk||r.ok&&!(r.dock&&r.dock.miss&&r.dock.miss.length))return r;c.dk.notes.length=n0;return f(c,null)};
function cmpAssemble(c){return cmpNarrow(c,(c,w)=>{const n0=c.dk&&c.dk.notes.length,r=cmpAssemble1(c,w,1);if(!r.fz||r.ok&&!(r.dock&&r.dock.miss&&r.dock.miss.length))return r;if(c.dk)c.dk.notes.length=n0;return cmpAssemble1(c,w,0)})}
function cmpAssemble1(c,wide,fz){
  const {mk,spMk,bx,bk,sz,stages}=c,dk=c.dk,no=why=>({ok:false,why,col:badCol,fz:!!fu}),cls=plcCls(bk),d=dim({cls,rot:0}),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h,TW=d.w*FC,L=stages.length,K=sz.K;
  const block=CMP_BLOCKS[PL_ALL.indexOf(bk)],nb=wide&&!(dk&&stages.some(g=>g.k>=2))?cmpHubBlk(bk):null,hW=nb?nb.W:W,cwd=i=>nb&&!wide.has(i)?hW:W,ugc=PLC_UG[mk],nMid=stages.filter((g,s)=>s&&g.k>=2).length,ncol=2*L+1+nMid,P=dk&&dk.in&&K>1&&stages.some(g=>g.k>=2)?d.h+1+(bk==='BPO_Station_03'?1:0):d.h,ms=[],blocks=[],fu=fz&&K===1&&!globalThis.CMP_NOFUSE&&(!dk||!stages.some(g=>g.k>=2));let nug=0,badCol=-1;   // D2: gap unit row between strips when side docks are needed
  for(let j=0;j<K;j++){
    const fbs=[],y0=j*P*FC;
    for(let s=0;s<L;s++){
      const g=stages[s],z=sz.stages[s],st=z.strips[j],pk=tplPick(g.cls,g.k,block);
      if(!pk.ok)return no(pk.why);
      if(s===0&&g.k>=2&&pk.id==='assembler_2in')return no('all-raw 2-input assembler as a chain start is not built yet ('+g.node.rec.i.length+' inputs)');
      if(g.k!==1&&s>0&&g.k<2)return no('composer builds 1-input stages only ('+z.item+' has '+g.k+')');
      const main=s?g.node.rec.i.findIndex(([it])=>it===stages[s-1].item):0;
      const b=pk.t.build({block,cls:g.cls,rec:g.rec,recObj:g.node.rec,recd:g.node.rec,mk,spMk,S:st.S,n:st.n,main,growth:g.growth,raw:g.k-(s?1:0)});
      if(!b.ok)return no(b.why);
      if(!b.iface||b.iface.v!==1)return no('template not on Edge Interface v1');
      if(b.w!==W||b.h!==H)return no('template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H);
      if(b.items.some(q=>{const e=dim(q);return q.x<0||q.y<0||q.x+e.w>W||q.y+e.h>H}))return no('template items outside the block floor ('+z.item+', '+block+')');
      const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M,hs=tplIfSets(block,st.S).hs;
      // first stage with k>=2: all inputs raw -> FEED block (allRaw) instead of SRC
      const feed=s===0&&g.k>=2?{sets:b.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:b.ports&&b.ports.in?b.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0),M,k:g.k}:null;
      const mid=s&&g.k>=2?{sets:b.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:b.ports&&b.ports.in?b.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0),M,k:g.k,main}:null;
      fbs.push({b,feed,mid,items:b.items,inRows:used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+main*M+i)),outRows:used.flatMap(q=>q.outs||[q.o]),outN:used.every(q=>q.outN)?used.flatMap(q=>q.outN):null,gOut:b.iface.gOut});
    }
    const f0=fbs[0].feed,g0=stages[0],shr=s=>sz.stages[s].strips[j].n/sz.stages[s].strips.reduce((a,v)=>a+v.n,0);
    let dI=null,dO=null;   // C7: dock cells of the SRC / OZ hub of this strip
    if(dk&&dk.in&&!f0){const E=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{}),e=E.find(e=>e.from===g0.node.rec.i[0][0]&&e.to===g0.item);dI=cmpDockHub(dk,{kind:'in',name:cmpName(g0.node.rec.i[0][0]),D:(e?e.flow:0)*shr(0),rows:fbs[0].inRows,H,dh:d.h,j})}
    if(dk&&dk.out)dO=cmpDockHub(dk,{kind:'out',name:cmpName(c.item),D:c.P.nodes[c.item].rate*shr(L-1),rows:cmpMerge(fbs[L-1].outRows,fbs[L-1].outN,fbs[L-1].gOut).rows,H,dh:d.h,j});
    if(dI&&dI.ok===false)return no(dI.why);if(dO&&dO.ok===false)return no(dO.why);
    const hub=(inRows,outRows,raw,item,x)=>cmpPool({W:cwd(seq.length),H,mk,bx,item,raw,inRows,outRows,...x});
    const fS=f0&&{W:cwd(0),H,mk,bx,sets:f0.sets,M:f0.M,k:f0.k,main:0,pass:[],rawItems:g0.node.rec.i.map(q=>q[0]),allRaw:true,seed:g0.growth?g0.item:null,j,K};
    if(fS&&dk&&dk.in){const E=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{});fS.names=fS.rawItems.map(cmpName);fS.D=fS.rawItems.map(it=>{const e=E.find(e=>e.from===it&&e.to===g0.item);return(e?e.flow:0)*shr(0)})}
    if(fu){   // COMPACT (K=1, no docks): pieces [hub][FB][POOL]... get minimum widths (shrunk template tail, hub min width) and are packed into shared blocks (DP: fewest blocks, then area), lanes meet at piece edges
      const Bl=[],fi=[],E3=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{});
      Bl.push(f0?w=>cmpFeed({...fS,W:w}):w=>cmpPool({W:w,H,mk,bx,item:g0.node.rec.i[0][0],raw:true,inRows:[],outRows:fbs[0].inRows,...dI}));fi.push(-1);
      for(let s=0;s<L;s++){
        const m=fbs[s].mid;
        if(m){const rawItems=stages[s].node.rec.i.map(q=>q[0]).filter((_,i)=>i!==m.main),fm={H,mk,bx,sets:m.sets,M:m.M,k:m.k,main:m.main,pass:fbs[s].inRows,rawItems,allRaw:false};Bl.push(w=>cmpFeed({...fm,W:w}));fi.push(-1)}
        Bl.push(null);fi.push(s);
        const mm=cmpMerge(fbs[s].outRows,fbs[s].outN,fbs[s].gOut),nx=s<L-1?fbs[s+1].inRows:[];
        Bl.push(w=>cmpPool({W:w,H,mk,bx,item:0,raw:false,inRows:mm.rows,mgIn:mm.mg,outRows:nx,...(s===L-1?dO:null)}));fi.push(-1);
      }
      const nbx=dk?null:nb,n=Bl.length,mwi=fi.map((s,i)=>s>=0?cmpShr(fbs[s].b,mk):0),cnt=(i,w)=>{const f=Bl[i];if(f){const r=f(w);return r.ok===false?Infinity:r.items.length}const bq=fbs[fi[i]].b;if(w>=bq.w)return fbs[fi[i]].items.length;const it=w>=mwi[i]?cmpShr(bq,mk,w):null;return it?it.length:Infinity};   // items of piece i at width w
      const ww=Bl.map((f,i)=>{if(!f)return mwi[i];const ref=cnt(i,hW);let w=8;if(ref<Infinity){while(w<hW&&cnt(i,w)>ref)w++}else{while(w<W&&cnt(i,w)===Infinity)w++}return w}),cost=Array(n+1).fill(Infinity),prv=Array(n+1).fill(0);cost[0]=0;
      for(let i=1;i<=n;i++){let sum=0;for(let j=i-1;j>=0;j--){sum+=ww[j];if(sum>W)break;const q=cost[j]+1000+(nbx&&sum<=hW?nbx.dw:d.w);if(q<cost[i]){cost[i]=q;prv[i]=j}}}
      const grp=[];for(let i=n;i>0;i=prv[i])grp.unshift([prv[i],i]);
      const cu=[],cx=[],cw=[],pgi=[],pe=new Set();let ux=0,gi=0;
      for(const [a,z] of grp){const sum=ww.slice(a,z).reduce((t,v)=>t+v,0),nar=!!(nbx&&sum<=hW),Wb=nar?hW:W;let off=0;
        const sl=Wb-sum;let r=z-1;if(sl>0){let bd=Infinity;for(let i=a;i<z;i++){const dl=cnt(i,ww[i]+sl)-cnt(i,ww[i]);if(dl<bd){bd=dl;r=i}}}
        for(let i=a;i<z;i++){const w=ww[i]+(i===r?sl:0);cu.push(ux);cx.push(ux*FC+off);cw.push(w);pgi.push(gi);off+=w}gi++;
        pe.add(z-1);blocks.push(nar?{cls:nb.cls,x:ux,y:j*P,...(nb.rot?{rot:nb.rot}:{})}:{cls,x:ux,y:j*P});ux+=nar?nb.dw:d.w}
      const strip=[];
      for(let i=0;i<n;i++){
        let h;
        if(Bl[i])h=Bl[i](cw[i]);else{const bq=fbs[fi[i]].b,it=cw[i]===bq.w?fbs[fi[i]].items:cmpShr(bq,mk,cw[i]);h=it?{items:it}:{ok:false,why:'shrink failed'}}
        if(h.ok===false)return no(h.why);
        h.items.forEach(b=>strip.push({...b,x:b.x+cx[i],y:b.y+y0,...(b.dk?{hx:cu[i]*FC,hw:W,hu:d.w,hc:pgi[i]}:{})}));
      }
      const at=new Map();strip.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});
      for(let i=0;i+1<n;i++)if(pe.has(i))for(let y=y0;y<y0+H;y++){const A=at.get((cx[i]+cw[i]-1)+','+y),B=at.get(cx[i+1]+','+y);if(A&&B){A.cls=B.cls=ugc;nug+=2}}
      ms.push(...strip);continue;
    }
    const seq=[];seq.push(f0?(fS.D?cmpFeedDock(fS,dk,d.h,fS.D,d.w,[j===0||P>d.h?'N':0,j===K-1||P>d.h?'S':0].filter(Boolean)):cmpFeed(fS)):hub([],fbs[0].inRows,true,g0.node.rec.i[0][0],dI));
    const E2=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{});
    for(let s=0;s<L;s++){
      const m=fbs[s].mid;
      if(m){   // mid-chain raws: FEED hub before the FB (chain lanes pass, raws from N/S dock containers); D2
        const g=stages[s],rawItems=g.node.rec.i.map(q=>q[0]).filter((_,i)=>i!==m.main),fm={W:cwd(seq.length),H,mk,bx,sets:m.sets,M:m.M,k:m.k,main:m.main,pass:fbs[s].inRows,rawItems,allRaw:false};
        if(dk&&dk.in){fm.names=rawItems.map(cmpName);fm.D=rawItems.map(it=>{const e=E2.find(e=>e.from===it&&e.to===g.item);return(e?e.flow:0)*shr(s)})}
        seq.push(fm.D?cmpFeedDock(fm,dk,d.h,fm.D,d.w,['N','S']):cmpFeed(fm))}
      seq.push({items:fbs[s].items,fb:1});const mm=cmpMerge(fbs[s].outRows,fbs[s].outN,fbs[s].gOut);seq.push(hub(mm.rows,s<L-1?fbs[s+1].inRows:[],false,0,{mgIn:mm.mg,...(s===L-1?dO:null)}))}
    for(let i=0;i<seq.length;i++)if(seq[i].ok===false){badCol=i;return no(seq[i].why)}
    const strip=[];
    const nh=(h,i)=>nb&&!h.fb&&!wide.has(i),cu=[],cx=[],cw=[];let ux=0;   // per column: unit x, cell x, floor width
    seq.forEach((h,i)=>{cu.push(ux);cx.push(ux*FC);cw.push(nh(h,i)?hW:W);ux+=nh(h,i)?nb.dw:d.w});
    seq.forEach((h,i)=>{h.items.forEach(b=>strip.push({...b,x:b.x+cx[i],y:b.y+y0,...(b.dk?{hx:cx[i],hw:cw[i],hu:nh(h,i)?nb.dw:d.w,hc:i}:{})}));blocks.push(nh(h,i)?{cls:nb.cls,x:cu[i],y:j*P,...(nb.rot?{rot:nb.rot}:{})}:{cls,x:cu[i],y:j*P})});
    // wall swap: belts on both sides of a block boundary (A at x=W-1, B at x=0), same row -> UG pair (entrance, exit), same rot
    const at=new Map();strip.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});
    for(let i=0;i+1<ncol;i++)for(let y=y0;y<y0+H;y++){
      const A=at.get((cx[i]+cw[i]-1)+','+y),B=at.get(cx[i+1]+','+y);
      if(A&&B){A.cls=B.cls=ugc;nug+=2}
    }
    ms.push(...strip);
  }
  const max=def(ugc).maxApart,pairs=ugPairs(ms.filter(b=>PLC_UG.includes(b.cls)));
  const T={ok:true,blocks,ms,ug:nug,cols:ncol,rows:K,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1};
  if(dk&&(dk.in||dk.out)){const r=cmpDockApply({cls,mk},T,{P});if(!r.ok)return no(r.why);return{ok:true,T,dock:r,fz:!!fu}}
  return{ok:true,T,fz:!!fu};
}

// COMPACT: template tail shrink. A built template (floor b.w) keeps its machines at the west and only straight rot-0 collector runs (belts / UG hops) + the east trunk (x>=W-2) beyond the last machine, so for small n the tail is mostly empty.
// cmpShr(b,mk) -> smallest floor width the same layout fits (= b.w when the tail cannot shrink); cmpShr(b,mk,Wt) -> items shrunk to width Wt (Wt >= min) or null. Template-agnostic: only the zone [xs,W-3] holding rot-0 belt/UG runs ending at W-3 is cut, runs are rebuilt (UG hops), x>=W-2 shifts west rigidly.
function cmpShr(b,mk,Wt){
  const W=b.w,isRun=q=>(q.rot|0)===0&&(PLC_BELT.includes(q.cls)||PLC_UG.includes(q.cls));
  let xs=1;
  for(const q of b.items)if(q.x<=W-3&&!isRun(q))xs=Math.max(xs,q.x+dim(q).w);
  let rows;
  for(;;){   // zone rows: every item at x>=xs (x<=W-3) is a run; a row that does not reach W-3 is machine-side stub: push xs past it
    rows=new Map();let moved=false;
    for(const q of b.items)if(q.x>=xs&&q.x<=W-3){if(!rows.has(q.y))rows.set(q.y,[]);rows.get(q.y).push(q)}
    for(const [,l] of rows){const mx=Math.max(...l.map(q=>q.x));if(mx<W-3){xs=mx+1;moved=true}}
    if(!moved)break;
  }
  let xa=0;const start=new Map();
  for(const [y,l] of rows){
    let x0=Math.min(...l.map(q=>q.x));
    const ug=b.items.filter(q=>q.y===y&&PLC_UG.includes(q.cls)&&(q.rot|0)===0).sort((a,c)=>a.x-c.x),i=ug.findIndex(q=>q.x===x0&&l.includes(q));
    if(i>=0&&i%2===1)x0=ug[i-1].x;   // zone starts on a hop exit: the whole pair is rebuilt
    start.set(y,x0);xa=Math.max(xa,x0);
  }
  const min=Math.min(W,Math.max(xs,xa)+3);
  if(Wt==null)return min;
  if(Wt<min||Wt>W)return null;
  const dx=W-Wt,out=[],cut=new Set(),del=new Set();
  for(const [y,x0] of start)for(const q of b.items)if(q.y===y&&q.x>=x0&&q.x<=W-3&&isRun(q))del.add(q);
  for(const q of b.items){if(del.has(q))continue;out.push(q.x>=W-2?{...q,x:q.x-dx}:q)}
  for(const [y,x0] of start)cmpRun(out,mk,y,x0,Wt-3);
  return out;
}
// CMP S7b: tree assembler. cmpAssembleTree({mk,spMk,bx,bk,pl (cmpPlan),sz (cmpTreeSize .by)}) -> {ok,T,nodes,routed} | {ok:false,why}.
// Per node [IN][FB][POOL] at block columns o.col..o.col+2, block row o.row. IN = SRC block (k=1 raw), or a MERGE region (any crafted input): one block column of belts spanning the strip rows of the
// node's subtree, routed by cmpRoute (child POOL/SRC east lanes at x=0 -> parent slot rows at x=W-1). Raw children of a merge node are SRC supplier blocks in their own strip row.
function cmpAssembleTree(c){return cmpNarrow(c,(c,w)=>{const n0=c.dk&&c.dk.notes.length,r=cmpAssembleTree1(c,w,1);if(!r.fz||r.ok&&!(r.dock&&r.dock.miss&&r.dock.miss.length))return r;if(c.dk)c.dk.notes.length=n0;return cmpAssembleTree1(c,w,0)})}   // packed build first; a refused / dock-missing packed build retries one block per column
// COMPACT with docks needs every raw hub (supplier SRC pool / src-node IN) in logical column 0 (the west dock edge) and no FEED node (N/S docks) and no GROUPS plan (pl.g); otherwise the one-block-per-column layout
const cmpTreeDockOk=pl=>!pl.g&&pl.nodes.every(o=>o.inKind!=='feed'&&(o.raw?(pl.nodes.find(p=>p.id===o.parent).inKind!=='merge'||o.pool===0):o.inKind!=='src'||o.col===0));
function cmpAssembleTree1(c,wide,fz){
  const {mk,spMk,bx,bk,pl,sz}=c,dk=c.dk,nof=!fz||!!globalThis.CMP_NOFUSE||!!dk&&!cmpTreeDockOk(pl),no=why=>({ok:false,why,col:badCol,fz:!nof}),cls=plcCls(bk),d=dim({cls,rot:0}),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h,TW=d.w*FC,TH=d.h*FC,ugc=PLC_UG[mk],nb=wide&&!(dk&&(!nof||pl.nodes.some(o=>o.inKind==='feed')))?cmpHubBlk(bk):null,hW=nb?nb.W:W;
  let badCol=-1;
  let colU=[],colX=[],colW=[],colP=[],pU=[],pX=[],pW=[],pN=[];const nc=col=>pN[colP[col]];   // physical block columns (pU unit x, pX cell x, pW floor width, pN narrow) and logical IN/FB/POOL columns (piece x colX, width colW)
  const block=CMP_BLOCKS[PL_ALL.indexOf(bk)],byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),NB={},ms=[],routed=[],OR={};
  const put=(items,col,row,tag)=>items.forEach(b=>{const q={...b,x:b.x+colX[col],y:b.y+row*TH,...(b.dk?{hx:pX[colP[col]],hw:pW[colP[col]],hu:nc(col)?nb.dw:d.w,hc:col}:{})};ms.push(q);if(tag)tag.push(q)});
  const hubAt=(h,col,row,nb)=>{if(h.ok===false){badCol=col;return h.why}put(h.items,col,row);if(nb)h.items.filter(q=>q.ct).forEach(q=>nb.ct.push((q.x+colX[col])+','+(q.y+row*TH)))};
  for(const o of pl.nodes){   // 1 FB blocks
    if(o.raw)continue;
    const z=sz[o.id],pk=tplPick(o.cls,o.k,block),b=pk.t.build({...z.base,S:z.S,n:o.N});
    if(!b.ok)return no(b.why);
    if(!b.iface||b.iface.v!==1)return no('template not on Edge Interface v1');
    if(b.w!==W||b.h>H)return no('template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H);
    if(b.items.some(q=>{const e=dim(q);return q.x<0||q.y<0||q.x+e.w>W||q.y+e.h>H}))return no('template items outside the block floor ('+o.item+', '+block+')');
    const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M;
    NB[o.id]={b,lanes:b.ports.in.map((p,t)=>({y:p.y,key:o.rec.i[typeof p.item==='number'?p.item:0][0],m:b.rows&&b.rows[t]&&b.rows[t].m!=null?b.rows[t].m:null})).filter(l=>l.m!==0),ct:[],outRows:used.flatMap(q=>q.outs||[q.o]),outN:used.every(q=>q.outN)?used.flatMap(q=>q.outN):null,gOut:b.iface.gOut,inR:o.rec.i.map((_,j)=>o.k>=2?b.ports.in.filter(p=>p.item===j&&b.iface.sets[p.set].n>0).map(p=>p.y):used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+i)))};
    NB[o.id].bi=b.items;
  }
  const par=o=>o.parent&&byId[o.parent];
  const LA=pl.g?cmpGAssign(pl,NB,H):null;if(LA&&LA.why)return no(LA.why);   // GROUPS: lane assignment between producer / consumer group members (cmp_groups.js)
  const outRowsOf=o=>{   // east lanes of o's POOL / SRC: local rows in o's block row
    if(LA)return LA.out[o.id];
    const p=par(o);if(!p)return[];
    const j=p.rec.i.findIndex(([it])=>it===o.key),R=NB[p.id].inR[j].length;
    if(o.main)return NB[p.id].inR[j].slice();
    return o.row<p.row?Array.from({length:R},(_,k)=>H-2-2*(R-1-k)):Array.from({length:R},(_,k)=>1+2*k);
  };
  pl.nodes.forEach(o=>{OR[o.id]=outRowsOf(o)});
  // COMPACT (no docks): logical columns IN/FB/POOL of every depth are packed left to right into physical blocks. Each column gets its minimum width (shrunk template tail / hub / merge region); consecutive columns share ONE block
  // while they fit the floor (DP: fewest blocks over the rows each group occupies, then area); a lone hub column <=14 wide takes the narrow block. Lanes meet at piece edges (no wall inside a block). Docks keep one block per column (west dock edge).
  const nc0=q=>nb&&q%3!==1&&!wide.has(q),D=pl.D,byD=dp=>pl.nodes.filter(o=>o.depth===dp&&(!o.raw||byId[o.parent].inKind==='merge'));
  const subRows=o=>{if(LA)return LA.reg[o.id].r;const r=[],walk=v=>{r.push(v.row);v.children.forEach(i=>walk(byId[i]))};walk(o);return[Math.min(...r),Math.max(...r)]};
  const mrg=(o,w)=>{const [r0,r1]=subRows(o),sources=[],sinks=[],Y=(row,y)=>(row-r0)*(H+2)+y;
    if(LA){const R=LA.reg[o.id];R.src.forEach(s=>sources.push({x:0,y:Y(s.row,s.y),item:s.item,j:s.j}));R.snk.forEach(s=>sinks.push({x:w-1,y:Y(s.row,s.y),item:s.item}));
      if(w<W&&sources.length>w-3)return{r0,r1,sources,sinks,rt:{ok:false,why:"region too narrow"}};   // GROUPS: cheap refusal for the width search
      return{r0,r1,sources,sinks,rt:cmpRoute({W:w,H,rowsN:r1-r0+1,mk,sources,sinks,ugMax:def(ugc).maxApart,eastStart:true,join:true})}}
    o.children.map(i=>byId[i]).forEach(q=>OR[q.id].forEach(y=>sources.push({x:0,y:Y(q.row,y),item:q.key})));
    NB[o.id].inR.forEach((rows,j)=>rows.forEach(y=>sinks.push({x:w-1,y:Y(o.row,y),item:o.rec.i[j][0]})));
    return{r0,r1,sources,sinks,rt:cmpRoute({W:w,H,rowsN:r1-r0+1,mk,sources,sinks,ugMax:def(ugc).maxApart,eastStart:true})}};
  const feedS=(o,w)=>{const bz=NB[o.id].b,hs=tplIfSets(block,sz[o.id].S).hs,sets=bz.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:bz.ports&&bz.ports.in?bz.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0);return{W:w,H,mk,bx,sets,M:bz.iface.M,k:o.k,main:0,pass:[],rawItems:o.rec.i.map(q=>q[0]),allRaw:true,seed:o.growth?o.key:null}};
  const poolOf=(o,w)=>o.raw?cmpPool({W:w,H,mk,bx,item:o.key,raw:true,inRows:[],outRows:OR[o.id]}):(m=>cmpPool({W:w,H,mk,bx,item:0,raw:false,inRows:m.rows,mgIn:m.mg,outRows:OR[o.id],bal:!!LA,wt:LA&&LA.wt[o.id],wi:m.n}))(cmpMerge(NB[o.id].outRows,NB[o.id].outN,NB[o.id].gOut));
  const inOf=(o,w)=>{if(o.join)return{items:[]};if(o.inKind==='merge'){const m=mrg(o,w);return m.rt.ok?{items:m.rt.items}:null}return o.inKind==='src'?cmpPool({W:w,H,mk,bx,item:o.rec.i[0][0],raw:true,inRows:[],outRows:NB[o.id].inR[0]}):cmpFeed(feedS(o,w))};
  const mw={},memo=new Map();
  const cnt=(q,w)=>{   // items of column q's pieces at width w (Infinity: some piece does not build)
    const k=q+','+w;if(memo.has(k))return memo.get(k);
    const dp=D-Math.floor(q/3),s=q%3,ns=byD(dp);let t=0;const add=r=>{t+=r&&r.ok!==false?r.items.length:Infinity};
    if(s===1)ns.filter(o=>!o.raw).forEach(o=>{const b=NB[o.id].b,it=w>=b.w?NB[o.id].bi:w>=mw[o.id]?cmpShr(b,mk,w):null;t+=it?it.length:Infinity});
    else if(s===2)ns.forEach(o=>add(poolOf(o,w)));
    else ns.filter(o=>!o.raw).forEach(o=>add(inOf(o,w)));
    memo.set(k,t);return t};
  const ww=[],rw=[];   // width and occupied rows per logical column
  for(let q=0;q<pl.cols;q++){
    if(nof){ww.push(0);rw.push(new Set());continue}
    const dp=D-Math.floor(q/3),s=q%3,ns=byD(dp),real=ns.filter(o=>!o.raw),rs=new Set();let w=0;
    if(s===1){real.forEach(o=>{rs.add(o.row);mw[o.id]=cmpShr(NB[o.id].b,mk);w=Math.max(w,mw[o.id])})}
    else{
      if(s===2)ns.forEach(o=>rs.add(o.row));
      else real.forEach(o=>{if(o.join)return;if(o.inKind==='merge'){const [r0,r1]=subRows(o);for(let r=r0;r<=r1;r++)rs.add(r)}else rs.add(o.row)});
      if(rs.size){   // narrowest width whose items do not exceed the old column width's (a squeezed merge region / hub detours: more belts)
        const ref=cnt(q,hW);w=8;
        if(ref<Infinity){while(w<hW&&cnt(q,w)>ref)w++}else{while(w<W&&cnt(q,w)===Infinity)w++}
      }
    }
    if(wide&&wide.has(q)&&w)w=W;
    ww.push(w);rw.push(rs);
  }
  const grp=[];   // [[q..]] physical columns
  if(nof)for(let q=0;q<pl.cols;q++)grp.push([q]);
  else{
    const qs=ww.map((w,q)=>q).filter(q=>ww[q]>0),n=qs.length,cost=Array(n+1).fill(Infinity),prv=Array(n+1).fill(0);cost[0]=0;
    for(let i=1;i<=n;i++){let sum=0;const rs=new Set();for(let j=i-1;j>=0;j--){sum+=ww[qs[j]];if(sum>W)break;rw[qs[j]].forEach(r=>rs.add(r));const c=cost[j]+rs.size*1000+rs.size*(nb&&sum<=hW?nb.dw:d.w);if(c<cost[i]){cost[i]=c;prv[i]=j}}}
    for(let i=n;i>0;i=prv[i])grp.unshift(qs.slice(prv[i],i));
  }
  if(globalThis.__cmpDbg)globalThis.__cmpDbg.push({ww,rw:rw.map(r=>r.size),grp:grp.map(g=>g.join('+'))});
  {let u=0;
    const place=(g,idx)=>{
      const sum=nof?(nc0(g[0])?hW:W):g.reduce((a,q)=>a+ww[q],0),nar=nof?!!nc0(g[0]):!!(nb&&sum<=hW),Wb=nar?hW:W,sl=nof?0:Wb-sum;
      let r=g.length-1;   // slack goes to the piece whose items grow least (a hub / template at a wider floor); the last piece keeps its width unless chosen
      if(sl>0){let bd=Infinity;g.forEach((q,k)=>{const dl=cnt(q,ww[q]+sl)-cnt(q,ww[q]);if(dl<bd){bd=dl;r=k}})}
      pU.push(u);pX.push(u*FC);pW.push(Wb);pN.push(nar);let off=0;
      g.forEach((q,k)=>{const w=nof?Wb:ww[q]+(k===r?sl:0);colP[q]=idx;colU[q]=u;colX[q]=u*FC+off;colW[q]=w;off+=w});
      u+=nar?nb.dw:d.w};
    grp.forEach((g,i)=>place(g,i));
    for(let q=0;q<pl.cols;q++)if(colP[q]==null){colP[q]=0;colU[q]=0;colX[q]=0;colW[q]=0}   // empty columns (no node, no piece)
  }
  for(const o of pl.nodes){if(o.raw)continue;const w=colW[o.fb],it=w===W||w===NB[o.id].b.w?NB[o.id].bi:cmpShr(NB[o.id].b,mk,w);if(!it)return no('shrink failed ('+o.item+')');put(it,o.fb,o.row)}
  // CMP D2: with docks, a raw hub (SRC / FEED) sits at block column 0 (touches the dock edge); its lanes pass through the empty block columns 1..col (x=0..W-1 rot 0, wall step makes UG hops)
  // a row with more raws than W slots (heavy) needs the N/S dock units: its neighbour rows' raw hubs move to bank column 1 so block column 0 stays empty there
  const heavy=new Set(globalThis.CMP_OLDHEAVY?pl.nodes.filter(o=>!o.raw&&o.inKind==='feed'&&o.rec.i.filter(([it])=>!(o.growth&&it===o.key)).length>d.h).map(o=>o.row):[]);   // ENZ: a heavy feed row sits on an outer row (cmpPlan hung) and cmpDockApply checks every dock's outer-edge ray: no bank column, SRC hubs keep their own column
  const adx=bk==='BPO_Station_03'||bk==='BPO_Station_01'?2:1,bcol=(o,nat)=>dk&&dk.in?(nat&&!heavy.size?(o.raw?o.pool:o.col):(o.raw?o.pool:o.col)>=adx&&!heavy.has(o.row)&&(heavy.has(o.row-1)||heavy.has(o.row+1))?adx:0):o.col;   // SHAPE2: no heavy row -> SRC hubs stay at their own column, dock on their west face (no pass-through blocks)
  const bank=(h,col,row,rows,nb,bc=0)=>{const e=hubAt(h,dk&&dk.in?bc:col,row,nb);if(e||!dk||!dk.in)return e;const U=new Set();for(let cur=1,D=def(ugc).maxApart-1;cur<=W-3;){const x=Math.min(cur+D,W-2);U.add(cur);U.add(x);cur=x+1}   // SHAPE: a pass-through lane in an empty block = UG hops (x=0 / x=W-1 stay belts for the wall swap): ~8 items per block instead of W
    for(let cc=bc+1;cc<=col;cc++)for(const y of new Set(rows))for(let x=0;x<W;x++)if(x===0||x===W-1||U.has(x))ms.push({cls:U.has(x)?ugc:PLC_BELT[mk],x:x+colX[cc],y:y+row*TH,h:0,rot:0,pid:0})};
  for(const o of pl.nodes){
    const p=par(o);
    if(o.raw){   // supplier SRC of a merge node (raw child of an src node is that node's own IN block)
      if(p.inKind!=='merge')continue;
      const dI=dk&&dk.in?cmpDockHub(dk,{kind:'in',name:o.item,D:o.rate,rows:OR[o.id],H,dh:d.h,j:o.row}):null;if(dI&&dI.ok===false)return no(dI.why);
      const e=bank(cmpPool({W:colW[o.pool],H,mk,bx,item:o.key,raw:true,inRows:[],outRows:OR[o.id],...dI}),o.pool,o.row,OR[o.id],null,bcol(o,1));if(e)return no(e);
      continue;
    }
    const dO=dk&&dk.out&&!p?cmpDockHub(dk,{kind:'out',name:o.item,D:o.rate,rows:cmpMerge(NB[o.id].outRows,NB[o.id].outN,NB[o.id].gOut).rows,H,dh:d.h,tree:1,j:o.row}):null;if(dO&&dO.ok===false)return no(dO.why);
    const mm=cmpMerge(NB[o.id].outRows,NB[o.id].outN,NB[o.id].gOut);
    let e=hubAt(cmpPool({W:colW[o.pool],H,mk,bx,item:0,raw:false,inRows:mm.rows,mgIn:mm.mg,outRows:OR[o.id],bal:!!LA,...dO}),o.pool,o.row,NB[o.id]);if(e)return no(e);
    if(o.inKind==='feed'){   // all-raw k>=2 node: FEED block at the IN column (growth: seed container finite); raw docks not built here
      const bz=NB[o.id].b,hs=tplIfSets(block,sz[o.id].S).hs,sets=bz.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:bz.ports&&bz.ports.in?bz.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0);
      const fS={W:colW[o.col],H,mk,bx,sets,M:bz.iface.M,k:o.k,main:0,pass:[],rawItems:o.rec.i.map(q=>q[0]),allRaw:true,seed:o.growth?o.key:null,j:o.row,K:1+Math.max(...pl.nodes.map(q=>q.row||0))};
      if(dk&&dk.in){fS.names=fS.rawItems.map(cmpName);fS.D=fS.rawItems.map(it=>{const q=o.children.map(i=>byId[i]).find(q=>q.key===it);return q?q.rate:0})}
      const fr=sets.flatMap(s=>fS.rawItems.flatMap((_,r)=>Array.from({length:fS.M},(_,c)=>(s.t?s.t[r]:s.o+r*fS.M)+c)));
      e=bank(fS.D?cmpFeedDock(fS,dk,d.h,fS.D,d.w,['N','S']):cmpFeed(fS),o.col,o.row,fr,NB[o.id],bcol(o));if(e)return no(e);
      continue}
    if(o.inKind==='src'){const rc=byId[o.children[0]],dI=dk&&dk.in?cmpDockHub(dk,{kind:'in',name:rc.item,D:rc.rate,rows:NB[o.id].inR[0],H,dh:d.h,j:o.row}):null;if(dI&&dI.ok===false)return no(dI.why);
      e=bank(cmpPool({W:colW[o.col],H,mk,bx,item:o.rec.i[0][0],raw:true,inRows:[],outRows:NB[o.id].inR[0],...dI}),o.col,o.row,NB[o.id].inR[0],null,bcol(o,1));if(e)return no(e);continue}
    if(o.join)continue;   // GROUPS: members after the first share the owner's merge region
    if(o.inKind!=='merge')return no('IN kind '+o.inKind+' not built in trees');
    const {r0,r1,sources,sinks,rt}=mrg(o,colW[o.col]);
    if(!rt.ok){badCol=o.col;return no('merge routing failed ('+o.item+': '+sources.length+' lanes, rows '+r0+'..'+r1+')'+(rt.why?': '+rt.why:'')+(globalThis.__rtdbg?JSON.stringify({sources,sinks}):''))}
    const tag=[];put(rt.items,o.col,r0,tag);tag.forEach(q=>routed.push({x:q.x,y:q.y,cls:q.cls}));
  }
  // wall swap: rot-0 belts on both sides of a block boundary, same row -> UG pair
  const at=new Map();ms.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});
  const ends=new Set(pX.map((x,i)=>x+pW[i]-1));
  ms.slice().forEach(A=>{
    if(!PLC_BELT.includes(A.cls)||A.rot!==0||!ends.has(A.x))return;
    const B=at.get((A.x+3)+','+A.y);
    if(B&&PLC_BELT.includes(B.cls)){A.cls=B.cls=ugc;routed.forEach(q=>{if((q.x===A.x||q.x===B.x)&&q.y===A.y)q.cls=ugc})}
  });
  const bs=new Map(),colOf=x=>{let i=0;while(i+1<pX.length&&x>=pX[i+1])i++;return i};ms.forEach(b=>{const gx=colOf(b.x),gy=Math.floor(b.y/TH);bs.set(gx+','+gy,pN[gx]?{cls:nb.cls,x:pU[gx],y:gy*d.h,...(nb.rot?{rot:nb.rot}:{})}:{cls,x:pU[gx],y:gy*d.h})});
  const max=def(ugc).maxApart,ugs=ms.filter(b=>PLC_UG.includes(b.cls)),pairs=ugPairs(ugs);
  if(globalThis.__cmpDbg)globalThis.__cmpDbg.push({cb:colX.map((x,q)=>ms.filter(b=>b.x>=x&&b.x<x+colW[q]&&(PLC_BELT.includes(b.cls)||PLC_UG.includes(b.cls)||PLC_SPL.includes(b.cls))).length)});
  const nodes=pl.nodes.filter(o=>!o.raw).map(o=>({id:o.id,item:o.item,key:o.key,rate:o.rate,lanes:NB[o.id].lanes,outRows:NB[o.id].outRows,rec:rk(o.rec),N:o.N,pN:o.pN,util:o.util,pU:o.pU,gx:colU[o.fb],gy:o.row*d.h,inCol:o.col,pool:o.pool,row:o.row,fb:{x:colX[o.fb],y:o.row*TH,w:colW[o.fb],h:H},ct:NB[o.id].ct,kind:o.inKind}));
  const T={ok:true,blocks:[...bs.values()],ms,ug:ugs.length,cols:pl.cols,rows:pl.rows,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1};
  if(dk&&(dk.in||dk.out)){const r=cmpDockApply({cls,mk},T,{nodes,routed});if(!r.ok)return no(r.why);return{ok:true,nodes,routed,T,dock:r,fz:!nof}}
  return{ok:true,nodes,routed,T,fz:!nof};
}
