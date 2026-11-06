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
  return sec("ports","Ports",ps.map(p=>`<div class="row chk">${p.tg?`<input id="pt${p.key}" type="checkbox" data-port="${p.key}" ${p.en?"checked":""}>`:`<span style="width:1.2em"></span>`}<label ${p.tg?`for="pt${p.key}"`:""}>${p.f}${p.pos} <span class="sub">faces ${FN[p.wf]}${p.dir?" &middot; "+p.dir:""} &middot; ${p.tg?(p.en?"enabled (green)":"disabled (red)"):"always enabled"}</span></label></div>`).join(""));
}
const ITEMS=CATALOG.items||{},RECS=CATALOG.recipes||{};
const itemHtml=(id,n)=>`<span class="it">${iurl(id)?`<img class="ic" alt="" src="${iurl(id)}">`:""}${n?n+"&times; ":""}${esc((ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,""))}</span>`;
const rk=r=>r.i.map(x=>x[0]).join("+")+">"+r.o[0];
const recsOf=d=>(d&&d.crafters||[]).flatMap(c=>RECS[c]||[]);
const recOf=b=>{const d=def(b.cls);return b.rec?(recsOf(d).find(r=>rk(r)===b.rec)||null):null};
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
