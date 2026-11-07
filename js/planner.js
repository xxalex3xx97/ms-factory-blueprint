// Planner (Stage 2): plan() is pure (no DOM). byOut rebuilt per call so injected recipes count (tests).
const plnR2=v=>Math.round(v*100)/100,plnNm=id=>(ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,"");
// proto off drops the Protomatter chain: RelicSynthesizer recipes and any recipe that consumes Protomatter (Enrichment ores).
const PLN_PROTO_CR="CRAFT_RelicSynthesizer",PLN_PROTO_IT="ITEM_Protomatter";
const plnBy=proto=>{const m=new Map();Object.keys(RECS).forEach(c=>RECS[c].forEach(r=>{if(!proto&&(c===PLN_PROTO_CR||r.i.some(([x])=>x===PLN_PROTO_IT)))return;const k=r.o[0],l=m.get(k)||[],key=rk(r);if(!l.some(x=>rk(x.r)===key)){l.push({c,r});m.set(k,l)}}));return m};
const plnCb=c=>CATALOG.buildables.find(b=>(b.crafters||[]).includes(c));
const plnCname=c=>{const b=plnCb(c);return b?lab(def(b.id)):c};
const plnCico=c=>{const b=plnCb(c),d=b&&def(b.id),u=d&&iurl(d.icon);return u?`<img class="ic plnCic" alt="" title="${esc(lab(d))}" src="${u}">`:""};
// mk: 0..2 index into MKS (belt). ovr={sp,bal}: splitter/balancer Mk index or null (follow belt). pick={item:recipeKey}.
// opts.proto (default false): false ignores the Protomatter chain (see plnBy). opts.enr (default false): false picks plain-ore recipes by default, true picks the recipe that consumes enriched ores when there is one; an explicit pick always wins.
const PLN_ENR=/^ITEM_Enriched\w*Ore$/;
function plan(item,rate,mk,ovr,pick,opts){
  ovr=ovr||{};pick=pick||{};opts=opts||{};
  const by=plnBy(!!opts.proto),nodes={},edges=[],st={cycle:false},cap=i=>MKS[i][1];
  const find=it=>{const l=by.get(it)||[];return l.find(x=>rk(x.r)===pick[it])||l.find(x=>x.r.i.some(([y])=>PLN_ENR.test(y))===!!opts.enr)||l[0]||null};
  const ex=(it,rt,stack)=>{
    if(stack.has(it)){st.cycle=true;return}
    const n=nodes[it]||(nodes[it]={item:it,rate:0,rec:null,crafter:null,alts:(by.get(it)||[]).length,pmach:null,machines:0,util:null,in:[]});
    n.rate+=rt;
    const c=find(it);if(!c)return;
    n.rec=c.r;n.crafter=c.c;stack.add(it);
    c.r.i.forEach(([x,q])=>{const f=q*rt/c.r.o[1];edges.push({from:x,to:it,flow:f});ex(x,f,stack)});
    stack.delete(it);
    n.pmach=c.r.o[1]*1800/c.r.t;   // items/min per machine (raw, rounded only in display)
    n.machines=n.rate>0?Math.ceil(n.rate/n.pmach-1e-9):0;
    n.util=n.machines?n.rate/(n.machines*n.pmach):0;
  };
  ex(item,rate,new Set());
  edges.push({from:item,to:null,flow:rate});
  const agg=new Map();
  edges.forEach(e=>{const k=e.from+"|"+e.to,a=agg.get(k)||{from:e.from,to:e.to,flow:0};a.flow+=e.flow;agg.set(k,a)});
  const E=[...agg.values()].map(e=>{
    const m=e.to==null?1:nodes[e.to].machines,belts=Math.ceil(e.flow/cap(mk)-1e-9),lane=e.flow/belts;
    let fits=null;for(let i=0;i<MKS.length;i++)if(e.flow<=cap(i)+1e-9){fits=i;break}
    let split="",warn="",note="";
    if(belts===1&&m>1){split="1->3 splitter x"+Math.ceil((m-1)/2);const si=ovr.sp==null?mk:ovr.sp;if(cap(si)<lane-1e-9)warn="splitter "+MKS[si][0]+" below "+plnR2(lane)+"/min"}
    else if(belts>=2){split=belts+"->"+Math.max(belts,m)+" balancer";const bi=ovr.bal==null?mk:ovr.bal;if(cap(bi)<lane-1e-9)warn="balancer "+MKS[bi][0]+" below "+plnR2(lane)+"/min"}
    if(belts>1)note="needs "+belts+" belts"+(fits!=null?"; "+MKS[fits][0]+" carries it on 1 belt":"; no single belt carries "+plnR2(e.flow)+"/min");
    return {from:e.from,to:e.to,flow:e.flow,m,belts,fits,split,warn,note,label:plnR2(e.flow)+" items/min, "+belts+" belts ("+MKS[mk][0]+")"};
  });
  E.forEach(e=>{if(e.to!=null)nodes[e.to].in.push(e)});
  return {nodes,edges:E,raw:Object.values(nodes).filter(n=>!n.rec),cycle:st.cycle};
}
function plnDraw(){
  const it=$("plnItem").value,rate=+$("plnRate").value||0;
  if(!it||!(rate>0)){$("plnOut").innerHTML='<div class="sub">Pick a craftable item and a rate above 0.</div>';return}
  const pr=plnProto(),BY=plnBy(pr),sp=$("plnSp").value,bal=$("plnBal").value,mk=+$("plnMk").value;
  const P=plan(it,rate,mk,{sp:sp===""?null:+sp,bal:bal===""?null:+bal},PLN_PICK,{proto:pr,enr:$("plnEnr").checked});
  const col={[it]:0};   // depth from target (target = rightmost column)
  for(let k=0;k<=Object.keys(P.nodes).length;k++)P.edges.forEach(e=>{if(e.to!=null)col[e.from]=Math.max(col[e.from]||0,(col[e.to]||0)+1)});
  const ns=Object.values(P.nodes),rw=ns.filter(n=>!n.rec).length,D0=Math.max(0,...ns.filter(n=>n.rec).map(n=>col[n.item]||0));
  if(rw)ns.forEach(n=>{if(!n.rec)col[n.item]=D0+1});   // all raw inputs (ores...) in the leftmost column
  const D=rw?D0+1:D0,cols=[];
  for(let d=D;d>=0;d--)cols.push(ns.filter(n=>(col[n.item]||0)===d));
  // i = machine index (expanded view, non-raw nodes only); undefined = the node's single box
  const box=(n,i)=>{
    const m=i!=null,cr=m?Math.min(n.pmach,n.rate-i*n.pmach):n.rate,key=n.item+(m?"#"+i:"");
    const alt=n.alts>1&&(!m||i===0)?`<select class="plnAlt" data-item="${esc(n.item)}" aria-label="Recipe for ${esc(plnNm(n.item))}">${BY.get(n.item).map(x=>`<option value="${esc(rk(x.r))}"${n.rec&&rk(x.r)===rk(n.rec)?" selected":""}>${esc(plnCname(x.c))}: ${x.r.i.map(([y,q])=>q+" "+plnNm(y)).join(" + ")} -&gt; ${x.r.o[1]} ${esc(plnNm(x.r.o[0]))} (${secs(x.r.t)} s)</option>`).join("")}</select>`:"";
    const o=PLN_OFF.get(key),st=o?` style="transform:translate(${o.dx}px,${o.dy}px)"`:"";
    const sub=!n.rec?"raw &middot; "+plnR2(n.rate)+"/min":m?"1 x "+esc(plnCname(n.crafter))+" &middot; "+plnR2(cr/n.pmach*100)+"% &middot; "+plnR2(cr)+"/min"
      :n.machines+" x "+esc(plnCname(n.crafter))+" &middot; "+plnR2(n.util*100)+"% &middot; "+plnR2(n.rate)+"/min";
    return `<div class="plnBox${n.rec?"":" raw"}${m?" plnM":""}" data-item="${esc(n.item)}"${m?` data-i="${i}"`:""}${st}><div class="plnTop">${n.rec?plnCico(n.crafter):""}${itemHtml(n.item)}</div><div class="sub">${sub}</div>${alt}</div>`;
  };
  const boxes=n=>n.rec&&PLN_EX?Array.from({length:n.machines},(_,i)=>box(n,i)):[box(n)];
  const wasOpen=!!$("plnOut").querySelector(".plnFl[open]");
  $("plnOut").innerHTML=`<div class="plnVp"><div class="plnGrid">${cols.map(c=>`<div class="plnCol">${c.map(n=>boxes(n).join("")).join("")}</div>`).join("")}</div></div>`
    +`<details class="plnFl"${wasOpen?" open":""}><summary>Flows</summary><div class="plnEdges">${P.edges.map(e=>`<div class="plnEdge">${itemHtml(e.from)} &rarr; ${e.to==null?"output":itemHtml(e.to)}: ${esc(e.label)}${e.split?" &middot; "+esc(e.split):""}${e.note?` <span class="sub plnNote${e.fits==null?" bad":""}">${esc(e.note)}</span>`:""}${e.warn?` <b class="plnWarn">${esc(e.warn)}</b>`:""}</div>`).join("")}</div></details>`
    +(P.cycle?'<div class="sub">Recipe loop detected: flows approximate.</div>':"");
  PLN_E=P.edges;
  plnArrows(P.edges);
}
// Draw arrows + labels over the box grid (layout only). A node's anchor = union box of its boxes.
function plnArrows(E){
  const g=document.querySelector("#plnOut .plnGrid");if(!g)return;
  g.querySelectorAll(".plnSvg,.plnLbl").forEach(n=>n.remove());
  g.style.transformOrigin="0 0";g.style.transform=`translate(${PLN_PX}px,${PLN_PY}px) scale(${PLN_Z})`;   // zoom: rects below are divided by PLN_Z
  const G=g.getBoundingClientRect(),bx={},Z=PLN_Z;
  g.querySelectorAll(".plnBox").forEach(b=>{const r=b.getBoundingClientRect(),L=(r.left-G.left)/Z,R=(r.right-G.left)/Z,T=(r.top-G.top)/Z,B=(r.bottom-G.top)/Z,u=bx[b.dataset.item];
    if(u){u.l=Math.min(u.l,L);u.r=Math.max(u.r,R);u.t=Math.min(u.t,T);u.b=Math.max(u.b,B)}else bx[b.dataset.item]={l:L,r:R,t:T,b:B}});
  const out={},inn={};E.forEach(e=>{(out[e.from]=out[e.from]||[]).push(e);if(e.to!=null)(inn[e.to]=inn[e.to]||[]).push(e)});
  const ys=(b,l,e)=>b.t+(b.b-b.t)*(l.indexOf(e)+1)/(l.length+1);
  let sv="",lb=[];
  E.forEach(e=>{
    const a=bx[e.from];if(!a)return;
    const x1=a.r,y1=ys(a,out[e.from],e);let x2,y2;
    if(e.to==null){x2=x1+110;y2=y1}else{const b=bx[e.to];x2=b.l;y2=ys(b,inn[e.to],e)}
    const c=(x2-x1)/2,cl=e.warn?"warn":e.fits==null&&e.belts>1?"bad":"";
    sv+=`<path class="plnArr ${cl}" d="M${x1} ${y1}C${x1+c} ${y1} ${x2-c} ${y2} ${x2-7} ${y2}"/><path class="plnHead ${cl}" d="M${x2} ${y2}l-8 -4.5v9z"/>`;
    const lx=e.to==null?x1+55:x2-95;let ly=y1,bd=1e9;
    for(let t=0;t<=1;t+=.02){const s=1-t,X=s*s*s*x1+3*s*s*t*(x1+c)+3*s*t*t*(x2-c)+t*t*t*x2,d=Math.abs(X-lx);if(d<bd){bd=d;ly=s*s*s*y1+3*s*s*t*y1+3*s*t*t*y2+t*t*t*y2}}
    lb.push({x:lx,y:ly,e,cl});
  });
  g.insertAdjacentHTML("afterbegin",`<svg class="plnSvg" aria-hidden="true" width="${g.scrollWidth}" height="${g.scrollHeight}">${sv}</svg>`);
  lb.sort((p,q)=>p.x-q.x||p.y-q.y);
  lb.forEach(o=>g.insertAdjacentHTML("beforeend",`<div class="plnLbl ${o.cl}" aria-hidden="true">${esc(o.e.label)}${o.e.split?`<span class="sp">${esc(o.e.split)}</span>`:""}</div>`));
  const ls=[...g.querySelectorAll(".plnLbl")];
  ls.forEach((d,i)=>{const o=lb[i];let y=o.y;for(let j=0;j<i;j++)if(lb[j].x===o.x&&Math.abs(lb[j].y-y)<ls[j].offsetHeight/2+d.offsetHeight/2+4)y=lb[j].y+ls[j].offsetHeight/2+d.offsetHeight/2+4;o.y=y;d.style.left=o.x+"px";d.style.top=y+"px"});
}
let PLN_PICK={},PLN_OFF=new Map(),PLN_EX=false,PLN_E=[],PLN_DRAG=null,PLN_Z=1,PLN_PX=0,PLN_PY=0,PLN_PAN=null;   // PLN_Z: diagram zoom; PLN_OFF: key (item, or item#machine in expanded) -> {dx,dy}
// Drag any box (not its recipe select). Offset clamped so the box stays inside the grid (left/top >= 0).
const plnKey=b=>b.dataset.item+(b.classList.contains("plnM")?"#"+b.dataset.i:"");
$("plnOut").addEventListener("pointerdown",ev=>{
  const b=ev.target.closest(".plnBox");
  if(!b&&ev.button===0&&ev.target.closest(".plnVp")){PLN_PAN={id:ev.pointerId,x:ev.clientX,y:ev.clientY,px:PLN_PX,py:PLN_PY};$("plnOut").setPointerCapture(ev.pointerId);return}   // drag empty space = pan
  if(!b||ev.button!==0||ev.target.closest(".plnAlt,select,button"))return;
  const G=b.closest(".plnGrid").getBoundingClientRect(),r=b.getBoundingClientRect(),k=plnKey(b),o=PLN_OFF.get(k)||{dx:0,dy:0};
  PLN_DRAG={b,k,id:ev.pointerId,x:ev.clientX,y:ev.clientY,ox:o.dx,oy:o.dy,minX:-1e9,minY:-1e9};   // free move: nodes can go anywhere on the canvas
  b.setPointerCapture(ev.pointerId);b.classList.add("plnDrag");
});
$("plnOut").addEventListener("pointermove",ev=>{
  const P=PLN_PAN;if(P&&ev.pointerId===P.id){PLN_PX=P.px+ev.clientX-P.x;PLN_PY=P.py+ev.clientY-P.y;const g=document.querySelector("#plnOut .plnGrid");if(g)g.style.transform=`translate(${PLN_PX}px,${PLN_PY}px) scale(${PLN_Z})`;return}
  const d=PLN_DRAG;if(!d||ev.pointerId!==d.id)return;
  const dx=Math.max(d.minX,d.ox+(ev.clientX-d.x)/PLN_Z),dy=Math.max(d.minY,d.oy+(ev.clientY-d.y)/PLN_Z);
  PLN_OFF.set(d.k,{dx,dy});d.b.style.transform=`translate(${dx}px,${dy}px)`;plnArrows(PLN_E);
});
const plnUp=ev=>{if(PLN_PAN&&ev.pointerId===PLN_PAN.id)PLN_PAN=null;if(PLN_DRAG&&ev.pointerId===PLN_DRAG.id){PLN_DRAG.b.classList.remove("plnDrag");PLN_DRAG=null}};
$("plnOut").addEventListener("pointerup",plnUp);$("plnOut").addEventListener("pointercancel",plnUp);
// Wheel over the diagram = zoom around the cursor; double-click empty space = reset zoom.
$("plnOut").addEventListener("wheel",ev=>{
  const v=ev.target.closest(".plnVp");if(!v||ev.target.closest("select"))return;
  ev.preventDefault();
  const z=Math.min(2.5,Math.max(.3,PLN_Z*(ev.deltaY<0?1.15:1/1.15))),q=v.getBoundingClientRect(),px=ev.clientX-q.left,py=ev.clientY-q.top;
  PLN_PX=px-(px-PLN_PX)*z/PLN_Z;PLN_PY=py-(py-PLN_PY)*z/PLN_Z;PLN_Z=z;plnArrows(PLN_E);   // keep the point under the cursor fixed
},{passive:false});
$("plnOut").addEventListener("dblclick",ev=>{if(ev.target.closest(".plnVp")&&!ev.target.closest(".plnBox")){PLN_Z=1;PLN_PX=PLN_PY=0;plnArrows(PLN_E)}});
$("plnGx").onclick=()=>{PLN_EX=!PLN_EX;$("plnGx").setAttribute("aria-pressed",PLN_EX);$("plnGx").textContent=PLN_EX?"Expanded":"Grouped";plnDraw()};
const plnProto=()=>$("plnProto").value==="1";
// craftable items for the current Protomatter setting; keeps the selection if it is still craftable
const plnFillItems=()=>{const cur=$("plnItem").value;$("plnItem").innerHTML='<option value="">(none)</option>'+[...plnBy(plnProto()).keys()].sort((a,b)=>plnNm(a).localeCompare(plnNm(b))).map(k=>`<option value="${esc(k)}">${esc(plnNm(k))}</option>`).join("");if([...$("plnItem").options].some(o=>o.value===cur))$("plnItem").value=cur};
plnFillItems();
$("plnB").onclick=()=>{const d=$("pln");d.hidden=!d.hidden;$("plnB").setAttribute("aria-pressed",!d.hidden);if(!d.hidden&&PLNO===null)plnOptFold(d.clientWidth<720);plnDraw()};
$("plnX").onclick=()=>{$("pln").hidden=true;$("plnB").setAttribute("aria-pressed",false);$("plnB").focus()};
$("plnC").onclick=()=>{const c=$("pln").classList.toggle("col");$("plnC").setAttribute("aria-expanded",!c);$("plnC").title=c?"Expand":"Collapse to title bar"};
$("plnItem").onchange=()=>{PLN_PICK={};PLN_OFF=new Map();plnDraw()};
$("plnEnr").onchange=plnDraw;
$("plnProto").onchange=()=>{plnFillItems();plnDraw()};   // PLN_OFF kept: drag offsets survive
$("plnRate").oninput=$("plnMk").onchange=$("plnSp").onchange=$("plnBal").onchange=plnDraw;
$("plnOut").onchange=ev=>{const t=ev.target;if(t.classList.contains("plnAlt")){PLN_PICK[t.dataset.item]=t.value;plnDraw()}};
const sgn=v=>(v>0?"+":"")+v,
  tm=v=>v==null?"n/a":v+" min";
