// ---- floor model: block floors + doors (per layer). Door = 6 wide, 2 deep, 4 cells from the wall, one per 14-cell segment per side
const DOORW=6,DOFF=4,EN=["E","S","W","N"];
const dv=b=>{const d=def(b.cls);return !!(d&&d.door&&d.door.verified)};
function floorRect(b){
  const d=def(b.cls);if(!d||d.nofloor)return null;   // nofloor: shipyard blocks, BPO_Dock (callers handle null)
  const o=dim(b),known=d.fw!=null&&d.fh!=null;
  // catalog floor "14x30" for a 2x1 block: long side follows the block's long axis
  const lo=known?Math.min(d.fw,d.fh):0,hi=known?Math.max(d.fw,d.fh):0;
  const f=!known?{w:FC*o.w-2,h:FC*o.h-2}:o.w===o.h?dimOf({w:d.fw,h:d.fh},b.rot):o.w>o.h?{w:hi,h:lo}:{w:lo,h:hi};
  const q=d.floorInset||0;   // elevator: 12x12 buildable inside the 14x14 shell (1-cell input ring)
  return{x:b.x*FC+q,y:b.y*FC+q,w:f.w,h:f.h,known,guess:known&&!!d.floor&&d.floor.verified===false,b};
}
const elvRect=b=>{const d=def(b.cls),r=d&&d.elevator&&floorRect(b);return r?{x:r.x+((r.w-d.elevator.w)>>1),y:r.y+((r.h-d.elevator.h)>>1),w:d.elevator.w,h:d.elevator.h,b}:null};
function areas(L){
  const fb=[],floors=[],doors=[],gaps=[],blocked=[],own=new Map();
  S.blocks.filter(b=>b.h===L&&!isM(b)).forEach(b=>{
    const r=floorRect(b);if(!r)return;
    const f={b,d:dim(b),r};r.cuts=[[],[],[],[]];r.wcuts=[[],[],[],[]];floors.push(r);fb.push(f);   // cuts: ring floor in door slots; wcuts: band cut only where a door passage joins two blocks
    for(let i=0;i<f.d.w;i++)for(let j=0;j<f.d.h;j++)own.set((b.x+i)+","+(b.y+j),f);
    const e=elvRect(b);if(e)blocked.push(e);
  });
  fb.forEach(f=>{const{b,d,r}=f,QI=(def(b.cls)||{}).floorInset||0;   // QI: floor inset inside the shell (elevator 1)
    for(let ed=0;ed<4;ed++){if(SHIPEND(b)&&ed!==(b.rot+2)%4)continue;   // ship side and short sides: no doors
      const v=ed%2===0,n=v?d.h:d.w;
      for(let k=0;k<n;k++){
        const t0=(v?r.y:r.x)+FC*k+DOFF-QI,ex=ed===0?r.x+r.w+QI:ed===2?r.x-QI-DW:t0,ey=ed===1?r.y+r.h+QI:ed===3?r.y-QI-DW:t0;
        r.cuts[ed].push([t0,t0+DOORW]);
        const nf=own.get((ed===0?b.x+d.w:ed===2?b.x-1:b.x+k)+","+(ed===1?b.y+d.h:ed===3?b.y-1:b.y+k));
        if(nf&&nf!==f)r.wcuts[ed].push([t0,t0+DOORW]);   // passage between two real blocks: both walls open here
        if(nf&&nf!==f&&ed>1)continue;   // the E/S side owns the shared door (gap strip + door)
        const p=nf&&nf!==f,sp=DW;   // door = the 2-cell passage between the two walls only
        if(p)gaps.push(v?{x:ex,y:r.y+FC*k,w:sp,h:FC}:{x:r.x+FC*k,y:ey,w:FC,h:sp});
        const key=`${L}|${b.x}|${b.y}|${EN[ed]}|${k}`;
        doors.push({key,open:!S.closed.includes(key),paired:!!p,ver:dv(b)&&(!p||dv(nf.b)),ed,bx:b.x,by:b.y,k,x:ex,y:ey,w:v?sp:DOORW,h:v?DOORW:sp,
          lg:p?(ed===0?`${L}|${b.x+d.w}|${Math.max(b.y,nf.b.y)}|V`:`${L}|${Math.max(b.x,nf.b.x)}|${b.y+d.h}|H`):null});
      }
    }
  });
  return{floors,doors,gaps,blocked,rects:floors.concat(doors.filter(d=>d.open&&d.paired))};
}
// elevator shaft (blocked 4x4 centre): machines may not overlap it
let STRICT=true;   // Settings: keep buildables on the floor (no outside / across walls); overlaps are always refused
const hitR=(i,e)=>i.x<e.x+e.w&&i.x+i.w>e.x&&i.y<e.y+e.h&&i.y+i.h>e.y;
function noBuild(it){const c={},ids=new Set(it.map(i=>i.id).filter(x=>x!=null));
  return it.some(i=>{const a=c[i.l]=c[i.l]||areas(i.l);
    if(a.blocked.some(e=>hitR(i,e)))return true;
    if(i.id==null)return false;   // preview-only probes without id: shaft check only
    if(STRICT&&!onArea(i.x,i.y,i.w,i.h,a.rects))return true;
    return S.blocks.some(o=>o.h===i.l&&isM(o)&&!ids.has(o.id)&&!(i.belt&&isBelt(o))&&hitR(i,mItem(o)))})}
