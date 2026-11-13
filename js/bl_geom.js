// BL2-BL3 geometry (blMachine, blRow, blStage, blTower). Filled in BL2+.
// blMachine(cls): first rot 0..3 whose ports give one input (N face, not out) and one output (S face, not in); other ports must be toggleable and go to off.
function blMachine(cls,k=1,mir=false){
  if(mir){   // flipped machine (blFlip): same rot, pin/pout at the mirrored x (w-1-x); both must exist, others off. Two-input: refused.
    const b=blMachine(cls,k);if(!b.ok)return b;if(k!==1)return{ok:false,why:'BL: flip two-input machine'};
    const ps=portsOf({cls,x:0,y:0,rot:b.rot,off:[]}),xi=b.w-1-b.xin,xo=b.w-1-b.xout;
    const pi=ps.find(p=>p.nx===0&&p.ny===-1&&p.dir!=='out'&&p.x===xi),po=ps.find(p=>p.nx===0&&p.ny===1&&p.dir!=='in'&&p.x===xo);
    if(!pi||!po)return{ok:false,why:'BL: flip, no machine port at the mirrored x'};
    const others=ps.filter(p=>p!==pi&&p!==po);
    if(others.some(p=>!p.tg))return{ok:false,why:'BL: flip, machine ports'};
    return{...b,xin:xi,xout:xo,off:others.map(p=>p.key).sort()};
  }
  for(let rot=0;rot<4;rot++){
    const ps=portsOf({cls,x:0,y:0,rot,off:[]});
    const pins=ps.filter(p=>p.nx===0&&p.ny===-1&&p.dir!=='out').sort((a,b)=>a.x-b.x);
    const pout=ps.filter(p=>p.nx===0&&p.ny===1&&p.dir!=='in').sort((a,b)=>a.x-b.x)[0];
    if(pins.length<k||!pout)continue;
    if(k===2&&pins[1].x-pins[0].x<2)continue;
    const use=k===2?[pins[0],pins[1]]:[pins[0]];
    const others=ps.filter(p=>!use.includes(p)&&p!==pout);
    if(others.some(p=>!p.tg))continue;
    const d=dim({cls,rot});
    return{ok:true,rot,w:d.w,h:d.h,xin:k===2?pins[1].x:pins[0].x,...(k===2?{xinB:pins[0].x}:{}),xout:pout.x,off:others.map(p=>p.key).sort()};
  }
  return{ok:false,why:'BL: machine ports'};
}
// blRow(o): one machine row. Manifold belt y=yIn from colX to last splitter (splitter at X0+k*w+xin, off = pfSplOff(...,['E','S'])), machines at (X0+k*w,yIn+1), output belt y=yOut=yIn+1+h from X0+xout to xEx-1, corner rot 1 at (xEx,yOut).
function blRow(o){
  const {mk,spMk,cls,rec,mc,m,X0,yIn,colX,xEx}=o,w=mc.w,xin=mc.xin,xout=mc.xout,h=mc.h;
  if(colX>=X0+xin)return{ok:false,why:'BL: row input column past first splitter'};
  const yOut=yIn+1+h,sc=PLC_SPL[spMk],bc=PLC_BELT[mk],spl=pfSplOff(sc,0,['E','S']),items=[];
  const lastX=X0+(m-1)*w+xin;
  for(let x=colX;x<=lastX;x++){
    const k=(x-X0-xin)/w;
    if(Number.isInteger(k)&&k>=0&&k<m)items.push({cls:sc,x,y:yIn,rot:0,h:0,pid:0,off:spl});
    else items.push({cls:bc,x,y:yIn,rot:0,h:0,pid:0});
  }
  for(let k=0;k<m;k++)items.push({cls,x:X0+k*w,y:yIn+1,rot:mc.rot,h:0,pid:0,off:mc.off,rec});
  for(let x=X0+xout;x<xEx;x++)items.push({cls:bc,x,y:yOut,rot:0,h:0,pid:0});
  items.push({cls:bc,x:xEx,y:yOut,rot:1,h:0,pid:0});
  return{ok:true,items,yOut};
}
// blRow2(o): two-input row. A (direct) manifold y=yT, B (lane) manifold y=yIn=yT+1 (UG under each A feeder), machines at yIn+1, output belt y=yOut=yIn+1+h.
function blRow2(o){
  const {mk,spMk,cls,rec,mc,m,X0,yT,colA,colB,xEx}=o,w=mc.w,xA=mc.xin,xB=mc.xinB,h=mc.h,yIn=yT+1,yOut=yIn+1+h;
  if(colA>=X0+xA||colB>=X0+xB)return{ok:false,why:'BL: row input column past first splitter'};
  const sc=PLC_SPL[spMk],bc=PLC_BELT[mk],ug=PLC_UG[mk],spl=pfSplOff(sc,0,['E','S']),items=[];
  const bt=(x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});
  const lastA=X0+(m-1)*w+xA,lastB=X0+(m-1)*w+xB;
  const spA=new Set(),spB=new Set(),skip=new Set(),ent=new Set(),ext=new Set();
  for(let k=0;k<m;k++){const b=X0+k*w;spA.add(b+xA);spB.add(b+xB);if(k<m-1){skip.add(b+xA);ent.add(b+xA-1);ext.add(b+xA+1)}}
  for(let x=colA;x<=lastA;x++)items.push(spA.has(x)?{cls:sc,x,y:yT,rot:0,h:0,pid:0,off:spl}:bt(x,yT,0));
  for(let k=0;k<m;k++)items.push(bt(X0+k*w+xA,yIn,1));
  for(let x=colB;x<=lastB;x++){
    if(skip.has(x))continue;
    if(spB.has(x))items.push({cls:sc,x,y:yIn,rot:0,h:0,pid:0,off:spl});
    else if(ent.has(x)||ext.has(x))items.push({cls:ug,x,y:yIn,rot:0,h:0,pid:0});
    else items.push(bt(x,yIn,0));
  }
  for(let k=0;k<m;k++)items.push({cls,x:X0+k*w,y:yIn+1,rot:mc.rot,h:0,pid:0,off:mc.off,rec});
  for(let x=X0+mc.xout;x<xEx;x++)items.push(bt(x,yOut,0));
  items.push(bt(xEx,yOut,1));
  return{ok:true,items,yOut};
}
// blStage(S): Rs rows fed from source/sink container at (cx,Y); trunks run into the container at Yc. S.cls = machine class, S.M = machines per full row (E0 = X0+M*w).
// Two-input machines (mc.xinB set, t=1): S.lane={y} = lane container row; lane belts leave its W ports, run down columns cx-2-j and enter row B. Single-input (t=0) path is unchanged.
function blStage(S){
  const {mk,spMk,bx,cx,Y,mc,cls,rec,rowsM,PS,PN,first,ind,item,M,lane}=S;
  const bd=dim({cls:bx,rot:0}),bh=bd.h,bw=bd.w,t=mc.xinB!=null?1:0,P=mc.h+2+t,h=mc.h,w=mc.w,Rs=rowsM.length;
  const FIT=!!S.fit,nx=(y,hh)=>{if(!FIT)return y;while(!pfFitY(y,hh))y++;return y},nxC=(y,hh)=>FIT?nx(y-1,hh+1)+1:y;   // band-free mode (multi trees only): rows and trunks pushed to a wall-fitting y
  const X0=cx+bw,E0=X0+M*w,yTa=[],yT=j=>yTa[j],yIn=j=>yTa[j]+t,items=[],bc=PLC_BELT[mk],ug=PLC_UG[mk];
  for(let j=0;j<Rs;j++)yTa.push(nx(j?yTa[j-1]+P:Y+bh+1,P));
  if(Rs<1||PS.length<Rs||PN.length<Rs)return{ok:false,why:'BL: stage ports'};
  if(t&&!lane)return{ok:false,why:'BL: lane missing'};
  const LP=t?portsOf({cls:bx,x:cx,y:lane.y,rot:0,off:[]}).filter(p=>p.f==='W').sort((a,b)=>a.y-b.y):null;
  if(t&&LP.length<Rs)return{ok:false,why:'BL: lane ports'};
  const vy0=first&&ind?0:Y+bh;
  for(let j=0;j<Rs;j++){
    const col=cx+PS[Rs-1-j],xEx=E0+(Rs-1-j);
    if(!t){
      const yI=yIn(j);
      for(let y=vy0;y<yI;y++){
        const b={cls:bc,x:col,y,rot:1,h:0,pid:0};
        if(first&&ind&&y===0){b.dk='ie';b.di=item}
        items.push(b);
      }
      const r=blRow({mk,spMk,cls,rec,mc,m:rowsM[j],X0,yIn:yI,colX:col,xEx});
      if(!r.ok)return r;
      items.push(...r.items);
    }else{
      for(let y=vy0;y<yT(j);y++){
        const q=[...Array(j).keys()].find(q=>y>=yT(q)&&y<=yIn(q)+1);   // inside the underpass of an upper row
        if(q===undefined)items.push({cls:bc,x:col,y,rot:1,h:0,pid:0});
        else if(y===yT(q)||y===yIn(q)+1)items.push({cls:ug,x:col,y,rot:1,h:0,pid:0});
      }
      const lp=LP[Rs-1-j],lc=cx-2-j;
      for(let x=lp.x+lp.nx;x>lc;x--)items.push({cls:bc,x,y:lp.y,rot:2,h:0,pid:0});
      for(let y=lp.y;y<yIn(j);y++)items.push({cls:bc,x:lc,y,rot:1,h:0,pid:0});
      const r=blRow2({mk,spMk,cls,rec,mc,m:rowsM[j],X0,yT:yT(j),colA:col,colB:lc,xEx});
      if(!r.ok)return r;
      items.push(...r.items);
    }
  }
  const yOutF=j=>yIn(j)+1+h,Yb=nx(yOutF(Rs-1)+1,Rs),Yc=nxC(Yb+Rs,bh),sinkCols=[];
  for(let j=0;j<Rs;j++){
    const yr=Yb+(Rs-1-j),yOut=yOutF(j),ex=E0+(Rs-1-j),cN=cx+PN[Rs-1-j];
    sinkCols.push(cN);
    for(let y=yOut+1;y<yr;y++)items.push({cls:bc,x:ex,y,rot:1,h:0,pid:0});
    items.push({cls:bc,x:ex,y:yr,rot:2,h:0,pid:0});
    for(let x=ex-1;x>cN;x--)items.push({cls:bc,x,y:yr,rot:2,h:0,pid:0});
    for(let y=yr;y<Yc;y++)items.push({cls:bc,x:cN,y,rot:1,h:0,pid:0});
  }
  return{ok:true,items,Yc,sinkCols};
}
// blTower(Tw): stages chained. Source container at (cx,1) unless ind; a container at each stage's Yc (last = sink). Tw={mk,spMk,bx,cx,cls,mc,rec,raw,M,ind,dock,stages:[{rowsM}]}.
function blTower(Tw){
  const ports=portsOf({cls:Tw.bx,x:0,y:0,rot:0,off:[]});
  const SP=ports.filter(p=>p.f==='S').map(p=>p.x).sort((a,b)=>a-b),NP=ports.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b);
  const items=[];let Y=1,sink=null,sinkCols=null;
  if(!Tw.ind){const src={cls:Tw.bx,x:Tw.cx,y:1,rot:0,h:0,pid:0,ct:[{item:Tw.raw,n:0,inf:true}]};if(Tw.dock&&Tw.dock.in==='nrm')src.dk='in';items.push(src)}
  for(let s=0;s<Tw.stages.length;s++){
    const SG=Tw.stages[s],rowsM=SG.rowsM,Rs=rowsM.length;   // per-stage cls/mc/rec/M (chains mix machines); tower-level values are fallbacks
    if(s===0&&Tw.ind&&Rs>2)return{ok:false,why:'BL: industrial input allows 2 rows in stage 0'};
    const PS=s===0&&Tw.ind?[0,2]:SP.slice(0,Rs);
    const st=blStage({mk:Tw.mk,spMk:Tw.spMk,bx:Tw.bx,cx:Tw.cx,Y,mc:SG.mc||Tw.mc,cls:SG.cls||Tw.cls,rec:SG.rec||Tw.rec,rowsM,PS,PN:NP.slice(0,Rs),first:s===0,ind:!!Tw.ind,item:Tw.raw,M:SG.M||Tw.M});
    if(!st.ok)return st;
    items.push(...st.items);
    sink={cls:Tw.bx,x:Tw.cx,y:st.Yc,rot:0,h:0,pid:0,ct:[]};items.push(sink);
    Y=st.Yc;sinkCols=st.sinkCols;
  }
  if(Tw.dock&&Tw.dock.out==='nrm')sink.dk='out';
  return{ok:true,items,Yend:Y,sinkCols};
}
// blTree(Tw): spine of containers at x=cx. Tw={mk,spMk,bx,cx,dock,ev}. ev[i]={t:'raw',item} | {t:'stage',cls,mc,rec,M,rowsM,d:eventIdx of the direct container,l:eventIdx of the lane container or -1}. Every event owns one container; a stage event's container is its sink.
function blTree(Tw){
  const ports=portsOf({cls:Tw.bx,x:0,y:0,rot:0,off:[]}),bh=dim({cls:Tw.bx,rot:0}).h;
  const SP=ports.filter(p=>p.f==='S').map(p=>p.x).sort((a,b)=>a-b),NP=ports.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b),Sk=ports.filter(p=>p.f==='S').map(p=>p.key);
  const nx=(y,hh)=>{while(!pfFitY(y,hh))y++;return y};
  const lanes=new Set(Tw.ev.map(e=>e.l).filter(v=>v>=0)),box=[],items=[];let cur=1;
  for(let i=0;i<Tw.ev.length;i++){
    const e=Tw.ev[i];let b;
    if(e.t==='raw')b={cls:Tw.bx,x:Tw.cx,y:nx(cur,bh),rot:0,h:0,pid:0,ct:[{item:e.item,n:0,inf:true}]};
    else{
      const Rs=e.rowsM.length,D=box[e.d],L=e.l>=0?box[e.l]:null;
      const st=blStage({mk:Tw.mk,spMk:Tw.spMk,bx:Tw.bx,cx:Tw.cx,Y:D.y,mc:e.mc,cls:e.cls,rec:e.rec,rowsM:e.rowsM,PS:SP.slice(0,Rs),PN:NP.slice(0,Rs),first:false,ind:false,M:e.M,lane:L?{y:L.y}:null,fit:true});
      if(!st.ok)return st;
      items.push(...st.items);
      b={cls:Tw.bx,x:Tw.cx,y:st.Yc,rot:0,h:0,pid:0,ct:[]};
    }
    if(lanes.has(i))b.off=Sk;          // lane containers output west only
    box.push(b);items.push(b);cur=b.y+bh+1;
  }
  if(Tw.dock&&Tw.dock.out==='nrm')box[box.length-1].dk='out';
  return{ok:true,items,Yend:box[box.length-1].y};
}
// BL Z1 zones: IZ (input containers + straight verticals), FB (machine rows only), OZ (sink containers only). Each zone is one 30-cell block: y=Y+0 and Y+29 are wall cells (the placer turns a vertical crossing into a UG pair).
// blZL(R): column layout for R rows (Large Container, 4 ports/face). c=ceil(R/3) containers; PS = ascending port offsets, lower rows on A (floor(R/2) ports), upper on B (x=cx+4).
const blZL=R=>{const c=Math.ceil(R/3);if(c===1)return{c,PS:Array.from({length:R},(_,i)=>i),cont:[0]};const a=Math.floor(R/2);return{c,PS:[...Array.from({length:a},(_,i)=>i),...Array.from({length:R-a},(_,i)=>4+i)],cont:[0,4]}};
// blFB(S): S={mk,spMk,cls,rec,mc,M,R,cx,Y}. Row j: input vertical from Y to yIn-1 at col PS[R-1-j]; blRow at yIn=Y+1+P*j (P=h+2); output vertical yOut+1..Y+29 at ex=E0+(R-1-j).
function blFB(S){
  const {mk,spMk,cls,rec,mc,M,R,cx,Y}=S,L=blZL(R),P=mc.h+2,Fh=PF_GRID.ch,bc=PLC_BELT[mk];
  if(R<1||R>Math.floor((Fh-2)/P))return{ok:false,why:'BL: zone rows'};
  const X0=cx+L.PS[R-1]+(mc.xin===0?1:0),E0=X0+M*mc.w,items=[],yIn=[],yOut=[],exCols=[];
  for(let j=0;j<R;j++){
    const yi=1+P*j,col=cx+L.PS[R-1-j],ex=E0+(R-1-j);
    for(let y=0;y<yi;y++)items.push({cls:bc,x:col,y:Y+y,rot:1,h:0,pid:0});
    const r=blRow({mk,spMk,cls,rec,mc,m:M,X0,yIn:Y+yi,colX:col,xEx:ex});
    if(!r.ok)return r;
    items.push(...r.items);
    yIn.push(Y+yi);yOut.push(r.yOut);exCols.push(ex);
    for(let y=r.yOut+1;y<=Y+Fh-1;y++)items.push({cls:bc,x:ex,y,rot:1,h:0,pid:0});
  }
  return{ok:true,items,yIn,yOut,exCols,X0,E0};
}
// blIZ(S): S={mk,bx,cx,Y,R,raw}. Containers at Y+1 (A at cx, B at cx+4 when R>3), each PS port: straight vertical Y+5..Y+29.
function blIZ(S){
  const {mk,bx,cx,Y,R,raw}=S,L=blZL(R),Fh=PF_GRID.ch,bc=PLC_BELT[mk],items=[];
  for(const o of L.cont)items.push({cls:bx,x:cx+o,y:Y+1,rot:0,h:0,pid:0,ct:[{item:raw,n:0,inf:true}]});
  for(const p of L.PS)for(let y=Y+5;y<=Y+Fh-1;y++)items.push({cls:bc,x:cx+p,y,rot:1,h:0,pid:0});
  return{ok:true,items};
}
// blOZ(S): S={mk,bx,Y,R,E0}. Sink containers at Y+2 covering the ex columns E0..E0+R-1 (c=1: one at E0; c=2: left E0+g0-4, right E0+g0, g0=floor(R/2)); belts Y+0..Y+1 at each ex column.
function blOZ(S){
  const {mk,bx,Y,R,E0}=S,L=blZL(R),g0=Math.floor(R/2),bc=PLC_BELT[mk],items=[];
  const xs=L.c===1?[E0]:[E0+g0-4,E0+g0];
  for(const x of xs)items.push({cls:bx,x,y:Y+2,rot:0,h:0,pid:0,ct:[]});
  for(let j=0;j<R;j++)for(let y=Y;y<=Y+1;y++)items.push({cls:bc,x:E0+j,y,rot:1,h:0,pid:0});
  return{ok:true,items,xs};
}
// blFlip(items,XM,mcF): mirror a zone around x=XM (x'=XM-x-(w-1)). Belts/UG rot 0<->2; splitters rot 0->2 with W/S off; machines keep rot, off = mcF.off (blMachine(cls,1,true)); containers move only.
function blFlip(items,XM,mcF){
  if(!mcF||!mcF.ok)return{ok:false,why:mcF&&mcF.why||'BL: flip, no mirrored machine'};
  const out=items.map(b=>{
    const nb={...b,x:XM-b.x-(dim(b).w-1)};
    if(PLC_BELT.includes(b.cls)||PLC_UG.includes(b.cls))nb.rot=b.rot===0?2:b.rot===2?0:b.rot;
    else if(PLC_SPL.includes(b.cls)){nb.rot=b.rot===0?2:b.rot;nb.off=pfSplOff(b.cls,2,['W','S'])}
    else if(!b.cls.startsWith('DAT_Container'))nb.off=mcF.off;
    return nb});
  return{ok:true,items:out};
}
// BL H1 horizontal zones: IZ (containers + input paths) west of the wall x=30, FB (machine rows) east, sink containers at x=55. One 30x30 block; rows packed at pitch P.
// blHA(yRow,c,ya,side,xp,pyIn): optional pyIn = explicit port row per row (H6a, non-adjacent containers); default = contiguous port block. Port per row (s=floor((4c-R)/2), row i -> port ya+s+i). Flow dir: in = sign(yRow-py) (north -1 rot 3, south +1 rot 1); out = sign(py-yRow).
// Column: in: x=xp+1+k (north group k from top, south group k from bottom); out: x=xp-1-k (down group k from top, up group k from bottom). Straight rows: col null.
function blHA(yRow,c,ya,side,xp,pyIn){
  const R=yRow.length,s=Math.floor((4*c-R)/2),py=pyIn||yRow.map((_,i)=>ya+s+i),dir=yRow.map((y,i)=>Math.sign(side==='in'?y-py[i]:py[i]-y)),col=new Array(R).fill(null);
  const top=side==='in'?-1:1;   // group counted from the top row (in: north, out: down); the other group from the bottom
  for(const d of [-1,1]){
    const idx=[...Array(R).keys()].filter(i=>dir[i]===d);
    if(d!==top)idx.reverse();
    idx.forEach((i,k)=>col[i]=side==='in'?xp+1+k:xp-1-k);
  }
  return{py,col,dir};
}
// blHIZ(S): S={mk,bx,raw,R,P,y0,Y}. Containers at (cx, Y+ya+4j), ports E at xp=cx+4. Row j: belts xp..col-1 at py (rot 0), corner at col (rot 3 north / 1 south), vertical, corner at yIn (rot 0), belts col+1..29 at yIn.
function blHIZ(S){
  const {mk,bx,raw,R,P,y0,Y}=S,bc=PLC_BELT[mk],c=Math.ceil(R/4),ncol=Math.ceil(R/2),dn=S.pyI?Array.from({length:R},(_,j)=>Math.sign(y0+P*j-S.pyI[j])):null,xp=S.pyI?28-Math.max(dn.filter(d=>d<0).length,dn.filter(d=>d>0).length):28-ncol,cx=xp-4,items=[];   // H6b fix: explicit port rows size xp by the larger blHA group
  const yR=Array.from({length:R},(_,j)=>y0+P*j),yMid=(yR[0]+yR[R-1])/2,ya=Math.min(Math.max(Math.floor(yMid-2*c),1),29-4*c);
  const A=blHA(yR,c,ya,'in',xp,S.pyI),bt=(x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});   // H6b: S.pyI explicit port rows
  for(let j=0;j<(S.ind?0:c);j++)items.push({cls:bx,x:cx,y:Y+(S.ca?S.ca[j]:ya+4*j),rot:0,h:0,pid:0,ct:[{item:raw,n:0,inf:true}],...(S.dock?{dk:'in'}:{})});   // H6b: S.ca container rows, dk 'in' for a normal input dock; H6c: S.ind = no containers
  const x0=S.ind?0:xp,tag=(b,f)=>{if(f&&S.ind){b.dk='ie';b.di=raw;b.yb=Y}return b};   // H6c: industrial lanes start at x=0 and their first belt is tagged 'ie' (nlDockApply builds the dock + asm)
  for(let j=0;j<R;j++){
    const yI=Y+yR[j],py=Y+A.py[j],d=A.dir[j];
    if(d===0){for(let x=x0;x<=29;x++)items.push(tag(bt(x,yI,0),x===x0));continue}
    const xc=A.col[j];
    for(let x=x0;x<xc;x++)items.push(tag(bt(x,py,0),x===x0));
    items.push(bt(xc,py,d<0?3:1));
    for(let y=py+d;y!==yI;y+=d)items.push(bt(xc,y,d<0?3:1));
    items.push(bt(xc,yI,0));
    for(let x=xc+1;x<=29;x++)items.push(bt(x,yI,0));
  }
  return{ok:true,items,xp,cols:A.col,cx,ya,py:A.py};
}
// blHFB(S): S={mk,spMk,cls,rec,mc,M,R,Y,y0,bx}. Row j: blRow at yIn (collector to column xEx), manifold from x=30; output path: column (rot 1 down / 3 up), corner at py (rot 0), belts to the sink W port xp_o=54. Sink containers at (55, Y+ya+4j).
function blHFB(S){
  const {mk,spMk,cls,rec,mc,M,R,Y,y0,bx,B=30,nextR=0}=S,P=mc.h+2,bc=PLC_BELT[mk],c=S.c||Math.ceil(R/4),items=[];
  const xc0=nextR?B+24-Math.ceil(nextR/2):B+25,xp=nextR?xc0-1:B+24;   // H4: non-last sink leaves its E face to the next stage's input
  const yR=Array.from({length:R},(_,j)=>y0+P*j),yO=yR.map(y=>y+P-1),yMid=(yO[0]+yO[R-1])/2,ya=Math.min(Math.max(Math.floor(yMid-2*c),1),29-4*c);
  const A=blHA(yO,c,ya,'out',xp,S.pyO),X0=B+1+(mc.xin===0?1:0),yOut=[],exCols=[];   // H6b: S.pyO explicit port rows
  for(let j=0;j<c;j++)items.push({cls:bx,x:xc0,y:Y+(S.ca?S.ca[j]:ya+4*j),rot:0,h:0,pid:0,ct:[],...(S.dock&&!nextR?{dk:'out'}:{})});   // H6b: S.ca rows, dk 'out' on the last stage
  for(let j=0;j<R;j++){
    const d=A.dir[j],xcol=d===0?xp:A.col[j],py=A.py[j];
    const r=blRow({mk,spMk,cls,rec,mc,m:M,X0,yIn:Y+yR[j],colX:B,xEx:xcol});
    if(!r.ok)return r;
    const yo=Y+yO[j],last=r.items[r.items.length-1];
    last.rot=d<0?3:d>0?1:0;
    items.push(...r.items);
    yOut.push(yo);exCols.push(xcol);
    if(d===0)continue;
    const bt=(x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});
    for(let y=yo+d;y!==Y+py;y+=d)items.push(bt(xcol,y,d<0?3:1));
    items.push(bt(xcol,Y+py,0));
    for(let x=xcol+1;x<=xp;x++)items.push(bt(x,Y+py,0));
  }
  return{ok:true,items,yOut,exCols,ya,py:A.py,c,xc0};
}
// blHIN(S): H4 input rows of the next stage. S={mk,bx,xc0,ya,c,R,P,y0,Y,B}: rows from the sink containers' E face (xp=xc0+4, sink already placed) to the wall x=B+29 (rot 0), no containers. Same port/column rule as blHIZ.
function blHIN(S){
  const {mk,xc0,ya,c,R,P,y0,Y,B}=S,bc=PLC_BELT[mk],xp=xc0+4,items=[],end=B+29;
  const yR=Array.from({length:R},(_,j)=>y0+P*j),A=blHA(yR,c,ya,'in',xp),bt=(x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});
  for(let j=0;j<R;j++){
    const yI=Y+yR[j],py=Y+A.py[j],d=A.dir[j];
    if(d===0){for(let x=xp;x<=end;x++)items.push(bt(x,yI,0));continue}
    const xc=A.col[j];
    for(let x=xp;x<xc;x++)items.push(bt(x,py,0));
    items.push(bt(xc,py,d<0?3:1));
    for(let y=py+d;y!==yI;y+=d)items.push(bt(xc,y,d<0?3:1));
    items.push(bt(xc,yI,0));
    for(let x=xc+1;x<=end;x++)items.push(bt(x,yI,0));
  }
  return{ok:true,items,py:A.py};
}
