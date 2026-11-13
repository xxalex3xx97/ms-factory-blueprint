// Template gallery: one card per craftable recipe, built with the engine Auto picks at a BASE rate, previewed on a small canvas.
// BASE rate = one full row: machines-per-Mk2-belt (floor(120 / max input rate per machine), min 1) x output/min of one machine.
// Everything runs client-side; results are cached per session in GAL.
const GAL={cards:[],byKey:new Map(),busy:false};
const GAL_ENG={zones:"Zones",tower:"Tower","tower-multi":"Tower (multi-input)",nl:"No Limits",vcol:"vcol"};
const galEsc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function galInit(){
  if(GAL.cards.length)return;
  plnBy(false).forEach((l,item)=>l.forEach(({c,r},idx)=>{
    const rate=q=>q*1800/r.t,mx=Math.max(...r.i.map(([,q])=>rate(q))),M=Math.max(1,Math.floor(120/mx)),
      grow=r.i.some(([x])=>x===item),cls=c.replace(/^CRAFT_/,"");
    const k={key:c+"|"+rk(r),item,c,r,cls,idx,grp:cls==="Armoury"?"Armoury":grow?"Growth":r.i.length+"-input",name:plnNm(item),inRate:mx,M,base:Math.round(M*rate(r.o[1])*100)/100,res:null};
    GAL.cards.push(k);GAL.byKey.set(k.key,k);
  }));
  GAL.cards.sort((a,b)=>a.cls.localeCompare(b.cls)||a.grp.localeCompare(b.grp)||a.name.localeCompare(b.name));
}
function galBuild(k){
  if(k.res)return k.res;
  const t0=performance.now();let L;
  try{
    const pk={};if(k.idx>0)pk[k.item]=rk(k.r);
    const P=plan(k.item,k.base,1,{sp:null,bal:null},pk,{proto:false,enr:false});
    L=placerLayout(P,k.item,1,1,{box:"DAT_Container_2",mod:false,dock:null,eng:"auto"});
  }catch(e){L={ok:false,why:"internal error ("+e.message+")"}}
  const res={ok:!!L.ok,ms:Math.round(performance.now()-t0)};
  if(L.ok){
    const T=L.tile&&L.tile.ok?L.tile:{blocks:[{cls:plcCls("BPO_Station_02"),x:0,y:0}],ms:L.items},cnt={mach:0,belt:0,spl:0,ug:0,box:0};
    L.items.forEach(b=>cnt[b.rec?"mach":PLC_UG.includes(b.cls)?"ug":PLC_BELT.includes(b.cls)?"belt":PLC_SPL.includes(b.cls)?"spl":"box"]++);
    res.eng=L.eng||"legacy";res.engName=GAL_ENG[L.eng]||"Legacy placer";res.cnt=cnt;res.blocks=L.tile&&L.tile.ok?L.tile.blocks.length:0;res.w=L.w;res.h=L.h;res.T=T;res.items=L.items;res.fb=L.blWhy||"";
    res.chip=L.eng==="vcol"||(L.eng==="zones"&&k.r.i.length===1)?["g","Golden template"]:L.eng==="tower"||L.eng==="tower-multi"?["w","Old tower (template pending)"]:L.eng==="nl"?["w","Fallback"]:L.eng==="zones"?["w","Zones (template pending)"]:["w","Legacy placer"];
  }else{res.why=String(L.why||"").replace(/ \(NL used\)$/,"");res.chip=["b","Not supported: "+res.why]}
  return k.res=res;
}
// draw a built result into a canvas: same renderer as placerShot (paint() with PLC_PREV), fitted to the canvas
function galDraw(T,out){
  const w=out.width,h=out.height,E=plcExt(T),ew=E.w+2,eh=E.h+2,z=Math.min((w-8)/(ew*CELLS.F),(h-8)/(eh*CELLS.F)),kk=CELLS.F*z;
  const sv={S:S.blocks,view,layer,V,W,H,dpr,sel,active,pasting,drag,ugPend,mode,SM,OV,hoverIn,cw:cv.width,ch:cv.height};PLC_PREV=true;
  try{
    S.blocks=[...T.blocks.map((q,i)=>({id:i+1,cls:q.cls,x:q.x,y:q.y,h:0,rot:q.rot||0,pid:0})),...T.ms.map((it,i)=>({...it,id:T.blocks.length+i+1,h:0}))];
    view="F";layer=0;V={ox:(w-ew*kk)/2+kk,oy:(h-eh*kk)/2+kk,z};W=w;H=h;dpr=1;sel=new Set();active=null;pasting=null;drag=null;ugPend=null;mode=null;SM=false;OV={};hoverIn=false;SV++;
    plcSetSize(cv,w,h);paint();
    const g=out.getContext("2d");g.clearRect(0,0,w,h);g.drawImage(cv,0,0);
  }finally{
    S.blocks=sv.S;view=sv.view;layer=sv.layer;V=sv.V;W=sv.W;H=sv.H;dpr=sv.dpr;sel=sv.sel;active=sv.active;pasting=sv.pasting;drag=sv.drag;ugPend=sv.ugPend;mode=sv.mode;SM=sv.SM;OV=sv.OV;hoverIn=sv.hoverIn;SV++;
    cv.width=sv.cw;cv.height=sv.ch;paint();PLC_PREV=false;
  }
}
const galSnip=k=>{const r=galBuild(k);return r.ok?{n:k.name+" ["+r.engName+"]",b:r.items.map((b,i)=>({...b,id:b.id||i+1}))}:null};
const galFile=(snips,name)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({v:1,snippets:snips},null,2)],{type:"application/json"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const galExport=key=>{const s=galSnip(GAL.byKey.get(key));return s?JSON.stringify({v:1,snippets:[s]},null,2):null};
function galCard(k){
  const e=k.el||(k.el=Object.assign(document.createElement("div"),{className:"galC"}));e.dataset.key=k.key;
  const r=k.res;
  e.innerHTML=`<h4>${galEsc(k.name)}</h4><div class="sub">${galEsc(k.cls)} &middot; ${k.grp} &middot; in/machine ${k.inRate.toFixed(1)}/min &middot; ${k.M}/Mk2 belt &middot; base ${k.base}/min</div>`+
    (r?`<div class="chips">${r.ok?`<span class="gch eng">Built by: ${galEsc(r.engName)}</span>`:""}<span class="gch ${r.chip[0]} stat" title="${galEsc(r.fb||r.why||"")}">${galEsc(r.chip[1])}</span></div>`:`<div class="chips"><span class="gch">not built</span></div>`)+
    (r&&r.ok?`<canvas width="320" height="200" aria-label="${galEsc(k.name)} template"></canvas><div class="st">${r.cnt.mach} machines, ${r.cnt.belt} belts, ${r.cnt.ug} UG, ${r.cnt.spl} splitters, ${r.blocks} blocks, ${r.w}x${r.h} cells, ${(r.cnt.belt/Math.max(1,r.cnt.mach)).toFixed(1)} belts/machine</div>`:"")+
    `<div class="btns">${r?"":`<button data-gb>Build</button>`}${r&&r.ok?`<button data-gx>Export snippet</button>`:""}</div>`;
  const c=e.querySelector("canvas");if(c)galDraw(r.T,c);
}
function galShow(){
  const f=$("galGrid"),q=$("galQ").value.trim().toLowerCase(),m=$("galM").value,g=$("galG").value,s=$("galS").value;
  const st=k=>!k.res?"unbuilt":k.res.ok?(k.res.chip[0]==="g"?"golden":"other"):"unsupported";
  const list=GAL.cards.filter(k=>(!q||k.name.toLowerCase().includes(q))&&(!m||k.cls===m)&&(!g||k.grp===g)&&(!s||st(k)===s));
  f.replaceChildren(...list.map(k=>{if(!k.el)galCard(k);return k.el}));$("galN").textContent=list.length+" / "+GAL.cards.length+" recipes";
}
function galStep(k){galBuild(k);galCard(k)}
function galAll(){   // time-sliced: ~30 ms of work per frame
  if(GAL.busy)return;GAL.busy=true;const todo=GAL.cards.filter(k=>!k.res),tot=todo.length;let i=0;const p=$("galProg");p.max=tot||1;
  const tick=()=>{const t0=performance.now();while(i<tot&&performance.now()-t0<30)galStep(todo[i++]);p.value=i;
    if(i<tot)requestAnimationFrame(tick);else{GAL.busy=false;galShow();$("galDone").textContent=tot?"Built "+tot:""}};
  tick();
}
function galStats(){const o={};GAL.cards.forEach(k=>{if(!k.res)return;const key=k.grp+" / "+k.res.chip[1].replace(/:.*/,"");o[key]=(o[key]||0)+1});return o}
(()=>{
  const d=document.createElement("dialog");d.id="galDlg";d.setAttribute("aria-labelledby","galT");
  d.innerHTML=`<div class="pvHd"><h3 id="galT">Template gallery</h3></div><div id="galBar"><input type="text" id="galQ" placeholder="Search recipe" aria-label="Search recipe"><select id="galM" aria-label="Machine"><option value="">All machines</option></select><select id="galG" aria-label="Inputs"><option value="">All inputs</option></select><select id="galS" aria-label="Status"><option value="">All status</option><option value="golden">Golden template</option><option value="other">Other engines</option><option value="unsupported">Not supported</option><option value="unbuilt">Not built yet</option></select><span class="sub" id="galN"></span><button id="galAll" class="pri" type="button">Build all</button><progress id="galProg" value="0" max="1"></progress><span class="sub" id="galDone"></span><button id="galExAll" type="button">Export all</button><button id="galClose" type="button">Close</button></div><div id="galGrid"></div>`;
  document.body.appendChild(d);
  $("galOpen").onclick=()=>{galInit();const fill=(id,v)=>{const s=$(id);if(s.options.length<2)[...new Set(v)].forEach(x=>s.add(new Option(x,x)))};fill("galM",GAL.cards.map(k=>k.cls));fill("galG",GAL.cards.map(k=>k.grp));galShow();if(!d.open)d.showModal()};
  ["galQ","galM","galG","galS"].forEach(i=>$(i).addEventListener("input",galShow));
  $("galAll").onclick=galAll;$("galClose").onclick=()=>d.close();
  $("galExAll").onclick=()=>{GAL.cards.filter(k=>!k.res).forEach(galStep);galShow();galFile(GAL.cards.map(galSnip).filter(Boolean),"template-library.json")};
  $("galGrid").onclick=e=>{const el=e.target.closest(".galC");if(!el)return;const k=GAL.byKey.get(el.dataset.key);if(e.target.dataset.gb!=null)galStep(k);else if(e.target.dataset.gx!=null)galFile([galSnip(k)],k.name+".json")};
})();
