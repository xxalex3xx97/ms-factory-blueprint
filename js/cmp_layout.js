// CMP S6 (geometry-free): cmpPlan(P,item,mk,opts) unrolls the planner DAG into a tree, depth, block columns and row bands.
// Spec: vault main-sequence/tasks/2026-11-13-composer-trees.md sections 1,2,4. No item coordinates here.
// Needs compose.js loaded first (cmpNo, cmpName) and planner globals (plan output P, plnCb, def, rk). mk is accepted for the signature only.
// Columns: IN=3*(D-depth), FB=IN+1, POOL=IN+2; root POOL is the OZ. Raw input = supplier node (own depth, POOL column = parent IN-1).
// Rows: main child in parent row; other children are side bands stacked beyond the main extent (root: alternate/greedy; non-root: far side = same dir as parent).
function cmpPlan(P,item,mk,opts){
  const E=Array.isArray(P.edges)?P.edges:Object.values(P.edges||{});
  const edgeOf=(f,t)=>E.find(e=>e.from===f&&e.to===t);
  const isRaw=it=>!(P.nodes[it]&&P.nodes[it].crafter);
  const refuse=w=>{throw {cmpWhy:w}};
  const nodes=[];
  // build copy of item fed at output rate `rate`; each consumer edge makes its own copy (unroll)
  function build(it,rate,d,parent){
    const id='n'+nodes.length;
    if(isRaw(it)){
      const o={id,item:cmpName(it),key:it,raw:true,rec:null,cls:null,k:0,N:0,util:0,pm:0,pN:0,pU:0,rate,depth:d,col:null,row:null,main:false,inKind:'src',growth:false,children:[],parent:parent?parent.id:null,note:'',sub:0};
      nodes.push(o);return o;
    }
    const n=P.nodes[it];
    if(!n.crafter||!n.rec||!plnCb(n.crafter))refuse('No machine builds this recipe');
    if(/Armoury/i.test(n.crafter))refuse('Armoury');
    const exact=Math.abs(rate-n.rate)<1e-9;   // single original copy: planner N and util kept exactly
    const N=exact?n.machines:Math.ceil(rate/n.pmach-1e-9);
    const util=exact?n.util:rate/n.pmach/N;   // planner convention: average utilisation over the N machines
    const o={id,item:cmpName(it),key:it,raw:false,rec:n.rec,cls:def(plnCb(n.crafter).id).key,k:n.rec.i.length,N,util,pm:n.pmach,pN:n.machines,pU:n.util,rate,depth:d,col:null,row:null,main:false,inKind:null,growth:n.rec.i.some(([q])=>q===it),children:[],parent:parent?parent.id:null,note:'',sub:0};
    nodes.push(o);
    for(const [q] of n.rec.i){
      if(q===it)continue;   // growth self-input = primed seed container, not a child
      const e=edgeOf(q,it);
      if(!e)refuse('planner edge missing '+cmpName(q)+' -> '+cmpName(it));
      o.children.push(build(q,e.flow*rate/n.rate,d+1,o));
    }
    o.inKind=o.children.some(c=>!c.raw)?'merge':(o.k===1?'src':'feed');
    o.sub=o.N+o.children.reduce((a,c)=>a+c.sub,0);
    o.children.sort((a,b)=>b.sub-a.sub||b.rate-a.rate);   // subtree machines desc, then flow desc (stable otherwise)
    if(o.children.length)o.children[0].main=true;
    return o;
  }
  // rows beyond the node row used by its subtree (direction-free)
  const ext=v=>{if(!v.children.length||v.inKind==='feed')return 0;let x=ext(v.children[0]);for(const c of v.children.slice(1))x+=1+ext(c);return x};
  // place v at row R, all its side bands go in direction s
  function place(v,R,s){
    v.row=R;if(!v.children.length)return;
    if(v.inKind==='feed'){v.children.forEach(c=>{c.row=R});return}
    const [m,...sides]=v.children;
    place(m,R,s);
    let x=ext(m);
    for(const c of sides){place(c,R+s*(x+1),s);x+=1+ext(c)}
  }
  try{
    const root=P.nodes[item];
    if(!root||isRaw(item))refuse('No machine builds this recipe');
    const r=build(item,opts&&opts.rate!=null?opts.rate:root.rate,0,null);   // opts.rate: S12 replicated strip (root rate share)
    const D=Math.max(...nodes.map(o=>o.depth));
    // rows: root main down, root sides alternate / greedy balance (largest first); non-root sides far side
    const [m,...sides]=r.children;
    if(m){
      place(m,0,1);
      let up=0,down=ext(m);
      for(const c of sides.slice().sort((a,b)=>ext(b)-ext(a))){
        if(up<=down){place(c,-(up+1),-1);up+=1+ext(c)}
        else{place(c,down+1,1);down+=1+ext(c)}
      }
    }
    r.row=0;
    const minR=Math.min(...nodes.map(o=>o.row));
    nodes.forEach(o=>{o.row-=minR});
    // columns from depth
    nodes.forEach(o=>{o.col=3*(D-o.depth);o.fb=o.col+1;o.pool=o.col+2});
    // shared product: copies of one planner item summed; note when built != planner N
    const copies={},built={};
    nodes.forEach(o=>{if(!o.raw){copies[o.key]=(copies[o.key]||0)+1;built[o.key]=(built[o.key]||0)+o.N}});
    nodes.forEach(o=>{
      if(!o.raw&&copies[o.key]>1&&built[o.key]!==o.pN)o.note='Planner N='+o.pN+', built '+built[o.key]+' (shared product built twice)';
      if(o.growth)o.note=(o.note?o.note+'; ':'')+'Fill the seed container';
    });
    const rows=Math.max(...nodes.map(o=>o.row))+1;
    const notes=[...new Set(nodes.map(o=>o.note).filter(Boolean))];
    return{ok:true,why:null,nodes:nodes.map(o=>({id:o.id,item:o.item,key:o.key,raw:o.raw,rec:o.rec,cls:o.cls,k:o.k,N:o.N,util:o.util,pm:o.pm,pN:o.pN,pU:o.pU,rate:o.rate,depth:o.depth,col:o.col,fb:o.fb,pool:o.pool,row:o.row,main:o.main,inKind:o.inKind,growth:o.growth,children:o.children.map(c=>c.id),parent:o.parent,note:o.note})),D,rows,cols:3*D+3,notes};
  }catch(e){if(e&&e.cmpWhy!==undefined)return cmpNo(e.cmpWhy);throw e}
}
// CMP S12: cmpPlanK(P,item,mk,K,caps) = K replicated tree strips stacked in rows, each a full tree at a share of the root rate; each strip has its own OZ. Candidate splits: cmpSplit (per-key machine sums equal the
// one-strip plan N when possible), equal rate shares, whole root machines; fewest machines wins (ties: first). Notes list planner N vs built. caps[key] = machines one block holds. -> cmpPlan-shaped result with .K, or {ok:false}.
function cmpPlanK(P,item,mk,K,caps){
  const n=P.nodes[item],eq=n.rate/n.pmach,ex=n.machines-eq,R=[];
  const sp=cmpSplit(P,item,mk,K,caps);if(sp)R.push(sp.map(x=>x/eq*n.rate));
  R.push(Array.from({length:K},()=>n.rate/K));
  R.push(Array.from({length:K},(_,j)=>(Math.floor(n.machines/K)+(j<n.machines%K?1:0)-(j===K-1?ex:0))/eq*n.rate));
  let best=null,bt=0,err=null;
  for(const r of R){const q=cmpPlanK1(P,item,mk,K,r);if(!q.ok){err=err||q;continue}const t=q.nodes.reduce((s,o)=>s+o.N,0);if(!best||t<bt){best=q;bt=t}}
  return best||err;
}
// root loads x_j (machine-equivalents, sum = rate/pm) per strip: tries strip loads at the breakpoints where some node needs a whole number of machines, DFS minimising built-over-plan machines then fractional machines
function cmpSplit(P,item,mk,K,caps){
  const pl=cmpPlan(P,item,mk,{});if(!pl.ok)return null;
  const ns=pl.nodes.filter(o=>!o.raw),root=ns.find(o=>!o.parent),R=root.rate/root.pm,c=ns.map(o=>o.rate/o.pm/R),keys=[...new Set(ns.map(o=>o.key))];
  const ki=ns.map(o=>keys.indexOf(o.key)),tgt=keys.map(k=>ns.reduce((s,o)=>s+(o.key===k?o.N:0),0)),cap=ns.map(o=>caps&&caps[o.key]||1e9);
  const nd=(i,x)=>Math.ceil(c[i]*x-1e-9),fr=(i,x)=>Math.abs(c[i]*x-Math.round(c[i]*x))>1e-7?1:0;
  const ok=x=>x>1e-9&&ns.every((o,i)=>nd(i,x)<=cap[i]);
  const cm=new Map();
  ns.forEach((o,i)=>{for(let t=1;t<=Math.min(o.N,cap[i]);t++){const x=t/c[i];if(x<R-1e-9&&ok(x))cm.set(Math.round(x*1e6),x)}});
  const cand=[...cm.values()].sort((a,b)=>b-a);
  let best=null,bc=1e9,cnt=0;
  const rec=(j,xs,rem,built,f)=>{
    if(cnt++>3e5)return;
    if(j===K-1){
      if(!ok(rem))return;
      const b=built.slice();let ff=f;ns.forEach((o,i)=>{b[ki[i]]+=nd(i,rem);ff+=fr(i,rem)});
      const cost=1000*b.reduce((s,v,k)=>s+v-tgt[k],0)+ff;if(cost<bc){bc=cost;best=[...xs,rem]}return;
    }
    const lb=built.slice();ns.forEach((o,i)=>{lb[ki[i]]+=nd(i,rem)});
    // all strips so far + at least the remaining load as one lump (a lower bound on machines)
    if(1000*lb.reduce((s,v,k)=>s+v-tgt[k],0)+f>=bc)return;
    for(const x of cand){
      if(x>(j?xs[j-1]:1e9)+1e-9||x>=rem-1e-9)continue;
      const b=built.slice();let ff=f;ns.forEach((o,i)=>{b[ki[i]]+=nd(i,x);ff+=fr(i,x)});
      rec(j+1,[...xs,x],rem-x,b,ff);
      if(bc<1000)return;
    }
  };
  rec(0,[],R,new Array(keys.length).fill(0),0);
  return bc<1000?best:null;   // only an exact split is worth the search; otherwise the plain shares below
}
function cmpPlanK1(P,item,mk,K,rates){
  const out=[];let row=0,D=0,cols=0;
  for(let j=0;j<K;j++){
    const rate=rates[j];
    if(!(rate>0))return cmpNo('root '+cmpName(item)+' cannot be split into '+K+' strips');
    const pl=cmpPlan(P,item,mk,{rate});if(!pl.ok)return pl;
    D=pl.D;cols=pl.cols;
    pl.nodes.forEach(o=>out.push({...o,id:'s'+j+o.id,children:o.children.map(c=>'s'+j+c),parent:o.parent&&'s'+j+o.parent,row:o.row+row,note:''}));
    row+=pl.rows;
  }
  const built={},notes=[];out.forEach(o=>{if(!o.raw)built[o.key]=(built[o.key]||0)+o.N});
  out.forEach(o=>{if(o.raw)return;const a='Planner N='+o.pN+', built '+built[o.key]+' ('+o.item+', '+K+' strips)',g='Fill the seed container ('+o.item+')';
    if(built[o.key]!==o.pN&&!notes.includes(a))notes.push(a);if(o.growth&&!notes.includes(g))notes.push(g)});
  return{ok:true,why:null,nodes:out,D,rows:row,cols,notes,K};
}
