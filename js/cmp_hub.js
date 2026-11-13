// CMP C2 hub blocks (composer): cmpPool (SRC / POOL / OZ) and cmpFeed (FEED). Local block coordinates, W x H = block floor. Spec: vault main-sequence/tasks/2026-11-13-composer-spec.md section 3.
// Reuses blHA (bl_geom.js) and the blHIZ/blHFB/blHIN loops with W/H/rows as parameters. Needs page globals: blHA, PLC_BELT. Lane rows at x=0 / x=W-1 are plain rot-0 belts (the assembler turns wall crossings into UG pairs).
const cmpBt=(bc,x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});
const cmpNo=why=>({ok:false,why,items:[]});
// largest group of rows that share a flow direction (= columns blHA needs)
const cmpNg=A=>Math.max(0,...[-1,1].map(d=>A.dir.filter(v=>v===d).length));
// cmpPool(S): S={W,H,mk,bx,item,raw,inRows,outRows,ind?,ca?,pyOut?,pyIn?,dock?,dkx?}. dock (cmp_dock.js cmpDockHub): ca = container rows (one per dock cell), SRC container flush x=0, OZ container flush east, dk tags. Container(s) 4x4 at (cx,ya+4j); west ports x=cx-1, east ports x=cx+4. raw=true: infinite source container(s).
function cmpPool(S){
  const {W,H,mk,bx,item,raw,inRows,outRows}=S,bc=PLC_BELT[mk],Ri=inRows.length,Ro=outRows.length,bt=(x,y,rot)=>cmpBt(bc,x,y,rot);
  if(Ri&&Ro&&(Ri>4||Ro>4))return cmpNo('pool needs <=4 lanes per face (in '+Ri+', out '+Ro+')');
  const c=S.ca?S.ca.length:Math.ceil(Math.max(Ri,Ro,1)/4),all=[...inRows,...outRows],mid=all.length?(Math.min(...all)+Math.max(...all))/2:(H-1)/2;
  const ya=Math.min(Math.max(Math.floor(mid-2*c),1),H-1-4*c);
  if(!S.ca&&H-1-4*c<1)return cmpNo('pool block too short (rows)');
  const AW=Ri?blHA(inRows,c,ya,'out',0,S.pyIn):null,ngW=AW?cmpNg(AW):0;
  let cx=S.dock&&!Ro?W-5:(Ri?ngW+2:S.dock?0:1);   // OZ dock: container flush with the east edge (q.x+4===W-1)
  if(Ro>Ri&&!S.dock&&!S.ind){const m=W-6-cmpNg(blHA(outRows,c,ya,'in',cx+4,S.pyOut));if(m>cx&&m<=W-5)cx=m}   // F2: more lanes leave than arrive: container east, the long lane run shrinks
  if((Ri&&cx-1-ngW<1)||cx>W-5)return cmpNo('pool block too narrow (rows)');
  const AE=Ro?blHA(outRows,c,ya,'in',cx+4,S.pyOut):null,ngE=AE?cmpNg(AE):0;
  if(Ro&&cx+4+ngE+1>W-1)return cmpNo('pool block too narrow (rows)');
  const items=[];
  for(let j=0;j<(S.ind?0:c);j++)items.push({cls:bx,x:cx,y:S.ca?S.ca[j]:ya+4*j,rot:0,h:0,pid:0,ct:raw?[{item,n:0,inf:true}]:[],...(S.dock?(raw?{dk:'in',dkx:S.dkx}:!Ro?{dk:'out',dkx:S.dkx}:{}):{})});
  if(Ri){   // blHFB 'out' loop: belts to the jog column, vertical, corner at the port row, belts to the container W face (industrial OZ, S.ind: to x=W-1, last belt tagged 'oe')
    const A=blHA(inRows,c,ya,'out',cx-1,S.pyIn),xe=S.ind&&!Ro?W-1:cx-1,tl=(b,x)=>{if(S.ind&&!Ro&&x===xe){b.dk='oe';b.dx=S.dkx}return b};
    for(let j=0;j<Ri;j++){
      const y=inRows[j],py=A.py[j],d=A.dir[j];
      if(!d){for(let x=0;x<=xe;x++)items.push(tl(bt(x,y,0),x));continue}
      const xc=A.col[j];
      for(let x=0;x<xc;x++)items.push(bt(x,y,0));
      items.push(bt(xc,y,d<0?3:1));
      for(let yy=y+d;yy!==py;yy+=d)items.push(bt(xc,yy,d<0?3:1));
      items.push(bt(xc,py,0));
      for(let x=xc+1;x<=xe;x++)items.push(tl(bt(x,py,0),x));
    }
  }
  if(Ro){   // blHIN loop: from the container E face (or x=0 for industrial input) to x=W-1
    const A=AE,xp=cx+4,x0=S.ind?0:xp,tag=(b,f)=>{if(f&&S.ind){b.dk='ie';b.di=item;b.yb=0;b.dx=S.dkx}return b};
    for(let j=0;j<Ro;j++){
      const yI=outRows[j],py=A.py[j],d=A.dir[j];
      if(!d){for(let x=x0;x<=W-1;x++)items.push(tag(bt(x,yI,0),x===x0));continue}
      const xc=A.col[j];
      for(let x=x0;x<xc;x++)items.push(tag(bt(x,py,0),x===x0));
      items.push(bt(xc,py,d<0?3:1));
      for(let yy=py+d;yy!==yI;yy+=d)items.push(bt(xc,yy,d<0?3:1));
      items.push(bt(xc,yI,0));
      for(let x=xc+1;x<=W-1;x++)items.push(bt(x,yI,0));
    }
  }
  return{ok:true,why:'',items,cx,ya,c};
}
// cmpFeed(S): S={W,H,mk,bx,sets:[{o,hs,t?}] (t = target row per slot when the template has side-native lane rows, e.g. growth k=3 o+8),M,k,main,pass:[rows],rawItems:[item per raw container],allRaw,seed?}. seed = item whose container is finite (primed by the user). Per set: the chain lane (M rows) passes straight; raw container r at (2, o+passM+4r) feeds slot r+1 (r if allRaw) through a jog column xj=7+M*r+c.
function cmpFeed(S){
  const {W,H,mk,bx,sets,M,pass=[],rawItems}=S,allRaw=!!S.allRaw,bc=PLC_BELT[mk],bt=(x,y,rot)=>cmpBt(bc,x,y,rot),nR=rawItems.length,passM=allRaw?0:M,sh=Math.max(0,W-3-(6+M*nR)),cx=2+sh,items=[];   // F2: raw containers as far east as the jog columns allow (sh), lane runs shrink
  if(M<1||M>4)return cmpNo('feed block needs 1..4 copies per slot (M '+M+')');
  if(nR&&7+M*nR-1>W-3)return cmpNo('feed block too narrow');
  for(const s of sets)if(passM+4*nR>s.hs)return cmpNo('feed block too short ('+(passM+4*nR)+' rows needed, set has '+s.hs+')');
  if(!allRaw)for(const y of pass)for(let x=0;x<=W-1;x++)items.push(bt(x,y,0));
  for(const s of sets)for(let r=0;r<nR;r++){
    const y=s.o+passM+4*r,slot=allRaw?r:(r<(S.main||0)?r:r+1);
    items.push({cls:bx,x:cx,y,rot:0,h:0,pid:0,ct:[{item:rawItems[r],n:0,inf:!(S.seed!=null&&rawItems[r]===S.seed)}]});
    for(let c=0;c<M;c++){
      const pr=y+c,t=s.t?s.t[slot]+c:s.o+slot*M+c,xj=7+sh+M*r+c;
      if(pr===t){for(let x=cx+4;x<=W-1;x++)items.push(bt(x,pr,0));continue}
      for(let x=cx+4;x<xj;x++)items.push(bt(x,pr,0));
      items.push(bt(xj,pr,3));
      for(let yy=pr-1;yy>t;yy--)items.push(bt(xj,yy,3));
      items.push(bt(xj,t,0));
      for(let x=xj+1;x<=W-1;x++)items.push(bt(x,t,0));
    }
  }
  return{ok:true,why:'',items};
}
