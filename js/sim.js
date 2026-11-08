// ---- live simulation engine (pure: no DOM, never writes S). Fixed step = SIM_DT game seconds; snapshot of ALL levels (simLinks) taken at simInit; the level selector only changes the view.
const SIM_DT=1,SIM_WIN=60,SIM_MAXSTEPS=240,SIM_SMW=30,SIM_SMI=5;
const SIM_NOTES="Approximate, informational. Fixed 1 s steps. Containers start from their configured Contents (Infinite = unlimited); a container only outputs items it holds (a pull belt carries the first stocked item, preferring one a machine downstream needs). "+
  "Belts have no buffer: items move instantly, limited per step by the slowest belt of the connected chain (items/min). Machines keep an input and an output buffer of 2 cycles, run a cycle only when all inputs are present and the output buffer has room, and are blocked when the output cannot be delivered. Recipes without inputs never run. "+
  "Items flow downstream only: producer to machines that need them, then containers, then through splitters/balancers. Splitter = round-robin over ENABLED output ports, skipping an output that is full or saturated so the rest takes more. Balancer = items from all enabled inputs evened across all enabled outputs. "+
  "Merge (T-join) = producers sharing a belt alternate each step. Undergrounds pass items unchanged. Splitter/balancer throughput is capped by its Mk speed (60/120/180 per min). Corners are plain belts. "+
  "Elevator ports sit on the lateral edges of the door slots. A belt pointing ALONG the wall INTO the port edge is an input; any other belt beside the port (pointing away, or sideways) is an output, as for machines. An input sends items to the SAME-numbered port of the elevator at the same x,y on the level above or below, when an output belt is attached to that port; no such belt = input blocked. A splitter whose output face touches an elevator port edge is an input of that port; a splitter input (back) face touching it takes the elevator output. Items move at belt speed, no elevator speed limit. "+
  "DEFAULT (not specified by the user): with both neighbours valid, items alternate round-robin between them, skipping a full destination. The whole factory runs on all levels in one simulation.";
