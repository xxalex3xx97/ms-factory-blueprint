// BL4 blTop(P,item,mk,spMk,o). BL0 stub: always refuses, so pfCompose falls through to NL.
let BL_ENGINE=false;
// blTop: block engine, nlTop-shaped result. Single-input linear chains only; anything else refuses with 'BL: ... (NL used)' so pfCompose falls through to NL.
function blTop(P,item,mk,spMk,o={}){
  const prevBox=PLC_BOX,no=why=>({ok:false,why:'BL: '+why+' (NL used)'});
  if(o.box)PLC_BOX=o.box;
  try{
    spMk=Math.max(spMk,mk);
    const T=P.nodes[item],BX=o.box||PLC_BOX,dock=o.dock||null;
    if(!T||!T.rec)return no('no recipe');
    if(T.crafter&&/Armoury/i.test(T.crafter))return no('Armoury');
    if(T.rec.i.some(([x])=>x===item))return no('growth');
    const Z=pfFactTree(P,item,mk);
    if(Z.ok===false)return no(Z.why);
    const nodes=Z.nodes.slice().sort((a,b)=>b.row-a.row);   // producer first
    const multi=nodes.some(n=>n.ins.length!==1||P.nodes[n.item].rec.i.length!==1);
    if(multi){if(o.eng==='zones')return no('zones build single-input recipes only');const R=blTopMulti(P,item,mk,spMk,o,Z,nodes,BX,dock);if(R.ok!==false)R.eng='tower-multi';return R}
    if(nodes.some(n=>n.cons.length>1))return no('non-linear (a node feeds two consumers)');
    if(nodes.filter(n=>!n.ins[0].crafted).length!==1)return no('non-linear (more than one raw input)');
    for(let k=1;k<nodes.length;k++)if(nodes[k].ins[0].item!==nodes[k-1].item)return no('non-linear chain');
    if(dock&&dock.out==='ind')return no('industrial output dock');
    if(o.eng==='zones'){if(nodes.length!==1)return no('zones build one-stage recipes only');if(dock&&(dock.in||dock.out))return no('zones do not support docks');const Z=blTopZ(P,item,mk,spMk,nodes,BX,o);return Z.ok?Z:{ok:false,why:Z.why}}
    if(o.eng!=='tower'&&nodes.length===1&&!(dock&&(dock.in||dock.out))){const Z=blTopZ(P,item,mk,spMk,nodes,BX,o);if(Z.ok)return Z}   // Z3: zoned single stage first, old tower on refusal
    const ind=!!(dock&&dock.in==='ind'),cap=MKS[mk][1],bw=dim({cls:BX,rot:0}).w,ps=portsOf({cls:BX,x:0,y:0,rot:0,off:[]});
    const Rmax=Math.min(3,ps.filter(p=>p.f==='S').length,ps.filter(p=>p.f==='N').length);
    const info=nodes.map(n=>{
      const mc=blMachine(n.cls);if(!mc.ok)return null;
      const fi=P.edges.filter(e=>e.from===n.ins[0].item&&e.to===n.item).reduce((a,e)=>a+e.flow,0)/n.N;
      return{n,mc,M:blM(fi,n.fo,mc.w,cap,bw,Rmax)};
    });
    if(info.some(x=>!x))return no('machine ports');
    if(info.some(x=>x.M<1))return no('machine does not fit the tower width or belt cap');
    const B=blNK(info.map(x=>x.n.N),info.map(x=>x.M),info.map((x,i)=>i===0&&ind?Math.min(Rmax,2):Rmax)),K=B.K;
    const items=[];let belts=0,spl=0;
    const ports=[];
    for(let t=0;t<K;t++){
      const cx=ind?30*t+4:nlSlotN(t,0,bw);
      const stages=info.map((x,s)=>({cls:x.n.cls,mc:x.mc,rec:x.n.rec,M:x.M,rowsM:blRowsM(B.n[s],x.M)}));
      const TT=blTower({mk,spMk,bx:BX,cx,cls:null,mc:null,rec:null,raw:nodes[0].ins[0].item,M:null,ind,dock,stages});
      if(!TT.ok)return no(TT.why);
      items.push(...TT.items);
      const pn=ps.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b);
      ports.push({edge:'S',off:cx+pn[0],dir:'out',belts:stages[stages.length-1].rowsM.length,slot:-1,mk});
    }
    for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++}
    const machines=K*B.n.reduce((a,v)=>a+v,0),last=info[info.length-1],fin=B.n[B.n.length-1]*K*last.n.fo;
    const w=plcMmax(items,q=>q.x+dim(q).w)+1,h=plcMmax(items,q=>q.y+dim(q).h);
    const cuts=[];for(let c=PF_GRID.cw;c<w-1;c+=PF_GRID.cw)cuts.push(c);
    const stat={belts,ug:0,spl,blocks:K*info.length,machines,lanes:K,spills:0};
    return{ok:true,eng:'tower',items,cuts,lanes:K,per:[machines],makes:fin,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
      note:['Block engine: '+K+' tower(s), '+info.length+' stage(s), rows per stage '+B.r.join('/'),...(dock&&dock.out==='nrm'?['Risk: normal output dock has 2 ports (240/min per tower)']:[]),...(P.nofp||[]).map(x=>plnNm(x)+' comes from the Deep Space Observatory block (not placed)')],
      src:{P,item,mk,spMk,o},prefab:true,stat,dk:dock&&(dock.in||dock.out)?dock:null,bl:{K,n:B.n,r:B.r,M:info.map(x=>x.M),Rmax}};
  }catch(e){return no('internal error '+e.message)}finally{PLC_BOX=prevBox}
}
// blTopMulti: two-input merge trees (one lane input per merge), called from blTop. Anything outside BL8 scope refuses with 'BL: ... (NL used)'.
function blTopMulti(P,item,mk,spMk,o,Z,nodes,BX,dock){
  const no=why=>({ok:false,why:'BL: '+why+' (NL used)'});
  if(dock&&dock.in)return no('input dock with a multi-input tree');
  if(dock&&dock.out==='ind')return no('industrial output dock');
  if(nodes.some(n=>n.cons.length>1))return no('non-linear (a node feeds two consumers)');
  if(nodes.some(n=>n.ins.length>2))return no('more than 2 inputs');
  if(nodes.some(n=>P.nodes[n.item].rec.i.length!==n.ins.length))return no('recipe inputs not in plan');
  const byI=new Map(nodes.map((n,i)=>[n.item,i]));
  if(!byI.has(item)||nodes.some(n=>n.ins.some(x=>x.crafted&&!byI.has(x.item))))return no('tree');
  const mg=i=>{const n=nodes[i];return(n.ins.length>1?1:0)+n.ins.reduce((a,x)=>a+(x.crafted?mg(byI.get(x.item)):0),0)};
  let nest=false;const ev=[];
  const emit=i=>{const n=nodes[i],ord=n.ins.slice().sort((a,b)=>(b.crafted?mg(byI.get(b.item)):0)-(a.crafted?mg(byI.get(a.item)):0));   // most merges first = lane, last = direct
    if(ord.length===2&&ord[1].crafted&&mg(byI.get(ord[1].item))>0)nest=true;
    const ids=ord.map(x=>x.crafted?emit(byI.get(x.item)):(ev.push({t:'raw',item:x.item}),ev.length-1));
    ev.push({t:'stage',node:i,d:ids[ids.length-1],l:ids.length>1?ids[0]:-1});return ev.length-1};
  emit(byI.get(item));
  if(nest)return no('nested merges');
  if(ev.filter(e=>e.t==='stage').length!==nodes.length)return no('tree');
  const cap=MKS[mk][1],bw=dim({cls:BX,rot:0}).w,ps=portsOf({cls:BX,x:0,y:0,rot:0,off:[]});
  const Rmax=Math.min(3,ps.filter(p=>p.f==='S').length,ps.filter(p=>p.f==='N').length,ps.filter(p=>p.f==='W').length);
  const info=nodes.map(n=>{
    const mc=blMachine(n.cls,n.ins.length);if(!mc.ok)return null;
    const fl=n.ins.map(x=>P.edges.filter(e=>e.from===x.item&&e.to===n.item).reduce((a,e)=>a+e.flow,0)/n.N);
    return{n,mc,M:blM(Math.max(...fl),n.fo,mc.w,cap,bw,Rmax)};
  });
  if(info.some(x=>!x))return no('machine ports');
  if(info.some(x=>x.M<1))return no('machine does not fit the tower width or belt cap');
  const B=blNK(nodes.map(n=>n.N),info.map(x=>x.M),nodes.map(()=>Rmax)),K=B.K,root=byI.get(item);
  const items=[],ports=[],pn=ps.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b);
  for(let t=0;t<K;t++){
    const cx=nlSlotN(t,0,bw);
    const evT=ev.map(e=>e.t==='raw'?e:{t:'stage',cls:nodes[e.node].cls,mc:info[e.node].mc,rec:nodes[e.node].rec,M:info[e.node].M,rowsM:blRowsM(B.n[e.node],info[e.node].M),d:e.d,l:e.l});
    const TT=blTree({mk,spMk,bx:BX,cx,dock,ev:evT});
    if(!TT.ok)return no(TT.why);
    items.push(...TT.items);
    ports.push({edge:'S',off:cx+pn[0],dir:'out',belts:B.r[root],slot:-1,mk});
  }
  let belts=0,spl=0,ug=0;
  for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++;else if(PLC_UG.includes(q.cls))ug++}
  const machines=K*B.n.reduce((a,v)=>a+v,0),fin=B.n[root]*K*nodes[root].fo;
  const w=plcMmax(items,q=>q.x+dim(q).w)+1,h=plcMmax(items,q=>q.y+dim(q).h);
  const cuts=[];for(let c=PF_GRID.cw;c<w-1;c+=PF_GRID.cw)cuts.push(c);
  const stat={belts,ug,spl,blocks:K*nodes.length,machines,lanes:K,spills:0};
  return{ok:true,items,cuts,lanes:K,per:[machines],makes:fin,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
    note:['Block engine: '+K+' tower(s), '+nodes.length+' stage(s), rows per stage '+B.r.join('/')+' (2-input merge, lane)',...(dock&&dock.out==='nrm'?['Risk: normal output dock has 2 ports (240/min per tower)']:[]),...(P.nofp||[]).map(x=>plnNm(x)+' comes from the Deep Space Observatory block (not placed)')],
    src:{P,item,mk,spMk,o},prefab:true,stat,dk:dock&&(dock.in||dock.out)?dock:null,bl:{K,n:B.n,r:B.r,M:info.map(x=>x.M),Rmax}};
}
// blTopZ (Z3): zoned single-stage tower. IZ (input containers, Y0) over FB (machine rows, Y30) over OZ (sink containers, Y60), one canvas at cx 0. Single raw input, Large Container only, no dock. Refuses {ok:false,why} so blTop falls back to the tower.
function blTopZ(P,item,mk,spMk,nodes,BX,o){
  const no=why=>({ok:false,why:'BL: zone '+why});
  if(BX!=='DAT_Container_2')return no('needs Large Container');
  const n=nodes[0],mc=blMachine(n.cls);
  if(!mc.ok)return no('machine ports');
  const cap=MKS[mk][1],bw=dim({cls:BX,rot:0}).w;
  const fi=P.edges.filter(e=>e.from===n.ins[0].item&&e.to===n.item).reduce((a,e)=>a+e.flow,0)/n.N;
  const M=blM(fi,n.fo,mc.w,cap,bw,4);   // zone width at the 4-row cap
  if(M<1)return no('machine does not fit the zone width or belt cap');
  const R=Math.ceil(n.N/M);
  if(R>BL.RB(mc.h+2))return no('rows over the zone cap');
  const iz=blIZ({mk,bx:BX,cx:0,Y:0,R,raw:n.ins[0].item}),fb=blFB({mk,spMk,cls:n.cls,rec:n.rec,mc,M,R,cx:0,Y:30});
  if(!fb.ok)return no(fb.why);
  const oz=blOZ({mk,bx:BX,Y:60,R,E0:fb.E0});
  const items=[...iz.items,...fb.items,...oz.items];
  let belts=0,spl=0;
  for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++}
  const machines=R*M,w=plcMmax(items,q=>q.x+dim(q).w)+1,h=plcMmax(items,q=>q.y+dim(q).h);
  const ports=oz.xs.map(x=>({edge:'S',off:x,dir:'out',belts:fb.exCols.filter(ex=>ex>=x&&ex<=x+3).length,slot:-1,mk}));
  const stat={belts,ug:0,spl,blocks:3,machines,lanes:1,spills:0};
  return{ok:true,eng:'zones',items,cuts:[],lanes:1,per:[machines],makes:R*M*n.fo,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
    note:['Block engine: zoned tower (IZ/FB/OZ), 1 stage, '+R+' rows x '+M+' machines'],
    src:{P,item,mk,spMk,o},prefab:true,stat,dk:null,bl:{K:1,n:[n.N],r:[R],M:[M],Rmax:4,zoned:true}};
}
