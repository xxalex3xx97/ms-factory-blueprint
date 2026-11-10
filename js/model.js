// ---- floor model: block floors + doors (per layer). Door = 6 wide, 2 deep, 4 cells from the wall, one per 14-cell segment per side
const DOORW=6,DOFF=4,EN=["E","S","W","N"];
const dv=b=>{const d=def(b.cls);return !!(d&&d.door&&d.door.verified)};
const sideOpen=(b,ed)=>{const s=((def(b.cls)||{}).door||{}).sides;return !s||s.some(c=>(EN.indexOf(c)+(b.rot&3))%4===ed)};   // door.sides (block frame, E/S/W/N) -> world side after rot; no sides key = all sides
// door slots of floor block b on world side ed: [t0,t1] along that edge (same formula as areas()); none on the shipEnd side or on a closed side
function slotIvs(b,ed){const r=floorRect(b);if(!r||SHIPEND(b)&&ed===b.rot||!sideOpen(b,ed))return[];const d=def(b.cls),QI=d.floorInset||0,fo=fcell(b),v=ed%2===0,n=v?fo.ch:fo.cw,fl=d.door&&d.door.flush;
  return Array.from({length:n},(_,k)=>{const t0=(v?r.y:r.x)+FC*k+(fl?0:DOFF)-QI;return[t0,t0+DOORW]})}
// door passage between b and the floor block nb on b's world side ed: opens only where BOTH blocks have a door over the same slot (else the wall stays)
function passage(b,nb,ed){const o=slotIvs(nb,(ed+2)%4);return slotIvs(b,ed).some(([a,c])=>o.some(([p,q])=>a<q&&p<c))}
// door-match rule (catalog doorMatch, Corner/Corridor only): a pair where either block has it needs a door over the same slot on both sides; every other pair is a plain door passage
const matchRule=(b,nb)=>!!((def(b.cls)||{}).doorMatch||(def(nb.cls)||{}).doorMatch);
// floor block covering cell (x,y) on level L (cell units), or undefined
function floorAt(L,x,y){return S.blocks.find(o=>{if(o.h!==L||isM(o)||!floorRect(o))return false;const c=fcell(o);return x>=c.cx&&x<c.cx+c.cw&&y>=c.cy&&y<c.cy+c.ch})}
// floor cell box of a block (cell units): shipEnd = the end opposite the ship direction (rot); else the whole footprint
function fcell(b){const o=dim(b);if(!SHIPEND(b))return{cx:b.x,cy:b.y,cw:o.w,ch:o.h};const D=DIR[b.rot&3];return{cx:b.x+(D[0]<0?o.w-1:0),cy:b.y+(D[1]<0?o.h-1:0),cw:D[0]?1:o.w,ch:D[1]?1:o.h}}
function floorRect(b){
  const d=def(b.cls);if(!d||d.nofloor)return null;   // nofloor: shipyard blocks, BPO_Dock (callers handle null)
  const o=dim(b),known=d.fw!=null&&d.fh!=null,fo=fcell(b);
  // catalog floor "14x30" for a 2x1 block: long side follows the block's long axis
  const lo=known?Math.min(d.fw,d.fh):0,hi=known?Math.max(d.fw,d.fh):0;
  const f=SHIPEND(b)?dimOf({w:d.fw,h:d.fh},b.rot):!known?{w:FC*o.w-2,h:FC*o.h-2}:o.w===o.h?dimOf({w:d.fw,h:d.fh},b.rot):o.w>o.h?{w:hi,h:lo}:{w:lo,h:hi};
  const q=d.floorInset||0;   // elevator: 12x12 buildable inside the 14x14 shell (1-cell input ring)
  // floorCenter (corridor only): strip centred in the tile with the station hull convention (station floor = tile origin, hull 1 unit outside it): top-left = tile + ((16-w)>>1) - 1
  const c=d.floorCenter?[((FC*fo.cw-f.w)>>1)-1,((FC*fo.ch-f.h)>>1)-1]:[0,0];
  return{x:fo.cx*FC+q+c[0],y:fo.cy*FC+q+c[1],w:f.w,h:f.h,known,guess:known&&!!d.floor&&d.floor.verified===false,b};
}
// real hull silhouette (shapes.js, floor frame: origin = floor top-left, rot 0 = ship side east) -> floor-unit coords of the block's floor rect, rotated by b.rot about the floor corner
// nofloor block (solar, turret, drone bay): its own tile is the shape frame (origin = tile top-left); no floor, no buildable area
function nfRect(b){const d=def(b.cls);if(!d||!d.nofloor||!SHAPES[d.name])return null;const o=dim(b);return{x:b.x*FC,y:b.y*FC,w:FC*o.w,h:FC*o.h,b}}
// NFQ (only no-floor blocks WITH ports or a door gap: drone bays, Command Module, Blueprint Unit, shipyards): the site draws a station floor at tile cells 0..14 (floorRect = tile origin), the real floor is 1..15 (hull wall 1 thick: Station_01 floorOrigin -7 vs hull -8). A no-floor block's shape sits in the REAL tile frame, so it is moved by the same (-NFQ,-NFQ) to line up with the neighbours as the site draws them; world frame, no rot dependence (floorRect has none).
// A block with output ports keeps its ports ON the tile edge: the shift component normal to the ports side is dropped (only the along-edge part, which centres the ports on the neighbour's door slot, stays).
const NFQ=1;
// shipyard chain: block-frame edges (shape.chain.closing keys N/S) of a Side/Core/Core Mk.2 that have NO attached block of the group (same level, same rot, footprint covers the adjacent cell) -> those edges get a closing wall
function chainOpenEdges(b){const d=def(b.cls),sh=d&&SHAPES[d.name],ch=sh&&sh.chain;if(!ch)return[];const o=dim(b),rot=b.rot&3;
  return Object.keys(ch.closing).filter(k=>{const D=DIR[(EN.indexOf(k)+rot)&3],cx=D[0]>0?b.x+o.w:D[0]<0?b.x-1:b.x,cy=D[1]>0?b.y+o.h:D[1]<0?b.y-1:b.y;
    return !S.blocks.some(n=>{if(n===b||n.h!==b.h||(n.rot&3)!==rot)return false;const nd=def(n.cls),ns=nd&&SHAPES[nd.name];if(!ns||!ns.chain||ns.chain.group!==ch.group)return false;const q=dim(n);
      return D[0]?(cy>=n.y&&cy<n.y+q.h&&cx>=n.x&&cx<n.x+q.w):(cx>=n.x&&cx<n.x+q.w&&cy>=n.y&&cy<n.y+q.h)})})}
