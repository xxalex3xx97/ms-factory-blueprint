// exoPlay(opts): build the hand-designed Exosuit factory and PLAY it into the site block by block (blocks + machines first, then that block's belts).
// Needs hand.js, exosuit_spec.js, exosuit.js loaded. opts: {stepMs:900}. Resolves {ok,machines,belts,blocks}.
window.exoPlay=async function(o){
  o=o||{};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const T=exoBuild({}),TW=HAND.TW,d=dim({cls:HAND.CLS,rot:0});
  setView("L");S.blocks=[];sel=new Set();all();
  const isBelt=m=>/Conveyor|Underground/.test(m.cls);
  const bOf=m=>Math.floor(m.x/TW)+','+Math.floor(m.y/TW);
  const order=T.blocks.map(b=>({b,key:(b.x/d.w)+','+(b.y/d.h)})).sort((a,c)=>(a.b.x-c.b.x)||(a.b.y-c.b.y));
  window.__exoLog=[];let placed=0;
  const paste=(blocks,ms)=>{pasting={rot:0,fl:false,pl:{blocks,ms,plan:{item:'ITEM_Exosuit',rate:1/60}}};hover={x:0,y:0};placerPaste();pasting=null;all();if(typeof fit==='function')fit()};
  for(const {b,key} of order){
    const inB=T.ms.filter(m=>bOf(m)===key);
    paste([b],inB.filter(m=>!isBelt(m)));placed++;
    window.__exoLog.push('block '+key+': '+inB.filter(m=>!isBelt(m)).length+' machines');
    await sleep(o.stepMs||900);
    const belts=inB.filter(isBelt);if(belts.length){paste([],belts);await sleep((o.stepMs||900)/2)}
  }
  return{ok:true,machines:T.machines,belts:T.belts,blocks:T.blocks.length,fails:T.fails};
};

