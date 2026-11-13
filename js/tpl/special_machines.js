// TPL special_machines: Supercomputer (k=2), RelicSynthesizer (k=0 Protomatter, k=1 Relic Shard). Global script style, no modules.
// Needs page globals: portsOf, dim, def, recsOf, pfSplOff, PLC_BELT/PLC_SPL/PLC_UG, BL (DERATE), MKS.
// Edge Interface v1 (needs js/tpl/iface.js loaded: tplIfSets, tplIfRows, tplOutTail, tplDerate).
// Layout: S sets (origins TPL_IF_SETS), each set = [k lane rows at o..o+k-1][machine row h][OUT row yc=o+k+h]; machines at x=1.. (edge column x=0 holds only port belts), pitch w, x<=W-3 (rowCap=floor((W-3)/w)).
//  OUT row ends at W-3, tplOutTail jogs up the trunk x=W-2 to row o and exits at (W-1,o). Lane rows x=0 belt rot 0 (stub when the set has 0 machines).
//  Every manifold splitter has PRIORITY toward its machine (b.pr=[0,-1], machine face S = index 0): sets/machines fill in order, N-1 full + last partial.
//  k=0 (Protomatter): no in lanes.
var TPL_BLK={'1x1':[14,14,'BPO_Station_01'],'1x2':[30,14,'BPO_Station_2x1'],'2x2':[30,30,'BPO_Station_02'],'2x2c':[30,30,'BPO_Station_03']};
var TPL_CAP=[60,120,180];
// per class: port x positions on the N/S faces at rot 0. inX[i] = column of input item i (i=0 direct feeder, i=1 lane with underpass), xo = output column.
var TPL_MC={DAT_Supercomputer:{w:5,h:5,inX:[3,1],xo:1},DAT_RelicSynthesizer:{w:9,h:9,inX:[4],xo:4}};
function tplRec(spec){
  const d=def(spec.cls),r=recsOf(d).find(x=>rkm(x,spec.rec));
  return r||null;
}
// default S per block (Supercomputer k=2 / Relic k=0,1)
var TPL_SP_S={DAT_Supercomputer:{'1x1':1,'1x2':1,'2x2':3,'2x2c':2},DAT_RelicSynthesizer:{'1x1':1,'1x2':1,'2x2':2,'2x2c':2}};
// plan: {ok,why,S,o,rowCap,nMax,k,mc,rec,W,H,gIn,oCap,rOut,rIn,cap}
function tplPlan(spec){
  const B=TPL_BLK[spec.block],mc=TPL_MC[spec.cls];
  if(!B)return{ok:false,why:'unknown block '+spec.block};
  if(!mc)return{ok:false,why:'class not supported '+spec.cls};
  const rec=tplRec(spec);if(!rec)return{ok:false,why:'recipe not found '+spec.rec};
  const k=rec.i.length,mk=spec.mk|0,cap=TPL_CAP[mk],der=tplDerate(),rate=q=>q*1800/rec.t;
  if(k>mc.inX.length)return{ok:false,why:'machine has no '+k+' input columns'};
  const rIn=k?Math.max(...rec.i.map(([,q])=>rate(q))):0,rOut=rate(rec.o[1]);
  const gIn=k?Math.floor(der*cap/rIn):Infinity,oCap=Math.floor(cap/rOut);   // oCap: machines per OUT belt (no derate on outputs, load <= cap)
  if(gIn<1)return{ok:false,why:'rate'};
  if(oCap<1)return{ok:false,why:'output rate: one machine exceeds the belt'};
  const [W,H]=B,S=spec.S||TPL_SP_S[spec.cls][spec.block],T=tplIfSets(spec.block,S);
  if(!T.ok)return{ok:false,why:T.why};
  const rowCap=Math.min(Math.floor((W-2-1)/mc.w),gIn,oCap),Hr=k+mc.h+1;
  if(rowCap<1)return{ok:false,why:'machine does not fit x<=W-3 (width '+W+')'};
  const bot=spec.block==='2x2c'?26:H;   // 2x2c: rows 26+ are corner posts
  if(T.o.some((o,s)=>o+Hr>(s+1<T.o.length?T.o[s+1]:bot)))return{ok:false,why:'set rows do not fit ('+Hr+' rows needed)'};
  return{ok:true,S,o:T.o,k,mc,rec,W,H,nMax:S*rowCap,rowCap,gIn,oCap,rOut,rIn,cap};
}
function tplMax(spec){const P=tplPlan(spec);return P.ok?P.nMax:0}
function tplBuild(spec){
  const P=tplPlan(spec);if(!P.ok)return P;
  const {S,o,k,mc,rec,W,H}=P,n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1'};
  if(n>P.nMax)return{ok:false,why:'n '+n+' > nMax '+P.nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?mk:spec.spMk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk];
  const items=[],ports={in:[],out:[]},st={belts:0,ug:0,spl:0,machines:0},rows=[];
  const belt=(x,y,rot)=>{items.push({cls:bc,x,y,rot,h:0,pid:0});st.belts++};
  const base=portsOf({cls:spec.cls,x:0,y:0,rot:0,off:[]});
  const key=(f,x)=>(base.find(p=>p.f===f&&p.x===x)||{}).key;
  const main=k&&spec.main>0&&spec.main<k?spec.main|0:0,perm=[main,...Array.from({length:k},(_,i)=>i).filter(i=>i!==main)];
  const useKeys=[...mc.inX.slice(0,k).map(x=>key('N',x)),key('S',mc.xo)];
  const off=base.filter(p=>!useKeys.includes(p.key)).map(p=>p.key).sort();
  const w=mc.w;
  let left=n;
  const sets=[];
  o.forEach((y0,s)=>{
    const m=Math.min(P.rowCap,left);left-=m;sets.push({o:y0,n:m});rows.push({m});
    const yM=y0+k,yOut=y0+k+mc.h;
    for(let i=0;i<k;i++)ports.in.push({x:0,y:y0+i,item:perm[i],dir:'E',set:s,copy:0,row:s});
    ports.out.push({x:W-1,y:y0,dir:'E',set:s});
    if(!m){for(let i=0;i<k;i++)belt(0,y0+i,0);belt(W-1,y0,0);return}
    for(let j=0;j<m;j++){items.push({cls:spec.cls,x:1+j*w,y:yM,rot:0,h:0,pid:0,off,rec:spec.rec});st.machines++}
    const spl=(x,y,last)=>{items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:pfSplOff(sc,0,last?['S']:['E','S']),pr:[0,-1]});st.spl++};
    if(k===1){
      const xa=1+mc.inX[0],lastX=(m-1)*w+xa;
      for(let x=0;x<=lastX;x++){const j=(x-xa)/w;if(Number.isInteger(j)&&j>=0&&j<m)spl(x,y0,j===m-1);else belt(x,y0,0)}
    }else if(k===2){
      const xA=1+mc.inX[0],xB=1+mc.inX[1],yT=y0,yI=y0+1,lastA=(m-1)*w+xA,lastB=(m-1)*w+xB;
      const sA=new Set(),sB=new Set(),skip=new Set(),ent=new Set(),ext=new Set();
      for(let j=0;j<m;j++){const b=j*w;sA.add(b+xA);sB.add(b+xB);if(j<m-1){skip.add(b+xA);ent.add(b+xA-1);ext.add(b+xA+1)}}
      for(let x=0;x<=lastA;x++){if(sA.has(x))spl(x,yT,(x-xA)/w===m-1);else belt(x,yT,0)}
      for(let j=0;j<m;j++)belt(j*w+xA,yI,1);
      for(let x=0;x<=lastB;x++){
        if(skip.has(x))continue;
        if(sB.has(x))spl(x,yI,(x-xB)/w===m-1);
        else if(ent.has(x)||ext.has(x)){items.push({cls:ug,x,y:yI,rot:0,h:0,pid:0});st.ug++}
        else belt(x,yI,0);
      }
    }
    for(let x=1+mc.xo;x<=W-3;x++){belt(x,yOut,0)}
    const b0=items.length;tplOutTail(items,{bc,W,yc:yOut,yo:y0});st.belts+=items.length-b0;
  });
  const area=W*H;
  return{ok:true,items,w:W,h:H,ports,rows,nMax:P.nMax,stats:st,area,k,gIn:P.gIn,oCap:P.oCap,rIn:P.rIn,rOut:P.rOut,cap:P.cap,
    iface:{v:1,block:spec.block,S,M:1,k,main,n,sets,side:[]}};
}