function shapeTf(b){const fl=floorRect(b),r=fl||nfRect(b),d=def(b.cls),sh=r&&d&&SHAPES[d.name];if(!sh)return null;
  const f0=(u,v)=>{let x=u,y=v,W=b.rot&1?r.h:r.w,H=b.rot&1?r.w:r.h;for(let i=0;i<(b.rot&3);i++){[x,y]=[H-y,x];[W,H]=[H,W]}return[r.x+x,r.y+y]};   // unrotated shape-frame size: rot 1/3 swap the rotated floor's w/h
  if(fl)return{sh,f:f0,f0};
  const gp=sh.gaps&&sh.gaps.length,pt=sh.entrance&&sh.entrance.kind==="ports"&&sh.ports.length;
  if(!pt&&!gp)return{sh,f:f0,f0};   // no ports and no door (solar, turret, armour): exact tile placement, no shift
  return{sh,f0,f:(u,v)=>{const[p,q]=f0(u,v);return[p-NFQ,q-NFQ]}}}   // f0 = unshifted (real tile frame), f = site floor model frame (Factory floor): every shaped block (ports or door gap) takes the full (-1,-1) like the neighbouring floor blocks
// entrances (Layout marks + inspector): real door slots (same geometry as areas(): per cell along each open side of the floor cell box, none on the dock's ship side)
// or, for a no-floor shaped block whose SHAPES entry says entrance.kind==="ports", the side of its output ports. Points in cell units on the footprint edge; ed = world edge 0..3 (E,S,W,N)
// real=true (Layout): TRUE block-frame positions (door slot +NFQ along the edge = middle of a station tile edge; ports on the real tile edge, f0); default = site floor model positions
function entrances(b,real){
  const d=def(b.cls),sh=d&&SHAPES[d.name],o=[];if(!d)return o;
  if(!floorRect(b)&&sh&&sh.gaps){const t=shapeTf(b);if(!t)return o;   // no-floor doors (Command Module, shipyards): one mark per gap, at the gap centre on the block edge; rot maps the block-frame side to a world side
    sh.gaps.forEach(g=>{const[p,q]=t.f0((g[1]+g[3])/2,(g[2]+g[4])/2);o.push({ed:(EN.indexOf(g[0])+(b.rot&3))%4,x:p/FC,y:q/FC,port:false})});return o}
  if(floorRect(b)&&dv(b)){const fo=fcell(b),r=floorRect(b),QI=d.floorInset||0,fl=d.door&&d.door.flush,nq=real?NFQ:0;
    for(let ed=0;ed<4;ed++){if(SHIPEND(b)&&ed===b.rot||!sideOpen(b,ed))continue;const v=ed%2===0,n=v?fo.ch:fo.cw;
      for(let k=0;k<n;k++){const c=((v?r.y:r.x)+FC*k+(fl?0:DOFF)-QI+DOORW/2+nq)/FC;   // door slot centre along the edge (cell units), same slot as areas(); real: +NFQ
        const nb=floorAt(b.h,ed===0?fo.cx+fo.cw:ed===2?fo.cx-1:fo.cx+k,ed===1?fo.cy+fo.ch:ed===3?fo.cy-1:fo.cy+k);if(nb&&nb!==b&&matchRule(b,nb)&&!passage(b,nb,ed))continue;   // no matching door on the neighbour: a wall, no mark
        o.push({ed,x:ed===0?fo.cx+fo.cw:ed===2?fo.cx:c,y:ed===1?fo.cy+fo.ch:ed===3?fo.cy:c,port:false})}}
    return o}
  const t=sh&&sh.entrance&&sh.entrance.kind==="ports"&&sh.ports.length&&shapeTf(b),r=t&&(floorRect(b)||nfRect(b));if(!t)return o;
  const P=sh.ports.map(p=>(real?t.f0:t.f)(p[1],p[2])),px=P.reduce((a,p)=>a+p[0],0)/P.length,py=P.reduce((a,p)=>a+p[1],0)/P.length,
    dist=[r.x+r.w-px,r.y+r.h-py,px-r.x,py-r.y],ed=dist.indexOf(Math.min(...dist));
  o.push({ed,x:(ed===0?r.x+r.w:ed===2?r.x:px)/FC,y:(ed===1?r.y+r.h:ed===3?r.y:py)/FC,port:true});return o}
