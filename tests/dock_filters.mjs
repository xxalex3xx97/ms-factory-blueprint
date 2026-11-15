// dock / splitter filters in the inspector + recipe stars + export round trip. Run: node tests/dock_filters.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage();const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log("PAGEERR",e)});
await p.goto(PAGE);let bad=0;const ok=(n,c)=>{if(!c)bad++;console.log((c?'PASS ':'FAIL ')+n)};
// first FITEMS key whose name contains "water" (the picker's Enter picks the first match)
const expKey=await p.evaluate(()=>{const id=FITEMS.find(id=>ITEMS[id].n.toLowerCase().includes("water"));return id?fkey(id):null});
const expName=await p.evaluate(k=>ITEMS[FITEMS.find(id=>fkey(id)===k)].n,expKey);
// inspector filter button: click it, search "water", Enter
const pickInsp=async s=>{await p.evaluate(()=>{const d=document.querySelector('#insp details[data-sec="filt"]');if(d)d.open=true});await p.click(s);await p.waitForTimeout(200);await p.fill("#bayIn","water");await p.press("#bayIn","Enter");await p.waitForTimeout(200)};
const r=await p.evaluate(()=>{
  const out={};const put=(cls,x)=>{const id=uid++;S.blocks.push({id,cls,x,y:0,h:0,rot:0,pid:0,mid:0});return id};
  const d=put(CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,0);sel=new Set([d]);all();out.dockSel=document.querySelectorAll('#insp button[data-df]').length;out.dockId=d;
  return out});
