// TPL assembler_3in: DAT_Assembler, 3-input recipes, ONE column of n machines (rot 3, pitch 5, machines abut like the golden js/bl_vc.js).
// Needs placer.js/prefab.js globals PLC_BELT/PLC_UG/PLC_SPL, pfSplOff.
// PORTS (rot 3, local x=X): west face = N0/N1 at rows r+1,r+3 (inputs A,B); east face = S5 row r+1 (input C), S4 row r+3 (OUTPUT). N face E2/E3 and S face W6/W7 off.
// LANES (fixed rows, independent of n): in[0] y=0 -> east-face port (row 0 east to x=X+6, down); in[1] y=1 -> west r+1 (column X-1); in[2] y=2 -> west r+3 (column X-3, crossover X-2,X-1).
//   Output: collector column x=X+7 flows NORTH to row 1, then east to the block edge (x=w-1, y=1). Machines start at row Y0=3 and grow downwards: n only changes the machine count and its feeders.
// UNVERIFIED IN GAME (flagged): (U1) ONE face carries an input AND an output port at the same time (east face: S5 in, S4 out; the golden only proves W=in / E=out on separate faces; port dir is null in portsOf = bidirectional by belt direction).
//   (U2) splitter placed beside the east face (lane C, x=X+6) feeds the west cell (X+5,r+1) like golden AMID splitters do on the west. The user's 'sandwich' variant (inputs W + E faces, output through an N/S gap row = (U1)+(U3: output belt on a N/S port, belt gap row between machines)) is NOT built: needs both U1 and U3, this variant needs only U1.
const TPL_X=4,TPL_Y0=3,TPL_CAP=[60,120,180];
const TPL_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};   // verified by floorRect (BPO_Station_01/2x1/02/03); 2x2c C-notch / adapter NOT modelled
function tplMax(spec){const f=TPL_FLOOR[spec.block];if(!f)return 0;return Math.max(0,Math.floor((f[1]-2)/5))}
function tplBuild(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return{ok:false,why:'unknown block '+spec.block};
  const {mk=1,spMk=1,cls='DAT_Assembler',rec,n}=spec,nMax=tplMax(spec);
  if(cls!=='DAT_Assembler')return{ok:false,why:'class'};
  if(n<1||n>nMax)return{ok:false,why:'n '+n+' outside 1..'+nMax,nMax};
  const [w,h]=f,X=TPL_X,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[];
  const B=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),U=(x,y)=>items.push({cls:ug,x,y,rot:1,h:0,pid:0}),
    S=(x,y,keep)=>items.push({cls:sc,x,y,rot:1,h:0,pid:0,off:pfSplOff(sc,1,keep)});
  const r=i=>TPL_Y0+5*i,last=n-1;
  // machines
  for(let i=0;i<n;i++)items.push({cls,x:X,y:r(i),rot:3,h:0,pid:0,rec,off:[...(i===0?['E2','E3']:[]),...(i===last?['W6','W7']:[])]});
  // lane A (in[1]): row 1 east to X-2, corner X-1 down; splitter at r+1, UG hop over crossover row r+3
  for(let x=0;x<=X-2;x++)B(x,1,0);
  for(let y=1;y<=TPL_Y0;y++)B(X-1,y,1);
  // lane B (in[2]): row 2 east to X-4, corner X-3 down
  for(let x=0;x<=X-4;x++)B(x,2,0);
  for(let y=2;y<TPL_Y0+3;y++)B(X-3,y,1);
  // lane C (in[0]): row 0 east to X+5, corner X+6 down
  for(let x=0;x<=X+5;x++)B(x,0,0);
  for(let y=0;y<=TPL_Y0;y++)B(X+6,y,1);
  for(let i=0;i<n;i++){
    const fin=i===last;
    // A
    S(X-1,r(i)+1,fin?['E']:['S','E']);
    if(!fin){U(X-1,r(i)+2);U(X-1,r(i)+4);B(X-1,r(i)+5,1)}
    B(X-2,r(i)+3,0);B(X-1,r(i)+3,0);   // B crossover (under A's UG hop)
    // B splitter (X-3,r+3) then plain belts down to next splitter
    S(X-3,r(i)+3,fin?['E']:['S','E']);
    if(!fin)for(let y=r(i)+4;y<=r(i)+7;y++)B(X-3,y,1);
    // C on east face: splitter X+6 at r+1 feeds west into (X+5,r+1); UG hop over output crossover at r+3
    S(X+6,r(i)+1,fin?['W']:['S','W']);B(X+5,r(i)+1,2);
    if(!fin){U(X+6,r(i)+2);U(X+6,r(i)+4);B(X+6,r(i)+5,1)}
    // output: (X+5,r+3) east, crossover (X+6,r+3), merges into collector column X+7
    B(X+5,r(i)+3,0);B(X+6,r(i)+3,0);
  }
  for(let y=r(last)+3;y>=2;y--)B(X+7,y,3);
  for(let x=X+7;x<w;x++)B(x,1,0);
  const cnt=c=>items.filter(o=>o.cls===c).length;
  return{ok:true,items,w,h,nMax,ports:{in:[0,1,2].map(i=>({y:[0,1,2][i],item:i,dir:'E'})),out:[{y:1,dir:'E'}]},
    stats:{belts:cnt(bc),ug:cnt(ug),spl:cnt(sc),machines:n}};
}
// tplGroup: max machines one lane group may feed at the user's derate (0.5*belt cap); rates = per-machine input per min (qty*1800/t). 0 = even one machine exceeds the derate (use a higher Mk or accept up to cap).
function tplGroup(spec){const der=typeof BL!=='undefined'?BL.DERATE:0.5;return Math.floor(der*TPL_CAP[spec.mk]/Math.max(...spec.rates))}
