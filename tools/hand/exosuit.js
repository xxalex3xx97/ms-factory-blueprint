// Exosuit factory, BUS-BLOCK modular version (uses hand.js HAND + exosuit_spec.js). exoBuild(opts) -> {ok,blocks,ms,fails,modules,lanes,bus,...}
// MODULE COLUMNS alternate with BUS GAPS (columns of bus blocks). A BAND of block rows on top carries the long trunks.
// A module block (30x30) holds only: raw containers (x=5), machines (x=12..), output hub (x=22). Foreign belts never cross it.
//   IN doors  = west edge  (lx=0..3, rows INROWS)   -> router joins each to the machine's W/N port
//   OUT doors = east edge  (lx=26..29, rows OUTROWS) <- router joins each from the hub's E/N port
// One link = one lane: producer hub -> out door -> (vertical lane in the producer's bus gap [-> trunk in the band -> vertical lane in the consumer's gap]) -> in door -> consumer machine.
// Lane cells are reserved before routing, so belts hop (underground) over foreign lanes instead of wandering. Each lane is labelled (T.lanes -> window.EXO_LANES).
window.exoBuild=function(opts){
  opts=opts||{};HAND.reset();
  const TW=HAND.TW,SP={};EXO_SPEC.forEach(s=>SP[s.item.replace('ITEM_','')]=s);
  const names=Object.keys(SP),short=i=>i.replace('ITEM_','');
  const RAW_X=5,RAW_Y0=5,RAW_PITCH=5,OUT_X=22,OUT_YS=[12,18,6],MX=12,MY0=5,GAP=3,INNER=22,HUBMAX=11;
  const STR=TW,LANEX=[2,3,4,5,6,7,8,11,12,13,14,15,16,17,20,21,22,23,24,25,26],NL=LANEX.length,OUTROWS=[2,3,4,5,6,7,8],INROWS=[11,12,13,14,15,16,17,20,21,22,23,24,25,26],OFFCOR=opts.offcor||30;
  const size=cls=>{const d=dim({cls,rot:0});return[d.w,d.h]};
  const capOf=cls=>Math.max(1,Math.floor((INNER+GAP)/(size(cls)[1]+GAP)));
  // ---- depth = column
  const depth={};const dep=p=>{if(depth[p]!=null)return depth[p];depth[p]=0;let d=0;for(const i of SP[p].ins){const q=short(i);if(q===p||!SP[q])continue;d=Math.max(d,dep(q)+1)}return depth[p]=d};
  names.forEach(dep);
  const maxD=Math.max(...names.map(p=>depth[p]));
  const FAM=['Nutrients','Xenobacteria','Xenoeukarya','Xenoarchaea','Enzyme','AlphaProtein','BetaProtein','Biolattice','ChitinComposite','TitaniumPlates','NickelPlates','CobaltPlates','IridiumPlates','SiliconWafers','Graphene','ReinforcedGlass','EnrichedTitaniumOre','EnrichedNickelOre','EnrichedCobaltOre','Coolant'];
  // ---- consumers per producer (machine level)
  const eusers={};
  for(const c of names){const s=SP[c];s.ins.forEach((i,ix)=>{const q=short(i);if(q===c||!SP[q])return;(eusers[q]=eusers[q]||[]).push({c,belts:s.n,flow:s.rate/(s.outn||1)*(s.qty[ix]||1)})})}
  const nin={},outLinks={};
  for(const p of names){nin[p]=SP[p].ins.map(short).filter(q=>SP[q]&&q!==p).length;outLinks[p]=(eusers[p]||[]).reduce((a,u)=>a+u.belts,0)}
  // ---- one module per product; module columns by depth (a column taller than MAXR blocks wraps into sub-columns)
  const M={};const MAXR=opts.maxRows||12;let ncol=0;
  for(let c=0;c<=maxD;c++){
    const col=names.filter(p=>depth[p]===c);
    const key=p=>{const rows=SP[p].ins.map(short).filter(q=>SP[q]&&q!==p&&M[q]).map(q=>M[q].gy0+M[q].blocks/2);return rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:(FAM.includes(p)?FAM.indexOf(p):50)};
    col.sort((a,b)=>key(a)-key(b));
    let gy=0;
    for(const p of col){const s=SP[p],cap=Math.min(capOf(s.cls),Math.floor(INROWS.length/Math.max(1,nin[p]))),blocks=Math.max(Math.ceil(s.n/cap),Math.ceil(outLinks[p]/OUTROWS.length),1);if(gy>0&&gy+blocks>MAXR){ncol++;gy=0}M[p]={p,s,col:ncol,gy0:gy,blocks,cap,mach:[],raw:{},hubs:[]};gy+=blocks}
    ncol++;
  }
  const H=Math.max(...names.map(p=>M[p].gy0+M[p].blocks));
  // ---- hubs per module, then every consumer machine takes its belt from the hub with the most supply room left
  for(const p of names){const m=M[p],s=m.s,self=s.ins.includes(s.item);m.nh=Math.max(1,Math.ceil((outLinks[p]+s.n*(self?2:1))/HUBMAX))}
  const links=[],outN={},inN={};
  for(const q of names){const users=(eusers[q]||[]).slice().sort((a,b)=>b.flow-a.flow),nh=M[q].nh,
      room=Array.from({length:nh},(_,j)=>Array.from({length:SP[q].n},(_,i)=>i).filter(i=>i%nh===j).length*(SP[q].pm||1));
    const per=[];users.forEach(u=>{for(let i=0;i<SP[u.c].n;i++)per.push({u,i,fl:u.flow/u.belts})});
    per.sort((a,b)=>b.fl-a.fl);
    for(const e of per){let j=0;for(let k=1;k<room.length;k++)if(room[k]>room[j])j=k;room[j]-=e.fl;
      const c=e.u.c,o0=outN[q]=(outN[q]||0),ib=Math.floor(e.i/M[c].cap),ik=c+'#'+ib,n=inN[ik]=(inN[ik]||0)+1;outN[q]++;
      if(n>INROWS.length)throw new Error('too many inputs in one block of '+c);
      links.push({q,c,i:e.i,hubj:j,ob:Math.floor(o0/OUTROWS.length),orow:OUTROWS[o0%OUTROWS.length],ib,irow:INROWS[n-1],label:q+' > '+c+'#'+e.i,ca:M[q].col,cb:M[c].col})}}
  // ---- bus geometry
  const E=links.filter(L=>L.cb-L.ca>=2).sort((a,b)=>(b.cb-b.ca)-(a.cb-a.ca));
  E.forEach((L,t)=>{L.yt=Math.floor(t/NL)*STR+LANEX[t%NL]});
  const T0=Math.ceil(E.length/NL),R0=T0;
  const G=Array.from({length:Math.max(0,ncol-1)},()=>[]);
  links.forEach(L=>{if(L.cb-L.ca>=2){G[L.ca].push({L,r:'s'});G[L.cb-1].push({L,r:'e'})}else G[L.ca].push({L,r:'d'})});
  const busW=G.map(g=>Math.ceil(g.length/NL)),colGx=[0],busGx=[];
  for(let k=0;k<ncol-1;k++){busGx[k]=colGx[k]+1;colGx[k+1]=busGx[k]+busW[k]}
  const lastGx=colGx[ncol-1];
  for(const L of links){const q=M[L.q],c=M[L.c];
    L.yo=(R0+q.gy0+L.ob)*STR+L.orow;L.yi=(R0+c.gy0+L.ib)*STR+L.irow;L.xP=colGx[L.ca]*STR;L.xC=colGx[L.cb]*STR}
  G.forEach((g,k)=>{
    const key=a=>a.r==='d'?(a.L.yo+a.L.yi)/2:a.r==='s'?(a.L.yo+a.L.yt)/2:(a.L.yt+a.L.yi)/2;
    g.sort((a,b)=>key(a)-key(b));
    g.forEach((a,i)=>{const x=(busGx[k]+Math.floor(i/NL))*STR+LANEX[i%NL];if(a.r==='e')a.L.x2=x;else a.L.x1=x})});
  // ---- blocks: band on top, bus gaps full height
  for(let gx=0;gx<=lastGx;gx++)for(let gy=0;gy<R0;gy++)HAND.block(gx,gy);
  for(let k=0;k<ncol-1;k++)for(let w=0;w<busW[k];w++)for(let gy=0;gy<R0+H;gy++)HAND.block(busGx[k]+w,gy);
  const modGx=new Set();
  // ---- build every module from the standard template
  for(const p of names){
    const m=M[p],s=m.s,h=size(s.cls)[1],gx=colGx[m.col];modGx.add(gx);
    for(let b=0;b<m.blocks;b++)HAND.block(gx,R0+m.gy0+b);
    for(let i=0;i<s.n;i++){const b=Math.floor(i/m.cap),slot=i%m.cap;
      const mm=HAND.put({cls:s.cls,rec:s.rec,gx,gy:R0+m.gy0+b,lx:MX,ly:MY0+slot*(h+GAP),name:p+'#'+i});if(!mm)throw new Error('machine '+p+'#'+i+' does not fit');m.mach.push(mm)}
    let slot=0;
    for(const i of s.ins){const q=short(i);if(q===p||SP[q])continue;
      const rc=HAND.put({cls:'DAT_Container_2',gx,gy:R0+m.gy0,lx:RAW_X,ly:RAW_Y0+RAW_PITCH*slot,name:'raw '+q+' > '+p,ct:[{item:i,n:0,inf:true}]});
      if(!rc)throw new Error('raw container '+q+' of '+p+' does not fit');m.raw[q]=rc;slot++}
    if(slot>4)throw new Error(p+' has more than 4 raw inputs');
    const self=s.ins.includes(s.item);
    for(let j=0;j<m.nh;j++){const hb=HAND.put({cls:'DAT_Container_2',gx,gy:R0+m.gy0,lx:OUT_X,ly:OUT_YS[j],name:'out '+p+(m.nh>1?' '+(j+1)+'/'+m.nh:''),ct:self?[{item:s.item,n:300,inf:false}]:[]});
      if(!hb)throw new Error('output hub of '+p+' does not fit');m.hubs.push(hb)}
  }
  // ---- reserve every lane corridor before any belt is routed (door lead + vertical lane + trunk): foreign belts hop over them
  const seg=(a,b,c,d)=>{const o=[];if(a===c){for(let y=Math.min(b,d);y<=Math.max(b,d);y++)o.push([a,y])}else{for(let x=Math.min(a,c);x<=Math.max(a,c);x++)o.push([x,b])}return o};
  for(const L of links){
    const pts=L.cb-L.ca>=2?[[L.xP+26,L.yo],[L.x1,L.yo],[L.x1,L.yt],[L.x2,L.yt],[L.x2,L.yi],[L.xC+3,L.yi]]:[[L.xP+26,L.yo],[L.x1,L.yo],[L.x1,L.yi],[L.xC+3,L.yi]];
    let cells=[];for(let i=0;i<pts.length-1;i++)cells=cells.concat(seg(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]));
    HAND.reserve(cells,L.label);L.cor=new Set(cells.map(([x,y])=>x+','+y))}
  // ---- links: inside modules first (plain routing), then the bus links
  const cfnOld=(x,y)=>{const lx=x-Math.floor(x/TW)*TW,ly=y-Math.floor(y/TW)*TW;return(lx<4||lx>25||ly<4||ly>25)?0:(opts.interior||8)};
  const IN=['W','N'];
  const jobs=[];
  for(const p of names){const m=M[p],nh=m.hubs.length;
    m.mach.forEach((mm,i)=>jobs.push({a:mm,b:m.hubs[i%nh],l:p+' machine > out hub',opt:{pa:['E'],pb:['W','S'],cfn:cfnOld}}));
  }
  for(const p of names){const m=M[p],self=m.s.ins.includes(m.s.item),nh=m.hubs.length;
    if(self)m.mach.forEach((mm,i)=>jobs.push({a:m.hubs[i%nh],b:mm,l:p+' seed > machine',opt:{pa:['E','N'],pb:IN,cfn:cfnOld}}));
    for(const q in m.raw)m.mach.forEach(mm=>jobs.push({a:m.raw[q],b:mm,l:'raw '+q+' > '+p,opt:{pb:IN,cfn:cfnOld}}))}
  const modBlock=(x,y)=>modGx.has(Math.floor(x/TW))&&Math.floor(y/TW)>=R0;
  const ext=links.map(L=>({a:M[L.q].hubs[L.hubj],b:M[L.c].mach[L.i],l:L.label,opt:{own:L.label,pa:['E','N'],pb:IN,cfn:(x,y)=>L.cor.has(x+','+y)?0:(modBlock(x,y)?cfnOld(x,y):OFFCOR)}}));
  let ok=0;const all=[...jobs,...ext];
  const fell=[];
  for(const j of all){let n=HAND.link(j.a,j.b,j.l,j.opt);
    if(!n&&j.opt&&(j.opt.pb||j.opt.pa)){HAND.S.fails.pop();n=HAND.link(j.a,j.b,j.l,{...j.opt,pa:null,pb:null});if(n)fell.push(j.l)}   // preferred faces crowded: any free port
    if(!n){HAND.S.fails.pop();const mx=HAND.maxStates;HAND.maxStates=4000000;n=HAND.link(j.a,j.b,j.l,{own:j.opt&&j.opt.own,cfn:j.opt&&j.opt.cfn});HAND.maxStates=mx;if(n)fell.push(j.l+' (any route)')}   // last resort: any ports, bigger search
    if(n)ok++}
  const R=HAND.result();
  R.links=all.length;R.linksOk=ok;R.cols=ncol;R.fell=fell;
  // lane labels (item name on every vertical lane and trunk)
  const lanes=[],mid=(a,b)=>Math.round((a+b)/2);
  for(const L of links){const t=L.q;
    if(L.cb-L.ca>=2)lanes.push({t,x:L.x1,y:mid(L.yo,L.yt)},{t,x:mid(L.x1,L.x2),y:L.yt},{t,x:L.x2,y:mid(L.yt,L.yi)});
    else lanes.push(L.yo===L.yi?{t,x:mid(L.x1,L.xP+26),y:L.yo}:{t,x:L.x1,y:mid(L.yo,L.yi)})}
  R.lanes=lanes;window.EXO_LANES=lanes;R.bus={T:T0,R0,busW,colGx,busGx};
  R.modules=names.map(p=>({p,col:M[p].col,gy0:M[p].gy0,blocks:M[p].blocks,n:M[p].s.n,raw:Object.keys(M[p].raw),hubs:M[p].hubs.length}));
  return R;
};
