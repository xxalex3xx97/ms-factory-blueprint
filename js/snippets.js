// ---- snippet library (localStorage msfb.snippets): [{n:name,b:[block copies]}]
const SNK="msfb.snippets";let SN=[];
const snOk=s=>s&&typeof s.n==="string"&&Array.isArray(s.b)&&s.b.length;
try{const o=JSON.parse(localStorage.getItem(SNK));if(Array.isArray(o))SN=o.filter(snOk)}catch(_){}
const snSave=()=>{try{localStorage.setItem(SNK,JSON.stringify(SN))}catch(_){}};
function snUniq(n,skip){const b=String(n).trim()||"Snippet";let k=1,u=b;while(SN.some((s,i)=>i!==skip&&s.n===u))u=b+" ("+(++k)+")";return u}
function snAdd(name){if(!sel.size)return null;const b=S.blocks.filter(x=>sel.has(x.id)).map(x=>JSON.parse(JSON.stringify(x)));if(!b.length)return null;const n=snUniq(name);SN.push({n,b});snSave();snDraw();return n}
function snRename(i,name){if(!SN[i])return;SN[i].n=snUniq(name,i);snSave();snDraw()}
function snDel(i){SN.splice(i,1);snSave();snDraw()}
function snUse(i){const s=SN[i];if(!s)return;const c=s.b.map(b=>({...b}));if(isM(c[0])!==(view==="F")){toast("Switch to "+(isM(c[0])?"Factory floor":"Layout")+" view");return}clip=c;paste()}
function snExport(){return JSON.stringify({v:1,snippets:SN},null,2)}
function snImport(txt){let o;try{o=JSON.parse(txt)}catch(_){return -1}const a=(o&&Array.isArray(o.snippets)?o.snippets:[]).filter(snOk);a.forEach(s=>SN.push({n:snUniq(s.n),b:s.b}));snSave();snDraw();return a.length}
function snDraw(){const el=$("snList");if(!el)return;el.innerHTML=SN.length?SN.map((s,i)=>`<div class="snr"><button data-snuse="${i}" title="Click to paste">${esc(s.n)} <span class="sub">(${s.b.length})</span></button><button data-snren="${i}" aria-label="Rename snippet">Rename</button><button data-sndel="${i}" aria-label="Delete snippet">&times;</button></div>`).join(""):`<div class="sub">No snippets yet. Select blocks, then Save as snippet.</div>`}
$("snSave").onclick=()=>{if(!sel.size){toast("Select something first");return}const n=prompt("Snippet name");if(n==null)return;toast("Saved: "+snAdd(n))};
$("snList").onclick=e=>{const t=e.target.closest("button");if(!t)return;const d=t.dataset;if(d.snuse!=null)snUse(+d.snuse);else if(d.snren!=null){const n=prompt("New name",SN[+d.snren].n);if(n!=null)snRename(+d.snren,n)}else if(d.sndel!=null){if(confirm("Delete snippet \""+SN[+d.sndel].n+"\"?"))snDel(+d.sndel)}};
$("snExp").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([snExport()],{type:"application/json"}));a.download="snippets.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$("snImp").onchange=async e=>{const f=e.target.files[0];if(!f)return;const r=snImport(await f.text());toast(r<0?"Not a snippet file":r+" imported");e.target.value=""};
snDraw();
function frame(a,b,c,d){   // fit rect (view units) into the canvas
  {const r=cv.getBoundingClientRect();W=r.width;H=r.height}
  V.z=Math.min(view==="F"?6:4,Math.max(.1,Math.min((W-80)/((c-a)*CELLS[view]),(H-170)/((d-b)*CELLS[view]))));
  V.ox=W/2-(a+c)/2*sc();V.oy=(H+90)/2-(b+d)/2*sc();draw();
}
function fit(){
  {const r=cv.getBoundingClientRect();W=r.width;H=r.height}
  let a=1e9,b=1e9,c=-1e9,d=-1e9;
  const add=(x0,y0,x1,y1)=>{a=Math.min(a,x0);b=Math.min(b,y0);c=Math.max(c,x1);d=Math.max(d,y1)};
  if(view==="L")S.blocks.filter(k=>!isM(k)).forEach(k=>{const m=dim(k);add(k.x,k.y,k.x+m.w,k.y+m.h)});
  else{
    areas(layer).rects.forEach(r=>add(r.x,r.y,r.x+r.w,r.y+r.h));
    S.blocks.filter(k=>isM(k)&&k.h===layer).forEach(k=>{const m=dim(k);add(k.x,k.y,k.x+m.w,k.y+m.h)});
  }
  if(a>c){V.z=1;V.ox=W/2;V.oy=H/2;draw();return}
  frame(a,b,c,d);
}
$("fit").onclick=fit;
addEventListener("keydown",e=>{
  const t=e.target,typing=t.matches&&t.matches("input[type=text],input[type=number],textarea,select");
  const dlg=document.querySelector("dialog[open]");
  if(e.key==="Escape"){hideCtx();if(!dlg&&ugCancel())return;if(!dlg){active=null;pasting=null;mode=null;if(!typing)sel=new Set();all()}return}
  if(typing||dlg)return;
  const k=e.key.toLowerCase(),ctl=e.ctrlKey||e.metaKey;
  if(e.code==="Space"){if(e.target.closest&&e.target.closest("input,select,textarea,button,[contenteditable]"))return;space=true;cv.style.cursor="grab";e.preventDefault();return}
  if(ctl&&k==="z"){e.preventDefault();e.shiftKey?redo():undo()}
  else if(ctl&&k==="y"){e.preventDefault();redo()}
  else if(ctl&&k==="s"){e.preventDefault();fSave(e.shiftKey)}
  else if(ctl&&e.shiftKey&&k==="c"){e.preventDefault();cfgCopy()}
  else if(ctl&&e.shiftKey&&k==="v"){e.preventDefault();cfgPasteMode()}
  else if(ctl&&k==="x"){e.preventDefault();cut()}
  else if(ctl&&k==="c"){copy()}
  else if(ctl&&k==="v"){e.preventDefault();paste()}
  else if(ctl&&k==="a"){e.preventDefault();sel=new Set(S.blocks.filter(b=>b.h===layer&&inView(b)).map(b=>b.id));all()}
  else if(!ctl&&k==="r"){rotate()}
  else if(!ctl&&!e.altKey&&k==="x"){setMode(mode==="del"?null:"del")}
  else if(!ctl&&k==="v"&&pasting){pasting.fl=!pasting.fl;all()}
  else if(!ctl&&k==="f"){setView(view==="F"?"L":"F")}
  else if(!ctl&&!e.altKey&&/^[1-9]$/.test(k)){const c=HB[tab][+k-1];if(c&&BASE[c])pick(c)}
  else if(k==="delete"||k==="backspace"){e.preventDefault();del()}
  else if(k==="]"||k==="pageup"){setLayer(layer+1)}
  else if(k==="["||k==="pagedown"){setLayer(layer-1)}
});
addEventListener("keyup",e=>{if(e.code==="Space"){space=false;cv.style.cursor=""}});

