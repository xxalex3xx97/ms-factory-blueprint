// ---- export / import (blocks: GridLocation = cell x CU; machines: GridLocation = floor cells)
const CU=CATALOG.cell_units||2;
const expPorts=(b,e)=>{const ps=portsOf(b),xp=b.xp||[];if(ps.some(p=>!p.en)||xp.length)e.Ports=ps.map(p=>({Face:p.f,Index:p.i,Enabled:p.en})).concat(xp);return e};   // extra non-game field, only when non-default
const impPorts=(b,L)=>{if(!Array.isArray(L))return;const ps=portsOf(b),off=[],xp=[];L.forEach(e=>{const p=e&&ps.find(q=>q.f===e.Face&&q.i===e.Index);if(p){if(e.Enabled===false)off.push(p.key)}else xp.push(e)});if(off.length)b.off=off;if(xp.length)b.xp=xp};
// game-ready SerializedMachineConfig per machine (ConfigHex = exact bytes the game applies; Recipe/Ports/Filters stay for humans). Only when the machine has something to configure.
// Underground: ONE config on the pair's entrance (Length = cells entrance..exit inclusive); the mod's paste tool merges entrance+exit into one game machine. Port array order = portsOf order (UNVERIFIED vs game).
function expCfg(b,d,e,ugn){
  const k=cfgKind(d.id);if(!k)return;
  if(k==="underground"){const n=ugn.get(b.id);if(n){e.Length=n;e.ConfigHex=cfgEnc(k,{length:n})}return}
  const ps=portsOf(b),en=ps.map(p=>p.en),off=!!(b.off&&b.off.length);
  if(k==="recipe"){
    if(!b.rec&&!b.recn&&!off)return;
    if(b.rec&&!RECNAMES[b.rec])e.ConfigUnverified=true;   // recipe not in the game table (js/recnames.js): name is a lowercase output-name guess
    e.ConfigHex=cfgEnc(k,{recipe:b.rec?recName(b.rec):b.recn||"",ports:en});
  }else if(k==="splitter"){
    if(!b.fl&&!b.pr&&!off)return;
    if(b.fl)e.Filters=b.fl;
    const n=b.fl?b.fl.length:3;   // game config: one filter + one port flag per output (3 for a splitter); the last n site ports (UNVERIFIED mapping)
    e.ConfigHex=cfgEnc(k,{filters:b.fl||Array(n).fill(""),prioA:b.pr?b.pr[0]:-1,prioB:b.pr?b.pr[1]:-1,ports:en.slice(-n)});
  }
}
function build(){
  const bl=S.blocks.filter(b=>!isM(b)),ms=S.blocks.filter(isM),UGN=new Map(ugPairs(ms).map(q=>[q.u.id,q.n]));
  let base=Math.max(0,...S.dm.map(m=>Number(m&&m.MachineID)||0),...ms.map(b=>b.mid||0));
  // Version 2 out: inverse of importJson v2 (block 4 units/cell, footprint centre; machine 2 units/floor cell, +W-14, Height*8)
  const RB=b=>{const f=dim(b),sh=SHIPEND(b),ax=sh&&f.w===1&&DIR[b.rot][0]<0?1:0,ay=sh&&f.h===1&&DIR[b.rot][1]<0?1:0;return{X:4*(b.x-ax)+2*(sh?1:f.w-1),Y:4*(b.y-ay)+2*(sh?1:f.h-1)}},RM=b=>{const f=dim(b);return{X:2*b.x+f.w-14,Y:2*b.y+f.h-14}};
  return{Version:2,DisplayName:S.name,
    Blocks:bl.map((b,i)=>expPorts(b,{Class:b.cls,GridLocation:RB(b),Height:b.h,GridRotation:b.rot,BlockID:i+1,PaletteID:b.pid||0})),
    DefaultMachines:ms.map(b=>{const d=def(b.cls),e={Class:d.machineClass||d.id,Transform:{GridLocation:RM(b),Height:b.h*8,GridRotation:b.rot},MachineID:b.mid||++base,PaletteID:b.pid||0,DefaultName:d.id};
      if(b.ct&&b.ct.length)e.Contents=b.ct.map(x=>({Item:x.item,Count:x.n,Infinite:!!x.inf}));
      if(b.rec)e.Recipe=b.rec;expCfg(b,d,e,UGN);return expPorts(b,e)}).concat(S.dm).map((e,i)=>({e,i,k:Number(e&&e.MachineID)})).sort((a,b)=>(isFinite(a.k)&&isFinite(b.k)?a.k-b.k:isFinite(a.k)?-1:isFinite(b.k)?1:0)||a.i-b.i).map(x=>x.e),   // keep original MachineID order
    FactoryLayout:{FloorCellsPerBlock:FC,DoorwayCells:DW,ClosedDoorways:S.closed.map(k=>{const a=k.split("|");return{Height:+a[0],X:+a[1],Y:+a[2],Edge:a[3],Seg:+a[4]}})},
    Catalog:OV};
}
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2400)}
$("exp").onclick=()=>{$("expTa").value=JSON.stringify(build(),null,2);$("dExp").showModal()};
$("expX").onclick=()=>$("dExp").close();
$("expCp").onclick=async()=>{const ta=$("expTa");try{await navigator.clipboard.writeText(ta.value)}catch(e){ta.select();document.execCommand("copy")}toast("Copied")};
$("expDl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([$("expTa").value],{type:"application/json"}));a.download=(S.name.replace(/[^\w.-]+/g,"_")||"blueprint")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
// ---- Main Sequence player stations from a *_S.sav. Literal port of extract/import_station.py (the oracle; keep in sync).
// Returns [{name,objectId,json}] in file order, json = site import format (short machine Class names).
function parseSav(buf){
  const d=new DataView(buf),u8=new Uint8Array(buf),L=u8.length,BAD="Not a Main Sequence _S.sav";
  const SIG="\x02\x00\x00\x00\x12\x00\x00\x00\xff\x01\x00\x00\x00";   // BuildBlueprint struct head, then FString DisplayName
  const I=o=>d.getInt32(o,true);
  const hasAt=(o,s)=>{for(let k=0;k<s.length;k++)if(u8[o+k]!==s.charCodeAt(k))return false;return true};
  const fstr=o=>{if(o<0||o+4>L)return null;const n=I(o);if(n<1||n>400||o+4+n>L||u8[o+3+n]!==0)return null;let s="";for(let k=o+4;k<o+3+n;k++){if(u8[k]<32||u8[k]>126)return null;s+=String.fromCharCode(u8[k])}return[s,o+4+n]};
  const localAt=o=>{const c=I(o);if(c<1||c>255)return null;const cls=[];let q=o+4;for(let k=0;k<c;k++){const r=fstr(q);if(!r||!r[0].startsWith("/Game/"))return null;cls.push(r[0]);q=r[1]}return{cls,end:q}};
  const parseStruct=p=>{
    const nm=fstr(p+13);if(!nm)return null;
    let t=null;
    for(let q=nm[1],lim=Math.min(p+400000,L-8);q<lim&&!t;q++)if(hasAt(q+8,"/Game/"))t=localAt(q);
    if(!t)return null;
    let q=t.end;
    const rec=()=>{const a=[];for(let k=0;k<8;k++)a.push(I(q+4*k));q+=32;return a};
    const cnt=lim=>{const n=I(q);q+=4;if(n<0||n>=lim)throw new Error(BAD);return n};
    const mach=()=>{const a=rec();if(a[7]<0||a[7]>=100000)throw new Error(BAD);let hx="";for(let k=0;k<a[7];k++)hx+=(u8[q+k]<16?"0":"")+u8[q+k].toString(16);q+=a[7];return{cls:a[0],X:a[1],Y:a[2],H:a[3],R:a[4],MID:a[5],PAL:a[6],hx}};
    const block=()=>{const a=rec();if(a[7]<0||a[7]>=64)throw new Error(BAD);const ms=[];for(let k=0;k<a[7];k++)ms.push(mach());return{b:{cls:a[0],X:a[1],Y:a[2],H:a[3],R:a[4],ID:a[5],PAL:a[6]},ms}};
    const blocks=[];
    for(let n=cnt(100000);n>0;n--)blocks.push(block());
    for(let n=cnt(100000);n>0;n--)block();   // connectors: read only to keep offsets
    const machs=[];
    for(let n=cnt(1000000);n>0;n--)machs.push(mach());
    return{name:nm[0],cls:t.cls,blocks,machs};
  };
  const siteJson=A=>{
    const C=A.cls,pth=i=>i>=0&&i<C.length?C[i]:null;
    const blocks=[],machs=A.machs.slice();
    for(const{b,ms}of A.blocks){machs.push(...ms);const p=pth(b.cls);if(p)blocks.push({Class:p,GridLocation:{X:b.X,Y:b.Y},Height:b.H,GridRotation:b.R,BlockID:b.ID,PaletteID:b.PAL})}
    const dm=[];
    for(const m of machs){const p=pth(m.cls);if(p){const c=p.split("/").pop().split(".")[0];dm.push({Class:c,Transform:{GridLocation:{X:m.X,Y:m.Y},Height:m.H,GridRotation:m.R},MachineID:m.MID,PaletteID:m.PAL,...(m.hx?cfgView(c,m.hx):{})})}}
    dm.sort((a,b)=>a.MachineID-b.MachineID);
    return{Version:2,DisplayName:A.name,Blocks:blocks,DefaultMachines:dm};
  };
  if(I(0)!==0||I(4)!==30)throw new Error(BAD);
  let o=12;const top=[];
  for(let n=I(8);n>0;n--){const r=fstr(o);if(!r)throw new Error(BAD);top.push(r[0]);o=r[1]}
  const sidx=top.indexOf("/Game/Blueprints/Stations/BP_StationObject.BP_StationObject_C");
  if(sidx<0)return[];
  const out=[];
  for(let p=o+56;p+13<=L;p++){
    if(u8[p]!==2||!hasAt(p,SIG))continue;
    const h=p-56;if(I(h)!==sidx)continue;   // object header: class idx 56 bytes before SIG, objectId 4 bytes after it
    let A=null;try{A=parseStruct(p)}catch(e){A=null}
    if(A)out.push({name:A.name,objectId:I(h+4),json:siteJson(A)});
  }
  return out;
}
// ConfigHex (game bytes) -> model: recipe (key, or raw game name in recn when unknown), disabled ports (port array order = portsOf order), splitter filters/priorities, underground Length (b.ugl, expanded by importJson)
function impCfg(b,d,m){
  const k=cfgKind(d.id),dc=k&&cfgDec(d.id,m.ConfigHex);
  if(k==="underground"){const l=dc?dc.length:n0(m.Length);if(l>1)b.ugl=l;return}
  if(!dc)return;
  const off=[],ps=portsOf(b),sk=k==="splitter"?Math.max(0,ps.length-(dc.ports||[]).length):0;(dc.ports||[]).forEach((e,i)=>{const q=ps[sk+i];if(e===false&&q&&q.tg)off.push(q.key)});if(off.length)b.off=off;
  if(dc.recipe){const kk=recKeyOf(dc.recipe);if(kk)b.rec=kk;else b.recn=dc.recipe}
  if(dc.filters){if(dc.filters.some(Boolean))b.fl=dc.filters;if(dc.prioA!==-1||dc.prioB!==-1)b.pr=[dc.prioA,dc.prioB]}
}
const n0=v=>Math.round(Number(v))||0;
const bbs=CATALOG.buildables;
function matchM(m){
  const c=m&&m.Class;if(!c)return null;
  const ug=c.replace(/^BPO?_/,"").replace(/Object(?=_|$)/,"");   // game saves name the Mk2/Mk3 undergrounds BP_UndergroundBeltObject_2/_3 (catalog machineClass is the Mk1 name)
  const l=bbs.filter(d=>d.machineClass===c||d.id===c||"BPO_"+d.id.slice(4)===c||d.id===m.DefaultName||(d.category==="Undergrounds"&&"DAT_"+ug===d.id));
  return l.find(d=>d.id===m.DefaultName)||l[0]||null;
}
function importJson(txt,quiet){
  let o;try{o=JSON.parse(txt)}catch(e){toast("Invalid JSON: "+e.message);return false}
  if(!o||!Array.isArray(o.Blocks)){toast('Missing "Blocks" array');return false}
  push();
  S.name=typeof o.DisplayName==="string"?o.DisplayName:"Imported";
  if(o.Catalog&&typeof o.Catalog==="object")for(const c in o.Catalog){OV[c]=Object.assign(OV[c]||{},o.Catalog[c])}
  saveOV();
  let odd=0;
  // Version 2 = game units (extract/import_station.py): block 4 units per cell, GridLocation = footprint centre;
  // machine 2 units per floor cell, GridLocation = footprint centre, Height 8 per layer. Version 1/absent = legacy site units.
  const v2=o.Version===2,MZ=8;
  const n=v=>Math.round(Number(v))||0,hf=v=>{v=Number(v)||0;if(v%CU)odd++;return Math.round(v/CU)};
  const cell=(v,u,c)=>{const k=((Number(v)||0)-c)/u;if(k%1)odd++;return Math.round(k)};   // origin from centre; non-integer rounded + counted
  const rot=v=>((n(v)%4)+4)%4;
  S.blocks=o.Blocks.map(b=>{const r=rot(b.GridRotation),gx=b.GridLocation&&b.GridLocation.X,gy=b.GridLocation&&b.GridLocation.Y,cls=String(b.Class||"");
    if(!v2)return{id:uid++,cls,x:hf(gx),y:hf(gy),h:n(b.Height),rot:r,pid:n(b.PaletteID)};
    const f=dim({cls,rot:r}),sh=SHIPEND({cls}),ax=sh&&f.w===1&&DIR[r][0]<0?1:0,ay=sh&&f.h===1&&DIR[r][1]<0?1:0;   // shipEnd: 2x2 box, drawn row = station side
    return{id:uid++,cls,x:cell(gx,4,sh?2:2*(f.w-1))+ax,y:cell(gy,4,sh?2:2*(f.h-1))+ay,h:n(b.Height),rot:r,pid:n(b.PaletteID)}});
  S.blocks.forEach((b,i)=>impPorts(b,o.Blocks[i].Ports));
  const cd=o.FactoryLayout&&o.FactoryLayout.ClosedDoorways,lg=[];S.closed=[];
  if(Array.isArray(cd))cd.forEach(d=>{if(d&&d.Seg!=null&&"ESWN".includes(d.Edge))S.closed.push(`${n(d.Height)}|${n(d.X)}|${n(d.Y)}|${d.Edge}|${n(d.Seg)}`);else if(d)lg.push(d)});
  // old format (V/H strip, or an edge without Seg): closes every door on that edge
  lg.forEach(d=>{const hh=n(d.Height),lk=`${hh}|${n(d.X)}|${n(d.Y)}|${d.Edge}`;areas(hh).doors.forEach(r=>{if((r.lg===lk||(r.bx===n(d.X)&&r.by===n(d.Y)&&EN[r.ed]===d.Edge))&&!S.closed.includes(r.key))S.closed.push(r.key)})});
  S.dm=[];let nm=0;
  (Array.isArray(o.DefaultMachines)?o.DefaultMachines:[]).forEach(m=>{
    const d=matchM(m),t=m&&m.Transform,g=t&&t.GridLocation;
    if(d&&g){nm++;const mi=n(m.MachineID),b={id:uid++,cls:d.id,x:n(g.X),y:n(g.Y),h:n(t.Height),rot:rot(t.GridRotation),pid:n(m.PaletteID),mid:mi>0?mi:0};
      if(v2){const f=dim(b);b.x=cell(g.X,2,f.w-14);b.y=cell(g.Y,2,f.h-14);b.h=Math.round(n(t.Height)/MZ)}   // floor cell = (raw-W)/2+7 (fit: 2021/2290 on floors, refinery/splitter/assembler/elevator 100%)
      impCfg(b,d,m);impPorts(b,m.Ports);if(typeof m.Recipe==="string"&&m.Recipe){b.rec=m.Recipe;delete b.recn}
      if(Array.isArray(m.Contents))b.ct=m.Contents.filter(x=>x&&typeof x.Item==="string"&&x.Item).map(x=>({item:x.Item,n:Math.max(0,Math.round(Number(x.Count))||0),inf:x.Infinite===true}));
      S.blocks.push(b)}
    else S.dm.push(m);
  });
  // a game underground is ONE machine at the entrance with Length: rebuild the exit tile (same rotation/line) unless a UG is already there or the cell is taken. No Length / no partner = single tile (no partner invented).
  S.blocks.filter(b=>b.ugl).forEach(b=>{
    const ex=b.x+DIR[b.rot][0]*(b.ugl-1),ey=b.y+DIR[b.rot][1]*(b.ugl-1);delete b.ugl;
    if(!S.blocks.some(q=>q.h===b.h&&isM(q)&&q.x===ex&&q.y===ey))S.blocks.push({id:uid++,cls:b.cls,x:ex,y:ey,h:b.h,rot:b.rot,pid:b.pid,mid:0});
  });
  sel=new Set();$("name").value=S.name;all();if(quiet)return true;fit();
  const unk=S.blocks.filter(b=>!BASE[b.cls]).length;
  toast(`Imported ${S.blocks.length-nm} blocks, ${nm} buildables`+(S.dm.length?`, ${S.dm.length} other machines kept`:"")+(unk?`, ${unk} unknown class`:"")+(odd?`; ${odd} odd coordinates rounded`:""));return true;
}
// ---- save to file (File System Access API; Chromium only, others download)
let FH=null;const JT={types:[{description:"JSON",accept:{"application/json":[".json"]}}]};
const dl=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(build(),null,2)],{type:"application/json"}));a.download=(S.name.replace(/[^\w.-]+/g,"_")||"blueprint")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e3)};
async function fSave(as){
  if(!window.showSaveFilePicker){dl();toast("Downloaded (this browser cannot save in place)");return}
  try{
    if(as||!FH)FH=await showSaveFilePicker({...JT,suggestedName:(S.name.replace(/[^\w.-]+/g,"_")||"blueprint")+".json"});
    const w=await FH.createWritable();await w.write(JSON.stringify(build(),null,2));await w.close();toast("Saved "+FH.name);
  }catch(e){if(e.name!=="AbortError")toast("Save failed: "+e.message)}
}
async function fOpen(){
  if(!window.showOpenFilePicker){$("imp").click();return}
  try{const [h]=await showOpenFilePicker(JT);const t=await (await h.getFile()).text();if(importJson(t))FH=h}catch(e){if(e.name!=="AbortError")toast("Open failed: "+e.message)}
}
document.querySelectorAll("header .mn").forEach(mn=>{const mb=mn.firstElementChild,ml=mn.querySelector(".mnl"),mu=ml.getAttribute("role")==="menu",it=()=>[...ml.querySelectorAll("button")];
const cl=f=>{ml.hidden=true;mb.setAttribute("aria-expanded","false");if(f)mb.focus()};
const pl=()=>{if(ml.hidden||getComputedStyle(ml).position!=="fixed")return;const r=mb.getBoundingClientRect(),t=r.bottom+2;ml.style.top=t+"px";ml.style.maxHeight=Math.max(80,innerHeight-t-4)+"px";ml.style.left="4px";ml.style.left=Math.max(4,Math.min(r.left,innerWidth-ml.offsetWidth-4))+"px"};new ResizeObserver(pl).observe(ml);
const op=()=>{document.querySelectorAll("header .mnl").forEach(l=>{if(l!==ml)l.hidden=true});ml.style.left="0";ml.hidden=false;pl();mb.setAttribute("aria-expanded","true")};
mb.onclick=()=>ml.hidden?op():cl();
if(mu){mb.onkeydown=e=>{if(e.key==="ArrowDown"){e.preventDefault();if(ml.hidden)op();it()[0].focus()}};
ml.onclick=()=>cl();
ml.onkeydown=e=>{const a=it(),i=a.indexOf(document.activeElement);if(e.key==="ArrowDown"){e.preventDefault();a[(i+1)%a.length].focus()}else if(e.key==="ArrowUp"){e.preventDefault();a[(i+a.length-1)%a.length].focus()}else if(e.key==="Tab")cl()}}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!ml.hidden){e.stopPropagation();cl(true)}},true);
document.addEventListener("pointerdown",e=>{if(!ml.hidden&&!mn.contains(e.target))cl()},true);addEventListener("resize",()=>cl())});
{const fl=$("fileL"),ids=["fit","fSave","exp","help"].map(i=>{const e=$(i),m=document.createComment(i);e.before(m);return [e,m]}),mq=matchMedia("(max-width:1100px)");
const mv=()=>ids.forEach(([e,m])=>mq.matches?fl.append(e):m.after(e));mq.addEventListener("change",mv);mv()}
$("fSave").onclick=()=>fSave(false);$("fSaveAs").onclick=()=>fSave(true);$("fOpen").onclick=fOpen;
let SAVST=null;   // stations parsed from a chosen *_S.sav, waiting for the user's pick
$("imp").onclick=()=>{$("impTa").value="";$("impFile").value="";SAVST=null;$("impSt").hidden=true;$("dImp").showModal()};
$("impX").onclick=()=>$("dImp").close();
$("impTa").oninput=()=>{SAVST=null;$("impSt").hidden=true};
$("impFile").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  if(!/\.sav$/i.test(f.name)){SAVST=null;$("impSt").hidden=true;$("impTa").value=await f.text();return}
  try{
    const l=parseSav(await f.arrayBuffer());
    if(!l.length){SAVST=null;$("impSt").hidden=true;toast("No player stations found in this save");return}
    if(l.length===1){SAVST=null;if(importJson(JSON.stringify(l[0].json)))$("dImp").close();return}
    SAVST=l;$("impSt").replaceChildren(...l.map((s,i)=>new Option(`${s.name} (${s.json.Blocks.length} blocks, ${s.json.DefaultMachines.length} machines)`,String(i))));
    $("impSt").hidden=false;toast("Choose a station, then Import");
  }catch(err){SAVST=null;$("impSt").hidden=true;toast("Save read failed: "+err.message)}
};
$("impGo").onclick=()=>{
  if(SAVST){if(importJson(JSON.stringify(SAVST[+$("impSt").value].json)))$("dImp").close();return}
  if(importJson($("impTa").value))$("dImp").close();
};
let nameBefore=S.name;
$("name").onfocus=()=>{nameBefore=S.name};
$("name").oninput=e=>{S.name=e.target.value;ASH=false;asv()};
$("name").onchange=()=>{if(S.name!==nameBefore){const o=JSON.parse(snap());o.n=nameBefore;undoS.push(JSON.stringify(o));redoS=[];all()}nameBefore=S.name};

