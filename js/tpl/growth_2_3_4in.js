// TPL growth_2_3_4in: DAT_GrowthChamber (7x7, user 2026-11-14) factory-only template for 2, 3 or 4 input recipes (growth recipes use the same layout: the seed is just lane item 0 of the recipe).
// Spec: vault main-sequence/tasks/2026-11-13-template-contract.md + edge-interface-v1.md. Globals: tplBuild(spec), tplMax(spec). Needs PLC_BELT/PLC_SPL/PLC_UG, pfSplOff, portsOf, dim, RECS, rk (page globals) and js/tpl/iface.js (tplIfSets, tplOutTail, tplDerate, TPL_IF_SIDE). Tests: tests/tpl_growth_2_3_4in.mjs.
// GrowthChamber ports (rot 0, model.js portsOf): 2 per face at positions 3 and 5 of 7 (N x=2,4; E y=2,4; S x=2,4; W y=2,4; user 2026-11-14), dir null = BIDIRECTIONAL, all toggleable. A port is input/output by item flow (user fact, no face rule).
// EDGE INTERFACE v1: sets S per block (1x1/1x2 1; 2x2 3, k=4 2; 2x2c 2), each set = one machine row group at origin o_s with its own lanes (rows o,o+1 + side rows k3 o+8, k4 o+7,o+8) and ONE out row o_s at x=W-1. Machines x<=W-3, trunk x=W-2 (tplOutTail). n fills set by set; empty sets keep belt stubs. Manifold splitters have PRIORITY toward their machine (b.pr) so machines fill in order.
// LAYOUT of one set (rot 0, pitch p, y offsets from the set top yo; machine 7x7 y=yo+2..yo+8, XS = machine x+1 so port columns are XS+1, XS+3; collector/lane rows below the machine are +2 vs the old 5x5 layout (k2 rows 10, k3 11, k4 13, pitch 7/8)):
//  N side (all k): lane A far row yo+0 (splitter at X+3, feeder belt (X+3,yo+1) down), lane B near row yo+1 (splitter at X+1 = the N0 port cell, UG hop over the A feeder). Same as blRow2.
//  k=2: collector row yo+7 = S port row; output port S4 (x=1); S5 off. rows 8.
//  k=3: input C = far lane on row yo+8 (splitter X+1, feeder belt up at (X+1,yo+7)); output port S5 (x=3) on collector row yo+7, which UG-hops the C feeders of the next machines. rows 9.
//  k=4: pitch 6. C near lane row yo+7 (splitter X+1, UG hop over D feeder), D far lane row yo+8 (splitter X+3, feeder up at (X+3,yo+7)). Output port E2 (y=yo+3) -> gap column X+5 down, vertical UG under both S lanes (yo+6 -> yo+9), collector row yo+10. rows 11. UNVERIFIED: output on an E port, gap column shared with the next machine's (off) W port.
// Block floors (planner cells): 1x1 14x14, 1x2 30x14, 2x2 30x30, 2x2c 30x30 (2x2c ports rows 4..25).
const TPLG_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};
const TPLG_CAP=[60,120,180];
const TPLG_X0=1;   // first machine x: x=0 holds only port belts (edge-free rule), so machines start at x=1
const TPLG_H={2:10,3:11,4:13};   // rows per set (lane rows + machine + collector)
function tplGk(spec){return spec.rec?spec.rec.split('>')[0].split('+').length:(spec.k||2)}
function tplGp(k){return k===4?8:7}
// fixed local rows of lanes / collector for a set at yo (identical for every n)
function tplLaneRows(k,yo=0){
  const r={2:{in:[0,1],out:9},3:{in:[0,1,10],out:9},4:{in:[0,1,9,10],out:12}}[k];
  return{in:r.in.map(y=>y+yo),out:r.out+yo};
}
function tplGS(spec,k){   // default sets per block, lowered until every set owns >= TPLG_H[k] rows (7x7 machine: k=3 on 2x2 -> 2, k=4 on 2x2c -> 1)
  if(spec.S)return spec.S;
  const d=spec.block==='2x2'?(k===4?2:3):spec.block==='2x2c'?2:1;
  for(let S=d;S>=1;S--){const t=tplIfSets(spec.block,S);if(t.ok&&t.hs.every(h=>h>=TPLG_H[k]))return S}
  return d;
}
function tplGRec(spec){
  if(spec.recObj)return spec.recObj;
  if(typeof RECS==='undefined'||typeof rk==='undefined'||!spec.rec)return null;
  for(const c in RECS)for(const r of RECS[c])if(rk(r)===spec.rec)return r;
  return null;
}
// per-set capacity: geometry floor((W-2)/p), capped by g=floor(derate*cap/rmax_in) when the recipe is known
function tplGPer(spec){
  const f=TPLG_FLOOR[spec.block],k=tplGk(spec),geom=Math.floor((f[0]-3-TPLG_X0-(k===4?7:6))/tplGp(k))+1,r=tplGRec(spec);
  if(!r)return{geom,g:Infinity,per:geom};
  const cap=TPLG_CAP[spec.mk|0],g=Math.floor(tplDerate()*cap/Math.max(r.o[1]*1800/r.t,...r.i.map(([,q])=>q*1800/r.t)));   // rmax over inputs AND the (gross) output lane
  return{geom,g,per:Math.min(geom,g)};
}
function tplGSets(spec){
  const f=TPLG_FLOOR[spec.block],k=tplGk(spec);
  if(!f||!TPLG_H[k])return{ok:false,why:'unknown block/k'};
  const t=tplIfSets(spec.block,tplGS(spec,k));
  if(!t.ok)return t;
  if(t.hs.some(h=>h<TPLG_H[k]))return{ok:false,why:'set rows '+t.hs+' < '+TPLG_H[k]+' for k='+k};
  return t;
}
function tplMax(spec){
  const f=TPLG_FLOOR[spec.block];if(!f||!TPLG_H[tplGk(spec)])return 0;
  const t=tplGSets(spec);if(!t.ok)return 0;
  return t.o.length*tplGPer(spec).per;
}
function tplBuild(spec){
  const f=TPLG_FLOOR[spec.block],k=tplGk(spec);
  if(!f)return{ok:false,why:'unknown block '+spec.block};
  if(![2,3,4].includes(k))return{ok:false,why:'inputs k='+k+' (2,3,4 only)'};
  if(spec.cls&&spec.cls!=='DAT_GrowthChamber')return{ok:false,why:'class '+spec.cls};
  const ST=tplGSets(spec);if(!ST.ok)return{ok:false,why:ST.why};
  const PR=tplGPer(spec);
  if(PR.per<1)return{ok:false,why:'rate: g='+PR.g+' machines per lane (need M=2)',nMax:0};
  const S_=ST.o.length,nMax=S_*PR.per,n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1',nMax};
  if(n>nMax&&!spec._force)return{ok:false,why:'n='+n+' > nMax='+nMax+' for '+spec.block+' k='+k,nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?1:spec.spMk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],cls='DAT_GrowthChamber',p=tplGp(k),Fw=f[0];
  const items=[],it=(c,x,y,rot,extra)=>{const o={cls:c,x,y,rot,h:0,pid:0};if(extra)Object.assign(o,extra);items.push(o);return o};
  // S(): pr = splitter face index toward the machine (SPL_FACES S=0,E=1,N=2) = priority output
  const B=(x,y,rot)=>it(bc,x,y,rot),U=(x,y,rot)=>it(ug,x,y,rot),S=(x,y,keep,pr)=>it(sc,x,y,0,{off:pfSplOff(sc,0,keep),pr:[pr,-1]});
  const XS=i=>TPLG_X0+1+p*i,ix=(x,c)=>{const v=(x-TPLG_X0-1-c)/p;return Number.isInteger(v)&&v>=0?v:-1};   // machine x; ix = index of the machine whose column offset c is x, else -1
  const used={2:['N0','N1','S4'],3:['N0','N1','S4','S5'],4:['N0','N1','S4','S5','E2']}[k];
  const off=['N0','N1','E2','E3','S4','S5','W6','W7'].filter(q=>!used.includes(q));
  // sets filled in order, PR.per machines each; _force overflow goes to the last set (leaves the floor)
  const cnt0=ST.o.map((_,s)=>Math.min(PR.per,Math.max(0,n-s*PR.per)));
  if(n>nMax)cnt0[S_-1]+=n-nMax;
  const rowOf=(yo,n)=>{
    for(let i=0;i<n;i++)it(cls,XS(i)-1,yo+2,0,{off,rec:spec.rec});
    const last=n-1;
    const ing=(x,c,lo,hi)=>{const v=ix(x,c);return v>=lo&&v<hi},hop=x=>ing(x,2,0,last)||ing(x,4,0,last);   // hop: UG over the next machine's feeder column (offset 3)
    for(let x=0;x<=XS(last)+3;x++){if(ing(x,3,0,n))S(x,yo,['E','S'],0);else B(x,yo,0)}
    for(let i=0;i<n;i++)B(XS(i)+3,yo+1,1);
    for(let x=0;x<=XS(last)+1;x++){
      if(ing(x,1,0,n)){S(x,yo+1,['E','S'],0);continue}
      if(ing(x,3,0,last))continue;
      if(hop(x)){U(x,yo+1,0);continue}
      B(x,yo+1,0);
    }
    const yc=tplLaneRows(k,yo).out;
    if(k===2){
      for(let x=XS(0)+1;x<=Fw-3;x++)B(x,yo+9,0);
    }else if(k===3){
      for(let x=0;x<=XS(last)+1;x++){if(ing(x,1,0,n))S(x,yo+10,['E','N'],2);else B(x,yo+10,0)}
      for(let i=0;i<n;i++)B(XS(i)+1,yo+9,3);
      for(let x=XS(0)+3;x<=Fw-3;x++){
        if(ing(x,1,1,n))continue;   // C feeder column of machine j>=1
        if(ing(x,0,1,n)||ing(x,2,1,n)){U(x,yo+9,0);continue}
        B(x,yo+9,0);
      }
    }else{
      for(let x=0;x<=XS(last)+1;x++){
        if(ing(x,1,0,n)){S(x,yo+9,['E','N'],2);continue}
        if(ing(x,3,0,last))continue;
        if(hop(x)){U(x,yo+9,0);continue}
        B(x,yo+9,0);
      }
      for(let x=0;x<=XS(last)+3;x++){if(ing(x,3,0,n))S(x,yo+10,['E','N'],2);else B(x,yo+10,0)}
      for(let i=0;i<n;i++)B(XS(i)+3,yo+9,3);
      for(let i=0;i<n;i++){const x=XS(i)+6;B(x,yo+4,1);B(x,yo+5,1);B(x,yo+6,1);B(x,yo+7,1);U(x,yo+8,1);U(x,yo+11,1)}
      for(let x=XS(0)+6;x<=Fw-3;x++)B(x,yo+12,0);
    }
    tplOutTail(items,{bc,W:Fw,yc,yo});
  };
  const side=[];
  ST.o.forEach((yo,s)=>{
    if(cnt0[s]>=1)rowOf(yo,cnt0[s]);
    else{tplLaneRows(k,yo).in.forEach(y=>B(0,y,0));B(Fw-1,yo,0)}   // stubs: one plain belt on every slot row + out row
    (k===3?TPL_IF_SIDE.growth_k3:k===4?TPL_IF_SIDE.growth_k4:[]).forEach(d=>side.push(yo+d));
  });
  // slot -> item: slot 0 = spec.main (default 0), the rest in recipe order (lanes are symmetric: relabel only)
  const main=spec.main|0,perm=[main,...Array.from({length:k},(_,i)=>i).filter(i=>i!==main)];
  const ports={in:[],out:[]};
  ST.o.forEach((yo,s)=>{
    tplLaneRows(k,yo).in.forEach((y,t)=>ports.in.push({x:0,y,item:perm[t],dir:'E',set:s,copy:0,row:s}));
    ports.out.push({x:Fw-1,y:yo,dir:'E',set:s});
  });
  // rates (optional recipe: spec.recObj or RECS lookup)
  let rates=null;const r=tplGRec(spec);
  if(r){const cap=TPLG_CAP[mk],inr=r.i.map(([,q])=>q*1800/r.t),out=r.o[1]*1800/r.t,mx=Math.max(...cnt0);
    rates={cap,in:inr,out,g:PR.g,nUse:Math.min(nMax,PR.g*S_,Math.max(1,Math.floor(cap/out))),load:inr.map(x=>x*mx),outLoad:out*mx,derateOk:mx<=PR.g,capOk:inr.every(x=>x*mx<=cap)&&out*mx<=cap};
    if(!spec._force&&!(rates.in.every(x=>x<=cap)&&rates.out<=cap))return{ok:false,why:'one machine alone exceeds the belt Mk'+(mk+1)+' ('+cap+'/min): in '+inr.join('/')+' out '+out+', use a higher Mk',nMax};
  }
  const cnt={belts:0,ug:0,spl:0,machines:0};
  items.forEach(b=>{if(b.cls===cls)cnt.machines++;else if(PLC_BELT.includes(b.cls))cnt.belts++;else if(PLC_UG.includes(b.cls))cnt.ug++;else if(PLC_SPL.includes(b.cls))cnt.spl++});
  return{ok:true,why:'',items,w:Fw,h:f[1],used:{w:Math.max(...items.map(b=>b.x+dim(b).w)),h:Math.max(...items.map(b=>b.y+dim(b).h))},
    ports,rows:ports.in.map(p=>({m:cnt0[p.set]})),iface:{v:1,block:spec.block,S:S_,M:1,k,main,n,sets:ST.o.map((o,s)=>({o,n:cnt0[s]})),side},nMax,rates,stats:cnt,pitch:p,rowsH:TPLG_H[k]};
}
