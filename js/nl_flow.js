// No Limits (NL) engine, separate from LC. Flag off by default; enabled by Engine select "No Limits".
let NL_ENGINE=false;
// NL1 nlFlow: wraps pfFactTree. Per node: cells = nlSplitN(N,K), K = largest with cell<=60x60 (lcCellGen ok) and K*fo<=cap/2 and every head demand<=cap/2.
// Each cell lists ALL heads (item,x,d,col) from pfGrpNode(sizes), not one per item (LC two-column bug). Raws summed per item, belts=ceil(rate/cap).
// Returns {ok,cap,nodes:[{item,row,N,cls,k,flows,fo,rate,cons,ins,rec,K,cells:[{K,s,w,h,sizes,out,nb,heads:[{item,x,d,col}]}],over}],raws:[{item,rate,belts}]} or {ok:false,why}.
// floor(N/K) identical cells of size K plus ONE remainder cell (N mod K) if >0
function nlSplitN(N,K){const q=Math.floor(N/K),r=N-q*K,o=Array(q).fill(K);if(r)o.push(r);return o}
function nlCellInfo(n,K,mk,inRate){
  const c=lcCellGen(n.cls,n.k,n.flows,K,mk);
  if(c.ok===false)return c;
  const G=pfGrpNode(n.cls,n.k,n.flows,c.sizes,mk,0);
  if(G.ok===false)return G;
  const heads=G.ins.map(q=>{let col=0;G.cx.forEach((x,i)=>{if(x<=q.x)col=i});return{item:q.item,x:q.x,col}});
  for(const q of heads){   // demand: the cell's item rate (per machine * K) split over that item's heads by column machine count
    q.d=inRate.get(q.item)*c.sizes[q.col]/heads.filter(h=>h.item===q.item&&h.col===q.col).length;
  }
  return{K,s:K*n.fo,w:c.w,h:c.h,sizes:c.sizes,out:{x:c.out.x},nb:c.nb,heads,items:c.items};
}
function nlFlow(P,item,mk){
  const Z=pfFactTree(P,item,mk);
  if(Z.ok===false)return{ok:false,why:Z.why};
  const cap=MKS[mk][1],half=cap/2+1e-9,raw=new Map(),seed=new Map(),nodes=[];
  for(const n of Z.nodes){
    // per-machine input rate per item (edges from the producer, summed)
    const inRate=new Map();
    for(const i of n.ins)inRate.set(i.item,P.edges.filter(e=>e.from===i.item&&e.to===n.item).reduce((a,e)=>a+e.flow,0)/n.N);
    {const sf=n.flows.find(f=>f.item===n.item);if(sf)inRate.set(n.item,sf.flow)}   // growth seed: per-machine flow from the recipe (no self edge in the plan)
    let mx=n.fo;for(const v of inRate.values())mx=Math.max(mx,v);
    const kb=Math.max(1,Math.min(n.tileM,Math.floor(half/mx)));
    // largest K<=kb whose cell builds (<=60x60); feasibility is monotone enough for a binary search
    let lo=1,hi=kb,best=null;
    const first=nlCellInfo(n,1,mk,inRate);
    if(first.ok===false)return{ok:false,why:plnNm(n.item)+': '+first.why};
    best=1;
    while(lo<hi){const m=Math.ceil((lo+hi)/2);if(nlCellInfo(n,m,mk,inRate).ok!==false){lo=m;best=m}else hi=m-1}
    best=lo;
    const cells=nlSplitN(n.N,best),memo=new Map();
    const cinfo=cells.map(K=>{if(!memo.has(K))memo.set(K,nlCellInfo(n,K,mk,inRate));return memo.get(K)});
    const bad=cinfo.find(c=>c.ok===false);
    if(bad)return{ok:false,why:plnNm(n.item)+': '+bad.why};
    const over=cinfo.some(c=>c.s>half||c.heads.some(h=>h.d>half));
    nodes.push({item:n.item,row:n.row,N:n.N,cls:n.cls,k:n.k,flows:n.flows,fo:n.fo,rate:n.rate,cons:n.cons,ins:n.ins,rec:n.rec,K:best,cells:cinfo,over});
    for(const i of n.ins){if(i.item===n.item)seed.set(i.item,(seed.get(i.item)||0)+inRate.get(i.item)*n.N);else if(!i.crafted)raw.set(i.item,(raw.get(i.item)||0)+inRate.get(i.item)*n.N)}
  }
  const raws=[...raw].map(([it,rate])=>({item:it,rate,belts:Math.ceil(rate/cap-1e-9)})).concat([...seed].map(([it,rate])=>({item:it,rate,belts:Math.ceil(rate/cap-1e-9),seed:true})));
  return{ok:true,cap,nodes,raws};
}
