// TPL special_machines: Supercomputer (k=2), RelicSynthesizer (k=0 Protomatter, k=1 Relic Shard). Global script style, no modules.
// Needs page globals: portsOf, dim, def, recsOf, pfSplOff, PLC_BELT/PLC_SPL/PLC_UG, BL (DERATE), MKS.
// Layout: machine ROWS (pattern of js/bl_geom.js blRow/blRow2), machines left-aligned at x=0, pitch w.
//  single unit: [lane rows (k)] [machine row h] [OUT row]; pair unit: row up, shared OUT row, row down mirrored about OUT (lanes at the outer edges).
//  Units are stacked top to bottom: p pairs then s singles (chosen to maximise machines). Fill order: unit by unit, up row then down row.
// Interface: inputs enter on the WEST edge at x=0 (belt rot 0, one lane per row and item), outputs leave on the EAST edge (x=W-1, rot 0, one OUT belt per unit).
//  Lane rows are FIXED per (block, mk, recipe k); empty rows keep a 1-cell stub belt at (0,lane y) and (W-1,OUT y).
// ponytail: lane per row (no shared lanes inside the block); 2x2 Supercomputer therefore has 8 in lanes, 2 out lanes.
var TPL_BLK={'1x1':[14,14,'BPO_Station_01'],'1x2':[30,14,'BPO_Station_2x1'],'2x2':[30,30,'BPO_Station_02'],'2x2c':[30,30,'BPO_Station_03']};
var TPL_CAP=[60,120,180];
// per class: port x positions on the N/S faces at rot 0. inX[i] = column of input item i (i=0 direct feeder, i=1 lane with underpass), xo = output column.
var TPL_MC={DAT_Supercomputer:{w:5,h:5,inX:[4,2],xo:2},DAT_RelicSynthesizer:{w:9,h:9,inX:[4],xo:4}};
function tplRec(spec){
  const d=def(spec.cls),r=recsOf(d).find(x=>x.i.map(y=>y[0]).join('+')+'>'+x.o[0]===spec.rec);
  return r||null;
}
// plan: row structure for a block. returns {ok,why,units:[{y0,pair,rows:[{flip,cap}],yOut,oCap}],k,w,h,H,W,nMax,rec}
function tplPlan(spec){
  const B=TPL_BLK[spec.block],mc=TPL_MC[spec.cls];
  if(!B)return{ok:false,why:'unknown block '+spec.block};
  if(!mc)return{ok:false,why:'class not supported '+spec.cls};
  const rec=tplRec(spec);if(!rec)return{ok:false,why:'recipe not found '+spec.rec};
  const k=rec.i.length,mk=spec.mk|0,cap=TPL_CAP[mk],der=typeof BL!=='undefined'?BL.DERATE:0.5,rate=q=>q*1800/rec.t;
  if(k>mc.inX.length)return{ok:false,why:'machine has no '+k+' input columns'};
  const rIn=k?Math.max(...rec.i.map(([,q])=>rate(q))):0,rOut=rate(rec.o[1]);
  const gIn=k?Math.floor(der*cap/rIn):Infinity,oCap=Math.floor(cap/rOut);   // oCap: machines per OUT belt (no derate on outputs, load <= cap)
  if(gIn<1)return{ok:false,why:'input rate: one machine needs more than DERATE*belt'};
  if(oCap<1)return{ok:false,why:'output rate: one machine exceeds the belt'};
  const [W,H]=B,rowCap=Math.min(Math.floor(W/mc.w),gIn),Hr=k+mc.h+1,Hp=2*k+2*mc.h+1;
  if(rowCap<1||Hr>H)return{ok:false,why:'machine row does not fit the block ('+Hr+' rows needed, floor '+H+')'};
  let best=null;
  for(let p=0;p*Hp<=H;p++){
    const s=Math.floor((H-p*Hp)/Hr),units=[];let y=0,tot=0;
    for(let i=0;i<p;i++){units.push({y0:y,pair:true});y+=Hp}
    for(let i=0;i<s;i++){units.push({y0:y,pair:false});y+=Hr}
    units.forEach(u=>{u.yOut=u.y0+k+mc.h;u.rows=u.pair?[{flip:false},{flip:true}]:[{flip:false}];u.oCap=oCap;
      let left=oCap;u.rows.forEach(r=>{r.cap=Math.min(rowCap,left);left-=r.cap;tot+=r.cap})});
    if(tot>0&&(!best||tot>best.tot))best={units,tot};
  }
  if(!best)return{ok:false,why:'no unit fits'};
  return{ok:true,units:best.units,k,mc,rec,W,H,nMax:best.tot,rowCap,gIn,oCap,rOut,rIn,cap};
}
function tplMax(spec){const P=tplPlan(spec);return P.ok?P.nMax:0}
function tplBuild(spec){
  const P=tplPlan(spec);if(!P.ok)return P;
  const {units,k,mc,rec,W,H}=P,n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1'};
  if(n>P.nMax)return{ok:false,why:'n '+n+' > nMax '+P.nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?mk:spec.spMk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk];
  const items=[],ports={in:[],out:[]},st={belts:0,ug:0,spl:0,machines:0};
  const belt=(x,y,rot)=>{items.push({cls:bc,x,y,rot,h:0,pid:0});st.belts++};
  const base=portsOf({cls:spec.cls,x:0,y:0,rot:0,off:[]});
  const key=(f,x)=>(base.find(p=>p.f===f&&p.x===x)||{}).key;
  let left=n,fn=0;
  const wE=W-1;
  units.forEach(u=>{
    const yOut=u.yOut;
    // fill
    const cnt=u.rows.map(r=>{const m=Math.min(r.cap,left);left-=m;return m});
    u.rows.forEach((r,ri)=>{
      const m=cnt[ri],flip=r.flip,Y=rel=>flip?2*yOut-(u.y0+rel):u.y0+rel,R=rot=>flip&&rot===1?3:rot;
      // lane rows: rel 0 = A (item 0, outermost), rel 1 = B (item 1, k=2 only); k=1: rel 0 only
      const lanes=[];for(let i=0;i<k;i++)lanes.push({y:Y(i),item:i});
      const yM=u.y0+k;   // rel machine top (unflipped)
      lanes.forEach(l=>ports.in.push({y:l.y,item:l.item,dir:'E',row:fn,unit:u.y0}));
      fn++;
      if(!m){lanes.forEach(l=>belt(0,l.y,0));return}
      const w=mc.w;
      // machines
      const inKeys=[],xs=mc.inX.slice(0,k);
      const f1=flip?'S':'N',fo=flip?'N':'S';
      const useKeys=[...xs.map(x=>key(f1,x)),key(fo,mc.xo)];
      const off=base.filter(p=>!useKeys.includes(p.key)).map(p=>p.key).sort();
      for(let j=0;j<m;j++){
        const top=flip?2*yOut-(yM+mc.h-1):yM;
        items.push({cls:spec.cls,x:j*w,y:top,rot:0,h:0,pid:0,off,rec:spec.rec});st.machines++;
      }
      // manifolds
      const spk=(last)=>pfSplOff(sc,0,last?[flip?'N':'S']:['E',flip?'N':'S']);
      const spl=(x,y,last)=>{items.push({cls:sc,x,y,rot:0,h:0,pid:0,off:spk(last)});st.spl++};
      if(k===1){
        const xa=mc.inX[0],yT=Y(0),lastX=(m-1)*w+xa;
        for(let x=0;x<=lastX;x++){const j=(x-xa)/w;if(Number.isInteger(j)&&j>=0&&j<m)spl(x,yT,j===m-1);else belt(x,yT,0)}
      }else if(k===2){
        const xA=mc.inX[0],xB=mc.inX[1],yT=Y(0),yI=Y(1),lastA=(m-1)*w+xA,lastB=(m-1)*w+xB;
        const sA=new Set(),sB=new Set(),skip=new Set(),ent=new Set(),ext=new Set();
        for(let j=0;j<m;j++){const b=j*w;sA.add(b+xA);sB.add(b+xB);if(j<m-1){skip.add(b+xA);ent.add(b+xA-1);ext.add(b+xA+1)}}
        for(let x=0;x<=lastA;x++){if(sA.has(x))spl(x,yT,(x-xA)/w===m-1);else belt(x,yT,0)}
        for(let j=0;j<m;j++)belt(j*w+xA,yI,R(1));
        for(let x=0;x<=lastB;x++){
          if(skip.has(x))continue;
          if(sB.has(x))spl(x,yI,(x-xB)/w===m-1);
          else if(ent.has(x)||ext.has(x)){items.push({cls:ug,x,y:yI,rot:0,h:0,pid:0});st.ug++}
          else belt(x,yI,0);
        }
      }
      // output belt (shared by both rows of a pair: emitted once, below)
    });
    // OUT belt: from the first machine port x to the east edge; a pair shares it
    const have=cnt.some(c=>c>0);
    if(have)for(let x=mc.xo;x<=wE;x++)belt(x,yOut,0);
    else belt(wE,yOut,0);
    ports.out.push({y:yOut,dir:'E',unit:u.y0});
  });
  const area=W*H;
  return{ok:true,items,w:W,h:H,ports,nMax:P.nMax,stats:st,area,k,rows:units.length,gIn:P.gIn,oCap:P.oCap,rIn:P.rIn,rOut:P.rOut,cap:P.cap};
}
