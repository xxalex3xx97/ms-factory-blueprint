// RB recursive builder entry (dev flag RB_ENGINE / ?engine=rb). Called by cmpCompose1 like cmpGroupsRun. S2: single chains only.
// rbRun(P,item,mk,spMk,BX,bk,block) -> {ok,A,stages,cmpI,note,per} | {ok:false,why}.  A={ok,nodes,routed,T,fz} as cmpAssembleTree1; cmpI.rb = {mods:[{item,N,B,nPhys,blocks,..}],ascii}
function rbRun(P,item,mk,spMk,BX,bk,block){
  const pl=cmpPlan(P,item,mk,{share:true});if(!pl.ok)return pl;
  const by=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),cr=pl.nodes.filter(o=>!o.raw);
  const bad=cr.find(o=>{const kids=o.children.filter(i=>!by[i].raw).length;return kids?kids!==o.children.length:(o.k!==1||o.children.length!==1)});
  if(bad)return cmpErr('rb: '+bad.item+': '+(bad.children.some(i=>!by[i].raw&&by[i])?'raw inputs next to crafted ones (merge supplier)':'raw feed / growth node')+' not yet');
  const cls=plcCls(bk),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h;
  const sz=rbSize(pl,mk,spMk,block,W,H);if(!sz.ok)return sz;
  const A=rbBuild({pl,G:sz.G,NB:sz.NB,tz:sz.tz,mk,bx:BX,bk,block,W,H});if(!A.ok)return A;
  A.fz=true;
  const stages=pl.nodes.filter(o=>!o.raw).map(o=>({item:o.item,cls:o.cls,tpl:sz.tz.by[sz.G[o.id].mem[0].id].tpl,block,S:sz.tz.by[sz.G[o.id].mem[0].id].S,N:o.N,perStrip:[o.N],B:sz.G[o.id].B}));
  return{ok:true,A,stages,cmpI:{K:1,tree:true,rb:A.rb,stages,nodes:A.nodes,routed:A.routed},note:pl.notes.slice(),per:[P.nodes[item].machines]};
}
