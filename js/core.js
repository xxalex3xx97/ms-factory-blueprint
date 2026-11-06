const $=s=>document.getElementById(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const HUES={Basic:200,Vertical:335,Defence:20,"Functional Blocks":150,Shipyards:265};
const ORDER=["Basic","Vertical","Defence","Functional Blocks","Shipyards","Balancers","Conveyors","Machine","Splitters","Undergrounds","Storage"];
const hue=c=>HUES[c]!=null?HUES[c]:[...c].reduce((a,ch)=>(a*31+ch.charCodeAt(0))%360,7);
const fill=(c,a)=>`hsla(${hue(c)},55%,48%,${a})`;
const short=n=>n.replace(/^(BPO_|DAT_)/,"").replace(/_C$/,"");
const shortCls=c=>short((c.split(".").pop()||c));
const lab=d=>d.label||short(d.name);

// ---- catalog: blocks (key=class) + buildables (key=DAT id); OV keyed by key
const BASE={},RES=CATALOG.research||{},ICONS=CATALOG.icons||{};
CATALOG.blocks.forEach(b=>{b.key=b.class;b.kind="b";b.fw=b.floor?b.floor.w:null;b.fh=b.floor?b.floor.h:null;BASE[b.key]=b});
CATALOG.buildables.forEach(b=>{b.key=b.id;b.kind="m";BASE[b.key]=b});
const OVK="msfb.catalog4";
let OV={};
try{OV=JSON.parse(localStorage.getItem(OVK)||"{}")||{}}catch(e){OV={}}
const DEFC={};
const saveOV=()=>{for(const k in DEFC)delete DEFC[k];try{localStorage.setItem(OVK,JSON.stringify(OV))}catch(e){}};
const def=c=>BASE[c]?(DEFC[c]||(DEFC[c]=Object.assign({},BASE[c],OV[c]||{}))):null;
const kindOf=c=>BASE[c]?BASE[c].kind:"b";   // unknown classes behave as blocks
const catSort=(a,b)=>{const i=ORDER.indexOf(a),j=ORDER.indexOf(b);return (i<0?99:i)-(j<0?99:j)||(a<b?-1:a>b?1:0)};
const cats=k=>[...new Set(Object.keys(BASE).filter(c=>BASE[c].kind===k).map(c=>def(c).category))].sort(catSort);
function setOV(cls,f,v){
  const o=OV[cls]=OV[cls]||{};
  if(JSON.stringify(v)===JSON.stringify(BASE[cls][f]))delete o[f];else o[f]=v;
  if(!Object.keys(o).length)delete OV[cls];
  saveOV();
}

// ---- icons (blob URLs made once, Image objects cached)
const IURL={},IMG={};
function iurl(k){
  if(!k||!ICONS[k])return null;
  if(!IURL[k]){const s=ICONS[k],bin=atob(s.slice(s.indexOf(",")+1)),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);IURL[k]=URL.createObjectURL(new Blob([u],{type:"image/png"}))}
  return IURL[k];
}
function img(k){
  if(!k||!ICONS[k])return null;
  if(!IMG[k]){const i=new Image();i.onload=()=>draw();i.src=iurl(k);IMG[k]=i}
  return IMG[k];
}

// ---- research info
const rs=r=>r.replace(/^RSC_/,"RSC ");
function pre(r,seen=new Set(),out=[]){if(seen.has(r))return out;seen.add(r);((RES[r]||{}).requires||[]).forEach(p=>pre(p,seen,out));out.push(r);return out}
const chain=r=>pre(r).map(rs).join(" → ");
function chip(d){
  const r=d.research||[];
  if(!r.length)return d.researchNote?"free?":"";
  return rs(r[0])+(r.length>1?" +"+(r.length-1):"");
}
function resTip(d){
  const r=d.research||[];
  if(!r.length)return d.researchNote||"";
  return r.map(chain).join("\n");
}

// ---- state
// S.blocks holds blocks (layout cells) AND buildables (floor cells): {id,cls,x,y,h,rot,pid}
let S={name:"Untitled station",blocks:[],dm:[],closed:[]};   // closed = doorway keys "h|x|y|V/H"
let uid=1,layer=0,sel=new Set(),active=null,placeRot=0,clip=[],pasting=null,hover={x:0,y:0};
let view="L",tab="b";
let undoS=[],redoS=[];
const VL={ox:360,oy:220,z:1},VF={ox:60,oy:60,z:1,init:false};
let V=VL;const CELLS={L:32,F:20};
const sc=()=>CELLS[view]*V.z;
const FC=16,DW=2;   // floor cells per block cell, doorway width
const snap=()=>JSON.stringify({b:S.blocks,n:S.name,ov:OV,d:S.dm,c:S.closed});
let ASH=false,ASO=false,AST=0;const ASK="msfb.state";   // autosave: hold (after New), enabled (after restore), debounce timer
function push(){ASH=false;undoS.push(snap());if(undoS.length>200)undoS.shift();redoS=[]}
function restore(s){ASH=false;const o=JSON.parse(s);S.blocks=o.b;S.name=o.n;OV=o.ov;if(o.d)S.dm=o.d;S.closed=o.c||[];saveOV();sel=new Set([...sel].filter(i=>S.blocks.some(b=>b.id===i)));$("name").value=S.name;all()}
function undo(){if(!undoS.length)return;redoS.push(snap());restore(undoS.pop())}
function redo(){if(!redoS.length)return;undoS.push(snap());restore(redoS.pop())}

const dimOf=(d,rot)=>{const w=d?d.w:1,h=d?d.h:1;return rot&1?{w:h,h:w}:{w,h}};
const dim=b=>dimOf(def(b.cls),b.rot);
const catOf=b=>def(b.cls)?def(b.cls).category:null;
const isM=b=>kindOf(b.cls)==="m";
const inView=b=>isM(b)===(view==="F");
const DIR=[[1,0],[0,1],[-1,0],[0,-1]];   // rot 0..3 = east, south, west, north (unverified vs game)
const SHIPEND=b=>{const d=def(b.cls);return !!(d&&d.shipEnd)};   // Industrial Dock: game box 2x2, drawn station row, rot = ship direction

