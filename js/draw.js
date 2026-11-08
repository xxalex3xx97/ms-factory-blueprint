// ---- bottleneck colours / drawing
let BN=false,BM="B";
function bnCol(u,m){
  if(u==null)return"rgba(120,220,240,.9)";
  if(!(u>0))return"hsl(0,0%,55%)";
  if(m==="F"){const t=Math.min(u,1);return`hsl(${Math.round(140*t)},${Math.round(0+65*t)}%,${Math.round(55-9*t)}%)`}
  return`hsl(${Math.round(140*(1-Math.min(1,Math.max(0,(u-1)/0.25))))},65%,46%)`;
}
const simLive=()=>smOn()&&SIM.t>0;   // sim exists and has run (not reset): colours use simulated values, else static estimate
const bnK=()=>simLive()?simView():linksC(layer);
const bnU=(K,id)=>{const e=K.load.get(id),u=e?e.util:0;return BM==="B"&&simLive()&&smS().full.has(id)?Math.max(u||0,1.25):u};
function drawBnCells(s){
  const K=bnK();cx.save();cx.globalAlpha=.6;
  S.blocks.forEach(b=>{if(b.h!==layer||!isBelt(b)||!inView(b))return;const d=dim(b);cx.fillStyle=bnCol(bnU(K,b.id),BM);cx.fillRect(V.ox+b.x*s,V.oy+b.y*s,d.w*s,d.h*s)});
  cx.restore();
}
const AMB="hsl(40,95%,55%)";
function mixMark(x,y,s){const r=Math.max(5,s*.2);cx.save();cx.fillStyle=AMB;cx.strokeStyle="rgba(0,0,0,.7)";cx.lineWidth=1;cx.beginPath();cx.arc(x,y,r,0,7);cx.fill();cx.stroke();
  cx.fillStyle="#000";cx.font=`bold ${Math.round(r*1.5)}px system-ui,sans-serif`;cx.textAlign="center";cx.textBaseline="middle";cx.fillText("!",x,y+.5);cx.restore()}
