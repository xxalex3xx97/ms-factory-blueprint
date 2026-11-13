// TPL advassembler: DAT_AdvancedAssembler (9x9), 1- and 2-input recipes, factory-only block template. Script style (globals), needs PLC_BELT/PLC_SPL/PLC_UG, pfSplOff, portsOf, floorRect, plcCls, CATALOG, rk, BL.
// Pattern "mirrored pair": machine ports are 3 per face at local x/y 2,4,6; rot 0 for every machine, inputs on the face next to the lane columns, output on the opposite face.
//   2-wide row (1x2, 2x2): C0 col x=1 | M0 x=2..10 | A col x=11 | B col x=12 | M1 x=13..21 | C1 col x=22 | out belt to the east edge. 1x1: A col x=1, B col x=2, M1 x=3..11, C1 x=12.
//   Lane A is tapped by ONE splitter per row that feeds M0 (W output, direct), M1 (E output -> feeder belt over the B column) and the next row (S output, UG hop under the B->M0 feeder).
//   Lane B is the mirror (splitter feeds M1 direct, M0 via a feeder over the A column). One lane pair serves 2 machines per row -> 9 lane cells/machine.
//   Edge Interface v1 (S=1, M=1, origin 0): slot 0 (chain item, spec.main) enters (0,0), slot 1 enters (0,1) (k=1: only (0,0)); product leaves (W-1,0): C1 collector column flows UP to row 0, the left collector (row 2) side-joins it at (XC1,2). Machine rows pitch 9 from y=3. Lane columns: row 0 -> XB (port y+4), row 1 -> XA (port y+2); k=1 row 0 -> XA.
//   Every lane splitter has PRIORITY to its E output (M1 side), rest split W/S water-filling.
//   Fill order: M1 first, then M0, row by row from the top. Only machines + their taps + the collector cells next to them change with n; port cells (0,0),(0,1),(W-1,2) and the C1 out row are fixed.
// Needs js/tpl/iface.js loaded first (tplDerate). Spec: {block:'1x1'|'1x2'|'2x2'|'2x2c', cls, rec:<rk key>, n, mk, spMk, derate?}. derate default BL.DERATE (tplDerate()); pass a big value to ignore the rate limit (geometry tests).
const TPL_BLK={'1x1':'BPO_Station_01','1x2':'BPO_Station_2x1','2x2':'BPO_Station_02','2x2c':'BPO_Station_03'};
const TPL_CAP=[60,120,180],TPL_ADV='DAT_AdvancedAssembler';
function tplGeo(block){
  const nm=TPL_BLK[block];if(!nm)return null;
  const f=floorRect({cls:plcCls(nm),x:0,y:0,h:0,rot:0});if(!f)return null;
  const pair=f.w>=30,o=block==='2x2c'?4:0,R=Math.floor((f.h-3-o)/9);   // o = set origin row (Edge v1: 2x2c ports only on rows 4..25), everything is built at 0 and shifted by o at the end
  return{W:f.w,H:f.h,o,R,pair,m:pair?2:1,XA:pair?11:1,XB:pair?12:2,XM1:pair?13:3,XC1:pair?22:12,XM0:2,XC0:1,geom:R*(pair?2:1)};
}
function tplRecipe(rec){return(CATALOG.recipes.CRAFT_AdvancedAssembler||[]).find(r=>rkm(r,rec))||null}
// rates + limits -> {ok,why,k,g,nMax,...}; per-machine rate = qty*1800/t
function tplLimits(S){
  const G=tplGeo(S.block);if(!G)return{ok:false,why:'tpl: unknown block '+S.block};
  if(S.cls&&S.cls!==TPL_ADV)return{ok:false,why:'tpl: only '+TPL_ADV};
  const r=tplRecipe(S.rec);if(!r)return{ok:false,why:'tpl: recipe not an AdvancedAssembler recipe'};
  const k=r.i.length;if(k<1||k>2)return{ok:false,why:'tpl: '+k+' inputs (1 or 2 supported)'};
  const mk=S.mk==null?1:S.mk,cap=TPL_CAP[mk],der=S.derate==null?tplDerate():S.derate,rin=r.i.map(([,q])=>q*1800/r.t),rout=r.o[1]*1800/r.t,rmax=Math.max(...rin);
  if(rmax>cap)return{ok:false,why:'tpl: unsupported, one machine needs '+rmax+'/min on one lane, above the Mk'+(mk+1)+' belt ('+cap+'/min)',rin,rout,cap,G};
  if(rout>cap)return{ok:false,why:'tpl: output above one belt',rin,rout,cap,G};
  const gin=Math.floor(der*cap/rmax+1e-9),gout=Math.floor(der*cap/rout+1e-9),nMax=Math.min(G.geom,gin,gout);
  return{ok:true,k,r,G,mk,cap,der,rin,rout,gin,gout,nMax};
}
function tplMax(S){const LN=tplLanesPlan(S);if(LN)return tplLanesMax(LN);const L=tplLimits(S);return L.ok?L.nMax:0}
function tplBuild(S){
  const LN=tplLanesPlan(S);if(LN)return tplLanesBuild(LN,S.n);   // multi-lane (js/tpl/iface.js): item rate above one belt
  const L=tplLimits(S);if(!L.ok)return{ok:false,why:L.why};
  const {G,k,r,mk}=L,n=S.n,spMk=S.spMk==null?mk:S.spMk;
  if(!(n>=1))return{ok:false,why:'tpl: n<1'};
  if(n>L.nMax&&!S.force)return{ok:false,why:'tpl: n '+n+' > nMax '+L.nMax+(L.nMax<G.geom?' (rate: derate '+L.der+')':' (geometry)')};
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[],bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),ut=(x,y)=>items.push({cls:ug,x,y,rot:1,h:0,pid:0});
  const sp=(x,y,keep)=>{const it={cls:sc,x,y,rot:1,h:0,pid:0,off:pfSplOff(sc,1,keep)},pe=portsOf(it).find(p=>p.dir!=='in'&&p.nx===1&&p.ny===0);if(pe)it.pr=[prIdx(it,pe),-1];items.push(it)};
  const {W,H,o,pair,m,XA,XB,XM1,XC1,XM0,XC0}=G,rec=S.rec,allk=portsOf({cls:TPL_ADV,x:0,y:0,rot:0,off:[]}).map(p=>p.key);
  const mOff=(use)=>allk.filter(q=>!use.includes(q)),ins1=k===2?['W9','W10']:['W9'],ins0=k===2?['E3','E4']:['E3'];
  const rowsU=Math.floor((n-1)/m)+1,last=rowsU-1,has0=r_=>pair&&n>r_*m+1;
  for(let rr=0;rr<rowsU;rr++){
    const yb=3+9*rr;
    items.push({cls:TPL_ADV,x:XM1,y:yb,rot:0,h:0,pid:0,off:mOff([...ins1,'E5']),rec});
    if(has0(rr))items.push({cls:TPL_ADV,x:XM0,y:yb,rot:0,h:0,pid:0,off:mOff([...ins0,'W11']),rec});
  }
  // lane A column XA: k=2 entry row 1 (slot 1), k=1 entry row 0 (slot 0)
  const yA=k===1?0:1;
  for(let x=0;x<XA;x++)bt(x,yA,0);
  bt(XA,yA,1);
  for(let rr=0;rr<rowsU;rr++){
    const yb=3+9*rr,ya=yb+2,yB=yb+4,hop=k===2&&has0(rr)&&rr<last;
    for(let y=rr?yb-3:yA+1;y<ya;y++)bt(XA,y,1);
    sp(XA,ya,[...(has0(rr)?['W']:[]),'E',...(rr<last?['S']:[])]);
    bt(XB,ya,0);   // feeder A -> M1 (over the B column in a pair block)
    if(k===2&&pair&&has0(rr))bt(XA,yB,2);   // feeder B -> M0 over the A column
    if(rr<last){if(hop){ut(XA,ya+1);ut(XA,ya+3)}else for(let y=ya+1;y<=ya+3;y++)bt(XA,y,1)}
  }
  // lane B (y=0 entry), column XB (2-input only)
  if(k===2){
    for(let x=0;x<XB;x++)bt(x,0,0);
    bt(XB,0,1);
    for(let rr=0;rr<rowsU;rr++){
      const yb=3+9*rr,ya=yb+2,yB=yb+4;
      for(let y=rr?yb-4:1;y<=ya-2;y++)bt(XB,y,1);
      ut(XB,ya-1);ut(XB,ya+1);   // feeder (XB,ya) belongs to lane A, B hops under it
      sp(XB,yB,[...(has0(rr)?['W']:[]),'E',...(rr<last?['S']:[])]);
    }
  }
  // collectors: C1 always, C0 when a left machine exists; bottom out row H-1
  const yl=3+9*last+6,anyM0=has0(0);   // lowest out-port row; collectors flow UP to the out row y=2
  for(let y=2;y<=yl;y++)bt(XC1,y,3);bt(XC1,1,3);   // up to the out row 0
  for(let x=XC1;x<=W-1;x++)bt(x,0,0);
  if(anyM0){
    for(let y=3;y<=yl;y++)bt(XC0,y,3);
    for(let x=XC0;x<XA-1;x++)bt(x,2,0);
    items.push({cls:ug,x:XA-1,y:2,rot:0,h:0,pid:0},{cls:ug,x:XB+1,y:2,rot:0,h:0,pid:0});   // hop under the A and B columns
    for(let x=XB+2;x<XC1;x++)bt(x,2,0);
  }
  const main=S.main||0,perm=[main,...Array.from({length:k},(_,i)=>i).filter(i=>i!==main)];
  if(!(main>=0&&main<k))return{ok:false,why:'tpl: spec.main '+main+' out of range'};
  for(const b of items)b.y+=o;
  const ports={in:perm.map((item,t)=>({x:0,y:t+o,item,dir:'E',set:0,copy:0,row:0})),out:[{x:W-1,y:o,dir:'E',set:0}]};
  const iface={v:1,block:S.block,S:1,M:1,k,main,n,sets:[{o,n}],side:[]};
  const st={belts:0,ug:0,spl:0,machines:0};
  for(const b of items){if(b.cls===TPL_ADV)st.machines++;else if(PLC_SPL.includes(b.cls))st.spl++;else if(PLC_UG.includes(b.cls))st.ug++;else st.belts++}
  return{ok:true,items,w:W,h:H,ports,iface,rows:[{m:n}],nMax:L.nMax,stats:st,k,inItems:r.i.map(x=>x[0]),outItem:r.o[0]};
}
