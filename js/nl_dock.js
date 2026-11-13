// No Limits: dock inputs/outputs (plain globals). Plan: vault main-sequence/tasks/2026-11-12-dock-plan.md
const NLD={MID:[6,22],LANE_I:[4,6,22,24],BOX_I:'DAT_Container_2'};
const nlDockOff=bw=>bw>2?1:0;
const nlSlotN=(c,k,bw)=>30*c+NLD.MID[k]-nlDockOff(bw);
function nlPickN(tx,bw,st,mn=-1e9){let best=null,bd=1e18;const c0=Math.max(0,Math.round(tx/30)),cM=Math.max(c0+3,Math.ceil(mn/30)+1)+st.used.size;
  for(let c=Math.max(0,c0-3);c<=cM;c++)for(let k=0;k<2;k++){const x=nlSlotN(c,k,bw);if(st.used.has(x)||x<=mn)continue;const d=Math.abs(x-tx);if(d<bd){bd=d;best=x}}
  st.used.add(best);return best}
function nlPickI(tx,st,mc=-1){let best=-1,bd=1e18;const c0=Math.max(0,Math.round((tx-14)/30)),cM=Math.max(c0+3,mc+2)+st.cols.size;
  for(let c=Math.max(0,c0-3,mc+1);c<=cM;c++){if(st.cols.has(c))continue;const d=Math.abs(30*c+14-tx);if(d<bd){bd=d;best=c}}
  st.cols.add(best);return best}
function nlOutSlots(kind,tx,bw){const st={used:new Set(),cols:new Set()},r=[];
  if(kind==='nrm'){let mn=-1e9;for(const t of tx){const x=nlPickN(t,bw,st,mn);mn=x;r.push(x)}}
  else{let mc=-1;for(let i=0;i<tx.length;i+=4){const g=tx.slice(i,i+4),c=nlPickI(g.reduce((a,b)=>a+b,0)/g.length,st,mc);mc=c;g.forEach((t,j)=>r.push(30*c+NLD.LANE_I[j]))}}
  return r}
function nlIndAsm(){const B=[],K=[],rg=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
  for(const x of[...rg(9,12),...rg(17,20)])for(let y=0;y<4;y++)K.push({x,y,rot:1});
  for(const y of[...rg(4,7),...rg(9,12)]){K.push({x:21,y,rot:0});K.push({x:8,y,rot:2})}
  for(const x of[...rg(4,7),...rg(9,12),...rg(17,20),...rg(22,25)])K.push({x,y:8,rot:1});
  for(const x of[4,9,17,22])for(const y of[4,9])B.push({x,y});
  return{boxes:B,belts:K}}
