// Edge Interface v1: standard lane slots shared by all js/tpl/*.js templates. Spec: vault main-sequence/tasks/2026-11-13-edge-interface-v1.md
// Global script (page) and node-loadable (tests/tpl_iface.mjs). Needs BL (js/bl_plan.js) for tplDerate.
// TPL_IF_SETS[block][S] = set origin rows o_s (top row of each set). Only these S are allowed.
const TPL_IF_SETS={'1x1':{1:[0],2:[0,7]},'1x2':{1:[0],2:[0,7]},'2x2':{1:[0],2:[0,15],3:[0,10,20],4:[0,8,16,23],6:[0,5,10,15,20,25]},'2x2c':{1:[4],2:[4,15],3:[4,12,19],4:[4,9,14,19]}};
const TPL_IF_H={'1x1':14,'1x2':14,'2x2':30,'2x2c':30};
// {ok,o:[origins],hs:[rows owned by each set: next origin minus origin, last set runs to block bottom]}
function tplIfSets(block,S){
  const T=TPL_IF_SETS[block],o=T&&T[S];
  if(!o)return{ok:false,why:'S '+S+' not allowed for '+block,o:[],hs:[]};
  const H=TPL_IF_H[block];
  return{ok:true,o:o.slice(),hs:o.map((v,i)=>(i+1<o.length?o[i+1]:H)-v)};
}
// slot rows of set s: slot i copy c at o_s+i*M+c (i<k items, c<M). out = o_s.
function tplIfRows(block,S,s,k,M){
  const t=tplIfSets(block,S);
  if(!t.ok)return{in:[],out:null,why:t.why};
  const o=t.o[s],rows=[];
  for(let i=0;i<k;i++)for(let c=0;c<M;c++)rows.push(o+i*M+c);
  return{in:rows,out:o};
}
// East tail jog: collector row yc ends at W-3 (caller builds it). Appends belts: (W-2,yc) rot3 .. (W-2,yo+1) rot3, (W-2,yo) rot0, (W-1,yo) rot0. yc==yo: straight.
function tplOutTail(items,o){
  const {bc,W,yc,yo}=o,b=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0});
  if(yc===yo){b(W-2,yo,0);b(W-1,yo,0);return items}
  b(W-2,yc,3);
  for(let y=yc-1;y>yo;y--)b(W-2,y,3);
  b(W-2,yo,0);b(W-1,yo,0);
  return items;
}
// the one derate knob (BL.DERATE). Default 1.0 (flow calc is demand-limited).
function tplDerate(){return typeof BL!=='undefined'&&BL.DERATE!=null?BL.DERATE:1.0}
// MULTI-LANE (brief G): recipes with a per-machine input above one belt (item rate > DERATE*cap) get m_i=ceil(rate/cap) parallel lanes per item. Shared by assembler_2in, advassembler_1_2in, enrichment_2_3in:
//   their tplMax/tplBuild call tplLanesPlan(spec): null = single-lane path, {ok:false,why} = refuse, else tplLanesBuild(plan,n).
// SET (rows from set origin o): a lane rows (N side, j=0 farthest) | machines (rot 0, pitch w+1) | b lane rows (S side, mirrored) | collector row. T=sum m_i lanes fill the machine's N ports first (a=ceil(T/2)), rest the S ports; both faces <= machine ports per face.
//   Lane j feeds port j: splitter on the lane row at the port column (priority toward the machine), feeder belts down/up through the nearer lane rows, nearer lanes hop the feeder columns with ONE UG pair per machine.
//   Output: first E port -> belt column in the 1-cell gap right of the machine -> collector row -> east tail (tplOutTail). S lanes hop that column. nSet = min(geometry, floor(m_i*cap/rate_i) = lane capacity, collector cap/out).
//   ports.in[t] = {x:0,y,item,set,copy,row:t} item-major (perm: spec.main first); rows[t]={m:n/m_i} (each of the n machines of a set taps every lane of its item: per-lane share).
const TPL_IF_W={'1x1':14,'1x2':30,'2x2':30,'2x2c':30},TPL_IF_B={'1x1':'BPO_Station_01','1x2':'BPO_Station_2x1','2x2':'BPO_Station_02','2x2c':'BPO_Station_03'},TPL_IF_CAP=[60,120,180];
function tplLanesPlan(spec){
  const rc=spec.recd||(typeof recsOf==='function'&&recsOf(def(spec.cls)).find(r=>rk(r)===spec.rec));
  if(!rc||!rc.i)return null;
  const mk=spec.mk==null?1:spec.mk,cap=TPL_IF_CAP[mk],der=tplDerate(),rin=rc.i.map(([,q])=>q*1800/rc.t),rout=rc.o[1]*1800/rc.t,m=rin.map(r=>Math.max(1,Math.ceil(r/(der*cap)-1e-9)));
  if(m.every(v=>v===1))return null;
  const W=TPL_IF_W[spec.block],H=TPL_IF_H[spec.block];if(!W)return{ok:false,why:'unknown block '+spec.block};
  const d=def(spec.cls),pp=portsOf({cls:spec.cls,x:0,y:0,rot:0,off:[]}),face=f=>pp.filter(p=>p.f===f).sort((a,b)=>a.x-b.x||a.y-b.y),PN=face('N'),PS=face('S'),PE=face('E'),PW=face('W'),T=m.reduce((s,v)=>s+v,0),nm=String(spec.cls).replace(/^DAT_/,'');
  const w=d.w,h=d.h,P=w+1,geo=Math.floor((W-4-w)/P)+1,lc=Math.min(...rin.map((r,i)=>Math.floor(m[i]*cap/r+1e-9))),oc=Math.max(1,Math.floor(cap/rout+1e-9)),nSet=Math.min(geo,lc,oc);
  // one machine per set (lane capacity = one machine): its W face is free, up to |PW| more lanes run straight in from the west edge
  const capW=nSet===1?PW.length:0,c=Math.max(0,T-PN.length-PS.length);
  if(c>capW)return{ok:false,why:nm+' recipe needs '+T+' input lanes ('+rin.map((r,i)=>Math.round(r)+'/min x'+m[i]).join(', ')+' on Mk'+(mk+1)+' belts) but a machine takes at most '+(PN.length+PS.length+capW)+' ('+(nSet===1?'N, S and W faces':'N and S faces; W/E are shared with neighbours')+')'};
  const a=Math.min(PN.length,Math.ceil((T-c)/2)),b=T-c-a,hSet=a+h+b+1;
  let S=0;for(const s of Object.keys(TPL_IF_SETS[spec.block]).map(Number).sort((x,y)=>y-x)){const t=tplIfSets(spec.block,s);if(t.ok&&t.hs.every(v=>v>=hSet)){S=s;break}}
  if(!S)return{ok:false,why:nm+' lane set needs '+hSet+' rows, block '+spec.block+' too low'};
  if(nSet<1)return{ok:false,why:nm+' lanes carry less than one machine input'};
  return{ok:true,spec,rc,mk,cap,rin,rout,m,T,a,b,c,w,h,P,hSet,S,W,H,nSet,nMax:nSet*S,PN,PS,PE,PW,blockCls:TPL_IF_B[spec.block]};
}
function tplLanesMax(L){return L.ok?L.nMax:0}
function tplLanesBuild(L,n){
  if(!L.ok)return{ok:false,why:L.why};
  const sp=L.spec,nMax=L.nMax;n|=0;
  if(n<1)return{ok:false,why:'n<1',nMax};
  if(n>nMax)return{ok:false,why:'n '+n+' > nMax '+nMax+' for '+sp.block,nMax};
  const {a,b,c:cW,w,h,P,W,PN,PS,PE,PW,m}=L,mk=L.mk,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[sp.spMk==null?mk:sp.spMk],T=tplIfSets(sp.block,L.S),items=[],ports={in:[],out:[]},rows=[],sets=[];
  const main=sp.main|0,perm=[main,...L.rc.i.map((_,i)=>i).filter(i=>i!==main)],lanes=[];perm.forEach(it=>{for(let c=0;c<m[it];c++)lanes.push({item:it,c})});
  const keep=['N0','N1'],allK=portsOf({cls:sp.cls,x:0,y:0,rot:0,off:[]}).map(p=>p.key);
  const offM=allK.filter(k=>!([...PN.slice(0,a),...PS.slice(0,b),...PW.slice(0,cW),PE[0]].some(p=>p.key===k)));
  const oN=pfSplOff(sc,0,['E','S']),oNe=pfSplOff(sc,0,['S']),oS=pfSplOff(sc,0,['E','N']),oSe=pfSplOff(sc,0,['N']);
  let left=n;
  for(let s=0;s<L.S;s++){
    const y0=T.o[s],k=Math.min(L.nSet,left);left-=k;sets.push({o:y0,n:k});
    const yM=y0+a,yB=yM+h,yc=yB+b,put=(cls,x,y,rot,o)=>items.push({cls,x,y,rot,h:0,pid:0,...o}),Bt=(x,y,r)=>put(bc,x,y,r),U=(x,y)=>put(ug,x,y,0);
    const rowOf=l=>l<a?y0+l:l<a+b?yB+b-1-(l-a):yM+PW[l-a-b].y;   // lane index -> absolute row
    lanes.forEach((ln,l)=>{ports.in.push({x:0,y:rowOf(l),item:ln.item,dir:'E',set:s,copy:ln.c,row:ports.in.length});rows.push({m:k/m[ln.item]})});
    ports.out.push({x:W-1,y:y0,dir:'E',set:s});
    if(!k){lanes.forEach((_,l)=>Bt(0,rowOf(l),0));Bt(W-1,y0,0);continue}
    const xm=i=>1+P*i;
    for(let i=0;i<k;i++)put(sp.cls,xm(i),yM,0,{rec:sp.rec,...(offM.length?{off:offM}:{})});
    for(let l=0;l<a+b;l++){   // l = lane index in [0,a) N side j=l, [a,a+b) S side j=l-a
      const north=l<a,j=north?l:l-a,pl=north?PN:PS,y=rowOf(l),skip=new Set(),spx=new Set(),eu=new Set();
      let last=0;
      for(let i=0;i<k;i++){
        const px=xm(i)+pl[j].x,hopEnt=(!north&&i>0)?xm(i)-2:(j>=1?xm(i)+pl[0].x-1:null),hopEx=j>=1?xm(i)+pl[j-1].x+1:(!north&&i>0?xm(i):null);
        if(hopEnt!=null){eu.add(hopEnt);eu.add(hopEx);for(let x=hopEnt+1;x<hopEx;x++)skip.add(x)}
        spx.add(px);last=px;
        const rotF=north?1:3,y1=north?y+1:yB,y2=north?yM-1:y-1;   // feeder cells between lane row and the tap row
        if(north)for(let yy=y+1;yy<=yM-1;yy++)Bt(px,yy,1);else for(let yy=y-1;yy>=yB;yy--)Bt(px,yy,3);
      }
      for(let x=0;x<=last;x++){
        if(skip.has(x))continue;
        if(eu.has(x))U(x,y);
        else if(spx.has(x))put(sc,x,y,0,{off:x===last?(north?oNe:oSe):(north?oN:oS),pr:[SPL_FACES.indexOf(north?'S':'N'),-1]});
        else Bt(x,y,0);
      }
    }
    for(let l=a+b;l<a+b+cW;l++)for(let x=0;x<xm(0);x++)Bt(x,rowOf(l),0);   // W-face lanes (single machine set): straight into the W port
    const xo0=xm(0)+w,yE=yM+PE[0].y;
    for(let i=0;i<k;i++){const xo=xm(i)+w;for(let y=yM+PE[0].y;y<yc;y++)Bt(xo,y,1)}
    for(let x=xo0;x<=W-3;x++)Bt(x,yc,0);
    const tl=[];tplOutTail(tl,{bc,W,yc,yo:y0});tl.forEach(q=>items.push(q));
  }
  const st={belts:0,ug:0,spl:0,machines:0};
  items.forEach(q=>{if(PLC_BELT.includes(q.cls))st.belts++;else if(PLC_UG.includes(q.cls))st.ug++;else if(PLC_SPL.includes(q.cls))st.spl++;else st.machines++});
  return{ok:true,items,w:W,h:L.H,ports,rows,sets:L.S,nMax,nRow:L.nSet,blockCls:L.blockCls,stats:st,rin:L.rin,rout:L.rout,lanes:L.m,warn:null,iface:{v:1,block:sp.block,S:L.S,M:Math.max(...m),k:L.rc.i.length,main,sets,side:[...new Set(ports.in.map(p=>p.y))]}};
}
// side-native lane rows (not standard): growth k=3 o+8; growth k=4 o+7,o+8; adv_4in item 3 at o+12; enr sandwich bottom group yM+9+(k-1-j) for j<k
const TPL_IF_SIDE={growth_k3:[8],growth_k4:[7,8],adv_4in_item3:[12],asm_3in:[],enr_sandwich_bottom:(yM,k)=>Array.from({length:k},(_,j)=>yM+9+(k-1-j))};
