// Exosuit factory, ROW-BUS version (hand.js HAND + exosuit_spec.js). exoBus({mk:2,kmin:2}) -> HAND.result() + {lanes,bus,...}
// Every belt is LAID BY RULE (layLine), nothing is searched. Layout (block rows): gy 0 = TOP module row, gy 1..BB = BUS band, gy BB+1 = BOTTOM module row.
// One machine per module block, flow strictly west -> east (a consumer sits in a later block column than all its producers).
// A LANE is 2..4 parallel belts (one item) running east along track rows in the band, built from underground pairs; it passes THROUGH tap containers
// (lane in on W face, out on E face, a 1-belt riser on the N/S face to/from a machine). Producers feed a collect tap, consumers pull from a consumer tap.
// Lane pieces sit on track rows, risers on spacer rows, so they never share a cell; tunnels cross under everything.
window.exoBus=function(opts){
  opts=opts||{};const MK=opts.mk!=null?opts.mk:2,KMIN=opts.kmin||2,MARGIN=opts.margin||1.3;   // MARGIN: machines can run above the planned rate (120 vs 97), so a lane carries 30% more than the planHAND.reset({mk:MK});
  const TW=HAND.TW,CAP=[60,120,180][MK],DH=HAND.D();
  const SP={};EXO_SPEC.forEach(s=>SP[s.item.replace('ITEM_','')]=s);const names=Object.keys(SP),short=i=>i.replace('ITEM_','');
  const size=cls=>{const d=dim({cls,rot:0});return[d.w,d.h]};
  const MY=6,PFOF={3:1,5:2,7:2,9:3};
  // ---- per-class geometry (frame coordinates: bus face on top, machine at MX,MY)
  const GEO={};const geo=cls=>GEO[cls]||(GEO[cls]=(()=>{const s=size(cls)[0],pf=PFOF[s],c=portsOf({cls,x:0,y:0,rot:0,h:0}).filter(p=>p.f==='N').map(p=>p.x+p.nx).sort((a,b)=>a-b);
    if(c.length!==pf)throw new Error('class '+cls+' has '+c.length+' N ports, expected '+pf);return{s,pf,c,MX:5*pf,hubX:5*pf+s+1,ovX:5*pf-5}})());
  // ---- modules in dependency order, machines assigned to block columns (consumer column > every producer column)
  const depth={};const dep=p=>{if(depth[p]!=null)return depth[p];depth[p]=0;let d=0;for(const i of SP[p].ins){const q=short(i);if(q===p||!SP[q])continue;d=Math.max(d,dep(q)+1)}return depth[p]=d};names.forEach(dep);
  const order=names.slice().sort((a,b)=>depth[a]-depth[b]||names.indexOf(a)-names.indexOf(b));
  const free={},last={},MM=[],by={};
  const colsOf=(g,mir,p,bus,hubOut)=>{const f=x=>mir?29-x:x;return[...bus.slice(0,g.pf).map((q,i)=>[q,f(g.MX+g.c[i])]),...(bus.length>g.pf?[[bus[g.pf],f(g.ovX)]]:[]),...(hubOut?[[p,f(g.hubX)]]:[])]};   // [item, riser column] of a machine block
  const clash=(A,B)=>A.some(([qa,ca])=>B.some(([qb,cb])=>qa===qb?(ca!==cb&&Math.abs(ca-cb)<5):ca===cb));   // top and bottom machine of one block column: same item needs the same column or >=5 apart (taps), different items need different columns
  for(const p of order){const s=SP[p];let min=0;for(const i of s.ins){const q=short(i);if(q!==p&&SP[q])min=Math.max(min,last[q]+1)}
    last[p]=0;by[p]=[];const g=geo(s.cls),ins=s.ins.map(short).filter(q=>q!==p),raw=ins.filter(q=>!SP[q]),bus=ins.filter(q=>SP[q]);
    if(bus.length>g.pf+1)throw new Error(p+' has '+bus.length+' bus inputs on a '+g.pf+'-port face');
    const hubOut=order.some(c=>c!==p&&SP[c].ins.some(i=>short(i)===p));
    for(let i=0;i<s.n;i++){let done=false;
      for(let gx=min;!done;gx++){const f=free[gx]||(free[gx]={T:null,B:null});
        for(const side of['T','B']){if(f[side]||done)continue;const other=f[side==='T'?'B':'T'];
          for(const mir of(side==='B'?[false,true]:[false])){const cs=colsOf(g,mir,p,bus,hubOut);
            if(other&&clash(cs,other.cs))continue;
            f[side]={cs};const mm={p,i,s,gx,top:side==='T',mir,g,self:s.ins.includes(s.item),raw,bus,direct:bus.slice(0,g.pf),over:bus[g.pf]||null,cons:[]};MM.push(mm);by[p].push(mm);last[p]=Math.max(last[p],gx);done=true;break}}}}}
  const fxm=(mm,fx)=>mm.mir?29-fx:fx;   // frame x -> block x (a mirrored machine block flips left/right)
  // ---- lanes: one lane (2..4 belts) per item that has consumers; nl lanes if one would need more than 4 belts
  const lanes=[];
  for(const q of order){const cons=[];for(const mm of MM)for(const [kind,item,idx] of[...mm.direct.map((x,i)=>['direct',x,i]),...(mm.over?[['over',mm.over,0]]:[])]){if(item!==q)continue;
      cons.push({mm,kind,idx,col:mm.gx*TW+fxm(mm,kind==='direct'?mm.g.MX+mm.g.c[idx]:mm.g.ovX),dem:mm.s.rate/(mm.s.outn||1)*(mm.s.qty[mm.s.ins.map(short).indexOf(q)]||1)/mm.s.n})}
    if(!cons.length)continue;
    const prod=by[q],nl=Math.max(1,Math.ceil(MARGIN*prod.length*(SP[q].pm||1)/(4*CAP))),L=Array.from({length:nl},(_,l)=>({q,l,prod:[],cons:[],room:0,F:0}));
    prod.forEach((mm,i)=>{const l=L[i%nl];l.prod.push(mm);l.F+=SP[q].pm||1});
    L.forEach(l=>{l.room=l.F});cons.sort((a,b)=>b.dem-a.dem).forEach(c=>{let b=L[0];for(const l of L)if(l.room>b.room)b=l;b.room-=c.dem;b.cons.push(c)});
    L.forEach(l=>{l.k=Math.min(4,Math.max(KMIN,Math.ceil(MARGIN*l.F/CAP)));lanes.push(l)})}
  // ---- taps (one container per lane x riser column), sorted by column, spaced >= 5 apart
  for(const l of lanes){const m=new Map();
    const add=(col,it)=>{if(!m.has(col))m.set(col,{col,items:[]});m.get(col).items.push(it)};
    l.prod.forEach(mm=>add(mm.gx*TW+fxm(mm,mm.g.hubX),{kind:'collect',mm}));l.cons.forEach(c=>add(c.col,{kind:'cons',...c}));
    l.taps=[...m.values()].sort((a,b)=>a.col-b.col);let prev=-99;
    for(const t of l.taps){t.cx=Math.max(t.col-3,prev+5);if(t.cx>t.col)throw new Error('tap collision on lane '+l.q+' at column '+t.col);if(t.cx%TW<1||t.cx%TW+3>29)throw new Error('tap of lane '+l.q+' crosses a block wall at '+t.cx);prev=t.cx}
    l.lo=l.taps[0].cx-1;l.hi=l.taps[l.taps.length-1].cx+4}
  // ---- tracks: left-edge colouring with 8 free cells between two lanes on one track
  const ends=[];lanes.slice().sort((a,b)=>a.lo-b.lo).forEach(l=>{let g=0;while(ends[g]!=null&&ends[g]+8>=l.lo)g++;ends[g]=l.hi;l.g=g});
  const BB=Math.ceil(ends.length/4),NC=Math.max(...MM.map(m=>m.gx))+1;
  lanes.forEach(l=>{l.gyB=1+Math.floor(l.g/4);l.y0=l.gyB*TW+2+6*(l.g%4)});
  for(let gx=0;gx<NC;gx++)for(let gy=0;gy<=BB+1;gy++)HAND.block(gx,gy);
  // ---- direct line placer
  const inBand=y=>{const b=Math.floor(y/TW);return b>=1&&b<=BB};
  const rsv=new Map();   // doorway cells reserved for the one line that starts or ends there
  const okCell=(x,y,vert,label)=>{if(x%TW>=30||y%TW>=30||!HAND.free(x,y))return false;const r=rsv.get(x+','+y);if(r&&r!==label)return false;if(vert&&inBand(y)){const m=y%TW;return m<26&&m%6<2}return true};
  const portAt=(o,x,y)=>o.ports.find(p=>p.x+p.nx===x&&p.y+p.ny===y);
  const DX=[1,0,-1,0],DY=[0,1,0,-1];let nLines=0,okLines=0;
  function layLine(a,b,x0,y0,dir,len,ug,label){nLines++;
    try{const cells=[];for(let i=0;i<len;i++)cells.push({x:x0+DX[dir]*i,y:y0+DY[dir]*i});const vert=dir%2===1,N=len,path=[];
      const pa=portAt(a,cells[0].x,cells[0].y),pb=portAt(b,cells[N-1].x,cells[N-1].y);if(!pa)throw new Error('no source port at '+cells[0].x+','+cells[0].y+' of '+a.name);if(!pb)throw new Error('no destination port at '+cells[N-1].x+','+cells[N-1].y+' of '+b.name);
      const ok=c=>okCell(c.x,c.y,vert,label);let i=0;
      while(i<N){let best=-1;if(ug||N>12)for(let j=Math.min(i+DH,N-1);j>=i+2;j--){if(ok(cells[j])&&(j===N-1||ok(cells[j+1]))){best=j;break}}
        if(!ok(cells[i]))throw new Error('blocked cell '+cells[i].x+','+cells[i].y);
        if(best>=0&&ok(cells[i])){path.push({x:cells[i].x,y:cells[i].y,d:dir,t:1},{x:cells[best].x,y:cells[best].y,d:dir,t:2});i=best+1}else{path.push({x:cells[i].x,y:cells[i].y,d:dir,t:0});i++}}
      HAND.lane(a,pa,b,pb,path,label);okLines++;return true}
    catch(e){HAND.S.fails.push((label||'')+': '+e.message);return false}}
  // ---- build modules
  const BOT=(BB+1)*TW;
  const phys=(mm,fx,fy)=>[mm.gx*TW+fxm(mm,fx),(mm.top?0:BOT)+(mm.top?29-fy:fy)];
  const pd=(mm,d)=>{if(mm.top&&(d===1||d===3))d=(d+2)%4;if(mm.mir&&(d===0||d===2))d=(d+2)%4;return d};   // frame direction -> physical direction
  const put=(mm,cls,fx,fy,w,h,name,extra)=>{const gy=mm.top?0:BB+1,ly=mm.top?29-(fy+h-1):fy,lx=mm.mir?29-(fx+w-1):fx;const o=HAND.put({cls,gx:mm.gx,gy,lx,ly,name,...extra});if(!o)throw new Error(name+' does not fit at frame '+fx+','+fy);return o};
  const lineF=(mm,a,b,fx,fy,fd,len,ug,label)=>{const [x,y]=phys(mm,fx,fy);return layLine(a,b,x,y,pd(mm,fd),len,ug,label)};
  for(const mm of MM){const g=mm.g,s=g.s,nm=mm.p+'#'+mm.i;
    mm.m=put(mm,mm.s.cls,g.MX,MY,s,s,nm,{rec:mm.s.rec});
    mm.hub=put(mm,'DAT_Container_2',g.hubX,MY+g.c[0],4,4,'out '+nm,{ct:mm.self?[{item:mm.s.item,n:300,inf:false}]:[]});
    lineF(mm,mm.m,mm.hub,g.MX+s,MY+g.c[0],0,1,false,nm+' > hub');
    if(mm.self)lineF(mm,mm.hub,mm.m,g.MX+s,MY+g.c[1],2,1,false,nm+' seed');
    let wj=0;
    if(mm.over){mm.cw=put(mm,'DAT_Container_2',g.ovX,MY+g.c[0]-3,4,4,'in '+mm.over+' > '+nm);lineF(mm,mm.cw,mm.m,g.MX-1,MY+g.c[0],0,1,false,nm+' overflow stub');wj=1}
    let si=0;
    for(const q of mm.raw){const it=mm.s.ins.find(i=>short(i)===q);
      if(wj<g.pf){const x=g.MX-5-5*wj;if(x<0)throw new Error(nm+': no room for raw '+q);const c=put(mm,'DAT_Container_2',x,MY+g.c[wj]-3,4,4,'raw '+q+' > '+nm,{ct:[{item:it,n:0,inf:true}]});lineF(mm,c,mm.m,x+4,MY+g.c[wj],0,g.MX-1-(x+4)+1,false,nm+' raw '+q);wj++}
      else{if(si>=g.pf)throw new Error(nm+': too many raw inputs');const c=put(mm,'DAT_Container_2',g.MX+g.c[si],MY+s+1,4,4,'raw '+q+' > '+nm,{ct:[{item:it,n:0,inf:true}]});lineF(mm,c,mm.m,g.MX+g.c[si],MY+s,3,1,false,nm+' raw '+q);si++}}}
  // ---- taps, lane segments, risers
  const lbl=[];
  for(const l of lanes)l.taps.forEach(t=>{t.o=HAND.put({cls:'DAT_Container_2',gx:Math.floor(t.cx/TW),gy:l.gyB,lx:t.cx%TW,ly:l.y0%TW,name:'tap '+l.q+(lanes.filter(z=>z.q===l.q).length>1?' L'+l.l:'')});if(!t.o)throw new Error('tap '+l.q+' does not fit at '+t.cx)});
  // reserve both end cells of every riser for that riser (another riser passing through must not take a tap or machine doorway)
  const rl=(it,l)=>it.kind==='collect'?'riser '+it.mm.p+'#'+it.mm.i+' > tap':'feed '+l.q+' > '+it.mm.p+'#'+it.mm.i;
  for(const l of lanes)for(const t of l.taps)for(const it of t.items){const mm=it.mm,g=mm.g,lab=rl(it,l),ty=mm.top?l.y0-1:l.y0+4;rsv.set(t.col+','+ty,lab);
    if(it.kind==='collect'){const [hx,hy]=phys(mm,g.hubX,MY+g.c[0]-1);rsv.set(hx+','+hy,lab)}
    else{const [px,py]=it.kind==='direct'?phys(mm,g.MX+g.c[it.idx],MY-1):phys(mm,g.ovX,MY+g.c[0]-4);rsv.set(px+','+py,lab)}}
  for(const l of lanes){
    for(let j=0;j<l.taps.length-1;j++){const A=l.taps[j],B=l.taps[j+1];
      for(let b=0;b<l.k;b++)layLine(A.o,B.o,A.cx+4,l.y0+b,0,B.cx-1-(A.cx+4)+1,true,'lane '+l.q+' #'+b);
      if(B.cx-A.cx>=20)lbl.push({t:l.q,x:Math.round((A.cx+4+B.cx-1)/2),y:l.y0+1,v:false})}
    for(const t of l.taps)for(const it of t.items){const mm=it.mm,g=mm.g,c=t.col;
      if(it.kind==='collect'){const [hx,hy]=phys(mm,g.hubX,MY+g.c[0]-1),ty=mm.top?l.y0-1:l.y0+4,dir=mm.top?1:3;
        layLine(mm.hub,t.o,hx,hy,dir,Math.abs(ty-hy)+1,true,rl(it,l))}
      else{const tap=mm.top?l.y0-1:l.y0+4,dir=mm.top?3:1;let dest,fx,fy;
        if(it.kind==='direct'){dest=mm.m;fx=g.MX+g.c[it.idx];fy=MY-1}else{dest=mm.cw;fx=g.ovX;fy=MY+g.c[0]-4}
        const [px,py]=phys(mm,fx,fy);layLine(t.o,dest,c,tap,dir,Math.abs(py-tap)+1,true,rl(it,l))}}}
  HAND.prune();
  const R=HAND.result();R.links=nLines;R.linksOk=okLines;R.lanes=lbl;window.EXO_LANES=lbl;R.bus={BB,NC,tracks:ends.length,lanes:lanes.length};
  R.containers=HAND.S.M.filter(m=>/Container/.test(m.cls)).length;R.ug=HAND.S.pcs.filter(p=>/Under/.test(p.cls)).length;
  return R;
};