const entText=b=>{const e=entrances(b);return e.length?{kind:e[0].port?"Outputs":"Entrances",sides:[...new Set(e.map(q=>EN[q.ed]))].sort((a,c)=>EN.indexOf(a)-EN.indexOf(c))}:null};
const ENT_HINT="Arrows mark the entrances: station doors, or the output ports for blocks without doors";
const shapeRects=(b,k)=>{const t=shapeTf(b);return t?t.sh[k].map(([a,c,e,g])=>{const[p,q]=t.f(a,c),[u,v]=t.f(e,g);return{x:Math.min(p,u),y:Math.min(q,v),w:Math.abs(u-p),h:Math.abs(v-q)}}):[]};
function polyCells(sh){if(sh._pc)return sh._pc;const P=sh.polys,W=Math.ceil(Math.max(...P.flat().map(v=>v[0]))),H=Math.ceil(Math.max(...P.flat().map(v=>v[1])));const inP=(x,y)=>P.some(p=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;return c});const ok=[],cut=[];for(let j=0;j<H;j++)for(const[arr,want]of[[ok,true],[cut,false]]){let s=-1;for(let i=0;i<=W;i++){const m=i<W&&inP(i+.5,j+.5)===want;if(m&&s<0)s=i;if(!m&&s>=0){arr.push([s,j,i,j+1]);s=-1}}}return sh._pc={ok,cut}}
function polyRects(b){const t=shapeTf(b);if(!t||!t.sh.polys||!floorRect(b))return null;const c=polyCells(t.sh),m=l=>l.map(([a,d,e,g])=>{const[p,q]=t.f(a,d),[u,v]=t.f(e,g);return{x:Math.min(p,u),y:Math.min(q,v),w:Math.abs(u-p),h:Math.abs(v-q)}});return{ok:m(c.ok),cut:m(c.cut)}}
const elvRect=b=>{const d=def(b.cls),r=d&&d.elevator&&floorRect(b);return r?{x:r.x+((r.w-d.elevator.w)>>1),y:r.y+((r.h-d.elevator.h)>>1),w:d.elevator.w,h:d.elevator.h,b}:null};
function areas(L){
  const fb=[],floors=[],doors=[],gaps=[],blocked=[],own=new Map(),pn=new Set();   // pn: cells of no-floor blocks with ports (dock, drone bay): a station door next to them is 1 deep (station side only)
  S.blocks.forEach(b=>{if(b.h!==L||!nfRect(b))return;const sh=SHAPES[(def(b.cls)||{}).name];if(!sh||!sh.ports||!sh.ports.length)return;const c=fcell(b);for(let i=0;i<c.cw;i++)for(let j=0;j<c.ch;j++)pn.add((c.cx+i)+","+(c.cy+j))});
  S.blocks.filter(b=>b.h===L&&!isM(b)).forEach(b=>{
    const r=floorRect(b);if(!r)return;
    const f={b,d:dim(b),r};r.cuts=[[],[],[],[]];r.wcuts=[[],[],[],[]];floors.push(r);fb.push(f);   // cuts: ring floor in door slots; wcuts: band cut only where a door passage joins two blocks
    const fo=fcell(b);for(let i=0;i<fo.cw;i++)for(let j=0;j<fo.ch;j++)own.set((fo.cx+i)+","+(fo.cy+j),f);
    const e=elvRect(b);if(e)blocked.push(e);
  });
  fb.forEach(f=>{const{b,r}=f,QI=(def(b.cls)||{}).floorInset||0,fo=fcell(b);   // QI: floor inset inside the shell (elevator 1); fo: floor cell box (shipEnd: station side only)
    for(let ed=0;ed<4;ed++){if(SHIPEND(b)&&ed===b.rot||!sideOpen(b,ed))continue;   // Industrial Dock: doors on every side except the ship side (rot = ship direction); user screenshot 2026-11-07: station side 2 doors, both short ends 1 each; positions = station rule, unverified
      const v=ed%2===0,n=v?fo.ch:fo.cw;
      for(let k=0;k<n;k++){
        const nk=(ed===0?fo.cx+fo.cw:ed===2?fo.cx-1:fo.cx+k)+","+(ed===1?fo.cy+fo.ch:ed===3?fo.cy-1:fo.cy+k),nf=own.get(nk),pb=!nf&&pn.has(nk),sp=pb?1:DW;   // pb: ports block behind the door (no floor): strip = station-side column only
        const t0=(v?r.y:r.x)+FC*k+(((def(b.cls)||{}).door||{}).flush?0:DOFF)-QI,ex=ed===0?r.x+r.w+QI:ed===2?r.x-QI-sp:t0,ey=ed===1?r.y+r.h+QI:ed===3?r.y-QI-sp:t0;
        const p=!!nf&&nf!==f&&(!matchRule(b,nf.b)||passage(b,nf.b,ed));   // real neighbour: door passage (Corner/Corridor pairs: only if it has a door over this slot too)
        if(nf&&nf!==f&&!p)continue;   // neighbour with no matching door (corridor long side, corner/dock open side): the wall stays, no ring, no door
        r.cuts[ed].push([t0,t0+DOORW]);
        if(p)r.wcuts[ed].push([t0,t0+DOORW]);   // passage between two real blocks: both walls open here
        if(p&&ed>1)continue;   // the E/S side owns the shared door (gap strip + door)
        if(p)gaps.push(v?{x:ex,y:r.y+FC*k,w:sp,h:FC}:{x:r.x+FC*k,y:ey,w:FC,h:sp});
        const key=`${L}|${fo.cx}|${fo.cy}|${EN[ed]}|${k}`;   // anchor = floor cell box (fcell): dock rot 2/3 floor is offset from the footprint anchor
        doors.push({key,open:!S.closed.includes(key),paired:!!p,ver:dv(b)&&(!p||dv(nf.b)),ed,bx:fo.cx,by:fo.cy,k,x:ex,y:ey,w:v?sp:DOORW,h:v?DOORW:sp,
          lg:p?(ed===0?`${L}|${fo.cx+fo.cw}|${Math.max(fo.cy,fcell(nf.b).cy)}|V`:`${L}|${Math.max(fo.cx,fcell(nf.b).cx)}|${fo.cy+fo.ch}|H`):null});
      }
    }
  });
  // elevator ring: inset strip (floorInset Q) inside each open door slot, same geometry as draw.js paintFloorBase
  const ring=[];floors.forEach(r=>{const Q=((def(r.b.cls)||{}).floorInset)||0;if(!Q)return;
    for(let ed=0;ed<4;ed++)r.cuts[ed].forEach(([a0,a1])=>ring.push(ed===0?{x:r.x+r.w,y:a0,w:Q,h:a1-a0}:ed===2?{x:r.x-Q,y:a0,w:Q,h:a1-a0}:ed===1?{x:a0,y:r.y+r.h,w:a1-a0,h:Q}:{x:a0,y:r.y-Q,w:a1-a0,h:Q}))});
  return{floors,doors,gaps,blocked,rects:floors.flatMap(r=>{const pr=polyRects(r.b);return pr?pr.ok:[r]}).concat(doors.filter(d=>d.open),ring),nob:floors.flatMap(r=>{const pr=polyRects(r.b);return pr?pr.cut:[]})};
}
// elevator shaft (blocked 4x4 centre): machines may not overlap it
let STRICT=true;   // Settings: keep buildables on the floor (no outside / across walls); overlaps are always refused
const hitR=(i,e)=>i.x<e.x+e.w&&i.x+i.w>e.x&&i.y<e.y+e.h&&i.y+i.h>e.y;
function noBuild(it){const c={},ids=new Set(it.map(i=>i.id).filter(x=>x!=null));
  return it.some(i=>{const a=c[i.l]=c[i.l]||areas(i.l);
    if(a.blocked.some(e=>hitR(i,e))||a.nob.some(e=>hitR(i,e)))return true;
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
let UWC=null;
function ugWarn(){
  if(LKP&&UWC&&UWC.k===PK)return UWC.v;
  const out=new Map();
  ugPairs(S.blocks.filter(isM)).forEach(({u,t,n,max})=>{if(n>max)out.set(u.id,{n,max,to:t})});
  if(LKP)UWC={k:PK,v:out};
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
    let ix=0,iy=0;const is=q.pos==='start'?-1:1;if(fi&1)iy=is;else ix=is;   // elevator io: unit step of a belt entering the port along the wall (N/S: start -1,0 end 1,0; E/W: start 0,-1 end 0,1)
    for(let r=0;r<(b.rot&3);r++){[x,y]=[h-1-y,x];[w,h]=[h,w];[nx,ny]=[-ny,nx];[ix,iy]=[-iy,ix]}
    // splitter input (back) face is not a game port: never toggleable, always enabled
    const key=f+i,tg=!!L.toggleable&&!(q.dir==="in"&&isSplitterCls(b.cls));o.push({key,f,i,pos:q.pos,dir:q.dir||null,tg,en:!tg||!off.includes(key),wf:(fi+(b.rot&3))%4,x:ox+x,y:oy+y,nx,ny,line:!!L.line,io:d&&d.elevator?[ix,iy]:null});
  });
  return o;
}
// estimate over ALL levels, cached PER LEVEL (a placement only recomputes the level it touched, plus levels whose elevator inflow changed): an elevator input forwards what its belt carries to the same port on the levels above/below (same rule as the sim: even split over existing outputs); passes repeat until the flow stops changing
const sh=s=>{let h=0;s=String(s);for(let i=0;i<s.length;i++)h=(Math.imul(h,31)+s.charCodeAt(i))|0;return h};
const lvHash=()=>{const m=new Map(),cl=sh(JSON.stringify(S.closed||[])+JSON.stringify(OV||{}));   // OV = rate overrides (Settings)
  S.blocks.forEach(b=>{let h=m.has(b.h)?m.get(b.h):cl;h=(Math.imul(h,31)+b.id+b.x*7+b.y*13+b.rot*19+(b.pid|0)*23+(b.mid|0)*29+(b.off?sh(b.off.join()):0)+(b.rec?sh(b.rec):0)+sh(b.cls))|0;
    if(b.ct)b.ct.forEach(x=>{h=(Math.imul(h,31)+(+x.n||0)+(x.inf?7:0)+sh(x.item))|0});m.set(b.h,h)});return m};
const L1M=new Map();
const links1c=(l,inj,hk)=>{const ik=inj&&inj.length?inj.map(x=>x.id+x.item+r2(x.rate)).join():"",k=(hk.get(l)||0)+"|"+ik+"|"+LK,c=L1M.get(l);
  if(c&&c.k===k)return c.res;const res=links1(l,inj);L1M.set(l,{k,res});return res};
let LKM=null,LKI=new Map(),LKS="";   // LKI/LKS: elevator injection of the last full pass (seed for the next, so an unchanged flow costs one pass)
function links(L){
  const hk=lvHash(),k=[...hk].join(";")+"|"+LK;if(LKM&&LKM.k===k&&LKM.res.has(L))return LKM.res.get(L);
  const res=linksAll(L,hk);LKM={k,res};return res.get(L);
}
function linksAll(L,hk){
  const lv=[...new Set(S.blocks.map(b=>b.h))];if(!lv.includes(L))lv.push(L);
  let res=new Map(lv.map(l=>[l,links1c(l,LKI.get(l)||null,hk)])),prev=LKS;
  if(!lv.some(l=>res.get(l).elvIn.length)){LKI=new Map();LKS="";return res}
  for(let pass=0;pass<Math.min(lv.length,6);pass++){
    const inj=new Map(lv.map(l=>[l,[]])),sig=[];
    lv.forEach(l=>{const K=res.get(l);K.elvIn.forEach(({k,id})=>{const ld=K.load.get(id);if(!ld)return;
      const dst=[l+1,l-1].filter(h=>res.has(h)&&res.get(h).elvOut.has(k));if(!dst.length)return;
      ld.items.forEach((v,item)=>dst.forEach(h=>{inj.get(h).push({id:res.get(h).elvOut.get(k),item,rate:v/dst.length});sig.push(h+k+item+r2(v/dst.length))}))})});
    const sg=sig.join();if(sg===prev)break;prev=sg;LKI=inj;LKS=sg;
    res=new Map(lv.map(l=>[l,links1c(l,inj.get(l),hk)]));
  }
  return res;
}
// ports drawn as bars: splitter input (back) face is not a port, so no bar (draw.js draws a neutral chevron there)
const barPorts=b=>portsOf(b).filter(p=>!(p.dir==="in"&&isSplitterCls(b.cls)));
const togglePort=(b,k)=>{if(!portsOf(b).some(p=>p.key===k&&p.tg))return;const o=b.off||[];b.off=o.includes(k)?o.filter(q=>q!==k):o.concat(k)};
function portAt(p){
  const s=sc();if(s<14)return null;
  const fx=(p.x-V.ox)/s,fy=(p.y-V.oy)/s;let best=null,bd=9;
  S.blocks.forEach(b=>{if(b.h!==layer)return;barPorts(b).filter(q=>q.tg).forEach(q=>{
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
let LK=false;
const isBelt=b=>{const d=def(b.cls);return !!(d&&d.directional&&(d.category==="Conveyors"||d.category==="Undergrounds"))};
const isStore=b=>!!(isM(b)&&def(b.cls)&&def(b.cls).category==="Storage");
const ctFirst=b=>(b.ct||[]).find(x=>x.inf||x.n>0)||null;
const nameOf=b=>{const d=def(b.cls);return (d?lab(d):shortCls(b.cls))+" @"+b.x+","+b.y};
function links1(L,inj){
  const ms=S.blocks.filter(b=>b.h===L&&isM(b)),belts=ms.filter(isBelt),occ=new Map();
  ms.forEach(b=>{const d=dim(b);for(let i=0;i<d.w;i++)for(let j=0;j<d.h;j++)occ.set((b.x+i)+","+(b.y+j),b)});
  // 0) splitter/balancer OUTPUT port touching another machine's matching enabled port directly (no belt between): synthetic 1-cell belt (negative id, never in S.blocks) so sim + estimate treat it as a belt
  const vb=[],elvP=S.blocks.filter(b=>b.h===L&&!isM(b)&&def(b.cls)&&def(b.cls).elevator).flatMap(e=>portsOf(e).filter(q=>q.en).map(q=>({t:e,q})));   // elevator ports are not in occ: matched here
  const vr=v=>DIR.findIndex(d=>d[0]===v[0]&&d[1]===v[1]);
  ms.forEach(sp=>{const c=(def(sp.cls)||{}).category;if(c!=="Splitters"&&c!=="Balancers")return;
    portsOf(sp).forEach(p=>{if(!p.en)return;const tx=p.x+p.nx,ty=p.y+p.ny,t=occ.get(tx+","+ty);
      if(!t){   // splitter face on an elevator port edge: output face pushes along the wall (elevator io = input); input (back) face takes the elevator output (flow = its own into direction, not io)
        elvP.forEach(({t:e,q})=>{if(q.x!==tx||q.y!==ty||q.nx!==-p.nx||q.ny!==-p.ny)return;
          const rot=p.dir==="in"?vr([-p.nx,-p.ny]):vr(q.io);
          vb.push({v:{id:-(sp.id*4+p.i+1),cls:"__v",x:tx,y:ty,h:L,rot},sp,p,t:e,q})});return}
      if(p.dir==="in"||t===sp||isBelt(t))return;
      const q=portsOf(t).find(q=>q.en&&q.dir!=="out"&&q.x===tx&&q.y===ty&&q.nx===-p.nx&&q.ny===-p.ny);if(!q)return;
      vb.push({v:{id:-(sp.id*4+p.i+1),cls:"__v",x:tx,y:ty,h:L,rot:DIR.findIndex(d=>d[0]===p.nx&&d[1]===p.ny)},sp,p,t,q})})});
  vb.forEach(e=>belts.push(e.v));
  // underground belts have ONE input (behind the entrance) and ONE output (front of the exit): other contacts never link
  const upr=ugPairs(belts),uEn=new Set(upr.map(q=>q.u.id)),uEx=new Set(upr.map(q=>q.t.id));
  const ugBad=(t,nx,ny)=>{const d=DIR[t.rot];return uEn.has(t.id)&&!(nx===d[0]&&ny===d[1])||uEx.has(t.id)&&!(nx===-d[0]&&ny===-d[1])};   // (nx,ny) = port normal pointing from the machine into belt cell t
  const o={ports:[],off:[],flow:[],ug:[],nb:new Map(),mach:new Map()};
  const nb=(a,b,k,p)=>{if(!o.nb.has(a.id))o.nb.set(a.id,[]);const l=o.nb.get(a.id);let e=l.find(e=>e.b===b&&e.k===k);if(!e){e={b,k,ps:[]};l.push(e)}if(p)e.ps.push(p)};
  const par=new Map(belts.map(b=>[b.id,b.id])),root=i=>{while(par.get(i)!==i)i=par.get(i);return i},uni=(a,b)=>par.set(root(a.id),root(b.id));
  // 1) machine <-> belt: only an ENABLED port facing a belt cell links; a disabled one facing a belt only gets a red tick
  ms.filter(m=>!isBelt(m)).concat(S.blocks.filter(b=>b.h===L&&!isM(b)&&def(b.cls)&&def(b.cls).elevator)).forEach(m=>portsOf(m).forEach(p=>{
    const bx=p.x+p.nx,by=p.y+p.ny,t=occ.get(bx+","+by);if(!t||t===m||!isBelt(t)||ugBad(t,p.nx,p.ny))return;
    const e={b:t,m,bx,by,mx:p.x,my:p.y,port:p};
    if(p.en){o.ports.push(e);nb(t,m,"port",p);nb(m,t,"port",p)}else o.off.push(e);
  }));
  vb.forEach(({v,sp,p,t,q})=>{o.ports.push({b:v,m:sp,bx:v.x,by:v.y,mx:p.x,my:p.y,port:p},{b:v,m:t,bx:v.x,by:v.y,mx:q.x,my:q.y,port:q})});
  // 2) belt -> belt in facing direction (chain / T-join merge)
  const inc=new Map(),fl=[];
  belts.forEach(u=>{const t=occ.get((u.x+DIR[u.rot][0])+","+(u.y+DIR[u.rot][1]));
    if(t&&t!==u&&isBelt(t)&&t.rot!==(u.rot+2)%4&&!uEn.has(u.id)&&!uEx.has(t.id)&&!(uEn.has(t.id)&&t.rot!==u.rot)){fl.push({u,t});inc.set(t.id,(inc.get(t.id)||0)+1)}});
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
  const live=e=>[...o.mach.get(root(e.b.id))].some(m=>m!==e.m);   // belt chain reaches another machine; a dead end carries nothing and takes no share
  const oc=new Map();o.ports.forEach(e=>{if(!recOf(e.m)||!live(e))return;const d=DIR[e.b.rot],p=e.port;if(!(d[0]===-p.nx&&d[1]===-p.ny))oc.set(e.m.id,(oc.get(e.m.id)||0)+1)});   // output belts per machine: the recipe rate is shared equally between them
  o.ports.forEach(e=>{const r=recOf(e.m);if(!r||!live(e))return;const d=DIR[e.b.rot],p=e.port;if(d[0]===-p.nx&&d[1]===-p.ny)return;   // belt feeding INTO this machine carries no output
    const v=pm(r.o[1],r.t)/oc.get(e.m.id);if(v)src.push({id:e.b.id,item:r.o[0],rate:v})});
  o.pull=[];o.push=[];
  (inj||[]).forEach(x=>src.push(x));   // elevator transfers from other levels (see links)
  o.ports.forEach(e=>{if(!isStore(e.m))return;const d=DIR[e.b.rot],p=e.port;
    if(!(d[0]===-p.nx&&d[1]===-p.ny)){const it=ctFirst(e.m),c=beltMax(e.b);if(it&&c){src.push({id:e.b.id,item:it.item,rate:c});o.pull.push({m:e.m,belt:e.b,item:it.item,rate:c})}}
    else if(d[0]===-p.nx&&d[1]===-p.ny)o.push.push({m:e.m,belt:e.b})});
  o.elvIn=[];o.elvOut=new Map();   // elevator ports on this level: input belt (key, belt id), output belt key -> belt id
  o.ports.forEach(e=>{if(!(def(e.m.cls)||{}).elevator)return;const p=e.port,d=DIR[e.b.rot],k=[e.m.x,e.m.y,p.key].join();
    if(d[0]===p.io[0]&&d[1]===p.io[1])o.elvIn.push({k,id:e.b.id});else o.elvOut.set(k,e.b.id)});
  o.nx=nx;o.cp=cp;o.belts=belts;o.chain=id=>root(id);   // for the simulation snapshot
  const spR=new Map(),sp=new Map();
  o.ports.forEach(e=>{const c=(def(e.m.cls)||{}).category;if(c!=="Splitters"&&c!=="Balancers")return;const d=DIR[e.b.rot],p=e.port;
    let r=spR.get(e.m.id);if(!r){r={ins:[],outs:[]};spR.set(e.m.id,r)}
    if(d[0]===-p.nx&&d[1]===-p.ny&&p.dir!=="out")r.ins.push(e.b.id);else if(!(d[0]===-p.nx&&d[1]===-p.ny)&&p.dir!=="in")r.outs.push(e.b.id)});
  spR.forEach(r=>r.ins.forEach(i=>sp.set(i,r.outs)));
  o.load=flowLoad(nx,src,cp,sp);
  // unstocked container relays its inflow: each pull belt carries min(belt speed, inflow / pull belts), split by item share; repeat until the relayed flow stops changing (long container->container chains)
  const fed=o.ports.filter(e=>{const p=e.port,d=DIR[e.b.rot];return isStore(e.m)&&!ctFirst(e.m)&&!(d[0]===-p.nx&&d[1]===-p.ny)});
  let ps="";
  for(let pass=0;pass<30&&fed.length;pass++){
    const rel=[];
    fed.forEach(e=>{const c=beltMax(e.b);if(!c)return;const inM=new Map();let tot=0;
      o.push.forEach(x=>{if(x.m!==e.m)return;const l=o.load.get(x.belt.id);if(l)l.items.forEach((v,k)=>{inM.set(k,(inM.get(k)||0)+v);tot+=v})});
      if(!(tot>0))return;const f=Math.min(c,tot/fed.filter(q=>q.m===e.m).length)/tot;
      inM.forEach((v,k)=>rel.push({id:e.b.id,item:k,rate:v*f,m:e.m,belt:e.b}))});
    const sg=rel.map(r=>r.id+r.item+r2(r.rate)).join();if(sg===ps)break;ps=sg;
    o.pull=o.pull.filter(x=>!x.rel).concat(rel.map(r=>({m:r.m,belt:r.belt,item:r.item,rate:r.rate,rel:true})));
    o.load=flowLoad(nx,src.concat(rel),cp,sp);
  }
  o.sto=new Map();ms.filter(isStore).forEach(m=>o.sto.set(m.id,storeInfo(m,o)));
  o.sup=new Map();o.ports.forEach(e=>{if(isStore(e.m))return;const d=DIR[e.b.rot],p=e.port;if(d[0]!==-p.nx||d[1]!==-p.ny)return;
    const l=o.load.get(e.b.id);if(!l)return;let s=o.sup.get(e.m.id);if(!s){s=new Map();o.sup.set(e.m.id,s)}l.items.forEach((v,k)=>s.set(k,(s.get(k)||0)+v))});
  return o;
}
