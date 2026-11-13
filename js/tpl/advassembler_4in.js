// TPL advassembler_4in: DAT_AdvancedAssembler (9x9, 3 ports per face, all toggleable, dir null), 4-input recipes. Contract: vault main-sequence/tasks/2026-11-13-template-contract.md
// Pure geometry; needs placer.js/prefab.js/model.js globals (PLC_BELT/PLC_SPL/PLC_UG, pfSplOff, portsOf, floorRect, plcCls, dim).
// BAND (14 rows, repeated along x at pitch 9, machine k at mx=1+9k, my=y0+3):
//   rA=y0   lane item0 -> splitter at (mx+6,rA) feeds N2 via a 2-cell belt drop      (no hop)
//   rB=y0+1 lane item1 -> splitter at (mx+4,rB) feeds N1 via a 1-cell drop            (UG hop under the item0 drop)
//   rC=y0+2 lane item2 -> splitter at (mx+2,rC) feeds N0 directly                     (UG hop under both drops)
//   y0+3..y0+11 machine (rot 0); only N0,N1,N2 (inputs 0..2), S6 (x=2, input 3) and S8 (x=6, output) enabled, rest off
//   rD=y0+12 lane item3 -> splitter at (mx+2,rD) outputs E and N into S6                (UG hop under the output drop at mx+6)
//   rO=y0+13 collector: output drop (mx+6,rD) rot1 -> collector row rO east to the east edge (x=Fw-1)
// Machine k adds ONLY: the machine, its 4 splitters, its UG pairs/belts to the next machine and its output drop; port rows and exits never move.
// UNVERIFIED in game (same assumptions as plcFourLane/blMachine, PORT_ORDER.DAT_AdvancedAssembler.verified=false):
//   U1 ports with dir null are per-port input OR output (here N0..N2 + S6 in, S8 out, mixed on the S face); U2 'off' ports are fully inert (belts of the collector/merge sit on disabled E/W/S7 cells);
//   U3 a splitter may feed a machine port from the side (blRow does it for N; here also N-output of a splitter into the S face = pfSplOff(rot0,['E','N']), mirrored in blFlip with W/S).
// ponytail: 2x2c = same 30x30 floor as 2x2 (floorRect), only the dock adapter differs; same pattern.
const TPL_AA_BLK={'1x1':'BPO_Station_01','1x2':'BPO_Station_2x1','2x2':'BPO_Station_02','2x2c':'BPO_Station_03'};
const TPL_AA_CLS='DAT_AdvancedAssembler',TPL_AA_PITCH=9,TPL_AA_BAND=14,TPL_AA_CAP=[60,120,180];
// per-machine rates /min (qty*1800/t), output /min; keyed by recipe key. spec.rates / spec.orate override.
const TPL_AA_REC={
 'ITEM_DetectorArray+ITEM_BasicCircuit+ITEM_Superalloy+ITEM_Coolant>ITEM_AdvancedCircuits':{i:[15,15,5,30],o:5},
 'ITEM_ChromaticAlloy+ITEM_ChitinComposite+ITEM_ReinforcedPlates+ITEM_Multisensor>ITEM_AdvancedPlates':{i:[30,30,10,5],o:5},
 'ITEM_Biolattice+ITEM_Graphene+ITEM_ReinforcedGlass+ITEM_Enzyme>ITEM_ChitinComposite':{i:[30,15,15,60],o:5},
 'ITEM_ChromaticAlloy+ITEM_Lonsdaleite+ITEM_EncodedSimulationMatrix+ITEM_SuperconductorCoil>ITEM_Multisensor':{i:[30,30,10,10],o:10}};
