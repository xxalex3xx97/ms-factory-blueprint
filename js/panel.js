function recipesHtml(d,b){
  const rs=recsOf(d);if(!rs.length)return"";
  const nm=id=>(ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,"");
  const oc=new Map();rs.forEach(q=>oc.set(q.o[0],(oc.get(q.o[0])||0)+1));   // output counts once per call (alternate-recipe star)
  return `<h2>Recipes (${rs.length})</h2><div class="pad"><div class="rgrid">`
    +rs.map(r=>{const tip=r.i.map(x=>x[1]+"x "+nm(x[0])).join(" + ")+" -> "+r.o[1]+"x "+nm(r.o[0])+(r.t==null?"":" | "+secs(r.t)+" s")+" | "+rateTxt(pm(r.o[1],r.t));
      const en=r.i.some(x=>/^ITEM_Enriched.*Ore$/.test(x[0])),alt=oc.get(r.o[0])>1,st=en||alt?` <span class="star">&#9733;</span>`:"";   // star: uses enriched raw ore, or an alternate recipe for the same output
      return `<div class="rtile${b&&b.rec===rk(r)?" sel":""}"${b?` data-rk="${esc(rk(r))}" role="button" tabindex="0"`:""} title="${esc(tip+(en?" | enriched ore":"")+(alt?" | alternate recipe":""))}">${iurl(r.o[0])?`<img class="ic" alt="" src="${iurl(r.o[0])}">`:""}<span class="rn">${esc(nm(r.o[0]))}${st}</span></div>`}).join("")
    +`</div>`+(b&&b.rec?`<div class="btns"><button id="bRecClr">Clear recipe</button></div>`:"")
    +`</div>`;
}
const RST=m=>m&&m.st?'<span class="st st-'+esc(m.st)+'">'+esc(m.st)+'</span>':"";
function sumBody(b,d){
  const r=recOf(b),sm=SM&&SIM&&smS(),m=sm&&sm.mach.get(b.id),c=sm&&sm.cont.get(b.id),l=sm&&sm.load.get(b.id),F=view==="F";
  let x="";
  if(d&&recsOf(d).length)x+='<div class="kv">'+(r?itemHtml(r.o[0]):'<span class="sub">no recipe, pick one below</span>')+(m?" "+RST(m):"")+'</div>';
  if(r){
    const o=pm(r.o[1],r.t);
    x+='<div class="kv">in <b>'+r.i.map(q=>pm(q[1],r.t)).join(" + ")+'</b> &middot; out <b>'+(o==null?"n/a":o)+'</b> /min</div>';
    if(F&&b.h===layer){const w=supplyRows(b,links(layer)).filter(q=>q.st!=="ok").sort((p,q)=>(p.st==="none")-(q.st==="none"))[0];
      x+=w?'<div class="sup-'+w.st+'">'+(w.st==="none"?"no supply":"short")+": "+itemHtml(w.item)+" "+w.have+"/"+w.need+"</div>":'<div class="sup-ok">supplied</div>'}
  }
  if(c)x+='<div class="kv">in <b>'+c.in+'</b> &middot; out <b>'+c.out+'</b> &middot; net <b>'+sgn(c.net)+'</b> /min</div>';
  if(l&&isBelt(b))x+='<div class="kv">load <b>'+l.tot+(l.cap?" / "+l.cap:"")+'</b> /min</div>';
  return x;
}
// item filters: splitter / balancer outputs (b.fl, strings like "waterice") and dock slots (b.df {item,bLoading}); empty = no filter
const fkey=id=>id.slice(5).toLowerCase(),FITEMS=Object.keys(ITEMS).sort((a,b)=>(ITEMS[a].n||a).localeCompare(ITEMS[b].n||b));
const SPL_LBL=["Right","Front","Left"];
function filtHtml(b){
  const dn=dkN(b.cls),sp=!dn&&isM(b)&&cfgKind(b.cls)==="splitter";if(!dn&&!sp)return"";
  const n=dn||(b.fl?b.fl.length:isBalCls(b.cls)?2:3),cur=i=>dn?((b.df||[])[i]||{}).item||"":(b.fl||[])[i]||"";
  return sec("filt","Filters",Array.from({length:n},(_,i)=>{const c=cur(i).toLowerCase(),id=FITEMS.find(q=>fkey(q)===c),ic=id&&iurl(id);
    return `<div class="row"><label for="fl${i}">${dn?i+1:isBalCls(b.cls)?i+1:(SPL_LBL[i]||i+1)}</label><button type="button" id="fl${i}" class="fbtn" data-${dn?"df":"fl"}="${i}">`
      +(c?(ic?`<img class="ic" alt="" src="${ic}">`:"")+esc(id?ITEMS[id].n||id:c):"(no filter)")+`<span class="caret">&#9662;</span></button></div>`}).join(""));
}
function panel(){
  const bs=S.blocks.filter(b=>sel.has(b.id));
  const one=bs.length===1?bs[0]:null;
  const tcls=one?one.cls:(!bs.length?active:null);
  const F=view==="F",A=areas(layer);
  const ico=d=>iurl(d.icon)?'<img class="ic big" alt="" src="'+iurl(d.icon)+'">':"";
  const dd=tcls?def(tcls):null;
  let h="",sz="";
  if(bs.length){
    if(one){
      if(dd)h+='<div class="sum"><div class="sn">'+ico(dd)+'<b>'+esc(lab(dd))+'</b>'+(dd.verified?"":BQ)+'</div><div id="sumLive">'+sumBody(one,dd)+'</div></div>';
      else h+='<div class="sub pad">Unknown class: shown as grey 1&times;1, kept as-is on export.</div>';
    }else h+='<h2>Selection ('+bs.length+')</h2>';
    h+='<div class="pad"><div class="btns"><button id="bRot">Rotate</button><button id="bDup">Duplicate</button><button id="bDel" class="danger">Delete</button></div><div class="btns">'+(one&&isM(one)?'<button id="bCfgCopy">Copy config</button>':'')+'<button id="bCfgPaste"'+(typeof cfgClip!=="undefined"&&cfgClip?'':' disabled')+'>Paste config</button></div>';
    if(one){
      if(F&&rsOk(one.cls)){const rs=one.rs||"",id=FITEMS.find(q=>fkey(q)===rs),ic=id&&iurl(id);h+='<div class="row"><label for="frs">Mines</label><button type="button" id="frs" class="fbtn" data-rs="1">'+(rs?(ic?'<img class="ic" alt="" src="'+ic+'">':"")+esc(id?ITEMS[id].n||id:rs):"(not set)")+'<span class="caret">&#9662;</span></button></div>'}
      if(nmOk(one.cls))h+='<div class="row"><label for="fnm">Name</label><input id="fnm" type="text" data-nm="1" value="'+esc(one.nm||"")+'"></div>';
      h+=filtHtml(one);
      const et=entText(one);if(et)h+='<div class="sub" title="'+esc(ENT_HINT)+'" id="entInfo"><b>'+et.kind+':</b> '+et.sides.join(", ")+'<br>'+esc(ENT_HINT)+'.</div>';
      if(F){
        if(one.h===layer&&outside(one,A.rects))h+='<div class="warnline">'+esc(WARN)+'</div>';
        const u=ugWarn().get(one.id);if(u)h+='<div class="warnline">Underground: length '+u.n+' &gt; max '+u.max+'</div>';
      }else{
        const fr=floorRect(one),fo=fcell(one);
        if(fr)h+='<div class="sub">Floor '+fr.w+'&times;'+fr.h+(fr.known?(fr.guess?" "+BQ:""):" "+BQ)+(dv(one)?"":" &middot; "+(doorTxt(one).endsWith("!?")?"doors "+BQ:doorTxt(one)))+'</div>';
        if(dd&&dd.elevator&&!dd.elevator.hid)h+='<div class="sub">Elevator centre '+dd.elevator.w+'&times;'+dd.elevator.h+' blocked</div>';
        const n=S.blocks.filter(m=>isM(m)&&m.h===one.h&&m.x>=fo.cx*FC&&m.x<(fo.cx+fo.cw)*FC&&m.y>=fo.cy*FC&&m.y<(fo.cy+fo.ch)*FC).length;
        h+='<div class="sub">'+n+' buildable'+(n===1?"":"s")+' on this block (level '+(one.h+1)+')</div>';
      }
    }
    h+='</div>';
    if(one&&F&&one.h===layer)h+=(isBelt(one)?"":rateHtml(one))+(isBelt(one)?beltRateHtml(one):isStore(one)?storeHtml(one):"");
    if(one&&F&&SM&&SIM)h+=sec("sim","Simulation live",'<div id="simLive">'+simLiveHtml(one)+'</div>');
    if(one){
      if(F&&one.h===layer)h+=portsHtml(one);
      h+=sec("pos","Position &amp; rotation",'<div class="row"><label for="fx">'+(F?"Floor X":"X")+'</label><input id="fx" type="number" step="1" data-b="x" value="'+one.x+'"></div>'
        +'<div class="row"><label for="fy">'+(F?"Floor Y":"Y")+'</label><input id="fy" type="number" step="1" data-b="y" value="'+one.y+'"></div>'
        +'<div class="row"><label for="fh">Level</label><input id="fh" type="number" step="1" data-b="h" value="'+(one.h+1)+'"></div>'
        +'<div class="row"><label for="fr">Rotation</label><select id="fr" data-b="rot">'+[0,1,2,3].map(r=>'<option '+(r===one.rot?"selected":"")+' value="'+r+'">'+r+' ('+r*90+'&deg;)</option>').join("")+'</select></div>');
    }
  }else if(active){
    h+='<h2>Placing</h2><div class="pad"><div class="sub">Rotation '+placeRot+'. <kbd>Esc</kbd> stops.</div><div class="btns"><button id="bStop">Stop placing</button></div></div>';
  }else h+='<h2>'+(F?"Factory floor":"Blueprint")+'</h2><div class="pad"><div class="sub">'+(F?"Pick a buildable, or click items to select.":"Pick a block, or click blocks to select. Double-click a block to open its factory floor.")+'</div></div>';
  if(tcls){
    const d=dd;
    if(!one){
      h+='<h2>'+(d&&d.kind==="m"?"Buildable":"Block")+' type</h2><div class="pad">'+(d?'<div class="sn">'+ico(d)+'<b>'+esc(lab(d))+'</b>'+(d.verified?"":BQ)+'</div>':'<div class="sub">Unknown class: shown as grey 1&times;1, kept as-is on export.</div>')+'</div>';
    }
    if(d){
      sz=(d.speed?'<div class="row"><label>Speed</label><span>'+(d.speed.itemsPerMin==null?"unknown":d.speed.itemsPerMin+" items/min")+'</span></div>':"")
      +(d.input?'<div class="row"><label>Input</label><span style="display:flex;gap:6px;align-items:center">'+(iurl(d.input.icon)?'<img class="ic" alt="" src="'+iurl(d.input.icon)+'">':"")+esc(d.input.name)+'</span></div>':"")
      +factsHtml(d);
      h+=sec("size","Data"+(d.verified?"":" "+BQ),sz);
      h+=recipesHtml(d,one&&isM(one)?one:null)+resHtml(d);
    }
  }
  if(!one&&F&&SM&&SIM)h+=sec("sim","Simulation live",'<div id="simLive">'+simLiveHtml(null)+'</div>');
  const nOv=Object.keys(OV).length,nM=S.blocks.filter(isM).length,dc=A.doors.filter(r=>!r.open).length;
  h+=sec("ov","Overview",'<div class="sub">'+(S.blocks.length-nM)+' blocks &middot; '+nM+' buildables &middot; '+S.blocks.filter(b=>onLv(b)&&inView(b)).length+' on level '+(layer+1)+' here &middot; '+(A.doors.length-dc)+' doors open / '+dc+' closed (level '+(layer+1)+') &middot; '+S.dm.length+' other default machines kept &middot; '+nOv+' catalog overrides</div>'
  +'<div class="btns"><button id="bClear" class="danger">Clear all</button><button id="bResetCat" '+(nOv?"":"disabled")+'>Reset catalog edits</button></div>');
  $("insp").innerHTML=h;
}
$("insp").addEventListener("toggle",e=>{const k=e.target.dataset&&e.target.dataset.sec;if(!k)return;e.target.open?io.add(k):io.delete(k);asv()},true);
$("insp").addEventListener("change",e=>{
  const t=e.target,bs=S.blocks.filter(b=>sel.has(b.id));
  if(t.dataset.prio&&bs.length===1){push();togglePrio(bs[0],t.dataset.prio);all();return}
  if(t.dataset.nm&&bs.length===1){const v=t.value.trim();if(v===(bs[0].nm||""))return;push();if(v)bs[0].nm=v;else delete bs[0].nm;delete bs[0].cfgKeep;all();return}
  if(t.dataset.ct&&bs.length===1){
    const m=bs[0],i=+t.dataset.i;push();
    SV++;m.ct=(m.ct||[]).map((x,j)=>j!==i?x:t.dataset.ct==="inf"?{...x,inf:t.checked}:{...x,n:Math.max(0,Math.round(Number(t.value))||0)});all();return}
  if(t.dataset.pl){
    const cls=bs.length===1?bs[0].cls:active;if(!cls||!BASE[cls]||!BASE[cls].portsLayout)return;
    const old=def(cls).portsLayout,ports=[];
    FN.forEach(f=>$("pl"+f).value.split(",").map(v=>parseInt(v,10)).filter(v=>v>=1).forEach(pos=>{const o=old.ports.find(q=>q.face===f&&q.pos===pos);ports.push({face:f,pos,dir:o?o.dir:null})}));
    push();setOV(cls,"portsLayout",{toggleable:$("plt").checked,verified:$("plv").checked,source:old.source||"user edit",ports});all();return;
  }
  if(t.dataset.b&&bs.length===1){
    const cr=!isM(bs[0])&&"xyh".includes(t.dataset.b)&&carryOf([bs[0]]);
    push();const v=t.dataset.b==="h"?(parseInt(t.value,10)||1)-1:parseInt(t.value,10)||0,f0=t.dataset.b,o0=bs[0][f0];bs[0][f0]=v;if(cr)cr(f0==="x"?v-o0:0,f0==="y"?v-o0:0,f0==="h"?v-o0:0);
    if(isM(bs[0])&&noBuild([mItem(bs[0])])){bs[0][f0]=o0;undoS.pop();toast(NOBUILD);all();return}
    if(t.dataset.b==="h"&&v!==layer)sel=new Set();
    all();
  }else if(t.dataset.t){
    const cls=bs.length===1?bs[0].cls:active;if(!cls||!BASE[cls])return;
    push();const f=t.dataset.t;
    const v=f==="verified"?t.checked:f==="category"?(t.value.trim()||BASE[cls].category):(f==="fw"||f==="fh")?(t.value.trim()===""?null:Math.max(1,parseInt(t.value,10)||1)):Math.max(1,parseInt(t.value,10)||1);
    setOV(cls,f,v);all();
  }
});
$("insp").addEventListener("click",e=>{
  const id=e.target.id;
  const rb=e.target.closest&&e.target.closest("button[data-rs]");
  if(rb&&S.blocks.filter(q=>sel.has(q.id)).length===1){
    rsPick(S.blocks.find(q=>sel.has(q.id)),rb);
    return;
  }
  const pk=e.target.closest&&e.target.closest("button[data-port]");
  if(pk&&S.blocks.filter(q=>sel.has(q.id)).length===1){push();togglePort(S.blocks.find(q=>sel.has(q.id)),pk.dataset.port);all();return}
  const pa=e.target.closest&&e.target.closest("button[data-pall]");
  if(pa&&S.blocks.filter(q=>sel.has(q.id)).length===1){push();setAllPorts(S.blocks.find(q=>sel.has(q.id)),pa.dataset.pall==="1");all();return}
  const fb=e.target.closest&&e.target.closest("button[data-fl],button[data-df]");
  if(fb&&S.blocks.filter(q=>sel.has(q.id)).length===1){
    const m=S.blocks.find(q=>sel.has(q.id)),i=+(fb.dataset.fl??fb.dataset.df),dn=dkN(m.cls);
    const cur=dn?((m.df||[])[i]||{}).item||"":(m.fl||[])[i]||"";
    const lbl=dn?"Bay "+(i+1):(isBalCls(m.cls)?"Output "+(i+1):(SPL_LBL[i]||"Output "+(i+1)));
    pickItem((def(m.cls).label||"Filter")+" "+lbl+" filter",cur,key=>{setSlot(m,i,key);all()});
    return;
  }
  const cd=e.target.closest&&e.target.closest("[data-ctdel]");
  const cb=e.target.closest&&e.target.closest("#bCtAdd");
  if((cd||cb)&&S.blocks.filter(q=>sel.has(q.id)).length===1){
    const m=S.blocks.find(q=>sel.has(q.id)),ct=m.ct||[];
    if(cd){push();const i=+cd.dataset.ctdel;m.ct=ct.filter((x,j)=>j!==i);all()}
    else inlinePick(cb,FITEMS.filter(q=>!ct.some(x=>x.item===q)),it=>{if(!(m.ct||[]).some(x=>x.item===it)){push();m.ct=(m.ct||[]).concat([{item:it,n:0,inf:false}]);all()}});
    return}
  const rr=e.target.closest&&e.target.closest("[data-rk]"),bs1=S.blocks.filter(q=>sel.has(q.id));
  if((rr||id==="bRecClr")&&bs1.length===1&&isM(bs1[0])){push();const m=bs1[0];if(id==="bRecClr"||m.rec===rr.dataset.rk)delete m.rec;else m.rec=rr.dataset.rk;all();return}
  if(id==="bRot")rotate();
  else if(id==="bDel")del();
  else if(id==="bCfgCopy"&&typeof cfgCopy==="function")cfgCopy();else if(id==="bCfgPaste"&&typeof cfgPasteMode==="function")cfgPasteMode();
  else if(id==="bDup"){
    const L=view==="L",src=S.blocks.filter(b=>sel.has(b.id)),fl=L?[...floorOn(src.filter(b=>!isM(b)))].filter(q=>!sel.has(q.id)):[],o=b=>L&&isM(b)?FC:1;
    const nb=ugRelink(src.concat(fl).map(b=>({...b,raw:null,oid:b.id,id:uid++,mid:0,x:b.x+o(b),y:b.y+o(b)})));
    const nn=nb.filter(b=>!isM(b)),nbs=new Set(nn.map(b=>b.id));S.blocks.push(...nn);
    let bad;const mi=nb.filter(isM).map(mItem);try{bad=noBuildWhy(mi)}finally{S.blocks=S.blocks.filter(b=>!nbs.has(b.id))}
    if(bad.length){placeRefused(bad,"Duplicate",0,false,nb.length,mi.length,{x:o(src[0]||{}),y:o(src[0]||{})});return}
    placeOk("Duplicate",0,false,nb.length,mi.length);push();S.blocks.push(...nb);sel=new Set((L&&nn.length?nn:nb).map(b=>b.id));all()}
  else if(id==="bStop"){active=null;all()}
  else if(id==="bClear"){if(S.blocks.length&&confirm("Remove all blocks and buildables?")){push();S.blocks=[];S.closed=[];S.conn=[];sel=new Set();all()}}
  else if(id==="bResetCat"){if(confirm("Discard all catalog edits (size, floor, category, verified)?")){push();OV={};saveOV();all()}}
});


