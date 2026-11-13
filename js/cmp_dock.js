// CMP C7a/b: normal docks of the composer (plain globals). Spec: vault main-sequence/tasks/2026-11-13-composer-docks.md. nl_dock.js is NOT used (the composer returns fixedTile).
// W cells (raw input): slot row M=16*k+6 (k<d.h), container 4x4 at y=M-1 flush at x=0 of its SRC hub, rot-0 belts at rows M,M+1 from the hub's x=-1 to the container, BPO_Dock {x:gx-1,y:gy+k,rot:2}.
// E cells (output): container flush q.x+4===W-1 of the OZ block, rot-0 belts at rows M,M+1 on x=W-1..W, BPO_Dock {x:gx+d.w,y:gy+k,rot:0} (nl_dock hz branches).
// cmpCellsFor(D,cap,lanes,avail): cells n=max(ceil(D/(2cap)),ceil(lanes/4)); use=docks that fit (<=avail slots, <=lanes). Never refuses.
const cmpCellsFor=(D,cap,lanes,avail)=>{const n=Math.max(Math.ceil(D/(2*cap)-1e-9),Math.ceil(lanes/4),1);return{n,use:Math.max(1,Math.min(n,avail,lanes))}};
const cmpR1=v=>Math.round(v*10)/10;
// plan the containers of one SRC / OZ hub: a={kind:'in'|'out',name,D,rows (lane rows of the hub),H,dh}. dk={mk,notes:[]}. -> extra cmpPool params {ca,dock:true,dkx,pyOut|pyIn} | {ok:false,why}
function cmpDockHub(dk,a){
  const {D,rows,H,dh}=a,cap=MKS[dk.mk][1],{n,use}=cmpCellsFor(D,cap,rows.length,dh),Tn=Math.max(use,Math.ceil(rows.length/4)),ca=[];
  for(let k=0;k<use;k++)ca.push(16*k+5);
  for(let y=1;ca.length<Tn&&y<=H-5;y++)if(ca.every(v=>y+3<v||y>v+3))ca.push(y);   // undocked extras (lanes>4 per docked slot)
  if(ca.length<Tn)return{ok:false,why:'dock hub needs '+Tn+' containers but the block holds '+ca.length};
  ca.sort((x,y)=>x-y);
  const order=rows.map((_,i)=>i).sort((x,y)=>rows[x]-rows[y]),py=new Array(rows.length),sz=[];
  let p=0,docked=0;
  ca.forEach((cy,g)=>{const r=Math.floor(rows.length/Tn)+(g<rows.length%Tn?1:0),s=Math.floor((4-r)/2);sz.push(r);for(let i=0;i<r;i++)py[order[p++]]=cy+s+i;if(((cy-5)%16===0)&&(cy-5)/16<use)docked+=r});
  const got=Math.min(D*docked/rows.length,use*2*cap);
  if(got<D-1e-6)dk.notes.push('Dock-limited: '+a.name+' '+cmpR1(got)+'/min of '+cmpR1(D)+'/min (needs '+n+' docks)');
  return{ca,dock:true,dkx:{r:Math.min(D/use,2*cap),n:use,name:a.name},[a.kind==='in'?'pyOut':'pyIn']:py};
}
// apply to the tile T (mutates T.ms, T.blocks, T.ov). c={cls,mk}. fix={nodes,routed} optional (shifted with the tile). -> {ok,raw,oz,shx,sh} | {ok:false,why}
function cmpDockApply(c,T,fix={}){
  const d=dim({cls:c.cls,rot:0}),TW=d.w*FC,TH=d.h*FC,fl=floorRect({cls:c.cls,x:0,y:0,h:0,rot:0}),W=fl.w,bc=PLC_BELT[c.mk],dc=plcCls('BPO_Dock'),ad=c.cls===plcCls('BPO_Station_03')?1:0,A=16*ad,adc=plcCls('BPO_StationAdapter_01'),ads=new Set(),ms=T.ms,blocks=T.blocks,add=[],occ=new Set(),extra=[];
  const cells=(b)=>{const e=dim({cls:b.cls,rot:b.rot||0}),r=[];for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)r.push((b.x+i)+','+(b.y+j));return r};
  blocks.forEach(b=>cells(b).forEach(k=>occ.add(k)));
  const belt=(x,y,rot)=>add.push({cls:bc,x,y,h:0,rot,pid:0,dk:'p'});
  const slot=ly=>{for(let k=0;k<d.h;k++){const M=16*k+6;if(ly<=M&&ly+3>=M+1)return k}return -1};
  const dock=(q,side)=>{
    const gx=Math.floor(q.x/TW),gy=Math.floor(q.y/TH),k=slot(q.y-gy*TH),x0=gx*TW,out=side==='E',ok=k>=0&&(out?q.x+4===x0+W-1:q.x-x0<=1);
    // 2x2c (ad=1): Station Adapter (1x2 units, open side) between block and dock, dock one unit further out, belts 16 cells longer
    const b=ok&&{cls:dc,x:out?(gx+1)*d.w+ad:gx*d.w-1-ad,y:gy*d.h+k,rot:out?0:2},
      ab=ok&&ad&&!ads.has(side+gx+'|'+gy)&&{cls:adc,x:out?(gx+1)*d.w:gx*d.w-1,y:gy*d.h,rot:out?0:2};
    if(!ok||cells(b).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z)))){extra.push(q);return false}
    cells(b).forEach(z=>occ.add(z));blocks.push(b);
    if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab);ads.add(side+gx+'|'+gy)}
    const M=gy*TH+16*k+6;
    for(const y of[M,M+1])if(out){for(let x=x0+W-1;x<=x0+W+A;x++)belt(x,y,0)}else for(let x=x0-1-A;x<=q.x-1;x++)belt(x,y,0);
    q.dd={side,gx:gx*d.w,gy:gy*d.h,u:k,r:q.dkx.r,n:q.dkx.n,name:q.dkx.name};
    return true};
  for(const q of ms.filter(q=>q.dk==='in'||q.dk==='out'))if(!dock(q,q.dk==='out'?'E':'W')&&!q.dd){delete q.dk;delete q.dkx}
  for(const q of ms)if(q.dd)delete q.dkx;
  const sh=-Math.min(0,...blocks.map(b=>b.y)),shx=-Math.min(0,...blocks.map(b=>b.x)),all=[...ms,...add];
  for(const m of all){m.x+=16*shx;m.y+=16*sh}
  for(const b of blocks){b.x+=shx;b.y+=sh}
  for(const m of ms)if(m.dd){m.dd.gx+=shx;m.dd.gy+=sh}
  if(fix.nodes)for(const q of fix.nodes){q.gx+=shx;q.gy+=sh;q.fb.x+=16*shx;q.fb.y+=16*sh;q.ct=q.ct.map(s=>{const[a,b]=s.split(',').map(Number);return(a+16*shx)+','+(b+16*sh)})}
  if(fix.routed)for(const q of fix.routed){q.x+=16*shx;q.y+=16*sh}
  const seen=new Set();let ov=0;
  for(const m of all){const e=dim(m);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++){const kk=m.x+i+','+(m.y+j);if(seen.has(kk))ov++;else seen.add(kk)}}
  T.ms=all;T.ov=ov;
  const info=q=>({item:q.ct&&q.ct[0]?q.ct[0].item:null,x:q.x,y:q.y,dd:q.dd});
  return{ok:true,raw:all.filter(q=>q.dd&&q.dk==='in').map(q=>({...info(q),kind:'src'})),oz:all.filter(q=>q.dd&&q.dk==='out').map(info),shx,sh};
}
