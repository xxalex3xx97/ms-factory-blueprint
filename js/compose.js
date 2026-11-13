// CMP C1 (geometry-free sizing, spec sections 2.1-2.3). cmpTree(P,item): linear stage chain, producer first.
// cmpSize(P,item,mk,spMk,block): per stage template, S (capacity m(S)), K strips, machines per strip n[s][j].
// Needs planner.js (plnCb, def, rk), js/tpl/iface.js (TPL_IF_SETS, tplIfSets), js/tpl/bundle.js + registry.js (tplPick).
const CMP_MAXK=4;
const CMP_MERGE_OK=['assembler_2in','growth_2_3_4in','assembler_3in','enrichment_2_3in','advassembler_4in'];
const cmpErr=why=>({ok:false,why});
const cmpName=it=>typeof plnNm==='function'?plnNm(it):String(it);

function cmpTree(P,item){
  const chain=[];let x=item;
  for(;;){
    const n=P.nodes[x];
    if(!n||!n.crafter||!n.rec||!plnCb(n.crafter))return cmpErr('No machine builds this recipe');
    if(/Armoury/i.test(n.crafter))return cmpErr('Armoury');
    const cr=n.rec.i.filter(([it])=>it!==x&&P.nodes[it]&&P.nodes[it].crafter);   // growth: the self input is the seed, not a child
    if(cr.length>1)return cmpErr('branching tree (merge/branch not built yet)');
    chain.push({item:x,node:n,cls:def(plnCb(n.crafter).id).key,k:n.rec.i.length,rec:rk(n.rec),N:n.machines,pm:n.pmach,rate:n.rate,util:n.util,growth:n.rec.i.some(([it])=>it===x),craftedIn:cr.length?cr[0][0]:null});
    if(!cr.length)break;
    x=cr[0][0];
  }
  return{ok:true,stages:chain.reverse()};
}

// one build + Edge Interface checks: <=4 lanes per pooled face, feed height. Returns {ok,b} | {ok:false,why}
function cmpBuild(t,spec,s,last){
  const b=t.build(spec);
  if(!b||!b.ok)return cmpErr(b&&b.why||'build failed');
  const f=b.iface;
  if(!f||!f.sets)return cmpErr('template lacks iface.sets');
  if(f.v!==1)return cmpErr('template not on Edge Interface v1');
  const used=f.sets.map((q,i)=>q.n>0?i:-1).filter(i=>i>=0);
  if(s>0&&used.length*f.M>4)return cmpErr('pool lanes > 4');
  if(s<last&&used.length>4)return cmpErr('pool lanes > 4');
  const hs=tplIfSets(spec.block,spec.S).hs,need=(s>0?f.M:0)+4*spec.raw;
  if(used.some(i=>need>hs[i]))return cmpErr('feed height');
  return{ok:true,b};
}

// n[s][j]: final stage split evenly (partial machine in the last strip); upstream = rate share (spec 2.3)
function cmpDist(info,K,last,eq,ex){
  const n=info.map(()=>new Array(K).fill(0)),Nl=info[last].g.N;
  for(let j=0;j<K;j++)n[last][j]=Math.floor(Nl/K)+(j<Nl%K?1:0);
  const phi=j=>(n[last][j]-(j===K-1?ex:0))/eq;
  for(let s=0;s<last;s++){const g=info[s].g;for(let j=0;j<K;j++)n[s][j]=Math.max(1,Math.ceil(phi(j)*g.rate/g.pm-1e-9))}
  return n;
}

