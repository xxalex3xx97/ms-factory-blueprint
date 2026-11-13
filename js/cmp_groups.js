// CMP GROUPS prototype (flag window.CMP_GROUPS=true or ?groups=1; off = current engine untouched). Brief: .bl-scratch/brief-GROUPS.md, plan: .bl-scratch/composer-groups-plan.html
// Every planner node (unrolled per consumer, cmpPlan) becomes a GROUP of FB blocks stacked in its column: block 1 holds the template maximum (caps), the last block the remainder. No K strips.
// Each group member is a pl node (own FB, IN hub, POOL container); the merge region of a consumer group is ONE column spanning all member rows; lanes producer pool -> consumer port are assigned fill-first
// (consumer member 1 takes from producer member 1 until its demand is met, then the next) and routed by cmpRoute with one lane tag per (producer member, consumer member) pair.
// Hooks in cmpAssembleTree1 (cmp_asm.js, only when pl.g) and cmpCompose1 / cmpCompose (compose.js). No docks in the prototype (dock request = current engine).
if(typeof location!=='undefined'&&/[?&]groups=1/.test(location.search))globalThis.CMP_GROUPS=true;

// pl: unsplit cmpPlan result -> group plan {ok,nodes(members),D,rows,cols,notes,g:{ge,G}} | {ok:false,why}
function cmpPlanG(P,item,mk,spMk,block){
  const pl0=cmpPlan(P,item,mk,{});if(!pl0.ok)return pl0;
  const by0=Object.fromEntries(pl0.nodes.map(o=>[o.id,o]));
  if(pl0.nodes.some(o=>o.raw&&by0[o.parent].inKind==='merge'))return cmpNo('groups prototype: raw supplier of a merge node not built');
  if(pl0.nodes.some(o=>o.inKind==='feed'))return cmpNo('groups prototype: all-raw multi-input node not built');
  const caps={},z0=cmpTreeSize(pl0,mk,spMk,block,caps),crafted=pl0.nodes.filter(o=>!o.raw);
  if(crafted.some(o=>!(caps[o.key]>0)))return z0.ok?cmpErr('no block capacity'):z0;
  const kids=o=>o.children.map(i=>by0[i]).filter(c=>!c.raw),G={};
  const nodes=[],D=Math.max(...crafted.map(o=>o.depth));
  for(const o of crafted){const g=G[o.id]={o,B:Math.ceil(o.N/caps[o.key]),mem:[]},m=caps[o.key];
    for(let b=0;b<g.B;b++){const n=b<g.B-1?m:o.N-m*(g.B-1);
      const q={...o,id:o.id+'.'+b,N:n,rate:o.rate*n/o.N,row:0,children:[],parent:null,main:false,inKind:kids(o).length?'merge':o.inKind,join:b>0,gid:o.id,b,note:''};
      g.mem.push(q);nodes.push(q)}}
  const ge=[];
  for(const o of crafted){const g=G[o.id];
    for(const c of kids(o)){const gc=G[c.id];
      const s=gc.mem.map(q=>q.rate),d=g.mem.map(q=>c.rate*q.N/o.N),f=s.map(()=>d.map(()=>0));
      for(let b=0;b<d.length;b++){let need=d[b];for(let a=0;a<s.length&&need>1e-9;a++){const t=Math.min(s[a],need);f[a][b]=t;s[a]-=t;need-=t}}
      ge.push({c:gc.mem.map(q=>q.id),p:g.mem.map(q=>q.id),f});
      gc.mem.forEach(q=>{q.parent=g.mem[0].id});
      g.mem.forEach(q=>q.children.push(...gc.mem.map(z=>z.id)))}}
  // rows per depth level (rows are free between columns): root members stacked, every deeper member sits at the flow-weighted mean row of the consumers it feeds (so lanes shift by about one block row), levels packed on consecutive rows
  const by=Object.fromEntries(nodes.map(q=>[q.id,q])),want={};
  for(let d=0;d<=D;d++){
    const L=nodes.filter(q=>q.depth===d);
    if(d===0)L.forEach((q,i)=>{q.row=i});
    else{
      L.forEach(q=>{let s=0,w=0;for(const e of ge){const a=e.c.indexOf(q.id);if(a<0)continue;e.p.forEach((id,b)=>{s+=e.f[a][b]*by[id].row;w+=e.f[a][b]})}want[q.id]=w?s/w:0});
      const mean=L.reduce((s,q)=>s+want[q.id],0)/L.length,st=Math.round(mean-(L.length-1)/2);
      L.slice().sort((x,y)=>want[x.id]-want[y.id]||x.b-y.b).forEach((q,i)=>{q.row=st+i});
    }
  }
  // two merge regions of one column must not share block rows (their items would collide): else every subtree gets its own band of rows (top-aligned members, child bands stacked)
  const reg=g=>{const r=g.mem.map(q=>q.row);kids(g.o).forEach(c=>G[c.id].mem.forEach(q=>r.push(q.row)));return[Math.min(...r),Math.max(...r)]};
  const clash=()=>{const m=crafted.filter(o=>kids(o).length);return m.some((p,i)=>m.some((q,j)=>j>i&&p.depth===q.depth&&(a=>a[0][0]<=a[1][1]&&a[1][0]<=a[0][1])([reg(G[p.id]),reg(G[q.id])])))};
  if(clash()){
    const bandOf=o=>{const k=kids(o).map(bandOf);G[o.id].band=Math.max(G[o.id].B,k.reduce((a,b)=>a+b,0));return G[o.id].band};
    const lay=(o,top)=>{G[o.id].mem.forEach((q,b)=>{q.row=top+b});let t=top;for(const c of kids(o)){lay(c,t);t+=G[c.id].band}};
    const root=crafted.find(o=>!o.parent);bandOf(root);lay(root,0);
  }
  const r0=Math.min(...nodes.map(q=>q.row));nodes.forEach(q=>{q.row-=r0;q.col=3*(D-q.depth);q.fb=q.col+1;q.pool=q.col+2});
  const rows=Math.max(...nodes.map(q=>q.row))+1,notes=pl0.notes.filter(n=>!/seed/.test(n));
  return{ok:true,why:null,nodes,D,rows,cols:3*D+3,notes,g:{ge,G}};
}

