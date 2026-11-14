// tools/city_play.js: build a layout with the city builder and PLAY it into the site column by column (visible build).
// usage (page console): cityPlay({item:'ITEM_MagneticCoils',rate:1800,bk:'BPO_Station_03',stepMs:900,ox:0,oy:0}).then(console.log)
window.cityPlay=async function(o){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  globalThis.CITY_ON=true;globalThis.RB_ENGINE=true;if(o.tries)globalThis.CMPR_TRIES=o.tries;
  const rec=[].concat(...Object.values(RECS)).find(r=>new RegExp(o.item+'$').test(rk(r))),item=rec.o[0];
  const P=plan(item,o.rate,1,{},{[item]:rk(rec)},{proto:false,enr:false,obs:false});
  const t0=performance.now(),L=cmpCompose(P,item,1,1,{box:"DAT_Container_2",dock:null,bk:o.bk});
  const ms=Math.round(performance.now()-t0);
  if(!L.ok)return{ok:false,why:L.why};
  const T=L.tile,d=dim({cls:plcCls(o.bk),rot:0}),TW=d.w*FC;
  setView("L");S.blocks=[];sel=new Set();all();
  const cols=[...new Set(T.blocks.map(b=>b.x/d.w))].sort((a,b)=>a-b);
  let placed=0;
  for(const gx of cols){
    const cb=T.blocks.filter(b=>b.x/d.w===gx),ci=T.ms.filter(m=>Math.floor(m.x/TW)===gx);
    pasting={rot:0,fl:false,pl:{blocks:cb,ms:ci,plan:{item,rate:o.rate}}};hover={x:(o.ox||0),y:(o.oy||0)};
    placerPaste();pasting=null;placed+=cb.length;all();
    if(typeof fit==='function')fit();
    await sleep(o.stepMs||800);
  }
  return{ok:true,ms,cols:cols.length,blocks:placed,items:T.ms.length,rb:!!(L.bl&&L.bl.cmp&&L.bl.cmp.rb),mods:L.bl&&L.bl.cmp&&L.bl.cmp.rb?L.bl.cmp.rb.mods.map(m=>m.item+' N'+m.N+' B'+m.B):null};
};