function cmpSize(P,item,mk,spMk,block){
  const T=cmpTree(P,item);if(!T.ok)return T;
  const st=T.stages,L=st.length,last=L-1,Ss=TPL_IF_SETS[block]?Object.keys(TPL_IF_SETS[block]).map(Number):[];
  if(!Ss.length)return cmpErr('no block '+block);
  const info=[];
  for(let s=0;s<L;s++){
    const g=st[s],pk=tplPick(g.cls,g.k,block);
    if(!pk.ok)return cmpErr(pk.why);
    const base={block,cls:g.cls,rec:g.rec,recObj:g.node.rec,recd:g.node.rec,mk,spMk,main:s?g.node.rec.i.findIndex(([it])=>it===st[s-1].item):0,growth:g.growth,raw:g.k-(s?1:0)};
    let best=null,why='no size fits '+block;
    for(const S of Ss){
      const m=pk.t.max({...base,S});
      if(!(m>0)){why=pk.t.build({...base,S}).why||why;continue}
      const c=cmpBuild(pk.t,{...base,S,n:m},s,last);
      if(!c.ok){why=c.why;continue}
      if(!best||m>best.m)best={S,m};
    }
    if(!best)return cmpErr(why);
    info.push({g,pk,base,best});
  }
  const fin=info[last].g,eq=fin.rate/fin.pm,ex=fin.N-eq;   // ex = missing share of the partial machine (1-u)
  const minN=Math.min(...info.map(q=>q.g.N));
  let K=Math.max(...info.map(q=>Math.ceil(q.g.N/q.best.m-1e-9))),n;
  for(let extra=0;;extra++){
    if(K>minN){const q=info.find(q=>q.g.N<K);return cmpErr('K strips needed ('+K+') but stage '+cmpName(q.g.item)+' has only '+q.g.N+' machines (cross-strip merge not built)')}
    n=cmpDist(info,K,last,eq,ex);
    const bad=info.findIndex((q,s)=>n[s].some(v=>v>q.best.m));
    if(bad<0)break;
    if(extra>=CMP_MAXK)return cmpErr('stage '+cmpName(info[bad].g.item)+' needs more than '+CMP_MAXK+' extra strips');
    K++;
  }
  const stages=[];
  for(let s=0;s<L;s++){
    const q=info[s],strips=[];
    for(let j=0;j<K;j++){
      const need=n[s][j];let pick=null,why='no size fits '+block;
      for(const S of Ss){
        if(!(q.pk.t.max({...q.base,S})>=need))continue;
        const c=cmpBuild(q.pk.t,{...q.base,S,n:need},s,last);
        if(c.ok){pick=S;break}
        why=c.why;
      }
      if(pick==null)return cmpErr(why);
      strips.push({S:pick,n:need});
    }
    stages.push({item:cmpName(q.g.item),cls:q.g.cls,tpl:q.pk.id,block,S:q.best.S,N:q.g.N,m:q.best.m,perStrip:n[s].slice(),B:1,strips});
  }
  const note=[];
  if(K>1)stages.forEach(q=>{const t=q.perStrip.reduce((a,v)=>a+v,0);if(t!==q.N)note.push('Planner N='+q.N+', built '+t+' ('+K+' strips)')});
  return{ok:true,K,stages,note};
}

// CMP S7b: tree sizing (K=1: one FB block per node). pl = cmpPlan result. -> {ok,by:{nodeId:{S,m,base,tpl}}} | {ok:false,why}
function cmpTreeSize(pl,mk,spMk,block){
  const Ss=TPL_IF_SETS[block]?Object.keys(TPL_IF_SETS[block]).map(Number):[],by={},byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o]));
  if(!Ss.length)return cmpErr('no block '+block);
  for(const o of pl.nodes){
    if(o.raw)continue;
    const merge=o.inKind==='merge';
    const pk=tplPick(o.cls,o.k,block);if(!pk.ok)return cmpErr(pk.why);
    if(merge&&o.k>=2&&!CMP_MERGE_OK.includes(pk.id))return cmpErr('merge into '+String(o.cls).replace(/^DAT_/,'')+' with '+o.k+' inputs is not built yet');
    // growth k>=3 merge: template lane 0 (top row) = the first child placed above the node, else the routing main (a straight main lane on the top row would wall off the wall-hop landing of every above side child)
    const mc=merge?(o.k>=3&&o.children.map(i=>byId[i]).find(c=>c.row<o.row)||byId[o.children[0]]):null;
    const main=merge?o.rec.i.findIndex(([it])=>it===mc.key):0;
    const base={block,cls:o.cls,rec:rk(o.rec),recObj:o.rec,recd:o.rec,mk,spMk,main,growth:o.growth,raw:merge?0:o.k};
    let mx=0,why='no size fits '+block,pick=null;
    for(const S of Ss){
      const m=pk.t.max({...base,S});
      if(!(m>0)){why=pk.t.build({...base,S}).why||why;continue}
      mx=Math.max(mx,m);
      if(m<o.N)continue;
      const c=cmpBuild(pk.t,{...base,S,n:o.N},merge?1:0,2);
      if(c.ok){pick={S,m};break}
      why=c.why;
    }
    if(!pick){
      if(mx&&mx<o.N)return cmpErr('stage '+o.item+' needs '+o.N+' machines but a block holds '+mx+' (stacked blocks not built)');
      return cmpErr('stage '+o.item+' ('+o.N+' machines): '+why);
    }
    by[o.id]={...pick,base,tpl:pk.id};
  }
  return{ok:true,by};
}

