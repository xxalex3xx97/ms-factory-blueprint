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
