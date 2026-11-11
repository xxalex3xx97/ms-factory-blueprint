// Build factory (Step 1): single-recipe, single-raw-input plan -> ghost. Layout is pure.
const PLC_BELT=["DAT_ConveyorBelt","DAT_ConveyorBelt2","DAT_ConveyorBelt3"],PLC_SPL=["DAT_Splitter","DAT_Splitter_2","DAT_Splitter_3"],PLC_BOX="DAT_Container";
const PL_STD=["BPO_Station_01","BPO_Station_2x1","BPO_Station_02"];   // smallest first; floors 14x14, 30x14, 30x30
const PLC_UG=["DAT_UndergroundBelt","DAT_UndergroundBelt_2","DAT_UndergroundBelt_3"];const plcCls=nm=>Object.keys(BASE).find(k=>BASE[k].kind==="b"&&BASE[k].name===nm);
const PLC_SRC=480;
let PLC_BANK=false;   // test hook only (slice 1): bank layout instead of the lane layout
let PLC_G=0;   // test hook: force band count
const PLC_BIG=12;   // blocks above which the modal asks to confirm (not a limit)
const plcPp=(cls,rot)=>portsOf({cls,x:0,y:0,rot,off:[]});
function plcMach(cls,inN,outN){
  for(let r=0;r<4;r++){const ps=plcPp(cls,r),i=ps.find(p=>p.nx===inN[0]&&p.ny===inN[1]&&p.dir!=="out"),o=ps.find(p=>p.nx===outN[0]&&p.ny===outN[1]&&p.dir!=="in");
    if(i&&o){const e=dim({cls,rot:r});return{rot:r,inP:i,outP:o,off:ps.filter(p=>p!==i&&p!==o),w:e.w,h:e.h}}}
  return null;
}
// 2-input machine variant: ML (side 1) takes both inputs on its E face and outputs on W; MR (side -1) mirrors it. Null + reason when a face has < 2 input ports.
function plcMach2(cls,side){
  for(let r=0;r<4;r++){const ps=plcPp(cls,r),ins=ps.filter(p=>p.nx===side&&p.dir!=="out").sort((a,b)=>a.y-b.y),outs=ps.filter(p=>p.nx===-side&&p.dir!=="in");
    if(ins.length>=2&&outs.length>=1){const i2=ins.slice(0,2),o=outs[0],e=dim({cls,rot:r});
      return{rot:r,ins:i2,outP:o,off:ps.filter(p=>!i2.includes(p)&&p!==o),w:e.w,h:e.h}}}
  return null;
}
// 3-input machine variant 'A': 2 inputs on face side (sorted by y) + 1 input on the face (0,-side); output on -side. side -1 = ML rotated 180 (3rd from S). Null when the faces lack ports.
function plcMach3(cls,side,variant){
  if(variant!=='A')return null;
  for(let r=0;r<4;r++){const ps=plcPp(cls,r),ins=ps.filter(p=>p.nx===side&&p.dir!=="out").sort((a,b)=>a.y-b.y),ts=ps.filter(p=>p.nx===0&&p.ny===-side&&p.dir!=="out").sort((a,b)=>a.x-b.x),outs=ps.filter(p=>p.nx===-side&&p.dir!=="in");
    if(ins.length>=2&&ts.length>=1&&outs.length>=1){const i2=ins.slice(0,2),t=ts[0],o=outs[0],e=dim({cls,rot:r});
      return{rot:r,ins:i2,inT:t,outP:o,off:ps.filter(p=>!i2.includes(p)&&p!==t&&p!==o),w:e.w,h:e.h}}}
  return null;
}
// 3-input machine variant 'C': the first 3 input ports on face side (sorted by y) and the output on the opposite face. Null when that face has fewer than 3 input ports.
function plcMachC(cls,side){
  for(let r=0;r<4;r++){const ps=plcPp(cls,r),ins=ps.filter(p=>p.nx===side&&p.dir!=="out").sort((a,b)=>a.y-b.y),outs=ps.filter(p=>p.nx===-side&&p.dir!=="in");
    if(ins.length>=3&&outs.length>=1){const i3=ins.slice(0,3),o=outs[0],e=dim({cls,rot:r});
      return{rot:r,ins:i3,outP:o,off:ps.filter(p=>!i3.includes(p)&&p!==o),w:e.w,h:e.h}}}
  return null;
}
function plcSpl(cls,rot){
  const ps=plcPp(cls,rot),e=dim({cls,rot}),f=rot===1?[0,1]:[0,-1],i=ps.find(p=>p.dir==="in"),o=ps.filter(p=>p.dir==="out");
  return i&&e.w===1&&e.h===1&&i.nx===-f[0]&&i.ny===-f[1]&&o.some(p=>p.nx===f[0]&&p.ny===f[1])&&o.some(p=>p.nx===1&&p.ny===0)&&o.some(p=>p.nx===-1&&p.ny===0)?{i,o}:null;
}
// wrapper: adds act = the actual input per machine at the planned rate (what a trunk really carries)
function plcStage(n,eI,eU,mk,spMk,eI2,eI3,more){const r=plcStageA(n,eI,eU,mk,spMk,eI2,eI3,more);if(r.ok){const NM=r.N;r.act=Math.max(eI.flow/NM,eI2?eI2.flow/NM:0,eI3?eI3.flow/NM:0)}return r}
function plcStageA(n,eI,eU,mk,spMk,eI2,eI3,more){
  const no=why=>({ok:false,why}),cb=plnCb(n.crafter);if(!cb)return no("No machine builds "+plnNm(n.item));
  const d=def(cb.id),inF=n.pmach*eI.flow/eU.flow,inF2=eI2?n.pmach*eI2.flow/eU.flow:0,inF3=eI3?n.pmach*eI3.flow/eU.flow:0,m0=Math.floor(MKS[mk][1]/Math.max(n.pmach,inF,inF2,inF3)+1e-9);
  // a machine at full speed may need more than one belt carries; at the planned load it may not: one machine per trunk, running below full speed, when the actual input per machine fits the belt
  // more (retry only, after no Mk fits): round the machine count UP so each machine's share fits the requested belt (more machines than planned is fine)
  const NM=more?Math.max(1,n.machines,Math.ceil(Math.max(eI.flow,eI2?eI2.flow:0,eI3?eI3.flow:0)/MKS[mk][1]-1e-9)):Math.max(1,n.machines),act=Math.max(eI.flow/NM,eI2?eI2.flow/NM:0,eI3?eI3.flow/NM:0);
  if(m0<1&&act>MKS[mk][1])return no("One machine needs "+plnR2(act)+"/min of input at the planned rate but a "+MKS[mk][0]+" belt carries "+MKS[mk][1]+"/min: pick a higher belt Mk");
  const m=Math.max(1,m0);
  if(eI3){   // three inputs: 2 on one face + 1 on the adjacent face of each machine column; one gap row between stages (pitch h+2)
    const ML=PLC_VC_FIRST?null:plcMach3(d.key,1,'A'),MR=PLC_VC_FIRST?null:plcMach3(d.key,-1,'A');   // PLC_VC_FIRST: test hook, variant C only
    const VC=plcMachC(d.key,1),VCR=plcMachC(d.key,-1);
    if(!PLC_NOVC&&VC&&VCR&&VC.w===VCR.w&&VC.h===VCR.h&&VC.ins.map(p=>p.y).join()===VCR.ins.map(p=>p.y).join()){   // variant C: 3 inputs on the trunk-facing face, no gap rows, width 2w+9
      const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
      if(VC.off.concat(VCR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
      return{ok:true,n,dk:d.key,inF,m,N:NM,ML:VC,MR:VCR,w:VC.w,h:VC.h,cin:VC.ins[0].y,Wb:2*VC.w+9,pitch:VC.h,sc,rec:rk(n.rec),two:{ya:VC.ins[0].y,yb:VC.ins[1].y,inF2},three:{yc:VC.ins[2].y,xc:0,xcR:0,inF3,vc:true}};
    }
    if(!ML||!MR)return no("Bank: "+plnNm(n.item)+" machine has no face with 2 input ports plus 1 on the adjacent face (3-input stage needs them)");
    if(ML.w!==MR.w||ML.h!==MR.h||ML.ins.map(p=>p.y).join()!==MR.ins.map(p=>p.y).join())return no("Bank: the two machine columns do not line up (input ports on different rows)");
    if(ML.off.concat(MR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
    const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
    return{ok:true,n,dk:d.key,inF,m,N:NM,ML,MR,w:ML.w,h:ML.h,cin:ML.ins[0].y,Wb:2*ML.w+9,pitch:ML.h+2,sc,rec:rk(n.rec),two:{ya:ML.ins[0].y,yb:ML.ins[1].y,inF2},three:{yc:ML.inT.y,xc:ML.inT.x,xcR:MR.inT.x,inF3}}
  }
  if(eI2){   // two inputs: both on one face of each machine column
    const ML=plcMach2(d.key,1),MR=plcMach2(d.key,-1);
    if(!ML||!MR)return no("Bank: "+plnNm(n.item)+" machine has no face with 2 input ports (2-input stage needs 2 ports on one face)");
    if(ML.w!==MR.w||ML.h!==MR.h||ML.ins.map(p=>p.y).join()!==MR.ins.map(p=>p.y).join())return no("Bank: the two machine columns do not line up (input ports on different rows)");
    if(ML.off.concat(MR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
    const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
    return{ok:true,n,dk:d.key,inF,m,N:NM,ML,MR,w:ML.w,h:ML.h,cin:ML.ins[0].y,Wb:2*ML.w+7,sc,rec:rk(n.rec),two:{ya:ML.ins[0].y,yb:ML.ins[1].y,inF2}}
  }
  const ML=plcMach(d.key,[1,0],[-1,0]),MR=plcMach(d.key,[-1,0],[1,0]);
  if(!ML||!MR)return no("Bank: the machine needs an input port and an output port on opposite faces");
  if(ML.w!==MR.w||ML.h!==MR.h||ML.inP.y!==MR.inP.y)return no("Bank: the two machine columns do not line up (input ports on different rows)");
  if(ML.off.concat(MR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
  const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
  return{ok:true,n,dk:d.key,inF,m,N:NM,ML,MR,w:ML.w,h:ML.h,cin:ML.inP.y,Wb:2*ML.w+3,sc,rec:rk(n.rec)};
}
function plcChain(P,item){
  if(P.cycle||P.raw.length!==1)return null;
  const ch=[],seen=new Set();let it=item;
  while(it!==P.raw[0].item){const n=P.nodes[it];
    if(!n||!n.rec||seen.has(it)||n.rec.i.length!==1)return null;
    seen.add(it);ch.unshift(n);it=n.rec.i[0][0]}
  return ch.length&&ch.length===Object.values(P.nodes).filter(n=>n.rec).length?ch:null;}
// shape of a plan for the layout: single-input chain (plcChain, unchanged) or a 2-input final stage fed by two single-input chains
function plcTree(P,item){
  const no=why=>({ok:false,why}),T=P.nodes[item];
  if(P.cycle||!T||!T.rec)return no("Step 1: only single-input single-recipe plans");
  if(T.rec.i.length===1){const ch=plcChain(P,item);return ch?{ok:true,ch,two:null,raw:P.raw[0].item}:no("Step 1: only single-input single-recipe plans")}
  if(T.rec.i.length<2||T.rec.i.length>3)return no("Bank: "+T.rec.i.length+" inputs per machine: only 1, 2 or 3 are supported");
  const side=top=>{const c=[],seen=new Set();let x=top;
    for(;;){const n=P.nodes[x];if(!n)return null;if(!n.rec)return{c,raw:x};
      if(seen.has(x)||n.rec.i.length!==1||P.edges.filter(e=>e.from===x).length!==1)return null;
      seen.add(x);c.unshift(n);x=n.rec.i[0][0]}};
  // B/C input: a single-input chain, or any sub-tree (nested multi-input) that placerBank lays out recursively; the sub-tree's top is last in c
  const sub=top=>{const c=[],raws=[],seen=new Set();const walk=x=>{const n=P.nodes[x];if(!n)return;if(!n.rec){if(!raws.includes(x))raws.push(x);return}if(seen.has(x))return;seen.add(x);n.rec.i.forEach(([y])=>walk(y));c.push(n)};walk(top);return{c,raw:raws[0],raws}};
  // the main chain is the first input that is a single-input chain; the others are B (and C) sub-trees
  const ins=T.rec.i.map(([x])=>x),sides=ins.map(side),ia=sides.findIndex(Boolean);
  if(ia<0)return no("Bank: no input is a single-input chain (every input has a shared intermediate or a deeper input)");
  const rest=ins.map((x,i)=>i).filter(i=>i!==ia),a=sides[ia],b=sides[rest[0]]||sub(ins[rest[0]]),c=rest[1]!==undefined?(sides[rest[1]]||sub(ins[rest[1]])):null;
  if(!a||!b||(T.rec.i.length===3&&!c))return no("Bank: an input chain is not a single-input chain (a shared intermediate or a deeper input)");
  return{ok:true,ch:[...a.c,T],two:{B:b.c,rawB:b.raw,rawsB:b.raws||[b.raw]},raw:a.raw,...(c?{three:{C:c.c,rawC:c.raw,rawsC:c.raws||[c.raw]}}:{})};
}
function plcBanks(g,it){
  const {ML,MR,sc,w,h,cin,dk,rec,two,three,sp:spc=0,pitch:P=h}=g.S,{cnt,X0,fRow,lRow,Y0,R,up,xf,xe,bc,mk}=g,s=up?-1:1,vr=up?3:1,Yb=Y0+(R-1)*P+h+(three&&!three.vc?1:0);
  const bt=(x,y,r)=>({cls:bc,x,y,h:0,rot:r,pid:0}),ug=(x,y,r)=>({cls:PLC_UG[mk],x,y,h:0,rot:r,pid:0}),mc=(M,x,y)=>({cls:dk,x,y,h:0,rot:M.rot,pid:0,rec,off:M.off.map(p=>p.key)});
  const my=r=>up?Y0+(R-1-r)*P:Y0+r*P;
  cnt.forEach((n,k)=>{
    // two inputs: pair = ML | cL | TA | G | TB | cR | MR (TB is the B trunk, built later by plcTwoTB)
    const x0=X0[k],Tx=x0+w+(two?2:1),mrx=three?x0+w+8:Tx+(two?4:1)+spc,xr=mrx+w,nl=Math.ceil(n/2),nr=n-nl,fr=fRow[k],lr=lRow[k],ys=my(nl-1)+cin,sp=new Set(Array.from({length:nl},(_,r)=>my(r)+cin));
    for(let r=0;r<nl;r++)it.push(mc(ML,x0+1,my(r)));
    for(let r=0;r<nr;r++)it.push(mc(MR,mrx,my(r)));
    // A feed row: an earlier trunk's G and cR cells are an underground pair under its B trunk (TB cell is left to plcTwoTB)
    const cross=new Set(),tbc=new Set();if(two)for(let j=0;j<k;j++){cross.add(X0[j]+w+3);cross.add(X0[j]+w+5);tbc.add(X0[j]+w+4)}
    for(let x=xf;x<Tx;x++){if(tbc.has(x))continue;it.push(cross.has(x)?ug(x,fr,0):bt(x,fr,0))}
    for(let y=fr;up?y>=ys:y<=ys;y+=s)it.push(sp.has(y)?{cls:sc,x:Tx,y,h:0,rot:vr,pid:0,off:[]}:bt(Tx,y,vr));
    if(two)for(let r=0;r<nl;r++){const ya=my(r)+cin,yb=my(r)+two.yb;
      it.push(bt(x0+w+1,ya,2),ug(x0+w+1,yb,2),ug(x0+w+3,yb,2))}   // cL: belt west into ML (ya), UG exit west into ML (yb); G: UG entrance west under TA
    if(two)for(let r=0;r<nr;r++){const ya=my(r)+cin,yb=my(r)+two.yb;
      if(three){it.push(ug(x0+w+3,ya,0),ug(x0+w+7,ya,0),ug(x0+w+5,yb,0),ug(x0+w+7,yb,0));continue}   // 3 inputs: cR and the TB east feed pass under TB and TC
      it.push(ug(x0+w+3,ya,0),ug(x0+w+5,ya,0),bt(x0+w+5,yb,0));for(let j=0;j<spc;j++)it.push(bt(x0+w+6+j,ya,0),bt(x0+w+6+j,yb,0))}   // G: UG entrance east under TB; cR: UG exit east into MR (ya), belt east into MR (yb); spacer: plain east belts (the wall cut sits between them)
    for(let y=up?Yb-1:Y0;up?y>lr:y<lr;y+=s){it.push(bt(x0,y,vr));if(nr)it.push(bt(xr,y,vr))}
    for(let x=x0;x<xe;x++)it.push(bt(x,lr,0));
  });
}
// 2-input: the B trunk of each consumer trunk (column TB = x0+w+4) from its B feed row frB to the last yb row, splitters on yb rows, and the B feed belt along frB
function plcTwoTB(g,it){
  const {S,cnt,X0,Y0,R,up,xf,frB,bc}=g,w=S.w,h=S.h,P=S.pitch||h,yb=S.two.yb,sc=S.sc,s=up?-1:1,vr=up?3:1,my=r=>up?Y0+(R-1-r)*P:Y0+r*P;
  // extra feed rows (the sub-band has more trunks than the consumer): the row runs east to the last consumer trunk's G column (TB-1-j, clear of the hub stack) and side-loads into the last consumer feed row
  const TBl=X0[cnt.length-1]+w+4;
  frB.slice(cnt.length).forEach((e,j)=>{const t=frB[cnt.length-1],xc=TBl-1-j,sg=t>e?1:-1,rv=sg>0?1:3;
    for(let x=xf;x<xc;x++)it.push({cls:bc,x,y:e,h:0,rot:0,pid:0});
    for(let y=e;y!==t;y+=sg)it.push({cls:bc,x:xc,y,h:0,rot:rv,pid:0})});
  cnt.forEach((n,k)=>{
    const TB=X0[k]+w+4,nl=Math.ceil(n/2),ysb=my(nl-1)+yb,sp=new Set(Array.from({length:nl},(_,r)=>my(r)+yb));
    for(let y=frB[k];up?y>=ysb:y<=ysb;y+=s)it.push(sp.has(y)?{cls:sc,x:TB,y,h:0,rot:vr,pid:0,off:[]}:{cls:bc,x:TB,y,h:0,rot:vr,pid:0});
    for(let x=xf;x<TB;x++)it.push({cls:bc,x,y:frB[k],h:0,rot:0,pid:0});
  });
}
// 3-input (single trunk per stage): C trunk column TC = x0+w+6 from its feed row frC toward the stage. Splitter on each gap row S(j)=Y0+j*P+h (j=-1..R-1): west = UG under TB/TA, then belts into the N-face port of ML(j+1); east = belts into the S-face port of MR(j).
// variant C: C trunk column TC = x0+w+6; a splitter on each machine's C port row (no gap rows); west = UG under TB and TA into the ML east port; east = belt into the MR west port
function plcVC(g,it,k){
  const {S,cnt,X0,Y0,R,up,xf,frC:frCa,bc,mk}=g,frC=frCa[k],w=S.w,h=S.h,P=S.pitch,sc=S.sc,vr=up?3:1,s=up?-1:1,x0=X0[k],TC=x0+w+6,nl=Math.ceil(cnt[k]/2),nr=cnt[k]-nl,yc=S.three.yc;
  const bt=(x,y,r)=>({cls:bc,x,y,h:0,rot:r,pid:0}),ug=(x,y,r)=>({cls:PLC_UG[mk],x,y,h:0,rot:r,pid:0});
  const rowR=j=>up?R-1-j:j,Yj=j=>Y0+j*P+yc,hasML=j=>rowR(j)<nl,hasMR=j=>rowR(j)<nr;
  const js=[];for(let j=0;j<R;j++)if(hasML(j)||hasMR(j))js.push(j);
  if(!js.length)return;
  const spl=new Set(js.map(Yj)),yEnd=up?Yj(js[0]):Yj(js[js.length-1]);
  for(let x=xf;x<TC;x++)it.push(bt(x,frC,0));
  for(let y=frC;up?y>=yEnd:y<=yEnd;y+=s)it.push(spl.has(y)?{cls:sc,x:TC,y,h:0,rot:vr,pid:0,off:[]}:bt(TC,y,vr));
  for(const j of js){const y=Yj(j);
    if(hasML(j))it.push(ug(x0+w+5,y,2),ug(x0+w+1,y,2));
    if(hasMR(j))it.push(bt(TC+1,y,0))}
}
function plcThreeTC(g,it){if(g.S.three.vc){g.cnt.forEach((n,k)=>plcVC(g,it,k));return}g.cnt.forEach((n,k)=>plcThreeTCk(g,it,k))}   // one C trunk per consumer trunk (each with its own C feed row)
function plcThreeTCk(g,it,k){
  const {S,cnt,X0,Y0,R,up,xf,frC:frCa,bc,mk}=g,frC=frCa[k],w=S.w,h=S.h,P=S.pitch,sc=S.sc,vr=up?3:1,s=up?-1:1,x0=X0[k],TC=x0+w+6,nl=Math.ceil(cnt[k]/2),nr=cnt[k]-nl,xc=S.three.xc,xcR=S.three.xcR;
  const bt=(x,y,r)=>({cls:bc,x,y,h:0,rot:r,pid:0}),ug=(x,y,r)=>({cls:PLC_UG[mk],x,y,h:0,rot:r,pid:0});
  const Sr=j=>Y0+j*P+h,rowR=j=>up?R-1-j:j,hasML=j=>j+1<R&&rowR(j+1)<nl,hasMR=j=>j>=0&&rowR(j)<nr;
  const js=[];for(let j=-1;j<R;j++)if(hasML(j)||hasMR(j))js.push(j);
  const spl=new Set(js.map(Sr)),yEnd=up?Sr(js[0]):Sr(js[js.length-1]);  for(let x=xf;x<TC;x++)it.push(bt(x,frC,0));
  for(let y=frC;up?y>=yEnd:y<=yEnd;y+=s)it.push(spl.has(y)?{cls:sc,x:TC,y,h:0,rot:vr,pid:0,off:[]}:bt(TC,y,vr));
  for(const j of js){const y=Sr(j);
    if(hasML(j)){const px=x0+1+xc;   // west: splitter -> UG entrance (TC-2) -> UG exit (cL column) -> belts west -> turn down into ML N face
      it.push(ug(x0+w+5,y,2),ug(x0+w+1,y,2));for(let x=x0+w;x>px;x--)it.push(bt(x,y,2));it.push(bt(px,y,1),bt(px,y+1,1))}
    if(hasMR(j)){const px=x0+w+8+xcR;   // east: splitter -> belts east -> turn up into MR S face
      for(let x=TC+1;x<px;x++)it.push(bt(x,y,0));it.push(bt(px,y,3))}}
}
// cut a bank layout into floor-wide segments: put(x,wid,ctr) places a wid-wide part at x; if it overflows the floor, cut at the free column c (entrance c-1, exit c), c >= segment start + lo
function plcSeg(fw,lo,fc,pad=[]){const q={s:0,i:0,cuts:[],bad:"",put(x,wid,ctr,at){
  if(at&&!fc){const x1=q.put(x,at,false);q.cuts.push(x1+at);q.s=x1+at;q.put(x1+at,wid-at,false);return x1}
  if(fc){while(q.i<fc.length&&x>fc[q.i])q.i++;   // forced cuts (band copies of a B chain reuse band 0 cuts)
    if(q.i<fc.length&&x+wid>=fc[q.i]){const c=fc[q.i++];q.s=c;x=ctr?c+1:c;
      if(x+wid-q.s>fw)q.bad="a "+wid+" cell wide part does not fit a floor "+fw+" wide: tick a bigger block";return x}
    if(fw&&x+wid+1-q.s>fw)q.bad="internal: band cut mismatch";return x}
  if(fw&&x+wid+1-q.s>fw){const c=Math.max(x,q.s+lo)+(pad[q.cuts.length]||0);   // pad: spare columns added to this cut (retry when the cut column is not free)
    if(c-q.s>fw)q.bad="an underground belt cannot reach across the wall (needs "+lo+" free cells, floor is "+fw+" wide)";
    q.cuts.push(c);q.s=c;x=ctr?c+1:c;
    if(x+wid-q.s>fw)q.bad="a "+wid+" cell wide part does not fit a floor "+fw+" wide: tick a bigger block";}
  return x}};return q}
// floor size of a station block class + the shortest underground span (cells) the belt Mk can reach across a wall
const plcFit=(cls,mk)=>{const f=floorRect({cls,x:0,y:0,h:0,rot:0}),d=dim({cls,rot:0});return{fw:f.w,fh:f.h,lo:Math.max(2,d.w*FC+2-def(PLC_UG[mk]).maxApart),lh:Math.max(2,d.h*FC+2-def(PLC_UG[mk]).maxApart)}};
function placerBank(P,item,mk,spMk,o){
  const BX=o.box||PLC_BOX,no=why=>({ok:false,why}),tr=plcTree(P,item),cap=i=>MKS[i][1],SS=[];
  if(!tr.ok)return tr;
  if(tr.three&&o.sep)return no("Bank: 3 inputs: sep layout not built");
  if(tr.three&&!tr.three.C.length)return no("Bank: 3 inputs per machine: a raw 3rd input straight into the machine is not built yet");
  const ch=tr.ch,n=ch.length,G=o.G||PLC_G||1,Bn=tr.two?tr.two.B:[],topB=Bn.length?Bn[Bn.length-1].item:(tr.two&&tr.two.rawB),Cn=tr.three?tr.three.C:[],topC=Cn.length?Cn[Cn.length-1].item:(tr.three&&tr.three.rawC);
  for(let q=0;q<n;q++){const nd=ch[q],eI=P.edges.find(e=>e.from===(q?ch[q-1].item:tr.raw)&&e.to===nd.item),eU=P.edges.find(e=>e.from===nd.item&&(q<n-1?e.to===ch[q+1].item:e.to==null)),eI2=tr.two&&q===n-1?P.edges.find(e=>e.from===topB&&e.to===nd.item):null,eI3=tr.three&&q===n-1?P.edges.find(e=>e.from===topC&&e.to===nd.item):null;
    const S=plcStage(nd,eI,eU,mk,spMk,eI2,eI3,o.more);if(!S.ok)return S;SS.push(S)}
  if(G>1&&tr.three)SS.forEach(S=>{S.N=Math.ceil(S.N/G)*G});   // 3 inputs: every band gets the same machine count (round up, never less)
  if(o.wantT&&o.feedOut){const L=SS[n-1];if(L.N<=o.wantT*L.m)L.N=o.wantT*L.m}   // B/C sub-band: exactly wantT trunks in its last stage (machines rounded up), so its feed rows match the consumer's trunks
  SS.forEach(S=>{S.sp=0;if(S.two&&!S.three&&o.fit&&o.fit.fw&&S.Wb>o.fit.fw){S.sp=4;S.Wb+=4}});   // spacer = UG entrance+exit pair with 1 plain belt of clearance each side, so nothing but straight east belts touches the wall cut
  if(tr.two&&!Bn.length)return no("Bank: a raw input straight into a 2-input machine is not built yet");
  const cp=plcPp(BX,0),cE=cp.filter(p=>p.nx===1).sort((a,b)=>a.y-b.y),cW=cp.filter(p=>p.nx===-1).sort((a,b)=>a.y-b.y),seq=a=>a.every((p,i)=>p.y===a[0].y+i);
  if(!cE.length||!cW.length||!seq(cE)||!seq(cW))return no("Bank: container E/W ports not found or not on consecutive rows");
  const bw=def(BX).w,bh=def(BX).h;
  const dist=(n,t)=>Array.from({length:t},(_,k)=>Math.floor(n/t)+(k<n%t?1:0));
  const bt=(x,y)=>({cls:PLC_BELT[mk],x,y,h:0,rot:0,pid:0}),bx=(x,y,ct)=>({cls:BX,x,y,h:0,rot:0,pid:0,ct});
  const ps=Math.max(1,Math.min(cE.length,cW.length,Math.floor(PLC_SRC/cap(mk))));
  if(o.spl)SS.forEach(S=>{const mm=Math.max(1,Math.floor(Math.min(cap(spMk),cap(mk))/S.act+1e-9));if(mm<S.m)S.m=mm});   // retry: a trunk carries at most one splitter's speed of the actual load
  const Ns=SS.map(S=>S.N),t0s=Ns.map((N,q)=>Math.ceil(N/SS[q].m));
  for(let q=0;q<n;q++){const d0=dist(Ns[q],t0s[q])[0]*SS[q].act;if(cap(spMk)<d0-1e-9){   // trunk too fast for its splitter: retry with fewer machines per trunk (more trunks) instead of refusing
    if(!o.spl)return placerBank(P,item,mk,spMk,{...o,spl:1});return no("Splitter "+MKS[spMk][0]+" is too slow for a trunk ("+plnR2(d0)+"/min): set the splitter Mk higher")}}
  const tbs=t0s.map(t=>Math.ceil(t/G));  for(let q=0;q<n;q++)if(G*tbs[q]>Ns[q])return no("band count "+G+" does not fit "+Ns[q]+" machines");
  const alls=SS.map((S,q)=>dist(Ns[q],G*tbs[q])),nH=[0];   // nH[q]=hub containers per band between stage q-1 and q
  for(let q=1;q<n;q++){const a=tbs[q-1],b=tbs[q],hq=Math.max(Math.ceil(a/ps),Math.ceil(b/ps));if(hq>Math.min(a,b))return no("Hub between stages "+q+" and "+(q+1)+": "+a+" and "+b+" trunks cannot share "+hq+" hub containers ("+ps+" ports a side): pick a higher belt Mk or a bigger container");nH.push(hq)}
  const offs=(t,k,bal,pt)=>{const r=[];if(bal)dist(t,k).forEach((c,j)=>{for(let p=0;p<c;p++)r.push(j*bh+pt[p].y)});else for(let i=0;i<t;i++)r.push(Math.floor(i/ps)*bh+pt[i%ps].y);return r};
  const FT=o.feedOut?(o.wide?Math.max(o.feedOut.nT,tbs[n-1]):o.feedOut.nT):0;   // wide retry: feed rows = the sub-band's own trunks (extra rows are merged into the consumer rows by plcTwoTB)
  const geo=b=>{const gs=[];let B=0;
    for(let q=0;q<n;q++){const S=SS[q],cnt=alls[q].slice(b*tbs[q],(b+1)*tbs[q]),nT=cnt.length,R=Math.ceil(cnt[0]/2),up=q%2===1;
      const nIn=q?nH[q]:Math.ceil(nT/ps),nOut=q<n-1?nH[q+1]:(o.feedOut?Math.ceil(FT/ps):Math.ceil(nT/ps));
      const oi=offs(nT,nIn,q>0,cE),oo=offs(nT,nOut,q<n-1||!!o.feedOut,cW);
      const vc=!!(S.three&&S.three.vc),E=S.three&&!vc?2:0,T1=S.three&&!vc?1:0,HS=(R-1)*(S.pitch||S.h)+S.h,Y0=up?B+oi[0]-HS-T1:B+oi[nT-1]+1+E,Yend=Y0+HS+(up?0:T1),Bo=up?Y0-1-E-oo[nT-1]:Yend-oo[0],ix=k=>up?k:nT-1-k;
      const ge={S,cnt,nT,R,up,nIn,nOut,oi,oo,Y0,Bi:B,Bo,fRow:cnt.map((_,k)=>B+oi[ix(k)]),lRow:cnt.map((_,k)=>Bo+oo[ix(k)])};
      if(q===n-1&&o.feedOut){const oiF=offs(FT,nOut,true,cE);ge.feedRows=Array.from({length:FT},(_,k)=>Bo+oiF[o.feedOut.up?k:FT-1-k])}   // B chain: its out hub E ports feed the consumer B trunks
      gs.push(ge);B=Bo}
    return gs};
  const it=[],sg=o.seg||plcSeg(o.fit&&o.fit.fw,o.fit&&o.fit.lo,undefined,o.pad),hz=[];let xs=0;
  const rBs=[];
  if(tr.two&&o.sep){   // sep layout: B chain copies on the LEFT (own column range, same segments), main chain to their right
    const cI=n-1,eB=P.edges.find(e=>e.from===topB&&e.to===ch[cI].item),bset=new Set(Bn.map(nd=>nd.item));
    const bad=Bn.find(nd=>nd.machines<G);if(bad)return no("band count "+G+" does not fit "+bad.machines+" machines of "+plnNm(bad.item));
    let cB=null,xB=0;
    for(let b=0;b<G;b++){
      const nodesB={};Bn.forEach(nd=>nodesB[nd.item]={...nd,machines:tr.three?Math.ceil(nd.machines/G):dist(nd.machines,G)[b]});
      const fB=alls[cI].slice(b*tbs[cI],(b+1)*tbs[cI]).reduce((a,c)=>a+c,0)/Ns[cI];
      const PB={raw:P.raw.filter(r=>(tr.two.rawsB||[tr.two.rawB]).includes(r.item)),nodes:{...nodesB,...Object.fromEntries((tr.two.rawsB||[]).filter(r=>P.nodes[r]).map(r=>[r,P.nodes[r]]))},cycle:false,edges:P.edges.filter(e=>(bset.has(e.from)||(tr.two.rawsB||[tr.two.rawB]).includes(e.from))&&e.to!==ch[cI].item).concat([{from:topB,to:null,flow:eB.flow}]).map(e=>({...e,flow:e.flow*fB}))};
      const rB=placerBank(PB,topB,mk,spMk,{...o,G:1,feedOut:{nT:tbs[cI],up:cI%2===1},fit:null,sep:false,seg:b?plcSeg(o.fit&&o.fit.fw,o.fit&&o.fit.lo,cB):sg});
      if(!rB.ok)return rB;
      if(!b)cB=sg.cuts.slice();
      rBs.push(rB);xB=Math.max(xB,rB.w)}
    xs=sg.put(xB+1,2*bw+1,false)}
  let x=xs+2*bw+2,xf=xs+2*bw+1;
  for(let q=0;q<n;q++){const X0=[];for(let k=0;k<tbs[q];k++){x=sg.put(x,SS[q].Wb,false,SS[q].sp?SS[q].w+6+SS[q].sp/2:0);X0.push(x);x+=SS[q].Wb+1}
    const xe=sg.put(x,q<n-1||o.feedOut?bw:2*bw+1,true);hz.push({Xs:xs,xf,X0,xe});
    if(q<n-1){xf=xe+bw;x=xe+bw+1}}   // junction q: one hub at xe (out side of stage q = in side of stage q+1); feeders start xe+bw
  if(sg.bad)return no(sg.bad);
  const gb=[];let oy=0,sh0=0;
  for(let b=0;b<G;b++){let gs;try{gs=geo(b)}catch(e){if(o.feedOut&&!o.wide)return placerBank(P,item,mk,spMk,{...o,wide:1});   // B/C sub-band hub needs more ports than a side: retry with one feed row per own trunk (extra rows merged)
    return no("Bank: a hub needs more ports than a box side has: pick a higher belt Mk or a bigger buffer")}   // more trunks per hub than box ports
    const i0=it.length;gb.push(gs);
    gs.forEach((g,q)=>{const {Xs,xf,X0,xe}=hz[q];
      if(q===0){for(let j=0;j<g.nIn;j++){const y=g.Bi+j*bh;if(!o.mod)it.push(bx(Xs,y,[{item:tr.raw,n:0,inf:true}]));it.push(bx(Xs+bw+1,y,[]))}
        g.oi.forEach(r=>{it.push(bt(Xs+bw,g.Bi+r));if(o.mod)for(let xx=Xs;xx<Xs+bw;xx++)it.push(bt(xx,g.Bi+r))})}
      plcBanks({S:g.S,cnt:g.cnt,X0,fRow:g.fRow,lRow:g.lRow,Y0:g.Y0,R:g.R,up:g.up,xf,xe,bc:PLC_BELT[mk],mk},it);
      for(let j=0;j<g.nOut;j++){const y=g.Bo+j*bh;it.push(bx(xe,y,[]));if(q===n-1&&!o.mod&&!o.feedOut)it.push(bx(xe+bw+1,y,[]))}
      if(q===n-1&&!o.feedOut)g.oo.forEach(r=>{it.push(bt(xe+bw,g.Bo+r));if(o.mod)for(let xx=xe+bw+1;xx<xe+2*bw+1;xx++)it.push(bt(xx,g.Bo+r))})});
    // 2-input: this band's share of the B chain (its own copy of the B planner, machines and flows scaled to the band), on the consumer feed side (below an up stage, above a down stage), right-aligned at the consumer input hub
    if(tr.two&&!o.sep){
      const cI=n-1,gC=gs[cI],hC=hz[cI],nodesB={};
      const bad=Bn.find(nd=>nd.machines<G);if(bad)return no("band count "+G+" does not fit "+bad.machines+" machines of "+plnNm(bad.item));
      Bn.forEach(nd=>nodesB[nd.item]={...nd,machines:tr.three?Math.ceil(nd.machines/G):dist(nd.machines,G)[b]});
      const eB=P.edges.find(e=>e.from===topB&&e.to===ch[cI].item),bset=new Set(Bn.map(nd=>nd.item)),fB=alls[cI].slice(b*tbs[cI],(b+1)*tbs[cI]).reduce((a,c)=>a+c,0)/Ns[cI];
      const PB={raw:P.raw.filter(r=>(tr.two.rawsB||[tr.two.rawB]).includes(r.item)),nodes:{...nodesB,...Object.fromEntries((tr.two.rawsB||[]).filter(r=>P.nodes[r]).map(r=>[r,P.nodes[r]]))},cycle:false,edges:P.edges.filter(e=>(bset.has(e.from)||(tr.two.rawsB||[tr.two.rawB]).includes(e.from))&&e.to!==ch[cI].item).concat([{from:topB,to:null,flow:eB.flow}]).map(e=>({...e,flow:e.flow*fB}))};
      const rB=placerBank(PB,topB,mk,spMk,{...o,G:1,feedOut:{nT:tbs[cI],up:gC.up},fit:null,wantT:tbs[cI]});
      if(!rB.ok)return rB;      const bi=it.slice(i0),dx=(cI?hz[cI-1].xe:hz[cI].xf-bw)-rB.feed.x,y0=gC.up?Math.max(...bi.map(c=>c.y+dim(c).h))+2:Math.min(...bi.map(c=>c.y))-2-rB.h;
      rB.items.forEach(c=>it.push({...c,x:c.x+dx,y:c.y+y0}));
      plcTwoTB({S:gC.S,cnt:gC.cnt,X0:hC.X0,Y0:gC.Y0,R:gC.R,up:gC.up,xf:hC.xf,frB:rB.feed.rows.map(r=>r+y0),bc:PLC_BELT[mk]},it);
    }
    if(tr.three&&!o.sep){const cI=n-1,gC=gs[cI],hC=hz[cI],T3=tbs[cI];   // 3rd input: one C sub-band per consumer trunk (own machines, own feed row frC[k]), stacked beyond the B band; TC trunks via plcThreeTC
      const bad=Cn.find(nd=>nd.machines<G*T3);if(bad)return no("band count "+(G*T3)+" does not fit "+bad.machines+" machines of "+plnNm(bad.item));
      const eC=P.edges.find(e=>e.from===topC&&e.to===ch[cI].item),setC=new Set(Cn.map(nd=>nd.item)),fC=alls[cI].slice(b*T3,(b+1)*T3).reduce((a,c)=>a+c,0)/Ns[cI];
      const frCk=[];
      for(let k=0;k<T3;k++){const nodesC={};Cn.forEach(nd=>nodesC[nd.item]={...nd,machines:Math.ceil(nd.machines/(G*T3))});
        const PC={raw:P.raw.filter(r=>(tr.three.rawsC||[tr.three.rawC]).includes(r.item)),nodes:{...nodesC,...Object.fromEntries((tr.three.rawsC||[]).filter(r=>P.nodes[r]).map(r=>[r,P.nodes[r]]))},cycle:false,edges:P.edges.filter(e=>(setC.has(e.from)||(tr.three.rawsC||[tr.three.rawC]).includes(e.from))&&e.to!==ch[cI].item).concat([{from:topC,to:null,flow:eC.flow}]).map(e=>({...e,flow:e.flow*fC/T3}))};
        const rC=placerBank(PC,topC,mk,spMk,{...o,G:1,feedOut:{nT:1,up:gC.up},fit:null,wantT:1});
        if(!rC.ok)return rC;
        const bi=it.slice(i0),dx=(cI?hz[cI-1].xe:hz[cI].xf-bw)-rC.feed.x,y1=gC.up?Math.max(...bi.map(c=>c.y+dim(c).h))+2:Math.min(...bi.map(c=>c.y))-2-rC.h;
        rC.items.forEach(c=>it.push({...c,x:c.x+dx,y:c.y+y1}));
        frCk.push(rC.feed.rows[0]+y1);}
      plcThreeTC({S:gC.S,cnt:gC.cnt,X0:hC.X0,Y0:gC.Y0,R:gC.R,up:gC.up,xf:hC.xf,frC:frCk,bc:PLC_BELT[mk],mk},it);}
    if(tr.two&&o.sep){const cI=n-1,gC=gs[cI],hC=hz[cI],rB=rBs[b],bi=it.slice(i0);
      const y0=gC.up?Math.max(...bi.map(c=>c.y+dim(c).h))+2:Math.min(...bi.map(c=>c.y))-2-rB.h;
      rB.items.forEach(c=>it.push({...c,y:c.y+y0}));
      rB.feed.rows.forEach(r=>{for(let xx=rB.feed.x+bw;xx<hC.xf;xx++)it.push(bt(xx,r+y0))});
      plcTwoTB({S:gC.S,cnt:gC.cnt,X0:hC.X0,Y0:gC.Y0,R:gC.R,up:gC.up,xf:hC.xf,frB:rB.feed.rows.map(r=>r+y0),bc:PLC_BELT[mk]},it);}
    const sl=it.slice(i0),mn=Math.min(...sl.map(c=>c.y)),mx=Math.max(...sl.map(c=>c.y+dim(c).h));
    if(!b)sh0=oy-mn;sl.forEach(c=>{c.y+=oy-mn});oy+=mx-mn+1}   // band min y -> oy, spare row between bands
  const mnx=Math.min(...it.map(b=>b.x)),mny=Math.min(...it.map(b=>b.y)),items=it.map(b=>({...b,x:b.x-mnx,y:b.y-mny}));
  const last=n-1,T=ch[last],N=Ns[last],b0=gb[0],hubs=G*nH.reduce((a,c)=>a+c,0),nS=G*b0[0].nIn,nK=G*b0[last].nOut;
  const nt=["Makes "+plnR2(N*T.pmach)+"/min (target "+plnR2(T.rate)+")"];
  if(n===1){
    nt.push(G>1?G+" band(s) of "+tbs[0]+" trunk(s) each ("+alls[0].join("+")+" machines), spare belt row between bands; containers: "+nS+" source, "+nS+" in-buffer, "+nK+" out-buffer, "+nK+" sink"
      :b0[0].nT+" trunk"+(b0[0].nT>1?"s":"")+" ("+b0[0].cnt.join("+")+" machines), "+b0[0].R+" rows, double columns, "+b0[0].nT+" output lane"+(b0[0].nT>1?"s":"")+"; containers: "+b0[0].nIn+" source, "+b0[0].nIn+" in-buffer, "+b0[0].nOut+" out-buffer, "+b0[0].nOut+" sink");
    const m3=mk<2?Math.min(N,Math.floor(MKS[2][1]/Math.max(T.pmach,SS[0].inF)+1e-9)):0;
    if(m3>SS[0].m)nt.push("Mk3 packs "+m3+" machines per trunk (now "+SS[0].m+")");
  }else{
    for(let q=0;q<n;q++)nt.push("Stage "+(q+1)+" "+plnNm(ch[q].item)+": "+Ns[q]+" machines, "+G*tbs[q]+" trunk"+(G*tbs[q]>1?"s":"")+" ("+alls[q].join("+")+"), "+Math.max(...gb.map(g=>g[q].R))+" rows");
    for(let q=1;q<n;q++)nt.push("Hub container between stages: "+plnR2(P.edges.find(e=>e.from===ch[q-1].item&&e.to===ch[q].item).flow/(G*nH[q]))+"/min (max "+PLC_SRC+")"+(G*nH[q]>1?"; "+G*nH[q]+" hub containers stacked":""));
    if(tr.two&&!tr.three)nt.push("Two inputs into "+plnNm(ch[n-1].item)+": A "+plnNm(ch[n-2].item)+" (main chain) + B "+plnNm(topB)+" ("+Bn.length+" stage"+(Bn.length>1?"s":"")+", own band)");
    if(tr.three)nt.push("Three inputs into "+plnNm(ch[n-1].item)+": A "+plnNm(ch[n-2].item)+" (main chain) + B "+plnNm(topB)+" + C "+plnNm(topC)+" (own bands)");
    if(G>1)nt.push(G+" band(s) (machine counts may differ by 1 between bands), spare belt row between bands");
  }
  if(mk===2||spMk===2)nt.push("Mk3 belt/splitter ids are not verified");
  const W=Math.max(...items.map(b=>b.x+dim(b).w)),H=Math.max(...items.map(b=>b.y+dim(b).h));
  const feed=o.feedOut?{x:hz[n-1].xe-mnx,rows:gb[0][n-1].feedRows.map(y=>y+sh0-mny)}:null;
  const bandSum=q=>{const s=[];for(let b=0;b<G;b++)s.push(alls[q].slice(b*tbs[q],(b+1)*tbs[q]).reduce((a,c)=>a+c,0));return s.every(v=>v===s[0])};
  const even=SS.every((_,q)=>bandSum(q))&&Bn.every(nd=>nd.machines%G===0);   // every band holds the same machines per stage (uneven = fallback, see placerTile)
  return{ok:true,three:!!tr.three,items,lanes:G*tbs[last],per:alls[last],makes:N*T.pmach,note:nt,mod:!!o.mod,box:BX,mk,pitch:H+1,w:W,h:H,bank:true,trunks:G*tbs[last],rows:Math.max(...gb.flat().map(g=>g.R)),nS,nK,ps,bands:G,tb:tbs[last],t0:Math.max(...t0s),cuts:sg.cuts.map(c=>c-mnx),src:{P,item,mk,spMk,o},tbs,stages:n,hubs,nIn:G*tbs[0],nOut:G*tbs[last],feed,even,two:!!tr.two};
}
function placerPlan(){
  const it=$("plnItem").value,rate=+$("plnRate").value||0,pr=plnProto(),sp=$("plnSp").value,bal=$("plnBal").value,mk=+$("plnMk").value;
  if(!it||!(rate>0))return null;
  return{it,rate,mk,sp:sp===""?null:+sp,P:plan(it,rate,mk,{sp:sp===""?null:+sp,bal:bal===""?null:+bal},PLN_PICK,{proto:pr,enr:$("plnEnr").checked})};
}
// mk / spMk: 0-based MKS index (Mk1 = 0). o={box:container class, mod:bool}. Lanes: nL stacked copies of one row (machines rot 0, trunk y=-1 above, collector y=h below).
// shared intermediates: each consumer gets its own copy of a shared sub-chain, scaled to what that consumer takes (more raw sources, one copy per consumer); the layout then sees a tree
function plcUnshare(P,item){
  if(P.cycle)return P;   // a recipe loop has no tree to copy (plcTree refuses it)
  const cons={};Object.values(P.nodes).forEach(n=>{if(n.rec)n.rec.i.forEach(([x])=>cons[x]=(cons[x]||0)+1)});
  if(!Object.values(cons).some(c=>c>1))return P;
  const isNode=x=>!!(P.nodes[x]&&P.nodes[x].rec),nodes={},edges=[];let k=0;
  const build=(item,key,sc)=>{const o=P.nodes[item];
    const ins=o.rec.i.map(([x])=>{const fl=P.edges.find(e=>e.from===x&&e.to===item).flow*sc;
      if(!isNode(x)){if(P.nodes[x])nodes[x]=P.nodes[x];edges.push({from:x,to:key,flow:fl});return x}
      const ck=build(x,cons[x]>1?x+"#"+(++k):x,fl/P.nodes[x].rate);
      edges.push({from:ck,to:key,flow:fl});return ck});
    nodes[key]={...o,item:key,rec:{...o.rec,i:o.rec.i.map((p,j)=>[ins[j],...p.slice(1)])},rate:o.rate*sc,machines:sc===1?o.machines:Math.max(1,Math.ceil(o.rate*sc/o.pmach-1e-9))};
    return key};
  build(item,item,1);
  return{...P,nodes,edges:edges.concat([{from:item,to:null,flow:P.edges.find(e=>e.from===item&&e.to==null).flow}]),cycle:false};
}
// belt / splitter too slow for the planned load: the layout uses the next higher Mk automatically (the note says so) instead of refusing
function placerLayout(P,item,mk,spMk,o={}){
  try{return placerLayoutX(P,item,mk,spMk,o)}catch(e){return{ok:false,why:"internal error while laying out this factory ("+e.message+"): tell the developer which item and settings"}}   // a crash shows in the modal with Place disabled, never breaks the page
}
function placerLayoutX(P,item,mk,spMk,o={}){
  const L=placerLayoutA(P,item,mk,spMk,o);
  if(L.ok||!/higher belt Mk|splitter Mk higher/.test(L.why))return L;
  for(let up=1;up<=2;up++){const m2=Math.min(2,mk+up),s2=Math.min(2,spMk+up);
    const L2=placerLayoutA(P,item,m2,s2,o);
    if(L2.ok){L2.note=[...L2.note,"Belt Mk raised to "+MKS[m2][0]+" and splitter Mk to "+MKS[s2][0]+" automatically (the requested Mk cannot carry the planned load)"];return L2}}
  const L3=placerLayoutA(P,item,mk,spMk,{...o,more:1});   // no Mk carries one machine's planned input: more machines (rounded up), each trunk carries less
  if(L3.ok){L3.note=[...L3.note,"More machines than planned: one "+MKS[mk][0]+" belt cannot carry the planned input of one machine, so the machine count is rounded up (each machine gets less)"];return L3}
  return L;
}
function placerLayoutA(P,item,mk,spMk,o={}){P=plcUnshare(P,item);
  const BX=o.box||PLC_BOX,no=why=>({ok:false,why});
  const tr=plcTree(P,item);if(!tr.ok)return no(tr.why);
  if(tr.two||tr.ch.length>1)return placerBank(P,item,mk,spMk,o);
  const T=P.nodes[item],N=T.machines,eIn=P.edges.find(e=>e.from===P.raw[0].item&&e.to===item),eOut=P.edges.find(e=>e.to==null);
  const m0=Math.floor(MKS[mk][1]/Math.max(T.pmach,T.pmach*eIn.flow/eOut.flow)+1e-9);   // machines one belt feeds
  if(!o.mod&&(PLC_BANK||o.bank||N>m0||o.more))return placerBank(P,item,mk,spMk,o);
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
    for(let x=X0;x<=X0+(n-1)*w+inP.x;x++){   // trunk ends at the last splitter (no dead-end stub: a clean column is needed to cross a wall)
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
  return{ok:true,items,lanes:nL,per:cnt,makes:N*T.pmach,note:nt,mod:!!o.mod,box:BX,mk,pitch,w:Math.max(...items.map(b=>b.x+dim(b).w)),h:Math.max(...items.map(b=>b.y+dim(b).h)),src:{P,item,mk,spMk,o}};
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
// spread a layout over several blocks of one type: cut it at free columns (a belt crossing = underground pair, entrance+exit = the two cells beside the cut, span <= maxApart), then cut lanes into rows of blocks
// occupancy map cell -> item for a list of placed items (items in layout coordinates)
function plcOcc(IT){const occ=new Map();IT.forEach(b=>{const e=dim(b);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)occ.set((b.x+i)+","+(b.y+j),b)});return occ}
// can a wall be cut at column c (entrance c-1, exit c) through the items? returns the underground pairs' cells, or null
function plcTryCut(IT,occ,h,bank,c){
    const isB=b=>!!b&&PLC_BELT.includes(b.cls);
    const mk=[];
    for(let y=0;y<h;y++){const a=occ.get((c-1)+","+y),b=occ.get(c+","+y);
      if(a&&a===b)return null;
      if(bank){   // bank: only east-flowing belt pairs cross the wall; empty cells and vertical belts are fine
        if(a&&b){
          if(!(isB(a)&&isB(b)&&a.rot===0&&b.rot===0))return null;
          const sd=(q,dy)=>{const n=occ.get(q.x+","+(q.y+dy));return !!n&&isB(n)&&n.rot===(dy<0?1:3)};
          if(sd(a,-1)||sd(a,1)||sd(b,-1)||sd(b,1))return null;
          mk.push(a,b);
        }else if(a&&isB(a)&&a.rot===0)return null;   // belt flowing into nothing across the wall (a machine/box beside the wall is fine)
        continue;
      }
      if(isB(a)&&isB(b)&&a.rot===0&&b.rot===0){mk.push(a,b);continue}
      if(isB(a)||isB(b))return null;
    }
    const ms=new Set(mk);
    for(const it of IT){if(isB(it))continue;
      for(const p of portsOf(it)){if(!p.en)continue;const t=occ.get((p.x+p.nx)+","+(p.y+p.ny));if(!t||!ms.has(t))continue;
        if(p.ny!==0||p.nx!==(t.x===c-1?1:-1))return null}}
    return mk;
}
// k blank columns inserted before column p: items with x>=p move k right, an east belt crossing p is stretched across the new cells; null when a machine/splitter/underground would be split or a west belt feeds across p
function plcBlank(IT,p,k,h,mx){
  const occ=plcOcc(IT),out=IT.map(b=>({...b})),fill=[],isB=b=>!!b&&PLC_BELT.includes(b.cls);
  const uy={};IT.forEach(b=>{if(PLC_UG.includes(b.cls)&&(b.rot&1)===0)(uy[b.y]=uy[b.y]||[]).push(b)});   // a horizontal underground pair that straddles p grows by k: must stay within the Mk span
  for(const y in uy){const l=uy[y].sort((a,b)=>a.x-b.x);for(let i=0;i+1<l.length;i+=2){const a=l[i],b=l[i+1];if(a.x<p&&p<=b.x&&b.x-a.x+k+1>mx)return null}}
  for(let y=0;y<h;y++){const A=occ.get((p-1)+","+y),B=occ.get(p+","+y);
    if(A&&A===B)return null;
    if(B&&(PLC_UG.includes(B.cls)||(isB(B)&&B.rot===2)))return null;
    if(A&&B&&(A.rec||PLC_SPL.includes(A.cls)||PLC_UG.includes(A.cls)))return null;
    if(A&&B&&A.cls.startsWith("DAT_Container")&&portsOf(A).some(q=>q.en&&q.x+q.nx===p&&q.y+q.ny===y)){   // a box port facing the cut column: the new cells must carry its flow, so only an east belt can continue it
      if(!(isB(B)&&B.rot===0))return null;
      for(let j=0;j<k;j++)fill.push({cls:B.cls,x:p+j,y,h:0,rot:0,pid:0});
    }
    if(A&&isB(A)&&A.rot===0)for(let j=0;j<k;j++)fill.push({cls:A.cls,x:p+j,y,h:0,rot:0,pid:0});
  }
  out.forEach(b=>{if(b.x>=p)b.x+=k});
  return out.concat(fill);
}
function placerCut(L,cls){
  const f=floorRect({cls,x:0,y:0,h:0,rot:0}),d=dim({cls,rot:0}),TW=d.w*FC,TH=d.h*FC,Fw=f.w,Fh=f.h,nm=BASE[cls].name;
  const mx=def(PLC_UG[L.mk]).maxApart,per=Math.floor((Fh+1)/L.pitch);
  if(!L.bank&&per<1)return{ok:false,why:(L.bank?"the factory is ":"one lane is ")+(L.pitch-1)+" cells tall, the "+nm+" floor is only "+Fh};
  const IT=L.items.map(b=>({...b}));let occ,Hh=L.h;   // working copies: a row gap shifts them in place
  const mkOcc=()=>{occ=new Map();IT.forEach(b=>{const e=dim(b);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)occ.set((b.x+i)+","+(b.y+j),b)})};mkOcc();
  const isB=b=>!!b&&PLC_BELT.includes(b.cls);
  const tryCut=c=>plcTryCut(IT,occ,L.h,L.bank,c);
  const cuts=[],ugs=[];let s=0;
  if(L.cuts){const cl=L.cuts.slice();
    for(let i=0;i<cl.length;i++){let c=cl[i],r=tryCut(c);
      if(!r){   // not free: insert k blank columns at c (the wall then lands on the first k-shifted free column)
        let done=false;
        const prev=cuts.length?cuts[cuts.length-1]:0;
        for(let p=c;p>Math.max(prev,c-6)&&!done;p--)for(let k=1;k<=6&&!done;k++){const IT2=plcBlank(IT,p,k,L.h,mx);if(!IT2)continue;   // p: insertion column (up to 6 left of the planned cut)
          const c2=p+k,r2=plcTryCut(IT2,plcOcc(IT2),L.h,true,c2);
          if(r2&&c2-prev<=Fw&&c2-prev>=Math.max(2,d.w*FC+2-mx)){IT.splice(0,IT.length,...IT2);mkOcc();for(let j=i+1;j<cl.length;j++)if(cl[j]>=p)cl[j]+=k;c=c2;r=r2;done=true}}
        if(!done)return{ok:false,why:"internal: bank cut column "+c+" is not free even with 6 blank columns"};
      }
      cuts.push(c);ugs.push(...r)}}
  else while(L.w-s>Fw){
    let ok=null,c=0;
    for(let e=Fw;e>=Math.max(2,d.w*FC+2-mx);e--){const r=tryCut(s+e);if(r){ok=r;c=s+e;break}}
    if(!ok)return{ok:false,why:"no free column to cross a wall within "+mx+" underground cells (a machine, splitter or container is in the way): pick a higher belt Mk or a bigger block type"};
    cuts.push(c);ugs.push(...ok);s=c;
  }
  const rc=[];
  if(L.bank){   // bank: also cut rows (2D tiling); a vertical belt crossing a row wall = underground pair
    const spl=q=>!!q&&PLC_SPL.includes(q.cls),hz=q=>isB(q)&&(q.rot===0||q.rot===2);
    const tryRow=c=>{
      const mk=[],side=(x,yy)=>{const l=occ.get((x-1)+","+yy),r=occ.get((x+1)+","+yy);return !!(l&&isB(l)&&l.rot===0)||!!(r&&isB(r)&&r.rot===2)};
      for(let x=0;x<L.w;x++){
        const A=occ.get(x+","+(c-1)),B=occ.get(x+","+c);
        if(A&&A===B)return null;
        if(spl(A)||spl(B))return null;
        if(A&&B){
          if(isB(A)&&isB(B)&&A.rot===B.rot&&(A.rot===1||A.rot===3)){
            if(ugs.includes(A)||ugs.includes(B)||side(x,c-1)||side(x,c))return null;
            mk.push(A,B);continue}
          if(hz(A)&&hz(B))continue;
          if(isB(A)||isB(B))return null;
          continue}
        if(A&&isB(A)&&A.rot===1)return null;   // belt flowing into the empty cell across the wall
        if(B&&isB(B)&&B.rot===3)return null;
      }
      const ms=new Set(mk);
      for(const it of IT){if(isB(it))continue;
        for(const p of portsOf(it)){if(!p.en)continue;const t=occ.get((p.x+p.nx)+","+(p.y+p.ny));if(!t||!ms.has(t))continue;
          if(p.nx!==0||p.ny!==(t.rot===1?1:-1))return null}}
      return mk;
    };
    const bl=q=>isB(q)||spl(q)||PLC_UG.includes(q.cls),vt=q=>bl(q)&&(q.rot===1||q.rot===3),ch=(a,b)=>a.x===b.x&&vt(a)&&vt(b)&&a.rot===b.rot;
    const gapRow=r0=>{
     const ix=new Map(IT.map((b,i)=>[b,i])),pa=IT.map((_,i)=>i),fd=i=>{while(pa[i]!==i)i=pa[i]=pa[pa[i]];return i},edges=[];
     IT.forEach((b,i)=>{const e=dim(b);for(let u=0;u<e.w;u++)for(let v=0;v<e.h;v++)for(const [dx,dy] of [[1,0],[0,1]]){
      const m=occ.get((b.x+u+dx)+","+(b.y+v+dy));if(!m||m===b)continue;
      if(dy&&ch(b,m)){edges.push([b,m,b.rot]);continue}
      if(dy&&!bl(b)&&!bl(m))continue;
      pa[fd(i)]=fd(ix.get(m))}});
     const T=[],Bm=[];IT.forEach((b,i)=>{const r=fd(i),e=dim(b);T[r]=Math.min(T[r]??1e9,b.y);Bm[r]=Math.max(Bm[r]??-1e9,b.y+e.h-1)});
     let best=null;
     for(let e=Fh;e>=Math.max(2,d.h*FC+2-mx);e--){const W=r0+e;
      let D=2;IT.forEach((b,i)=>{const r=fd(i);if(Bm[r]>=W-1&&T[r]<=W)D=Math.max(D,W+1-T[r])});
      if(D>=e||best&&D>=best.D)continue;   // a gap must shrink the remaining height (D<e), else the row loop never ends
      const sh=IT.map((b,i)=>Bm[fd(i)]>=W-1?D:0);
      if(edges.some(([a,b])=>sh[ix.get(b)]<sh[ix.get(a)]))continue;
      const fill=[];edges.forEach(([a,b,r])=>{for(let y=a.y+sh[ix.get(a)]+1;y<b.y+sh[ix.get(b)];y++)fill.push({cls:y===W-1||y===W?PLC_UG[L.mk]:PLC_BELT[L.mk],x:a.x,y,h:0,rot:r,pid:0})});
      const seen=new Set();let bad=false;
      IT.map((b,i)=>({...b,y:b.y+sh[i]})).concat(fill).forEach(m=>{const q=dim(m);for(let i=0;i<q.w;i++)for(let j=0;j<q.h;j++){const k=(m.x+i)+","+(m.y+j);if(seen.has(k))bad=true;else seen.add(k)}});
      if(!bad)best={D,W,sh,fill}}
     return best};
    let r0=0;
    while(Hh-r0>Fh){
      let ok=null,c=0;
      for(let e=Fh;e>=1;e--){const r=tryRow(r0+e);if(r&&(r.length===0||e>=d.h*FC+2-mx)){ok=r;c=r0+e;break}}   // a wall with nothing crossing it can be any tile height
      if(!ok){const g=gapRow(r0);if(!g)return{ok:false,why:"no free row to cross a wall within "+mx+" underground cells, even with a row gap: pick a higher belt Mk or a bigger block type"};
        IT.forEach((b,i)=>{b.y+=g.sh[i]});IT.push(...g.fill);ugs.push(...g.fill.filter(q=>q.cls===PLC_UG[L.mk]));Hh+=g.D;mkOcc();rc.push(g.W);r0=g.W;continue}
      rc.push(c);ugs.push(...ok);r0=c;
    }
  }
  const ug=new Set(ugs),pc=x=>cuts.filter(c=>c<=x).length,pr=y=>rc.filter(c=>c<=y).length;
  const ms=IT.map(b=>{const i=pc(b.x);let y;
    if(L.bank){const q=pr(b.y);y=q*TH+b.y-(rc[q-1]||0)}
    else{const g=Math.floor(Math.floor(b.y/L.pitch)/per);y=g*TH+b.y-g*per*L.pitch}
    return{...b,cls:ug.has(b)?PLC_UG[L.mk]:b.cls,x:i*TW+b.x-(i?cuts[i-1]:0),y}});
  const seen=new Set();let ov=0;   // cells claimed by two items: a layout bug, the caller retries or reports it
  for(const m of ms){const e=dim(m);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++){const k=(m.x+i)+","+(m.y+j);if(seen.has(k))ov++;else seen.add(k)}}
  const cols=cuts.length+1,rows=L.bank?rc.length+1:Math.ceil(L.lanes/per),blocks=[];
  for(let g=0;g<rows;g++)for(let i=0;i<cols;i++)
    if(ms.some(m=>m.x>=i*TW&&m.x<(i+1)*TW&&m.y>=g*TH&&m.y<(g+1)*TH))blocks.push({cls,x:i*d.w,y:g*d.h});
  const span=ugPairs(ms.filter(isM)).filter(p=>p&&p.n>mx).length;   // a pair longer than the Mk span (ugPairs pairs same-row UGs in order): layout bug, placerTile skips it
  return{ok:true,blocks,ms,ug:ugs.length,cols,rows,max:mx,rc,ov,span};
}
// best block type among the ticked ones (fewest blocks); no tick fits -> the reason of the last failure
function placerTile(L,ok){
  try{return placerTileX(L,ok)}catch(e){return{ok:false,why:"internal error while fitting the blocks ("+e.message+")",blocks:[]}}
}
function placerTileX(L,ok){
  let best=null,why="";
  const Gs=PLC_G?[PLC_G]:Array.from({length:L.bank?L.t0:1},(_,i)=>i+1);
  PL_STD.forEach((nm,i)=>{if(!ok[i])return;const cls=plcCls(nm);
    for(const G of Gs){
      const run1=(sep,novc)=>{PLC_NOVC=novc;let L2;try{L2=L.bank?placerLayout(L.src.P,L.src.item,L.src.mk,L.src.spMk,{...L.src.o,fit:plcFit(cls,L.mk),G,sep}):L}finally{PLC_NOVC=false}
        return L2.ok?{...placerCut(L2,cls),L2}:{ok:false,why:L2.why}};
      // 3 inputs: variant C is preferred; when its wall rows cannot be cut, the same stage is laid out with variant A
      const run=sep=>{const r1=run1(sep,false);return !r1.ok&&L.bank&&L.three?run1(sep,true):r1};
      let r=run(false);   // legacy layout first; sep layout (B chain segmented, on the left) only when legacy fails or overlaps
      if(L.bank&&L.two&&(!r.ok||r.ov||r.span)){const r2=run(true);if(r2.ok&&!r2.ov&&!r2.span)r=r2}
      if(r.ov){why="internal: overlap";continue}
      if(r.span){why="internal: underground pair longer than the belt span";continue}
      if(!r.ok){why=r.why;continue}
      r.G=G;r.L=r.L2;
      const sq=q=>Math.abs(q.cols-q.rows),ev=q=>q.L.even!==false;   // even bands first (existing plans unchanged); uneven bands only when no even band count fits
      if(!best||(ev(r)&&!ev(best))||(ev(r)===ev(best)&&(r.blocks.length<best.blocks.length||(r.blocks.length===best.blocks.length&&(sq(r)<sq(best)||(sq(r)===sq(best)&&G<best.G))))))best=r;
    }});
  return best||{ok:false,why:"Does not fit: "+why};
}
function placerPaste(){
  const P=pasting.pl,bs=P.blocks.map(q=>({id:uid++,cls:q.cls,x:hover.x+q.x,y:hover.y+q.y,h:layer,rot:0,pid:0}));
  const hit=bs.some(b=>{const d=dim(b);return S.blocks.some(o=>{if(isM(o)||o.h!==layer)return false;const e=dim(o);return hitR({x:o.x,y:o.y,w:e.w,h:e.h},{x:b.x,y:b.y,w:d.w,h:d.h})})});
  if(hit){toast("Block overlaps another block");return}
  const ms=P.ms.map(m=>({...m,id:uid++,mid:0,pid:0,x:hover.x*FC+m.x,y:hover.y*FC+m.y,h:layer}));
  const n0=S.blocks.length;S.blocks.push(...bs);const bad=noBuild(ms.map(mItem));S.blocks.length=n0;
  if(bad){toast(NOBUILD);return}
  push();S.blocks.push(...bs);cutBelts(ms.filter(isBelt));S.blocks.push(...ms);plcPlan=P.plan||null;sel=new Set();pasting=null;all();
}
let plcL=null;
let plcPlan=null;
let PLC_NOVC=false;   // set while placerTile retries a stage with variant A (variant C wall rows could not be cut)
let PLC_VC_FIRST=false;   // test hook: force 3-input variant C instead of variant A   // the last placed planner factory {item, rate}: drives the sim shortfall warning; not saved
// sim shortfall warning: mean of the last 12 samples of the planned item vs the requested rate (warns only, never blocks; no planned factory = no warning)
function plcWarn(ser){
  let e=$("prWarn");if(!e){e=document.createElement("div");e.id="prWarn";e.style.cssText="color:#ffb74d;font-weight:600;padding:4px 6px";const b=$("prBody");if(b)b.prepend(e)}
  const pl=plcPlan;if(!e||!pl||!ser||ser.length<12){if(e)e.textContent="";return}
  const got=ser.slice(-12).reduce((a,s)=>a+(s.it[pl.item]||0),0)/12;
  e.textContent=got<pl.rate*0.95?"Simulation returned "+Math.round(got)+"/min, you asked for "+pl.rate+"/min ("+plnNm(pl.item)+")":"";
}
const placerBk=()=>["plnBk11","plnBk21","plnBk22"].map(i=>$(i).checked);
function placerRun(open){
  const dl=$("plnPrev");if(!open&&!dl.open)return;
  const x=placerPlan(),L=x?placerLayout(x.P,x.it,x.mk,x.sp??x.mk,{box:$("plnBuf").value,mod:$("plnMod").checked}):{ok:false,why:"Pick an item and a rate first"};
  if(!L.ok){plcL=null;plcT=null;placerClear();$("plnPrevErr").textContent=L.why;$("plnPlace").disabled=true;if(!dl.open)dl.showModal();return}
  plcL=L;placerPreview(L);
}
function placerGo(){$("pvMk").value=$("plnMk").value;$("pvSp").value=$("plnSp").value;$("pvRate").value=$("plnRate").value;placerRun(true)}
// live modal: build settings re-run the preview; errors show inside the modal with Place off
const placerLive=()=>placerRun(false);
function placerClear(){
  ["pvMach","pvBelt","pvSpl","pvBox","pvUg","pvBlk","pvCell","pvIO"].forEach(i=>{if($(i))$(i).textContent="-"});
  $("plnPrevNote").textContent="";$("plnPrevBig").textContent="";
  const c=$("plnPrevMap"),g=c.getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);
}
let plcV={z:1,ox:0,oy:0},plcRaf=0;
let plcT=null;   // last tile result (placerTile) for the open preview
let plcBig=false;   // big-factory confirm asked for the current preview
const plcTT=()=>plcT&&plcT.ok?plcT:{blocks:[{cls:plcCls("BPO_Station_02"),x:0,y:0}],ms:plcL.items};
const plcExt=T=>({w:Math.max(...T.blocks.map(q=>(q.x+dim({cls:q.cls,rot:0}).w)*FC),...T.ms.map(m=>m.x+dim(m).w)),h:Math.max(...T.blocks.map(q=>(q.y+dim({cls:q.cls,rot:0}).h)*FC),...T.ms.map(m=>m.y+dim(m).h))});
// setting a canvas size reallocates it even when unchanged: only assign when the size really differs (per-frame realloc was the zoom lag)
const plcSetSize=(c,w,h)=>{if(c.width!==w)c.width=w;if(c.height!==h)c.height=h};
function placerSize(){const c=$("plnPrevMap"),v=$("plnPrevView");plcSetSize(c,Math.max(1,v.clientWidth),Math.max(1,v.clientHeight));return{w:c.width,h:c.height}}   // content box (border excluded): canvas CSS size = attribute size, no rescale
const PLC_PAD=1;   // floor cells the drawn shell sticks out beyond a block tile (hull wall, doorway strip), all sides
// pixel box of the last placerShot: alpha >= 140 = block shells, floors, items (grid and axis lines are fainter)
function placerBox(w,h){const d=$("plnPrevMap").getContext("2d").getImageData(0,0,w,h).data;let l=w,t=h,r=-1,b=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>=140){if(x<l)l=x;if(x>r)r=x;if(y<t)t=y;if(y>b)b=y}
  return r<0?null:{l,t,r:r+1,b:b+1}}
// pass 1: layout extents + PLC_PAD; pass 2: scale so the measured drawn box (shells, doorways, items) fills the view minus 12px, centred
function placerFitView(){if(!plcL)return;const {w,h}=placerSize(),E=plcExt(plcTT()),ew=E.w+2*PLC_PAD,eh=E.h+2*PLC_PAD;
  const s=Math.min((w-24)/ew,(h-24)/eh);plcV.z=Math.min(60,Math.max(.01,s/CELLS.F));let k=CELLS.F*plcV.z;plcV.ox=(w-ew*k)/2+PLC_PAD*k;plcV.oy=(h-eh*k)/2+PLC_PAD*k;
  placerShot();
  const bx=placerBox(w,h);if(!bx)return;
  const qx=(bx.l+bx.r)/2-plcV.ox,qy=(bx.t+bx.b)/2-plcV.oy,f=Math.min((w-24)/(bx.r-bx.l),(h-24)/(bx.b-bx.t));
  plcV.z=Math.min(60,Math.max(.01,plcV.z*f));const r=CELLS.F*plcV.z/k;
  plcV.ox=w/2-qx*r;plcV.oy=h/2-qy*r;placerShot()}
function placerShot(){
  const L=plcL;if(!L||!$("plnPrev").open)return;
  const {w,h}=placerSize(),T=plcTT();
  const sv={S:S.blocks,view,layer,V,W,H,dpr,sel,active,pasting,drag,ugPend,mode,SM,OV,hoverIn,cw:cv.width,ch:cv.height};PLC_PREV=true;
  try{
    S.blocks=[...T.blocks.map((q,i)=>({id:i+1,cls:q.cls,x:q.x,y:q.y,h:0,rot:0,pid:0})),...T.ms.map((it,i)=>({...it,id:T.blocks.length+i+1,h:0}))];
    view="F";layer=0;V={ox:plcV.ox,oy:plcV.oy,z:plcV.z};W=w;H=h;dpr=1;sel=new Set();active=null;pasting=null;drag=null;ugPend=null;mode=null;SM=false;OV={};hoverIn=false;SV++;
    plcSetSize(cv,w,h);
    paint();
    const g=$("plnPrevMap").getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(cv,0,0);
  }finally{
    S.blocks=sv.S;view=sv.view;layer=sv.layer;V=sv.V;W=sv.W;H=sv.H;dpr=sv.dpr;sel=sv.sel;active=sv.active;pasting=sv.pasting;drag=sv.drag;ugPend=sv.ugPend;mode=sv.mode;SM=sv.SM;OV=sv.OV;hoverIn=sv.hoverIn;SV++;
    cv.width=sv.cw;cv.height=sv.ch;paint();PLC_PREV=false;
  }
}
function placerPreview(L){
  plcBig=false;$("plnPrevBig").textContent="";$("plnPlace").textContent="Place";
  const ok=placerBk();plcT=ok.some(Boolean)?placerTile(L,ok):null;
  const src=plcT&&plcT.ok?plcT.ms:L.items,k={mach:0,belt:0,spl:0,box:0,ug:0},
    kd=b=>b.rec?"mach":PLC_UG.includes(b.cls)?"ug":PLC_BELT.includes(b.cls)?"belt":PLC_SPL.includes(b.cls)?"spl":"box";
  src.forEach(b=>k[kd(b)]++);
  $("pvMach").textContent=k.mach;$("pvBelt").textContent=k.belt;$("pvSpl").textContent=k.spl;$("pvBox").textContent=k.box;
  const bc={};if(plcT&&plcT.ok)plcT.blocks.forEach(q=>bc[BASE[q.cls].name]=(bc[BASE[q.cls].name]||0)+1);
  $("pvBlk").textContent=!plcT?"0 (existing floor)":plcT.ok?Object.entries(bc).map(([n,c])=>c+" x "+n).join(", "):"none fits";
  if($("pvUg"))$("pvUg").textContent=k.ug?k.ug+" ("+k.ug/2+" pairs, span "+(plcT&&plcT.ok&&plcT.max!=null?plcT.max:"-")+" max)":"0";
  $("pvCell").textContent=L.w+" x "+L.h;
  const LL=plcT&&plcT.ok&&plcT.L||L;
  $("pvIO").textContent=L.mod?(L.bank?"IN west ("+LL.nIn+" belt"+(LL.nIn>1?"s":"")+"), OUT east ("+LL.nOut+" belt"+(LL.nOut>1?"s":"")+"), "+LL.hubs+" hub container(s) between stages; copy width "+L.w:"IN west, OUT east (same row"+(L.lanes>1?" per lane":"")+"); copy width "+L.w):L.bank?"closed: "+LL.nS+" source + "+LL.nS+" in-buffer west, "+LL.nK+" out-buffer + "+LL.nK+" sink east"+(LL.stages>1?" + "+LL.hubs+" hub container(s) between stages":""):"closed: source container in, sink container out";
  $("plnPrevNote").textContent=L.note.concat(plcT&&plcT.ok&&plcT.blocks.length>1?["Chose "+plcT.cols+" x "+plcT.rows+" blocks: fewest blocks, then squarest"+(plcT.L.bank?"; "+plcT.G+" band(s) of "+(plcT.L.stages>1?plcT.L.tbs.join("+")+" trunks per stage":plcT.L.tb+" trunk(s)"):"")+"; "+k.ug/2+" underground pairs cross the walls"]:[]).join(". ");
  if(L.bank)$("pvIO").textContent+="; "+k.box+" containers in all";
  $("plnPrevErr").textContent=plcT&&!plcT.ok?plcT.why:"";const dl=$("plnPrev");if(!dl.open){dl.showModal();requestAnimationFrame(placerFitView)}$("plnPlace").disabled=!!(plcT&&!plcT.ok);placerFitView();
}
function placerPlace(){
  const L=plcL;if(!L)return;
  const ok=placerBk();
  if(ok.some(Boolean)){
    const T=placerTile(L,ok);
    if(!T.ok){$("plnPrevErr").textContent=T.why;return}
    if(T.blocks.length>PLC_BIG&&!plcBig){plcBig=true;$("plnPrevBig").textContent="This factory needs "+T.cols+" x "+T.rows+" blocks ("+T.blocks.length+" blocks). Build it, or lower the output / change belt, splitter or buffer.";$("plnPlace").textContent="Build it";return}
    plcL=null;$("plnPrev").close();
    setView("L");clip=[];active=null;mode=null;sel=new Set();
    pasting={rot:0,fl:false,pl:{blocks:T.blocks,ms:T.ms,plan:{item:L.src.item,rate:+$("plnRate").value}}};
    toast("Click to place the "+T.blocks.length+" block(s), then connect them to your blocks. Esc cancels");all();
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
$("plnCancel").onclick=()=>$("plnPrev").close();$("plnPrev").addEventListener("close",()=>{plcL=null;plcT=null});
$("plnPrevMap").addEventListener("wheel",e=>{e.preventDefault();plcZ(plcP(e),e.deltaY<0?1.12:1/1.12)},{passive:false});
let plcSt=null;
const plcM=$("plnPrevMap");
plcM.addEventListener("pointerdown",e=>{plcM.setPointerCapture(e.pointerId);plcSt={x:e.clientX,y:e.clientY,ox:plcV.ox,oy:plcV.oy}});
plcM.addEventListener("pointermove",e=>{if(!plcSt)return;plcV.ox=plcSt.ox+(e.clientX-plcSt.x);plcV.oy=plcSt.oy+(e.clientY-plcSt.y);plcDo()});
const plcEnd=()=>{plcSt=null};plcM.addEventListener("pointerup",plcEnd);plcM.addEventListener("pointercancel",plcEnd);
$("plnZi").onclick=()=>{const {w,h}=placerSize();plcZ({x:w/2,y:h/2},1.25)};
$("plnZo").onclick=()=>{const {w,h}=placerSize();plcZ({x:w/2,y:h/2},1/1.25)};
$("plnZf").onclick=()=>placerFitView();
// live wiring: build settings in the modal re-run the preview; Belt/Splitter = the planner selects, synced both ways
$("plnBk").addEventListener("change",placerLive);$("plnBuf").addEventListener("change",placerLive);$("plnMod").addEventListener("change",placerLive);
$("pvMk").addEventListener("change",()=>{$("plnMk").value=$("pvMk").value;$("plnMk").dispatchEvent(new Event("change"))});
$("pvSp").addEventListener("change",()=>{$("plnSp").value=$("pvSp").value;$("plnSp").dispatchEvent(new Event("change"))});
const plcSync=()=>{if(!$("plnPrev").open)return;$("pvMk").value=$("plnMk").value;$("pvSp").value=$("plnSp").value;$("pvRate").value=$("plnRate").value;placerLive()};
$("plnMk").addEventListener("change",plcSync);$("plnSp").addEventListener("change",plcSync);$("plnRate").addEventListener("change",plcSync);
// rate in the modal: same field the planner reads (placerPlan), kept in sync both ways
$("pvRate").addEventListener("change",()=>{$("plnRate").value=$("pvRate").value;placerLive()});
window.addEventListener("resize",()=>{if($("plnPrev").open)requestAnimationFrame(placerFitView)});
