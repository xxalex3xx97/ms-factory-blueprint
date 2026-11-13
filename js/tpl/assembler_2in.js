// TPL assembler_2in: modular FACTORY-ONLY block template for 2-input recipes on DAT_Assembler (5x5).
// Pattern = the user's golden '2x2 10x assembler' column (js/bl_vc.js blVC) TRANSPOSED: one "row" = 10 cells tall, flow runs WEST -> EAST.
//   row cells (y0 = row top): y0+0 B2 lane, y0+1 B1 lane, y0+2 A2 lane, y0+3 A1 lane, y0+4..8 machines (rot 3, pitch 5, no gap), y0+9 collector (flows E).
//   machine input ports: N face (x+1 = A via splitter directly above, x+3 = B via splitter on the B1 lane + 2 crossover belts S), output ports S face -> collector.
//   two lanes per item because one belt cannot feed 5 machines: group 0 = ceil(m/2) machines on A1/B1, group 1 = rest, fed by A2/B2 which hop (UG) under the crossovers and turn S into the group-1 heads.
// Row period is 10, so block rows sit at y0 = 0 (1x1, 1x2) and y0 = 0,10,20 (2x2, 2x2c): lane rows are IDENTICAL for every block type and every n.
// Ports (local to the block floor): in: x=0, y=y0+{0:B2,1:B1,2:A2,3:A1}, item = recipe input index (A=0, B=1), belt rot 0. out: x=W-1, y=y0+9, belt rot 0.
// Stubs: lanes with no consumer (A2/B2 when a row has 1 machine, all 4 lanes when a row has 0) end in ONE plain rot-0 belt at x=0 (dead end); a row without machines has no collector.
// Quantity m per row changes ONLY machines, their splitters/UG/crossovers/lane tails and the group split; everything else (u=0 lane heads, collector rows y0+9 up to the edge) is fixed.
// Fill: machines go to row 0 first (nRow each), then the next row. Needs globals of the page: PLC_BELT/PLC_UG/PLC_SPL, portsOf, pfSplOff, RECS, rk, BL.
const TPL_A2_BLK={'1x1':{b:'BPO_Station_01',W:14,H:14,R:1},'1x2':{b:'BPO_Station_2x1',W:30,H:14,R:1},'2x2':{b:'BPO_Station_02',W:30,H:30,R:3},'2x2c':{b:'BPO_Station_03',W:30,H:30,R:3}};
const TPL_A2_CAP=[60,120,180];   // belt cap/min per Mk (mirrors inspector.js MKS)
// per-row limit: min(width/5, 2*g (two lane groups), collector cap/out rate). g = floor(DERATE*cap/max input rate).
function tplA2Lim(spec){
  const B=TPL_A2_BLK[spec.block];if(!B)return{ok:false,why:'unknown block '+spec.block};
  const mk=spec.mk==null?1:spec.mk,cap=TPL_A2_CAP[mk],der=typeof BL!=='undefined'?BL.DERATE:0.5,geom=Math.floor(B.W/5);
  const rc=(typeof RECS!=='undefined'&&RECS['CRAFT_'+String(spec.cls).replace('DAT_','')]||[]).find(r=>rk(r)===spec.rec);
  if(!rc)return{ok:true,B,mk,cap,rc:null,g:Infinity,rin:null,rout:null,geom,nRow:geom,note:'recipe not in RECS: rates unchecked'};
  if(rc.i.length!==2)return{ok:false,why:'recipe has '+rc.i.length+' inputs, template is 2-input'};
  const f=q=>q*1800/rc.t,rin=rc.i.map(([,q])=>f(q)),rout=f(rc.o[1]),rmax=Math.max(...rin);
  const g=spec.ignoreRate?Infinity:Math.floor(der*cap/rmax),oc=spec.ignoreRate?Infinity:Math.max(1,Math.floor(cap/rout));
  if(g<1)return{ok:false,why:'one machine needs '+rmax+'/min > DERATE*cap '+der*cap};
  return{ok:true,B,mk,cap,rc,g,rin,rout,geom,oc,nRow:Math.min(geom,2*g,oc),warn:rout>cap?'one machine output exceeds belt cap':null};
}
function tplMax(spec){const L=tplA2Lim(spec);return L.ok?L.nRow*L.B.R:0}
function tplBuild(spec){
  const L=tplA2Lim(spec);if(!L.ok)return{ok:false,why:L.why};
  const {B,mk}=L,nMax=L.nRow*B.R,n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1',nMax};
  if(n>nMax)return{ok:false,why:'n '+n+' > nMax '+nMax+' for '+spec.block,nMax};
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spec.spMk==null?1:spec.spMk],W=B.W,items=[],ports={in:[],out:[]};
  const mp=portsOf({cls:spec.cls,x:0,y:0,rot:3,off:[]}),keysW=mp.filter(p=>p.nx===-1).map(p=>p.key),keysE=mp.filter(p=>p.nx===1).map(p=>p.key);   // faces along the row: first machine disables W, last E
  const O={AMID:pfSplOff(sc,0,['E','S']),AEND:pfSplOff(sc,0,['S']),BMID:pfSplOff(sc,0,['E','S']),BEND:pfSplOff(sc,0,['S'])};
  let left=n;
  for(let k=0;k<B.R;k++){
    const y0=10*k,m=Math.min(L.nRow,left);left-=m;
    const put=(c,x,y,rot,o)=>items.push({cls:c,x,y:y0+y,rot,h:0,pid:0,...o}),Bt=(x,y,rot)=>put(bc,x,y,rot),U=(x,y)=>put(ug,x,y,0),P=(x,y,t)=>put(sc,x,y,0,{off:O[t]});
    [[0,1,'B2'],[1,1,'B1'],[2,0,'A2'],[3,0,'A1']].forEach(([y,it,lane])=>ports.in.push({x:0,y:y0+y,item:it,dir:'E',lane,row:k}));
    ports.out.push({x:W-1,y:y0+9,dir:'E',row:k});
    const r=i=>5*i,s1=Math.ceil(m/2);
    if(m===0){[0,1,2,3].forEach(y=>Bt(0,y,0));continue}
    for(let i=0;i<m;i++){const off=[...(i===0?keysW:[]),...(i===m-1?keysE:[])];put(spec.cls,r(i),4,3,{rec:spec.rec,...(off.length?{off}:{})})}
    // lane A1 (y 3)
    Bt(0,3,0);if(s1<m)Bt(r(s1),3,0);
    for(let i=0;i<m;i++){
      if(i===m-1)P(r(i)+1,3,'AEND');
      else if(i===s1-1)Bt(r(i)+1,3,1);
      else{P(r(i)+1,3,'AMID');U(r(i)+2,3);U(r(i)+4,3);Bt(r(i)+5,3,0)}
    }
    // lane B1 (y 1)
    for(let x=0;x<=2;x++)Bt(x,1,0);if(s1<m)Bt(5*s1+2,1,0);
    for(let i=0;i<m;i++){
      if(i===m-1)P(r(i)+3,1,'BEND');
      else if(i===s1-1)Bt(r(i)+3,1,1);
      else{P(r(i)+3,1,'BMID');U(r(i)+4,1);U(r(i)+6,1);Bt(r(i)+7,1,0)}
    }
    // crossovers: B splitter S output runs through (x,2),(x,3) into the machine port
    for(let i=0;i<m;i++){Bt(r(i)+3,2,1);Bt(r(i)+3,3,1)}
    if(s1<m){
      Bt(0,2,0);Bt(1,2,0);   // lane A2 (y 2), group 0 only
      for(let i=0;i<s1;i++){U(r(i)+2,2);U(r(i)+4,2);if(i<s1-1){Bt(r(i)+5,2,0);Bt(r(i)+6,2,0)}}
      Bt(r(s1),2,1);
      for(let x=0;x<=3;x++)Bt(x,0,0);   // lane B2 (y 0)
      for(let i=0;i<s1;i++){U(r(i)+4,0);U(r(i)+6,0);if(i<s1-1){Bt(r(i)+7,0,0);Bt(r(i)+8,0,0)}}
      Bt(r(s1)+2,0,1);
    }else{Bt(0,2,0);Bt(0,0,0)}   // stubs
    for(let x=1;x<=W-1;x++)Bt(x,9,0);   // collector to the east edge
  }
  const st={belts:0,ug:0,spl:0,machines:0};
  items.forEach(b=>{if(PLC_BELT.includes(b.cls))st.belts++;else if(PLC_UG.includes(b.cls))st.ug++;else if(PLC_SPL.includes(b.cls))st.spl++;else st.machines++});
  return{ok:true,items,w:W,h:B.H,ports,nMax,nRow:L.nRow,g:L.g,rows:B.R,blockCls:B.b,stats:st,rin:L.rin,rout:L.rout,warn:L.warn||null};
}
