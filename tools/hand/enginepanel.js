// The Planner's "Build factory" modal runs the chain engine (tools/hand): placerRun builds + checks + previews, placerPlace places it. Scripts load on the first build.
(function(){
  const l=s=>new Promise(r=>{const e=document.createElement("script");e.src=s;e.onload=r;e.onerror=r;document.head.appendChild(e)}),nx=()=>new Promise(r=>setTimeout(r,30));
  let ENG=null,tok=0;
  window.placerRun=async function(open){
    const dl=$("plnPrev");if(!open&&!dl.open)return;
    const item=$("plnItem").value,rate=+$("pvRate").value||+$("plnRate").value,mk=+$("pvMk").value,me=++tok;
    placerClear();ENG=null;plcL=null;plcT=null;
    if(!dl.open)dl.showModal();
    $("plnPlace").disabled=true;$("plnPlace").textContent="Place";
    if(!item||!(rate>0)){$("pvLine").textContent="Pick an item and a rate first";plcDo();return}
    $("pvLine").textContent="Building...";$("plnPrevMap").style.opacity=".45";await nx();
    if(typeof chainBuild!=="function")for(const f of ["js/dock_apply.js","tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f);
    if(me!==tok)return;
    let T;try{T=chainBuild({item:item.replace(/^ITEM_/,""),rate,mk,maxStates:60000,hw:3})}catch(e){$("pvLine").textContent="Build failed";$("plnPrevErr").textContent=e.message;$("plnPrevMap").style.opacity="";return}
    const bad=T.fails.length+HAND.check().bad.length,docks=T.blocks.filter(b=>/Dock/.test(b.cls)).length;
    ENG={T};$("plnPrevMap").style.opacity="";
    $("pvLine").textContent=T.machines+" machines · "+T.blocks.length+" blocks · "+(T.machines?(T.belts/T.machines).toFixed(1):"0")+" belts/machine";
    $("pvMach").textContent=T.machines;$("pvBelt").textContent=T.belts;$("pvBlk").textContent=T.blocks.length+" ("+docks+" docks)";
    $("pvIO").textContent="raw items from industrial docks (one ore each), output into containers";
    $("plnPrevNote").textContent=$("plnDkO").checked?"Output to a dock is not built yet: the output goes into containers.":"";
    $("plnPrevErr").textContent=bad?bad+" problems, not placeable: "+T.fails.slice(0,2).join("; "):"";
    $("plnPlace").disabled=!!bad;plcV={z:1,ox:0,oy:0};plcDo();
  };
  window.placerPlace=async function(){
    if(!ENG)return;const T=ENG.T;ENG=null;$("plnPrev").close();
    try{await chainPlay({plan:{blocks:T.blocks,ms:T.ms},fast:true});toast("Factory placed: "+T.machines+" machines, "+T.belts+" belts")}catch(e){toast("Place failed: "+e.message)}
    if(!$("pln").classList.contains("col"))$("plnC").click();
  };
  // schematic: one rect per block (docks green), nothing else
  window.placerShot=function(){
    const c=$("plnPrevMap"),g=c.getContext("2d"),w=c.clientWidth||300,h=c.clientHeight||180,r=devicePixelRatio||1;
    if(c.width!==w*r||c.height!==h*r){c.width=w*r;c.height=h*r}
    g.setTransform(r,0,0,r,0,0);g.clearRect(0,0,w,h);if(!ENG)return;
    const B=ENG.T.blocks.map(b=>({b,d:dim({cls:b.cls,rot:b.rot||0})}));let x1=1,y1=1,x0=1e9,y0=1e9;
    B.forEach(({b,d})=>{x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+d.w);y1=Math.max(y1,b.y+d.h)});
    const f=Math.min(w/(x1-x0),h/(y1-y0))*.95*plcV.z,ox=(w-(x1-x0)*f)/2+plcV.ox-x0*f,oy=(h-(y1-y0)*f)/2+plcV.oy-y0*f;
    B.forEach(({b,d})=>{g.fillStyle=/Dock|Adapter/.test(b.cls)?"hsl(150,55%,45%)":"hsl(205,45%,42%)";g.fillRect(ox+b.x*f,oy+b.y*f,Math.max(1,d.w*f-.5),Math.max(1,d.h*f-.5))});
  };
  window.placerFitView=()=>{plcV={z:1,ox:0,oy:0};plcDo()};
  $("plnPlace").onclick=placerPlace;
  // settings the chain engine does not have yet are fixed and greyed out
  const fix=()=>{$("plnBk").value="BPO_Station_03";$("plnDkI").checked=true;$("plnDk").value="ind";$("plnDkO").checked=false;$("plnDkOT").value="";
    ["plnBk","pvSp","plnBuf","plnLbl","plnDkI","plnDk","plnDkO","plnDkOT"].forEach(i=>{$(i).disabled=true;$(i).title="Not available yet"});
    const m=$("pvMk").querySelector('option[value="2"]');if(m){m.disabled=true;m.title="Mk3 is not available yet";if($("pvMk").value==="2")$("pvMk").value="1"}};
  fix();$("plnPrev").addEventListener("toggle",fix);const run0=placerRun;window.placerRun=function(){fix();return run0.apply(this,arguments)};
})();
