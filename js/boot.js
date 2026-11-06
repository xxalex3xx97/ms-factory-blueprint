// ---- Simulation / Flow modals (top right of the canvas, independent toggles)
function fmSync(){const o=!$("lvW").hidden||!$("smW").hidden||!$("fwW").hidden;$("stage").classList.toggle("fm1",o&&!$("pln").hidden);if(!$("pln").hidden)plnDraw()}
[["lvB","lvW","lvWX"],["simB","smW","smWX"],["flwB","fwW","fwWX"]].forEach(([b,w,x])=>{const t=h=>{$(w).hidden=h;$(b).setAttribute("aria-pressed",!h);if(b==="simB")smSet(!h);fmSync()};$(b).onclick=()=>t(!$(w).hidden);$(x).onclick=()=>{t(true);$(b).focus()}});
$("plnB").addEventListener("click",fmSync);$("plnX").addEventListener("click",fmSync);
$("help").onclick=()=>{
  $("helpCtl").innerHTML=`<p><b>Layout:</b> ${HINTS.L}</p><p><b>Factory floor:</b> ${HINTS.F}</p>`;
  $("helpSim").innerHTML=(SIM_NOTES+" Sim state is not exported; editing resets the simulation.").split(/(?<=\.) /).map(t=>`<li>${esc(t)}</li>`).join("");
  $("dHelp").showModal();$("dHelp").scrollTop=0;
};
$("helpX").onclick=()=>$("dHelp").close();
window.__fb={parseSav,ugPairs,ugDrag,get drag(){return drag},mirM,dim,outside,btip,rk,bnCol,bnU,bnK,simLive,paint,storeInfo,supplyRows,supplySt,isStore,px:(x,y)=>{const r=cv.getBoundingClientRect();return[r.left+V.ox+(x+.5)*sc(),r.top+V.oy+(y+.5)*sc()]},flowLoad,beltMax,recOf,recsOf,pm,beltRateHtml,rateHtml,portsOf,def,ugWarn,areas,links:()=>links(layer),simInit,simReset,simProd,simStep,simRun,simAdvance,simState,simSig,simView,SIM_NOTES,asvNow,get SPD(){return SPD},get SM(){return SM},get sel(){return sel},get view(){return view},get tab(){return tab},get BN(){return BN},get BM(){return BM},get V(){return V},get VF(){return VF},SIM_DT,SIM_WIN,SIM_MAXSTEPS,get SIM(){return SIM},importJson,build,setView,fit,get S(){return S},get layer(){return layer},click:(x,y)=>{const r=cv.getBoundingClientRect(),o={clientX:r.left+V.ox+(x+.5)*sc(),clientY:r.top+V.oy+(y+.5)*sc(),button:0,pointerId:1,bubbles:true};cv.dispatchEvent(new PointerEvent("pointerdown",o));cv.dispatchEvent(new PointerEvent("pointerup",o))},snAdd,snRename,snDel,snUse,snExport,snImport,get SN(){return SN},get clip(){return clip},get pasting(){return pasting},plan,MKS,plnDraw};
asRestore();ASO=true;all();
