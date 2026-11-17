// RB recursive builder entry (dev flag RB_ENGINE / ?engine=rb). Called by cmpCompose1 like cmpGroupsRun. S2: single chains only.
// rbRun(P,item,mk,spMk,BX,bk,block) -> {ok,A,stages,cmpI,note,per} | {ok:false,why}.  A={ok,nodes,routed,T,fz} as cmpAssembleTree1; cmpI.rb = {mods:[{item,N,B,nPhys,blocks,..}],ascii}
// dk (optional, compose.js): NORMAL docks {mk,in,out,notes}; rbBuild applies cmpDockApply and returns A.dock. INDUSTRIAL docks are filtered out by compose.js (rbDockOk) = old path until S6b / S6c. The 2x2c adapter (cmpDockApply handles ad=1 generically) builds through rb with NORMAL docks (tests/rb_docks.mjs AC5 2x2c); industrial on 2x2c stays old (S6c).
function rbDockOk(o,bk){return !!(o&&o.dock)}   // S6b: industrial docks build here too
function rbRun(P,item,mk,spMk,BX,bk,block,dk){
  if(globalThis.RB_FORCE_REFUSE)return{ok:false,why:'forced'};   // tests only (tests/worker_build.mjs)
  fbProgress('Planning modules','',-1);
  const pl0=cmpPlan(P,item,mk,{share:true});if(!pl0.ok)return pl0;
  const cls=plcCls(bk),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h;
  const split={...(globalThis.CITY_SPLIT||{})},T0=Date.now();let pl,sz,A,F0,att=0;
  for(;;){   // auto split: a node whose single copy cannot feed all consumer ports (lanes / router limits) is copied 2..8 times with its exclusive subtree (citySplitPlan), then rebuilt
    const sp=Object.keys(split).length>0;
    pl=sp&&typeof citySplitPlan==='function'?citySplitPlan(pl0,split):pl0;
    fbProgress('Sizing modules','',-1);
    sz=rbSize(pl,mk,spMk,block,W,H);if(!sz.ok)return sz;
    const bfs=(sp||globalThis.CITY_ON)&&typeof cityBuild==='function'?[cityBuild]:(dk&&typeof cityBuild==='function'?[rbBuild,cityBuild]:[rbBuild]);
    for(const bf of bfs){for(const bias of[0,1,-1,2,-2]){globalThis.__fbAtt=' - attempt '+(++att)+' of 5';if(dk)globalThis.CMP_DKFAIL=[];A=bf({pl,G:sz.G,NB:sz.NB,tz:sz.tz,mk,bx:BX,bk,block,W,H,bias,dk,place:globalThis.CITY_PLACE});/* CITY_ON: table-driven city builder (city_build.js: row-local lanes, optional fixed positions CITY_PLACE[key]={c,r}) */if(bias===0&&!F0)F0=globalThis.CMP_DKFAIL;if(A.ok)break}if(A.ok)break}
    if(A.ok)break;
    const bad=A.bad&&pl0.nodes.find(o=>o.key===A.bad&&!o.raw&&o.parents&&o.parents.length),cur=split[A.bad]||1;
    if(!bad||cur>=Math.min(8,bad.N)||Date.now()-T0>40000){if(dk&&F0)globalThis.CMP_DKFAIL=F0;return{...A,why:A.why+(cur>1?' (after splitting '+bad.item+' into '+cur+' copies)':'')}}
    split[A.bad]=cur+1;
  }
  if(!A.ok)return A;
  A.fz=true;
  const stages=pl.nodes.filter(o=>!o.raw).map(o=>({item:o.item,cls:o.cls,tpl:sz.tz.by[sz.G[o.id].mem[0].id].tpl,block,S:sz.tz.by[sz.G[o.id].mem[0].id].S,N:o.N,perStrip:[o.N],B:sz.G[o.id].B}));
  return{ok:true,A,stages,cmpI:{K:1,tree:true,rb:A.rb,stages,nodes:A.nodes,routed:A.routed},note:pl.notes.slice(),per:[P.nodes[item].machines]};
}
