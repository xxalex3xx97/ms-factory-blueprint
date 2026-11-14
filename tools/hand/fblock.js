// FBLOCK: one FULL factory block per machine class (HAND toolkit), designed from the machine's real ports. fbBuild({mk:1}) -> HAND.result() + {info}.
// Rule: take the recipe of the class with the most inputs; inputs go on the N face first (far lane -> rightmost used port, drops cross nearer lanes by an underground hop),
// the rest on the S face (near lane -> leftmost port); the output goes on the last free S port, or on an E side port when the S face is full of inputs (growth chamber, 4 inputs:
// the user's own design: machines 1 cell apart, output drops through the gap under the lanes, two rows with their collectors facing each other).
// Machines in a row touch otherwise (east/west ports blocked); collector belt runs to the east edge. Splitter per machine on every lane, priority to the machine.
window.fbBuild=function(opts){
  opts=opts||{};const MK=opts.mk!=null?opts.mk:1;HAND.reset({mk:MK});
  const BELT=PLC_BELT[MK],UGC=PLC_UG[MK],SPL=PLC_SPL[MK],TW=HAND.TW;
  const PLANS=[['Refinery','DAT_Refinery','CRAFT_Refinery',6],['Assembler','DAT_Assembler','CRAFT_Assembler'],['GrowthChamber','DAT_GrowthChamber','CRAFT_GrowthChamber'],['Supercomputer','DAT_Supercomputer','CRAFT_Supercomputer'],['AdvancedAssembler','DAT_AdvancedAssembler','CRAFT_AdvancedAssembler'],['Enrichment','DAT_EnrichmentChamber','CRAFT_Enrichment']];
  const hopSpan=(ax,a,b)=>{const l=HAND.S.span.get(ax)||[];l.push([a,b]);HAND.S.span.set(ax,l)};   // tell check() the pair is intended
  const info=[],put1=(x,y,rot,cls,extra)=>{if(!HAND.piece({cls,x,y,rot,...extra}))throw new Error('cell taken '+x+','+y)};
  const spl=(x,y,keep)=>put1(x,y,0,SPL,{off:pfSplOff(SPL,0,keep),pr:[0,-1]});
  // horizontal lane on row y: splitters at spx (keep per x), UG hops hop(x)->exit, belts elsewhere, from x=0 to the last splitter
  const hlane=(ox,y,spx,keepFn,hop)=>{const xEnd=Math.max(...spx);let x=0;
    while(x<=xEnd){if(spx.includes(x)){spl(ox+x,y,keepFn(x===xEnd));x++;continue}
      if(hop.has(x)){put1(ox+x,y,0,UGC);put1(ox+hop.get(x),y,0,UGC);hopSpan('h'+y,ox+x,ox+hop.get(x));x=hop.get(x)+1;continue}
      put1(ox+x,y,0,BELT);x++}};
  PLANS.forEach(([name,cls,crafter,perOv],bi)=>{
    let rc=null;for(const x of RECS[crafter])if(!rc||x.i.length>rc.i.length)rc=x;
    const s=dim({cls,rot:0}).w,P0=portsOf({cls,x:0,y:0,rot:0,h:0}),cN=P0.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b),cE=P0.filter(p=>p.f==='E').map(p=>p.y).sort((a,b)=>a-b),pf=cN.length,k=rc.i.length;
    const nN=Math.min(k,pf);let nS=k-nN;const side=nS>=pf;   // S face full of inputs: the output goes on an E side port
    if(!side)nS=Math.min(nS,pf-1);
    const pitch=side?s+1:s,ox=bi*TW,per=perOv||Math.floor((27+(side?1:0))/pitch),iO=nS&&!side?pf-1:0;HAND.block(bi,0);
    // row bands: normal row = N lanes, machine, S lanes, [exit row], collector; with side output the two rows face each other (collector on top for row 2)
    const band=side?nN+s+nS+2:nN+s+(nS?1:0)+1,rowsN=side?2:Math.floor(30/(nN+s+(nS?1:0)+1)),cap=side?2*per:rowsN*per;
    const yStart=r=>side?(r===0?0:30-band):r*band;
    for(let r=0;r<(side?2:rowsN);r++){
      const y0=yStart(r),up=side&&r===1,m=Math.min(per,cap-r*per),X=q=>1+q*pitch;
      const top=y0+(up?2:0),my=top+nN,rS=my+s;   // top = first N lane row; up row has collector+exit rows above
      const rC=side?(up?y0:y0+band-1):(nS?rS+1:rS),rExit=side?(up?y0+1:y0+band-2):-1;
      const mach=[];
      for(let q=0;q<m;q++){const mm=HAND.put({cls,gx:bi,gy:0,lx:X(q),ly:my,rec:rk(rc),name:name+'#'+(r*per+q)});if(!mm)throw new Error(name+' machine does not fit');
        const nP=mm.ports.filter(p=>p.f==='N').sort((a,b)=>a.x-b.x),sP=mm.ports.filter(p=>p.f==='S').sort((a,b)=>a.x-b.x),eP=mm.ports.filter(p=>p.f==='E').sort((a,b)=>a.y-b.y);
        for(let i=0;i<nN;i++)mm.used.add(nP[i].key);for(let i=0;i<nS;i++)mm.used.add(sP[i].key);
        mm.used.add(side?eP[up?0:eP.length-1].key:sP[iO].key);mach.push(mm)}
      // N lanes: lane j (0 = farthest row) feeds N port nN-1-j
      for(let j=0;j<nN;j++){const yl=top+j,hop=new Map(),spx=[];
        for(let q=0;q<m;q++){const px=X(q)+cN[nN-1-j];spx.push(px);let far=-1;for(let jj=0;jj<j;jj++)far=Math.max(far,X(q)+cN[nN-1-jj]);
          if(q<m-1&&far>=0)hop.set(px+1,far+1);
          if(j<nN-1)for(let yy=yl+1;yy<=my-1;yy++)put1(ox+px,yy,1,BELT)}
        hlane(ox,yl,spx,last=>last?['S']:['E','S'],hop)}
      // S lanes: lane j (0 = nearest row) feeds S port j; far lanes feed up through a drop; the output drop (non-side) is crossed by lane 0
      for(let j=0;j<nS;j++){const yl=rS+j,hop=new Map(),spx=[];
        for(let q=0;q<m;q++){const px=X(q)+cN[j];spx.push(px);let far=px;for(let jj=j+1;jj<nS;jj++)far=Math.max(far,X(q)+cN[jj]);
          if(!side&&j===0)far=Math.max(far,X(q)+cN[iO]);
          if(q<m-1&&far>px)hop.set(px+1,far+1);
          if(j>0)for(let yy=yl-1;yy>=rS;yy--)put1(ox+px,yy,3,BELT);
          if(!side&&j===0)put1(ox+X(q)+cN[iO],rS,1,BELT)}
        hlane(ox,yl,spx,last=>last?['N']:['E','N'],hop)}
      if(side){   // output drop through the gap beside each machine, under the lanes, into this row's collector
        const col=q=>X(q)+s,drow=up?my+cE[0]:my+cE[cE.length-1];
        for(let q=0;q<m;q++){const x=ox+col(q);
          if(!up){put1(x,drow,1,BELT);for(let y=drow+1;y<rExit-3;y++)put1(x,y,1,BELT);put1(x,rExit-3,1,UGC);put1(x,rExit,1,UGC);hopSpan('v'+x,rExit-3,rExit)}
          else{put1(x,drow,3,BELT);let y=drow-1;for(;y>rExit+3;y--)put1(x,y,3,BELT);put1(x,y,3,UGC);put1(x,rExit,3,UGC);hopSpan('v'+x,rExit,y)}}}
      // collector, east to the block edge
      const c0=side?X(0)+s:X(0)+cN[iO];
      for(let x=c0;x<=29;x++)put1(ox+x,rC,0,BELT)}
    info.push({name,cls,recipe:rk(rc),k,pf,nN,nS,side,band,rows:side?2:rowsN,per,cap,machines:cap})});
  const R=HAND.result();R.info=info;return R;
};
