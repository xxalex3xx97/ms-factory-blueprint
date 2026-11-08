// ---- export / import (blocks: GridLocation = cell x CU; machines: GridLocation = floor cells)
const CU=CATALOG.cell_units||2;
const expPorts=(b,e)=>{const ps=portsOf(b),xp=b.xp||[];if(ps.some(p=>!p.en)||xp.length)e.Ports=ps.map(p=>({Face:p.f,Index:p.i,Enabled:p.en})).concat(xp);return e};   // extra non-game field, only when non-default
// game splitter config bytes = [front, right, left] at rot 0, as local faces (port identity is fixed in the machine, so rotation needs no mapping). The back/input face (W at rot 0) is never a game byte.
const SPL_FACES=["E","S","N"];
let spFix=0;   // splitter input-face "off" entries in an import, forced on (counted for the import message)
const impPorts=(b,L)=>{if(!Array.isArray(L))return;const ps=portsOf(b),off=[],xp=[];L.forEach(e=>{const p=e&&ps.find(q=>q.f===e.Face&&q.i===e.Index);if(p){if(e.Enabled===false){if(p.tg)off.push(p.key);else if(p.dir==="in"&&isSplitterCls(b.cls))spFix++}}else xp.push(e)});if(off.length)b.off=off;if(xp.length)b.xp=xp};
// game-ready SerializedMachineConfig per machine (ConfigHex = exact bytes the game applies; Recipe/Ports/Filters stay for humans). Only when the machine has something to configure.
// Underground: ONE config on the pair's entrance (Length = cells entrance..exit inclusive); the mod's paste tool merges entrance+exit into one game machine. Recipe ports: game port order (config.js gamePortMap; verified Refinery/Assembler, others rule-derived -> PortOrderUnverified).
// Contents (containers only): totals per item, duplicates summed, Count >= 1, empty = field omitted. Infinite sources are site/simulation only: written under SiteOnly.Infinite (the mod's parser ignores SiteOnly), never in Contents.
function expCt(b,e){if(!isStore(b)||!b.ct)return;const m=new Map(),inf=new Map();
  b.ct.forEach(x=>{if(!x.item)return;const n=Math.max(0,Math.round(Number(x.n))||0);
    if(x.inf){const r=inf.get(x.item)||{Item:x.item,Count:0};r.Count+=n;inf.set(x.item,r);return}
    if(n<1)return;const r=m.get(x.item)||{Item:x.item,Count:0,Infinite:false};r.Count+=n;m.set(x.item,r)});
  if(m.size)e.Contents=[...m.values()];if(inf.size)e.SiteOnly={Infinite:[...inf.values()]}}
