// ---- ? dialog: section list (left) + live search. Text comes from HINTS (autosave.js), SIM_NOTES (sim.js) and the static sections in index.html.
(()=>{
let units=[];const dlg=$("dHelp"),nav=$("helpNav"),body=$("helpBody"),inp=$("helpSearch"),none=$("helpNone"),
  secs=[...body.querySelectorAll("section")],btns=[...nav.querySelectorAll("button")];
let cur="start",built=false;
const li=h=>`<li>${h}</li>`;
function build(){
  $("helpCtlL").innerHTML=HINTS.L.split(" &middot; ").map(li).join("");
  $("helpCtlF").innerHTML=HINTS.F.split(" &middot; ").map(li).join("");
  $("helpSim").innerHTML=(SIM_NOTES+" Sim state is not exported; editing resets the simulation.").split(/(?<=\.) /).map(t=>li(esc(t))).join("");
  units=[...body.querySelectorAll("li,p:not(#helpNone)")];units.forEach(u=>u.dataset.o=u.innerHTML);
  built=true;
}
function mark(u,re){   // wrap matches in <mark>, text nodes only (keeps <kbd>, links)
  u.innerHTML=u.dataset.o;if(!re)return;
  const w=document.createTreeWalker(u,NodeFilter.SHOW_TEXT),t=[];while(w.nextNode())t.push(w.currentNode);
  t.forEach(n=>{const x=n.nodeValue;re.lastIndex=0;if(!re.test(x))return;const f=document.createDocumentFragment();let i=0;
    x.replace(new RegExp(re.source,"gi"),(m,o)=>{f.append(x.slice(i,o));const k=document.createElement("mark");k.textContent=m;f.append(k);i=o+m.length;return m});
    f.append(x.slice(i));n.replaceWith(f)});
}
function helpFilter(){
  const q=inp.value.trim().toLowerCase(),tk=[...new Set(q.split(/\s+/).filter(Boolean))],
    re=tk.length?new RegExp(tk.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"),"i"):null;
  let any=false;
  units.forEach(u=>{const ok=!re||tk.every(t=>u.textContent.toLowerCase().includes(t));u.hidden=!ok;mark(u,ok?re:null)});
  secs.forEach(s=>{
    s.querySelectorAll(".hg").forEach(g=>{g.hidden=![...g.querySelectorAll("li")].some(u=>!u.hidden)});
    const n=units.filter(u=>s.contains(u)&&!u.hidden).length,b=btns.find(x=>x.dataset.hs===s.dataset.hs);
    s.hidden=re?!n:s.dataset.hs!==cur;b.hidden=!!re&&!n;if(n&&re)any=true;
    b.dataset.n=re&&n?n:"";b.setAttribute("aria-current",!re&&s.dataset.hs===cur?"true":"false");
  });
  none.hidden=!re||any;none.textContent=re?`No results for "${inp.value.trim()}".`:"";
  body.scrollTop=0;
}
function helpOpen(){
  if(!built)build();
  inp.value="";cur="start";helpFilter();dlg.showModal();body.scrollTop=0;
}
inp.oninput=helpFilter;
nav.onclick=e=>{const b=e.target.closest("button");if(!b)return;cur=b.dataset.hs;inp.value="";helpFilter()};
$("help").onclick=helpOpen;
$("helpX").onclick=()=>dlg.close();
window.helpOpen=helpOpen;
$("flLegBtn").onclick=()=>{const o=$("flLegCard").hidden;$("flLegCard").hidden=!o;$("flLegBtn").setAttribute("aria-expanded",o)};   // Flow window legend card
})();
