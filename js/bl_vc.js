// VC1: column generator, RIGHT HALF only (machines, lanes A1,B1,A2,B2, crossovers, collector column x=X+w). Spec: vault main-sequence/tasks/2026-11-13-vcol-template.md "VC GENERATOR SPEC" (A).
// Pure geometry; needs PLC_BELT/PLC_UG/PLC_SPL class arrays (placer.js globals). Gate: tests/bl_vc.mjs vs tests/fixtures/vc_golden.json.
// VC0 check: spec right-half rules match golden x20..23 table by hand; no corrections. Splitter offs from golden: right mid S2, end S2+E1; left mid N0, end N0+E1 (left unused in VC1).
// Machine offs from golden: right i=0 E2,E3; i=n-1 W6,W7 (left E3,E2 / W7,W6). n=1 gets both (guess).
// ponytail: left half, bottom run, feed zone, mid/out are VC2+; collector stops at y=Y+5n-1 (corner is VC2).
const VC_OFF={R:{AMID:['S2'],AEND:['S2','E1'],BMID:['S2'],BEND:['S2','E1']},L:{AMID:['N0'],AEND:['N0','E1'],BMID:['N0'],BEND:['N0','E1']}};
function blVC(S){
  const {mk,cls,rec,X,Y,n,w}=S,bc=PLC_BELT[mk],ug=PLC_UG[mk],sp=PLC_SPL[mk],O=VC_OFF.R,out=[];
  const add=(c,x,y,rot,off,rc)=>{const o={cls:c,x,y,rot};if(off&&off.length)o.off=off;if(rc)o.rec=rc;out.push(o)};
  const B=(x,y,rot)=>add(bc,x,y,rot),U=(x,y)=>add(ug,x,y,1),P=(x,y,off)=>add(sp,x,y,1,off);
  const r=i=>Y+5*i,s1=Math.ceil(n/2),XA1=X-1,XA2=X-2,XB1=X-3,XB2=X-4,XC=X+w;
  for(let i=0;i<n;i++)add(cls,X,r(i),3,[...(i===0?['E2','E3']:[]),...(i===n-1?['W6','W7']:[])],rec);
  // lane A1 (x=X-1)
  B(XA1,Y,1);B(XA1,r(s1),1);
  for(let i=0;i<n;i++){
    const fin=i===n-1;
    if(i===s1-1)B(XA1,r(i)+1,0);
    else if(fin)P(XA1,r(i)+1,O.AEND);
    else{P(XA1,r(i)+1,O.AMID);U(XA1,r(i)+2);U(XA1,r(i)+4);B(XA1,r(i)+5,1)}
  }
  // lane B1 (x=X-3)
  for(let y=Y;y<=Y+2;y++)B(XB1,y,1);B(XB1,Y+5*s1+2,1);
  for(let i=0;i<n;i++){
    const fin=i===n-1;
    if(i===s1-1)B(XB1,r(i)+3,0);
    else if(fin)P(XB1,r(i)+3,O.BEND);
    else{P(XB1,r(i)+3,O.BMID);U(XB1,r(i)+4);U(XB1,r(i)+6);B(XB1,r(i)+7,1)}
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
  // collector column
  for(let y=Y+1;y<=Y+5*n-1;y++)B(XC,y,1);
  return out;
}
