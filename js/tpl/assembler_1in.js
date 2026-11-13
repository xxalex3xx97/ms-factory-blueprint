// TPL assembler_1in: DAT_Assembler, 1-input recipes, factory-only block template (no containers). Edge Interface v1 (js/tpl/iface.js must be loaded first).
// Interface: in lanes = belt cell x=0 rot 0 at standard set rows (S set: row o; D set: copy 0 = o, copy 1 = o+1), out = ONE belt at x=W-1, row o, per set. Every lane cell exists for every n (stubs).
// Machines: rot 0 (input N face, output S face), x=5k+1 (edge columns x=0 and x=W-1 hold only port belts; x<=W-3, trunk at x=W-2). Two set types, fixed per block type:
//   S set (7 rows): manifold row o (splitter above every machine, N0 port), machines o+1..o+5, collector o+6.
//   D set (8 rows): two lane rows A=o, B=o+1, machines o+2..o+6, collector o+7. Machine k even -> lane A (copy 0, main row) via N0
//     (splitter x=5k+2, dropper belt in row B, lane B hops it with an UG pair), k odd -> lane B (copy 1) via N1 (splitter x=5k+4). Copy 1 is a stub when m=1. Two lanes = 2*g machines per set.
//   Collector ends at x=W-3, tplOutTail jogs it up the trunk x=W-2 to the out row o.
//   1x1 / 1x2: S=2 [S,S] at [0,7]. 2x2: S=4 [D,D,S,S] at [0,8,16,23]. 2x2c: S=3 [D,S,S] at [4,12,19].
// Every manifold splitter has PRIORITY on its machine output (b.pr=[0,-1], face S = index 0 at rot 0): machines fill in order, the last one of a lane is the partial one.
// Quantity n only changes the number of machines (+ their splitter/UG/dropper); sets fill S sets first (bottom first), then D sets. Unused lane cells stay as stubs.
// Rates: per-machine in/out per min = qty*1800/t. g_in = floor(tplDerate()*cap/in) machines per lane (<1 -> ok:false 'rate'), g_out = floor(cap/out) per collector (min 1). Set cap: S min(per,g_in,g_out); D min(per,2*g_in,g_out).
const TPL_AS1_BLOCK={'1x1':{nm:'BPO_Station_01',S:2,rows:'SS'},'1x2':{nm:'BPO_Station_2x1',S:2,rows:'SS'},'2x2':{nm:'BPO_Station_02',S:4,rows:'DDSS'},'2x2c':{nm:'BPO_Station_03',S:3,rows:'DSS'}};
const TPL_AS1_CAP=[60,120,180];
function tplAs1Rates(spec){
  const cap=TPL_AS1_CAP[spec.mk|0],der=tplDerate();
  let rin=spec.rin,rout=spec.rout;
  if(rin==null||rout==null){
    const r=recsOf(def(spec.cls)).find(q=>rkm(q,spec.rec));
    if(!r||r.i.length!==1)return null;
    rin=r.i[0][1]*1800/r.t;rout=r.o[1]*1800/r.t;
  }
  return{cap,rin,rout,gin:Math.floor(der*cap/rin),gout:Math.max(1,Math.floor(cap/rout))};
}
function tplAs1Plan(spec){
  const B=TPL_AS1_BLOCK[spec.block];if(!B)return{ok:false,why:'block type '+spec.block};
  if(spec.cls!=='DAT_Assembler')return{ok:false,why:'class '+spec.cls};
  const cls=plcCls(B.nm),f=cls&&floorRect({cls,x:0,y:0,h:0,rot:0});if(!f)return{ok:false,why:'no floor '+B.nm};
  const R=tplAs1Rates(spec);if(!R)return{ok:false,why:'recipe is not a 1-input Assembler recipe'};
  if(R.gin<1)return{ok:false,why:'rate'};
  const W=f.w,H=f.h,per=Math.floor((W-3)/5),lay=spec.block==='2x2'&&spec.S===3,SS=lay?3:B.S,T=tplIfSets(spec.block,SS);if(!T.ok)return{ok:false,why:T.why};
  const rows=(lay?'DDD':B.rows).split('').map((t,i)=>({t,y0:T.o[i],cap:lay?Math.min(per,2*R.gin,3*R.gout):Math.min(per,t==='S'?R.gin:2*R.gin,R.gout)}));   // lay (spec.S=3, 2x2): RAIL layout = 3 D sets of 10 rows, up to 3 collector rails per set
  return{ok:true,W,H,R,rows,S:SS,lay,nMax:rows.reduce((a,r)=>a+r.cap,0),cls:B.nm};
}
function tplMax(spec){const p=tplAs1Plan(spec);return p.ok?p.nMax:0}
function tplBuild(spec){
  const P=tplAs1Plan(spec);if(!P.ok)return P;
  const n=spec.n|0;if(n<1)return{ok:false,why:'n<1'};if(n>P.nMax)return{ok:false,why:'n '+n+' > nMax '+P.nMax};
  const mk=spec.mk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spec.spMk==null?mk:spec.spMk],W=P.W,items=[],main=spec.main|0;
  const keysOf=(inK)=>portsOf({cls:spec.cls,x:0,y:0,rot:0,off:[]}).filter(p=>p.key!==inK&&p.key!=='S4').map(p=>p.key).sort();
  const offN0=keysOf('N0'),offN1=keysOf('N1'),spo=pfSplOff(sc,0,['E','S']);
  const bt=(x,y,rot)=>items.push({cls:bc,x,y,rot,h:0,pid:0}),sp=(x,y)=>items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:spo,pr:[0,-1]}),ugi=(x,y)=>items.push({cls:ug,x,y,rot:0,h:0,pid:0});
  const mach=(x,y,off)=>items.push({cls:spec.cls,x,y,rot:0,h:0,pid:0,off,rec:spec.rec});
  // fill: S sets first (bottom first), then D sets
  const order=[...P.rows.map((r,i)=>[r,i])].sort((a,b)=>(a[0].t==='S'?0:1)-(b[0].t==='S'?0:1)||b[1]-a[1]).map(q=>q[0]);
  let left=n;const cnt=new Map();for(const r of order){const m=Math.min(left,r.cap);cnt.set(r,m);left-=m}
  const ports={in:[],out:[]},lanes=[],ex=[],outsOf=[];   // lanes: one entry per in port (planner test weights injection by lanes[p.row].m)
  P.rows.forEach((r,s)=>{
    const m=cnt.get(r),y0=r.y0,D=r.t==='D',yc=y0+(D?7:6),mx=k=>5*k+1,outs=[y0];
    const inP=(y,copy,mm)=>{ports.in.push({x:0,y,item:main,dir:'E',set:s,copy,row:lanes.length});lanes.push({set:s,t:r.t,y0,copy,m:mm,n:mm})};
    if(!D){
      const last=m?mx(m-1)+1:0;
      for(let x=0;x<=last;x++){if(m>0&&x>=2&&(x-2)%5===0)sp(x,y0);else bt(x,y0,0)}
      for(let k=0;k<m;k++)mach(mx(k),y0+1,offN0);
      inP(y0,0,m);
    }else{
      const yA=y0,yB=y0+1;
      const A=[],Bk=[];for(let k=0;k<m;k++)(k%2?Bk:A).push(k);
      const lastA=A.length?mx(A[A.length-1])+1:0,lastB=Bk.length?mx(Bk[Bk.length-1])+3:0;
      for(let x=0;x<=lastA;x++)A.includes((x-2)/5)&&x>=2?sp(x,yA):bt(x,yA,0);
      for(const k of A)bt(mx(k)+1,yB,1);   // dropper into N0
      const dr=new Set(A.map(k=>mx(k)+1));
      for(let x=0;x<=lastB;x++){
        if(dr.has(x))continue;
        if(dr.has(x+1)||dr.has(x-1)){ugi(x,yB);continue}   // hop entrance / exit
        if(Bk.includes((x-4)/5)&&x>=4)sp(x,yB);else bt(x,yB,0);
      }
      for(const k of Bk)mach(mx(k),y0+2,offN1);
      for(const k of A)mach(mx(k),y0+2,offN0);
      inP(yA,0,A.length);inP(yB,1,Bk.length);
    }
    if(m>0&&P.lay){   // rails: group e (east first, gout machines each) on row yc+e; deeper groups drop at their S4 columns; rail 0 jogs up the trunk, rails e>0 leave east on their own row
      const go=P.R.gout;
      for(let e=0;e*go<m;e++){
        const kmin=Math.max(0,m-(e+1)*go),yr=yc+e;
        if(e)for(let k=kmin;k<=m-1-e*go;k++)for(let yy=yc;yy<yr;yy++)bt(mx(k)+1,yy,1);
        const xl=mx(m-1-e*go)+1;   // last injection column of this rail: belts up to it, UG hops beyond (SHAPE)
        for(let x=mx(kmin)+1;x<=xl;x++)bt(x,yr,0);
        tplRun(items,{bc,ug,y:yr,xa:xl+1,xb:e?W-1:W-3});
        if(!e)tplOutTail(items,{bc,W,yc,yo:y0});else{ex.push({x:W-1,y:yr,dir:'E',set:s,rail:e});outs.push(yr)}
      }
    }else if(m>0){const xl=mx(m-1)+1;for(let x=2;x<=xl;x++)bt(x,yc,0);tplRun(items,{bc,ug,y:yc,xa:xl+1,xb:W-3});tplOutTail(items,{bc,W,yc,yo:y0})}   // SHAPE: belts from the first injection column to the last, UG hops to the trunk
    else bt(W-1,y0,0);   // stub: the edge cell only
    ports.out.push({x:W-1,y:y0,dir:'E',set:s});
    outsOf.push(outs);
  });
  ports.out.push(...ex);
  const stats={belts:0,ug:0,spl:0,machines:0};
  for(const b of items){if(PLC_BELT.includes(b.cls))stats.belts++;else if(PLC_UG.includes(b.cls))stats.ug++;else if(PLC_SPL.includes(b.cls))stats.spl++;else stats.machines++}
  const hasD=P.rows.some(r=>r.t==='D');
  return{ok:true,items,w:W,h:P.H,ports,nMax:P.nMax,stats,rates:P.R,rows:lanes,
    iface:{v:1,block:spec.block,S:P.S,M:hasD?2:1,k:1,main,n,sets:P.rows.map((r,i)=>({o:r.y0,n:cnt.get(r),outs:outsOf[i]})),side:[]}};
}