let SIM=null;
const simSig=()=>JSON.stringify(S.blocks);
const simOk=c=>SIM.cr.get(c)>1-1e-9;
const simInc=(m,a,b)=>{let x=m.get(a);if(!x){x=new Map();m.set(a,x)}x.set(b,(x.get(b)||0)+1)};
const simPath=(eb,xb)=>{const nx=SIM.nx,p=[],seen=new Set();for(let i=eb;i!=null&&!seen.has(i);i=nx.get(i)){seen.add(i);p.push(i);if(i===xb)break}return p};
const simDn=eb=>{let s=SIM.dn.get(eb);if(!s){s=new Set(simPath(eb,null));SIM.dn.set(eb,s)}return s};
const simCanM=(M,item)=>{const q=M.r.i.find(x=>x[0]===item);return !!q&&(M.inb[item]||0)<2*q[1]};
const simHave=cn=>{let n=0;cn.st.forEach(r=>{if(!r.inf)n+=r.n});return n};
const simCanC=(cn,item)=>{const r=cn.st.get(item);return !!(r&&r.inf)||cn.cap==null||simHave(cn)<cn.cap};
// one graph over every level: belts/ports/nx/cp joined (ids are global); chain = per-level union-find root, unique across levels
function simLinks(){
  const K={belts:[],ports:[],nx:new Map(),cp:new Map()},ch=new Map();
  [...new Set(S.blocks.map(b=>b.h))].forEach(L=>{const k=links(L);
    K.belts.push(...k.belts);K.ports.push(...k.ports);k.nx.forEach((v,a)=>K.nx.set(a,v));k.cp.forEach((v,a)=>K.cp.set(a,v));k.belts.forEach(b=>ch.set(b.id,k.chain(b.id)))});
  K.chain=id=>ch.get(id);return K;
}
function simInit(o={}){
  const K=simLinks(),capMul=o.capMul!=null?o.capMul:1;
  const Z=SIM={opts:o,capMul,K,nx:K.nx,t:0,acc:0,ring:[],cr:new Map(),rate:new Map(),fl:new Set(),lastFl:new Set(),dn:new Map(),
    M:new Map(),C:new Map(),R:new Map(),E:new Map(),mS:new Map(),cS:new Map(),rI:new Map(),prod:[],pull:[],ev:null,stat:null,sm:null,sh:new Map(),ser:[],tot:new Map(),mt:new Map()};
  K.belts.forEach(b=>{const c=K.chain(b.id),v=K.cp.get(b.id);if(!Z.rate.has(c))Z.rate.set(c,Infinity);if(v)Z.rate.set(c,Math.min(Z.rate.get(c),v/60*capMul))});
  S.blocks.filter(b=>isM(b)&&!isBelt(b)).forEach(b=>{
    if(isStore(b)){const st=new Map(),d=(def(b.cls)||{}).stats||{};
      (b.ct||[]).forEach(x=>{if(x.item&&!st.has(x.item))st.set(x.item,{n:Math.max(0,+x.n||0),inf:!!x.inf})});
      Z.C.set(b.id,{b,st,slots:d.StoresItems||null,stack:d.StackSize||null,cap:d.StoresItems&&d.StackSize?d.StoresItems*d.StackSize:null});return}
    const r=recOf(b);if(r)Z.M.set(b.id,{b,r,inb:{},out:0,cycles:0,run:false,prog:0,st:"idle",T:r.t/30,pb:[]});
  });
  const add=(mp,k,v)=>{if(!mp.has(k))mp.set(k,[]);const l=mp.get(k);if(!l.includes(v))l.push(v)};
  const elvO=new Map();   // elevator output ports (belt leaving the port) keyed x,y,h,port
  K.ports.forEach(e=>{const m=e.m,p=e.port,d=DIR[e.b.rot],c=K.chain(e.b.id),elv=(def(m.cls)||{}).elevator,into=elv?d[0]===p.io[0]&&d[1]===p.io[1]:d[0]===-p.nx&&d[1]===-p.ny,away=d[0]===p.nx&&d[1]===p.ny;
    const cn=Z.C.get(m.id);
    if(cn){if(!into)Z.pull.push({cn,belt:e.b,c});else add(Z.cS,c,{m,belt:e.b});return}/* belt beside a container port not pointing into it (away or sideways bend) = pulls from it */
    if(elv){const k=[m.x,m.y,m.h,p.key].join();   // elevator port: belt pointing at the port edge (p.io) = input router; any other belt beside it = output (same as machine outputs)
      if(into){let r=Z.E.get(k);if(!r){r={id:"e"+k,x:m.x,y:m.y,h:m.h,pk:p.key,ins:[],outs:[],rr:0};Z.E.set(k,r);Z.rate.set(r.id,Infinity)}r.ins.push({belt:e.b,c});add(Z.rI,c,r)}
      else elvO.set(k,{belt:e.b,c});
      return}
    const cat=(def(m.cls)||{}).category;
    if(cat==="Splitters"||cat==="Balancers"){let r=Z.R.get(m.id);if(!r){r={m,id:m.id,ins:[],outs:[],rr:0};Z.R.set(m.id,r);
        const v=((def(m.cls)||{}).speed||{}).itemsPerMin;Z.rate.set(m.id,v?v/60*capMul:Infinity)}
      if(into&&p.dir!=="out"){r.ins.push({belt:e.b,c});add(Z.rI,c,r)}else if(!into&&p.dir!=="in")r.outs.push({belt:e.b,c});return}
    const M=Z.M.get(m.id);if(!M)return;
    if(into)add(Z.mS,c,{M,belt:e.b});else M.pb.push({belt:e.b,c});
  });
  Z.M.forEach(M=>{if(M.pb.length)Z.prod.push(M)});
  Z.E.forEach(r=>[r.h+1,r.h-1].forEach(h=>{const o=elvO.get([r.x,r.y,h,r.pk].join());if(o)r.outs.push(o)}));   // destinations: adjacent levels up/down (round-robin via simRoute)
  Z.stat=simCalc();Z.sm=Object.assign(simCalc(SIM_SMW),{t:0,steady:false,stId:new Set()});return true;
}
const simReset=()=>SIM?simInit(SIM.opts):false;
// returns hops [{c,eb,xb,(mk|ck|rt)}] or null; marks the chain full when no sink has room
function simRoute(c,item,eb,src,vis){
  const Z=SIM;if(!simOk(c))return null;
  const dn=simDn(eb);
  for(const k of Z.mS.get(c)||[])if(dn.has(k.belt.id)&&simCanM(k.M,item))return[{c,eb,xb:k.belt.id,mk:k.M}];
  for(const k of Z.cS.get(c)||[]){const cn=Z.C.get(k.m.id);if(k.m!==src&&dn.has(k.belt.id)&&simCanC(cn,item))return[{c,eb,xb:k.belt.id,ck:cn}]}
  for(const r of Z.rI.get(c)||[]){
    const ib=r.ins.find(q=>q.c===c&&dn.has(q.belt.id));
    if(!ib||!r.outs.length||vis.has(r.id)||!simOk(r.id))continue;
    vis.add(r.id);let res=null;
    for(let k=0;k<r.outs.length&&!res;k++){const j=(r.rr+k)%r.outs.length,o=r.outs[j],sub=simRoute(o.c,item,o.belt.id,src,vis);
      if(sub)res=[{c,eb,xb:ib.belt.id,rt:r,j,ob:o.belt.id}].concat(sub)}
    vis.delete(r.id);if(res)return res;
  }
  Z.fl.add(c);return null;
}
function simEmit(c,item,eb,src){
  const Z=SIM,hops=simRoute(c,item,eb,src,new Set());if(!hops)return false;
  hops.forEach(h=>{Z.cr.set(h.c,Z.cr.get(h.c)-1);
    simPath(h.eb,h.xb).forEach(id=>simInc(Z.ev.l,id,item));
    if(h.rt){Z.cr.set(h.rt.id,Z.cr.get(h.rt.id)-1);h.rt.rr=(h.j+1)%h.rt.outs.length;simInc(Z.ev.ro,h.rt.id,h.ob)}
    if(h.mk)h.mk.inb[item]=(h.mk.inb[item]||0)+1;
    if(h.ck){const r=h.ck.st.get(item);if(!r)h.ck.st.set(item,{n:1,inf:false});else if(!r.inf)r.n++;simInc(Z.ev.ci,h.ck.b.id,item)}});
  return true;
}
function simMach(M){
  const r=M.r;
  if(!(r.i.length>0&&r.t>0)){M.st="idle";return}
  let bud=SIM_DT;
  for(let g=0;g<50;g++){
    if(!M.run){
      if(!r.i.every(x=>(M.inb[x[0]]||0)>=x[1])){M.st="starved";return}
      if(M.out>r.o[1]){M.st="blocked";return}
      r.i.forEach(x=>{M.inb[x[0]]-=x[1]});M.run=true;M.prog=0;
    }
    const need=M.T-M.prog;
    if(bud+1e-9>=need){bud-=need;M.prog=0;M.run=false;M.out+=r.o[1];M.cycles++;SIM.ev.p.set(M.b.id,(SIM.ev.p.get(M.b.id)||0)+r.o[1]);M.st="working";if(bud<1e-9)return}
    else{M.prog+=bud;M.st="working";return}
  }
}
function simTick(){
  const Z=SIM;Z.ev={l:new Map(),ci:new Map(),co:new Map(),ro:new Map(),p:new Map()};Z.fl=new Set();
  Z.rate.forEach((v,c)=>Z.cr.set(c,Math.min((Z.cr.get(c)||0)+v,Math.ceil(v))));
  // 1) producers push (rotating start = alternation at merges)
  Z.prod.forEach((_,q)=>{const M=Z.prod[(q+Z.t)%Z.prod.length],item=M.r.o[0];
    for(let g=0,prog=true;prog&&M.out>0&&g<64;g++){prog=false;
      for(let k=0;k<M.pb.length&&M.out>0;k++){const b=M.pb[(k+Z.t)%M.pb.length];
        if(simOk(b.c)&&simEmit(b.c,item,b.belt.id,M.b)){M.out--;prog=true}}}});
  // 2) containers pull
  Z.pull.forEach((_,q)=>{const P=Z.pull[(q+Z.t)%Z.pull.length],{cn,belt,c}=P;
    for(let g=0;g<8&&simOk(c);g++){
      const stk=[...cn.st].filter(([k,r])=>r.inf||r.n>0);if(!stk.length)break;
      const dn=simDn(belt.id),pref=stk.find(([k])=>(Z.mS.get(c)||[]).some(s=>dn.has(s.belt.id)&&simCanM(s.M,k))),item=(pref||stk[0])[0];
      if(!simEmit(c,item,belt.id,cn.b))break;
      const r=cn.st.get(item);if(!r.inf)r.n--;simInc(Z.ev.co,cn.b.id,item)}});
  // 3) machines advance
  Z.M.forEach(simMach);
  Z.ring.push(Z.ev);if(Z.ring.length>SIM_WIN)Z.ring.shift();
  Z.ev.p.forEach((n,id)=>{const m=Z.M.get(id),it=m.r.o[0];Z.tot.set(it,(Z.tot.get(it)||0)+n);Z.mt.set(id,(Z.mt.get(id)||0)+n)});
  Z.lastFl=Z.fl;Z.t++;
  if(Z.t%SIM_SMI===0)simSmooth();
}
// smoothed (30 s avg) snapshot, refreshed every SIM_SMI ticks; tracks last 3 samples per belt/container/machine for the steady flag
function simSmooth(){
  const Z=SIM,sm=simCalc(SIM_SMW),el=Math.min(Z.t,SIM_SMW),k=el?60/el:0;
  const pr=new Map();Z.ring.slice(-SIM_SMW).forEach(ev=>ev.p.forEach((n,id)=>pr.set(id,(pr.get(id)||0)+n)));
  const cur=new Map();
  sm.load.forEach((e,id)=>cur.set(id,e.tot));
  sm.cont.forEach((c,id)=>cur.set(id,c.net+c.in));
  pr.forEach((c,id)=>cur.set(id,r2(c*k)));
  new Set([...cur.keys(),...Z.sh.keys()]).forEach(id=>{let a=Z.sh.get(id);if(!a){a=[];Z.sh.set(id,a)}a.push(cur.get(id)||0);if(a.length>3)a.shift()});
  const stId=new Set();let n=0;
  Z.sh.forEach((a,id)=>{n=Math.max(n,a.length);const mx=Math.max(...a),mn=Math.min(...a);if(mx-mn>0.05*mx)stId.add(id)});
  sm.t=Z.t;sm.steady=n>=3&&!stId.size;sm.stId=stId;Z.sm=sm;
  const it={},mt={};
  pr.forEach((c,id)=>{const M=Z.M.get(id),v=r2(c*k),i=M.r.o[0];it[i]=r2((it[i]||0)+v);mt[M.b.cls]=r2((mt[M.b.cls]||0)+v)});
  Z.ser.push({t:Z.t,it,mt});if(Z.ser.length>120)Z.ser.shift();
}
function simProd(){
  const Z=SIM;if(!Z)return null;const l=Z.ser[Z.ser.length-1]||{it:{},mt:{}},tm={};
  Z.mt.forEach((n,id)=>{const c=Z.M.get(id).b.cls;tm[c]=(tm[c]||0)+n});
  return{series:Z.ser,byItem:l.it,byType:l.mt,totals:Z.tot,totalsByType:tm}}
