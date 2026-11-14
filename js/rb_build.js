// RB recursive builder: post-order placement + finalize (single chains: every crafted node has one input, no shared product, no docks).
// rbBuild(x) x={pl,G,NB,tz,mk,bx,bk,block,W,H}: for each module (producer first) pack it as ONE fused module (rbPack / rbPackNode), try spots from rbCandidates (never copies / strips),
// route the IN region (cmpRoute) from the producer lanes, claim cells + corridor lanes in rbGrid. Finalize: items at block origins, corridor pass-through, wall UG swap, T + nodes[] as cmp_asm.js 265-268.
// -> {ok:true,T,nodes,routed,rb:{mods,ascii}} | {ok:false,why}.  Page globals: cmpRoute, cmpPool, cmpMerge, cmpShr, rbPack, rbPackNode, rbGrid, rbCandidates, plcCls, dim, def, PLC_UG, PLC_BELT, ugPairs, rk.
function rbBuild(x){
  const {pl,G,NB,tz,mk,bx,bk,block,W,H}=x,cls=plcCls(bk),d=dim({cls,rot:0}),TW=d.w*FC,TH=d.h*FC,ugc=PLC_UG[mk],t0=Date.now(),g=rbGrid(),no=why=>({ok:false,why}),byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),asc=(a,b)=>a-b;
  const root=pl.nodes.find(o=>!o.raw&&!(o.parents&&o.parents.length)),order=[],M={};
  const visit=o=>{o.children.map(i=>byId[i]).filter(c=>!c.raw).forEach(visit);order.push(o)};visit(root);
  const poolOf=(q,w,rows)=>{const n=NB[q.id],mm=cmpMerge(n.outRows,n.outN,n.gOut);return cmpPool({W:w,H,mk,bx,item:0,raw:false,inRows:mm.rows,mgIn:mm.mg,outRows:rows})};
  // IN region of a merge module: producer lanes (x=0) -> member port rows (x=w-1), rows hull of both modules; consumer first row r
  const reg=(m,w,r)=>{
    const p=m.prod,rs=[r,r+m.B-1,p.r,p.r+p.B-1],r0=Math.min(...rs),r1=Math.max(...rs),Y=(row,y)=>(row-r0)*(H+2)+y,src=[],snk=[],many=p.B>1;
    p.mem.forEach((pm,pb)=>p.lanes.forEach(l=>{const cm=m.mem[l.ci];src.push({x:0,y:Y(p.r+pb,l.ya),item:many?cm.id+'@'+l.y:pm.id+'>'+cm.id,...(many?{j:true}:{})})}));
    m.mem.forEach((cm,cb)=>NB[cm.id].inR[0].forEach(y=>snk.push({x:w-1,y:Y(r+cb,y),item:many?cm.id+'@'+y:p.mem[0].id+'>'+cm.id})));
    return{r0,r1,rt:cmpRoute({W:w,H,rowsN:r1-r0+1,mk,sources:src,sinks:snk,ugMax:def(ugc).maxApart,eastStart:true})};
  };
  for(const o of order){
    const gr=G[o.id],m={o,gr,id:o.id,B:gr.B,mem:gr.mem,prod:gr.kids.length?M[gr.kids[0].o.id]:null,lanes:[],outRows:[]};M[o.id]=m;
    if(o.parents&&o.parents.length){   // lanes out of every member: one per consumer port, leaving at the port's own row when free, else the nearest free row (near rule of cmp_groups.js 70)
      const used=new Set(),near=y0=>{for(let q=0;q<H;q++)for(const y of[y0-q,y0+q])if(y>=0&&y<=H-1&&!used.has(y)){used.add(y);return y}};
      G[o.parents[0]].mem.forEach((cm,ci)=>NB[cm.id].inR[0].slice().sort(asc).forEach(y=>m.lanes.push({ci,y,ya:near(y)})));
      if(m.lanes.length>H-2)return no('rb: '+o.item+' pool needs '+m.lanes.length+' lanes, a block holds '+(H-2));
      m.outRows=m.lanes.map(l=>l.ya).sort(asc);
    }
    const o0=m.mem[0],NB0=NB[o0.id],z0=tz.by[o0.id];let pk;
    if(m.prod)pk=rbPack({W,H,mk,dw:d.w,fb:{b:NB0.b,bi:NB0.bi},inF:w=>{const r=reg(m,w,m.prod.r);return r.rt.ok?{ok:true,items:r.rt.items}:{ok:false,why:r.rt.why||'merge routing failed'}},poolF:(w,rows)=>poolOf(o0,w,rows),outRows:m.outRows});
    else pk=rbPackNode(o0,z0,NB0,{block,bx,W,H,mk,outRows:m.outRows,dw:d.w});
    if(!pk.ok)return no('rb: '+o.item+': '+pk.why);
    m.pk=pk;
    const c0=m.prod?m.prod.c+m.prod.pk.nPhys:0,rowWant=m.prod?m.prod.r:0;let hit=false;
    for(const cd of rbCandidates(c0,rowWant,24)){
      if(Date.now()-t0>15000)return no('rb: time');
      const {c,r}=cd,rg=m.prod?reg(m,pk.colW[0],r):null;
      if(rg&&!rg.rt.ok)continue;
      const cells=[];
      for(let pc=0;pc<pk.nPhys;pc++){const rs=new Set();for(let b=0;b<m.B;b++)rs.add(r+b);if(rg&&pc===pk.colP[0])for(let y=rg.r0;y<=rg.r1;y++)rs.add(y);rs.forEach(y=>cells.push({gx:c+pc,gy:y,dx:pc,dy:y-r}))}
      const lan=[];
      if(m.prod){const p=m.prod,gx0=p.c+p.pk.nPhys-1;p.mem.forEach((pm,pb)=>p.lanes.forEach(l=>lan.push([gx0,c,p.r+pb,l.ya])))}
      if(!g.free(cells)||!lan.every(a=>g.laneFree(...a)))continue;
      g.claim(m,cells);lan.forEach(a=>g.laneClaim(...a));
      Object.assign(m,{c,r,cells,rg});hit=true;break;
    }
    if(!hit)return no('rb: no spot for '+o.item);
  }
  // ---- finalize
  const keys=[...g.occ.keys(),...g.cor.keys()].map(k=>k.split(',').map(Number)),gy0=Math.min(...keys.map(k=>k[1])),ms=[],routed=[],nodes=[];
  for(const m of order.map(o=>M[o.id])){
    const pk=m.pk,pX=q=>(m.c+pk.colP[q])*TW+pk.colX[q]-pk.colP[q]*FC;
    const put=(items,X,Y,ct,tag)=>items.forEach(b=>{const q={...b,x:b.x+X,y:b.y+Y};ms.push(q);if(tag)tag.push(q);if(ct&&b.ct)ct.push(q.x+','+q.y)});
    if(m.rg)put(m.rg.rt.items,pX(0),(m.rg.r0-gy0)*TH,null,routed);
    for(let b=0;b<m.mem.length;b++){
      const q=m.mem[b],Y=(m.r+b-gy0)*TH,n=NB[q.id],ct=[],bz=n.b,w=pk.colW[1],fit=w===W||w===bz.w?n.bi:cmpShr(bz,mk,w);
      if(!fit)return no('rb: shrink failed ('+m.o.item+')');
      if(!m.prod){const h=cmpPool({W:pk.colW[0],H,mk,bx,item:q.rec.i[0][0],raw:true,inRows:[],outRows:n.inR[0]});if(h.ok===false)return no(h.why);put(h.items,pX(0),Y)}
      put(fit,pX(1),Y);
      const h=poolOf(q,pk.colW[2],m.outRows);if(h.ok===false)return no(h.why);put(h.items,pX(2),Y,ct);
      nodes.push({id:q.id,item:q.item,key:q.key,rate:q.rate,lanes:n.lanes,outRows:n.outRows,rec:rk(q.rec),N:q.N,pN:m.o.N,util:q.util,pU:q.util,gx:m.c+pk.colP[1],gy:(m.r+b-gy0)*d.h,inCol:m.c+pk.colP[0],pool:m.c+pk.colP[2],row:m.r+b-gy0,fb:{x:pX(1),y:Y,w,h:H},ct,kind:q.inKind});
    }
  }
  const U=new Set();for(let cur=1,D=def(ugc).maxApart-1;cur<=W-3;){const e=Math.min(cur+D,W-2);U.add(cur);U.add(e);cur=e+1}   // pass-through lane in a corridor block: UG hops (x=0 / x=W-1 stay belts for the wall swap)
  for(const [k,ys] of g.cor){const [gx,gy]=k.split(',').map(Number);for(const y of ys)for(let xx=0;xx<W;xx++)if(xx===0||xx===W-1||U.has(xx))ms.push({cls:U.has(xx)?ugc:PLC_BELT[mk],x:gx*TW+xx,y:(gy-gy0)*TH+y,h:0,rot:0,pid:0})}
  const at=new Map();ms.forEach(b=>{if(PLC_BELT.includes(b.cls)&&b.rot===0)at.set(b.x+','+b.y,b)});   // wall swap: rot-0 belts on both sides of a block boundary -> UG pair
  ms.slice().forEach(A=>{if(!PLC_BELT.includes(A.cls)||A.rot!==0||A.x%TW!==W-1)return;const B=at.get((A.x+3)+','+A.y);if(B&&PLC_BELT.includes(B.cls))A.cls=B.cls=ugc});
  const bl=new Map(),letter=new Map();order.forEach((o,i)=>letter.set(o.id,String.fromCharCode(65+i)));
  for(const k of [...g.occ.keys(),...g.cor.keys()]){const [gx,gy]=k.split(',').map(Number);bl.set(k,{cls,x:gx*d.w,y:(gy-gy0)*d.h})}
  const max=def(ugc).maxApart,ugs=ms.filter(b=>PLC_UG.includes(b.cls)),pairs=ugPairs(ugs),gx1=Math.max(...keys.map(k=>k[0])),gy1=Math.max(...keys.map(k=>k[1]));
  const ascii=[];for(let y=gy0;y<=gy1;y++){let s='';for(let xx=0;xx<=gx1;xx++){const v=g.occ.get(xx+','+y);s+=v?letter.get(v.mod.id):g.cor.has(xx+','+y)?'=':'.'}ascii.push(s)}
  const T={ok:true,blocks:[...bl.values()],ms,ug:ugs.length,cols:gx1+1,rows:gy1-gy0+1,max,rc:[],ov:0,span:pairs.filter(p=>p&&p.n>max).length,G:1};
  const mods=order.map(o=>{const m=M[o.id];return{item:o.item,letter:letter.get(o.id),N:o.N,B:m.B,nPhys:m.pk.nPhys,blocks:m.cells.length,c:m.c,r:m.r-gy0}});
  return{ok:true,T,nodes,routed,rb:{mods,ascii}};
}
