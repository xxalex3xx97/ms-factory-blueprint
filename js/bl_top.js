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
    if(o.eng==='zones'){if(dock&&(dock.in==='ind'||dock.out==='ind'))return no('zones do not support industrial docks');const Z=blTopZ(P,item,mk,spMk,nodes,BX,o);return Z.ok?Z:{ok:false,why:Z.why}}
    if(o.eng!=='tower'&&!(dock&&(dock.in==='ind'||dock.out==='ind'))){const Z=blTopZ(P,item,mk,spMk,nodes,BX,o);if(Z.ok)return Z}   // Z3: zoned single stage first, old tower on refusal
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
// H6b: container rows for a horizontal dock. Container j at local y a_j=16k+5 (its rows hold the dock lanes M=16k+6, M+1=16k+7). Port rows split across the containers (n_j rows each, <=4). Returns {ca,py} or null when c>2.
function blDockRows(yRow,c,ya){
  const R=yRow.length;if(c>2)return null;
  const ca=c===1?[Math.abs(5-ya)<=Math.abs(21-ya)?5:21]:[5,21],n=c===1?[R]:[Math.ceil(R/2),R-Math.ceil(R/2)],py=[];
  n.forEach((nj,j)=>{for(let i=0;i<nj;i++)py.push(ca[j]+Math.floor((4-nj)/2)+i)});
  return{ca,py};
}
// blYaOf: the container row the vertical/row layout picks (same formula as blHIZ / blHFB).
function blYaOf(yRow,c){const yMid=(yRow[0]+yRow[yRow.length-1])/2;return Math.min(Math.max(Math.floor(yMid-2*c),1),29-4*c)}
// blTopZ (H3, H4, H6b): zoned chain. Stage s (producer first): block 0 = IZ (input containers, west); FB_s = block s+1 (machine rows, sink containers at its east end; the next stage's input rows run from that sink into block s+2). K stacks at Y=30k, each its own strip. Single raw input, Large Container only. Normal docks (H6b): IZ containers dk 'in' and last-stage sinks dk 'out'. Industrial docks refuse. Refuses {ok:false,why} so blTop falls back to the tower.
function blTopZ(P,item,mk,spMk,nodes,BX,o){
  const no=why=>({ok:false,why:'BL: zone '+why});
  if(BX!=='DAT_Container_2')return no('needs Large Container');
  const dock=o.dock||null,dIn=!!(dock&&dock.in==='nrm'),dOut=!!(dock&&dock.out==='nrm');
  if(dock&&(dock.in==='ind'||dock.out==='ind'))return no('industrial dock not yet');
  const S=nodes.length,cap=MKS[mk][1],bw=dim({cls:BX,rot:0}).w;
  const st=nodes.map(n=>{const mc=blMachine(n.cls);if(!mc.ok)return null;const fi=P.edges.filter(e=>e.from===n.ins[0].item&&e.to===n.item).reduce((a,e)=>a+e.flow,0)/n.N;return{n,mc,fi,PH:mc.h+2,RB:BL.RB(mc.h+2)}});
  if(st.some(x=>!x))return no('machine ports');
  const Mp=st.map((x,s)=>blM(x.fi,x.n.fo,x.mc.w,cap,bw,S===1?4:x.RB,s<S-1?st[s+1].RB:0));   // pass 1: worst-case rows
  if(Mp.some(m=>m<1))return no('machine does not fit the zone width or belt cap');
  const B=blNK(nodes.map(n=>n.N),Mp,st.map(x=>x.RB)),K=B.K,r=B.n.map((v,s)=>Math.ceil(v/Mp[s]));
  const M=Mp,y0=st.map((x,s)=>r[s]*x.PH===30?0:1);
  for(let s=0;s<S;s++)if(blRW(r[s],st[s].mc.w,s<S-1?r[s+1]:0).M<M[s])return no('machine does not fit the zone width');   // pass 2: exact rows of the next stage
  const rowsOf=s=>Array.from({length:r[s]},(_,j)=>y0[s]+st[s].PH*j);
  const yIn=rowsOf(0),cIn=Math.ceil(r[0]/4),dI=dIn?blDockRows(yIn,cIn,blYaOf(yIn,cIn)):null;
  if(dIn&&!dI)return no('dock needs <=2 containers per stack');
  const yO=rowsOf(S-1).map(y=>y+st[S-1].PH-1),cO=Math.ceil(r[S-1]/4),dO=dOut?blDockRows(yO,cO,blYaOf(yO,cO)):null;
  if(dOut&&!dO)return no('dock needs <=2 containers per stack');
  const items=[];
  for(let k=0;k<K;k++){
    const Y=30*k,iz=blHIZ({mk,bx:BX,raw:nodes[0].ins[0].item,R:r[0],P:st[0].PH,y0:y0[0],Y,ca:dI&&dI.ca,pyI:dI&&dI.py,dock:dIn});
    items.push(...iz.items);
    const sinks=[];
    for(let s=0;s<S;s++){
      const last=s===S-1,c=s<S-1?Math.ceil(Math.max(r[s],r[s+1])/4):undefined;
      if(s<S-1&&4*c<r[s+1])return no('next stage rows');
      const fk=blHFB({mk,spMk,cls:nodes[s].cls,rec:nodes[s].rec,mc:st[s].mc,M:M[s],R:r[s],Y,y0:y0[s],bx:BX,B:30*(s+1),nextR:s<S-1?r[s+1]:0,c,ca:last&&dO?dO.ca:undefined,pyO:last&&dO?dO.py:undefined,dock:last&&dOut});
      if(!fk.ok)return no(fk.why);
      items.push(...fk.items);sinks.push(fk);
    }
    for(let s=0;s<S-1;s++){
      const fk=sinks[s],nx=blHIN({mk,bx:BX,xc0:fk.xc0,ya:fk.ya,c:fk.c,R:r[s+1],P:st[s+1].PH,y0:y0[s+1],Y,B:30*(s+1)});
      items.push(...nx.items);
    }
  }
  let belts=0,spl=0;
  for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++}
  const machines=K*r.reduce((a,v,s)=>a+v*M[s],0),last=S-1,w=plcMmax(items,q=>q.x+dim(q).w)+1,h=30*K;
  const cuts=[];for(let s=1;s<=S;s++)cuts.push(30*s);
  const ports=[];   // H3: sink containers sit inside each FB east end; no OZ port list
  const stat={belts,ug:0,spl,blocks:K*(S+1),machines,lanes:1,spills:0};
  const note=['Block engine: zoned tower (IZ west | FB east), '+S+' stage(s), '+r.map(v=>v*K).join('/')+' rows, '+K+' stack(s)'];
  if(dOut)note.push('Risk: normal output dock has 2 ports');
  return{ok:true,eng:'zones',items,cuts,lanes:1,per:[machines],makes:K*r[last]*M[last]*nodes[last].fo,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
    note,
    src:{P,item,mk,spMk,o},prefab:true,stat,dk:dock&&(dock.in||dock.out)?dock:null,bl:{K,n:nodes.map(n=>n.N),r:r.map(v=>v*K),M,Rmax:4,zoned:true,stacks:K}};
}
