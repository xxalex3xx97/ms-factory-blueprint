// TPL Enrichment Chamber, 1-input recipes. Global script style (no modules). Needs placer.js/prefab.js globals (PLC_BELT/PLC_SPL/PLC_UG, pfSplOff).
// Machine DAT_EnrichmentChamber: 9x9, ports N/E/S/W faces at local 2,4,6 (all toggleable, dir-less). rot 0 always (ports symmetric), one in + one out port enabled, rest off.
// Interface: input lane(s) at the WEST edge (belt (0,y) rot 0), output lane at the EAST edge (belt (W-1,y) rot 0). Lane rows are fixed per block type.
//
// Layout 'row' (1x1 14x14, 1x2 30x14): lane row y=0 = manifold above the machines, machines y=1..9 (pitch 9, in via N1 at x+4), out belt row y=10 (machines drop on it via S7), east edge.
//   1x1: 1 machine (9 wide in 14); 1x2: 3 machines (27 in 30).
// Layout 'T9' (2x2, 2x2c 30x30): 3 machine rows x 3 columns, pitch 10 (9 + 1 gap column), rows y=0,10,20; belt rows y=9 (lane A), 19 (out), 29 (lane B).
//   Only 3 belt rows for 3 machine rows (4 would be 31 > 30): row r0 (y0..8) has no belt above it, so r0 takes input from lane A below it (S7) and outputs through its EAST face (E4)
//   into a vertical collector in the gap column x=9 (c0) / x=19 (c1 via E4 and c2 via W10, shared) so the east edge column x=29 stays free (UG hop under lane A where lane A passes), down to the out row y=19. r1 (y10..18): in N1 from lane A (shared with r0), out S7 to y=19.
//   r2 (y20..28): in S7 from lane B (y=29), out N1 to y=19 (shared with r1). One splitter per machine column on a lane (up+down+onward), last machine of a lane = plain corner belt.
//   Fill order (n machines): r1 c0..c2, r2 c0..c2, r0 c0..c2. Lanes: in A y=9 (r0+r1, <=6 machines), in B y=29 (r2, <=3, stub belt (0,29) when unused), out y=19 (all).
// Quantity n only adds machines, their splitters/corners, lane stubs are fixed. nMax = geometric max (tplMax); rate limit separate (tplRate / tplRateMax).
const TPLE_PORTS=['N0','N1','N2','E3','E4','E5','S6','S7','S8','W9','W10','W11'];
const TPLE_CLS='DAT_EnrichmentChamber';
const TPLE_LAYOUT={
  '1x1':{k:'row',W:14,H:14,cols:1,px:9,yA:0,yM:1,yO:10},
  '1x2':{k:'row',W:30,H:14,cols:3,px:9,yA:0,yM:1,yO:10},
  '2x2':{k:'T9',W:30,H:30,cols:3,px:10,yA:9,yO:19,yB:29},
  '2x2c':{k:'T9',W:30,H:30,cols:3,px:10,yA:9,yO:19,yB:29}
};
// slots in fill order: {r,c}; r: 0 top (E collector), 1 mid, 2 bottom
function tplEnrSlots(block){
  const g=TPLE_LAYOUT[block];if(!g)return null;
  if(g.k==='row')return Array.from({length:g.cols},(_,c)=>({r:1,c}));
  const s=[];for(const r of [1,2,0])for(let c=0;c<g.cols;c++)s.push({r,c});return s;
}
function tplMax(spec){const s=tplEnrSlots(spec.block);return s?s.length:0}
function tplBuild(spec){
  const g=TPLE_LAYOUT[spec.block];
  if(!g)return{ok:false,why:'TPL: unknown block '+spec.block};
  const cls=spec.cls||TPLE_CLS;
  if(cls!==TPLE_CLS)return{ok:false,why:'TPL: only '+TPLE_CLS};
  const slots=tplEnrSlots(spec.block),nMax=slots.length,n=spec.n|0;
  if(n<1||n>nMax)return{ok:false,why:'TPL: n '+n+' outside 1..'+nMax,nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?mk:spec.spMk|0,bc=PLC_BELT[mk],sc=PLC_SPL[spMk],ug=PLC_UG[mk],px=g.px,T9=g.k==='T9';
  const items=[],bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),ugi=(x,y,rot)=>items.push({cls:ug,x,y,rot,h:0,pid:0}),
    sp=(x,y,keep)=>items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:pfSplOff(sc,0,keep)});
  const have=(r,c)=>slots.slice(0,n).some(q=>q.r===r&&q.c===c);
  const rowY=T9?[0,10,20]:[null,g.yM,null];
  // machines: roles per row
  const role=T9?{0:['S7','E4'],1:['N1','S7'],2:['S7','N1']}:{1:['N1','S7']};
  for(const q of slots.slice(0,n)){
    const [pin,pout0]=role[q.r],pout=T9&&q.r===0&&q.c===2?'W10':pout0;   // row 0 col 2 outputs west into the shared gap column x=19 (keeps the east edge column free for wall crossings)
    items.push({cls:TPLE_CLS,x:q.c*px,y:rowY[q.r],rot:0,h:0,pid:0,off:TPLE_PORTS.filter(k=>k!==pin&&k!==pout),rec:spec.rec});
  }
  // lane A (y=yA): from x=0 to the last used column's splitter; N = row 0 machine above (T9), S = row 1 machine below
  const rowsA=T9?[0,1]:[1];
  const cA=Math.max(...slots.slice(0,n).filter(q=>rowsA.includes(q.r)).map(q=>q.c));
  for(let x=0;x<=cA*px+4;x++){
    const c=(x-4)/px;
    if(!Number.isInteger(c)||c<0||c>cA||x!==c*px+4){bt(x,g.yA,0);continue}
    const N=T9&&have(0,c),S=have(1,c);
    if(c<cA)sp(x,g.yA,['E',...(N?['N']:[]),...(S?['S']:[])]);
    else if(N&&S)sp(x,g.yA,['N','S']);
    else bt(x,g.yA,S?1:3);
  }
  // lane B (T9, y=yB): always the stub belt (0,yB); machines of row 2 take the input through S7 (splitter N output / last = corner rot 3)
  if(T9){
    const cs=slots.slice(0,n).filter(q=>q.r===2).map(q=>q.c),cB=cs.length?Math.max(...cs):-1;
    if(cB<0)bt(0,g.yB,0);
    else for(let x=0;x<=cB*px+4;x++){
      const c=(x-4)/px;
      if(!Number.isInteger(c)||c<0||c>cB){bt(x,g.yB,0);continue}
      if(c<cB)sp(x,g.yB,['E','N']);else bt(x,g.yB,3);
    }
  }
  // out row: x=4 .. W-1, always full (exit lane to the east edge)
  for(let x=4;x<g.W;x++)bt(x,g.yO,0);
  // row 0 collectors (T9): gap column xc=px*c+9, from E4 (y=4) down to the out row; UG hop under lane A when lane A runs through (xc<=lane A last x)
  if(T9)for(const xc of [9,19]){
    if(!(xc===9?have(0,0):have(0,1)||have(0,2)))continue;
    const cross=xc<=cA*px+4;
    for(let y=4;y<g.yO;y++){
      if(cross&&y===g.yA)continue;   // lane A cell
      if(cross&&(y===g.yA-1||y===g.yA+1))ugi(xc,y,1);else bt(xc,y,1);
    }
  }
  const lanesIn=T9?[{y:g.yA,item:0,dir:'E',x:0},{y:g.yB,item:0,dir:'E',x:0}]:[{y:g.yA,item:0,dir:'E',x:0}];
  const st={belts:0,ug:0,spl:0,machines:n};
  for(const b of items){if(PLC_BELT.includes(b.cls))st.belts++;else if(PLC_UG.includes(b.cls))st.ug++;else if(PLC_SPL.includes(b.cls))st.spl++}
  return{ok:true,items,w:g.W,h:g.H,ports:{in:lanesIn,out:[{y:g.yO,dir:'E',x:g.W-1}]},nMax,stats:st,layout:g.k};
}
// rate model: per-machine rates of the 1-input recipe (qty*1800/t). Lane loads for the T9/row fill order. cap per belt Mk index.
const TPLE_CAP=[60,120,180];
function tplEnrRate(spec){
  const R=CATALOG.recipes.CRAFT_Enrichment.find(r=>r.i.length===1&&r.i[0][0]+'>'+r.o[0]===spec.rec);
  if(!R)return{ok:false,why:'recipe '+spec.rec};
  const der=typeof BL!=='undefined'?BL.DERATE:0.5,cap=TPLE_CAP[spec.mk|0],ri=R.i[0][1]*1800/R.t,ro=R.o[1]*1800/R.t,g=TPLE_LAYOUT[spec.block],sl=tplEnrSlots(spec.block).slice(0,spec.n);
  const A=sl.filter(q=>q.r<2).length,B=sl.filter(q=>q.r===2).length,inL=g.k==='T9'?[A*ri,B*ri]:[A*ri],outL=sl.length*ro;
  return{ok:true,ri,ro,cap,der,inLoads:inL,outLoad:outL,derOk:inL.every(v=>v<=der*cap)&&outL<=der*cap,capOk:inL.every(v=>v<=cap)&&outL<=cap};
}
// largest n (<= geometric max) whose lanes stay within the derate; 0 = even one machine exceeds it
function tplRateMax(spec){let m=0;for(let n=1;n<=tplMax(spec);n++){const r=tplEnrRate({...spec,n});if(r.ok&&r.derOk)m=n}return m}
