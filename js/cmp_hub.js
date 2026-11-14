// BL H1 horizontal zones: IZ (containers + input paths) west of the wall x=30, FB (machine rows) east, sink containers at x=55. One 30x30 block; rows packed at pitch P.
// blHA(yRow,c,ya,side,xp,pyIn): optional pyIn = explicit port row per row (H6a, non-adjacent containers); default = contiguous port block. Port per row (s=floor((4c-R)/2), row i -> port ya+s+i). Flow dir: in = sign(yRow-py) (north -1 rot 3, south +1 rot 1); out = sign(py-yRow).
// Column: in: x=xp+1+k (north group k from top, south group k from bottom); out: x=xp-1-k (down group k from top, up group k from bottom). Straight rows: col null.
function blHA(yRow,c,ya,side,xp,pyIn){
  const R=yRow.length,s=Math.floor((4*c-R)/2),py=pyIn||yRow.map((_,i)=>ya+s+i),dir=yRow.map((y,i)=>Math.sign(side==='in'?y-py[i]:py[i]-y)),col=new Array(R).fill(null);
  const top=side==='in'?-1:1;   // group counted from the top row (in: north, out: down); the other group from the bottom
  for(const d of [-1,1]){
    const idx=[...Array(R).keys()].filter(i=>dir[i]===d);
    if(d!==top)idx.reverse();
    idx.forEach((i,k)=>col[i]=side==='in'?xp+1+k:xp-1-k);
  }
  return{py,col,dir};
}
// CMP C2 hub blocks (composer): cmpPool (SRC / POOL / OZ) and cmpFeed (FEED). Local block coordinates, W x H = block floor. Spec: vault main-sequence/tasks/2026-11-13-composer-spec.md section 3.
// Reuses blHA (top of this file) and the blHIZ/blHFB/blHIN loops with W/H/rows as parameters. Needs page globals: blHA, PLC_BELT. Lane rows at x=0 / x=W-1 are plain rot-0 belts (the assembler turns wall crossings into UG pairs).
const cmpBt=(bc,x,y,rot)=>({cls:bc,x,y,rot,h:0,pid:0});
const cmpNo=why=>({ok:false,why,items:[]});
// SHAPE: straight lane run xa..xb on row y, rot 0. Endpoints stay belts (f tags them); the interior is UG hops of up to maxApart-1 cells (the cells between stay free), ~2 items per 10 cells instead of 10.
function cmpRun(items,mk,y,xa,xb,f){
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],D=def(ug).maxApart-1,mkb=(c,x)=>({cls:c,x,y,rot:0,h:0,pid:0}),put=x=>items.push(f?f(mkb(bc,x),x):mkb(bc,x));
  if(xb<xa)return;
  put(xa);if(xb===xa)return;
  let cur=xa+1;
  while(xb-1-cur>=2){const x=Math.min(cur+D,xb-1);items.push(mkb(ug,cur),mkb(ug,x));cur=x+1}
  for(;cur<xb;cur++)items.push(mkb(bc,cur));
  put(xb);
}
// SHAPE2: vertical lane interior between corner rows ya and yb (both exclusive), rot = 1/3; UG hops like cmpRun
function cmpRunV(items,mk,x,ya,yb,rot){
  const bc=PLC_BELT[mk],ug=PLC_UG[mk],D=def(ug).maxApart-1,s=yb>ya?1:-1,mkb=(c,y)=>({cls:c,x,y,rot,h:0,pid:0});
  let cur=ya+s;const rem=()=>(yb-s-cur)*s+1;
  while(rem()>=2){const y=cur+s*Math.min(D,rem()-1);items.push(mkb(ug,cur),mkb(ug,y));cur=y+s}
  for(;rem()>0;cur+=s)items.push(mkb(bc,cur));
}
// SHAPE3: lanes by rate. rows = lane rows ascending, N = machines per lane (null: none), g = machines one belt carries. Adjacent rows whose machines fit one belt merge: the hub side-loads the lower row into the upper (column x=1). -> {rows:kept rows, mg:[{ys,yp}], n}
function cmpMerge(rows,N,g){
  if(!N||!g||globalThis.CMP_NOMERGE)return{rows,mg:[],n:N};
  const kr=[],kn=[],mg=[];
  rows.forEach((y,j)=>{const i=kr.length-1;if(i>=0&&kr[i]===y-1&&!kn[i].m&&kn[i].v+N[j]<=g){kn[i].v+=N[j];kn[i].m=1;mg.push({ys:y,yp:kr[i]})}else{kr.push(y);kn.push({v:N[j],m:0})}});
  return{rows:kr,mg,n:kn.map(q=>q.v)};
}
// largest group of rows that share a flow direction (= columns blHA needs)
const cmpNg=A=>Math.max(0,...[-1,1].map(d=>A.dir.filter(v=>v===d).length));
// cmpPool(S): S={W,H,mk,bx,item,raw,inRows,outRows,ind?,ca?,pyOut?,pyIn?,dock?,dkx?}. dock (cmp_dock.js cmpDockHub): ca = container rows (one per dock cell), SRC container flush x=0, OZ container flush east, dk tags. Container(s) 4x4 at (cx,ya+4j); west ports x=cx-1, east ports x=cx+4. raw=true: infinite source container(s).
function cmpPool(S){
  const {W,H,mk,bx,item,raw,inRows,outRows}=S,bc=PLC_BELT[mk],Ri=inRows.length,Ro=outRows.length,bt=(x,y,rot)=>cmpBt(bc,x,y,rot);
  let c=S.ca?S.ca.length:Math.ceil(Math.max(Ri,Ro,1)/4);
  if(S.bal&&!S.ca&&Ri&&Ro&&c>1){const k=Array.from({length:8-c},(_,i)=>c+i).find(v=>Ri%v===0&&v<=Ri&&v*4>=Ro&&H-1-4*v>=1);if(k)c=k}   // GROUPS: stacked containers are separate pools, whole input lanes carry equal flow: pick the container count that divides the input lanes evenly (else one container gets 2 lanes and piles up)
  const all=[...inRows,...outRows],mid=all.length?(Math.min(...all)+Math.max(...all))/2:(H-1)/2;
  const ya=Math.min(Math.max(Math.floor(mid-2*c),1),H-1-4*c);
  if(!S.ca&&H-1-4*c<1)return cmpNo('pool block too short (rows)');
  if(S.bal&&c>1&&Ri&&Ro&&!S.ca){   // GROUPS: stacked containers are separate pools: every container gets input lanes in proportion to its output lanes (default blHA ports are centred and can leave a container without input)
    if(Ri<c)return cmpNo('pool has fewer input lanes than containers');
    let e=Array.from({length:c},(_,j)=>Math.floor(Ro/c)+(j<Ro%c?1:0));const wt=S.wt&&S.wt.length===Ro?S.wt:null,tw=wt?wt.reduce((x,y)=>x+y,0):0;if(wt){let ce=null,bd=1e9;const rec=(i,j,acc,mx)=>{if(j===c){if(i===Ro&&mx<bd){bd=mx;ce=acc.slice()}return}for(let n=1;n<=4&&i+n<=Ro-(c-1-j);n++){acc.push(n);rec(i+n,j+1,acc,Math.max(mx,Math.abs(wt.slice(i,i+n).reduce((x,y)=>x+y,0)-tw/c)));acc.pop()}};rec(0,0,[],0);if(ce)e=ce}   // out lanes cut by demand weight so every container's outflow equals its (equal) inflow
    let o0=0;   // wt: lane demand weights (ports feed unequal machine counts): a container's input lanes follow the demand of its own output lanes
    const q=e.map(v=>{const f=wt?wt.slice(o0,o0+v).reduce((x,y)=>x+y,0)/tw:v/Ro;o0+=v;return Math.max(1,Math.min(4,f*Ri))}),w=q.map(v=>Math.max(1,Math.floor(v)));
    let rem=Ri-w.reduce((a,b)=>a+b,0);
    while(rem!==0){let k=-1,best=-9;for(let j=0;j<c;j++){const d=rem>0?q[j]-w[j]:w[j]-q[j];if((rem>0?w[j]<4:w[j]>1)&&d>best){best=d;k=j}}if(k<0)break;w[k]+=rem>0?1:-1;rem+=rem>0?-1:1}
    if(wt&&S.wi&&S.wi.length===Ri&&S.wi.every(v=>v>0)){   // input lanes carry unequal machine counts: cut them (row order = container order) so each container's inflow matches the demand of its own output lanes
      const tl=S.wi.reduce((x,y)=>x+y,0);let i=0,cum=0,tc=0,o1=0;const ww=[];
      for(let j=0;j<c;j++){tc+=wt.slice(o1,o1+e[j]).reduce((x,y)=>x+y,0)/tw*tl;o1+=e[j];let n=0;while(i<Ri-(c-1-j)&&(n<1||(cum+S.wi[i]/2<=tc&&n<4))){cum+=S.wi[i];i++;n++}ww.push(n)}
      if(i===Ri&&ww.every(v=>v>=1&&v<=4))w.splice(0,c,...ww)}
    const ports=(n,j)=>Array.from({length:n},(_,i)=>ya+4*j+Math.floor((4-n)/2)+i);
    S={...S,pyIn:w.flatMap((n,j)=>ports(n,j)),pyOut:e.flatMap((n,j)=>ports(n,j))};
  }
  const AW=Ri?blHA(inRows,c,ya,'out',0,S.pyIn):null,ngW=AW?cmpNg(AW):0;
  const MG=S.mgIn&&S.mgIn.length?S.mgIn:[],xm=MG.length?1:0,mgy=new Set(MG.map(q=>q.yp));   // SHAPE3: merge column x=1 reserved
  let cx=S.dock&&!Ro?W-5:(Ri?ngW+2+xm:S.dock?0:1);   // OZ dock: container flush with the east edge (q.x+4===W-1)
  if(Ro>Ri&&!S.dock&&!S.ind){const m=W-6-cmpNg(blHA(outRows,c,ya,'in',cx+4,S.pyOut));if(m>cx&&m<=W-5)cx=m}   // F2: more lanes leave than arrive: container east, the long lane run shrinks
  if((Ri&&cx-1-ngW<1+xm)||cx>W-5)return cmpNo('pool block too narrow (rows)');
  const AE=Ro?blHA(outRows,c,ya,'in',cx+4,S.pyOut):null,ngE=AE?cmpNg(AE):0;
  if(Ro&&cx+4+ngE+1>W-1)return cmpNo('pool block too narrow (rows)');
  const items=[];
  for(let j=0;j<(S.ind?0:c);j++)items.push({cls:bx,x:cx,y:S.ca?S.ca[j]:ya+4*j,rot:0,h:0,pid:0,ct:raw?[{item,n:0,inf:true}]:[],...(S.dock?(raw?{dk:'in',dkx:S.dkx}:!Ro?{dk:'out',dkx:S.dkx}:{}):{})});
  if(Ri){   // blHFB 'out' loop: belts to the jog column, vertical, corner at the port row, belts to the container W face (industrial OZ, S.ind: to x=W-1, last belt tagged 'oe')
    const A=blHA(inRows,c,ya,'out',cx-1,S.pyIn),xe=S.ind&&!Ro?W-1:cx-1,tl=(b,x)=>{if(S.ind&&!Ro&&x===xe){b.dk='oe';b.dx=S.dkx}return b};
    for(let j=0;j<Ri;j++){
      const y=inRows[j],py=A.py[j],d=A.dir[j];
      const pre=mgy.has(y)?2:0;if(pre)items.push(bt(0,y,0),bt(1,y,0));
      if(!d){cmpRun(items,mk,y,pre,xe,tl);continue}
      const xc=A.col[j];
      cmpRun(items,mk,y,pre,xc-1);
      items.push(bt(xc,y,d<0?3:1));
      cmpRunV(items,mk,xc,y,py,d<0?3:1);
      items.push(bt(xc,py,0));
      cmpRun(items,mk,py,xc+1,xe,tl);
    }
  }
  for(const q of MG)items.push(bt(0,q.ys,0),bt(1,q.ys,q.yp<q.ys?3:1));   // merged lane: belt at the port, turn into the primary row (side-load at x=1)
  if(Ro){   // blHIN loop: from the container E face (or x=0 for industrial input) to x=W-1
    const A=AE,xp=cx+4,x0=S.ind?0:xp,tag=(b,f)=>{if(f&&S.ind){b.dk='ie';b.di=item;b.yb=0;b.dx=S.dkx}return b};
    for(let j=0;j<Ro;j++){
      const yI=outRows[j],py=A.py[j],d=A.dir[j];
      if(!d){cmpRun(items,mk,yI,x0,W-1,(b,x)=>tag(b,x===x0));continue}
      const xc=A.col[j];
      cmpRun(items,mk,py,x0,xc-1,(b,x)=>tag(b,x===x0));
      items.push(bt(xc,py,d<0?3:1));
      cmpRunV(items,mk,xc,py,yI,d<0?3:1);
      items.push(bt(xc,yI,0));
      cmpRun(items,mk,yI,xc+1,W-1);
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
      const dn=t>pr;items.push(bt(xj,pr,dn?1:3));
      if(dn)for(let yy=pr+1;yy<t;yy++)items.push(bt(xj,yy,1));else for(let yy=pr-1;yy>t;yy--)items.push(bt(xj,yy,3));
      items.push(bt(xj,t,0));
      for(let x=xj+1;x<=W-1;x++)items.push(bt(x,t,0));
    }
  }
  return{ok:true,why:'',items};
}
