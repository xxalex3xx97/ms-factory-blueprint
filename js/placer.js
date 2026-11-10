// Build factory (Step 1): single-recipe, single-raw-input plan -> ghost. Layout is pure.
const PLC_BELT=["DAT_ConveyorBelt","DAT_ConveyorBelt2","DAT_ConveyorBelt3"],PLC_SPL=["DAT_Splitter","DAT_Splitter_2","DAT_Splitter_3"],PLC_BOX="DAT_Container";
const PL_STD=["BPO_Station_01","BPO_Station_2x1","BPO_Station_02"];   // smallest first; floors 14x14, 30x14, 30x30
function placerPlan(){
  const it=$("plnItem").value,rate=+$("plnRate").value||0,pr=plnProto(),sp=$("plnSp").value,bal=$("plnBal").value,mk=+$("plnMk").value;
  if(!it||!(rate>0))return null;
  return{it,rate,mk,sp:sp===""?null:+sp,P:plan(it,rate,mk,{sp:sp===""?null:+sp,bal:bal===""?null:+bal},PLN_PICK,{proto:pr,enr:$("plnEnr").checked})};
}
// mk / spMk: 0-based MKS index (Mk1 = 0). o={box:container class, mod:bool}. Lanes: nL stacked copies of one row (machines rot 0, trunk y=-1 above, collector y=h below).
function placerLayout(P,item,mk,spMk,o={}){
  const BX=o.box||PLC_BOX,no=why=>({ok:false,why});
  const rn=Object.values(P.nodes).filter(n=>n.rec);
  if(!(rn.length===1&&rn[0].item===item&&P.raw.length===1&&rn[0].rec.i.length===1))return no("Step 1: only single-input single-recipe plans");
  const T=P.nodes[item],N=T.machines,eIn=P.edges.find(e=>e.from===P.raw[0].item&&e.to===item),eOut=P.edges.find(e=>e.to==null);
  const cb=plnCb(T.crafter);if(!cb)return no("No machine builds this recipe");
  const d=def(cb.id),pp=cls=>portsOf({cls,x:0,y:0,rot:0,off:[]});
  const mp=pp(d.key),inP=mp.find(p=>p.f==="N"&&p.dir!=="out"),outP=mp.find(p=>p.f==="S"&&p.dir!=="in");
  if(!inP||!outP)return no("Step 1: machine has no N input / S output port");
  const mOff=mp.filter(p=>p!==inP&&p!==outP);
  if(mOff.some(p=>!p.tg))return no("Step 1: machine has an unused port that cannot be disabled");
  const bc=PLC_BELT[mk],sc=PLC_SPL[spMk],sPort=pp(sc).find(p=>p.f==="N");
  if(!sPort)return no("Step 1: splitter ports not found");
  const cap=i=>MKS[i][1],inF=T.pmach*eIn.flow/eOut.flow,m=Math.floor(cap(mk)/Math.max(T.pmach,inF)+1e-9);
  if(m<1)return no("One machine needs "+plnR2(Math.max(T.pmach,inF))+"/min but a "+MKS[mk][0]+" belt carries "+cap(mk)+"/min: pick a higher belt Mk");
  const nL=Math.ceil(N/m),nmax=Math.ceil(N/nL),cnt=[];
  for(let k=0;k<nL;k++)cnt.push(Math.floor(N/nL)+(k<N%nL?1:0));
  if(cap(spMk)<nmax*inF-1e-9)return no("Splitter "+MKS[spMk][0]+" is too slow for a lane ("+plnR2(nmax*inF)+"/min): set the splitter Mk higher");
  const cp=pp(BX),pw=cp.find(p=>p.f==="W"),pe=cp.find(p=>p.f==="E");
  if(!pw||!pe||pw.y!==pe.y)return no("Step 1: container W/E ports not aligned");
  const bw=def(BX).w,w=d.w,h=d.h,X0=2*bw+1,EM=X0+nmax*w,XC=EM+1+bw,rec=rk(T.rec);
  const bt=(x,y,r=0)=>({cls:bc,x,y,h:0,rot:r,pid:0});
  const box=(x,y,ct)=>({cls:BX,x,y,h:0,rot:0,pid:0,ct});
  const lane=n=>{
    const it=[];
    for(let i=0;i<n;i++)it.push({cls:d.key,x:X0+i*w,y:0,h:0,rot:0,pid:0,rec,off:mOff.map(p=>p.key)});
    for(let x=X0;x<X0+n*w;x++){
      if((x-X0)%w===inP.x)it.push({cls:sc,x,y:-1,h:0,rot:0,pid:0,off:[sPort.key]});
      else it.push(bt(x,-1));
    }
    for(let x=X0;x<=EM;x++)it.push(bt(x,h));
    if(o.mod)for(let x=0;x<=bw;x++)it.push(bt(x,-1));
    else{it.push(box(0,-1-pe.y,[{item:P.raw[0].item,n:0,inf:true}]));it.push(bt(bw,-1))}
    it.push(box(bw+1,-1-pe.y,[]));
    it.push(box(EM+1,h-pw.y,[]));
    if(o.mod){for(let y=h;y>=0;y--)it.push(bt(XC,y,3));it.push(bt(XC,-1),bt(XC+1,-1))}
    else{it.push(bt(XC,h));it.push(box(XC+1,h-pw.y,[]))}
    return it;
  };
  const a=lane(nmax),y0=Math.min(...a.map(b=>b.y)),pitch=Math.max(...a.map(b=>b.y+dim(b).h))-y0+1;
  const it=[];cnt.forEach((n,k)=>lane(n).forEach(b=>it.push({...b,y:b.y+k*pitch})));
  const mx=Math.min(...it.map(b=>b.x)),my=Math.min(...it.map(b=>b.y)),items=it.map(b=>({...b,x:b.x-mx,y:b.y-my}));
  const nt=["Makes "+plnR2(N*T.pmach)+"/min (target "+plnR2(T.rate)+")"];
  if(nL>1)nt.push(nL+" parallel lanes ("+cnt.join("+")+" machines), each with its own "+(o.mod?"in/out edge":"source and sink container")+", because one "+MKS[mk][0]+" belt carries "+cap(mk)+"/min");
  if(mk===2||spMk===2)nt.push("Mk3 belt/splitter ids are not verified");
  return{ok:true,items,lanes:nL,per:cnt,makes:N*T.pmach,note:nt,mod:!!o.mod,box:BX,w:Math.max(...items.map(b=>b.x+dim(b).w)),h:Math.max(...items.map(b=>b.y+dim(b).h))};
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
// smallest standard station block whose floor holds the factory (ok[i] = block type i ticked)
function placerBlock(L,ok=[true,true,true]){
  for(const [i,nm] of PL_STD.entries()){if(!ok[i])continue;
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
let plcL=null;
const placerBk=()=>["plnBk11","plnBk21","plnBk22"].map(i=>$(i).checked);
function placerGo(){
  const x=placerPlan();
  if(!x){toast("Pick an item and a rate first");return}
  const L=placerLayout(x.P,x.it,x.mk,x.sp??x.mk,{box:$("plnBuf").value,mod:$("plnMod").checked});
  if(!L.ok){toast(L.why);return}
  plcL=L;placerPreview(L);
}
let plcV={z:1,ox:0,oy:0},plcRaf=0;
const plcBlk=()=>{const L=plcL,sb=placerBlock(L,[true,true,true])||{cls:Object.keys(BASE).find(k=>BASE[k].kind==="b"&&BASE[k].name==="BPO_Station_02")};return{cls:sb.cls,f:floorRect({cls:sb.cls,x:0,y:0,h:0,rot:0})}};
function placerSize(){const c=$("plnPrevMap"),r=$("plnPrevView").getBoundingClientRect();c.width=Math.max(1,Math.round(r.width));c.height=Math.max(1,Math.round(r.height));return{w:c.width,h:c.height}}
function placerFitView(){const {w,h}=placerSize(),L=plcL,f=plcBlk().f,s=Math.min((w-24)/L.w,(h-24)/L.h);plcV.z=Math.min(60,Math.max(.01,s/CELLS.F));const k=CELLS.F*plcV.z;plcV.ox=(w-L.w*k)/2-f.x*k;plcV.oy=(h-L.h*k)/2-f.y*k;placerShot()}
function placerShot(){
  const L=plcL;if(!L||!$("plnPrev").open)return;
  const {w,h}=placerSize(),b=plcBlk(),f=b.f,
    sv={S:S.blocks,view,layer,V,W,H,dpr,sel,active,pasting,drag,ugPend,mode,SM,OV,hoverIn,cw:cv.width,ch:cv.height};
  try{
    S.blocks=[{id:1,cls:b.cls,x:0,y:0,h:0,rot:0,pid:0},...L.items.map((it,i)=>({...it,id:i+2,x:it.x+f.x,y:it.y+f.y,h:0}))];
    view="F";layer=0;V={ox:plcV.ox,oy:plcV.oy,z:plcV.z};W=w;H=h;dpr=1;sel=new Set();active=null;pasting=null;drag=null;ugPend=null;mode=null;SM=false;OV={};hoverIn=false;SV++;
    cv.width=w;cv.height=h;
    paint();
    const g=$("plnPrevMap").getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(cv,0,0);
  }finally{
    S.blocks=sv.S;view=sv.view;layer=sv.layer;V=sv.V;W=sv.W;H=sv.H;dpr=sv.dpr;sel=sv.sel;active=sv.active;pasting=sv.pasting;drag=sv.drag;ugPend=sv.ugPend;mode=sv.mode;SM=sv.SM;OV=sv.OV;hoverIn=sv.hoverIn;SV++;
    cv.width=sv.cw;cv.height=sv.ch;paint();
  }
}
function placerPreview(L){
  const k={mach:0,belt:0,spl:0,box:0},kd=b=>b.rec?"mach":PLC_BELT.includes(b.cls)?"belt":PLC_SPL.includes(b.cls)?"spl":"box";
  L.items.forEach(b=>k[kd(b)]++);
  const ok=placerBk(),sb=ok.some(Boolean)?placerBlock(L,ok):null;
  $("pvMach").textContent=k.mach;$("pvBelt").textContent=k.belt;$("pvSpl").textContent=k.spl;$("pvBox").textContent=k.box;
  $("pvBlk").textContent=ok.some(Boolean)?(sb?"1 x "+BASE[sb.cls].name:"none fits"):"0 (existing floor)";
  $("pvCell").textContent=L.w+" x "+L.h;
  $("pvIO").textContent=L.mod?"IN west, OUT east (same row"+(L.lanes>1?" per lane":"")+"); copy width "+L.w:"closed: source container in, sink container out";
  $("plnPrevNote").textContent=L.note.join(". ");
  $("plnPrevErr").textContent="";const dl=$("plnPrev");if(!dl.open)dl.showModal();placerFitView();
}
function placerPlace(){
  const L=plcL;if(!L)return;
  const ok=placerBk();
  if(ok.some(Boolean)){
    const sb=placerBlock(L,ok);
    if(!sb){$("plnPrevErr").textContent="Does not fit: needs "+L.w+"x"+L.h+" floor cells, larger than the ticked block types";return}
    plcL=null;$("plnPrev").close();
    setView("L");clip=[];active=null;mode=null;sel=new Set();
    pasting={rot:0,fl:false,pl:{cls:sb.cls,ms:L.items}};
    toast("Click to place the block, then connect it to your blocks. Esc cancels");all();
  }else{
    if(view!=="F")setView("F");
    if(!placerFit(L.items,L.w,L.h)){$("plnPrevErr").textContent="Does not fit: needs "+L.w+"x"+L.h+" floor cells";return}
    plcL=null;$("plnPrev").close();
    clip=L.items.map(b=>({...b}));paste();
  }
  if(!$("pln").classList.contains("col"))$("plnC").click();
}
const plcDo=()=>{if(!plcRaf)plcRaf=requestAnimationFrame(()=>{plcRaf=0;placerShot()})};
const plcP=e=>{const r=$("plnPrevMap").getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const plcZ=(p,f)=>{const z0=plcV.z,z=Math.min(60,Math.max(.01,z0*f));plcV.ox=p.x-(p.x-plcV.ox)*(z/z0);plcV.oy=p.y-(p.y-plcV.oy)*(z/z0);plcV.z=z;plcDo()};
$("plnBuild").onclick=placerGo;$("plnPlace").onclick=placerPlace;
$("plnCancel").onclick=()=>$("plnPrev").close();$("plnPrev").addEventListener("close",()=>{plcL=null});
$("plnPrevMap").addEventListener("wheel",e=>{e.preventDefault();plcZ(plcP(e),e.deltaY<0?1.12:1/1.12)},{passive:false});
let plcSt=null;
const plcM=$("plnPrevMap");
plcM.addEventListener("pointerdown",e=>{plcM.setPointerCapture(e.pointerId);plcSt={x:e.clientX,y:e.clientY,ox:plcV.ox,oy:plcV.oy}});
plcM.addEventListener("pointermove",e=>{if(!plcSt)return;plcV.ox=plcSt.ox+(e.clientX-plcSt.x);plcV.oy=plcSt.oy+(e.clientY-plcSt.y);plcDo()});
const plcEnd=()=>{plcSt=null};plcM.addEventListener("pointerup",plcEnd);plcM.addEventListener("pointercancel",plcEnd);
$("plnZi").onclick=()=>{const {w,h}=placerSize();plcZ({x:w/2,y:h/2},1.25)};
$("plnZo").onclick=()=>{const {w,h}=placerSize();plcZ({x:w/2,y:h/2},1/1.25)};
$("plnZf").onclick=()=>placerFitView();
window.addEventListener("resize",()=>{if($("plnPrev").open){placerSize();plcDo()}});
