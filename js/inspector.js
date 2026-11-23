// ---- inspector
function resHtml(d){
  const r=d.research||[];
  let h=`<h2>Research</h2><div class="pad">`;
  if(!r.length)h+=`<div class="sub">${esc(d.researchNote||"No research listed.")}</div>`;
  r.forEach(x=>{
    const info=RES[x]||{},un=(info.unlocks||[]).map(u=>short(u));
    h+=`<div class="kv" style="margin-bottom:4px">${esc(chain(x))}</div>`+(un.length?`<div class="sub" style="margin-top:0">unlocks: ${esc(un.join(", "))}</div>`:"");
  });
  return h+`</div>`;
}
function portsHtml(b){
  const ps=portsOf(b);if(!ps.length)return"";
  const d0=def(b.cls),el=d0&&d0.elevator?floorRect(b):null,d=el||dim(b),C=Math.max(14,Math.min(40,Math.floor(170/Math.max(d.w,d.h)))),Ln=Math.min(.6*C,18),T=Math.min(5,Math.max(3,.2*C)),PAD=14;
  const tg=ps.filter(p=>p.tg),pri=hasPrio(b.cls)?tg.filter(p=>p.dir==="out"):[],num=new Map(pri.map((p,i)=>[p.key,i+1]));
  const bt=tg.length>1?`<div class="btns"><button data-pall="0">All off</button><button data-pall="1">All on</button></div>`:"";
  const mk=ps.map(p=>{
    const ex=(p.x-b.x+.5+p.nx*.5)*C+PAD,ey=(p.y-b.y+.5+p.ny*.5)*C+PAD,w=p.nx?T:Ln,h=p.nx?Ln:T,sg=p.dir==="in"?-1:1,an=Math.atan2(p.ny*sg,p.nx*sg)*180/Math.PI+90,
      tip=`${p.f}${p.pos} (faces ${FN[p.wf]})${p.dir?" "+p.dir:""} - ${p.tg?(p.en?"enabled: click to disable":"disabled: click to enable"):"always enabled"}`,
      st=`left:${ex-Math.max(w,10)/2}px;top:${ey-Math.max(h,10)/2}px;width:${Math.max(w,10)}px;height:${Math.max(h,10)}px`,
      gl=p.dir?(num.has(p.key)?`<i>${num.get(p.key)}</i>`:`<i style="transform:rotate(${an}deg)">&#9650;</i>`):"";
    return`<button type="button" class="pmk ${p.en?"on":"off"}${p.pr?" pr":""}" style="${st}" ${p.tg?`data-port="${p.key}"`:"disabled"} title="${tip}" aria-label="${tip}">${gl}</button>`}).join("");
  const body=`<div class="pbody" style="left:${PAD}px;top:${PAD}px;width:${d.w*C}px;height:${d.h*C}px;background:${kFill(tileKey(b),.8)};border-color:${kStroke(tileKey(b),1)}">${esc(d0?lab(d0):shortCls(b.cls))}</div>`;
  const pr=pri.length>1?`<div class="sub">Priority output: ${pri.map(p=>`<label style="margin-right:8px"><input type="radio" name="prio${b.id}" data-prio="${p.key}" ${p.pr?"checked":""} ${p.en?"":"disabled"}> ${num.get(p.key)}</label>`).join("")}</div>`:"";
  return sec("ports","Ports",bt+`<div class="pmap" style="width:${d.w*C+2*PAD}px;height:${d.h*C+2*PAD}px">${body}${mk}</div><div class="sub">Same view as the factory floor: green = enabled, red = disabled. Click a port to toggle it.</div>`+pr);
}
const ITEMS=CATALOG.items||{},RECS=CATALOG.recipes||{};
const itemHtml=(id,n)=>`<span class="it">${iurl(id)?`<img class="ic" alt="" src="${iurl(id)}">`:""}${n?n+"&times; ":""}${esc((ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,""))}</span>`;
// recipe key = inputs>output; the one colliding pair (Reinforced Plate, Assembler vs AdvancedAssembler) gets "#"+time so every recipe key is unique. rkb = legacy base key, rkm matches either (old saves / URLs).
const rkb=r=>r.i.map(x=>x[0]).join("+")+">"+r.o[0];
const RK_DUP=(()=>{const s=new Set,d=new Set;Object.values(RECS).forEach(l=>l.forEach(r=>{const k=rkb(r);s.has(k)?d.add(k):s.add(k)}));return d})();
const rk=r=>rkb(r)+(RK_DUP.has(rkb(r))?"#"+r.t:"");
const rkm=(r,k)=>rk(r)===k||rkb(r)===k;
const recsOf=d=>(d&&d.crafters||[]).flatMap(c=>RECS[c]||[]);
const recOf=b=>{const d=def(b.cls);return b.rec?(recsOf(d).find(r=>rkm(r,b.rec))||null):null};
// raw recipe time is in 1/30 s ticks: seconds = raw/30, items/min = n*60/(raw/30) = n*1800/raw
const pm=(n,t)=>t>0?Math.round(n*1800/t*100)/100:null;
const secs=t=>t==null?"?":Math.round(t/30*100)/100;
const MKS=[["Mk1",60],["Mk2",120],["Mk3",180]];
const rateTxt=v=>v==null?"n/a":v+"/min";
function rateHtml(b){
  const r=recOf(b);if(!r)return"";
  const sp=supplyRows(b,links(layer)),spn={ok:"supplied",short:"short",none:"no supply"};
  const supH=sp.map(x=>`<div class="sup-${x.st}" style="margin-bottom:5px">${itemHtml(x.item)}<br>needed <b>${x.need}/min</b>, supplied <b>${x.have}/min</b> (${spn[x.st]})</div>`).join("");
  const row=(x,lbl)=>{const v=pm(x[1],r.t);return `<div class="row rate"><label>${lbl}</label><span>${itemHtml(x[0],x[1])} <b>${rateTxt(v)}</b></span></div>`};
  const o=pm(r.o[1],r.t);
  return sec("rate","Rates &amp; supply",supH+r.i.map(x=>row(x,"In")).join("")+row(r.o,"Out")
    +(o?`<div class="sub">Machines to saturate a belt (output): ${MKS.map(([n,v])=>n+" "+v+"/min = "+Math.ceil(v/o)).join(" &middot; ")}</div>`:"")
    +`<div class="sub">1 craft = ${secs(r.t)} s</div>`);
}
