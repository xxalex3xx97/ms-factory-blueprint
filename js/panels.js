// ---- edge-collapsible panels: left palette, right dock (tabs Info/Simulation), planner options
function fold(el,btn,shut,name,shutLb,openCh,shutCh){el.classList.toggle("col",shut);btn.setAttribute("aria-expanded",!shut);btn.setAttribute("aria-label",(shut?"Show ":"Hide ")+name);btn.title=(shut?"Show ":"Hide ")+name;btn.querySelector(".ar").textContent=shut?shutCh:openCh;btn.querySelector(".lb").textContent=shut?shutLb:"Hide"}
const PALK="msfb.ui.pal";
function palFold(shut,save){fold($("pal"),$("palT"),shut,"palette","Palette","«","»");document.querySelector("main").classList.toggle("pc",shut);if(save)try{localStorage.setItem(PALK,shut?"1":"0")}catch(e){}}
$("palT").onclick=()=>palFold(!$("pal").classList.contains("col"),true);
{let v=null;try{v=localStorage.getItem(PALK)}catch(e){}if(v==="1")palFold(true)}
function dockFold(shut){fold($("dock"),$("dockT"),shut,"side panel","Info","»","«");document.querySelector("main").classList.toggle("dc",shut)}
$("dockT").onclick=()=>dockFold(!$("dock").classList.contains("col"));
$("prodB").onclick=()=>{const d=$("dProd");d.hidden=!d.hidden;$("prodB").setAttribute("aria-pressed",!d.hidden);$("prScroll").scrollTop=0;prodDraw()};
$("prodX").onclick=()=>{$("dProd").hidden=true;$("prodB").setAttribute("aria-pressed",false)};
let PLNO=null;   // null = auto by planner width on first open
function plnOptFold(shut){PLNO=shut;fold($("plnOpt"),$("plnOptT"),shut,"options","Options","»","«")}
$("plnOptT").onclick=()=>plnOptFold(!$("plnOpt").classList.contains("col"));
$("prodC").onclick=()=>{const d=$("dProd"),c=d.classList.toggle("col");$("prodC").setAttribute("aria-expanded",!c);$("prodC").title=c?"Expand":"Collapse to title bar";prodDraw()};
window.addEventListener("resize",prodDraw);
function simLiveUp(){const e=$("simLive"),o=smOne(),u=$("sumLive");if(e&&smOn())e.innerHTML=simLiveHtml(o);if(u&&o&&smOn())u.innerHTML=sumBody(o,def(o.cls));prodDraw()}
function smSync(){
  const on=SM&&view==="F";
  if(!on)$("dProd").hidden=true,$("prodB").setAttribute("aria-pressed",false);
  $("smHint").style.display=on?"none":"";
  $("sm").classList.toggle("on",SM);$("sm").setAttribute("aria-pressed",SM);
  $("smc").style.display=on?"":"none";
  $("smPlay").textContent=SMP?"Pause":"Play";$("smPlay").setAttribute("aria-pressed",SMP);
  [1,10,60].forEach(v=>{const b=$("sm"+v);b.classList.toggle("on",SPD===v);b.setAttribute("aria-pressed",SPD===v)});
  smClkUp();
}
function smHalt(){SMP=false;cancelAnimationFrame(smRaf);smRaf=0}
function smStop(){smHalt();if(SIM)SIM.sig=null}   // next paint re-inits for the (new) layer/view
function smFrame(ts){
  smRaf=0;if(!SMP||!smOn()||document.hidden)return;
  const dt=smLast?Math.min((ts-smLast)/1000,.25):0;smLast=ts;
  if(SIM.sig!==simSig()){simReset();SIM.sig=simSig()}
  simAdvance(Math.min(dt,.25),SPD);if(!RM.matches)smPh=(smPh+dt*.6)%1;
  smClkUp();paint();
  if(ts-smLv>=250){smLv=ts;simLiveUp()}
  smRaf=requestAnimationFrame(smFrame);
}
const smGo=()=>{if(SMP&&!smRaf&&!document.hidden){smLast=0;smRaf=requestAnimationFrame(smFrame)}};
document.addEventListener("visibilitychange",smGo);
$("sm").onclick=()=>{if(view!=="F"){setView("F");if(SM)return}SM=!SM;smHalt();if(SM){simInit();SIM.sig=simSig();smPh=0}else SIM=null;all()};
$("smPlay").onclick=()=>{if(!SM||!SIM)return;SMP=!SMP;if(SMP)smGo();else smHalt();smSync();simLiveUp()};
$("smRst").onclick=()=>{if(!SIM)return;simReset();SIM.sig=simSig();smPh=0;smClkUp();paint();simLiveUp()};
[1,10,60].forEach(v=>$("sm"+v).onclick=()=>{SPD=v;smSync();asv()});
function drawSimMach(s){
  cx.save();
  S.blocks.forEach(b=>{if(b.h!==layer||!isM(b)||isBelt(b)||isStore(b)||SIM.R.has(b.id))return;const id=b.id,m=smS().mach.get(id)||{st:"idle",cycles:0,none:1};
    const d=dim(b),x=V.ox+b.x*s,y=V.oy+b.y*s,w=d.w*s,h=d.h*s,col=SMC[m.st]||SMC.idle;
    cx.globalAlpha=.3;cx.fillStyle=col;cx.fillRect(x,y,w,h);cx.globalAlpha=1;
    cx.strokeStyle=col;cx.lineWidth=2;cx.strokeRect(x+1,y+1,w-2,h-2);
    if(s>=6){const r=Math.max(5,Math.min(8,s*.4));cx.fillStyle=col;cx.beginPath();cx.arc(x+w-r-2,y+r+2,r,0,7);cx.fill();
      cx.fillStyle="#111";cx.font=`bold ${Math.round(r*1.3)}px system-ui,sans-serif`;cx.textAlign="center";cx.textBaseline="middle";cx.fillText(SML[m.st]||"I",x+w-r-2,y+r+2.5);
      if(s>=10&&w>=24&&!m.none){cx.font="bold 10px system-ui,sans-serif";cx.textAlign="right";cx.textBaseline="bottom";cx.fillStyle="#fff";cx.fillText("x"+m.cycles,x+w-3,y+h-2)}}});
  cx.restore();
}
function drawSimFull(s){
  cx.save();cx.strokeStyle="hsl(0,80%,60%)";cx.lineWidth=Math.max(1.5,s*.1);
  smS().full.forEach(id=>{const b=S.blocks.find(q=>q.id===id);if(!b||b.h!==layer)return;
    cx.beginPath();cx.arc(V.ox+(b.x+.5)*s,V.oy+(b.y+.5)*s,Math.max(3,s*.4),0,7);cx.stroke()});
  cx.restore();
}
function drawSimRouters(s){
  if(s<10)return;
  cx.save();cx.font="bold 11px system-ui,sans-serif";cx.textAlign="center";cx.textBaseline="middle";
  SIM.R.forEach((r,id)=>{if(r.m.h!==layer)return;const rt=smS().rt.get(id),d=dim(r.m);
    cx.strokeStyle="hsl(190,80%,68%)";cx.lineWidth=2;cx.setLineDash([4,3]);cx.strokeRect(V.ox+r.m.x*s+1,V.oy+r.m.y*s+1,d.w*s-2,d.h*s-2);cx.setLineDash([]);
    r.outs.forEach(o=>{const b=o.belt,q=rt&&rt.outs.find(z=>z.belt===b.id),t=(q?q.rate:0)+"/min",pw=cx.measureText(t).width+6,ex=b.x+.5-(r.m.x+d.w/2),ey=b.y+.5-(r.m.y+d.h/2),hz=Math.abs(ex)>Math.abs(ey),px=V.ox+(b.x+.5)*s+(hz?Math.sign(ex)*Math.max(0,pw/2-s/2):0),py=V.oy+(b.y+.5)*s;
      cx.fillStyle="rgba(0,0,0,.72)";cx.fillRect(px-pw/2,py-7,pw,14);cx.fillStyle="hsl(190,80%,78%)";cx.fillText(t,px,py+.5)})});
  cx.restore();
}
function simLiveHtml(one){
  const Z=SIM,st=Z&&smS();if(!st)return"";
  const nm=id=>{const b=S.blocks.find(q=>q.id===id);return b?esc(nameOf(b)):"?"},row=(a,b)=>`<div class="kv">${a}: <b>${b}</b></div>`;
  let h=row("clock",$("smClk").textContent)+row("state",SMP?"playing "+SPD+"x":"paused")+row("rates",st.steady?"steady":"settling");
  if(!one)return h+`<div class="sub">Select a container, machine, splitter or balancer for live numbers.</div>`;
  const c=st.cont.get(one.id),m=st.mach.get(one.id),M=Z.M.get(one.id),r=Z.R.get(one.id),rt=st.rt.get(one.id);
  if(c){
    h+=row("slots",(c.used==null?"?":c.used)+" of "+(c.slots==null?"?":c.slots)+" used")+row("items",c.have+(c.cap!=null?" / "+c.cap:""))+row("in / out / net per min",c.in+" / "+c.out+" / "+(c.net>0?"+":"")+c.net);
    h+=c.rows.map(x=>`<div class="kv">${esc(x.item)}: <b>${x.inf?"unlimited":"stock "+x.n}</b> &middot; in ${x.in} &middot; out ${x.out} &middot; net ${x.net>0?"+":""}${x.net}</div>`).join("")||`<div class="sub">Empty: no input, no output.</div>`;
  }else if(m){
    h+=row("machine state",m.st)+row("cycles done",m.cycles);
    if(M)h+=row("input buffer",Object.keys(M.inb).map(k=>esc(k)+" "+M.inb[k]).join(", ")||"empty")+row("output buffer",M.out+" "+esc(M.r.o[0]));
  }else if(r){
    h+=row("outputs (items/min)","")+r.outs.map(o=>{const q=rt&&rt.outs.find(z=>z.belt===o.belt.id);return`<div class="kv">${nm(o.belt.id)}: <b>${q?q.rate:0}</b></div>`}).join("")+row("total",rt?rt.tot:0);
    if(!r.outs.length)h+=`<div class="sub">No enabled output ports.</div>`;
  }else{
    const l=st.load.get(one.id);if(l)h+=row("belt load",l.tot+(l.cap?" / "+l.cap:"")+" /min")+(st.full.has(one.id)?row("belt","full"):"");
    else h+=`<div class="sub">No live data for this block.</div>`;
  }
  return h;
}
