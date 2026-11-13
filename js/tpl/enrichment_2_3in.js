// TPL Enrichment Chamber, 2- and 3-input recipes (k = recipe input count). Script style, globals only. Needs PLC_BELT/PLC_UG/PLC_SPL/pfSplOff/portsOf (placer.js, model.js).
// Machine = DAT_EnrichmentChamber 9x9, rot 0, 12 toggleable ports (N/E/S/W faces at offsets 2,4,6; port order = N0..N2 E3..E5 S6..S8 W9..W11).
// ROW pattern (machines side by side, pitch 9, first machine at x=0): k lane belts run in from the WEST edge (one belt per item, row fixed per block+k), above the machines;
//   lane j (0 = farthest from the machines) feeds machine N port x=2+2j: splitter (off = back-face) at that x, its S output goes straight down; a farther lane's feeder crosses the nearer lanes
//   (the nearer lane hops the feeder columns with ONE underground pair per machine, ent at b+1, exit at b+2j+1; hop length 2j+1 <= 5 cells, fits Mk1 UG max 8).
//   Output: machine S port x=2 (ports N/E/W and unused S disabled via off) -> ONE collector belt on the row under the machines, from x=2 to the EAST edge (x=W-1, rot 0). Identical for every n.
// Blocks: 1x1 (14x14) 1 row x 1 machine; 1x2 (30x14) 1 row x 3; 2x2 and 2x2c (30x30; 2x2 = SANDWICH of 2 rows sharing the collector (2x2c: ONE row at origin 4, Edge v1 ports rows 4..25):
//   lanes(k) | machines | collector | machines | lanes(k, mirrored: feeders go up, machine N port out). n split ceil(n/2) top row, floor(n/2) bottom row. Height 2k+19 (25 for k=3).
// Edge v1 (js/tpl/iface.js, load it first): S=1, machines at x=1+9s so x=0/W-1 hold only port belts; out collector ends W-3 then tplOutTail. ports.in={x:0,y,item:perm[j],grp,set:0,copy:0}, ports.out=[{x:W-1,y:o,set:0}]; rate: nMax=rows*min(slots,g), g<1 -> ok:false why:'rate'. A row without machines keeps one belt stub per lane at x=0.
// Doors/walls: lanes are NOT aligned to the in-game door gaps (planner model: walls are crossed by UG pairs).
const TPL_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};
const TPL_CAPS=[60,120,180];
const TPL_PX=[2,4,6];   // machine port x (rel) of lane j
// Edge v1: S=1, set origin o (0; 2x2c 4). Machines at x=1+9s (xo=1, x=0 and x=W-1 hold only port belts), x<=W-3; trunk column W-2, out port (W-1,o). 2x2c: ONE row (sandwich bottom lanes would be >row 25).
function tplEnrGeom(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return{ok:false,why:'TPL: block type '+spec.block};
  const k=spec.k||(spec.recd?spec.recd.i.length:spec.ins?spec.ins.length:2);
  if(k!==2&&k!==3)return{ok:false,why:'TPL: k must be 2 or 3'};
  const t=tplIfSets(spec.block,1),o=t.o[0],rows=spec.block==='2x2'?2:1,H=rows===2?2*k+19:o+k+10;
  if(H>f[1])return{ok:false,why:'TPL: block '+spec.block+' too low ('+H+'>'+f[1]+')'};
  const slots=Math.floor((f[0]-3)/9),rt=spec.recd?tplRates(spec):null;
  const nOut=rt?Math.floor(rt.der*rt.cap/rt.out):1e9;   // one collector belt carries all products
  if(rt&&(rt.g<1||nOut<1))return{ok:false,why:'rate'};   // one lane belt cannot feed one machine (g<1) / product > belt
  return{ok:true,k,rows,H,W:f[0],Fh:f[1],slots,o,nMax:Math.min(rows*Math.min(slots,rt?rt.g:slots),nOut),yM:[o+k,o+k+10],yOut:o+k+9};
}
function tplMax(spec){const g=tplEnrGeom(spec);return g.ok?g.nMax:0}
// rates: spec.recd = {i:[[item,qty],..],o:[item,qty],t}. per min = qty*1800/t. g = machines per lane group (row) the derated belt feeds (min over lanes).
function tplRates(spec){
  const r=spec.recd;if(!r)return null;
  const cap=TPL_CAPS[spec.mk||0],der=spec.der!=null?spec.der:tplDerate(),rt=q=>q*1800/r.t,ins=r.i.map(([,q])=>rt(q)),mx=Math.max(...ins),out=rt(r.o[1]);
  return{cap,der,ins,out,g:Math.floor(der*cap/mx),gRaw:Math.floor(cap/mx),mxIn:mx};
}
function tplBuild(spec){
  const G=tplEnrGeom(spec);if(!G.ok)return G;
  const {k,rows,H,W,slots,o}=G,n=spec.n,cls=spec.cls||'DAT_EnrichmentChamber',rec=spec.rec,mk=spec.mk||0,spMk=spec.spMk!=null?spec.spMk:mk,xo=1;
  if(!(n>=1&&n<=G.nMax))return{ok:false,why:'TPL: n '+n+' outside 1..'+G.nMax};
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[];
  const bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),ut=(x,y)=>items.push({cls:ug,x,y,rot:0,h:0,pid:0});
  const main=spec.main||0,perm=[main,...[...Array(k).keys()].filter(q=>q!==main)];   // slot j carries recipe input perm[j] (relabel only)
  const m=rows===2?[Math.ceil(n/2),Math.floor(n/2)]:[n],ports={in:[],out:[{x:W-1,y:o,dir:'E',set:0}]};
  const all=['N0','N1','N2','E3','E4','E5','S6','S7','S8','W9','W10','W11'];
  for(let g=0;g<rows;g++){
    const dv=g===0?1:-1,yM=G.yM[g],yL=j=>dv>0?yM-k+j:yM+9+(k-1-j),M=m[g],face=dv>0?['N0','N1','N2']:['S6','S7','S8'],outKey=dv>0?'S6':'N0';
    const splOff=pfSplOff(sc,0,['E',dv>0?'S':'N']),frot=dv>0?1:3,pr=[SPL_FACES.indexOf(dv>0?'S':'N'),-1];   // priority: machine-side output first -> machines fill in order
    for(let j=0;j<k;j++)ports.in.push({x:0,y:yL(j),item:perm[j],grp:g,row:g,dir:'E',set:0,copy:0});
    if(!M){for(let j=0;j<k;j++)bt(0,yL(j),0);continue}   // stub
    const off=all.filter(q=>q!==outKey&&!face.slice(0,k).includes(q));
    for(let s=0;s<M;s++)items.push({cls,x:xo+9*s,y:yM,rot:0,h:0,pid:0,off,rec});
    for(let j=0;j<k;j++){
      const y=yL(j),last=xo+9*(M-1)+2+2*j;
      for(let x=0;x<=last;x++){
        if(x<xo){bt(x,y,0);continue}
        const r=(x-xo)%9;   // offset in the machine slot
        if(j>=1&&r===1)ut(x,y);                                                // ent b+1
        else if(j>=1&&r===2*j+1)ut(x,y);                                       // exit b+2j+1
        else if(j>=1&&r>1&&r<2*j+1)continue;                                   // under the hop (feeder columns / free)
        else if(r===2+2*j)items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:splOff,pr:pr.slice()});
        else bt(x,y,0);
      }
      // feeder of lane j: belts on the rows of the nearer lanes, port x = xo+2+2j
      for(let s=0;s<M;s++)for(let q=j+1;q<k;q++)bt(xo+9*s+2+2*j,yL(q),frot);
    }
  }
  for(let x=xo+2;x<=W-3;x++)bt(x,G.yOut,0);
  tplOutTail(items,{bc,W,yc:G.yOut,yo:o});
  let belts=0,u=0,sp=0,mc=0;for(const b of items){if(b.rec)mc++;else if(PLC_BELT.includes(b.cls))belts++;else if(PLC_UG.includes(b.cls))u++;else if(PLC_SPL.includes(b.cls))sp++}
  const rt=tplRates(spec);
  return{ok:true,why:'',items,w:W,h:H,Fh:G.Fh,ports,nMax:G.nMax,nRate:rt?G.nMax:null,rows:m,rate:rt,
    iface:{v:1,block:spec.block,S:1,M:1,k,main,n,sets:[{o,n}],side:rows===2?TPL_IF_SIDE.enr_sandwich_bottom(G.yM[1],k):[]},stats:{belts,ug:u,spl:sp,machines:mc}};
}
