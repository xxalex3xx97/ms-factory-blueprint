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
