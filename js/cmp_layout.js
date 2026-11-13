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
    const util=exact?n.util:rate/n.pmach-(N-1);
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
    const r=build(item,root.rate,0,null);
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
