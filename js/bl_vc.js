// VC2: column generator, FULL template n=5 (both halves + collector, bottom run, feed zone, mid/out). Spec: vault main-sequence/tasks/2026-11-13-vcol-template.md "VC GENERATOR SPEC" (A).
// Pure geometry; needs PLC_BELT/PLC_UG/PLC_SPL class arrays (placer.js globals). Gate: tests/bl_vc.mjs vs tests/fixtures/vc_golden.json (288 items).
// Right half built in right-frame coords; left half = same generator with side 'L' (x'=XC-x-(wobj-1), rot 0<->2, offs from VC_OFF.L).
// ponytail: n=5 golden only; container classes and feed ct literal (VC3 parametrises). Mid/out centre items emitted once (symmetric).
const VC_OFF={R:{AMID:['S2'],AEND:['S2','E1'],BMID:['S2'],BEND:['S2','E1'],MF:['E2','E3'],ML:['W6','W7']},L:{AMID:['N0'],AEND:['N0','E1'],BMID:['N0'],BEND:['N0','E1'],MF:['E3','E2'],ML:['W7','W6']}};
const VC_C2='DAT_Container_2',VC_C1='DAT_Container';
const VC_ROT={0:2,2:0,1:1,3:3};
function blVC(S){
  const {mk,cls,rec,X,Y,T,n,w}=S,bc=PLC_BELT[mk],ug=PLC_UG[mk],sp=PLC_SPL[mk],XC=X+w,r=i=>Y+5*i,s1=Math.ceil(n/2);
  const XA1=X-1,XA2=X-2,XB1=X-3,XB2=X-4;
  const half=side=>{
    const M=side==='L',O=VC_OFF[side],items=[];
    const put=(c,x,y,rot,wo,opt={})=>{const o={cls:c,x:M?XC-x-(wo-1):x,y,rot:M&&c!==VC_C2&&c!==VC_C1?VC_ROT[rot]:rot};if(opt.off&&opt.off.length)o.off=opt.off;if(opt.rec)o.rec=opt.rec;if(opt.ct)o.ct=opt.ct;items.push(o)};
    const B=(x,y,rot)=>put(bc,x,y,rot,1),U=(x,y)=>put(ug,x,y,1,1),P=(x,y,t)=>put(sp,x,y,1,1,{off:O[t]});
    for(let i=0;i<n;i++)put(cls,X,r(i),3,5,{rec,off:[...(i===0?O.MF:[]),...(i===n-1?O.ML:[])]});
    // lane A1 (x=X-1)
    B(XA1,Y,1);B(XA1,r(s1),1);
    for(let i=0;i<n;i++){
      const fin=i===n-1;
      if(i===s1-1)B(XA1,r(i)+1,0);
      else if(fin)P(XA1,r(i)+1,'AEND');
      else{P(XA1,r(i)+1,'AMID');U(XA1,r(i)+2);U(XA1,r(i)+4);B(XA1,r(i)+5,1)}
    }
    // lane B1 (x=X-3)
    for(let y=Y;y<=Y+2;y++)B(XB1,y,1);B(XB1,Y+5*s1+2,1);
    for(let i=0;i<n;i++){
      const fin=i===n-1;
      if(i===s1-1)B(XB1,r(i)+3,0);
      else if(fin)P(XB1,r(i)+3,'BEND');
      else{P(XB1,r(i)+3,'BMID');U(XB1,r(i)+4);U(XB1,r(i)+6);B(XB1,r(i)+7,1)}
    }
    // crossovers (X-2, X-1) at every machine
    for(let i=0;i<n;i++){B(XA2,r(i)+3,0);B(XA1,r(i)+3,0)}
    // lane A2 (x=X-2), group 0 only
    B(XA2,Y,1);B(XA2,Y+1,1);
    for(let i=0;i<s1;i++){
      U(XA2,r(i)+2);U(XA2,r(i)+4);
      if(i<s1-1){B(XA2,r(i)+5,1);B(XA2,r(i)+6,1)}
    }
    B(XA2,r(s1),0);
    // lane B2 (x=X-4), group 0 only
    for(let y=Y;y<=Y+3;y++)B(XB2,y,1);
    for(let i=0;i<s1;i++){
      U(XB2,r(i)+4);U(XB2,r(i)+6);
      if(i<s1-1){B(XB2,r(i)+7,1);B(XB2,r(i)+8,1)}
    }
    B(XB2,r(s1)+2,0);
    // collector column + bottom run + row above it
    for(let y=Y+1;y<=Y+5*n-1;y++)B(XC,y,1);
    put(bc,XC,Y+5*n,2,1);
    for(let x=21;x<=28;x++)B(x,Y+5*n,2);
    B(20,Y+5*n,3);
    for(let x=17;x<=20;x++)B(x,Y+5*n-1,2);
    // feed zone: A = Magnetic Coils (x 22), B = Silicon Wafers (x 18), per golden
    put(VC_C2,22,T,0,4,{ct:[{item:'ITEM_MagneticCoils',n:0,inf:true}]});
    put(VC_C2,18,T,0,4,{ct:[{item:'ITEM_SiliconWafers',n:0,inf:true}]});
    put(VC_C1,22,T+9,0,2,{ct:[]});put(VC_C1,20,T+9,0,2,{ct:[]});
    for(let y=T+4;y<=T+8;y++)for(let x=20;x<=23;x++)B(x,y,1);
    return items;
  };
  const out=[...half('R'),...half('L')];
  // centre: mid buffer, UG pairs, out buffer (symmetric, not mirrored)
  out.push({cls:VC_C2,x:13,y:Y+5*n-4,rot:0});
  for(let x=13;x<=16;x++){out.push({cls:ug,x,y:Y+5*n,rot:1});out.push({cls:ug,x,y:Y+5*n+3,rot:1})}
  out.push({cls:VC_C2,x:13,y:Y+5*n+4,rot:0});
  return out;
}
