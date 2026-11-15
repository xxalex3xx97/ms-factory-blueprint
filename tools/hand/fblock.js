// FBLOCK: full factory blocks per machine class (HAND toolkit), designed from the machine's real ports.
//   fbBuild({mk:1})            -> one block per class, the recipe with the most inputs
//   fbBuild({mk:1,dock:true})  -> one DOCK-READY block per recipe that has at least one raw input (a raw item is one nothing in the game crafts)
// Rule: inputs go on the N face first (far lane -> rightmost used port, drops cross nearer lanes by an underground hop), the rest on the S face (near lane -> leftmost port);
// the output goes on the last free S port, or on an E side port when the S face is full of inputs (growth chamber, 4 inputs: the user's design, 2 rows with facing collectors).
// DOCK-READY: raw lanes come from an industrial dock. Its interface is fixed: container group 1 flush at the west edge rows 4..7, group 2 rows 22..25, each group ONE item and up to 4 lanes
//   (E doorway column x=4). Each raw lane belt leaves its port row, jogs (one column per jog, farthest target first) to the lane row of its factory row and runs east to the machines.
//   Non-raw lanes keep entering at x=0 and hop under the jog columns. Machines start east of the jog columns, so a dock-ready block holds slightly fewer machines.
window.fbBuild=function(opts){
  opts=opts||{};const MK=opts.mk!=null?opts.mk:1,DOCK=!!opts.dock;HAND.reset({mk:MK});
  const BELT=PLC_BELT[MK],UGC=PLC_UG[MK],SPL=PLC_SPL[MK],TW=HAND.TW,DH=HAND.D(),by=plnBy(false,true),isRaw=it=>!by.has(it);
  const CLASSES=[['Refinery','DAT_Refinery','CRAFT_Refinery',6],['Assembler','DAT_Assembler','CRAFT_Assembler'],['GrowthChamber','DAT_GrowthChamber','CRAFT_GrowthChamber'],['Supercomputer','DAT_Supercomputer','CRAFT_Supercomputer'],['AdvancedAssembler','DAT_AdvancedAssembler','CRAFT_AdvancedAssembler'],['Enrichment','DAT_EnrichmentChamber','CRAFT_Enrichment']];
  const hopSpan=(ax,a,b)=>{const l=HAND.S.span.get(ax)||[];l.push([a,b]);HAND.S.span.set(ax,l)};   // tell check() the pair is intended
  const info=[],dockBlk=[];
  function one(gx,gy,name,cls,crafter,rc,perOv){
    const ox=gx*TW,oy=gy*TW,put1=(x,y,rot,c,extra)=>{if(!HAND.piece({cls:c,x:ox+x,y:oy+y,rot,...extra}))throw new Error(name+': cell taken '+x+','+y)};
    const spl=(x,y,keep)=>put1(x,y,0,SPL,{off:pfSplOff(SPL,0,keep),pr:[0,-1]});
    // horizontal lane on row y from x=x0: splitters at spx, UG hops hop(x)->exit, belts elsewhere, up to the last splitter
    const hlane=(y,x0,spx,keepFn,hop)=>{const xEnd=Math.max(...spx);let x=x0;
      while(x<=xEnd){if(spx.includes(x)){spl(x,y,keepFn(x===xEnd));x++;continue}
        if(hop.has(x)){put1(x,y,0,UGC);put1(hop.get(x),y,0,UGC);hopSpan('h'+(oy+y),ox+x,ox+hop.get(x));x=hop.get(x)+1;continue}
        put1(x,y,0,BELT);x++}};
    const s=dim({cls,rot:0}).w,P0=portsOf({cls,x:0,y:0,rot:0,h:0}),cN=P0.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b),cE=P0.filter(p=>p.f==='E').map(p=>p.y).sort((a,b)=>a-b),pf=cN.length,kr=rc.i.length,k=Math.max(...RECS[crafter].map(x=>x.i.length));   // block geometry from the class's biggest recipe; this recipe fills the first kr lanes
    const nN=Math.min(k,pf);let nS=k-nN;const side=nS>=pf;if(!side)nS=Math.min(nS,pf-1);
    const inItem=j=>rc.i[j][0],rawIn=rc.i.map(([it])=>isRaw(it));   // input index: N lane j = input j, S lane j = input nN+j
    const band=side?nN+s+nS+2:nN+s+(nS?1:0)+1,rowsN=side?2:Math.floor(30/band),pitch=side?s+1:s,iO=nS&&!side?pf-1:0;
    const yStart=r=>side?(r===0?0:30-band):r*band,nRows=side?2:rowsN;
    // ---- dock hub: which lane rows are raw, grouped by item
    const targets=new Map();   // item -> [{row,key}]
    const laneRow=(r,idx)=>{const y0=yStart(r),up=side&&r===1,top=y0+(up?2:0),my=top+nN;return idx<nN?top+idx:my+s+(idx-nN)};
    if(DOCK)for(let r=0;r<nRows;r++)for(let idx=0;idx<kr;idx++)if(rawIn[idx]){const it=inItem(idx);(targets.get(it)||targets.set(it,[]).get(it)).push({row:laneRow(r,idx),r,idx})}
    const placed=[],items=[...targets.keys()],lanesInfo=[];let J=0,jogRows=[],entryBlocked=0,undocked=0;
    const groups=[[],[]],gitem=[null,null];
    if(DOCK){
      if(items.length===1){const all=targets.get(items[0]).sort((a,b)=>a.row-b.row),h=Math.min(4,Math.ceil(all.length/2)>4?4:Math.max(Math.ceil(all.length/2),all.length>4?4:all.length));
        const g1=all.length<=4?all:all.slice(0,Math.ceil(all.length/2)),g2=all.length<=4?[]:all.slice(Math.ceil(all.length/2));groups[0]=g1;groups[1]=g2;gitem[0]=gitem[1]=items[0]}
      else{groups[0]=(targets.get(items[0])||[]).sort((a,b)=>a.row-b.row);gitem[0]=items[0];if(items[1]){groups[1]=targets.get(items[1]).sort((a,b)=>a.row-b.row);gitem[1]=items[1]}
        for(let i=2;i<items.length;i++)undocked+=targets.get(items[i]).length}
      groups.forEach((g,gi)=>{if(g.length>4){undocked+=g.length-4;g.length=4}});
      const base=[4,22];
      groups.forEach((g,gi)=>{if(!g.length)return;const n=g.length;let best=0,bs=1e9;
        for(let st=0;st+n<=4;st++){let sum=0;g.forEach((t,i)=>sum+=Math.abs(base[gi]+st+i-t.row));if(sum<bs){bs=sum;best=st}}
        g.forEach((t,i)=>{t.p=base[gi]+best+i;t.gi=gi});
        const ups=g.filter(t=>t.row<t.p).sort((a,b)=>a.row-b.row),downs=g.filter(t=>t.row>t.p).sort((a,b)=>b.row-a.row);
        g.filter(t=>t.row===t.p).forEach(t=>{t.xj=null});
        // smallest free jog column: no overlapping vertical on it, and the cell after the turn must not be another lane's vertical
        [...ups,...downs].forEach(t=>{const a=Math.min(t.p,t.row),b=Math.max(t.p,t.row);let c=1;
          const clash=c2=>placed.some(o=>(o.x===c2&&o.a<=b+1&&a<=o.b+1)||(o.x===c2+1&&t.row>=o.a&&t.row<=o.b)||(o.x===c2-1&&o.row>=a&&o.row<=b)||(o.x<c2&&t.p>=o.a&&t.p<=o.b)||(c2<o.x&&o.p>=a&&o.p<=b));
          while(clash(c))c++;t.xj=c;placed.push({x:c,a,b,row:t.row,p:t.p});J=Math.max(J,c)})})
    }
    const X0=DOCK?Math.max(1,J+1):1,per=Math.min(perOv||99,Math.floor((28-X0+(side?1:0))/pitch)),cap=nRows*per;HAND.block(gx,gy);
    // industrial dock west of the block (2x2 C: station adapter between block and dock, assembly shifted 16 cells): the 8 lane belts arrive at x=0 on rows 4..7 / 22..25
    const rawStart=new Map(),usedP=new Map();   // 'r,idx' -> start x of the raw lane; port row -> jog column of the lane on it
    const TR=[1,0,3,2],A=16,putF=(x,y,rot,c,extra)=>{if(!HAND.piece({cls:c,x:ox+x,y:oy+y,rot,...extra},true))throw new Error(name+': dock cell taken '+x+','+y)};
    if(DOCK&&groups.some(g=>g.length)){
      const asm=nlIndAsm();
      asm.boxes.forEach(b=>{const gi=b.y===9&&(b.x===4||b.x===22)?(b.x===4?0:1):-1,it=gi>=0&&groups[gi].length?gitem[gi]:null;
        const c=HAND.put({cls:'DAT_Container_2',gx,gy,lx:-16-A+b.y,ly:b.x,force:true,name:'dock box',ct:it?[{item:it,n:0,inf:true}]:[]});if(!c)throw new Error(name+': dock box does not fit');
        if(it)c.ports.forEach(q=>{if(q.f==='W'||q.f==='E')c.used.add(q.key)})
        else c.ports.forEach(q=>c.used.add(q.key))});
      asm.belts.forEach(kb=>putF(-16-A+kb.y,kb.x,TR[kb.rot],BELT));
      const tails=new Set();groups.forEach(g=>g.forEach(t=>tails.add(t.p)));tails.forEach(py=>{for(let x=-16-A+13;x<=-1;x++)putF(x,py,0,BELT)});
      dockBlk.push({cls:plcCls('BPO_Dock_2'),x:gx*2-4,y:gy*2,rot:2},{cls:plcCls('BPO_StationAdapter_01'),x:gx*2-1,y:gy*2,rot:2})}
    if(DOCK)groups.forEach(g=>g.forEach(t=>{
      if(t.xj==null){rawStart.set(t.r+','+t.idx,0);usedP.set(t.p,0);return}
      for(let x=0;x<t.xj;x++)put1(x,t.p,0,BELT);
      const dir=t.row<t.p?3:1;put1(t.xj,t.p,dir,BELT);
      for(let y=t.p+(dir===1?1:-1);y!==t.row;y+=dir===1?1:-1)put1(t.xj,y,dir,BELT);
      put1(t.xj,t.row,0,BELT);rawStart.set(t.r+','+t.idx,t.xj+1);usedP.set(t.p,t.xj);jogRows.push({x:t.xj,a:Math.min(t.p,t.row),b:Math.max(t.p,t.row)})}));
    const crossX=(yy,x0)=>DOCK?jogRows.filter(c=>c.x>=x0&&yy>=c.a&&yy<=c.b).reduce((m,c)=>Math.max(m,c.x),-1):-1;
    for(let r=0;r<nRows;r++){
      const y0=yStart(r),up=side&&r===1,m=Math.min(per,cap-r*per),X=q=>X0+q*pitch;
      const top=y0+(up?2:0),my=top+nN,rS=my+s,rC=side?(up?y0:y0+band-1):(nS?rS+1:rS),rExit=side?(up?y0+1:y0+band-2):-1;
      for(let q=0;q<m;q++){const mm=HAND.put({cls,gx,gy,lx:X(q),ly:my,rec:rk(rc),name:name+'#'+(r*per+q)});if(!mm)throw new Error(name+' machine does not fit');
        const nP=mm.ports.filter(p=>p.f==='N').sort((a,b)=>a.x-b.x),sP=mm.ports.filter(p=>p.f==='S').sort((a,b)=>a.x-b.x),eP=mm.ports.filter(p=>p.f==='E').sort((a,b)=>a.y-b.y);
        for(let i=0;i<Math.min(nN,kr);i++)mm.used.add(nP[nN-1-i].key);for(let i=0;i<Math.min(nS,Math.max(0,kr-nN));i++)mm.used.add(sP[i].key);
        mm.used.add(side?eP[up?0:eP.length-1].key:sP[iO].key)}
      // lane start: raw lanes start at their jog; other lanes at the west edge (after the container when the row is inside a dock group), hopping under jog columns
      const startOf=(idx,yl)=>{const rs=rawStart.get(r+','+idx);if(rs!=null)return{x0:rs};let x0=0;if(usedP.has(yl)){x0=usedP.get(yl)+1;entryBlocked++}return{x0}};
      const withHop=(hop,yl,x0)=>{const mx=crossX(yl,x0);if(mx>=0)hop.set(x0,mx+1)};
      for(let j=0;j<nN;j++){if(j>=kr)continue;const yl=top+j,hop=new Map(),spx=[],st=startOf(j,yl);
        for(let q=0;q<m;q++){const px=X(q)+cN[nN-1-j];spx.push(px);let far=-1;for(let jj=0;jj<j;jj++)far=Math.max(far,X(q)+cN[nN-1-jj]);
          if(q<m-1&&far>=0)hop.set(px+1,far+1);
          if(j<nN-1)for(let yy=yl+1;yy<=my-1;yy++)put1(px,yy,1,BELT)}
        withHop(hop,yl,st.x0);hlane(yl,st.x0,spx,last=>last?['S']:['E','S'],hop)}
      for(let j=0;j<nS;j++){if(nN+j>=kr)continue;const yl=rS+j,hop=new Map(),spx=[],st=startOf(nN+j,yl);
        for(let q=0;q<m;q++){const px=X(q)+cN[j];spx.push(px);let far=px;for(let jj=j+1;jj<nS;jj++)far=Math.max(far,X(q)+cN[jj]);
          if(!side&&j===0)far=Math.max(far,X(q)+cN[iO]);
          if(q<m-1&&far>px)hop.set(px+1,far+1);
          if(j>0)for(let yy=yl-1;yy>=rS;yy--)put1(px,yy,3,BELT);
        }
        withHop(hop,yl,st.x0);hlane(yl,st.x0,spx,last=>last?['N']:['E','N'],hop)}
      if(!side&&nS)for(let q=0;q<m;q++)put1(X(q)+cN[iO],rS,1,BELT);   // output drop of every machine into the collector row
      if(side){const col=q=>X(q)+s,drow=up?my+cE[0]:my+cE[cE.length-1];
        for(let q=0;q<m;q++){const x=col(q);
          if(!up){put1(x,drow,1,BELT);for(let y=drow+1;y<rExit-3;y++)put1(x,y,1,BELT);put1(x,rExit-3,1,UGC);put1(x,rExit,1,UGC);hopSpan('v'+(ox+x),oy+rExit-3,oy+rExit)}
          else{put1(x,drow,3,BELT);let y=drow-1;for(;y>rExit+3;y--)put1(x,y,3,BELT);put1(x,y,3,UGC);put1(x,rExit,3,UGC);hopSpan('v'+(ox+x),oy+rExit,oy+y)}}}
      for(let x=(side?X(0)+s:X(0)+cN[iO]);x<=29;x++)put1(x,rC,0,BELT)}
    info.push({name,cls,recipe:rk(rc),k,pf,raw:rawIn.map((v,i)=>v?inItem(i).replace('ITEM_',''):null).filter(Boolean).join('+'),J,X0,band,rows:nRows,per,cap,undocked,entryBlocked,side})}
  if(!DOCK){CLASSES.forEach(([name,cls,crafter,perOv],bi)=>{let rc=null;for(const x of RECS[crafter])if(!rc||x.i.length>rc.i.length)rc=x;one(bi,0,name,cls,crafter,rc,perOv)})}
  else{let n=0;const list=[];
    CLASSES.forEach(([cn,cls,crafter,perOv])=>{const seen=new Set();by.forEach(l=>{for(const {r,c} of l)if(c===crafter&&r.i.some(([x])=>isRaw(x))&&!seen.has(rk(r))){seen.add(rk(r));list.push([cn,cls,crafter,perOv,r])}})});
    list.forEach(([cn,cls,crafter,perOv,r],i)=>one(2+(i%6)*3,Math.floor(i/6),cn+': '+r.o[0].replace('ITEM_',''),cls,crafter,r,perOv))}
  const R=HAND.result();R.info=info;dockBlk.forEach(b=>R.blocks.push(b));return R;
};
