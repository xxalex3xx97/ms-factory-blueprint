// Exosuit factory, TIDY MODULAR version (uses hand.js HAND + exosuit_spec.js). exoBuild(opts) -> {ok,blocks,ms,fails,modules,...}
// STANDARD MODULE (block-local cells of a 30x30 floor; the outer 4 cells of every block are the street):
//   west   x=5      RAW source containers (infinite), slot s at y=5+5*s          -> stand-ins for docks
//   middle x=12..20 MACHINES stacked top to bottom (as many blocks, stacked, as the machines need)
//   east   x=22     OUTPUT hub (one container per product; growth recycling hubs hold the seed) at y=12  -> the module's EXIT
// ENTRANCE = the machine's own WEST and NORTH ports (inputs always enter there), OUTPUT always leaves the machine's EAST ports into the hub.
// Flow is always WEST -> EAST: a module sits in column = its depth (longest path from raw); producers are always left of consumers.
// Belts between modules go from the producer's output hub straight to each consumer machine's input port, along the block-edge streets
// (cells in the outer 4-cell frame are cheap, the interior is expensive), so they hug block borders in parallel. No relay containers: a consumer
// that waits on one input cannot hoard the others (a container holds 16,000 items).
window.exoBuild=function(opts){
  opts=opts||{};HAND.reset();
  const TW=HAND.TW,SP={};EXO_SPEC.forEach(s=>SP[s.item.replace('ITEM_','')]=s);
  const names=Object.keys(SP),short=i=>i.replace('ITEM_','');
  const RAW_X=5,RAW_Y0=5,RAW_PITCH=5,OUT_X=22,OUT_YS=[12,18,6],MX=12,MY0=5,GAP=3,INNER=22,HUBMAX=13;
  const size=cls=>{const d=dim({cls,rot:0});return[d.w,d.h]};
  const capOf=cls=>Math.max(1,Math.floor((INNER+GAP)/(size(cls)[1]+GAP)));
  // ---- depth = column
  const depth={};const dep=p=>{if(depth[p]!=null)return depth[p];depth[p]=0;let d=0;for(const i of SP[p].ins){const q=short(i);if(q===p||!SP[q])continue;d=Math.max(d,dep(q)+1)}return depth[p]=d};
  names.forEach(dep);
  const maxD=Math.max(...names.map(p=>depth[p]));
  const FAM=['Nutrients','Xenobacteria','Xenoeukarya','Xenoarchaea','Enzyme','AlphaProtein','BetaProtein','Biolattice','ChitinComposite','TitaniumPlates','NickelPlates','CobaltPlates','IridiumPlates','SiliconWafers','Graphene','ReinforcedGlass','EnrichedTitaniumOre','EnrichedNickelOre','EnrichedCobaltOre','Coolant'];
  const M={};
  // ---- one module per product; columns by depth, rows ordered by the mean row of the producers (fewer crossings)
  const MAXR=opts.maxRows||12;let gx=0;   // a depth column taller than MAXR blocks wraps into side-by-side sub-columns (same depth = no belts between them, flow stays west -> east)
  for(let c=0;c<=maxD;c++){
    const col=names.filter(p=>depth[p]===c);
    const key=p=>{const rows=SP[p].ins.map(short).filter(q=>SP[q]&&q!==p&&M[q]).map(q=>M[q].gy0+M[q].blocks/2);return rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:(FAM.includes(p)?FAM.indexOf(p):50)};
    col.sort((a,b)=>key(a)-key(b));
    let gy=0;
    for(const p of col){const s=SP[p],cap=capOf(s.cls),blocks=Math.ceil(s.n/cap);if(gy>0&&gy+blocks>MAXR){gx++;gy=0}M[p]={p,s,col:gx,gy0:gy,blocks,cap,mach:[],raw:{},hubs:[]};gy+=blocks}
    gx++;
  }
  // ---- consumers per producer (machine level): every consumer machine gets its own belt from the producer's output hub
  const eusers={};   // producer -> [{c,flow}]
  for(const c of names){const s=SP[c];s.ins.forEach((i,ix)=>{const q=short(i);if(q===c||!SP[q])return;(eusers[q]=eusers[q]||[]).push({c,belts:s.n,flow:s.rate/(s.outn||1)*(s.qty[ix]||1)})})}
  // ---- build every module from the standard template
  for(const p of names){
    const m=M[p],s=m.s,[w,h]=size(s.cls);
    for(let b=0;b<m.blocks;b++)HAND.block(m.col,m.gy0+b);
    for(let i=0;i<s.n;i++){const b=Math.floor(i/m.cap),slot=i%m.cap;
      const mm=HAND.put({cls:s.cls,rec:s.rec,gx:m.col,gy:m.gy0+b,lx:MX,ly:MY0+slot*(h+GAP),name:p+'#'+i});if(!mm)throw new Error('machine '+p+'#'+i+' does not fit');m.mach.push(mm)}
    let slot=0;
    for(const i of s.ins){const q=short(i);if(q===p||SP[q])continue;   // raw inputs only
      const rc=HAND.put({cls:'DAT_Container_2',gx:m.col,gy:m.gy0,lx:RAW_X,ly:RAW_Y0+RAW_PITCH*slot,name:'raw '+q+' > '+p,ct:[{item:i,n:0,inf:true}]});
      if(!rc)throw new Error('raw container '+q+' of '+p+' does not fit');m.raw[q]=rc;slot++}
    if(slot>4)throw new Error(p+' has more than 4 raw inputs');
    // output hub(s): one is the standard; a second only when one hub would run out of its 16 ports (Nutrients: 13 consumer belts + 5 machines)
    const ext=(eusers[p]||[]).reduce((a,u)=>a+u.belts,0),self=s.ins.includes(s.item),nh=Math.max(1,Math.ceil((ext+s.n*(self?2:1))/HUBMAX));   // second hub only when one would run out of its 16 ports; a recycling module's machines each feed back from THEIR OWN hub, consumers are spread over hubs by supply
    for(let j=0;j<nh;j++){const hb=HAND.put({cls:'DAT_Container_2',gx:m.col,gy:m.gy0,lx:OUT_X,ly:OUT_YS[j],name:'out '+p+(nh>1?' '+(j+1)+'/'+nh:''),ct:self?[{item:s.item,n:300,inf:false}]:[]});
      if(!hb)throw new Error('output hub of '+p+' does not fit');m.hubs.push(hb)}
  }
  // ---- links. inside modules first (plain routing)
  const cfn=(x,y)=>{const gx=Math.floor(x/TW),gy=Math.floor(y/TW),lx=x-gx*TW,ly=y-gy*TW;return(lx<4||lx>25||ly<4||ly>25)?0:(opts.interior||8)};
  const IN=['W','N'];
  const jobs=[];
  for(const p of names){const m=M[p],s=m.s,self=s.ins.includes(s.item),nh=m.hubs.length;
    m.mach.forEach((mm,i)=>jobs.push({a:mm,b:m.hubs[i%nh],l:p+' machine > out hub',opt:{pa:['E'],pb:['W','S']}}));   // hub: machine outputs come in on the west/south faces, belts leave from east/north
  }
  for(const p of names){const m=M[p],s=m.s,self=s.ins.includes(s.item),nh=m.hubs.length;
    if(self)m.mach.forEach((mm,i)=>jobs.push({a:m.hubs[i%nh],b:mm,l:p+' seed > machine',opt:{pa:['E','N'],pb:IN}}));
    for(const q in m.raw)m.mach.forEach(mm=>jobs.push({a:m.raw[q],b:mm,l:'raw '+q+' > '+p,opt:{pb:IN}}))}
  // ---- between modules: producer hub -> every consumer machine (consumer module -> hub chosen so no hub exceeds its ports)
  const ext=[];
  for(const q of names){const users=(eusers[q]||[]).slice().sort((a,b)=>b.flow-a.flow),nh=M[q].hubs.length,
      room=M[q].hubs.map((_,j)=>M[q].mach.filter((_,i)=>i%nh===j).length*(SP[q].pm||1));   // supply of each hub = its machines x per-machine rate; each consumer goes to the hub with the most room left
    const per=[];users.forEach(u=>M[u.c].mach.forEach((cm,i)=>per.push({u,cm,i,fl:u.flow/u.belts})));
    per.sort((a,b)=>b.fl-a.fl);   // each consumer MACHINE takes its belt from the hub with the most supply left
    for(const e of per){let j=0;for(let k=1;k<room.length;k++)if(room[k]>room[j])j=k;room[j]-=e.fl;
      ext.push({a:M[q].hubs[j],b:e.cm,l:q+' > '+e.u.c+'#'+e.i,opt:{pa:['E','N'],pb:IN,cfn}})}}
  let ok=0;const all=[...jobs,...ext];
  const fell=[];
  for(const j of all){let n=HAND.link(j.a,j.b,j.l,j.opt);
    if(!n&&j.opt&&(j.opt.pb||j.opt.pa)){HAND.S.fails.pop();n=HAND.link(j.a,j.b,j.l,{...j.opt,pa:null,pb:null});if(n)fell.push(j.l)}   // preferred faces crowded: any free port
    if(!n){HAND.S.fails.pop();const mx=HAND.maxStates;HAND.maxStates=4000000;n=HAND.link(j.a,j.b,j.l,null);HAND.maxStates=mx;if(n)fell.push(j.l+' (any route)')}   // last resort: no street preference, any ports, bigger search
    if(n)ok++}
  const T=HAND.result();
  T.links=all.length;T.linksOk=ok;T.cols=gx;T.fell=fell;
  T.modules=names.map(p=>({p,col:M[p].col,gy0:M[p].gy0,blocks:M[p].blocks,n:M[p].s.n,raw:Object.keys(M[p].raw),hubs:M[p].hubs.length}));
  return T;
};

