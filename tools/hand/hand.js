// HAND: a player-level building toolkit for the factory blueprint page (NOT the auto-builder).
// You place blocks and machines at chosen spots, then connect them with belts one by one; the belt tool routes each connection
// (turns, underground hops over anything and across the 2-cell block walls) around what is already placed.
// Page globals used: plcCls, dim, portsOf, def, PLC_BELT, PLC_UG, FC.   Usage: HAND.reset(); HAND.block(gx,gy); const a=HAND.put({...}); HAND.link(a,b); const T=HAND.result();
window.HAND=(function(){
  let mk=1,BELT,UG,MAXA;function setMk(m){mk=m;BELT=PLC_BELT[m];UG=PLC_UG[m];MAXA=def(UG).maxApart}setMk(1);   // belt tier: Mk1 60/min hop 8, Mk2 120/min hop 10, Mk3 180/min hop 12
  const CLS=plcCls('BPO_Station_03'),D0=dim({cls:CLS,rot:0}),TW=D0.w*FC,FW=30;
  const DX=[1,0,-1,0],DY=[0,1,0,-1];   // rot 0 east, 1 south, 2 west, 3 north
  const S={blocks:new Map(),occ:new Map(),res:new Map(),door:new Map(),M:[],pcs:[],span:new Map(),fails:[]};
  const k=(x,y)=>x+','+y;
  function reset(o){setMk(o&&o.mk!=null?o.mk:1);S.blocks=new Map();S.occ=new Map();S.res=new Map();S.door=new Map();S.M=[];S.pcs=[];S.span=new Map();S.fails=[];S.paths=[]}
  function block(gx,gy){S.blocks.set(k(gx,gy),{gx,gy})}
  function inFloor(x,y){const gx=Math.floor(x/TW),gy=Math.floor(y/TW);if(!S.blocks.has(k(gx,gy)))return false;return x-gx*TW<FW&&y-gy*TW<FW}
  let cur=null;   // owner label of the link being routed: it may use cells reserved for itself
  let only=null;   // optional cell filter of the belt being routed (planned corridors: the belt may only use these cells)
  const free=(x,y)=>{const kk=k(x,y);if(!inFloor(x,y)||S.occ.has(kk))return false;if(only&&!only(x,y))return false;const r=S.res.get(kk);return r===undefined||r===cur};
  function reserve(cells,owner){cells.forEach(([x,y])=>{const kk=k(x,y);if(inFloor(x,y)&&!S.occ.has(kk)&&!S.res.has(kk))S.res.set(kk,owner)})}
  // put({cls,gx,gy,lx,ly,rec,ct,name}) -> machine record, or null when the spot is taken / outside the floor
  function put(o){
    const x=o.gx*TW+o.lx,y=o.gy*TW+o.ly,d=dim({cls:o.cls,rot:0});
    for(let i=0;i<d.w;i++)for(let j=0;j<d.h;j++)if((!o.force&&!inFloor(x+i,y+j))||S.occ.has(k(x+i,y+j)))return null;   // force: cell outside every block floor (dock blocks)
    const m={id:S.M.length,cls:o.cls,x,y,w:d.w,h:d.h,rec:o.rec,ct:o.ct,name:o.name||o.cls,nm:o.nm,ports:portsOf({cls:o.cls,x,y,rot:0,h:0}),used:new Set()};
    m.ports.forEach(p=>{const kk=k(p.x+p.nx,p.y+p.ny);S.door.set(kk,(S.door.get(kk)||0)+1)});   // doorway cell of every port: other belts should keep out
    for(let i=0;i<d.w;i++)for(let j=0;j<d.h;j++)S.occ.set(k(x+i,y+j),m.id);
    S.M.push(m);return m;
  }
  const cx=m=>m.x+m.w/2,cy=m=>m.y+m.h/2,out=p=>[p.x+p.nx,p.y+p.ny],dirOf=(nx,ny)=>DX.findIndex((v,i)=>v===nx&&DY[i]===ny);
  function cands(m,tx,ty,faces){   // unused ports (optionally only on the given faces, e.g. ['W','N']) whose outside cell is free, nearest to the target first
    return m.ports.filter(p=>!m.used.has(p.key)&&(!faces||faces.includes(p.f))).map(p=>({p,o:out(p)})).filter(c=>free(c.o[0],c.o[1])).sort((a,b)=>(Math.abs(a.o[0]-tx)+Math.abs(a.o[1]-ty))-(Math.abs(b.o[0]-tx)+Math.abs(b.o[1]-ty)));
  }
  // ---- Dijkstra/A* over (cell, belt direction, piece type): type 0 belt, 1 underground entrance, 2 underground exit
  const nk=(x,y,d,t)=>(((x+4000)*8000+(y+4000))*4+d)*3+t;
  function heapPush(h,it){h.push(it);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p].f<=h[i].f)break;[h[p],h[i]]=[h[i],h[p]];i=p}}
  function heapPop(h){const t=h[0],l=h.pop();if(h.length){h[0]=l;let i=0;for(;;){let a=i*2+1,b=a+1,m=i;if(a<h.length&&h[a].f<h[m].f)m=a;if(b<h.length&&h[b].f<h[m].f)m=b;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m}}return t}
  function spanFree(ax,a,b){const l=S.span.get(ax);if(!l)return true;const lo=Math.min(a,b),hi=Math.max(a,b);return !l.some(([c,d])=>!(hi<c||lo>d))}
  function findPath(sx,sy,gx,gy,gdir,sback,cfn){   // cfn(x,y) = extra cost of stepping on a cell (used to keep long belts on the block-edge streets)
    const g=new Map(),prev=new Map(),H=[],hh=(x,y)=>(HAND.hw||1)*(Math.abs(x-gx)+Math.abs(y-gy));
    for(let d=0;d<4;d++){if(d===sback)continue;const key=nk(sx,sy,d,0);g.set(key,0);prev.set(key,null);heapPush(H,{f:hh(sx,sy),c:0,x:sx,y:sy,d,t:0,key})}
    {const d=(sback+2)%4;const key=nk(sx,sy,d,1);g.set(key,3);prev.set(key,null);heapPush(H,{f:3+hh(sx,sy),c:3,x:sx,y:sy,d,t:1,key})}
    const node=new Map();let n=0;
    // a belt path must never re-enter a cell it already uses (a loop would put two pieces on one cell)
    const onPath=(u,x,y)=>{let key=u.key,c=0;while(key!=null&&c++<600){const q=node.get(key);if(q&&q.x===x&&q.y===y)return true;key=prev.get(key)}return false};
    while(H.length&&n++<(HAND.maxStates||1500000)){
      const u=heapPop(H);if(u.c>g.get(u.key))continue;node.set(u.key,u);
      if(u.x===gx&&u.y===gy&&u.d===gdir&&u.t!==1){const path=[];let key=u.key;while(key!=null){const q=node.get(key);path.push({x:q.x,y:q.y,d:q.d,t:q.t});key=prev.get(key)}return path.reverse()}
      const push=(x,y,d,t,c)=>{const key=nk(x,y,d,t);if(c<(g.has(key)?g.get(key):1e9)){g.set(key,c);prev.set(key,u.key);heapPush(H,{f:c+hh(x,y),c,x,y,d,t,key})}};
      if(u.t===1){
        const ax=u.d%2===0?'h'+u.y:'v'+u.x;
        for(let kk=2;kk<MAXA;kk++){const ex=u.x+DX[u.d]*kk,ey=u.y+DY[u.d]*kk;if(free(ex,ey)&&!onPath(u,ex,ey)&&spanFree(ax,u.d%2===0?u.x:u.y,u.d%2===0?ex:ey))push(ex,ey,u.d,2,u.c+2+kk)}   // cells apart incl. both ends must be <= maxApart (ugPairs: n=dist+1)
      }else{
        const fx=u.x+DX[u.d],fy=u.y+DY[u.d];if(!free(fx,fy)||onPath(u,fx,fy))continue;
        const dz=(S.door.get(k(fx,fy))||0)&&!(fx===gx&&fy===gy)?(HAND.doorCost||30):0;   // stepping on another port's doorway costs extra (keeps ports reachable)
        const ex=cfn?cfn(fx,fy):0;
        for(const nd of[u.d,(u.d+1)%4,(u.d+3)%4])push(fx,fy,nd,0,u.c+1+dz+ex+(nd!==u.d?(HAND.turnCost||1):0));
        push(fx,fy,u.d,1,u.c+3+dz+ex);
      }
    }
    return null;
  }
  function commit(path,a,pa,b,pb,label){
    (S.paths=S.paths||[]).push({label,path,a:a.name,b:b.name,pa:{x:pa.x+pa.nx,y:pa.y+pa.ny,nx:pa.nx,ny:pa.ny},pb:{x:pb.x+pb.nx,y:pb.y+pb.ny,nx:pb.nx,ny:pb.ny}});
    path.forEach((q,i)=>{S.occ.set(k(q.x,q.y),'p');S.pcs.push({cls:q.t?UG:BELT,x:q.x,y:q.y,rot:q.d,h:0,pid:0})});
    for(let i=0;i<path.length-1;i++){const q=path[i],r=path[i+1];if(q.t===1&&r.t===2){const ax=q.d%2===0?'h'+q.y:'v'+q.x;const l=S.span.get(ax)||[];l.push(q.d%2===0?[Math.min(q.x,r.x),Math.max(q.x,r.x)]:[Math.min(q.y,r.y),Math.max(q.y,r.y)]);S.span.set(ax,l)}}
    a.used.add(pa.key);b.used.add(pb.key);
  }
  // link(a,b): belt from an unused port of a to an unused port of b. Returns path length or 0 (and logs the failure).
  function link(a,b,label,opt){cur=(opt&&opt.own)||null;try{return link0(a,b,label,opt)}finally{cur=null}}
  function link0(a,b,label,opt){
    const ca=cands(a,cx(b),cy(b),opt&&opt.pa).slice(0,5);
    for(const A of ca){
      const cb=cands(b,A.o[0],A.o[1],opt&&opt.pb).slice(0,5);
      for(const B of cb){
        const sback=dirOf(-A.p.nx,-A.p.ny),gdir=dirOf(-B.p.nx,-B.p.ny);
        if(A.o[0]===B.o[0]&&A.o[1]===B.o[1]){continue}
        const path=findPath(A.o[0],A.o[1],B.o[0],B.o[1],gdir,sback,opt&&opt.cfn);
        if(path){commit(path,a,A.p,b,B.p,label);return path.length}
      }
    }
    S.fails.push((label||'')+' '+a.name+' -> '+b.name+' [free ports '+cands(a,0,0,opt&&opt.pa).length+'/'+cands(b,0,0,opt&&opt.pb).length+']');return 0;
  }
  // verify(): re-walk every placed connection from its source doorway to its destination doorway over the PLACED pieces only (as the game would carry items)
  function verify(){
    const at=new Map();S.pcs.forEach(p=>at.set(k(p.x,p.y),p));
    const pairs=ugPairs(S.pcs.filter(p=>p.cls===UG)),jump=new Map();pairs.forEach(p=>jump.set(k(p.u.x,p.u.y),p.t));
    const bad=[];
    for(const P of S.paths||[]){
      let cur=at.get(k(P.pa.x,P.pa.y)),steps=0,why=null;
      if(!cur)why='no piece at source doorway';
      while(cur&&!why&&steps++<4000){
        const ent=jump.get(k(cur.x,cur.y));
        if(cur.cls===UG&&ent){cur=ent;continue}   // underground entrance: continue at its exit piece
        const nx=cur.x+DX[cur.rot],ny=cur.y+DY[cur.rot];
        if(cur.x===P.pb.x&&cur.y===P.pb.y){if(cur.rot!==dirOf(-P.pb.nx,-P.pb.ny))why='last piece does not point into the machine';break}
        const nxt=at.get(k(nx,ny));
        if(!nxt){why='belt runs into nothing at '+nx+','+ny;break}
        cur=nxt;
      }
      if(!why&&steps>=4000)why='loop';
      if(!why&&!(cur&&cur.x===P.pb.x&&cur.y===P.pb.y))why=why||'did not arrive';
      if(why)bad.push(P.label+' ('+P.a+' -> '+P.b+'): '+why);
    }
    return{paths:(S.paths||[]).length,bad};
  }
  // check(): every underground pair the SITE derives (ugPairs) must be a pair I placed, within maxApart; returns {pairs,bad:[...]}
  function check(){
    const ugs=S.pcs.filter(p=>p.cls===UG),want=new Set();
    S.span.forEach((l,ax)=>l.forEach(([a,b])=>want.add(ax+':'+a+'-'+b)));
    const pairs=ugPairs(ugs),bad=[];
    pairs.forEach(p=>{if(p.n>p.max)bad.push('span '+p.n+'>'+p.max+' at '+p.u.x+','+p.u.y);
      const ax=p.u.rot%2===0?'h'+p.u.y:'v'+p.u.x,a=p.u.rot%2===0?Math.min(p.u.x,p.t.x):Math.min(p.u.y,p.t.y),b=p.u.rot%2===0?Math.max(p.u.x,p.t.x):Math.max(p.u.y,p.t.y);
      if(!want.has(ax+':'+a+'-'+b))bad.push('foreign pair '+ax+' '+a+'-'+b)});
    if(ugs.length!==pairs.length*2)bad.push('unpaired underground pieces: '+(ugs.length-pairs.length*2));
    return{pairs:pairs.length,intended:want.size,bad};
  }
  function result(){
    const items=[];
    for(const m of S.M){const off=m.ports.filter(p=>!m.used.has(p.key)).map(p=>p.key);items.push({cls:m.cls,x:m.x,y:m.y,rot:0,h:0,pid:0,off,...(m.rec?{rec:m.rec}:{}),...(m.nm?{nm:m.nm}:{}),...(m.ct?{ct:m.ct}:{})})}
    S.pcs.forEach(p=>items.push({...p}));
    const bl=[...S.blocks.values()].map(b=>({cls:CLS,x:b.gx*D0.w,y:b.gy*D0.h}));
    return{ok:true,blocks:bl,ms:items,fails:S.fails.slice(),machines:S.M.length,belts:S.pcs.length};
  }
  // lane(a,pa,b,pb,path,label): commit a path that was laid directly by rule (no search); pa/pb are the source/destination ports
  function lane(a,pa,b,pb,path,label){commit(path,a,pa,b,pb,label);return path.length}
  // prune(): drop every block that holds nothing (no machine and no belt piece)
  function prune(){const keep=new Set();S.occ.forEach((_,kk)=>{const [x,y]=kk.split(',').map(Number);keep.add(k(Math.floor(x/TW),Math.floor(y/TW)))});[...S.blocks.keys()].forEach(kk=>{if(!keep.has(kk))S.blocks.delete(kk)})}
  // route(a,gx,gy,gdir,label,opt): belt from an unused port of a to the cell (gx,gy), arriving there with belt direction gdir (the goal cell gets the last piece). 0 + a logged failure when none.
  function route(a,gx,gy,gdir,label,opt){
    only=(opt&&opt.only)||null;
    try{const ca=cands(a,gx,gy,opt&&opt.pa).slice(0,6);
    for(const A of ca){const sback=dirOf(-A.p.nx,-A.p.ny);
      const path=findPath(A.o[0],A.o[1],gx,gy,gdir,sback,opt&&opt.cfn);
      if(path){path.forEach(q=>{S.occ.set(k(q.x,q.y),'p');S.pcs.push({cls:q.t?UG:BELT,x:q.x,y:q.y,rot:q.d,h:0,pid:0,...(opt&&opt.tag?{g:opt.tag}:{})})});
        for(let i=0;i<path.length-1;i++){const q=path[i],r=path[i+1];if(q.t===1&&r.t===2){const ax=q.d%2===0?'h'+q.y:'v'+q.x;const l=S.span.get(ax)||[];l.push(q.d%2===0?[Math.min(q.x,r.x),Math.max(q.x,r.x)]:[Math.min(q.y,r.y),Math.max(q.y,r.y)]);S.span.set(ax,l)}}
        a.used.add(A.p.key);return path.length}}
    S.fails.push((label||'')+' '+a.name+' -> '+gx+','+gy+' [free ports '+cands(a,0,0,opt&&opt.pa).length+']');return 0}finally{only=null}}
  // piece(p): drop one ready-made piece (belt, underground, splitter) on a free cell; false if the cell is taken or off the floor
  function piece(p,force){const kk=k(p.x,p.y);if((!force&&!inFloor(p.x,p.y))||S.occ.has(kk))return false;S.occ.set(kk,'p');S.pcs.push({h:0,pid:0,...p});return true}
  return{reset,block,put,link,route,reserve,lane,prune,piece,setMk,D:()=>MAXA-1,result,check,verify,S,TW,FW,CLS,free,inFloor};
})();
