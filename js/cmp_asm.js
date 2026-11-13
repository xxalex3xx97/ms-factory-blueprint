// CMP C3 assembler (composer): strips of blocks [SRC][FB1][POOL][FB2]...[OZ], template + hub items at block origins, wall UG swap, tile result. Spec: vault main-sequence/tasks/2026-11-13-composer-spec.md 2.4-2.6.
// cmpAssemble(c) c={P,item,mk,spMk,bx,bk (name of the Blocks select class),sz (cmpSize result),stages (cmpTree stages)} -> {ok:true,T} | {ok:false,why}. Linear chain of 1-input stages (k=1), first stage may have k>=2 all raw (FEED block, allRaw, seed container); K strips stacked vertically.
const CMP_BLOCKS=['1x1','1x2','2x2','2x2c'];
function cmpAssemble(c){
  const {mk,spMk,bx,bk,sz,stages}=c,dk=c.dk,no=why=>({ok:false,why}),cls=plcCls(bk),d=dim({cls,rot:0}),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h,TW=d.w*FC,L=stages.length,K=sz.K;
  const block=CMP_BLOCKS[PL_ALL.indexOf(bk)],ugc=PLC_UG[mk],ncol=2*L+1,ms=[],blocks=[];let nug=0;
  for(let j=0;j<K;j++){
    const fbs=[],y0=j*d.h*FC;
    for(let s=0;s<L;s++){
      const g=stages[s],z=sz.stages[s],st=z.strips[j],pk=tplPick(g.cls,g.k,block);
      if(!pk.ok)return no(pk.why);
      if(s===0&&g.k>=2&&pk.id==='assembler_2in')return no('all-raw 2-input assembler as a chain start is not built yet ('+g.node.rec.i.length+' inputs)');
      if(g.k!==1&&s>0)return no('composer builds 1-input stages only ('+z.item+' has '+g.k+')');
      const main=s?g.node.rec.i.findIndex(([it])=>it===stages[s-1].item):0;
      const b=pk.t.build({block,cls:g.cls,rec:g.rec,recObj:g.node.rec,recd:g.node.rec,mk,spMk,S:st.S,n:st.n,main,growth:g.growth,raw:g.k-(s?1:0)});
      if(!b.ok)return no(b.why);
      if(!b.iface||b.iface.v!==1)return no('template not on Edge Interface v1');
      if(b.w!==W||b.h!==H)return no('template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H);
      if(b.items.some(q=>{const e=dim(q);return q.x<0||q.y<0||q.x+e.w>W||q.y+e.h>H}))return no('template items outside the block floor ('+z.item+', '+block+')');
      const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M,hs=tplIfSets(block,st.S).hs;
      // first stage with k>=2: all inputs raw -> FEED block (allRaw) instead of SRC
      const feed=s===0&&g.k>=2?{sets:b.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:b.ports&&b.ports.in?b.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0),M,k:g.k}:null;
      fbs.push({feed,items:b.items,inRows:used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+main*M+i)),outRows:used.map(q=>q.o)});
    }
    const f0=fbs[0].feed,g0=stages[0],shr=s=>sz.stages[s].strips[j].n/sz.stages[s].strips.reduce((a,v)=>a+v.n,0);
    let dI=null,dO=null;   // C7: dock cells of the SRC / OZ hub of this strip
    if(dk&&dk.in&&!f0){const E=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{}),e=E.find(e=>e.from===g0.node.rec.i[0][0]&&e.to===g0.item);dI=cmpDockHub(dk,{kind:'in',name:cmpName(g0.node.rec.i[0][0]),D:(e?e.flow:0)*shr(0),rows:fbs[0].inRows,H,dh:d.h})}
    if(dk&&dk.out)dO=cmpDockHub(dk,{kind:'out',name:cmpName(c.item),D:c.P.nodes[c.item].rate*shr(L-1),rows:fbs[L-1].outRows,H,dh:d.h});
    if(dI&&dI.ok===false)return no(dI.why);if(dO&&dO.ok===false)return no(dO.why);
    const hub=(inRows,outRows,raw,item,x)=>cmpPool({W,H,mk,bx,item,raw,inRows,outRows,...x});
    const fS=f0&&{W,H,mk,bx,sets:f0.sets,M:f0.M,k:f0.k,main:0,pass:[],rawItems:g0.node.rec.i.map(q=>q[0]),allRaw:true,seed:g0.growth?g0.item:null};
    if(fS&&dk&&dk.in){const E=Array.isArray(c.P.edges)?c.P.edges:Object.values(c.P.edges||{});fS.names=fS.rawItems.map(cmpName);fS.D=fS.rawItems.map(it=>{const e=E.find(e=>e.from===it&&e.to===g0.item);return(e?e.flow:0)*shr(0)})}
    const seq=[f0?(fS.D?cmpFeedDock(fS,dk,d.h,fS.D,d.w,[j===0?'N':0,j===K-1?'S':0].filter(Boolean)):cmpFeed(fS)):hub([],fbs[0].inRows,true,g0.node.rec.i[0][0],dI)];
    for(let s=0;s<L;s++){seq.push({items:fbs[s].items});seq.push(hub(fbs[s].outRows,s<L-1?fbs[s+1].inRows:[],false,0,s===L-1?dO:null))}
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
  const T={ok:true,blocks,ms,ug:nug,cols:ncol,rows:K,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1};
  if(dk&&(dk.in||dk.out)){const r=cmpDockApply({cls,mk},T);if(!r.ok)return no(r.why);return{ok:true,T,dock:r}}
  return{ok:true,T};
}

