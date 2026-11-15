// chainPlay({url,stepMs}): replay a PLANNED chain (JSON from chainBuild: blocks, ms) into the site in steps, raw to end:
//   1. all street floors, 2. block after block from west to east (block + its dock, machines, then its belts incl. the bus belts that arrive in it), 3. leftovers.
window.chainPlay=async function(o){
  o=o||{};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const T=await (await fetch(o.url)).json(),TW=32;
  setView("L");S.blocks=[];sel=new Set();all();
  const cnt={};T.blocks.forEach(b=>cnt[b.cls]=(cnt[b.cls]||0)+1);const tileCls=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  const d=dim({cls:tileCls,rot:0});
  const tiles=T.blocks.filter(b=>b.cls===tileCls),extra=T.blocks.filter(b=>b.cls!==tileCls);
  const isBelt=m=>/Conveyor|Underground/.test(m.cls),keyOf=m=>Math.floor(m.x/TW)+','+Math.floor(m.y/TW);
  const tkey=b=>(b.x/d.w)+','+(b.y/d.h);
  const fac=new Set();T.ms.forEach(m=>{if(!isBelt(m))fac.add(keyOf(m))});
  // dock assembly items sit west of their block: they belong to the factory tile 1..2 strides east
  const owner=m=>{if(m.g&&fac.has(m.g))return m.g;const k=keyOf(m);if(fac.has(k))return k;const [bx,by]=k.split(',').map(Number);for(let dx=1;dx<=3;dx++)if(fac.has((bx+dx)+','+by))return (bx+dx)+','+by;return null};
  const groups=new Map();T.ms.forEach(m=>{const g=owner(m);(groups.get(g)||groups.set(g,[]).get(g)).push(m)});
  const paste=(blocks,ms)=>{pasting={rot:0,fl:false,pl:{blocks,ms,plan:{item:'ITEM_AdvancedPlates',rate:5}}};hover={x:0,y:0};placerPaste();pasting=null};
  const chunks=(arr,n)=>{const r=[];for(let i=0;i<arr.length;i+=n)r.push(arr.slice(i,i+n));return r.length?r:[[]]};
  window.__exoLog=[];
  const street=tiles.filter(t=>!fac.has(tkey(t)));
  for(const c of chunks(street,120)){paste(c,[]);all();if(typeof fit==='function')fit();await sleep(150)}
  window.__exoLog.push('street floors '+street.length);
  const order=tiles.filter(t=>fac.has(tkey(t))).sort((a,b)=>(a.x-b.x)||(a.y-b.y));
  for(const b of order){const k=tkey(b),mine=groups.get(k)||[],ex=extra.filter(e=>e.y===b.y&&e.x>=b.x-4&&e.x<b.x);
    paste([b,...ex],mine.filter(m=>!isBelt(m)));all();if(typeof fit==='function')fit();
    window.__exoLog.push('block '+k+': '+mine.filter(m=>!isBelt(m)).length+' machines');
    await sleep(o.stepMs||600);
    const belts=mine.filter(isBelt);for(const c of chunks(belts,2500)){if(c.length){paste([],c);all()}await sleep(120)}}
  const rest=groups.get(null)||[];if(rest.length)for(const c of chunks(rest,2500)){paste([],c);all()}
  window.__exoLog.push('done');return{ok:true,blocks:order.length};
};