function expCfg(b,d,e,ugn){
  cfgModel(b,d,e,ugn);
  if(b.cfgKeep&&b.cfgKeep.sig===cfgSig(b)&&cfgKind(d.id)!=="underground")e.ConfigHex=b.cfgKeep.hex;   // imported bytes kept bit-for-bit while recipe/ports/filters are unchanged
}
function cfgModel(b,d,e,ugn){
  const k=cfgKind(d.id);if(!k)return;
  if(k==="underground"){const n=ugn.get(b.id);if(n){e.Length=n;e.ConfigHex=cfgEnc(k,{length:n})}return}
  const ps=portsOf(b),en=ps.map(p=>p.en),off=!!(b.off&&b.off.length);
  if(k==="recipe"){
    if(!b.rec&&!b.recn&&!off)return;
    if(b.rec&&!RECNAMES[b.rec])e.ConfigUnverified=true;   // recipe not in the game table (js/recnames.js): name is a lowercase output-name guess
    const gf=gameFlags(b);
    if(gf&&!PORT_ORDER[b.cls].verified){poWarn(b.cls);e.PortOrderUnverified=true}
    e.ConfigHex=cfgEnc(k,{recipe:b.rec?recName(b.rec):b.recn||"",ports:gf||en});
  }else if(k==="splitter"){
    if(!b.fl&&!b.pr&&!off)return;
    if(b.fl)e.Filters=b.fl;
    const n=b.fl?b.fl.length:3;   // game config: one filter + one port flag per output (3 for a splitter); the last n site ports (UNVERIFIED mapping)
    e.ConfigHex=cfgEnc(k,{filters:b.fl||Array(n).fill(""),prioA:b.pr?b.pr[0]:-1,prioB:b.pr?b.pr[1]:-1,ports:isSplitterCls(b.cls)?SPL_FACES.map(f=>{const q=ps.find(q=>q.f===f);return!q||q.en}):en.slice(-n)});
  }
}
function build(){
  const bl=S.blocks.filter(b=>!isM(b)),ms=S.blocks.filter(isM),UGN=new Map(ugPairs(ms).map(q=>[q.u.id,q.n]));
  let base=Math.max(0,...S.dm.map(m=>Number(m&&m.MachineID)||0),...ms.map(b=>b.mid||0));
  // Version 2 out: inverse of importJson v2 (block 4 units/cell, footprint centre; machine 2 units/floor cell, +W-14, Height 16 per level)
  const RB=b=>{if(b.raw&&b.raw.x===b.x&&b.raw.y===b.y&&b.raw.r===b.rot)return{X:b.raw.X,Y:b.raw.Y};   // game coords that the site footprint cannot express: written back untouched until moved/rotated
    const f=dim(b),sh=SHIPEND(b),ax=sh&&f.w===1&&DIR[b.rot][0]<0?1:0,ay=sh&&f.h===1&&DIR[b.rot][1]<0?1:0;return{X:4*(b.x-ax)+2*(sh?1:f.w-1),Y:4*(b.y-ay)+2*(sh?1:f.h-1)}},RM=b=>{const f=dim(b);return{X:2*b.x+f.w-14,Y:2*b.y+f.h-14}};
  return{Version:2,DisplayName:S.name,
    Blocks:bl.map((b,i)=>expPorts(b,{Class:b.cls,GridLocation:RB(b),Height:b.h*2,GridRotation:b.rot,BlockID:i+1,PaletteID:b.pid||0})),
    DefaultMachines:ms.map(b=>{const d=def(b.cls),e={Class:d.machineClass||d.id,Transform:{GridLocation:RM(b),Height:b.h*16,GridRotation:b.rot},MachineID:b.mid||++base,PaletteID:b.pid||0,DefaultName:d.id};
      if(b.rec)e.Recipe=b.rec;expCfg(b,d,e,UGN);expPorts(b,e);expCt(b,e);return e}).concat(S.dm).map((e,i)=>({e,i,k:Number(e&&e.MachineID)})).sort((a,b)=>(isFinite(a.k)&&isFinite(b.k)?a.k-b.k:isFinite(a.k)?-1:isFinite(b.k)?1:0)||a.i-b.i).map(x=>x.e),   // keep original MachineID order
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
// mod-built exit records: same Length, sitting on entrance + (Length-1) cells (raw units, 2 per cell). Mirror of ug_exit_dupes (import_station.py).
function ugDupes(machs,UG){
  const at=new Map(),dup=new Set();
  for(const m of machs)if(UG[m.MID]!==undefined){const k=m.X+","+m.Y;(at.get(k)||at.set(k,[]).get(k)).push(m.MID)}
  for(const m of machs){const Lr=UG[m.MID];if(Lr===undefined||dup.has(m.MID))continue;
    const r=((m.R%4)+4)%4,k=(m.X+2*(Lr-1)*DIR[r][0])+","+(m.Y+2*(Lr-1)*DIR[r][1]);
    for(const i of at.get(k)||[])if(UG[i]===Lr&&i!==m.MID)dup.add(i)}
  return dup;
}
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
    const dm=[],dup=ugDupes(machs,UG);
    for(const m of machs){const p=pth(m.cls);if(p){const c=p.split("/").pop().split(".")[0],e={Class:c,Transform:{GridLocation:{X:m.X,Y:m.Y},Height:m.H,GridRotation:m.R},MachineID:m.MID,PaletteID:m.PAL,...(m.hx?cfgView(c,m.hx):{})};
      if(dup.has(m.MID)){delete e.ConfigHex;delete e.Length}   // mod-built exit record: a tile, not a second tunnel
      else if(UG[m.MID]!==undefined)e.Length=UG[m.MID];      // world record wins (config is empty unless reconfigured)
      if(CT[m.MID])e.Contents=CT[m.MID];
      dm.push(e)}}
    dm.sort((a,b)=>a.MachineID-b.MachineID);
    return{Version:2,DisplayName:A.name,Blocks:blocks,DefaultMachines:dm};
  };
  if(I(0)!==0||I(4)!==30)throw new Error(BAD);
  let o=12;const top=[];
  for(let n=I(8);n>0;n--){const r=fstr(o);if(!r)throw new Error(BAD);top.push(r[0]);o=r[1]}
  const sidx=top.indexOf("/Game/Blueprints/Stations/BP_StationObject.BP_StationObject_C");
  if(sidx<0)return[];
  // underground Length per MachineID from the world tree (literal mirror of underground_lengths(d) in import_station.py)
  const UG={};
  for(let ci=0;ci<top.length;ci++){if(!top[ci].includes("UndergroundBeltObject"))continue;
    for(let q=0;q+36<=L;q++){if(I(q)!==ci)continue;
      try{const st=q+36;if(I(st+8)!==0||I(st+12)!==6)continue;   // 5-word block: w2=0, w3=6
        const mid=I(q+4),fx=I(q+8),fy=I(q+12);if((fx>>15)!==I(st+20)||(fy>>15)!==I(st+24))continue;   // gridX, gridY
        let p=st+36;
        for(let k=0;k<2;k++){const n=I(p);if(n<0||n>=64)throw 0;p+=4+4*n}   // input / output machine ids
        p+=8;const n=I(p);if(n<0||n>=1000)throw 0;p+=4;
        for(let k=0;k<n;k++){const r=fstr(p);if(!r)throw 0;p=r[1]+4}   // Items {FString, i32 progress}
        const total=I(p),len=I(p+4);
        if(len>0&&len<=64&&total%len===0)UG[mid]=len;
      }catch(e){}}}
  // container inventories from the world tree: record head as for undergrounds, then `1, 27, id, 1, <slots>` followed by <slots> x {FString item (empty = len 0), i32 count}
  const CT={},nrm=t=>t.toLowerCase().replace(/^item_/,"").replace(/[^a-z0-9]/g,""),IDS={};Object.keys(ITEMS).forEach(k=>IDS[nrm(k)]=k);
  for(let ci=0;ci<top.length;ci++){if(!/\/BP_ContainerObject(_2)?\.BP_ContainerObject(_2)?_C$/.test(top[ci]))continue;
    for(let q=0;q+36<=L;q++){if(I(q)!==ci)continue;
      try{const st=q+36;if(I(st+8)!==0||I(st+12)!==6)continue;
        const mid=I(q+4),fx=I(q+8),fy=I(q+12);if((fx>>15)!==I(st+20)||(fy>>15)!==I(st+24))continue;
        let h=-1;for(let k=st+36;k<st+400&&k+20<=L;k+=4)if(I(k)===27&&I(k-4)===1&&I(k+8)===1&&I(k+12)>=1&&I(k+12)<=512){h=k;break}
        if(h<0)continue;
        let p=h+16;const sl=I(h+12),m=new Map();
        for(let k=0;k<sl;k++){const n=I(p);if(n<0||n>200)throw 0;let nm="";
          if(n>0){const r=fstr(p);if(!r)throw 0;nm=r[0];p=r[1]}else p+=4;
          const c=I(p);p+=4;if(c<0||c>1e9)throw 0;
          if(nm&&c>0)m.set(nm,(m.get(nm)||0)+c)}
        if(m.size)CT[mid]=[...m].map(([it,c])=>({Item:IDS[nrm(it)]||IDS[nrm(it)+"s"]||IDS[nrm(it).replace(/(\d+)$/,"mk$1")]||it,Count:c,Infinite:false}));
      }catch(e){}}}
  const out=[];
  for(let p=o+56;p+13<=L;p++){
    if(u8[p]!==2||!hasAt(p,SIG))continue;
    const h=p-56;if(I(h)!==sidx)continue;   // object header: class idx 56 bytes before SIG, objectId 4 bytes after it
    let A=null;try{A=parseStruct(p)}catch(e){A=null}
    if(A)out.push({name:A.name,objectId:I(h+4),json:siteJson(A)});
  }
  return out;
}
// ConfigHex (game bytes) -> model: recipe (key, or raw game name in recn when unknown), disabled ports (game port order when mapped, else portsOf order), splitter filters/priorities, underground Length (b.ugl, expanded by importJson)
function impCfg(b,d,m){
  const k=cfgKind(d.id),dc=k&&cfgDec(d.id,m.ConfigHex);
  if(k==="underground"){const l=n0(m.Length)||(dc?dc.length:0);if(l>1)b.ugl=l;return}   // Length field (world record) first, ConfigHex as fallback
  if(!dc)return;
  const off=[],ps=portsOf(b),gm=gamePortMap(b);
  if(isSplitterCls(d.id))(dc.ports||[]).forEach((e,g)=>{const q=ps.find(q=>q.f===SPL_FACES[g]);if(e===false&&q&&q.tg)off.push(q.key)});
  else if(gm&&dc.ports&&dc.ports.length===gm.length)dc.ports.forEach((e,g)=>{const q=ps[gm[g]];if(e===false&&q.tg)off.push(q.key)});
  else{const sk=k==="splitter"?Math.max(0,ps.length-(dc.ports||[]).length):0;(dc.ports||[]).forEach((e,i)=>{const q=ps[sk+i];if(e===false&&q&&q.tg)off.push(q.key)})}
  if(off.length)b.off=off;
  if(dc.recipe){const kk=recKeyOf(dc.recipe);if(kk)b.rec=kk;else b.recn=dc.recipe}
  if(dc.filters){if(dc.filters.some(Boolean))b.fl=dc.filters;if(dc.prioA!==-1||dc.prioB!==-1)b.pr=[dc.prioA,dc.prioB]}
  b.cfgKeep={hex:m.ConfigHex,sig:cfgSig(b)};
}
const n0=v=>Math.round(Number(v))||0;
const bbs=CATALOG.buildables;
function matchM(m){
  const c=m&&m.Class;if(!c)return null;
  const ug=c.replace(/^BPO?_/,"").replace(/Object(?=_|$)/,"");   // game saves name the Mk2/Mk3 undergrounds BP_UndergroundBeltObject_2/_3 (catalog machineClass is the Mk1 name)
  const l=bbs.filter(d=>d.machineClass===c||d.id===c||"BPO_"+d.id.slice(4)===c||d.id===m.DefaultName||(d.category==="Undergrounds"&&"DAT_"+ug===d.id));
  return l.find(d=>d.id===m.DefaultName)||l[0]||null;
}
function importJson(txt,quiet){const ok=importJson0(txt,quiet);if(ok)stHide();return ok}
function importJson0(txt,quiet){
  let o;try{o=JSON.parse(txt)}catch(e){toast("Invalid JSON: "+e.message);return false}
  if(!o||!Array.isArray(o.Blocks)){toast('Missing "Blocks" array');return false}
  push();
  S.name=typeof o.DisplayName==="string"?o.DisplayName:"Imported";
  if(o.Catalog&&typeof o.Catalog==="object")for(const c in o.Catalog){OV[c]=Object.assign(OV[c]||{},o.Catalog[c])}
  saveOV();
  let odd=0;spFix=0;
  // Version 2 = game units (extract/import_station.py): block 4 units per cell, GridLocation = footprint centre;
  // machine 2 units per floor cell, GridLocation = footprint centre, Height per level: blocks 2, machines 16. Version 1/absent = legacy site units.
  const v2=o.Version===2,MZ=16,BZ=2;   // game Height per level: blocks 2, machines 16 (sample station: blocks 0,2,4.. machines 0,16,32..)
  const n=v=>Math.round(Number(v))||0,hf=v=>{v=Number(v)||0;if(v%CU)odd++;return Math.round(v/CU)};
  const cell=(v,u,c)=>{const k=((Number(v)||0)-c)/u;if(k%1)odd++;return Math.round(k)};   // origin from centre; non-integer rounded + counted
  const rot=v=>((n(v)%4)+4)%4;
  S.blocks=o.Blocks.map(b=>{const r=rot(b.GridRotation),gx=b.GridLocation&&b.GridLocation.X,gy=b.GridLocation&&b.GridLocation.Y,cls=String(b.Class||"");
    if(!v2)return{id:uid++,cls,x:hf(gx),y:hf(gy),h:n(b.Height),rot:r,pid:n(b.PaletteID)};
    const f=dim({cls,rot:r}),sh=SHIPEND({cls}),ax=sh&&f.w===1&&DIR[r][0]<0?1:0,ay=sh&&f.h===1&&DIR[r][1]<0?1:0;   // shipEnd: 2x2 box, drawn row = station side
    const x=cell(gx,4,sh?2:2*(f.w-1))+ax,y=cell(gy,4,sh?2:2*(f.h-1))+ay,nb={id:uid++,cls,x,y,h:Math.round(n(b.Height)/BZ),rot:r,pid:n(b.PaletteID)};
    if(4*(x-ax)+2*(sh?1:f.w-1)!==Number(gx)||4*(y-ay)+2*(sh?1:f.h-1)!==Number(gy))nb.raw={x,y,r,X:Number(gx),Y:Number(gy)};   // block never moves on round trip
    return nb});
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
      if(m.SiteOnly&&Array.isArray(m.SiteOnly.Infinite))b.ct=(b.ct||[]).concat(m.SiteOnly.Infinite.filter(x=>x&&typeof x.Item==="string"&&x.Item).map(x=>({item:x.Item,n:Math.max(0,Math.round(Number(x.Count))||0),inf:true})));   // site-only infinite sources
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
  toast(`Imported ${S.blocks.length-nm} blocks, ${nm} buildables`+(S.dm.length?`, ${S.dm.length} other machines kept`:"")+(unk?`, ${unk} unknown class`:"")+(odd?`; ${odd} odd coordinates rounded`:"")+(spFix?`; ${spFix} splitter input port set on (input face is always open)`:""));return true;
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
  if(SAVST){const l=SAVST,i=+$("impSt").value;if(importJson(JSON.stringify(l[i].json))){stShow(l,i);$("dImp").close()}return}
  if(importJson($("impTa").value))$("dImp").close();
};
// Header station switcher: shown after picking one station of a multi-station save, any other import hides it
let STL=null;
function stHide(){STL=null;$("stG").hidden=true}
function stShow(l,i){STL=l;$("stSel").replaceChildren(...l.map((s,j)=>new Option(s.name,String(j))));$("stSel").value=String(i);$("stSel").dataset.cur=String(i);$("stG").hidden=false}
$("stSel").onchange=()=>{const l=STL,i=+$("stSel").value,cur=+$("stSel").dataset.cur;
  if(!l||!confirm(`Switch to station "${l[i].name}"? Unsaved changes to the current station will be lost.`)){$("stSel").value=String(cur);return}
  if(importJson(JSON.stringify(l[i].json)))stShow(l,i);else $("stSel").value=String(cur)};