// post-cut: add dock blocks, assemblies and belts to the tile result T (ms/blocks copies); {ok:false,why} when a dock does not fit
function nlDockApply(L,T,cls){
  const hz=!!(L.bl&&L.bl.zoned);   // H6b: zoned (horizontal) layout: docks west of the IZ / east of the last FB
  const ms=T.ms.map(q=>({...q})),blocks=T.blocks.map(q=>({...q})),d=dim({cls,rot:0}),TW=d.w*FC,TH=d.h*FC,
    fl=floorRect({cls,x:0,y:0,h:0,rot:0}),bc=PLC_BELT[L.mk],addM=[],no=why=>({ok:false,why}),
    belt=(x,y,rot,t='p')=>addM.push({cls:bc,x,y,h:0,rot,pid:0,dk:t}),
    cx=x=>Math.floor(x/TW),
    slot=(q,c)=>[0,1].find(k=>{const M=c*TW+16*k+DOFF+2,bw=dim(q).w;return q.x<=M&&q.x+bw-1>=M+1}),
    below=(c,g)=>blocks.some(b=>b.x>=c*d.w&&b.x<c*d.w+d.w&&b.y===(g+1)*d.h),
    lxOk=lx=>(lx>=4&&lx<=7)||(lx>=22&&lx<=25),
    asm=nlIndAsm(),
    ad=cls===plcCls('BPO_Station_03')?1:0,A=16*ad,adc=plcCls('BPO_StationAdapter_01'),ads=new Set(),   // 2x2 C: a station adapter between tile and dock moves the dock stack out one cell
    adp=(c,y,rot)=>{const k=c+'|'+y;if(!ads.has(k)){ads.add(k);blocks.push({cls:adc,x:c*d.w,y,rot})}};
  if(hz&&ad)return no('horizontal dock on 2x2 C');
  const hzM=(g,k)=>g*TH+16*k+6,hzSlot=(q,bh)=>{const g=Math.floor(q.y/TH);for(let k=0;k<d.h;k++){const M=hzM(g,k);if(q.y<=M&&q.y+bh-1>=M+1)return{g,k,M}}return null};
  // (1) Normal input: one dock per raw container
  const used=new Set();
  for(const q of ms.filter(q=>q.dk==='in')){
    if(hz){
      if(cx(q.x)!==0)return no('dock slot misaligned');
      const h=hzSlot(q,dim(q).h);
      if(!h)return no('dock slot misaligned');
      if(used.has(h.g+'|'+h.k))return no('two input docks in one slot');
      used.add(h.g+'|'+h.k);
      for(const y of[h.M,h.M+1])for(let x=-1;x<=q.x-1;x++)belt(x,y,0);
      blocks.push({cls:plcCls('BPO_Dock'),x:-1,y:h.g*d.h+h.k,rot:2});
      continue}
    const c=cx(q.x),k=slot(q,c);
    if(k===undefined||q.y>=TH)return no('dock slot misaligned');
    if(used.has(c+'|'+k))return no('two input docks in one slot');
    used.add(c+'|'+k);
    const M=c*TW+16*k+DOFF+2;
    for(const x of[M,M+1])for(let y=-1-A;y<=0;y++)belt(x,y,1);
    blocks.push({cls:plcCls('BPO_Dock'),x:c*d.w+k,y:-1-ad,rot:3});if(ad)adp(c,-1,3)}
  // (2) Industrial input: one Industrial Dock + assembly per column
  const ie=new Map();
  for(const q of ms.filter(q=>q.dk==='ie')){
    const c=cx(q.x);if(!lxOk(q.x-c*TW))return no('dock slot misaligned');
    if(!ie.has(c))ie.set(c,[]);ie.get(c).push(q)}
  for(const [c,E] of ie){
    const ox=c*TW,oy=-16-A,di=E[0].di;
    blocks.push({cls:plcCls('BPO_Dock_2'),x:c*d.w,y:-3-ad,rot:3});if(ad)adp(c,-1,3);
    for(const b of asm.boxes){const inf=(b.x===22&&b.y===9)||(b.x===4&&b.y===9);
      ms.push({cls:NLD.BOX_I,x:ox+b.x,y:oy+b.y,h:0,rot:0,pid:0,ct:inf?[{item:di,n:0,inf:true}]:[],dk:'in'})}
    for(const k of asm.belts)belt(ox+k.x,oy+k.y,k.rot);
    for(const q of E)for(let y=oy+13;y<=-1;y++)belt(q.x,y,1)}
  // (3) Normal output: container moved to the block floor bottom, belts to the dock ports
  for(const q of ms.filter(q=>q.dk==='out')){
    if(hz){
      const c=cx(q.x),Fbx=c*TW+fl.w-1,bq=dim(q).w;
      if(c!==L.bl.n.length)return no('dock slot misaligned');
      if(q.x+bq!==Fbx)return no('dock slot misaligned');
      const h=hzSlot(q,dim(q).h);
      if(!h)return no('dock slot misaligned');
      for(const y of[h.M,h.M+1])for(let x=Fbx;x<=Fbx+1;x++)belt(x,y,0);
      blocks.push({cls:plcCls('BPO_Dock'),x:(c+1)*d.w,y:h.g*d.h+h.k,rot:0});
      continue}
    const c=cx(q.x),g=Math.floor(q.y/TH),Fb=g*TH+fl.h-1,k=slot(q,c),bh=dim(q).h,dy=Fb-bh-q.y;
    if(k===undefined||dy<0)return no('dock slot misaligned');
    if(below(c,g))return no('a block lies below the output dock');
    const pN=portsOf({cls:q.cls,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='N'),xN=q.x+pN.x,M=c*TW+16*k+DOFF+2;
    const bwq=dim(q).w,cols=[];for(let x=q.x;x<q.x+bwq;x++)if(ms.some(m=>m.x===x&&m.y===q.y-1&&PLC_BELT.includes(m.cls)&&m.rot===1))cols.push(x);for(const xx of cols.length?cols:[xN])for(let y=q.y;y<q.y+dy;y++)belt(xx,y,1);
    q.y+=dy;
    for(const x of[M,M+1])for(let y=Fb;y<=Fb+1+A;y++)belt(x,y,1);
    blocks.push({cls:plcCls('BPO_Dock'),x:c*d.w+k,y:(g+1)*d.h+ad,rot:1});if(ad)adp(c,(g+1)*d.h,1)}
  // (4) Industrial output: assembly mirrored 180 under the block, tails extended to its first row
  const oe=new Map();
  for(const q of ms.filter(q=>q.dk==='oe')){
    const c=cx(q.x),g=Math.floor(q.y/TH);if(!lxOk(q.x-c*TW))return no('dock slot misaligned');
    if(below(c,g))return no('a block lies below the output dock');
    const key=c+'|'+g;if(!oe.has(key))oe.set(key,{c,g,E:[]});oe.get(key).E.push(q)}
  for(const {c,g,E} of oe.values()){
    const ox=c*TW,oy=(g+1)*TH+A;
    blocks.push({cls:plcCls('BPO_Dock_2'),x:c*d.w,y:(g+1)*d.h+ad,rot:1});if(ad)adp(c,(g+1)*d.h,1);
    for(const b of asm.boxes)ms.push({cls:NLD.BOX_I,x:ox+26-b.x,y:oy+10-b.y,h:0,rot:0,pid:0,ct:[],dk:'out'});
    for(const k of asm.belts)belt(ox+29-k.x,oy+13-k.y,k.rot);
    for(const q of E)for(let y=q.y+1;y<=oy;y++)belt(q.x,y,1)}
  // dock blocks above row 0 shift the whole plan down
  const sh=-Math.min(0,...blocks.map(b=>b.y)),all=[...ms,...addM];
  if(sh){for(const m of all)m.y+=16*sh;for(const b of blocks)b.y+=sh}
  const shx=-Math.min(0,...blocks.map(b=>b.x));   // H6b: x shift (horizontal docks west of block 0)
  if(shx){for(const m of all)m.x+=16*shx;for(const b of blocks)b.x+=shx}
  const seen=new Set();let ov=0;   // same overlap count as placerCut
  for(const m of all){const e=dim(m);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++){const kk=K(m.x+i,m.y+j);if(seen.has(kk))ov++;else seen.add(kk)}}
  return{...T,ms:all,blocks,ov}}
function nlDockCut(L2,cls){const t=placerCut(L2,cls);return L2.dk&&t.ok?{...nlDockApply(L2,t,cls),L2}:{...t,L2}}