const mItem=b=>{const d=dim(b);return{id:b.id,x:b.x,y:b.y,w:d.w,h:d.h,l:b.h,belt:isBelt(b)}};
const NOBUILD="Cannot build here: overlap, elevator shaft, or off the floor / across a wall";
function onArea(x,y,w,h,R){
  for(let i=x;i<x+w;i++)for(let j=y;j<y+h;j++)
    if(!R.some(r=>i>=r.x&&i<r.x+r.w&&j>=r.y&&j<r.y+r.h))return false;
  return true;
}
const outside=(b,R)=>{const d=dim(b);return !onArea(b.x,b.y,d.w,d.h,R)};
const WARN="Not fully on the buildable floor (block floors + open doors). Allowed, but may not work in game";
// underground belts: entrance+exit = two UG machines of the same class/height/rotation on one line. Per line, sorted along the flow, pair 1+2, 3+4 ...
// (skip a tile whose follower is too far when the next one is in range). n = cells entrance..exit inclusive; the game limit is d.maxApart (Mk max length).
function ugPairs(ms){
  const g=new Map(),out=[];
  ms.forEach(u=>{const d=def(u.cls);if(!d||d.category!=="Undergrounds")return;const[dx]=DIR[u.rot],k=[u.cls,u.h,u.rot,dx?u.y:u.x].join("|");(g.get(k)||g.set(k,[]).get(k)).push(u)});
  g.forEach(l=>{
    const[dx,dy]=DIR[l[0].rot],pos=u=>dx?u.x*dx:u.y*dy,mx=def(l[0].cls).maxApart;l.sort((a,b)=>pos(a)-pos(b));
    for(let i=0;i+1<l.length;i++){
      const n=pos(l[i+1])-pos(l[i])+1;
      if(n>mx&&i+2<l.length&&pos(l[i+2])-pos(l[i+1])+1<=mx)continue;
      out.push({u:l[i],t:l[i+1],n,max:mx});i++;
    }
  });
  return out;
}
function ugWarn(){
  const out=new Map();
  ugPairs(S.blocks.filter(isM)).forEach(({u,t,n,max})=>{if(n>max)out.set(u.id,{n,max,to:t})});
  return out;
}
// ---- ports: {face N/E/S/W relative to machine rotation, index along face, enabled}; layout per type (guessed), enabled per placed machine (b.off = disabled keys, b.xp = unknown pass-through)
const FN=["N","E","S","W"],NRM=[[0,-1],[1,0],[0,1],[-1,0]];
function portsOf(b){
  const d=def(b.cls);let L=d&&d.portsLayout,ox=b.x,oy=b.y,W=d&&d.w,H=d&&d.h;
  if(d&&d.elevator){const r=floorRect(b);if(!r)return[];L=d.elevator.portsLayout;ox=r.x;oy=r.y;W=r.w;H=r.h}   // elevator: belt ports on the inner wall of the 12x12 floor; the cell outside a port is the input ring
  if(!L||!Array.isArray(L.ports))return[];
  const off=b.off||[],o=[];
  L.ports.forEach((q,i)=>{
    const f=q.face,fi=FN.indexOf(f);if(fi<0)return;
    const len=fi&1?H:W,ET=DOFF-((d&&d.floorInset)||0),c=q.pos==='start'?ET:q.pos==='end'?ET+DOORW-1:Math.max(0,Math.min(len-1,(parseInt(q.pos,10)||1)-1));   // door slot ends (elevator)
    let x=fi===1?W-1:fi===3?0:c,y=fi===2?H-1:fi===0?0:c,w=W,h=H,nx=NRM[fi][0],ny=NRM[fi][1];
    for(let r=0;r<(b.rot&3);r++){[x,y]=[h-1-y,x];[w,h]=[h,w];[nx,ny]=[-ny,nx]}
    const key=f+i,tg=!!L.toggleable;o.push({key,f,i,pos:q.pos,dir:q.dir||null,tg,en:!tg||!off.includes(key),wf:(fi+(b.rot&3))%4,x:ox+x,y:oy+y,nx,ny,line:!!L.line});
  });
  return o;
}
const togglePort=(b,k)=>{if(!portsOf(b).some(p=>p.key===k&&p.tg))return;const o=b.off||[];b.off=o.includes(k)?o.filter(q=>q!==k):o.concat(k)};
function portAt(p){
  const s=sc();if(s<14)return null;
  const fx=(p.x-V.ox)/s,fy=(p.y-V.oy)/s;let best=null,bd=9;
  S.blocks.forEach(b=>{if(b.h!==layer)return;portsOf(b).filter(q=>q.tg).forEach(q=>{
    const ex=q.x+.5+q.nx*.5,ey=q.y+.5+q.ny*.5,dn=(fx-ex)*q.nx+(fy-ey)*q.ny,dt=q.nx?fy-ey:fx-ex;
    if(dn>=-.35&&dn<=.25&&Math.abs(dt)<=.35){const dd=Math.hypot(fx-ex,fy-ey);if(dd<bd){bd=dd;best={b,p:q}}}
  })});
  return best;
}
function flowLoad(next,src,cap,sp){
  const o=new Map();
  const walk=(id,item,rate,seen)=>{
    for(let i=id;i!=null&&!seen.has(i);i=next.get(i)){seen.add(i);
      let e=o.get(i);if(!e){e={items:new Map(),tot:0,cap:cap.get(i)||null,util:null,mixed:false};o.set(i,e)}
      e.items.set(item,(e.items.get(item)||0)+rate);e.tot+=rate;
      const outs=sp&&sp.get(i);if(outs&&outs.length){outs.forEach(b=>walk(b,item,rate/outs.length,new Set(seen)));return}}};   // splitter/balancer: even split over enabled outputs
  src.forEach(({id,item,rate})=>walk(id,item,rate,new Set()));
  o.forEach(e=>{e.mixed=e.items.size>1;e.util=e.cap?e.tot/e.cap:null});
  return o;
}
const r2=v=>Math.round(v*100)/100;
function storeInfo(m,K){
  const st=(def(m.cls)||{}).stats||{},slots=st.StoresItems||null,stack=st.StackSize||null,ct=m.ct||[];
  const inM=new Map(),outM=new Map();
  K.push.forEach(x=>{if(x.m!==m)return;const l=K.load.get(x.belt.id);if(l)l.items.forEach((v,k)=>inM.set(k,(inM.get(k)||0)+v))});
  K.pull.forEach(x=>{if(x.m===m)outM.set(x.item,(outM.get(x.item)||0)+x.rate)});
  const keys=new Set([...ct.map(x=>x.item),...inM.keys(),...outM.keys()]);
  const rows=[...keys].map(k=>{const c=ct.find(x=>x.item===k)||{n:0,inf:false},i=r2(inM.get(k)||0),o=r2(outM.get(k)||0),net=r2(i-o);
    return{item:k,n:c.n,inf:!!c.inf,in:i,out:o,net,toEmpty:!c.inf&&net<0&&c.n>0?r2(c.n/-net):null}});
  const sum=f=>r2(rows.reduce((a,r)=>a+r[f],0)),fin=rows.filter(r=>!r.inf);
  const have=fin.reduce((a,r)=>a+r.n,0),used=stack?fin.reduce((a,r)=>a+Math.ceil(r.n/stack),0):null,cap=slots&&stack?slots*stack:null,net=sum("net");
  return{slots,stack,used,cap,have,rows,in:sum("in"),out:sum("out"),net,toFull:cap&&net>0&&have<cap?r2((cap-have)/net):null};
}
const supplySt=(need,have)=>!(have>0)?"none":have+1e-9>=need?"ok":"short";
function supplyRows(m,K){const r=recOf(m),s=K.sup.get(m.id)||new Map();return r?r.i.map(x=>{const need=pm(x[1],r.t)||0,have=r2(s.get(x[0])||0);return{item:x[0],need,have,st:supplySt(need,have)}}):[]}
// ---- informational link model (floor view, one layer; no rules, nothing blocked)
let LK=true;
const isBelt=b=>{const d=def(b.cls);return !!(d&&d.directional&&(d.category==="Conveyors"||d.category==="Undergrounds"))};
const isStore=b=>!!(isM(b)&&def(b.cls)&&def(b.cls).category==="Storage");
const ctFirst=b=>(b.ct||[]).find(x=>x.inf||x.n>0)||null;
const nameOf=b=>{const d=def(b.cls);return (d?lab(d):shortCls(b.cls))+" @"+b.x+","+b.y};
function links(L){
  const ms=S.blocks.filter(b=>b.h===L&&isM(b)),belts=ms.filter(isBelt),occ=new Map();
  ms.forEach(b=>{const d=dim(b);for(let i=0;i<d.w;i++)for(let j=0;j<d.h;j++)occ.set((b.x+i)+","+(b.y+j),b)});
  // 0) splitter/balancer OUTPUT port touching another machine's matching enabled port directly (no belt between): synthetic 1-cell belt (negative id, never in S.blocks) so sim + estimate treat it as a belt
  const vb=[];
  ms.forEach(sp=>{const c=(def(sp.cls)||{}).category;if(c!=="Splitters"&&c!=="Balancers")return;
    portsOf(sp).forEach(p=>{if(!p.en||p.dir==="in")return;const tx=p.x+p.nx,ty=p.y+p.ny,t=occ.get(tx+","+ty);if(!t||t===sp||isBelt(t))return;
      const q=portsOf(t).find(q=>q.en&&q.dir!=="out"&&q.x===tx&&q.y===ty&&q.nx===-p.nx&&q.ny===-p.ny);if(!q)return;
      vb.push({v:{id:-(sp.id*4+p.i+1),cls:"__v",x:tx,y:ty,h:L,rot:DIR.findIndex(d=>d[0]===p.nx&&d[1]===p.ny)},sp,p,t,q})})});
  vb.forEach(e=>belts.push(e.v));
  const o={ports:[],off:[],flow:[],ug:[],nb:new Map(),mach:new Map()};
  const nb=(a,b,k,p)=>{if(!o.nb.has(a.id))o.nb.set(a.id,[]);const l=o.nb.get(a.id);let e=l.find(e=>e.b===b&&e.k===k);if(!e){e={b,k,ps:[]};l.push(e)}if(p)e.ps.push(p)};
  const par=new Map(belts.map(b=>[b.id,b.id])),root=i=>{while(par.get(i)!==i)i=par.get(i);return i},uni=(a,b)=>par.set(root(a.id),root(b.id));
  // 1) machine <-> belt: only an ENABLED port facing a belt cell links; a disabled one facing a belt only gets a red tick
  ms.filter(m=>!isBelt(m)).concat(S.blocks.filter(b=>b.h===L&&!isM(b)&&def(b.cls)&&def(b.cls).elevator)).forEach(m=>portsOf(m).forEach(p=>{
    const bx=p.x+p.nx,by=p.y+p.ny,t=occ.get(bx+","+by);if(!t||t===m||!isBelt(t))return;
    const e={b:t,m,bx,by,mx:p.x,my:p.y,port:p};
    if(p.en){o.ports.push(e);nb(t,m,"port",p);nb(m,t,"port",p)}else o.off.push(e);
  }));
  vb.forEach(({v,sp,p,t,q})=>{o.ports.push({b:v,m:sp,bx:v.x,by:v.y,mx:p.x,my:p.y,port:p},{b:v,m:t,bx:v.x,by:v.y,mx:q.x,my:q.y,port:q})});
  // 2) belt -> belt in facing direction (chain / T-join merge)
  const inc=new Map(),fl=[];
  belts.forEach(u=>{const t=occ.get((u.x+DIR[u.rot][0])+","+(u.y+DIR[u.rot][1]));
    if(t&&t!==u&&isBelt(t)&&t.rot!==(u.rot+2)%4){fl.push({u,t});inc.set(t.id,(inc.get(t.id)||0)+1)}});
  fl.forEach(({u,t})=>{const side=t.rot!==u.rot;o.flow.push({u,t,merge:side&&inc.get(t.id)>1});uni(u,t);nb(u,t,"out");nb(t,u,"in")});
  // 3) underground pairs (ugPairs, same as the length warning)
  ugPairs(belts).forEach(({u,t})=>{o.ug.push({u,t});uni(u,t);nb(u,t,"pair");nb(t,u,"pair")});
  // chain -> machines
  belts.forEach(b=>{const r=root(b.id);if(!o.mach.has(r))o.mach.set(r,new Set())});
  o.ports.forEach(p=>o.mach.get(root(p.b.id)).add(p.m));
  o.chainMachines=b=>isBelt(b)?[...(o.mach.get(root(b.id))||[])]:[...new Set((o.nb.get(b.id)||[]).filter(e=>e.k==="port").flatMap(e=>[...o.mach.get(root(e.b.id))]))].filter(m=>m!==b);
  const nx=new Map(),src=[],cp=new Map();
  belts.forEach(b=>cp.set(b.id,beltMax(b)));
  o.flow.forEach(({u,t})=>nx.set(u.id,t.id));
  o.ug.forEach(({u,t})=>nx.set(u.id,t.id));
  o.ports.forEach(e=>{const r=recOf(e.m);if(!r)return;const d=DIR[e.b.rot],p=e.port;if(d[0]===-p.nx&&d[1]===-p.ny)return;   // belt feeding INTO this machine carries no output
    const v=pm(r.o[1],r.t);if(v)src.push({id:e.b.id,item:r.o[0],rate:v})});
  o.pull=[];o.push=[];
  o.ports.forEach(e=>{if(!isStore(e.m))return;const d=DIR[e.b.rot],p=e.port;
    if(!(d[0]===-p.nx&&d[1]===-p.ny)){const it=ctFirst(e.m),c=beltMax(e.b);if(it&&c){src.push({id:e.b.id,item:it.item,rate:c});o.pull.push({m:e.m,belt:e.b,item:it.item,rate:c})}}
    else if(d[0]===-p.nx&&d[1]===-p.ny)o.push.push({m:e.m,belt:e.b})});
  o.nx=nx;o.cp=cp;o.belts=belts;o.chain=id=>root(id);   // for the simulation snapshot
  const spR=new Map(),sp=new Map();
  o.ports.forEach(e=>{const c=(def(e.m.cls)||{}).category;if(c!=="Splitters"&&c!=="Balancers")return;const d=DIR[e.b.rot],p=e.port;
    let r=spR.get(e.m.id);if(!r){r={ins:[],outs:[]};spR.set(e.m.id,r)}
    if(d[0]===-p.nx&&d[1]===-p.ny&&p.dir!=="out")r.ins.push(e.b.id);else if(!(d[0]===-p.nx&&d[1]===-p.ny)&&p.dir!=="in")r.outs.push(e.b.id)});
  spR.forEach(r=>r.ins.forEach(i=>sp.set(i,r.outs)));
  o.load=flowLoad(nx,src,cp,sp);
  // unstocked container relays its inflow: each pull belt carries min(belt speed, inflow / pull belts), split by item share; 4 passes cover container->container chains
  const fed=o.ports.filter(e=>{const p=e.port,d=DIR[e.b.rot];return isStore(e.m)&&!ctFirst(e.m)&&!(d[0]===-p.nx&&d[1]===-p.ny)});
  for(let pass=0;pass<4&&fed.length;pass++){
    const rel=[];
    fed.forEach(e=>{const c=beltMax(e.b);if(!c)return;const inM=new Map();let tot=0;
      o.push.forEach(x=>{if(x.m!==e.m)return;const l=o.load.get(x.belt.id);if(l)l.items.forEach((v,k)=>{inM.set(k,(inM.get(k)||0)+v);tot+=v})});
      if(!(tot>0))return;const f=Math.min(c,tot/fed.filter(q=>q.m===e.m).length)/tot;
      inM.forEach((v,k)=>rel.push({id:e.b.id,item:k,rate:v*f,m:e.m,belt:e.b}))});
    o.pull=o.pull.filter(x=>!x.rel).concat(rel.map(r=>({m:r.m,belt:r.belt,item:r.item,rate:r.rate,rel:true})));
    o.load=flowLoad(nx,src.concat(rel),cp,sp);
  }
  o.sto=new Map();ms.filter(isStore).forEach(m=>o.sto.set(m.id,storeInfo(m,o)));
  o.sup=new Map();o.ports.forEach(e=>{if(isStore(e.m))return;const d=DIR[e.b.rot],p=e.port;if(d[0]!==-p.nx||d[1]!==-p.ny)return;
    const l=o.load.get(e.b.id);if(!l)return;let s=o.sup.get(e.m.id);if(!s){s=new Map();o.sup.set(e.m.id,s)}l.items.forEach((v,k)=>s.set(k,(s.get(k)||0)+v))});
  return o;
}
