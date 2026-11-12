// NL4 nlTop(P,item,mk,spMk,o): placerLayout-shaped result like lcTop, flag NL_ENGINE decides at the prefab.js dispatch. No capacity refusal, no fallback.
// Explicit errors only for: Armoury cells (NL9), growth recipes / one machine above belt cap (pfFactTree), internal failures.
function nlTop(P,item,mk,spMk,o={}){
  try{
    spMk=Math.max(spMk,mk);
    const GT=P.nodes[item];
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
      note:['No Limits: '+pl.cells.length+' cells, '+pl.lanes.length+' lanes, '+pl.spills.length+' spills, '+ports.length+' out'],src:{P,item,mk,spMk,o},prefab:true,stat:B.stat,nlPlan:pl,chosen:pl.chosen,times:{flow:Math.round(t1-t0),plan:Math.round(t2-t1),build:Math.round(t3-t2)}}
  }catch(e){return{ok:false,why:'NL: internal error '+e.message}}
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