ok("industrial dock shows 8 filter buttons",r.dockSel===8);
await pickInsp('#insp button[data-df="2"]');
const rd=await p.evaluate(id=>({df:S.blocks.find(q=>q.id===id).df,txt:document.querySelector('#insp button[data-df="2"]').textContent}),r.dockId);
ok("dock inspector button: Enter sets slot 3 to "+expKey,!!(rd.df&&rd.df.length===8&&rd.df[2].item===expKey));
ok("dock inspector button shows item "+expName,rd.txt.includes(expName));
const rs=await p.evaluate(()=>{const id=uid++;S.blocks.push({id,cls:"DAT_Splitter",x:20,y:0,h:0,rot:0,pid:0,mid:0});sel=new Set([id]);layer=0;view="F";all();return{id,n:document.querySelectorAll('#insp button[data-fl]').length}});
ok("splitter shows 3 filter buttons",rs.n===3);
await pickInsp('#insp button[data-fl="1"]');
const rf=await p.evaluate(id=>({fl:S.blocks.find(q=>q.id===id).fl,txt:document.querySelector('#insp button[data-fl="1"]').textContent}),rs.id);
ok("splitter inspector button: Enter sets b.fl[1] to "+expKey,!!(rf.fl&&rf.fl.length===3&&rf.fl[1]===expKey));
ok("splitter inspector button shows item "+expName,rf.txt.includes(expName));
const st=await p.evaluate(()=>{const a=uid++;S.blocks.push({id:a,cls:"DAT_Refinery",x:40,y:0,h:0,rot:0,pid:0,mid:0});sel=new Set([a]);all();return{stars:document.querySelectorAll('#insp .rtile .star').length,tiles:document.querySelectorAll('#insp .rtile').length}});
ok("refinery recipes starred (enriched/alternate)",st.stars>0&&st.stars<st.tiles);
await p.evaluate(()=>{S.blocks=[];const id=uid++;S.blocks.push({id,cls:CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,x:2,y:2,h:0,rot:0,pid:0,mid:0});sel=new Set();layer=0;view="F";V.z=Math.max(V.z,1);all();paint0&&0});
await p.waitForTimeout(300);
// pan so the centre of BAYHIT[0] (whole square) sits at (300,300); returns its screen rect
const hit=await p.evaluate(async()=>{const q=BAYHIT[0],cxq=q.x+q.w/2,cyq=q.y+q.h/2;V.ox-=cxq-300;V.oy-=cyq-300;draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return BAYHIT.length?{n:BAYHIT.length,...BAYHIT[0],b:undefined,cr:cv.getBoundingClientRect().toJSON()}:null});
ok("dock bay squares hit-testable (8)",hit&&hit.n===8);
ok("industrial pod square big enough to click (w>10,h>5)",hit&&hit.w>10&&hit.h>5);
// pixel at the square centre (canvas bitmap coords)
const pxAt=()=>p.evaluate(h=>{const s=cv.width/cv.getBoundingClientRect().width;const d=cv.getContext('2d').getImageData(Math.round((h.x+h.w/2)*s),Math.round((h.y+h.h/2)*s),1,1).data;return [...d].join(',')},hit);
if(hit){await p.mouse.click(hit.cr.left+hit.x+4,hit.cr.top+hit.y+4);
 await p.waitForTimeout(200);const o=await p.evaluate(()=>({open:$("dBay").open,t:$("bayT").textContent}));ok("click square body opens modal "+o.t,o.open);
 const px0=await pxAt();
 await p.fill("#bayIn","water");
 const li=await p.evaluate(()=>{const L=[...document.querySelectorAll("#bayL li")];return{n:L.length,first:L[0]&&L[0].textContent}});
 ok("modal list filtered by 'water' ("+li.n+" rows)",li.n>=2&&li.n<=10);
 ok("first row is (no filter)",!!li.first&&li.first.includes("(no filter)"));
 await p.press("#bayIn","Enter");await p.waitForTimeout(200);
 ok("modal closed after Enter",!(await p.evaluate(()=>$("dBay").open)));
 const df=await p.evaluate(()=>S.blocks[0].df);
 ok("Enter sets slot "+hit.i+" to first match "+expKey+" (expect waterice)",df&&df[hit.i].item===expKey);
 // icon: wait for the cached Image of the chosen item, redraw, check pixel changed
 const key=df[hit.i].item;const iconOk=()=>p.evaluate(k=>{const id=fid(k),im=id&&img(id);return !!(im&&im.complete&&im.naturalWidth>0)},key);
 await p.waitForFunction(k=>{const id=fid(k),im=id&&img(id);return !!(im&&im.complete&&im.naturalWidth>0)},key,{timeout:5000}).catch(()=>{});
 await p.evaluate(async()=>{draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 ok("icon image cached and complete for "+key,await iconOk());
 const px1=await pxAt();
 ok("square centre pixel changes after set ("+px0+" -> "+px1+")",px0!==px1);
 // clear: click the square again, pick (no filter)
 await p.mouse.click(hit.cr.left+hit.x+4,hit.cr.top+hit.y+4);await p.waitForTimeout(200);
 await p.click("#bayL li:first-child");await p.waitForTimeout(200);
 const df2=await p.evaluate(()=>S.blocks[0].df);ok("(no filter) row clears slot (df undefined)",df2===undefined);
}
await p.evaluate(()=>{S.blocks=[];const id=uid++;S.blocks.push({id,cls:CATALOG.blocks.find(q=>q.name==="BPO_Dock").class,x:3,y:3,h:0,rot:0,pid:0,mid:0});sel=new Set();view="L";V.ox=0;V.oy=0;all()});
await p.waitForTimeout(300);
const lay=await p.evaluate(async()=>{draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return BAYHIT.length});
ok("station dock Layout view has no bay buttons (0)",lay===0);
const h2=await p.evaluate(async()=>{view="F";all();draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 if(BAYHIT.length!==2)return{n:BAYHIT.length};
 const q=BAYHIT[1],cxq=q.x+q.w/2,cyq=q.y+q.h/2;V.ox-=cxq-300;V.oy-=cyq-300;draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return{n:BAYHIT.length,...BAYHIT[1],b:undefined,cr:cv.getBoundingClientRect().toJSON()}});
ok("station dock Factory-floor view shows 2 squares (n="+h2.n+")",h2.n===2);
if(h2.n===2){await p.mouse.click(h2.cr.left+h2.x+4,h2.cr.top+h2.y+4);await p.waitForTimeout(200);
 ok("station square body opens modal",await p.evaluate(()=>$("dBay").open));
 await p.fill("#bayIn","water");await p.press("#bayIn","Enter");await p.waitForTimeout(200);
 const d2=await p.evaluate(()=>S.blocks[0].df);ok("station dock slot 2 set",d2&&d2.length===2&&d2[1].item===expKey&&!d2[0].item)}
// ---- v2 checks: normal dock modal, keyboard, mouse pick, icons, round trip, screenshots
const frame=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const onIdx=()=>p.evaluate(()=>{const e=document.querySelector("#bayL li.on");return e?+e.dataset.k:-1});
const clickSq=a=>p.mouse.click(a.cr.left+a.x+4,a.cr.top+a.y+4);
const aimBay=i=>p.evaluate(async i=>{const q=BAYHIT[i],cxq=q.x+q.w/2,cyq=q.y+q.h/2;V.ox-=cxq-300;V.oy-=cyq-300;draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{n:BAYHIT.length,...BAYHIT[i],b:undefined,cr:cv.getBoundingClientRect().toJSON()}},i);
const setup=list=>p.evaluate(list=>{S.blocks=list.map(([name,x,y])=>{const c=CATALOG.blocks.find(q=>q.name===name);return{id:uid++,cls:c?c.class:name,x,y,h:0,rot:0,pid:0,mid:0}});sel=new Set();layer=0;view="F";V.z=Math.max(V.z,1);V.ox=0;V.oy=0;all();draw(true)},list);
// (a) normal dock, Factory-floor view: square body -> modal -> Enter -> slot 1 only
await setup([["BPO_Dock",2,2]]);await p.waitForTimeout(300);
const a=await aimBay(0);
ok("(a) normal dock F view shows 2 squares (n="+a.n+")",a.n===2);
await clickSq(a);await p.waitForTimeout(200);
ok("(a) normal dock square body opens modal",await p.evaluate(()=>$("dBay").open));
await p.fill("#bayIn","water");await p.press("#bayIn","Enter");await p.waitForTimeout(200);
const da=await p.evaluate(()=>S.blocks[0].df);
ok("(a) normal dock Enter sets slot 1 to "+expKey,!!(da&&da[0]&&da[0].item===expKey));
ok("(a) normal dock slot 2 not set",!!da&&!(da[1]&&da[1].item));
// (b) modal keyboard: ArrowDown / ArrowUp move the highlight
await clickSq(a);await p.waitForTimeout(200);
await p.fill("#bayIn","ore");await p.waitForTimeout(100);
const n0=await p.evaluate(()=>document.querySelectorAll("#bayL li").length);
const k0=await onIdx();
await p.press("#bayIn","ArrowDown");const k1=await onIdx();
await p.press("#bayIn","ArrowUp");const k2=await onIdx();
ok(`(b) "ore" list ${n0} rows; ArrowDown highlight ${k0} -> ${k1}`,n0>=3&&k1!==k0);
ok(`(b) ArrowUp returns highlight ${k1} -> ${k2}`,k2===k0);
await p.click("#bayX");await p.waitForTimeout(150);
// (c) mouse pick of 2nd li (first real item row)
await clickSq(a);await p.waitForTimeout(200);
await p.fill("#bayIn","ore");await p.waitForTimeout(100);
const row=await p.evaluate(()=>document.querySelectorAll("#bayL li")[1].textContent);
const want=await p.evaluate(t=>{const id=FITEMS.find(id=>ITEMS[id].n===t);return id?fkey(id):null},row);
await p.click("#bayL li:nth-child(2)");await p.waitForTimeout(200);
const dc=await p.evaluate(()=>({open:$("dBay").open,df:S.blocks[0].df}));
ok(`(c) mouse pick "${row}" sets slot 1 to ${want}, modal closed`,!!want&&!dc.open&&!!(dc.df&&dc.df[0]&&dc.df[0].item===want));
// (d) every item row (not the first) has an icon img with src, no search filter
await clickSq(a);await p.waitForTimeout(200);
await p.fill("#bayIn","");await p.waitForTimeout(100);
const ic=await p.evaluate(()=>{const L=[...document.querySelectorAll("#bayL li")].slice(1);return{n:L.length,bad:L.filter(li=>{const im=li.querySelector("img.ic");return !im||!im.getAttribute("src")}).length}});
ok(`(d) every item row has img.ic src (${ic.n} rows, ${ic.bad} missing)`,ic.n>0&&ic.bad===0);
await p.click("#bayX");await p.waitForTimeout(150);
// (e) export -> import round trip keeps dock df and splitter fl
await setup([["BPO_Dock_2",2,8],["DAT_Splitter",20,0]]);
await p.evaluate(()=>{const d=S.blocks[0],s=S.blocks[1];d.df=Array.from({length:8},(_,j)=>({item:j===2?"waterice":"",bLoading:0}));s.fl=["","waterice",""];all()});
const snapF=()=>p.evaluate(()=>S.blocks.filter(q=>q.df||q.fl).map(q=>({cls:q.cls,x:q.x,y:q.y,df:q.df,fl:q.fl})));
const e4=await snapF();
const impOk=await p.evaluate(()=>__fb.importJson(JSON.stringify(__fb.build())));
const e5=await snapF();
ok("(e) export->import round trip: b.df/b.fl unchanged",impOk===true&&e4.length===2&&JSON.stringify(e4)===JSON.stringify(e5));
// (f) screenshots with a filter set: industrial dock and normal dock (F view), clipped around the squares
const dir="C:/Users/SFidelis/AppData/Local/Temp/dfshots";require("fs").mkdirSync(dir,{recursive:true});
const shotOf=async(name,file)=>{
  await setup([[name,2,2]]);
  await p.evaluate(()=>{const d=S.blocks[0];d.df=Array.from({length:dkN(d.cls)},(_,j)=>({item:j===0?"waterice":"",bLoading:0}));all();draw(true)});
  await p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));draw(true);const cx=(Math.min(...BAYHIT.map(q=>q.x))+Math.max(...BAYHIT.map(q=>q.x+q.w)))/2,cy=(Math.min(...BAYHIT.map(q=>q.y))+Math.max(...BAYHIT.map(q=>q.y+q.h)))/2,R=cv.getBoundingClientRect();V.ox-=cx-(innerWidth/2-R.left);V.oy-=cy-(innerHeight/2-R.top);draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  await p.waitForFunction(()=>{const id=fid("waterice"),im=id&&img(id);return !!(im&&im.complete&&im.naturalWidth>0)},null,{timeout:5000}).catch(()=>{});
  await p.evaluate(async()=>{draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
  const c=await p.evaluate(()=>{const cr=cv.getBoundingClientRect();const x0=Math.min(...BAYHIT.map(q=>q.x))-60,y0=Math.min(...BAYHIT.map(q=>q.y))-60,x1=Math.max(...BAYHIT.map(q=>q.x+q.w))+60,y1=Math.max(...BAYHIT.map(q=>q.y+q.h))+60;return{x:cr.left+x0,y:cr.top+y0,width:x1-x0,height:y1-y0,n:BAYHIT.length}});
  await p.screenshot({path:dir+"/"+file,clip:{x:c.x,y:c.y,width:c.width,height:c.height}});
  return{n:c.n,f:require("fs").statSync(dir+"/"+file).size};
};
const s1=await shotOf("BPO_Dock_2","industrial.png");
const s2=await shotOf("BPO_Dock","normal.png");
ok(`(f) screenshots written (industrial ${s1.n} squares ${s1.f} B; normal ${s2.n} squares ${s2.f} B)`,s1.n===8&&s2.n===2&&s1.f>0&&s2.f>0);
ok("no page errors "+errs.join(";"),!errs.length);await b.close();process.exit(bad?1:0);
