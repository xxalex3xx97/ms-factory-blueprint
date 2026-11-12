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