function simCalc(win=SIM_WIN){
  const Z=SIM,ring=Z.ring.slice(-win),el=Math.min(Z.t,win),k=el?60/el:0,K=Z.K;
  const sum=f=>{const o=new Map();ring.forEach(ev=>ev[f].forEach((m,a)=>{let x=o.get(a);if(!x){x=new Map();o.set(a,x)}m.forEach((n,b)=>x.set(b,(x.get(b)||0)+n))}));return o};
  const load=new Map(),rt=new Map(),cont=new Map(),mach=new Map(),full=new Set();
  sum("l").forEach((items,id)=>{const e={items:new Map(),tot:0,cap:K.cp.get(id)||null,util:null,mixed:items.size>1};
    items.forEach((n,it)=>{e.items.set(it,r2(n*k));e.tot+=n*k});e.tot=r2(e.tot);e.util=e.cap?e.tot/e.cap:null;load.set(id,e)});
  sum("ro").forEach((outs,id)=>{const o=[];let tot=0;outs.forEach((n,b)=>{o.push({belt:b,rate:r2(n*k)});tot+=n*k});rt.set(id,{outs:o,tot:r2(tot)})});
  const ci=sum("ci"),co=sum("co");
  Z.C.forEach((cn,id)=>{const keys=new Set([...cn.st.keys(),...(ci.get(id)||new Map()).keys(),...(co.get(id)||new Map()).keys()]);
    const rows=[...keys].map(it=>{const s=cn.st.get(it)||{n:0,inf:false},i=r2((ci.get(id)&&ci.get(id).get(it)||0)*k),o=r2((co.get(id)&&co.get(id).get(it)||0)*k);
      return{item:it,n:s.n,inf:s.inf,in:i,out:o,net:r2(i-o)}});
    const t=f=>r2(rows.reduce((a,r)=>a+r[f],0)),fin=rows.filter(r=>!r.inf);
    cont.set(id,{rows,in:t("in"),out:t("out"),net:t("net"),have:fin.reduce((a,r)=>a+r.n,0),used:cn.stack?fin.reduce((a,r)=>a+Math.ceil(r.n/cn.stack),0):null,cap:cn.cap,slots:cn.slots,stack:cn.stack})});
  Z.M.forEach((M,id)=>mach.set(id,{st:M.st,cycles:M.cycles}));
  K.belts.forEach(b=>{if(Z.lastFl.has(K.chain(b.id)))full.add(b.id)});
  return{t:Z.t,cont,load,full,mach,rt};
}
function simStep(){if(!SIM)return 0;simTick();SIM.stat=simCalc();return SIM.t}
function simRun(n){if(!SIM)return 0;for(let i=0;i<n;i++)simTick();SIM.stat=simCalc();return SIM.t}
function simAdvance(dt,speed){
  const Z=SIM;if(!Z)return 0;
  Z.acc+=dt*speed;let n=Math.floor(Z.acc/SIM_DT+1e-9);Z.acc=Math.max(0,Z.acc-n*SIM_DT);
  if(n>SIM_MAXSTEPS){n=SIM_MAXSTEPS;Z.acc=0}
  if(n>0)simRun(n);return n;
}
function simState(){
  const Z=SIM;if(!Z)return null;const M={},C={};
  Z.M.forEach((m,id)=>{M[id]={st:m.st,cycles:m.cycles,out:m.out,run:m.run,prog:m.prog,inb:Object.assign({},m.inb)}});
  Z.C.forEach((c,id)=>{const stock={},inf=[];c.st.forEach((r,k)=>{stock[k]=r.n;if(r.inf)inf.push(k)});C[id]={stock,inf}});
  return{t:Z.t,M,C};
}
const smS=()=>SIM&&(SIM.sm||SIM.stat);
const simView=()=>{const K=linksC(layer);return SIM&&SIM.stat?Object.assign({},K,{load:smS().load}):K};
function linkHtml(one){
  const K=links(layer),L=K.nb.get(one.id)||[],esc2=b=>esc(nameOf(b));
  const lbl={port:"enabled port",out:"flows into",in:"fed by",pair:"underground pair"};
  let h="";
  const mrg=K.flow.filter(f=>f.merge);
  if(!L.length)h+=`<div class="sub">No linked neighbours.</div>`;
  else h+=L.map(e=>`<div class="kv" style="margin-bottom:3px">${esc2(e.b)} <span class="sub">${lbl[e.k]}${e.ps&&e.ps.length?" "+e.ps.map(p=>p.key+" (faces "+FN[p.wf]+")").join(", "):""}${e.k==="out"&&mrg.some(f=>f.u===one&&f.t===e.b)?" (T-join merge)":""}</span></div>`).join("");
  const cm=K.chainMachines(one);
  h+=`<div class="sub" style="margin-top:6px">${isBelt(one)?"Machines on this belt chain":"Machines reachable through belts"}: ${cm.length?cm.map(esc2).join(", "):"none"}</div>`;
  return sec("links","Links",h+`${K.off.filter(e=>e.m===one||e.b===one).map(e=>`<div class="sub" style="color:hsl(0,75%,68%)">disabled port ${e.port.key} (faces ${FN[e.port.wf]}) toward ${esc2(e.b===one?e.m:e.b)}: no link</div>`).join("")}`);
}