// lane assignment after the member templates are built. NB[id].inR[j] = port rows of item j. -> {out:{memberId:[rows]},reg:{ownerId:{r:[r0,r1],src:[{row,y,item}],snk:[...]}}} | {why}
function cmpGAssign(pl,NB,H){
  const by=Object.fromEntries(pl.nodes.map(o=>[o.id,o])),out={},reg={};
  pl.nodes.forEach(o=>{out[o.id]=[]});
  for(const e of pl.g.ge){
    const A=e.c.map(i=>by[i]),B=e.p.map(i=>by[i]),j=B[0].rec.i.findIndex(([it])=>it===A[0].key);
    const sr=B.map(b=>NB[b.id].inR[j].slice().sort((x,y)=>x-y)),al=A.map(()=>B.map(()=>0));
    B.forEach((b,bi)=>{   // consumer ports split between producers by flow share (largest remainder)
      const R=sr[bi].length,d=e.f.reduce((s,r)=>s+r[bi],0),q=A.map((a,ai)=>d>0?e.f[ai][bi]/d*R:0),base=q.map(Math.floor);
      let rem=R-base.reduce((x,y)=>x+y,0);const ord=q.map((v,i)=>[v-base[i],i]).sort((x,y)=>y[0]-x[0]);
      for(let k=0;rem>0;k++,rem--)base[ord[k%ord.length][1]]++;
      base.forEach((v,ai)=>{al[ai][bi]=v})});
    A.forEach((a,ai)=>{   // a producer with no lane at all would dead-end: take one port from the biggest allocation of a consumer it supplies
      if(al[ai].some(v=>v>0))return;
      let bb=-1,bv=0,from=-1;B.forEach((b,bi)=>{if(e.f[ai][bi]>0)A.forEach((z,zi)=>{if(al[zi][bi]>bv){bv=al[zi][bi];bb=bi;from=zi}})});
      if(bb>=0&&bv>1){al[from][bb]--;al[ai][bb]++}});
    const ptr=B.map(()=>0),own=by[e.p[0]];
    reg[own.id]=reg[own.id]||{src:[],snk:[]};
    A.forEach((a,ai)=>{
      const tot=al[ai].reduce((x,y)=>x+y,0);if(!tot)return;
      if(tot>H-2)return;
      const used=new Set(),near=y0=>{for(let d=0;d<H;d++)for(const y of[y0-d,y0+d])if(y>=0&&y<=H-1&&!used.has(y)){used.add(y);return y}};   // lane leaves the pool at its sink's own row when free (same-row lanes stay straight), else the nearest free row
      B.forEach((b,bi)=>{
        for(let n=0;n<al[ai][bi];n++){
          const ys=sr[bi][ptr[bi]++],tag=a.id+'>'+b.id,ya=near(ys);
          out[a.id].push(ya);reg[own.id].src.push({row:a.row,y:ya,item:tag});reg[own.id].snk.push({row:b.row,y:ys,item:tag});
        }});
    });
    if(A.some((a,ai)=>al[ai].reduce((x,y)=>x+y,0)>H-2))return{why:'groups: a pool needs more than '+(H-2)+' lanes'};
  }
  for(const id in reg){const r=reg[id],rows=[...r.src,...r.snk].map(q=>q.row);r.r=[Math.min(...rows,by[id].row),Math.max(...rows,by[id].row)];
    const g=pl.g.G[by[id].gid];g.mem.forEach(q=>{r.r[0]=Math.min(r.r[0],q.row);r.r[1]=Math.max(r.r[1],q.row)})}
  for(const id in out)out[id].sort((x,y)=>x-y);
  return{out,reg};
}

// compose branch used by cmpCompose1 when CMP_GROUPS: -> {ok,A,stages,cmpI,note,per} | {ok:false,why}
function cmpGroupsRun(P,item,mk,spMk,BX,bk,block){
  const pl=cmpPlanG(P,item,mk,spMk,block);if(!pl.ok)return pl;
  const tz=cmpTreeSize(pl,mk,spMk,block);if(!tz.ok)return tz;
  const A=cmpAssembleTree({mk,spMk,bx:BX,bk,pl,sz:tz.by,dk:null});if(!A.ok)return A;
  const stages=pl.nodes.map(o=>({item:o.item,cls:o.cls,tpl:tz.by[o.id].tpl,block,S:tz.by[o.id].S,N:o.N,perStrip:[o.N],B:1}));
  return{ok:true,A,stages,cmpI:{K:1,tree:true,groups:true,stages,nodes:A.nodes,routed:A.routed},note:pl.notes.slice(),per:[P.nodes[item].machines]};
}
