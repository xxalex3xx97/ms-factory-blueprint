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
    if(nodes.some(n=>P.nodes[n.item].rec.i.length!==1||n.ins.length!==1))return no('multi-input recipe');
    if(nodes.some(n=>n.cons.length>1))return no('non-linear (a node feeds two consumers)');
    if(nodes.filter(n=>!n.ins[0].crafted).length!==1)return no('non-linear (more than one raw input)');
    for(let k=1;k<nodes.length;k++)if(nodes[k].ins[0].item!==nodes[k-1].item)return no('non-linear chain');
    if(dock&&dock.out==='ind')return no('industrial output dock');
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
    return{ok:true,items,cuts,lanes:K,per:[machines],makes:fin,pitch:h+1,w,h,tall:true,mod:false,box:BX,mk,ports,
      note:['Block engine: '+K+' tower(s), '+info.length+' stage(s), rows per stage '+B.r.join('/'),...(P.nofp||[]).map(x=>plnNm(x)+' comes from the Deep Space Observatory block (not placed)')],
      src:{P,item,mk,spMk,o},prefab:true,stat,dk:dock&&(dock.in||dock.out)?dock:null,bl:{K,n:B.n,r:B.r,M:info.map(x=>x.M),Rmax}};
  }catch(e){return no('internal error '+e.message)}finally{PLC_BOX=prevBox}
}
