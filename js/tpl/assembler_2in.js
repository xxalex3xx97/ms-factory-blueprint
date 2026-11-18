// TPL assembler_2in: modular FACTORY-ONLY block template for 2-input recipes on DAT_Assembler (5x5). Edge Interface v1 (js/tpl/iface.js must be loaded first).
// Pattern = the user's golden '2x2 10x assembler' column (js/bl_vc.js blVC) TRANSPOSED: one SET = 10 rows tall, flow runs WEST -> EAST.
//   set cells (y0 = set origin o_s): y0+0 slot0 copy0 lane, y0+1 slot0 copy1, y0+2 slot1 copy0, y0+3 slot1 copy1 (B2,B1,A2,A1), y0+4..8 machines (rot 3, pitch 5, from x=1, none on the edge columns), y0+9 collector (flows E to x=W-3).
//   machine input ports: N face (x+1 via splitter directly above, x+3 via splitter on the B1 lane + 2 crossover belts S), output ports S face -> collector.
//   two lane copies per item (M=2): group 0 = ceil(m/2) machines on the +1/+3 rows, group 1 = rest, fed by the +0/+2 rows which hop (UG) under the crossovers and turn S into the group-1 heads.
//   every manifold splitter has PRIORITY toward its machine (b.pr=[0,-1], face S): machines fill in order, last one partial.
// Sets (iface.js): 1x1/1x2 S=1 [0]; 2x2 S=3 [0,10,20]; 2x2c S=2 [4,15].
// Ports (local): in: x=0, y=y0+0..3, ports.in[t].item=perm[floor(t/2)] (spec.main = index of the chain item, default 0, goes to slot 0); out: x=W-1,y=y0 (collector row y0+9 -> trunk column W-2 -> y0, tplOutTail).
// ports.in[t].row=t (port index) and rows[t]={m:machines fed by that lane}: checkPlan (tests/tpl_plan.mjs) injects flow*(nj/N)*rows[row].m/nj per port. ports.in[t].set = set index.
// Stubs: all 4 lane rows and the out row always have a belt at the edge (A2/B2 dead-end when a set has 1 machine, all when 0 machines).
// Needs globals of the page: PLC_BELT/PLC_UG/PLC_SPL, portsOf, pfSplOff, RECS, rk, BL, iface.js.
const TPL_A2_BLK={'1x1':{b:'BPO_Station_01',W:14,H:14,S:1},'1x2':{b:'BPO_Station_2x1',W:30,H:14,S:1},'2x2':{b:'BPO_Station_02',W:30,H:30,S:3},'2x2c':{b:'BPO_Station_03',W:30,H:30,S:2}};
const TPL_A2_CAP=[60,120,180];   // belt cap/min per Mk (mirrors inspector.js MKS)
// per-set limit: min((W-2)/5, 2*g (two lane copies), collector cap/out rate). g = floor(tplDerate()*cap/max input rate).
function tplA2Lim(spec){
  const B=TPL_A2_BLK[spec.block];if(!B)return{ok:false,why:'unknown block '+spec.block};
  const mk=spec.mk==null?1:spec.mk,cap=TPL_A2_CAP[mk],der=tplDerate(),geom=Math.floor((B.W-2)/5);
  const rc=(typeof RECS!=='undefined'&&RECS['CRAFT_'+String(spec.cls).replace('DAT_','')]||[]).find(r=>rkm(r,spec.rec));
  if(!rc)return{ok:true,B,mk,cap,rc:null,g:Infinity,rin:null,rout:null,geom,nRow:geom,note:'recipe not in RECS: rates unchecked'};
  if(rc.i.length!==2)return{ok:false,why:'recipe has '+rc.i.length+' inputs, template is 2-input'};
  const f=q=>q*1800/rc.t,rin=rc.i.map(([,q])=>f(q)),rout=f(rc.o[1]),rmax=Math.max(...rin);
  const g=spec.ignoreRate?Infinity:Math.floor(der*cap/rmax),oc=spec.ignoreRate?Infinity:Math.max(1,Math.floor(cap/rout));
  if(g<1)return{ok:false,why:'one machine needs '+rmax+'/min > DERATE*cap '+der*cap};
  return{ok:true,B,mk,cap,rc,g,rin,rout,geom,oc,nRow:Math.min(geom,2*g,oc),warn:rout>cap?'one machine output exceeds belt cap':null};
}
function tplMax(spec){const LN=tplLanesPlan(spec);if(LN)return tplLanesMax(LN);const L=tplA2Lim(spec);return L.ok?L.nRow*L.B.S:0}
function tplBuild(spec){
  const LN=tplLanesPlan(spec);if(LN)return tplLanesBuild(LN,spec.n);   // multi-lane (js/tpl/iface.js): item rate above one belt
  const L=tplA2Lim(spec);if(!L.ok)return{ok:false,why:L.why};
  const {B,mk}=L,nMax=L.nRow*B.S,n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1',nMax};
  if(n>nMax)return{ok:false,why:'n '+n+' > nMax '+nMax+' for '+spec.block,nMax};
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spec.spMk==null?1:spec.spMk],W=B.W,items=[],ports={in:[],out:[]},rows=[];
  const mp=portsOf({cls:spec.cls,x:0,y:0,rot:3,off:[]}),keysW=mp.filter(p=>p.nx===-1).map(p=>p.key),keysE=mp.filter(p=>p.nx===1).map(p=>p.key);   // faces along the row: first machine disables W, last E
  const O={AMID:pfSplOff(sc,0,['E','S']),AEND:pfSplOff(sc,0,['S']),BMID:pfSplOff(sc,0,['E','S']),BEND:pfSplOff(sc,0,['S'])};
  const main=spec.main|0,perm=[main,...[0,1].filter(i=>i!==main)],T=tplIfSets(spec.block,B.S);
  let left=n;const sets=[];
  for(let k=0;k<B.S;k++){
    const y0=T.o[k],m=Math.min(L.nRow,left);left-=m;sets.push({o:y0,n:m,outs:[y0+9]});
    const put=(c,x,y,rot,o)=>items.push({cls:c,x,y:y0+y,rot,h:0,pid:0,...o}),Bt=(x,y,rot)=>put(bc,x,y,rot),U=(x,y)=>put(ug,x,y,0),P=(x,y,t)=>put(sc,x,y,0,{off:O[t],pr:[0,-1]});
    const s1=Math.ceil(m/2),cnt=[m-s1,s1,m-s1,s1];   // machines fed by lane row y0+0..3
    for(let c=0;c<4;c++){ports.in.push({x:0,y:y0+c,item:perm[c>>1],dir:'E',set:k,copy:c&1,lane:['B2','B1','A2','A1'][c],row:ports.in.length});rows.push({m:cnt[c]})}
    ports.out.push({x:W-1,y:y0+9,o:y0,dir:'E',set:k});
    const r=i=>1+5*i;
    if(m===0){[0,1,2,3].forEach(y=>Bt(0,y,0));Bt(W-1,9,0);continue}
    for(let i=0;i<m;i++){const off=[...(i===0?keysW:[]),...(i===m-1?keysE:[])];put(spec.cls,r(i),4,3,{rec:spec.rec,...(off.length?{off}:{})})}
    // lane A1 (y 3)
    for(let x=0;x<=r(0);x++)Bt(x,3,0);if(s1<m)Bt(r(s1),3,0);
    for(let i=0;i<m;i++){
      if(i===m-1)P(r(i)+1,3,'AEND');
      else if(i===s1-1)Bt(r(i)+1,3,1);
      else{P(r(i)+1,3,'AMID');U(r(i)+2,3);U(r(i)+4,3);Bt(r(i)+5,3,0)}
    }
    // lane B1 (y 1)
    for(let x=0;x<=r(0)+2;x++)Bt(x,1,0);if(s1<m)Bt(r(s1)+2,1,0);
    for(let i=0;i<m;i++){
      if(i===m-1)P(r(i)+3,1,'BEND');
      else if(i===s1-1)Bt(r(i)+3,1,1);
      else{P(r(i)+3,1,'BMID');U(r(i)+4,1);U(r(i)+6,1);Bt(r(i)+7,1,0)}
    }
    // crossovers: B splitter S output runs through (x,2),(x,3) into the machine port
    for(let i=0;i<m;i++){Bt(r(i)+3,2,1);Bt(r(i)+3,3,1)}
    if(s1<m){
      for(let x=0;x<=r(0)+1;x++)Bt(x,2,0);   // lane A2 (y 2), group 0 only
      for(let i=0;i<s1;i++){U(r(i)+2,2);U(r(i)+4,2);if(i<s1-1){Bt(r(i)+5,2,0);Bt(r(i)+6,2,0)}}
      Bt(r(s1),2,1);
      for(let x=0;x<=r(0)+3;x++)Bt(x,0,0);   // lane B2 (y 0)
      for(let i=0;i<s1;i++){U(r(i)+4,0);U(r(i)+6,0);if(i<s1-1){Bt(r(i)+7,0,0);Bt(r(i)+8,0,0)}}
      Bt(r(s1)+2,0,1);
    }else{Bt(0,2,0);Bt(0,0,0)}   // stubs
    for(let x=1;x<=W-3;x++)Bt(x,9,0);   // collector to W-3, then the east tail jog
    const tl=[];tplOutTail(tl,{bc,W,yc:9,yo:9});tl.forEach(q=>items.push({...q,y:y0+q.y}));
  }
  const st={belts:0,ug:0,spl:0,machines:0};
  items.forEach(b=>{if(PLC_BELT.includes(b.cls))st.belts++;else if(PLC_UG.includes(b.cls))st.ug++;else if(PLC_SPL.includes(b.cls))st.spl++;else st.machines++});
  return{ok:true,items,w:W,h:B.H,ports,rows,sets:B.S,nMax,nRow:L.nRow,g:L.g,blockCls:B.b,stats:st,rin:L.rin,rout:L.rout,warn:L.warn||null,iface:{v:1,block:spec.block,S:B.S,M:2,k:2,main,sets,side:[]}};
}
