// Build factory (Step 1): single-recipe, single-raw-input plan -> ghost. Layout is pure.
const PLC_BELT=["DAT_ConveyorBelt","DAT_ConveyorBelt2","DAT_ConveyorBelt3"],PLC_SPL=["DAT_Splitter","DAT_Splitter_2","DAT_Splitter_3"],PLC_BOX="DAT_Container";
const PL_STD=["BPO_Station_01","BPO_Station_2x1","BPO_Station_02"];   // smallest first; floors 14x14, 30x14, 30x30
function placerPlan(){
  const it=$("plnItem").value,rate=+$("plnRate").value||0,pr=plnProto(),sp=$("plnSp").value,bal=$("plnBal").value,mk=+$("plnMk").value;
  if(!it||!(rate>0))return null;
  return{it,rate,mk,sp:sp===""?null:+sp,P:plan(it,rate,mk,{sp:sp===""?null:+sp,bal:bal===""?null:+bal},PLN_PICK,{proto:pr,enr:$("plnEnr").checked})};
}
// mk / spMk: 0-based MKS index (Mk1 = 0). Row of N machines (rot 0); input trunk above (y=-1) with one splitter per machine; output collector below (y=h).
function placerLayout(P,item,mk,spMk){
  const no=why=>({ok:false,why});
  const rn=Object.values(P.nodes).filter(n=>n.rec);
  if(!(rn.length===1&&rn[0].item===item&&P.raw.length===1))return no("Step 1: only single-input single-recipe plans");
  const T=P.nodes[item],N=T.machines,eIn=P.edges.find(e=>e.from===P.raw[0].item&&e.to===item),eOut=P.edges.find(e=>e.to==null);
  if(eIn.belts>1||eOut.belts>1)return no((eIn.belts>1?eIn:eOut).note);
  if(eIn.warn)return no(eIn.warn);
  const cb=plnCb(T.crafter);if(!cb)return no("No machine builds this recipe");
  const d=def(cb.id),pp=cls=>portsOf({cls,x:0,y:0,rot:0,off:[]});
  const mp=pp(d.key),inP=mp.find(p=>p.f==="N"&&p.dir!=="out"),outP=mp.find(p=>p.f==="S"&&p.dir!=="in");
  if(!inP||!outP)return no("Step 1: machine has no N input / S output port");
  const mOff=mp.filter(p=>p!==inP&&p!==outP);
  if(mOff.some(p=>!p.tg))return no("Step 1: machine has an unused port that cannot be disabled");
  const bc=PLC_BELT[mk],sc=PLC_SPL[spMk],sPort=pp(sc).find(p=>p.f==="N");
  if(!sPort)return no("Step 1: splitter ports not found");
  const w=d.w,h=d.h,X0=5,K=N*w,rec=rk(T.rec),it=[];
  for(let i=0;i<N;i++)it.push({cls:d.key,x:X0+i*w,y:0,h:0,rot:0,pid:0,rec,off:mOff.map(p=>p.key)});
  for(let x=X0;x<X0+K;x++){
    if((x-X0)%w===inP.x)it.push({cls:sc,x,y:-1,h:0,rot:0,pid:0,off:[sPort.key]});   // splitter: N side output unused
    else it.push({cls:bc,x,y:-1,h:0,rot:0,pid:0});
  }
  const E=X0+K;
  for(let x=X0;x<=E;x++)it.push({cls:bc,x,y:h,h:0,rot:0,pid:0});
  // containers: ports undirected, not toggleable (REA) -> no off list
  const cp=pp(PLC_BOX),pw=cp.find(p=>p.f==="W"),pe=cp.find(p=>p.f==="E");
  if(!pw||!pe||pw.y!==pe.y)return no("Step 1: container W/E ports not aligned");
  const box=(x,y,ct)=>({cls:PLC_BOX,x,y,h:0,rot:0,pid:0,ct});
  it.push(box(0,-1-pe.y,[{item:P.raw[0].item,n:0,inf:true}]));   // infinite source
  it.push({cls:bc,x:2,y:-1,h:0,rot:0,pid:0});
  it.push(box(3,-1-pe.y,[]));                                    // input buffer
  it.push(box(E+1,h-pw.y,[]));                                   // output buffer
  it.push({cls:bc,x:E+3,y:h,h:0,rot:0,pid:0});
  it.push(box(E+4,h-pw.y,[]));                                   // sink
  const mx=Math.min(...it.map(b=>b.x)),my=Math.min(...it.map(b=>b.y)),items=it.map(b=>({...b,x:b.x-mx,y:b.y-my}));
  return{ok:true,items,w:Math.max(...items.map(b=>b.x+dim(b).w)),h:Math.max(...items.map(b=>b.y+dim(b).h))};
}
// unchecked mode: first anchor inside an existing floor where the factory fits (noBuild with STRICT rules)
function placerFit(items,w,h){
  let tries=0;
  for(const r of areas(layer).floors)
    for(let ax=r.x;ax+w<=r.x+r.w;ax++)for(let ay=r.y;ay+h<=r.y+r.h;ay++){
      if(++tries>3000)return null;   // ponytail: brute scan, ceiling 3000 anchors
      if(!noBuild(items.map((b,i)=>mItem({...b,id:-1-i,x:b.x+ax,y:b.y+ay,h:layer}))))return{x:ax,y:ay};
    }
  return null;
}
// smallest standard station block whose floor holds the factory
function placerBlock(L){
  for(const nm of PL_STD){
    const cls=Object.keys(BASE).find(k=>BASE[k].kind==="b"&&BASE[k].name===nm),f=cls&&floorRect({cls,x:0,y:0,h:0,rot:0});
    if(f&&L.w<=f.w&&L.h<=f.h)return{cls,f};
  }
  return null;
}
function placerPaste(){
  const P=pasting.pl,b={id:uid++,cls:P.cls,x:hover.x,y:hover.y,h:layer,rot:0,pid:0},d=dim(b);
  if(S.blocks.some(o=>{if(isM(o)||o.h!==layer)return false;const e=dim(o);return hitR({x:o.x,y:o.y,w:e.w,h:e.h},{x:b.x,y:b.y,w:d.w,h:d.h})})){toast("Block overlaps another block");return}
  const ms=P.ms.map(m=>({...m,id:uid++,mid:0,pid:0,x:b.x*FC+m.x,y:b.y*FC+m.y,h:layer}));
  S.blocks.push(b);const bad=noBuild(ms.map(mItem));S.blocks.pop();
  if(bad){toast(NOBUILD);return}
  push();S.blocks.push(b);cutBelts(ms.filter(isBelt));S.blocks.push(...ms);sel=new Set();pasting=null;all();
}
function placerGo(){
  const x=placerPlan();
  if(!x){toast("Pick an item and a rate first");return}
  const L=placerLayout(x.P,x.it,x.mk,x.sp??x.mk);
  if(!L.ok){toast(L.why);return}
  if($("plnInc").checked){
    const sb=placerBlock(L);
    if(!sb){toast("Does not fit: larger than the biggest standard block (30x30)");return}
    setView("L");clip=[];active=null;mode=null;sel=new Set();
    pasting={rot:0,fl:false,pl:{cls:sb.cls,ms:L.items}};
    toast("Click to place the block, then connect it to your blocks. Esc cancels");all();
  }else{
    if(view!=="F")setView("F");
    if(!placerFit(L.items,L.w,L.h)){toast("Does not fit: needs "+L.w+"x"+L.h+" floor cells");return}
    clip=L.items.map(b=>({...b}));paste();
  }
  if(!$("pln").classList.contains("col"))$("plnC").click();
}
$("plnBuild").onclick=placerGo;
