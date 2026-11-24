// The Planner's "Build factory" modal runs the chain engine (tools/hand): placerRun builds + checks + previews, placerPlace places it. Scripts load on the first build.
(function(){
  const l=s=>new Promise(r=>{const e=document.createElement("script");e.src=s;e.onload=r;e.onerror=r;document.head.appendChild(e)}),nx=()=>new Promise(r=>setTimeout(r,30));
  let ENG=null,tok=0;const ORUN=window.placerRun,OPLACE=window.placerPlace,SMALL=["BPO_Station_01","BPO_Station_2x1"];   // originals from js/placer.js: 1x1 and 2x1 are built by the template/composer engine (chain engine is 30x30 floor only)
  // recipe parts: items the player already makes elsewhere are 'external' (plain inputs, a container to connect to the real factory); remembered per item
  const EXK="msfb.ext",exAll=()=>{try{return JSON.parse(localStorage.getItem(EXK)||"{}")||{}}catch(e){return{}}},exGet=it=>exAll()[it]||[],exSet=(it,a)=>{try{const o=exAll();if(a.length)o[it]=a;else delete o[it];localStorage.setItem(EXK,JSON.stringify(o))}catch(e){}};
  const partsUi=(item,rate,mk,ext)=>{const box=$("pvParts");if(!box)return;const rec=plnBy(false,true),P=plan(item,rate,mk,undefined,typeof PLN_PICK==="object"?PLN_PICK:undefined,{seedDock:true,ext}),
      nodes=Object.values(P.nodes).filter(n=>n.item!==item&&rec.has(n.item));
    if(!nodes.length){box.hidden=true;box.textContent="";return}
    const direct=[...new Set(P.edges.filter(e=>e.to===item&&e.from!==item&&rec.has(e.from)).map(e=>e.from))];
    box.hidden=false;box.innerHTML='<span class="pvGt">Recipe parts</span> '+nodes.map(n=>{const x=ext.includes(n.item);return'<label class="chk" title="'+(x?"Not built: a container “From your factory” is placed instead":"Built in this factory")+'"><input type="checkbox" data-it="'+n.item+'"'+(x?"":" checked")+'> '+esc(plnNm(n.item))+' <small>'+(x?"from your factory":n.machines+" machines")+" · "+Math.round(n.rate*10)/10+"/min</small></label>"}).join(" ")+' <button type="button" id="pvPartsFin" title="Build only the last recipe; every part it needs comes from containers">Only the final recipe</button> <button type="button" id="pvPartsAll">Build all</button>';
    box.onchange=e=>{const c=e.target.closest("input[data-it]");if(!c)return;const it=c.dataset.it,cur=exGet(item).filter(x=>x!==it);if(!c.checked)cur.push(it);exSet(item,cur);window.placerRun(true)};
    box.onclick=e=>{const id=e.target.id;if(id==="pvPartsFin"){exSet(item,direct);window.placerRun(true)}else if(id==="pvPartsAll"){exSet(item,[]);window.placerRun(true)}}};
  // build budget: the chain engine runs on the main thread and its time grows with the machine count (measured ~0.04 s per machine, worse above ~300). Over BUILD_M machines: warn first; picking an item starts at the highest rate under the budget.
  const BUILD_M=50,machN=(item,rate,mk,ext)=>{const P=plan(item,rate,mk,undefined,typeof PLN_PICK==="object"?PLN_PICK:undefined,{seedDock:true,ext});return Object.values(P.nodes).reduce((s,n)=>s+(n.machines||0),0)},
    estS=m=>Math.round(.04*m*(1+m/1000)),
    safeRate=(item,mk)=>{let lo=.001,hi=1000;if(machN(item,lo,mk,[])>BUILD_M)return lo;if(machN(item,hi,mk,[])<=BUILD_M)return hi;for(let i=0;i<14;i++){const m=Math.sqrt(lo*hi);if(machN(item,m,mk,[])<=BUILD_M)lo=m;else hi=m}return Math.floor(lo*1000)/1000};
  window.buildSafeRate=safeRate;
  let okKey="";
  $("plnItem")&&$("plnItem").addEventListener("change",()=>{try{const it=$("plnItem").value,cur=+$("plnRate").value;if(!it||!(cur>0))return;const s=safeRate(it,+$("plnMk").value);if(cur>s){$("plnRate").value=s;$("plnRate").dispatchEvent(new Event("input",{bubbles:true}));$("plnRate").dispatchEvent(new Event("change",{bubbles:true}));if(typeof toast==="function")toast("Rate set to "+s+"/min: bigger factories take long to build")}}catch(e){}});
  window.engineReady=async()=>{if(typeof chainBuild!=="function")for(const f of ["tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f)};
  window.placerRun=async function(open,defer){
    const pp=$("pvParts");if(pp)pp.hidden=true;   // the parts checklist only belongs to the chain engine builds below
    if(SMALL.includes($("plnBk").value)){++tok;ENG=null;$("plnPlace").onclick=OPLACE;return ORUN.call(this,open,defer)}   // 1x1 / 2x1: composer + templates; shows "Not supported yet: reason" itself
    $("plnPlace").onclick=placerPlace;$("plnEngBadge").textContent="";
    const dl=$("plnPrev");if(!open&&!dl.open)return;
    const item=$("plnItem").value,rate=+$("pvRate").value||+$("plnRate").value,mk=+$("pvMk").value,me=++tok;
    if(item&&rate>0){let m=0;try{m=machN(item,rate,mk,exGet(item).filter(x=>x!==item))}catch(e){}const k=item+"|"+rate+"|"+mk+"|"+exGet(item).join();
      if(m>BUILD_M&&k!==okKey){const s=safeRate(item,mk);if(!confirm("This factory has about "+m+" machines. Building it takes roughly "+estS(m)+" s and the window will freeze until it is done.\n\nOK = build anyway.\nCancel = keep the window responsive (a rate of "+s+"/min builds quickly).")){if(dl.open){$("plnPlace").disabled=true;$("pvLine").textContent="Cancelled: lower the rate (up to "+s+"/min builds quickly)"}return}okKey=k}}
    placerClear();ENG=null;plcL=null;plcT=null;
    if(!dl.open)dl.showModal();
    $("plnPlace").disabled=true;$("plnPlace").textContent="Place";
    if(!item||!(rate>0)){$("pvLine").textContent="Pick an item and a rate first";plcDo();return}
    $("pvLine").textContent="Building...";$("plnPrevMap").style.opacity=".45";await nx();
    if(typeof chainBuild!=="function")for(const f of ["tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f);
    if(me!==tok)return;
    let ext=exGet(item).filter(x=>x!==item);try{partsUi(item,rate,mk,ext)}catch(e){ext=[];if(pp)pp.hidden=true}
    let T;try{T=chainBuild({item:item.replace(/^ITEM_/,""),rate,mk,ext,pick:typeof PLN_PICK==="object"?PLN_PICK:undefined,tile:$("plnBk").value,dockType:$("plnDk").value,outDockType:$("plnDkOT").value||$("plnDk").value,docks:$("plnDkI").checked,outDock:$("plnDkO").checked,maxStates:60000,hw:3})}catch(e){$("pvLine").textContent="Build failed";$("plnPrevErr").textContent=e.message;$("plnPrevMap").style.opacity="";return}
    const bad=T.fails.length+HAND.check().bad.length,mach=T.ms.filter(m=>m.rec).length,boxes=T.ms.filter(m=>/Container/.test(m.cls)).length,docks=T.blocks.filter(b=>/Dock/.test(b.cls)).length;
    T.machines=mach;ENG={T};const mx=Math.min(...T.blocks.map(q=>q.x)),my=Math.min(...T.blocks.map(q=>q.y));plcT={ok:true,blocks:T.blocks.map(q=>({...q,x:q.x-mx,y:q.y-my})),ms:T.ms.map(q=>({...q,x:q.x-mx*FC,y:q.y-my*FC}))};   // the preview starts at the origin (its axes and fit assume that)
    plcL={items:[],src:{}};   // the preview is drawn by placerShot (the factory renderer) from plcT
    $("plnPrevMap").style.opacity="";
    $("pvLine").textContent=T.machines+" machines · "+T.blocks.length+" blocks · "+(T.machines?(T.belts/T.machines).toFixed(1):"0")+" belts/machine";
    $("pvMach").textContent=T.machines;$("pvBelt").textContent=T.belts;$("pvBox").textContent=boxes;$("pvBlk").textContent=T.blocks.length+" ("+docks+" docks)";
    $("pvIO").textContent=($("plnDkI").checked?"raw items from "+($("plnDk").value==="nrm"?"normal":"industrial")+" docks (one ore each)":"raw items from source containers you fill")+($("plnDkO").checked?", finished product out through "+(($("plnDkOT").value||$("plnDk").value)==="nrm"?"a normal":"an industrial")+" dock":", output into containers");
    $("plnPrevNote").textContent=T.report.skipped&&T.report.skipped.length?"Not built (no block for this machine yet): "+T.report.skipped.join(", "):"";
    $("plnPrevErr").textContent=bad?bad+" problems, not placeable: "+T.fails.slice(0,2).join("; "):"";
    $("plnPlace").disabled=!!bad;placerFitView();
    plcCostRender(plcL);
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
  const fix=()=>{["pvSp","plnBuf","plnLbl"].forEach(i=>{$(i).disabled=true;$(i).title="Not available yet"})};
  fix(false);$("plnPrev").addEventListener("toggle",()=>fix(true));const run0=placerRun;window.placerRun=function(open){if(open||$("plnPrev").open)fix(true);return run0.apply(this,arguments)};
})();
