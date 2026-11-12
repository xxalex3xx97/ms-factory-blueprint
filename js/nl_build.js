// NL4 nlBuild(F,plan,mk,spMk): lcBuild + spill emitter. Lane events (spill splitter, taps) are emitted top-down on the lane column; a spill is a splitter on the lane (S front, E side)
// plus a horizontal belt on the spill row ending one cell before the next lane (side-load). A lane with a spill and no heads just turns east (belt, no splitter).
// Sink = one container per plan.sink group (outXs one per container). Exact UG crossings as lcBuild. Returns {ok,items,outXs,stat} or {ok:false,why}.
function nlBuild(F,plan,mk,spMk){
  const no=why=>({ok:false,why}),bc=PLC_BELT[mk],sc=PLC_SPL[spMk];
  const items=[],A=[],byItem=new Map(F.nodes.map(n=>[n.item,n]));
  const pN=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='N');
  const cells=plan.cells,grp=new Map(),G=(arr,g)=>{for(const q of arr)grp.set(q,g);return arr};
  for(const c of cells){
    const n=byItem.get(c.item);
    for(const q of G(c.g.items.map(b=>Object.assign({},b,{x:b.x+c.ox,y:b.y+c.oy})),'bCell'))items.push(q.cls===n.cls?Object.assign(q,{rec:n.rec}):q)}
  for(const d of plan.dock)items.push({cls:PLC_BOX,x:d.x,y:1,rot:0,ct:[{item:d.item,n:0,inf:true}]});
  const oyOf=id=>cells[id].oy;
  for(const l of plan.lanes){
    const R=plan.routes.filter(r=>r.lane===l.id),S=plan.spills.find(s=>s.lane===l.id);
    if(!R.length&&!S)continue;
    const lg=l.raw?'bRaw':'bThru',T=plan.taps.filter(t=>t.lane===l.id).sort((a,b)=>a.y-b.y);
    const st=R.filter(r=>r.kind==='straight');
    if(st.length>1)return no('lane '+l.id+' has two straight consumers');
    const ys=st.length?oyOf(st[0].toCell):null;
    if(l.kind==='jog'){
      const j=plan.tracks.find(t=>t.kind==='jog'&&t.lane===l.id);
      if(j)A.push(...G(lcJog(l.x,l.y0,j.hx,j.y,oyOf(j.toCell),mk).items,lg));
      else if(ys!==null)A.push(...G(lcJog(l.x,l.y0,l.x,0,ys,mk).items,lg));
      else return no('jog lane '+l.id+' has no route');
      continue}
    const ev=[...(S?[{y:S.y,s:S}]:[]),...T.map(t=>({y:t.y,t}))].sort((a,b)=>a.y-b.y);
    if(!ev.length){A.push(...G(lcJog(l.x,l.y0,l.x,0,ys,mk).items,lg));continue}
    A.push(...G(lcJog(l.x,l.y0,l.x,0,ev[0].y,mk).items,lg));
    ev.forEach((e,i)=>{
      const yf=i<ev.length-1?ev[i+1].y:(ys!==null?ys:e.y+1);
      if(e.t){const tp=lcTap(l.x,e.y,e.t.dir,e.t.hx,yf,oyOf(e.t.toCell),mk,spMk).items;
        for(const q of tp)grp.set(q,q.y===e.y?'bTap':lg);A.push(...tp);return}
      const xt=plan.lanes[e.s.to].x;
      if(!(xt>l.x))throw new Error('spill target not east of lane '+l.id);
      const only=!R.length;   // nothing else on this lane: turn east, no splitter
      if(only)A.push(...G([{cls:bc,x:l.x,y:e.y,rot:0}],'bSpill'));
      else{A.push(...G([{cls:sc,x:l.x,y:e.y,rot:1,off:pfSplOff(sc,1,['S','E'])}],lg));
        for(let yy=e.y+1;yy<yf;yy++)A.push(...G([{cls:bc,x:l.x,y:yy,rot:1}],lg))}
      for(let xx=l.x+1;xx<xt;xx++)A.push(...G([{cls:bc,x:xx,y:e.y,rot:0}],'bSpill'))})}
  // final output
  const fin=cells.filter(c=>c.row===0);let outXs=[];
  if(plan.sink){
    const s=plan.sink;
    for(const g of s.groups){
      for(const id of g.cells){const c=cells[id];A.push(...G(lcJog(c.ox+c.out.x,c.oy+c.h,c.ox+c.out.x,0,s.y,mk).items,'bSink'))}
      A.push(...G(lcSink(g.x0,s.y,g.x1,mk).items,'bSink'));outXs.push(g.x1)}
  }else{
    if(fin.length!==1)return no('no sink for '+fin.length+' final cells');
    const c=fin[0],ox=c.ox+c.out.x;outXs=[ox];
    const ob={cls:bc,x:ox,y:c.oy+c.h,rot:1};grp.set(ob,'bSink');
    A.push(ob,{cls:PLC_BOX,x:ox-pN.x,y:c.oy+c.h+1-pN.y,rot:0,ct:[]});
  }
  // exact UG crossings
  const key=q=>q.y*100000+q.x,H=new Set(),V=new Map();
  for(const q of A)if(q.cls===bc){if(q.rot===1)V.set(key(q),q);else H.add(key(q))}
  const drop=new Set(),mark=new Set();let ug=0;
  for(const [k,q] of V)if(H.has(k)){
    drop.add(q);
    for(const dy of[-1,1]){const nb=V.get(key({x:q.x,y:q.y+dy}));
      if(!nb||H.has(key(nb))||mark.has(nb))return no('UG crossing at '+q.x+','+q.y+' has no room');
      mark.add(nb)}}
  for(const q of A){if(drop.has(q))continue;if(mark.has(q)){q.cls=PLC_UG[mk];ug++}items.push(q)}
  let belts=0,spl=0,machines=0;
  const crafters=new Set(F.nodes.map(n=>n.cls));
  const bk={bCell:0,bRaw:0,bThru:0,bTap:0,bSink:0,bSpill:0,bOther:0};
  for(const q of items){if(PLC_BELT.includes(q.cls)){belts++;bk[grp.get(q)||'bOther']++}else if(PLC_SPL.includes(q.cls))spl++;else if(crafters.has(q.cls))machines++}
  return{ok:true,items,outXs,stat:Object.assign({belts,ug,spl,blocks:cells.length,machines,lanes:plan.lanes.length,spills:plan.spills.length},bk)};
}
