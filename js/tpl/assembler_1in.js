// TPL assembler_1in: DAT_Assembler, 1-input recipes, factory-only block template (no containers).
// Interface: in lanes = belt cell x=0 rot 0 (E) at fixed rows, out lanes = last belt cell x=W-1 rot 0 (E) at fixed rows. Every lane cell exists for every n (stubs).
// Machines: rot 0 (input N face, output S face, other ports off). Two row types, fixed per block type:
//   S row (pitch 7): manifold row y0 (splitter above every machine, N0 port), machines y0+1..y0+5, collector y0+6.
//   D row (pitch 8): two lane rows A=y0, B=y0+1, machines y0+2..y0+6, collector y0+7. Machine k even -> lane B via N1 (splitter in row B, x=5k+3),
//     k odd -> lane A via N0 (splitter in row A at x=5k+1, dropper belt in row B, lane B hops it with an UG pair). Two lanes per row = 2*g machines per row.
//   1x1 / 1x2: [S,S]. 2x2 / 2x2c: [D,D,S,S] (8+8+7+7 = 30, no spare row).
// Quantity n only changes the number of machines (+ their splitter/UG/dropper); rows fill S rows first, then D rows. Unused lane cells stay as stubs.
// Rates: per-machine in/out per min = qty*1800/t. g_in = floor(DERATE*cap/in) machines per lane, g_out = floor(cap/out) per collector (min 1). Row cap: S min(W/5,g_in,g_out); D min(W/5,2*g_in,g_out).
const TPL_AS1_BLOCK={'1x1':{nm:'BPO_Station_01',rows:'SS'},'1x2':{nm:'BPO_Station_2x1',rows:'SS'},'2x2':{nm:'BPO_Station_02',rows:'DDSS'},'2x2c':{nm:'BPO_Station_03',rows:'DDSS'}};
const TPL_AS1_CAP=[60,120,180];
function tplAs1Rates(spec){
  const cap=TPL_AS1_CAP[spec.mk|0],der=typeof BL!=='undefined'?BL.DERATE:0.5;
  let rin=spec.rin,rout=spec.rout;
  if(rin==null||rout==null){
    const r=recsOf(def(spec.cls)).find(q=>rk(q)===spec.rec);
    if(!r||r.i.length!==1)return null;
    rin=r.i[0][1]*1800/r.t;rout=r.o[1]*1800/r.t;
  }
  return{cap,rin,rout,gin:Math.max(1,Math.floor(der*cap/rin)),gout:Math.max(1,Math.floor(cap/rout))};
}
function tplAs1Plan(spec){
  const B=TPL_AS1_BLOCK[spec.block];if(!B)return{ok:false,why:'block type '+spec.block};
  if(spec.cls!=='DAT_Assembler')return{ok:false,why:'class '+spec.cls};
  const cls=plcCls(B.nm),f=cls&&floorRect({cls,x:0,y:0,h:0,rot:0});if(!f)return{ok:false,why:'no floor '+B.nm};
  const R=tplAs1Rates(spec);if(!R)return{ok:false,why:'recipe is not a 1-input Assembler recipe'};
  const W=f.w,H=f.h,per=Math.floor(W/5),rows=[];let y=0;
  for(const t of B.rows){const h=t==='S'?7:8;if(y+h>H)return{ok:false,why:'rows do not fit the floor'};
    rows.push({t,y0:y,cap:Math.min(per,t==='S'?R.gin:2*R.gin,R.gout)});y+=h}
  return{ok:true,W,H,R,rows,nMax:rows.reduce((a,r)=>a+r.cap,0),cls:B.nm};
}
function tplMax(spec){const p=tplAs1Plan(spec);return p.ok?p.nMax:0}
function tplBuild(spec){
  const P=tplAs1Plan(spec);if(!P.ok)return P;
  const n=spec.n|0;if(n<1)return{ok:false,why:'n<1'};if(n>P.nMax)return{ok:false,why:'n '+n+' > nMax '+P.nMax};
  const mk=spec.mk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spec.spMk==null?mk:spec.spMk],W=P.W,items=[];
  const keysOf=(inK)=>portsOf({cls:spec.cls,x:0,y:0,rot:0,off:[]}).filter(p=>p.key!==inK&&p.key!=='S4').map(p=>p.key).sort();
  const offN0=keysOf('N0'),offN1=keysOf('N1'),spo=pfSplOff(sc,0,['E','S']);
  const bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),sp=(x,y)=>items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:spo}),ugi=(x,y)=>items.push({cls:ug,x,y,rot:0,h:0,pid:0});
  const mach=(x,y,off)=>items.push({cls:spec.cls,x,y,rot:0,h:0,pid:0,off,rec:spec.rec});
  // fill: S rows first (bottom first), then D rows
  const order=[...P.rows.map((r,i)=>[r,i])].sort((a,b)=>(a[0].t==='S'?0:1)-(b[0].t==='S'?0:1)||b[1]-a[1]).map(q=>q[0]);
  let left=n;const cnt=new Map();for(const r of order){const m=Math.min(left,r.cap);cnt.set(r,m);left-=m}
  const ports={in:[],out:[]};
  for(const r of P.rows){
    const m=cnt.get(r),y0=r.y0;
    if(r.t==='S'){
      const yIn=y0,yOut=y0+6,last=5*(m-1)+1;
      for(let x=0;x<=Math.max(last,0);x++){if(m>0&&(x-1)%5===0&&x>=1)sp(x,yIn);else bt(x,yIn,0)}
      for(let k=0;k<m;k++)mach(5*k,y0+1,offN0);
      for(let x=m?1:W-1;x<W;x++)bt(x,yOut,0);   // collector to the east edge (stub when m=0: the edge cell only)
      ports.in.push({x:0,y:yIn,item:0,dir:'E'});ports.out.push({x:W-1,y:yOut,dir:'E'});
    }else{
      const yA=y0,yB=y0+1,yOut=y0+7;
      const A=[],Bk=[];for(let k=0;k<m;k++)(k%2?A:Bk).push(k);
      const lastA=A.length?5*A[A.length-1]+1:0,lastB=Bk.length?5*Bk[Bk.length-1]+3:0;
      for(let x=0;x<=lastA;x++)A.includes((x-1)/5)&&x>=1?sp(x,yA):bt(x,yA,0);
      for(const k of A)bt(5*k+1,yB,1);   // dropper into N0
      const dr=new Set(A.map(k=>5*k+1));
      for(let x=0;x<=lastB;x++){
        if(dr.has(x))continue;
        if(dr.has(x+1)){ugi(x,yB);continue}   // hop entrance (only when lane B continues beyond: x+2<=lastB)
        if(dr.has(x-1)){ugi(x,yB);continue}
        if(Bk.includes((x-3)/5)&&x>=3)sp(x,yB);else bt(x,yB,0);
      }
      for(const k of Bk)mach(5*k,y0+2,offN1);
      for(const k of A)mach(5*k,y0+2,offN0);
      for(let x=m?1:W-1;x<W;x++)bt(x,yOut,0);
      ports.in.push({x:0,y:yA,item:0,dir:'E'},{x:0,y:yB,item:0,dir:'E'});ports.out.push({x:W-1,y:yOut,dir:'E'});
    }
  }
  const stats={belts:0,ug:0,spl:0,machines:0};
  for(const b of items){if(PLC_BELT.includes(b.cls))stats.belts++;else if(PLC_UG.includes(b.cls))stats.ug++;else if(PLC_SPL.includes(b.cls))stats.spl++;else stats.machines++}
  return{ok:true,items,w:W,h:P.H,ports,nMax:P.nMax,stats,rates:P.R,rows:P.rows.map(r=>({t:r.t,y0:r.y0,cap:r.cap,n:cnt.get(r)}))};
}
