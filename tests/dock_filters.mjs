// dock / splitter filters in the inspector + recipe stars + export round trip. Run: node tests/dock_filters.mjs
import {createRequire} from 'module';import path from 'path';import {fileURLToPath,pathToFileURL} from 'url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW||'C:/Users/SFidelis/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright-core');
const PAGE=pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','index.html')).href;
const b=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),p=await b.newPage();const errs=[];p.on("pageerror",e=>{errs.push(String(e));console.log("PAGEERR",e)});
await p.goto(PAGE);let bad=0;const ok=(n,c)=>{if(!c)bad++;console.log((c?'PASS ':'FAIL ')+n)};
const r=await p.evaluate(()=>{
  const out={};const put=(cls,x)=>{const id=uid++;S.blocks.push({id,cls,x,y:0,h:0,rot:0,pid:0,mid:0});return id};
  const set=(i,v)=>{const e=$("fl"+i);e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}))};
  const d=put(CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,0);sel=new Set([d]);all();out.dockSel=document.querySelectorAll('#insp select[data-df]').length;
  set(2,"waterice");out.df=S.blocks.find(q=>q.id===d).df;
  const s=put("DAT_Splitter",20);sel=new Set([s]);layer=0;view="F";all();out.splSel=document.querySelectorAll('#insp select[data-fl]').length;
  set(1,"waterice");out.fl=S.blocks.find(q=>q.id===s).fl;
  const a=put("DAT_Refinery",40);sel=new Set([a]);all();out.stars=document.querySelectorAll('#insp .rtile .star').length;out.tiles=document.querySelectorAll('#insp .rtile').length;
  return out});
ok("industrial dock shows 8 filter slots",r.dockSel===8);ok("dock filter stored",r.df&&r.df.length===8&&r.df[2].item==="waterice");
ok("splitter shows 3 filter slots",r.splSel===3);ok("splitter filter stored",r.fl&&r.fl[1]==="waterice"&&r.fl.length===3);
ok("refinery recipes starred (enriched/alternate)",r.stars>0&&r.stars<r.tiles);
await p.evaluate(()=>{S.blocks=[];const id=uid++;S.blocks.push({id,cls:CATALOG.blocks.find(q=>q.name==="BPO_Dock_2").class,x:2,y:2,h:0,rot:0,pid:0,mid:0});sel=new Set();layer=0;view="F";V.z=Math.max(V.z,1);all();paint0&&0});
await p.waitForTimeout(300);
const hit=await p.evaluate(async()=>{const q=BAYHIT[0];V.ox-=q.x-300;V.oy-=q.y-300;draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return BAYHIT.length?{n:BAYHIT.length,...BAYHIT[0],b:undefined,cr:cv.getBoundingClientRect().toJSON()}:null});
ok("dock bay labels hit-testable (8)",hit&&hit.n===8);
if(hit){await p.mouse.click(hit.cr.left+hit.x,hit.cr.top+hit.y);
 await p.waitForTimeout(200);const o=await p.evaluate(()=>({open:$("dBay").open,t:$("bayT").textContent}));ok("click opens modal "+o.t,o.open);
 await p.fill("#bayIn","Water Ice");await p.click("#bayOk");
 const df=await p.evaluate(()=>S.blocks[0].df);ok("modal sets slot "+hit.i,df&&df[hit.i].item===(await p.evaluate(()=>FITEMS.map(fkey).find(k=>k==="waterice"))))}
await p.evaluate(()=>{S.blocks=[];const id=uid++;S.blocks.push({id,cls:CATALOG.blocks.find(q=>q.name==="BPO_Dock").class,x:3,y:3,h:0,rot:0,pid:0,mid:0});sel=new Set();view="L";V.ox=0;V.oy=0;all()});
await p.waitForTimeout(300);
const h2=await p.evaluate(async()=>{const q=BAYHIT[0];if(!q)return null;V.ox-=q.x-300;V.oy-=q.y-300;draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{n:BAYHIT.length,x:BAYHIT[1].x,y:BAYHIT[1].y,cr:cv.getBoundingClientRect().toJSON()}});
ok("station dock shows 2 clickable slots",h2&&h2.n===2);
if(h2){await p.mouse.click(h2.cr.left+h2.x,h2.cr.top+h2.y);await p.fill("#bayIn","Water Ice");await p.click("#bayOk");
 const d2=await p.evaluate(()=>S.blocks[0].df);ok("station dock slot 2 set",d2&&d2.length===2&&d2[1].item==="waterice"&&!d2[0].item)}
ok("no page errors "+errs.join(";"),!errs.length);await b.close();process.exit(bad?1:0);
