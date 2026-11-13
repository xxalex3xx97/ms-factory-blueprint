// BL2-BL3 geometry (blMachine, blRow, blStage, blTower). Filled in BL2+.
// blMachine(cls): first rot 0..3 whose ports give one input (N face, not out) and one output (S face, not in); other ports must be toggleable and go to off.
function blMachine(cls){
  for(let rot=0;rot<4;rot++){
    const ps=portsOf({cls,x:0,y:0,rot,off:[]});
    const pin=ps.filter(p=>p.nx===0&&p.ny===-1&&p.dir!=='out').sort((a,b)=>a.x-b.x)[0];
    const pout=ps.filter(p=>p.nx===0&&p.ny===1&&p.dir!=='in').sort((a,b)=>a.x-b.x)[0];
    if(!pin||!pout)continue;
    const others=ps.filter(p=>p!==pin&&p!==pout);
    if(others.some(p=>!p.tg))continue;
    const d=dim({cls,rot});
    return{ok:true,rot,w:d.w,h:d.h,xin:pin.x,xout:pout.x,off:others.map(p=>p.key).sort()};
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
// blStage(S): Rs rows fed from source/sink container at (cx,Y); trunks run into the container at Yc. S.cls = machine class, S.M = machines per full row (E0 = X0+M*w).
function blStage(S){
  const {mk,spMk,bx,cx,Y,mc,cls,rec,rowsM,PS,PN,first,ind,item,M}=S;
  const bd=dim({cls:bx,rot:0}),bh=bd.h,bw=bd.w,P=mc.h+2,h=mc.h,w=mc.w,Rs=rowsM.length;
  const X0=cx+bw,E0=X0+M*w,yIn=j=>Y+bh+1+j*P,items=[],bc=PLC_BELT[mk];
  if(Rs<1||PS.length<Rs||PN.length<Rs)return{ok:false,why:'BL: stage ports'};
  const vy0=first&&ind?0:Y+bh;
  for(let j=0;j<Rs;j++){
    const yI=yIn(j),col=cx+PS[Rs-1-j],xEx=E0+(Rs-1-j);
    for(let y=vy0;y<yI;y++){
      const b={cls:bc,x:col,y,rot:1,h:0,pid:0};
      if(first&&ind&&y===0){b.dk='ie';b.di=item}
      items.push(b);
    }
    const r=blRow({mk,spMk,cls,rec,mc,m:rowsM[j],X0,yIn:yI,colX:col,xEx});
    if(!r.ok)return r;
    items.push(...r.items);
  }
  const Yb=yIn(Rs-1)+h+2,Yc=Yb+Rs,sinkCols=[];
  for(let j=0;j<Rs;j++){
    const yr=Yb+(Rs-1-j),yOut=yIn(j)+1+h,ex=E0+(Rs-1-j),cN=cx+PN[Rs-1-j];
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
    const rowsM=Tw.stages[s].rowsM,Rs=rowsM.length;
    if(s===0&&Tw.ind&&Rs>2)return{ok:false,why:'BL: industrial input allows 2 rows in stage 0'};
    const PS=s===0&&Tw.ind?[0,2]:SP.slice(0,Rs);
    const st=blStage({mk:Tw.mk,spMk:Tw.spMk,bx:Tw.bx,cx:Tw.cx,Y,mc:Tw.mc,cls:Tw.cls,rec:Tw.rec,rowsM,PS,PN:NP.slice(0,Rs),first:s===0,ind:!!Tw.ind,item:Tw.raw,M:Tw.M});
    if(!st.ok)return st;
    items.push(...st.items);
    sink={cls:Tw.bx,x:Tw.cx,y:st.Yc,rot:0,h:0,pid:0,ct:[]};items.push(sink);
    Y=st.Yc;sinkCols=st.sinkCols;
  }
  if(Tw.dock&&Tw.dock.out==='nrm')sink.dk='out';
  return{ok:true,items,Yend:Y,sinkCols};
}
