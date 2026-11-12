// NL2 nlAssign(lanes[{id,s}],heads[{id,d}],cap): sweep. Lane j adds supply s; takes next heads while cumD+d<=cumS. spill[j]=cumS-cumD after lane j (flows on to lane j+1 by splitter + side belt). Leftover heads (float dust, supply<demand) go to the last lane.
function nlAssign(lanes,heads,cap){
  const of=new Map(),spill=[];let cS=0,cD=0,p=0;
  lanes.forEach((l,j)=>{cS+=l.s;while(p<heads.length&&cD+heads[p].d<=cS+1e-9){of.set(heads[p].id,l.id);cD+=heads[p].d;p++}spill.push(cS-cD)});
  while(p<heads.length&&lanes.length){of.set(heads[p].id,lanes[lanes.length-1].id);cD+=heads[p].d;p++}
  if(lanes.length)spill[lanes.length-1]=cS-cD;
  return{of,spill};
}
// NL3 nlPlan(F,mk): lcPlan structure (rows top-down, lanes, tap tracks pitch 3) fed by nlFlow. Heads are per head id (all columns); assignment = nlAssign per item
// (lanes in creation order = x order, heads by consumer row top-down then cell order); spills = splitter on lane j + side belt on row y into lane j+1, one reserved row pair after the producer row.
// Raw docks: lane supply <= cap/2 (belts = max(F belts, ceil(rate/(cap/2)))) so spill + next lane fits one belt. No refusals except a head without a lane (internal bug).
// Returns {ok,cells,lanes,taps,tracks,routes,spills,dock,ug,sink,w,h,rowStat} or {ok:false,why}.
function nlPlan1(F,mk,hint){
  const no=why=>({ok:false,why}),bw=def(PLC_BOX).w,bh=def(PLC_BOX).h,cap=F.cap;
  const sp=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).filter(p=>p.f==='S').sort((a,b)=>a.x-b.x)[0];
  const nodes=F.nodes,nr=Math.max(...nodes.map(n=>n.row))+1,cells=[],lanes=[],dock=[],spills=[];
  for(const n of nodes){n.cs=[];for(const g of n.cells){
    const c={id:cells.length,item:n.item,node:n,K:g.K,w:g.w,h:g.h,g,heads:g.heads.map((h,i)=>({...h,id:cells.length+':'+i})),out:g.out,row:n.row,ox:0,oy:0,feed:{}};cells.push(c);n.cs.push(c)}}
  let dx=1;
  const dl=[];for(const q of F.raws){const nb=Math.max(q.belts,Math.ceil(q.rate/(cap/2)-1e-9));for(let b=0;b<nb;b++)dl.push({q,nb,b,t:hint?hint.dock.get(q.item+':'+b):undefined,ord:dl.length})}
  if(hint)dl.sort((a,b)=>(a.t===undefined)-(b.t===undefined)||(a.t!==undefined&&a.t-b.t)||a.ord-b.ord);
  let prevItem=null;
  for(const {q,nb,t} of dl){
    if(hint){if(prevItem!==null&&prevItem!==q.item)dx++;prevItem=q.item}
    let bx=t!==undefined?Math.max(dx,Math.round(t-sp.x)):dx;for(let k=0;k<99999;k++,bx++)if(pfFitX(bx,bw)&&pfFitX(bx+sp.x,1,true))break;
    dock.push({item:q.item,x:bx,lx:bx+sp.x});lanes.push({id:lanes.length,item:q.item,raw:true,s:q.rate/nb,x:bx+sp.x,y0:1+bh,y1:null,srcRow:nr,lastRow:nr,cons:[],kind:'through'});dx=bx+bw+1;if(!hint&&lanes.filter(l=>l.item===q.item).length===nb)dx++}
  for(const c of cells)if(c.node.cons.length){c.lane=lanes.length;lanes.push({id:lanes.length,item:c.item,src:c.id,s:c.g.s,x:null,y0:null,y1:null,srcRow:c.row,lastRow:c.row,cons:[],kind:'through'})}
  const byRowDesc=[...nodes].sort((a,b)=>b.row-a.row);
  for(const it of new Set(lanes.map(l=>l.item))){
    const L=lanes.filter(l=>l.item===it),heads=[];
    for(const n of byRowDesc)for(const c of n.cs)for(const h of c.heads)if(h.item===it)heads.push({id:h.id,d:h.d,c,r:c.row});
    if(hint)heads.sort((a,b)=>b.r-a.r||(hint.head.get(a.id)||0)-(hint.head.get(b.id)||0));
    const r=nlAssign(L.map(l=>({id:l.id,s:l.s})),heads.map(h=>({id:h.id,d:h.d})),cap);
    L.forEach((l,j)=>{l.pos=j;l.spill=r.spill[j];if(j+1<L.length&&l.spill>1e-6)l.spillTo=L[j+1].id});
    for(const h of heads){const lid=r.of.get(h.id);if(lid===undefined)return no('head '+h.id+' of '+plnNm(it)+' has no lane');lanes[lid].cons.push({cell:h.c.id,head:h.id});h.c.feed[h.id]=lid}
  }
  for(const l of lanes){l.lastRow=l.cons.length?plcMmin(l.cons,q=>cells[q.cell].row):l.srcRow;
    l.kind=l.cons.length===1&&l.srcRow===l.lastRow+1&&l.spillTo===undefined&&!lanes.some(m=>m.spillTo===l.id)?'jog':'through'}
  const taps=[],tracks=[],routes=[],rowW=[],rowH=[],cellsPerRow=[],tracksPerRow=[],spillsPerRow=[];
  let top=1+bh;
  // Spill rows after producer row r: even chain positions spill on row top+2, odd ones on top+5; first track row is top+2 too (the first belt after a box stays a plain belt, never a UG entrance, which placerCut cannot cut after) (a lane never side-loads into a splitter; 3-row gap so a foreign lane crossing both rows gets two clean UG pairs).
  const addSpills=r=>{
    const S=lanes.filter(l=>l.srcRow===r&&l.spillTo!==undefined);spillsPerRow[r]=S.length;
    if(!S.length)return;
    const iv=S.map(l=>({l,lo:l.x,hi:lanes[l.spillTo].x})).sort((a,b)=>a.lo-b.lo),last=[];
    for(const t of iv){let k=0;while(last[k]!==undefined&&last[k]>=t.lo)k++;last[k]=t.hi;t.k=k}
    for(const t of iv){const l=t.l,y=top+2+3*t.k;spills.push({lane:l.id,to:l.spillTo,y});l.y1=Math.max(l.y1||0,y+1);const u=lanes[l.spillTo];u.y1=Math.max(u.y1||0,y+1)}
    top+=3*Math.max(2,last.length)};
  addSpills(nr);
  for(let r=nr-1;r>=0;r--){
    const rowTop=top,rn=nodes.filter(n=>n.row===r),res=new Set(),act=[];
    for(const l of lanes)if(l.x!==null&&l.srcRow>r&&l.lastRow<r)res.add(l.x);
    for(const l of lanes)if(l.x!==null&&l.srcRow>r&&l.lastRow<=r)act.push(l);
    const bary=n=>{let s=0,k=0;for(const c of n.cs)for(const id of Object.values(c.feed)){const l=lanes[id];if(l.x!==null){s+=l.x;k++}}return k?s/k:0};
    rn.sort((a,b)=>bary(a)-bary(b));
    const pref=c=>{let bh=null;for(const h of c.heads)if(!bh||h.d>bh.d)bh=h;const l=lanes[c.feed[bh.id]];return l.x!==null?l.x-bh.x:null};
    let cl=rn.flatMap(n=>n.cs);
    if(hint){   // interleave nodes by target x; inside one node the id (chain) order is kept by a running max
      const key=new Map();for(const n of rn){let m=-1e9;for(const c of n.cs){const p=pref(c);m=Math.max(m,p===null?1e9:p);key.set(c,m)}}
      cl=cl.map((c,i)=>({c,i})).sort((a,b)=>key.get(a.c)-key.get(b.c)||a.i-b.i).map(q=>q.c)}
    let cur=1;
    for(const c of cl){
      let x=cur;const pf=hint?pref(c):null;if(pf!==null&&pf>x)x=pf;
      for(const h of c.heads){const l=lanes[c.feed[h.id]];if(l.kind==='jog'&&l.x!==null){const p=l.x-h.x;if(p>x)x=p;break}}
      for(let t=0;t<99999;t++){
        let bad=-1;for(let q=x;q<x+c.w;q++)if(res.has(q))bad=q;
        if(bad>=0){x=bad+1;continue}
        if((c.w>28?lcWallOk(c.g,x):pfFitX(x,c.w))&&c.heads.every(q=>pfFitX(x+q.x,1,true)&&!act.some(l=>l.x===x+q.x&&c.feed[q.id]!==l.id))&&pfFitX(x+c.out.x,1,true))break;
        x++}
      c.ox=x;cur=x+c.w+1;
      if(c.lane!==undefined)lanes[c.lane].x=x+c.out.x}
    const iv=[];
    for(const c of cl)for(const q of c.heads){
      const l=lanes[c.feed[q.id]],h=c.ox+q.x;
      if(l.x===h)routes.push({lane:l.id,toCell:c.id,head:q.id,kind:'straight',turns:0,x:h});
      else iv.push({l,c,q,h,lo:Math.min(l.x,h),hi:Math.max(l.x,h)})}
    iv.sort((a,b)=>a.lo-b.lo);const last=[];
    for(const t of iv){let k=0;while(last[k]!==undefined&&last[k]>=t.lo-1)k++;last[k]=t.hi;t.col=k}
    const C=last.length,H=C?3*C+1:2,oy=top+H;
    tracksPerRow[r]=C;
    for(const t of iv){
      const y=top+2+3*t.col,l=t.l;
      if(l.kind==='jog'){tracks.push({kind:'jog',lane:l.id,y,x0:l.x,x1:t.h,hx:t.h,toCell:t.c.id,head:t.q.id});routes.push({lane:l.id,toCell:t.c.id,head:t.q.id,kind:'jog',turns:2,x:t.h});l.y1=oy}
      else{const dir=t.h>l.x?'e':'w';taps.push({lane:l.id,toCell:t.c.id,head:t.q.id,x:l.x,y,dir,hx:t.h});tracks.push({kind:'tap',lane:l.id,y,x0:l.x,x1:t.h,hx:t.h,toCell:t.c.id,head:t.q.id});routes.push({lane:l.id,toCell:t.c.id,head:t.q.id,kind:'tapL',turns:2,x:t.h});l.y1=Math.max(l.y1||0,y)}}
    for(const l of lanes)if(l.y1===null&&l.cons.some(q=>cells[q.cell].row===r))l.y1=oy;
    for(const n of rn)for(const c of n.cs){c.oy=oy;if(c.lane!==undefined)lanes[c.lane].y0=oy+c.h}
    top=oy+plcMmax(rn.flatMap(n=>n.cs),c=>c.h);
    let x0=1e9,x1=-1e9,nc=0;
    for(const n of rn)for(const c of n.cs){nc++;if(c.ox<x0)x0=c.ox;if(c.ox+c.w>x1)x1=c.ox+c.w}
    cellsPerRow[r]=nc;rowW[r]=nc?x1-x0:0;
    addSpills(r);
    rowH[r]=top-rowTop}
  let hh=top+bh,sink=null;const fin=nodes.find(n=>n.row===0);
  if(fin.cs.length>1){   // one collector + container per group of final cells (x order) whose supply fits one belt
    const fs=[...fin.cs].sort((a,b)=>a.ox-b.ox),groups=[];let sum=0;
    for(const c of fs){if(!groups.length||sum+c.g.s>cap+1e-9){groups.push({cells:[],x0:c.ox+c.out.x,x1:0});sum=0}
      const g=groups[groups.length-1];g.cells.push(c.id);g.x1=c.ox+c.out.x;sum+=c.g.s}
    sink={y:top+1,groups};hh=top+3+bh}
  let ug=0;
  for(const t of tracks){const lo=Math.min(t.x0,t.x1),hi=Math.max(t.x0,t.x1);
    for(const l of lanes)if(l.id!==t.lane&&l.x>lo&&l.x<hi&&l.y0!==null&&l.y0<t.y&&l.y1>t.y)ug++;
    for(const u of tracks)if(u!==t&&u.y<t.y&&u.hx>lo&&u.hx<hi&&t.y-u.y<60)ug++}
  for(const s of spills){const a=lanes[s.lane],b=lanes[s.to];for(const l of lanes)if(l.id!==a.id&&l.x>a.x&&l.x<b.x&&l.y0<s.y&&l.y1>s.y)ug++}
  const w=Math.max(plcMmax(cells,c=>c.ox+c.w),plcMmax(dock,d=>d.x+bw))+1;
  return{ok:true,cells:cells.map(c=>({g:c.g,id:c.id,item:c.item,ox:c.ox,oy:c.oy,K:c.K,w:c.w,h:c.h,heads:c.heads,out:c.out,row:c.row,feed:c.feed})),
    lanes:lanes.map(l=>({id:l.id,item:l.item,x:l.x,y0:l.y0,y1:l.y1,kind:l.kind,src:l.src,raw:!!l.raw,s:l.s,spill:l.spill,spillTo:l.spillTo,srcRow:l.srcRow,lastRow:l.lastRow,n:l.cons.length})),
    taps,tracks,routes,spills,dock,ug,sink,w,h:hh,rowStat:{rowW,rowH,cellsPerRow,tracksPerRow,spillsPerRow}};
}
// NL5c multi-pass: pass k docks every raw lane at the mean x of the heads it fed in pass k-1 and orders heads by their previous x; best pass by tap+lane length wins.
function nlPlanScore(p){let s=0;for(const t of p.tracks)s+=Math.abs(t.x1-t.x0);for(const q of p.spills)s+=Math.abs(p.lanes[q.to].x-p.lanes[q.lane].x);for(const l of p.lanes)if(l.y0!==null&&l.y1!==null)s+=Math.abs(l.y1-l.y0);return s}
function nlPlan(F,mk){
  let best=nlPlan1(F,mk,null);if(!best.ok)return best;
  let bs=nlPlanScore(best),cur=best;
  for(let k=0;k<3;k++){
    const hx=new Map(),sum=new Map(),rank=new Map();
    for(const c of cur.cells)for(const h of c.heads)hx.set(h.id,c.ox+h.x);
    for(const c of cur.cells)for(const [hid,lid] of Object.entries(c.feed)){const a=sum.get(lid)||{t:0,n:0};a.t+=hx.get(hid);a.n++;sum.set(lid,a)}
    const dock=new Map();
    const rl=new Map();   // headless lanes take the target of the next lane in the chain (else the previous one), keeping chain order
    for(const l of cur.lanes)if(l.raw){const r=rank.get(l.item)||0;rank.set(l.item,r+1);const a=sum.get(l.id);(rl.get(l.item)||rl.set(l.item,[]).get(l.item)).push(a?a.t/a.n:null)}
    for(const [it,v] of rl){let nx=null;for(let i=v.length-1;i>=0;i--){if(v[i]===null)v[i]=nx;else nx=v[i]}
      let pv=null;for(let i=0;i<v.length;i++){if(v[i]===null)v[i]=pv;else pv=v[i]}
      v.forEach((t,i)=>{if(t!==null)dock.set(it+':'+i,t)})}
    const p=nlPlan1(F,mk,{dock,head:hx});if(!p.ok)break;
    cur=p;const sc=nlPlanScore(p);if(sc<bs){bs=sc;best=p}else if(k>0)break
  }
  return best;
}
