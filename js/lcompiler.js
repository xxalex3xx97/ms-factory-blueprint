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
