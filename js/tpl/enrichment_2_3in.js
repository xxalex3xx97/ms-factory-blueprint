// TPL Enrichment Chamber, 2- and 3-input recipes (k = recipe input count). Script style, globals only. Needs PLC_BELT/PLC_UG/PLC_SPL/pfSplOff/portsOf (placer.js, model.js).
// Machine = DAT_EnrichmentChamber 9x9, rot 0, 12 toggleable ports (N/E/S/W faces at offsets 2,4,6; port order = N0..N2 E3..E5 S6..S8 W9..W11).
// ROW pattern (machines side by side, pitch 9, first machine at x=0): k lane belts run in from the WEST edge (one belt per item, row fixed per block+k), above the machines;
//   lane j (0 = farthest from the machines) feeds machine N port x=2+2j: splitter (off = back-face) at that x, its S output goes straight down; a farther lane's feeder crosses the nearer lanes
//   (the nearer lane hops the feeder columns with ONE underground pair per machine, ent at b+1, exit at b+2j+1; hop length 2j+1 <= 5 cells, fits Mk1 UG max 8).
//   Output: machine S port x=2 (ports N/E/W and unused S disabled via off) -> ONE collector belt on the row under the machines, from x=2 to the EAST edge (x=W-1, rot 0). Identical for every n.
// Blocks: 1x1 (14x14) 1 row x 1 machine; 1x2 (30x14) 1 row x 3; 2x2 and 2x2c (30x30; 2x2c has the same 30x30 floor, only its connectors differ) = SANDWICH of 2 rows sharing the collector:
//   lanes(k) | machines | collector | machines | lanes(k, mirrored: feeders go up, machine N port out). n split ceil(n/2) top row, floor(n/2) bottom row. Height 2k+19 (25 for k=3).
// ports.in = [{y,item:laneIdx,grp:row,dir:'E'}] (x=0); ports.out = [{y,dir:'E'}] (x=W-1). A row without machines keeps one belt stub per lane at x=0.
// Doors/walls: lanes are NOT aligned to the in-game door gaps (planner model: walls are crossed by UG pairs).
const TPL_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};
const TPL_CAPS=[60,120,180];
const TPL_PX=[2,4,6];   // machine port x (rel) of lane j
function tplEnrGeom(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return{ok:false,why:'TPL: block type '+spec.block};
  const k=spec.k||(spec.recd?spec.recd.i.length:spec.ins?spec.ins.length:2);
  if(k!==2&&k!==3)return{ok:false,why:'TPL: k must be 2 or 3'};
  const rows=spec.block==='2x2'||spec.block==='2x2c'?2:1,H=rows===2?2*k+19:k+10;
  if(H>f[1])return{ok:false,why:'TPL: block '+spec.block+' too low ('+H+'>'+f[1]+')'};
  const slots=Math.floor(f[0]/9);
  return{ok:true,k,rows,H,W:f[0],Fh:f[1],slots,nMax:rows*slots,yM:[k,k+10],yOut:k+9};
}
function tplMax(spec){const g=tplEnrGeom(spec);return g.ok?g.nMax:0}
// rates: spec.recd = {i:[[item,qty],..],o:[item,qty],t}. per min = qty*1800/t. g = machines per lane group (row) the derated belt feeds (min over lanes).
function tplRates(spec){
  const r=spec.recd;if(!r)return null;
  const cap=TPL_CAPS[spec.mk||0],der=spec.der!=null?spec.der:(typeof BL!=='undefined'?BL.DERATE:0.5),rt=q=>q*1800/r.t,ins=r.i.map(([,q])=>rt(q)),mx=Math.max(...ins),out=rt(r.o[1]);
  return{cap,der,ins,out,g:Math.floor(der*cap/mx),gRaw:Math.floor(cap/mx),mxIn:mx};
}
function tplBuild(spec){
  const G=tplEnrGeom(spec);if(!G.ok)return G;
  const {k,rows,H,W,slots}=G,n=spec.n,cls=spec.cls||'DAT_EnrichmentChamber',rec=spec.rec,mk=spec.mk||0,spMk=spec.spMk!=null?spec.spMk:mk;
  if(!(n>=1&&n<=G.nMax))return{ok:false,why:'TPL: n '+n+' outside 1..'+G.nMax};
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[];
  const bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),ut=(x,y)=>items.push({cls:ug,x,y,rot:0,h:0,pid:0});
  const m=rows===2?[Math.ceil(n/2),Math.floor(n/2)]:[n],ports={in:[],out:[{y:G.yOut,dir:'E'}]};
  const all=['N0','N1','N2','E3','E4','E5','S6','S7','S8','W9','W10','W11'];
  for(let g=0;g<rows;g++){
    const dv=g===0?1:-1,yM=G.yM[g],yL=j=>dv>0?yM-k+j:yM+9+(k-1-j),M=m[g],face=dv>0?['N0','N1','N2']:['S6','S7','S8'],outKey=dv>0?'S6':'N0';
    const splOff=pfSplOff(sc,0,['E',dv>0?'S':'N']),frot=dv>0?1:3;
    for(let j=0;j<k;j++)ports.in.push({y:yL(j),item:j,grp:g,dir:'E'});
    if(!M){for(let j=0;j<k;j++)bt(0,yL(j),0);continue}   // stub
    const off=all.filter(q=>q!==outKey&&!face.slice(0,k).includes(q));
    for(let s=0;s<M;s++)items.push({cls,x:9*s,y:yM,rot:0,h:0,pid:0,off,rec});
    for(let j=0;j<k;j++){
      const y=yL(j),last=9*(M-1)+2+2*j;
      for(let x=0;x<=last;x++){
        const r=x%9;   // offset in the machine slot
        if(j>=1&&r===1)ut(x,y);                                                // ent b+1
        else if(j>=1&&r===2*j+1)ut(x,y);                                       // exit b+2j+1
        else if(j>=1&&r>1&&r<2*j+1)continue;                                   // under the hop (feeder columns / free)
        else if(r===2+2*j)items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:splOff});
        else bt(x,y,0);
      }
      // feeder of lane j: belts on the rows of the nearer lanes, port x = 2+2j
      for(let s=0;s<M;s++)for(let q=j+1;q<k;q++)bt(9*s+2+2*j,yL(q),frot);
    }
  }
  for(let x=2;x<=W-1;x++)bt(x,G.yOut,0);
  let belts=0,u=0,sp=0,mc=0;for(const b of items){if(b.rec)mc++;else if(PLC_BELT.includes(b.cls))belts++;else if(PLC_UG.includes(b.cls))u++;else if(PLC_SPL.includes(b.cls))sp++}
  const rt=tplRates(spec);
  return{ok:true,why:'',items,w:W,h:H,Fh:G.Fh,ports,nMax:G.nMax,nRate:rt?Math.min(G.nMax,rows*Math.min(slots,rt.g)):null,rows:m,rate:rt,stats:{belts,ug:u,spl:sp,machines:mc}};
}
