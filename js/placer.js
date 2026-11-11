// Build factory (Step 1): single-recipe, single-raw-input plan -> ghost. Layout is pure.
const PLC_BELT=["DAT_ConveyorBelt","DAT_ConveyorBelt2","DAT_ConveyorBelt3"],PLC_SPL=["DAT_Splitter","DAT_Splitter_2","DAT_Splitter_3"],PLC_BOX="DAT_Container";
const PL_STD=["BPO_Station_01","BPO_Station_2x1","BPO_Station_02"];   // smallest first; floors 14x14, 30x14, 30x30
const PLC_UG=["DAT_UndergroundBelt","DAT_UndergroundBelt_2","DAT_UndergroundBelt_3"];const plcCls=nm=>Object.keys(BASE).find(k=>BASE[k].kind==="b"&&BASE[k].name===nm);
const PLC_SRC=480;
let PLC_BANK=false;   // test hook only (slice 1): bank layout instead of the lane layout
let PLC_G=0;   // test hook: force band count
const PLC_MAXBLK=60;   // most station blocks one factory may spread over
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
function plcSpl(cls,rot){
  const ps=plcPp(cls,rot),e=dim({cls,rot}),f=rot===1?[0,1]:[0,-1],i=ps.find(p=>p.dir==="in"),o=ps.filter(p=>p.dir==="out");
  return i&&e.w===1&&e.h===1&&i.nx===-f[0]&&i.ny===-f[1]&&o.some(p=>p.nx===f[0]&&p.ny===f[1])&&o.some(p=>p.nx===1&&p.ny===0)&&o.some(p=>p.nx===-1&&p.ny===0)?{i,o}:null;
}
function plcStage(n,eI,eU,mk,spMk,eI2){
  const no=why=>({ok:false,why}),cb=plnCb(n.crafter);if(!cb)return no("No machine builds "+plnNm(n.item));
  const d=def(cb.id),inF=n.pmach*eI.flow/eU.flow,inF2=eI2?n.pmach*eI2.flow/eU.flow:0,m=Math.floor(MKS[mk][1]/Math.max(n.pmach,inF,inF2)+1e-9);
  if(m<1)return no("One machine needs "+plnR2(Math.max(n.pmach,inF,inF2))+"/min but a "+MKS[mk][0]+" belt carries "+MKS[mk][1]+"/min: pick a higher belt Mk");
  if(eI2){   // two inputs: both on one face of each machine column
    const ML=plcMach2(d.key,1),MR=plcMach2(d.key,-1);
    if(!ML||!MR)return no("Bank: "+plnNm(n.item)+" machine has no face with 2 input ports (2-input stage needs 2 ports on one face)");
    if(ML.w!==MR.w||ML.h!==MR.h||ML.ins.map(p=>p.y).join()!==MR.ins.map(p=>p.y).join())return no("Bank: the two machine columns do not line up (input ports on different rows)");
    if(ML.off.concat(MR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
    const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
    return{ok:true,n,dk:d.key,inF,m,N:n.machines,ML,MR,w:ML.w,h:ML.h,cin:ML.ins[0].y,Wb:2*ML.w+7,sc,rec:rk(n.rec),two:{ya:ML.ins[0].y,yb:ML.ins[1].y,inF2}}
  }
  const ML=plcMach(d.key,[1,0],[-1,0]),MR=plcMach(d.key,[-1,0],[1,0]);
  if(!ML||!MR)return no("Bank: the machine needs an input port and an output port on opposite faces");
  if(ML.w!==MR.w||ML.h!==MR.h||ML.inP.y!==MR.inP.y)return no("Bank: the two machine columns do not line up (input ports on different rows)");
  if(ML.off.concat(MR.off).some(p=>!p.tg))return no("Bank: machine has an unused port that cannot be disabled");
  const sc=PLC_SPL[spMk];if(!plcSpl(sc,1)||!plcSpl(sc,3))return no("Bank: splitter ports not as expected (Mk id unverified?)");
  return{ok:true,n,dk:d.key,inF,m,N:n.machines,ML,MR,w:ML.w,h:ML.h,cin:ML.inP.y,Wb:2*ML.w+3,sc,rec:rk(n.rec)};
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
  if(T.rec.i.length!==2)return no("Bank: "+T.rec.i.length+" inputs per machine: only 1 or 2 are supported");
  const side=top=>{const c=[],seen=new Set();let x=top;
    for(;;){const n=P.nodes[x];if(!n)return null;if(!n.rec)return{c,raw:x};
      if(seen.has(x)||n.rec.i.length!==1||P.edges.filter(e=>e.from===x).length!==1)return null;
      seen.add(x);c.unshift(n);x=n.rec.i[0][0]}};
  const [a,b]=T.rec.i.map(([x])=>side(x));
  if(!a||!b)return no("Bank: an input chain is not a single-input chain (a shared intermediate or a deeper input)");
  return{ok:true,ch:[...a.c,T],two:{B:b.c,rawB:b.raw},raw:a.raw};
}
function plcBanks(g,it){
  const {ML,MR,sc,w,h,cin,dk,rec,two}=g.S,{cnt,X0,fRow,lRow,Y0,R,up,xf,xe,bc,mk}=g,s=up?-1:1,vr=up?3:1,Yb=Y0+R*h;
  const bt=(x,y,r)=>({cls:bc,x,y,h:0,rot:r,pid:0}),ug=(x,y,r)=>({cls:PLC_UG[mk],x,y,h:0,rot:r,pid:0}),mc=(M,x,y)=>({cls:dk,x,y,h:0,rot:M.rot,pid:0,rec,off:M.off.map(p=>p.key)});
  const my=r=>up?Y0+(R-1-r)*h:Y0+r*h;
  cnt.forEach((n,k)=>{
    // two inputs: pair = ML | cL | TA | G | TB | cR | MR (TB is the B trunk, built later by plcTwoTB)
    const x0=X0[k],Tx=x0+w+(two?2:1),xr=Tx+w+(two?4:1),mrx=Tx+(two?4:1),nl=Math.ceil(n/2),nr=n-nl,fr=fRow[k],lr=lRow[k],ys=my(nl-1)+cin,sp=new Set(Array.from({length:nl},(_,r)=>my(r)+cin));
    for(let r=0;r<nl;r++)it.push(mc(ML,x0+1,my(r)));
    for(let r=0;r<nr;r++)it.push(mc(MR,mrx,my(r)));
    // A feed row: an earlier trunk's G and cR cells are an underground pair under its B trunk (TB cell is left to plcTwoTB)
    const cross=new Set(),tbc=new Set();if(two)for(let j=0;j<k;j++){cross.add(X0[j]+w+3);cross.add(X0[j]+w+5);tbc.add(X0[j]+w+4)}
    for(let x=xf;x<Tx;x++){if(tbc.has(x))continue;it.push(cross.has(x)?ug(x,fr,0):bt(x,fr,0))}
    for(let y=fr;up?y>=ys:y<=ys;y+=s)it.push(sp.has(y)?{cls:sc,x:Tx,y,h:0,rot:vr,pid:0,off:[]}:bt(Tx,y,vr));
    if(two)for(let r=0;r<nl;r++){const ya=my(r)+cin,yb=my(r)+two.yb;
      it.push(bt(x0+w+1,ya,2),ug(x0+w+1,yb,2),ug(x0+w+3,yb,2))}   // cL: belt west into ML (ya), UG exit west into ML (yb); G: UG entrance west under TA
    if(two)for(let r=0;r<nr;r++){const ya=my(r)+cin,yb=my(r)+two.yb;
      it.push(ug(x0+w+3,ya,0),ug(x0+w+5,ya,0),bt(x0+w+5,yb,0))}   // G: UG entrance east under TB; cR: UG exit east into MR (ya), belt east into MR (yb)
    for(let y=up?Yb-1:Y0;up?y>lr:y<lr;y+=s){it.push(bt(x0,y,vr));if(nr)it.push(bt(xr,y,vr))}
    for(let x=x0;x<xe;x++)it.push(bt(x,lr,0));
  });
}
// 2-input: the B trunk of each consumer trunk (column TB = x0+w+4) from its B feed row frB to the last yb row, splitters on yb rows, and the B feed belt along frB
function plcTwoTB(g,it){
  const {S,cnt,X0,Y0,R,up,xf,frB,bc}=g,w=S.w,h=S.h,yb=S.two.yb,sc=S.sc,s=up?-1:1,vr=up?3:1,my=r=>up?Y0+(R-1-r)*h:Y0+r*h;
  cnt.forEach((n,k)=>{
    const TB=X0[k]+w+4,nl=Math.ceil(n/2),ysb=my(nl-1)+yb,sp=new Set(Array.from({length:nl},(_,r)=>my(r)+yb));
    for(let y=frB[k];up?y>=ysb:y<=ysb;y+=s)it.push(sp.has(y)?{cls:sc,x:TB,y,h:0,rot:vr,pid:0,off:[]}:{cls:bc,x:TB,y,h:0,rot:vr,pid:0});
    for(let x=xf;x<TB;x++)it.push({cls:bc,x,y:frB[k],h:0,rot:0,pid:0});
  });
}
// cut a bank layout into floor-wide segments: put(x,wid,ctr) places a wid-wide part at x; if it overflows the floor, cut at the free column c (entrance c-1, exit c), c >= segment start + lo
function plcSeg(fw,lo){const q={s:0,cuts:[],bad:"",put(x,wid,ctr){
  if(fw&&x+wid+1-q.s>fw){const c=Math.max(x,q.s+lo);if(c-q.s>fw)q.bad="an underground belt cannot reach across the wall (needs "+lo+" free cells, floor is "+fw+" wide)";
    q.cuts.push(c);if(q.cuts.length+1>PLC_MAXBLK)q.bad="needs more than "+PLC_MAXBLK+" blocks";q.s=c;x=ctr?c+1:c;
    if(x+wid-q.s>fw)q.bad="a "+wid+" cell wide part does not fit a floor "+fw+" wide: tick a bigger block";}
  return x}};return q}
// floor size of a station block class + the shortest underground span (cells) the belt Mk can reach across a wall
const plcFit=(cls,mk)=>{const f=floorRect({cls,x:0,y:0,h:0,rot:0}),d=dim({cls,rot:0});return{fw:f.w,fh:f.h,lo:Math.max(2,d.w*FC+2-def(PLC_UG[mk]).maxApart),lh:Math.max(2,d.h*FC+2-def(PLC_UG[mk]).maxApart)}};
function placerBank(P,item,mk,spMk,o){
  const BX=o.box||PLC_BOX,no=why=>({ok:false,why}),tr=plcTree(P,item),cap=i=>MKS[i][1],SS=[];
  if(!tr.ok)return tr;
  const ch=tr.ch,n=ch.length,G=o.G||PLC_G||1,Bn=tr.two?tr.two.B:[],topB=Bn.length?Bn[Bn.length-1].item:(tr.two&&tr.two.rawB);
  for(let q=0;q<n;q++){const nd=ch[q],eI=P.edges.find(e=>e.from===(q?ch[q-1].item:tr.raw)&&e.to===nd.item),eU=P.edges.find(e=>e.from===nd.item&&(q<n-1?e.to===ch[q+1].item:e.to==null)),eI2=tr.two&&q===n-1?P.edges.find(e=>e.from===topB&&e.to===nd.item):null;
    const S=plcStage(nd,eI,eU,mk,spMk,eI2);if(!S.ok)return S;SS.push(S)}
  if(tr.two&&!Bn.length)return no("Bank: a raw input straight into a 2-input machine is not built yet");
  const cp=plcPp(BX,0),cE=cp.filter(p=>p.nx===1).sort((a,b)=>a.y-b.y),cW=cp.filter(p=>p.nx===-1).sort((a,b)=>a.y-b.y),seq=a=>a.every((p,i)=>p.y===a[0].y+i);
  if(!cE.length||!cW.length||!seq(cE)||!seq(cW))return no("Bank: container E/W ports not found or not on consecutive rows");
  const bw=def(BX).w,bh=def(BX).h;
  const dist=(n,t)=>Array.from({length:t},(_,k)=>Math.floor(n/t)+(k<n%t?1:0));
  const bt=(x,y)=>({cls:PLC_BELT[mk],x,y,h:0,rot:0,pid:0}),bx=(x,y,ct)=>({cls:BX,x,y,h:0,rot:0,pid:0,ct});
  const ps=Math.max(1,Math.min(cE.length,cW.length,Math.floor(PLC_SRC/cap(mk))));
  const Ns=SS.map(S=>S.N),t0s=Ns.map((N,q)=>Math.ceil(N/SS[q].m));
  for(let q=0;q<n;q++){const d0=dist(Ns[q],t0s[q])[0]*Math.max(SS[q].inF,SS[q].two?SS[q].two.inF2:0);if(cap(spMk)<d0-1e-9)return no("Splitter "+MKS[spMk][0]+" is too slow for a trunk ("+plnR2(d0)+"/min): set the splitter Mk higher")}
  const tbs=t0s.map(t=>Math.ceil(t/G));
  for(let q=0;q<n;q++)if(G*tbs[q]>Ns[q])return no("band count "+G+" does not fit "+Ns[q]+" machines");
  const alls=SS.map((S,q)=>dist(Ns[q],G*tbs[q])),nH=[0];   // nH[q]=hub containers per band between stage q-1 and q
  for(let q=1;q<n;q++){const a=tbs[q-1],b=tbs[q],hq=Math.max(Math.ceil(a/ps),Math.ceil(b/ps));if(hq>Math.min(a,b))return no("Hub between stages "+q+" and "+(q+1)+": "+a+" and "+b+" trunks cannot share "+hq+" hub containers ("+ps+" ports a side): pick a higher belt Mk or a bigger container");nH.push(hq)}
  const offs=(t,k,bal,pt)=>{const r=[];if(bal)dist(t,k).forEach((c,j)=>{for(let p=0;p<c;p++)r.push(j*bh+pt[p].y)});else for(let i=0;i<t;i++)r.push(Math.floor(i/ps)*bh+pt[i%ps].y);return r};
  const geo=b=>{const gs=[];let B=0;
    for(let q=0;q<n;q++){const S=SS[q],cnt=alls[q].slice(b*tbs[q],(b+1)*tbs[q]),nT=cnt.length,R=Math.ceil(cnt[0]/2),up=q%2===1;
      const nIn=q?nH[q]:Math.ceil(nT/ps),nOut=q<n-1?nH[q+1]:(o.feedOut?Math.ceil(o.feedOut.nT/ps):Math.ceil(nT/ps));
      const oi=offs(nT,nIn,q>0,cE),oo=offs(nT,nOut,q<n-1||!!o.feedOut,cW);
      const Y0=up?B+oi[0]-R*S.h:B+oi[nT-1]+1,Yend=Y0+R*S.h,Bo=up?Y0-1-oo[nT-1]:Yend-oo[0],ix=k=>up?k:nT-1-k;
      const ge={S,cnt,nT,R,up,nIn,nOut,oi,oo,Y0,Bi:B,Bo,fRow:cnt.map((_,k)=>B+oi[ix(k)]),lRow:cnt.map((_,k)=>Bo+oo[ix(k)])};
      if(q===n-1&&o.feedOut){const oiF=offs(o.feedOut.nT,nOut,true,cE);ge.feedRows=Array.from({length:o.feedOut.nT},(_,k)=>Bo+oiF[o.feedOut.up?k:o.feedOut.nT-1-k])}   // B chain: its out hub E ports feed the consumer B trunks
      gs.push(ge);B=Bo}
    return gs};
  const it=[],sg=plcSeg(o.fit&&o.fit.fw,o.fit&&o.fit.lo),hz=[];let x=2*bw+2,xf=2*bw+1;
  for(let q=0;q<n;q++){const X0=[];for(let k=0;k<tbs[q];k++){x=sg.put(x,SS[q].Wb,false);X0.push(x);x+=SS[q].Wb+1}
    const xe=sg.put(x,q<n-1||o.feedOut?bw:2*bw+1,true);hz.push({Xs:0,xf,X0,xe});
    if(q<n-1){xf=xe+bw;x=xe+bw+1}}   // junction q: one hub at xe (out side of stage q = in side of stage q+1); feeders start xe+bw
  if(sg.bad)return no(sg.bad);
  const gb=[];let oy=0;
  for(let b=0;b<G;b++){const gs=geo(b),i0=it.length;gb.push(gs);
    gs.forEach((g,q)=>{const {Xs,xf,X0,xe}=hz[q];
      if(q===0){for(let j=0;j<g.nIn;j++){const y=g.Bi+j*bh;if(!o.mod)it.push(bx(Xs,y,[{item:tr.raw,n:0,inf:true}]));it.push(bx(Xs+bw+1,y,[]))}
        g.oi.forEach(r=>{it.push(bt(Xs+bw,g.Bi+r));if(o.mod)for(let xx=Xs;xx<Xs+bw;xx++)it.push(bt(xx,g.Bi+r))})}
      plcBanks({S:g.S,cnt:g.cnt,X0,fRow:g.fRow,lRow:g.lRow,Y0:g.Y0,R:g.R,up:g.up,xf,xe,bc:PLC_BELT[mk],mk},it);
      for(let j=0;j<g.nOut;j++){const y=g.Bo+j*bh;it.push(bx(xe,y,[]));if(q===n-1&&!o.mod&&!o.feedOut)it.push(bx(xe+bw+1,y,[]))}
      if(q===n-1&&!o.feedOut)g.oo.forEach(r=>{it.push(bt(xe+bw,g.Bo+r));if(o.mod)for(let xx=xe+bw+1;xx<xe+2*bw+1;xx++)it.push(bt(xx,g.Bo+r))})});
    // 2-input: this band's share of the B chain (its own copy of the B planner, machines and flows scaled to the band), on the consumer feed side (below an up stage, above a down stage), right-aligned at the consumer input hub
    if(tr.two){
      const cI=n-1,gC=gs[cI],hC=hz[cI],nodesB={};
      const bad=Bn.find(nd=>nd.machines<G);if(bad)return no("band count "+G+" does not fit "+bad.machines+" machines of "+plnNm(bad.item));
      Bn.forEach(nd=>nodesB[nd.item]={...nd,machines:dist(nd.machines,G)[b]});
      const eB=P.edges.find(e=>e.from===topB&&e.to===ch[cI].item),bset=new Set(Bn.map(nd=>nd.item)),fB=alls[cI].slice(b*tbs[cI],(b+1)*tbs[cI]).reduce((a,c)=>a+c,0)/Ns[cI];
      const PB={raw:P.raw.filter(r=>r.item===tr.two.rawB),nodes:nodesB,cycle:false,edges:P.edges.filter(e=>(bset.has(e.from)||e.from===tr.two.rawB)&&e.to!==ch[cI].item).concat([{from:topB,to:null,flow:eB.flow}]).map(e=>({...e,flow:e.flow*fB}))};
      const rB=placerBank(PB,topB,mk,spMk,{...o,G:1,feedOut:{nT:tbs[cI],up:gC.up},fit:null});
      if(!rB.ok)return rB;
      const bi=it.slice(i0),dx=hz[cI-1].xe-rB.feed.x,y0=gC.up?Math.max(...bi.map(c=>c.y+dim(c).h))+2:Math.min(...bi.map(c=>c.y))-2-rB.h;
      rB.items.forEach(c=>it.push({...c,x:c.x+dx,y:c.y+y0}));
      plcTwoTB({S:gC.S,cnt:gC.cnt,X0:hC.X0,Y0:gC.Y0,R:gC.R,up:gC.up,xf:hC.xf,frB:rB.feed.rows.map(r=>r+y0),bc:PLC_BELT[mk]},it);
    }
    const sl=it.slice(i0),mn=Math.min(...sl.map(c=>c.y)),mx=Math.max(...sl.map(c=>c.y+dim(c).h));
    sl.forEach(c=>{c.y+=oy-mn});oy+=mx-mn+1}   // band min y -> oy, spare row between bands
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
    if(tr.two)nt.push("Two inputs into "+plnNm(ch[n-1].item)+": A "+plnNm(ch[n-2].item)+" (main chain) + B "+plnNm(topB)+" ("+Bn.length+" stage"+(Bn.length>1?"s":"")+", own band)");
    if(G>1)nt.push(G+" band(s) (machine counts may differ by 1 between bands), spare belt row between bands");
  }
  if(mk===2||spMk===2)nt.push("Mk3 belt/splitter ids are not verified");
  const W=Math.max(...items.map(b=>b.x+dim(b).w)),H=Math.max(...items.map(b=>b.y+dim(b).h));
  const feed=o.feedOut?{x:hz[n-1].xe-mnx,rows:gb[0][n-1].feedRows.map(y=>y-mny)}:null;
  const bandSum=q=>{const s=[];for(let b=0;b<G;b++)s.push(alls[q].slice(b*tbs[q],(b+1)*tbs[q]).reduce((a,c)=>a+c,0));return s.every(v=>v===s[0])};
  const even=SS.every((_,q)=>bandSum(q))&&Bn.every(nd=>nd.machines%G===0);   // every band holds the same machines per stage (uneven = fallback, see placerTile)
  return{ok:true,items,lanes:G*tbs[last],per:alls[last],makes:N*T.pmach,note:nt,mod:!!o.mod,box:BX,mk,pitch:H+1,w:W,h:H,bank:true,trunks:G*tbs[last],rows:Math.max(...gb.flat().map(g=>g.R)),nS,nK,ps,bands:G,tb:tbs[last],t0:Math.max(...t0s),cuts:sg.cuts.map(c=>c-mnx),src:{P,item,mk,spMk,o},tbs,stages:n,hubs,nIn:G*tbs[0],nOut:G*tbs[last],feed,even};
}
function placerPlan(){
  const it=$("plnItem").value,rate=+$("plnRate").value||0,pr=plnProto(),sp=$("plnSp").value,bal=$("plnBal").value,mk=+$("plnMk").value;
  if(!it||!(rate>0))return null;
  return{it,rate,mk,sp:sp===""?null:+sp,P:plan(it,rate,mk,{sp:sp===""?null:+sp,bal:bal===""?null:+bal},PLN_PICK,{proto:pr,enr:$("plnEnr").checked})};
}
// mk / spMk: 0-based MKS index (Mk1 = 0). o={box:container class, mod:bool}. Lanes: nL stacked copies of one row (machines rot 0, trunk y=-1 above, collector y=h below).
function placerLayout(P,item,mk,spMk,o={}){
  const BX=o.box||PLC_BOX,no=why=>({ok:false,why});
  const tr=plcTree(P,item);if(!tr.ok)return no(tr.why);
  if(tr.two||tr.ch.length>1)return placerBank(P,item,mk,spMk,o);
  const T=P.nodes[item],N=T.machines,eIn=P.edges.find(e=>e.from===P.raw[0].item&&e.to===item),eOut=P.edges.find(e=>e.to==null);
  const m0=Math.floor(MKS[mk][1]/Math.max(T.pmach,T.pmach*eIn.flow/eOut.flow)+1e-9);   // machines one belt feeds
  if(!o.mod&&(PLC_BANK||o.bank||N>m0))return placerBank(P,item,mk,spMk,o);
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
function placerCut(L,cls){
  const f=floorRect({cls,x:0,y:0,h:0,rot:0}),d=dim({cls,rot:0}),TW=d.w*FC,TH=d.h*FC,Fw=f.w,Fh=f.h,nm=BASE[cls].name;
  const mx=def(PLC_UG[L.mk]).maxApart,per=Math.floor((Fh+1)/L.pitch);
  if(!L.bank&&per<1)return{ok:false,why:(L.bank?"the factory is ":"one lane is ")+(L.pitch-1)+" cells tall, the "+nm+" floor is only "+Fh};
  const occ=new Map();L.items.forEach(b=>{const e=dim(b);for(let i=0;i<e.w;i++)for(let j=0;j<e.h;j++)occ.set((b.x+i)+","+(b.y+j),b)});
  const isB=b=>!!b&&PLC_BELT.includes(b.cls);
  const tryCut=c=>{
    const mk=[];
    for(let y=0;y<L.h;y++){const a=occ.get((c-1)+","+y),b=occ.get(c+","+y);
      if(a&&a===b)return null;
      if(L.bank){   // bank: only east-flowing belt pairs cross the wall; empty cells and vertical belts are fine
        if(a&&b){
          if(!(isB(a)&&isB(b)&&a.rot===0&&b.rot===0))return null;
          const sd=(q,dy)=>{const n=occ.get(q.x+","+(q.y+dy));return !!n&&isB(n)&&n.rot===(dy<0?1:3)};
          if(sd(a,-1)||sd(a,1)||sd(b,-1)||sd(b,1))return null;
          mk.push(a,b);
        }else if(a&&(!isB(a)||a.rot===0))return null;   // machine/box/belt flowing into nothing across the wall
        else if(b&&!isB(b))return null;
        continue;
      }
      if(isB(a)&&isB(b)&&a.rot===0&&b.rot===0){mk.push(a,b);continue}
      if(isB(a)||isB(b))return null;
    }
    const ms=new Set(mk);
    for(const it of L.items){if(isB(it))continue;
      for(const p of portsOf(it)){if(!p.en)continue;const t=occ.get((p.x+p.nx)+","+(p.y+p.ny));if(!t||!ms.has(t))continue;
        if(p.ny!==0||p.nx!==(t.x===c-1?1:-1))return null}}
    return mk;
  };
  const cuts=[],ugs=[];let s=0;
  if(L.cuts){for(const c of L.cuts){const r=tryCut(c);if(!r)return{ok:false,why:"internal: bank cut column "+c+" is not free"};cuts.push(c);ugs.push(...r)}}
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
      for(const it of L.items){if(isB(it))continue;
        for(const p of portsOf(it)){if(!p.en)continue;const t=occ.get((p.x+p.nx)+","+(p.y+p.ny));if(!t||!ms.has(t))continue;
          if(p.nx!==0||p.ny!==(t.rot===1?1:-1))return null}}
      return mk;
    };
    let r0=0;
    while(L.h-r0>Fh){
      let ok=null,c=0;
      for(let e=Fh;e>=Math.max(2,d.h*FC+2-mx);e--){const r=tryRow(r0+e);if(r){ok=r;c=r0+e;break}}
      if(!ok)return{ok:false,why:"no free row to cross a wall within "+mx+" underground cells: pick a higher belt Mk or a bigger block type"};
      rc.push(c);ugs.push(...ok);r0=c;
    }
  }
  const ug=new Set(ugs),pc=x=>cuts.filter(c=>c<=x).length,pr=y=>rc.filter(c=>c<=y).length;
  const ms=L.items.map(b=>{const i=pc(b.x);let y;
    if(L.bank){const q=pr(b.y);y=q*TH+b.y-(rc[q-1]||0)}
    else{const g=Math.floor(Math.floor(b.y/L.pitch)/per);y=g*TH+b.y-g*per*L.pitch}
    return{...b,cls:ug.has(b)?PLC_UG[L.mk]:b.cls,x:i*TW+b.x-(i?cuts[i-1]:0),y}});
  const cols=cuts.length+1,rows=L.bank?rc.length+1:Math.ceil(L.lanes/per),blocks=[];
  for(let g=0;g<rows;g++)for(let i=0;i<cols;i++)
    if(ms.some(m=>m.x>=i*TW&&m.x<(i+1)*TW&&m.y>=g*TH&&m.y<(g+1)*TH))blocks.push({cls,x:i*d.w,y:g*d.h});
  if(blocks.length>PLC_MAXBLK)return{ok:false,why:"needs "+blocks.length+" blocks, the limit is "+PLC_MAXBLK};
  return{ok:true,blocks,ms,ug:ugs.length,cols,rows,max:mx,rc};
}
// best block type among the ticked ones (fewest blocks); no tick fits -> the reason of the last failure
function placerTile(L,ok){
  let best=null,why="";
  const Gs=PLC_G?[PLC_G]:Array.from({length:L.bank?Math.min(12,L.t0):1},(_,i)=>i+1);   // ponytail: band ceiling 12 keeps huge plans fast
  PL_STD.forEach((nm,i)=>{if(!ok[i])return;const cls=plcCls(nm);
    for(const G of Gs){
      const L2=L.bank?placerLayout(L.src.P,L.src.item,L.src.mk,L.src.spMk,{...L.src.o,fit:plcFit(cls,L.mk),G}):L;
      if(!L2.ok){why=L2.why;continue}
      const r=placerCut(L2,cls);if(!r.ok){why=r.why;continue}
      r.G=G;r.L=L2;
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
  push();S.blocks.push(...bs);cutBelts(ms.filter(isBelt));S.blocks.push(...ms);sel=new Set();pasting=null;all();
}
let plcL=null;
const placerBk=()=>["plnBk11","plnBk21","plnBk22"].map(i=>$(i).checked);
function placerRun(open){
  const dl=$("plnPrev");if(!open&&!dl.open)return;
  const x=placerPlan(),L=x?placerLayout(x.P,x.it,x.mk,x.sp??x.mk,{box:$("plnBuf").value,mod:$("plnMod").checked}):{ok:false,why:"Pick an item and a rate first"};
  if(!L.ok){plcL=null;plcT=null;placerClear();$("plnPrevErr").textContent=L.why;$("plnPlace").disabled=true;if(!dl.open)dl.showModal();return}
  plcL=L;placerPreview(L);
}
function placerGo(){$("pvMk").value=$("plnMk").value;$("pvSp").value=$("plnSp").value;placerRun(true)}
// live modal: build settings re-run the preview; errors show inside the modal with Place off
const placerLive=()=>placerRun(false);
function placerClear(){
  ["pvMach","pvBelt","pvSpl","pvBox","pvUg","pvBlk","pvCell","pvIO"].forEach(i=>{if($(i))$(i).textContent="-"});
  $("plnPrevNote").textContent="";
  const c=$("plnPrevMap"),g=c.getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);
}
let plcV={z:1,ox:0,oy:0},plcRaf=0;
let plcT=null;   // last tile result (placerTile) for the open preview
const plcTT=()=>plcT&&plcT.ok?plcT:{blocks:[{cls:plcCls("BPO_Station_02"),x:0,y:0}],ms:plcL.items};
const plcExt=T=>({w:Math.max(...T.blocks.map(q=>(q.x+dim({cls:q.cls,rot:0}).w)*FC),...T.ms.map(m=>m.x+dim(m).w)),h:Math.max(...T.blocks.map(q=>(q.y+dim({cls:q.cls,rot:0}).h)*FC),...T.ms.map(m=>m.y+dim(m).h))});
function placerSize(){const c=$("plnPrevMap"),v=$("plnPrevView");c.width=Math.max(1,v.clientWidth);c.height=Math.max(1,v.clientHeight);return{w:c.width,h:c.height}}   // content box (border excluded): canvas CSS size = attribute size, no rescale
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
    cv.width=w;cv.height=h;
    paint();
    const g=$("plnPrevMap").getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);g.drawImage(cv,0,0);
  }finally{
    S.blocks=sv.S;view=sv.view;layer=sv.layer;V=sv.V;W=sv.W;H=sv.H;dpr=sv.dpr;sel=sv.sel;active=sv.active;pasting=sv.pasting;drag=sv.drag;ugPend=sv.ugPend;mode=sv.mode;SM=sv.SM;OV=sv.OV;hoverIn=sv.hoverIn;SV++;
    cv.width=sv.cw;cv.height=sv.ch;paint();PLC_PREV=false;
  }
}
function placerPreview(L){
  const ok=placerBk();plcT=ok.some(Boolean)?placerTile(L,ok):null;
  const src=plcT&&plcT.ok?plcT.ms:L.items,k={mach:0,belt:0,spl:0,box:0,ug:0},
    kd=b=>b.rec?"mach":PLC_UG.includes(b.cls)?"ug":PLC_BELT.includes(b.cls)?"belt":PLC_SPL.includes(b.cls)?"spl":"box";
  src.forEach(b=>k[kd(b)]++);
  $("pvMach").textContent=k.mach;$("pvBelt").textContent=k.belt;$("pvSpl").textContent=k.spl;$("pvBox").textContent=k.box;
  const bc={};if(plcT&&plcT.ok)plcT.blocks.forEach(q=>bc[BASE[q.cls].name]=(bc[BASE[q.cls].name]||0)+1);
  $("pvBlk").textContent=!plcT?"0 (existing floor)":plcT.ok?Object.entries(bc).map(([n,c])=>c+" x "+n).join(", "):"none fits";
  if($("pvUg"))$("pvUg").textContent=k.ug?k.ug+" ("+k.ug/2+" pairs, span "+(plcT?plcT.max:0)+" max)":"0";
  $("pvCell").textContent=L.w+" x "+L.h;
  const LL=plcT&&plcT.ok&&plcT.L||L;
  $("pvIO").textContent=L.mod?(L.bank?"IN west ("+LL.nIn+" belt"+(LL.nIn>1?"s":"")+"), OUT east ("+LL.nOut+" belt"+(LL.nOut>1?"s":"")+"), "+LL.hubs+" hub container(s) between stages; copy width "+L.w:"IN west, OUT east (same row"+(L.lanes>1?" per lane":"")+"); copy width "+L.w):L.bank?"closed: "+LL.nS+" source + "+LL.nS+" in-buffer west, "+LL.nK+" out-buffer + "+LL.nK+" sink east"+(LL.stages>1?" + "+LL.hubs+" hub container(s) between stages":""):"closed: source container in, sink container out";
  $("plnPrevNote").textContent=L.note.concat(plcT&&plcT.ok&&plcT.blocks.length>1?["Chose "+plcT.cols+" x "+plcT.rows+" blocks: fewest blocks, then squarest"+(plcT.L.bank?"; "+plcT.G+" band(s) of "+(plcT.L.stages>1?plcT.L.tbs.join("+")+" trunks per stage":plcT.L.tb+" trunk(s)"):"")+"; "+k.ug/2+" underground pairs cross the walls"]:[]).join(". ");
  if(L.bank)$("pvIO").textContent+="; "+k.box+" containers in all";
  $("plnPrevErr").textContent=plcT&&!plcT.ok?plcT.why:"";const dl=$("plnPrev");if(!dl.open){dl.showModal();requestAnimationFrame(placerFitView)}$("plnPlace").disabled=false;placerFitView();
}
function placerPlace(){
  const L=plcL;if(!L)return;
  const ok=placerBk();
  if(ok.some(Boolean)){
    const T=placerTile(L,ok);
    if(!T.ok){$("plnPrevErr").textContent=T.why;return}
    plcL=null;$("plnPrev").close();
    setView("L");clip=[];active=null;mode=null;sel=new Set();
    pasting={rot:0,fl:false,pl:{blocks:T.blocks,ms:T.ms}};
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
const plcSync=()=>{if(!$("plnPrev").open)return;$("pvMk").value=$("plnMk").value;$("pvSp").value=$("plnSp").value;placerLive()};
$("plnMk").addEventListener("change",plcSync);$("plnSp").addEventListener("change",plcSync);
window.addEventListener("resize",()=>{if($("plnPrev").open)requestAnimationFrame(placerFitView)});
