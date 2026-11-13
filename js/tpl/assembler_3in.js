// TPL assembler_3in v2: DAT_Assembler, 3-input recipes. One or two COLUMNS of n machines (rot 3, pitch 5, machines abut like the golden js/bl_vc.js).
// Needs placer.js/prefab.js globals PLC_BELT/PLC_UG/PLC_SPL, pfSplOff.
// DOORS (probed with areas(), tests/tpl_assembler_3in.mjs): the W/E walls are open only at rows 4..9 (1x1, 1x2, 2x2) plus 20..25 (2x2), rows 4..25 (2x2c: one 22-wide opening, 1-thick walls, 8 corner posts 1x4, no door cells).
//   So ALL ports sit in rows 4..9: in[0] y=4, in[1] y=5, in[2] y=6, out y=8. Machines start at row Y0=7 (below the lane rows) and grow downwards.
// PORTS (rot 3, machine x=X): west face N0/N1 rows r+1,r+3 = inputs A,B; east face S5 row r+1 = input C, S4 row r+3 = OUTPUT. N face E2/E3 and S face W6/W7 off (first/last machine like the golden).
// LANES: in[0] -> row 4 -> east face (column X+6 down); in[1] -> row 5 -> west r+1 (column X-1); in[2] -> row 6 -> west r+3 (column X-3, crossover X-2,X-1).
//   Splitter per machine on every lane (manifold + splitter, the golden pattern). 1 column: collector x=X+7 north to row 8, then east to x=w-1.
//   2 columns (w>=30, n>nCol): same lanes continue east (corner splitters keep E,S; UG hops over the left column's C/collector cells) to the right column (translated copy, X2=X+11);
//   right collector north to row 8 -> east; left collector runs SOUTH to row h-2, east, north along x=X2+8 and merges into the out row at (X2+8,8). Left column is filled first.
// UNVERIFIED IN GAME: (U1) one face carries an input AND an output port (east face S5 in, S4 out); (U2) splitter beside the east face feeds the west cell (as golden AMID splitters on the west);
//   (U3) corner splitters (input W, outputs E+S) for the 2-column lane branch; (U4) horizontal UG pairs spanning 2 cells (X+5 -> X+7) beside splitters. The user's 'sandwich' (N/S gap-row output) is NOT built: it needs U1 plus a belt on an N/S port.
const TPL_X=4,TPL_Y0=7,TPL_PITCH=11,TPL_CAP=[60,120,180];
const TPL_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};   // floorRect (verified)
const TPL_DOOR={'1x1':[[4,9]],'1x2':[[4,9]],'2x2':[[4,9],[20,25]],'2x2c':[[4,25]]};   // open W/E wall rows (areas() probe)
const tplCol=h=>Math.max(0,Math.floor((h-TPL_Y0)/5));            // machines per column
const tplCols=w=>w>=TPL_X+TPL_PITCH+9?2:1;                        // columns that fit the width
// tplGroup: max machines one lane may feed at the derate (0.5*cap). rates = per-machine input/min.
function tplGroup(spec){const der=typeof BL!=='undefined'?BL.DERATE:0.5;return Math.floor(der*TPL_CAP[spec.mk]/Math.max(...spec.rates))}
// tplMax: geometric max; with spec.rates also clamped to one lane group (derate); a single machine above the cap -> 0. (second lane set for more machines: NOT implemented)
function tplMax(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return 0;
  let m=tplCols(f[0])*tplCol(f[1]);
  if(spec.rates){if(Math.max(...spec.rates)>TPL_CAP[spec.mk??1])return 0;m=Math.min(m,Math.max(1,tplGroup({mk:spec.mk??1,rates:spec.rates})))}
  return m;
}
function tplBuild(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return{ok:false,why:'unknown block '+spec.block};
  const {mk=1,spMk=1,cls='DAT_Assembler',rec,n}=spec,nMax=tplMax(spec);
  if(cls!=='DAT_Assembler')return{ok:false,why:'class'};
  if(spec.rates&&Math.max(...spec.rates)>TPL_CAP[mk])return{ok:false,why:'one machine needs more than the belt cap',nMax:0};
  if(n<1||n>nMax)return{ok:false,why:'n '+n+' outside 1..'+nMax,nMax};
  const [w,h]=f,nc=tplCol(h),two=tplCols(w)===2&&n>nc,n1=two?nc:n,n2=two?n-nc:0;
  const X=TPL_X,X2=X+TPL_PITCH,Y0=TPL_Y0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[];
  const B=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),U=(x,y,rot=1)=>items.push({cls:ug,x,y,rot,h:0,pid:0}),
    S=(x,y,keep,rot=1)=>items.push({cls:sc,x,y,rot,h:0,pid:0,off:pfSplOff(sc,rot,keep)});
  const col=(cx,m,left)=>{   // one column at x=cx; left = another column follows east (lane corners branch)
    const r=i=>Y0+5*i,last=m-1;
    for(let i=0;i<m;i++)items.push({cls,x:cx,y:r(i),rot:3,h:0,pid:0,rec,off:[...(i===0?['E2','E3']:[]),...(i===last?['W6','W7']:[])]});
    for(let y=6;y<=Y0;y++)B(cx-1,y,1);      // A column below corner (cx-1,5)
    for(let y=7;y<Y0+3;y++)B(cx-3,y,1);     // B column below corner (cx-3,6)
    for(let y=5;y<=Y0;y++)B(cx+6,y,1);      // C column below corner (cx+6,4)
    for(let i=0;i<m;i++){
      const fin=i===last;
      S(cx-1,r(i)+1,fin?['E']:['S','E']);
      if(!fin){U(cx-1,r(i)+2);U(cx-1,r(i)+4);B(cx-1,r(i)+5,1)}
      B(cx-2,r(i)+3,0);B(cx-1,r(i)+3,0);
      S(cx-3,r(i)+3,fin?['E']:['S','E']);
      if(!fin)for(let y=r(i)+4;y<=r(i)+7;y++)B(cx-3,y,1);
      S(cx+6,r(i)+1,fin?['W']:['S','W']);B(cx+5,r(i)+1,2);
      if(!fin){U(cx+6,r(i)+2);U(cx+6,r(i)+4);B(cx+6,r(i)+5,1)}
      B(cx+5,r(i)+3,0);B(cx+6,r(i)+3,0);
    }
    return r(last)+3;   // output row of the last machine
  };
  // lane rows from the west edge (rows 4 C, 5 A, 6 B)
  const first=X;      // left column lanes
  const lastCx=two?X2:X;
  // C row 4: belts to X+5 then corner/splitter at X+6; continues east when two columns
  for(let x=0;x<=X+5;x++)B(x,4,0);
  if(two){S(X+6,4,['E','S'],0);for(let x=X+7;x<=X2+5;x++)B(x,4,0);B(X2+6,4,1)}else B(X+6,4,1);
  // A row 5: to corner at X-1
  for(let x=0;x<=X-2;x++)B(x,5,0);
  if(two){S(X-1,5,['E','S'],0);for(let x=X;x<=X+4;x++)B(x,5,0);U(X+5,5,0);U(X+7,5,0);for(let x=X+8;x<=X2-2;x++)B(x,5,0);B(X2-1,5,1)}else B(X-1,5,1);
  // B row 6: corner at X-3; with two columns it hops over A's column (X-1) and over C's column (X+6)
  for(let x=0;x<=X-4;x++)B(x,6,0);
  if(two){S(X-3,6,['E','S'],0);U(X-2,6,0);U(X,6,0);for(let x=X+1;x<=X+4;x++)B(x,6,0);U(X+5,6,0);U(X+7,6,0);for(let x=X+8;x<=X2-4;x++)B(x,6,0);B(X2-3,6,1)}else B(X-3,6,1);
  const endL=col(X,n1,two);
  if(two){
    const endR=col(X2,n2,false);
    // right collector north to row 8, then east to the edge
    for(let y=endR;y>=9;y--)B(X2+7,y,3);
    for(let x=X2+7;x<w;x++)B(x,8,0);
    // left collector south to row h-2, east to x=X2+8, north to row 9 (merges into (X2+8,8))
    for(let y=Y0+3;y<h-2;y++)B(X+7,y,1);
    for(let x=X+7;x<X2+8;x++)B(x,h-2,0);
    for(let y=h-2;y>=9;y--)B(X2+8,y,3);
  }else{
    for(let y=endL;y>=9;y--)B(X+7,y,3);
    for(let x=X+7;x<w;x++)B(x,8,0);
  }
  const cnt=c=>items.filter(o=>o.cls===c).length;
  return{ok:true,items,w,h,nMax,cols:two?2:1,ns:two?[n1,n2]:[n],ports:{in:[4,5,6].map((y,i)=>({y,item:i,dir:'E'})),out:[{y:8,dir:'E'}]},
    stats:{belts:cnt(bc),ug:cnt(ug),spl:cnt(sc),machines:n}};
}