function storeHtml(b){
  const ct=b.ct||[],si=links(layer).sto.get(b.id),items=Object.keys(ITEMS).sort((a,c)=>((ITEMS[a].n||a)).localeCompare(ITEMS[c].n||c));
  let h=(ct.length?ct.map((x,i)=>`<div class="ctrow">${itemHtml(x.item)}<input type="number" min="0" step="1" aria-label="Quantity" data-ct="n" data-i="${i}" value="${x.n}"><label class="chk"><input type="checkbox" data-ct="inf" data-i="${i}" ${x.inf?"checked":""}> infinite</label><button data-ctdel="${i}" aria-label="Remove">&times;</button></div>`).join(""):`<div class="sub">Empty.</div>`)
    +`<div class="row" style="margin-top:6px;grid-template-columns:1fr auto"><select id="ctAdd">${items.map(k=>`<option value="${esc(k)}">${esc((ITEMS[k]||{}).n||k)}</option>`).join("")}</select><button id="bCtAdd">Add item</button></div>`;
  if(!si)return sec("store","Contents",h);
  h+=`<div class="row"><label>Slots</label><span>${si.used==null?"? / "+(si.slots==null?"?":si.slots)+" (stack size unknown)":si.used+" / "+si.slots}</span></div>`
    +`<div class="row"><label>Stack size</label><span>${si.stack==null?"unknown":si.stack+" (raw, unverified)"}</span></div>`
    +`<div class="row"><label>Flow</label><span>In ${si.in}/min &middot; Out ${si.out}/min &middot; Net ${sgn(si.net)}/min</span></div>`
    +`<div class="row"><label>Time to full</label><span>${tm(si.toFull)}</span></div>`
    +si.rows.map(r=>`<div style="margin-top:5px">${itemHtml(r.item)}<br><span class="sub">in ${r.in} &middot; out ${r.out} &middot; net ${sgn(r.net)}/min${r.toEmpty!=null?" &middot; empty in "+r.toEmpty+" min":""}</span></div>`).join("")
  return sec("store","Contents &amp; capacity",h);
}
const beltMax=b=>{const d=def(b.cls);return d&&d.speed&&d.speed.itemsPerMin||null};
function beltRateHtml(b){
  const K=links(layer),ms=K.chainMachines(b).filter(recOf),cap=beltMax(b),o=new Map(),n=new Map();
  ms.forEach(m=>{const r=recOf(m);r.i.forEach(x=>n.set(x[0],(n.get(x[0])||0)+(pm(x[1],r.t)||0)));o.set(r.o[0],(o.get(r.o[0])||0)+(pm(r.o[1],r.t)||0))});
  const tot=m=>[...m.values()].reduce((a,v)=>a+v,0),line=(lbl,m)=>{const t=Math.round(tot(m)*100)/100;
    return m.size?`<div class="row rate"><label>${lbl}</label><span style="display:flex;flex-wrap:wrap">${[...m].map(([id,v])=>`<span class="it">${iurl(id)?`<img class="ic" alt="" src="${iurl(id)}">`:""}${Math.round(v*100)/100}/min</span>`).join("")}</span></div>`
      +(cap&&t>cap?`<div class="warnline">${lbl} total ${t}/min exceeds this belt (${cap}/min)</div>`:""):""};
  const ld=BN?bnK().load.get(b.id):null,lh=BN?`<div class="row rate"><label>Load</label><span>${ld?`${Math.round(ld.util*100)}% (${Math.round(ld.tot*100)/100}/min of ${ld.cap}/min)`+(ld.mixed?" &middot; Mixed items":""):"none"}</span></div>`:"";
  return sec("belt","Belt rate",`<div class="sub">${MKS.map(([k,v])=>k+" "+v).join(" &middot; ")} items/min. This belt: ${cap==null?"unknown":cap+"/min"}.</div>`+lh
    +(ms.length?line("Linked machines out",o)+line("Linked machines in",n):`<div class="sub">No linked machine has a recipe.</div>`)
  );
}
const SL={ConsumePower:"Power use",GeneratesPower:"Power generated",StoresItems:"Slots",StackSize:"Stack size (raw)"};
function factsHtml(d){
  const st=Object.entries(d.stats||{}).filter(([k])=>SL[k]),cost=d.cost||[];
  if(!st.length&&!cost.length)return"";
  return st.map(([k,v])=>`<div class="row"><label>${SL[k]}</label><span>${esc(v)}</span></div>`).join("")+(cost.length?`<div class="row"><label>Cost</label><span style="display:flex;flex-wrap:wrap">${cost.map(c=>itemHtml(c[0],c[1])).join("")}</span></div>`:"")
}

