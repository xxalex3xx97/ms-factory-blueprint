// RB recursive builder, sizing pass (no geometry). Page globals: cmpTreeSize, rbNodeNB (rb_pack.js).
// rbSize(pl,mk,spMk,block,W,H), pl = cmpPlan(...,{share:true}) -> {ok:true,G,mem,tz,NB} | {ok:false,why}
//   caps = machines one block holds per item (cmpTreeSize caps); module of node o: B=ceil(N/cap) stacked members, members 1..B-1 hold cap machines, the last the remainder (total = planner N exactly, same split as cmpPlanG)
//   G[o.id]={o,B,cap,mem:[member pl nodes: {...o,id:o.id+'.'+b,N,rate,b,gid,children:[producer member ids]}],kids:[producer groups]}; tz = cmpTreeSize over the members; NB[member.id] = rbNodeNB + lanes (as cmp_asm.js 150)
function rbSize(pl,mk,spMk,block,W,H){
  const caps={},z0=cmpTreeSize(pl,mk,spMk,block,caps),crafted=pl.nodes.filter(o=>!o.raw);
  if(crafted.some(o=>!(caps[o.key]>0)))return z0.ok?{ok:false,why:'rb: no block capacity'}:z0;
  const G={},mem=[];
  for(const o of crafted){
    const cap=caps[o.key],B=Math.ceil(o.N/cap),ms=[];
    for(let b=0;b<B;b++){const n=b<B-1?cap:o.N-cap*(B-1);ms.push({...o,id:o.id+'.'+b,N:n,rate:o.rate*n/o.N,children:[],b,gid:o.id})}
    G[o.id]={o,B,cap,mem:ms,kids:[]};mem.push(...ms);
  }
  for(const g of Object.values(G)){g.kids=g.o.children.map(i=>G[i]).filter(Boolean);g.mem.forEach(q=>{q.children=g.kids.flatMap(k=>k.mem.map(m=>m.id));q.inKind=g.kids.length?'merge':g.o.inKind})}
  const tz=cmpTreeSize({nodes:mem},mk,spMk,block,null);if(!tz.ok)return tz;
  const NB={};
  for(const q of mem){
    const n=rbNodeNB(q,tz.by[q.id],block,W,H);if(!n.ok)return{ok:false,why:n.why};
    n.lanes=n.b.ports.in.map((p,t)=>({y:p.y,key:q.rec.i[typeof p.item==='number'?p.item:0][0],m:n.b.rows&&n.b.rows[t]&&n.b.rows[t].m!=null?n.b.rows[t].m:null})).filter(l=>l.m!==0);
    NB[q.id]=n;
  }
  const byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o]));   // raw suppliers of a merge node = own SRC module (one block, deferred next to the consumer's IN column); no member / NB / tz entry
  for(const o of pl.nodes)if(o.raw&&o.parent&&byId[o.parent].inKind==='merge')G[o.id]={o,B:1,cap:1,raw:true,mem:[{...o,id:o.id+'.0',N:0,b:0,gid:o.id,children:[]}],kids:[]};
  for(const g of Object.values(G))if(!g.raw)g.kids=g.o.children.map(i=>G[i]).filter(Boolean);
  return{ok:true,G,mem,tz,NB};
}
