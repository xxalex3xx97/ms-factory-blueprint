// RB recursive builder entry (dev flag RB_ENGINE / ?engine=rb). Called by cmpCompose1 like cmpGroupsRun. S2: single chains only.
// rbRun(P,item,mk,spMk,BX,bk,block) -> {ok,A,stages,cmpI,note,per} | {ok:false,why}.  A={ok,nodes,routed,T,fz} as cmpAssembleTree1; cmpI.rb = {mods:[{item,N,B,nPhys,blocks,..}],ascii}
// dk (optional, compose.js): NORMAL docks {mk,in,out,notes}; rbBuild applies cmpDockApply and returns A.dock. INDUSTRIAL docks are filtered out by compose.js (rbDockOk) = old path until S6b / S6c. The 2x2c adapter (cmpDockApply handles ad=1 generically) builds through rb with NORMAL docks (tests/rb_docks.mjs AC5 2x2c); industrial on 2x2c stays old (S6c).
function rbDockOk(o,bk){const d=o&&o.dock;return !!d&&d.in!=='ind'&&d.out!=='ind'}
function rbRun(P,item,mk,spMk,BX,bk,block,dk){
  const pl=cmpPlan(P,item,mk,{share:true});if(!pl.ok)return pl;
  const by=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),cr=pl.nodes.filter(o=>!o.raw);
  const cls=plcCls(bk),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h;
  const sz=rbSize(pl,mk,spMk,block,W,H);if(!sz.ok)return sz;
  let A;for(const bias of[0,1,-1,2,-2]){A=rbBuild({pl,G:sz.G,NB:sz.NB,tz:sz.tz,mk,bx:BX,bk,block,W,H,bias,dk});if(A.ok)break}   // retry: shift the wanted block row when a spot search fails
  if(!A.ok)return A;
  A.fz=true;
  const stages=pl.nodes.filter(o=>!o.raw).map(o=>({item:o.item,cls:o.cls,tpl:sz.tz.by[sz.G[o.id].mem[0].id].tpl,block,S:sz.tz.by[sz.G[o.id].mem[0].id].S,N:o.N,perStrip:[o.N],B:sz.G[o.id].B}));
  return{ok:true,A,stages,cmpI:{K:1,tree:true,rb:A.rb,stages,nodes:A.nodes,routed:A.routed},note:pl.notes.slice(),per:[P.nodes[item].machines]};
}
