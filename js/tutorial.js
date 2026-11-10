// ---- first-visit spotlight tour: dim screen, cut-out around the real element, card with Back / Next / Skip. Auto-shows once (msfb.ui.tour), replay from the ? dialog. Esc skips.
(()=>{
const TK="msfb.ui.tour",WB=["winM","flwB"],isOn=b=>$(b).getAttribute("aria-pressed")==="true";
// x = target selector, o = windows that must be open for the step (Windows menu / Flow window), centre card when the target is missing or hidden
const TS=[
  {t:"Import save",x:"#impSav",d:"Import a Main Sequence save (*_S.sav) and pick one of your stations to start from."},
  {t:"Level",x:"#lvB",o:["winM"],d:"Open it from the Windows menu. Level window: go up and down between levels, and show the other levels as faint ghost layers."},
  {t:"Theoretical",x:"#thB",o:["winM"],d:"Theoretical production: items per minute at full speed, limited by belt throughput. No simulation needed."},
  {t:"Simulation",x:"#simB",o:["winM"],d:"Simulation window: play, pause and reset, pick the speed. Needs the Factory floor view. Production then shows items per minute per item and machine type."},
  {t:"Planner",x:"#plnB",o:["winM"],d:"Planner: pick a target item and rate to see the machines and belts needed (schematic only)."},
  {t:"Flow",x:"#fwW",o:["flwB"],d:"Flow window: link overlay and belt bottlenecks. Press <b>Legend</b> in it for the colours and symbols."},
  {t:"Place blocks and machines",get x(){return innerWidth<=600?"#search":"#pal"},   // phone: the palette is taller than the screen and sits below the canvas, spotlight its search box instead of scrolling the page
    d:"Pick an item in the palette, then click to place it. Press <kbd>F</kbd> to switch between the block Layout and the Factory floor, where machines and belts go."},
  {t:"Export / build in game",x:"#exp",d:"Export JSON, then paste it into the <a href=\"https://github.com/xxalex3xx97/MSBlueprintUnit\" target=\"_blank\" rel=\"noopener\">Blueprint Unit</a> mod's window in the game to build the factory on your station."}
];
let ov,hole,card,i=-1,was,prevF;
const q=s=>s&&document.querySelector(s),
  closeFile=()=>{if(!$("fileL").hidden)$("fileM").click()};
function build(){
  ov=document.createElement("div");ov.id="tourOv";ov.hidden=true;
  ov.innerHTML=`<div id="tourHole"></div><div id="tourCard" role="dialog" aria-modal="true" aria-labelledby="tourT" aria-describedby="tourD"><div id="tourN" class="sub"></div><h3 id="tourT"></h3><p id="tourD"></p><div class="btns"><button id="tourSkip" type="button" title="Skip the tutorial (Esc)">Skip</button><span class="sp"></span><button id="tourBack" type="button">Back</button><button id="tourNext" type="button" class="pri">Next</button></div></div>`;
  document.body.append(ov);hole=$("tourHole");card=$("tourCard");
  $("tourSkip").onclick=end;$("tourBack").onclick=()=>i>0&&show(i-1);$("tourNext").onclick=()=>i<TS.length-1?show(i+1):end();
  ov.addEventListener("pointerdown",()=>setTimeout(()=>{if(i>=0){ensure(TS[i]);place()}}));   // the File menu closes on any outside pointerdown: reopen it when the target lives there
  document.addEventListener("keydown",e=>{
    if(i<0)return;
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();end();return}
    if(e.key==="Tab"){const b=[...card.querySelectorAll("button:not(:disabled),a[href]")],k=b.indexOf(document.activeElement);e.preventDefault();b[(k+(e.shiftKey?-1:1)+b.length)%b.length].focus();return}
    e.stopPropagation();   // no canvas shortcuts (F, R, Del...) while the tour is open
  },true);
  setInterval(()=>i>=0&&place(),250);   // ponytail: the header reflows after boot (file/Fit buttons appear), keep the cut-out on its target
  addEventListener("resize",()=>i>=0&&place());addEventListener("scroll",()=>i>=0&&place(),true);
}
function ensure(s){
  WB.forEach(b=>{const w=(s.o||[]).includes(b)||was[b];if(isOn(b)!==w)winSet(b,w)});
  const e=q(s.x);if(e&&e.closest("#fileL")&&$("fileL").hidden)$("fileM").click();
  return e;
}
function place(){
  const s=TS[i],e=q(s.x),r=e&&e.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,ok=r&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden";
  ov.classList.toggle("nohole",!ok);
  card.style.width=Math.min(320,vw-24)+"px";const cw=card.offsetWidth,ch=card.offsetHeight,g=12;
  let x=(vw-cw)/2,y=(vh-ch)/2;
  if(ok){
    const p=6,l=Math.max(2,r.left-p),t=Math.max(2,r.top-p),R=Math.min(vw-2,r.right+p),B=Math.min(vh-2,r.bottom+p);
    hole.style.cssText=`left:${l}px;top:${t}px;width:${R-l}px;height:${B-t}px`;
    const cx=Math.max(g,Math.min(vw-cw-g,r.left+r.width/2-cw/2)),cy=Math.max(g,Math.min(vh-ch-g,r.top+r.height/2-ch/2));
    if(B+g+ch<=vh-g){x=cx;y=B+g}                 // below
    else if(t-g-ch>=g){x=cx;y=t-g-ch}            // above
    else if(R+g+cw<=vw-g){x=R+g;y=cy}            // right
    else if(l-g-cw>=g){x=l-g-cw;y=cy}            // left
    else{x=(vw-cw)/2;y=vh-ch-g}                  // docked at the bottom (target fills the screen)
  }
  card.style.left=Math.max(g/2,x)+"px";card.style.top=Math.max(g/2,y)+"px";
}
function show(n){
  i=n;const s=TS[n];closeFile();const e=ensure(s);
  if(e){const sx=scrollX,sy=scrollY;e.scrollIntoView({block:"nearest",inline:"nearest"});scrollTo(sx,sy)}   // inner scrollers only: the page itself never moves (header stays visible)
  $("tourN").textContent=`${n+1} / ${TS.length}`;$("tourT").textContent=s.t;$("tourD").innerHTML=s.d;
  $("tourBack").disabled=!n;$("tourNext").textContent=n===TS.length-1?"Done":"Next";
  place();$("tourNext").focus({preventScroll:true});
}
function start(){
  if(i>=0)return;if(!ov)build();
  try{localStorage.setItem(TK,"1")}catch(e){}
  was={};WB.forEach(b=>was[b]=isOn(b));prevF=document.activeElement;
  ov.hidden=false;show(0);
}
function end(){
  if(i<0)return;i=-1;closeFile();WB.forEach(b=>{if(isOn(b)!==was[b])winSet(b,was[b])});
  ov.hidden=true;if(prevF&&prevF.focus&&document.contains(prevF))prevF.focus({preventScroll:true});
}
window.tourAuto=()=>{   // first visit only; never under automation (the overlay would block every scripted click), storage unavailable = treat as seen
  let v="1";try{v=localStorage.getItem(TK)}catch(e){}
  if(!v&&!navigator.webdriver&&!document.querySelector("dialog[open]"))start();
};
window.tour={start,end,steps:TS,get i(){return i}};
$("helpTour").onclick=()=>{$("dHelp").close();start()};
})();
