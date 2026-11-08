// ---- interaction
let drag=null,space=false,hoverIn=false;
// underground = click, click: 1st click places the entrance and starts ugPend {id,cls,c0,cur}; a line (n / max) follows the mouse on the 4 axes; 2nd click places the exit if valid; Esc / right click removes the entrance
let ugPend=null;
const ugOk=g=>{const d=def(ugPend.cls);if(g.n<2)return false;const q={id:-1,cls:ugPend.cls,x:g.b.x,y:g.b.y,h:layer,rot:g.rot,pid:0};
  return !S.blocks.some(o=>o.h===layer&&isM(o)&&o.x===q.x&&o.y===q.y)&&!noBuild([mItem(q)])};
function ugCancel(){if(!ugPend)return false;const i=ugPend.id;ugPend=null;if(S.blocks.some(b=>b.id===i)){S.blocks=S.blocks.filter(b=>b.id!==i);sel=new Set();undoS.pop();all()}return true}
const pt=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const hit=c=>{const l=S.blocks.filter(b=>b.h===layer&&inView(b));for(let i=l.length-1;i>=0;i--){const b=l[i],d=dim(b);if(c.x>=b.x&&c.x<b.x+d.w&&c.y>=b.y&&c.y<b.y+d.h)return b}return null};
const doorAt=c=>areas(layer).doors.find(r=>c.x>=r.x&&c.x<r.x+r.w&&c.y>=r.y&&c.y<r.y+r.h);
cv.addEventListener("contextmenu",e=>e.preventDefault());
cv.addEventListener("pointerdown",e=>{
  cv.focus();const p=pt(e);try{cv.setPointerCapture(e.pointerId)}catch(_){}
  if(e.button===1||e.button===2||(e.button===0&&space)){const uc=e.button===2&&ugCancel();drag={k:"pan",px:p.x,py:p.y,d:0,rc:e.button===2&&!uc};cv.style.cursor="grabbing";return}
  if(e.button!==0)return;
  const c=toCell(p.x,p.y);
  if(pasting){hover=c;pasteAt();return}
  if(active){
    if(view==="F"&&runTool(def(active))){drag={k:"belt",c0:c,cur:c,tr:[c]};draw();return}
    if(ugPend&&(active!==ugPend.cls||view!=="F"||!S.blocks.some(b=>b.id===ugPend.id)))ugPend=null;
    if(view==="F"&&ugTool(def(active))){
      if(ugPend){   // 2nd click: exit only when the line is valid, else nothing
        const g=ugDrag(ugPend),en=S.blocks.find(b=>b.id===ugPend.id);
        if(ugOk(g)){const x={id:uid++,cls:active,x:g.b.x,y:g.b.y,h:layer,rot:g.rot,pid:0};en.rot=g.rot;S.blocks.push(x);sel=new Set([en.id,x.id]);placeRot=g.rot;ugPend=null;all()}
        return;
      }
      const b={id:uid++,cls:active,x:c.x,y:c.y,h:layer,rot:placeRot,pid:0};
      if(noBuild([mItem(b)])){toast(NOBUILD);return}
      push();cutBelts([b]);S.blocks.push(b);sel=new Set([b.id]);ugPend={id:b.id,cls:active,c0:c,cur:c};all();return}
    const b={id:uid++,cls:active,x:c.x,y:c.y,h:layer,rot:placeRot,pid:0};if(isM(b)&&noBuild([mItem(b)])){toast(NOBUILD);return}push();if(isBelt(b))cutBelts([b]);S.blocks.push(b);sel=new Set([b.id]);all();return}
  if(view==="F"){const q=portAt(p);if(q){push();togglePort(q.b,q.p.key);all();return}}
  const b=hit(c);
  if(b){
    if(e.shiftKey){sel.has(b.id)?sel.delete(b.id):sel.add(b.id)}
    else if(!sel.has(b.id))sel=new Set([b.id]);
    drag={k:"move",dx:0,dy:0,c0:c,orig:new Map(S.blocks.filter(q=>sel.has(q.id)).map(q=>[q.id,{x:q.x,y:q.y}])),moved:false,cr:view==="L"?carryOf(S.blocks.filter(q=>sel.has(q.id)&&!isM(q))):null};
    panel();draw();
  }else{
    drag={k:"box",sx:p.x,sy:p.y,px:p.x,py:p.y,add:e.shiftKey,base:new Set(sel)};
    if(!e.shiftKey)sel=new Set();
    panel();draw();
  }
});
const PORTLINK="Port link (informational): an enabled machine port faces a belt cell. Input/output direction is unknown, so this link is undirected.";
// belt hover tooltip: load of ANY belt cell (live sim value when simLive(), else static estimate); port-link text only as a secondary line
function btip(b,pl,ev,w){
  let t=$("btip");if(!t){t=document.createElement("div");t.id="btip";document.body.appendChild(t)}
  if(!b){t.style.display="none";t.textContent="";return}
  const e=bnK().load.get(b.id),cap=beltMax(b),r=v=>Math.round(v*100)/100,nm=id=>esc((ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,""));
  const its=e?[...e.items].map(([id,v])=>`<span class="it">${iurl(id)?`<img class="ic" alt="" src="${iurl(id)}">`:""}${nm(id)} ${r(v)}/min</span>`).join(""):"";
  t.innerHTML=(its?`<div>${its}</div>`:"")+`<div>${e&&e.util!=null?`Load ${Math.round(e.util*100)}% (${r(e.tot)}/min of ${e.cap}/min)${e.mixed?"; mixed items":""}`:`Load none (0/min${cap?" of "+cap+"/min":""})`}${simLive()?" &middot; live avg 30 s &middot; "+(smS().steady?"steady":"settling"):" &middot; estimate"}</div>`+(pl?`<div class="sub">${PORTLINK}</div>`:"")+(w?`<div class="warnline">${esc(WARN)}</div>`:"");
  cv.title="";if(ev){const R=cv.getBoundingClientRect();t.style.left=Math.min(innerWidth-300,ev.clientX+14)+"px";t.style.top=(ev.clientY+16)+"px"}t.style.display="block";
}
cv.addEventListener("pointermove",e=>{
  const p=pt(e),c=toCell(p.x,p.y);hover=c;hoverIn=true;if(ugPend){ugPend.cur=c;const en=S.blocks.find(b=>b.id===ugPend.id),g=ugDrag(ugPend);if(en&&g.n>1)en.rot=g.rot}
  $("read").textContent=view==="F"?`floor x ${c.x}  y ${c.y}  block ${Math.floor(c.x/FC)},${Math.floor(c.y/FC)}  h ${layer}  zoom ${Math.round(V.z*100)}%`:`x ${c.x}  y ${c.y}  h ${layer}  zoom ${Math.round(V.z*100)}%`;
  if(!drag){
    let w=false;
    if(view==="F"){
      const R=areas(layer).rects;
      if(active){const d=def(active);if(d.kind==="m"){const dd=dimOf(d,placeRot);w=!onArea(c.x,c.y,dd.w,dd.h,R)}}
      else{const b=hit(c);w=!!(b&&outside(b,R))}
    }
    cv.title=w?WARN:"";
    if(view==="F"&&!active&&!hit(c)){const dr=doorAt(c);if(dr)cv.title=`Door (${dr.ver&&dr.paired?"verified position":"position not confirmed"}${dr.paired?"":", leads outside, nothing buildable beyond"}): ${dr.open?"open":"closed"}. `}
    {const b=view==="F"&&!active?hit(c):null,belt=b&&isBelt(b),pl=b&&LK&&(links(layer).nb.get(b.id)||[]).some(e=>e.k==="port");
      if(belt)btip(b,pl,e,w);else{btip(null);if(pl&&!w)cv.title=PORTLINK}}
    if(view==="F"&&!active){const q=portAt(p);if(q){btip(null);cv.title=`Port ${q.p.key} (faces ${FN[q.p.wf]}): ${q.p.en?"enabled":"disabled"}. Click to toggle.`}}
  }
  if(drag){
    if(drag.k==="pan"){drag.d+=Math.abs(p.x-drag.px)+Math.abs(p.y-drag.py);V.ox+=p.x-drag.px;V.oy+=p.y-drag.py;drag.px=p.x;drag.py=p.y}
    else if(drag.k==="belt"){drag.cur=c;beltStep(drag,c)}
    else if(drag.k==="move"){
      const dx=c.x-drag.c0.x,dy=c.y-drag.c0.y;
      if(!drag.moved&&(dx||dy)){push();drag.moved=true}
      if(drag.moved){const mv=(a,b)=>{S.blocks.forEach(q=>{const o=drag.orig.get(q.id);if(o){q.x=o.x+a;q.y=o.y+b}});if(drag.cr)drag.cr(a,b)};
        mv(dx,dy);if(noBuild(S.blocks.filter(q=>sel.has(q.id)&&isM(q)).map(mItem))){mv(drag.dx,drag.dy);toast(NOBUILD)}else{drag.dx=dx;drag.dy=dy}}
    }else{
      drag.px=p.x;drag.py=p.y;
      const r=boxRect(),a=toCell(r.x,r.y),z=toCell(r.x+r.w,r.y+r.h);
      sel=new Set(drag.add?drag.base:[]);
      S.blocks.forEach(b=>{if(b.h!==layer||!inView(b))return;const d=dim(b);if(b.x<=z.x&&b.x+d.w-1>=a.x&&b.y<=z.y&&b.y+d.h-1>=a.y)sel.add(b.id)});
    }
  }
  draw();
});
cv.addEventListener("pointerleave",()=>{hoverIn=false;btip(null);draw()});
const end=e=>{
  if(!drag)return;const k=drag.k,rc=k==="pan"&&drag.rc&&drag.d<4&&e.type==="pointerup"?pt(e):null;
  if(k==="belt"){
    const cells=beltCells(drag);
    const nb=cells.map(c=>({id:uid++,cls:active,x:c.x,y:c.y,h:layer,rot:c.rot,pid:0}));
    if(noBuild(nb.map(mItem)))toast(NOBUILD);
    else{push();cutBelts(nb);S.blocks.push(...nb);sel=new Set(nb.map(b=>b.id));placeRot=cells[0].rot}
  }
  drag=null;cv.style.cursor=space?"grab":"";
  if(rc){if(pasting){pasting=null;all();return}const b=hit(toCell(rc.x,rc.y));if(b){sel=new Set([b.id]);del();return}if(active){active=null;all();return}}
  if(k!=="pan")all();else draw();
};
cv.addEventListener("pointerup",end);cv.addEventListener("pointercancel",end);
cv.addEventListener("wheel",e=>{
  e.preventDefault();const p=pt(e),z0=V.z,z=Math.min(6,Math.max(.1,z0*(e.deltaY<0?1.12:1/1.12)));
  V.ox=p.x-(p.x-V.ox)*(z/z0);V.oy=p.y-(p.y-V.oy)*(z/z0);V.z=z;draw();
},{passive:false});
cv.addEventListener("dblclick",e=>{
  if(view!=="L"||active)return;
  const p=pt(e),b=hit(toCell(p.x,p.y));if(!b)return;
  layer=b.h;setView("F");
  const r=floorRect(b)||{x:b.x*FC,y:b.y*FC,w:FC,h:FC};
  frame(r.x,r.y,r.x+r.w,r.y+r.h);
});

