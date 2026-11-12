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
PF_BUILD.pfCol=(cls,k,flows,m,mk,dn)=>{   // dn (step 1 outDown): sink box at the bottom, collector belts south from the top out row, out port on S
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
  if(dn){for(let y=ym(0)+a.out.row;y<=lowOut;y++)it.push({cls:bc,x:xC,y,rot:1});it.push({cls:PLC_BOX,x:xC,y:lowOut+1,rot:0,ct:[]})}
  else{for(let y=Y0;y<=lowOut;y++)it.push({cls:bc,x:xC,y,rot:3});it.push({cls:PLC_BOX,x:xC,y:0,rot:0,ct:[]})}
  const ports=[...a.W.map((p,j)=>({edge:'N',off:wx(j),dir:'in',belts:1,slot:j,mk})),...a.E.map((p,j)=>({edge:'N',off:ex(j),dir:'in',belts:1,slot:nW+j,mk})),...(nN?[{edge:'N',off:tx,dir:'in',belts:1,slot:nW+nE,mk}]:[]),{edge:dn?'S':'N',off:xC,dir:'out',belts:1,slot:-1,mk}];
  return{proto:'pfCol',args:dn?[cls,k,flows,m,mk,true]:[cls,k,flows,m,mk],w:(nN?tx:xC)+3,h:dn?Math.max(ym(m-1)+d.h,lowOut+3):ym(m-1)+d.h,items:it,ports,fits:[],out:a.out,nIn:nN?{px:x0+a.N[0].row,tx}:null};
};
const pfCol=(cls,k,flows,m,mk,dn)=>pfPrefab('pfCol',dn?[cls,k,flows,m,mk,true]:[cls,k,flows,m,mk]);   // north args unchanged (memo key)
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
// HUB W entry (step 7g): hubAt=true -> no sink box; a DAT_Container_2 hub at x=xo with its W port on the out row (hub.y = Rb - that port's y). Returns hub:{x,y} (after the minY shift).
function pfColumns(cls,k,flows,sizes,mk,outFlow,hubAt,dn,org){
  const no=why=>({ok:false,why}),bc=PLC_BELT[mk],bw=def(PLC_BOX).w,HC='DAT_Container_2';
  if(outFlow>MKS[mk][1])return no('output above belt cap: out stack not built');
  const pw=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='W');if(!pw)return no('box has no W port');
  if(dn&&hubAt)return no('hub W entry with outDown not built');
  const Rb=pw.y,SH=dn?0:Rb+1,it=[],xs=[],cols=[],xs0=[];let x=0;
  for(const [ci,mc] of sizes.entries()){const C=pfCol(cls,k,flows,mc,mk,dn);if(C.ok===false)return no(C.why);if(org)x=org[ci];xs0.push(x);
    const xC=C.ports.find(p=>p.dir==='out').off,isB=q=>q.cls===PLC_BOX&&q.x===xC&&!(q.ct&&q.ct.length)&&(dn||q.y===0);
    C.items.forEach(q=>{if(isB(q))return;it.push({...q,x:q.x+x,y:q.y+SH})});
    if(dn)cols.push({xc:xC+x,bY:C.items.find(isB).y,h:C.h});   // outDown: stub south from the collector into the shared row below
    else it.push({cls:bc,x:xC+x,y:SH,rot:3},{cls:bc,x:xC+x,y:SH+1,rot:3});   // collector stub north into the shared row
    xs.push(xC+x);x+=C.w;
  }
  let Rs=Rb;   // shared out row: north = row Rb; outDown = one row below every column
  if(dn){Rs=Math.max(...cols.map(c=>c.h));for(const c of cols)for(let y=c.bY;y<Rs;y++)it.push({cls:bc,x:c.xc,y,rot:1})}
  const xo=x;
  let hubY=0;
  if(hubAt){
    const hp=portsOf({cls:HC,x:0,y:0,rot:0,off:[]}).filter(p=>p.f==='W'&&p.y<=Rb).sort((a,b)=>b.y-a.y)[0];
    if(!hp)return no('hub has no W port at or above the out row');
    hubY=Rb-hp.y;
  }
  const xEnd=hubAt?xo-1:xo+pw.x+pw.nx;
  for(let c=Math.min(...xs);c<=xEnd;c++)it.push({cls:bc,x:c,y:Rs,rot:0});   // shared out row, east into the out container's W port (or the hub's W face)
  if(hubAt)it.push({cls:HC,x:xo,y:hubY,rot:0,ct:[]});
  else it.push({cls:PLC_BOX,x:xo,y:Rs-pw.y,rot:0,ct:[]});
  const minY=Math.min(...it.map(q=>q.y));
  const items=it.map(q=>({...q,y:q.y-Math.min(0,minY)}));
  return{ok:true,items,w:xo+(hubAt?def(HC).w:bw),h:Math.max(...items.map(q=>q.y+dim(q).h)),ports:[],hub:hubAt?{x:xo,y:hubY-Math.min(0,minY)}:null,cx:xs0,ob:{x:xo,y:Rs-pw.y-Math.min(0,minY)}};
}
// STEP 2 (pfBands node builders, inert until step 5). PF_BANDS gates the assembler (default on, step 8; a pfBands refusal falls back to pfChain).
let PF_BANDS=true;
let PF_FACT=false;   // pfFact (inert until pfFactTop + dispatch PF_FACT>PF_BANDS>pfChain, step 5)
// GROUP node: a pfColumns group (outDown) as a graph node. ins = one top terminal per input head of every column (item, edge 'N', x, y 0). out = the out box S port (edge 'S').
function pfGrpNode(cls,k,flows,sizes,mk,outFlow,org){
  const A=pfColumns(cls,k,flows,sizes,mk,outFlow,false,true,org);
  if(A.ok===false)return A;
  const a=pfAssign(cls,k,flows),its=[...a.W,...a.E,...a.N].map(p=>p.item),ins=[];
  sizes.forEach((mc,i)=>{const C=pfCol(cls,k,flows,mc,mk,true);C.ports.filter(p=>p.dir==='in').forEach((p,j)=>ins.push({item:its[j],edge:'N',x:A.cx[i]+p.off,y:0}))});
  const sps=portsOf({cls:PLC_BOX,x:A.ob.x,y:A.ob.y,rot:0,off:[]}).filter(p=>p.f==='S').sort((a,b)=>a.x-b.x);
  if(!sps.length)return{ok:false,why:'out box has no S port'};
  const outs=sps.map(sp=>({edge:'S',x:sp.x,y:A.ob.y+dim({cls:PLC_BOX,rot:0}).h}));
  return{ok:true,items:A.items,w:A.w,h:A.h,ins,out:outs[0],outs,cx:A.cx};
}
// HUB node: one Large container (DAT_Container_2). ins = its N ports (by x) then its first W port; outs = S ports (by x) then E ports (by y), named S0.. / E0.. in that order.
function pfHubNode(){
  const hc='DAT_Container_2',pts=portsOf({cls:hc,x:0,y:0,rot:0,off:[]}),d=dim({cls:hc,rot:0});
  const N=pts.filter(p=>p.f==='N').sort((a,b)=>a.x-b.x),W=pts.filter(p=>p.f==='W').sort((a,b)=>a.y-b.y).slice(0,1);
  const S=pts.filter(p=>p.f==='S').sort((a,b)=>a.x-b.x),E=pts.filter(p=>p.f==='E').sort((a,b)=>a.y-b.y);
  return{ok:true,items:[{cls:hc,x:0,y:0,rot:0,ct:[]}],w:d.w,h:d.h,
    ins:[...N.map(p=>({edge:'N',x:p.x,y:0})),...W.map(p=>({edge:'W',x:0,y:p.y}))],
    outs:[...S.map((p,i)=>({name:'S'+i,edge:'S',x:p.x,y:d.h})),...E.map((p,i)=>({name:'E'+i,edge:'E',x:d.w,y:p.y}))]};
}
// STEP 3 (pfBands graph, inert): stage graph for the band assembler. Nodes = raw hubs (layer 0, ceil(heads/8) per raw item), one group node per out group, one hub node per stage that needHub (not the final item). Edges = producer -> consumer group column head. Layers = longest path from raws; layers wider than PF_WRAP are cut into sub-layers; edges spanning >1 layer become chains of 1-wide dummies, so every edge joins layer i to i+1. Walk/sizing copied from pfChain (pfChain unchanged).
const PF_WRAP=120;
function pfBandSize(P,item,mk){
  const no=why=>({ok:false,why}),cap=MKS[mk][1];
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
  const sz=new Map();
  const sizing=y=>{
    if(sz.has(y))return sz.get(y);
    const S=st.get(y),T=S.T,cb=plnCb(T.crafter),no2=why=>({why});
    let R;
    if(!cb)R=no2('No machine builds this recipe');
    else if(S.ins.some(i=>!P.edges.some(q=>q.from===i&&q.to===y)))R=no2('no edge into '+plnNm(y));
    else{
      const N=T.machines,cls=def(cb.id).key,k=S.ins.length,flows=S.ins.map(i=>({item:i,flow:P.edges.find(q=>q.from===i&&q.to===y).flow/N}));
      if(flows.some(f=>f.flow>cap))R=no2('one machine input above one belt');
      else{
        const mcap=Math.max(1,Math.floor(Math.min(...flows.map(f=>cap/f.flow))));
        let mh=Math.min(N,mcap);while(mh>1){const C=pfCol(cls,k,flows,mh,mk);if(C.ok===false||C.h+SH<=Fh-PF_CORR)break;mh--}
        const sizes=[];for(let r=N;r>0;r-=mh)sizes.push(Math.min(mh,r));
        const outF=P.edges.filter(e=>e.from===y).reduce((a,e)=>a+e.flow,0),fo=outF/N;
        const mxC=Math.floor(cap/fo+1e-9);
        if(sizes.some(s=>s>mxC))R=no2('column of '+Math.max(...sizes)+' machines above belt cap (max '+mxC+')');
        else{
          const groups=[];for(const s of [...sizes].sort((a,b)=>b-a)){const g=groups.find(g=>(g.reduce((a,b)=>a+b,0)+s)*fo<=cap+1e-9);if(g)g.push(s);else groups.push([s])}
          R={cls,k,N,flows,sizes,groups,fo,outF,mh};
        }
      }
    }
    sz.set(y,R);return R;
  };
  for(const y of order)if(sizing(y).why)return no(sizing(y).why);
  return{ok:true,st,order,sizing,cap,Fh,SH};
}
function pfBandGraph(P,item,mk,o={}){
  const no=why=>({ok:false,why});let err=null;
  const Z=pfBandSize(P,item,mk);if(Z.ok===false)return Z;
  const {st,order,sizing}=Z;
  // needHub: same rule as pfChain (gN>1 || heads>2, never the final item); heads = one per column of each consumer stage
  const needHub=new Map();
  for(const i of order){
    let hd=0;
    for(const c of order)if(st.get(c).ins.includes(i))hd+=sizing(c).sizes.length;
    const gN=sizing(i).groups.length,nh=i!==item&&(gN>1||hd>2);
    if(nh&&(gN>5||hd>8))return no('more than one hub needed for '+plnNm(i)+' (groups '+gN+', heads '+hd+')');
    needHub.set(i,nh);
  }
  const nodes=[],edges=[],lay=new Map(),rawN=new Map(),byId=new Map();
  const add=n=>{nodes.push(n);byId.set(n.id,n);return n};
  const hubW=pfHubNode().w,hubH=pfHubNode().h,boxW=def(PLC_BOX).w;
  // producer node id for one head of input item i (raw: next raw hub, 8 heads each)
  const prod=i=>{
    if(P.nodes[i]&&P.nodes[i].crafter)return needHub.get(i)?'H:'+i:'G:'+i+':0';
    const n=rawN.get(i)||0;rawN.set(i,n+1);
    const id='R:'+i+':'+Math.floor(n/8);
    if(!byId.has(id)){add({id,kind:'raw',item:i,w:boxW,h:hubH});lay.set(id,0)}
    return id;
  };
  for(const y of order){
    const r=sizing(y);
    r.groups.forEach((g,gi)=>{
      const G=pfGrpNode(r.cls,r.k,r.flows,g,mk,g.reduce((a,b)=>a+b,0)*r.fo);
      if(G.ok===false)return void(err=G.why);
      add({id:'G:'+y+':'+gi,kind:'grp',item:y,sizes:g,w:G.w,h:G.h,cls:r.cls,k:r.k,flows:r.flows,fo:r.fo,rec:rk(st.get(y).T.rec)});
    });
    if(err)return no(err);
    let L=0;
    r.groups.forEach((g,gi)=>g.forEach((s,ci)=>r.flows.forEach(f=>{
      const p=prod(f.item);
      edges.push({from:p,to:'G:'+y+':'+gi,item:f.item,flow:s*f.flow,head:ci});
      L=Math.max(L,lay.get(p)+1);
    })));
    r.groups.forEach((g,gi)=>lay.set('G:'+y+':'+gi,L));
    if(needHub.get(y)){
      add({id:'H:'+y,kind:'hub',item:y,w:hubW,h:hubH});lay.set('H:'+y,L+1);
      r.groups.forEach((g,gi)=>edges.push({from:'G:'+y+':'+gi,to:'H:'+y,item:y,flow:g.reduce((a,b)=>a+b,0)*r.fo,head:0}));
    }
  }
  // wrap: each original layer packed greedily into rows <= PF_WRAP; every row is one final layer
  const byL=[];nodes.forEach(n=>(byL[lay.get(n.id)]=byL[lay.get(n.id)]||[]).push(n));
  const rows=[];
  for(const col of byL){
    if(!col)continue;
    let cur=[],w=0;
    for(const n of col){
      const nw=cur.length?w+PF_GAP+n.w:n.w;
      if(cur.length&&nw>PF_WRAP){rows.push(cur);cur=[];w=0}
      w=cur.length?w+PF_GAP+n.w:n.w;cur.push(n);
    }
    rows.push(cur);
  }
  rows.forEach((r,i)=>r.forEach(n=>n.layer=i));
  const layers=rows.map(r=>r.map(n=>n.id)),dummies=[],out=[];
  const oedges=edges.map(e=>({...e,span:byId.get(e.to).layer-byId.get(e.from).layer}));
  oedges.forEach((e,ei)=>{
    if(e.span<1)return void(err='internal: edge not increasing '+e.from+'>'+e.to);
    let prev=e.from;
    for(let j=1;j<e.span;j++){
      const d={id:'D'+ei+'.'+j,kind:'dummy',item:e.item,flow:e.flow,w:1,layer:byId.get(e.from).layer+j};
      dummies.push(d);byId.set(d.id,d);layers[d.layer].push(d.id);
      out.push({from:prev,to:d.id,item:e.item,flow:e.flow,head:e.head,oe:ei});prev=d.id;
    }
    out.push({from:prev,to:e.to,item:e.item,flow:e.flow,head:e.head,oe:ei});
  });
  if(err)return no(err);
  if(PF_DEBUG)console.table(layers.map((ids,i)=>({layer:i,nodes:ids.filter(d=>byId.get(d).kind!=='dummy').join(' '),dummies:ids.filter(d=>byId.get(d).kind==='dummy').length,width:ids.reduce((a,d)=>a+byId.get(d).w,0)+PF_GAP*(ids.length-1)})));
  return{ok:true,nodes,dummies,edges:out,oedges,layers};
}
// Tile-fit helpers (wall grid every PF_GRID.cw cols / PF_GRID.ch rows). x,y absolute cells.
const pfMod=(v,c)=>((v%c)+c)%c;
const pfFitX=(x,w,dummy)=>{const c=PF_GRID.cw,m=pfMod(x,c);return dummy?(m>=2&&m<=c-3):(m>=1&&m+w<=c-1)};
const pfFitY=(y,h)=>{const c=PF_GRID.ch,m=pfMod(y,c);return m>=1&&m+h<=c-1};
const pfTrackOk=(t,y0)=>{const m=pfMod(t,PF_GRID.ch);return t>=y0+2&&m>=2&&m<=PF_GRID.ch-3};
// bounded x search: first x'>=x within one wall period that fits, else -1 (never loops forever)
const pfNextX=(x,w,dummy)=>{for(let d=0;d<PF_GRID.cw;d++)if(pfFitX(x+d,w,dummy))return x+d;return -1};
// STEP 4 (pfBands gutter router, inert: no caller). links=[{id,item,sx,tx}]: leaves a source port at column sx going south at row y0, must enter a target terminal at column tx going south at row y1 (gutter rows y0..y1-1). Route = top leg south -> track row (east rot 0 / west rot 2) -> descent south. Same column (sx==tx) = straight. A.sx==B.tx => A track above B. A leg that meets another link's track span goes under it: UG pair at t-1,t+1 (cell t skipped). Returns {ok:true,items,tracks} or {ok:false,why}.
function pfGutter(links,y0,y1,mk){
  const no=why=>({ok:false,why}),bc=PLC_BELT[mk],ug=PLC_UG[mk],cw=PF_GRID.cw;
  if(def(ug).maxApart<3)return no('gutter UG too short');
  const sxs=new Set(),txs=new Set();
  for(const l of links){if(sxs.has(l.sx)||txs.has(l.tx))return no('gutter cells clash');sxs.add(l.sx);txs.add(l.tx)}
  const T=links.filter(l=>l.sx!==l.tx).map(l=>({...l,lo:Math.min(l.sx,l.tx),hi:Math.max(l.sx,l.tx),rk:0,ti:-1,t:0}));
  let ch=true,n=0;
  while(ch&&n<=T.length){ch=false;n++;for(const a of T)for(const b of T)if(a!==b&&a.sx===b.tx&&b.rk<a.rk+1){b.rk=a.rk+1;ch=true}}
  if(ch)return no('gutter order cycle');
  const rows=[];for(let t=y0+2,last=-Infinity;t<=y1-2;t++)if(pfTrackOk(t,y0)&&t-last>=3){rows.push(t);last=t}
  const occ=[];
  for(const l of [...T].sort((a,b)=>a.rk-b.rk||a.lo-b.lo)){
    let i=Math.max(0,...T.filter(a=>a!==l&&a.sx===l.tx).map(a=>a.ti+1));
    while(occ[i]&&occ[i].some(m=>m.lo<=l.hi&&l.lo<=m.hi))i++;
    if(i>=rows.length)return no('gutter too short');
    (occ[i]=occ[i]||[]).push(l);l.ti=i;l.t=rows[i];
  }
  const cell=new Map();let bad=null;
  const put=(x,y,c,rot)=>{const k=x+','+y;if(cell.has(k)){bad='gutter cells clash';return}cell.set(k,{cls:c,x,y,rot})};
  // one south leg in column c, rows a..b; goes under every other link's track it meets
  const leg=(l,c,a,b)=>{
    const X=[];
    for(const m of T){
      if(m===l||c<m.lo||c>m.hi||m.t<a||m.t>b)continue;
      if(c===m.sx||c===m.tx||m.t-1<a||m.t+1>b){bad='gutter cells clash';return}
      const q=pfMod(c,cw);if(q===0||q===cw-1){bad='gutter UG on wall column';return}
      X.push(m.t);
    }
    for(let y=a;y<=b;y++){if(X.includes(y))continue;put(c,y,X.some(t=>y===t-1||y===t+1)?ug:bc,1)}
  };
  links.filter(l=>l.sx===l.tx).forEach(l=>leg(l,l.sx,y0,y1-1));
  for(const l of T){
    const r=l.tx>l.sx?0:2,d=r?-1:1;
    leg(l,l.sx,y0,l.t-1);
    for(let x=l.sx;x!==l.tx;x+=d)put(x,l.t,bc,r);
    put(l.tx,l.t,bc,1);
    leg(l,l.tx,l.t+1,y1-1);
  }
  if(bad)return no(bad);
  return{ok:true,items:[...cell.values()],tracks:occ.length};
}
// STEP 5b (pfBands atom, inert: no caller). Builds one graph node at y=0, absolute x from x0, in a layer of body height B (belts run down to row B-1, the gutter starts at row B). grp: pfGrpNode with greedy column origins (each column and the last column's head box fit the wall grid), head boxes replaced by raw hubs. hub/raw: one Large container, W port belt up/over when nIn>4, S outs and E outs (reverse riser order) belted down to row B-1. Returns {ok,items,x0,x1 (exclusive),ins:[{item,head,x}],outs:[{x}]} or {ok:false,why}.
function pfBandAtom(n,x0,B,nOut,nIn,mk){
  const bc=PLC_BELT[mk],bw=def(PLC_BOX).w,HC='DAT_Container_2',items=[],ins=[],outs=[];
  if(n.kind==='grp'){
    const cw=[];for(const m of n.sizes){const C=pfCol(n.cls,n.k,n.flows,m,mk,true);if(C.ok===false)return{ok:false,why:C.why};cw.push(C.w)}
    const cwid=PF_GRID.cw;let org=[],x=x0,fit=true;
    for(let i=0;i<cw.length;i++){const need=i===cw.length-1?cw[i]+bw:cw[i];const nx=pfNextX(x,need);if(nx<0){fit=false;break}org.push(nx);x=nx+cw[i]}
    if(!fit){org=[];x=0;cw.forEach(w=>{org.push(x);x+=w})}   // straddle mode: contiguous, relative origin 0
    const G=pfGrpNode(n.cls,n.k,n.flows,n.sizes,mk,n.sizes.reduce((a,b)=>a+b,0)*n.fo,org);
    if(G.ok===false)return G;
    G.items.forEach(q=>{if(q.cls===PLC_BOX&&q.ct&&q.ct.length)return;items.push(q.cls===n.cls?{...q,rec:n.rec}:{...q})});
    G.ins.forEach((p,i)=>{items.push({cls:bc,x:p.x,y:0,rot:1},{cls:bc,x:p.x,y:1,rot:1});ins.push({item:p.item,head:Math.floor(i/n.k),x:p.x})});
    G.outs.slice(0,nOut).forEach(o=>{for(let y=o.y;y<=B-1;y++)items.push({cls:bc,x:o.x,y,rot:1});outs.push({x:o.x})});
    let x1=org[org.length-1]+cw[cw.length-1]+bw,dx=-1;   // exclusive end; dx = shift (straddle mode only)
    if(!fit){
      const occ=plcOcc(items),span=x1;
      for(let d=0;d<cwid&&dx<0;d++){
        const a=x0+d;let ok=true;
        for(let c=Math.ceil((a+1)/cwid)*cwid;c<a+span&&ok;c+=cwid)if(!plcTryCut(items,occ,B,true,c-a))ok=false;
        if(ok&&[...ins,...outs].some(p=>{const m=pfMod(a+p.x,cwid);return m<1||m>cwid-2}))ok=false;
        if(ok)dx=a;
      }
      if(dx<0)return{ok:false,why:'wide column ('+span+') has no wall cut at any shift'};
      items.forEach(q=>q.x+=dx);ins.forEach(p=>p.x+=dx);outs.forEach(p=>p.x+=dx);x1+=dx;
    }
    return{ok:true,items,x0:(fit?org[0]:dx),x1,ins,outs};
  }
  const H=pfHubNode(),hw=H.w;
  const a=pfNextX(x0,hw+5);if(a<0)return{ok:false,why:'hub does not fit a wall cell'};
  const hx=a+1;
  items.push({cls:HC,x:hx,y:0,rot:0,ct:n.kind==='raw'?[{item:n.item,n:0,inf:true}]:[]});
  H.ins.forEach(p=>ins.push({x:p.edge==='W'?hx-1:hx+p.x}));
  if(nIn>4){const Wy=H.ins.find(p=>p.edge==='W').y;for(let y=0;y<Wy;y++)items.push({cls:bc,x:hx-1,y,rot:1});items.push({cls:bc,x:hx-1,y:Wy,rot:0})}
  H.outs.slice(0,nOut).forEach(o=>{
    if(o.edge==='S'){const x=hx+o.x;for(let y=o.y;y<=B-1;y++)items.push({cls:bc,x,y,rot:1});outs.push({x})}
    else{const j=+o.name.slice(1),c=hx+hw+(3-j);for(let x=hx+hw;x<c;x++)items.push({cls:bc,x,y:o.y,rot:0});for(let y=o.y;y<=B-1;y++)items.push({cls:bc,x:c,y,rot:1});outs.push({x:c})}
  });
  return{ok:true,items,x0:a,x1:a+hw+5,ins,outs};
}
// STEP 5c (pfBands assembler, inert: no caller). Layers top to bottom; each layer = atoms left to right (dummies = 1-wide belt columns) at body height Hl; gutters (pfGutter) between layers, each layer top row Tb[i] fits the wall grid. Returns {ok,items,w,h,ports,nLayers} or {ok:false,why}.
function pfBandsBuild(P,item,mk){
  const no=why=>({ok:false,why}),G=pfBandGraph(P,item,mk);
  if(G.ok===false)return G;
  const byId=new Map();[...G.nodes,...G.dummies].forEach(n=>byId.set(n.id,n));
  const outs={},ins={};
  G.edges.forEach((e,ei)=>{(outs[e.from]=outs[e.from]||[]).push(ei);(ins[e.to]=ins[e.to]||[]).push(ei)});
  const nL=G.layers.length,isFin=n=>n.kind==='grp'&&n.item===item;
  if(!G.layers[nL-1].every(id=>isFin(byId.get(id))))return no('final groups wrapped');
  const Hl=G.layers.map(l=>Math.max(1,...l.map(id=>byId.get(id)).filter(n=>n.kind!=='dummy').map(n=>n.h)));
  if(Hl.some(h=>h>PF_GRID.ch-2))return no('layer taller than a tile');
  const bc=PLC_BELT[mk],atom=new Map(),aItems=[];let wMax=0;
  let bad=null;
  G.layers.forEach((l,i)=>{
    if(bad)return;
    let cur=1;const its=[];
    for(const id of l){
      const n=byId.get(id),nIn=(ins[id]||[]).length,ne=(outs[id]||[]).length;let A;
      if(n.kind==='dummy'){
        const x=pfNextX(cur,1,true);if(x<0){bad={ok:false,why:'dummy does not fit a wall cell'};return}cur=x+1+PF_GAP;
        for(let y=0;y<Hl[i];y++)its.push({cls:bc,x,y,rot:1});
        A={ins:[{x}],outs:[{x}],x1:x+1};
      }else{
        A=pfBandAtom(n,cur,Hl[i],isFin(n)?Math.max(1,ne):ne,nIn,mk);
        if(A.ok===false){bad=A;return}
        cur=A.x1+PF_GAP;its.push(...A.items);
      }
      atom.set(id,A);wMax=Math.max(wMax,A.x1);
    }
    aItems.push(its);
  });
  if(bad)return bad;
  const sx=ei=>{const e=G.edges[ei];return atom.get(e.from).outs[outs[e.from].indexOf(ei)].x};
  const tx=ei=>{
    const e=G.edges[ei],A=atom.get(e.to);
    if(byId.get(e.to).kind==='grp')return A.ins.find(p=>p.item===e.item&&p.head===e.head).x;
    return A.ins[ins[e.to].indexOf(ei)].x;
  };
  const Tb=[];let t0=1;while(!pfFitY(t0,Hl[0]))t0++;Tb[0]=t0;
  const gut=[];
  for(let i=1;i<nL;i++){
    const y0=Tb[i-1]+Hl[i-1],links=[];
    G.edges.forEach((e,ei)=>{if(byId.get(e.from).layer===i-1&&byId.get(e.to).layer===i)links.push({id:ei,item:e.item,sx:sx(ei),tx:tx(ei)})});
    let done=false;
    for(let T=y0+1;T<=y0+150&&!done;T++){
      if(!pfFitY(T,Hl[i]))continue;
      const r=pfGutter(links,y0,T,mk);
      if(r.ok){Tb[i]=T;gut.push(...r.items);done=true}
      else if(r.why!=='gutter too short')return no(r.why+' (layer '+i+')');
    }
    if(!done)return no('gutter search failed layer '+i);
  }
  const items=[];
  aItems.forEach((its,i)=>its.forEach(q=>items.push({...q,y:q.y+Tb[i]})));
  items.push(...gut);
  const ports=G.layers[nL-1].map(id=>({edge:'S',off:atom.get(id).outs[0].x,dir:'out',belts:1,slot:-1,mk}));
  return{ok:true,items,w:wMax+1,h:Tb[nL-1]+Hl[nL-1],ports,nLayers:nL};
}
function pfBands(P,item,mk,spMk,o={}){const T=P.nodes[item],BX=o.box||PLC_BOX;const R=pfBandsBuild(P,item,mk);if(R.ok===false)return R;return{ok:true,items:R.items.map(q=>({h:0,pid:0,...q})),lanes:1,per:[T.machines],makes:T.machines*T.pmach,pitch:R.h+1,w:R.w,h:R.h,tall:true,mod:false,box:BX,mk,ports:R.ports,note:['Prefab bands: '+R.nLayers+' layers, S out'],src:{P,item,mk,spMk,o},prefab:true};}
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
// HUB outputs (step 7h): j=0..3 = E ports (exit row sy, riser at hubRight+j). j=4..7 = S ports k=j-4, depth d=3-k: stub south (rot 1) from the port to row bot+d, east along it, riser at hubRight+4+d. pre = stub belts. hr = where the exit row starts.
function hubOut(H,j){
  const hr=H.x+H.w;
  if(j<4)return{sx:hr+j,sy:H.y+H.outP[j],hr,pre:[]};
  const k=j-4,d=3-k,bot=H.y+H.hh,px=H.x+H.sP[k],pre=[];
  for(let i=0;i<d;i++)pre.push([px,bot+i,1]);
  return{sx:hr+4+d,sy:bot+d,hr:px,pre};
}
let PF_DEBUG=false;   // step 7i: pfChain console.table of per-item groups/heads/demand
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
  const items=[],ports=[],per=[],sink=new Map(),hubs=new Map(),routes=[];
  let x0=0,makes=0;
  // sizing (step 7i): per stage, machines per column, column sizes, out groups (FFD). Pure per stage, memoised.
  const sz=new Map();
  const sizing=y=>{
    if(sz.has(y))return sz.get(y);
    const S=st.get(y),T=S.T,cb=plnCb(T.crafter),no2=why=>({why});
    let R;
    if(!cb)R=no2('No machine builds this recipe');
    else if(S.ins.some(i=>!P.edges.some(q=>q.from===i&&q.to===y)))R=no2('no edge into '+plnNm(y));
    else{
      const N=T.machines,cls=def(cb.id).key,k=S.ins.length,flows=S.ins.map(i=>({item:i,flow:P.edges.find(q=>q.from===i&&q.to===y).flow/N}));
      if(flows.some(f=>f.flow>cap))R=no2('one machine input above one belt');
      else{
        const mcap=Math.max(1,Math.floor(Math.min(...flows.map(f=>cap/f.flow))));
        // machines per column: the most that fit the floor (as pfCompose) and the belt cap; several columns share one out row
        let mh=Math.min(N,mcap);while(mh>1){const C=pfCol(cls,k,flows,mh,mk);if(C.ok===false||C.h+SH<=Fh-PF_CORR)break;mh--}
        const sizes=[];for(let r=N;r>0;r-=mh)sizes.push(Math.min(mh,r));
        const outF=P.edges.filter(e=>e.from===y).reduce((a,e)=>a+e.flow,0),fo=outF/N;
        // out groups (step 7e): consecutive columns whose output fits one belt; each group = one out row + one out container (sink)
        const mxC=Math.floor(cap/fo+1e-9);
        if(sizes.some(s=>s>mxC))R=no2('column of '+Math.max(...sizes)+' machines above belt cap (max '+mxC+')');
        else{
          const groups=[];for(const s of [...sizes].sort((a,b)=>b-a)){const g=groups.find(g=>(g.reduce((a,b)=>a+b,0)+s)*fo<=cap+1e-9);if(g)g.push(s);else groups.push([s])}
          R={cls,k,N,flows,sizes,groups,fo,outF};
        }
      }
    }
    sz.set(y,R);return R;
  };
  for(const y of order)if(sizing(y).why)return no(sizing(y).why);
  // needHub (step 7i): an item needs a hub when its stage has several out groups or more than two consumer heads. heads = one per column of each consumer stage.
  const needHub=new Map(),tab=[],lvl=new Map();
  // step 0 debug: level = longest path from the stage to the final item (consumers first)
  for(const i of [...order].reverse()){let L=0;for(const c of order)if(st.get(c).ins.includes(i))L=Math.max(L,lvl.get(c)+1);lvl.set(i,L)}
  for(const i of order){
    const gN=sizing(i).groups.length,dems=[];
    for(const c of order){if(!st.get(c).ins.includes(i))continue;const rc=sizing(c),fl=rc.flows.find(f=>f.item===i).flow;for(const m of rc.sizes)dems.push(m*fl)}
    const hd=dems.length,nh=i!==item&&(gN>1||hd>2);
    // band width (step 0 debug): sum of column widths from sizing(i) + PF_GAP between columns
    const rs=sizing(i),bandW=rs.sizes?rs.sizes.reduce((a,s)=>a+pfCol(rs.cls,rs.k,rs.flows,s,mk).w,0)+PF_GAP*(rs.sizes.length-1):NaN;
    needHub.set(i,nh);tab.push({item:plnNm(i),level:lvl.get(i),band:bandW,groups:gN,heads:hd,demand:dems.join('/'),hub:nh});
  }
  if(PF_DEBUG)console.table(tab);
  for(const q of tab)if(q.hub&&(q.groups>5||q.heads>8))return no('more than one hub needed for '+q.item+' (groups '+q.groups+', heads '+q.heads+'): '+JSON.stringify(tab));
  for(const y of order){
    const S=st.get(y),T=S.T,r=sizing(y),N=r.N,cls=r.cls,rec=rk(T.rec),k=r.k,flows=r.flows,fo=r.fo,sizes=r.sizes,needH=needHub.get(y);
    const groups=r.groups.map(g=>[...g]);
    const fedSet=new Set(S.ins.filter(i=>P.nodes[i]&&P.nodes[i].crafter)),isHead=q=>q.cls===PLC_BOX&&q.ct&&q.ct.length;
    const sinks=[],heads=new Map();   // heads: crafted input -> [{h, C, dx}] over all groups of this stage
    // hub overflow (step 7g): groups above the hub's N ports -> the last multi-column group feeds the hub's W face (no sink), the others use N ports
    const HCc='DAT_Container_2',hubIn=Math.min(4,portsOf({cls:HCc,x:0,y:0,rot:0,off:[]}).filter(p=>p.f==='N').length),szs=groups.map(g=>g.join('+')).join(', ');
    let wG=null;
    if(needH&&groups.length>hubIn){
      if(groups.length-1>hubIn)return no('hub ports exceeded: groups '+groups.length+' ['+szs+'] (second hub not built)');
      const mi=groups.map(g=>g.length>1).lastIndexOf(true);
      if(mi<0)return no('hub ports exceeded: groups '+groups.length+' ['+szs+'], no multi-column group for the W entry');
      groups.push(...groups.splice(mi,1));wG=groups[groups.length-1];
    }
    let hubW=null;
    for(const gs of groups){
      const W=gs===wG;
      const C=W?pfColumns(cls,k,flows,gs,mk,gs.reduce((a,b)=>a+b,0)*fo,true):gs.length===1?pfCol(cls,k,flows,gs[0],mk):pfColumns(cls,k,flows,gs,mk,gs.reduce((a,b)=>a+b,0)*fo);
      if(C.ok===false)return no(C.why);
      if(C.h+SH>Fh-PF_CORR)return no('chain stage taller than the floor minus corridor rows (not built)');
      if(W&&C.hub.y+8>Fh-PF_CORR)return no('hub below stage zone');
      const dx=x0;
      // every trunk head of a crafted input becomes a corridor from its upstream sink; raw heads stay as source containers
      C.items.forEach(q=>{
        if(isHead(q)&&fedSet.has(q.ct[0].item))return;
        const o2={...q,x:q.x+dx};if(q.cls===cls)o2.rec=rec;items.push(o2);
      });
      // demand of a head = its column's machines * per-machine flow; columns are placed in x order = gs order
      for(const i of fedSet){
        const all=C.items.filter(q=>isHead(q)&&q.ct[0].item===i),byX=[...all].sort((a,b)=>a.x-b.x),fl=flows.find(f=>f.item===i).flow;
        if(all.length!==gs.length)return no('internal: head count');
        const hl=heads.get(i)||heads.set(i,[]).get(i);
        all.forEach(h=>hl.push({h,C,dx,dem:gs[byX.indexOf(h)]*fl}));
      }
      if(y===order[0])C.items.filter(q=>isHead(q)&&!fedSet.has(q.ct[0].item)).forEach(h=>ports.push({edge:'N',off:h.x+dx,dir:'in',belts:1,slot:ports.length,mk}));
      if(W){hubW={x:dx+C.hub.x,y:C.hub.y};x0=dx+Math.max(C.w,...C.items.map(q=>q.x+dim(q).w))+PF_GAP;continue}   // the hub is in C.items; no sink, no N route
      const sk=C.items.find(q=>q.cls===PLC_BOX&&q.y===0&&q.ct&&!q.ct.length);
      const fl=gs.reduce((a,b)=>a+b,0)*fo;
      sinks.push({x:sk.x+dx,flow:fl,left:fl,n:0});
      if(y===item)ports.push({edge:'N',off:sk.x+dx,dir:'out',belts:1,slot:-1,mk});
      x0=dx+Math.max(C.w,...C.items.map(q=>q.x+dim(q).w))+PF_GAP;
    }
    if(needH){
      // hub (step 7f): one DAT_Container_2 right of the groups; each group sink feeds one N port, consumers leave by E ports. Step 7g: hubW = hub already placed by the W-fed group (its y = hub row offset)
      const hc=HCc,pts=portsOf({cls:hc,x:0,y:0,rot:0,off:[]});
      const inP=pts.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b),outP=pts.filter(p=>p.f==='E').map(p=>p.y).sort((a,b)=>a-b);
      if(sinks.length>hubIn)return no('hub ports exceeded: groups '+groups.length+' ['+szs+'] (second hub not built)');
      const hw=def(hc).w,hh=dim({cls:hc,rot:0}).h,hx=hubW?hubW.x:x0+1,hy=hubW?hubW.y:0;
      // step 7h: S ports (sorted by x) are hub outputs too; the S stubs and their rows need 3+1 rows under the hub
      const sP=pts.filter(p=>p.f==='S').map(p=>p.x).sort((a,b)=>a-b);
      if(hy+hh+3+1>Fh-PF_CORR)return no('hub S outputs below stage zone');
      if(!hubW)items.push({cls:hc,x:hx,y:0,rot:0,ct:[]});
      hubs.set(y,{x:hx,w:hw,hh,inP,outP,sP,used:0,groups:groups.length,cols:sizes.length,y:hy});
      sinks.forEach((s,g)=>routes.push({sx:s.x,tx:hx+inP[g],item:y,tTop:hy,toHub:true}));
      x0=hx+hw+PF_GAP+8;
    } else sink.set(y,sinks);
    // route assignment: biggest head demand first, to the first sink (N port 0/1) with enough left; hubbed producer: heads take E ports top to bottom
    for(const i of fedSet){
      const H=hubs.get(i);
      if(H){
        const hs=(heads.get(i)||[]).sort((a,b)=>b.dem-a.dem);
        for(const hd of hs){
          if(H.used>=8)return no('hub outputs exceeded: stage '+plnNm(i)+' columns '+H.cols+' heads '+hs.length+' demand per head '+hs.map(h=>h.dem).join('/')+' (cap 8, second hub not built)');
          const j=H.used++;
          routes.push({...hubOut(H,j),tx:hd.h.x+hd.dx,item:i,tTop:Math.min(...hd.C.items.filter(q=>PLC_BELT.includes(q.cls)&&q.y>0&&q.x===hd.h.x).map(q=>q.y))});
        }
        continue;
      }
      const sup=sink.get(i),hs=(heads.get(i)||[]).sort((a,b)=>b.dem-a.dem);
      for(const hd of hs){
        const s=sup.find(q=>q.left>=hd.dem-1e-6&&q.n<2);
        if(!s)return no('head demand '+hd.dem+' does not match sink supply '+JSON.stringify(sup)+' (misaligned)');
        s.left-=hd.dem;
        routes.push({sx:s.x+s.n,tx:hd.h.x+hd.dx,item:i,tTop:Math.min(...hd.C.items.filter(q=>PLC_BELT.includes(q.cls)&&q.y>0&&q.x===hd.h.x).map(q=>q.y))});
        s.n++;
      }
    }
    if(y===item)makes=N*T.pmach;
    per.push(N);
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
  if(rowsIv.length>PF_CORR)return no('corridor rows '+rowsIv.length+' exceed the '+PF_CORR+' reserved (floor '+Fh+'): too many crossing corridors for one block (not built)');
  const itemOcc=new Set();items.forEach(b=>{const e=dim(b);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)itemOcc.add((b.x+i)+','+(b.y+j))});
  // verticals first: riser up from the sink N port, corner east, corner south at the trunk, descent into the trunk top
  for(const rt of routes){
    const R=rt.R,vs=[];
    if(rt.pre)for(const c of rt.pre)vs.push(c);   // hub S stub belts (south, step 7h)
    if(rt.sy!==undefined)for(let x=rt.hr;x<rt.sx;x++)vs.push([x,rt.sy,0]);   // hub exit belts east to the riser column
    for(let y=R+1;y<=(rt.sy??-1);y++)vs.push([rt.sx,y,3]);
    vs.push([rt.sx,R,0],[rt.tx,R,1]);
    // descent to the trunk top; a stage's out row (or any stage item) across it goes under with a UG pair
    const dy=[];for(let y=R+1;y<rt.tTop;y++)dy.push(y);
    const blk=new Set(dy.filter(y=>itemOcc.has(key(rt.tx,y))));
    for(const y of blk)if(!dy.includes(y-1)||!dy.includes(y+1)||blk.has(y-1)||blk.has(y+1))return no('descent crossing not routable');
    for(const y of dy)if(!blk.has(y))vs.push([rt.tx,y,1,blk.has(y+1)?'in':blk.has(y-1)?'out':'b']);
    for(const [x,y,r,t] of vs){if(occ.has(key(x,y)))return no('corridor cells clash');occ.add(key(x,y));cells.push({cls:t==='in'||t==='out'?ug:bc,x,y,rot:r})}
  }
  // horizontals: a cell under another corridor's vertical is skipped, the belts either side become a UG pair
  for(const rt of routes){
    const R=rt.R,seg=[];
    for(let x=rt.sx+1;x<rt.tx;x++)seg.push({x,t:occ.has(key(x,R))?'skip':'b'});
    const mxA=def(ug).maxApart;
    for(let i=0;i<seg.length;i++)if(seg[i].t==='skip'){
      let j=i;while(j+1<seg.length&&seg[j+1].t==='skip')j++;   // run of adjacent risers: one UG pair spans them
      if(i===0||j===seg.length-1||j-i+2>mxA||seg[i-1].t!=='b'||seg[j+1].t!=='b')return no('corridor crossing not routable');
      seg[i-1].t='in';seg[j+1].t='out';i=j+1;
    }
    for(const s of seg)if(s.t!=='skip')cells.push({cls:s.t==='b'?bc:ug,x:s.x,y:R,rot:0});
  }
  const all=[...items,...cells],minY=Math.min(...all.map(q=>q.y)),sh=minY<0?-minY:0;
  const out=all.map(q=>({...q,y:q.y+sh}));
  const H=Math.max(...out.map(q=>q.y+dim(q).h)),W=Math.max(...out.map(q=>q.x+dim(q).w));
  const SM=pfSeams({items:out,w:W,h:H,ports},mk);if(!SM)return no('no free wall column for the block tile (seam search failed) h'+H+' w'+W+' floor'+Fh);
  return{ok:true,items:SM.items.map(q=>({h:0,pid:0,...q})),lanes:1,per,makes,pitch:H+1,w:SM.w,h:H,mod:false,box:BX,mk,ports:SM.ports,note:['Prefab chain: '+order.length+' stages, corridors above; crafted inputs fed from upstream sink boxes'],src:{P,item,mk,spMk,o},prefab:true};
}
// STEP 2 (2D bands), behind PF_DOWN2 (test hook, default off): two-row chain, top to bottom. Stage A = raw-fed stage, outDown (sink box at its bottom, S out). Gutter of PF_GUT rows. Stage B = the item, fed by A's sink, outDown too (S out). B's own head box is removed; one belt column (rot 1) from A's sink S port runs down through the gutter into B's trunk top. Refuses: not a 2-stage chain, several columns per stage, several inputs for B, a block taller than the floor.
let PF_DOWN2=false;
const PF_GUT=3;   // rows between stage A's sink and stage B's band
function pfChainDown(P,item,mk,spMk,o={}){
  const no=why=>({ok:false,why}),BX=o.box||PLC_BOX,cap=MKS[mk][1],bc=PLC_BELT[mk],T=P.nodes[item];
  if(!T||!T.rec)return no('no recipe');
  if(T.rec.i.some(([y])=>y===item))return no('growth not built in prefab');
  if(T.rec.i.length!==1)return no('two-row chain: one input only');
  const a=T.rec.i[0][0],TA=P.nodes[a];
  if(!(TA&&TA.rec&&TA.crafter))return no('two-row chain: input is not a crafted stage');
  if(!TA.rec.i.every(([x])=>!(P.nodes[x]&&P.nodes[x].crafter)))return no('two-row chain: more than two stages not built');
  const Fh=floorRect({cls:plcCls(PL_STD[PL_STD.length-1]),x:0,y:0,h:0,rot:0}).h;
  // one stage = one column of all its machines, outDown
  const stage=y=>{
    const S=P.nodes[y],cb=S.rec&&plnCb(S.crafter);
    if(!cb)return{why:'No machine builds this recipe'};
    const N=S.machines,cls=def(cb.id).key,ins=S.rec.i.map(([x])=>x),flows=[];
    for(const x of ins){const e=P.edges.find(q=>q.from===x&&q.to===y);if(!e)return{why:'no edge into '+plnNm(y)};flows.push({item:x,flow:e.flow/N})}
    if(flows.some(f=>f.flow>cap))return{why:'one machine input above one belt'};
    const outF=P.edges.filter(e=>e.from===y).reduce((s,e)=>s+e.flow,0);
    if(outF>cap)return{why:'output above belt cap: out stack not built'};
    const C=pfCol(cls,ins.length,flows,N,mk,true);
    if(C.ok===false)return{why:C.why};
    if(C.h>Fh)return{why:'stage taller than the floor (not built)'};
    return{N,cls,rec:rk(S.rec),C};
  };
  const A=stage(a),B=stage(item);
  if(A.why)return no(A.why);
  if(B.why)return no(B.why);
  const sk=A.C.items.find(q=>q.cls===PLC_BOX&&q.ct&&!q.ct.length),skB=B.C.items.find(q=>q.cls===PLC_BOX&&q.ct&&!q.ct.length),hd=B.C.items.find(q=>q.cls===PLC_BOX&&q.ct&&q.ct.length);
  if(!sk||!skB||!hd)return no('two-row chain: sink or head box missing');
  const sp=portsOf({cls:PLC_BOX,x:sk.x,y:sk.y,rot:0,off:[]}).find(p=>p.f==='S');
  if(!sp)return no('sink box has no S port');
  const X=sp.x,yS=sk.y+dim(sk).h,dxB=X-hd.x,yB=A.C.h+PF_GUT;   // belt column = A's sink S port x; B's trunk lands on it
  if(yS>yB+1)return no('gutter too short for the sink belt');
  const spB=portsOf({cls:PLC_BOX,x:skB.x+dxB,y:skB.y+yB,rot:0,off:[]}).find(p=>p.f==='S');
  if(!spB)return no('sink box has no S port');
  const items=[],put=(R,dx,dy,keep)=>R.C.items.forEach(q=>{if(!keep(q))return;const o2={...q,x:q.x+dx,y:q.y+dy};if(q.cls===R.cls)o2.rec=R.rec;items.push(o2)});
  put(A,0,0,()=>true);
  put(B,dxB,yB,q=>!(q.cls===PLC_BOX&&q.ct&&q.ct.length));   // B's head removed: fed by the belt column below
  for(let y=yS;y<=yB+1;y++)items.push({cls:bc,x:X,y,rot:1});
  const ports=[...A.C.ports.filter(p=>p.dir==='in'),{edge:'S',off:spB.x,dir:'out',belts:1,slot:-1,mk}];
  const H=Math.max(...items.map(q=>q.y+dim(q).h)),W=Math.max(...items.map(q=>q.x+dim(q).w));
  if(Math.min(...items.map(q=>q.x))<0||Math.min(...items.map(q=>q.y))<0)return no('two-row chain: negative coordinates');
  if(H>Fh)return no('two-row chain taller than the floor ('+H+' > '+Fh+')');
  const SM=pfSeams({items,w:W,h:H,ports},mk);if(!SM)return no('no free wall column for the block tile (seam search failed)');
  return{ok:true,items:SM.items.map(q=>({h:0,pid:0,...q})),lanes:1,per:[A.N,B.N],makes:B.N*T.pmach,pitch:H+1,w:SM.w,h:H,mod:false,box:BX,mk,ports:SM.ports,
    note:['Prefab two-row chain: stage A row 0, stage B row '+(yB)+' (gutter '+PF_GUT+'), S out'],src:{P,item,mk,spMk,o},prefab:true};
}
let PF_DOWN=false;   // step 1: single-stage pfCompose builds outDown (test hook, default off)
function pfCompose(P,item,mk,spMk,o={}){
  const no=why=>({ok:false,why}),T=P.nodes[item],BX=o.box||PLC_BOX;
  if(!T||!T.rec)return no('no recipe');
  if(T.rec.i.some(([x])=>x===item))return no('growth not built in prefab');
  if(!T.rec.i.every(([x])=>!(P.nodes[x]&&P.nodes[x].crafter))){   // a machine upstream: chain (step 7)
    if(PF_BANDS){const R=pfBands(P,item,mk,spMk,o);if(R.ok!==false)return R}   // step 8: bands first, refusal falls back to the old chain
    return(PF_DOWN2?pfChainDown:pfChain)(P,item,mk,spMk,o);
  }
  const cb=plnCb(T.crafter);if(!cb)return no('No machine builds this recipe');
  const N=T.machines,cls=def(cb.id).key,k=T.rec.i.length,cap=MKS[mk][1];
  const edge=x=>P.edges.find(e=>e.from===x&&e.to===item);
  const flows=T.rec.i.map(([x])=>({item:x,flow:edge(x).flow/N}));
  const m=Math.min(...flows.map(f=>Math.floor(cap/f.flow+1e-9)));   // machines one trunk per input can feed
  if(!(m>=1))return no('one machine input above belt cap (old path raises the Mk)');
  const Fh=floorRect({cls:plcCls(PL_STD[PL_STD.length-1]),x:0,y:0,h:0,rot:0}).h,pwb=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='W'),SH=pwb?pwb.y+1:0;   // same SH as pfColumns
  let mh=Math.min(m,N);
  while(mh>1){const C=pfCol(cls,k,flows,mh,mk,PF_DOWN);if(C.ok===false||C.h+SH<=Fh)break;mh--}   // ponytail: linear scan, m is small
  const sizes=[];for(let r=N;r>0;r-=mh)sizes.push(Math.min(mh,r));
  const A=sizes.length===1?pfCol(cls,k,flows,N,mk,PF_DOWN):pfColumns(cls,k,flows,sizes,mk,P.edges.find(e=>e.to==null).flow,false,PF_DOWN);
  if(A.ok===false)return no(A.why);
  const SM=pfSeams(A,mk);if(!SM)return no('no free wall column for the block tile (seam search failed)');
  const rec=rk(T.rec),items=SM.items.map(q=>({h:0,pid:0,...q,rec:q.cls===cls?rec:q.rec}));
  return{ok:true,items,lanes:1,per:[N],makes:N*T.pmach,pitch:A.h+1,w:SM.w,h:A.h,mod:false,box:BX,mk,ports:SM.ports,
    note:['Prefab column: '+N+' machine(s) in one column, one trunk per input, one sink container (the collector)'],src:{P,item,mk,spMk,o},prefab:true};
}
