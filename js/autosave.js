// ---- autosave: design (= export JSON) + UI settings. Stored in IndexedDB msfb/kv "state" (fits big designs) and mirrored to localStorage msfb.state while it fits. Sim running state/clock are never saved.
// autosave schema v2 (Version 2 export); older autosaves (v1) are ignored on restore
let asWarned=false;
const asFail=()=>{if(!asWarned){asWarned=true;toast("Autosave failed (browser storage full?). Refresh may not restore this design.")}};
const asNow=()=>{if(!ASO||ASH)return;let js;try{js=JSON.stringify({v:2,d:build(),u:{view,layer,tab,spd:SPD,gh:$("ghost").checked,gha:$("ghostAll").checked,st:STRICT,lk:LK,bn:BN,bm:BM,po:[...po],io:[...io],
  sel:S.blocks.filter(b=>sel.has(b.id)).map(b=>[b.cls,b.x,b.y,b.h]),vl:{ox:VL.ox,oy:VL.oy,z:VL.z},vf:{ox:VF.ox,oy:VF.oy,z:VF.z,init:VF.init},si:SIK,w:{st:!$("stW").hidden,lv:!$("lvW").hidden,fw:!$("fwW").hidden,sh:!$("shW").hidden}}})}catch(e){return asFail()}
  let ls=true;try{localStorage.setItem(ASK,js)}catch(e){ls=false;try{localStorage.removeItem(ASK)}catch(_){}}   // too big for localStorage: drop the stale copy (IndexedDB has the latest)
  idbSet("state",js).catch(()=>{if(!ls)asFail()})};