// CMP S7b: tree assembler. cmpAssembleTree({mk,spMk,bx,bk,pl (cmpPlan),sz (cmpTreeSize .by)}) -> {ok,T,nodes,routed} | {ok:false,why}.
// Per node [IN][FB][POOL] at block columns o.col..o.col+2, block row o.row. IN = SRC block (k=1 raw), or a MERGE region (any crafted input): one block column of belts spanning the strip rows of the
// node's subtree, routed by cmpRoute (child POOL/SRC east lanes at x=0 -> parent slot rows at x=W-1). Raw children of a merge node are SRC supplier blocks in their own strip row.
function cmpAssembleTree(c){
  const {mk,spMk,bx,bk,pl,sz}=c,dk=c.dk,no=why=>({ok:false,why}),cls=plcCls(bk),d=dim({cls,rot:0}),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h,TW=d.w*FC,TH=d.h*FC,ugc=PLC_UG[mk];
  const block=CMP_BLOCKS[PL_ALL.indexOf(bk)],byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),NB={},ms=[],routed=[],OR={};
  const put=(items,col,row,tag)=>items.forEach(b=>{const q={...b,x:b.x+col*TW,y:b.y+row*TH};ms.push(q);if(tag)tag.push(q)});
  const hubAt=(h,col,row,nb)=>{if(h.ok===false)return h.why;put(h.items,col,row);if(nb)h.items.filter(q=>q.ct).forEach(q=>nb.ct.push((q.x+col*TW)+','+(q.y+row*TH)))};
  for(const o of pl.nodes){   // 1 FB blocks
    if(o.raw)continue;
    const z=sz[o.id],pk=tplPick(o.cls,o.k,block),b=pk.t.build({...z.base,S:z.S,n:o.N});
    if(!b.ok)return no(b.why);
    if(!b.iface||b.iface.v!==1)return no('template not on Edge Interface v1');
    if(b.w!==W||b.h>H)return no('template floor '+b.w+'x'+b.h+' differs from the block floor '+W+'x'+H);
    if(b.items.some(q=>{const e=dim(q);return q.x<0||q.y<0||q.x+e.w>W||q.y+e.h>H}))return no('template items outside the block floor ('+o.item+', '+block+')');
    const used=b.iface.sets.filter(q=>q.n>0),M=b.iface.M;
    NB[o.id]={b,lanes:b.ports.in.map((p,t)=>({y:p.y,key:o.rec.i[typeof p.item==='number'?p.item:0][0],m:b.rows&&b.rows[t]&&b.rows[t].m!=null?b.rows[t].m:null})).filter(l=>l.m!==0),ct:[],outRows:used.map(q=>q.o),inR:o.rec.i.map((_,j)=>o.k>=2?b.ports.in.filter(p=>p.item===j&&b.iface.sets[p.set].n>0).map(p=>p.y):used.flatMap(q=>Array.from({length:M},(_,i)=>q.o+i)))};
    put(b.items,o.fb,o.row);
  }
  const par=o=>o.parent&&byId[o.parent];
  const outRowsOf=o=>{   // east lanes of o's POOL / SRC: local rows in o's block row
    const p=par(o);if(!p)return[];
    const j=p.rec.i.findIndex(([it])=>it===o.key),R=NB[p.id].inR[j].length;
    if(o.main)return NB[p.id].inR[j].slice();
    return o.row<p.row?Array.from({length:R},(_,k)=>H-2-2*(R-1-k)):Array.from({length:R},(_,k)=>1+2*k);
  };
  pl.nodes.forEach(o=>{OR[o.id]=outRowsOf(o)});
  // CMP D2: with docks, a raw hub (SRC / FEED) sits at block column 0 (touches the dock edge); its lanes pass through the empty block columns 1..col (x=0..W-1 rot 0, wall step makes UG hops)
  // a row with more raws than W slots (heavy) needs the N/S dock units: its neighbour rows' raw hubs move to bank column 1 so block column 0 stays empty there
  const heavy=new Set(pl.nodes.filter(o=>!o.raw&&o.inKind==='feed'&&o.rec.i.filter(([it])=>!(o.growth&&it===o.key)).length>d.h).map(o=>o.row));
  const adx=bk==='BPO_Station_03'?2:1,bcol=o=>dk&&dk.in?((o.raw?o.pool:o.col)>=adx&&!heavy.has(o.row)&&(heavy.has(o.row-1)||heavy.has(o.row+1))?adx:0):o.col;
  const bank=(h,col,row,rows,nb,bc=0)=>{const e=hubAt(h,dk&&dk.in?bc:col,row,nb);if(e||!dk||!dk.in)return e;for(let cc=bc+1;cc<=col;cc++)for(const y of new Set(rows))for(let x=0;x<W;x++)ms.push({cls:PLC_BELT[mk],x:x+cc*TW,y:y+row*TH,h:0,rot:0,pid:0})};
  for(const o of pl.nodes){
    const p=par(o);
    if(o.raw){   // supplier SRC of a merge node (raw child of an src node is that node's own IN block)
      if(p.inKind!=='merge')continue;
      const dI=dk&&dk.in?cmpDockHub(dk,{kind:'in',name:o.item,D:o.rate,rows:OR[o.id],H,dh:d.h}):null;if(dI&&dI.ok===false)return no(dI.why);
      const e=bank(cmpPool({W,H,mk,bx,item:o.key,raw:true,inRows:[],outRows:OR[o.id],...dI}),o.pool,o.row,OR[o.id],null,bcol(o));if(e)return no(e);
      continue;
    }
    const dO=dk&&dk.out&&!p?cmpDockHub(dk,{kind:'out',name:o.item,D:o.rate,rows:NB[o.id].outRows,H,dh:d.h,tree:1}):null;if(dO&&dO.ok===false)return no(dO.why);
    let e=hubAt(cmpPool({W,H,mk,bx,item:0,raw:false,inRows:NB[o.id].outRows,outRows:OR[o.id],...dO}),o.pool,o.row,NB[o.id]);if(e)return no(e);
    if(o.inKind==='feed'){   // all-raw k>=2 node: FEED block at the IN column (growth: seed container finite); raw docks not built here
      const bz=NB[o.id].b,hs=tplIfSets(block,sz[o.id].S).hs,sets=bz.iface.sets.map((q,i)=>({o:q.o,hs:hs[i],n:q.n,t:bz.ports&&bz.ports.in?bz.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(q=>q.n>0);
      const fS={W,H,mk,bx,sets,M:bz.iface.M,k:o.k,main:0,pass:[],rawItems:o.rec.i.map(q=>q[0]),allRaw:true,seed:o.growth?o.key:null};
      if(dk&&dk.in){fS.names=fS.rawItems.map(cmpName);fS.D=fS.rawItems.map(it=>{const q=o.children.map(i=>byId[i]).find(q=>q.key===it);return q?q.rate:0})}
      const fr=sets.flatMap(s=>fS.rawItems.flatMap((_,r)=>Array.from({length:fS.M},(_,c)=>(s.t?s.t[r]:s.o+r*fS.M)+c)));
      e=bank(fS.D?cmpFeedDock(fS,dk,d.h,fS.D,d.w,['N','S']):cmpFeed(fS),o.col,o.row,fr,NB[o.id],bcol(o));if(e)return no(e);
      continue}
    if(o.inKind==='src'){const rc=byId[o.children[0]],dI=dk&&dk.in?cmpDockHub(dk,{kind:'in',name:rc.item,D:rc.rate,rows:NB[o.id].inR[0],H,dh:d.h}):null;if(dI&&dI.ok===false)return no(dI.why);
      e=bank(cmpPool({W,H,mk,bx,item:o.rec.i[0][0],raw:true,inRows:[],outRows:NB[o.id].inR[0],...dI}),o.col,o.row,NB[o.id].inR[0],null,bcol(o));if(e)return no(e);continue}
    if(o.inKind!=='merge')return no('IN kind '+o.inKind+' not built in trees');
    const sub=[],walk=v=>{sub.push(v.row);v.children.forEach(i=>walk(byId[i]))};walk(o);
    const r0=Math.min(...sub),r1=Math.max(...sub),sources=[],sinks=[],Y=(row,y)=>(row-r0)*(H+2)+y;
    o.children.map(i=>byId[i]).forEach(q=>OR[q.id].forEach(y=>sources.push({x:0,y:Y(q.row,y),item:q.key})));
    NB[o.id].inR.forEach((rows,j)=>rows.forEach(y=>sinks.push({x:W-1,y:Y(o.row,y),item:o.rec.i[j][0]})));
    const rt=cmpRoute({W,H,rowsN:r1-r0+1,mk,sources,sinks,ugMax:def(ugc).maxApart,eastStart:true});
    if(!rt.ok)return no('merge routing failed ('+o.item+': '+sources.length+' lanes, rows '+r0+'..'+r1+')'+(rt.why?': '+rt.why:'')+(globalThis.__rtdbg?JSON.stringify({sources,sinks}):''));
    const tag=[];put(rt.items,o.col,r0,tag);tag.forEach(q=>routed.push({x:q.x,y:q.y,cls:q.cls}));
  }
  // wall swap: rot-0 belts on both sides of a block boundary, same row -> UG pair
  const at=new Map();ms.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});
  ms.slice().forEach(A=>{
    if(!PLC_BELT.includes(A.cls)||A.rot!==0||A.x%TW!==W-1)return;
    const B=at.get((A.x+3)+','+A.y);
    if(B&&PLC_BELT.includes(B.cls)){A.cls=B.cls=ugc;routed.forEach(q=>{if((q.x===A.x||q.x===B.x)&&q.y===A.y)q.cls=ugc})}
  });
  const bs=new Map();ms.forEach(b=>{const gx=Math.floor(b.x/TW),gy=Math.floor(b.y/TH);bs.set(gx+','+gy,{cls,x:gx*d.w,y:gy*d.h})});
  const max=def(ugc).maxApart,ugs=ms.filter(b=>PLC_UG.includes(b.cls)),pairs=ugPairs(ugs);
  const nodes=pl.nodes.filter(o=>!o.raw).map(o=>({id:o.id,item:o.item,key:o.key,rate:o.rate,lanes:NB[o.id].lanes,outRows:NB[o.id].outRows,rec:rk(o.rec),N:o.N,pN:o.pN,util:o.util,pU:o.pU,gx:o.fb*d.w,gy:o.row*d.h,inCol:o.col,pool:o.pool,row:o.row,fb:{x:o.fb*TW,y:o.row*TH,w:W,h:H},ct:NB[o.id].ct,kind:o.inKind}));
  const T={ok:true,blocks:[...bs.values()],ms,ug:ugs.length,cols:pl.cols,rows:pl.rows,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1};
  if(dk&&(dk.in||dk.out)){const r=cmpDockApply({cls,mk},T,{nodes,routed});if(!r.ok)return no(r.why);return{ok:true,nodes,routed,T,dock:r}}
  return{ok:true,nodes,routed,T};
}