function drawBeltItems(s){
  if(s<10)return;
  const K=smK(),c=(x,y)=>[V.ox+(x+.5)*s,V.oy+(y+.5)*s],sz=Math.min(s*.5,22),seen=new Set();
  const segs=K.flow.concat(K.ug),icons=(e,u,a,b)=>{
    const n=Math.max(1,e.items.size),ks=[...e.items.keys()],ph=RM.matches?0:smPh;
    for(let k=0;k<n;k++){const f=b?(ph+k/n)%1:0,x=b?a[0]+(b[0]-a[0])*f:a[0],y=b?a[1]+(b[1]-a[1])*f:a[1],ic=img(ks[k%ks.length]);
      cx.fillStyle="rgba(235,240,245,.88)";cx.beginPath();cx.arc(x,y,sz*.55,0,7);cx.fill();
      if(ic&&ic.complete)cx.drawImage(ic,x-sz/2,y-sz/2,sz,sz);
      else{cx.fillStyle="rgba(255,255,255,.7)";cx.beginPath();cx.arc(x,y,sz/4,0,7);cx.fill()}}
    if(e.mixed){const m=b?[(a[0]+b[0])/2,(a[1]+b[1])/2]:a;mixMark(m[0],m[1]-(b?0:sz*.5),s)}};
  segs.forEach(({u,t:tg})=>{const e=K.load.get(u.id);if(!e)return;seen.add(u.id);icons(e,u,c(u.x,u.y),c(tg.x,tg.y))});
  K.load.forEach((e,id)=>{if(seen.has(id))return;const b=S.blocks.find(q=>q.id===id);if(b&&b.h===layer)icons(e,b,c(b.x,b.y),null)});
}
function drawLinks(s){
  const K=smOn()?smK():linksC(layer),c=(x,y)=>[V.ox+(x+.5)*s,V.oy+(y+.5)*s],lw=s>=12?2:1.5,BNK=bnK();
  cx.save();cx.lineCap="round";
  const head=(a,b,col,r)=>{const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,an=Math.atan2(b[1]-a[1],b[0]-a[0]);
    cx.save();cx.translate(mx,my);cx.rotate(an);cx.fillStyle=col;cx.beginPath();cx.moveTo(r,0);cx.lineTo(-r,-r*.8);cx.lineTo(-r,r*.8);cx.closePath();cx.fill();cx.restore()};
  if(BN){
    const seg=(u,t,dash)=>{const a=c(u.x,u.y),b=c(t.x,t.y),cu=bnCol(bnU(BNK,u.id),BM),ct=bnCol(bnU(BNK,t.id),BM),g=cx.createLinearGradient(a[0],a[1],b[0],b[1]);
      g.addColorStop(0,cu);g.addColorStop(1,ct);return{a,b,cu,g}};
    K.flow.forEach(({u,t,merge})=>{const{a,b,cu,g}=seg(u,t);
      cx.strokeStyle=g;cx.lineWidth=merge?lw+1.5:lw;cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);cx.stroke();
      head(a,b,cu,Math.max(3,s*.17));
      if(merge){cx.beginPath();cx.arc(b[0],b[1],Math.max(3,s*.18),0,7);cx.stroke()}
      const e=BNK.load.get(u.id);if(e&&e.mixed)mixMark((a[0]+b[0])/2,(a[1]+b[1])/2,s)});
    cx.setLineDash([4,3]);cx.lineWidth=lw;
    if(s>=ARROW_MIN_S)K.ug.forEach(({u,t})=>{const{a,b,g}=seg(u,t);cx.strokeStyle=g;cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);cx.stroke();
      const e=BNK.load.get(u.id);if(e&&e.mixed){cx.setLineDash([]);mixMark((a[0]+b[0])/2,(a[1]+b[1])/2,s);cx.setLineDash([4,3])}});
    cx.setLineDash([]);
  }
  if(!BN){
  K.flow.forEach(({u,t,merge})=>{
    const a=c(u.x,u.y),b=c(t.x,t.y),col=merge?"hsl(150,60%,58%)":"rgba(120,220,240,.9)";
    cx.strokeStyle=col;cx.lineWidth=merge?lw+1.5:lw;cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);cx.stroke();
    head(a,b,col,Math.max(3,s*.17));
    if(merge){cx.beginPath();cx.arc(b[0],b[1],Math.max(3,s*.18),0,7);cx.stroke()}
  });
  cx.setLineDash([4,3]);cx.strokeStyle="hsl(210,80%,72%)";cx.lineWidth=lw;
  if(s>=ARROW_MIN_S)K.ug.forEach(({u,t})=>{const a=c(u.x,u.y),b=c(t.x,t.y);cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);cx.stroke()});
  cx.setLineDash([]);
  }
  K.off.forEach(e=>{const p=e.port,a=c(p.x,p.y);cx.strokeStyle="rgba(255,90,90,.5)";cx.lineWidth=lw;cx.beginPath();cx.moveTo(a[0]+p.nx*.5*s,a[1]+p.ny*.5*s);cx.lineTo(a[0]+p.nx*.85*s,a[1]+p.ny*.85*s);cx.stroke()});
  K.ports.forEach(p=>{
    const a=c(p.bx,p.by),b=c(p.mx,p.my),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
    cx.strokeStyle="hsl(190,80%,68%)";cx.lineWidth=lw;cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);cx.stroke();
    cx.fillStyle="hsl(190,80%,68%)";cx.strokeStyle="rgba(0,0,0,.6)";cx.lineWidth=1;cx.beginPath();cx.arc(mx,my,Math.max(2.5,s*.13),0,7);cx.fill();cx.stroke();
  });
  cx.restore();
}
function drawPorts(s){
  if(s<6)return;
  const Ln=Math.min(.6*s,18),T=Math.min(5,Math.max(3,.2*s));cx.save();cx.lineWidth=1;cx.strokeStyle="rgba(0,0,0,.75)";
  S.blocks.forEach(b=>{if(b.h!==layer)return;const bars=barPorts(b);
    // splitter input (back) face: no bar; small neutral chevron pointing into the machine (not clickable, no hover state)
    portsOf(b).filter(p=>!bars.some(q=>q.key===p.key)).forEach(p=>{const ex=V.ox+(p.x+.5+p.nx*.5)*s,ey=V.oy+(p.y+.5+p.ny*.5)*s,r=Math.min(8,Math.max(3,s*.2)),ix=-p.nx,iy=-p.ny,qx=-iy,qy=ix;
      cx.strokeStyle="rgba(230,240,255,.45)";cx.lineWidth=Math.max(1.5,s*.08);cx.beginPath();
      cx.moveTo(ex-ix*r+qx*r,ey-iy*r+qy*r);cx.lineTo(ex+ix*r,ey+iy*r);cx.lineTo(ex-ix*r-qx*r,ey-iy*r-qy*r);cx.stroke()});
    cx.lineWidth=1;cx.strokeStyle="rgba(0,0,0,.75)";
    bars.forEach(p=>{
    if(p.line){   // elevator: short tick on the outer edge of the ring cell behind the port (pos 4 = low side, pos 9 = high side)
      const low=p.pos==='start',rx=p.x+p.nx,ry=p.y+p.ny,k=(low?0:1);
      cx.save();cx.strokeStyle=p.en?"hsl(140,70%,48%)":"hsl(0,75%,55%)";cx.lineWidth=Math.max(2,s*.12);cx.beginPath();   // save/restore: the tick's stroke style must not leak into the next port
      if(p.ny){const X=V.ox+(rx+k)*s,Y0=V.oy+ry*s,Y1=V.oy+(ry+1)*s;cx.moveTo(X,Y0);cx.lineTo(X,Y1)}   // N/S wall: lateral edges are vertical
      else{const Y=V.oy+(ry+k)*s,X0=V.ox+rx*s,X1=V.ox+(rx+1)*s;cx.moveTo(X0,Y);cx.lineTo(X1,Y)}   // E/W wall: lateral edges are horizontal
      cx.stroke();cx.restore();return}
    const ex=V.ox+(p.x+.5+p.nx*.5)*s,ey=V.oy+(p.y+.5+p.ny*.5)*s,w=p.nx?T:Ln,h=p.nx?Ln:T;
    cx.fillStyle=p.en?"hsl(140,70%,48%)":"hsl(0,75%,55%)";cx.fillRect(ex-w/2,ey-h/2,w,h);cx.strokeRect(ex-w/2+.5,ey-h/2+.5,w-1,h-1);
    if(p.dir&&s>=10){const r=Math.min(8,Math.max(3,s*.2)),sg=p.dir==="in"?-1:1,dx=p.nx*sg,dy=p.ny*sg,qx=ex+p.nx*.35*s*(p.dir==="in"?-.2:.2),qy=ey+p.ny*.35*s*(p.dir==="in"?-.2:.2);
      cx.fillStyle="#fff";cx.beginPath();cx.moveTo(qx+dx*r,qy+dy*r);cx.lineTo(qx-dx*r*.6-dy*r*.8,qy-dy*r*.6+dx*r*.8);cx.lineTo(qx-dx*r*.6+dy*r*.8,qy-dy*r*.6-dx*r*.8);cx.closePath();cx.fill();cx.stroke()}
  })});
  cx.restore();
}
function drawBadges(s){
  if(s<10)return;
  cx.save();cx.textBaseline="top";cx.textAlign="center";
  const sm=smOn(),K=sm?null:linksC(layer);
  S.blocks.forEach(b=>{if(b.h!==layer||!isM(b))return;const sto=isStore(b),r=recOf(b);if(!r&&!sto)return;
    const si=sto&&!sm?K.sto.get(b.id):null;if(sto&&!sm&&!(si&&(si.in||si.out||si.rows.length)))return;
    const cs=sm&&sto?smS().cont.get(b.id):null,ms=sm&&r?smS().mach.get(b.id):null;
    const d=dim(b),bw=d.w*s,bh=d.h*s,v=r?pm(r.o[1],r.t):0,txt=sm?(sto?"stock "+(cs?cs.have+(cs.rows.some(x=>x.inf)?" +∞":"")+" · in "+cs.in+" · out "+cs.out:"0 · in 0 · out 0")+" /min":ms?ms.st:"idle"):sto?"in "+si.in+" · out "+si.out+" /min":(v==null?"?":v)+"/min",ic=r?img(r.o[0]):cs&&cs.rows[0]?img(cs.rows[0].item):((b.ct||[]).length?img(b.ct[0].item):null);
    const sz=Math.max(24,Math.round(Math.min(bw,bh)*.45)),fs=Math.max(11,Math.min(14,sz*.4)),gap=3,nl0=sm&&sto?2:1,th=(fs+4)*nl0;
    const mx0=V.ox+b.x*s+bw/2,top=V.oy+b.y*s+bh/2-(sz+gap+th)/2;
    cx.font="bold "+fs+"px system-ui,sans-serif";
    const ln=sm&&sto?txt.split(" · in "):[txt];if(ln.length>1)ln[1]="in "+ln[1];
    const nl=ln.length,pw=Math.min(W-4,Math.max(...ln.map(t=>cx.measureText(t).width))+8),mx=mx0;
    cx.globalAlpha=.9;cx.shadowColor="rgba(0,0,0,.6)";cx.shadowBlur=4;cx.shadowOffsetY=1;
    if(ic&&ic.complete)cx.drawImage(ic,mx-sz/2,top,sz,sz);
    cx.shadowBlur=0;cx.shadowOffsetY=0;cx.globalAlpha=1;
    const py=top+sz+gap;
    cx.fillStyle="rgba(0,0,0,.65)";cx.fillRect(mx-pw/2,py,pw,th);
    cx.fillStyle="#fff";ln.forEach((t,i)=>cx.fillText(t,mx,py+2+i*(fs+4)))});
  cx.restore();
}
const ugTool=d=>d&&d.kind==="m"&&d.directional&&d.w===1&&d.h===1&&d.category==="Undergrounds";
// underground drag: entrance at the press cell, exit on the dominant axis of the drag, clamped to the tier max length (cells entrance..exit inclusive)
function ugDrag(g){
  const mx=def(g.cls).maxApart,dx=g.cur.x-g.c0.x,dy=g.cur.y-g.c0.y;
  if(!dx&&!dy)return{a:g.c0,b:g.c0,n:1,rot:placeRot};
  const h=Math.abs(dx)>=Math.abs(dy),v=h?dx:dy,k=Math.min(Math.abs(v),mx-1),sg=Math.sign(v),rot=h?(sg>0?0:2):(sg>0?1:3);
  return{a:g.c0,b:{x:g.c0.x+(h?sg*k:0),y:g.c0.y+(h?0:sg*k)},n:k+1,rot};
}
const runTool=d=>d&&d.kind==="m"&&d.directional&&d.w===1&&d.h===1&&d.category==="Conveyors";
const cutBelts=nb=>{const k=new Set(nb.map(n=>n.x+","+n.y));S.blocks=S.blocks.filter(b=>!(b.h===layer&&isBelt(b)&&k.has(b.x+","+b.y)))};
function beltStep(g,c){
  const t=g.tr;
  for(let k=0;k<999;k++){
    const l=t[t.length-1],dx=c.x-l.x,dy=c.y-l.y;if(!dx&&!dy)return;
    const n=Math.abs(dx)>=Math.abs(dy)?{x:l.x+Math.sign(dx),y:l.y}:{x:l.x,y:l.y+Math.sign(dy)};
    const i=t.findIndex(q=>q.x===n.x&&q.y===n.y);
    if(i>=0)t.length=i+1;else t.push(n);
  }
}
function beltCells(g){
  const t=g.tr;if(t.length<2)return[{x:t[0].x,y:t[0].y,rot:placeRot}];
  const R=(a,b)=>b.x>a.x?0:b.x<a.x?2:b.y>a.y?1:3;
  return t.map((c,i)=>({x:c.x,y:c.y,rot:i<t.length-1?R(c,t[i+1]):R(t[i-1],c)}));
}

