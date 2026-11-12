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
