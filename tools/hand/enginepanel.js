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
    if(typeof chainBuild!=="function")for(const f of ["tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f);
    if(me!==tok)return;
    let T;try{T=chainBuild({item:item.replace(/^ITEM_/,""),rate,mk,tile:$("plnBk").value,dockType:$("plnDk").value,outDockType:$("plnDkOT").value||$("plnDk").value,docks:$("plnDkI").checked,outDock:$("plnDkO").checked,maxStates:60000,hw:3})}catch(e){$("pvLine").textContent="Build failed";$("plnPrevErr").textContent=e.message;$("plnPrevMap").style.opacity="";return}
    const bad=T.fails.length+HAND.check().bad.length,mach=T.ms.filter(m=>m.rec).length,boxes=T.ms.filter(m=>/Container/.test(m.cls)).length,docks=T.blocks.filter(b=>/Dock/.test(b.cls)).length;
    T.machines=mach;ENG={T};const mx=Math.min(...T.blocks.map(q=>q.x)),my=Math.min(...T.blocks.map(q=>q.y));plcT={ok:true,blocks:T.blocks.map(q=>({...q,x:q.x-mx,y:q.y-my})),ms:T.ms.map(q=>({...q,x:q.x-mx*FC,y:q.y-my*FC}))};   // the preview starts at the origin (its axes and fit assume that)
    plcL={items:[],src:{}};   // the preview is drawn by placerShot (the factory renderer) from plcT
    $("plnPrevMap").style.opacity="";
    $("pvLine").textContent=T.machines+" machines · "+T.blocks.length+" blocks · "+(T.machines?(T.belts/T.machines).toFixed(1):"0")+" belts/machine";
    $("pvMach").textContent=T.machines;$("pvBelt").textContent=T.belts;$("pvBox").textContent=boxes;$("pvBlk").textContent=T.blocks.length+" ("+docks+" docks)";
    $("pvIO").textContent=($("plnDkI").checked?"raw items from "+($("plnDk").value==="nrm"?"normal":"industrial")+" docks (one ore each)":"raw items from source containers you fill")+($("plnDkO").checked?", finished product out through an industrial dock":", output into containers");
    $("plnPrevNote").textContent="";
    $("plnPrevErr").textContent=bad?bad+" problems, not placeable: "+T.fails.slice(0,2).join("; "):"";
    $("plnPlace").disabled=!!bad;placerFitView();
  };
  window.placerPlace=function(){   // the factory follows the cursor as a ghost: click to put it down next to what you already have (Esc cancels)
    if(!ENG)return;const T=ENG.T,P=plcT;ENG=null;$("plnPrev").close();
    setView("L");clip=[];active=null;mode=null;sel=new Set();
    pasting={rot:0,fl:false,pl:{blocks:P.blocks,ms:P.ms,plan:{item:$("plnItem").value,rate:+$("pvRate").value||+$("plnRate").value}}};
    toast("Click to place the factory ("+T.blocks.length+" blocks), then connect it to your blocks. Esc cancels");all();
    if(!$("pln").classList.contains("col"))$("plnC").click();
  };
  $("plnPlace").onclick=placerPlace;
  // settings the chain engine does not have yet are fixed and greyed out
  const fix=force=>{if(force){if(["BPO_Station_01","BPO_Station_2x1"].includes($("plnBk").value))$("plnBk").value="BPO_Station_02";}   // values are only forced when building: what the user saved is left alone
    
    ["pvSp","plnBuf","plnLbl"].forEach(i=>{$(i).disabled=true;$(i).title="Not available yet"});["BPO_Station_01","BPO_Station_2x1"].forEach(v=>{const o=$("plnBk").querySelector('option[value="'+v+'"]');if(o){o.disabled=true;o.title="1x1 and 2x1 blocks are not available yet"}})};
  fix(false);$("plnPrev").addEventListener("toggle",()=>fix(true));const run0=placerRun;window.placerRun=function(open){if(open||$("plnPrev").open)fix(true);return run0.apply(this,arguments)};
})();
