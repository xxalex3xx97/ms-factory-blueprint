// RB recursive builder entry (dev flag RB_ENGINE / ?engine=rb). Called by cmpCompose1 like cmpGroupsRun. S2: single chains only.
// rbRun(P,item,mk,spMk,BX,bk,block) -> {ok,A,stages,cmpI,note,per} | {ok:false,why}.  A={ok,nodes,routed,T,fz} as cmpAssembleTree1; cmpI.rb = {mods:[{item,N,B,nPhys,blocks,..}],ascii}
// dk (optional, compose.js): NORMAL docks {mk,in,out,notes}; rbBuild applies cmpDockApply and returns A.dock. INDUSTRIAL docks are filtered out by compose.js (rbDockOk) = old path until S6b / S6c. The 2x2c adapter (cmpDockApply handles ad=1 generically) builds through rb with NORMAL docks (tests/rb_docks.mjs AC5 2x2c); industrial on 2x2c stays old (S6c).
function rbDockOk(o,bk){return !!(o&&o.dock)}   // S6b: industrial docks build here too
function rbRun(P,item,mk,spMk,BX,bk,block,dk){
  if(globalThis.RB_FORCE_REFUSE)return{ok:false,why:'forced'};   // tests only (tests/worker_build.mjs)
  fbProgress('Planning modules','',-1);
  const pl0=cmpPlan(P,item,mk,{share:true});if(!pl0.ok)return pl0;
  const cls=plcCls(bk),f=floorRect({cls,x:0,y:0,h:0,rot:0}),W=f.w,H=f.h;
  const split={...(globalThis.CITY_SPLIT||{})},T0=Date.now();let pl,sz,A,F0,att=0,ok0=null;const n0=dk?dk.notes.length:0;
  for(;;){   // auto split: a node whose single copy cannot feed all consumer ports (lanes / router limits) is copied 2..8 times with its exclusive subtree (citySplitPlan), then rebuilt
    const sp=Object.keys(split).length>0;
    pl=sp&&typeof citySplitPlan==='function'?citySplitPlan(pl0,split):pl0;
    fbProgress('Sizing modules','',-1);
    sz=rbSize(pl,mk,spMk,block,W,H);if(!sz.ok)return sz;
    const bfs=(sp||globalThis.CITY_ON)&&typeof cityBuild==='function'?[cityBuild]:(dk&&typeof cityBuild==='function'?[rbBuild,cityBuild]:[rbBuild]);
    for(const bf of bfs){for(const bias of sp?[0]:[0,1,-1,2,-2]){globalThis.__fbAtt=' - attempt '+(++att)+' of 5';if(dk)globalThis.CMP_DKFAIL=[];A=bf({pl,G:sz.G,NB:sz.NB,tz:sz.tz,mk,bx:BX,bk,block,W,H,bias,dk,place:globalThis.CITY_PLACE});/* CITY_ON: table-driven city builder (city_build.js: row-local lanes, optional fixed positions CITY_PLACE[key]={c,r}) */if(bias===0&&!F0)F0=globalThis.CMP_DKFAIL;if(A.ok)break}if(A.ok)break}
    if(A.ok){   // dock-limited raw (8 lanes x belt cap per hub): split its consumer node so each copy needs less
      const lim=dk&&dk.notes.slice(n0).find(n=>/^Dock-limited/.test(n)),rw=lim&&pl0.nodes.find(o=>o.raw&&lim.indexOf(': '+o.item+' ')>0),cn=rw&&pl0.nodes.find(o=>o.id===rw.parent&&!o.raw),cu=cn?split[cn.key]||1:0;
      if(!cn||cu>=Math.min(16,cn.N)||Date.now()-T0>40000)break;
      ok0={pl,sz,A,nt:dk.notes.slice(n0)};dk.notes.length=n0;split[cn.key]=cu+1;continue;
    }
    if(ok0){({pl,sz,A}=ok0);dk.notes.push(...ok0.nt);break}   // a split that broke a working build: keep the dock-limited one
    const lim=o=>(split[o.key]||1)<Math.min(16,o.N),kidsOfRoot=()=>{const r=pl0.nodes.find(o=>!o.raw&&!(o.parents&&o.parents.length));return r?pl0.nodes.filter(c=>!c.raw&&c.parents&&c.parents.includes(r.id)&&lim(c)).sort((a,b)=>b.N-a.N):[]};
    let bad=A.bad&&pl0.nodes.find(o=>o.key===A.bad&&!o.raw&&o.parents&&o.parents.length);if(!bad||!lim(bad))bad=kidsOfRoot()[0];const cur=bad?split[bad.key]||1:0;
    if(!bad||cur>=Math.min(16,bad.N)||Date.now()-T0>40000){if(dk&&F0)globalThis.CMP_DKFAIL=F0;return{...A,why:A.why+(cur>1?' (after splitting '+(bad&&bad.item)+' into '+cur+' copies)':'')}}
    split[bad.key]=cur+1;
  }
  if(!A.ok)return A;
  A.fz=true;
  const stages=pl.nodes.filter(o=>!o.raw).map(o=>({item:o.item,cls:o.cls,tpl:sz.tz.by[sz.G[o.id].mem[0].id].tpl,block,S:sz.tz.by[sz.G[o.id].mem[0].id].S,N:o.N,perStrip:[o.N],B:sz.G[o.id].B}));
  return{ok:true,A,stages,cmpI:{K:1,tree:true,rb:A.rb,stages,nodes:A.nodes,routed:A.routed},note:pl.notes.slice(),per:[P.nodes[item].machines]};
}
