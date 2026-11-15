// chainPlay({url,stepMs}): replay a PLANNED chain (JSON from chainBuild: blocks, ms) into the site in steps, raw to end:
//   1. all street floors, 2. every block with its machines (and its dock: assembly containers + belts), west to east, 3. all belts block by block.
// The plan was already checked against the site's placement rules, so the per-paste checks (noBuild scans every placed piece, push copies the undo state, cutBelts scans every belt) are switched off while it plays: that was the lag.
window.chainPlay=async function(o){
  o=o||{};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const T=o.plan||await (await fetch(o.url)).json(),TW=32;
  setView("L");S.blocks=[];sel=new Set();all();
  const cnt={};T.blocks.forEach(b=>cnt[b.cls]=(cnt[b.cls]||0)+1);const tileCls=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  const d=dim({cls:tileCls,rot:0});
  const tiles=T.blocks.filter(b=>b.cls===tileCls),extra=T.blocks.filter(b=>b.cls!==tileCls);
  const isBelt=m=>/Conveyor|Underground/.test(m.cls),keyOf=m=>Math.floor(m.x/TW)+','+Math.floor(m.y/TW);
  const tkey=b=>(b.x/d.w)+','+(b.y/d.h),tkeys=new Set(tiles.map(tkey));
  const fac=new Set();T.ms.forEach(m=>{if(!isBelt(m)){const k=keyOf(m);if(tkeys.has(k))fac.add(k)}});   // tiles that hold machines
  // dock assembly items sit in the berth strides west of their block (no tile there): they belong to the factory tile 1..4 strides east
  const owner=m=>{if(m.g&&fac.has(m.g))return m.g;const k=keyOf(m);if(fac.has(k))return k;const [bx,by]=k.split(',').map(Number);for(let dx=1;dx<=4;dx++)for(const dy of[0,-1,1])if(fac.has((bx+dx)+','+(by+dy)))return (bx+dx)+','+(by+dy);return null};   // extra docks sit one stride row above / below their block
  const groups=new Map();T.ms.forEach(m=>{const g=owner(m);(groups.get(g)||groups.set(g,[]).get(g)).push(m)});
  const saved={noBuild:window.noBuild,push:window.push,cutBelts:window.cutBelts};
  if(!o.check){window.noBuild=()=>false;window.push=()=>{};window.cutBelts=()=>{}}   // o.check: keep the site's own placement checks on (validation run)
  const paste=(blocks,ms,label)=>{window.__stage=label||'';pasting={rot:0,fl:false,pl:{blocks,ms,plan:{item:'ITEM_AdvancedPlates',rate:5}}};hover={x:0,y:0};placerPaste();pasting=null};
  const chunks=(arr,n)=>{const r=[];for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n));return r.length?r:[[]]};
  const redraw=()=>{all();if(typeof fit==='function')fit()};
  window.__exoLog=[];
  const adapt=T.blocks.some(b=>/Adapter/.test(b.cls));   // 2x2 C: dock 4 units west + adapter 1 unit west; 2x2 A/B: the dock is 3 units west
  const order=tiles.filter(t=>fac.has(tkey(t))).sort((a,b)=>(a.x-b.x)||(a.y-b.y));
  const usedEx=new Set();
  try{
    const street=tiles.filter(t=>!fac.has(tkey(t)));
    for(const c of chunks(street,400)){paste(c,[],'street');await sleep(0)}
    redraw();window.__exoLog.push('street floors '+street.length);
    for(const b of order){const k=tkey(b),mine=groups.get(k)||[],ex=extra.filter(e=>Math.abs(e.y-b.y)<=2&&((adapt?(e.x===b.x-4||e.x===b.x-1):e.x===b.x-3))),ms=mine.filter(m=>!isBelt(m));
      ex.forEach(e=>usedEx.add(e));paste([b,...ex],ms,'block '+k);window.__exoLog.push('block '+k+': '+ms.length+' machines');
      if(!o.fast){redraw();await sleep(o.stepMs||300)}}
    {const left=extra.filter(e=>!usedEx.has(e));if(left.length)paste(left,[],'extra')}   // blocks not next to a factory tile (output docks)
    redraw();
    for(const b of order){const k=tkey(b),belts=(groups.get(k)||[]).filter(isBelt);
      for(const c of chunks(belts,6000)){if(c.length)paste([],c,'belts '+k)}
      window.__exoLog.push('belts '+k+': '+belts.length);if(!o.fast){redraw();await sleep(o.stepMs?o.stepMs/2:100)}}
    const rest=groups.get(null)||[];if(rest.length)for(const c of chunks(rest,6000))paste([],c,'rest');
    const nmMap=new Map(T.blocks.filter(b=>b.nm).map(b=>[b.cls+'|'+b.x+'|'+b.y,b.nm]));S.blocks.forEach(b=>{const n=nmMap.get(b.cls+'|'+b.x+'|'+b.y);if(n)b.nm=n});   // dock names (the paste keeps no block names)
  }finally{window.noBuild=saved.noBuild;window.push=saved.push;window.cutBelts=saved.cutBelts;redraw()}
  window.__exoLog.push('done');return{ok:true,blocks:order.length};
};
