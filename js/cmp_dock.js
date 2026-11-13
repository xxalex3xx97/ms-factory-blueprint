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
    if((dh===2&&R<=8&&H>=26||dh===1&&R<=4&&H>=10)&&(a.kind==='out'||!a.col)){   // input hubs deeper than the west column cannot reach the dock
      const order=rows.map((_,i)=>i).sort((x,y)=>rows[x]-rows[y]),py=new Array(R);order.forEach((o,i)=>py[o]=dh===1?(a.j%2?6:4)+i:i<4?4+i:22+i-4);
      const lim=g*4*cap,got=Math.min(D,lim);
      if(got<D-1e-6)dk.notes.push('Dock-limited: '+a.name+' '+cmpR1(got)+'/min of '+cmpR1(D)+'/min (needs '+Math.ceil(D/(4*cap)-1e-9)+' industrial dock groups)');
      return{ind:true,[a.kind==='in'?'pyOut':'pyIn']:py,dkx:{r:got/g,n:1,name:a.name,ind:1}};
    }
    dk.notes.push('Industrial dock not possible for '+a.name+' ('+(dh>2?'block over 2 units high':R>8?R+' lanes, max 8':a.tree?'output of a merge tree not built yet':'source not at the west edge')+'): normal docks used');
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
function cmpDockApply(c,T,fix={}){const P=fix.P||dim({cls:c.cls,rot:0}).h,TR=P*FC;
  const d=dim({cls:c.cls,rot:0}),TW=d.w*FC,TH=d.h*FC,fl=floorRect({cls:c.cls,x:0,y:0,h:0,rot:0}),W=fl.w,bc=PLC_BELT[c.mk],dc=plcCls('BPO_Dock'),ad=c.cls===plcCls('BPO_Station_03')?1:0,A=16*ad,adc=plcCls('BPO_StationAdapter_01'),ads=new Set(),ms=T.ms,blocks=T.blocks,add=[],occ=new Set(),extra=[],miss=[];
  const cells=(b)=>{const e=dim({cls:b.cls,rot:b.rot||0}),r=[];for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)r.push((b.x+i)+','+(b.y+j));return r};
  blocks.forEach(b=>cells(b).forEach(k=>occ.add(k)));
  const belt=(x,y,rot)=>add.push({cls:bc,x,y,h:0,rot,pid:0,dk:'p'});
  const slot=ly=>{for(let k=0;k<d.h;k++){const M=16*k+6;if(ly<=M&&ly+3>=M+1)return k}return -1};
  const dockV=(q,side)=>{   // N/S input cells (FEED hubs): nl_dock vertical formulas; door cols 16u+6,7; container y=1 (N) / H-5 (S), belt rows through the wall
    const gx=Math.floor(q.x/TW),gy=Math.floor(q.y/TR),u=Math.floor((q.x-gx*TW)/16),n=side==='N',M=gx*TW+16*u+6,y0=gy*TR,
      b={cls:dc,x:gx*d.w+u,y:n?gy*P-1-ad:gy*P+d.h+ad,rot:n?3:1},ab=ad&&!ads.has(side+gx+'|'+gy)&&{cls:adc,x:gx*d.w,y:n?gy*P-1:gy*P+d.h,rot:n?3:1};
    if(u>=d.w||cells(b).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z)))){q.why=u>=d.w?'no dock unit at this column':'the dock cells overlap another block';extra.push(q);return false}
    cells(b).forEach(z=>occ.add(z));blocks.push(b);if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab);ads.add(side+gx+'|'+gy)}
    for(const x of[M,M+1])if(n)for(let y=y0-1-A;y<=y0;y++)belt(x,y,1);else for(let y=y0+fl.h-1;y<=y0+fl.h+A;y++)belt(x,y,3);
    q.dd={side,gx:gx*d.w,gy:gy*P,u,r:q.dkx.r,n:q.dkx.n,name:q.dkx.name};
    return true};
  const dock=(q,side)=>{
    if(q.dkx&&q.dkx.side&&q.dkx.side!=='W'&&side==='W')return dockV(q,q.dkx.side);
    const gy=Math.floor(q.y/TR),k=slot(q.y-gy*TR),x0=q.hx!=null?q.hx:Math.floor(q.x/TW)*TW,hw=q.hw||W,u0=x0/FC,hu=q.hu||d.w,gx=u0/d.w,out=side==='E',ok=k>=0&&(out?q.x+4===x0+hw-1:q.x-x0<=1);   // SHAPE2: hub block origin / width / units from the hx,hw,hu tags (narrow hubs)
    // 2x2c (ad=1): Station Adapter (1x2 units, open side) between block and dock, dock one unit further out, belts 16 cells longer
    const b=ok&&{cls:dc,x:out?u0+hu+ad:u0-1-ad,y:gy*P+k,rot:out?0:2},
      ab=ok&&ad&&!ads.has(side+u0+'|'+gy)&&{cls:adc,x:out?u0+hu:u0-1,y:gy*P,rot:out?0:2};
    if(!ok||cells(b).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z)))){q.why=!ok?(out?'the output container is not flush with the east wall':'the container is not on a dock slot'):'the dock cells overlap another block';extra.push(q);return false}
    cells(b).forEach(z=>occ.add(z));blocks.push(b);
    if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab);ads.add(side+u0+'|'+gy)}
    const M=gy*TR+16*k+6;
    for(const y of[M,M+1])if(out){for(let x=x0+hw-1;x<=x0+hw+A;x++)belt(x,y,0)}else for(let x=x0-1-A;x<=q.x-1;x++)belt(x,y,0);
    q.dd={side,gx:u0,gy:gy*P,u:k,r:q.dkx.r,n:q.dkx.n,name:q.dkx.name};
    return true};
  for(const q of ms.filter(q=>q.dk==='in'||q.dk==='out'))if(!dock(q,q.dk==='out'?'E':'W')&&!q.dd){miss.push((q.dk==='out'?'out ':'in ')+q.dkx.name+'|'+q.why);delete q.dk;delete q.dkx}
  // industrial (hz, d.h=2): one BPO_Dock_2 per hub row, nl_dock.js hz assembly (nlIndAsm transposed) shifted to the row; lanes tagged ie (input, west of block 0) / oe (output, east of the last column)
  const TRO=[1,0,3,2],asm=nlIndAsm(),d2=plcCls('BPO_Dock_2'),indGo=(tag,out)=>{
    const rows=new Map(),S=d.h===1?2:1;   // d.h=1: one Dock_2 serves two adjacent strips (group A even strip, group B odd strip)
    for(const q of ms.filter(q=>q.dk===tag)){const g=Math.floor(q.y/(S*TR)),ly=q.y-g*S*TR;if(d.h>2||!((ly>=4&&ly<=7)||(ly>=22&&ly<=25))||(out&&(q.hx!=null?q.hx:Math.floor(q.x/TW)*TW)<1))return'dock slot misaligned';const kk=g+':'+(q.hx!=null?q.hx:Math.floor(q.x/TW)*TW);if(!rows.has(kk))rows.set(kk,[]);rows.get(kk).push(q)}   // SHAPE2: input hubs at any block column (dock on their west face)
    for(const [kk,E] of rows){
      const g=+kk.split(':')[0],oy=g*S*TR,e0=E[0],x0=+kk.split(':')[1],hw=e0.hw||W,hu=e0.hu||d.w,u0=x0/FC,col=e0.hc!=null?e0.hc:Math.floor(e0.x/TW),ox=out?x0+hu*16+A:x0-16-A,dx=out?u0+hu:u0-1,db={cls:d2,x:out?dx+ad:u0-3-ad,y:g*S*P,rot:out?0:2},ab=ad&&{cls:adc,x:dx,y:g*S*P,rot:out?0:2};
      if(cells(db).some(z=>occ.has(z))||(ab&&cells(ab).some(z=>occ.has(z))))return'industrial dock overlaps another block';
      cells(db).forEach(z=>occ.add(z));blocks.push(db);if(ab){cells(ab).forEach(z=>occ.add(z));blocks.push(ab)}
      const used=[0,1].map(k=>E.filter(q=>(q.y-oy<16?0:1)===k)),dkx=E[0].dx||{},bq=[];
      for(const b of asm.boxes){if(!used[(out?26-b.x:b.x)<16?0:1].length)continue;   // SHAPE2: a lane group without lanes gets no containers/belts
        const x=out?ox+10-b.y:ox+b.y,y=oy+(out?26-b.x:b.x),g2=(y-oy<16?0:1),main=b.y===9&&(b.x===4||b.x===22),m={cls:NLD.BOX_I,x,y,h:0,rot:0,pid:0,ct:[],dk:out?'out':'in'};
        if(main&&used[g2].length){if(!out)m.ct=[{item:used[g2][0].di,n:0,inf:true}];m.dd={side:out?'E':'W',gx:out?0:u0,gy:g*S*P,u:g2,r:(used[g2][0].dx||dkx).r,n:1,name:(used[g2][0].dx||dkx).name,ind:1};if(out&&fix.nodes)fix.nodes.filter(q=>q.pool===col&&q.row>=g*S&&q.row<(g+1)*S).forEach(q=>q.ct.push(x+','+y))}
        add.push(m)}
      for(const k of asm.belts)if(used[(out?29-k.x:k.x)<16?0:1].length)belt(out?ox+13-k.y:ox+k.y,out?oy+29-k.x:oy+k.x,TRO[k.rot]);
      for(const q of E)for(let x=out?q.x+1:x0-3-A;x<=(out?ox:x0-1);x++)belt(x,q.y,0);
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
function cmpFeedDock(S,dk,dh,D,dw,sides,why0){
  const {W,H,mk,bx,sets,M,rawItems}=S,cap=MKS[dk.mk][1],bc=PLC_BELT[mk],nR=rawItems.length,seed=r=>S.seed!=null&&rawItems[r]===S.seed;
  const mid=!S.allRaw,pass=mid?S.pass||[]:[],sl=r=>mid&&r>=(S.main||0)?r+1:r,rows=r=>sets.flatMap(s=>Array.from({length:M},(_,c)=>(s.t?s.t[sl(r)]:s.o+sl(r)*M)+c));
  // H<30 guard removed (D3 experiment)
  // mid-chain FEED (D2): the chain lanes pass through (routed as nets so raw lanes can UG-hop them), raws come from N/S side containers only (W edge is not this column's)
  const free=H<30?[...(sides||[]).includes('N')?Array.from({length:dw},(_,u)=>({side:'N',x:16*(dw-1-u)+5,y:1})):[],...(mid?[]:Array.from({length:dh},(_,k)=>({side:'W',x:0,y:16*k+5}))),...(sides||[]).includes('S')?Array.from({length:dw},(_,u)=>({side:'S',x:16*u+5,y:H-5})):[]]:[...(mid?[]:Array.from({length:dh},(_,k)=>({side:'W',x:0,y:16*k+5}))),...(sides||[]).flatMap(sd=>Array.from({length:dw},(_,u)=>({side:sd,x:16*u+5,y:sd==='N'?1:H-5})))].filter(c=>!mid||!pass.some(y=>y>=c.y-1&&y<=c.y+4)),cont=[];   // cont: {r,x,y,docked,side}
  const use=new Array(nR).fill(0);
  for(let r=0;r<nR;r++){if(seed(r))continue;const left=rawItems.slice(r+1).filter((_,i)=>!seed(r+1+i)).length,n=cmpCellsFor(D[r],cap,rows(r).length,free.length-left).use;
    for(let i=0;i<n&&free.length;i++){cont.push({r,...free.shift(),docked:1});use[r]++}}
  const nt=[],fb=why=>{if(sides&&sides.length){const n0=dk.notes.length;   // try a normal dock slot elsewhere: each single side, then the west column only; infinite containers are the last resort
      for(const sd of sides.length>1?[...sides.map(z=>[z]),[]]:[[]]){const r=cmpFeedDock(S,dk,dh,D,dw,sd,why);if(r.docked||!sd.length)return r;dk.notes.length=n0}}
    dk.notes.push('Dock not built for the raw inputs of this stage ('+(why0||why)+'): raw containers stay infinite sources');return Object.assign(cmpFeed(S),{docked:0})};
  for(let r=0;r<nR;r++){const L=rows(r).length,need=Math.max(Math.ceil(L/4),seed(r)?1:use[r]||1),have=cont.filter(c=>c.r===r).length;
    if(mid&&have<need)return fb('no free side unit for '+S.names[r]);
    for(let i=have;i<need;i++){let y=1;while(y<=H-5&&cont.some(c=>c.x<4&&Math.abs(c.y-y)<4))y++;if(y>H-5)return fb('block too short for '+need+' containers');cont.push({r,x:0,y,docked:0})}}
  const items=[],src=[],snk=[],blk=new Set();
  for(let r=0;r<nR;r++){
    const mine=cont.filter(c=>c.r===r).sort((a,b)=>a.y-b.y),tr=rows(r).sort((a,b)=>a-b),T=mine.length;let p=0;
    mine.forEach((c,g)=>{const n=Math.floor(tr.length/T)+(g<tr.length%T?1:0),s0=Math.floor((4-n)/2);
      const q={cls:bx,x:c.x,y:c.y,rot:0,h:0,pid:0,ct:[{item:rawItems[r],n:0,inf:!seed(r)}]};
      if(c.docked)Object.assign(q,{dk:'in',dkx:{r:Math.min(D[r]/use[r],2*cap),n:use[r],name:S.names[r],side:c.side}});
      items.push(q);if(c.x)for(let xx=c.x-4;xx<c.x;xx++)for(let i=0;i<4;i++)blk.add(xx+','+(c.y+i));if(c.side==="N"||c.side==="S")for(let xx=c.x-4;xx<c.x;xx++)blk.add(xx+","+(c.side==="N"?0:H-1));for(let xx=c.x-5;xx<c.x;xx++){blk.add(xx+","+(c.y-1));blk.add(xx+","+(c.y+4))}for(let i=0;i<4;i++){blk.add((c.x-5)+","+(c.y+i));blk.add(c.x+","+(c.y+i))}for(let i=0;i<n;i++)src.push({x:c.x,y:c.y+s0+i,item:rawItems[r]}),snk.push({x:W-5,y:tr[p++],item:rawItems[r]})});
    const got=Math.min(D[r],use[r]*2*cap);
    if(!seed(r)&&got<D[r]-1e-6)nt.push('Dock-limited: '+S.names[r]+' '+cmpR1(got)+'/min of '+cmpR1(D[r])+'/min (needs '+Math.ceil(D[r]/(2*cap)-1e-9)+' docks)');
  }
  for(const y of pass){src.push({x:0,y,item:'§pass'});snk.push({x:W-5,y,item:'§pass'});for(let x=0;x<4;x++)items.push({cls:bc,x,y,rot:0,h:0,pid:0})}
  const rt=cmpRoute({W:W-4,H,rowsN:1,mk,sources:src,sinks:snk,blocked:blk,ugMax:def(PLC_UG[mk]).maxApart,eastStart:true});
  if(!rt.ok)return fb('lane routing failed');
  rt.items.forEach(b=>items.push({...b,x:b.x+4}));dk.notes.push(...nt);
  return{ok:true,why:'',items,docked:1};
}
