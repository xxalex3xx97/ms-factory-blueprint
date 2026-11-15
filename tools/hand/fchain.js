// FCHAIN: the whole chain of one product (planner) as factory blocks + output blocks + docks + belts between them. chainBuild({item:'AdvancedPlates',rate:5,mk:1}) -> HAND.result() + {report}.
// Blocks (fblock.js `one`, chain mode): every recipe gets ceil(machines / block capacity) blocks; a block with a raw input gets its industrial dock; every block's collectors end in boxes of its output block.
// Layout (block strides of 32 cells): column c = [dock 2 strides][block][output block][street column]; factory rows are the odd block rows, street rows the even ones.
// PLANNED ROUTES: a belt may only use the street tracks (every 2nd cell line of every street row and street column), the output blocks and the entry stubs, so the search is a thin graph, not open floor.
//   Entry of a block without dock: stub row from the street column to (0,lane row). Entry of a dock block: stub column from the north street down to its approach column inside the block.
window.chainBuild=function(opts){
  opts=opts||{};const ITEM='ITEM_'+(opts.item||'AdvancedPlates'),RATE=opts.rate||5,MK=opts.mk!=null?opts.mk:1,TW=32;
  const P=plan(ITEM,RATE,MK);
  const CM={CRAFT_Refinery:['Refinery','DAT_Refinery',6],CRAFT_Assembler:['Assembler','DAT_Assembler'],CRAFT_GrowthChamber:['GrowthChamber','DAT_GrowthChamber'],CRAFT_Supercomputer:['Supercomputer','DAT_Supercomputer'],CRAFT_AdvancedAssembler:['AdvancedAssembler','DAT_AdvancedAssembler'],CRAFT_Enrichment:['Enrichment','DAT_EnrichmentChamber']};
  const CAPD={Refinery:36,Assembler:15,GrowthChamber:6,Supercomputer:9,AdvancedAssembler:4,Enrichment:4},CAPN={...CAPD,AdvancedAssembler:6,Enrichment:6};
  const by=plnBy(false,true),isRaw=it=>!by.has(it);
  const nodes=Object.values(P.nodes).filter(n=>n.crafter&&n.machines>0&&CM[n.crafter]);
  const dep={};const dOf=it=>{if(dep[it]!=null)return dep[it];dep[it]=0;let d=0;for(const e of P.edges)if(e.to===it&&e.from!==it&&P.nodes[e.from]&&P.nodes[e.from].crafter)d=Math.max(d,dOf(e.from)+1);return dep[it]=d};
  nodes.forEach(n=>dOf(n.item));
  const cols={};nodes.forEach(n=>(cols[dep[n.item]]=cols[dep[n.item]]||[]).push(n));
  const specs=[],COLW=5,WRAP=opts.wrap||8;let cb=0,maxRows=1;
  Object.keys(cols).map(Number).sort((a,b)=>a-b).forEach(c=>{let gyN=0;
    for(const n of cols[c].sort((a,b)=>b.machines-a.machines)){const [cn,cls,pov]=CM[n.crafter],rc=n.rec,raw=rc.i.some(([it])=>isRaw(it)),cap=(raw?CAPD:CAPN)[cn],nb=Math.ceil(n.machines/cap);
      let left=n.machines;for(let b=0;b<nb;b++){const m=Math.ceil(left/(nb-b));left-=m;if(gyN>=WRAP){cb++;gyN=0}specs.push({gx:2+cb*COLW,gy:1+2*gyN,name:cn+': '+n.item.replace('ITEM_','')+(nb>1?' '+(b+1)+'/'+nb:''),cls,crafter:n.crafter,rc,perOv:pov,n:m,item:n.item,dock:raw,col:c});gyN++;maxRows=Math.max(maxRows,gyN)}}
    cb++});
  const nCols=cb,report={recipes:nodes.length,blocks:specs.length,cols:nCols,rows:maxRows,routed:0,failed:0,entries:0,unsupplied:[]};
  const dockZone=new Set();specs.forEach(s=>{if(s.dock){dockZone.add((s.gx-1)+','+s.gy);dockZone.add((s.gx-2)+','+s.gy)}});
  const outBlk=new Set(specs.map(s=>(s.gx+1)+','+s.gy));
  const t0=Date.now();
  const R=fbBuild({mk:MK,plan:specs,after:(anch)=>{
    const W=2+nCols*COLW,H=2*maxRows+2;for(let gx=0;gx<W;gx++)for(let gy=0;gy<H;gy++)if(!dockZone.has(gx+','+gy))HAND.block(gx,gy);
    HAND.maxStates=opts.maxStates||300000;HAND.hw=opts.hw||3;
    const streetCol=bx=>bx>=4&&bx%COLW===4,stubs=new Set();
    const ents=[];anch.forEach(a=>a.entries.forEach(e=>ents.push(e)));report.entries=ents.length;
    ents.forEach(e=>{if(e.north){for(let y=(e.gy-1)*TW;y<=e.y;y++)stubs.add(e.x+','+y)}else{for(let x=(e.gx-3)*TW+28;x<=e.x;x++)stubs.add(x+','+e.y)}});
    const allowed=(x,y)=>{const bx=Math.floor(x/TW),by=Math.floor(y/TW),lx=x-bx*TW,ly=y-by*TW;
      if(outBlk.has(bx+','+by))return true;
      if(by%2===0&&ly%4<2)return true;   // street rows: tracks are pairs of adjacent lines (an underground exit must be followed by one more cell on the same line)
      if(streetCol(bx)&&lx%4<2)return true;
      return stubs.has(x+','+y)};
    const cfn=(x,y)=>outBlk.has(Math.floor(x/TW)+','+Math.floor(y/TW))?2:0;
    const src={};anch.forEach(a=>a.exits.forEach(e=>{(src[e.item]=src[e.item]||[]).push({obj:e.obj,room:e.rate,ports:12,x:a.gx})}));
    ents.sort((a,b)=>a.gx-b.gx||b.dem-a.dem);   // raw to end: blocks west to east
    const lim=opts.limit||1e9;let cnt=0;
    if(!opts.noRoute)for(const e of ents){if(cnt++>=lim)break;const L=src[e.item];if(!L||!L.length){report.unsupplied.push(e.item.replace('ITEM_','')+' > '+e.blk);continue}
      let ok=0;const order=L.slice().sort((a,b)=>Math.abs(a.x-e.gx)-Math.abs(b.x-e.gx)||b.room-a.room);   // nearest producer first
      for(const s of order){if(s.ports<=0)continue;
        const n=HAND.route(s.obj,e.x,e.y,0,e.item.replace('ITEM_','')+' > '+e.blk,{pa:['E','N','S'],cfn,only:opts.noOnly?null:allowed,tag:e.gx+','+e.gy});
        if(n){s.room-=e.dem;s.ports--;ok=1;break}else HAND.S.fails.pop()}
      if(!ok&&!report.dbg){const occ=[];for(let y=(e.gy-1)*TW;y<=e.y;y++){const kk=e.x+','+y;if(HAND.inFloor(e.x,y)&&HAND.S.occ.has(kk))occ.push(y)}report.dbg={blk:e.blk,north:!!e.north,x:e.x,y:e.y,gx:e.gx,gy:e.gy,occupiedStubRows:occ,goalFree:HAND.free(e.x,e.y),goalAllowed:allowed(e.x,e.y),srcs:L.map(s=>({x:s.x,ports:s.ports,free:s.obj.ports.filter(p=>!s.obj.used.has(p.key)).length}))}}
      if(ok)report.routed++;else{report.failed++;HAND.S.fails.push(e.item.replace('ITEM_','')+' > '+e.blk+' no route')}}
    report.ms=Date.now()-t0;HAND.prune()}});
  R.report=report;return R;
};