const asv=()=>{if(!ASO||ASH)return;clearTimeout(AST);AST=setTimeout(asNow,400)};
const asvNow=()=>{clearTimeout(AST);asNow()};
let IDBP=null;   // one shared connection; calls resolve in order, so a put before a delete stays before it
const idb=()=>IDBP||(IDBP=new Promise((ok,no)=>{const r=indexedDB.open("msfb",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}).catch(e=>{IDBP=null;throw e}));
const idbGet=async k=>{const d=await idb();return new Promise((ok,no)=>{const q=d.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})};
const idbSet=async(k,v)=>{const d=await idb();return new Promise((ok,no)=>{const t=d.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=()=>ok();t.onerror=()=>no(t.error)})};
const idbDel=async k=>{const d=await idb();return new Promise((ok,no)=>{const t=d.transaction("kv","readwrite");t.objectStore("kv").delete(k);t.oncomplete=()=>ok();t.onerror=()=>no(t.error)})};
function svPut(ab,name,l,i){SIK=i;if(l.length>1)stShow(l,i);asv();idbSet("sav",{b:ab,n:name}).catch(()=>toast("Could not keep the save for refresh (storage blocked)"))}
async function svRestore(){const si=SIK;if(si==null)return;try{const r=await idbGet("sav");if(!r||!r.b||STL||SIK!==si)return;const l=parseSav(r.b);if(l.length>1&&l[si])stShow(l,si)}catch(e){}}
window.addEventListener("pagehide",asvNow);
document.addEventListener("visibilitychange",()=>{if(document.hidden)asvNow()});
async function asRestore(){   // resolves after the saved state is read; boot applies the window defaults only when nothing was saved
  let js=null;try{js=localStorage.getItem(ASK)}catch(e){}
  if(js==null)try{js=await idbGet("state")}catch(e){}   // localStorage copy is removed whenever it cannot hold the latest state, so it is never older than IndexedDB
  let o;try{o=JSON.parse(js)}catch(e){return}
  if(!o||o.v!==2||!o.d||!Array.isArray(o.d.Blocks)||o.d.Version!==2)return;   // stale autosave (older schema / legacy units): ignored
  const bk=snap(),u=o.u&&typeof o.u==="object"?o.u:{},fin=x=>typeof x==="number"&&isFinite(x),bt=(id,on)=>{$(id).classList.toggle("on",on);$(id).setAttribute("aria-pressed",on)};
  try{
    if(!importJson(JSON.stringify(o.d),true))return;
    undoS=[];redoS=[];
    if(Number.isInteger(u.si)&&u.si>=0)SIK=u.si;
    if(u.w&&typeof u.w==="object"){WINSET=true;[["stB","st"],["lvB","lv"],["flwB","fw"],["shB","sh"]].forEach(([b,k])=>{if(typeof u.w[k]==="boolean")winSet(b,u.w[k])})}
    if(u.view==="F"||u.view==="L"){view=u.view;V=view==="F"?VF:VL;tab=view==="F"?"m":"b"}
    if(u.tab==="b"||u.tab==="m")tab=u.tab;
    if(fin(u.layer))layer=Math.trunc(u.layer);
    const pv=(T,p)=>{if(p&&fin(p.ox)&&fin(p.oy)&&fin(p.z)&&p.z>0){T.ox=p.ox;T.oy=p.oy;T.z=p.z;if(T===VF&&p.init)VF.init=true}};
    pv(VL,u.vl);pv(VF,u.vf);
    if(Array.isArray(u.sel))sel=new Set(u.sel.map(k=>Array.isArray(k)&&S.blocks.find(b=>b.cls===k[0]&&b.x===k[1]&&b.y===k[2]&&b.h===k[3])).filter(Boolean).map(b=>b.id));
    if(typeof u.gh==="boolean")$("ghost").checked=u.gh;
    if(typeof u.gha==="boolean")$("ghostAll").checked=u.gha;
    if(typeof u.st==="boolean")STRICT=u.st;
    if(typeof u.lk==="boolean"){LK=u.lk;bt("lk",LK)}
    if(typeof u.bn==="boolean"){BN=u.bn;bt("bn",BN);bnSub()}
    if(u.bm==="F"||u.bm==="B"){BM=u.bm;$("bnF").classList.toggle("on",BM==="F");$("bnB").classList.toggle("on",BM==="B");bnSub()}
    if([1,10,60].includes(u.spd))SPD=u.spd;
    if(Array.isArray(u.io)){io.clear();u.io.filter(x=>typeof x==="string").forEach(x=>io.add(x))}
    if(Array.isArray(u.po))po=new Set(u.po.filter(x=>typeof x==="string"));
  }catch(e){restore(bk)}
}
$("nw").onclick=()=>{
  if(!confirm("Clear the autosaved design and start with an empty one?"))return;
  FH=null;clearTimeout(AST);try{localStorage.removeItem(ASK)}catch(e){}idbDel("state").catch(()=>{});idbDel("sav").catch(()=>{});SIK=null;stHide();
  push();S.blocks=[];S.dm=[];S.closed=[];S.name="Untitled station";sel=new Set();$("name").value=S.name;ASH=true;all();
};

const HINTS={
  L:'<kbd>click</kbd> place/select &middot; <kbd>dbl-click</kbd> open factory floor &middot; <kbd>drag</kbd> move/box &middot; <kbd>wheel</kbd> zoom &middot; <kbd>space</kbd>+drag or right/middle drag pan &middot; <kbd>right-click</kbd> delete/deselect &middot; <kbd>1</kbd>-<kbd>9</kbd> hotbar (drag or <kbd>Shift</kbd>+click to assign) &middot; <kbd>R</kbd> rotate &middot; <kbd>Del</kbd> delete &middot; <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>Z</kbd>/<kbd>Y</kbd> &middot; <kbd>[</kbd><kbd>]</kbd> layer &middot; <kbd>F</kbd> floor &middot; <kbd>Esc</kbd> cancel',
  F:'<kbd>click</kbd> place/select &middot; <kbd>drag</kbd> move/box, or lay a belt run &middot; <kbd>wheel</kbd> zoom &middot; <kbd>space</kbd>+drag or right/middle drag pan &middot; <kbd>right-click</kbd> delete/deselect &middot; <kbd>1</kbd>-<kbd>9</kbd> hotbar (drag or <kbd>Shift</kbd>+click to assign) &middot; <kbd>R</kbd> rotate &middot; <kbd>Del</kbd> delete &middot; <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>Z</kbd>/<kbd>Y</kbd> &middot; <kbd>[</kbd><kbd>]</kbd> layer &middot; <kbd>F</kbd> layout &middot; <kbd>Esc</kbd> cancel'
};
function all(){
  $("lay").value=layer+1;$("lvN").textContent=layer+1;$("undo").disabled=!undoS.length;$("redo").disabled=!redoS.length;
  smSync();
  [["vwL","L"],["vwF","F"]].forEach(([i,v])=>{$(i).classList.toggle("on",view===v);$(i).setAttribute("aria-pressed",view===v)});
  cv.setAttribute("aria-label",view==="F"?"Factory floor canvas":"Station grid canvas");
  palette();hotbar();panel();draw();
}
