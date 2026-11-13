// CMP C7a/b: normal docks of the composer (plain globals). Spec: vault main-sequence/tasks/2026-11-13-composer-docks.md. nl_dock.js is NOT used (the composer returns fixedTile).
// W cells (raw input): slot row M=16*k+6 (k<d.h), container 4x4 at y=M-1 flush at x=0 of its SRC hub, rot-0 belts at rows M,M+1 from the hub's x=-1 to the container, BPO_Dock {x:gx-1,y:gy+k,rot:2}.
// E cells (output): container flush q.x+4===W-1 of the OZ block, rot-0 belts at rows M,M+1 on x=W-1..W, BPO_Dock {x:gx+d.w,y:gy+k,rot:0} (nl_dock hz branches).
// cmpCellsFor(D,cap,lanes,avail): cells n=max(ceil(D/(2cap)),ceil(lanes/4)); use=docks that fit (<=avail slots, <=lanes). Never refuses.
const cmpCellsFor=(D,cap,lanes,avail)=>{const n=Math.max(Math.ceil(D/(2*cap)-1e-9),Math.ceil(lanes/4),1);return{n,use:Math.max(1,Math.min(n,avail,lanes))}};
const cmpR1=v=>Math.round(v*10)/10;
// plan the containers of one SRC / OZ hub: a={kind:'in'|'out',name,D,rows (lane rows of the hub),H,dh}. dk={mk,notes:[]}. -> extra cmpPool params {ca,dock:true,dkx,pyOut|pyIn} | {ok:false,why}
function cmpDockHub(dk,a){
  const {D,rows,H,dh}=a,cap=MKS[dk.mk][1];
  if(a.kind==='in'?dk.indIn:dk.indOut){   // industrial (C7h/k): Dock_2 has 2 lane groups (rows 4..7 / 22..25 of the 30-row block, 4 lanes each, ONE item per group); d.h=2 blocks only
    const R=rows.length,g=Math.ceil(R/4);
    if(dh===2&&R<=8&&H>=26&&!a.tree&&(a.kind==='out'||!a.col)){   // input hubs deeper than the west column cannot reach the dock
      const order=rows.map((_,i)=>i).sort((x,y)=>rows[x]-rows[y]),py=new Array(R);order.forEach((o,i)=>py[o]=i<4?4+i:22+i-4);
      const lim=g*4*cap,got=Math.min(D,lim);
      if(got<D-1e-6)dk.notes.push('Dock-limited: '+a.name+' '+cmpR1(got)+'/min of '+cmpR1(D)+'/min (needs '+Math.ceil(D/(4*cap)-1e-9)+' industrial dock groups)');
      return{ind:true,[a.kind==='in'?'pyOut':'pyIn']:py,dkx:{r:got/g,n:1,name:a.name,ind:1}};
    }
    dk.notes.push('Industrial dock not possible for '+a.name+' ('+(dh!==2?'block 1 unit high':R>8?R+' lanes, max 8':a.tree?'output of a merge tree not built yet':'source not at the west edge')+'): normal docks used');
  }
  const{n,use}=cmpCellsFor(D,cap,rows.length,dh),Tn=Math.max(use,Math.ceil(rows.length/4)),ca=[];
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
  const d=dim({cls:c.cls,rot:0}),TW=d.w*FC,TH=d.h*FC,fl=floorRect({cls:c.cls,x:0,y:0,h:0,rot:0}),W=fl.w,bc=PLC_BELT[c.mk],dc=plcCls('BPO_Dock'),ad=c.cls===plcCls('BPO_Station_03')?1:0,A=16*ad,adc=plcCls('BPO_StationAdapter_01'),ads=new Set(),ms=T.ms,blocks=T.blocks,add=[],occ=new Set(),extra=[],miss=[];
  const cells=(b)=>{const e=dim({cls:b.cls,rot:b.rot||0}),r=[];for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)r.push((b.x+i)+','+(b.y+j));return r};
  blocks.forEach(b=>cells(b).forEach(k=>occ.add(k)));
  const belt=(x,y,rot)=>add.push({cls:bc,x,y,h:0,rot,pid:0,dk:'p'});
  const slot=ly=>{for(let k=0;k<d.h;k++){const M=16*k+6;if(ly<=M&&ly+3>=M+1)return k}return -1};
  const dockV=(q,side)=>{   // N/S input cells (FEED hubs): nl_dock vertical formulas; door cols 16u+6,7; container y=1 (N) / H-5 (S), belt rows through the wall
    const gx=Math.floor(q.x/TW),gy=Math.floor(q.y/TH),u=Math.floor((q.x-gx*TW)/16),n=side==='N',M=gx*TW+16*u+6,y0=gy*TH,
      b={cls:dc,x:gx*d.w+u,y:n?gy*d.h-1-ad:(gy+1)*d.h+ad,rot:n?3:1},ab=ad&&!ads.has(side+gx+'|'+gy)&&{cls:adc,x:gx*d.w,y:n?gy*d.h-1:(gy+1)*d.h,rot:n?3:1};
    if(u>=d.w||cells(b).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z)))){extra.push(q);return false}
    cells(b).forEach(z=>occ.add(z));blocks.push(b);if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab);ads.add(side+gx+'|'+gy)}
    for(const x of[M,M+1])if(n)for(let y=y0-1-A;y<=y0;y++)belt(x,y,1);else for(let y=y0+fl.h-1;y<=y0+fl.h+A;y++)belt(x,y,3);
    q.dd={side,gx:gx*d.w,gy:gy*d.h,u,r:q.dkx.r,n:q.dkx.n,name:q.dkx.name};
    return true};
  const dock=(q,side)=>{
    if(q.dkx&&q.dkx.side&&q.dkx.side!=='W'&&side==='W')return dockV(q,q.dkx.side);
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
  for(const q of ms.filter(q=>q.dk==='in'||q.dk==='out'))if(!dock(q,q.dk==='out'?'E':'W')&&!q.dd){miss.push((q.dk==='out'?'out ':'in ')+q.dkx.name);delete q.dk;delete q.dkx}
  // industrial (hz, d.h=2): one BPO_Dock_2 per hub row, nl_dock.js hz assembly (nlIndAsm transposed) shifted to the row; lanes tagged ie (input, west of block 0) / oe (output, east of the last column)
  const TR=[1,0,3,2],asm=nlIndAsm(),d2=plcCls('BPO_Dock_2'),indGo=(tag,out)=>{
    const rows=new Map();
    for(const q of ms.filter(q=>q.dk===tag)){const g=Math.floor(q.y/TH),ly=q.y-g*TH;if(d.h!==2||!((ly>=4&&ly<=7)||(ly>=22&&ly<=25))||(out?Math.floor(q.x/TW)<1:Math.floor(q.x/TW)!==0))return'dock slot misaligned';if(!rows.has(g))rows.set(g,[]);rows.get(g).push(q)}
    for(const [g,E] of rows){
      const oy=g*TH,col=out?Math.floor(E[0].x/TW):-1,ox=out?(col+1)*TW+A:-16-A,dx=out?(col+1)*d.w:-1,db={cls:d2,x:out?dx+ad:-3-ad,y:g*d.h,rot:out?0:2},ab=ad&&{cls:adc,x:dx,y:g*d.h,rot:out?0:2};
      if(cells(db).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z))))return'industrial dock overlaps another block';
      cells(db).forEach(z=>occ.add(z));blocks.push(db);if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab)}
      const used=[0,1].map(k=>E.filter(q=>(q.y-oy<16?0:1)===k)),dkx=E[0].dx||{},bq=[];
      for(const b of asm.boxes){
        const x=out?ox+10-b.y:ox+b.y,y=oy+(out?26-b.x:b.x),g2=(y-oy<16?0:1),main=b.y===9&&(b.x===4||b.x===22),m={cls:NLD.BOX_I,x,y,h:0,rot:0,pid:0,ct:[],dk:out?'out':'in'};
        if(main&&used[g2].length){if(!out)m.ct=[{item:used[g2][0].di,n:0,inf:true}];m.dd={side:out?'E':'W',gx:0,gy:g*d.h,u:g2,r:dkx.r,n:1,name:dkx.name,ind:1}}
        add.push(m)}
      for(const k of asm.belts)belt(out?ox+13-k.y:ox+k.y,out?oy+29-k.x:oy+k.x,TR[k.rot]);
      for(const q of E)for(let x=out?q.x+1:-3-A;x<=(out?ox:-1);x++)belt(x,q.y,0);
      E.forEach(q=>{delete q.dk;delete q.dx})}
    return null};
  const ierr=indGo('ie',false)||indGo('oe',true);if(ierr)return{ok:false,why:ierr};
  const boxes=add.filter(m=>m.cls===NLD.BOX_I);for(const m of boxes){ms.push(m);add.splice(add.indexOf(m),1)}
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
  return{ok:true,raw:all.filter(q=>q.dd&&q.dk==='in').map(q=>({...info(q),kind:'src'})),oz:all.filter(q=>q.dd&&q.dk==='out').map(info),miss:[...new Set(miss)],shx,sh};
}

