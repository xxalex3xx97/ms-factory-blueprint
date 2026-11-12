// NL4 nlTop(P,item,mk,spMk,o): placerLayout-shaped result like lcTop, flag NL_ENGINE decides at the prefab.js dispatch. No capacity refusal, no fallback.
// Explicit errors only for: Armoury cells (NL9), growth recipes / one machine above belt cap (pfFactTree), internal failures.
function nlTop(P,item,mk,spMk,o={}){
  const prevBox=PLC_BOX;if(o.box)PLC_BOX=o.box;   // honour the Buffer container choice for every container NL emits (cells, docks, sinks, Armoury outputs)
  try{
    spMk=Math.max(spMk,mk);
    const GT=P.nodes[item];
    if(GT&&GT.crafter&&/Armoury/i.test(GT.crafter))return nlArmoury(P,item,mk,spMk,o);   // hand-crafted by the player: build its components only
    if(GT&&GT.rec&&GT.rec.i.some(([x])=>x===item))return nlGrowth(P,item,mk,spMk,o);   // growth as the final item: verified growth lanes (plcGrowthLane), one lane per machine, one sink container per lane
    const t0=performance.now(),F=nlFlow(P,item,mk),t1=performance.now();if(F.ok===false)return{ok:false,why:'NL: '+F.why};
    if(F.nodes.some(n=>/Armoury/i.test(n.cls)))return{ok:false,why:'NL: Armoury recipes are not built yet (NL9)'};
    let pl,B,err='';for(const q of nlPlanAll(F,mk)){if(q.ok===false){err=q.why;continue}const b=nlBuild(F,q,mk,spMk);if(b.ok===false){err=b.why;continue}pl=q;B=b;break}
    const t2=performance.now(),t3=t2;if(!B)return{ok:false,why:'NL: '+err};
    B.stat.rows=pl.rowStat;
    const T=P.nodes[item],BX=o.box||PLC_BOX,items=B.items;
    const w=plcMmax(items,q=>q.x+dim(q).w)+1,h=plcMmax(items,q=>q.y+dim(q).h);
    const ports=B.outXs.map(x=>({edge:'S',off:x,dir:'out',belts:1,slot:-1,mk}));
    const cuts=[];for(let c=PF_GRID.cw;c<w-1;c+=PF_GRID.cw)cuts.push(c);
    return{ok:true,items,cuts,lanes:1,per:[T.machines],makes:T.machines*T.pmach,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
      note:['No Limits: '+pl.cells.length+' cells, '+pl.lanes.length+' lanes, '+pl.spills.length+' spills, '+ports.length+' out',...(P.nofp||[]).map(x=>plnNm(x)+' comes from the Deep Space Observatory block (not placed)')],src:{P,item,mk,spMk,o},prefab:true,stat:B.stat,nlPlan:pl,chosen:pl.chosen,times:{flow:Math.round(t1-t0),plan:Math.round(t2-t1),build:Math.round(t3-t2)}}
  }catch(e){return{ok:false,why:'NL: internal error '+e.message}}finally{PLC_BOX=prevBox}
}

// NL growth final: plcGrowthLane = one verified growth lane per machine stacked (seed + Biomass containers inside, net out into a sink container per lane). Any rate: lanes = machines.
function nlGrowth(P,item,mk,spMk,o={}){
  const BX=o.box||PLC_BOX,L=plcGrowthLane(P,item,mk,0,{box:BX,mod:false});
  if(!L.ok)return{ok:false,why:'NL: '+L.why};
  const bw=def(BX).w,isS=b=>L.items.some(q=>PLC_BELT.includes(q.cls)&&q.rot===1&&q.y===b.y-1&&q.x>=b.x&&q.x<b.x+bw);
  const sinks=L.items.filter(q=>q.cls===BX&&q.ct&&!q.ct.length&&isS(q)),T=P.nodes[item],items=L.items,w=L.w,h=L.h;
  const crafters=new Set([plnCb(T.crafter).id,def(plnCb(T.crafter).id).key]);let belts=0,spl=0,machines=0;
  for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++;else if(crafters.has(q.cls))machines++}
  const cuts=[];for(let c=PF_GRID.cw;c<w-1;c+=PF_GRID.cw)cuts.push(c);
  return{ok:true,items,cuts,lanes:1,per:[T.machines],makes:T.machines*T.pmach,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports:sinks.map((s,i)=>({edge:'S',off:s.x,dir:'out',belts:2,slot:i,mk})),
    note:['No Limits: growth '+T.machines+' lanes, '+sinks.length+' out',...L.note],src:{P,item,mk,spMk,o},prefab:true,stat:{belts,ug:0,spl,blocks:T.machines,machines,lanes:T.machines,spills:0},growth:true};
}

