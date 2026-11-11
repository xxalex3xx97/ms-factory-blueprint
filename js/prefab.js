// Prefab library (puzzle blocks): pure data builders, memoised by proto+args+grid. Layout only; nothing reads it yet.
const PF_GRID={cw:30,ch:30,seam:1,cut:'col'};   // grid cell size, seam width, cut direction (parameters, never hard-coded elsewhere)
const PF_MEMO=new Map();
const PF_BUILD={};
let PF_NID=0;
const pfNid=()=>++PF_NID;
const pfKey=(proto,args)=>JSON.stringify([proto,args,PF_GRID]);
// memoised prefab: same proto+args+grid -> same object (do not mutate)
function pfPrefab(proto,args){
  const k=pfKey(proto,args);
  if(PF_MEMO.has(k))return PF_MEMO.get(k);
  const p=PF_BUILD[proto](...args);PF_MEMO.set(k,p);return p;
}
// place an instance: prefab items translated to its grid cell, new ids (prefab itself is not changed)
function pfPlace(inst,nid=pfNid){
  const p=pfPrefab(inst.proto,inst.args),dx=inst.at.gx*PF_GRID.cw,dy=inst.at.gy*PF_GRID.ch;
  return p.items.map(it=>{const o={...it,x:it.x+dx,y:it.y+dy,id:nid()};if(it.ct)o.ct=it.ct.map(c=>({...c}));return o});
}
// no overlapping cells (same occupancy as plcOcc in placer.js); seam columns (and rows when cut 'corner') hold only belts at port rows
function pfCheck(p){
  const G=PF_GRID,s=G.seam,isB=b=>PLC_BELT.includes(b.cls);
  const occ=plcOcc(p.items),rowsOk=new Set(p.ports.filter(q=>q.edge==='W'||q.edge==='E').map(q=>q.off)),colsOk=new Set(p.ports.filter(q=>q.edge==='N'||q.edge==='S').map(q=>q.off));
  let cells=0,bad=0;
  p.items.forEach(b=>{const e=dim(b);
    for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++){cells++;
      const x=b.x+i,y=b.y+j;
      if((x<s||x>=p.w-s)&&(!isB(b)||!rowsOk.has(y)))bad++;
      if(G.cut==='corner'&&(y<s||y>=p.h-s)&&(!isB(b)||!colsOk.has(x)))bad++;
    }});
  return{ok:cells===occ.size&&bad===0,ov:cells-occ.size,seamBad:bad};
}
// n parallel belts of length len, flowing east (rot 0); ports: W edge input rows, E edge output rows
PF_BUILD.pfBus=(n,len,mk)=>{
  const bc=PLC_BELT[mk],items=[],ports=[];
  for(let y=0;y<n;y++){
    for(let x=0;x<len;x++)items.push({cls:bc,x,y,rot:0});
    ports.push({edge:'W',off:y,dir:'in',belts:1,slot:y,mk},{edge:'E',off:y,dir:'out',belts:1,slot:y,mk});
  }
  return{proto:'pfBus',args:[n,len,mk],w:len,h:n,items,ports,fits:[]};
};
const pfBus=(n,len,mk)=>pfPrefab('pfBus',[n,len,mk]);
// port assignment for one machine (rot 0) with k input items (flows = [{item,flow}] per-machine flow, desc). Pure, memoised on cls|k|flowsSig. Ports read from portsOf, never hard-coded.
// Output = last E port. Inputs take W,E,W,E... top to bottom (skipping the output), overflow N then S. Unused ports go to off (must be disableable).
function pfAssign(cls,k,flows){
  const key='asg|'+cls+'|'+k+'|'+flows.map(f=>f.item+':'+f.flow).join(',');
  if(PF_MEMO.has(key))return PF_MEMO.get(key);
  const r=pfAssignA(cls,k,flows);PF_MEMO.set(key,r);return r;
}
function pfAssignA(cls,k,flows){
  const no=why=>({ok:false,why}),ps=portsOf({cls,x:0,y:0,rot:0,off:[]}),d=dim({cls,rot:0});
  if(!ps.length)return no('machine has no ports');
  if(k+1>ps.length)return no('not enough ports');
  const outs=ps.filter(p=>p.f==='E'&&p.dir!=='in').sort((a,b)=>a.y-b.y);
  if(!outs.length)return no('not enough ports');
  const out=outs[outs.length-1],free=p=>p!==out&&p.dir!=='out';
  const byY=(a,b)=>a.y-b.y,byX=(a,b)=>a.x-b.x;
  const W=ps.filter(p=>p.f==='W'&&free(p)).sort(byY),E=ps.filter(p=>p.f==='E'&&free(p)).sort(byY);
  const N=ps.filter(p=>p.f==='N'&&free(p)).sort(byX),S=ps.filter(p=>p.f==='S'&&free(p)).sort(byX);
  const order=[];for(let i=0;i<Math.max(W.length,E.length);i++){if(W[i])order.push(W[i]);if(E[i])order.push(E[i])}
  order.push(...N,...S);
  const ins=[...flows].sort((a,b)=>b.flow-a.flow||(a.item<b.item?-1:a.item>b.item?1:0));
  if(ins.length>order.length)return no('not enough ports');
  const use=ins.map((f,i)=>({item:f.item,port:order[i]})),used=new Set([out.key,...use.map(u=>u.port.key)]);
  const off=ps.filter(p=>!used.has(p.key));
  if(off.some(p=>!p.tg))return no('port cannot be disabled');
  const r={ok:true,cls,k,W:[],E:[],N:[],S:[],out:{face:'E',row:out.y,key:out.key},off:off.map(p=>p.key),pitch:0};
  use.forEach(u=>r[u.port.f].push({item:u.item,row:u.port.f==='N'||u.port.f==='S'?u.port.x:u.port.y,key:u.port.key}));
  r.pitch=(r.N.length||r.S.length)?d.h+2:d.h;
  return r;
}
// COL prefab: m machines of one stage stacked in a column (pitch from pfAssign). One trunk per input (1 item per belt): container head at N edge, belt trunk south, splitter on each feed row (feeds the port belt, continues south). Trunks PF_TP apart; a feed crossing a nearer trunk goes under it (UG entrance/exit beside it). Output: east along the out row (UG under E trunks) -> collector north -> sink container at N edge. Cols 0 and w-1 stay empty (seams). N/S overflow inputs: not built yet (refused).
const PF_TP=4;   // trunk pitch in cells
PF_BUILD.pfCol=(cls,k,flows,m,mk)=>{
  const a=pfAssign(cls,k,flows);
  if(!a.ok)return{ok:false,why:a.why};
  if(a.S.length)return{ok:false,why:'S overflow inputs not built yet'};
  if(a.N.length>1)return{ok:false,why:'more than one N overflow input per machine not built yet'};
  const nN=a.N.length,d=dim({cls,rot:0}),Wd=d.w,P=a.pitch,Y0=2,Ym=nN?4:2,OX=1,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[mk],nW=a.W.length,nE=a.E.length;
  const x0=OX+(nW?3+PF_TP*(nW-1):0),wx=j=>x0-3-PF_TP*j,ex=j=>x0+Wd+2+PF_TP*j,xC=x0+Wd+2+PF_TP*nE,tx=xC+4;   // tx: the N overflow trunk, east of the collector
  const ym=i=>Ym+i*P,gap=i=>ym(i)-2,tcols=new Set([...a.W.map((_,j)=>wx(j)),...a.E.map((_,j)=>ex(j))]),gcols=new Set([...tcols,xC,...(nN?[tx]:[])]),it=[];
  // belts/UG from start to end (inclusive) along dir (+1 east, -1 west), skipping trunk columns; a cell before a trunk is a UG entrance, a cell after one (not the origin trunk) the exit
  const feed=(start,end,y,dir,origin,set=tcols)=>{const rot=dir>0?0:2;
    for(let x=start;dir>0?x<=end:x>=end;x+=dir){
      if(set.has(x))continue;
      if(set.has(x+dir))it.push({cls:ug,x,y,rot});
      else if(set.has(x-dir)&&x-dir!==origin)it.push({cls:ug,x,y,rot});
      else it.push({cls:bc,x,y,rot});
    }};
  const trunk=(x,r)=>{   // one trunk column from the head down to its last feed row
    const rows=[];for(let i=0;i<m;i++)rows.push(ym(i)+r);const spl=new Set(rows),last=rows[rows.length-1];
    for(let y=Y0;y<=last;y++)it.push(spl.has(y)?{cls:sc,x,y,rot:1}:{cls:bc,x,y,rot:1});
  };
  const head=(x,item)=>it.push({cls:PLC_BOX,x,y:0,rot:0,ct:[{item,n:0,inf:true}]});   // infinite source container at the N edge
  a.W.forEach((p,j)=>{trunk(wx(j),p.row);head(wx(j),p.item)});
  a.E.forEach((p,j)=>{trunk(ex(j),p.row);head(ex(j),p.item)});
  if(nN){   // N overflow trunk: splitter on each gap row (gap(i) = the row above machine i's N port belt), belt along the gap row (under nearer trunks) then down into the port
    const rows=[];for(let i=0;i<m;i++)rows.push(gap(i));const spl=new Set(rows),last=rows[m-1];
    for(let y=Y0;y<=last;y++)it.push(spl.has(y)?{cls:sc,x:tx,y,rot:1}:{cls:bc,x:tx,y,rot:1});
    head(tx,a.N[0].item);
  }
  for(let i=0;i<m;i++){
    it.push({cls,x:x0,y:ym(i),rot:0,off:[...a.off]});
    a.W.forEach((p,j)=>feed(wx(j)+1,x0-1,ym(i)+p.row,1,wx(j)));
    a.E.forEach((p,j)=>feed(ex(j)-1,x0+Wd,ym(i)+p.row,-1,ex(j)));
    feed(x0+Wd,xC-1,ym(i)+a.out.row,1,null);
    if(nN){const px=x0+a.N[0].row,G=gap(i);feed(tx-1,px+1,G,-1,tx,gcols);it.push({cls:bc,x:px,y:G,rot:1},{cls:bc,x:px,y:G+1,rot:1})}
  }
  const lowOut=ym(m-1)+a.out.row;
  for(let y=Y0;y<=lowOut;y++)it.push({cls:bc,x:xC,y,rot:3});
  it.push({cls:PLC_BOX,x:xC,y:0,rot:0,ct:[]});
  const ports=[...a.W.map((p,j)=>({edge:'N',off:wx(j),dir:'in',belts:1,slot:j,mk})),...a.E.map((p,j)=>({edge:'N',off:ex(j),dir:'in',belts:1,slot:nW+j,mk})),...(nN?[{edge:'N',off:tx,dir:'in',belts:1,slot:nW+nE,mk}]:[]),{edge:'N',off:xC,dir:'out',belts:1,slot:-1,mk}];
  return{proto:'pfCol',args:[cls,k,flows,m,mk],w:(nN?tx:xC)+3,h:ym(m-1)+d.h,items:it,ports,fits:[],out:a.out,nIn:nN?{px:x0+a.N[0].row,tx}:null};
};
const pfCol=(cls,k,flows,m,mk)=>pfPrefab('pfCol',[cls,k,flows,m,mk]);
// GROWTH prefab: the verified growth layout (plcGrowthLane = one lane per machine, stacked) for item at rate/min. Built by calling placer.js, not reimplemented. Lane count = plan machines. Coordinates already start at (0,0). Ports: none in (seed and Biomass are containers inside); net output = sink container S at the bottom (edge 'S', off = its x).
PF_BUILD.pfGrowth=(item,rate,mk,box)=>{
  const P=plan(item,rate,0,{sp:null,bal:null},PLN_PICK,{proto:false,enr:false});
  const L=plcGrowthLane(P,item,mk,0,{box,mod:false});
  if(!L.ok)return{ok:false,why:L.why};
  const BX=box||PLC_BOX,bw=def(BX).w,isS=b=>L.items.some(q=>PLC_BELT.includes(q.cls)&&q.rot===1&&q.y===b.y-1&&q.x>=b.x&&q.x<b.x+bw);   // sink S = empty container with the sink belts entering its top (O has belts leaving its bottom)
  const sinks=L.items.filter(q=>q.cls===BX&&q.ct&&!q.ct.length&&isS(q));
  return{proto:'pfGrowth',args:[item,rate,mk,box],w:L.w,h:L.h,items:L.items,ports:sinks.map((s,i)=>({edge:'S',off:s.x,dir:'out',belts:2,slot:i,mk})),fits:[],lanes:L.lanes,note:L.note};
};
const pfGrowth=(item,rate,mk,box)=>pfPrefab('pfGrowth',[item,rate,mk,box]);
// HUB (step 5): n containers stacked (pitch h+1) at x 0, one port row each. face 'E' = source hub (item: infinite container, ports out east); face 'W' = sink hub (item null: empty container, ports in from west). Port rows = portsOf of the box (pe.y).
PF_BUILD.pfHub=(n,box,mk,item,face)=>{
  const d=def(box),pt=portsOf({cls:box,x:0,y:0,rot:0,off:[]}),pe=pt.find(p=>p.f==='E'),pw=pt.find(p=>p.f==='W');
  if(!pe||!pw||pe.y!==pw.y)return{ok:false,why:'container W/E ports not aligned'};
  const P=d.h+1,items=[],ports=[];
  for(let i=0;i<n;i++){const y=i*P;items.push({cls:box,x:0,y,rot:0,ct:item?[{item,n:0,inf:true}]:[]});
    ports.push({edge:face,off:y+pe.y,dir:item?'out':'in',belts:1,slot:i,mk})}
  return{proto:'pfHub',args:[n,box,mk,item,face],w:d.w,h:(n-1)*P+d.h,items,ports,fits:[]};
};
const pfHub=(n,box,mk,item,face)=>pfPrefab('pfHub',[n,box,mk,item,face]);
// WALL_X: one UG pair per row, entrance x 0 and exit x 3 (L=4 inclusive), cells 1..2 empty (the wall). Rows given by caller.
PF_BUILD.pfWallX=(rows,mk)=>{const ug=PLC_UG[mk],items=[];rows.forEach(y=>items.push({cls:ug,x:0,y,rot:0},{cls:ug,x:3,y,rot:0}));return{proto:'pfWallX',args:[rows,mk],w:4,h:rows.length?Math.max(...rows)+1:0,items,ports:[],fits:[]}};
const pfWallX=(rows,mk)=>pfPrefab('pfWallX',[rows,mk]);
// LINE (step 5 test shape): source hub (n rows) -> n belts of len cells east -> optional WALL_X (4 cells, UG pair, centred) -> sink hub. Built from pfHub/pfWallX; belts are the only extra items.
PF_BUILD.pfLine=(n,box,mk,item,len,wall)=>{
  const d=def(box),bw=d.w,bc=PLC_BELT[mk],H=pfHub(n,box,mk,item,'E');
  if(H.ok===false)return H;
  const rows=H.ports.map(p=>p.off),X=bw+len;
  const a=wall?Math.floor((len-4)/2):-1,wx=bw+a;   // wall cells wx..wx+3
  const O=pfHub(n,box,mk,null,'W'),items=[...H.items];
  const W=wall?pfWallX(rows,mk):null;
  if(W)W.items.forEach(q=>items.push({...q,x:q.x+wx}));
  for(const y of rows)for(let x=bw;x<X;x++){if(wall&&x>=wx&&x<=wx+3)continue;items.push({cls:bc,x,y,rot:0})}
  O.items.forEach(q=>items.push({...q,x:q.x+X}));
  return{proto:'pfLine',args:[n,box,mk,item,len,wall],w:X+bw,h:H.h,items,ports:[],fits:[],wall:wall?{x:wx,span:4}:null};
};
const pfLine=(n,box,mk,item,len,wall)=>pfPrefab('pfLine',[n,box,mk,item,len,wall]);
// COMPOSE (step 6, single stage only, behind PLC_PREFAB): one COL column of all machines (pfCol, m = machines), one sink container (the collector). Refuses growth, multi-stage (old path). Returns the placerLayoutA shape (items, w, h, pitch, mod, box, mk, lanes, per, makes, note).
let PLC_PREFAB=false;   // test hook: flip on in the page; off = old path only
// COLUMNS (step 6A): sizes[] = machines per column (pfCol each), side by side (seam cols make a 2-cell gap). Each column's own sink box is removed; its collector stub goes north into one shared out row at row Rb (= the out box port row) that runs east into ONE out container. Columns sit one row lower (SH = Rb+1). Inputs stay per-column infinite source containers (not aggregated). Out total must fit one belt (out stack not built). STEP 6B: pfCompose caps machines per column so the column fits the floor height (h+SH<=30); a wider layout is cut by placerTile at the seams.
function pfColumns(cls,k,flows,sizes,mk,outFlow){
  const no=why=>({ok:false,why}),bc=PLC_BELT[mk],bw=def(PLC_BOX).w;
  if(outFlow>MKS[mk][1])return no('output above belt cap: out stack not built');
  const pw=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='W');if(!pw)return no('box has no W port');
  const Rb=pw.y,SH=Rb+1,it=[],xs=[];let x=0;
  for(const mc of sizes){const C=pfCol(cls,k,flows,mc,mk);if(C.ok===false)return no(C.why);
    const xC=C.ports.find(p=>p.dir==='out').off;
    C.items.forEach(q=>{if(q.cls===PLC_BOX&&q.x===xC&&q.y===0&&!(q.ct&&q.ct.length))return;it.push({...q,x:q.x+x,y:q.y+SH})});
    it.push({cls:bc,x:xC+x,y:SH,rot:3},{cls:bc,x:xC+x,y:SH+1,rot:3});   // collector stub north into the shared row
    xs.push(xC+x);x+=C.w;
  }
  const xo=x;
  for(let c=Math.min(...xs);c<=xo+pw.x+pw.nx;c++)it.push({cls:bc,x:c,y:Rb,rot:0});   // shared out row, east into the out container's W port
  it.push({cls:PLC_BOX,x:xo,y:0,rot:0,ct:[]});
  const minY=Math.min(...it.map(q=>q.y));
  const items=it.map(q=>({...q,y:q.y-Math.min(0,minY)}));
  return{ok:true,items,w:xo+bw,h:Math.max(...items.map(q=>q.y+dim(q).h)),ports:[]};
}
// SEAMS (step 6C): placerCut cuts a layout into floor tiles, each cut column c with c-s in [LO,FW] (LO = the 2x2 block's wall minimum, FW = its floor width). When no free column exists there, insert k blank columns (plcBlank: crossing east belts stretched, UG pair across the seam) and cut at a free column of the new layout. Greedy, same search order as placerCut, so the cut it finds is the one checked here. Only inserts when no free column exists (layouts that already cut are unchanged). Ports on N/S edges shift with the columns.
function pfSeams(A,mk){
  const big=plcCls(PL_STD[PL_STD.length-1]),FW=floorRect({cls:big,x:0,y:0,h:0,rot:0}).w,LO=Math.max(2,dim({cls:big,rot:0}).w*FC+2-def(PLC_UG[mk]).maxApart),mx=def(PLC_UG[mk]).maxApart;
  let items=A.items,w=A.w,s=0,ports=A.ports.map(q=>({...q}));
  while(w-s>FW){
    let cut=null;
    for(let c=s+FW;c>=s+LO&&cut===null;c--)if(plcTryCut(items,plcOcc(items),A.h,false,c))cut=c;
    if(cut!==null){s=cut;continue}
    for(let p=s+FW;p>s&&cut===null;p--)for(let k=1;k<=6&&cut===null;k++){
      const I2=plcBlank(items,p,k,A.h,mx);if(!I2)continue;const o2=plcOcc(I2);
      for(let c=p;c<=p+k;c++){if(c-s<LO||c-s>FW)continue;if(plcTryCut(I2,o2,A.h,false,c)){items=I2;w+=k;ports.forEach(q=>{if((q.edge==='N'||q.edge==='S')&&q.off>=p)q.off+=k});cut=c;break}}
    }
    if(cut===null)return null;
    s=cut;
  }
  return{items,w,ports};
}
// CHAIN (steps 7+, behind PLC_PREFAB): DAG of stages, one pfCol per stage (every input its own trunk, one item per belt). Raw inputs keep their source container. A crafted input comes from its upstream stage's sink box, which outputs north through its N ports (port 0/1 = up to two consumers: fan-out) into a corridor: riser -> row R -> riser down into the consumer trunk. Corridors share a row when their x-ranges do not overlap; a corridor crossing another riser goes under it with a UG pair. Stages left to right in post-order (upstream first). Refuses: one input above one belt (multi-belt not built), growth, more than two consumers of one stage, stage taller than the floor.
const PF_GAP=3;   // cells between stage columns
const PF_CORR=8;  // rows kept free above the stages for corridors (stage height limit)
function pfChain(P,item,mk,spMk,o={}){
  const no=why=>({ok:false,why}),BX=o.box||PLC_BOX,cap=MKS[mk][1],bc=PLC_BELT[mk],ug=PLC_UG[mk];
  const st=new Map(),order=[];let err=null;
  const walk=(x,stack)=>{
    if(err)return;
    if(stack.includes(x)){err='cycle in plan';return}
    if(st.has(x))return;
    const T=P.nodes[x];
    if(!T||!T.rec){err='no recipe';return}
    if(T.rec.i.some(([y])=>y===x)){err='growth not built in prefab';return}
    const ins=T.rec.i.map(([y])=>y);st.set(x,{T,ins});
    for(const y of ins)if(P.nodes[y]&&P.nodes[y].crafter)walk(y,[...stack,x]);
    order.push(x);
  };
  walk(item,[]);
  if(err)return no(err);
  const Fh=floorRect({cls:plcCls(PL_STD[PL_STD.length-1]),x:0,y:0,h:0,rot:0}).h,pwb=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='W'),SH=pwb?pwb.y+1:0;
  const items=[],ports=[],per=[],sink=new Map(),nUse=new Map(),routes=[];
  let x0=0,makes=0;
  for(const y of order){
    const S=st.get(y),T=S.T,cb=plnCb(T.crafter);if(!cb)return no('No machine builds this recipe');
    const N=T.machines,cls=def(cb.id).key,rec=rk(T.rec),flows=[],k=S.ins.length;
    for(const i of S.ins){
      const e=P.edges.find(q=>q.from===i&&q.to===y);if(!e)return no('no edge into '+plnNm(y));
      if(e.flow>cap)return no('chain input above one belt (multi-belt not built)');
      flows.push({item:i,flow:e.flow/N});
    }
    // machines per column: the most that fit the floor (as pfCompose); several columns share one out row
    let mh=N;while(mh>1){const C=pfCol(cls,k,flows,mh,mk);if(C.ok===false||C.h+SH<=Fh-PF_CORR)break;mh--}
    const sizes=[];for(let r=N;r>0;r-=mh)sizes.push(Math.min(mh,r));
    const outF=P.edges.filter(e=>e.from===y).reduce((a,e)=>a+e.flow,0);
    const C=sizes.length===1?pfCol(cls,k,flows,N,mk):pfColumns(cls,k,flows,sizes,mk,outF);
    if(C.ok===false)return no(C.why);
    if(C.h+SH>Fh-PF_CORR)return no('chain stage taller than the floor minus corridor rows (not built)');
    const dx=x0,fedSet=new Set(S.ins.filter(i=>P.nodes[i]&&P.nodes[i].crafter)),isHead=q=>q.cls===PLC_BOX&&q.ct&&q.ct.length;
    // every trunk head of a crafted input becomes a corridor from its upstream sink; raw heads stay as source containers
    C.items.forEach(q=>{
      if(isHead(q)&&fedSet.has(q.ct[0].item))return;
      const o2={...q,x:q.x+dx};if(q.cls===cls)o2.rec=rec;items.push(o2);
    });
    if(y===order[0])C.items.filter(q=>isHead(q)&&!fedSet.has(q.ct[0].item)).forEach((h,j)=>ports.push({edge:'N',off:h.x+dx,dir:'in',belts:1,slot:j,mk}));
    const sk=C.items.find(q=>q.cls===PLC_BOX&&q.y===0&&q.ct&&!q.ct.length);
    sink.set(y,{x:sk.x+dx});
    for(const i of fedSet){
      const hs=C.items.filter(q=>isHead(q)&&q.ct[0].item===i),k0=nUse.get(i)||0;
      if(k0+hs.length>2)return no('more than two consumers of one stage (not built)');
      nUse.set(i,k0+hs.length);
      hs.forEach((h,t)=>routes.push({sx:sink.get(i).x+k0+t,tx:h.x+dx,item:i}));
    }
    if(y===item){ports.push({edge:'N',off:sk.x+dx,dir:'out',belts:1,slot:-1,mk});makes=N*T.pmach}
    per.push(N);x0=dx+C.w+PF_GAP;
  }
  // corridor rows (row r -> R = -2-r; larger r = further north). Rows are shared when x-spans do not overlap. A corridor whose riser or descent sits right next to another corridor's corner must lie north of it (a UG cannot start or end on a corner); every other crossing goes under with a UG pair.
  const n=routes.length,rowsIv=[],rowOf=[],busy=[],key=(x,y)=>x+','+y,occ=new Set(),cells=[];
  const cons=routes.map((A,a)=>routes.flatMap((C,c)=>c!==a&&(C.sx===A.sx+1||C.tx===A.tx-1)?[c]:[]));
  let bad=null;
  const place=a=>{
    if(rowOf[a]!==undefined)return rowOf[a];
    if(busy[a]){bad='corridor order cycle';return 0}
    busy[a]=true;
    const A=routes[a],lo=Math.min(A.sx,A.tx),hi=Math.max(A.sx,A.tx);
    let r=0;for(const c of cons[a])r=Math.max(r,place(c)+1);
    while(rowsIv[r]&&rowsIv[r].some(v=>!(hi<v[0]||lo>v[1])))r++;
    (rowsIv[r]=rowsIv[r]||[]).push([lo,hi]);rowOf[a]=r;A.R=-2-r;return r;
  };
  for(let a=0;a<n;a++)place(a);
  if(bad)return no(bad);
  // verticals first: riser up from the sink N port, corner east, corner south at the trunk, descent into the trunk top
  for(const rt of routes){
    const R=rt.R,vs=[];
    for(let y=R+1;y<=-1;y++)vs.push([rt.sx,y,3]);
    vs.push([rt.sx,R,0],[rt.tx,R,1]);
    for(let y=R+1;y<=1;y++)vs.push([rt.tx,y,1]);
    for(const [x,y,r] of vs){if(occ.has(key(x,y)))return no('corridor cells clash');occ.add(key(x,y));cells.push({cls:bc,x,y,rot:r})}
  }
  // horizontals: a cell under another corridor's vertical is skipped, the belts either side become a UG pair
  for(const rt of routes){
    const R=rt.R,seg=[];
    for(let x=rt.sx+1;x<rt.tx;x++)seg.push({x,t:occ.has(key(x,R))?'skip':'b'});
    for(let i=0;i<seg.length;i++)if(seg[i].t==='skip'){
      if(i===0||i===seg.length-1||seg[i-1].t!=='b'||seg[i+1].t!=='b')return no('corridor crossing not routable');
      seg[i-1].t='in';seg[i+1].t='out';
    }
    for(const s of seg)if(s.t!=='skip')cells.push({cls:s.t==='b'?bc:ug,x:s.x,y:R,rot:0});
  }
  const all=[...items,...cells],minY=Math.min(...all.map(q=>q.y)),sh=minY<0?-minY:0;
  const out=all.map(q=>({...q,y:q.y+sh}));
  const H=Math.max(...out.map(q=>q.y+dim(q).h)),W=Math.max(...out.map(q=>q.x+dim(q).w));
  const SM=pfSeams({items:out,w:W,h:H,ports},mk);if(!SM)return no('no free wall column for the block tile (seam search failed) h'+H+' w'+W+' floor'+Fh);
  return{ok:true,items:SM.items.map(q=>({h:0,pid:0,...q})),lanes:1,per,makes,pitch:H+1,w:SM.w,h:H,mod:false,box:BX,mk,ports:SM.ports,note:['Prefab chain: '+order.length+' stages, corridors above; crafted inputs fed from upstream sink boxes'],src:{P,item,mk,spMk,o},prefab:true};
}
function pfCompose(P,item,mk,spMk,o={}){
  const no=why=>({ok:false,why}),T=P.nodes[item],BX=o.box||PLC_BOX;
  if(!T||!T.rec)return no('no recipe');
  if(T.rec.i.some(([x])=>x===item))return no('growth not built in prefab');
  if(!T.rec.i.every(([x])=>!(P.nodes[x]&&P.nodes[x].crafter)))return pfChain(P,item,mk,spMk,o);   // a machine upstream: chain (step 7)
  const cb=plnCb(T.crafter);if(!cb)return no('No machine builds this recipe');
  const N=T.machines,cls=def(cb.id).key,k=T.rec.i.length,cap=MKS[mk][1];
  const edge=x=>P.edges.find(e=>e.from===x&&e.to===item);
  const flows=T.rec.i.map(([x])=>({item:x,flow:edge(x).flow/N}));
  const m=Math.min(...flows.map(f=>Math.floor(cap/f.flow+1e-9)));   // machines one trunk per input can feed
  if(!(m>=1))return no('one machine input above belt cap (old path raises the Mk)');
  const Fh=floorRect({cls:plcCls(PL_STD[PL_STD.length-1]),x:0,y:0,h:0,rot:0}).h,pwb=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='W'),SH=pwb?pwb.y+1:0;   // same SH as pfColumns
  let mh=Math.min(m,N);
  while(mh>1){const C=pfCol(cls,k,flows,mh,mk);if(C.ok===false||C.h+SH<=Fh)break;mh--}   // ponytail: linear scan, m is small
  const sizes=[];for(let r=N;r>0;r-=mh)sizes.push(Math.min(mh,r));
  const A=sizes.length===1?pfCol(cls,k,flows,N,mk):pfColumns(cls,k,flows,sizes,mk,P.edges.find(e=>e.to==null).flow);
  if(A.ok===false)return no(A.why);
  const SM=pfSeams(A,mk);if(!SM)return no('no free wall column for the block tile (seam search failed)');
  const rec=rk(T.rec),items=SM.items.map(q=>({h:0,pid:0,...q,rec:q.cls===cls?rec:q.rec}));
  return{ok:true,items,lanes:1,per:[N],makes:N*T.pmach,pitch:A.h+1,w:SM.w,h:A.h,mod:false,box:BX,mk,ports:SM.ports,
    note:['Prefab column: '+N+' machine(s) in one column, one trunk per input, one sink container (the collector)'],src:{P,item,mk,spMk,o},prefab:true};
}
