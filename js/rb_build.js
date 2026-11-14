// RB recursive builder: post-order placement + finalize (single chains: every crafted node has one input, no shared product, no docks).
// rbBuild(x) x={pl,G,NB,tz,mk,bx,bk,block,W,H}: for each module (producer first) pack it as ONE fused module (rbPack / rbPackNode), try spots from rbCandidates (never copies / strips),
// route the IN region (cmpRoute) from the producer lanes, claim cells + corridor lanes in rbGrid. Finalize: items at block origins, corridor pass-through, wall UG swap, T + nodes[] as cmp_asm.js 265-268.
// -> {ok:true,T,nodes,routed,rb:{mods,ascii}} | {ok:false,why}.  Page globals: cmpRoute, cmpPool, cmpMerge, cmpShr, rbPack, rbPackNode, rbGrid, rbCandidates, plcCls, dim, def, PLC_UG, PLC_BELT, ugPairs, rk.
function rbBuild(x){
  const {pl,G,NB,tz,mk,bx,bk,block,W,H}=x,cls=plcCls(bk),d=dim({cls,rot:0}),TW=d.w*FC,TH=d.h*FC,ugc=PLC_UG[mk],t0=Date.now(),g=rbGrid(),byId=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),asc=(a,b)=>a-b;
  // DOCKS (normal S6a, industrial S6b: dk.indIn/indOut, cmpDockHub/cmpFeedDock/cmpDockApply do the ind tags ie/oe/iv/is): x.dk={mk,in,out,notes} as compose.js. Raw hubs (SRC/FEED) are NEVER fused: own block at gx=0 (west face),
  // their lanes cross empty corridor blocks (cmp_asm.js bank pass-through); the root POOL (OZ) is the last piece of its block, container flush east (q.x+4===W-1). cmpDockApply (cmp_dock.js) needs per hub item: dk tags + hx/hw/hu/hc (put), nodes[] gx/gy/inCol/pool/fb/ct.
  const DK=x.dk&&(x.dk.in||x.dk.out)?x.dk:null,hubOwn=!!(DK&&DK.in),n0=DK?DK.notes.length:0,no=why=>{if(DK)DK.notes.length=n0;return{ok:false,why}};
  const rawD=(o,q)=>o.rec.i.map(([it])=>{const c=o.children.map(i=>byId[i]).find(c=>c.key===it);return c?c.rate*q.rate/o.rate:0});   // planner raw rate per raw input of member q (share of node o)
  const sidesOf=row=>{let up=1,dn=1;for(const k of[...g.occ.keys(),...g.cor.keys()]){const[gx,gy]=k.split(',').map(Number);if(gx===0){if(gy<row)up=0;if(gy>row)dn=0}}return[up&&'N',dn&&'S'].filter(Boolean)};   // FEED hub: N / S dock only when no block lies above / below it in block column 0 (outer edge)
  const mkHub=(m,jr)=>m.mem.map((q,b)=>rbNodeIn(q,tz.by[q.id],NB[q.id],{block,bx,H,mk,dkx:{dk:DK,D:rawD(m.o,q),dh:d.h,dw:d.w,row:jr(b),sides:()=>sidesOf(m.r+b)}}));
  pl.nodes.forEach(o=>{if(o.raw&&o.parent)o.parents=[o.parent]});
  const root=pl.nodes.find(o=>!o.raw&&!(o.parents&&o.parents.length)),order=[],M={};
  const seen=new Set(),visit=o=>{if(seen.has(o.id))return;seen.add(o.id);o.children.map(i=>byId[i]).filter(c=>!c.raw||G[c.id]).forEach(visit);order.push(o)};visit(root);   // shared product: visited (built) once
  const poolOf=(q,w,rows,wt,dO)=>{const n=NB[q.id],mm=rows.length>4?{rows:n.outRows,mg:[]}:cmpMerge(n.outRows,n.outN,n.gOut);return cmpPool({W:w,H,mk,bx,item:0,raw:false,inRows:mm.rows,mgIn:mm.mg,outRows:rows,bal:true,wt,wi:mm.n,...(dO||{})})};   // dO: OZ dock hub of the root member (cmpDockHub)
  // IN region of a merge module: producer lanes (x=0) -> member port rows (x=w-1), rows hull of both modules; consumer first row r
  const fr=(p,l)=>l.from!=null?l.from:p.c+p.pk.nPhys-1,   // block column the lane (so far) reaches
    thru=m=>{const o=[];m.kids.forEach(p=>p.mem.forEach((pm,pb)=>p.lanes.forEach(l=>{if(l.par!==m.id&&!(M[l.par]&&M[l.par].c!=null))o.push({p,pm,pb,l})})));return o};
  const reg=(m,w,r)=>{
    const rs=[r,r+m.B-1];m.kids.forEach(p=>rs.push(p.r,p.r+p.B-1));
    const r0=Math.min(...rs),r1=Math.max(...rs),Y=(row,y)=>(row-r0)*(H+2)+y,src=[],snk=[];
    m.kids.forEach(p=>{const many=p.B>1;   // every producer member has a lane to EVERY port of the consumer members (all-to-all, LANEMERGE); a port fed by several lanes = own tag per port, side-load (j). A shared producer has lanes for every consumer: only this consumer's (l.par) here
      p.mem.forEach((pm,pb)=>p.lanes.filter(l=>l.par===m.id).forEach(l=>{const cm=m.mem[l.ci];src.push({x:0,y:Y(p.r+pb,l.ya),item:many?cm.id+'@'+l.y:pm.id+'>'+cm.id,...(many?{j:true}:{})})}));
      m.mem.forEach((cm,cb)=>NB[cm.id].inR[p.pj[m.id]].forEach(y=>snk.push({x:w-1,y:Y(r+cb,y),item:many?cm.id+'@'+y:p.mem[0].id+'>'+cm.id})))});
    thru(m).forEach(({p,pm,pb,l})=>{const t='th:'+l.par+'@'+pm.id+'@'+l.y,y=Y(p.r+pb,l.ya);src.push({x:0,y,item:t});snk.push({x:w-1,y,item:t})});   // lanes of a shared producer for consumers placed later cross this region straight (tail drawn at finalize)
    if(src.length>w-3&&w<W)return{r0,r1,rt:{ok:false,why:'region too narrow'}};
    return{r0,r1,rt:cmpRoute({W:w,H,rowsN:r1-r0+1,mk,sources:src,sinks:snk,ugMax:def(ugc).maxApart,eastStart:true,join:true})};
  };
  for(const o of order){
    const gr=G[o.id],m={o,gr,id:o.id,B:gr.B,mem:gr.mem,kids:gr.kids.map(k=>M[k.o.id]),lanes:[],outRows:[]};M[o.id]=m;
    if(o.parents&&o.parents.length){
      m.pj={};   // lanes out of the pool: one per consumer port (of EVERY consumer), leaving at the port's own row when free, else the nearest free row (near rule of cmp_groups.js 70)
      const used=new Set(),near=y0=>{for(let q=0;q<H;q++)for(const y of[y0-q,y0+q])if(y>=0&&y<=H-1&&!used.has(y)){used.add(y);return y}};
      o.parents.forEach(pid=>{const pj=m.pj[pid]=G[pid].o.rec.i.findIndex(([it])=>it===o.key);G[pid].mem.forEach((cm,ci)=>NB[cm.id].inR[pj].slice().sort(asc).forEach(y=>m.lanes.push({ci,y,ya:near(y),par:pid,id:o.id+'#'+m.lanes.length})))});
      if(m.lanes.length>H-2)return no('rb: shared producer '+o.item+' feeds '+m.lanes.length+' consumer ports (one belt each) in '+o.parents.reduce((a,p)=>a+G[p].mem.length,0)+' consumer blocks; more than '+(H-2)+' lanes per producer block: needs row-local partitioning of producer blocks to consumer ports (not built)');
      const mu=new Map(),pk0=l=>l.ci+','+l.y+','+l.par;m.lanes.forEach(l=>mu.set(pk0(l),(mu.get(pk0(l))||0)+1));   // lane demand weight as cmp_groups.js 71: machines on its port / lanes sharing the port
      const ix=m.lanes.map((l,i)=>i).sort((a,b)=>m.lanes[a].ya-m.lanes[b].ya);
      m.outRows=ix.map(i=>m.lanes[i].ya);
      m.wt=ix.map(i=>{const l=m.lanes[i];return(((NB[G[l.par].mem[l.ci].id].lanes.find(q=>q.y===l.y&&q.key===o.key)||{}).m)||1)/mu.get(pk0(l))});
    }
    if(o.raw){if(hubOwn){m.dI=cmpDockHub(DK,{kind:'in',name:o.item,D:o.rate,rows:m.outRows,H,dh:d.h,j:0});if(m.dI.ok===false)return no('rb: '+o.item+' dock hub: '+m.dI.why)}
      const h=cmpPool({W,H,mk,bx,item:o.key,raw:true,inRows:[],outRows:m.outRows,...(m.dI||{})});if(h.ok===false)return no('rb: '+o.item+' supplier: '+h.why);m.pk={ok:true,nPhys:1,colP:[0],colX:[0],colW:[W]};m.defer=true;continue}   // raw supplier of a merge node: one SRC block (docks: own block at gx=0, placed by the consumer)
    const o0=m.mem[0],NB0=NB[o0.id],z0=tz.by[o0.id];let pk;
    const isRoot=!(o.parents&&o.parents.length),hb=hubOwn&&!m.kids.length;   // hb: leaf module with a raw hub block at gx=0 (hub[b] = member b's hub builder, .rows = its lane rows)
    if(hb){m.hub=mkHub(m,()=>0);m.hub.forEach((f,b)=>{const q=m.mem[b];if(q.inKind==='src')f.rows=NB[q.id].inR[0];else{const bz=NB[q.id].b,sets=bz.iface.sets.map((s,i)=>({o:s.o,n:s.n,t:bz.ports&&bz.ports.in?bz.ports.in.filter(p=>p.set===i).map(p=>p.y):null})).filter(s=>s.n>0),M=bz.iface.M;f.rows=sets.flatMap(s=>q.rec.i.flatMap((_,r)=>Array.from({length:M},(_,c)=>(s.t?s.t[r]:s.o+r*M)+c)))}})}   // dock hub builders; j (DOCKCLEAR key) is the final block row: rebuilt at finalize
    if(DK&&DK.out&&isRoot){m.dO=m.mem.map(q=>cmpDockHub(DK,{kind:'out',name:q.item,D:q.rate,rows:cmpMerge(NB[q.id].outRows,NB[q.id].outN,NB[q.id].gOut).rows,H,dh:d.h,tree:1,j:0}));if(m.dO.some(v=>v.ok===false))return no('rb: '+o.item+' dock hub: '+m.dO.find(v=>v.ok===false).why)}
    const dk=m.kids.filter(p=>p.defer&&p.c==null),kp=m.kids.filter(p=>p.c!=null);   // dk: leaf producers (raw supplier, one consumer) are placed WITH this module, adjacent west of its IN column
    const rowWant=(kp.length?Math.round(kp.reduce((s,p)=>s+p.r*p.o.N,0)/kp.reduce((s,p)=>s+p.o.N,0)):0)+(x.bias|0);   // flow-weighted mean block row of the placed producers
    const tent=r=>{let y=r+m.B;dk.forEach(p=>{p.r=y;y+=p.B})};
    const th0=m.kids.length?thru(m):[],clash=(r,t)=>t.p.r+t.pb>=r&&t.p.r+t.pb<=r+m.B-1;let rP=rowWant;while(th0.some(t=>clash(rP,t)))rP++;   // pack sizing at a row that does not collide with crossing lanes
    tent(rP);
    if(m.kids.length)pk=rbPack({W,H,mk,dw:d.w,fb:{b:NB0.b,bi:NB0.bi},inF:w=>{const r=reg(m,w,rP);return r.rt.ok?{ok:true,items:r.rt.items}:{ok:false,why:r.rt.why||'merge routing failed'}},poolF:(w,rows)=>poolOf(o0,w,rows,m.wt,m.dO&&m.dO[0]),outRows:m.outRows,flush:!!m.dO});
    else pk=rbPackNode(o0,z0,NB0,{block,bx,W,H,mk,outRows:m.outRows,dw:d.w,noIn:hb,flush:!!m.dO,dO:m.dO&&m.dO[0]});
    if(!pk.ok)return no('rb: '+o.item+': '+pk.why);
    m.pk=pk;
    if(!m.kids.length&&o.parents&&o.parents.length===1){m.defer=true;continue}
    const th=th0,own=[];kp.forEach(p=>p.mem.forEach((pm,pb)=>p.lanes.filter(l=>l.par===m.id).forEach(l=>own.push({p,pb,l}))));
    const ownIds=new Set(own.map(a=>a.l.id)),okIds=new Set([...ownIds,...th.map(t=>t.l.id)]),c0=Math.max(hb?1:0,...kp.map(p=>p.c+p.pk.nPhys),...own.map(a=>fr(a.p,a.l)+1),...dk.map(p=>p.pk.nPhys+(hubOwn&&!p.o.raw?1:0)));let hit=false;   // docks: gx=0 holds raw hubs only
    for(const cd of rbCandidates(c0,rowWant,24)){
      if(Date.now()-t0>15000)return no('rb: time');
      const {c,r}=cd;
      if(th.some(t=>clash(r,t)))continue;   // a lane crossing this module must run through a hull block, not through a member row
      const lcells=[],taken=new Set();let okL=true;
      for(const p of dk){   // leaf producer: first free spot r, r+1, r-1.. adjacent west of the IN column (lane without corridor)
        const n=p.pk.nPhys;let ok=false;
        for(const dr of[0,1,-1,2,-2,3,-3,4,-4]){
          const cs=[],ln=[],rawHub=hubOwn&&p.o.raw;   // docks: a raw supplier is the SRC hub itself at gx=0 (lane crosses corridor blocks to this IN column); a leaf module gets its hub at gx=0 on each member row
          if(rawHub){cs.push({gx:0,gy:r+dr,dx:0,dy:0});p.lanes.filter(l=>l.par===m.id).forEach(l=>ln.push([0,c,r+dr,l.ya]))}
          else{for(let pc=0;pc<n;pc++)for(let b=0;b<p.B;b++)cs.push({gx:c-n+pc,gy:r+dr+b,dx:pc,dy:b});
            if(hubOwn)for(let b=0;b<p.B;b++){cs.push({gx:0,gy:r+dr+b,dx:-1,dy:b});p.hub[b].rows.forEach(y=>ln.push([0,c-n,r+dr+b,y]))}}
          if(g.free(cs,ownIds)&&cs.every(q=>!taken.has(q.gx+','+q.gy))){cs.forEach(q=>taken.add(q.gx+','+q.gy));lcells.push({p,cs,ln,rawHub});p.r=r+dr;ok=true;break}
        }
        if(!ok){okL=false;break}
      }
      if(!okL)continue;
      const rg=m.kids.length?reg(m,pk.colW[0],r):null;
      if(rg&&!rg.rt.ok)continue;
      const cells=[];
      for(let pc=0;pc<pk.nPhys;pc++){const rs=new Set();for(let b=0;b<m.B;b++)rs.add(r+b);if(rg&&pc===pk.colP[0])for(let y=rg.r0;y<=rg.r1;y++)rs.add(y);rs.forEach(y=>cells.push({gx:c+pc,gy:y,dx:pc,dy:y-r}))}
      if(hb)for(let b=0;b<m.B;b++)cells.push({gx:0,gy:r+b,dx:-1,dy:b});   // own raw hub blocks (gx=0)
      const lan=own.map(a=>[fr(a.p,a.l),c,a.p.r+a.pb,a.l.ya]).concat(th.map(t=>[fr(t.p,t.l),c,t.p.r+t.pb,t.l.ya]),...lcells.map(a=>a.ln),hb?m.hub.flatMap((f,b)=>f.rows.map(y=>[0,c,r+b,y])):[]);   // crossing lanes also claim the corridor blocks between their last reached column and this module; docks: raw hub lanes (gx=0 -> module)
      if(!g.free(cells,okIds)||!lan.every(a=>g.laneFree(...a)&&![...Array(Math.max(0,a[1]-a[0]-1)).keys()].some(i=>taken.has((a[0]+1+i)+','+a[2]))))continue;   // a lane must not run through a block just taken by a leaf supplier
      g.claim(m,cells,okIds);lan.forEach(a=>g.laneClaim(...a));ownIds.forEach(i=>g.unreserve(i));
      lcells.forEach(({p,cs,rawHub})=>{g.claim(p,cs,okIds);p.c=rawHub?0:c-p.pk.nPhys;p.cells=cs});
      th.forEach(t=>{t.l.from=c});
      Object.assign(m,{c,r,cells,rg,thr:th.map(t=>({row:t.p.r+t.pb,y:t.l.ya}))});
      m.lanes.forEach(l=>{if(!M[l.par]||M[l.par].c==null)for(let pb=0;pb<m.B;pb++)g.reserve(m.c+m.pk.nPhys-1,m.r+pb,l.id)});   // east lane reservation: later modules keep off this row
      hit=true;break;
    }
    if(!hit){globalThis.__rbDbg={occ:[...g.occ].map(([k,v])=>k+' '+v.mod.o.item),cor:[...g.cor.keys()],kids:m.kids.map(p=>p.o.item+' c'+p.c+' r'+p.r+' B'+p.B+' n'+p.pk.nPhys),c0,rowWant};return no('rb: no spot for '+o.item)}
  }
  // ---- finalize
  const keys=[...g.occ.keys(),...g.cor.keys()].map(k=>k.split(',').map(Number)),gy0=Math.min(...keys.map(k=>k[1])),ms=[],routed=[],nodes=[];
  if(DK)DK.notes.length=n0;   // placement notes are redone below with the final block rows (j of the DOCKCLEAR keys)
  for(const m of order.map(o=>M[o.id])){
    if(DK){const j0=m.r-gy0;   // industrial: hub / OZ dock plans keyed by final block row (CMP_NODK)
      if(m.o.raw&&hubOwn){m.dI=cmpDockHub(DK,{kind:'in',name:m.o.item,D:m.o.rate,rows:m.outRows,H,dh:d.h,j:j0});if(m.dI.ok===false)return no('rb: '+m.o.item+' dock hub: '+m.dI.why)}
      if(m.hub)m.hub=mkHub(m,b=>j0+b);
      if(m.dO){m.dO=m.mem.map((q,b)=>cmpDockHub(DK,{kind:'out',name:q.item,D:q.rate,rows:cmpMerge(NB[q.id].outRows,NB[q.id].outN,NB[q.id].gOut).rows,H,dh:d.h,tree:1,j:j0+b}));if(m.dO.some(v=>v.ok===false))return no('rb: '+m.o.item+' dock hub: '+m.dO.find(v=>v.ok===false).why)}}
    const pk=m.pk,pX=q=>(m.c+pk.colP[q])*TW+pk.colX[q]-pk.colP[q]*FC;
    const put=(items,X,Y,ct,tag,hx)=>items.forEach(b=>{const q={...b,x:b.x+X,y:b.y+Y,...(hx!=null&&b.dk?{hx,hw:W,hu:d.w,hc:hx/TW}:{})};ms.push(q);if(tag)tag.push(q);if(ct&&b.ct)ct.push(q.x+','+q.y)});   // hx: block origin cell x of a dock hub piece (cmpDockApply reads hx/hw/hu/hc)
    if(m.rg)put(m.rg.rt.items,pX(0),(m.rg.r0-gy0)*TH,null,routed);
    (m.thr||[]).forEach(t=>{for(let xx=pk.colW[0];xx<W;xx++)ms.push({cls:PLC_BELT[mk],x:m.c*TW+xx,y:(t.row-gy0)*TH+t.y,h:0,rot:0,pid:0})});   // tail of a crossing lane east of the IN piece
    if(m.o.raw){put(cmpPool({W,H,mk,bx,item:m.o.key,raw:true,inRows:[],outRows:m.outRows,...(m.dI||{})}).items,pX(0),(m.r-gy0)*TH,null,null,m.dI?m.c*TW:null);continue}
    for(let b=0;b<m.mem.length;b++){
      const q=m.mem[b],Y=(m.r+b-gy0)*TH,n=NB[q.id],ct=[],bz=n.b,w=pk.colW[1],fit=w===W||w===bz.w?n.bi:cmpShr(bz,mk,w);
      if(!fit)return no('rb: shrink failed ('+m.o.item+')');
      if(m.hub){const h=m.hub[b](W);if(h.ok===false)return no(h.why);put(h.items,0,Y,null,null,0)}   // docks: own raw hub block at gx=0
      else if(!m.kids.length){const h=rbNodeIn(q,tz.by[q.id],n,{block,bx,H,mk})(pk.colW[0]);if(h.ok===false)return no(h.why);put(h.items,pX(0),Y,ct)}
      put(fit,pX(1),Y);
      const h=poolOf(q,pk.colW[2],m.outRows,m.wt,m.dO&&m.dO[b]);if(h.ok===false)return no(h.why);put(h.items,pX(2),Y,ct,null,m.dO?(m.c+pk.colP[2])*TW:null);
      nodes.push({id:q.id,item:q.item,key:q.key,rate:q.rate,lanes:n.lanes,outRows:n.outRows,rec:rk(q.rec),N:q.N,pN:m.o.N,util:q.util,pU:q.util,gx:m.c+pk.colP[1],gy:(m.r+b-gy0)*d.h,inCol:m.hub?0:m.c+pk.colP[0],pool:m.c+pk.colP[2],row:m.r+b-gy0,fb:{x:pX(1),y:Y,w,h:H},ct,kind:q.inKind});
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
  const rc=routed.map(q=>({x:q.x,y:q.y,cls:q.cls}));   // copies (after the wall swap): cmpDockApply shifts ms and routed separately
  if(DK){const r=cmpDockApply({cls,mk},T,{nodes,routed:rc});if(!r.ok)return no(r.why);return{ok:true,T,nodes,routed:rc,rb:{mods,ascii},dock:r}}
  return{ok:true,T,nodes,routed,rb:{mods,ascii}};
}