function setLayer(n){layer=n;sel=new Set([...sel].filter(i=>S.blocks.find(b=>b.id===i&&b.h===n)));all()}
$("lay").onchange=e=>{const v=parseInt(e.target.value,10);if(isFinite(v)&&v-1!==layer)setLayer(v-1);else e.target.value=layer+1};$("lUp").onclick=()=>setLayer(layer+1);$("lDn").onclick=()=>setLayer(layer-1);
$("ghost").onchange=draw;
function setView(v){
  if(v===view)return;
  smStop();pasting=null;view=v;V=v==="F"?VF:VL;tab=v==="F"?"m":"b";active=null;sel=new Set();drag=null;
  if(v==="F"&&!VF.init){VF.init=true;fit()}
  all();
}
const RM=matchMedia("(prefers-reduced-motion:reduce)");
const toF=()=>{if(view!=="F")setView("F")};
$("lk").onclick=()=>{toF();LK=!LK;$("lk").classList.toggle("on",LK);$("lk").setAttribute("aria-pressed",LK);draw()};
$("bn").onclick=()=>{toF();BN=!BN;$("bn").classList.toggle("on",BN);$("bn").setAttribute("aria-pressed",BN);bnSub();draw()};
function bnSub(){$("bnF").disabled=$("bnB").disabled=!BN;$("bnF").setAttribute("aria-pressed",BM==="F");$("bnB").setAttribute("aria-pressed",BM==="B")}
$("bnF").onclick=$("bnB").onclick=e=>{toF();BM=e.currentTarget.id==="bnF"?"F":"B";$("bnF").classList.toggle("on",BM==="F");$("bnB").classList.toggle("on",BM==="B");bnSub();draw()};bnSub();
$("vwL").onclick=()=>setView("L");$("vwF").onclick=()=>setView("F");
function rotate(){
  if(pasting){pasting.rot=(pasting.rot+1)&3;all();return}
  if(active&&!sel.size){placeRot=(placeRot+1)&3;all();return}
  if(!sel.size)return;
  if(noBuild(S.blocks.filter(b=>sel.has(b.id)&&isM(b)).map(b=>mItem({...b,rot:(b.rot+1)&3})))){toast(NOBUILD);return}
  push();S.blocks.forEach(b=>{if(sel.has(b.id))b.rot=(b.rot+1)&3});all();
}
$("undo").onclick=undo;$("redo").onclick=redo;
function del(){if(!sel.size)return;push();S.blocks=S.blocks.filter(b=>!sel.has(b.id));sel=new Set();all()}
// Layout move carries the floor machines inside each block's footprint, plus closed doorways of that block. Call BEFORE mutating blocks; returns (dx,dy,dh) applied relative to the originals (idempotent).
function carryOf(bs){
  const o=bs.map(b=>({h:b.h,x:b.x,y:b.y})),cl=S.closed.slice(),s=new Set();
  bs.forEach(b=>{const d=dim(b);S.blocks.forEach(q=>{if(isM(q)&&q.h===b.h&&q.x>=b.x*FC&&q.x<(b.x+d.w)*FC&&q.y>=b.y*FC&&q.y<(b.y+d.h)*FC)s.add(q)})});
  const fl=[...s].map(q=>({q,x:q.x,y:q.y,h:q.h}));
  return(dx,dy,dh=0)=>{
    fl.forEach(f=>{f.q.x=f.x+dx*FC;f.q.y=f.y+dy*FC;f.q.h=f.h+dh});
    S.closed=cl.map(k=>{const a=k.split("|"),m=o.find(p=>p.h===+a[0]&&p.x===+a[1]&&p.y===+a[2]);if(m){a[0]=m.h+dh;a[1]=m.x+dx;a[2]=m.y+dy}return a.join("|")});
  };
}
function copy(){if(!sel.size)return;clip=S.blocks.filter(b=>sel.has(b.id)).map(b=>({...b,raw:null}));if(clip.length){toast(clip.length+" copied");paste()}}
// horizontal mirror of a machine: pick the rotation whose port layout is the mirror image (same face/pos/direction), remap disabled ports; null = cannot mirror
function mirM(b){
  const d=def(b.cls);if(!d||!d.portsLayout||d.elevator)return null;
  const T=(rot,off)=>({...b,x:0,y:0,rot,off:off||[]}),dm=dim(b),P0=portsOf(T(b.rot&3));
  for(const r2 of [b.rot&3,(b.rot+2)&3]){
    const P=portsOf(T(r2)),map=new Map();
    for(const p of P0){const j=P.find(q=>q.x===dm.w-1-p.x&&q.y===p.y&&q.nx===-p.nx&&q.ny===p.ny&&q.dir===p.dir);if(!j)break;map.set(p.key,j.key)}
    if(map.size===P0.length)return{rot:r2,off:(b.off||[]).map(k=>map.get(k)||k)};
  }
  return null;
}
function clipT(n,fl){   // clip mirrored (fl) then rotated n x 90deg clockwise, origin at 0,0
  let l=clip.map(b=>({...b,raw:null}));   // clones never carry the imported raw coords
  if(fl){const mx=Math.min(...l.map(b=>b.x)),W=Math.max(...l.map(b=>b.x-mx+dim(b).w));
    l=l.map(b=>{const m=mirM(b);return{...b,x:mx+W-(b.x-mx)-dim(b).w,...(m||((def(b.cls)||{}).portsLayout?{}:{rot:b.rot===0?2:b.rot===2?0:b.rot}))}})}
  for(let k=0;k<n;k++){
    const mx=Math.min(...l.map(b=>b.x)),my=Math.min(...l.map(b=>b.y)),H=Math.max(...l.map(b=>b.y-my+dim(b).h));
    l=l.map(b=>{const d=dim(b);return{...b,x:H-(b.y-my)-d.h,y:b.x-mx,rot:((b.rot||0)+1)&3}});
  }
  const mx=Math.min(...l.map(b=>b.x)),my=Math.min(...l.map(b=>b.y)),mh=Math.min(...l.map(b=>b.h));
  return l.map(b=>({...b,x:b.x-mx,y:b.y-my,h:b.h-mh}));
}
function paste(){
  if(!clip.length||isM(clip[0])!==(view==="F"))return;
  active=null;sel=new Set();pasting={rot:0,fl:false};toast("Click to place, R rotates, V flips, Esc cancels");all();
}
function pasteAt(){
  const nb=clipT(pasting.rot,pasting.fl).map(b=>({...b,id:uid++,mid:0,x:b.x+hover.x,y:b.y+hover.y,h:b.h+layer}));
  if(noBuild(nb.filter(isM).map(mItem))){toast(NOBUILD);return}
  push();cutBelts(nb.filter(isBelt));S.blocks.push(...nb);sel=new Set(nb.map(b=>b.id));pasting=null;all();
}
