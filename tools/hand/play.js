// exoPlay(opts): build the hand-designed Exosuit factory and PLAY it into the site block by block (blocks + machines first, then that block's belts).
// Needs hand.js, exosuit_spec.js, exosuit.js loaded. opts: {stepMs:900}. Resolves {ok,machines,belts,blocks}.
window.exoPlay=async function(o){
  o=o||{};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const T=(o.build||exoBuild)({}),TW=HAND.TW,d=dim({cls:HAND.CLS,rot:0});
  setView("L");S.blocks=[];sel=new Set();all();
  const isBelt=m=>/Conveyor|Underground/.test(m.cls);
  const tiles=T.blocks.filter(b=>b.cls===HAND.CLS),extra=T.blocks.filter(b=>b.cls!==HAND.CLS);   // extra = dock and adapter blocks west of a tile
  const order=tiles.map(b=>({b,key:(b.x/d.w)+','+(b.y/d.h)})).sort((a,c)=>(a.b.x-c.b.x)||(a.b.y-c.b.y));
  const own=m=>{for(const o of order){const bx=o.b.x*FC,by=o.b.y*FC;if(m.x>=bx-64&&m.x<=bx+TW-1&&m.y>=by&&m.y<=by+TW-1)return o.key}return null};
  const bOf=m=>own(m);
  window.__exoLog=[];let placed=0;
  const paste=(blocks,ms)=>{pasting={rot:0,fl:false,pl:{blocks,ms,plan:{item:'ITEM_Exosuit',rate:1/60}}};hover={x:0,y:0};placerPaste();pasting=null;all();if(typeof fit==='function')fit()};
  for(const {b,key} of order){
    const inB=T.ms.filter(m=>bOf(m)===key);
    paste([b,...extra.filter(e=>e.y===b.y&&e.x>=b.x-4&&e.x<b.x)],inB.filter(m=>!isBelt(m)));placed++;
    window.__exoLog.push('block '+key+': '+inB.filter(m=>!isBelt(m)).length+' machines');
    await sleep(o.stepMs||900);
    const belts=inB.filter(isBelt);if(belts.length){paste([],belts);await sleep((o.stepMs||900)/2)}
  }
  return{ok:true,machines:T.machines,belts:T.belts,blocks:T.blocks.length,fails:T.fails};
};

