// NL4 nlTop(P,item,mk,spMk,o): placerLayout-shaped result like lcTop, flag NL_ENGINE decides at the prefab.js dispatch. No capacity refusal, no fallback.
// Explicit errors only for: Armoury cells (NL9), growth recipes / one machine above belt cap (pfFactTree), internal failures.
function nlTop(P,item,mk,spMk,o={}){
  try{
    spMk=Math.max(spMk,mk);
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
