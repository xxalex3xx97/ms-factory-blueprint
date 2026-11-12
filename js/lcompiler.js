// Layout compiler (LC) step 1: pure flow solve, no geometry.
// lcFlow wraps pfFactTree (prefab.js): one node per item, cells = tile sizes per node, raws = raw inputs once each.
let LC_ENGINE=false;
// Split N machines into cells: all identical except at most one remainder. Uses largest divisor K of N in [Kmax/2, Kmax] if any, else Kmax repeated + one remainder.
function lcSplitN(N,Kmax){
  if(!(N>=1)||!(Kmax>=1))return[];
  for(let k=Math.min(Kmax,N);k>=Math.ceil(Kmax/2);k--)if(N%k===0)return Array(N/k).fill(k);
  const q=Math.floor(N/Kmax),r=N-q*Kmax,out=Array(q).fill(Kmax);
  if(r)out.push(r);
  return out;
}
// LC step 2: one station tile (cell) of K machines = pfGrpNode(outDown). Tries size variants, keeps overlap-free <=60x60, picks min belts then min area.
// ins = first-column head x per input item (relative to cell origin); out.x relative; items translated to origin. rec = cls|k|flows signature.
function lcCellGen(cls,k,flows,K,mk){
  const V=[[K]];if(K>1)V.push([Math.ceil(K/2),Math.floor(K/2)]);
  let best=null,why='no variant';
  for(const sizes of V){
    const G=pfGrpNode(cls,k,flows,sizes,mk,0);
    if(G.ok===false){why=G.why;continue}
    const c=pfCheck({items:G.items,w:G.w,h:G.h,ports:[]});
    if(c.ov!==0){why='overlap '+c.ov;continue}
    if(G.w>60||G.h>60){why='size '+G.w+'x'+G.h;continue}
    const nb=G.items.filter(b=>PLC_BELT.includes(b.cls)).length,ar=G.w*G.h;
    if(best&&(nb>best.nb||(nb===best.nb&&ar>=best.w*best.h)))continue;
    const hx=new Map();for(const q of G.ins)if(!hx.has(q.item))hx.set(q.item,q.x);
    best={rec:cls+'|'+k+'|'+flows.map(f=>f.item).join(','),K,mk,w:G.w,h:G.h,ins:[...hx].map(([item,x])=>({item,x})),out:{x:G.out.x},nb,items:G.items,sizes};
  }
  return best||{ok:false,why};
}
// LC step 3: cell lookup from offline library LC_CELLS (js/lc_cells.js, built by tools/lc_gen.mjs). Missing key -> lcCellGen fallback (needs cls,k,flows).
// Returns {w,h,ins,out,nb,items} with items shifted by (ox,oy), item objects in original form.
function lcCell(rec,K,mk,ox,oy,cls,k,flows){
  const e=typeof LC_CELLS!=='undefined'&&LC_CELLS[rec+'|'+K+'|'+mk];
  let c;
  if(e)c={w:e.w,h:e.h,ins:e.ins,out:e.out,nb:e.nb,items:e.items.map(a=>Object.assign({cls:a[0],x:a[1],y:a[2],rot:a[3]},a[4]&&JSON.parse(JSON.stringify(a[4]))))};
  else{
    c=lcCellGen(cls,k,flows,K,mk);
    if(c.ok===false)return c;
  }
  return{w:c.w,h:c.h,ins:c.ins.map(q=>({item:q.item,x:q.x})),out:{x:c.out.x},nb:c.nb,items:c.items.map(b=>Object.assign({},b,{x:b.x+ox,y:b.y+oy}))};
}
// Flow solve for one item at machine tier mk. Returns {ok,nodes,raws} or {ok:false,why}.
function lcFlow(P,item,mk){
  const Z=pfFactTree(P,item,mk);
  if(Z.ok===false)return{ok:false,why:Z.why};
  const nodes=Z.nodes.map(n=>({item:n.item,row:n.row,N:n.N,cls:n.cls,k:n.k,flows:n.flows,rate:n.rate,cons:n.cons,ins:n.ins,rec:n.rec,cells:lcSplitN(n.N,n.tileM)}));
  const cap=MKS[mk][1],raw=new Map();
  for(const n of nodes)for(const i of n.ins){
    if(i.crafted)continue;
    const rate=P.edges.filter(e=>e.from===i.item&&e.to===n.item).reduce((a,e)=>a+e.flow,0);
    raw.set(i.item,(raw.get(i.item)||0)+rate);
  }
  const raws=[...raw].map(([it,rate])=>({item:it,rate,belts:Math.ceil(rate/cap-1e-9)}));
  return{ok:true,nodes,raws};
}
// LC step 4: adapters. Rot: 0=east, 1=south, 2=west. All return item arrays. Belt ends at y1-1 (the consumer sits at row y1).
// lcJog(x0,y0,x1,ty,y1,mk): belt from (x0,y0) south to row ty, run to x1, south to y1-1. x0==x1 -> straight south (ty unused). Returns {items,end:{x:x1,y:y1}}.
function lcJog(x0,y0,x1,ty,y1,mk){
  const bc=PLC_BELT[mk],items=[],B=(x,y,rot)=>items.push({cls:bc,x,y,rot});
  if(x0===x1){for(let y=y0;y<y1;y++)B(x0,y,1)}
  else{
    const r=x1>x0?0:2,d=r?-1:1;
    for(let y=y0;y<ty;y++)B(x0,y,1);
    for(let x=x0;x!==x1;x+=d)B(x,ty,r);
    for(let y=ty;y<y1;y++)B(x1,y,1);
  }
  return{items,end:{x:x1,y:y1}};
}
// lcUnder(x,y0,y1,ty,mk): straight south lane x rows y0..y1-1 passing under a horizontal belt on row ty (UG pair at ty-1,ty+1, cell ty skipped).
function lcUnder(x,y0,y1,ty,mk){
  const items=[];
  for(let y=y0;y<y1;y++){if(y===ty)continue;items.push({cls:y===ty-1||y===ty+1?PLC_UG[mk]:PLC_BELT[mk],x,y,rot:1})}
  return{items};
}
// lcTap(x,y,dir,hx,yf,ys,mk,spMk): rot-1 splitter at (x,y) on a south lane (input from north). Front (x) continues south to yf-1; side output goes dir 'e'|'w' to column hx then south to ys-1. Returns {items,front:{x,y:yf},side:{x:hx,y:ys}}.
function lcTap(x,y,dir,hx,yf,ys,mk,spMk){
  const bc=PLC_BELT[mk],sc=PLC_SPL[spMk],r=dir==='e'?0:2,d=r?-1:1,items=[];
  items.push({cls:sc,x,y,rot:1,off:pfSplOff(sc,1,['S',dir==='e'?'E':'W'])});
  for(let yy=y+1;yy<yf;yy++)items.push({cls:bc,x,y:yy,rot:1});
  for(let xx=x+d;xx!==hx;xx+=d)items.push({cls:bc,x:xx,y,rot:r});
  items.push({cls:bc,x:hx,y,rot:1});
  for(let yy=y+1;yy<ys;yy++)items.push({cls:bc,x:hx,y:yy,rot:1});
  return{items,front:{x,y:yf},side:{x:hx,y:ys}};
}
// lcMerge(x,y0,y1,sx,sy,mk): main lane x south rows y0..y1-1; a second belt on row sy runs from column sx (sx!=x) horizontally into the lane's side at (x,sy), y0<=sy<y1. Returns {items,main:{x,y:y1},side:{x:sx,y:sy}} (feed the side belt start from (sx,sy)).
function lcMerge(x,y0,y1,sx,sy,mk){
  const bc=PLC_BELT[mk],r=sx<x?0:2,d=r?1:-1,items=[];
  for(let y=y0;y<y1;y++)items.push({cls:bc,x,y,rot:1});
  for(let xx=sx;xx!==x;xx+=sx<x?1:-1)items.push({cls:bc,x:xx,y:sy,rot:r});
  return{items,main:{x,y:y1},side:{x:sx,y:sy}};
}
// lcSink(x0,y,x1,mk): collector row on row y from x0 to x1 (either direction), turns south at x1 into ONE container below (y+1). Returns {items (belts, container last),end:{x:x1,y:y+1}}.
function lcSink(x0,y,x1,mk){
  const bc=PLC_BELT[mk],r=x1>x0?0:2,items=[];
  for(let x=x0;x!==x1;x+=x1>x0?1:-1)items.push({cls:bc,x,y,rot:r});
  items.push({cls:bc,x:x1,y,rot:1});
  const pN=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).find(p=>p.f==='N');
  items.push({cls:PLC_BOX,x:x1-pN.x,y:y+1-pN.y,rot:0,ct:[]});
  return{items,end:{x:x1,y:y+1}};
}
// LC step 5: lcPlan(F,mk) pure geometry from lcFlow output. Rows top-down (producers above), dock row y=1, one out lane per producer cell at its out port x.
// Link = jog/straight (single consumer in row below) or through-lane + taps (lane column reserved in lower rows). Channel above a row = interval-colored tracks, pitch 3.
// Returns {ok,cells,lanes,taps,tracks,routes,dock,ug,sink,w,h} or {ok:false,why}. ponytail: even split of consumer heads over lanes, ignores wall rows (cut='col').
function lcPlan(F,mk){
  const no=why=>({ok:false,why}),bw=def(PLC_BOX).w,bh=def(PLC_BOX).h;
  const sp=portsOf({cls:PLC_BOX,x:0,y:0,rot:0,off:[]}).filter(p=>p.f==='S').sort((a,b)=>a.x-b.x)[0];
  const nodes=F.nodes,nr=Math.max(...nodes.map(n=>n.row))+1,byItem=new Map(nodes.map(n=>[n.item,n]));
  const cells=[],geo=new Map();
  for(const n of nodes){n.cs=[];const q=[...n.cells];for(let i=0;i<q.length;i++){
    const K=q[i],key=n.rec+'|'+K;let g=geo.get(key);
    if(!g){g=lcCell(n.rec,K,mk,0,0,n.cls,n.k,n.flows);geo.set(key,g)}
    if(g.ok===false){if(K<2)return no('cell '+plnNm(n.item)+' x'+K+': '+g.why);q.splice(i,1,Math.ceil(K/2),Math.floor(K/2));i--;continue}   // cell too big (>60): split in two
    const c={id:cells.length,item:n.item,node:n,K,w:g.w,h:g.h,ins:g.ins,out:g.out,row:n.row,ox:0,oy:0};cells.push(c);n.cs.push(c)}}
  // dock: one container per raw belt, grouped per item
  const dock=[],lanes=[];let dx=1;
  for(const q of F.raws){for(let b=0;b<q.belts;b++){
    let bx=dx;for(let t=0;t<9999;t++,bx++)if(pfFitX(bx,bw)&&pfFitX(bx+sp.x,1,true))break;
    dock.push({item:q.item,x:bx,lx:bx+sp.x});lanes.push({id:lanes.length,item:q.item,raw:true,x:bx+sp.x,y0:1+bh,y1:null,srcRow:nr,lastRow:nr,cons:[],kind:'through'});dx=bx+bw+1}
    dx++}
  for(const c of cells)if(c.node.cons.length){c.lane=lanes.length;lanes.push({id:lanes.length,item:c.item,src:c.id,x:null,y0:null,y1:null,srcRow:c.row,lastRow:c.row,cons:[],kind:'through'})}
  // assign consumer heads to lanes (even split by cumulative demand)
  for(const it of new Set(lanes.map(l=>l.item))){
    const L=lanes.filter(l=>l.item===it),heads=[];
    for(const n of nodes){const i=n.ins.find(q=>q.item===it);if(!i)continue;
      const fl=i.crafted?(byItem.get(it).cons.find(q=>q.to===n.item)||{flow:1}).flow:((n.flows.find(f=>f.item===it)||{flow:1}).flow);
      for(const c of n.cs)heads.push({c,d:fl*c.K/n.N})}
    const tot=heads.reduce((a,h)=>a+h.d,0);let cum=0;
    for(const h of heads){const l=L[Math.min(L.length-1,Math.floor((cum+h.d/2)/tot*L.length))];cum+=h.d;
      l.cons.push({cell:h.c.id,item:it});h.c.feed=h.c.feed||{};h.c.feed[it]=l.id}
  }
  for(const l of lanes){l.lastRow=l.cons.length?plcMmin(l.cons,q=>cells[q.cell].row):l.srcRow;
    l.kind=l.cons.length===1&&l.srcRow===l.lastRow+1?'jog':'through'}
  // rows top-down
  const taps=[],tracks=[],routes=[];
  let top=1+bh;
  for(let r=nr-1;r>=0;r--){
    const rn=nodes.filter(n=>n.row===r),res=new Set();
    for(const l of lanes)if(l.x!==null&&l.srcRow>r&&l.lastRow<r)res.add(l.x);
    const bary=n=>{let s=0,k=0;for(const c of n.cs)for(const it of Object.keys(c.feed||{})){const l=lanes[c.feed[it]];if(l.x!==null){s+=l.x;k++}}return k?s/k:0};
    rn.sort((a,b)=>bary(a)-bary(b));
    let cur=1;
    for(const n of rn)for(const c of n.cs){
      let x=cur;
      for(const it of Object.keys(c.feed||{})){const l=lanes[c.feed[it]];if(l.kind==='jog'&&l.x!==null){const p=l.x-c.ins.find(q=>q.item===it).x;if(p>x)x=p;break}}
      for(let t=0;t<99999;t++){
        let bad=-1;for(let q=x;q<x+c.w;q++)if(res.has(q))bad=q;
        if(bad>=0){x=bad+1;continue}
        if((c.w>28||pfFitX(x,c.w))&&c.ins.every(q=>pfFitX(x+q.x,1,true))&&pfFitX(x+c.out.x,1,true))break;
        x++}
      c.ox=x;cur=x+c.w+1;
      if(c.lane!==undefined)lanes[c.lane].x=x+c.out.x}
    const iv=[];
    for(const n of rn)for(const c of n.cs)for(const q of c.ins){
      const l=lanes[c.feed&&c.feed[q.item]];if(!l)continue;const h=c.ox+q.x;
      if(l.x===h)routes.push({lane:l.id,toCell:c.id,kind:'straight',turns:0,x:h});
      else iv.push({l,c,h,lo:Math.min(l.x,h),hi:Math.max(l.x,h)})}
    iv.sort((a,b)=>a.lo-b.lo);const last=[];
    for(const t of iv){let k=0;while(last[k]!==undefined&&last[k]>=t.lo-1)k++;last[k]=t.hi;t.col=k}
    const C=last.length,H=C?3*C:2,oy=top+H;
    for(const t of iv){
      const y=top+1+3*t.col,l=t.l;
      if(l.kind==='jog'){tracks.push({kind:'jog',lane:l.id,y,x0:l.x,x1:t.h,hx:t.h,toCell:t.c.id});routes.push({lane:l.id,toCell:t.c.id,kind:'jog',turns:2,x:t.h});l.y1=oy}
      else{const dir=t.h>l.x?'e':'w';taps.push({lane:l.id,toCell:t.c.id,x:l.x,y,dir,hx:t.h});tracks.push({kind:'tap',lane:l.id,y,x0:l.x,x1:t.h,hx:t.h,toCell:t.c.id});routes.push({lane:l.id,toCell:t.c.id,kind:'tapL',turns:2,x:t.h});l.y1=Math.max(l.y1||0,y)}}
    for(const l of lanes)if(l.y1===null&&l.cons.some(q=>cells[q.cell].row===r))l.y1=oy;
    for(const n of rn)for(const c of n.cs){c.oy=oy;if(c.lane!==undefined)lanes[c.lane].y0=oy+c.h}
    top=oy+plcMmax(rn.flatMap(n=>n.cs),c=>c.h);
  }
  let hh=top+bh,sink=null;const fin=nodes.find(n=>n.row===0);
  if(fin.cs.length>1){const xs=fin.cs.map(c=>c.ox+c.out.x);sink={y:top+1,x0:plcMmin(xs,x=>x),x1:plcMmax(xs,x=>x)};hh=top+3+bh}
  // UG crossings: tracks vs lanes active at the track row, and vs descents of upper tracks
  let ug=0;
  for(const t of tracks){const lo=Math.min(t.x0,t.x1),hi=Math.max(t.x0,t.x1);
    for(const l of lanes)if(l.id!==t.lane&&l.x>lo&&l.x<hi&&l.y0!==null&&l.y0<t.y&&l.y1>t.y)ug++;
    for(const u of tracks)if(u!==t&&u.y<t.y&&u.hx>lo&&u.hx<hi&&t.y-u.y<60)ug++}
  const w=Math.max(plcMmax(cells,c=>c.ox+c.w),plcMmax(dock,d=>d.x+bw))+1;
  return{ok:true,cells:cells.map(c=>({id:c.id,item:c.item,ox:c.ox,oy:c.oy,K:c.K,w:c.w,h:c.h,ins:c.ins,out:c.out,row:c.row})),lanes:lanes.map(l=>({id:l.id,item:l.item,x:l.x,y0:l.y0,y1:l.y1,kind:l.kind,raw:!!l.raw,srcRow:l.srcRow,lastRow:l.lastRow,n:l.cons.length})),taps,tracks,routes,dock,ug,sink,w,h:hh};
}
