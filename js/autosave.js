// ---- autosave (localStorage msfb.state): design (= export JSON) + UI settings. Sim running state/clock are never saved.
// autosave schema v2 (Version 2 export); older autosaves (v1) are ignored on restore
const asNow=()=>{if(!ASO||ASH)return;try{localStorage.setItem(ASK,JSON.stringify({v:2,d:build(),u:{view,layer,tab,spd:SPD,gh:$("ghost").checked,lk:LK,bn:BN,bm:BM,po:[...po],io:[...io],
  sel:S.blocks.filter(b=>sel.has(b.id)).map(b=>[b.cls,b.x,b.y,b.h]),vl:{ox:VL.ox,oy:VL.oy,z:VL.z},vf:{ox:VF.ox,oy:VF.oy,z:VF.z,init:VF.init}}}))}catch(e){}};
const asv=()=>{if(!ASO||ASH)return;clearTimeout(AST);AST=setTimeout(asNow,400)};
const asvNow=()=>{clearTimeout(AST);asNow()};
window.addEventListener("pagehide",asvNow);
document.addEventListener("visibilitychange",()=>{if(document.hidden)asvNow()});
function asRestore(){
  let o;try{o=JSON.parse(localStorage.getItem(ASK))}catch(e){return}
  if(!o||o.v!==2||!o.d||!Array.isArray(o.d.Blocks)||o.d.Version!==2)return;   // stale autosave (older schema / legacy units): ignored
  const bk=snap(),u=o.u&&typeof o.u==="object"?o.u:{},fin=x=>typeof x==="number"&&isFinite(x),bt=(id,on)=>{$(id).classList.toggle("on",on);$(id).setAttribute("aria-pressed",on)};
  try{
    if(!importJson(JSON.stringify(o.d),true))return;
    undoS=[];redoS=[];
    if(u.view==="F"||u.view==="L"){view=u.view;V=view==="F"?VF:VL;tab=view==="F"?"m":"b"}
    if(u.tab==="b"||u.tab==="m")tab=u.tab;
    if(fin(u.layer))layer=Math.trunc(u.layer);
    const pv=(T,p)=>{if(p&&fin(p.ox)&&fin(p.oy)&&fin(p.z)&&p.z>0){T.ox=p.ox;T.oy=p.oy;T.z=p.z;if(T===VF&&p.init)VF.init=true}};
    pv(VL,u.vl);pv(VF,u.vf);
    if(Array.isArray(u.sel))sel=new Set(u.sel.map(k=>Array.isArray(k)&&S.blocks.find(b=>b.cls===k[0]&&b.x===k[1]&&b.y===k[2]&&b.h===k[3])).filter(Boolean).map(b=>b.id));
    if(typeof u.gh==="boolean")$("ghost").checked=u.gh;
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
  FH=null;clearTimeout(AST);try{localStorage.removeItem(ASK)}catch(e){}
  push();S.blocks=[];S.dm=[];S.closed=[];S.name="Untitled station";sel=new Set();$("name").value=S.name;ASH=true;all();
};

const HINTS={
  L:'<kbd>click</kbd> place/select &middot; <kbd>dbl-click</kbd> open factory floor &middot; <kbd>drag</kbd> move/box &middot; <kbd>wheel</kbd> zoom &middot; <kbd>space</kbd>+drag or right/middle drag pan &middot; <kbd>right-click</kbd> delete/deselect &middot; <kbd>1</kbd>-<kbd>9</kbd> hotbar (drag or <kbd>Shift</kbd>+click to assign) &middot; <kbd>R</kbd> rotate &middot; <kbd>Del</kbd> delete &middot; <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>Z</kbd>/<kbd>Y</kbd> &middot; <kbd>[</kbd><kbd>]</kbd> layer &middot; <kbd>F</kbd> floor &middot; <kbd>Esc</kbd> cancel',
  F:'<kbd>click</kbd> place/select &middot; <kbd>click door</kbd> open/closed &middot; <kbd>drag</kbd> move/box, or lay a belt run &middot; <kbd>wheel</kbd> zoom &middot; <kbd>space</kbd>+drag or right/middle drag pan &middot; <kbd>right-click</kbd> delete/deselect &middot; <kbd>1</kbd>-<kbd>9</kbd> hotbar (drag or <kbd>Shift</kbd>+click to assign) &middot; <kbd>R</kbd> rotate &middot; <kbd>Del</kbd> delete &middot; <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd>/<kbd>Z</kbd>/<kbd>Y</kbd> &middot; <kbd>[</kbd><kbd>]</kbd> layer &middot; <kbd>F</kbd> layout &middot; <kbd>Esc</kbd> cancel'
};
function all(){
  $("lay").value=layer+1;$("lvN").textContent=layer+1;$("undo").disabled=!undoS.length;$("redo").disabled=!redoS.length;
  smSync();
  [["vwL","L"],["vwF","F"]].forEach(([i,v])=>{$(i).classList.toggle("on",view===v);$(i).setAttribute("aria-pressed",view===v)});
  cv.setAttribute("aria-label",view==="F"?"Factory floor canvas":"Station grid canvas");
  palette();hotbar();panel();draw();
}
