// "Build whole factory" button of the Planner: chainBuild (plan + checks) then chainPlay (places it). Scripts load on the first click.
(function(){
  const b=document.getElementById("plnBuildAll");if(!b)return;
  const l=s=>new Promise(r=>{const e=document.createElement("script");e.src=s;e.onload=r;e.onerror=r;document.head.appendChild(e)}),nx=()=>new Promise(r=>setTimeout(r,30)),t0=b.textContent;
  b.onclick=async()=>{
    const item=document.getElementById("plnItem").value,rate=+document.getElementById("plnRate").value;
    if(!item||!(rate>0)){toast("Pick an item and a rate first");return}
    b.disabled=true;
    try{
      b.textContent="Loading...";await nx();
      if(typeof chainBuild!=="function")for(const f of ["js/dock_apply.js","tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f);
      b.textContent="Planning...";await nx();
      const T=chainBuild({item:item.replace(/^ITEM_/,""),rate,maxStates:60000,hw:3}),bad=T.fails.length+HAND.check().bad.length;
      if(bad){toast(bad+" problems, nothing placed: "+T.fails.slice(0,2).join("; "));return}
      b.textContent="Placing...";await nx();
      await chainPlay({plan:{blocks:T.blocks,ms:T.ms},fast:true});
      toast("Factory placed: "+T.machines+" machines, "+T.belts+" belts");
    }catch(e){toast("Build failed: "+e.message)}
    finally{b.disabled=false;b.textContent=t0}
  };
})();