let nameBefore=S.name;
$("name").onfocus=()=>{nameBefore=S.name};
$("name").oninput=e=>{S.name=e.target.value;ASH=false;asv()};
$("name").onchange=()=>{if(S.name!==nameBefore){const o=JSON.parse(snap());o.n=nameBefore;undoS.push(JSON.stringify(o));redoS=[];all()}nameBefore=S.name};


// ---- floor plan image: the live canvas repainted at a fixed zoom (no selection/ghost/hover), placed on a blueprint sheet: frame, grid, dimension lines, scale bar and a title block. Units are the editor's own cells (floor cells on the factory floor, block cells in Layout), never real-world metres.
const FP_URL="https://xxalex3xx97.github.io/ms-factory-blueprint/";
function fpSheet(plan,n,cells,unit,wc,hc,bo,ca,cb,P,Sz){   // plan: canvas of the plan (transparent), n: px per cell, cells: px of one cell in the sheet
  const f=n/(view==="L"?128:80)*bo,M=220*f,B=360*f,pw=plan.width,ph=plan.height,Wt=Math.ceil(Sz),Ht=Wt,Mx=(Wt-pw)/2,My=M+(Ht-M-B-ph)/2,o=document.createElement("canvas");o.width=Wt;o.height=Ht;   // square sheet: plan centred between the top margin and the title strip
  let e=cv,bg="";while(e&&(!bg||/rgba\(.*,\s*0\)$|transparent/.test(bg))){bg=getComputedStyle(e).backgroundColor;e=e.parentElement}   // paper = the page colour, ink = the site's own text colours
  bg=bg||"#0b0e11";const rs=getComputedStyle(document.documentElement),q=o.getContext("2d"),ink=rs.getPropertyValue("--text").trim()||"#e6edf3",dim=rs.getPropertyValue("--dim").trim()||"#8b98a5",mono=`${Math.round(28*f)}px Consolas,"Courier New",monospace`,font=(w,sz)=>`${w} ${Math.round(sz*f)}px Consolas,"Courier New",monospace`;
  q.fillStyle=bg;q.fillRect(0,0,Wt,Ht);
  // paper grid = the editor's grid (same lines, colours, majors, origin line), continued over the whole sheet and left out of the plan area (the plan already carries it)
  q.save();q.beginPath();q.rect(0,0,Wt,Ht);q.rect(Mx,My,pw,ph);q.clip("evenodd");q.lineWidth=Math.max(1,Math.round(f/2));
  const major=view==="L"?8:16,st=i=>i===0?"rgba(120,220,240,.5)":i%major===0?"rgba(140,160,200,.26)":"rgba(140,160,200,.09)";
  for(let i=Math.floor((0-Mx)/cells)+ca;i<=Math.ceil((Wt-Mx)/cells)+ca;i++){q.strokeStyle=st(i);const X=Math.round(Mx+(i-ca)*cells)+.5;q.beginPath();q.moveTo(X,0);q.lineTo(X,Ht);q.stroke()}
  for(let j=Math.floor((0-My)/cells)+cb;j<=Math.ceil((Ht-My)/cells)+cb;j++){q.strokeStyle=st(j);const Y=Math.round(My+(j-cb)*cells)+.5;q.beginPath();q.moveTo(0,Y);q.lineTo(Wt,Y);q.stroke()}
  q.restore();
  // the plan keeps the editor's own colours, drawn unfiltered
  q.drawImage(plan,Mx,My);
  // frame (double line)
  q.strokeStyle=ink;q.lineWidth=4*f;q.strokeRect(36*f,36*f,Wt-72*f,Ht-72*f);q.lineWidth=1.5*f;q.strokeRect(54*f,54*f,Wt-108*f,Ht-108*f);
  // dimension lines: architectural ticks, extension lines, text on the line
  const tick=(x,y)=>{q.beginPath();q.moveTo(x-9*f,y+9*f);q.lineTo(x+9*f,y-9*f);q.stroke()};
  const label=(t,x,y,rot)=>{q.save();q.translate(x,y);if(rot)q.rotate(-Math.PI/2);q.font=font("bold",30);q.textAlign="center";q.textBaseline="middle";const w=q.measureText(t).width;q.fillStyle=bg;q.fillRect(-w/2-12*f,-20*f,w+24*f,40*f);q.fillStyle=ink;q.fillText(t,0,0);q.restore()};
  q.strokeStyle=dim;q.lineWidth=2*f;
  const pd=P*cells,X0=Mx+pd,X1=Mx+pw-pd,Y0=My+pd,Y1=My+ph-pd,ty=My-100*f;q.beginPath();q.moveTo(X0,ty);q.lineTo(X1,ty);q.moveTo(X0,My-20*f);q.lineTo(X0,ty-30*f);q.moveTo(X1,My-20*f);q.lineTo(X1,ty-30*f);q.stroke();tick(X0,ty);tick(X1,ty);label(wc+" "+unit,(X0+X1)/2,ty,false);
  const lx=Mx-100*f;q.beginPath();q.moveTo(lx,Y0);q.lineTo(lx,Y1);q.moveTo(Mx-20*f,Y0);q.lineTo(lx-30*f,Y0);q.moveTo(Mx-20*f,Y1);q.lineTo(lx-30*f,Y1);q.stroke();tick(lx,Y0);tick(lx,Y1);label(hc+" "+unit,lx,(Y0+Y1)/2,true);
  // title block, bottom-left
  const bx=90*f,bw=900*f,bh=250*f,by=Ht-90*f-bh,r=[["STATION",S.name||"Untitled"],["SAVE",(typeof FH!=="undefined"&&FH&&FH.name)||"(not saved to a file)"],["DATE",new Date().toISOString().slice(0,10)],["VIEW",(view==="L"?"Layout":"Factory floor, level "+layer)],["MADE WITH",FP_URL.replace("https://","")]];
  q.strokeStyle=ink;q.lineWidth=3*f;q.strokeRect(bx,by,bw,bh);q.lineWidth=1.2*f;
  r.forEach((row,i)=>{const y=by+i*bh/r.length;if(i){q.beginPath();q.moveTo(bx,y);q.lineTo(bx+bw,y);q.stroke()}q.textBaseline="middle";q.fillStyle=dim;q.font=font("",20);q.textAlign="left";q.fillText(row[0],bx+16*f,y+bh/r.length/2);q.fillStyle=ink;q.font=font(i===0?"bold":"",i===0?32:24);q.fillText(row[1].length>46?row[1].slice(0,45)+"…":row[1],bx+230*f,y+bh/r.length/2)});
  q.beginPath();q.moveTo(bx+210*f,by);q.lineTo(bx+210*f,by+bh);q.stroke();
  // scale bar: 5 cells, alternating blocks, ticks labelled in cells
  const sx=bx+bw+120*f,sy=Ht-170*f,seg=Math.max(1,Math.min(5,Math.floor((Wt-sx-110*f)/cells))),sw=cells*seg;q.lineWidth=2*f;q.strokeStyle=ink;   // up to 5 cells, fewer when the sheet is narrow
  for(let i=0;i<seg;i++){q.fillStyle=i%2?"rgba(0,0,0,0)":ink;q.fillRect(sx+i*cells,sy,cells,22*f);q.strokeRect(sx+i*cells,sy,cells,22*f)}
  q.fillStyle=ink;q.font=font("",22);q.textAlign="center";q.textBaseline="top";[0,seg].forEach(i=>q.fillText(String(i),sx+i*cells,sy+34*f));q.fillText(unit,sx+sw/2,sy+34*f);
  q.textAlign="left";q.textBaseline="bottom";q.font=font("bold",22);q.fillText("SCALE",sx,sy-14*f);
  return o;
}
// Browser limit of one canvas: side from a real probe (N x 1 canvas), area from the engine's documented cap (Firefox 472 MP, iOS Safari 16.7 MP, Chromium/desktop Safari 268 MP); 95% of it is used. 100% quality = the biggest square sheet under that limit.
const fpLim=(()=>{let L=null;return()=>{if(L)return L;
  let dim=4096;for(const n of [32767,16384,8192,4096]){const c=document.createElement("canvas");c.width=n;c.height=1;const g=c.getContext("2d");if(!g)continue;g.fillStyle="#000";g.fillRect(n-1,0,1,1);if(g.getImageData(n-1,0,1,1).data[3]===255){dim=n;break}}
  const ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua),ff=/Firefox\//.test(ua),area=ios?16777216:ff?472907776:268435456;
  return L={side:Math.floor(Math.min(dim,Math.sqrt(area))*.95),dim,area,eng:ios?"iOS Safari":ff?"Firefox":"Chrome/Edge/Safari"}}})();