// write one filter slot of a dock (b.df) or splitter/balancer (b.fl); key "" clears it
function setSlot(b,i,key){
  const dn=dkN(b.cls),old=dn?((b.df||[])[i]||{}).item||"":(b.fl||[])[i]||"";
  if(String(old).toLowerCase()===String(key).toLowerCase())return;
  push();
  if(dn){const a=Array.from({length:dn},(_,j)=>({item:"",bLoading:0,...((b.df||[])[j]||{})}));a[i].item=key;if(a.some(f=>f.item))b.df=a;else delete b.df}
  else{const n=b.fl?b.fl.length:isBalCls(b.cls)?2:3,a=Array.from({length:n},(_,j)=>(b.fl||[])[j]||"");a[i]=key;if(a.some(Boolean))b.fl=a;else delete b.fl}
  delete b.cfgKeep;
}
// click a dock bay square (canvas) or a filter button (inspector): select2-style item picker, onPick(key) with key "" = no filter
function pickItem(title,cur,onPick,ids,none){
  cur=String(cur||"").toLowerCase();const d=$("dBay"),L=$("bayL"),inp=$("bayIn");$("bayT").textContent=title;
  const rows=[{id:"",n:none||"(no filter)"},...(ids||FITEMS).map(id=>({id,n:ITEMS[id].n||id}))];
  let shown=rows,on=0;
  const render=()=>{L.innerHTML=shown.map((r,k)=>'<li role="option" data-k="'+k+'"'+(k===on?' class="on" aria-selected="true"':'')+'>'+(iurl(r.id)?'<img class="ic" alt="" src="'+iurl(r.id)+'">':'<span class="ic"></span>')+esc(r.n)+'</li>').join("");const e=L.querySelector(".on");if(e)e.scrollIntoView({block:"nearest"})};
  const find=()=>{const q=inp.value.trim().toLowerCase();shown=[rows[0],...rows.slice(1).filter(r=>!q||r.n.toLowerCase().includes(q))];on=q?Math.min(1,shown.length-1):Math.max(0,shown.findIndex(r=>r.id&&fkey(r.id)===cur));render()};
  const pick=id=>{d.close();onPick(id?fkey(id):"")};
  inp.value="";inp.oninput=find;
  inp.onkeydown=e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();on=Math.max(0,Math.min(shown.length-1,on+(e.key==="ArrowDown"?1:-1)));render()}else if(e.key==="Enter"){e.preventDefault();if(shown[on])pick(shown[on].id)}};
  L.onclick=e=>{const li=e.target.closest("li");if(li)pick(shown[+li.dataset.k].id)};
  $("bayX").onclick=()=>d.close();
  find();d.showModal();inp.focus();
}
// canvas dock square: picker for that bay's slot
// drone bay ore picker (inspector button + canvas square): the 6 ores, one ore for both ports
function rsPick(m,btn){
  const cur=m.rs||"",ids=[...new Set(RSL.concat(cur||[]))].map(k=>FITEMS.find(q=>fkey(q)===k)).filter(Boolean),set=key=>{if(key!==(m.rs||"")){push();if(key)m.rs=key;else delete m.rs}sel=new Set([m.id]);all()};
  if(btn)inlinePick(btn,ids,id=>set(id?fkey(id):""),"(not set)");   // inspector button: inline dropdown; canvas square (no anchor): dialog like the dock bays
  else pickItem((def(m.cls).label||"Drone bay")+" mines",cur,key=>set(key),ids,"(not set)");
}
// inline select2 under a button (no dialog): search box + icon list; click the button again, Esc or a click outside closes it
function inlinePick(btn,ids,onPick,none){
  const old=$("ipop");if(old){old.remove();return}
  const d=document.createElement("div");d.id="ipop";d.className="ipop";d.innerHTML='<input type="text" placeholder="Search item..." aria-label="Search item" autocomplete="off" role="combobox"><ul role="listbox"></ul>';
  btn.parentNode.appendChild(d);
  const inp=d.firstChild,L=d.lastChild,rows=(none?[{id:"",n:none}]:[]).concat(ids.map(id=>({id,n:ITEMS[id].n||id})));let shown=rows,on=0;
  const close=()=>{d.remove();document.removeEventListener("pointerdown",out,true)},out=e=>{if(!d.contains(e.target)&&!btn.contains(e.target))close()};
  const render=()=>{L.innerHTML=shown.map((r,k)=>'<li role="option" data-k="'+k+'"'+(k===on?' class="on" aria-selected="true"':'')+'>'+(iurl(r.id)?'<img class="ic" alt="" src="'+iurl(r.id)+'">':'<span class="ic"></span>')+esc(r.n)+'</li>').join("");const e=L.querySelector(".on");if(e)e.scrollIntoView({block:"nearest"})};
  const pick=r=>{close();onPick(r.id)};
  inp.oninput=()=>{const q=inp.value.trim().toLowerCase();shown=rows.filter(r=>!q||r.n.toLowerCase().includes(q));on=0;render()};
  inp.onkeydown=e=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();on=Math.max(0,Math.min(shown.length-1,on+(e.key==="ArrowDown"?1:-1)));render()}else if(e.key==="Enter"){e.preventDefault();if(shown[on])pick(shown[on])}else if(e.key==="Escape"){e.stopPropagation();close();btn.focus()}};
  L.onclick=e=>{const li=e.target.closest("li");if(li)pick(shown[+li.dataset.k])};
  document.addEventListener("pointerdown",out,true);render();inp.focus();
}
function bayFilter(b,i){
  if(i<0)return rsPick(b);
  pickItem((def(b.cls).label||"Dock")+" bay "+(i+1)+" filter",((b.df||[])[i]||{}).item||"",key=>{setSlot(b,i,key);sel=new Set([b.id]);all()});
}