// CMP C3: cmpCompose(P,item,mk,spMk,o) -> placerLayout result (fixed tile) | {ok:false,why}. Linear chain of 1-input stages, K strips. Docks not built yet.
function cmpCompose(P,item,mk,spMk,o={}){
  const BX=o.box||PLC_BOX,bk=o.bk||PL_ALL[placerBk().indexOf(true)];
  if(!bk)return cmpErr('no block type selected');
  if(BX!=='DAT_Container_2')return cmpErr('needs Large Container');
  const tr=cmpTree(P,item),block=CMP_BLOCKS[PL_ALL.indexOf(bk)];
  let A,sz,stages,cmpI,note,per;
  const dkw=o.dock&&(o.dock.in||o.dock.out)?o.dock:null,dkn=[],dk=dkw?{mk,in:!!dkw.in,out:!!dkw.out,notes:dkn}:null;
  if(dkw&&(dkw.in==='ind'||dkw.out==='ind'))dkn.push('Industrial dock not built yet: normal docks used');
  if(tr.ok){
    sz=cmpSize(P,item,mk,spMk,block);if(!sz.ok)return sz;
    A=cmpAssemble({P,item,mk,spMk,bx:BX,bk,sz,stages:tr.stages,dk});if(!A.ok)return A;
    stages=sz.stages.map(q=>({item:q.item,cls:q.cls,tpl:q.tpl,block:q.block,S:q.S,N:q.N,perStrip:q.perStrip,B:q.B}));cmpI={K:sz.K,stages};
    note=sz.note.concat(tr.stages[0].growth&&tr.stages[0].k>=2?['Fill the seed container ('+cmpName(item)+')']:[]);per=sz.stages[sz.stages.length-1].perStrip.slice();
  }else if(/^branching/.test(tr.why)){   // S7b: merge tree (K=1)
    const pl=cmpPlan(P,item,mk,{});if(!pl.ok)return pl;
    const tz=cmpTreeSize(pl,mk,spMk,block);if(!tz.ok)return tz;
    A=cmpAssembleTree({mk,spMk,bx:BX,bk,pl,sz:tz.by,dk});if(!A.ok)return A;
    stages=pl.nodes.filter(o=>!o.raw).map(o=>({item:o.item,cls:o.cls,tpl:tz.by[o.id].tpl,block,S:tz.by[o.id].S,N:o.N,perStrip:[o.N],B:1}));
    cmpI={K:1,tree:true,stages,nodes:A.nodes,routed:A.routed};note=pl.notes.slice();per=[P.nodes[item].machines];
  }else return tr;
  if(A.dock){   // C7: raw/oz container descriptors + 'Dock n: assign ...' notes
    cmpI.raw=A.dock.raw;cmpI.oz=A.dock.oz;let n=0;
    const lines=[...A.dock.raw,...A.dock.oz].map(q=>'Dock '+(++n)+': assign '+q.dd.name+' ('+cmpR1(q.dd.r)+'/min, '+q.dd.n+' dock'+(q.dd.n>1?'s':'')+')');
    note=[...note,...dkn,...lines];
  }else if(dkn.length)note=[...note,...dkn];
  const T=A.T,ext=plcExt(T),ms=T.ms,cnt=f=>ms.filter(f).length;
  const L={ok:true,eng:'cmp',items:ms,cuts:[],lanes:cmpI.K,per,makes:P.nodes[item].rate,pitch:ext.h+1,w:ext.w,h:ext.h,tall:true,mod:false,box:BX,mk,ports:[],note,src:{P,item,mk,spMk,o},prefab:true,
    stat:{belts:cnt(b=>PLC_BELT.includes(b.cls)),ug:cnt(b=>PLC_UG.includes(b.cls)),spl:cnt(b=>PLC_SPL.includes(b.cls)),blocks:T.blocks.length,machines:cnt(b=>b.rec),lanes:cmpI.K,spills:0},
    dk:o.dock||null,bl:{zoned:true,n:new Array(T.cols-1).fill(0),cmp:cmpI},tile:T,tileBk:'cmp',fixedTile:true};
  T.L=L;
  return L;
}