function tplAAGeo(S){
  const cls=plcCls(TPL_AA_BLK[S.block]);if(!cls)return{ok:false,why:'unknown block '+S.block};
  const f=floorRect({cls,x:0,y:0,h:0,rot:0}),Fw=f.w,Fh=f.h;
  const y0=Fh<16?0:1,bands=Math.max(0,Math.floor((Fh-y0*2)/TPL_AA_BAND)),per=Math.max(0,Math.floor((Fw-2-1-8)/TPL_AA_PITCH)+1);   // machine k: 1+9k+8<=Fw-2 (x=Fw-2 = merge column, Fw-1 = exit)
  return{ok:bands>0&&per>0,cls,Fw,Fh,y0,bands,per,geom:bands*per};
}
// rate group: machines per lane (g=floor(DERATE*cap/max input rate), same rule as vcPlan); rate-limited nMax = bands*min(per,g)
function tplAARate(S,G){
  const R=TPL_AA_REC[S.rec],rates=S.rates||(R&&R.i);
  if(!rates)return{ok:false,why:'no rates for recipe '+S.rec};
  const der=typeof BL!=='undefined'&&BL.DERATE!=null?BL.DERATE:0.5,cap=TPL_AA_CAP[S.mk],g=Math.floor(der*cap/Math.max(...rates));
  return{ok:g>=1,why:g<1?'rate: one machine needs '+Math.max(...rates)+'/min > derated belt '+der*cap:'',g,rates,orate:S.orate||(R&&R.o)||0,der,cap};
}
function tplMax(S){const G=tplAAGeo(S);if(!G.ok)return 0;if(S.noRate)return G.geom;const r=tplAARate(S);return r.ok?G.bands*Math.min(G.per,r.g):0}
function tplBuild(S){
  const G=tplAAGeo(S);if(!G.ok)return{ok:false,why:G.why||'block too small'};
  const n=S.n|0;if(n<1)return{ok:false,why:'n<1'};
  const gm=tplMax(S);if(n>gm){const r=tplAARate(S);return{ok:false,why:(n>G.geom?'does not fit: ':(r.ok?'rate: ':r.why+' ; '))+'n '+n+' > nMax '+gm,nMax:gm,geomMax:G.geom}}
  const rt=tplAARate(S),c=S.noRate?G.per:Math.min(G.per,rt.g),bc=PLC_BELT[S.mk],ug=PLC_UG[S.mk],sp=PLC_SPL[S.spMk],items=[];
  const bt=(x,y,rot=0)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),u=(x,y)=>items.push({cls:ug,x,y,rot:0,h:0,pid:0});
  const sE=pfSplOff(sp,0,['E','S']),sEN=pfSplOff(sp,0,['E','N']),sx=(x,y,off)=>items.push({cls:sp,x,y,rot:0,h:0,pid:0,off});
  const mp=portsOf({cls:TPL_AA_CLS,x:0,y:0,rot:0,off:[]}),keep=mp.filter(p=>p.f==='N'||(p.f==='S'&&(p.x===2||p.x===6))),moff=mp.filter(p=>!keep.includes(p)).map(p=>p.key).sort();
  const ports={in:[],out:[]};
  for(let b=0;b<G.bands;b++){
    const y0=G.y0+b*TPL_AA_BAND,rA=y0,rB=y0+1,rC=y0+2,my=y0+3,rD=y0+12,rO=y0+13,nb=Math.max(0,Math.min(c,n-b*c));
    ports.in.push({y:rA,item:0,dir:'E',band:b},{y:rB,item:1,dir:'E',band:b},{y:rC,item:2,dir:'E',band:b},{y:rD,item:3,dir:'E',band:b});
    if(b===0)ports.out.push({y:rO,dir:'E'});
    if(!nb){for(const y of [rA,rB,rC,rD])bt(0,y);continue}   // unused band: stub = 1 plain belt at the lane port (dead end)
    const m0=1,last=m0+TPL_AA_PITCH*(nb-1);
    for(let k=0;k<nb;k++)items.push({cls:TPL_AA_CLS,x:m0+9*k,y:my,rot:0,h:0,pid:0,off:moff,rec:S.rec});
    // lanes: row y, splitter offset so (mx+so), spl off list, hop [ent,exit] offsets (mx+..) for every machine but the last (items between ent and exit are skipped), lanes end at the last splitter
    const lane=(y,so,off,hop)=>{const S=new Set(),U=new Set(),skip=new Set();
      for(let k=0;k<nb;k++){const mx=m0+9*k;S.add(mx+so);if(hop&&k<nb-1){U.add(mx+hop[0]);U.add(mx+hop[1]);for(let x=mx+hop[0]+1;x<mx+hop[1];x++)skip.add(x)}}
      for(let x=0;x<=last+so;x++){if(S.has(x)){sx(x,y,off)}else if(U.has(x))u(x,y);else if(!skip.has(x))bt(x,y)}};
    lane(rA,6,sE,null);lane(rB,4,sE,[5,7]);lane(rC,2,sE,[3,7]);lane(rD,2,sEN,[5,7]);
    for(let k=0;k<nb;k++){const mx=m0+9*k;bt(mx+6,rB,1);bt(mx+6,rC,1);bt(mx+4,rC,1);bt(mx+6,rD,1)}   // drops: lane A 2 cells, lane B 1 cell, output drop
    for(let x=m0+6;x<G.Fw;x++)bt(x,rO);       // collector to the east edge
  }
  // 2x2: band 1 collector merges into band 0 collector at column Fw-2 (rows band1.rO .. band0.rO+1 flow north); replaces the band-1 collector's last two cells
  if(G.bands>1&&n>c){
    const r1=G.y0+TPL_AA_BAND+13,r0=G.y0+13,xc=G.Fw-2,drop=items.filter(q=>q.y===r1&&q.x>=xc);
    for(const q of drop)items.splice(items.indexOf(q),1);
    for(let y=r1;y>r0;y--)bt(xc,y,3);
  }
  const stats={belts:items.filter(q=>q.cls===bc).length,ug:items.filter(q=>q.cls===ug).length,spl:items.filter(q=>q.cls===sp).length,machines:items.filter(q=>q.cls===TPL_AA_CLS).length};
  return{ok:true,why:'',items,w:G.Fw,h:G.Fh,ports,nMax:gm,geomMax:G.geom,g:rt.g,per:G.per,bands:G.bands,rates:rt.rates,orate:rt.orate,stats};
}
