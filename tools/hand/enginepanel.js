// Engine panel (?engine=1): pick an item + rate, Build = chainBuild (plan, checked) then chainPlay (places it on the site).
(async function(){
  const l=s=>new Promise((r,j)=>{const e=document.createElement("script");e.src=s;e.onload=r;e.onerror=j;document.head.appendChild(e)});
  for(const f of ["js/dock_apply.js","tools/hand/hand.js","tools/hand/fblock.js","tools/hand/fchain.js","tools/hand/chainplay.js"])await l(f).catch(()=>{});
  const items=[...plnBy(false,true).keys()].map(k=>k.replace(/^ITEM_/,'')).sort();
  const p=document.createElement("div");p.style.cssText="position:fixed;right:12px;bottom:12px;z-index:99;background:#1b2230;color:#dfe6f2;border:1px solid #3a475c;border-radius:8px;padding:10px;font:13px system-ui,sans-serif;display:grid;gap:6px;width:230px";
  p.innerHTML='<b>Build a factory</b><select id="enI">'+items.map(i=>"<option>"+i+"</option>").join("")+'</select><label>per minute <input id="enR" type="number" min="0.1" step="0.5" value="5" style="width:70px"></label><button id="enB">Build</button><div id="enS" style="min-height:2.6em;color:#9fb0c8"></div>';
  document.body.appendChild(p);
  const st=t=>document.getElementById("enS").textContent=t,nx=()=>new Promise(r=>setTimeout(r,30));
  document.getElementById("enB").onclick=async()=>{
    const item=document.getElementById("enI").value,rate=+document.getElementById("enR").value||5;
    st("planning...");await nx();
    let T;try{T=chainBuild({item,rate,maxStates:60000,hw:3})}catch(e){st("failed: "+e.message);return}
    const ck=HAND.check(),bad=T.fails.length+ck.bad.length;
    if(bad){st(bad+" problems ("+T.fails.slice(0,2).join("; ")+"), not placed");return}
    st(T.blocks.length+" blocks, "+T.machines+" machines, "+T.belts+" belts: placing...");await nx();
    try{await chainPlay({plan:{blocks:T.blocks,ms:T.ms},fast:true});st("done: "+T.machines+" machines, "+T.belts+" belts")}catch(e){st("place failed: "+e.message)}
  };
})();
