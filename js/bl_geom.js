// BL2-BL3 geometry (blMachine, blRow, blStage, blTower). Filled in BL2+.
// blMachine(cls): first rot 0..3 whose ports give one input (N face, not out) and one output (S face, not in); other ports must be toggleable and go to off.
function blMachine(cls,k=1){
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