// geometry of a sheet whose square side is `side` px: fits the plan (plus padding and the sheet furniture) into it. Furniture (margins, frame, text) scales with px per cell, so every quality is the same picture, smaller.
function fpGeom(side){
  let a=1e9,b=1e9,c=-1e9,d=-1e9;const add=(x0,y0,x1,y1)=>{a=Math.min(a,x0);b=Math.min(b,y0);c=Math.max(c,x1);d=Math.max(d,y1)};
  if(view==="L")S.blocks.filter(k=>!isM(k)).forEach(k=>{const m=dim(k);add(k.x,k.y,k.x+m.w,k.y+m.h)});
  else{areas(layer).rects.forEach(r=>add(r.x,r.y,r.x+r.w,r.y+r.h));S.blocks.filter(k=>isM(k)&&k.h===layer).forEach(k=>{const m=dim(k);add(k.x,k.y,k.x+m.w,k.y+m.h)})}
  if(a>c)return null;
  const base=view==="L"?128:80,P=view==="L"?2:8,wc=c-a+2*P,hc=d-b+2*P,   // P: empty cells around the building so walls, door slots and ghosts outside the floor rects are not clipped
    bo=Math.min(4,Math.max(1,Math.max(wc,hc)*base/3500)),                 // bo: furniture grows with big plans
    px=side/Math.max(wc+440*bo/base,hc+580*bo/base);                      // sheet side = px * max(wc + 440bo/base, hc + 580bo/base)
  return{a,b,c,d,P,px,bo,wc,hc,cw:wc*px,ch:hc*px,side};
}
function fpRender(side){
  const g=fpGeom(side);if(!g){toast("Nothing to export");return null}
  const {a,b,c,d,P,px,bo,cw,ch}=g;
  const sv={ox:V.ox,oy:V.oy,z:V.z,W,H,dpr,sel,active,pasting,w:cv.width,h:cv.height};
  try{
    V.z=px/CELLS[view];V.ox=-(a-P)*px;V.oy=-(b-P)*px;W=Math.ceil(cw);H=Math.ceil(ch);dpr=1;
    cv.width=W;cv.height=H;sel=new Set();active=null;pasting=null;paint();
    return fpSheet(cv,px,px,view==="L"?"blocks":"cells",c-a,d-b,bo,a-P,b-P,P,side);   // canvas
  }finally{V.ox=sv.ox;V.oy=sv.oy;V.z=sv.z;W=sv.W;H=sv.H;dpr=sv.dpr;sel=sv.sel;active=sv.active;pasting=sv.pasting;cv.width=sv.w;cv.height=sv.h;paint()}
}
const fpSave=(blob,ext)=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(S.name.replace(/[^\w.-]+/g,"_")||"plan")+"-"+(view==="L"?"layout":"floor-plan")+"."+ext;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e3)};
const shSide=()=>Math.max(512,Math.round(fpLim().side*(+$("shQ").value||100)/100));
function shPrev(){const q=+$("shQ").value||100,sd=shSide(),g=fpGeom(sd),L=fpLim();$("shQv").textContent=q+"%";
  $("shPrev").textContent=g?`${sd} × ${sd} px · ${(sd*sd/1e6).toFixed(1)} MP`:"Nothing to export in this view";
  $("shLim").textContent=`100% = ${L.side} × ${L.side} px, the largest picture ${L.eng} can make`;
  $("shBox").style.width=$("shBox").style.height=Math.round(128*sd/L.side)+"px"}
$("shQ").oninput=shPrev;$("shB").addEventListener("click",()=>{if(!$("shW").hidden)shPrev()});
const fpBlob=cvs=>new Promise(r=>cvs.toBlob(r,"image/png"));
$("shPng").onclick=async()=>{const c=fpRender(shSide());if(!c)return;const b=await fpBlob(c);b?fpSave(b,"png"):toast("PNG export failed (image too large for this browser): lower the quality")};
$("shSvg").onclick=async()=>{const c=fpRender(shSide());if(!c)return;const b=await fpBlob(c);if(!b){toast("SVG export failed (image too large for this browser): lower the quality");return}
  const u=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});
  fpSave(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}"><image width="${c.width}" height="${c.height}" href="${u}"/></svg>`],{type:"image/svg+xml"}),"svg")};