// Export the diagram as a standalone SVG that is a 1:1 snapshot of the canvas: the live DOM (unzoomed, boxes where you dragged them) cloned into a foreignObject with every computed style inlined and icons embedded as data URIs
$("plnSv").onclick=async()=>{
  const g=document.querySelector("#plnOut .plnGrid");if(!g||!g.querySelector(".plnBox")){toast("Nothing to export: pick a target item");return}
  const sv=g.style.transform;g.style.transform="none";   // measure and snapshot at scale 1, no pan
  try{
    const G=g.getBoundingClientRect(),pad=20;let x0=0,y0=0,x1=g.scrollWidth,y1=g.scrollHeight;
    g.querySelectorAll(".plnBox,.plnLbl").forEach(e=>{const r=e.getBoundingClientRect();x0=Math.min(x0,r.left-G.left);y0=Math.min(y0,r.top-G.top);x1=Math.max(x1,r.right-G.left);y1=Math.max(y1,r.bottom-G.top)});
    const cl=g.cloneNode(true),A=[g,...g.querySelectorAll("*")],B=[cl,...cl.querySelectorAll("*")];
    A.forEach((e,i)=>{const c=getComputedStyle(e),t=B[i];let h="";for(let k=0;k<c.length;k++)h+=c[k]+":"+c.getPropertyValue(c[k])+";";t.setAttribute("style",h);
      if(e.tagName==="SELECT")[...t.options].forEach((o,j)=>j===e.selectedIndex?o.setAttribute("selected",""):o.removeAttribute("selected"))});
    cl.style.transform="none";
    await Promise.all([...cl.querySelectorAll("img")].map(async im=>{try{const b=await (await fetch(im.src)).blob();im.src=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})}catch(e){}}));
    const W=Math.ceil(x1-x0)+2*pad,H=Math.ceil(y1-y0)+2*pad,bg=getComputedStyle($("pln")).backgroundColor,o=document.getElementById("plnOut");
    const body=new XMLSerializer().serializeToString(cl).replace(/^<(\w+)/,'<$1 xmlns="http://www.w3.org/1999/xhtml"');
    const x=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0-pad} ${y0-pad} ${W} ${H}"><rect x="${x0-pad}" y="${y0-pad}" width="${W}" height="${H}" fill="${bg}"/><foreignObject x="0" y="0" width="${Math.ceil(x1)}" height="${Math.ceil(y1)}" overflow="visible">${body}</foreignObject></svg>`;
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([x],{type:"image/svg+xml"}));a.download=(S.name.replace(/[^\w.-]+/g,"_")||"planner")+"-planner.svg";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e3);
  }finally{g.style.transform=sv}
};
