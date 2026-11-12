function recipesHtml(d,b){
  const rs=recsOf(d);if(!rs.length)return"";
  const nm=id=>(ITEMS[id]||{}).n||String(id).replace(/^ITEM_/,"");
  return `<h2>Recipes (${rs.length})</h2><div class="pad"><div class="rgrid">`
    +rs.map(r=>{const tip=r.i.map(x=>x[1]+"x "+nm(x[0])).join(" + ")+" -> "+r.o[1]+"x "+nm(r.o[0])+(r.t==null?"":" | "+secs(r.t)+" s")+" | "+rateTxt(pm(r.o[1],r.t));
      return `<div class="rtile${b&&b.rec===rk(r)?" sel":""}"${b?` data-rk="${esc(rk(r))}" role="button" tabindex="0"`:""} title="${esc(tip)}">${iurl(r.o[0])?`<img class="ic" alt="" src="${iurl(r.o[0])}">`:""}<span class="rn">${esc(nm(r.o[0]))}</span></div>`}).join("")
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
      if(nmOk(one.cls))h+='<div class="row"><label for="fnm">Name</label><input id="fnm" type="text" data-nm="1" value="'+esc(one.nm||"")+'"></div>';
      const et=entText(one);if(et)h+='<div class="sub" title="'+esc(ENT_HINT)+'" id="entInfo"><b>'+et.kind+':</b> '+et.sides.join(", ")+'<br>'+esc(ENT_HINT)+'.</div>';
      if(F){
        if(one.h===layer&&outside(one,A.rects))h+='<div class="warnline">'+esc(WARN)+'</div>';
        const u=ugWarn().get(one.id);if(u)h+='<div class="warnline">Underground: length '+u.n+' &gt; max '+u.max+'</div>';
      }else{
        const fr=floorRect(one),fo=fcell(one);
        if(fr)h+='<div class="sub">Floor '+fr.w+'&times;'+fr.h+(fr.known?(fr.guess?" "+BQ:""):" "+BQ)+(dv(one)?"":" &middot; "+(doorTxt(one).endsWith("!?")?"doors "+BQ:doorTxt(one)))+'</div>';
        if(dd&&dd.elevator)h+='<div class="sub">Elevator centre '+dd.elevator.w+'&times;'+dd.elevator.h+' blocked</div>';
        const n=S.blocks.filter(m=>isM(m)&&m.h===one.h&&m.x>=fo.cx*FC&&m.x<(fo.cx+fo.cw)*FC&&m.y>=fo.cy*FC&&m.y<(fo.cy+fo.ch)*FC).length;
        h+='<div class="sub">'+n+' buildable'+(n===1?"":"s")+' on this block (level '+(one.h+1)+')</div>';
      }
    }
    h+='</div>';
    if(one&&F&&one.h===layer)h+=(isBelt(one)?"":rateHtml(one))+linkHtml(one)+(isBelt(one)?beltRateHtml(one):isStore(one)?storeHtml(one):"");
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
      sz='<div class="kv" style="margin-bottom:6px">'+esc(tcls)+'</div>'+(d.source?'<div class="sub">source: '+esc(nog(d.source))+'</div>':"")
      +(d.note?'<div class="sub">'+esc(nog(d.note))+'</div>':"")
      +(d.kind==="m"&&d.evidence?'<div class="sub">'+esc(nog(d.evidence))+'</div>':"")
      +(d.kind==="m"?'<div class="sub">Size '+d.w+'&times;'+d.h+' floor cells'+(d.directional?' &middot; directional (rot 0 = east, 90&deg; steps clockwise)':"")+'</div>':"")
      +(d.maxApart!=null?'<div class="sub">Max length: '+d.maxApart+' cells, entrance to exit inclusive (warning only)</div>':"")
      +'<div class="row"><label for="tw">Width</label><input id="tw" type="number" min="1" step="1" data-t="w" value="'+d.w+'"></div>'
      +'<div class="row"><label for="th">Depth</label><input id="th" type="number" min="1" step="1" data-t="h" value="'+d.h+'"></div>'
      +(d.kind==="b"?'<div class="row"><label for="tfw">Floor W</label><input id="tfw" type="number" min="1" step="1" data-t="fw" placeholder="unknown" value="'+(d.fw==null?"":d.fw)+'"></div><div class="row"><label for="tfh">Floor H</label><input id="tfh" type="number" min="1" step="1" data-t="fh" placeholder="unknown" value="'+(d.fh==null?"":d.fh)+'"></div>':"")
      +(d.speed?'<div class="row"><label>Speed</label><span>'+(d.speed.itemsPerMin==null?"unknown":d.speed.itemsPerMin+" items/min")+'</span></div>':"")
      +(d.input?'<div class="row"><label>Input</label><span style="display:flex;gap:6px;align-items:center">'+(iurl(d.input.icon)?'<img class="ic" alt="" src="'+iurl(d.input.icon)+'">':"")+esc(d.input.name)+'</span></div>':"")
      +(d.portsLayout?'<div class="sub">Ports (positions 1-based along each side, comma separated)</div>'
      +FN.map(f=>'<div class="row"><label for="pl'+f+'">'+f+'</label><input id="pl'+f+'" type="text" data-pl="1" value="'+d.portsLayout.ports.filter(q=>q.face===f).map(q=>q.pos).join(",")+'"></div>').join("")
      +'<div class="row chk"><input id="plt" type="checkbox" data-pl="1" '+(d.portsLayout.toggleable?"checked":"")+'><label for="plt">ports toggleable</label></div>'
      +'<div class="row chk"><input id="plv" type="checkbox" data-pl="1" '+(d.portsLayout.verified?"checked":"")+'><label for="plv">ports verified</label></div>'
      +(d.portsLayout.source?'<div class="sub">'+esc(nog(d.portsLayout.source))+'</div>':""):"")
      +'<div class="row"><label for="tc">Category</label><input id="tc" type="text" list="catl" data-t="category" value="'+esc(d.category)+'"><datalist id="catl">'+cats(d.kind).map(c=>'<option value="'+esc(c)+'">').join("")+'</datalist></div>'
      +'<div class="row chk"><input id="tv" type="checkbox" data-t="verified" '+(d.verified?"checked":"")+'><label for="tv">verified</label></div>'
      +factsHtml(d);
      h+=sec("size","Size &amp; data"+(d.verified?"":" "+BQ),sz);
      h+=recipesHtml(d,one&&isM(one)?one:null)+resHtml(d);
    }
  }
  if(!one&&F&&SM&&SIM)h+=sec("sim","Simulation live",'<div id="simLive">'+simLiveHtml(null)+'</div>');
  const nOv=Object.keys(OV).length,nM=S.blocks.filter(isM).length,dc=A.doors.filter(r=>!r.open).length;
  h+=sec("ov","Overview",'<div class="sub">'+(S.blocks.length-nM)+' blocks &middot; '+nM+' buildables &middot; '+S.blocks.filter(b=>b.h===layer&&inView(b)).length+' on level '+(layer+1)+' here &middot; '+(A.doors.length-dc)+' doors open / '+dc+' closed (level '+(layer+1)+') &middot; '+S.dm.length+' other default machines kept &middot; '+nOv+' catalog overrides</div>'
  +'<div class="btns"><button id="bClear" class="danger">Clear all</button><button id="bResetCat" '+(nOv?"":"disabled")+'>Reset catalog edits</button></div>');
  $("insp").innerHTML=h;
}
$("insp").addEventListener("toggle",e=>{const k=e.target.dataset&&e.target.dataset.sec;if(!k)return;e.target.open?io.add(k):io.delete(k);asv()},true);
$("insp").addEventListener("change",e=>{
  const t=e.target,bs=S.blocks.filter(b=>sel.has(b.id));
  if(t.dataset.port&&bs.length===1){push();togglePort(bs[0],t.dataset.port);all();return}
  if(t.dataset.nm&&bs.length===1){const v=t.value.trim();if(v===(bs[0].nm||""))return;push();if(v)bs[0].nm=v;else delete bs[0].nm;all();return}
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
  const cd=e.target.closest&&e.target.closest("[data-ctdel]");
  if((cd||id==="bCtAdd")&&S.blocks.filter(q=>sel.has(q.id)).length===1){
    const m=S.blocks.find(q=>sel.has(q.id)),ct=m.ct||[];
    if(cd){push();const i=+cd.dataset.ctdel;m.ct=ct.filter((x,j)=>j!==i);all()}
    else{const it=$("ctAdd").value;if(it&&!ct.some(x=>x.item===it)){push();m.ct=ct.concat([{item:it,n:0,inf:false}]);all()}}
    return}
  const rr=e.target.closest&&e.target.closest("[data-rk]"),bs1=S.blocks.filter(q=>sel.has(q.id));
  if((rr||id==="bRecClr")&&bs1.length===1&&isM(bs1[0])){push();const m=bs1[0];if(id==="bRecClr"||m.rec===rr.dataset.rk)delete m.rec;else m.rec=rr.dataset.rk;all();return}
  if(id==="bRot")rotate();
  else if(id==="bDel")del();
  else if(id==="bCfgCopy"&&typeof cfgCopy==="function")cfgCopy();else if(id==="bCfgPaste"&&typeof cfgPasteMode==="function")cfgPasteMode();
  else if(id==="bDup"){const nb=S.blocks.filter(b=>sel.has(b.id)).map(b=>({...b,raw:null,id:uid++,mid:0,x:b.x+1,y:b.y+1}));if(noBuild(nb.filter(isM).map(mItem))){toast(NOBUILD);return}push();S.blocks.push(...nb);sel=new Set(nb.map(b=>b.id));all()}
  else if(id==="bStop"){active=null;all()}
  else if(id==="bClear"){if(S.blocks.length&&confirm("Remove all blocks and buildables?")){push();S.blocks=[];S.closed=[];sel=new Set();all()}}
  else if(id==="bResetCat"){if(confirm("Discard all catalog edits (size, floor, category, verified)?")){push();OV={};saveOV();all()}}
});

