// TPL growth_2_3_4in: DAT_GrowthChamber (5x5) factory-only template for 2, 3 or 4 input recipes (growth recipes use the same layout: the seed is just lane item 0 of the recipe).
// Spec: vault main-sequence/tasks/2026-11-13-template-contract.md. Globals: tplBuild(spec), tplMax(spec). Needs PLC_BELT/PLC_SPL/PLC_UG, pfSplOff, portsOf, dim (page globals). Tests: tests/tpl_growth_2_3_4in.mjs.
// GrowthChamber ports (rot 0, model.js portsOf): 2 per face (N x=2,4; E y=2,4; S x=2,4; W y=2,4), dir null = BIDIRECTIONAL, all toggleable. UNVERIFIED in game: a port with a belt pointing in is an input, a belt leading away is an output.
// LAYOUT (rot 0, one machine row, pitch p, y offsets from the row top yo; machine y=yo+2..yo+6):
//  N side (all k): lane A far row yo+0 (splitter at X+4, feeder belt (X+4,yo+1) down), lane B near row yo+1 (splitter at X+2 = the N0 port cell, UG hop over the A feeder). Same as blRow2.
//  k=2: collector row yo+7 = S port row; output port S4 (x=2); S5 off. rows 8.
//  k=3: input C = far lane on row yo+8 (splitter X+2, feeder belt up at (X+2,yo+7)); output port S5 (x=4) on collector row yo+7, which UG-hops the C feeders of the next machines. rows 9.
//  k=4: pitch 6. C near lane row yo+7 (splitter X+2, UG hop over D feeder), D far lane row yo+8 (splitter X+4, feeder up at (X+4,yo+7)). Output port E2 (y=yo+4) -> gap column X+5 down, vertical UG under both S lanes (yo+6 -> yo+9), collector row yo+10. rows 11. UNVERIFIED: output on an E port, gap column shared with the next machine's (off) W port.
// Lanes enter at x=0 (belt rot 0): ports.in[i].y fixed per k (see tplLaneRows), ports.out[0].y fixed per k. n only changes machine count and the belts tied to them.
// Block floors (planner cells): 1x1 14x14, 1x2 30x14, 2x2 30x30, 2x2c 30x30 (2x2c: same floor, needs BPO_StationAdapter for big connectors; corner posts 1x4 not modelled: UNVERIFIED).
const TPLG_FLOOR={'1x1':[14,14],'1x2':[30,14],'2x2':[30,30],'2x2c':[30,30]};
const TPLG_CAP=[60,120,180];
const TPLG_H={2:8,3:9,4:11};   // rows per machine row (lane rows + machine + collector)
function tplGk(spec){return spec.rec?spec.rec.split('>')[0].split('+').length:(spec.k||2)}
function tplGp(k){return k===4?6:5}
// fixed local rows of lanes / collector for a machine row at yo (identical for every n)
function tplLaneRows(k,yo=0){
  const r={2:{in:[0,1],out:7},3:{in:[0,1,8],out:7},4:{in:[0,1,7,8],out:10}}[k];
  return{in:r.in.map(y=>y+yo),out:r.out+yo};
}
function tplGrows(spec,R){   // machine rows stacked in one block
  const f=TPLG_FLOOR[spec.block];if(!f)return 0;const k=tplGk(spec),H=TPLG_H[k];
  return Math.max(0,Math.min(R||99,Math.floor(f[1]/H)));
}
function tplMax(spec){
  const f=TPLG_FLOOR[spec.block];if(!f||!TPLG_H[tplGk(spec)])return 0;
  const k=tplGk(spec),p=tplGp(k),H=TPLG_H[k];
  if(f[1]<H)return 0;
  return Math.floor(f[0]/p);   // one machine row; multi-row (trunks) not built, see report
}
function tplBuild(spec){
  const f=TPLG_FLOOR[spec.block],k=tplGk(spec);
  if(!f)return{ok:false,why:'unknown block '+spec.block};
  if(![2,3,4].includes(k))return{ok:false,why:'inputs k='+k+' (2,3,4 only)'};
  if(spec.cls&&spec.cls!=='DAT_GrowthChamber')return{ok:false,why:'class '+spec.cls};
  const nMax=tplMax(spec),n=spec.n|0;
  if(n<1)return{ok:false,why:'n<1',nMax};
  if(n>nMax&&!spec._force)return{ok:false,why:'n='+n+' > nMax='+nMax+' for '+spec.block+' k='+k,nMax};
  const mk=spec.mk|0,spMk=spec.spMk==null?1:spec.spMk|0,bc=PLC_BELT[mk],ug=PLC_UG[mk],sc=PLC_SPL[spMk],cls='DAT_GrowthChamber',p=tplGp(k),Fw=f[0],yo=0;
  const items=[],it=(c,x,y,rot,extra)=>{const o={cls:c,x,y,rot,h:0,pid:0};if(extra)Object.assign(o,extra);items.push(o);return o};
  const B=(x,y,rot)=>it(bc,x,y,rot),U=(x,y,rot)=>it(ug,x,y,rot),S=(x,y,keep)=>it(sc,x,y,0,{off:pfSplOff(sc,0,keep)});
  const XS=i=>p*i;   // machine x
  // machine off lists (rot 0 keys N0 N1 E2 E3 S4 S5 W6 W7)
  const used={2:['N0','N1','S4'],3:['N0','N1','S4','S5'],4:['N0','N1','S4','S5','E2']}[k];
  const off=['N0','N1','E2','E3','S4','S5','W6','W7'].filter(q=>!used.includes(q));
  for(let i=0;i<n;i++)it(cls,XS(i),yo+2,0,{off,rec:spec.rec});
  const last=n-1;
  // N side: A far (row yo, splitters at X+4), B near (row yo+1, splitters at X+2, UG hop over A feeders of machines 0..n-2)
  for(let x=0;x<=XS(last)+4;x++){const i=(x-4)/p;if(Number.isInteger(i)&&i>=0&&i<n)S(x,yo,['E','S']);else B(x,yo,0)}
  for(let i=0;i<n;i++)B(XS(i)+4,yo+1,1);
  for(let x=0;x<=XS(last)+2;x++){
    const i=(x-2)/p;
    if(Number.isInteger(i)&&i>=0&&i<n){S(x,yo+1,['E','S']);continue}
    const j=(x-4)/p;   // A feeder column of machine j < last
    if(Number.isInteger(j)&&j>=0&&j<last)continue;
    if(Number.isInteger((x-3)/p)&&(x-3)/p>=0&&(x-3)/p<last||Number.isInteger((x-5)/p)&&(x-5)/p>=0&&(x-5)/p<last){U(x,yo+1,0);continue}
    B(x,yo+1,0);
  }
  const lr=tplLaneRows(k,yo);
  if(k===2){
    // collector row yo+7 from the first output port x=2 to the east edge
    for(let x=2;x<Fw;x++)B(x,yo+7,0);
  }else if(k===3){
    // C far lane row yo+8 (splitter X+2, feeder up), collector yo+7 from X0+4, UG over the later C feeders
    for(let x=0;x<=XS(last)+2;x++){const i=(x-2)/p;if(Number.isInteger(i)&&i>=0&&i<n)S(x,yo+8,['E','N']);else B(x,yo+8,0)}
    for(let i=0;i<n;i++)B(XS(i)+2,yo+7,3);
    for(let x=4;x<Fw;x++){
      const fe=(x-2)/p;   // C feeder column of machine j (j>=1): skip; UG ent at x-1, ext at x+1
      if(Number.isInteger(fe)&&fe>=1&&fe<n)continue;
      if(Number.isInteger((x-1)/p)&&(x-1)/p>=1&&(x-1)/p<n||Number.isInteger((x-3)/p)&&(x-3)/p>=1&&(x-3)/p<n){U(x,yo+7,0);continue}
      B(x,yo+7,0);
    }
  }else{
    // C near lane row yo+7 (splitter X+2, UG over D feeder of machines 0..n-2), D far lane row yo+8 (splitter X+4, feeder up at (X+4,yo+7))
    for(let x=0;x<=XS(last)+2;x++){
      const i=(x-2)/p;
      if(Number.isInteger(i)&&i>=0&&i<n){S(x,yo+7,['E','N']);continue}
      const j=(x-4)/p;
      if(Number.isInteger(j)&&j>=0&&j<last)continue;
      if(Number.isInteger((x-3)/p)&&(x-3)/p>=0&&(x-3)/p<last||Number.isInteger((x-5)/p)&&(x-5)/p>=0&&(x-5)/p<last){U(x,yo+7,0);continue}
      B(x,yo+7,0);
    }
    for(let x=0;x<=XS(last)+4;x++){const i=(x-4)/p;if(Number.isInteger(i)&&i>=0&&i<n)S(x,yo+8,['E','N']);else B(x,yo+8,0)}
    for(let i=0;i<n;i++)B(XS(i)+4,yo+7,3);
    // output: gap column X+5, port cell row yo+4, UG hop yo+6 -> yo+9, collector yo+10
    for(let i=0;i<n;i++){const x=XS(i)+5;B(x,yo+4,1);B(x,yo+5,1);U(x,yo+6,1);U(x,yo+9,1)}
    for(let x=5;x<Fw;x++)B(x,yo+10,0);
  }
  // rates (optional recObj {o:[item,q],i:[[item,q],..],t})
  let rates=null;
  if(spec.recObj){const r=spec.recObj,cap=TPLG_CAP[mk],der=typeof BL!=='undefined'?BL.DERATE:0.5;
    const inr=r.i.map(([,q])=>q*1800/r.t),out=r.o[1]*1800/r.t,g=Math.max(1,Math.floor(der*cap/Math.max(...inr)));
    rates={cap,in:inr,out,g,nUse:Math.min(nMax,g,Math.max(1,Math.floor(cap/out))),load:inr.map(x=>x*n),outLoad:out*n,derateOk:n<=g,capOk:inr.every(x=>x*n<=cap)&&out*n<=cap};
  }
  if(rates&&!spec._force&&!(rates.in.every(x=>x<=rates.cap)&&rates.out<=rates.cap))return{ok:false,why:'one machine alone exceeds the belt Mk'+(mk+1)+' ('+rates.cap+'/min): in '+rates.in.join('/')+' out '+rates.out+', use a higher Mk',nMax};
  const cnt={belts:0,ug:0,spl:0,machines:0};
  items.forEach(b=>{if(b.cls===cls)cnt.machines++;else if(PLC_BELT.includes(b.cls))cnt.belts++;else if(PLC_UG.includes(b.cls))cnt.ug++;else if(PLC_SPL.includes(b.cls))cnt.spl++});
  return{ok:true,why:'',items,w:Fw,h:f[1],used:{w:p*n>Fw?Fw:Math.max(...items.map(b=>b.x+dim(b).w)),h:Math.max(...items.map(b=>b.y+dim(b).h))},
    ports:{in:lr.in.map((y,i)=>({y,item:i,dir:'E'})),out:[{y:lr.out,dir:'E'}]},nMax,rates,stats:cnt,pitch:p,rowsH:TPLG_H[k]};
}
