// ---- palette
const BQ='<span class="bq" title="Size not confirmed in game" aria-label="size not confirmed">!?</span>',nog=t=>String(t).replace(/guess(ed|es)?/gi,"unconfirmed");
const io=new Set(["rate","links","store","belt","sim","ov"]),sec=(id,t,b)=>b?`<details data-sec="${id}" ${io.has(id)?"open":""}><summary>${t}</summary><div class="pad">${b}</div></details>`:"";
let q="",po=new Set(["b:Basic","m:Machine","m:Conveyors"]);
$("search").oninput=e=>{q=e.target.value.trim().toLowerCase();palette()};
const iconEl=d=>iurl(d.icon)?`<img class="ic" alt="" src="${iurl(d.icon)}">`:`<i class="ic ph" style="background:hsl(${hue(d.category)},55%,48%)"></i>`;
function palette(){
  $("search").placeholder=tab==="b"?"Search blocks...":"Search buildables...";
  $("search").setAttribute("aria-label",$("search").placeholder);
  const g={};Object.keys(BASE).forEach(c=>{const d=def(c);if(d.kind!==tab)return;if(q&&!(d.name.toLowerCase().includes(q)||lab(d).toLowerCase().includes(q)||d.category.toLowerCase().includes(q)))return;(g[d.category]=g[d.category]||[]).push(d)});
  $("palList").innerHTML=Object.keys(g).sort(catSort).map(c=>`<details ${q||po.has(tab+":"+c)?"open":""} data-c="${esc(tab+":"+c)}"><summary><i style="background:hsl(${hue(c)},55%,48%)"></i>${esc(c)}<small>${g[c].length}</small></summary>${g[c].map(d=>{const ch=chip(d),tip=resTip(d),fl=d.fw!=null?`\nfloor ${d.fw}x${d.fh}`:"";return`<button draggable="true" class="item ${active===d.key?"on":""}" data-cls="${esc(d.key)}" aria-pressed="${active===d.key}" title="${esc(d.key+fl+(d.verified?(d.source?"\nsource: "+d.source:""):"\n!? size not confirmed")+(tip?"\n"+tip:""))}">${iconEl(d)}<span class="n">${esc(lab(d))}</span><span class="sz">${d.w}&times;${d.h}</span>${d.verified?"":BQ}${ch?`<span class="chip ${ch==="free?"?"free":""}">${esc(ch)}</span>`:""}</button>`}).join("")}</details>`).join("")||'<p class="pad sub">No matches.</p>';
}
function pick(cls){pasting=null;const pa=active;active=active===cls?null:cls;if(active)sel=new Set();if(active&&active!==pa)placeRot=0;all()}
$("palList").addEventListener("click",e=>{
  const b=e.target.closest(".item");if(!b)return;
  if(e.shiftKey){const h=HB[tab],i=h.indexOf(null);if(i<0)toast("Hotbar full");else{h[i]=b.dataset.cls;hbSave();hotbar()}return}
  pick(b.dataset.cls);
});
$("palList").addEventListener("dragstart",e=>{const b=e.target.closest(".item");if(!b)return;e.dataTransfer.setData("text/plain",b.dataset.cls);e.dataTransfer.effectAllowed="copy"});

// ---- hotbar (one list per palette tab: b = blocks, m = buildables)
const HBK="msfb.hotbar";
let HB={b:Array(9).fill(null),m:Array(9).fill(null)};
try{const o=JSON.parse(localStorage.getItem(HBK));["b","m"].forEach(t=>{if(o&&Array.isArray(o[t]))HB[t]=Array.from({length:9},(_,i)=>typeof o[t][i]==="string"?o[t][i]:null)})}catch(_){}
function hbSave(){try{localStorage.setItem(HBK,JSON.stringify(HB))}catch(_){}}
function hotbar(){
  $("hb").innerHTML=HB[tab].map((c,i)=>{const d=c&&BASE[c]?def(c):null;return`<button class="slot ${d&&active===d.key?"on":""}" data-i="${i}" aria-pressed="${!!(d&&active===d.key)}" aria-label="Slot ${i+1}${d?": "+esc(lab(d)):" (empty)"}" title="${d?esc(lab(d)+(d.verified?"":" (!? size not confirmed)")+" - right-click to clear"):"Empty: drag an item here or Shift+click it in the palette"}"><span class="k">${i+1}</span>${d?iconEl(d):""}</button>`}).join("");
}
const slotOf=e=>{const b=e.target.closest(".slot");return b?+b.dataset.i:-1};
$("hb").addEventListener("click",e=>{const i=slotOf(e);if(i<0)return;const c=HB[tab][i];if(c&&BASE[c])pick(c)});
$("hb").addEventListener("contextmenu",e=>{e.preventDefault();const i=slotOf(e);if(i<0||!HB[tab][i])return;HB[tab][i]=null;hbSave();hotbar()});
$("hb").addEventListener("dragover",e=>{if(slotOf(e)<0)return;e.preventDefault();e.target.closest(".slot").classList.add("over")});
$("hb").addEventListener("dragleave",e=>{const s=e.target.closest(".slot");if(s)s.classList.remove("over")});
$("hb").addEventListener("drop",e=>{
  const i=slotOf(e);if(i<0)return;e.preventDefault();
  const c=e.dataTransfer.getData("text/plain");
  if(BASE[c]&&def(c).kind===tab){HB[tab][i]=c;hbSave()}
  hotbar();
});
$("palList").addEventListener("toggle",e=>{if(q)return;const c=e.target.dataset.c;e.target.open?po.add(c):po.delete(c);asv()},true);
const palAll=on=>{document.querySelectorAll("#palList details").forEach(d=>on?po.add(d.dataset.c):po.delete(d.dataset.c));if(q){q="";$("search").value=""}palette();asv()};
$("palCol").onclick=()=>palAll(false);$("palExp").onclick=()=>palAll(true);