// NL9 Armoury: the player hand-crafts Armoury items, so the factory holds NO Armoury machine. Leaf components (Armoury inputs are expanded recursively) are built by normal nlTop sub-factories at rate N x recipe amount,
// laid out side by side bottom-aligned (sinks on the bottom edge); each component ends in its own sink container(s) (one per belt of its rate, as every NL final). Returns the nlTop result shape.
function nlArmoury(P,item,mk,spMk,o={}){
  const leaf=new Map(),isA=x=>{const T=P.nodes[x];return T&&T.crafter&&/Armoury/i.test(T.crafter)};
  const walk=(x,rate)=>{const T=P.nodes[x];for(const [y,n] of T.rec.i){const r=rate*n/T.rec.o[1];if(isA(y))walk(y,r);else leaf.set(y,(leaf.get(y)||0)+r)}};
  walk(item,P.nodes[item].rate);
  const parts=[];let x0=0,H=0;
  for(const [c,r] of leaf){
    if(!(P.nodes[c]&&P.nodes[c].crafter))return{ok:false,why:'NL: Armoury input '+plnNm(c)+' is a raw item (no factory to build)'};
    const Pc=plan(c,r,mk,{sp:null,bal:null},PLN_PICK,{proto:false,enr:false}),L=nlTop(Pc,c,mk,spMk,{...o,armoury:1});
    if(L.ok===false)return{ok:false,why:'NL: '+plnNm(c)+': '+L.why};
    parts.push({c,r,L});H=Math.max(H,L.h)}
  const items=[],ports=[],stat={belts:0,ug:0,spl:0,machines:0,blocks:0,lanes:0,spills:0},note=[];let w=0;
  for(const q of parts){const dy=H-q.L.h;q.x0=x0;
    for(const it of q.L.items)items.push({...it,x:it.x+x0,y:it.y+dy});
    for(const p of q.L.ports)ports.push({...p,off:p.off+x0});
    for(const k in q.L.stat)if(typeof q.L.stat[k]==='number')stat[k]=(stat[k]||0)+q.L.stat[k];
    note.push(plnNm(q.c)+' '+(+q.r.toFixed(2))+'/min -> '+q.L.ports.length+' container(s)');
    for(const s of q.L.note)if(/not placed/.test(s)&&!note.includes(s))note.push(s);
    x0=Math.ceil((x0+q.L.w+1)/PF_GRID.cw)*PF_GRID.cw}   // keep the wall-column grid of each sub-factory aligned
  w=x0;const BX=o.box||PLC_BOX,cuts=[];for(let c=PF_GRID.cw;c<w-1;c+=PF_GRID.cw)cuts.push(c);
  return{ok:true,items,cuts,lanes:1,per:[0],makes:0,pitch:H+1,w,h:H,tall:true,mod:false,box:BX,mk,ports,
    note:['No Limits: Armoury '+plnNm(item)+' hand-crafted, factory builds '+parts.length+' components, '+ports.length+' containers',...note],src:{P,item,mk,spMk,o},prefab:true,stat,armoury:parts.map(q=>({item:q.c,rate:q.r,outs:q.L.ports.length,x0:q.x0,w:q.L.w}))};
}
