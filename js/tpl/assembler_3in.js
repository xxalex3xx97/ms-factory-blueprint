// TPL assembler_3in v3 (Edge Interface v1): DAT_Assembler, 3-input recipes. One or two COLUMNS of n machines (rot 3, pitch 5, machines abut like the golden js/bl_vc.js).
// Needs placer.js/prefab.js globals PLC_BELT/PLC_UG/PLC_SPL, pfSplOff, portsOf, FN, prIdx and js/tpl/iface.js (tplIfSets, tplOutTail, tplDerate).
// EDGE v1: ONE set (S=1, M=1, k=3). Lane rows L0,L0+1,L0+2 at x=0 (L0 = table origin: 0 for 1x1/1x2/2x2, 4 for 2x2c); out at (W-1,L0) (same row as slot 0: the out row
//   starts east of lane 0, which turns south at x=X+6). Machines occupy x<=W-3, column x=W-2 is the (straight) tail. No wall-door rows: UG belts cross walls anywhere (user fact), ports are in/out by flow only.
// PORTS (rot 3, machine x=cx): west face N0/N1 rows r+1,r+3 = inputs A,B; east face S5 row r+1 = input C, S4 row r+3 = OUTPUT. N face E2/E3 and S face W6/W7 off (first/last machine like the golden).
// LANES: slot 0 (row L0) -> east face (column cx+6 down); slot 1 (L0+1) -> west r+1 (column cx-1); slot 2 (L0+2) -> west r+3 (column cx-3, crossover cx-2,cx-1).
//   Item->slot: spec.main = index of the chain item in the recipe inputs (default 0); slot 0 carries it, the others follow in recipe order (ports.in[t].item = perm[t]; lanes are symmetric, UNVERIFIED in game).
//   Splitter per machine on every lane, PRIORITY (b.pr) toward the machine so with demand-limited flow machines fill in order (N-1 full + last partial).
//   1 column: collector x=cx+7 north to row L0, then east to x=W-3 and the straight tail. 2 columns (w>=30, n>nCol): same lanes continue east (corner splitters keep E,S, priority S = left column first;
//   UG hops over the left column's C/collector cells) to the right column (X2=X+11); right collector north to row L0 -> east; left collector runs SOUTH to row h-2, east, north along x=X2+8, merges into (X2+8,L0).
// UNVERIFIED IN GAME: (U1) one face carries an input AND an output port (east face S5 in, S4 out); (U2) splitter beside the east face feeds the west cell; (U3) corner splitters (input W, outputs E+S); (U4) horizontal UG pairs spanning 2 cells.
const TPL_X=4,TPL_PITCH=11,TPL_CAP=[60,120,180];
const TPL_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};   // floorRect (verified)
const tplL0=block=>tplIfSets(block,1).o[0];                       // lane/out row origin (iface table)
const tplCol=(h,L0)=>Math.max(0,Math.floor((h-L0-3)/5));          // machines per column (Y0=L0+3)
const tplCols=w=>w>=TPL_X+TPL_PITCH+9?2:1;                        // columns that fit the width
// per-machine rates (/min): spec.rates, else looked up from the planner recipe table (rec key = rk(recipe)); null if unknown
function tplRates(spec){
  if(spec.rates)return{i:spec.rates,o:spec.rout};
  if(typeof RECS==='undefined'||typeof rk!=='function')return null;
  const r=[].concat(...Object.values(RECS)).find(x=>rk(x)===spec.rec);
  return r?{i:r.i.map(([,q])=>q*1800/r.t),o:r.o[1]*1800/r.t}:null;
}
// tplGroup: max machines one lane may feed (derate*cap/rmax_in); also limited by the out belt. >=1 or 0 when one machine is over the belt
function tplGroup(spec){
  const R=tplRates(spec);if(!R)return Infinity;
  const cap=TPL_CAP[spec.mk??1],mi=Math.max(...R.i);
  if(mi>cap)return 0;
  const g=Math.floor(tplDerate()*cap/mi);
  return R.o?Math.min(g,Math.floor(cap/R.o)):g;
}
// tplMax: geometric max; clamped to one lane group unless spec.geom. (second lane set M=2 for more machines: NOT in v1 for this family; more sets come from more blocks)
function tplMax(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return 0;
  const L0=tplL0(spec.block),nc=tplCol(f[1],L0),m=nc+(tplCols(f[0])===2?Math.min(nc,Math.max(0,Math.floor((f[1]-2-L0-3)/5))):0);   // right column must clear the left collector's row h-2
  return spec.geom?m:Math.min(m,tplGroup(spec));
}
function tplBuild(spec){
  const f=TPL_FLOOR[spec.block];if(!f)return{ok:false,why:'unknown block '+spec.block};
  const {mk=1,spMk=1,cls='DAT_Assembler',rec,n}=spec,nMax=tplMax(spec);
  if(cls!=='DAT_Assembler')return{ok:false,why:'class'};
  if(!spec.geom&&tplGroup(spec)<1)return{ok:false,why:'rate: one machine needs more than the belt cap',nMax:0};
  if(n<1||n>nMax)return{ok:false,why:'n '+n+' outside 1..'+nMax+(nMax&&nMax<tplMax({...spec,geom:true})?' (need M=2 / more blocks)':''),nMax};
  const [w,h]=f,L0=tplL0(spec.block),Y0=L0+3,nc=tplCol(h,L0),two=tplCols(w)===2&&n>nc,n1=two?nc:n,n2=two?n-nc:0;
  const X=TPL_X,X2=X+TPL_PITCH,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],items=[];
  const B=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),U=(x,y,rot=1)=>items.push({cls:ug,x,y,rot,h:0,pid:0}),
    S=(x,y,keep,rot,mach)=>{const q={cls:sc,x,y,rot,h:0,pid:0,off:pfSplOff(sc,rot,keep)};
      if(keep.length>1){const p=portsOf({cls:sc,x:0,y:0,rot,off:[]}).find(p=>p.dir==='out'&&FN[p.wf]===mach);q.pr=[prIdx({cls:sc},p),-1]}   // priority toward the machine side
      items.push(q)};
  const col=(cx,m,left)=>{   // one column at x=cx; left = another column follows east (lane corners branch)
    const r=i=>Y0+5*i,last=m-1;
    for(let i=0;i<m;i++)items.push({cls,x:cx,y:r(i),rot:3,h:0,pid:0,rec,off:[...(i===0?['E2','E3']:[]),...(i===last?['W6','W7']:[])]});
    for(let y=L0+2;y<=Y0;y++)B(cx-1,y,1);      // A column below corner (cx-1,L0+1)
    for(let y=L0+3;y<Y0+3;y++)B(cx-3,y,1);     // B column below corner (cx-3,L0+2)
    for(let y=L0+1;y<=Y0;y++)B(cx+6,y,1);      // C column below corner (cx+6,L0)
    for(let i=0;i<m;i++){
      const fin=i===last;
      S(cx-1,r(i)+1,fin?['E']:['S','E'],1,'E');
      if(!fin){U(cx-1,r(i)+2);U(cx-1,r(i)+4);B(cx-1,r(i)+5,1)}
      B(cx-2,r(i)+3,0);B(cx-1,r(i)+3,0);
      S(cx-3,r(i)+3,fin?['E']:['S','E'],1,'E');
      if(!fin)for(let y=r(i)+4;y<=r(i)+7;y++)B(cx-3,y,1);
      S(cx+6,r(i)+1,fin?['W']:['S','W'],1,'W');B(cx+5,r(i)+1,2);
      if(!fin){U(cx+6,r(i)+2);U(cx+6,r(i)+4);B(cx+6,r(i)+5,1)}
      B(cx+5,r(i)+3,0);B(cx+6,r(i)+3,0);
    }
    return r(last)+3;   // output row of the last machine
  };
  // lane rows from the west edge (L0 slot 0 -> C, L0+1 -> A, L0+2 -> B)
  const a=L0+1,b=L0+2;
  for(let x=0;x<=X+5;x++)B(x,L0,0);
  if(two){S(X+6,L0,['E','S'],0,'S');for(let x=X+7;x<=X2+5;x++)B(x,L0,0);B(X2+6,L0,1)}else B(X+6,L0,1);
  for(let x=0;x<=X-2;x++)B(x,a,0);
  if(two){S(X-1,a,['E','S'],0,'S');for(let x=X;x<=X+4;x++)B(x,a,0);U(X+5,a,0);U(X+7,a,0);for(let x=X+8;x<=X2-2;x++)B(x,a,0);B(X2-1,a,1)}else B(X-1,a,1);
  for(let x=0;x<=X-4;x++)B(x,b,0);
  if(two){S(X-3,b,['E','S'],0,'S');U(X-2,b,0);U(X,b,0);for(let x=X+1;x<=X+4;x++)B(x,b,0);U(X+5,b,0);U(X+7,b,0);for(let x=X+8;x<=X2-4;x++)B(x,b,0);B(X2-3,b,1)}else B(X-3,b,1);
  const endL=col(X,n1,two);
  if(two){
    const endR=col(X2,n2,false);
    for(let y=endR;y>=L0+1;y--)B(X2+7,y,3);
    for(let x=X2+7;x<=w-3;x++)B(x,L0,0);
    for(let y=Y0+3;y<h-2;y++)B(X+7,y,1);
    for(let x=X+7;x<X2+8;x++)B(x,h-2,0);
    for(let y=h-2;y>=L0+1;y--)B(X2+8,y,3);
  }else{
    for(let y=endL;y>=L0+1;y--)B(X+7,y,3);
    for(let x=X+7;x<=w-3;x++)B(x,L0,0);
  }
  tplOutTail(items,{bc,W:w,yc:L0,yo:L0});
  const perm=[spec.main??0,...[0,1,2].filter(i=>i!==(spec.main??0))];
  const cnt=c=>items.filter(o=>o.cls===c).length;
  return{ok:true,items,w,h,nMax,cols:two?2:1,ns:two?[n1,n2]:[n],
    ports:{in:[0,1,2].map(t=>({x:0,y:L0+t,item:perm[t],dir:'E',set:0,copy:0,row:0})),out:[{x:w-1,y:L0,dir:'E',set:0,row:0}]},
    rows:[{m:n}],   // every lane feeds all n machines (checkPlan source weight)
    iface:{v:1,block:spec.block,S:1,M:1,k:3,main:spec.main??0,n,sets:[{o:L0,n}],side:TPL_IF_SIDE.asm_3in},
    stats:{belts:cnt(bc),ug:cnt(ug),spl:cnt(sc),machines:n}};
}
