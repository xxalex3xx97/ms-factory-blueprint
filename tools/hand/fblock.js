// FBLOCK: one FULL factory block per machine class (HAND toolkit), designed from the machine's real ports. fbBuild({mk:1}) -> HAND.result() + {info}.
// Rule: take the recipe of the class with the most inputs; inputs go on the N face first (far lane -> rightmost used port, drops cross nearer lanes by an underground hop),
// the rest on the S face (input leftmost, output rightmost); machines in a row touch (east/west ports blocked); collector belt under each row runs to the east edge.
// Per row: k lane rows (splitter per machine, priority to the machine), machine row, [S lane row], collector row. Rows per block = 30 / band. Machines fill row by row.
window.fbBuild=function(opts){
  opts=opts||{};const MK=opts.mk!=null?opts.mk:1;HAND.reset({mk:MK});
  const BELT=PLC_BELT[MK],UGC=PLC_UG[MK],SPL=PLC_SPL[MK],TW=HAND.TW;
  const PLANS=[['Refinery','DAT_Refinery','CRAFT_Refinery',6],['Assembler','DAT_Assembler','CRAFT_Assembler'],['GrowthChamber','DAT_GrowthChamber','CRAFT_GrowthChamber'],['Supercomputer','DAT_Supercomputer','CRAFT_Supercomputer'],['AdvancedAssembler','DAT_AdvancedAssembler','CRAFT_AdvancedAssembler'],['Enrichment','DAT_EnrichmentChamber','CRAFT_Enrichment']];
  const hopSpan=(y,a,b)=>{const ax='h'+y,l=HAND.S.span.get(ax)||[];l.push([a,b]);HAND.S.span.set(ax,l)};   // tell check() the pair is intended
  const info=[],put1=(x,y,rot,cls,extra)=>{if(!HAND.piece({cls,x,y,rot,...extra}))throw new Error('cell taken '+x+','+y)};
  PLANS.forEach(([name,cls,crafter,perOv],bi)=>{
    let rc=null;for(const x of RECS[crafter])if(!rc||x.i.length>rc.i.length)rc=x;
    const s=dim({cls,rot:0}).w,P0=portsOf({cls,x:0,y:0,rot:0,h:0}),cN=P0.filter(p=>p.f==='N').map(p=>p.x).sort((a,b)=>a-b),pf=cN.length,k=rc.i.length;
    const nN=Math.min(k,pf);let nS=k-nN;const missing=Math.max(0,nS-(pf-1));nS=Math.min(nS,pf-1);const band=nN+s+(nS?1:0)+1,rows=Math.floor(30/band),per=perOv||Math.floor(27/s),cap=rows*per;
    const ox=bi*TW,iS=0,iO=nS?pf-1:0;HAND.block(bi,0);
    for(let r=0;r<rows;r++){const y0=r*band,my=y0+nN,rS=my+s,rC=nS?rS+1:rS,m=Math.min(per,cap-r*per),X=q=>1+q*s;
      const mach=[];
      for(let q=0;q<m;q++){const mm=HAND.put({cls,gx:bi,gy:0,lx:X(q),ly:my,rec:rk(rc),name:name+'#'+(r*per+q)});if(!mm)throw new Error(name+' machine does not fit');
        const nP=mm.ports.filter(p=>p.f==='N').sort((a,b)=>a.x-b.x),sP=mm.ports.filter(p=>p.f==='S').sort((a,b)=>a.x-b.x);
        for(let i=0;i<nN;i++)mm.used.add(nP[i].key);if(nS)mm.used.add(sP[iS].key);mm.used.add(sP[iO].key);mach.push(mm)}
      // N lanes: lane j (0 = farthest row) feeds N port nN-1-j
      for(let j=0;j<nN;j++){const yl=y0+j,hop=new Map(),spl=new Set();
        for(let q=0;q<m;q++){const px=X(q)+cN[nN-1-j];spl.add(px);let far=-1;for(let jj=0;jj<j;jj++)far=Math.max(far,X(q)+cN[nN-1-jj]);
          if(q<m-1&&far>=0)hop.set(px+1,far+1);
          if(j<nN-1)for(let yy=yl+1;yy<=my-1;yy++)put1(ox+px,yy,1,BELT)}   // feeder drop down to the port
        const xEnd=X(m-1)+cN[nN-1-j];let x=0;
        while(x<=xEnd){if(spl.has(x)){const last=x===xEnd;put1(ox+x,yl,0,SPL,{off:pfSplOff(SPL,0,last?['S']:['E','S']),pr:[0,-1]});x++;continue}
          if(hop.has(x)){put1(ox+x,yl,0,UGC);put1(ox+hop.get(x),yl,0,UGC);hopSpan(yl,ox+x,ox+hop.get(x));x=hop.get(x)+1;continue}
          put1(ox+x,yl,0,BELT);x++}}
      // S input lane + output drops
      if(nS){const hop=new Map(),spl=new Set();
        for(let q=0;q<m;q++){const px=X(q)+cN[iS],po=X(q)+cN[iO];spl.add(px);if(q<m-1)hop.set(px+1,po+1);put1(ox+po,rS,1,BELT)}
        const xEnd=X(m-1)+cN[iS];let x=0;
        while(x<=xEnd){if(spl.has(x)){const last=x===xEnd;put1(ox+x,rS,0,SPL,{off:pfSplOff(SPL,0,last?['N']:['E','N']),pr:[0,-1]});x++;continue}
          if(hop.has(x)){put1(ox+x,rS,0,UGC);put1(ox+hop.get(x),rS,0,UGC);hopSpan(rS,ox+x,ox+hop.get(x));x=hop.get(x)+1;continue}
          put1(ox+x,rS,0,BELT);x++}}
      // collector under the row, east to the block edge
      for(let x=X(0)+cN[iO];x<=29;x++)put1(ox+x,rC,0,BELT)}
    info.push({name,cls,recipe:rk(rc),k,pf,nN,nS,missing,band,rows,per,cap,machines:cap})});
  const R=HAND.result();R.info=info;return R;
};
