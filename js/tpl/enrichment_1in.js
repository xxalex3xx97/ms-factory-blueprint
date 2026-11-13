// TPL Enrichment Chamber, 1-input recipes, Edge Interface v1. Global script style (no modules). Needs placer.js/prefab.js globals (PLC_BELT/PLC_SPL/PLC_UG, pfSplOff) and js/tpl/iface.js (tplIfSets, tplOutTail, tplDerate).
// Machine DAT_EnrichmentChamber: 9x9, ports N/E/S/W faces at local 2,4,6 (all toggleable, dir-less). rot 0 always (ports symmetric), one in + one out port enabled, rest off.
// Layout (every block): SETS of one row. Set origin o_s from TPL_IF_SETS (1x1/1x2 S=1 [0]; 2x2 S=2 [0,15]; 2x2c S=2 [4,15]).
//   lane row y=o (west edge x=0, belt rot 0) = manifold above the machines, machines y=o+1..o+9 (pitch 9, in via N1 at x+4, out via S7), collector row y=o+10 from x=5 to W-3,
//   then tplOutTail jog (trunk column x=W-2 up to row o, out belt (W-1,o) rot 0). Machines x<=W-3: floor((W-3)/9) per row (1x1: 1, 30-wide: 3).
//   Each splitter on the manifold (one per machine, last machine = corner belt) has PRIORITY on its machine-side output (b.pr=[0,-1], S face idx 0 at rot 0): machines fill in order, last one partial.
//   T9 grid (9 machines per 2x2) dropped: its lane rows (9, 29) cannot conform to the standard slots.
// Fill order: set by set, row left to right. Empty sets keep their stubs (belt (0,o) and belt (W-1,o)). Quantity n only adds machines + their splitters/corners + the collector.
// Rate: g = floor(tplDerate()*cap/ri) machines per lane (M=1); with spec.rec set tplMax/tplBuild clamp the per-set count to g (g<1 -> ok:false why 'rate'); no rec -> geometric.
const TPLE_PORTS=['N0','N1','N2','E3','E4','E5','S6','S7','S8','W9','W10','W11'];
const TPLE_CLS='DAT_EnrichmentChamber';
const TPLE_W={'1x1':14,'1x2':30,'2x2':30,'2x2c':30};
const TPLE_S={'1x1':1,'1x2':1,'2x2':2,'2x2c':2};   // default S per block (iface table)
const TPLE_CAP=[60,120,180];
function tplEnrRec(rec){return rec&&typeof CATALOG!=='undefined'?CATALOG.recipes.CRAFT_Enrichment.find(r=>r.i.length===1&&r.i[0][0]+'>'+r.o[0]===rec):null}
// per-set capacity {S,cols,g,cap} (g=Infinity without a recipe)
function tplEnrCap(spec){
  const W=TPLE_W[spec.block];if(!W)return null;
  const S=spec.S||TPLE_S[spec.block],cols=Math.floor((W-3)/9),R=tplEnrRec(spec.rec);
  const g=R?Math.floor(tplDerate()*TPLE_CAP[spec.mk|0]/(R.i[0][1]*1800/R.t)):Infinity;
  return{S,W,cols,g,cap:Math.min(cols,g)};
}
function tplMax(spec){const c=tplEnrCap(spec);return c?c.S*c.cap:0}
// machines per set, set by set
function tplEnrFill(S,cap,n){const a=[];for(let s=0;s<S;s++){const m=Math.min(cap,n);a.push(m);n-=m}return a}
function tplBuild(spec){
  const c=tplEnrCap(spec);
  if(!c)return{ok:false,why:'TPL: unknown block '+spec.block};
  const cls=spec.cls||TPLE_CLS;
  if(cls!==TPLE_CLS)return{ok:false,why:'TPL: only '+TPLE_CLS};
  const st0=tplIfSets(spec.block,c.S);
  if(!st0.ok)return{ok:false,why:st0.why};
  if(c.g<1)return{ok:false,why:'rate',nMax:0};
  const nMax=c.S*c.cap,n=spec.n|0;
  if(n<1||n>nMax)return{ok:false,why:'TPL: n '+n+' outside 1..'+nMax,nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?mk:spec.spMk|0,bc=PLC_BELT[mk],sc=PLC_SPL[spMk],W=c.W;
  const items=[],bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),
    sp=(x,y,keep)=>items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:pfSplOff(sc,0,keep),pr:[0,-1]});
  const fill=tplEnrFill(c.S,c.cap,n),ports={in:[],out:[]};
  st0.o.forEach((o,s)=>{
    const m=fill[s];
    ports.in.push({x:0,y:o,item:0,dir:'E',set:s,copy:0,row:s});ports.out.push({x:W-1,y:o,dir:'E',set:s});
    if(!m){bt(0,o,0);bt(W-1,o,0);return}
    for(let q=0;q<m;q++)items.push({cls:TPLE_CLS,x:1+q*9,y:o+1,rot:0,h:0,pid:0,off:TPLE_PORTS.filter(k=>k!=='N1'&&k!=='S7'),rec:spec.rec});
    for(let x=0;x<=(m-1)*9+5;x++){   // manifold lane
      const q=(x-5)/9;
      if(!Number.isInteger(q))bt(x,o,0);
      else if(q<m-1)sp(x,o,['E','S']);
      else bt(x,o,1);
    }
    for(let x=5;x<=W-3;x++)bt(x,o+10,0);   // collector
    tplOutTail(items,{bc,W,yc:o+10,yo:o});
  });
  const stt={belts:0,ug:0,spl:0,machines:n};
  for(const b of items){if(PLC_BELT.includes(b.cls))stt.belts++;else if(PLC_UG.includes(b.cls))stt.ug++;else if(PLC_SPL.includes(b.cls))stt.spl++}
  const H=TPL_IF_H[spec.block]||(W===14?14:30);
  return{ok:true,items,w:W,h:H,ports,nMax,stats:stt,layout:'row',rows:fill.map(m=>({m})),
    iface:{v:1,block:spec.block,S:c.S,M:1,k:1,main:0,sets:st0.o.map((o,s)=>({o,n:fill[s]})),side:[]}};
}
// rate model: per-machine rates of the 1-input recipe (qty*1800/t). Per set lane loads (in) and out loads. cap per belt Mk index.
function tplEnrRate(spec){
  const R=tplEnrRec(spec.rec),c=tplEnrCap({...spec,rec:null});
  if(!R||!c)return{ok:false,why:'recipe '+spec.rec};
  const der=tplDerate(),cap=TPLE_CAP[spec.mk|0],ri=R.i[0][1]*1800/R.t,ro=R.o[1]*1800/R.t,fill=tplEnrFill(c.S,Math.min(c.cols,Math.floor(der*cap/ri)),spec.n),
    inL=fill.map(m=>m*ri),outL=fill.map(m=>m*ro);
  return{ok:true,ri,ro,cap,der,inLoads:inL,outLoads:outL,outLoad:Math.max(...outL),derOk:inL.concat(outL).every(v=>v<=der*cap+1e-9),capOk:inL.concat(outL).every(v=>v<=cap)};
}
// largest n whose lanes stay within the derate (0 = one machine already exceeds it)
function tplRateMax(spec){const R=tplEnrRec(spec.rec),c=tplEnrCap({...spec,rec:null});if(!R||!c)return 0;const g=Math.floor(tplDerate()*TPLE_CAP[spec.mk|0]/(R.i[0][1]*1800/R.t));return c.S*Math.min(c.cols,g)}
