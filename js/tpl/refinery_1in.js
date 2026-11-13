// TPL refinery_1in: modular factory-only block template for 1-input 3x3 machines (DAT_Refinery, all 11 recipes). Global script style (like bl_geom.js).
// Contract: vault main-sequence/tasks/2026-11-13-template-contract.md. Needs page globals: blMachine, blRow, dim, PLC_BELT, RECS, rk, MKS, BL.
// Pattern = the user's hand build (blRow): per row a manifold belt (west port at x=0, splitter in front of every machine), machines packed from x=0 (3 wide), collector belt
//   directly under the machines running straight east to the east edge. Row pitch = machine h + 2 (manifold + collector) = 5. One set = one row = one input lane + ONE out lane (Edge Interface v1: in (0,o_s), out (W-1,o_s); collector jogs up the x=W-2 trunk via tplOutTail). Needs iface.js. Every manifold splitter has priority to its machine (b.pr=[0,-1]).
// Interface (same for every n): ports.in[j] = {x:0,y:yIn_j,item:0,dir:'E'} (belt rot 0 at the west edge), ports.out[j] = {x:W-1,y:yIn_j,dir:'E'}.
//   Rows with no machine are stubbed: ONE belt cell (rot 0) at the in port and ONE at the out port (dead ends, the lane stays aligned with neighbours).
// Quantity n only changes: machine count (rows filled in order, mrow per row) + the manifold belts/splitters of that row. Collector run x=1..W-1 is the same for any m>=1.
// Block floors (checked with floorRect): 1x1 14x14, 1x2 30x14 (long side = x), 2x2 30x30, 2x2c 30x30 but only a 22-wide opening per side (floor rows 4..25): rows kept inside it.
// Lane limit: machines per row mrow = min(floor((W-3)/3), g), g = floor(D*cap/max(rin,rout)) (g<1 -> ok:false why:rate), D = spec.derate ?? tplDerate(). Machines x<=W-3 (Mgeo=floor((W-3)/3), machines start at x=1 (x=0 is edge-free)). spec.perRow overrides g (tests / special).
// ponytail: one machine per splitter incl. the last (hand-build pattern); a 2-group-per-row bypass (more machines than g per row) is not built.
const TPL_R1_S={'1x1':2,'1x2':2,'2x2':6,'2x2c':4};   // default sets per block (Edge Interface v1)
const TPL_R1_BLK={'1x1':{W:14,H:14,lo:0,hi:13,cls:'BPO_Station_01',tick:0},'1x2':{W:30,H:14,lo:0,hi:13,cls:'BPO_Station_2x1',tick:1},'2x2':{W:30,H:30,lo:0,hi:29,cls:'BPO_Station_02',tick:2},'2x2c':{W:30,H:30,lo:4,hi:25,cls:'BPO_Station_03',tick:3}};
function tplR1Rates(spec){
  let r=null;
  if(spec.rin!=null&&spec.rout!=null)return{rin:spec.rin,rout:spec.rout};
  for(const c in RECS)for(const x of RECS[c])if(rk(x)===spec.rec)r=x;
  if(!r)return null;
  return{rin:r.i[0][1]*1800/r.t,rout:r.o[1]*1800/r.t,k:r.i.length};
}
// geometry+rate plan: S sets (Edge Interface v1, js/tpl/iface.js), one row per set, per-row machine cap
function tplR1Plan(spec){
  const B=TPL_R1_BLK[spec.block];if(!B)return{ok:false,why:'unknown block '+spec.block};
  const cls=spec.cls||'DAT_Refinery',mc=blMachine(cls);if(!mc.ok)return{ok:false,why:mc.why};
  const rt=tplR1Rates(spec);if(!rt)return{ok:false,why:'unknown recipe '+spec.rec};
  if(rt.k>1)return{ok:false,why:'recipe has '+rt.k+' inputs (1-input template)'};
  const mk=spec.mk??1,cap=MKS[mk][1],D=spec.derate??tplDerate(),P=mc.h+2;
  const S=spec.S??TPL_R1_S[spec.block],ts=tplIfSets(spec.block,S);if(!ts.ok)return{ok:false,why:ts.why};
  if(ts.hs.some(h=>h<P)||ts.o[ts.o.length-1]+P>B.hi+1)return{ok:false,why:'sets too tight for one row'};
  if(rt.rin>cap||rt.rout>cap)return{ok:false,why:'one machine exceeds the belt rate ('+rt.rin+'/'+rt.rout+' > '+cap+')'};
  const g=spec.perRow??Math.floor(D*cap/Math.max(rt.rin,rt.rout)+1e-9),Mgeo=Math.floor((B.W-3)/mc.w),mrow=Math.min(Mgeo,g);
  if(g<1)return{ok:false,why:'rate'};
  return{ok:true,B,mc,cls,rt,mk,cap,D,P,R:S,S,o:ts.o,g,Mgeo,mrow,nMax:S*mrow};
}
function tplMax(spec){const p=tplR1Plan(spec);return p.ok?p.nMax:0}
function tplBuild(spec){
  const p=tplR1Plan(spec);if(!p.ok)return p;
  const {B,mc,cls,rt,mk,P,R,o,mrow}=p,n=spec.n,W=B.W,spMk=spec.spMk??1,bc=PLC_BELT[mk];
  if(!(n>=1))return{ok:false,why:'n<1'};
  if(n>p.nMax)return{ok:false,why:'n='+n+' > nMax '+p.nMax+' ('+R+' rows x '+mrow+')'};
  const items=[],ports={in:[],out:[]},rows=[];let left=n;
  for(let j=0;j<R;j++){
    const yIn=o[j],yOut=yIn+1+mc.h,m=Math.min(mrow,left);left-=m;
    ports.in.push({x:0,y:yIn,item:0,dir:'E',set:j,copy:0,row:j});ports.out.push({x:W-1,y:yIn,dir:'E',set:j,row:j});rows.push({yIn,yOut,m});
    if(m<1){items.push({cls:bc,x:0,y:yIn,rot:0,h:0,pid:0},{cls:bc,x:W-1,y:yIn,rot:0,h:0,pid:0});continue}   // stubs
    const r=blRow({mk,spMk,cls,rec:spec.rec,mc,m,X0:1,yIn,colX:0,xEx:W-3});
    if(!r.ok)return r;
    r.items[r.items.length-1].rot=0;   // blRow ends with a corner (rot 1): straight east instead
    for(const q of r.items)if(PLC_SPL.includes(q.cls))q.pr=[0,-1];   // priority to the machine face S (SPL_FACES[0]): machines fill in order, last one partial (planner semantics)
    items.push(...r.items);
    tplOutTail(items,{bc,W,yc:yOut,yo:yIn});
  }
  let belts=0,spl=0,machines=0;
  for(const q of items){if(PLC_BELT.includes(q.cls))belts++;else if(PLC_SPL.includes(q.cls))spl++;else machines++}
  const iface={v:1,block:spec.block,S:p.S,M:1,k:1,main:spec.main??0,n,sets:o.map((v,j)=>({o:v,n:rows[j].m})),side:[]};
  return{ok:true,why:'',items,w:W,h:B.H,ports,iface,nMax:p.nMax,rows,mrow,g:p.g,Mgeo:p.Mgeo,rate:{rin:rt.rin,rout:rt.rout,cap:p.cap,derate:p.D},stats:{belts,ug:0,spl,machines}};
}