// CMP C7d: FEED hub (all-raw first stage / tree feed node) at block column 0 with docks. Containers flush x=0 (docked ones on W slots 16k+5, one raw per slot, extras undocked), lanes routed by cmpRoute inside x=4..W-1.
// S as cmpFeed + names:[], D:[per raw rate], dh (block units high). Falls back to cmpFeed (infinite containers) + note when the router fails. Seed raw: finite container, no dock.
function cmpFeedDock(S,dk,dh,D,dw,sides){
  const {W,H,mk,bx,sets,M,rawItems}=S,cap=MKS[dk.mk][1],bc=PLC_BELT[mk],nR=rawItems.length,seed=r=>S.seed!=null&&rawItems[r]===S.seed;
  const rows=r=>sets.flatMap(s=>Array.from({length:M},(_,c)=>(s.t?s.t[r]:s.o+r*M)+c));
  if(H<30)sides=[];   // ponytail: 14-row blocks are too tight for N/S containers (flood mixed items); W slots only
  const free=[...Array.from({length:dh},(_,k)=>({side:'W',x:0,y:16*k+5})),...(sides||[]).flatMap(sd=>Array.from({length:dw},(_,u)=>({side:sd,x:16*u+5,y:sd==='N'?1:H-5})))],cont=[];   // cont: {r,x,y,docked,side}
  const use=new Array(nR).fill(0);
  for(let r=0;r<nR;r++){if(seed(r))continue;const left=rawItems.slice(r+1).filter((_,i)=>!seed(r+1+i)).length,n=cmpCellsFor(D[r],cap,rows(r).length,free.length-left).use;
    for(let i=0;i<n&&free.length;i++){cont.push({r,...free.shift(),docked:1});use[r]++}}
  const nt=[],fb=why=>{if(sides&&sides.length)return cmpFeedDock(S,dk,dh,D,dw,[]);dk.notes.push('Dock not built for the raw inputs of this stage ('+why+'): raw containers stay infinite sources');return cmpFeed(S)};
  for(let r=0;r<nR;r++){const L=rows(r).length,need=Math.max(Math.ceil(L/4),seed(r)?1:use[r]||1),have=cont.filter(c=>c.r===r).length;
    for(let i=have;i<need;i++){let y=1;while(y<=H-5&&cont.some(c=>c.x<4&&Math.abs(c.y-y)<4))y++;if(y>H-5)return fb('block too short for '+need+' containers');cont.push({r,x:0,y,docked:0})}}
  const items=[],src=[],snk=[],blk=new Set();
  for(let r=0;r<nR;r++){
    const mine=cont.filter(c=>c.r===r).sort((a,b)=>a.y-b.y),tr=rows(r).sort((a,b)=>a-b),T=mine.length;let p=0;
    mine.forEach((c,g)=>{const n=Math.floor(tr.length/T)+(g<tr.length%T?1:0),s0=Math.floor((4-n)/2);
      const q={cls:bx,x:c.x,y:c.y,rot:0,h:0,pid:0,ct:[{item:rawItems[r],n:0,inf:!seed(r)}]};
      if(c.docked)Object.assign(q,{dk:'in',dkx:{r:Math.min(D[r]/use[r],2*cap),n:use[r],name:S.names[r],side:c.side}});
      items.push(q);if(c.x)for(let xx=c.x-4;xx<c.x;xx++)for(let i=0;i<4;i++)blk.add(xx+','+(c.y+i));for(let i=0;i<n;i++)src.push({x:c.x,y:c.y+s0+i,item:rawItems[r]}),snk.push({x:W-5,y:tr[p++],item:rawItems[r]})});
    const got=Math.min(D[r],use[r]*2*cap);
    if(!seed(r)&&got<D[r]-1e-6)nt.push('Dock-limited: '+S.names[r]+' '+cmpR1(got)+'/min of '+cmpR1(D[r])+'/min (needs '+Math.ceil(D[r]/(2*cap)-1e-9)+' docks)');
  }
  const rt=cmpRoute({W:W-4,H,rowsN:1,mk,sources:src,sinks:snk,blocked:blk,ugMax:def(PLC_UG[mk]).maxApart,eastStart:true});
  if(!rt.ok)return fb('lane routing failed');
  rt.items.forEach(b=>items.push({...b,x:b.x+4}));dk.notes.push(...nt);
  return{ok:true,why:'',items};
}