// ---- canvas
const cv=$("cv"),cx=cv.getContext("2d");
let W=0,H=0,dpr=1,RCT=null;
function resize(){const r=cv.getBoundingClientRect();dpr=window.devicePixelRatio||1;W=r.width;H=r.height;cv.width=Math.max(1,W*dpr);cv.height=Math.max(1,H*dpr);paint()}
new ResizeObserver(resize).observe(cv);
const toCell=(px,py)=>({x:Math.floor((px-V.ox)/sc()),y:Math.floor((py-V.oy)/sc())});
let raf=0;const draw=()=>{asv();if(!raf)raf=requestAnimationFrame(()=>{raf=0;paint()})};

function drawIcon(d,x,y,w,h,alpha){
  const i=img(d&&d.icon);if(!i||!i.complete||!i.naturalWidth)return;
  const z=Math.min(w,h)*.72;if(z<10)return;
  cx.save();cx.globalAlpha=alpha;cx.imageSmoothingQuality="high";cx.drawImage(i,x+(w-z)/2,y+(h-z)/2,z,z);cx.restore();
}
const ARROW_MIN_S=10;   // zoom (px per unit, sc()) below which belt direction arrows and underground links are hidden
function arrow(x,y,w,h,rot,alpha){
  const r=Math.min(w,h)*.3;if(r<3)return;
  cx.save();cx.translate(x+w/2,y+h/2);cx.rotate(rot*Math.PI/2);
  cx.fillStyle=`rgba(255,255,255,${alpha})`;cx.strokeStyle=`rgba(0,0,0,${alpha*.7})`;cx.lineWidth=1;
  cx.beginPath();cx.moveTo(r,0);cx.lineTo(-r*.7,-r*.75);cx.lineTo(-r*.3,0);cx.lineTo(-r*.7,r*.75);cx.closePath();cx.fill();cx.stroke();cx.restore();
}
// entrance marks (Layout, model.js entrances()): door slot = light bar on the edge + white chevron pointing INTO the block; ports side (no doors) = mint bar + chevron pointing out to the ports. Rotates with the block
const ENT_DOOR_S=44;
function entMark(b,x,y,alpha,s,w,h){
  if(alpha<.5||s<5)return;const E=entrances(b,true);if(!E.length)return;   // bar = full door slot length (scales with zoom); only the chevron is capped (r <= 9); door marks (many on stations) only when a cell is >= ENT_DOOR_S px
  const t=Math.max(2,Math.min(5,s*.12)),r=Math.min(9,Math.max(3,s*.12)),L=Math.max(5,DOORW/FC*s),lh=s>=18?Math.min(12,Math.max(9,s/3))+6:0;
  E.forEach(e=>{if(!e.port&&s<ENT_DOOR_S)return;const D=DIR[e.ed],ex=V.ox+e.x*s,ey=V.oy+e.y*s,hz=D[0]===0,bw=hz?L:t,bh=hz?t:L,
    bx=D[0]>0?ex-t:D[0]<0?ex:ex-L/2,by=D[1]>0?ey-t:D[1]<0?ey:ey-L/2,sg=e.port?1:-1,   // door: chevron looks inward, port: outward
    dd=r+t+(D[1]<0?lh:0),cx0=ex-D[0]*dd,cy0=ey-D[1]*dd;
    cx.save();cx.fillStyle=e.port?`hsla(140,85%,75%,${alpha})`:`hsla(${hue(catOf(b)||"")},90%,86%,${alpha*.9})`;cx.strokeStyle=`rgba(0,0,0,${alpha*.6})`;cx.lineWidth=1;
    cx.fillRect(bx,by,bw,bh);cx.strokeRect(bx+.5,by+.5,bw-1,bh-1);
    cx.translate(cx0,cy0);cx.rotate(Math.atan2(D[1]*sg,D[0]*sg));
    cx.fillStyle=e.port?`hsla(140,85%,75%,${alpha})`:`rgba(255,255,255,${alpha})`;cx.strokeStyle=`rgba(0,0,0,${alpha*.7})`;
    cx.beginPath();cx.moveTo(r,0);cx.lineTo(-r*.5,-r*.9);cx.lineTo(-r*.5,r*.9);cx.closePath();cx.fill();cx.stroke();cx.restore()});
}
function drawBlock(b,alpha,isSel){
  const s=sc(),d=dim(b),x=V.ox+b.x*s,y=V.oy+b.y*s,w=d.w*s,h=d.h*s,cat=catOf(b),df=def(b.cls),m=isM(b);
  cx.fillStyle=cat?fill(cat,alpha*.8):`rgba(120,125,135,${alpha*.8})`;
  cx.fillRect(x,y,w,h);
  drawIcon(df,x,y,w,h,Math.min(1,alpha));
  if(df&&df.directional&&s>=ARROW_MIN_S)arrow(x,y,w,h,b.rot,Math.min(1,alpha));
  cx.lineWidth=1;cx.strokeStyle=cat?`hsla(${hue(cat)},70%,70%,${alpha})`:`rgba(190,195,205,${alpha})`;
  cx.strokeRect(x+.5,y+.5,w-1,h-1);
  if(m&&RCT&&b.h===layer&&outside(b,RCT)){cx.save();cx.setLineDash([5,3]);cx.lineWidth=2;cx.strokeStyle=`hsla(45,95%,62%,${Math.min(1,alpha+.1)})`;cx.strokeRect(x+1,y+1,w-2,h-2);cx.restore()}
  entMark(b,x,y,alpha,s,w,h);
  if(isSel){cx.lineWidth=2.5;cx.strokeStyle="#fff";cx.strokeRect(x+1,y+1,w-2,h-2)}
  if(s>=(m?10:18)&&alpha>.5&&(!m||Math.max(w,h)>=2*s)&&!(df&&df.directional)){
    const t=df?lab(df):shortCls(b.cls),fs=Math.min(12,Math.max(9,s/3));
    cx.save();cx.beginPath();cx.rect(x+2,y+2,w-4,h-4);cx.clip();
    cx.fillStyle="#fff";cx.font=fs+"px system-ui,sans-serif";cx.textBaseline="top";
    cx.shadowColor="rgba(0,0,0,.8)";cx.shadowBlur=3;
    cx.fillText(t,x+4,y+4);
    if(b.rot){cx.fillStyle="rgba(255,255,255,.7)";cx.fillText("r"+b.rot,x+4,y+6+fs)}
    cx.restore();
  }
}
function hatch(x,y,w,h,c){
  cx.save();cx.beginPath();cx.rect(x,y,w,h);cx.clip();
  cx.strokeStyle=c||"rgba(255,255,255,.13)";cx.lineWidth=1;cx.beginPath();
  for(let k=-h;k<w;k+=9){cx.moveTo(x+k,y+h);cx.lineTo(x+k+h,y)}
  cx.stroke();cx.restore();
}
let NBH=true;   // no-build hatch layer on/off (tests)
// grey no-build hatch (same pattern as the red elevator-shaft hatch): faint fill + diagonal lines (+ dashed border when bd)
function nbHatch(x,y,w,h,bd){
  if(!NBH)return;cx.fillStyle="rgba(150,160,175,.07)";cx.fillRect(x,y,w,h);hatch(x,y,w,h,"rgba(170,180,195,.3)");
  if(bd){cx.save();cx.setLineDash([5,3]);cx.lineWidth=1.5;cx.strokeStyle="rgba(170,180,195,.5)";cx.strokeRect(x+.5,y+.5,w-1,h-1);cx.restore()}
}
function note(t,x,y,w,c){
  cx.save();cx.beginPath();cx.rect(x+2,y+2,w-4,40);cx.clip();
  cx.fillStyle=c||"rgba(255,255,255,.75)";cx.font="11px system-ui,sans-serif";cx.textBaseline="top";cx.fillText(t,x+5,y+4);cx.restore();
}
function grid(major){
  const s=sc(),x0=Math.floor(-V.ox/s),x1=Math.ceil((W-V.ox)/s),y0=Math.floor(-V.oy/s),y1=Math.ceil((H-V.oy)/s);
  cx.lineWidth=1;
  const st=i=>i===0?"rgba(120,220,240,.5)":i%major===0?"rgba(140,160,200,.26)":"rgba(140,160,200,.09)";
  if(s>=7){
    for(let i=x0;i<=x1;i++){cx.strokeStyle=st(i);const X=Math.round(V.ox+i*s)+.5;cx.beginPath();cx.moveTo(X,0);cx.lineTo(X,H);cx.stroke()}
    for(let j=y0;j<=y1;j++){cx.strokeStyle=st(j);const Y=Math.round(V.oy+j*s)+.5;cx.beginPath();cx.moveTo(0,Y);cx.lineTo(W,Y);cx.stroke()}
  }else{
    cx.strokeStyle="rgba(120,220,240,.5)";
    cx.beginPath();cx.moveTo(Math.round(V.ox)+.5,0);cx.lineTo(Math.round(V.ox)+.5,H);cx.moveTo(0,Math.round(V.oy)+.5);cx.lineTo(W,Math.round(V.oy)+.5);cx.stroke();
  }
}
function pieces(a,b,cuts){const o=[];let p=a;cuts.slice().sort((u,v)=>u[0]-v[0]).forEach(c=>{if(c[0]>p)o.push([p,c[0]]);p=Math.max(p,c[1])});if(p<b)o.push([p,b]);return o}
// blocks with a real hull (Industrial Dock): ONE roofless plan from the collider/mesh data: hall tint, port pods (green ports + bay numbers, display only), console, one connected wall outline with joined corners
function wallPlan(sh,dock,extra){   // extra: closing wall rects (shipyard open lateral edges), cached per combination   // walls in floor frame: bridge gaps < .5 between rects (flush end caps), add the missing corner squares (outer vertex chamfered)
  extra=extra||[];const ck=extra.join('|');sh._wps=sh._wps||{};if(sh._wps[ck])return sh._wps[ck];
  let w=sh.walls.concat(extra).map(a=>a.slice());const ov=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0),E=.5;
  if(dock){   // dock-only clean-up of the long shaft bars (dock magic numbers: bar >= 15 wide, partition at x 20..24): small end caps merge into one flush, identical end; inner end runs to the partition's inner face (closes the doorway gap)
    const bars=w.filter(a=>a[2]-a[0]>=15),small=a=>a[2]-a[0]<3&&a[3]-a[1]<3,part=Math.min(...w.filter(a=>a[0]>=20&&a[0]<24&&a[3]-a[1]>=8).map(a=>a[0]));
    bars.forEach(b=>w.filter(small).forEach(c=>{if(c[0]>=b[2]-E&&c[0]-b[2]<E&&ov(b[1],b[3],c[1],c[3])>.3)b[2]=Math.max(b[2],c[2])}));
    const endX=Math.max(...bars.map(b=>b[2]));bars.forEach(b=>{b[2]=endX;if(b[0]>part&&b[0]-part<2)b[0]=part});
    w=w.filter(a=>!small(a)||a[0]<endX-3);   // caps are now part of the bars
  }
  for(let i=0;i<w.length;i++)for(let j=0;j<w.length;j++){if(i===j)continue;const A=w[i],B=w[j];
    if(B[0]>A[2]&&B[0]-A[2]<E&&ov(A[1],A[3],B[1],B[3])>.3){A[2]=B[0];if(Math.abs(A[1]-B[1])<.7&&Math.abs(A[3]-B[3])<.7){B[1]=A[1];B[3]=A[3]}}
    else if(B[1]>A[3]&&B[1]-A[3]<E&&ov(A[0],A[2],B[0],B[2])>.3)A[3]=B[1]}
  const corners=[],T=1.5e-3;
  w.forEach(H=>w.forEach(V=>{if(H===V||H[3]-H[1]>=H[2]-H[0]||V[3]-V[1]<=V[2]-V[0])return;
    const left=Math.abs(H[2]-V[0])<T,right=Math.abs(H[0]-V[2])<T,above=Math.abs(H[3]-V[1])<T,below=Math.abs(H[1]-V[3])<T;
    if(!(left||right)||!(above||below))return;
    const tx=left?V[0]:V[2],ty=above?H[3]:H[1],bx=[V[0],H[1],V[2],H[3]];
    corners.push({box:bx,out:[bx[0]+bx[2]-tx,bx[1]+bx[3]-ty]})}));
  if(!dock)w.forEach(H=>w.forEach(V=>{if(H===V||H[3]-H[1]>=H[2]-H[0]||V[3]-V[1]<=V[2]-V[0])return;   // overlapping wall bars (elevator): the missing outer corner square, chamfered like a station corner
    const e=.01;if(Math.min(H[2],V[2])-Math.max(H[0],V[0])<=e||Math.min(H[3],V[3])-Math.max(H[1],V[1])<=e)return;
    const xr=V[0]<H[0]-e?[V[0],H[0],V[0]]:V[2]>H[2]+e?[H[2],V[2],V[2]]:null,yr=H[1]<V[1]-e?[H[1],V[1],H[1]]:H[3]>V[3]+e?[V[3],H[3],H[3]]:null;
    if(xr&&yr)corners.push({box:[xr[0],yr[0],xr[1],yr[1]],out:[xr[2],yr[2]]})}));
  return sh._wps[ck]={w,corners};
}
// interior of a closed wall outline, shape frame: raster (0.1) of the wall union + closing walls + door-gap seals + collinear gap seals (<= 7), flood from outside, the rest = interior as merged rects. Cached per shape.
function interiorRects(sh,dock){
  if(sh._in)return sh._in;const RS=.1,wp=wallPlan(sh,dock,sh.chain?Object.values(sh.chain.closing):[]),S=wp.w.concat(wp.corners.map(c=>c.box));
  (sh.gaps||[]).forEach(g=>S.push(g[0]==="W"||g[0]==="E"?[g[1]-.1,g[2],g[3]+.1,g[4]]:[g[1],g[2]-.1,g[3],g[4]+.1]));   // door gaps: sealed (the opening leads to the neighbour, not into the hatch)
  wp.w.forEach(A=>wp.w.forEach(B=>{if(A===B)return;const hz=A[2]-A[0]>A[3]-A[1]&&B[2]-B[0]>B[3]-B[1],vt=A[3]-A[1]>=A[2]-A[0]&&B[3]-B[1]>=B[2]-B[0];
    if(hz&&Math.abs(A[1]-B[1])<.3&&Math.abs(A[3]-B[3])<.3&&B[0]-A[2]>.05&&B[0]-A[2]<=7)S.push([A[2],A[1],B[0],A[3]]);
    if(vt&&Math.abs(A[0]-B[0])<.3&&Math.abs(A[2]-B[2])<.3&&B[1]-A[3]>.05&&B[1]-A[3]<=7)S.push([A[0],A[3],A[2],B[1]]);
    // parallel bars whose ends line up (channel mouth / shaft end): seal across that end, <= 7 apart
    if(hz&&B[1]-A[3]>.05&&B[1]-A[3]<=7&&Math.min(A[2],B[2])-Math.max(A[0],B[0])>2){if(Math.abs(A[2]-B[2])<.3)S.push([A[2]-.4,A[3],A[2],B[1]]);if(Math.abs(A[0]-B[0])<.3)S.push([A[0],A[3],A[0]+.4,B[1]])}
    if(vt&&B[0]-A[2]>.05&&B[0]-A[2]<=7&&Math.min(A[3],B[3])-Math.max(A[1],B[1])>2){if(Math.abs(A[3]-B[3])<.3)S.push([A[2],A[3]-.4,B[0],A[3]]);if(Math.abs(A[1]-B[1])<.3)S.push([A[2],A[1],B[0],A[1]+.4])}}));
  const x0=Math.min(...S.map(r=>r[0]))-1,y0=Math.min(...S.map(r=>r[1]))-1,nx=Math.ceil((Math.max(...S.map(r=>r[2]))+1-x0)/RS),ny=Math.ceil((Math.max(...S.map(r=>r[3]))+1-y0)/RS),g=new Uint8Array(nx*ny);   // 1 solid, 2 outside
  S.forEach(r=>{for(let j=Math.ceil((r[1]-y0)/RS-.5);j<=Math.floor((r[3]-y0)/RS-.5);j++)for(let i=Math.ceil((r[0]-x0)/RS-.5);i<=Math.floor((r[2]-x0)/RS-.5);i++)if(i>=0&&j>=0&&i<nx&&j<ny)g[j*nx+i]=1});
  const st=[0];g[0]=2;while(st.length){const c=st.pop(),i=c%nx,j=(c-i)/nx;[[1,0],[-1,0],[0,1],[0,-1]].forEach(([a,b])=>{const u=i+a,v=j+b;if(u>=0&&v>=0&&u<nx&&v<ny&&!g[v*nx+u]){g[v*nx+u]=2;st.push(v*nx+u)}})}
  const out=[];let prev=null;
  for(let j=0;j<ny;j++){const runs=[];for(let i=0;i<nx;i++)if(!g[j*nx+i]){let k=i;while(k<nx&&!g[j*nx+k])k++;runs.push([i,k]);i=k}
    const key=runs.join(";");if(prev&&prev.key===key)prev.rows++;else{prev={key,runs,j,rows:1};out.push(prev)}}
  return sh._in=out.flatMap(p=>p.runs.map(([a,b])=>[x0+a*RS,y0+p.j*RS,x0+b*RS,y0+(p.j+p.rows)*RS])).concat(sh.chain?Object.values(sh.chain.closing):[]);   // closing-wall strips count as interior: with an attached neighbour there is no wall there and the hatch runs on, drawn closing walls cover it
}
// grey no-build hatch of a shaped block, clipped to its enclosed interior (Industrial Dock: minus the buildable floor box; Command Module / Blueprint Unit: inside the ring circle)
function hatchShape(b,t,s){
  const sh=t.sh,P=(u,v)=>t.f(u,v).map((n,i)=>i?V.oy+n*s:V.ox+n*s);cx.save();cx.beginPath();
  if(sh.hatch==="ring"){const[a,c]=P(sh.ring.c[0],sh.ring.c[1]);cx.arc(a,c,sh.ring.ri*s,0,2*Math.PI)}
  else interiorRects(sh,SHIPEND(b)).forEach(r=>{const p=P(r[0],r[1]),q=P(r[2],r[3]);cx.rect(Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1]))});
  cx.clip();
  const fr=SHIPEND(b)&&floorRect(b);if(fr){cx.beginPath();cx.rect(0,0,W,H);cx.rect(V.ox+fr.x*s,V.oy+fr.y*s,fr.w*s,fr.h*s);cx.clip("evenodd")}
  nbHatch(0,0,W,H,false);cx.restore();
}
function drawShapeFloor(A,s){
  const X=x=>Math.round(V.ox+x*s),Y=y=>Math.round(V.oy+y*s),ST="rgba(150,165,190,.6)",WF="#262e3c";
  A.floors.forEach(r=>{const b=r.b,t=shapeTf(b);if(!t)return;
    const sh=t.sh,dock=SHIPEND(b),tr=(a,c,e,g)=>{const[p,q]=t.f(a,c),[u,v]=t.f(e,g);return{x:Math.min(p,u),y:Math.min(q,v),w:Math.abs(u-p),h:Math.abs(v-q)}};
    const rc=(q,f,g=0)=>{cx.fillStyle=f;const x0=X(q.x),y0=Y(q.y);cx.fillRect(x0-g,y0-g,X(q.x+q.w)-x0+2*g,Y(q.y+q.h)-y0+2*g)};
    if(dock&&sh.hatch)hatchShape(b,t,s);   // Industrial Dock: grey hatch inside the walls, minus the buildable floor box, behind everything
    const d=def(b.cls),R0=floorRect(b),hall=dock?tr(0,0,Math.min(...sh.walls.filter(w=>w[0]>=20&&w[0]<24&&w[3]-w[1]>=8).map(w=>w[0])),d.fh):R0&&{x:R0.x,y:R0.y,w:R0.w,h:R0.h};   // dock: hall up to the partition (shaft beyond); other blocks: whole floor; no-floor blocks: no tint
    if(hall&&!sh.polys)rc(hall,"rgba(150,190,230,.08)");   // hall interior (floor tint, as the floor itself)
    // pods (dock only): one per decoded port cell (1 cell, contiguous), x extent from the arm mesh rows of that cell
    const pods=!dock?[]:sh.ports.map(([bay,x,y])=>{const rs=sh.arms.filter(a=>(a[1]+a[3])/2>=y-.5&&(a[1]+a[3])/2<y+.5);if(!rs.length)return null;
      return{bay,x,y,q:tr(Math.min(...rs.map(a=>a[0])),y-.46,Math.max(...rs.map(a=>a[2])),y+.46)}}).filter(Boolean);
    const marks=dock?pods:sh.ports.map(([bay,x,y])=>({bay,x,y}));   // port markers: dock = one per pod (numbered); other shapes = one per SHAPES port (unnumbered)
    const props=sh.props.map(a=>tr(...a));
    // ring (Command Module / Blueprint Unit): true annulus with the door opening cut flush at the gap edges (horizontal ends), from the fitted circle radii
    const rg=sh.ring,ringPath=()=>{const[ccx,ccy]=t.f(rg.c[0],rg.c[1]).map((n,i)=>i?V.oy+n*s:V.ox+n*s),base=({E:0,S:1,W:2,N:3})[rg.gap.side]*Math.PI/2+(b.rot&3)*Math.PI/2,ao=Math.asin(rg.gap.half/rg.ro),ai=Math.asin(rg.gap.half/rg.ri);
      cx.beginPath();cx.arc(ccx,ccy,rg.ro*s,base+ao,base-ao+2*Math.PI);cx.arc(ccx,ccy,rg.ri*s,base-ai+2*Math.PI,base+ai,true);cx.closePath()};
    if(rg){ringPath();cx.fillStyle=ST;cx.strokeStyle=ST;cx.lineWidth=2;cx.stroke();cx.fill()}
    props.forEach(q=>rc(q,ST,1));props.forEach(q=>rc(q,"#3b4659"));
    if(rg){ringPath();cx.fillStyle="#3b4659";cx.fill()}
    pods.forEach(p=>rc(p.q,ST,1));pods.forEach(p=>rc(p.q,"#2c3648"));
    // walls: strokes (grown 1px) under all fills = outline of the union only
    const wp=wallPlan(sh,dock,sh.chain?chainOpenEdges(b).map(k=>sh.chain.closing[k]):[]),wr=wp.w.map(a=>tr(...a)),poly=wp.corners.map(c=>{const[x0,y0,x1,y1]=c.box,o=c.out,k=Math.min(x1-x0,y1-y0)*.6;
      return[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].flatMap(v=>{if(v[0]!==o[0]||v[1]!==o[1])return[v];const dx=v[0]===x0?1:-1,dy=v[1]===y0?1:-1;const pr=[[v[0]+dx*k,v[1]],[v[0],v[1]+dy*k]];return dx===dy?pr.reverse():pr}).map(v=>t.f(...v).map((n,i)=>Math.round(i?V.oy+n*s:V.ox+n*s)))});
    const path=pg=>{cx.beginPath();pg.forEach((v,i)=>i?cx.lineTo(v[0],v[1]):cx.moveTo(v[0],v[1]));cx.closePath()};
    wr.forEach(q=>rc(q,ST,1));poly.forEach(pg=>{path(pg);cx.fillStyle=ST;cx.strokeStyle=ST;cx.lineWidth=2;cx.stroke();cx.fill()});
    wr.forEach(q=>rc(q,WF));poly.forEach(pg=>{path(pg);cx.fillStyle=WF;cx.fill()});
    // ports (display only): green bar on each port's edge (dock: pod floor-facing edge), bay number only on numbered ports
    if(s>=6){const Ln=Math.min(.6*s,18),Tk=Math.min(5,Math.max(3,.2*s)),odd=b.rot&1;cx.save();cx.lineWidth=1;cx.strokeStyle="rgba(0,0,0,.75)";
      marks.forEach(p=>{const[ex,ey]=t.f(p.x,p.y).map((n,i)=>i?V.oy+n*s:V.ox+n*s),w=odd?Ln:Tk,h=odd?Tk:Ln;
        cx.fillStyle="hsl(140,70%,48%)";cx.fillRect(ex-w/2,ey-h/2,w,h);cx.strokeRect(ex-w/2+.5,ey-h/2+.5,w-1,h-1)});
      if(s>=10){cx.font="600 "+Math.min(13,Math.max(9,s*.6))+"px system-ui,sans-serif";cx.textAlign="center";cx.textBaseline="middle";cx.fillStyle="rgba(255,255,255,.9)";
        marks.forEach(p=>{if(p.bay==null)return;const[tx,ty]=t.f(p.x+1,p.y).map((n,i)=>i?V.oy+n*s:V.ox+n*s);cx.fillText(String(p.bay),tx,ty)})}
      cx.restore()}
  });
}
function paintFloorBase(s){
  const A=areas(layer),R=(r,f)=>f(V.ox+r.x*s,V.oy+r.y*s,r.w*s,r.h*s),T=.5;
  // gap strips: only between two facing floor blocks; strip = the distance between their SHELLS, long axis = overlap of their shells
  const SH=A.floors.map(r=>{const Q=((def(r.b.cls)||{}).floorInset)||0;return{r,x:r.x-Q,y:r.y-Q,w:r.w+2*Q,h:r.h+2*Q}});
  const own2=new Map();SH.forEach(e=>{const d=fcell(e.r.b);for(let i=0;i<d.cw;i++)for(let j=0;j<d.ch;j++)own2.set((d.cx+i)+","+(d.cy+j),e)});
  cx.fillStyle="rgba(70,80,100,.5)";
  SH.forEach(e=>{const d=fcell(e.r.b),seen=new Set();
    const put=(nb,ax)=>{if(!nb||nb===e||seen.has(nb))return;seen.add(nb);if(!passage(e.r.b,nb.r.b,ax==="x"?0:1))return;   // no door passage (corridor long side, no matching door): no tint between the blocks
      if(ax==="x"){if(nb.x<=e.x+e.w)return;const y0=Math.max(e.y,nb.y),y1=Math.min(e.y+e.h,nb.y+nb.h);if(y1<=y0)return;R({x:e.x+e.w,y:y0,w:nb.x-(e.x+e.w),h:y1-y0},(X,Y,W2,H2)=>cx.fillRect(X,Y,W2,H2))}
      else{if(nb.y<=e.y+e.h)return;const x0=Math.max(e.x,nb.x),x1=Math.min(e.x+e.w,nb.x+nb.w);if(x1<=x0)return;R({x:x0,y:e.y+e.h,w:x1-x0,h:nb.y-(e.y+e.h)},(X,Y,W2,H2)=>cx.fillRect(X,Y,W2,H2))}};
    for(let j=0;j<d.ch;j++)put(own2.get((d.cx+d.cw)+","+(d.cy+j)),"x");
    for(let i=0;i<d.cw;i++)put(own2.get((d.cx+i)+","+(d.cy+d.ch)),"y");
  });
  A.floors.forEach(r=>{
    const T=.5,Q=((def(r.b.cls)||{}).floorInset)||0,sx=r.x-Q,sy=r.y-Q,sw=r.w+2*Q,sn=r.h+2*Q,noShape=!shapeTf(r.b);   // shell = floor + inset ring (elevator 1): same 0.5 wall band as a station
    const x=V.ox+r.x*s,y=V.oy+r.y*s,w=r.w*s,h=r.h*s,c=catOf(r.b),pr=polyRects(r.b);   // pr: real polygon floor (Corner): cut cells stay dark
    if(Q){cx.fillStyle="rgba(150,190,230,.08)";R({x:sx,y:sy,w:sw,h:sn},(X,Y,W2,H2)=>cx.fillRect(X,Y,W2,H2))}   // inset ring inside the shell: floor colour
    cx.fillStyle="rgba(150,190,230,.08)";if(pr)pr.ok.forEach(q=>R(q,(X,Y,W2,H2)=>cx.fillRect(X,Y,W2,H2)));else cx.fillRect(x,y,w,h);
    if(!r.known)hatch(x,y,w,h);
    cx.lineWidth=1;cx.strokeStyle=`hsla(${hue(c)},70%,70%,.5)`;if(!pr)cx.strokeRect(x+.5,y+.5,w-1,h-1);
    // walls: dark band outside the floor edge, gaps at the doors
    cx.fillStyle="#262e3c";cx.strokeStyle="rgba(150,165,190,.6)";cx.lineWidth=1;
    for(let ed=0;ed<4&&noShape;ed++){const v=ed%2===0,a0=(v?sy:sx)-T,a1=(v?sy+sn:sx+sw)+T;
      pieces(a0,a1,r.wcuts[ed]).forEach(([p,q])=>{
        const b=ed===0?{x:sx+sw,y:p,w:T,h:q-p}:ed===2?{x:sx-T,y:p,w:T,h:q-p}:ed===1?{x:p,y:sy+sn,w:q-p,h:T}:{x:p,y:sy-T,w:q-p,h:T};
        R(b,(X,Y,W2,H2)=>{cx.fillRect(X,Y,W2,H2);cx.strokeRect(X+.5,Y+.5,W2-1,H2-1)});
      });
    }
    if(w>70){const d=def(r.b.cls);note(`${lab(d)}  ${r.w}×${r.h}`+(r.known?(r.guess?" · floor !?":""):" · floor unknown !?")+(dv(r.b)?"":" · doors !?"),x,y,w)}
  });
  drawShapeFloor(A,s);
  const NF=S.blocks.filter(b=>b.h===layer&&!isM(b)&&nfRect(b));
  NF.forEach(b=>{const r=nfRect(b);cx.lineWidth=1;cx.strokeStyle=`hsla(${hue(catOf(b)||"")},70%,70%,.3)`;cx.strokeRect(V.ox+r.x*s+.5,V.oy+r.y*s+.5,r.w*s-1,r.h*s-1)});   // faint tile outline: the shape sits inside its block cell
  NF.forEach(b=>{const t=shapeTf(b);if(t&&t.sh.hatch)return hatchShape(b,t,s);const r=nfRect(b);nbHatch(V.ox+r.x*s,V.oy+r.y*s,r.w*s,r.h*s,true)});   // grey no-build hatch on the whole tile, behind the shape
  drawShapeFloor({floors:NF.map(b=>({b}))},s);   // nofloor blocks (solar, turret, drone bay): roofless collider plan, no floor tint
  NF.forEach(b=>{const r=nfRect(b),w=r.w*s;if(w>70)note(`${lab(def(b.cls))}  ${r.w}×${r.h}`,V.ox+r.x*s,V.oy+r.y*s,w)});   // label like floor blocks: name + tile size, top-left
  A.floors.forEach(r=>{const Q=((def(r.b.cls)||{}).floorInset)||0;if(!Q)return;   // elevator: ring cells inside the door slot are open buildable floor
    cx.fillStyle="rgba(150,190,230,.08)";
    for(let ed=0;ed<4;ed++)r.cuts[ed].forEach(([a0,a1])=>{const v=ed%2===0,ring=ed===0?{x:r.x+r.w,y:a0,w:Q,h:a1-a0}:ed===2?{x:r.x-Q,y:a0,w:Q,h:a1-a0}:ed===1?{x:a0,y:r.y+r.h,w:a1-a0,h:Q}:{x:a0,y:r.y-Q,w:a1-a0,h:Q};R(ring,(X,Y,W2,H2)=>cx.fillRect(X,Y,W2,H2))});
  });
  A.blocked.forEach(e=>R(e,(x,y,w,h)=>{
    cx.fillStyle="rgba(255,70,70,.14)";cx.fillRect(x,y,w,h);hatch(x,y,w,h,"rgba(255,110,110,.5)");
    cx.save();cx.setLineDash([5,3]);cx.lineWidth=1.5;cx.strokeStyle="hsl(0,75%,62%)";cx.strokeRect(x+.5,y+.5,w-1,h-1);cx.restore();
    if(w>60)note("Elevator shaft: no build",x,y,w,"hsl(0,80%,78%)");
  }));
  A.doors.forEach(r=>R(r,(x,y,w,h)=>{
    cx.save();
    if(!r.open){cx.fillStyle="rgba(150,60,60,.5)";cx.fillRect(x,y,w,h);cx.strokeStyle="rgba(255,120,120,.9)";cx.lineWidth=1.5;cx.strokeRect(x+.5,y+.5,w-1,h-1)}
    else{cx.fillStyle="rgba(160,170,190,.07)";cx.fillRect(x,y,w,h);cx.strokeStyle="rgba(190,200,220,.5)";cx.lineWidth=1.5;cx.setLineDash([4,3]);cx.strokeRect(x+.5,y+.5,w-1,h-1)}   // an opening: connected or not it looks the same (grey dashed); a door is a Doorway Wall buildable
    cx.restore();
  }));
  return A;
}
let LKC=null,LKP=false;   // links() memo, valid only during one paint (state cannot change mid-paint)
const linksC=L=>{if(!LKP)return links(L);if(!LKC||LKC.L!==L)LKC={L,K:links(L)};return LKC.K};
// underground belt tunnel: thin dashed line (dark halo + light core) entrance centre -> exit centre; the gap cells stay free
function ugLine(a,b,s,over,pv){
  cx.save();cx.lineCap="round";cx.beginPath();cx.moveTo(a[0],a[1]);cx.lineTo(b[0],b[1]);
  cx.strokeStyle="rgba(0,0,0,.55)";cx.lineWidth=Math.max(3,s*.14)+2;cx.stroke();
  cx.setLineDash(pv?[2,Math.max(4,s*.2)]:[Math.max(4,s*.3),Math.max(3,s*.2)]);cx.strokeStyle=over?"hsl(0,85%,65%)":pv?"hsl(215,95%,62%)":"hsl(190,90%,72%)";cx.lineWidth=Math.max(2,s*.1);cx.stroke();
  cx.restore();
}
function drawUG(s){
  if(s<ARROW_MIN_S)return;   // zoomed out: same threshold as the belt arrows
  const c=b=>[V.ox+(b.x+.5)*s,V.oy+(b.y+.5)*s];
  ugPairs(S.blocks.filter(b=>isM(b)&&b.h===layer&&inView(b))).forEach(({u,t,n,max})=>ugLine(c(u),c(t),s,n>max));
}
function paint(){LKP=true;LKC=null;try{paint0()}finally{LKP=false;LKC=null}}
function paint0(){
  cx.setTransform(dpr,0,0,dpr,0,0);cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality="high";cx.clearRect(0,0,W,H);
  const s=sc(),F=view==="F";
  RCT=null;
  if(F&&SM&&SIM&&SIM.sig!==simSig()){simReset();SIM.sig=simSig();smClkUp()}
  if(F)RCT=paintFloorBase(s).rects;
  grid(F?16:8);
  if($("ghost").checked)S.blocks.filter(inView).forEach(b=>{if(b.h!==layer)drawBlock(b,Math.max(.08,.3-.07*Math.abs(b.h-layer)),false)});
  const cur=S.blocks.filter(b=>b.h===layer&&inView(b));
  cur.forEach(b=>{const d=dim(b),x=V.ox+b.x*s,y=V.oy+b.y*s;if(x>W||y>H||x+d.w*s<0||y+d.h*s<0)return;drawBlock(b,.92,sel.has(b.id))});   // viewport cull
  cx.fillStyle="rgba(255,60,60,.5)";
  const occ=new Set();   // overlap marks: cell hash instead of all-pairs (was O(n^2) dim() calls)
  cur.forEach(a=>{const d=dim(a);for(let i=0;i<d.w;i++)for(let j=0;j<d.h;j++){const k=(a.x+i+32768)*65536+(a.y+j+32768);
    if(occ.has(k)){const X=V.ox+(a.x+i)*s,Y=V.oy+(a.y+j)*s;if(X<W&&Y<H&&X+s>0&&Y+s>0)cx.fillRect(X,Y,s,s)}else occ.add(k)}});
  if(F&&smOn())drawSimMach(s);
  if(F&&BN&&!LK)drawBnCells(s);
  if(F&&LK)drawLinks(s);
  if(F&&smOn())drawSimFull(s);
  if(F)drawUG(s);
  if(F&&ugPend&&ugPend.cls&&ugTool(def(ugPend.cls))){   // pending underground: blue dotted line + n / max, red when the second click would be refused
    const g=ugDrag(ugPend),c=b=>[V.ox+(b.x+.5)*s,V.oy+(b.y+.5)*s],a=c(g.a),b=c(g.b),ok=ugOk(g);
    if(g.n>1)ugLine(a,b,s,!ok,true);
    cx.save();cx.fillStyle=ok?"hsl(215,95%,75%)":"hsl(0,85%,70%)";cx.font="bold 12px system-ui,sans-serif";cx.textBaseline="bottom";cx.fillText(`${g.n} / ${def(ugPend.cls).maxApart}${ok?"":" invalid"}`,(a[0]+b[0])/2+6,(a[1]+b[1])/2-6);
    if(g.n>1){const px=V.ox+g.b.x*s,py=V.oy+g.b.y*s;cx.strokeStyle=ok?"hsl(215,95%,62%)":"hsl(0,85%,65%)";cx.setLineDash([3,3]);cx.lineWidth=1.5;cx.strokeRect(px+.5,py+.5,s-1,s-1)}
    cx.restore();
  }
  if(F&&smOn())drawBeltItems(s);
  if(F&&smOn())drawSimRouters(s);
  if(F){drawPorts(s);drawBadges(s)}
  if(F){
    cx.save();cx.setLineDash([5,3]);cx.lineWidth=1.5;cx.strokeStyle="hsl(45,95%,62%)";cx.fillStyle="hsl(45,95%,62%)";cx.font="11px system-ui,sans-serif";cx.textBaseline="bottom";
    ugWarn().forEach((u,id)=>{
      const a=S.blocks.find(b=>b.id===id);if(!a||a.h!==layer)return;
      const ax=V.ox+(a.x+.5)*s,ay=V.oy+(a.y+.5)*s,bx=V.ox+(u.to.x+.5)*s,by=V.oy+(u.to.y+.5)*s;
      cx.beginPath();cx.moveTo(ax,ay);cx.lineTo(bx,by);cx.stroke();
      cx.fillText(`length ${u.n} > max ${u.max}`,(ax+bx)/2+4,(ay+by)/2-3);
    });
    cx.restore();
  }
  if(drag&&drag.k==="box"){
    const r=boxRect();cx.fillStyle="rgba(120,220,240,.12)";cx.strokeStyle="rgba(120,220,240,.9)";cx.lineWidth=1;
    cx.fillRect(r.x,r.y,r.w,r.h);cx.strokeRect(r.x+.5,r.y+.5,r.w,r.h);
  }else if(drag&&drag.k==="belt"){
    const d=def(active);
    beltCells(drag).forEach(c=>{const px=V.ox+c.x*s,py=V.oy+c.y*s;cx.fillStyle=fill(d.category,.5);cx.fillRect(px,py,s,s);drawIcon(d,px,py,s,s,.8);arrow(px,py,s,s,c.rot,.9)});
  }else if(pasting&&!drag&&hoverIn){
    const g=clipT(pasting.rot,pasting.fl).map(b=>({...b,x:b.x+hover.x,y:b.y+hover.y,h:layer}));
    g.forEach(b=>drawBlock(b,.45,false));
    if(noBuild(g.filter(isM).map(mItem))){cx.strokeStyle="hsl(0,85%,60%)";cx.lineWidth=2;g.forEach(b=>{const d=dim(b);cx.strokeRect(V.ox+b.x*s,V.oy+b.y*s,d.w*s,d.h*s)})}
  }else if(active&&!drag&&hoverIn){
    const d=def(active),dd=dimOf(d,placeRot),bw=dd.w,bh=dd.h,px=V.ox+hover.x*s,py=V.oy+hover.y*s;
    cx.fillStyle=fill(d.category,.5);cx.fillRect(px,py,bw*s,bh*s);
    drawIcon(d,px,py,bw*s,bh*s,.8);
    if(d.directional)arrow(px,py,bw*s,bh*s,placeRot,.9);
    cx.strokeStyle=d.kind==="m"&&noBuild([{id:-1,x:hover.x,y:hover.y,w:bw,h:bh,l:layer,belt:isBelt({cls:active})}])?"hsl(0,85%,60%)":d.kind==="m"&&RCT&&!onArea(hover.x,hover.y,bw,bh,RCT)?"hsl(45,95%,62%)":"#fff";
    cx.setLineDash([5,4]);cx.lineWidth=1.5;cx.strokeRect(px+.5,py+.5,bw*s-1,bh*s-1);cx.setLineDash([]);
  }
}
const boxRect=()=>({x:Math.min(drag.sx,drag.px),y:Math.min(drag.sy,drag.py),w:Math.abs(drag.px-drag.sx),h:Math.abs(drag.py-drag.sy)});

