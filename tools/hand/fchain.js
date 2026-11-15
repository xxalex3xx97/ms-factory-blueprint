// FCHAIN: the whole chain of one product (planner) as factory blocks + output blocks + docks + belts between them. chainBuild({item:'AdvancedPlates',rate:5,mk:1}) -> HAND.result() + {report}.
// Blocks (fblock.js `one`, chain mode): every recipe gets ceil(machines / block capacity) blocks; a block with a raw input gets its industrial dock; every block's collectors end in boxes of its output block.
// Layout (block strides of 32 cells = 2 units): block columns by depth, west to east. A column = [3 units of free ship space + dock + adapter = 4 strides, only when the column holds a raw-fed block][block][output block][street, 2 strides wide].
//   Factory rows are the odd block rows, street rows the even ones. The 4 strides in front of a raw-fed block stay free of floor on its row and the street rows above and below (the ship berth: ships need room in front and at the sides); trunk rows at the very top and bottom still cross every column.
// PLANNED ROUTES: a belt may only use the street tracks (pairs of adjacent cell lines of every street row and street column), the output blocks and the entry stubs, so the search is a thin graph, not open floor.
//   Entry of a block without dock: stub row from the street column to (0,lane row). Entry of a dock block: stub column from the north street down to its approach column inside the block.
window.chainBuild=function(opts){
  opts=opts||{};HAND.setTile(opts.tile||'BPO_Station_03');HAND.noDock=opts.docks===false;HAND.adapt=opts.adapter!=null?opts.adapter:opts.tile!=='BPO_Station_02';   // 2x2 B: docks join the block directly; the open-sided 2x2 C needs a Station Adapter
  // pass 1 measures the lanes every street column and the trunk bands really need (wide streets), pass 2 builds with exactly that much street: a much smaller factory, far fewer pieces
  if(!opts.sws&&!opts.noAdapt){let m=opts.margin||2,r1=chainBuild({...opts,sw:opts.sw0||16,tbs:opts.tbs||8,noAdapt:true,dry:true}),r2=null;
    for(let t=0;t<3;t++){const meas=r1.report.meas,sws=meas.map(c=>Math.max(2,Math.ceil((c.ns+c.nc+2*m)/14))),halfs=meas.map(c=>c.ns+m),tbs=Math.max(3,Math.ceil((r1.report.trunk+m)/14)+0);
      r2=chainBuild({...opts,sws,halfs,tbs,noAdapt:true});if(!r2.report.failed||t===2)break;m+=2;r1=chainBuild({...opts,sw:opts.sw0||16,tbs:opts.tbs||8,noAdapt:true,dry:true})}
    return r2}
const ITEM='ITEM_'+(opts.item||'AdvancedPlates'),RATE=opts.rate||5,MK=opts.mk!=null?opts.mk:1,TW=32;
  const P=plan(ITEM,RATE,MK);
  const CM={CRAFT_Refinery:['Refinery','DAT_Refinery',6],CRAFT_Assembler:['Assembler','DAT_Assembler'],CRAFT_GrowthChamber:['GrowthChamber','DAT_GrowthChamber'],CRAFT_Supercomputer:['Supercomputer','DAT_Supercomputer'],CRAFT_AdvancedAssembler:['AdvancedAssembler','DAT_AdvancedAssembler'],CRAFT_Enrichment:['Enrichment','DAT_EnrichmentChamber']};
  const CAPD={Refinery:36,Assembler:15,GrowthChamber:6,Supercomputer:9,AdvancedAssembler:4,Enrichment:4},CAPN={...CAPD,AdvancedAssembler:6,Enrichment:6};
  const by=plnBy(false,true),isRaw=it=>!by.has(it),rawOf=n=>n.rec.i.some(([it])=>isRaw(it));
  const nodes=Object.values(P.nodes).filter(n=>n.crafter&&n.machines>0&&CM[n.crafter]);
  const dep={};const dOf=it=>{if(dep[it]!=null)return dep[it];dep[it]=0;let d=0;for(const e of P.edges)if(e.to===it&&e.from!==it&&P.nodes[e.from]&&P.nodes[e.from].crafter)d=Math.max(d,dOf(e.from)+1);return dep[it]=d};
  nodes.forEach(n=>dOf(n.item));
  const blocksOf=n=>{const [cn]=CM[n.crafter],cap=(rawOf(n)?CAPD:CAPN)[cn],nb=Math.ceil(n.machines/cap),L=[];let left=n.machines;for(let b=0;b<nb;b++){const m=Math.ceil(left/(nb-b));left-=m;L.push([b,nb,m])}return L};
  // columns: by depth, a depth wraps into side-by-side columns after WRAP rows
  const WRAP=opts.wrap||8,colList=[],SW=opts.sw||10,TBS=opts.tbs||6,sws=opts.sws||[];
  const byDepth={};nodes.forEach(n=>(byDepth[dep[n.item]]=byDepth[dep[n.item]]||[]).push(n));
  Object.keys(byDepth).map(Number).sort((a,b)=>a-b).forEach(c=>{let cur={items:[]};
    for(const n of byDepth[c].sort((a,b)=>b.machines-a.machines))for(const [b,nb,m] of blocksOf(n)){if(cur.items.length>=WRAP){colList.push(cur);cur={items:[]}}cur.items.push({n,b,nb,m})}
    colList.push(cur)});
  let x=0;const specs=[],streetBx=new Set(),westOf={},westOf0={},swMap={};let maxRows=1;
  colList.forEach((col,ci)=>{col.hasRaw=col.items.some(i=>rawOf(i.n));x+=col.hasRaw?4:0;col.gx=x;col.sw=sws[ci]||SW;col.half=(opts.halfs||[])[ci];col.west=ci?colList[ci-1].gx+1+colList[ci-1].sw:null;col.west0=ci?colList[ci-1].gx+2:null;swMap[col.gx+2]={sw:col.sw,half:col.half};x+=2+col.sw;for(let d=2;d<2+col.sw;d++)streetBx.add(col.gx+d);   // block, output block, street 4 strides wide (64 lanes)
    let cur=0;col.items.forEach((it,r)=>{const [cn,cls,pov]=CM[it.n.crafter],nExtra=rawOf(it.n)?Math.max(0,new Set(it.n.rec.i.map(([q])=>q).filter(isRaw)).size-1):0;westOf[col.gx]=col.west;westOf0[col.gx]=col.west0;
      if(nExtra)cur+=2;const gyRow=cur;cur+=nExtra?4:2;maxRows=Math.max(maxRows,cur/2);   // a block with extra docks keeps the rows above and below for them
      specs.push({gx:col.gx,gy:TBS+1+gyRow,name:cn+': '+it.n.item.replace('ITEM_','')+(it.nb>1?' '+(it.b+1)+'/'+it.nb:''),cls,crafter:it.n.crafter,rc:it.n.rec,perOv:pov,n:it.m,item:it.n.item,dock:rawOf(it.n),col:dep[it.n.item]})})});
  const lastGx=colList[colList.length-1].gx,W=lastGx+2+colList[colList.length-1].sw,H=TBS+1+2*maxRows+TBS;   // rows 0..2 and the last 3 stay street: trunk rows above and below every berth zone
  const nCols=colList.length,report={recipes:nodes.length,blocks:specs.length,cols:nCols,rows:maxRows,routed:0,failed:0,entries:0,unsupplied:[]};
  const dockZone=new Set();specs.forEach(s=>{if(s.dock)for(let d=1;d<=4;d++)for(let dy=-1;dy<=1;dy++)dockZone.add((s.gx-d)+','+(s.gy+dy))});   // dock + adapter (2 strides) and 3 units of ship space in front (2 strides)
  const outBlk=new Set(specs.map(s=>(s.gx+1)+','+s.gy));
  const t0=Date.now();
  const R=fbBuild({mk:MK,plan:specs,after:(anch)=>{
    for(let gx=0;gx<W;gx++)for(let gy=0;gy<H;gy++)if(!dockZone.has(gx+','+gy))HAND.block(gx,gy);
    // ---- rule-based lanes: every belt = source box -> street lane up/down to a trunk band -> along the trunk -> consumer street lane -> (street row lane + stub column | stub row) -> entry. No search.
    const ents=[];anch.forEach(a=>a.entries.forEach(e=>ents.push(e)));report.entries=ents.length;
    const src={};anch.forEach(a=>a.exits.forEach(e=>{const ps=e.obj.ports.filter(p=>p.f==='E').sort((a,b)=>a.y-b.y),sp=e.obj.ports.filter(p=>p.f==='S').sort((a,b)=>a.x-b.x);(src[e.item]=src[e.item]||[]).push({obj:e.obj,room:e.rate,x:a.gx,ports:[ps[0],ps[2],sp[0],...ps.filter((q,i)=>i!==0&&i!==2),...sp.slice(1)].filter(Boolean)})}));   // three belts per box: E ports 2 rows apart and the first S port; the other ports follow when a product has more consumers than that
    const BELT=PLC_BELT[MK],UGC=PLC_UG[MK],DH=HAND.D(),PAD=3,lanes=new Map(),Hpx=H*TW;
    const laneX=(bx0,k)=>(bx0+Math.floor(k/14))*TW+2+2*(k%14),NT=14*TBS,nlOf=bx0=>14*swMap[bx0].sw,halfOf=bx0=>swMap[bx0].half!=null?swMap[bx0].half:nlOf(bx0)/2;   // lanes on every 2nd cell line, never next to a wall (cell lines 2..28 of a stride)   // street column = 4 strides, a lane on every 2nd cell line
    const take=(key,a,b,n,lo=0)=>{const l=lanes.get(key)||lanes.set(key,[]).get(key);for(let k=lo;k<n;k++){if(!l[k])l[k]=[];if(!l[k].some(([c,d])=>!(b+PAD<c||a-PAD>d))){l[k].push([a,b]);return k}}return -1};
    const LB={},sgn=v=>v>0?1:v<0?-1:0,dirOf=(dx,dy)=>dx>0?0:dy>0?1:dx<0?2:3;
    // plan one straight run between two waypoints (both exclusive): greedy underground chains over occupied cells; false when a needed cell is taken
    const planRun=(a,b,mine,out,endCell)=>{const dx=sgn(b[0]-a[0]),dy=sgn(b[1]-a[1]),dir=dirOf(dx,dy),cells=[];let x=a[0]+dx,y=a[1]+dy;while(x!==b[0]||y!==b[1]){cells.push([x,y]);x+=dx;y+=dy}if(endCell)cells.push([b[0],b[1]]);
      const N=cells.length;if(!N)return true;const ok=c=>HAND.free(c[0],c[1])&&(!mine.has(c[0]+','+c[1])||(endCell&&c[0]===b[0]&&c[1]===b[1]));let i=0;
      while(i<N){if(!ok(cells[i])){LB.cell=cells[i];LB.run=[a,b];return false}let best=-1;for(let j=Math.min(i+DH,N-1);j>=i+2;j--)if(ok(cells[j])&&(j===N-1||ok(cells[j+1]))){best=j;break}
        if(best>=0){out.push({cls:UGC,x:cells[i][0],y:cells[i][1],rot:dir},{cls:UGC,x:cells[best][0],y:cells[best][1],rot:dir,span:[cells[i],cells[best]]});cells.slice(i,best+1).forEach(c=>mine.add(c[0]+','+c[1]));i=best+1}
        else{out.push({cls:BELT,x:cells[i][0],y:cells[i][1],rot:dir});mine.add(cells[i][0]+','+cells[i][1]);i++}}
      return true};
    const lay=(wps,tag)=>{const out=[],mine=new Set();
      const L2=wps.length,gl=wps[L2-1],pv=wps[L2-2],gdx=sgn(gl[0]-pv[0]),gdy=sgn(gl[1]-pv[1]),goalExit=!HAND.inFloor(gl[0]-gdx,gl[1]-gdy);   // a wall right before the goal: the goal itself is the exit of the last tunnel
      for(let i=0;i<wps.length;i++){if(goalExit&&i===L2-1)continue;const w=wps[i],n=wps[i+1],dir=n?dirOf(sgn(n[0]-w[0]),sgn(n[1]-w[1])):0;if(!HAND.free(w[0],w[1])||mine.has(w[0]+','+w[1])){LB.cell=w;LB.run='waypoint '+i;return false}out.push({cls:BELT,x:w[0],y:w[1],rot:dir});mine.add(w[0]+','+w[1])}
      for(let i=0;i+1<wps.length;i++)if(!planRun(wps[i],wps[i+1],mine,out,goalExit&&i+1===L2-1))return false;
      out.forEach(p=>{const sp=p.span;delete p.span;HAND.piece({...p,g:tag});if(sp){const v=sp[0][0]===sp[1][0],ax=v?'v'+sp[0][0]:'h'+sp[0][1],l=HAND.S.span.get(ax)||[];l.push(v?[Math.min(sp[0][1],sp[1][1]),Math.max(sp[0][1],sp[1][1])]:[Math.min(sp[0][0],sp[1][0]),Math.max(sp[0][0],sp[1][0])]);HAND.S.span.set(ax,l)}});return true};
    ents.sort((a,b)=>a.gx-b.gx||b.dem-a.dem);   // raw to end: blocks west to east
    // entries without dock of one block sit on adjacent rows: their consumer lanes are taken together, in the order that keeps every corner free (from the top: lower row = lower lane x; from the bottom: the opposite)
    const pre=new Map();
    {const g={};ents.forEach(e=>{if(!e.north&&westOf[e.gx]!=null)(g[e.gx+','+e.gy]=g[e.gx+','+e.gy]||[]).push(e)});
     Object.values(g).forEach(L=>{L.sort((a,b)=>a.y-b.y);const e0=L[0],bx2=westOf0[e0.gx],top=L.some(e=>e.y%TW===0)?false:L.some(e=>e.y%TW===29)?true:e0.y<=Hpx/2,key='v'+bx2;   // a lane row on the first cell line of a block cannot be reached from the north (a wall is right before it)
       const a0=top?0:L[0].y,b0=top?L[L.length-1].y:Hpx;const free=[];const l=lanes.get(key)||lanes.set(key,[]).get(key);
       for(let k=halfOf(bx2);k<nlOf(bx2)&&free.length<L.length;k++){if(!l[k])l[k]=[];if(!l[k].some(([c,d])=>!(b0+PAD<c||a0-PAD>d)))free.push(k)}
       if(free.length<L.length){L.forEach(e=>pre.set(e,-1));return}
       free.forEach(k=>lanes.get(key)[k].push([a0,b0]));
       L.forEach((e,i)=>pre.set(e,{k:top?free[L.length-1-i]:free[i],top}))})}
    const lim=opts.limit||1e9;let cnt=0;
    if(!opts.noRoute)for(const e of ents){if(cnt++>=lim)break;
      if(e.tailY!=null){const tx=e.gx*TW,wps=[[tx,e.tailY],[e.x,e.tailY],[e.x,e.y]],cl=wps.filter((w,i)=>i===0||w[0]!==wps[i-1][0]||w[1]!==wps[i-1][1]);
        if(lay(cl,e.gx+','+e.gy))report.routed++;else{report.failed++;HAND.S.fails.push(e.item.replace('ITEM_','')+' > '+e.blk+' no route (dock tail)')}continue}
      const L=src[e.item];if(!L||!L.length){report.unsupplied.push(e.item.replace('ITEM_','')+' > '+e.blk);continue}
      let ok=0,why='';const order=L.slice().sort((a,b)=>Math.abs(a.x-e.gx)-Math.abs(b.x-e.gx)||b.room-a.room);
      for(const [s,p] of order.flatMap(s=>s.ports.map(p=>[s,p]))){const sx=p.x+p.nx,sy=p.y+p.ny;
        const bx1=s.x+2,dock=!!e.north,bx2=dock?e.gx+2:westOf0[e.gx],tgtY=dock?(e.gy-1)*TW:e.y;
        const pr=pre.get(e),top=(pr&&typeof pr==='object')?pr.top:(sy+tgtY)<=(2*Hpx-sy-tgtY),tk=top?'tT':'tB',tBase=top?0:(H-TBS)*TW;
        const k1=take('v'+bx1,Math.min(sy,top?0:Hpx),Math.max(sy,top?0:Hpx),halfOf(bx1));if(k1<0){why='no source lane';continue}const X1=laneX(bx1,k1);
        let X2,Yt=null;
        if(bx1===bx2&&!pr){X2=X1}else{let k2;if(pr&&typeof pr==='object')k2=pr.k;else k2=take('v'+bx2,0,Hpx,nlOf(bx2),halfOf(bx2));if(k2==null||k2<0){why='no consumer lane';continue}X2=laneX(bx2,k2);const kt=take(tk,Math.min(X1,X2),Math.max(X1,X2),NT);if(kt<0){why='no trunk lane';continue}Yt=tBase+Math.floor(kt/14)*TW+2+2*(kt%14)}
        let wps;
        if(dock){const kh=take('h'+(e.gy-1),Math.min(X2,e.x),Math.max(X2,e.x),14);if(kh<0){why='no street row lane';continue}const Yh=(e.gy-1)*TW+2+2*kh;
          wps=[[sx,sy],[X1,sy],...(Yt!=null?[[X1,Yt],[X2,Yt]]:[]),[X2,Yh],[e.x,Yh],[e.x,e.y]]}
        else wps=[[sx,sy],[X1,sy],...(Yt!=null?[[X1,Yt],[X2,Yt]]:[]),[X2,e.y],[e.x,e.y]];
        const clean=wps.filter((w,i)=>i===0||w[0]!==wps[i-1][0]||w[1]!==wps[i-1][1]);
        if(lay(clean,e.gx+','+e.gy)){s.obj.used.add(p.key);s.ports.splice(s.ports.indexOf(p),1);s.room-=e.dem;ok=1;break}else why='blocked '+JSON.stringify((()=>{const c=LB.cell,q=c&&HAND.S.pcs.find(p=>p.x===c[0]&&p.y===c[1]);return q?{g:q.g,cls:q.cls.slice(-4),rot:q.rot}:{floor:c&&HAND.inFloor(c[0],c[1]),occ:c&&HAND.S.occ.get(c[0]+','+c[1])}})())+' '+JSON.stringify(LB.cell)+' '+JSON.stringify(LB.run)+' dock='+dock+' wps='+JSON.stringify(clean)}
      if(ok)report.routed++;else{report.failed++;HAND.S.fails.push(e.item.replace('ITEM_','')+' > '+e.blk+' no route ('+why+')')}}
    // measure the lanes used per street column and trunk band (the second pass sizes the streets from this)
    report.meas=colList.map(col=>{const bx0=col.gx+2,l=lanes.get('v'+bx0)||[],h=halfOf(bx0);let ns=0,nc=0;l.forEach((a,k)=>{if(a&&a.length){if(k<h)ns=Math.max(ns,k+1);else nc=Math.max(nc,k+1-h)}});return{bx0,ns,nc}});
    report.trunk=Math.max(0,...['tT','tB'].map(k=>{const l=lanes.get(k)||[];let m=0;l.forEach((a,i)=>{if(a&&a.length)m=Math.max(m,i+1)});return m}));
    report.ms=Date.now()-t0;HAND.prune()}});
  R.report=report;return R;
};
